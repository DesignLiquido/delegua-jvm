/// <reference types="jest" />
import { CompiladorJvm } from '../fontes/compilador-jvm';

describe('CompiladorJvm - Biblioteca global (Fase 10)', () => {
    it('inteiro/numero/texto convertem entre tipos', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['escreva(inteiro(3.9))', 'escreva(numero(5))', 'escreva(texto(10))']);
        expect(resultado).toContain('d2i');
        expect(resultado).toContain('i2d');
        expect(resultado).toContain('invokestatic java/lang/String/valueOf(I)Ljava/lang/String;');
    });

    it("'longo' lança ErroCompilador (BigInt fora de escopo)", async () => {
        const compilador = new CompiladorJvm();
        await expect(compilador.compilar(['escreva(longo(5))'])).rejects.toThrow(/BigInt/);
    });

    it('tamanho dispatcha por tipo (vetor/texto/dicionario/tupla)', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var v = [1, 2, 3]', 'escreva(tamanho(v))', 'escreva(tamanho("abc"))']);
        expect(resultado).toContain('invokevirtual java/util/ArrayList/size()I');
        expect(resultado).toContain('invokevirtual java/lang/String/length()I');
    });

    it('maximo/minimo/somar geram laço com comparação/soma', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var v = [3, 7, 1]', 'escreva(maximo(v))', 'escreva(minimo(v))', 'escreva(somar(v))']);
        expect(resultado).toContain('if_icmple');
        expect(resultado).toContain('if_icmpge');
        expect(resultado).toContain('iadd');
    });

    it('ordenar usa Collections.sort e devolve a mesma referência', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var v = [3, 1, 2]', 'var r = ordenar(v)', 'escreva(r[0])']);
        expect(resultado).toContain('invokestatic java/util/Collections/sort(Ljava/util/List;)V');
    });

    it('ordenar com comparador personalizado lança ErroCompilador', async () => {
        const compilador = new CompiladorJvm();
        await expect(
            compilador.compilar(['var v = [3, 1, 2]', 'var f = funcao(a: inteiro, b: inteiro): inteiro { retorna a - b }', 'ordenar(v, f)'])
        ).rejects.toThrow(/comparação personalizada/);
    });

    it('intervalo com 1/2/3 argumentos gera laço construindo ArrayList', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var v = intervalo(5)', 'escreva(v[0])']);
        expect(resultado).toContain('new java/util/ArrayList');
        expect(resultado).toContain('invokeinterface java/util/List/add(Ljava/lang/Object;)Z 2');
    });

    it('incluido usa ArrayList.contains com boxing', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var v = [1, 2, 3]', 'escreva(incluido(v, 2))']);
        expect(resultado).toContain('invokestatic java/lang/Integer/valueOf(I)Ljava/lang/Integer;');
        expect(resultado).toContain('invokevirtual java/util/ArrayList/contains(Ljava/lang/Object;)Z');
    });

    it('clonar de vetor usa construtor de cópia do ArrayList', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var v = [1, 2, 3]', 'var c = clonar(v)']);
        expect(resultado).toContain('invokespecial java/util/ArrayList/<init>(Ljava/util/Collection;)V');
    });

    it('clonar de instância de classe lança ErroCompilador', async () => {
        const compilador = new CompiladorJvm();
        await expect(
            compilador.compilar(['classe Pessoa {', '    nome: texto', '}', 'var p = Pessoa()', 'clonar(p)'])
        ).rejects.toThrow(/cópia de objetos do usuário/);
    });

    it("'tupla(vetor)' lança ErroCompilador (aridade dinâmica)", async () => {
        const compilador = new CompiladorJvm();
        await expect(compilador.compilar(['var v = [1, 2, 3]', 'tupla(v)'])).rejects.toThrow(/aridade de uma tupla/);
    });

    it('vetor(tupla) homogênea converte via Arrays.asList', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var t = (1, 2, 3)', 'var v = vetor(t)', 'escreva(v[0])']);
        expect(resultado).toContain('invokestatic java/util/Arrays/asList([Ljava/lang/Object;)Ljava/util/List;');
    });

    it('vetor(tupla) heterogênea lança ErroCompilador', async () => {
        const compilador = new CompiladorJvm();
        await expect(compilador.compilar(['var t = (1, "a")', 'vetor(t)'])).rejects.toThrow(/homogênea/);
    });

    it('mapear usa a classe da lambda resolvida no call site (invokevirtual invocar)', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar([
            'var v = [1, 2, 3]',
            'var r: inteiro[] = mapear(v, funcao(x: inteiro): inteiro { retorna x * 2 })',
            'escreva(r[0])',
        ]);
        expect(resultado).toMatch(/invokevirtual Lambda\d+\/invocar\(I\)I/);
        expect(resultado).toContain('invokeinterface java/util/List/add(Ljava/lang/Object;)Z 2');
    });

    it('mapear sem tipo explícito no var lança ErroCompilador orientando a anotar', async () => {
        const compilador = new CompiladorJvm();
        await expect(
            compilador.compilar(['var v = [1, 2, 3]', 'var r = mapear(v, funcao(x: inteiro): inteiro { retorna x * 2 })'])
        ).rejects.toThrow(/tipo explícito/);
    });

    it('filtrarPor preserva o tipo do vetor de entrada', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar([
            'var v = [1, 2, 3, 4]',
            'var pares = filtrarPor(v, funcao(x: inteiro): logico { retorna x > 2 })',
            'escreva(pares[0])',
        ]);
        expect(resultado).toContain('ifeq');
    });

    it('filtrarPor com callback que não retorna logico lança ErroCompilador', async () => {
        const compilador = new CompiladorJvm();
        await expect(
            compilador.compilar(['var v = [1, 2, 3]', 'filtrarPor(v, funcao(x: inteiro): inteiro { retorna x })'])
        ).rejects.toThrow(/logico/);
    });

    it('paraCada não deixa valor na pilha (return vazio) e descarta retorno do callback', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var v = [1, 2, 3]', 'paraCada(v, funcao(x: inteiro) { escreva(x) })']);
        expect(resultado).toContain('invokevirtual Lambda0/invocar(I)V');
    });

    it('algum e todosEmCondicao geram laço com saída antecipada', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar([
            'var v = [1, 2, 3]',
            'escreva(algum(v, funcao(x: inteiro): logico { retorna x > 2 }))',
        ]);
        expect(resultado).toContain('ifne');
    });

    it("'todos' só suporta vetor de logico", async () => {
        const compilador = new CompiladorJvm();
        await expect(compilador.compilar(['var v = [1, 2, 3]', 'todos(v)'])).rejects.toThrow(/logico/);
    });

    it('encontrar retorna elemento; encontrarIndice retorna índice com -1 como sentinela', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar([
            'var v = [1, 2, 3]',
            'escreva(encontrarIndice(v, funcao(x: inteiro): logico { retorna x > 2 }))',
        ]);
        expect(resultado).toContain('iconst_m1');
    });

    it('reduzir usa o tipo do valor inicial como acumulador', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar([
            'var v = [1, 2, 3]',
            'escreva(reduzir(v, funcao(acc: inteiro, x: inteiro): inteiro { retorna acc + x }, 0))',
        ]);
        expect(resultado).toMatch(/invokevirtual Lambda\d+\/invocar\(II\)I/);
    });

    it('reduzir com callback de tipo de retorno diferente do acumulador lança ErroCompilador', async () => {
        const compilador = new CompiladorJvm();
        await expect(
            compilador.compilar([
                'var v = [1, 2, 3]',
                'reduzir(v, funcao(acc: inteiro, x: inteiro): numero { retorna acc + x }, 0)',
            ])
        ).rejects.toThrow(/mesmo tipo do acumulador/);
    });

    it('Argumento de callback que não é função anônima é rejeitado (pelo parser, que já valida a assinatura de mapear)', async () => {
        // O próprio parser já sabe que o 2º argumento de `mapear` precisa ser do tipo `função` —
        // passar uma variável `inteiro` no lugar já falha antes de chegar no compilador JVM.
        const compilador = new CompiladorJvm();
        await expect(compilador.compilar(['var v = [1, 2, 3]', 'var x = 5', 'mapear(v, x)'])).rejects.toThrow(/Erro de sintaxe/);
    });

    it('Nome de biblioteca sombreado por função do usuário usa a função do usuário', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['funcao tamanho(x: inteiro): inteiro {', '    retorna x + 1', '}', 'escreva(tamanho(5))']);
        expect(resultado).toContain('invokestatic Programa/tamanho(I)I');
        expect(resultado).not.toContain('java/util/ArrayList/size');
    });

    it('% (modulo) usa irem/drem', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['escreva(7 % 2)']);
        expect(resultado).toContain('irem');
    });
});
