import {
    AcessoElementoMatriz,
    AcessoIndiceVariavel,
    AcessoIntervaloVariavel,
    AcessoMetodoOuPropriedade,
    Agrupamento,
    Atribuir,
    AtribuicaoPorIndice,
    AtribuicaoPorIndicesMatriz,
    AvaliadorSintatico,
    Binario,
    Bloco,
    Chamada,
    Classe,
    Continua,
    Declaracao,
    DefinirValor,
    Dicionario,
    Enquanto,
    Escolha,
    Escreva,
    Expressao,
    FuncaoDeclaracao,
    Isto,
    Lexador,
    Literal,
    Logico,
    Para,
    Retorna,
    Se,
    Super,
    Sustar,
    Tupla,
    TuplaN,
    Unario,
    Var,
    Variavel,
    Vetor,
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

interface InfoCampo {
    nome: string;
    tipoDelegua: string;
    tipoJvm: string;
}

interface InfoClasse {
    nome: string;
    nomeSuper?: string;
    nomeJvmSuper: string;
    campos: Map<string, InfoCampo>;
    metodos: Map<string, FuncaoInfo>;
    construtor?: FuncaoInfo;
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
    private classes: Map<string, InfoClasse>;
    // Classe sendo compilada agora (contexto de `isto`/`super`); `null` fora de método de instância.
    private classeAtual: InfoClasse | null;
    // Uma classe Delégua vira um `.class` Jasmin à parte (não cabe no `.j` de `Programa`).
    private classesGeradas: Map<string, string>;

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
        this.classes = new Map();
        this.classeAtual = null;
        this.classesGeradas = new Map();

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
        // a funções/classes declaradas mais abaixo no arquivo.
        this.registrarClasses(declaracoes);
        this.registrarFuncoes(declaracoes);

        for (const declaracao of declaracoes) {
            await declaracao.aceitar(this as any);
        }

        return this.montarModulo();
    }

    /** Jasmin de cada `classe` Delégua compilada — cada uma é um `.class` próprio, à parte de `Programa`. */
    obterClassesGeradas(): Map<string, string> {
        return this.classesGeradas;
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

    private registrarClasses(declaracoes: Declaracao[]): void {
        const declsClasse = declaracoes.filter((declaracao): declaracao is Classe => declaracao instanceof Classe);

        // Passo 1: registra o nome de cada classe antes de resolver membros, permitindo
        // referências cruzadas (campos/parâmetros tipados com outra classe) independentes
        // de ordem de declaração no arquivo.
        for (const declaracao of declsClasse) {
            if (this.classes.has(declaracao.simbolo.lexema)) {
                throw new ErroCompilador(`Classe '${declaracao.simbolo.lexema}' já declarada.`);
            }
            if (declaracao.superClasses.length > 1) {
                throw new ErroCompilador(`Classe '${declaracao.simbolo.lexema}': herança múltipla não suportada na JVM.`);
            }
            const nomeSuper = declaracao.superClasses.length > 0 ? declaracao.superClasses[0].simbolo.lexema : undefined;
            this.classes.set(declaracao.simbolo.lexema, {
                nome: declaracao.simbolo.lexema,
                nomeSuper,
                nomeJvmSuper: nomeSuper || 'java/lang/Object',
                campos: new Map(),
                metodos: new Map(),
            });
        }

        // Passo 2: resolve campos e métodos, já com todas as classes do arquivo registradas.
        for (const declaracao of declsClasse) {
            const info = this.classes.get(declaracao.simbolo.lexema)!;

            for (const propriedade of declaracao.propriedades) {
                if (propriedade.estatico) {
                    throw new ErroCompilador(`Propriedade estática '${propriedade.nome.lexema}' ainda não suportada (classe '${info.nome}').`);
                }
                if (propriedade.autoObter || propriedade.autoDefinir) {
                    throw new ErroCompilador(`Auto-propriedades (obter/definir) ainda não suportadas (classe '${info.nome}').`);
                }
                if (!propriedade.tipo) {
                    throw new ErroCompilador(`Propriedade '${propriedade.nome.lexema}' da classe '${info.nome}' precisa de tipo explícito.`);
                }
                const tipoDelegua = this.normalizarTipo(propriedade.tipo);
                info.campos.set(propriedade.nome.lexema, {
                    nome: propriedade.nome.lexema,
                    tipoDelegua,
                    tipoJvm: this.mapearTipoJvm(tipoDelegua),
                });
            }

            for (const metodoDecl of declaracao.metodos) {
                if ((metodoDecl as any).abstrato) {
                    throw new ErroCompilador(`Método abstrato '${metodoDecl.simbolo.lexema}' ainda não suportado (classe '${info.nome}').`);
                }
                if ((metodoDecl as any).eObtenedor || (metodoDecl as any).eDefinidor) {
                    throw new ErroCompilador(`Obtenedor/definidor personalizado ainda não suportado (classe '${info.nome}').`);
                }
                if (metodoDecl.estatico) {
                    throw new ErroCompilador(`Método estático '${metodoDecl.simbolo.lexema}' ainda não suportado (classe '${info.nome}').`);
                }

                const ehConstrutor = metodoDecl.simbolo.lexema === 'construtor';
                const parametros: ParametroFuncao[] = metodoDecl.funcao.parametros.map((parametro) => {
                    if (!parametro.tipoDado) {
                        throw new ErroCompilador(
                            `Parâmetro '${parametro.nome.lexema}' de '${info.nome}.${metodoDecl.simbolo.lexema}' precisa de tipo explícito.`
                        );
                    }
                    const tipoDelegua = this.normalizarTipo(parametro.tipoDado);
                    return { nome: parametro.nome.lexema, tipoDelegua, tipoJvm: this.mapearTipoJvm(tipoDelegua) };
                });

                if (ehConstrutor) {
                    info.construtor = {
                        nomeJvm: '<init>',
                        parametros,
                        tipoRetornoDelegua: 'vazio',
                        tipoRetornoJvm: 'V',
                        descritor: `(${parametros.map((parametro) => parametro.tipoJvm).join('')})V`,
                    };
                    continue;
                }

                const tipoRetornoBruto = metodoDecl.funcao.tipo || 'vazio';
                if (tipoRetornoBruto === 'qualquer') {
                    throw new ErroCompilador(`Método '${info.nome}.${metodoDecl.simbolo.lexema}' precisa de tipo de retorno explícito.`);
                }
                const tipoRetornoDelegua = tipoRetornoBruto === 'vazio' ? 'vazio' : this.normalizarTipo(tipoRetornoBruto);
                const tipoRetornoJvm = tipoRetornoDelegua === 'vazio' ? 'V' : this.mapearTipoJvm(tipoRetornoDelegua);
                const descritor = `(${parametros.map((parametro) => parametro.tipoJvm).join('')})${tipoRetornoJvm}`;

                info.metodos.set(metodoDecl.simbolo.lexema, {
                    nomeJvm: metodoDecl.simbolo.lexema,
                    parametros,
                    tipoRetornoDelegua,
                    tipoRetornoJvm,
                    descritor,
                });
            }

            // Sem construtor explícito: gera um `<init>()V` trivial (só encadeia o super padrão).
            if (!info.construtor) {
                info.construtor = { nomeJvm: '<init>', parametros: [], tipoRetornoDelegua: 'vazio', tipoRetornoJvm: 'V', descritor: '()V' };
            }
        }
    }

    private buscarCampoComOrigem(nomeClasse: string, nomeCampo: string): { campo: InfoCampo; nomeClasseOrigem: string } | null {
        let atual = this.classes.get(nomeClasse);
        while (atual) {
            const campo = atual.campos.get(nomeCampo);
            if (campo) return { campo, nomeClasseOrigem: atual.nome };
            atual = atual.nomeSuper ? this.classes.get(atual.nomeSuper) : undefined;
        }
        return null;
    }

    private buscarMetodoComOrigem(nomeClasse: string, nomeMetodo: string): { metodo: FuncaoInfo; nomeClasseOrigem: string } | null {
        let atual = this.classes.get(nomeClasse);
        while (atual) {
            const metodo = atual.metodos.get(nomeMetodo);
            if (metodo) return { metodo, nomeClasseOrigem: atual.nome };
            atual = atual.nomeSuper ? this.classes.get(atual.nomeSuper) : undefined;
        }
        return null;
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
        if (tipoJvm) return tipoJvm;
        // Coleções: `vetor` e `dicionário`/`tupla` são sempre erasure de `ArrayList`/`HashMap`/
        // `Object[]` na JVM — o tipo de elemento só existe do lado Delégua (nesta classe),
        // usado para decidir autobox/unbox e cast em tempo de compilação.
        if (tipoDelegua.endsWith('[]')) return 'Ljava/util/ArrayList;';
        if (tipoDelegua.startsWith('dicionario<')) return 'Ljava/util/HashMap;';
        if (tipoDelegua.startsWith('tupla<')) return '[Ljava/lang/Object;';
        // Não é primitivo nem coleção: só resta ser o nome de uma `classe` já registrada.
        if (this.classes.has(tipoDelegua)) return `L${tipoDelegua};`;
        throw new ErroCompilador(`Tipo '${tipoDelegua}' não implementado para JVM.`);
    }

    private ehTipoReferencia(tipoJvm: string): boolean {
        return tipoJvm.startsWith('[') || (tipoJvm.startsWith('L') && tipoJvm.endsWith(';'));
    }

    /** Nome interno pra `checkcast`/`instanceof` a partir de um descritor JVM de referência. */
    private nomeInternoDoTipoJvm(tipoJvm: string): string {
        if (tipoJvm.startsWith('[')) return tipoJvm;
        if (tipoJvm.startsWith('L') && tipoJvm.endsWith(';')) return tipoJvm.slice(1, -1);
        throw new ErroCompilador(`Tipo '${tipoJvm}' não é referência: não é possível fazer cast.`);
    }

    /** Empilha o valor primitivo já presente no topo da pilha como seu wrapper (`Integer`/`Double`/`Boolean`); tipos referência não precisam de nada. */
    private emitirBoxing(tipoJvm: string): void {
        switch (tipoJvm) {
            case 'I':
                this.instrucoes.push('invokestatic java/lang/Integer/valueOf(I)Ljava/lang/Integer;');
                break;
            case 'D':
                this.instrucoes.push('invokestatic java/lang/Double/valueOf(D)Ljava/lang/Double;');
                break;
            case 'Z':
                this.instrucoes.push('invokestatic java/lang/Boolean/valueOf(Z)Ljava/lang/Boolean;');
                break;
        }
    }

    /** Converte um `Ljava/lang/Object;` (vindo de `List.get`/`Map.get`/`aaload`) pro tipo JVM de destino. */
    private emitirUnboxDeObjeto(tipoJvmDestino: string): void {
        switch (tipoJvmDestino) {
            case 'I':
                this.instrucoes.push('checkcast java/lang/Integer');
                this.instrucoes.push('invokevirtual java/lang/Integer/intValue()I');
                break;
            case 'D':
                this.instrucoes.push('checkcast java/lang/Double');
                this.instrucoes.push('invokevirtual java/lang/Double/doubleValue()D');
                break;
            case 'Z':
                this.instrucoes.push('checkcast java/lang/Boolean');
                this.instrucoes.push('invokevirtual java/lang/Boolean/booleanValue()Z');
                break;
            default:
                this.instrucoes.push(`checkcast ${this.nomeInternoDoTipoJvm(tipoJvmDestino)}`);
        }
    }

    private dividirTiposTupla(tipoTupla: string): string[] {
        // "tupla<inteiro,texto,logico>" -> ['inteiro','texto','logico']. Seguro porque nenhum
        // tipo elementar (nem vetor, que usa só sufixo `[]`) contém vírgula.
        return tipoTupla.slice('tupla<'.length, -1).split(',');
    }

    private resolverIndiceConstante(indice: any): number {
        if (indice instanceof Literal && typeof indice.valor === 'number' && Number.isInteger(indice.valor)) {
            return indice.valor;
        }
        throw new ErroCompilador('Acesso a elemento de tupla exige índice inteiro literal (constante em tempo de compilação).');
    }

    private extrairElementosDeTupla(construto: any): any[] {
        const nomesOrdinais = ['primeiro', 'segundo', 'terceiro', 'quarto', 'quinto', 'sexto', 'setimo', 'oitavo', 'nono', 'decimo'];
        const elementos: any[] = [];
        for (const nome of nomesOrdinais) {
            if (construto[nome] === undefined) break;
            elementos.push(construto[nome]);
        }
        return elementos;
    }

    private reservarSlotTemporario(tipoJvm: string): number {
        const slot = this.proximoSlot;
        this.proximoSlot += tipoJvm === 'D' ? 2 : 1;
        return slot;
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
        if (construto instanceof Isto) {
            if (!this.classeAtual) throw new ErroCompilador("'isto' usado fora de um método de instância.");
            return this.classeAtual.nome;
        }
        if (construto instanceof Super) {
            if (!this.classeAtual?.nomeSuper) throw new ErroCompilador("'super' usado em classe sem superclasse.");
            return this.classeAtual.nomeSuper;
        }
        if (construto instanceof AcessoMetodoOuPropriedade) {
            const nomeClasseObjeto = this.resolverTipoConstruto(construto.objeto);
            const resolvido = this.buscarCampoComOrigem(nomeClasseObjeto, construto.simbolo.lexema);
            if (!resolvido) {
                throw new ErroCompilador(`Propriedade '${construto.simbolo.lexema}' não encontrada na classe '${nomeClasseObjeto}'.`);
            }
            return resolvido.campo.tipoDelegua;
        }
        if (construto instanceof Chamada) {
            return this.resolverTipoChamada(construto);
        }
        if (construto instanceof Vetor) {
            const elementos = construto.elementos;
            if (elementos.length === 0) {
                throw new ErroCompilador('Vetor vazio precisa de contexto de tipo explícito (ainda não suportado).');
            }
            return `${this.resolverTipoConstruto(elementos[0])}[]`;
        }
        if (construto instanceof Dicionario) {
            if (construto.valores.length === 0) {
                throw new ErroCompilador('Dicionário vazio precisa de contexto de tipo explícito (ainda não suportado).');
            }
            return `dicionario<${this.resolverTipoConstruto(construto.valores[0])}>`;
        }
        // `TuplaN` estende `Tupla`: precisa vir antes da checagem genérica de `Tupla`.
        if (construto instanceof TuplaN) {
            return `tupla<${construto.elementos.map((elemento: any) => this.resolverTipoConstruto(elemento)).join(',')}>`;
        }
        if (construto instanceof Tupla) {
            const elementos = this.extrairElementosDeTupla(construto);
            return `tupla<${elementos.map((elemento) => this.resolverTipoConstruto(elemento)).join(',')}>`;
        }
        if (construto instanceof AcessoIndiceVariavel) {
            const tipoColecao = this.resolverTipoConstruto(construto.entidadeChamada);
            return this.resolverTipoElementoColecao(tipoColecao, construto.indice);
        }
        if (construto instanceof AcessoIntervaloVariavel) {
            const tipoColecao = this.resolverTipoConstruto(construto.entidadeChamada);
            if (!tipoColecao.endsWith('[]')) {
                throw new ErroCompilador(`Fatiamento só é suportado em vetor (tipo '${tipoColecao}').`);
            }
            return tipoColecao;
        }
        if (construto instanceof AcessoElementoMatriz) {
            const tipoColecao = this.resolverTipoConstruto(construto.entidadeChamada);
            return this.resolverTipoElementoMatriz(tipoColecao);
        }
        throw new ErroCompilador('Não foi possível resolver o tipo da expressão.');
    }

    private resolverTipoElementoColecao(tipoColecao: string, indice: any): string {
        if (tipoColecao.endsWith('[]')) return tipoColecao.slice(0, -2);
        if (tipoColecao.startsWith('dicionario<')) return tipoColecao.slice('dicionario<'.length, -1);
        if (tipoColecao.startsWith('tupla<')) {
            const indiceConstante = this.resolverIndiceConstante(indice);
            const tipos = this.dividirTiposTupla(tipoColecao);
            if (indiceConstante < 0 || indiceConstante >= tipos.length) {
                throw new ErroCompilador(`Índice ${indiceConstante} fora dos limites da tupla '${tipoColecao}'.`);
            }
            return tipos[indiceConstante];
        }
        throw new ErroCompilador(`Tipo '${tipoColecao}' não suporta acesso por índice.`);
    }

    private resolverTipoElementoParaEscrita(tipoColecao: string): string {
        if (tipoColecao.endsWith('[]')) return tipoColecao.slice(0, -2);
        if (tipoColecao.startsWith('dicionario<')) return tipoColecao.slice('dicionario<'.length, -1);
        if (tipoColecao.startsWith('tupla<')) {
            throw new ErroCompilador('Tupla é imutável: atribuição por índice não é suportada.');
        }
        throw new ErroCompilador(`Tipo '${tipoColecao}' não suporta atribuição por índice.`);
    }

    private resolverTipoElementoMatriz(tipoColecao: string): string {
        if (!tipoColecao.endsWith('[]')) {
            throw new ErroCompilador(`Acesso de matriz exige vetor de vetor (tipo '${tipoColecao}').`);
        }
        const tipoLinha = tipoColecao.slice(0, -2);
        if (!tipoLinha.endsWith('[]')) {
            throw new ErroCompilador(`Acesso de matriz exige vetor de vetor com 2 níveis ('${tipoColecao}' só tem 1).`);
        }
        return tipoLinha.slice(0, -2);
    }

    private resolverTipoChamada(expressao: Chamada): string {
        if (expressao.entidadeChamada instanceof Variavel && this.classes.has(expressao.entidadeChamada.simbolo.lexema)) {
            return expressao.entidadeChamada.simbolo.lexema;
        }
        if (expressao.entidadeChamada instanceof Super) {
            return 'vazio';
        }
        if (expressao.entidadeChamada instanceof AcessoMetodoOuPropriedade) {
            const nomeClasseObjeto = this.resolverTipoConstruto(expressao.entidadeChamada.objeto);
            const resolvido = this.buscarMetodoComOrigem(nomeClasseObjeto, expressao.entidadeChamada.simbolo.lexema);
            if (!resolvido) {
                throw new ErroCompilador(`Método '${expressao.entidadeChamada.simbolo.lexema}' não encontrado na classe '${nomeClasseObjeto}'.`);
            }
            return resolvido.metodo.tipoRetornoDelegua;
        }
        return this.resolverInfoFuncaoChamada(expressao).tipoRetornoDelegua;
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

        if (tipoJvm === 'D') this.instrucoes.push(`dstore ${slot}`);
        else if (this.ehTipoReferencia(tipoJvm)) this.instrucoes.push(`astore ${slot}`);
        else this.instrucoes.push(`istore ${slot}`);
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
        if (local.tipoJvm === 'D') this.instrucoes.push(`dload ${local.slot}`);
        else if (this.ehTipoReferencia(local.tipoJvm)) this.instrucoes.push(`aload ${local.slot}`);
        else this.instrucoes.push(`iload ${local.slot}`);
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
        if (local.tipoJvm === 'D') {
            this.instrucoes.push('dup2');
            this.instrucoes.push(`dstore ${local.slot}`);
        } else if (this.ehTipoReferencia(local.tipoJvm)) {
            this.instrucoes.push('dup');
            this.instrucoes.push(`astore ${local.slot}`);
        } else {
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
        // `NomeClasse(args)`: instanciação — não há palavra-chave `novo` em Delégua.
        if (expressao.entidadeChamada instanceof Variavel && this.classes.has(expressao.entidadeChamada.simbolo.lexema)) {
            return await this.compilarInstanciacao(expressao);
        }

        // `super(args)`: encadeamento explícito ao construtor da superclasse.
        if (expressao.entidadeChamada instanceof Super) {
            return await this.compilarChamadaSuperConstrutor(expressao);
        }

        // `objeto.metodo(args)` ou `super.metodo(args)`.
        if (expressao.entidadeChamada instanceof AcessoMetodoOuPropriedade) {
            return await this.compilarChamadaMetodo(expressao);
        }

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

    private async compilarArgumentos(argumentos: any[], parametros: ParametroFuncao[], nomeAlvo: string): Promise<void> {
        if (argumentos.length !== parametros.length) {
            throw new ErroCompilador(`'${nomeAlvo}' espera ${parametros.length} argumento(s), recebeu ${argumentos.length}.`);
        }
        for (let i = 0; i < argumentos.length; i++) {
            const tipoArgumento = await argumentos[i].aceitar(this as any);
            if (tipoArgumento === 'inteiro' && parametros[i].tipoDelegua === 'numero') this.instrucoes.push('i2d');
        }
    }

    private async compilarInstanciacao(expressao: Chamada): Promise<string> {
        const nomeClasse = (expressao.entidadeChamada as Variavel).simbolo.lexema;
        const infoClasse = this.classes.get(nomeClasse)!;

        this.instrucoes.push(`new ${nomeClasse}`);
        this.instrucoes.push('dup');
        await this.compilarArgumentos(expressao.argumentos, infoClasse.construtor!.parametros, nomeClasse);
        this.instrucoes.push(`invokespecial ${nomeClasse}/<init>${infoClasse.construtor!.descritor}`);
        return nomeClasse;
    }

    private async compilarChamadaSuperConstrutor(expressao: Chamada): Promise<string> {
        if (!this.classeAtual?.nomeSuper) {
            throw new ErroCompilador("'super(...)' usado em classe sem superclasse.");
        }
        const infoSuper = this.classes.get(this.classeAtual.nomeSuper);
        if (!infoSuper?.construtor) {
            throw new ErroCompilador(`Superclasse '${this.classeAtual.nomeSuper}' não tem construtor gerado.`);
        }

        this.instrucoes.push('aload_0');
        await this.compilarArgumentos(expressao.argumentos, infoSuper.construtor.parametros, `${this.classeAtual.nomeSuper}.construtor`);
        this.instrucoes.push(`invokespecial ${this.classeAtual.nomeSuper}/<init>${infoSuper.construtor.descritor}`);
        return 'vazio';
    }

    private async compilarChamadaMetodo(expressao: Chamada): Promise<string> {
        const acesso = expressao.entidadeChamada as AcessoMetodoOuPropriedade;
        const ehSuper = acesso.objeto instanceof Super;
        const nomeClasseObjeto = this.resolverTipoConstruto(acesso.objeto);
        const resolvido = this.buscarMetodoComOrigem(nomeClasseObjeto, acesso.simbolo.lexema);
        if (!resolvido) {
            throw new ErroCompilador(`Método '${acesso.simbolo.lexema}' não encontrado na classe '${nomeClasseObjeto}'.`);
        }
        const { metodo, nomeClasseOrigem } = resolvido;

        if (acesso.objeto instanceof Isto || ehSuper) this.instrucoes.push('aload_0');
        else await acesso.objeto.aceitar(this as any);

        await this.compilarArgumentos(expressao.argumentos, metodo.parametros, `${nomeClasseObjeto}.${metodo.nomeJvm}`);

        // Despacho virtual (`invokevirtual`) deixa a JVM resolver polimorfismo nativamente;
        // `super.metodo(...)` é a exceção deliberada — precisa de `invokespecial` para não
        // reentrar no override da própria subclasse.
        const instrucaoInvoke = ehSuper ? 'invokespecial' : 'invokevirtual';
        const nomeClasseParaInvoke = ehSuper ? nomeClasseOrigem : nomeClasseObjeto;
        this.instrucoes.push(`${instrucaoInvoke} ${nomeClasseParaInvoke}/${metodo.nomeJvm}${metodo.descritor}`);
        return metodo.tipoRetornoDelegua;
    }

    async visitarExpressaoRetornar(declaracao: Retorna): Promise<any> {
        if (!declaracao.valor) {
            this.instrucoes.push('return');
            return;
        }

        const tipoValor = await declaracao.valor.aceitar(this as any);
        if (tipoValor === 'inteiro' && this.tipoRetornoAtual === 'numero') this.instrucoes.push('i2d');

        const tipoJvmRetorno = this.mapearTipoJvm(this.tipoRetornoAtual);
        if (tipoJvmRetorno === 'D') this.instrucoes.push('dreturn');
        else if (this.ehTipoReferencia(tipoJvmRetorno)) this.instrucoes.push('areturn');
        else this.instrucoes.push('ireturn');
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
        const tipoJvmAlvo = this.mapearTipoJvm(tipoAlvo);
        if (this.ehTipoReferencia(tipoJvmAlvo) && tipoJvmAlvo !== 'Ljava/lang/String;') {
            throw new ErroCompilador(`'escolha' sobre instância de classe ('${tipoAlvo}') ainda não suportado.`);
        }
        await declaracao.identificadorOuLiteral.aceitar(this as any);

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

    async visitarDeclaracaoClasse(declaracao: Classe): Promise<any> {
        const info = this.classes.get(declaracao.simbolo.lexema);
        if (!info) throw new ErroCompilador(`Classe '${declaracao.simbolo.lexema}' não registrada.`);

        const metodosTexto: string[] = [await this.compilarConstrutorClasse(declaracao, info)];
        for (const metodoDecl of declaracao.metodos) {
            if (metodoDecl.simbolo.lexema === 'construtor') continue;
            metodosTexto.push(await this.compilarMetodoClasse(info, metodoDecl));
        }

        const camposTexto = Array.from(info.campos.values())
            .map((campo) => `.field public ${campo.nome} ${campo.tipoJvm}`)
            .join('\n');

        const classeTexto =
            `.class public ${info.nome}\n` +
            `.super ${info.nomeJvmSuper}\n\n` +
            (camposTexto ? camposTexto + '\n\n' : '') +
            metodosTexto.join('\n');

        this.classesGeradas.set(info.nome, classeTexto);
    }

    // Constrói o `.method public <init>` da classe. Se não houver `construtor` explícito na
    // primeira instrução chamando `super(...)`, insere a chamada padrão ao construtor sem
    // argumentos da superclasse (ou de `java/lang/Object`, se não houver superclasse).
    private async compilarConstrutorClasse(declaracao: Classe, info: InfoClasse): Promise<string> {
        const metodoConstrutor = declaracao.metodos.find((metodo) => metodo.simbolo.lexema === 'construtor');
        const corpoUsuario: Declaracao[] = metodoConstrutor ? metodoConstrutor.funcao.corpo : [];
        const primeiroEhSuper =
            corpoUsuario.length > 0 &&
            corpoUsuario[0] instanceof Expressao &&
            (corpoUsuario[0] as Expressao).expressao instanceof Chamada &&
            ((corpoUsuario[0] as Expressao).expressao as Chamada).entidadeChamada instanceof Super;

        const instrucoesAnteriores = this.instrucoes;
        const variaveisAnteriores = this.variaveis;
        const slotAnterior = this.proximoSlot;
        const tipoRetornoAnterior = this.tipoRetornoAtual;
        const classeAnterior = this.classeAtual;

        this.instrucoes = [];
        this.variaveis = new Map();
        this.proximoSlot = 1; // slot 0 é `isto`.
        this.tipoRetornoAtual = 'vazio';
        this.classeAtual = info;

        for (const parametro of info.construtor!.parametros) {
            const slot = this.proximoSlot;
            this.proximoSlot += parametro.tipoJvm === 'D' ? 2 : 1;
            this.variaveis.set(parametro.nome, { slot, tipoJvm: parametro.tipoJvm, tipoDelegua: parametro.tipoDelegua });
        }

        if (!primeiroEhSuper) {
            if (info.nomeSuper) {
                const infoSuper = this.classes.get(info.nomeSuper);
                if (!infoSuper?.construtor || infoSuper.construtor.parametros.length > 0) {
                    throw new ErroCompilador(
                        `Classe '${info.nome}' herda '${info.nomeSuper}', que não tem construtor sem argumentos: ` +
                            `chame 'super(...)' explicitamente como primeira instrução do construtor.`
                    );
                }
                this.instrucoes.push('aload_0');
                this.instrucoes.push(`invokespecial ${info.nomeSuper}/<init>()V`);
            } else {
                this.instrucoes.push('aload_0');
                this.instrucoes.push('invokespecial java/lang/Object/<init>()V');
            }
        }

        for (const decl of corpoUsuario) {
            await decl.aceitar(this as any);
        }
        this.instrucoes.push('return');

        const corpoTexto = this.instrucoes.map((instrucao) => `        ${instrucao}`).join('\n');
        const resultado =
            `.method public <init>${info.construtor!.descritor}\n` +
            `    .limit stack 32\n` +
            `    .limit locals ${this.proximoSlot}\n` +
            corpoTexto +
            '\n' +
            `.end method\n`;

        this.instrucoes = instrucoesAnteriores;
        this.variaveis = variaveisAnteriores;
        this.proximoSlot = slotAnterior;
        this.tipoRetornoAtual = tipoRetornoAnterior;
        this.classeAtual = classeAnterior;

        return resultado;
    }

    private async compilarMetodoClasse(info: InfoClasse, metodoDecl: FuncaoDeclaracao): Promise<string> {
        const metodoInfo = info.metodos.get(metodoDecl.simbolo.lexema);
        if (!metodoInfo) throw new ErroCompilador(`Método '${metodoDecl.simbolo.lexema}' não registrado na classe '${info.nome}'.`);

        const instrucoesAnteriores = this.instrucoes;
        const variaveisAnteriores = this.variaveis;
        const slotAnterior = this.proximoSlot;
        const tipoRetornoAnterior = this.tipoRetornoAtual;
        const classeAnterior = this.classeAtual;

        this.instrucoes = [];
        this.variaveis = new Map();
        this.proximoSlot = 1; // slot 0 é `isto`.
        this.tipoRetornoAtual = metodoInfo.tipoRetornoDelegua;
        this.classeAtual = info;

        for (const parametro of metodoInfo.parametros) {
            const slot = this.proximoSlot;
            this.proximoSlot += parametro.tipoJvm === 'D' ? 2 : 1;
            this.variaveis.set(parametro.nome, { slot, tipoJvm: parametro.tipoJvm, tipoDelegua: parametro.tipoDelegua });
        }

        for (const decl of metodoDecl.funcao.corpo) {
            await decl.aceitar(this as any);
        }
        if (metodoInfo.tipoRetornoJvm === 'V') this.instrucoes.push('return');

        const corpoTexto = this.instrucoes.map((instrucao) => `        ${instrucao}`).join('\n');
        const resultado =
            `.method public ${metodoInfo.nomeJvm}${metodoInfo.descritor}\n` +
            `    .limit stack 32\n` +
            `    .limit locals ${this.proximoSlot}\n` +
            (corpoTexto ? corpoTexto + '\n' : '') +
            `.end method\n`;

        this.instrucoes = instrucoesAnteriores;
        this.variaveis = variaveisAnteriores;
        this.proximoSlot = slotAnterior;
        this.tipoRetornoAtual = tipoRetornoAnterior;
        this.classeAtual = classeAnterior;

        return resultado;
    }

    async visitarExpressaoIsto(expressao: Isto): Promise<string> {
        if (!this.classeAtual) throw new ErroCompilador("'isto' usado fora de um método de instância.");
        this.instrucoes.push('aload_0');
        return this.classeAtual.nome;
    }

    async visitarExpressaoSuper(expressao: Super): Promise<any> {
        throw new ErroCompilador("'super' só pode ser usado em chamada de método ('super.metodo(...)') ou construtor ('super(...)').");
    }

    async visitarExpressaoAcessoMetodoOuPropriedade(expressao: AcessoMetodoOuPropriedade): Promise<string> {
        const nomeClasseObjeto = this.resolverTipoConstruto(expressao.objeto);
        const resolvido = this.buscarCampoComOrigem(nomeClasseObjeto, expressao.simbolo.lexema);
        if (!resolvido) {
            throw new ErroCompilador(`Propriedade '${expressao.simbolo.lexema}' não encontrada na classe '${nomeClasseObjeto}'.`);
        }
        const { campo, nomeClasseOrigem } = resolvido;

        if (expressao.objeto instanceof Isto || expressao.objeto instanceof Super) this.instrucoes.push('aload_0');
        else await expressao.objeto.aceitar(this as any);

        this.instrucoes.push(`getfield ${nomeClasseOrigem}/${campo.nome} ${campo.tipoJvm}`);
        return campo.tipoDelegua;
    }

    async visitarExpressaoDefinirValor(expressao: DefinirValor): Promise<string> {
        const nomeClasseObjeto = this.resolverTipoConstruto(expressao.objeto);
        const resolvido = this.buscarCampoComOrigem(nomeClasseObjeto, expressao.nome.lexema);
        if (!resolvido) {
            throw new ErroCompilador(`Propriedade '${expressao.nome.lexema}' não encontrada na classe '${nomeClasseObjeto}'.`);
        }
        const { campo, nomeClasseOrigem } = resolvido;

        if (expressao.objeto instanceof Isto || expressao.objeto instanceof Super) this.instrucoes.push('aload_0');
        else await expressao.objeto.aceitar(this as any);

        const tipoValor = await expressao.valor.aceitar(this as any);
        if (tipoValor === 'inteiro' && campo.tipoDelegua === 'numero') this.instrucoes.push('i2d');

        // `DefinirValor` é expressão: `dup_x1`/`dup2_x1` preserva o valor atribuído no topo
        // da pilha após o `putfield`, igual ao `dup`/`dup2` de `Atribuir` para variáveis.
        this.instrucoes.push(campo.tipoJvm === 'D' ? 'dup2_x1' : 'dup_x1');
        this.instrucoes.push(`putfield ${nomeClasseOrigem}/${expressao.nome.lexema} ${campo.tipoJvm}`);

        return campo.tipoDelegua;
    }

    async visitarExpressaoVetor(expressao: Vetor): Promise<string> {
        const elementos = expressao.elementos;
        if (elementos.length === 0) {
            throw new ErroCompilador('Vetor vazio precisa de contexto de tipo explícito (ainda não suportado).');
        }

        const tipoElemento = this.resolverTipoConstruto(elementos[0]);
        for (const elemento of elementos) {
            const tipoAtual = this.resolverTipoConstruto(elemento);
            if (tipoAtual !== tipoElemento) {
                throw new ErroCompilador(`Vetor com elementos de tipos diferentes ('${tipoElemento}' e '${tipoAtual}') não é suportado.`);
            }
        }
        const tipoJvmElemento = this.mapearTipoJvm(tipoElemento);

        this.instrucoes.push('new java/util/ArrayList');
        this.instrucoes.push('dup');
        this.instrucoes.push('invokespecial java/util/ArrayList/<init>()V');

        for (const elemento of elementos) {
            this.instrucoes.push('dup');
            await elemento.aceitar(this as any);
            this.emitirBoxing(tipoJvmElemento);
            this.instrucoes.push('invokeinterface java/util/List/add(Ljava/lang/Object;)Z 2');
            this.instrucoes.push('pop');
        }

        return `${tipoElemento}[]`;
    }

    async visitarExpressaoDicionario(expressao: Dicionario): Promise<string> {
        if (expressao.valores.length === 0) {
            throw new ErroCompilador('Dicionário vazio precisa de contexto de tipo explícito (ainda não suportado).');
        }
        for (const chave of expressao.chaves) {
            if (!(chave instanceof Literal) || typeof chave.valor !== 'string') {
                throw new ErroCompilador("Só são suportadas chaves literais de texto em dicionário (ex.: \"chave\": valor).");
            }
        }

        const tipoValor = this.resolverTipoConstruto(expressao.valores[0]);
        for (const valor of expressao.valores) {
            const tipoAtual = this.resolverTipoConstruto(valor);
            if (tipoAtual !== tipoValor) {
                throw new ErroCompilador(`Dicionário com valores de tipos diferentes ('${tipoValor}' e '${tipoAtual}') não é suportado.`);
            }
        }
        const tipoJvmValor = this.mapearTipoJvm(tipoValor);

        this.instrucoes.push('new java/util/HashMap');
        this.instrucoes.push('dup');
        this.instrucoes.push('invokespecial java/util/HashMap/<init>()V');

        for (let i = 0; i < expressao.valores.length; i++) {
            this.instrucoes.push('dup');
            await expressao.chaves[i].aceitar(this as any);
            await expressao.valores[i].aceitar(this as any);
            this.emitirBoxing(tipoJvmValor);
            this.instrucoes.push('invokevirtual java/util/HashMap/put(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;');
            this.instrucoes.push('pop');
        }

        return `dicionario<${tipoValor}>`;
    }

    async visitarExpressaoTuplaN(expressao: TuplaN): Promise<string> {
        return await this.compilarTupla(expressao.elementos);
    }

    async visitarExpressaoTupla(expressao: Tupla): Promise<string> {
        return await this.compilarTupla(this.extrairElementosDeTupla(expressao));
    }

    private async compilarTupla(elementos: any[]): Promise<string> {
        const tipos: string[] = [];

        this.instrucoes.push(`ldc ${elementos.length}`);
        this.instrucoes.push('anewarray java/lang/Object');

        for (let i = 0; i < elementos.length; i++) {
            const tipoElemento = this.resolverTipoConstruto(elementos[i]);
            tipos.push(tipoElemento);
            const tipoJvmElemento = this.mapearTipoJvm(tipoElemento);

            this.instrucoes.push('dup');
            this.instrucoes.push(`ldc ${i}`);
            await elementos[i].aceitar(this as any);
            this.emitirBoxing(tipoJvmElemento);
            this.instrucoes.push('aastore');
        }

        return `tupla<${tipos.join(',')}>`;
    }

    async visitarExpressaoAcessoIndiceVariavel(expressao: AcessoIndiceVariavel): Promise<string> {
        const tipoColecao = this.resolverTipoConstruto(expressao.entidadeChamada);
        const tipoElemento = this.resolverTipoElementoColecao(tipoColecao, expressao.indice);
        const tipoJvmElemento = this.mapearTipoJvm(tipoElemento);

        await expressao.entidadeChamada.aceitar(this as any);

        if (tipoColecao.endsWith('[]')) {
            const tipoIndice = this.resolverTipoConstruto(expressao.indice);
            if (tipoIndice !== 'inteiro') throw new ErroCompilador('Índice de vetor precisa ser inteiro.');
            await expressao.indice.aceitar(this as any);
            this.instrucoes.push('invokevirtual java/util/ArrayList/get(I)Ljava/lang/Object;');
        } else if (tipoColecao.startsWith('dicionario<')) {
            const tipoIndice = this.resolverTipoConstruto(expressao.indice);
            if (tipoIndice !== 'texto') throw new ErroCompilador('Chave de dicionário precisa ser texto (única forma suportada).');
            await expressao.indice.aceitar(this as any);
            this.instrucoes.push('invokevirtual java/util/HashMap/get(Ljava/lang/Object;)Ljava/lang/Object;');
        } else if (tipoColecao.startsWith('tupla<')) {
            const indiceConstante = this.resolverIndiceConstante(expressao.indice);
            this.instrucoes.push(`ldc ${indiceConstante}`);
            this.instrucoes.push('aaload');
        } else {
            throw new ErroCompilador(`Tipo '${tipoColecao}' não suporta acesso por índice.`);
        }

        this.emitirUnboxDeObjeto(tipoJvmElemento);
        return tipoElemento;
    }

    async visitarExpressaoAtribuicaoPorIndice(expressao: AtribuicaoPorIndice): Promise<string> {
        const tipoColecao = this.resolverTipoConstruto(expressao.objeto);
        const tipoElemento = this.resolverTipoElementoParaEscrita(tipoColecao);
        const tipoJvmElemento = this.mapearTipoJvm(tipoElemento);

        await expressao.objeto.aceitar(this as any);

        if (tipoColecao.endsWith('[]')) {
            const tipoIndice = this.resolverTipoConstruto(expressao.indice);
            if (tipoIndice !== 'inteiro') throw new ErroCompilador('Índice de vetor precisa ser inteiro.');
            await expressao.indice.aceitar(this as any);
            const tipoValor = await expressao.valor.aceitar(this as any);
            if (tipoValor === 'inteiro' && tipoElemento === 'numero') this.instrucoes.push('i2d');
            this.emitirBoxing(tipoJvmElemento);
            this.instrucoes.push('invokevirtual java/util/ArrayList/set(ILjava/lang/Object;)Ljava/lang/Object;');
            this.instrucoes.push('pop');
        } else {
            const tipoIndice = this.resolverTipoConstruto(expressao.indice);
            if (tipoIndice !== 'texto') throw new ErroCompilador('Chave de dicionário precisa ser texto (única forma suportada).');
            await expressao.indice.aceitar(this as any);
            const tipoValor = await expressao.valor.aceitar(this as any);
            if (tipoValor === 'inteiro' && tipoElemento === 'numero') this.instrucoes.push('i2d');
            this.emitirBoxing(tipoJvmElemento);
            this.instrucoes.push('invokevirtual java/util/HashMap/put(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;');
            this.instrucoes.push('pop');
        }

        return 'vazio';
    }

    async visitarExpressaoAcessoElementoMatriz(expressao: AcessoElementoMatriz): Promise<string> {
        const tipoColecao = this.resolverTipoConstruto(expressao.entidadeChamada);
        const tipoLinha = tipoColecao.slice(0, -2);
        const tipoElemento = this.resolverTipoElementoMatriz(tipoColecao);
        const tipoJvmLinha = this.mapearTipoJvm(tipoLinha);
        const tipoJvmElemento = this.mapearTipoJvm(tipoElemento);

        await expressao.entidadeChamada.aceitar(this as any);
        await expressao.indicePrimario.aceitar(this as any);
        this.instrucoes.push('invokevirtual java/util/ArrayList/get(I)Ljava/lang/Object;');
        this.emitirUnboxDeObjeto(tipoJvmLinha);

        await expressao.indiceSecundario.aceitar(this as any);
        this.instrucoes.push('invokevirtual java/util/ArrayList/get(I)Ljava/lang/Object;');
        this.emitirUnboxDeObjeto(tipoJvmElemento);

        return tipoElemento;
    }

    async visitarExpressaoAtribuicaoPorIndicesMatriz(expressao: AtribuicaoPorIndicesMatriz): Promise<string> {
        const tipoColecao = this.resolverTipoConstruto(expressao.objeto);
        const tipoLinha = tipoColecao.slice(0, -2);
        const tipoElemento = this.resolverTipoElementoMatriz(tipoColecao);
        const tipoJvmLinha = this.mapearTipoJvm(tipoLinha);
        const tipoJvmElemento = this.mapearTipoJvm(tipoElemento);

        await expressao.objeto.aceitar(this as any);
        await expressao.indicePrimario.aceitar(this as any);
        this.instrucoes.push('invokevirtual java/util/ArrayList/get(I)Ljava/lang/Object;');
        this.emitirUnboxDeObjeto(tipoJvmLinha);

        await expressao.indiceSecundario.aceitar(this as any);
        const tipoValor = await expressao.valor.aceitar(this as any);
        if (tipoValor === 'inteiro' && tipoElemento === 'numero') this.instrucoes.push('i2d');
        this.emitirBoxing(tipoJvmElemento);
        this.instrucoes.push('invokevirtual java/util/ArrayList/set(ILjava/lang/Object;)Ljava/lang/Object;');
        this.instrucoes.push('pop');

        return 'vazio';
    }

    // Fatiamento (`v[inicio:fim:passo]`) não tem equivalente nativo na JVM: gera um laço que
    // copia elementos de `origem` pra um `ArrayList` novo. Limitação: assume `passo` positivo
    // (fatiamento em ordem reversa com passo negativo não é suportado).
    async visitarExpressaoAcessoIntervaloVariavel(expressao: AcessoIntervaloVariavel): Promise<string> {
        const tipoColecao = this.resolverTipoConstruto(expressao.entidadeChamada);
        if (!tipoColecao.endsWith('[]')) {
            throw new ErroCompilador(`Fatiamento só é suportado em vetor (tipo '${tipoColecao}').`);
        }

        const slotOrigem = this.reservarSlotTemporario('Ljava/util/ArrayList;');
        const slotResultado = this.reservarSlotTemporario('Ljava/util/ArrayList;');
        const slotInicio = this.reservarSlotTemporario('I');
        const slotFim = this.reservarSlotTemporario('I');
        const slotPasso = this.reservarSlotTemporario('I');
        const slotIndice = this.reservarSlotTemporario('I');

        await expressao.entidadeChamada.aceitar(this as any);
        this.instrucoes.push(`astore ${slotOrigem}`);

        this.instrucoes.push('new java/util/ArrayList');
        this.instrucoes.push('dup');
        this.instrucoes.push('invokespecial java/util/ArrayList/<init>()V');
        this.instrucoes.push(`astore ${slotResultado}`);

        if (expressao.indiceInicio) {
            await expressao.indiceInicio.aceitar(this as any);
        } else {
            this.instrucoes.push('iconst_0');
        }
        this.instrucoes.push(`istore ${slotInicio}`);

        if (expressao.indiceFim) {
            await expressao.indiceFim.aceitar(this as any);
        } else {
            this.instrucoes.push(`aload ${slotOrigem}`);
            this.instrucoes.push('invokevirtual java/util/ArrayList/size()I');
        }
        this.instrucoes.push(`istore ${slotFim}`);

        if (expressao.indicePasso) {
            await expressao.indicePasso.aceitar(this as any);
        } else {
            this.instrucoes.push('iconst_1');
        }
        this.instrucoes.push(`istore ${slotPasso}`);

        this.instrucoes.push(`iload ${slotInicio}`);
        this.instrucoes.push(`istore ${slotIndice}`);

        const rotuloInicio = this.gerarRotulo('Lfatiar_inicio');
        const rotuloFim = this.gerarRotulo('Lfatiar_fim');

        this.instrucoes.push(`${rotuloInicio}:`);
        this.instrucoes.push(`iload ${slotIndice}`);
        this.instrucoes.push(`iload ${slotFim}`);
        this.instrucoes.push(`if_icmpge ${rotuloFim}`);

        this.instrucoes.push(`aload ${slotResultado}`);
        this.instrucoes.push(`aload ${slotOrigem}`);
        this.instrucoes.push(`iload ${slotIndice}`);
        this.instrucoes.push('invokevirtual java/util/ArrayList/get(I)Ljava/lang/Object;');
        this.instrucoes.push('invokeinterface java/util/List/add(Ljava/lang/Object;)Z 2');
        this.instrucoes.push('pop');

        this.instrucoes.push(`iload ${slotIndice}`);
        this.instrucoes.push(`iload ${slotPasso}`);
        this.instrucoes.push('iadd');
        this.instrucoes.push(`istore ${slotIndice}`);
        this.instrucoes.push(`goto ${rotuloInicio}`);
        this.instrucoes.push(`${rotuloFim}:`);

        this.instrucoes.push(`aload ${slotResultado}`);
        return tipoColecao;
    }
}
