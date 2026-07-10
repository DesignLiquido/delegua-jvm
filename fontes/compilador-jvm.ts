import {
    AcessoElementoMatriz,
    AcessoIndiceVariavel,
    AcessoIntervaloVariavel,
    AcessoMetodo,
    AcessoMetodoOuPropriedade,
    Agrupamento,
    Atribuir,
    AtribuicaoPorIndice,
    AtribuicaoPorIndicesMatriz,
    AvaliadorSintatico,
    Binario,
    Bloco,
    Ajuda,
    AjudaComoConstruto,
    Chamada,
    Classe,
    Continua,
    Declaracao,
    DefinirValor,
    Dicionario,
    Dupla,
    Elvis,
    Enquanto,
    Escolha,
    Escreva,
    Expressao,
    ExpressaoRegular,
    Extensao,
    Falhar,
    FormatacaoEscrita,
    FuncaoConstruto,
    FuncaoDeclaracao,
    Importar,
    InterfaceDeclaracao,
    Isto,
    Leia,
    Lexador,
    ListaCompreensao,
    Literal,
    Logico,
    Para,
    ParaCada,
    ParaCadaComoConstruto,
    Retorna,
    Se,
    SeTernario,
    Super,
    Sustar,
    Tente,
    TipoDe,
    Tupla,
    TuplaN,
    Unario,
    Var,
    Variavel,
    Vetor,
} from '@designliquido/delegua';

import * as fs from 'fs';
import * as path from 'path';

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

interface ContextoAcumulacaoParaCada {
    slotResultado: number;
    rotuloContinua: string;
    // Tipo Delégua do primeiro `retorna` encontrado no corpo — vira o tipo de elemento do
    // vetor resultado. `null` até o primeiro `retorna` ser compilado.
    tipoElemento: string | null;
}

const MAPA_TIPOS_JVM: Record<string, string> = {
    inteiro: 'I',
    numero: 'D',
    logico: 'Z',
    texto: 'Ljava/lang/String;',
};

// Tipo Delégua de retorno de cada primitiva de `texto` (nomes em `bibliotecas/primitivas-texto.js`
// de @designliquido/delegua, incluindo variantes com acento).
const RETORNOS_METODOS_TEXTO: Record<string, string> = {
    aparar: 'texto',
    apararFim: 'texto',
    apararInicio: 'texto',
    apararInício: 'texto',
    concatenar: 'texto',
    dividir: 'texto[]',
    encontrar: 'inteiro',
    fatiar: 'texto',
    inclui: 'logico',
    inverter: 'texto',
    maiusculo: 'texto',
    maiúsculo: 'texto',
    minusculo: 'texto',
    minúsculo: 'texto',
    particao: 'tupla<texto,texto,texto>',
    partição: 'tupla<texto,texto,texto>',
    substituir: 'texto',
    subtexto: 'texto',
    tamanho: 'inteiro',
    terminaCom: 'logico',
    tudoMaiusculo: 'logico',
    tudoMaiúsculo: 'logico',
    tudoMinusculo: 'logico',
    tudoMinúsculo: 'logico',
};

// Nomes da biblioteca global (`inicializarPilhaEscopos()` no avaliador sintático) normalizados
// pra uma chave canônica — várias delas têm uma variante acentuada equivalente.
const NOMES_CANONICOS_BIBLIOTECA: Record<string, string> = {
    aleatorio: 'aleatorio',
    aleatório: 'aleatorio',
    aleatorioEntre: 'aleatorioEntre',
    aleatórioEntre: 'aleatorioEntre',
    algum: 'algum',
    arredondar: 'arredondar',
    clonar: 'clonar',
    encontrar: 'encontrar',
    encontrarIndice: 'encontrarIndice',
    encontrarÍndice: 'encontrarIndice',
    encontrarUltimo: 'encontrarUltimo',
    encontrarÚltimo: 'encontrarUltimo',
    encontrarUltimoIndice: 'encontrarUltimoIndice',
    encontrarÚltimoÍndice: 'encontrarUltimoIndice',
    filtrarPor: 'filtrarPor',
    incluido: 'incluido',
    incluído: 'incluido',
    inteiro: 'inteiro',
    longo: 'longo',
    intervalo: 'intervalo',
    mapear: 'mapear',
    maximo: 'maximo',
    máximo: 'maximo',
    minimo: 'minimo',
    mínimo: 'minimo',
    numero: 'numero',
    número: 'numero',
    ordenar: 'ordenar',
    paraCada: 'paraCada',
    primeiroEmCondicao: 'primeiroEmCondicao',
    primeiroEmCondição: 'primeiroEmCondicao',
    real: 'real',
    reduzir: 'reduzir',
    somar: 'somar',
    tamanho: 'tamanho',
    texto: 'texto',
    todos: 'todos',
    todosEmCondicao: 'todosEmCondicao',
    todosEmCondição: 'todosEmCondicao',
    tupla: 'tupla',
    vetor: 'vetor',
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
    // Contador pra nomear as classes auxiliares de função anônima (`Lambda0`, `Lambda1`, ...).
    private proximoIdLambda: number;
    // Diretivas `.catch` (tabela de exceções) do método sendo compilado agora.
    private catchesGerados: string[];
    // Diretório usado pra resolver caminhos relativos de `importar`; caminhos absolutos de
    // arquivos já importados (evita reprocessar em ciclos/duplicatas entre módulos).
    private diretorioBase: string;
    private arquivosImportados: Set<string>;
    // Pilha de contextos de acumulação de `para cada` usado como expressão (inclusive lista
    // por compreensão, que é açúcar sintático em cima do mesmo mecanismo): quando não-vazia,
    // `retorna` dentro do corpo do laço mais interno "produz" pro vetor resultado em vez de
    // sair do método (ver `visitarExpressaoRetornar`/`visitarExpressaoParaCada`).
    private pilhaAcumulacaoParaCada: ContextoAcumulacaoParaCada[];
    // Métodos de `extensao de X { ... }`, por tipo alvo (nome Delégua) e nome de método.
    private extensoes: Map<string, Map<string, FuncaoInfo>>;

    constructor() {
        super();
        this.lexador = new Lexador();
        this.avaliadorSintatico = new AvaliadorSintatico();
    }

    // `caminhoArquivo`, se informado, é usado só pra resolver caminhos relativos de `importar`
    // (o diretório do arquivo vira a base). Sem ele, `importar` relativo resolve contra
    // `process.cwd()` — suficiente pra código compilado a partir de string em memória (sem
    // arquivo de verdade), mas quem compila a partir de um arquivo real (`fontes/ilc.ts`) deve
    // sempre passá-lo.
    async compilar(codigo: string[], nomeClasse: string = 'Programa', caminhoArquivo?: string): Promise<string> {
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
        this.proximoIdLambda = 0;
        this.catchesGerados = [];
        this.diretorioBase = caminhoArquivo ? path.dirname(path.resolve(caminhoArquivo)) : process.cwd();
        this.arquivosImportados = new Set(caminhoArquivo ? [path.resolve(caminhoArquivo)] : []);
        this.pilhaAcumulacaoParaCada = [];
        this.extensoes = new Map();

        const retornoLexador = this.lexador.mapear(codigo, -1);
        const retornoAvaliadorSintatico: any = await this.avaliadorSintatico.analisar(retornoLexador, -1);
        const declaracoes = retornoAvaliadorSintatico.declaracoes as Declaracao[];

        // `analisar()` não lança em erro de sintaxe: ele descarta a declaração problemática
        // de `declaracoes` (silenciosamente) e só reporta o problema em `erros`. Sem esta
        // checagem, um erro de sintaxe vira bytecode incompleto/incorreto em vez de falhar.
        // Gap real de UX do parser (não do compilador): documentado em PLAN.md.
        this.verificarErrosDeParser(retornoAvaliadorSintatico);

        // Resolve `importar` antes de tudo: lê e compila os módulos referenciados (recursivamente),
        // trazendo suas funções/classes de nível superior pra registro e compilação junto com
        // o arquivo principal.
        const declaracoesImportadas = await this.resolverImportacoes(declaracoes, this.diretorioBase);
        const todasDeclaracoes = [...declaracoesImportadas, ...declaracoes];

        // Registrar assinaturas antes de compilar qualquer corpo: permite recursão e chamada
        // a funções/classes declaradas mais abaixo no arquivo (ou em outro módulo importado).
        this.registrarClasses(todasDeclaracoes);
        this.registrarFuncoes(todasDeclaracoes);
        this.registrarExtensoes(todasDeclaracoes);

        for (const declaracao of todasDeclaracoes) {
            await declaracao.aceitar(this as any);
        }

        return this.montarModulo();
    }

    private verificarErrosDeParser(resultado: any, origemModulo?: string): void {
        if (resultado.erros && resultado.erros.length > 0) {
            const mensagens = resultado.erros
                .map((erro: any) => `linha ${erro.linha}: símbolo '${erro.simbolo?.lexema}' (${erro.codigoDiagnostico})`)
                .join('; ');
            const prefixo = origemModulo ? `Erro de sintaxe no módulo importado '${origemModulo}'` : 'Erro de sintaxe';
            throw new ErroCompilador(`${prefixo}: ${mensagens}`);
        }
    }

    // Lê e compila (lexa/parseia) recursivamente cada `importar { a, b } de "caminho"` de nível
    // superior, devolvendo as `FuncaoDeclaracao`/`Classe` de nível superior encontradas nos
    // módulos (dos mais profundos pros mais rasos, pra registro/compilação funcionar em
    // qualquer ordem de dependência entre eles). Simplificação documentada: expõe TODAS as
    // funções/classes do módulo, sem filtrar pela lista seletiva de `elementosImportacao` —
    // filtrar exigiria também rastrear dependências transitivas entre os itens do módulo (uma
    // classe pode herdar de outra não listada), o que não vale o custo nesta primeira passada.
    // Outras declarações soltas no topo do módulo (`var`, `escreva`, etc.) são ignoradas —
    // um módulo importado é tratado como uma biblioteca de funções/classes, não um programa.
    private async resolverImportacoes(declaracoes: Declaracao[], diretorioBase: string): Promise<Declaracao[]> {
        const resultado: Declaracao[] = [];

        for (const declaracao of declaracoes) {
            if (!(declaracao instanceof Importar)) continue;

            if (declaracao.simboloTudo) {
                throw new ErroCompilador(
                    "'importar tudo como X de \"...\"' ainda não é suportado — use 'importar { nome1, nome2 } de \"...\"'."
                );
            }
            if (!(declaracao.caminho instanceof Literal) || typeof declaracao.caminho.valor !== 'string') {
                throw new ErroCompilador("Caminho de 'importar' precisa ser um texto literal.");
            }

            const caminhoBruto = declaracao.caminho.valor;
            const nomeArquivo = caminhoBruto.endsWith('.delegua') ? caminhoBruto : `${caminhoBruto}.delegua`;
            const caminhoAbsoluto = path.resolve(diretorioBase, nomeArquivo);

            // Já resolvido (importado por outro módulo, ou ciclo entre módulos): não reprocessa.
            if (this.arquivosImportados.has(caminhoAbsoluto)) continue;
            this.arquivosImportados.add(caminhoAbsoluto);

            if (!fs.existsSync(caminhoAbsoluto)) {
                throw new ErroCompilador(`Módulo importado não encontrado: '${caminhoAbsoluto}' (de 'importar ... de "${caminhoBruto}"').`);
            }

            const codigoModulo = fs.readFileSync(caminhoAbsoluto, 'utf-8').split('\n');
            // Avaliador sintático próprio por módulo: mantém o estado de análise de cada
            // arquivo (pilha de escopos, tipos definidos em código) isolado do principal.
            const avaliadorModulo = new AvaliadorSintatico();
            const retornoLexadorModulo = this.lexador.mapear(codigoModulo, -1);
            const retornoAvaliadorModulo: any = await avaliadorModulo.analisar(retornoLexadorModulo, -1);
            this.verificarErrosDeParser(retornoAvaliadorModulo, caminhoAbsoluto);

            const declaracoesModulo = retornoAvaliadorModulo.declaracoes as Declaracao[];

            // Resolve as importações do PRÓPRIO módulo antes das dele, relativas ao diretório
            // DELE (não ao do arquivo que o importou).
            const importadasTransitivamente = await this.resolverImportacoes(declaracoesModulo, path.dirname(caminhoAbsoluto));
            resultado.push(...importadasTransitivamente);

            for (const declaracaoModulo of declaracoesModulo) {
                if (declaracaoModulo instanceof FuncaoDeclaracao || declaracaoModulo instanceof Classe) {
                    resultado.push(declaracaoModulo);
                }
            }
        }

        return resultado;
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

    // `extensao de X { metodo(...) { ... } }`: registra cada método num mapa próprio
    // (`this.extensoes`), separado de `this.classes`/`this.funcoes` — uma extensão não é uma
    // classe nem uma função de nível superior, é um método "encaixado" num tipo já existente
    // (primitivo ou classe do usuário). O receptor vira um parâmetro sintético `isto` explícito
    // (`visitarExpressaoIsto` sabe ler isso — ver o `if (localIsto)` lá).
    private registrarExtensoes(declaracoes: Declaracao[]): void {
        const declsExtensao = declaracoes.filter((declaracao): declaracao is Extensao => declaracao instanceof Extensao);

        for (const declaracao of declsExtensao) {
            const tipoAlvo = this.normalizarTipo(declaracao.simboloTipo.lexema);
            if (!this.extensoes.has(tipoAlvo)) this.extensoes.set(tipoAlvo, new Map());
            const metodosDoTipo = this.extensoes.get(tipoAlvo)!;

            for (const metodoDecl of declaracao.metodos) {
                this.verificarSemDecoradores(metodoDecl, `extensão de ${tipoAlvo}`);
                const nomeMetodo = metodoDecl.simbolo.lexema;
                if (metodosDoTipo.has(nomeMetodo)) {
                    throw new ErroCompilador(`Método de extensão '${nomeMetodo}' já declarado pra '${tipoAlvo}'.`);
                }

                const tipoJvmReceptor = this.mapearTipoJvm(tipoAlvo);
                const parametrosUsuario: ParametroFuncao[] = metodoDecl.funcao.parametros.map((parametro) => {
                    if (!parametro.tipoDado) {
                        throw new ErroCompilador(`Parâmetro '${parametro.nome.lexema}' de '${tipoAlvo}.${nomeMetodo}' (extensão) precisa de tipo explícito.`);
                    }
                    const tipoDelegua = this.normalizarTipo(parametro.tipoDado);
                    return { nome: parametro.nome.lexema, tipoDelegua, tipoJvm: this.mapearTipoJvm(tipoDelegua) };
                });
                const parametros: ParametroFuncao[] = [{ nome: 'isto', tipoDelegua: tipoAlvo, tipoJvm: tipoJvmReceptor }, ...parametrosUsuario];

                const tipoRetornoBruto = metodoDecl.funcao.tipo || 'vazio';
                if (tipoRetornoBruto === 'qualquer') {
                    throw new ErroCompilador(`Método de extensão '${tipoAlvo}.${nomeMetodo}' precisa de tipo de retorno explícito.`);
                }
                const tipoRetornoDelegua = tipoRetornoBruto === 'vazio' ? 'vazio' : this.normalizarTipo(tipoRetornoBruto);
                const tipoRetornoJvm = tipoRetornoDelegua === 'vazio' ? 'V' : this.mapearTipoJvm(tipoRetornoDelegua);
                const descritor = `(${parametros.map((parametro) => parametro.tipoJvm).join('')})${tipoRetornoJvm}`;
                const nomeJvm = `ext_${tipoAlvo}_${nomeMetodo}`;

                metodosDoTipo.set(nomeMetodo, { nomeJvm, parametros, tipoRetornoDelegua, tipoRetornoJvm, descritor });
            }
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

    // Resolve o tipo Delégua de um nome de identificador: primeiro como variável/parâmetro
    // local (`this.variaveis`), senão como campo capturado da lambda sendo compilada agora
    // (`this.classeAtual`, quando estamos dentro de um `invocar` de função anônima).
    private resolverTipoDeNomeVariavelOuCampo(nome: string): string {
        const local = this.variaveis.get(nome);
        if (local) return local.tipoDelegua;
        const campo = this.classeAtual?.campos.get(nome);
        if (campo) return campo.tipoDelegua;
        throw new ErroCompilador(`Variável '${nome}' não declarada.`);
    }

    private montarModulo(): string {
        const corpo = this.instrucoes.map((instrucao) => `        ${instrucao}`).join('\n');
        const metodosExtras = this.metodosGerados.length ? '\n' + this.metodosGerados.join('\n') : '';

        return (
            `.class public ${this.nomeClasse}\n` +
            `.super java/lang/Object\n\n` +
            // Suporte a `leia(...)`: leitor único, criado sob demanda (ver `visitarExpressaoLeia`).
            // Presente sempre (não custa nada se `leia` nunca for usado).
            `.field private static leitor Ljava/io/BufferedReader;\n\n` +
            `.method public <init>()V\n` +
            `    aload_0\n` +
            `    invokespecial java/lang/Object/<init>()V\n` +
            `    return\n` +
            `.end method\n\n` +
            `.method public static main([Ljava/lang/String;)V\n` +
            `    .limit stack 32\n` +
            `    .limit locals ${this.proximoSlot}\n` +
            this.formatarCatches() +
            (corpo ? corpo + '\n' : '') +
            `        return\n` +
            `.end method\n` +
            metodosExtras
        );
    }

    /** Diretivas `.catch` (tabela de exceções de `tente`/`pegue`/`finalmente`) do método sendo montado agora. */
    private formatarCatches(): string {
        return this.catchesGerados.length ? this.catchesGerados.map((linha) => `    ${linha}`).join('\n') + '\n' : '';
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
        if (tipoDelegua === 'expressao_regular') return 'Ljava/util/regex/Pattern;';
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
            if (construto.valor === null) return 'nulo';
            throw new ErroCompilador('Não foi possível deduzir o tipo do literal.');
        }
        if (construto instanceof Variavel) {
            return this.resolverTipoDeNomeVariavelOuCampo(construto.simbolo.lexema);
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
            // Dentro de um método de `extensao`, `isto` é só um parâmetro sintético comum
            // (não há classe real por trás) — checa isso primeiro.
            const localIsto = this.variaveis.get('isto');
            if (localIsto) return localIsto.tipoDelegua;
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
        if (construto instanceof Elvis) {
            const tipoEsquerdo = this.resolverTipoConstruto(construto.esquerda);
            const tipoDireito = this.resolverTipoConstruto(construto.direita);
            return tipoEsquerdo !== 'nulo' ? tipoEsquerdo : tipoDireito;
        }
        if (construto instanceof Leia) {
            return 'texto';
        }
        if (construto instanceof ExpressaoRegular) {
            return 'expressao_regular';
        }
        // `para cada` como expressão (e lista por compreensão, que é só açúcar sintático em
        // cima dele — ver `visitarExpressaoListaCompreensao`): o tipo do vetor resultado
        // depende de compilar o corpo (o tipo de cada `retorna`), igual ao `mapear` da Fase 10
        // — não dá pra "espiar" sem compilar duas vezes, então exige anotação explícita.
        if (construto instanceof ListaCompreensao) {
            return this.resolverTipoConstruto(construto.paraCada);
        }
        if (construto instanceof ParaCadaComoConstruto) {
            throw new ErroCompilador(
                "'para cada' como expressão precisa de tipo explícito quando usado como inicializador " +
                    "(ex.: 'var r: inteiro[] = para cada x em v { retorna x }') — não dá pra descobrir o tipo do resultado sem " +
                    'compilar o corpo, e fazer isso aqui o compilaria duas vezes.'
            );
        }
        if (construto instanceof SeTernario) {
            const tipoEntao = this.resolverTipoConstruto(construto.expressaoSe);
            const tipoSenao = this.resolverTipoConstruto(construto.expressaoSenao);
            if (tipoEntao === tipoSenao) return tipoEntao;
            if ((tipoEntao === 'inteiro' || tipoEntao === 'numero') && (tipoSenao === 'inteiro' || tipoSenao === 'numero')) return 'numero';
            throw new ErroCompilador(`'se ternário' com ramos de tipos incompatíveis: '${tipoEntao}' e '${tipoSenao}'.`);
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
            if (resolvido) return resolvido.metodo.tipoRetornoDelegua;
            const infoExtensao = this.extensoes.get(nomeClasseObjeto)?.get(expressao.entidadeChamada.simbolo.lexema);
            if (infoExtensao) return infoExtensao.tipoRetornoDelegua;
            throw new ErroCompilador(`Método '${expressao.entidadeChamada.simbolo.lexema}' não encontrado na classe '${nomeClasseObjeto}'.`);
        }
        if (expressao.entidadeChamada instanceof AcessoMetodo) {
            return this.resolverTipoRetornoMetodoPrimitivo(expressao.entidadeChamada);
        }
        // Chamar uma variável local/parâmetro/campo capturado (nunca uma função de nível
        // superior, que fica só em `this.funcoes`): só faz sentido se ela guarda uma função
        // anônima — o "tipo" dela é o nome da classe auxiliar gerada em
        // `visitarExpressaoFuncaoConstruto`, que tem um método `invocar`.
        if (expressao.entidadeChamada instanceof Variavel && this.variaveis.has(expressao.entidadeChamada.simbolo.lexema)) {
            const nomeClasseLambda = this.resolverTipoConstruto(expressao.entidadeChamada);
            const metodo = this.classes.get(nomeClasseLambda)?.metodos.get('invocar');
            if (!metodo) throw new ErroCompilador(`'${expressao.entidadeChamada.simbolo.lexema}' não é uma função anônima chamável.`);
            return metodo.tipoRetornoDelegua;
        }
        if (
            expressao.entidadeChamada instanceof Variavel &&
            !this.funcoes.has(expressao.entidadeChamada.simbolo.lexema) &&
            this.nomeCanonicoBiblioteca(expressao.entidadeChamada.simbolo.lexema)
        ) {
            return this.resolverTipoRetornoBiblioteca(
                this.nomeCanonicoBiblioteca(expressao.entidadeChamada.simbolo.lexema)!,
                expressao.argumentos
            );
        }
        return this.resolverInfoFuncaoChamada(expressao).tipoRetornoDelegua;
    }

    private resolverTipoRetornoMetodoPrimitivo(acesso: AcessoMetodo): string {
        const tipoObjeto = this.resolverTipoConstruto(acesso.objeto);
        if (tipoObjeto === 'texto') {
            const tipoRetorno = RETORNOS_METODOS_TEXTO[acesso.nomeMetodo];
            if (tipoRetorno) return tipoRetorno;
        }
        // Mesma prioridade de `visitarExpressaoDeChamada`: método real da classe antes de
        // extensão de mesmo nome (ver comentário lá sobre por que isso pode chegar aqui como
        // `AcessoMetodo` mesmo sendo uma classe de usuário).
        if (this.classes.has(tipoObjeto)) {
            const resolvidoClasse = this.buscarMetodoComOrigem(tipoObjeto, acesso.nomeMetodo);
            if (resolvidoClasse) return resolvidoClasse.metodo.tipoRetornoDelegua;
        }
        const infoExtensao = this.extensoes.get(tipoObjeto)?.get(acesso.nomeMetodo);
        if (infoExtensao) return infoExtensao.tipoRetornoDelegua;
        throw new ErroCompilador(`Método '${acesso.nomeMetodo}' não implementado para o tipo '${tipoObjeto}'.`);
    }

    private nomeCanonicoBiblioteca(nome: string): string | null {
        return NOMES_CANONICOS_BIBLIOTECA[nome] ?? null;
    }

    // Resolução de tipo sem efeito colateral (não compila nada) — usada quando a chamada
    // aparece como sub-expressão (ex.: peek de tipo em `var` sem anotação explícita). Só
    // 'mapear' não cabe aqui: seu tipo de retorno depende do que o callback retorna, e não dá
    // pra descobrir isso sem compilá-lo — nesse caso força o usuário a anotar o tipo (ver
    // `compilarChamadaBiblioteca` pra a compilação de verdade).
    private resolverTipoRetornoBiblioteca(nomeCanonico: string, argumentos: any[]): string {
        switch (nomeCanonico) {
            case 'aleatorio':
            case 'aleatorioEntre':
            case 'arredondar':
            case 'real':
            case 'numero':
                return 'numero';
            case 'inteiro':
            case 'tamanho':
            case 'encontrarIndice':
            case 'encontrarUltimoIndice':
                return 'inteiro';
            case 'longo':
                throw new ErroCompilador("'longo' (BigInt) não é suportado — este compilador não modela inteiros de precisão arbitrária.");
            case 'texto':
                return 'texto';
            case 'algum':
            case 'todos':
            case 'todosEmCondicao':
            case 'incluido':
                return 'logico';
            case 'clonar':
                return this.resolverTipoConstruto(argumentos[0]);
            case 'maximo':
            case 'minimo':
            case 'somar': {
                const tipoVetor = this.resolverTipoConstruto(argumentos[0]);
                if (!tipoVetor.endsWith('[]')) throw new ErroCompilador(`'${nomeCanonico}' espera um vetor.`);
                return tipoVetor.slice(0, -2);
            }
            case 'ordenar':
                return this.resolverTipoConstruto(argumentos[0]);
            case 'intervalo':
                return 'inteiro[]';
            case 'vetor': {
                const tipoTupla = this.resolverTipoConstruto(argumentos[0]);
                if (!tipoTupla.startsWith('tupla<')) throw new ErroCompilador("'vetor' espera uma tupla.");
                const tipos = this.dividirTiposTupla(tipoTupla);
                if (!tipos.every((tipo) => tipo === tipos[0])) {
                    throw new ErroCompilador("'vetor' só suporta tupla homogênea (todos os elementos do mesmo tipo).");
                }
                return `${tipos[0]}[]`;
            }
            case 'tupla':
                throw new ErroCompilador(
                    "'tupla(vetor)' não é suportado: a aridade de uma tupla precisa ser conhecida em tempo de compilação, e 'vetor' tem tamanho dinâmico."
                );
            case 'paraCada':
                return 'vazio';
            case 'filtrarPor':
                return this.resolverTipoConstruto(argumentos[0]);
            case 'encontrar':
            case 'encontrarUltimo':
            case 'primeiroEmCondicao': {
                const tipoVetor = this.resolverTipoConstruto(argumentos[0]);
                if (!tipoVetor.endsWith('[]')) throw new ErroCompilador(`'${nomeCanonico}' espera um vetor.`);
                return tipoVetor.slice(0, -2);
            }
            case 'reduzir':
                return this.resolverTipoConstruto(argumentos[2]);
            case 'mapear':
                throw new ErroCompilador(
                    "'mapear' com função de callback precisa de tipo explícito quando usado como inicializador " +
                        "(ex.: 'var r: inteiro[] = mapear(...)') — não dá pra descobrir o tipo do resultado sem compilar " +
                        'a função anônima, e fazer isso aqui a compilaria duas vezes.'
                );
            default:
                throw new ErroCompilador(`Função nativa '${nomeCanonico}' não implementada.`);
        }
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
        this.verificarSemDecoradores(declaracao, 'var');
        // `declaracao.tipo` é preenchido pelo parser a partir do tipo do inicializador
        // quando não há anotação explícita — e sofre da mesma generalização de
        // 'número' descrita em `resolverTipoConstruto`. Só confia nele quando o
        // usuário anotou o tipo explicitamente (`var x: inteiro = 10`).
        let tipoDelegua: string;
        if (declaracao.tipoExplicito) {
            tipoDelegua = this.normalizarTipo(declaracao.tipo);
            await declaracao.inicializador.aceitar(this as any);
        } else if (declaracao.inicializador instanceof FuncaoConstruto) {
            // Função anônima: o "tipo" é o nome da classe auxiliar gerada ao compilar (contador
            // de lambdas) — não dá pra descobrir isso antes, via `resolverTipoConstruto`, sem
            // duplicar a análise de captura e dessincronizar o contador.
            tipoDelegua = await declaracao.inicializador.aceitar(this as any);
        } else {
            tipoDelegua = this.resolverTipoConstruto(declaracao.inicializador);
            await declaracao.inicializador.aceitar(this as any);
        }

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
            case 'nulo':
                this.instrucoes.push('aconst_null');
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
        if (local) {
            if (local.tipoJvm === 'D') this.instrucoes.push(`dload ${local.slot}`);
            else if (this.ehTipoReferencia(local.tipoJvm)) this.instrucoes.push(`aload ${local.slot}`);
            else this.instrucoes.push(`iload ${local.slot}`);
            return local.tipoDelegua;
        }
        // Não é uma variável/parâmetro local: só resta ser um campo capturado da lambda sendo
        // compilada agora (referência a uma variável da função/método que a envolvia).
        const campo = this.classeAtual?.campos.get(expressao.simbolo.lexema);
        if (campo) {
            this.instrucoes.push('aload_0');
            this.instrucoes.push(`getfield ${this.classeAtual!.nome}/${campo.nome} ${campo.tipoJvm}`);
            return campo.tipoDelegua;
        }
        throw new ErroCompilador(`Variável '${expressao.simbolo.lexema}' não declarada.`);
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
            case 'MODULO':
                this.instrucoes.push(inteiro ? 'irem' : 'drem');
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
        const decremento = expressao.operador.tipo === 'DECREMENTAR';
        const nome = expressao.operando.simbolo.lexema;
        const local = this.variaveis.get(nome);

        if (local) {
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

        // Campo capturado de lambda: `iinc` só existe pra slots locais, então usa
        // getfield/putfield (sem semântica de pré/pós-fixado, igual ao caso de slot local).
        const campo = this.classeAtual?.campos.get(nome);
        if (campo) {
            if (campo.tipoJvm === 'D') {
                this.instrucoes.push('aload_0');
                this.instrucoes.push('dup');
                this.instrucoes.push(`getfield ${this.classeAtual!.nome}/${campo.nome} ${campo.tipoJvm}`);
                this.instrucoes.push('ldc2_w 1.0');
                this.instrucoes.push(decremento ? 'dsub' : 'dadd');
                this.instrucoes.push('dup2_x1');
                this.instrucoes.push(`putfield ${this.classeAtual!.nome}/${campo.nome} ${campo.tipoJvm}`);
                return campo.tipoDelegua;
            }
            if (campo.tipoJvm === 'I') {
                this.instrucoes.push('aload_0');
                this.instrucoes.push('dup');
                this.instrucoes.push(`getfield ${this.classeAtual!.nome}/${campo.nome} ${campo.tipoJvm}`);
                this.instrucoes.push(decremento ? 'iconst_m1' : 'iconst_1');
                this.instrucoes.push('iadd');
                this.instrucoes.push('dup_x1');
                this.instrucoes.push(`putfield ${this.classeAtual!.nome}/${campo.nome} ${campo.tipoJvm}`);
                return campo.tipoDelegua;
            }
            throw new ErroCompilador(`Incremento/decremento não suportado para tipo '${campo.tipoDelegua}'.`);
        }

        throw new ErroCompilador(`Variável '${nome}' não declarada.`);
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

        const nome = expressao.alvo.simbolo.lexema;
        const local = this.variaveis.get(nome);

        if (local) {
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

        // Campo capturado de lambda: mesma ideia de `DefinirValor`, mas com `isto` implícito
        // (o corpo da lambda só tem o nome livre, não `isto.nome`).
        const campo = this.classeAtual?.campos.get(nome);
        if (campo) {
            this.instrucoes.push('aload_0');
            const tipoValor = await expressao.valor.aceitar(this as any);
            if (tipoValor === 'inteiro' && campo.tipoDelegua === 'numero') this.instrucoes.push('i2d');
            this.instrucoes.push(campo.tipoJvm === 'D' ? 'dup2_x1' : 'dup_x1');
            this.instrucoes.push(`putfield ${this.classeAtual!.nome}/${campo.nome} ${campo.tipoJvm}`);
            return campo.tipoDelegua;
        }

        throw new ErroCompilador(`Variável '${nome}' não declarada.`);
    }

    async visitarDeclaracaoDefinicaoFuncao(declaracao: FuncaoDeclaracao): Promise<any> {
        this.verificarSemDecoradores(declaracao, 'função');
        const info = this.funcoes.get(declaracao.simbolo.lexema);
        if (!info) throw new ErroCompilador(`Função '${declaracao.simbolo.lexema}' não registrada.`);

        // Funções viram `.method private static` isolados: salva o contexto do método atual
        // (ex.: `main`, ou quem chamou esta função) e restaura ao final.
        const instrucoesAnteriores = this.instrucoes;
        const variaveisAnteriores = this.variaveis;
        const slotAnterior = this.proximoSlot;
        const tipoRetornoAnterior = this.tipoRetornoAtual;
        const catchesAnteriores = this.catchesGerados;

        this.instrucoes = [];
        this.variaveis = new Map();
        this.proximoSlot = 0;
        this.tipoRetornoAtual = info.tipoRetornoDelegua;
        this.catchesGerados = [];

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
                this.formatarCatches() +
                (corpoTexto ? corpoTexto + '\n' : '') +
                `.end method\n`
        );

        this.instrucoes = instrucoesAnteriores;
        this.variaveis = variaveisAnteriores;
        this.proximoSlot = slotAnterior;
        this.tipoRetornoAtual = tipoRetornoAnterior;
        this.catchesGerados = catchesAnteriores;
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

        // Método nativo de tipo primitivo (`"abc".maiusculo()`) — o parser já resolve isso
        // pra `AcessoMetodo` quando reconhece a primitiva (ver PLAN.md, achado da Fase 6).
        if (expressao.entidadeChamada instanceof AcessoMetodo) {
            const acesso = expressao.entidadeChamada;
            const tipoObjeto = this.resolverTipoConstruto(acesso.objeto);
            if (tipoObjeto === 'texto' && RETORNOS_METODOS_TEXTO[acesso.nomeMetodo]) {
                return await this.compilarMetodoTexto(acesso.objeto, acesso.nomeMetodo, expressao.argumentos);
            }
            // Achado da Fase 12: registrar uma `extensao de X` faz o PARSER resolver
            // `objeto.metodo(...)` pra `AcessoMetodo` (não `AcessoMetodoOuPropriedade`) mesmo
            // quando `X` é uma classe de usuário com um método REAL de mesmo nome (a extensão
            // entra na mesma tabela `primitivasConhecidas` usada pra texto/número/vetor
            // nativos). Por isso, se `tipoObjeto` é uma classe registrada, o método real da
            // classe (com herança) tem que ter prioridade sobre a extensão — mesma ordem de
            // `compilarChamadaMetodoDeClasse`, reaproveitada aqui.
            if (this.classes.has(tipoObjeto)) {
                return await this.compilarChamadaMetodoDeClasse(acesso.objeto, tipoObjeto, acesso.nomeMetodo, expressao.argumentos);
            }
            const infoExtensao = this.extensoes.get(tipoObjeto)?.get(acesso.nomeMetodo);
            if (infoExtensao) {
                return await this.compilarChamadaExtensao(acesso.objeto, tipoObjeto, infoExtensao, expressao.argumentos);
            }
            throw new ErroCompilador(`Método '${acesso.nomeMetodo}' não implementado para o tipo '${tipoObjeto}'.`);
        }

        // Chamar uma variável/parâmetro/campo capturado local (`f(5)`): só pode ser uma função
        // anônima guardada nela — funções de nível superior nunca entram em `this.variaveis`.
        // Achado empírico da Fase 7: tanto isso quanto uma chamada de função de nível superior
        // chegam aqui como `Variavel` puro (`ReferenciaFuncao`/`ArgumentoReferenciaFuncao` nunca
        // são de fato instanciados pelo parser desta versão — ver PLAN.md).
        if (expressao.entidadeChamada instanceof Variavel && this.variaveis.has(expressao.entidadeChamada.simbolo.lexema)) {
            return await this.compilarChamadaLambda(expressao);
        }

        // Função nativa da biblioteca global (`mapear`, `tamanho`, `intervalo`, ...) — só entra
        // aqui se não houver função de nível superior com o mesmo nome (usuário pode "sombrear"
        // um nome de biblioteca com sua própria função).
        if (
            expressao.entidadeChamada instanceof Variavel &&
            !this.funcoes.has(expressao.entidadeChamada.simbolo.lexema) &&
            this.nomeCanonicoBiblioteca(expressao.entidadeChamada.simbolo.lexema)
        ) {
            return await this.compilarChamadaBiblioteca(
                this.nomeCanonicoBiblioteca(expressao.entidadeChamada.simbolo.lexema)!,
                expressao.argumentos
            );
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
        const nomeClasseObjeto = this.resolverTipoConstruto(acesso.objeto);
        return await this.compilarChamadaMetodoDeClasse(acesso.objeto, nomeClasseObjeto, acesso.simbolo.lexema, expressao.argumentos);
    }

    // Compartilhado entre `objeto.metodo(...)` (via `AcessoMetodoOuPropriedade`, o caminho
    // normal pra classes de usuário) e `AcessoMetodo` quando o objeto acaba sendo uma classe
    // (ver comentário em `visitarExpressaoDeChamada`) — método real da classe (com herança)
    // sempre tem prioridade sobre `extensao` de mesmo nome.
    private async compilarChamadaMetodoDeClasse(objetoExpr: any, nomeClasseObjeto: string, nomeMetodo: string, argumentos: any[]): Promise<string> {
        const ehSuper = objetoExpr instanceof Super;
        const resolvido = this.buscarMetodoComOrigem(nomeClasseObjeto, nomeMetodo);
        if (!resolvido) {
            const infoExtensao = this.extensoes.get(nomeClasseObjeto)?.get(nomeMetodo);
            if (infoExtensao) {
                return await this.compilarChamadaExtensao(objetoExpr, nomeClasseObjeto, infoExtensao, argumentos);
            }
            throw new ErroCompilador(`Método '${nomeMetodo}' não encontrado na classe '${nomeClasseObjeto}'.`);
        }
        const { metodo, nomeClasseOrigem } = resolvido;

        if (objetoExpr instanceof Isto || ehSuper) this.instrucoes.push('aload_0');
        else await objetoExpr.aceitar(this as any);

        await this.compilarArgumentos(argumentos, metodo.parametros, `${nomeClasseObjeto}.${metodo.nomeJvm}`);

        // Despacho virtual (`invokevirtual`) deixa a JVM resolver polimorfismo nativamente;
        // `super.metodo(...)` é a exceção deliberada — precisa de `invokespecial` para não
        // reentrar no override da própria subclasse.
        const instrucaoInvoke = ehSuper ? 'invokespecial' : 'invokevirtual';
        const nomeClasseParaInvoke = ehSuper ? nomeClasseOrigem : nomeClasseObjeto;
        this.instrucoes.push(`${instrucaoInvoke} ${nomeClasseParaInvoke}/${metodo.nomeJvm}${metodo.descritor}`);
        return metodo.tipoRetornoDelegua;
    }

    // Método de `extensao` chamado como `objeto.metodo(args)`: sempre `invokestatic` no
    // `Programa` (nunca despacho virtual — não é um método real de nenhuma classe), com o
    // receptor virando o primeiro argumento (`isto` sintético — ver `registrarExtensoes`).
    private async compilarChamadaExtensao(objetoExpr: any, tipoAlvo: string, info: FuncaoInfo, argumentos: any[]): Promise<string> {
        if (objetoExpr instanceof Isto || objetoExpr instanceof Super) this.instrucoes.push('aload_0');
        else await objetoExpr.aceitar(this as any);

        await this.compilarArgumentos(argumentos, info.parametros.slice(1), `${tipoAlvo}.${info.nomeJvm}`);
        this.instrucoes.push(`invokestatic ${this.nomeClasse}/${info.nomeJvm}${info.descritor}`);
        return info.tipoRetornoDelegua;
    }

    private async compilarChamadaLambda(expressao: Chamada): Promise<string> {
        const variavel = expressao.entidadeChamada as Variavel;
        // `.aceitar()` empilha a referência (variável local ou campo capturado, conforme
        // `visitarExpressaoDeVariavel`) e devolve seu tipo Delégua — que, pra uma função
        // anônima, é o nome da classe auxiliar gerada em `visitarExpressaoFuncaoConstruto`.
        const nomeClasseLambda = (await variavel.aceitar(this as any)) as unknown as string;

        const infoClasseLambda = this.classes.get(nomeClasseLambda);
        const metodo = infoClasseLambda?.metodos.get('invocar');
        if (!metodo) throw new ErroCompilador(`'${variavel.simbolo.lexema}' não é uma função anônima chamável.`);

        await this.compilarArgumentos(expressao.argumentos, metodo.parametros, variavel.simbolo.lexema);
        this.instrucoes.push(`invokevirtual ${nomeClasseLambda}/invocar${metodo.descritor}`);
        return metodo.tipoRetornoDelegua;
    }

    async visitarExpressaoRetornar(declaracao: Retorna): Promise<any> {
        // Dentro de um `para cada` usado como EXPRESSÃO (ou de uma lista por compreensão, que
        // é só açúcar sintático em cima do mesmo mecanismo — ver `visitarExpressaoParaCada`),
        // `retorna` não sai do método: ele "produz" (acumula no vetor resultado) e continua o
        // laço. Usa o contexto mais interno (topo da pilha) — cobre `para cada` aninhado.
        if (this.pilhaAcumulacaoParaCada.length > 0) {
            const contexto = this.pilhaAcumulacaoParaCada[this.pilhaAcumulacaoParaCada.length - 1];
            if (!declaracao.valor) {
                throw new ErroCompilador("'retorna' sem valor dentro de 'para cada' usado como expressão não faz sentido (nada seria acumulado).");
            }
            this.instrucoes.push(`aload ${contexto.slotResultado}`);
            const tipoValor = await declaracao.valor.aceitar(this as any);
            if (contexto.tipoElemento === null) {
                contexto.tipoElemento = tipoValor;
            } else if (contexto.tipoElemento !== tipoValor) {
                if (contexto.tipoElemento === 'numero' && tipoValor === 'inteiro') {
                    this.instrucoes.push('i2d');
                } else {
                    throw new ErroCompilador(
                        `'para cada' como expressão: 'retorna' com tipos incompatíveis ('${contexto.tipoElemento}' e '${tipoValor}') — ` +
                            "todos os 'retorna' do corpo precisam concordar no tipo (a promoção implícita inteiro→numero só funciona se o " +
                            "primeiro 'retorna' encontrado já for 'numero')."
                    );
                }
            }
            this.emitirBoxing(this.mapearTipoJvm(contexto.tipoElemento));
            this.instrucoes.push('invokeinterface java/util/List/add(Ljava/lang/Object;)Z 2');
            this.instrucoes.push('pop');
            this.instrucoes.push(`goto ${contexto.rotuloContinua}`);
            return;
        }

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
                    // Qualquer outro tipo referência (vetor, dicionário, tupla, instância de
                    // classe, expressão regular, função anônima...): usa o overload de
                    // `println(Object)`, que chama o `toString()` padrão do Java.
                    if (this.ehTipoReferencia(this.mapearTipoJvm(tipo))) {
                        this.instrucoes.push('invokevirtual java/io/PrintStream/println(Ljava/lang/Object;)V');
                    } else {
                        throw new ErroCompilador(`Não sabe como escrever valor de tipo '${tipo}'.`);
                    }
            }
        }
    }

    async visitarDeclaracaoClasse(declaracao: Classe): Promise<any> {
        this.verificarSemDecoradores(declaracao, 'classe');
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
        const catchesAnteriores = this.catchesGerados;

        this.instrucoes = [];
        this.variaveis = new Map();
        this.proximoSlot = 1; // slot 0 é `isto`.
        this.tipoRetornoAtual = 'vazio';
        this.classeAtual = info;
        this.catchesGerados = [];

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
            this.formatarCatches() +
            corpoTexto +
            '\n' +
            `.end method\n`;

        this.instrucoes = instrucoesAnteriores;
        this.variaveis = variaveisAnteriores;
        this.proximoSlot = slotAnterior;
        this.tipoRetornoAtual = tipoRetornoAnterior;
        this.classeAtual = classeAnterior;
        this.catchesGerados = catchesAnteriores;

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
        const catchesAnteriores = this.catchesGerados;

        this.instrucoes = [];
        this.variaveis = new Map();
        this.proximoSlot = 1; // slot 0 é `isto`.
        this.tipoRetornoAtual = metodoInfo.tipoRetornoDelegua;
        this.classeAtual = info;
        this.catchesGerados = [];

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
            this.formatarCatches() +
            (corpoTexto ? corpoTexto + '\n' : '') +
            `.end method\n`;

        this.instrucoes = instrucoesAnteriores;
        this.variaveis = variaveisAnteriores;
        this.proximoSlot = slotAnterior;
        this.tipoRetornoAtual = tipoRetornoAnterior;
        this.classeAtual = classeAnterior;
        this.catchesGerados = catchesAnteriores;

        return resultado;
    }

    async visitarExpressaoIsto(expressao: Isto): Promise<string> {
        const localIsto = this.variaveis.get('isto');
        if (localIsto) {
            this.instrucoes.push(this.instrucaoLoad(localIsto.tipoJvm, localIsto.slot));
            return localIsto.tipoDelegua;
        }
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

    async visitarExpressaoAcessoMetodo(expressao: AcessoMetodo): Promise<any> {
        // `AcessoMetodo` só é compilado quando embrulhado numa `Chamada` (ver
        // `visitarExpressaoDeChamada`); referenciar um método sem chamá-lo não é suportado.
        throw new ErroCompilador(`Referência a método sem chamada ('${expressao.nomeMetodo}') não é suportada.`);
    }

    // Dispatch das primitivas de `texto` (`bibliotecas/primitivas-texto.js`). `objetoExpr` é
    // compilado dentro de cada `case` (não antes, de forma genérica) porque a ordem em que a
    // referência precisa entrar na pilha varia por método (`inverter`, por exemplo, precisa
    // do `new StringBuilder` antes do texto).
    private async compilarMetodoTexto(objetoExpr: any, nomeMetodo: string, argumentos: any[]): Promise<string> {
        const tipoRetorno = RETORNOS_METODOS_TEXTO[nomeMetodo];
        if (!tipoRetorno) throw new ErroCompilador(`Método de texto '${nomeMetodo}' não implementado.`);

        const exigirArgTexto = async (indice: number, nomeArg: string): Promise<void> => {
            const tipo = await argumentos[indice].aceitar(this as any);
            if (tipo !== 'texto') throw new ErroCompilador(`'${nomeArg}' de '${nomeMetodo}' precisa ser texto.`);
        };
        const exigirArgInteiro = async (indice: number, nomeArg: string): Promise<void> => {
            const tipo = await argumentos[indice].aceitar(this as any);
            if (tipo !== 'inteiro') throw new ErroCompilador(`'${nomeArg}' de '${nomeMetodo}' precisa ser inteiro.`);
        };

        const SEM_ARGUMENTO: Record<string, string> = {
            aparar: 'invokevirtual java/lang/String/strip()Ljava/lang/String;',
            apararFim: 'invokevirtual java/lang/String/stripTrailing()Ljava/lang/String;',
            apararInicio: 'invokevirtual java/lang/String/stripLeading()Ljava/lang/String;',
            apararInício: 'invokevirtual java/lang/String/stripLeading()Ljava/lang/String;',
            maiusculo: 'invokevirtual java/lang/String/toUpperCase()Ljava/lang/String;',
            maiúsculo: 'invokevirtual java/lang/String/toUpperCase()Ljava/lang/String;',
            minusculo: 'invokevirtual java/lang/String/toLowerCase()Ljava/lang/String;',
            minúsculo: 'invokevirtual java/lang/String/toLowerCase()Ljava/lang/String;',
            tamanho: 'invokevirtual java/lang/String/length()I',
        };

        switch (nomeMetodo) {
            case 'aparar':
            case 'apararFim':
            case 'apararInicio':
            case 'apararInício':
            case 'maiusculo':
            case 'maiúsculo':
            case 'minusculo':
            case 'minúsculo':
            case 'tamanho':
                if (argumentos.length !== 0) throw new ErroCompilador(`'${nomeMetodo}' não recebe argumentos.`);
                await objetoExpr.aceitar(this as any);
                this.instrucoes.push(SEM_ARGUMENTO[nomeMetodo]);
                break;

            case 'tudoMaiusculo':
            case 'tudoMaiúsculo':
            case 'tudoMinusculo':
            case 'tudoMinúsculo': {
                if (argumentos.length !== 0) throw new ErroCompilador(`'${nomeMetodo}' não recebe argumentos.`);
                const slot = this.reservarSlotTemporario('Ljava/lang/String;');
                await objetoExpr.aceitar(this as any);
                this.instrucoes.push(`astore ${slot}`);
                this.instrucoes.push(`aload ${slot}`);
                this.instrucoes.push(`aload ${slot}`);
                const ehMaiusculo = nomeMetodo.startsWith('tudoMai');
                this.instrucoes.push(`invokevirtual java/lang/String/${ehMaiusculo ? 'toUpperCase' : 'toLowerCase'}()Ljava/lang/String;`);
                this.instrucoes.push('invokevirtual java/lang/String/equals(Ljava/lang/Object;)Z');
                break;
            }

            case 'inverter':
                if (argumentos.length !== 0) throw new ErroCompilador("'inverter' não recebe argumentos.");
                this.instrucoes.push('new java/lang/StringBuilder');
                this.instrucoes.push('dup');
                await objetoExpr.aceitar(this as any);
                this.instrucoes.push('invokespecial java/lang/StringBuilder/<init>(Ljava/lang/String;)V');
                this.instrucoes.push('invokevirtual java/lang/StringBuilder/reverse()Ljava/lang/StringBuilder;');
                this.instrucoes.push('invokevirtual java/lang/StringBuilder/toString()Ljava/lang/String;');
                break;

            case 'concatenar':
                await objetoExpr.aceitar(this as any);
                for (let i = 0; i < argumentos.length; i++) {
                    await exigirArgTexto(i, 'outroTexto');
                    this.instrucoes.push('invokevirtual java/lang/String/concat(Ljava/lang/String;)Ljava/lang/String;');
                }
                break;

            case 'inclui':
                if (argumentos.length !== 1) throw new ErroCompilador("'inclui' espera 1 argumento.");
                await objetoExpr.aceitar(this as any);
                await exigirArgTexto(0, 'elemento');
                this.instrucoes.push('invokevirtual java/lang/String/contains(Ljava/lang/CharSequence;)Z');
                break;

            case 'terminaCom':
                if (argumentos.length !== 1) throw new ErroCompilador("'terminaCom' espera 1 argumento.");
                await objetoExpr.aceitar(this as any);
                await exigirArgTexto(0, 'sufixo');
                this.instrucoes.push('invokevirtual java/lang/String/endsWith(Ljava/lang/String;)Z');
                break;

            case 'substituir':
                if (argumentos.length !== 2) throw new ErroCompilador("'substituir' espera 2 argumentos.");
                await objetoExpr.aceitar(this as any);
                await exigirArgTexto(0, 'textoASerSubstituido');
                await exigirArgTexto(1, 'substituto');
                this.instrucoes.push(
                    'invokevirtual java/lang/String/replace(Ljava/lang/CharSequence;Ljava/lang/CharSequence;)Ljava/lang/String;'
                );
                break;

            case 'encontrar':
                if (argumentos.length < 1 || argumentos.length > 2) throw new ErroCompilador("'encontrar' espera 1 ou 2 argumentos.");
                await objetoExpr.aceitar(this as any);
                await exigirArgTexto(0, 'subtexto');
                if (argumentos.length === 2) {
                    await exigirArgInteiro(1, 'indiceInicio');
                    this.instrucoes.push('invokevirtual java/lang/String/indexOf(Ljava/lang/String;I)I');
                } else {
                    this.instrucoes.push('invokevirtual java/lang/String/indexOf(Ljava/lang/String;)I');
                }
                break;

            case 'fatiar':
                if (argumentos.length < 1 || argumentos.length > 2) throw new ErroCompilador("'fatiar' espera 1 ou 2 argumentos.");
                await objetoExpr.aceitar(this as any);
                await exigirArgInteiro(0, 'inicio');
                if (argumentos.length === 2) {
                    await exigirArgInteiro(1, 'fim');
                    this.instrucoes.push('invokevirtual java/lang/String/substring(II)Ljava/lang/String;');
                } else {
                    this.instrucoes.push('invokevirtual java/lang/String/substring(I)Ljava/lang/String;');
                }
                break;

            case 'subtexto':
                if (argumentos.length !== 2) throw new ErroCompilador("'subtexto' espera 2 argumentos.");
                await objetoExpr.aceitar(this as any);
                await exigirArgInteiro(0, 'inicio');
                await exigirArgInteiro(1, 'fim');
                this.instrucoes.push('invokevirtual java/lang/String/substring(II)Ljava/lang/String;');
                break;

            case 'dividir': {
                if (argumentos.length < 1 || argumentos.length > 2) throw new ErroCompilador("'dividir' espera 1 ou 2 argumentos.");
                const slotArray = this.reservarSlotTemporario('[Ljava/lang/String;');
                await objetoExpr.aceitar(this as any);
                await exigirArgTexto(0, 'delimitador');
                if (argumentos.length === 2) {
                    await exigirArgInteiro(1, 'limite');
                    this.instrucoes.push('invokevirtual java/lang/String/split(Ljava/lang/String;I)[Ljava/lang/String;');
                } else {
                    this.instrucoes.push('invokevirtual java/lang/String/split(Ljava/lang/String;)[Ljava/lang/String;');
                }
                this.instrucoes.push(`astore ${slotArray}`);
                this.instrucoes.push('new java/util/ArrayList');
                this.instrucoes.push('dup');
                this.instrucoes.push(`aload ${slotArray}`);
                this.instrucoes.push('invokestatic java/util/Arrays/asList([Ljava/lang/Object;)Ljava/util/List;');
                this.instrucoes.push('invokespecial java/util/ArrayList/<init>(Ljava/util/Collection;)V');
                break;
            }

            case 'particao':
            case 'partição':
                if (argumentos.length !== 1) throw new ErroCompilador(`'${nomeMetodo}' espera 1 argumento.`);
                await this.compilarParticao(objetoExpr, argumentos[0]);
                break;

            default:
                throw new ErroCompilador(`Método de texto '${nomeMetodo}' não implementado.`);
        }

        return tipoRetorno;
    }

    // `texto.particao(separador)` -> `tupla<texto,texto,texto>` = [antes, separador (ou vazio), depois].
    // Se o separador não é encontrado no texto: [texto, "", ""] (mesma semântica do
    // `implementacaoParticao` do interpretador, em `bibliotecas/primitivas-texto.js`).
    private async compilarParticao(objetoExpr: any, separadorExpr: any): Promise<void> {
        const slotTexto = this.reservarSlotTemporario('Ljava/lang/String;');
        const slotSeparador = this.reservarSlotTemporario('Ljava/lang/String;');
        const slotIndice = this.reservarSlotTemporario('I');

        await objetoExpr.aceitar(this as any);
        this.instrucoes.push(`astore ${slotTexto}`);
        const tipoSeparador = await separadorExpr.aceitar(this as any);
        if (tipoSeparador !== 'texto') throw new ErroCompilador("'separador' de 'particao' precisa ser texto.");
        this.instrucoes.push(`astore ${slotSeparador}`);

        this.instrucoes.push(`aload ${slotTexto}`);
        this.instrucoes.push(`aload ${slotSeparador}`);
        this.instrucoes.push('invokevirtual java/lang/String/indexOf(Ljava/lang/String;)I');
        this.instrucoes.push(`istore ${slotIndice}`);

        const rotuloNaoEncontrado = this.gerarRotulo('Lparticao_naoencontrado');
        const rotuloFim = this.gerarRotulo('Lparticao_fim');

        this.instrucoes.push(`iload ${slotIndice}`);
        this.instrucoes.push('iconst_m1');
        this.instrucoes.push(`if_icmpeq ${rotuloNaoEncontrado}`);

        this.instrucoes.push('ldc 3');
        this.instrucoes.push('anewarray java/lang/Object');

        this.instrucoes.push('dup');
        this.instrucoes.push('iconst_0');
        this.instrucoes.push(`aload ${slotTexto}`);
        this.instrucoes.push('iconst_0');
        this.instrucoes.push(`iload ${slotIndice}`);
        this.instrucoes.push('invokevirtual java/lang/String/substring(II)Ljava/lang/String;');
        this.instrucoes.push('aastore');

        this.instrucoes.push('dup');
        this.instrucoes.push('iconst_1');
        this.instrucoes.push(`aload ${slotSeparador}`);
        this.instrucoes.push('aastore');

        this.instrucoes.push('dup');
        this.instrucoes.push('iconst_2');
        this.instrucoes.push(`aload ${slotTexto}`);
        this.instrucoes.push(`iload ${slotIndice}`);
        this.instrucoes.push(`aload ${slotSeparador}`);
        this.instrucoes.push('invokevirtual java/lang/String/length()I');
        this.instrucoes.push('iadd');
        this.instrucoes.push(`aload ${slotTexto}`);
        this.instrucoes.push('invokevirtual java/lang/String/length()I');
        this.instrucoes.push('invokevirtual java/lang/String/substring(II)Ljava/lang/String;');
        this.instrucoes.push('aastore');

        this.instrucoes.push(`goto ${rotuloFim}`);

        this.instrucoes.push(`${rotuloNaoEncontrado}:`);
        this.instrucoes.push('ldc 3');
        this.instrucoes.push('anewarray java/lang/Object');
        this.instrucoes.push('dup');
        this.instrucoes.push('iconst_0');
        this.instrucoes.push(`aload ${slotTexto}`);
        this.instrucoes.push('aastore');
        this.instrucoes.push('dup');
        this.instrucoes.push('iconst_1');
        this.instrucoes.push('ldc ""');
        this.instrucoes.push('aastore');
        this.instrucoes.push('dup');
        this.instrucoes.push('iconst_2');
        this.instrucoes.push('ldc ""');
        this.instrucoes.push('aastore');

        this.instrucoes.push(`${rotuloFim}:`);
    }

    // `FormatacaoEscrita` (espaçamento/casas decimais em `escreva`) não é alcançável pelo
    // parser atual (nenhuma ocorrência de `new construtos_1.FormatacaoEscrita` em
    // avaliador-sintatico.js) — implementado defensivamente via `String.format`.
    async visitarExpressaoFormatacaoEscrita(expressao: FormatacaoEscrita): Promise<string> {
        const tipoExpressao = this.resolverTipoConstruto(expressao.expressao);
        // O construto usa `-1` como sentinela de "não informado" (`espacos || -1` no próprio
        // construtor de `FormatacaoEscrita`), não `undefined`.
        const temCasasDecimais = expressao.casasDecimais !== undefined && expressao.casasDecimais !== null && expressao.casasDecimais >= 0;
        const temEspacos = expressao.espacos !== undefined && expressao.espacos !== null && expressao.espacos >= 0;

        if (!temCasasDecimais && !temEspacos) {
            await expressao.expressao.aceitar(this as any);
            this.converterParaTexto(tipoExpressao);
            return 'texto';
        }

        if (temCasasDecimais && tipoExpressao !== 'numero' && tipoExpressao !== 'inteiro') {
            throw new ErroCompilador("'casasDecimais' de formatação de escrita só se aplica a números.");
        }

        const especificador = temCasasDecimais
            ? `%${temEspacos ? expressao.espacos : ''}.${expressao.casasDecimais}f`
            : `%${expressao.espacos}s`;

        this.instrucoes.push(`ldc "${especificador}"`);
        this.instrucoes.push('iconst_1');
        this.instrucoes.push('anewarray java/lang/Object');
        this.instrucoes.push('dup');
        this.instrucoes.push('iconst_0');
        await expressao.expressao.aceitar(this as any);
        if (temCasasDecimais) {
            if (tipoExpressao === 'inteiro') this.instrucoes.push('i2d');
            this.emitirBoxing('D');
        } else {
            this.converterParaTexto(tipoExpressao);
        }
        this.instrucoes.push('aastore');
        this.instrucoes.push('invokestatic java/lang/String/format(Ljava/lang/String;[Ljava/lang/Object;)Ljava/lang/String;');
        return 'texto';
    }

    // `funcao(params) {...}` como expressão (não uma declaração `funcao nome(...)`): vira uma
    // classe auxiliar ("Lambda0", "Lambda1", ...) com um campo por variável capturada e um
    // método `invocar` — mesma ideia de uma classe de usuário comum (reaproveita `this.classes`,
    // `buscarCampoComOrigem` etc.), só que gerada pelo compilador em vez de escrita pelo
    // programador. Tipagem nominal: o "tipo" Delégua do valor resultante É o nome da classe
    // auxiliar, então uma variável não pode trocar de uma lambda pra outra estruturalmente
    // diferente (mesma limitação de qualquer variável tipada por classe neste compilador) — e
    // não há como declarar um parâmetro de função com "tipo de função", já que não existe
    // anotação de tipo em Delégua pra apontar pra uma classe auxiliar gerada pelo compilador.
    // Ver PLAN.md para o racional completo (funções de ordem superior genéricas não são
    // suportadas por causa disso).
    async visitarExpressaoFuncaoConstruto(expressao: FuncaoConstruto): Promise<string> {
        const nomeClasse = `Lambda${this.proximoIdLambda++}`;

        const nomesParametros = new Set(expressao.parametros.map((parametro) => parametro.nome.lexema));
        const nomesDeclaradosLocalmente = new Set<string>();
        this.coletarNomesDeclaradosLocalmente(expressao.corpo, nomesDeclaradosLocalmente);
        const nomesReferenciados = new Set<string>();
        this.coletarNomesDeVariaveisReferenciadas(expressao.corpo, nomesReferenciados);

        const nomesCapturados = [...nomesReferenciados].filter(
            (nome) => !nomesParametros.has(nome) && !nomesDeclaradosLocalmente.has(nome) && this.variaveis.has(nome)
        );

        const parametrosLambda: ParametroFuncao[] = expressao.parametros.map((parametro) => {
            if (!parametro.tipoDado) {
                throw new ErroCompilador(`Parâmetro '${parametro.nome.lexema}' de função anônima precisa de tipo explícito.`);
            }
            const tipoDelegua = this.normalizarTipo(parametro.tipoDado);
            return { nome: parametro.nome.lexema, tipoDelegua, tipoJvm: this.mapearTipoJvm(tipoDelegua) };
        });

        const tipoRetornoBruto = expressao.tipo || 'vazio';
        if (tipoRetornoBruto === 'qualquer') {
            throw new ErroCompilador('Função anônima precisa de tipo de retorno explícito.');
        }
        const tipoRetornoDelegua = tipoRetornoBruto === 'vazio' ? 'vazio' : this.normalizarTipo(tipoRetornoBruto);
        const tipoRetornoJvm = tipoRetornoDelegua === 'vazio' ? 'V' : this.mapearTipoJvm(tipoRetornoDelegua);
        const descritorInvocar = `(${parametrosLambda.map((parametro) => parametro.tipoJvm).join('')})${tipoRetornoJvm}`;

        const campos = new Map<string, InfoCampo>();
        for (const nome of nomesCapturados) {
            const local = this.variaveis.get(nome)!;
            campos.set(nome, { nome, tipoDelegua: local.tipoDelegua, tipoJvm: local.tipoJvm });
        }
        const construtorParametros: ParametroFuncao[] = nomesCapturados.map((nome) => {
            const campo = campos.get(nome)!;
            return { nome: campo.nome, tipoDelegua: campo.tipoDelegua, tipoJvm: campo.tipoJvm };
        });
        const descritorConstrutor = `(${construtorParametros.map((parametro) => parametro.tipoJvm).join('')})V`;

        const info: InfoClasse = {
            nome: nomeClasse,
            nomeJvmSuper: 'java/lang/Object',
            campos,
            metodos: new Map([
                ['invocar', { nomeJvm: 'invocar', parametros: parametrosLambda, tipoRetornoDelegua, tipoRetornoJvm, descritor: descritorInvocar }],
            ]),
            construtor: { nomeJvm: '<init>', parametros: construtorParametros, tipoRetornoDelegua: 'vazio', tipoRetornoJvm: 'V', descritor: descritorConstrutor },
        };
        this.classes.set(nomeClasse, info);

        const construtorTexto = this.compilarConstrutorLambda(info);
        const invocarTexto = await this.compilarMetodoLambda(info, expressao.corpo, parametrosLambda);
        const camposTexto = Array.from(campos.values())
            .map((campo) => `.field private final ${campo.nome} ${campo.tipoJvm}`)
            .join('\n');
        const classeTexto =
            `.class public ${nomeClasse}\n` +
            `.super java/lang/Object\n\n` +
            (camposTexto ? camposTexto + '\n\n' : '') +
            construtorTexto +
            '\n' +
            invocarTexto;
        this.classesGeradas.set(nomeClasse, classeTexto);

        // Instancia no ponto de definição: `new Lambda0; dup; <capturas>; invokespecial <init>`.
        // As capturas são lidas da pilha de variáveis do escopo ENVOLVENTE (ainda não trocamos
        // pra dentro da lambda) — por isso `iload`/`aload` direto no slot, sem passar por
        // `visitarExpressaoDeVariavel`.
        this.instrucoes.push(`new ${nomeClasse}`);
        this.instrucoes.push('dup');
        for (const nome of nomesCapturados) {
            const local = this.variaveis.get(nome)!;
            if (local.tipoJvm === 'D') this.instrucoes.push(`dload ${local.slot}`);
            else if (this.ehTipoReferencia(local.tipoJvm)) this.instrucoes.push(`aload ${local.slot}`);
            else this.instrucoes.push(`iload ${local.slot}`);
        }
        this.instrucoes.push(`invokespecial ${nomeClasse}/<init>${descritorConstrutor}`);

        return nomeClasse;
    }

    private compilarConstrutorLambda(info: InfoClasse): string {
        const instrucoes: string[] = ['aload_0', 'invokespecial java/lang/Object/<init>()V'];
        let slot = 1;
        for (const parametro of info.construtor!.parametros) {
            instrucoes.push('aload_0');
            if (parametro.tipoJvm === 'D') instrucoes.push(`dload ${slot}`);
            else if (this.ehTipoReferencia(parametro.tipoJvm)) instrucoes.push(`aload ${slot}`);
            else instrucoes.push(`iload ${slot}`);
            instrucoes.push(`putfield ${info.nome}/${parametro.nome} ${parametro.tipoJvm}`);
            slot += parametro.tipoJvm === 'D' ? 2 : 1;
        }
        instrucoes.push('return');

        const corpoTexto = instrucoes.map((instrucao) => `        ${instrucao}`).join('\n');
        return (
            `.method public <init>${info.construtor!.descritor}\n` +
            `    .limit stack 32\n` +
            `    .limit locals ${slot}\n` +
            corpoTexto +
            '\n' +
            `.end method\n`
        );
    }

    private async compilarMetodoLambda(info: InfoClasse, corpo: Declaracao[], parametros: ParametroFuncao[]): Promise<string> {
        const metodoInfo = info.metodos.get('invocar')!;

        const instrucoesAnteriores = this.instrucoes;
        const variaveisAnteriores = this.variaveis;
        const slotAnterior = this.proximoSlot;
        const tipoRetornoAnterior = this.tipoRetornoAtual;
        const classeAnterior = this.classeAtual;
        const catchesAnteriores = this.catchesGerados;

        this.instrucoes = [];
        this.variaveis = new Map();
        this.proximoSlot = 1; // slot 0 é a própria instância da lambda (equivalente a `isto`).
        this.tipoRetornoAtual = metodoInfo.tipoRetornoDelegua;
        this.classeAtual = info;
        this.catchesGerados = [];

        for (const parametro of parametros) {
            const slot = this.proximoSlot;
            this.proximoSlot += parametro.tipoJvm === 'D' ? 2 : 1;
            this.variaveis.set(parametro.nome, { slot, tipoJvm: parametro.tipoJvm, tipoDelegua: parametro.tipoDelegua });
        }

        for (const decl of corpo) {
            await decl.aceitar(this as any);
        }
        if (metodoInfo.tipoRetornoJvm === 'V') this.instrucoes.push('return');

        const corpoTexto = this.instrucoes.map((instrucao) => `        ${instrucao}`).join('\n');
        const resultado =
            `.method public ${metodoInfo.nomeJvm}${metodoInfo.descritor}\n` +
            `    .limit stack 32\n` +
            `    .limit locals ${this.proximoSlot}\n` +
            this.formatarCatches() +
            (corpoTexto ? corpoTexto + '\n' : '') +
            `.end method\n`;

        this.instrucoes = instrucoesAnteriores;
        this.variaveis = variaveisAnteriores;
        this.proximoSlot = slotAnterior;
        this.tipoRetornoAtual = tipoRetornoAnterior;
        this.catchesGerados = catchesAnteriores;
        this.classeAtual = classeAnterior;

        return resultado;
    }

    // Análise de captura simplificada: percorre genericamente todos os campos do construto/
    // declaração (em vez de manter uma lista manual por tipo de nó, que ficaria desatualizada
    // a cada novo construto suportado). Limitação conhecida: não delimita o escopo de uma
    // função anônima ANINHADA dentro do corpo — nomes locais/parâmetros da lambda interna
    // entram nos conjuntos da externa também. Fechos aninhados com nomes repetidos podem
    // capturar errado; não é um caso comum, documentado em PLAN.md.
    private coletarNomesDeVariaveisReferenciadas(no: any, coletados: Set<string>): void {
        if (no === null || typeof no !== 'object') return;
        if (Array.isArray(no)) {
            for (const item of no) this.coletarNomesDeVariaveisReferenciadas(item, coletados);
            return;
        }
        if (no instanceof Variavel) {
            coletados.add(no.simbolo.lexema);
            return;
        }
        for (const chave of Object.keys(no)) {
            this.coletarNomesDeVariaveisReferenciadas(no[chave], coletados);
        }
    }

    private coletarNomesDeclaradosLocalmente(no: any, coletados: Set<string>): void {
        if (no === null || typeof no !== 'object') return;
        if (Array.isArray(no)) {
            for (const item of no) this.coletarNomesDeclaradosLocalmente(item, coletados);
            return;
        }
        if (no instanceof Var) {
            coletados.add(no.simbolo.lexema);
        }
        for (const chave of Object.keys(no)) {
            this.coletarNomesDeclaradosLocalmente(no[chave], coletados);
        }
    }

    // `falhar <expressao>`: só suporta lançar um valor primitivo (convertido pra texto e
    // embrulhado numa `RuntimeException` — é o único tipo de exceção que este compilador
    // modela). Lançar uma instância de classe do usuário como exceção não é suportado ainda.
    async visitarExpressaoFalhar(declaracao: Falhar): Promise<any> {
        this.instrucoes.push('new java/lang/RuntimeException');
        this.instrucoes.push('dup');
        const tipoExplicacao = await declaracao.explicacao.aceitar(this as any);
        this.converterParaTexto(tipoExplicacao);
        this.instrucoes.push('invokespecial java/lang/RuntimeException/<init>(Ljava/lang/String;)V');
        this.instrucoes.push('athrow');
    }

    // `tente { } pegue (param?) { } senao { } finalmente { }`. Modelo simplificado: só existe
    // um "tipo" de exceção na JVM gerada (`java/lang/RuntimeException`, o que `falhar` lança),
    // então só um bloco `pegue` faz sentido (múltiplos `pegue` com o mesmo tipo nunca
    // alcançariam o segundo em diante) — `tipoExcecao` anotado no `pegue` é ignorado. O
    // parâmetro capturado (se houver) é ligado à MENSAGEM da exceção (`getMessage()`), sempre
    // como `texto`, já que não há uma "classe de exceção" navegável no modelo atual.
    //
    // `finalmente` é duplicado nos dois pontos de saída normais (sucesso/`senao` e catch
    // tratado) e tem um terceiro handler `catch Throwable` cobrindo tanto o `tente` quanto o
    // `pegue`, que roda o `finalmente` e relança — garantindo que ele rode mesmo se a exceção
    // não for capturada (ou não houver `pegue` nenhum). Limitação conhecida: um `retorna`
    // dentro do `tente`/`pegue` sai direto (ireturn/dreturn/areturn/return) sem passar pelo
    // `finalmente` — replicar o `finalmente` antes de cada `retorna` interno exigiria rastrear
    // "estou dentro de um tente com finalmente" em `visitarExpressaoRetornar`, não implementado
    // nesta fase.
    async visitarDeclaracaoTente(declaracao: Tente): Promise<any> {
        if (declaracao.caminhoPegue.length > 1) {
            throw new ErroCompilador(
                "Múltiplos blocos 'pegue' num único 'tente' ainda não são suportados (só há um tipo de exceção mapeado hoje)."
            );
        }

        const temPegue = declaracao.caminhoPegue.length === 1;
        const temSenao = !!declaracao.caminhoSenao && declaracao.caminhoSenao.length > 0;
        const temFinalmente = !!declaracao.caminhoFinalmente && declaracao.caminhoFinalmente.length > 0;

        const rotuloTenteInicio = this.gerarRotulo('Ltente_inicio');
        const rotuloTenteFim = this.gerarRotulo('Ltente_fim');
        const rotuloPegueInicio = this.gerarRotulo('Lpegue_inicio');
        const rotuloSenaoOuFim = this.gerarRotulo('Ltente_senao');
        const rotuloFinal = this.gerarRotulo('Ltente_final');
        const rotuloFinalmenteExcecao = temFinalmente ? this.gerarRotulo('Lfinalmente_excecao') : null;

        this.instrucoes.push(`${rotuloTenteInicio}:`);
        for (const decl of declaracao.caminhoTente) {
            await decl.aceitar(this as any);
        }
        this.instrucoes.push(`${rotuloTenteFim}:`);
        this.instrucoes.push(`goto ${rotuloSenaoOuFim}`);

        if (temPegue) {
            const blocoPegue = declaracao.caminhoPegue[0];
            this.instrucoes.push(`${rotuloPegueInicio}:`);
            const slotExcecao = this.reservarSlotTemporario('Ljava/lang/RuntimeException;');
            this.instrucoes.push(`astore ${slotExcecao}`);
            if (blocoPegue.parametro) {
                const slotParametro = this.reservarSlotTemporario('Ljava/lang/String;');
                this.instrucoes.push(`aload ${slotExcecao}`);
                this.instrucoes.push('invokevirtual java/lang/RuntimeException/getMessage()Ljava/lang/String;');
                this.instrucoes.push(`astore ${slotParametro}`);
                this.variaveis.set(blocoPegue.parametro.lexema, {
                    slot: slotParametro,
                    tipoJvm: 'Ljava/lang/String;',
                    tipoDelegua: 'texto',
                });
            }
            for (const decl of blocoPegue.corpo) {
                await decl.aceitar(this as any);
            }
            this.instrucoes.push(`goto ${rotuloFinal}`);
            this.catchesGerados.push(`.catch java/lang/RuntimeException from ${rotuloTenteInicio} to ${rotuloTenteFim} using ${rotuloPegueInicio}`);
        }

        this.instrucoes.push(`${rotuloSenaoOuFim}:`);
        if (temSenao) {
            for (const decl of declaracao.caminhoSenao) {
                await decl.aceitar(this as any);
            }
        }
        this.instrucoes.push(`goto ${rotuloFinal}`);

        if (temFinalmente) {
            this.instrucoes.push(`${rotuloFinalmenteExcecao}:`);
            const slotExcecaoRelancar = this.reservarSlotTemporario('Ljava/lang/Throwable;');
            this.instrucoes.push(`astore ${slotExcecaoRelancar}`);
            for (const decl of declaracao.caminhoFinalmente) {
                await decl.aceitar(this as any);
            }
            this.instrucoes.push(`aload ${slotExcecaoRelancar}`);
            this.instrucoes.push('athrow');
            // Cobre `tente` + `pegue` (nessa ordem no texto): se qualquer um dos dois lançar
            // algo que não seja pego antes, o `finalmente` roda e a exceção original relança.
            this.catchesGerados.push(
                `.catch java/lang/Throwable from ${rotuloTenteInicio} to ${rotuloFinalmenteExcecao} using ${rotuloFinalmenteExcecao}`
            );
        }

        this.instrucoes.push(`${rotuloFinal}:`);
        if (temFinalmente) {
            for (const decl of declaracao.caminhoFinalmente) {
                await decl.aceitar(this as any);
            }
        }
    }

    // A resolução de verdade (ler o arquivo, parsear, registrar/compilar funções e classes)
    // já aconteceu antes de qualquer coisa, em `resolverImportacoes` (chamado no início de
    // `compilar()`). Quando a declaração `importar` chega até aqui, no laço normal de
    // compilação do arquivo principal, não sobra nada a fazer.
    async visitarDeclaracaoImportar(declaracao: Importar): Promise<any> {}

    // ===== Biblioteca global (Fase 10) =====
    // Cada função é um intrínseco do compilador: gera bytecode direto no call site (sem
    // `invokestatic` pra um método real em algum lugar), o que é o que permite usar funções
    // anônimas como callback aqui mesmo com a limitação de tipagem nominal da Fase 7 (o
    // compilador conhece a classe Lambda concreta bem ali, no site da chamada).

    private instrucaoStore(tipoJvm: string, slot: number): string {
        if (tipoJvm === 'D') return `dstore ${slot}`;
        if (this.ehTipoReferencia(tipoJvm)) return `astore ${slot}`;
        return `istore ${slot}`;
    }

    private instrucaoLoad(tipoJvm: string, slot: number): string {
        if (tipoJvm === 'D') return `dload ${slot}`;
        if (this.ehTipoReferencia(tipoJvm)) return `aload ${slot}`;
        return `iload ${slot}`;
    }

    private async compilarChamadaBiblioteca(nomeCanonico: string, argumentos: any[]): Promise<string> {
        switch (nomeCanonico) {
            case 'aleatorio':
                return await this.compilarAleatorio(argumentos);
            case 'aleatorioEntre':
                return await this.compilarAleatorioEntre(argumentos);
            case 'arredondar':
                return await this.compilarArredondar(argumentos);
            case 'inteiro':
                return await this.compilarConverterInteiro(argumentos);
            case 'numero':
            case 'real':
                return await this.compilarConverterNumero(argumentos);
            case 'texto':
                return await this.compilarConverterTexto(argumentos);
            case 'longo':
                throw new ErroCompilador("'longo' (BigInt) não é suportado — este compilador não modela inteiros de precisão arbitrária.");
            case 'tamanho':
                return await this.compilarTamanho(argumentos);
            case 'maximo':
                return await this.compilarMaximoOuMinimo(argumentos, true);
            case 'minimo':
                return await this.compilarMaximoOuMinimo(argumentos, false);
            case 'somar':
                return await this.compilarSomar(argumentos);
            case 'ordenar':
                return await this.compilarOrdenar(argumentos);
            case 'intervalo':
                return await this.compilarIntervalo(argumentos);
            case 'incluido':
                return await this.compilarIncluido(argumentos);
            case 'clonar':
                return await this.compilarClonar(argumentos);
            case 'vetor':
                return await this.compilarVetorDeTupla(argumentos);
            case 'tupla':
                throw new ErroCompilador(
                    "'tupla(vetor)' não é suportado: a aridade de uma tupla precisa ser conhecida em tempo de compilação, e 'vetor' tem tamanho dinâmico."
                );
            case 'mapear':
                return await this.compilarMapear(argumentos);
            case 'filtrarPor':
                return await this.compilarFiltrarPor(argumentos);
            case 'paraCada':
                return await this.compilarParaCada(argumentos);
            case 'algum':
                return await this.compilarAlgumOuTodosEmCondicao(argumentos, 'algum', true);
            case 'todosEmCondicao':
                return await this.compilarAlgumOuTodosEmCondicao(argumentos, 'todosEmCondicao', false);
            case 'todos':
                return await this.compilarTodos(argumentos);
            case 'encontrar':
                return await this.compilarEncontrar(argumentos, 'encontrar', false);
            case 'encontrarUltimo':
                return await this.compilarEncontrar(argumentos, 'encontrarUltimo', true);
            case 'primeiroEmCondicao':
                return await this.compilarEncontrar(argumentos, 'primeiroEmCondicao', false);
            case 'encontrarIndice':
                return await this.compilarEncontrarIndice(argumentos, 'encontrarIndice', false);
            case 'encontrarUltimoIndice':
                return await this.compilarEncontrarIndice(argumentos, 'encontrarUltimoIndice', true);
            case 'reduzir':
                return await this.compilarReduzir(argumentos);
            default:
                throw new ErroCompilador(`Função nativa '${nomeCanonico}' não implementada.`);
        }
    }

    private async compilarAleatorio(argumentos: any[]): Promise<string> {
        if (argumentos.length !== 0) throw new ErroCompilador("'aleatorio' não recebe argumentos.");
        this.instrucoes.push('invokestatic java/lang/Math/random()D');
        return 'numero';
    }

    private async compilarAleatorioEntre(argumentos: any[]): Promise<string> {
        if (argumentos.length !== 2) throw new ErroCompilador("'aleatorioEntre' espera 2 argumentos.");
        const exigirNumero = async (expressao: any): Promise<void> => {
            const tipo = await expressao.aceitar(this as any);
            if (tipo === 'inteiro') this.instrucoes.push('i2d');
            else if (tipo !== 'numero') throw new ErroCompilador("'aleatorioEntre' espera argumentos inteiro/numero.");
        };

        const slotMinimo = this.reservarSlotTemporario('D');
        await exigirNumero(argumentos[0]);
        this.instrucoes.push(`dstore ${slotMinimo}`);
        const slotMaximo = this.reservarSlotTemporario('D');
        await exigirNumero(argumentos[1]);
        this.instrucoes.push(`dstore ${slotMaximo}`);

        // minimo + Math.random() * (maximo - minimo)
        this.instrucoes.push(`dload ${slotMinimo}`);
        this.instrucoes.push('invokestatic java/lang/Math/random()D');
        this.instrucoes.push(`dload ${slotMaximo}`);
        this.instrucoes.push(`dload ${slotMinimo}`);
        this.instrucoes.push('dsub');
        this.instrucoes.push('dmul');
        this.instrucoes.push('dadd');

        return 'numero';
    }

    private async compilarArredondar(argumentos: any[]): Promise<string> {
        if (argumentos.length !== 2) throw new ErroCompilador("'arredondar' espera 2 argumentos.");
        const tipoNumero = await argumentos[0].aceitar(this as any);
        if (tipoNumero === 'inteiro') this.instrucoes.push('i2d');
        else if (tipoNumero !== 'numero') throw new ErroCompilador("'numero' de 'arredondar' precisa ser inteiro/numero.");
        const slotNumero = this.reservarSlotTemporario('D');
        this.instrucoes.push(`dstore ${slotNumero}`);

        const tipoCasas = await argumentos[1].aceitar(this as any);
        if (tipoCasas !== 'inteiro') throw new ErroCompilador("'casasDecimais' de 'arredondar' precisa ser inteiro.");
        const slotCasas = this.reservarSlotTemporario('I');
        this.instrucoes.push(`istore ${slotCasas}`);

        const slotMultiplicador = this.reservarSlotTemporario('D');
        this.instrucoes.push('ldc2_w 10.0');
        this.instrucoes.push(`iload ${slotCasas}`);
        this.instrucoes.push('i2d');
        this.instrucoes.push('invokestatic java/lang/Math/pow(DD)D');
        this.instrucoes.push(`dstore ${slotMultiplicador}`);

        this.instrucoes.push(`dload ${slotNumero}`);
        this.instrucoes.push(`dload ${slotMultiplicador}`);
        this.instrucoes.push('dmul');
        this.instrucoes.push('invokestatic java/lang/Math/round(D)J');
        this.instrucoes.push('l2d');
        this.instrucoes.push(`dload ${slotMultiplicador}`);
        this.instrucoes.push('ddiv');

        return 'numero';
    }

    private async compilarConverterInteiro(argumentos: any[]): Promise<string> {
        if (argumentos.length !== 1) throw new ErroCompilador("'inteiro' espera 1 argumento.");
        const tipoValor = await argumentos[0].aceitar(this as any);
        switch (tipoValor) {
            case 'inteiro':
                break;
            case 'numero':
                this.instrucoes.push('d2i');
                break;
            case 'texto':
                this.instrucoes.push('invokestatic java/lang/Integer/parseInt(Ljava/lang/String;)I');
                break;
            default:
                throw new ErroCompilador(`'inteiro' não sabe converter valor de tipo '${tipoValor}'.`);
        }
        return 'inteiro';
    }

    private async compilarConverterNumero(argumentos: any[]): Promise<string> {
        if (argumentos.length !== 1) throw new ErroCompilador("'numero'/'real' espera 1 argumento.");
        const tipoValor = await argumentos[0].aceitar(this as any);
        switch (tipoValor) {
            case 'inteiro':
                this.instrucoes.push('i2d');
                break;
            case 'numero':
                break;
            case 'texto':
                this.instrucoes.push('invokestatic java/lang/Double/parseDouble(Ljava/lang/String;)D');
                break;
            default:
                throw new ErroCompilador(`'numero' não sabe converter valor de tipo '${tipoValor}'.`);
        }
        return 'numero';
    }

    private async compilarConverterTexto(argumentos: any[]): Promise<string> {
        if (argumentos.length !== 1) throw new ErroCompilador("'texto' espera 1 argumento.");
        const tipoValor = await argumentos[0].aceitar(this as any);
        if (tipoValor === 'inteiro' || tipoValor === 'numero' || tipoValor === 'logico' || tipoValor === 'texto') {
            this.converterParaTexto(tipoValor);
        } else {
            // Qualquer outra referência (vetor, dicionário, tupla, instância de classe): usa
            // Object.toString() via String.valueOf(Object) — ArrayList/HashMap já têm toString()
            // legível; instância de classe do usuário usa o toString() padrão do Object
            // (endereço/hash), já que não há suporte a sobrescrever toString() aqui.
            this.instrucoes.push('invokestatic java/lang/String/valueOf(Ljava/lang/Object;)Ljava/lang/String;');
        }
        return 'texto';
    }

    private async compilarTamanho(argumentos: any[]): Promise<string> {
        if (argumentos.length !== 1) throw new ErroCompilador("'tamanho' espera 1 argumento.");
        const tipoObjeto = this.resolverTipoConstruto(argumentos[0]);
        if (tipoObjeto.startsWith('tupla<')) {
            // Aridade da tupla é conhecida em tempo de compilação — nem precisa avaliar a
            // expressão em si, mas avalia (e descarta) mesmo assim, preservando efeitos colaterais.
            await this.emitirComoDeclaracaoDeExpressao(argumentos[0]);
            this.instrucoes.push(`ldc ${this.dividirTiposTupla(tipoObjeto).length}`);
            return 'inteiro';
        }
        await argumentos[0].aceitar(this as any);
        if (tipoObjeto.endsWith('[]')) {
            this.instrucoes.push('invokevirtual java/util/ArrayList/size()I');
        } else if (tipoObjeto === 'texto') {
            this.instrucoes.push('invokevirtual java/lang/String/length()I');
        } else if (tipoObjeto.startsWith('dicionario<')) {
            this.instrucoes.push('invokevirtual java/util/HashMap/size()I');
        } else {
            throw new ErroCompilador(`'tamanho' não implementado para o tipo '${tipoObjeto}'.`);
        }
        return 'inteiro';
    }

    private async compilarMaximoOuMinimo(argumentos: any[], maior: boolean): Promise<string> {
        const nomeFuncao = maior ? 'maximo' : 'minimo';
        if (argumentos.length !== 1) throw new ErroCompilador(`'${nomeFuncao}' espera 1 argumento.`);
        const { slotOrigem, tipoElemento, tipoJvmElemento, slotIndice, slotTamanho } = await this.prepararLacoSobreVetor(argumentos[0]);
        if (tipoElemento !== 'inteiro' && tipoElemento !== 'numero') {
            throw new ErroCompilador(`'${nomeFuncao}' só é suportado em vetor de inteiro/numero (tipo '${tipoElemento}[]' não suportado).`);
        }

        const slotResultado = this.reservarSlotTemporario(tipoJvmElemento);
        this.emitirElementoAtual(slotOrigem, slotIndice, tipoJvmElemento);
        this.instrucoes.push(this.instrucaoStore(tipoJvmElemento, slotResultado));
        this.instrucoes.push('iconst_1');
        this.instrucoes.push(`istore ${slotIndice}`);

        const slotElementoAtual = this.reservarSlotTemporario(tipoJvmElemento);
        const rotuloInicio = this.gerarRotulo(`L${nomeFuncao}_inicio`);
        const rotuloSemTroca = this.gerarRotulo(`L${nomeFuncao}_sememtroca`);
        const rotuloFim = this.gerarRotulo(`L${nomeFuncao}_fim`);
        this.instrucoes.push(`${rotuloInicio}:`);
        this.instrucoes.push(`iload ${slotIndice}`);
        this.instrucoes.push(`iload ${slotTamanho}`);
        this.instrucoes.push(`if_icmpge ${rotuloFim}`);

        this.emitirElementoAtual(slotOrigem, slotIndice, tipoJvmElemento);
        this.instrucoes.push(this.instrucaoStore(tipoJvmElemento, slotElementoAtual));

        if (tipoJvmElemento === 'D') {
            this.instrucoes.push(`dload ${slotElementoAtual}`);
            this.instrucoes.push(`dload ${slotResultado}`);
            this.instrucoes.push('dcmpg');
            this.instrucoes.push(maior ? `ifle ${rotuloSemTroca}` : `ifge ${rotuloSemTroca}`);
        } else {
            this.instrucoes.push(`iload ${slotElementoAtual}`);
            this.instrucoes.push(`iload ${slotResultado}`);
            this.instrucoes.push(maior ? `if_icmple ${rotuloSemTroca}` : `if_icmpge ${rotuloSemTroca}`);
        }
        this.instrucoes.push(this.instrucaoLoad(tipoJvmElemento, slotElementoAtual));
        this.instrucoes.push(this.instrucaoStore(tipoJvmElemento, slotResultado));
        this.instrucoes.push(`${rotuloSemTroca}:`);

        this.instrucoes.push(`iinc ${slotIndice} 1`);
        this.instrucoes.push(`goto ${rotuloInicio}`);
        this.instrucoes.push(`${rotuloFim}:`);
        this.instrucoes.push(this.instrucaoLoad(tipoJvmElemento, slotResultado));

        return tipoElemento;
    }

    private async compilarSomar(argumentos: any[]): Promise<string> {
        if (argumentos.length !== 1) throw new ErroCompilador("'somar' espera 1 argumento.");
        const { slotOrigem, tipoElemento, tipoJvmElemento, slotIndice, slotTamanho } = await this.prepararLacoSobreVetor(argumentos[0]);
        if (tipoElemento !== 'inteiro' && tipoElemento !== 'numero') {
            throw new ErroCompilador(`'somar' só é suportado em vetor de inteiro/numero (tipo '${tipoElemento}[]' não suportado).`);
        }

        const slotAcumulador = this.reservarSlotTemporario(tipoJvmElemento);
        this.instrucoes.push(tipoJvmElemento === 'D' ? 'dconst_0' : 'iconst_0');
        this.instrucoes.push(this.instrucaoStore(tipoJvmElemento, slotAcumulador));

        const rotuloInicio = this.gerarRotulo('Lsomar_inicio');
        const rotuloFim = this.gerarRotulo('Lsomar_fim');
        this.instrucoes.push(`${rotuloInicio}:`);
        this.instrucoes.push(`iload ${slotIndice}`);
        this.instrucoes.push(`iload ${slotTamanho}`);
        this.instrucoes.push(`if_icmpge ${rotuloFim}`);

        this.emitirElementoAtual(slotOrigem, slotIndice, tipoJvmElemento);
        this.instrucoes.push(this.instrucaoLoad(tipoJvmElemento, slotAcumulador));
        this.instrucoes.push(tipoJvmElemento === 'D' ? 'dadd' : 'iadd');
        this.instrucoes.push(this.instrucaoStore(tipoJvmElemento, slotAcumulador));

        this.instrucoes.push(`iinc ${slotIndice} 1`);
        this.instrucoes.push(`goto ${rotuloInicio}`);
        this.instrucoes.push(`${rotuloFim}:`);
        this.instrucoes.push(this.instrucaoLoad(tipoJvmElemento, slotAcumulador));

        return tipoElemento;
    }

    private async compilarOrdenar(argumentos: any[]): Promise<string> {
        if (argumentos.length < 1 || argumentos.length > 2) throw new ErroCompilador("'ordenar' espera 1 ou 2 argumentos.");
        if (argumentos.length === 2) {
            throw new ErroCompilador("'ordenar' com função de comparação personalizada ainda não é suportado (só ordenação natural).");
        }
        const tipoVetor = this.resolverTipoConstruto(argumentos[0]);
        if (!tipoVetor.endsWith('[]')) throw new ErroCompilador("'ordenar' espera um vetor.");
        const tipoElemento = tipoVetor.slice(0, -2);
        if (!['inteiro', 'numero', 'texto', 'logico'].includes(tipoElemento)) {
            throw new ErroCompilador(`'ordenar' só suporta vetor de inteiro/numero/texto/logico (tipo '${tipoVetor}' não suportado).`);
        }

        await argumentos[0].aceitar(this as any);
        this.instrucoes.push('dup');
        this.instrucoes.push('invokestatic java/util/Collections/sort(Ljava/util/List;)V');
        // `Collections.sort` ordena em cima da própria lista e não devolve nada — o `dup`
        // deixou uma segunda cópia da referência na pilha pra servir de "resultado".

        return tipoVetor;
    }

    private async compilarIntervalo(argumentos: any[]): Promise<string> {
        if (argumentos.length < 1 || argumentos.length > 3) throw new ErroCompilador("'intervalo' espera de 1 a 3 argumentos.");

        const exigirInteiro = async (expressao: any, nomeArg: string): Promise<void> => {
            const tipo = await expressao.aceitar(this as any);
            if (tipo !== 'inteiro') throw new ErroCompilador(`'${nomeArg}' de 'intervalo' precisa ser inteiro.`);
        };

        const slotInicio = this.reservarSlotTemporario('I');
        const slotFim = this.reservarSlotTemporario('I');
        const slotPasso = this.reservarSlotTemporario('I');

        // Convenção adotada (documentada em PLAN.md): 1 argumento = fim (início implícito 0,
        // igual a Python `range(n)`); 2 = início e fim; 3 = início, fim e passo.
        if (argumentos.length === 1) {
            this.instrucoes.push('iconst_0');
            this.instrucoes.push(`istore ${slotInicio}`);
            await exigirInteiro(argumentos[0], 'fim');
            this.instrucoes.push(`istore ${slotFim}`);
            this.instrucoes.push('iconst_1');
            this.instrucoes.push(`istore ${slotPasso}`);
        } else {
            await exigirInteiro(argumentos[0], 'inicio');
            this.instrucoes.push(`istore ${slotInicio}`);
            await exigirInteiro(argumentos[1], 'fim');
            this.instrucoes.push(`istore ${slotFim}`);
            if (argumentos.length === 3) {
                await exigirInteiro(argumentos[2], 'passo');
                this.instrucoes.push(`istore ${slotPasso}`);
            } else {
                this.instrucoes.push('iconst_1');
                this.instrucoes.push(`istore ${slotPasso}`);
            }
        }

        const slotResultado = this.reservarSlotTemporario('Ljava/util/ArrayList;');
        this.instrucoes.push('new java/util/ArrayList');
        this.instrucoes.push('dup');
        this.instrucoes.push('invokespecial java/util/ArrayList/<init>()V');
        this.instrucoes.push(`astore ${slotResultado}`);

        const slotIndice = this.reservarSlotTemporario('I');
        this.instrucoes.push(`iload ${slotInicio}`);
        this.instrucoes.push(`istore ${slotIndice}`);

        const rotuloInicio = this.gerarRotulo('Lintervalo_inicio');
        const rotuloFim = this.gerarRotulo('Lintervalo_fim');
        this.instrucoes.push(`${rotuloInicio}:`);
        this.instrucoes.push(`iload ${slotIndice}`);
        this.instrucoes.push(`iload ${slotFim}`);
        this.instrucoes.push(`if_icmpge ${rotuloFim}`);

        this.instrucoes.push(`aload ${slotResultado}`);
        this.instrucoes.push(`iload ${slotIndice}`);
        this.emitirBoxing('I');
        this.instrucoes.push('invokeinterface java/util/List/add(Ljava/lang/Object;)Z 2');
        this.instrucoes.push('pop');

        this.instrucoes.push(`iload ${slotIndice}`);
        this.instrucoes.push(`iload ${slotPasso}`);
        this.instrucoes.push('iadd');
        this.instrucoes.push(`istore ${slotIndice}`);
        this.instrucoes.push(`goto ${rotuloInicio}`);
        this.instrucoes.push(`${rotuloFim}:`);
        this.instrucoes.push(`aload ${slotResultado}`);

        return 'inteiro[]';
    }

    private async compilarIncluido(argumentos: any[]): Promise<string> {
        if (argumentos.length !== 2) throw new ErroCompilador("'incluido' espera 2 argumentos.");
        const tipoVetor = this.resolverTipoConstruto(argumentos[0]);
        if (!tipoVetor.endsWith('[]')) throw new ErroCompilador("'incluido' espera um vetor.");
        const tipoElemento = tipoVetor.slice(0, -2);
        const tipoJvmElemento = this.mapearTipoJvm(tipoElemento);

        await argumentos[0].aceitar(this as any);
        const tipoValor = await argumentos[1].aceitar(this as any);
        if (tipoValor === 'inteiro' && tipoElemento === 'numero') this.instrucoes.push('i2d');
        this.emitirBoxing(tipoJvmElemento);
        this.instrucoes.push('invokevirtual java/util/ArrayList/contains(Ljava/lang/Object;)Z');
        return 'logico';
    }

    private async compilarClonar(argumentos: any[]): Promise<string> {
        if (argumentos.length !== 1) throw new ErroCompilador("'clonar' espera 1 argumento.");
        const tipoValor = await argumentos[0].aceitar(this as any);
        if (tipoValor === 'inteiro' || tipoValor === 'numero' || tipoValor === 'logico' || tipoValor === 'texto') {
            return tipoValor;
        }
        if (tipoValor.endsWith('[]')) {
            const slotOriginal = this.reservarSlotTemporario('Ljava/util/ArrayList;');
            this.instrucoes.push(`astore ${slotOriginal}`);
            this.instrucoes.push('new java/util/ArrayList');
            this.instrucoes.push('dup');
            this.instrucoes.push(`aload ${slotOriginal}`);
            this.instrucoes.push('invokespecial java/util/ArrayList/<init>(Ljava/util/Collection;)V');
            return tipoValor;
        }
        if (tipoValor.startsWith('dicionario<')) {
            const slotOriginal = this.reservarSlotTemporario('Ljava/util/HashMap;');
            this.instrucoes.push(`astore ${slotOriginal}`);
            this.instrucoes.push('new java/util/HashMap');
            this.instrucoes.push('dup');
            this.instrucoes.push(`aload ${slotOriginal}`);
            this.instrucoes.push('invokespecial java/util/HashMap/<init>(Ljava/util/Map;)V');
            return tipoValor;
        }
        if (tipoValor.startsWith('tupla<')) {
            this.instrucoes.push('checkcast [Ljava/lang/Object;');
            this.instrucoes.push('invokevirtual [Ljava/lang/Object;/clone()Ljava/lang/Object;');
            this.instrucoes.push('checkcast [Ljava/lang/Object;');
            return tipoValor;
        }
        throw new ErroCompilador(`'clonar' não suportado para instância de classe (tipo '${tipoValor}') — cópia de objetos do usuário não é suportada.`);
    }

    private async compilarVetorDeTupla(argumentos: any[]): Promise<string> {
        if (argumentos.length !== 1) throw new ErroCompilador("'vetor' espera 1 argumento.");
        const tipoTupla = this.resolverTipoConstruto(argumentos[0]);
        if (!tipoTupla.startsWith('tupla<')) throw new ErroCompilador("'vetor' espera uma tupla.");
        const tipos = this.dividirTiposTupla(tipoTupla);
        if (!tipos.every((tipo) => tipo === tipos[0])) {
            throw new ErroCompilador("'vetor' só suporta tupla homogênea (todos os elementos do mesmo tipo).");
        }

        this.instrucoes.push('new java/util/ArrayList');
        this.instrucoes.push('dup');
        await argumentos[0].aceitar(this as any);
        this.instrucoes.push('invokestatic java/util/Arrays/asList([Ljava/lang/Object;)Ljava/util/List;');
        this.instrucoes.push('invokespecial java/util/ArrayList/<init>(Ljava/util/Collection;)V');

        return `${tipos[0]}[]`;
    }

    // ----- Família com callback (mapear/filtrarPor/paraCada/algum/encontrar*/reduzir/todosEmCondicao) -----

    private async prepararLacoSobreVetor(argVetor: any): Promise<{
        slotOrigem: number;
        tipoElemento: string;
        tipoJvmElemento: string;
        slotIndice: number;
        slotTamanho: number;
    }> {
        const tipoVetor = this.resolverTipoConstruto(argVetor);
        if (!tipoVetor.endsWith('[]')) throw new ErroCompilador(`Esperado vetor, tipo '${tipoVetor}' não é iterável.`);
        const tipoElemento = tipoVetor.slice(0, -2);
        const tipoJvmElemento = this.mapearTipoJvm(tipoElemento);

        const slotOrigem = this.reservarSlotTemporario('Ljava/util/ArrayList;');
        await argVetor.aceitar(this as any);
        this.instrucoes.push(`astore ${slotOrigem}`);

        const slotTamanho = this.reservarSlotTemporario('I');
        this.instrucoes.push(`aload ${slotOrigem}`);
        this.instrucoes.push('invokevirtual java/util/ArrayList/size()I');
        this.instrucoes.push(`istore ${slotTamanho}`);

        const slotIndice = this.reservarSlotTemporario('I');
        this.instrucoes.push('iconst_0');
        this.instrucoes.push(`istore ${slotIndice}`);

        return { slotOrigem, tipoElemento, tipoJvmElemento, slotIndice, slotTamanho };
    }

    private emitirElementoAtual(slotOrigem: number, slotIndice: number, tipoJvmElemento: string): void {
        this.instrucoes.push(`aload ${slotOrigem}`);
        this.instrucoes.push(`iload ${slotIndice}`);
        this.instrucoes.push('invokevirtual java/util/ArrayList/get(I)Ljava/lang/Object;');
        this.emitirUnboxDeObjeto(tipoJvmElemento);
    }

    private async prepararCallback(
        argCallback: any,
        nomeFuncaoOrigem: string,
        aridadeEsperada: number
    ): Promise<{ slot: number; metodo: FuncaoInfo; nomeClasse: string }> {
        const nomeClasse = (await argCallback.aceitar(this as any)) as unknown as string;
        const infoClasse = this.classes.get(nomeClasse);
        const metodo = infoClasse?.metodos.get('invocar');
        if (!metodo) {
            throw new ErroCompilador(
                `Argumento de função de '${nomeFuncaoOrigem}' precisa ser uma função anônima (ex.: 'funcao(x) {...}' ou uma variável que guarda uma).`
            );
        }
        if (metodo.parametros.length !== aridadeEsperada) {
            throw new ErroCompilador(`Função de callback de '${nomeFuncaoOrigem}' precisa receber exatamente ${aridadeEsperada} parâmetro(s).`);
        }
        const slot = this.reservarSlotTemporario(this.mapearTipoJvm(nomeClasse));
        this.instrucoes.push(`astore ${slot}`);
        return { slot, metodo, nomeClasse };
    }

    private async compilarMapear(argumentos: any[]): Promise<string> {
        if (argumentos.length !== 2) throw new ErroCompilador("'mapear' espera 2 argumentos.");
        const { slotOrigem, tipoJvmElemento, slotIndice, slotTamanho } = await this.prepararLacoSobreVetor(argumentos[0]);
        const { slot: slotCallback, metodo, nomeClasse } = await this.prepararCallback(argumentos[1], 'mapear', 1);
        if (metodo.parametros[0].tipoJvm !== tipoJvmElemento) {
            throw new ErroCompilador(
                `Callback de 'mapear' espera parâmetro '${metodo.parametros[0].tipoDelegua}', vetor é de elemento de outro tipo.`
            );
        }
        const tipoJvmResultado = this.mapearTipoJvm(metodo.tipoRetornoDelegua);

        const slotResultado = this.reservarSlotTemporario('Ljava/util/ArrayList;');
        this.instrucoes.push('new java/util/ArrayList');
        this.instrucoes.push('dup');
        this.instrucoes.push('invokespecial java/util/ArrayList/<init>()V');
        this.instrucoes.push(`astore ${slotResultado}`);

        const rotuloInicio = this.gerarRotulo('Lmapear_inicio');
        const rotuloFim = this.gerarRotulo('Lmapear_fim');
        this.instrucoes.push(`${rotuloInicio}:`);
        this.instrucoes.push(`iload ${slotIndice}`);
        this.instrucoes.push(`iload ${slotTamanho}`);
        this.instrucoes.push(`if_icmpge ${rotuloFim}`);

        this.instrucoes.push(`aload ${slotResultado}`);
        this.instrucoes.push(`aload ${slotCallback}`);
        this.emitirElementoAtual(slotOrigem, slotIndice, tipoJvmElemento);
        this.instrucoes.push(`invokevirtual ${nomeClasse}/invocar${metodo.descritor}`);
        this.emitirBoxing(tipoJvmResultado);
        this.instrucoes.push('invokeinterface java/util/List/add(Ljava/lang/Object;)Z 2');
        this.instrucoes.push('pop');

        this.instrucoes.push(`iinc ${slotIndice} 1`);
        this.instrucoes.push(`goto ${rotuloInicio}`);
        this.instrucoes.push(`${rotuloFim}:`);
        this.instrucoes.push(`aload ${slotResultado}`);

        return `${metodo.tipoRetornoDelegua}[]`;
    }

    private async compilarFiltrarPor(argumentos: any[]): Promise<string> {
        if (argumentos.length !== 2) throw new ErroCompilador("'filtrarPor' espera 2 argumentos.");
        const { slotOrigem, tipoElemento, tipoJvmElemento, slotIndice, slotTamanho } = await this.prepararLacoSobreVetor(argumentos[0]);
        const { slot: slotCallback, metodo, nomeClasse } = await this.prepararCallback(argumentos[1], 'filtrarPor', 1);
        if (metodo.tipoRetornoDelegua !== 'logico') throw new ErroCompilador("Callback de 'filtrarPor' precisa retornar logico.");
        if (metodo.parametros[0].tipoJvm !== tipoJvmElemento) {
            throw new ErroCompilador("Callback de 'filtrarPor' espera parâmetro de outro tipo que o do vetor.");
        }

        const slotResultado = this.reservarSlotTemporario('Ljava/util/ArrayList;');
        this.instrucoes.push('new java/util/ArrayList');
        this.instrucoes.push('dup');
        this.instrucoes.push('invokespecial java/util/ArrayList/<init>()V');
        this.instrucoes.push(`astore ${slotResultado}`);

        const rotuloInicio = this.gerarRotulo('Lfiltrar_inicio');
        const rotuloSemAdicionar = this.gerarRotulo('Lfiltrar_semadicionar');
        const rotuloFim = this.gerarRotulo('Lfiltrar_fim');
        this.instrucoes.push(`${rotuloInicio}:`);
        this.instrucoes.push(`iload ${slotIndice}`);
        this.instrucoes.push(`iload ${slotTamanho}`);
        this.instrucoes.push(`if_icmpge ${rotuloFim}`);

        this.instrucoes.push(`aload ${slotCallback}`);
        this.emitirElementoAtual(slotOrigem, slotIndice, tipoJvmElemento);
        this.instrucoes.push(`invokevirtual ${nomeClasse}/invocar${metodo.descritor}`);
        this.instrucoes.push(`ifeq ${rotuloSemAdicionar}`);

        this.instrucoes.push(`aload ${slotResultado}`);
        this.emitirElementoAtual(slotOrigem, slotIndice, tipoJvmElemento);
        this.emitirBoxing(tipoJvmElemento);
        this.instrucoes.push('invokeinterface java/util/List/add(Ljava/lang/Object;)Z 2');
        this.instrucoes.push('pop');

        this.instrucoes.push(`${rotuloSemAdicionar}:`);
        this.instrucoes.push(`iinc ${slotIndice} 1`);
        this.instrucoes.push(`goto ${rotuloInicio}`);
        this.instrucoes.push(`${rotuloFim}:`);
        this.instrucoes.push(`aload ${slotResultado}`);

        return `${tipoElemento}[]`;
    }

    private async compilarParaCada(argumentos: any[]): Promise<string> {
        if (argumentos.length !== 2) throw new ErroCompilador("'paraCada' espera 2 argumentos.");
        const { slotOrigem, tipoJvmElemento, slotIndice, slotTamanho } = await this.prepararLacoSobreVetor(argumentos[0]);
        const { slot: slotCallback, metodo, nomeClasse } = await this.prepararCallback(argumentos[1], 'paraCada', 1);
        if (metodo.parametros[0].tipoJvm !== tipoJvmElemento) {
            throw new ErroCompilador("Callback de 'paraCada' espera parâmetro de outro tipo que o do vetor.");
        }

        const rotuloInicio = this.gerarRotulo('Lparacada_inicio');
        const rotuloFim = this.gerarRotulo('Lparacada_fim');
        this.instrucoes.push(`${rotuloInicio}:`);
        this.instrucoes.push(`iload ${slotIndice}`);
        this.instrucoes.push(`iload ${slotTamanho}`);
        this.instrucoes.push(`if_icmpge ${rotuloFim}`);

        this.instrucoes.push(`aload ${slotCallback}`);
        this.emitirElementoAtual(slotOrigem, slotIndice, tipoJvmElemento);
        this.instrucoes.push(`invokevirtual ${nomeClasse}/invocar${metodo.descritor}`);
        if (metodo.tipoRetornoJvm !== 'V') {
            this.instrucoes.push(metodo.tipoRetornoJvm === 'D' ? 'pop2' : 'pop');
        }

        this.instrucoes.push(`iinc ${slotIndice} 1`);
        this.instrucoes.push(`goto ${rotuloInicio}`);
        this.instrucoes.push(`${rotuloFim}:`);

        return 'vazio';
    }

    private async compilarAlgumOuTodosEmCondicao(argumentos: any[], nomeFuncao: string, ehAlgum: boolean): Promise<string> {
        if (argumentos.length !== 2) throw new ErroCompilador(`'${nomeFuncao}' espera 2 argumentos.`);
        const { slotOrigem, tipoJvmElemento, slotIndice, slotTamanho } = await this.prepararLacoSobreVetor(argumentos[0]);
        const { slot: slotCallback, metodo, nomeClasse } = await this.prepararCallback(argumentos[1], nomeFuncao, 1);
        if (metodo.tipoRetornoDelegua !== 'logico') throw new ErroCompilador(`Callback de '${nomeFuncao}' precisa retornar logico.`);
        if (metodo.parametros[0].tipoJvm !== tipoJvmElemento) {
            throw new ErroCompilador(`Callback de '${nomeFuncao}' espera parâmetro de outro tipo que o do vetor.`);
        }

        const slotResultado = this.reservarSlotTemporario('Z');
        this.instrucoes.push(ehAlgum ? 'iconst_0' : 'iconst_1');
        this.instrucoes.push(`istore ${slotResultado}`);

        const rotuloInicio = this.gerarRotulo(`L${nomeFuncao}_inicio`);
        const rotuloEncontrado = this.gerarRotulo(`L${nomeFuncao}_encontrado`);
        const rotuloContinua = this.gerarRotulo(`L${nomeFuncao}_continua`);
        const rotuloFim = this.gerarRotulo(`L${nomeFuncao}_fim`);
        this.instrucoes.push(`${rotuloInicio}:`);
        this.instrucoes.push(`iload ${slotIndice}`);
        this.instrucoes.push(`iload ${slotTamanho}`);
        this.instrucoes.push(`if_icmpge ${rotuloFim}`);

        this.instrucoes.push(`aload ${slotCallback}`);
        this.emitirElementoAtual(slotOrigem, slotIndice, tipoJvmElemento);
        this.instrucoes.push(`invokevirtual ${nomeClasse}/invocar${metodo.descritor}`);
        // `algum`: achar 1 verdadeiro já decide o resultado (sai cedo). `todosEmCondicao`: achar
        // 1 falso já decide (sai cedo). Sem achar nada decisivo, o laço continua.
        this.instrucoes.push(ehAlgum ? `ifne ${rotuloEncontrado}` : `ifeq ${rotuloEncontrado}`);
        this.instrucoes.push(`goto ${rotuloContinua}`);
        this.instrucoes.push(`${rotuloEncontrado}:`);
        this.instrucoes.push(ehAlgum ? 'iconst_1' : 'iconst_0');
        this.instrucoes.push(`istore ${slotResultado}`);
        this.instrucoes.push(`goto ${rotuloFim}`);
        this.instrucoes.push(`${rotuloContinua}:`);

        this.instrucoes.push(`iinc ${slotIndice} 1`);
        this.instrucoes.push(`goto ${rotuloInicio}`);
        this.instrucoes.push(`${rotuloFim}:`);
        this.instrucoes.push(`iload ${slotResultado}`);

        return 'logico';
    }

    private async compilarTodos(argumentos: any[]): Promise<string> {
        if (argumentos.length !== 1) throw new ErroCompilador("'todos' espera 1 argumento.");
        const { slotOrigem, tipoElemento, tipoJvmElemento, slotIndice, slotTamanho } = await this.prepararLacoSobreVetor(argumentos[0]);
        if (tipoElemento !== 'logico') throw new ErroCompilador(`'todos' só suporta vetor de logico (tipo '${tipoElemento}[]' não suportado).`);

        const slotResultado = this.reservarSlotTemporario('Z');
        this.instrucoes.push('iconst_1');
        this.instrucoes.push(`istore ${slotResultado}`);

        const rotuloInicio = this.gerarRotulo('Ltodos_inicio');
        const rotuloFalso = this.gerarRotulo('Ltodos_falso');
        const rotuloFim = this.gerarRotulo('Ltodos_fim');
        this.instrucoes.push(`${rotuloInicio}:`);
        this.instrucoes.push(`iload ${slotIndice}`);
        this.instrucoes.push(`iload ${slotTamanho}`);
        this.instrucoes.push(`if_icmpge ${rotuloFim}`);

        this.emitirElementoAtual(slotOrigem, slotIndice, tipoJvmElemento);
        this.instrucoes.push(`ifeq ${rotuloFalso}`);
        this.instrucoes.push(`iinc ${slotIndice} 1`);
        this.instrucoes.push(`goto ${rotuloInicio}`);
        this.instrucoes.push(`${rotuloFalso}:`);
        this.instrucoes.push('iconst_0');
        this.instrucoes.push(`istore ${slotResultado}`);
        this.instrucoes.push(`${rotuloFim}:`);
        this.instrucoes.push(`iload ${slotResultado}`);

        return 'logico';
    }

    private async compilarEncontrar(argumentos: any[], nomeFuncao: string, ultimo: boolean): Promise<string> {
        if (argumentos.length !== 2) throw new ErroCompilador(`'${nomeFuncao}' espera 2 argumentos.`);
        const { slotOrigem, tipoElemento, tipoJvmElemento, slotIndice, slotTamanho } = await this.prepararLacoSobreVetor(argumentos[0]);
        const { slot: slotCallback, metodo, nomeClasse } = await this.prepararCallback(argumentos[1], nomeFuncao, 1);
        if (metodo.tipoRetornoDelegua !== 'logico') throw new ErroCompilador(`Callback de '${nomeFuncao}' precisa retornar logico.`);
        if (metodo.parametros[0].tipoJvm !== tipoJvmElemento) {
            throw new ErroCompilador(`Callback de '${nomeFuncao}' espera parâmetro de outro tipo que o do vetor.`);
        }

        const slotResultado = this.reservarSlotTemporario(tipoJvmElemento);
        this.instrucoes.push(tipoJvmElemento === 'D' ? 'dconst_0' : this.ehTipoReferencia(tipoJvmElemento) ? 'aconst_null' : 'iconst_0');
        this.instrucoes.push(this.instrucaoStore(tipoJvmElemento, slotResultado));

        const rotuloInicio = this.gerarRotulo(`L${nomeFuncao}_inicio`);
        const rotuloSemAchar = this.gerarRotulo(`L${nomeFuncao}_semachar`);
        const rotuloFim = this.gerarRotulo(`L${nomeFuncao}_fim`);
        this.instrucoes.push(`${rotuloInicio}:`);
        this.instrucoes.push(`iload ${slotIndice}`);
        this.instrucoes.push(`iload ${slotTamanho}`);
        this.instrucoes.push(`if_icmpge ${rotuloFim}`);

        this.instrucoes.push(`aload ${slotCallback}`);
        this.emitirElementoAtual(slotOrigem, slotIndice, tipoJvmElemento);
        this.instrucoes.push(`invokevirtual ${nomeClasse}/invocar${metodo.descritor}`);
        this.instrucoes.push(`ifeq ${rotuloSemAchar}`);

        this.emitirElementoAtual(slotOrigem, slotIndice, tipoJvmElemento);
        this.instrucoes.push(this.instrucaoStore(tipoJvmElemento, slotResultado));
        // `encontrar`/`primeiroEmCondicao`: primeiro achado já resolve, sai do laço.
        // `encontrarUltimo`: continua e vai sobrescrevendo — o último achado sobrevive.
        if (!ultimo) this.instrucoes.push(`goto ${rotuloFim}`);

        this.instrucoes.push(`${rotuloSemAchar}:`);
        this.instrucoes.push(`iinc ${slotIndice} 1`);
        this.instrucoes.push(`goto ${rotuloInicio}`);
        this.instrucoes.push(`${rotuloFim}:`);
        this.instrucoes.push(this.instrucaoLoad(tipoJvmElemento, slotResultado));

        return tipoElemento;
    }

    private async compilarEncontrarIndice(argumentos: any[], nomeFuncao: string, ultimo: boolean): Promise<string> {
        if (argumentos.length !== 2) throw new ErroCompilador(`'${nomeFuncao}' espera 2 argumentos.`);
        const { slotOrigem, tipoJvmElemento, slotIndice, slotTamanho } = await this.prepararLacoSobreVetor(argumentos[0]);
        const { slot: slotCallback, metodo, nomeClasse } = await this.prepararCallback(argumentos[1], nomeFuncao, 1);
        if (metodo.tipoRetornoDelegua !== 'logico') throw new ErroCompilador(`Callback de '${nomeFuncao}' precisa retornar logico.`);
        if (metodo.parametros[0].tipoJvm !== tipoJvmElemento) {
            throw new ErroCompilador(`Callback de '${nomeFuncao}' espera parâmetro de outro tipo que o do vetor.`);
        }

        const slotResultado = this.reservarSlotTemporario('I');
        this.instrucoes.push('iconst_m1');
        this.instrucoes.push(`istore ${slotResultado}`);

        const rotuloInicio = this.gerarRotulo(`L${nomeFuncao}_inicio`);
        const rotuloSemAchar = this.gerarRotulo(`L${nomeFuncao}_semachar`);
        const rotuloFim = this.gerarRotulo(`L${nomeFuncao}_fim`);
        this.instrucoes.push(`${rotuloInicio}:`);
        this.instrucoes.push(`iload ${slotIndice}`);
        this.instrucoes.push(`iload ${slotTamanho}`);
        this.instrucoes.push(`if_icmpge ${rotuloFim}`);

        this.instrucoes.push(`aload ${slotCallback}`);
        this.emitirElementoAtual(slotOrigem, slotIndice, tipoJvmElemento);
        this.instrucoes.push(`invokevirtual ${nomeClasse}/invocar${metodo.descritor}`);
        this.instrucoes.push(`ifeq ${rotuloSemAchar}`);

        this.instrucoes.push(`iload ${slotIndice}`);
        this.instrucoes.push(`istore ${slotResultado}`);
        if (!ultimo) this.instrucoes.push(`goto ${rotuloFim}`);

        this.instrucoes.push(`${rotuloSemAchar}:`);
        this.instrucoes.push(`iinc ${slotIndice} 1`);
        this.instrucoes.push(`goto ${rotuloInicio}`);
        this.instrucoes.push(`${rotuloFim}:`);
        this.instrucoes.push(`iload ${slotResultado}`);

        return 'inteiro';
    }

    private async compilarReduzir(argumentos: any[]): Promise<string> {
        if (argumentos.length !== 3) throw new ErroCompilador("'reduzir' espera 3 argumentos (vetor, função, valor inicial).");
        const { slotOrigem, tipoJvmElemento, slotIndice, slotTamanho } = await this.prepararLacoSobreVetor(argumentos[0]);
        const { slot: slotCallback, metodo, nomeClasse } = await this.prepararCallback(argumentos[1], 'reduzir', 2);

        if (metodo.parametros[1].tipoJvm !== tipoJvmElemento) {
            throw new ErroCompilador("Segundo parâmetro do callback de 'reduzir' espera outro tipo que o do vetor.");
        }
        if (metodo.tipoRetornoDelegua !== metodo.parametros[0].tipoDelegua) {
            throw new ErroCompilador("Callback de 'reduzir' precisa retornar o mesmo tipo do acumulador (primeiro parâmetro).");
        }

        const tipoJvmAcumulador = metodo.parametros[0].tipoJvm;
        const tipoValorInicial = await argumentos[2].aceitar(this as any);
        if (tipoValorInicial === 'inteiro' && metodo.parametros[0].tipoDelegua === 'numero') this.instrucoes.push('i2d');
        const slotAcumulador = this.reservarSlotTemporario(tipoJvmAcumulador);
        this.instrucoes.push(this.instrucaoStore(tipoJvmAcumulador, slotAcumulador));

        const rotuloInicio = this.gerarRotulo('Lreduzir_inicio');
        const rotuloFim = this.gerarRotulo('Lreduzir_fim');
        this.instrucoes.push(`${rotuloInicio}:`);
        this.instrucoes.push(`iload ${slotIndice}`);
        this.instrucoes.push(`iload ${slotTamanho}`);
        this.instrucoes.push(`if_icmpge ${rotuloFim}`);

        this.instrucoes.push(`aload ${slotCallback}`);
        this.instrucoes.push(this.instrucaoLoad(tipoJvmAcumulador, slotAcumulador));
        this.emitirElementoAtual(slotOrigem, slotIndice, tipoJvmElemento);
        this.instrucoes.push(`invokevirtual ${nomeClasse}/invocar${metodo.descritor}`);
        this.instrucoes.push(this.instrucaoStore(tipoJvmAcumulador, slotAcumulador));

        this.instrucoes.push(`iinc ${slotIndice} 1`);
        this.instrucoes.push(`goto ${rotuloInicio}`);
        this.instrucoes.push(`${rotuloFim}:`);
        this.instrucoes.push(this.instrucaoLoad(tipoJvmAcumulador, slotAcumulador));

        return metodo.tipoRetornoDelegua;
    }

    // ===== Fase 12 (cauda longa) =====

    // Decoradores (`@nome(...)`): a semântica de referência é Python-style de verdade — o
    // nome do decorador é resolvido como um valor QUALQUER em tempo de execução (podendo vir
    // de módulo, ser uma variável dinâmica etc.), chamado com a função/classe alvo e podendo
    // devolver outra coisa pra SUBSTITUIR o nome original. Isso exige exatamente a abstração
    // de "valor chamável genérico, independente da classe Lambda concreta" que a Fase 7
    // deliberadamente não construiu (tipagem nominal por lambda, decisão registrada em
    // PLAN.md) — não há como fazer isso funcionar aqui sem construir aquela infraestrutura
    // primeiro. `Decorador.aceitar()` nem passa pelo padrão de visitante (rejeita
    // incondicionalmente no pacote base) — os decoradores chegam só como um array
    // `.decoradores` nos campos de outras declarações, então a checagem é proativa.
    private verificarSemDecoradores(declaracao: { decoradores?: any[] }, tipoDeclaracao: string): void {
        if (declaracao.decoradores && declaracao.decoradores.length > 0) {
            throw new ErroCompilador(
                `Decoradores não são suportados (em ${tipoDeclaracao}) — exigiriam uma abstração de "valor chamável genérico" que a Fase 7 deliberadamente não construiu (ver PLAN.md).`
            );
        }
    }

    // `esquerda ?: direita`: só suportado pra tipos referência (texto/vetor/dicionário/
    // tupla/classe) — `inteiro`/`numero`/`logico` são primitivos de largura fixa, sem
    // representação nula neste compilador ("sem tipo dinâmico", mesmo princípio de sempre).
    // Curto-circuito de verdade (`direita` só é avaliada se `esquerda` for nula) — diferente
    // do interpretador de referência, que avalia os dois lados sempre.
    async visitarExpressaoElvis(expressao: Elvis): Promise<string> {
        const tipoEsquerdo = this.resolverTipoConstruto(expressao.esquerda);
        const tipoDireito = this.resolverTipoConstruto(expressao.direita);

        if (tipoEsquerdo !== 'nulo' && tipoDireito !== 'nulo' && tipoEsquerdo !== tipoDireito) {
            throw new ErroCompilador(`Operador elvis ('?:') com tipos incompatíveis: '${tipoEsquerdo}' e '${tipoDireito}'.`);
        }
        const tipoResultado = tipoEsquerdo !== 'nulo' ? tipoEsquerdo : tipoDireito;
        if (tipoResultado === 'nulo') {
            throw new ErroCompilador("Operador elvis ('?:') com os dois lados nulos não tem tipo resolvível.");
        }
        const tipoJvmResultado = this.mapearTipoJvm(tipoResultado);
        if (!this.ehTipoReferencia(tipoJvmResultado)) {
            throw new ErroCompilador(
                `Operador elvis ('?:') só é suportado pra tipos referência (texto/vetor/dicionário/tupla/classe) — '${tipoResultado}' é primitivo, sem representação nula.`
            );
        }

        // `esquerda` é sempre nula (ex.: `nulo ?: direita`): `direita` sempre vence, sem
        // precisar gerar nenhum desvio.
        if (tipoEsquerdo === 'nulo') {
            return await expressao.direita.aceitar(this as any);
        }

        const rotuloNulo = this.gerarRotulo('Lelvis_nulo');
        const rotuloFim = this.gerarRotulo('Lelvis_fim');

        await expressao.esquerda.aceitar(this as any);
        this.instrucoes.push('dup');
        this.instrucoes.push(`ifnull ${rotuloNulo}`);
        this.instrucoes.push(`goto ${rotuloFim}`);
        this.instrucoes.push(`${rotuloNulo}:`);
        this.instrucoes.push('pop');
        await expressao.direita.aceitar(this as any);
        this.instrucoes.push(`${rotuloFim}:`);

        return tipoResultado;
    }

    // `condicao ? expressaoSe : expressaoSenao`: mesma promoção inteiro→numero da aritmética
    // (`visitarExpressaoBinaria`), só que como desvio de controle de fluxo produzindo valor em
    // vez de operação aritmética direta — os dois ramos precisam convergir no mesmo tipo JVM
    // no rótulo final (ponto mais frágil de sempre pra verificador de bytecode, por causa de
    // stack map frames — mesmo cuidado geral desde a Fase 2).
    async visitarExpressaoSeTernario(expressao: SeTernario): Promise<string> {
        const tipoEntao = this.resolverTipoConstruto(expressao.expressaoSe);
        const tipoSenao = this.resolverTipoConstruto(expressao.expressaoSenao);

        let tipoResultado: string;
        if (tipoEntao === tipoSenao) {
            tipoResultado = tipoEntao;
        } else if ((tipoEntao === 'inteiro' || tipoEntao === 'numero') && (tipoSenao === 'inteiro' || tipoSenao === 'numero')) {
            tipoResultado = 'numero';
        } else {
            throw new ErroCompilador(`'se ternário' com ramos de tipos incompatíveis: '${tipoEntao}' e '${tipoSenao}'.`);
        }

        const rotuloSenao = this.gerarRotulo('Lternario_senao');
        const rotuloFim = this.gerarRotulo('Lternario_fim');

        await expressao.condicao.aceitar(this as any);
        this.instrucoes.push(`ifeq ${rotuloSenao}`);
        const tipoValorEntao = await expressao.expressaoSe.aceitar(this as any);
        if (tipoValorEntao === 'inteiro' && tipoResultado === 'numero') this.instrucoes.push('i2d');
        this.instrucoes.push(`goto ${rotuloFim}`);
        this.instrucoes.push(`${rotuloSenao}:`);
        const tipoValorSenao = await expressao.expressaoSenao.aceitar(this as any);
        if (tipoValorSenao === 'inteiro' && tipoResultado === 'numero') this.instrucoes.push('i2d');
        this.instrucoes.push(`${rotuloFim}:`);

        return tipoResultado;
    }

    // Expressão regular (`||/padrao/flags||`): sem nenhum consumidor nativo na biblioteca
    // (nenhum método de texto aceita isso hoje) — o único uso observável é atribuir a uma
    // variável. Vira `java.util.regex.Pattern` já compilado; tipo pseudo-Delégua
    // 'expressao_regular' só existe do lado deste compilador (mapeia pra `Pattern` via
    // `mapearTipoJvm`).
    async visitarExpressaoExpressaoRegular(expressao: ExpressaoRegular): Promise<string> {
        const { padrao, flags } = this.dividirExpressaoRegular(expressao.valor as string);
        this.instrucoes.push(`ldc "${this.escaparTexto(padrao)}"`);
        const flagsJava = this.converterFlagsRegexParaJava(flags);
        if (flagsJava === 0) {
            this.instrucoes.push('invokestatic java/util/regex/Pattern/compile(Ljava/lang/String;)Ljava/util/regex/Pattern;');
        } else {
            this.instrucoes.push(`ldc ${flagsJava}`);
            this.instrucoes.push('invokestatic java/util/regex/Pattern/compile(Ljava/lang/String;I)Ljava/util/regex/Pattern;');
        }
        return 'expressao_regular';
    }

    private dividirExpressaoRegular(valor: string): { padrao: string; flags: string } {
        // Formato usual: `/padrao/flags` (delimitador `/`, mas o léxico aceita outros:
        // `~ @ ; % # '`) — se não bater esse formato, trata o valor bruto todo como padrão.
        const casamento = /^([/~@;%#'])(.*)\1([a-zA-Z]*)$/.exec(valor);
        if (casamento) return { padrao: casamento[2], flags: casamento[3] };
        return { padrao: valor, flags: '' };
    }

    private converterFlagsRegexParaJava(flags: string): number {
        let resultado = 0;
        for (const flag of flags) {
            switch (flag) {
                case 'i':
                    resultado |= 2; // Pattern.CASE_INSENSITIVE
                    break;
                case 'm':
                    resultado |= 8; // Pattern.MULTILINE
                    break;
                case 's':
                    resultado |= 32; // Pattern.DOTALL
                    break;
                case 'u':
                    resultado |= 64; // Pattern.UNICODE_CASE
                    break;
                // 'g' (global) e 'y' (sticky) são semântica de iteração/lastIndex do JS, sem
                // equivalente como flag de compilação em `java.util.regex.Pattern` — ignoradas.
            }
        }
        return resultado;
    }

    // `para cada <var> em <vetorOuDicionario> { ... }` (declaração) — reaproveitado também
    // por `para cada` como expressão (`visitarExpressaoParaCada`) e lista por compreensão
    // (`visitarExpressaoListaCompreensao`), que só diferem por injetar um contexto de
    // acumulação (ver `pilhaAcumulacaoParaCada`) e um rótulo de "continua" externo.
    async visitarDeclaracaoParaCada(declaracao: ParaCada): Promise<any> {
        await this.compilarParaCadaGenerico(declaracao.variavelIteracao, declaracao.vetorOuDicionario, declaracao.corpo.declaracoes);
    }

    async visitarExpressaoParaCada(expressao: ParaCadaComoConstruto): Promise<string> {
        const slotResultado = this.reservarSlotTemporario('Ljava/util/ArrayList;');
        this.instrucoes.push('new java/util/ArrayList');
        this.instrucoes.push('dup');
        this.instrucoes.push('invokespecial java/util/ArrayList/<init>()V');
        this.instrucoes.push(`astore ${slotResultado}`);

        const rotuloContinua = this.gerarRotulo('Lparacadaexpr_continua');
        const contexto: ContextoAcumulacaoParaCada = { slotResultado, rotuloContinua, tipoElemento: null };
        this.pilhaAcumulacaoParaCada.push(contexto);
        try {
            await this.compilarParaCadaGenerico(expressao.variavelIteracao, expressao.vetorOuDicionario, expressao.corpo.declaracoes, rotuloContinua);
        } finally {
            this.pilhaAcumulacaoParaCada.pop();
        }

        if (!contexto.tipoElemento) {
            throw new ErroCompilador("'para cada' como expressão precisa de ao menos um 'retorna' no corpo pra saber o tipo do vetor resultante.");
        }
        this.instrucoes.push(`aload ${slotResultado}`);
        return `${contexto.tipoElemento}[]`;
    }

    // `[expressaoRetorno para cada var em vetor (se condicao)]`: o próprio parser já monta
    // isso inteiramente como um `ParaCadaComoConstruto` cujo corpo é `se (condicao) { retorna
    // expressaoRetorno }` (ou só `retorna expressaoRetorno` sem filtro) — então só delega pro
    // mesmo mecanismo de `para cada` como expressão, sem nenhuma lógica extra aqui.
    async visitarExpressaoListaCompreensao(expressao: ListaCompreensao): Promise<string> {
        return await expressao.paraCada.aceitar(this as any);
    }

    private async compilarParaCadaGenerico(
        variavelIteracao: any,
        vetorOuDicionario: any,
        corpoDeclaracoes: Declaracao[],
        rotuloContinuaExterno?: string
    ): Promise<void> {
        const tipoIteravel = this.resolverTipoConstruto(vetorOuDicionario);
        if (tipoIteravel.endsWith('[]')) {
            await this.compilarParaCadaVetor(variavelIteracao, vetorOuDicionario, corpoDeclaracoes, rotuloContinuaExterno);
        } else if (tipoIteravel.startsWith('dicionario<')) {
            await this.compilarParaCadaDicionario(variavelIteracao, vetorOuDicionario, tipoIteravel, corpoDeclaracoes, rotuloContinuaExterno);
        } else {
            throw new ErroCompilador(`'para cada' não suporta iterar sobre tipo '${tipoIteravel}' (só vetor e dicionário).`);
        }
    }

    private async compilarParaCadaVetor(
        variavelIteracao: any,
        vetorExpr: any,
        corpoDeclaracoes: Declaracao[],
        rotuloContinuaExterno?: string
    ): Promise<void> {
        if (!(variavelIteracao instanceof Variavel)) {
            throw new ErroCompilador("'para cada' sobre vetor espera uma única variável de iteração (não '{chave, valor}', que é só para dicionário).");
        }

        const { slotOrigem, tipoElemento, tipoJvmElemento, slotIndice, slotTamanho } = await this.prepararLacoSobreVetor(vetorExpr);

        const rotuloInicio = this.gerarRotulo('Lparacada_inicio');
        const rotuloContinua = rotuloContinuaExterno ?? this.gerarRotulo('Lparacada_continua');
        const rotuloFim = this.gerarRotulo('Lparacada_fim');

        this.instrucoes.push(`${rotuloInicio}:`);
        this.instrucoes.push(`iload ${slotIndice}`);
        this.instrucoes.push(`iload ${slotTamanho}`);
        this.instrucoes.push(`if_icmpge ${rotuloFim}`);

        const slotVariavel = this.reservarSlotTemporario(tipoJvmElemento);
        this.emitirElementoAtual(slotOrigem, slotIndice, tipoJvmElemento);
        this.instrucoes.push(this.instrucaoStore(tipoJvmElemento, slotVariavel));
        this.variaveis.set(variavelIteracao.simbolo.lexema, { slot: slotVariavel, tipoJvm: tipoJvmElemento, tipoDelegua: tipoElemento });

        this.pilhaContinua.push(rotuloContinua);
        this.pilhaSustar.push(rotuloFim);
        for (const decl of corpoDeclaracoes) {
            await decl.aceitar(this as any);
        }
        this.pilhaContinua.pop();
        this.pilhaSustar.pop();

        this.instrucoes.push(`${rotuloContinua}:`);
        this.instrucoes.push(`iinc ${slotIndice} 1`);
        this.instrucoes.push(`goto ${rotuloInicio}`);
        this.instrucoes.push(`${rotuloFim}:`);
    }

    private async compilarParaCadaDicionario(
        variavelIteracao: any,
        dicExpr: any,
        tipoDicionario: string,
        corpoDeclaracoes: Declaracao[],
        rotuloContinuaExterno?: string
    ): Promise<void> {
        if (!(variavelIteracao instanceof Dupla)) {
            throw new ErroCompilador("'para cada' sobre dicionário espera '{chave, valor}' como variável de iteração.");
        }
        // O parser guarda os NOMES das duas variáveis de ligação como `Literal`s de texto em
        // `.primeiro`/`.segundo` (não uma chave/valor de verdade) — achado confirmado
        // empiricamente antes de implementar, documentado em PLAN.md.
        const nomeChave = (variavelIteracao.primeiro as Literal).valor as string;
        const nomeValor = (variavelIteracao.segundo as Literal).valor as string;
        const tipoValor = tipoDicionario.slice('dicionario<'.length, -1);
        const tipoJvmValor = this.mapearTipoJvm(tipoValor);

        const slotOrigem = this.reservarSlotTemporario('Ljava/util/HashMap;');
        await dicExpr.aceitar(this as any);
        this.instrucoes.push(`astore ${slotOrigem}`);

        const slotIterador = this.reservarSlotTemporario('Ljava/util/Iterator;');
        this.instrucoes.push(`aload ${slotOrigem}`);
        this.instrucoes.push('invokevirtual java/util/HashMap/entrySet()Ljava/util/Set;');
        this.instrucoes.push('invokeinterface java/util/Set/iterator()Ljava/util/Iterator; 1');
        this.instrucoes.push(`astore ${slotIterador}`);

        const rotuloInicio = this.gerarRotulo('Lparacada_inicio');
        const rotuloContinua = rotuloContinuaExterno ?? this.gerarRotulo('Lparacada_continua');
        const rotuloFim = this.gerarRotulo('Lparacada_fim');

        this.instrucoes.push(`${rotuloInicio}:`);
        this.instrucoes.push(`aload ${slotIterador}`);
        this.instrucoes.push('invokeinterface java/util/Iterator/hasNext()Z 1');
        this.instrucoes.push(`ifeq ${rotuloFim}`);

        const slotEntry = this.reservarSlotTemporario('Ljava/util/Map$Entry;');
        this.instrucoes.push(`aload ${slotIterador}`);
        this.instrucoes.push('invokeinterface java/util/Iterator/next()Ljava/lang/Object; 1');
        this.instrucoes.push('checkcast java/util/Map$Entry');
        this.instrucoes.push(`astore ${slotEntry}`);

        const slotChave = this.reservarSlotTemporario('Ljava/lang/String;');
        this.instrucoes.push(`aload ${slotEntry}`);
        this.instrucoes.push('invokeinterface java/util/Map$Entry/getKey()Ljava/lang/Object; 1');
        this.instrucoes.push('checkcast java/lang/String');
        this.instrucoes.push(`astore ${slotChave}`);

        const slotValor = this.reservarSlotTemporario(tipoJvmValor);
        this.instrucoes.push(`aload ${slotEntry}`);
        this.instrucoes.push('invokeinterface java/util/Map$Entry/getValue()Ljava/lang/Object; 1');
        this.emitirUnboxDeObjeto(tipoJvmValor);
        this.instrucoes.push(this.instrucaoStore(tipoJvmValor, slotValor));

        this.variaveis.set(nomeChave, { slot: slotChave, tipoJvm: 'Ljava/lang/String;', tipoDelegua: 'texto' });
        this.variaveis.set(nomeValor, { slot: slotValor, tipoJvm: tipoJvmValor, tipoDelegua: tipoValor });

        this.pilhaContinua.push(rotuloContinua);
        this.pilhaSustar.push(rotuloFim);
        for (const decl of corpoDeclaracoes) {
            await decl.aceitar(this as any);
        }
        this.pilhaContinua.pop();
        this.pilhaSustar.pop();

        this.instrucoes.push(`${rotuloContinua}:`);
        this.instrucoes.push(`goto ${rotuloInicio}`);
        this.instrucoes.push(`${rotuloFim}:`);
    }

    // `leia()`/`leia("prompt: ")`: lê uma linha da entrada padrão, sempre como `texto` (mesma
    // convenção do interpretador de referência). Usa um único `BufferedReader` estático,
    // criado sob demanda na primeira chamada (evita reembrulhar `System.in` a cada `leia()`).
    async visitarExpressaoLeia(expressao: Leia): Promise<string> {
        if (expressao.argumentos.length > 1) throw new ErroCompilador("'leia' aceita no máximo 1 argumento (o texto do prompt).");

        if (expressao.argumentos.length === 1) {
            this.instrucoes.push('getstatic java/lang/System/out Ljava/io/PrintStream;');
            const tipoPrompt = await expressao.argumentos[0].aceitar(this as any);
            if (tipoPrompt !== 'texto') throw new ErroCompilador("Prompt de 'leia' precisa ser texto.");
            this.instrucoes.push('invokevirtual java/io/PrintStream/print(Ljava/lang/String;)V');
        }

        const rotuloJaInicializado = this.gerarRotulo('Lleia_inicializado');
        this.instrucoes.push(`getstatic ${this.nomeClasse}/leitor Ljava/io/BufferedReader;`);
        this.instrucoes.push(`ifnonnull ${rotuloJaInicializado}`);
        this.instrucoes.push('new java/io/BufferedReader');
        this.instrucoes.push('dup');
        this.instrucoes.push('new java/io/InputStreamReader');
        this.instrucoes.push('dup');
        this.instrucoes.push('getstatic java/lang/System/in Ljava/io/InputStream;');
        this.instrucoes.push('invokespecial java/io/InputStreamReader/<init>(Ljava/io/InputStream;)V');
        this.instrucoes.push('invokespecial java/io/BufferedReader/<init>(Ljava/io/Reader;)V');
        this.instrucoes.push(`putstatic ${this.nomeClasse}/leitor Ljava/io/BufferedReader;`);
        this.instrucoes.push(`${rotuloJaInicializado}:`);

        this.instrucoes.push(`getstatic ${this.nomeClasse}/leitor Ljava/io/BufferedReader;`);
        this.instrucoes.push('invokevirtual java/io/BufferedReader/readLine()Ljava/lang/String;');

        return 'texto';
    }

    // `tipo de <expressao>`: como este compilador é estaticamente tipado (o tipo já é
    // conhecido em tempo de compilação), isso vira uma constante de texto — bem mais simples
    // que o interpretador, que resolve dinamicamente via reflexão em cima do valor real.
    async visitarExpressaoTipoDe(expressao: TipoDe): Promise<string> {
        const tipoDelegua = this.resolverTipoConstruto(expressao.valor);
        this.instrucoes.push(`ldc "${this.formatarNomeTipoParaSaida(tipoDelegua)}"`);
        return 'texto';
    }

    private formatarNomeTipoParaSaida(tipo: string): string {
        if (tipo === 'numero') return 'número';
        if (tipo === 'logico') return 'lógico';
        if (tipo.endsWith('[]')) return 'vetor';
        if (tipo.startsWith('dicionario<')) return 'dicionário';
        if (tipo.startsWith('tupla<')) return 'tupla';
        return tipo; // inteiro, texto, vazio, nome de classe (inclusive Lambda gerada)
    }

    // `interface`: o próprio parser já valida `implementa X` em tempo de análise sintática
    // (erro de compilação se a classe não cumprir o contrato) — a declaração da interface em
    // si não carrega nenhum comportamento em tempo de execução, igual ao interpretador de
    // referência (`visitarDeclaracaoInterface` lá também é um no-op).
    async visitarDeclaracaoInterface(declaracao: InterfaceDeclaracao): Promise<any> {}

    // `extensao de X { metodo(...) { ... } }`: cada método já foi registrado (assinatura) em
    // `registrarExtensoes`; aqui só falta compilar os corpos e empilhar em `metodosGerados`
    // (mesma lista das funções de nível superior — extensão não tem `.class` próprio).
    async visitarDeclaracaoExtensao(declaracao: Extensao): Promise<any> {
        // `extensão global` vs `extensão` (só do arquivo) é uma distinção de escopo por
        // arquivo que não existe neste compilador (tudo é inlinado numa única compilação
        // desde a Fase 9) — tratadas de forma idêntica. Simplificação documentada em PLAN.md.
        const tipoAlvo = this.normalizarTipo(declaracao.simboloTipo.lexema);
        const metodosDoTipo = this.extensoes.get(tipoAlvo);
        if (!metodosDoTipo) throw new ErroCompilador(`Extensão de '${tipoAlvo}' não registrada.`);

        for (const metodoDecl of declaracao.metodos) {
            const info = metodosDoTipo.get(metodoDecl.simbolo.lexema);
            if (!info) throw new ErroCompilador(`Método de extensão '${metodoDecl.simbolo.lexema}' não registrado pra '${tipoAlvo}'.`);
            this.metodosGerados.push(await this.compilarMetodoExtensao(metodoDecl, info));
        }
    }

    private async compilarMetodoExtensao(metodoDecl: FuncaoDeclaracao, info: FuncaoInfo): Promise<string> {
        const instrucoesAnteriores = this.instrucoes;
        const variaveisAnteriores = this.variaveis;
        const slotAnterior = this.proximoSlot;
        const tipoRetornoAnterior = this.tipoRetornoAtual;
        const classeAnterior = this.classeAtual;
        const catchesAnteriores = this.catchesGerados;

        this.instrucoes = [];
        this.variaveis = new Map();
        this.proximoSlot = 0;
        this.tipoRetornoAtual = info.tipoRetornoDelegua;
        this.classeAtual = null; // não é método de classe real — `isto` resolve via parâmetro sintético.
        this.catchesGerados = [];

        for (const parametro of info.parametros) {
            const slot = this.proximoSlot;
            this.proximoSlot += parametro.tipoJvm === 'D' ? 2 : 1;
            this.variaveis.set(parametro.nome, { slot, tipoJvm: parametro.tipoJvm, tipoDelegua: parametro.tipoDelegua });
        }

        for (const decl of metodoDecl.funcao.corpo) {
            await decl.aceitar(this as any);
        }
        if (info.tipoRetornoJvm === 'V') this.instrucoes.push('return');

        const corpoTexto = this.instrucoes.map((instrucao) => `        ${instrucao}`).join('\n');
        const resultado =
            `.method private static ${info.nomeJvm}${info.descritor}\n` +
            `    .limit stack 32\n` +
            `    .limit locals ${this.proximoSlot}\n` +
            this.formatarCatches() +
            (corpoTexto ? corpoTexto + '\n' : '') +
            `.end method\n`;

        this.instrucoes = instrucoesAnteriores;
        this.variaveis = variaveisAnteriores;
        this.proximoSlot = slotAnterior;
        this.tipoRetornoAtual = tipoRetornoAnterior;
        this.classeAtual = classeAnterior;
        this.catchesGerados = catchesAnteriores;

        return resultado;
    }

    // `ajuda`/`ajuda(...)`: recurso de documentação/REPL — a implementação de referência
    // despacha em cima do TIPO EM TEMPO DE EXECUÇÃO do valor avaliado (`DeleguaFuncao`,
    // `ObjetoDeleguaClasse`, `DescritorTipoClasse`, objetos reificados que só existem no
    // interpretador de árvore). Este compilador não gera nenhum desses objetos — funções
    // viram métodos estáticos da JVM sem metadado Delégua-side, classes viram `.class` de
    // verdade sem um "descritor" navegável — então não há como replicar o despacho dinâmico.
    // Fora de escopo pra compilação AOT.
    async visitarDeclaracaoAjuda(declaracao: Ajuda): Promise<any> {
        throw new ErroCompilador("'ajuda' é um recurso de documentação/REPL sem equivalente em compilação AOT — não suportado.");
    }

    async visitarExpressaoAjuda(expressao: AjudaComoConstruto): Promise<any> {
        throw new ErroCompilador("'ajuda' é um recurso de documentação/REPL sem equivalente em compilação AOT — não suportado.");
    }
}
