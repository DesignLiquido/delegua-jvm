/// <reference types="jest" />
import { CompiladorJvm } from '../fontes/compilador-jvm';

describe('CompiladorJvm - Cauda longa de construtos (Fase 12)', () => {
    it("'tipo de' resolve em tempo de compilação e vira constante de texto", async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['escreva(tipo de 5)', 'escreva(tipo de "a")']);
        expect(resultado).toContain('ldc "inteiro"');
        expect(resultado).toContain('ldc "texto"');
    });

    it('interface é no-op (conformidade já validada pelo parser)', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar([
            'interface Falante {',
            '    falar(): texto;',
            '}',
            'classe Pessoa implementa Falante {',
            '    falar(): texto {',
            '        retorna "oi"',
            '    }',
            '}',
        ]);
        expect(resultado).toBeTruthy();
    });

    it("'ajuda' lança ErroCompilador (recurso REPL, sem equivalente AOT)", async () => {
        const compilador = new CompiladorJvm();
        await expect(compilador.compilar(['ajuda()'])).rejects.toThrow(/REPL/);
    });

    it('decoradores em função/var/classe lançam ErroCompilador', async () => {
        const compilador = new CompiladorJvm();
        await expect(compilador.compilar(['@teste', 'funcao f(): inteiro {', '    retorna 1', '}'])).rejects.toThrow(/Decoradores/);
    });

    it('operador elvis usa ifnull com curto-circuito', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var a: texto = nulo', 'var b = a ?: "padrao"', 'escreva(b)']);
        expect(resultado).toContain('aconst_null');
        expect(resultado).toContain('ifnull');
    });

    it('elvis em tipo primitivo lança ErroCompilador', async () => {
        const compilador = new CompiladorJvm();
        await expect(compilador.compilar(['var x = 5 ?: 3'])).rejects.toThrow(/tipos referência/);
    });

    it('se ternário promove inteiro/numero e converge num rótulo', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var x = 5 > 3 ? 1 : 2.5', 'escreva(x)']);
        expect(resultado).toContain('i2d');
        expect(resultado).toMatch(/ifeq Lternario_senao\d+/);
    });

    it('se ternário com ramos incompatíveis lança ErroCompilador', async () => {
        const compilador = new CompiladorJvm();
        await expect(compilador.compilar(['var x = 5 > 3 ? 1 : "a"'])).rejects.toThrow(/tipos incompatíveis/);
    });

    it('leia usa BufferedReader estático com inicialização preguiçosa', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var nome = leia("Nome: ")', 'escreva(nome)']);
        expect(resultado).toContain('.field private static leitor Ljava/io/BufferedReader;');
        expect(resultado).toContain('invokevirtual java/io/BufferedReader/readLine()Ljava/lang/String;');
        expect(resultado).toContain('invokevirtual java/io/PrintStream/print(Ljava/lang/String;)V');
    });

    it('expressão regular compila pra Pattern.compile com flags convertidas', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var re = ||/abc/i||']);
        expect(resultado).toContain('invokestatic java/util/regex/Pattern/compile(Ljava/lang/String;I)Ljava/util/regex/Pattern;');
    });

    it('para cada sobre vetor liga a variável de iteração e suporta continua/sustar', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar([
            'var v = [1, 2, 3]',
            'para cada x em v {',
            '    se (x == 2) { continua }',
            '    escreva(x)',
            '}',
        ]);
        expect(resultado).toContain('invokevirtual java/util/ArrayList/get(I)Ljava/lang/Object;');
        expect(resultado).toMatch(/goto Lparacada_continua\d+/);
    });

    it('para cada sobre dicionário usa entrySet/Iterator e liga chave/valor', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar([
            'var d = {"a": 1}',
            'para cada {chave, valor} em d {',
            '    escreva(chave)',
            '    escreva(valor)',
            '}',
        ]);
        expect(resultado).toContain('invokevirtual java/util/HashMap/entrySet()Ljava/util/Set;');
        expect(resultado).toContain('invokeinterface java/util/Map$Entry/getKey()Ljava/lang/Object; 1');
        expect(resultado).toContain('invokeinterface java/util/Map$Entry/getValue()Ljava/lang/Object; 1');
    });

    it('para cada com {chave, valor} sobre vetor já é rejeitado pelo parser (erro de sintaxe)', async () => {
        // O próprio parser só aceita a forma `{a, b}` quando o iterável é um dicionário —
        // sobre vetor, já falha antes de chegar no compilador JVM. O `ErroCompilador`
        // defensivo em `compilarParaCadaVetor` (`instanceof Variavel`) documenta a mesma
        // regra, mas na prática é código morto por causa dessa validação anterior do parser.
        const compilador = new CompiladorJvm();
        await expect(
            compilador.compilar(['var v = [1, 2, 3]', 'para cada {a, b} em v {', '    escreva(a)', '}'])
        ).rejects.toThrow(/Erro de sintaxe/);
    });

    it('para cada como expressão acumula via retorna redirecionado (não sai do método)', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar([
            'var v = [1, 2, 3]',
            'var r: inteiro[] = para cada x em v {',
            '    retorna x * 2',
            '}',
            'escreva(r[0])',
        ]);
        expect(resultado).toContain('invokeinterface java/util/List/add(Ljava/lang/Object;)Z 2');
        expect(resultado).toMatch(/goto Lparacadaexpr_continua\d+/);
    });

    it('para cada como expressão sem tipo explícito no var lança ErroCompilador orientando a anotar', async () => {
        const compilador = new CompiladorJvm();
        await expect(
            compilador.compilar(['var v = [1, 2, 3]', 'var r = para cada x em v {', '    retorna x * 2', '}'])
        ).rejects.toThrow(/tipo explícito/);
    });

    it('lista por compreensão delega pro mesmo mecanismo de para-cada-expressão', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var v = [1, 2, 3]', 'var r: inteiro[] = [x * 2 para cada x em v]', 'escreva(r[0])']);
        expect(resultado).toContain('invokeinterface java/util/List/add(Ljava/lang/Object;)Z 2');
    });

    it('lista por compreensão com filtro usa se/ifeq pra pular elementos', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar([
            'var v = [1, 2, 3, 4]',
            'var r: inteiro[] = [x para cada x em v se x > 2]',
            'escreva(r[0])',
        ]);
        expect(resultado).toContain('ifeq');
    });

    it('extensao de texto despacha via invokestatic com isto como primeiro parâmetro', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['extensao de texto {', '    grito(): texto {', '        retorna isto', '    }', '}', 'escreva("oi".grito())']);
        expect(resultado).toContain('.method private static ext_texto_grito(Ljava/lang/String;)Ljava/lang/String;');
        expect(resultado).toContain('invokestatic Programa/ext_texto_grito(Ljava/lang/String;)Ljava/lang/String;');
    });

    it('extensao de classe do usuário despacha via invokestatic (não invokevirtual)', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar([
            'classe Pessoa {',
            '    nome: texto',
            '    construtor(nome: texto) { isto.nome = nome }',
            '}',
            'extensao de Pessoa {',
            '    saudacao(): texto {',
            '        retorna isto.nome',
            '    }',
            '}',
            'var p = Pessoa("Ana")',
            'escreva(p.saudacao())',
        ]);
        expect(resultado).toContain('invokestatic Programa/ext_Pessoa_saudacao(LPessoa;)Ljava/lang/String;');
    });

    it('metodo de classe do usuário continua tendo prioridade sobre extensao de mesmo nome', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar([
            'classe Pessoa {',
            '    falar(): texto { retorna "classe" }',
            '}',
            'extensao de Pessoa {',
            '    falar(): texto { retorna "extensao" }',
            '}',
            'var p = Pessoa()',
            'escreva(p.falar())',
        ]);
        expect(resultado).toContain('invokevirtual Pessoa/falar()Ljava/lang/String;');
        // O método de extensão ainda é compilado (fica sem uso, igual uma função de nível
        // superior nunca chamada) — só o CALL SITE não deve usar `invokestatic` pra ele.
        expect(resultado).not.toContain('invokestatic Programa/ext_Pessoa_falar');
    });

    it('escreva com valor de tipo referência sem case específico usa println(Object)', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var v = [1, 2, 3]', 'escreva(v)']);
        expect(resultado).toContain('invokevirtual java/io/PrintStream/println(Ljava/lang/Object;)V');
    });
});
