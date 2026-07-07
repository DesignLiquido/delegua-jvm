import { Agrupamento, AvaliadorSintatico, Binario, Declaracao, Escreva, Lexador, Literal, Var, Variavel } from '@designliquido/delegua';

import { ErroCompilador } from './erros/erro-compilador';
import { VisitanteBaseNaoImplementado } from './visitante-base-nao-implementado';

interface VariavelLocal {
    slot: number;
    tipoJvm: string;
    tipoDelegua: string;
}

const MAPA_TIPOS_JVM: Record<string, string> = {
    inteiro: 'I',
    numero: 'D',
    logico: 'Z',
    texto: 'Ljava/lang/String;',
};

/**
 * Primeira fatia vertical do compilador Delégua → bytecode JVM (texto Jasmin).
 * Suporta apenas: `var` com literais, leitura de variáveis, aritmética
 * (`+ - * /`) entre `inteiro`/`numero`, e `escreva`. Todo o restante da
 * gramática lança `ErroCompilador` (ver `VisitanteBaseNaoImplementado`).
 */
export class CompiladorJvm extends VisitanteBaseNaoImplementado {
    lexador: Lexador;
    avaliadorSintatico: AvaliadorSintatico;

    private instrucoes: string[];
    private variaveis: Map<string, VariavelLocal>;
    private proximoSlot: number;
    private nomeClasse: string;

    constructor() {
        super();
        this.lexador = new Lexador();
        this.avaliadorSintatico = new AvaliadorSintatico();
    }

    async compilar(codigo: string[], nomeClasse: string = 'Programa'): Promise<string> {
        this.instrucoes = [];
        this.variaveis = new Map();
        // Slot 0 é reservado para o parâmetro `String[] args` de `main`.
        this.proximoSlot = 1;
        this.nomeClasse = nomeClasse;

        const retornoLexador = this.lexador.mapear(codigo, -1);
        const retornoAvaliadorSintatico = await this.avaliadorSintatico.analisar(retornoLexador, -1);
        const declaracoes = retornoAvaliadorSintatico.declaracoes as Declaracao[];

        for (const declaracao of declaracoes) {
            await declaracao.aceitar(this as any);
        }

        return this.montarModulo();
    }

    private montarModulo(): string {
        const corpo = this.instrucoes.map((instrucao) => `        ${instrucao}`).join('\n');

        return (
            `.class public ${this.nomeClasse}\n` +
            `.super java/lang/Object\n\n` +
            `.method public <init>()V\n` +
            `    aload_0\n` +
            `    invokespecial java/lang/Object/<init>()V\n` +
            `    return\n` +
            `.end method\n\n` +
            `.method public static main([Ljava/lang/String;)V\n` +
            `    .limit stack 32\n` +
            `    .limit locals ${this.proximoSlot}\n` +
            (corpo ? corpo + '\n' : '') +
            `        return\n` +
            `.end method\n`
        );
    }

    private normalizarTipo(tipo: string): string {
        if (tipo === 'número') return 'numero';
        if (tipo === 'lógico') return 'logico';
        return tipo;
    }

    private mapearTipoJvm(tipoDelegua: string): string {
        const tipoJvm = MAPA_TIPOS_JVM[tipoDelegua];
        if (!tipoJvm) {
            throw new ErroCompilador(`Tipo '${tipoDelegua}' não implementado para JVM.`);
        }
        return tipoJvm;
    }

    private resolverTipoConstruto(construto: any): string {
        if (construto instanceof Literal) {
            // O parser marca todo literal numérico genericamente como 'número',
            // mesmo quando o valor é um inteiro (ex.: `123`). Por isso o valor
            // real decide inteiro-vs-numero aqui, e não `construto.tipo`.
            if (typeof construto.valor === 'boolean') return 'logico';
            if (typeof construto.valor === 'string') return 'texto';
            if (typeof construto.valor === 'number') return Number.isInteger(construto.valor) ? 'inteiro' : 'numero';
            throw new ErroCompilador('Não foi possível deduzir o tipo do literal.');
        }
        if (construto instanceof Variavel) {
            const local = this.variaveis.get(construto.simbolo.lexema);
            if (!local) throw new ErroCompilador(`Variável '${construto.simbolo.lexema}' não declarada.`);
            return local.tipoDelegua;
        }
        if (construto instanceof Binario) {
            if (construto.operador.tipo === 'DIVISAO') return 'numero';
            const tipoEsquerdo = this.resolverTipoConstruto(construto.esquerda);
            const tipoDireito = this.resolverTipoConstruto(construto.direita);
            return tipoEsquerdo === 'numero' || tipoDireito === 'numero' ? 'numero' : 'inteiro';
        }
        if (construto instanceof Agrupamento) {
            return this.resolverTipoConstruto((construto as any).expressao);
        }
        throw new ErroCompilador('Não foi possível resolver o tipo da expressão.');
    }

    private escaparTexto(valor: string): string {
        return valor.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    async visitarDeclaracaoVar(declaracao: Var): Promise<any> {
        // `declaracao.tipo` é preenchido pelo parser a partir do tipo do inicializador
        // quando não há anotação explícita — e sofre da mesma generalização de
        // 'número' descrita em `resolverTipoConstruto`. Só confia nele quando o
        // usuário anotou o tipo explicitamente (`var x: inteiro = 10`).
        const tipoDelegua = declaracao.tipoExplicito
            ? this.normalizarTipo(declaracao.tipo)
            : this.resolverTipoConstruto(declaracao.inicializador);

        await declaracao.inicializador.aceitar(this as any);

        const tipoJvm = this.mapearTipoJvm(tipoDelegua);
        const slot = this.proximoSlot;
        this.proximoSlot += tipoJvm === 'D' ? 2 : 1;
        this.variaveis.set(declaracao.simbolo.lexema, { slot, tipoJvm, tipoDelegua });

        switch (tipoJvm) {
            case 'D':
                this.instrucoes.push(`dstore ${slot}`);
                break;
            case 'Ljava/lang/String;':
                this.instrucoes.push(`astore ${slot}`);
                break;
            default:
                this.instrucoes.push(`istore ${slot}`);
        }
    }

    async visitarExpressaoLiteral(expressao: Literal): Promise<string> {
        const tipo = this.resolverTipoConstruto(expressao);
        switch (tipo) {
            case 'inteiro':
                this.instrucoes.push(`ldc ${expressao.valor}`);
                break;
            case 'numero':
                this.instrucoes.push(`ldc2_w ${this.formatarDouble(expressao.valor as number)}`);
                break;
            case 'logico':
                this.instrucoes.push(expressao.valor ? 'iconst_1' : 'iconst_0');
                break;
            case 'texto':
                this.instrucoes.push(`ldc "${this.escaparTexto(expressao.valor as string)}"`);
                break;
            default:
                throw new ErroCompilador(`Literal de tipo '${tipo}' não implementado.`);
        }
        return tipo;
    }

    private formatarDouble(valor: number): string {
        return Number.isInteger(valor) ? `${valor}.0` : `${valor}`;
    }

    async visitarExpressaoDeVariavel(expressao: Variavel): Promise<string> {
        const local = this.variaveis.get(expressao.simbolo.lexema);
        if (!local) throw new ErroCompilador(`Variável '${expressao.simbolo.lexema}' não declarada.`);
        switch (local.tipoJvm) {
            case 'D':
                this.instrucoes.push(`dload ${local.slot}`);
                break;
            case 'Ljava/lang/String;':
                this.instrucoes.push(`aload ${local.slot}`);
                break;
            default:
                this.instrucoes.push(`iload ${local.slot}`);
        }
        return local.tipoDelegua;
    }

    async visitarExpressaoAgrupamento(expressao: Agrupamento): Promise<string> {
        return await (expressao as any).expressao.aceitar(this as any);
    }

    async visitarExpressaoBinaria(expressao: Binario): Promise<string> {
        const divisao = expressao.operador.tipo === 'DIVISAO';
        const tipoEsquerdo = this.resolverTipoConstruto(expressao.esquerda);
        const tipoDireito = this.resolverTipoConstruto(expressao.direita);
        const tipoPrevalente = divisao || tipoEsquerdo === 'numero' || tipoDireito === 'numero' ? 'numero' : 'inteiro';

        await expressao.esquerda.aceitar(this as any);
        if (tipoEsquerdo !== tipoPrevalente) this.instrucoes.push('i2d');

        await expressao.direita.aceitar(this as any);
        if (tipoDireito !== tipoPrevalente) this.instrucoes.push('i2d');

        const inteiro = tipoPrevalente === 'inteiro';
        switch (expressao.operador.tipo) {
            case 'ADICAO':
                this.instrucoes.push(inteiro ? 'iadd' : 'dadd');
                break;
            case 'SUBTRACAO':
                this.instrucoes.push(inteiro ? 'isub' : 'dsub');
                break;
            case 'MULTIPLICACAO':
                this.instrucoes.push(inteiro ? 'imul' : 'dmul');
                break;
            case 'DIVISAO':
                this.instrucoes.push('ddiv');
                break;
            default:
                throw new ErroCompilador(`Operador '${expressao.operador.lexema}' não implementado.`);
        }

        return tipoPrevalente;
    }

    async visitarDeclaracaoEscreva(declaracao: Escreva): Promise<any> {
        for (const argumento of declaracao.argumentos) {
            this.instrucoes.push('getstatic java/lang/System/out Ljava/io/PrintStream;');
            const tipo: string = await (argumento as any).aceitar(this as any);
            switch (tipo) {
                case 'inteiro':
                    this.instrucoes.push('invokevirtual java/io/PrintStream/println(I)V');
                    break;
                case 'numero':
                    this.instrucoes.push('invokevirtual java/io/PrintStream/println(D)V');
                    break;
                case 'logico':
                    this.instrucoes.push('invokevirtual java/io/PrintStream/println(Z)V');
                    break;
                case 'texto':
                    this.instrucoes.push('invokevirtual java/io/PrintStream/println(Ljava/lang/String;)V');
                    break;
                default:
                    throw new ErroCompilador(`Não sabe como escrever valor de tipo '${tipo}'.`);
            }
        }
    }
}
