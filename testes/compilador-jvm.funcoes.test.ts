/// <reference types="jest" />
import { CompiladorJvm } from '../fontes/compilador-jvm';

describe('CompiladorJvm - Funções', () => {
    it('Função com parâmetro e retorno vira .method private static', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['funcao dobro(x: inteiro): inteiro {', '    retorna x * 2', '}', 'escreva(dobro(21))']);
        expect(resultado).toContain('.method private static dobro(I)I');
        expect(resultado).toContain('imul');
        expect(resultado).toContain('ireturn');
        expect(resultado).toContain('invokestatic Programa/dobro(I)I');
    });

    it('Função recursiva chama a si mesma via invokestatic', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar([
            'funcao fatorial(n: inteiro): inteiro {',
            '    se (n < 2) {',
            '        retorna 1',
            '    }',
            '    retorna n * fatorial(n - 1)',
            '}',
            'escreva(fatorial(5))',
        ]);
        expect(resultado).toContain('invokestatic Programa/fatorial(I)I');
    });

    it('Função sem tipo de retorno vira void e ganha return implícito', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['funcao saudacao(nome: texto) {', '    escreva(nome)', '}', 'saudacao("oi")']);
        expect(resultado).toContain('.method private static saudacao(Ljava/lang/String;)V');
        expect(resultado).toContain('invokestatic Programa/saudacao(Ljava/lang/String;)V');
    });

    it('Parâmetro numero e argumento inteiro promove com i2d na chamada', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['funcao soma(a: numero, b: inteiro): numero {', '    retorna a + b', '}', 'escreva(soma(1.5, 2))']);
        expect(resultado).toContain('.method private static soma(DI)D');
        expect(resultado).toContain('dreturn');
    });

    it('Chamar função antes da declaração é erro de sintaxe (não suportado pelo parser)', async () => {
        const compilador = new CompiladorJvm();
        await expect(
            compilador.compilar(['escreva(triplo(4))', 'funcao triplo(x: inteiro): inteiro {', '    retorna x * 3', '}'])
        ).rejects.toThrow(/Erro de sintaxe/);
    });

    it('Concatenação de texto usa String.concat com valueOf para não-texto', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['escreva("idade: " + 42)']);
        expect(resultado).toContain('invokestatic java/lang/String/valueOf(I)Ljava/lang/String;');
        expect(resultado).toContain('invokevirtual java/lang/String/concat(Ljava/lang/String;)Ljava/lang/String;');
    });

    it('Concatenação de dois textos não chama valueOf', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var nome = "mundo"', 'escreva("ola, " + nome)']);
        expect(resultado).not.toContain('valueOf');
        expect(resultado).toContain('invokevirtual java/lang/String/concat(Ljava/lang/String;)Ljava/lang/String;');
    });

    it('Chamada com número de argumentos errado lança ErroCompilador', async () => {
        const compilador = new CompiladorJvm();
        await expect(
            compilador.compilar(['funcao soma(a: inteiro, b: inteiro): inteiro {', '    retorna a + b', '}', 'escreva(soma(1))'])
        ).rejects.toThrow(/espera 2 argumento/);
    });

    it('Parâmetro sem tipo explícito lança ErroCompilador', async () => {
        const compilador = new CompiladorJvm();
        await expect(compilador.compilar(['funcao soma(a, b) {', '    retorna a + b', '}'])).rejects.toThrow(/tipo explícito/);
    });
});
