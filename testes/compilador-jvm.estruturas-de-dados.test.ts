/// <reference types="jest" />
import { CompiladorJvm } from '../fontes/compilador-jvm';

describe('CompiladorJvm - Estruturas de dados', () => {
    it('Vetor de inteiros usa ArrayList com autobox de Integer', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var v = [1, 2, 3]', 'escreva(v[0])']);
        expect(resultado).toContain('new java/util/ArrayList');
        expect(resultado).toContain('invokestatic java/lang/Integer/valueOf(I)Ljava/lang/Integer;');
        expect(resultado).toContain('invokeinterface java/util/List/add(Ljava/lang/Object;)Z 2');
        expect(resultado).toContain('invokevirtual java/util/ArrayList/get(I)Ljava/lang/Object;');
        expect(resultado).toContain('checkcast java/lang/Integer');
        expect(resultado).toContain('invokevirtual java/lang/Integer/intValue()I');
    });

    it('Vetor de texto não faz autobox (String já é referência)', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var v = ["a", "b"]', 'escreva(v[0])']);
        expect(resultado).not.toContain('valueOf');
        expect(resultado).toContain('checkcast java/lang/String');
    });

    it('Vetor com elementos de tipos diferentes lança ErroCompilador', async () => {
        const compilador = new CompiladorJvm();
        await expect(compilador.compilar(['var v = [1, "a"]'])).rejects.toThrow(/tipos diferentes/);
    });

    it('Vetor vazio sem contexto de tipo lança ErroCompilador', async () => {
        const compilador = new CompiladorJvm();
        await expect(compilador.compilar(['var v = []'])).rejects.toThrow(/contexto de tipo/);
    });

    it('Atribuição por índice usa ArrayList.set e descarta valor antigo', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var v = [1, 2, 3]', 'v[1] = 99']);
        expect(resultado).toContain('invokevirtual java/util/ArrayList/set(ILjava/lang/Object;)Ljava/lang/Object;');
        expect(resultado).toContain('pop');
    });

    it('Índice de vetor precisa ser inteiro', async () => {
        const compilador = new CompiladorJvm();
        await expect(compilador.compilar(['var v = [1, 2, 3]', 'escreva(v["a"])'])).rejects.toThrow(/precisa ser inteiro/);
    });

    it('Vetor de vetor (matriz) encadeia ArrayList.get e cast de ArrayList', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var m = [[1, 2], [3, 4]]', 'escreva(m[0][1])']);
        const ocorrenciasGet = (resultado.match(/invokevirtual java\/util\/ArrayList\/get\(I\)Ljava\/lang\/Object;/g) || []).length;
        expect(ocorrenciasGet).toBe(2);
        expect(resultado).toContain('checkcast java/util/ArrayList');
        expect(resultado).toContain('checkcast java/lang/Integer');
    });

    it('Dicionário com chave texto usa HashMap', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var d = {"nome": "Ana"}', 'escreva(d["nome"])']);
        expect(resultado).toContain('new java/util/HashMap');
        expect(resultado).toContain('invokevirtual java/util/HashMap/put(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;');
        expect(resultado).toContain('invokevirtual java/util/HashMap/get(Ljava/lang/Object;)Ljava/lang/Object;');
    });

    it('Dicionário com chave não literal-texto lança ErroCompilador', async () => {
        const compilador = new CompiladorJvm();
        await expect(compilador.compilar(['var x = 1', 'var d = {x: "a"}'])).rejects.toThrow();
    });

    it('Dicionário com valores de tipos diferentes lança ErroCompilador', async () => {
        const compilador = new CompiladorJvm();
        await expect(compilador.compilar(['var d = {"a": 1, "b": "dois"}'])).rejects.toThrow(/tipos diferentes/);
    });

    it('Chave de dicionário precisa ser texto na leitura', async () => {
        const compilador = new CompiladorJvm();
        await expect(compilador.compilar(['var d = {"a": 1}', 'escreva(d[1])'])).rejects.toThrow(/precisa ser texto/);
    });

    it('Tupla usa Object[] com aastore/aaload e cast por posição', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var t = (1, "dois", verdadeiro)', 'escreva(t[0])', 'escreva(t[1])']);
        expect(resultado).toContain('anewarray java/lang/Object');
        expect(resultado).toContain('aastore');
        expect(resultado).toContain('aaload');
        expect(resultado).toContain('checkcast java/lang/Integer');
        expect(resultado).toContain('checkcast java/lang/String');
    });

    it('Acesso a tupla com índice não constante lança ErroCompilador', async () => {
        const compilador = new CompiladorJvm();
        await expect(
            compilador.compilar(['var t = (1, 2)', 'var i = 0', 'escreva(t[i])'])
        ).rejects.toThrow(/índice inteiro literal/);
    });

    it('Tupla é imutável: atribuição por índice lança ErroCompilador', async () => {
        const compilador = new CompiladorJvm();
        await expect(compilador.compilar(['var t = (1, 2)', 't[0] = 5'])).rejects.toThrow(/imutável/);
    });

    it('Índice de tupla fora dos limites lança ErroCompilador', async () => {
        const compilador = new CompiladorJvm();
        await expect(compilador.compilar(['var t = (1, 2)', 'escreva(t[5])'])).rejects.toThrow(/fora dos limites/);
    });
});

describe('CompiladorJvm - Estruturas de dados (construtos não alcançáveis pelo parser atual)', () => {
    // `AcessoIntervaloVariavel` (fatiamento `v[1:4:2]`), `AcessoElementoMatriz` e
    // `AtribuicaoPorIndicesMatriz` (acesso `m[i, j]` por vírgula) existem na AST de
    // @designliquido/delegua mas não são produzidos pelo parser desta versão (1.25.1) —
    // nenhuma dessas classes é instanciada em avaliador-sintatico.js. O acesso 2D real e
    // suportado é via colchetes encadeados (`m[i][j]`), coberto pelos testes acima através
    // de `AcessoIndiceVariavel` aninhado. Os testes abaixo chamam os visitantes diretamente
    // para provar que a geração de código está correta e pronta, caso o parser passe a
    // suportar essa sintaxe no futuro.
    it('visitarExpressaoAcessoIntervaloVariavel gera laço de cópia com ArrayList novo', async () => {
        const compilador = new CompiladorJvm();
        await compilador.compilar(['var v = [1, 2, 3, 4, 5]']);
        const { AcessoIntervaloVariavel, Literal, Variavel } = require('@designliquido/delegua');
        const simboloV = { lexema: 'v' };
        const construto = new AcessoIntervaloVariavel(
            -1,
            new Variavel(-1, simboloV),
            new Literal(-1, 0, 1, 'inteiro'),
            new Literal(-1, 0, 4, 'inteiro'),
            null,
            { lexema: ']' }
        );
        const resultado = await (compilador as any).visitarExpressaoAcessoIntervaloVariavel(construto);
        expect(resultado).toBe('inteiro[]');
        const jasmin = (compilador as any).instrucoes.join('\n');
        expect(jasmin).toContain('new java/util/ArrayList');
        expect(jasmin).toContain('invokeinterface java/util/List/add(Ljava/lang/Object;)Z 2');
    });
});
