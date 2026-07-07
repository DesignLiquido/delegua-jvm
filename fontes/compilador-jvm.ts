import {
    Agrupamento,
    Atribuir,
    AvaliadorSintatico,
    Binario,
    Bloco,
    Chamada,
    Continua,
    Declaracao,
    Enquanto,
    Escolha,
    Escreva,
    Expressao,
    FuncaoDeclaracao,
    Lexador,
    Literal,
    Logico,
    Para,
    Retorna,
    Se,
    Sustar,
    Unario,
    Var,
    Variavel,
} from '@designliquido/delegua';

import { ErroCompilador } from './erros/erro-compilador';
import { VisitanteBaseNaoImplementado } from './visitante-base-nao-implementado';

const OPERADORES_COMPARACAO = ['MENOR', 'MENOR_IGUAL', 'MAIOR', 'MAIOR_IGUAL', 'IGUAL_IGUAL', 'DIFERENTE'];

const SALTO_COMPARACAO_DUPLA: Record<string, string> = {
    MENOR: 'iflt',
    MENOR_IGUAL: 'ifle',
    MAIOR: 'ifgt',
    MAIOR_IGUAL: 'ifge',
    IGUAL_IGUAL: 'ifeq',
    DIFERENTE: 'ifne',
};

const SALTO_COMPARACAO_INTEIRA: Record<string, string> = {
    MENOR: 'if_icmplt',
    MENOR_IGUAL: 'if_icmple',
    MAIOR: 'if_icmpgt',
    MAIOR_IGUAL: 'if_icmpge',
    IGUAL_IGUAL: 'if_icmpeq',
    DIFERENTE: 'if_icmpne',
};

interface VariavelLocal {
    slot: number;
    tipoJvm: string;
    tipoDelegua: string;
}

interface ParametroFuncao {
    nome: string;
    tipoDelegua: string;
    tipoJvm: string;
}

interface FuncaoInfo {
    nomeJvm: string;
    parametros: ParametroFuncao[];
    tipoRetornoDelegua: string;
    tipoRetornoJvm: string;
    descritor: string;
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
    private proximoRotulo: number;
    // Rótulo de destino de `continua`/`sustar` no laço (ou `escolha`, só para `sustar`) mais interno.
    private pilhaContinua: string[];
    private pilhaSustar: string[];
    private funcoes: Map<string, FuncaoInfo>;
    private metodosGerados: string[];
    // Tipo Delégua declarado para o `retorna` da função sendo compilada agora ('vazio' em `main`).
    private tipoRetornoAtual: string;

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
        this.proximoRotulo = 0;
        this.pilhaContinua = [];
        this.pilhaSustar = [];
        this.funcoes = new Map();
        this.metodosGerados = [];
        this.tipoRetornoAtual = 'vazio';

        const retornoLexador = this.lexador.mapear(codigo, -1);
        const retornoAvaliadorSintatico: any = await this.avaliadorSintatico.analisar(retornoLexador, -1);
        const declaracoes = retornoAvaliadorSintatico.declaracoes as Declaracao[];

        // `analisar()` não lança em erro de sintaxe: ele descarta a declaração problemática
        // de `declaracoes` (silenciosamente) e só reporta o problema em `erros`. Sem esta
        // checagem, um erro de sintaxe vira bytecode incompleto/incorreto em vez de falhar.
        // Gap real de UX do parser (não do compilador): documentado em PLAN.md.
        if (retornoAvaliadorSintatico.erros && retornoAvaliadorSintatico.erros.length > 0) {
            const mensagens = retornoAvaliadorSintatico.erros
                .map((erro: any) => `linha ${erro.linha}: símbolo '${erro.simbolo?.lexema}' (${erro.codigoDiagnostico})`)
                .join('; ');
            throw new ErroCompilador(`Erro de sintaxe: ${mensagens}`);
        }

        // Registrar assinaturas antes de compilar qualquer corpo: permite recursão e chamada
        // a funções declaradas mais abaixo no arquivo.
        this.registrarFuncoes(declaracoes);

        for (const declaracao of declaracoes) {
            await declaracao.aceitar(this as any);
        }

        return this.montarModulo();
    }

    private registrarFuncoes(declaracoes: Declaracao[]): void {
        for (const declaracao of declaracoes) {
            if (!(declaracao instanceof FuncaoDeclaracao)) continue;

            const nomeJvm = declaracao.simbolo.lexema;
            if (this.funcoes.has(nomeJvm)) {
                throw new ErroCompilador(`Função '${nomeJvm}' já declarada.`);
            }

            const parametros: ParametroFuncao[] = declaracao.funcao.parametros.map((parametro) => {
                if (!parametro.tipoDado) {
                    throw new ErroCompilador(`Parâmetro '${parametro.nome.lexema}' da função '${nomeJvm}' precisa de tipo explícito.`);
                }
                const tipoDelegua = this.normalizarTipo(parametro.tipoDado);
                return { nome: parametro.nome.lexema, tipoDelegua, tipoJvm: this.mapearTipoJvm(tipoDelegua) };
            });

            // `declaracao.tipo` é a string decorativa `função<...>`; o tipo de retorno
            // usável (explícito, inferido a partir de `retorna`, ou 'vazio') está em
            // `declaracao.funcao.tipo`.
            const tipoRetornoBruto = declaracao.funcao.tipo || 'vazio';
            if (tipoRetornoBruto === 'qualquer') {
                throw new ErroCompilador(`Função '${nomeJvm}' precisa de tipo de retorno explícito.`);
            }
            const tipoRetornoDelegua = tipoRetornoBruto === 'vazio' ? 'vazio' : this.normalizarTipo(tipoRetornoBruto);
            const tipoRetornoJvm = tipoRetornoDelegua === 'vazio' ? 'V' : this.mapearTipoJvm(tipoRetornoDelegua);
            const descritor = `(${parametros.map((parametro) => parametro.tipoJvm).join('')})${tipoRetornoJvm}`;

            this.funcoes.set(nomeJvm, { nomeJvm, parametros, tipoRetornoDelegua, tipoRetornoJvm, descritor });
        }
    }

    private montarModulo(): string {
        const corpo = this.instrucoes.map((instrucao) => `        ${instrucao}`).join('\n');
        const metodosExtras = this.metodosGerados.length ? '\n' + this.metodosGerados.join('\n') : '';

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
            `.end method\n` +
            metodosExtras
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
            if (OPERADORES_COMPARACAO.includes(construto.operador.tipo)) return 'logico';
            if (construto.operador.tipo === 'DIVISAO') return 'numero';
            const tipoEsquerdo = this.resolverTipoConstruto(construto.esquerda);
            const tipoDireito = this.resolverTipoConstruto(construto.direita);
            if (construto.operador.tipo === 'ADICAO' && (tipoEsquerdo === 'texto' || tipoDireito === 'texto')) return 'texto';
            return tipoEsquerdo === 'numero' || tipoDireito === 'numero' ? 'numero' : 'inteiro';
        }
        if (construto instanceof Logico) return 'logico';
        if (construto instanceof Unario) {
            if (construto.operador.tipo === 'NEGACAO') return 'logico';
            return this.resolverTipoConstruto(construto.operando);
        }
        if (construto instanceof Agrupamento) {
            return this.resolverTipoConstruto((construto as any).expressao);
        }
        if (construto instanceof Chamada) {
            return this.resolverInfoFuncaoChamada(construto).tipoRetornoDelegua;
        }
        throw new ErroCompilador('Não foi possível resolver o tipo da expressão.');
    }

    private resolverInfoFuncaoChamada(expressao: Chamada): FuncaoInfo {
        if (!(expressao.entidadeChamada instanceof Variavel)) {
            throw new ErroCompilador('Só é possível chamar funções pelo nome diretamente.');
        }
        const nomeFuncao = expressao.entidadeChamada.simbolo.lexema;
        const info = this.funcoes.get(nomeFuncao);
        if (!info) throw new ErroCompilador(`Função '${nomeFuncao}' não declarada.`);
        return info;
    }

    private gerarRotulo(prefixo: string): string {
        return `${prefixo}${this.proximoRotulo++}`;
    }

    /** Compila uma expressão usada como declaração solta (ex.: incremento do `para`), descartando o valor que ela deixa na pilha. */
    private async emitirComoDeclaracaoDeExpressao(construto: any): Promise<void> {
        const tipo = await construto.aceitar(this as any);
        if (tipo === 'numero') this.instrucoes.push('pop2');
        else if (tipo && tipo !== 'vazio') this.instrucoes.push('pop');
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
        if (OPERADORES_COMPARACAO.includes(expressao.operador.tipo)) {
            return await this.compilarComparacao(expressao);
        }

        const tipoEsquerdo = this.resolverTipoConstruto(expressao.esquerda);
        const tipoDireito = this.resolverTipoConstruto(expressao.direita);

        if (expressao.operador.tipo === 'ADICAO' && (tipoEsquerdo === 'texto' || tipoDireito === 'texto')) {
            return await this.compilarConcatenacaoTexto(expressao, tipoEsquerdo, tipoDireito);
        }

        const divisao = expressao.operador.tipo === 'DIVISAO';
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

    private async compilarComparacao(expressao: Binario): Promise<string> {
        const tipoEsquerdo = this.resolverTipoConstruto(expressao.esquerda);
        const tipoDireito = this.resolverTipoConstruto(expressao.direita);

        if (tipoEsquerdo === 'texto' || tipoDireito === 'texto') {
            return await this.compilarComparacaoTexto(expressao);
        }

        const tipoPrevalente = tipoEsquerdo === 'numero' || tipoDireito === 'numero' ? 'numero' : 'inteiro';

        await expressao.esquerda.aceitar(this as any);
        if (tipoEsquerdo === 'inteiro' && tipoPrevalente === 'numero') this.instrucoes.push('i2d');
        await expressao.direita.aceitar(this as any);
        if (tipoDireito === 'inteiro' && tipoPrevalente === 'numero') this.instrucoes.push('i2d');

        const rotuloVerdadeiro = this.gerarRotulo('Lcmp_verdadeiro');
        const rotuloFim = this.gerarRotulo('Lcmp_fim');

        if (tipoPrevalente === 'numero') {
            this.instrucoes.push('dcmpg');
            this.instrucoes.push(`${SALTO_COMPARACAO_DUPLA[expressao.operador.tipo]} ${rotuloVerdadeiro}`);
        } else {
            this.instrucoes.push(`${SALTO_COMPARACAO_INTEIRA[expressao.operador.tipo]} ${rotuloVerdadeiro}`);
        }
        this.instrucoes.push('iconst_0');
        this.instrucoes.push(`goto ${rotuloFim}`);
        this.instrucoes.push(`${rotuloVerdadeiro}:`);
        this.instrucoes.push('iconst_1');
        this.instrucoes.push(`${rotuloFim}:`);

        return 'logico';
    }

    private async compilarComparacaoTexto(expressao: Binario): Promise<string> {
        if (expressao.operador.tipo !== 'IGUAL_IGUAL' && expressao.operador.tipo !== 'DIFERENTE') {
            throw new ErroCompilador(`Operador '${expressao.operador.lexema}' não suportado para texto.`);
        }

        await expressao.esquerda.aceitar(this as any);
        await expressao.direita.aceitar(this as any);
        this.instrucoes.push('invokevirtual java/lang/String/equals(Ljava/lang/Object;)Z');
        if (expressao.operador.tipo === 'DIFERENTE') {
            this.instrucoes.push('iconst_1');
            this.instrucoes.push('ixor');
        }

        return 'logico';
    }

    private async compilarConcatenacaoTexto(expressao: Binario, tipoEsquerdo: string, tipoDireito: string): Promise<string> {
        await expressao.esquerda.aceitar(this as any);
        this.converterParaTexto(tipoEsquerdo);
        await expressao.direita.aceitar(this as any);
        this.converterParaTexto(tipoDireito);
        this.instrucoes.push('invokevirtual java/lang/String/concat(Ljava/lang/String;)Ljava/lang/String;');
        return 'texto';
    }

    private converterParaTexto(tipo: string): void {
        switch (tipo) {
            case 'texto':
                return;
            case 'inteiro':
                this.instrucoes.push('invokestatic java/lang/String/valueOf(I)Ljava/lang/String;');
                break;
            case 'numero':
                this.instrucoes.push('invokestatic java/lang/String/valueOf(D)Ljava/lang/String;');
                break;
            case 'logico':
                this.instrucoes.push('invokestatic java/lang/String/valueOf(Z)Ljava/lang/String;');
                break;
            default:
                throw new ErroCompilador(`Não sabe converter tipo '${tipo}' para texto.`);
        }
    }

    async visitarExpressaoLogica(expressao: Logico): Promise<string> {
        const ehOu = expressao.operador.tipo === 'OU';
        const rotuloCurto = this.gerarRotulo(ehOu ? 'Lou_curto' : 'Le_curto');
        const rotuloFim = this.gerarRotulo(ehOu ? 'Lou_fim' : 'Le_fim');

        await expressao.esquerda.aceitar(this as any);
        this.instrucoes.push(ehOu ? `ifne ${rotuloCurto}` : `ifeq ${rotuloCurto}`);
        // Curto-circuito: só avalia o lado direito se o esquerdo não decidiu o resultado.
        await expressao.direita.aceitar(this as any);
        this.instrucoes.push(`goto ${rotuloFim}`);
        this.instrucoes.push(`${rotuloCurto}:`);
        this.instrucoes.push(ehOu ? 'iconst_1' : 'iconst_0');
        this.instrucoes.push(`${rotuloFim}:`);

        return 'logico';
    }

    async visitarExpressaoUnaria(expressao: Unario): Promise<string> {
        if (expressao.operador.tipo === 'INCREMENTAR' || expressao.operador.tipo === 'DECREMENTAR') {
            return await this.compilarIncrementoDecremento(expressao);
        }

        const tipoOperando = await (expressao.operando as any).aceitar(this as any);

        switch (expressao.operador.tipo) {
            case 'NEGACAO':
                this.instrucoes.push('iconst_1');
                this.instrucoes.push('ixor');
                return 'logico';
            case 'SUBTRACAO':
                this.instrucoes.push(tipoOperando === 'numero' ? 'dneg' : 'ineg');
                return tipoOperando;
            case 'ADICAO':
                return tipoOperando;
            default:
                throw new ErroCompilador(`Operador unário '${expressao.operador.lexema}' não implementado.`);
        }
    }

    // Simplificação: sempre deixa o valor NOVO na pilha (semântica de pré-incremento),
    // mesmo para `i++` pós-fixado — aceitável porque o único uso hoje (passo do `para`)
    // descarta o valor resultante.
    private async compilarIncrementoDecremento(expressao: Unario): Promise<string> {
        if (!(expressao.operando instanceof Variavel)) {
            throw new ErroCompilador('Incremento/decremento só é suportado em variáveis simples.');
        }
        const local = this.variaveis.get(expressao.operando.simbolo.lexema);
        if (!local) throw new ErroCompilador(`Variável '${expressao.operando.simbolo.lexema}' não declarada.`);

        const decremento = expressao.operador.tipo === 'DECREMENTAR';

        if (local.tipoJvm === 'D') {
            this.instrucoes.push(`dload ${local.slot}`);
            this.instrucoes.push('ldc2_w 1.0');
            this.instrucoes.push(decremento ? 'dsub' : 'dadd');
            this.instrucoes.push('dup2');
            this.instrucoes.push(`dstore ${local.slot}`);
            return local.tipoDelegua;
        }

        if (local.tipoJvm === 'I') {
            this.instrucoes.push(`iinc ${local.slot} ${decremento ? -1 : 1}`);
            this.instrucoes.push(`iload ${local.slot}`);
            return local.tipoDelegua;
        }

        throw new ErroCompilador(`Incremento/decremento não suportado para tipo '${local.tipoDelegua}'.`);
    }

    async visitarDeclaracaoDeExpressao(declaracao: Expressao): Promise<any> {
        await this.emitirComoDeclaracaoDeExpressao(declaracao.expressao);
    }

    async visitarExpressaoDeAtribuicao(expressao: Atribuir): Promise<string> {
        if (expressao.indice !== undefined) {
            throw new ErroCompilador('Atribuição por índice ainda não implementada.');
        }
        if (!(expressao.alvo instanceof Variavel)) {
            throw new ErroCompilador('Atribuição só é suportada para variáveis simples.');
        }
        if (expressao.simboloOperador) {
            throw new ErroCompilador(`Operador de atribuição composta '${expressao.simboloOperador.lexema}' ainda não implementado.`);
        }

        const local = this.variaveis.get(expressao.alvo.simbolo.lexema);
        if (!local) throw new ErroCompilador(`Variável '${expressao.alvo.simbolo.lexema}' não declarada.`);

        const tipoValor = await expressao.valor.aceitar(this as any);
        if (tipoValor === 'inteiro' && local.tipoDelegua === 'numero') this.instrucoes.push('i2d');

        // Deixa o valor atribuído duplicado na pilha: `Atribuir` é uma expressão (ex.: `x = y = 5`).
        switch (local.tipoJvm) {
            case 'D':
                this.instrucoes.push('dup2');
                this.instrucoes.push(`dstore ${local.slot}`);
                break;
            case 'Ljava/lang/String;':
                this.instrucoes.push('dup');
                this.instrucoes.push(`astore ${local.slot}`);
                break;
            default:
                this.instrucoes.push('dup');
                this.instrucoes.push(`istore ${local.slot}`);
        }

        return local.tipoDelegua;
    }

    async visitarDeclaracaoDefinicaoFuncao(declaracao: FuncaoDeclaracao): Promise<any> {
        const info = this.funcoes.get(declaracao.simbolo.lexema);
        if (!info) throw new ErroCompilador(`Função '${declaracao.simbolo.lexema}' não registrada.`);

        // Funções viram `.method private static` isolados: salva o contexto do método atual
        // (ex.: `main`, ou quem chamou esta função) e restaura ao final.
        const instrucoesAnteriores = this.instrucoes;
        const variaveisAnteriores = this.variaveis;
        const slotAnterior = this.proximoSlot;
        const tipoRetornoAnterior = this.tipoRetornoAtual;

        this.instrucoes = [];
        this.variaveis = new Map();
        this.proximoSlot = 0;
        this.tipoRetornoAtual = info.tipoRetornoDelegua;

        for (const parametro of info.parametros) {
            const slot = this.proximoSlot;
            this.proximoSlot += parametro.tipoJvm === 'D' ? 2 : 1;
            this.variaveis.set(parametro.nome, { slot, tipoJvm: parametro.tipoJvm, tipoDelegua: parametro.tipoDelegua });
        }

        for (const decl of declaracao.funcao.corpo) {
            await decl.aceitar(this as any);
        }
        // Funções `vazio` podem não terminar com `retorna` explícito; instrução extra e
        // inalcançável não tem custo caso o corpo já termine em `return`.
        if (info.tipoRetornoJvm === 'V') this.instrucoes.push('return');

        const corpoTexto = this.instrucoes.map((instrucao) => `        ${instrucao}`).join('\n');
        this.metodosGerados.push(
            `.method private static ${info.nomeJvm}${info.descritor}\n` +
                `    .limit stack 32\n` +
                `    .limit locals ${this.proximoSlot}\n` +
                (corpoTexto ? corpoTexto + '\n' : '') +
                `.end method\n`
        );

        this.instrucoes = instrucoesAnteriores;
        this.variaveis = variaveisAnteriores;
        this.proximoSlot = slotAnterior;
        this.tipoRetornoAtual = tipoRetornoAnterior;
    }

    async visitarExpressaoDeChamada(expressao: Chamada): Promise<string> {
        const info = this.resolverInfoFuncaoChamada(expressao);

        if (expressao.argumentos.length !== info.parametros.length) {
            throw new ErroCompilador(
                `Função '${info.nomeJvm}' espera ${info.parametros.length} argumento(s), recebeu ${expressao.argumentos.length}.`
            );
        }

        for (let i = 0; i < expressao.argumentos.length; i++) {
            const tipoArgumento = await expressao.argumentos[i].aceitar(this as any);
            if (tipoArgumento === 'inteiro' && info.parametros[i].tipoDelegua === 'numero') this.instrucoes.push('i2d');
        }

        this.instrucoes.push(`invokestatic ${this.nomeClasse}/${info.nomeJvm}${info.descritor}`);
        return info.tipoRetornoDelegua;
    }

    async visitarExpressaoRetornar(declaracao: Retorna): Promise<any> {
        if (!declaracao.valor) {
            this.instrucoes.push('return');
            return;
        }

        const tipoValor = await declaracao.valor.aceitar(this as any);
        if (tipoValor === 'inteiro' && this.tipoRetornoAtual === 'numero') this.instrucoes.push('i2d');

        switch (this.tipoRetornoAtual) {
            case 'numero':
                this.instrucoes.push('dreturn');
                break;
            case 'texto':
                this.instrucoes.push('areturn');
                break;
            default:
                this.instrucoes.push('ireturn');
        }
    }

    async visitarExpressaoBloco(declaracao: Bloco): Promise<any> {
        for (const decl of declaracao.declaracoes) {
            await decl.aceitar(this as any);
        }
    }

    async visitarDeclaracaoSe(declaracao: Se): Promise<any> {
        const ramos = [{ condicao: declaracao.condicao, caminho: declaracao.caminhoEntao }, ...(declaracao.caminhosSeSenao || [])];
        const rotuloFim = this.gerarRotulo('Lse_fim');

        for (const ramo of ramos) {
            const rotuloProximo = this.gerarRotulo('Lse_senao');
            await ramo.condicao.aceitar(this as any);
            this.instrucoes.push(`ifeq ${rotuloProximo}`);
            await ramo.caminho.aceitar(this as any);
            this.instrucoes.push(`goto ${rotuloFim}`);
            this.instrucoes.push(`${rotuloProximo}:`);
        }

        if (declaracao.caminhoSenao) {
            await declaracao.caminhoSenao.aceitar(this as any);
        }

        this.instrucoes.push(`${rotuloFim}:`);
    }

    async visitarDeclaracaoEnquanto(declaracao: Enquanto): Promise<any> {
        const rotuloInicio = this.gerarRotulo('Lenquanto_inicio');
        const rotuloFim = this.gerarRotulo('Lenquanto_fim');

        this.instrucoes.push(`${rotuloInicio}:`);
        await declaracao.condicao.aceitar(this as any);
        this.instrucoes.push(`ifeq ${rotuloFim}`);

        this.pilhaContinua.push(rotuloInicio);
        this.pilhaSustar.push(rotuloFim);
        await declaracao.corpo.aceitar(this as any);
        this.pilhaContinua.pop();
        this.pilhaSustar.pop();

        this.instrucoes.push(`goto ${rotuloInicio}`);
        this.instrucoes.push(`${rotuloFim}:`);
    }

    async visitarDeclaracaoPara(declaracao: Para): Promise<any> {
        const inicializadores = Array.isArray(declaracao.inicializador)
            ? declaracao.inicializador
            : declaracao.inicializador
              ? [declaracao.inicializador]
              : [];
        for (const inicializador of inicializadores) {
            await inicializador.aceitar(this as any);
        }

        const rotuloInicio = this.gerarRotulo('Lpara_inicio');
        const rotuloIncremento = this.gerarRotulo('Lpara_incremento');
        const rotuloFim = this.gerarRotulo('Lpara_fim');

        this.instrucoes.push(`${rotuloInicio}:`);
        if (declaracao.condicao) {
            await declaracao.condicao.aceitar(this as any);
            this.instrucoes.push(`ifeq ${rotuloFim}`);
        }

        this.pilhaContinua.push(rotuloIncremento);
        this.pilhaSustar.push(rotuloFim);
        await declaracao.corpo.aceitar(this as any);
        this.pilhaContinua.pop();
        this.pilhaSustar.pop();

        this.instrucoes.push(`${rotuloIncremento}:`);
        if (declaracao.incrementar) {
            await this.emitirComoDeclaracaoDeExpressao(declaracao.incrementar);
        }
        this.instrucoes.push(`goto ${rotuloInicio}`);
        this.instrucoes.push(`${rotuloFim}:`);
    }

    async visitarDeclaracaoEscolha(declaracao: Escolha): Promise<any> {
        const tipoAlvo = this.resolverTipoConstruto(declaracao.identificadorOuLiteral);
        await declaracao.identificadorOuLiteral.aceitar(this as any);

        const tipoJvmAlvo = this.mapearTipoJvm(tipoAlvo);
        const slotTemp = this.proximoSlot;
        this.proximoSlot += tipoJvmAlvo === 'D' ? 2 : 1;

        switch (tipoJvmAlvo) {
            case 'D':
                this.instrucoes.push(`dstore ${slotTemp}`);
                break;
            case 'Ljava/lang/String;':
                this.instrucoes.push(`astore ${slotTemp}`);
                break;
            default:
                this.instrucoes.push(`istore ${slotTemp}`);
        }

        const rotuloFim = this.gerarRotulo('Lescolha_fim');
        const rotulosCorpo = declaracao.caminhos.map(() => this.gerarRotulo('Lescolha_caso'));
        const rotuloPadrao = declaracao.caminhoPadrao ? this.gerarRotulo('Lescolha_padrao') : rotuloFim;

        for (let i = 0; i < declaracao.caminhos.length; i++) {
            for (const condicao of declaracao.caminhos[i].condicoes) {
                await this.emitirComparacaoIgualdade(tipoJvmAlvo, slotTemp, condicao, rotulosCorpo[i]);
            }
        }
        this.instrucoes.push(`goto ${rotuloPadrao}`);

        // `escolha` cai adiante entre caminhos (sem `sustar` implícito), igual switch de C/JS.
        this.pilhaSustar.push(rotuloFim);
        for (let i = 0; i < declaracao.caminhos.length; i++) {
            this.instrucoes.push(`${rotulosCorpo[i]}:`);
            for (const decl of declaracao.caminhos[i].declaracoes) {
                await decl.aceitar(this as any);
            }
        }
        if (declaracao.caminhoPadrao) {
            this.instrucoes.push(`${rotuloPadrao}:`);
            for (const decl of declaracao.caminhoPadrao.declaracoes) {
                await decl.aceitar(this as any);
            }
        }
        this.pilhaSustar.pop();

        this.instrucoes.push(`${rotuloFim}:`);
    }

    private async emitirComparacaoIgualdade(tipoJvm: string, slot: number, condicao: any, rotuloSeIgual: string): Promise<void> {
        switch (tipoJvm) {
            case 'D':
                this.instrucoes.push(`dload ${slot}`);
                await condicao.aceitar(this as any);
                this.instrucoes.push('dcmpl');
                this.instrucoes.push(`ifeq ${rotuloSeIgual}`);
                break;
            case 'Ljava/lang/String;':
                this.instrucoes.push(`aload ${slot}`);
                await condicao.aceitar(this as any);
                this.instrucoes.push('invokevirtual java/lang/String/equals(Ljava/lang/Object;)Z');
                this.instrucoes.push(`ifne ${rotuloSeIgual}`);
                break;
            default:
                this.instrucoes.push(`iload ${slot}`);
                await condicao.aceitar(this as any);
                this.instrucoes.push(`if_icmpeq ${rotuloSeIgual}`);
        }
    }

    async visitarExpressaoContinua(declaracao: Continua): Promise<any> {
        if (this.pilhaContinua.length === 0) throw new ErroCompilador("'continua' fora de um laço.");
        this.instrucoes.push(`goto ${this.pilhaContinua[this.pilhaContinua.length - 1]}`);
    }

    async visitarExpressaoSustar(declaracao: Sustar): Promise<any> {
        if (this.pilhaSustar.length === 0) throw new ErroCompilador("'sustar' fora de um laço ou escolha.");
        this.instrucoes.push(`goto ${this.pilhaSustar[this.pilhaSustar.length - 1]}`);
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
