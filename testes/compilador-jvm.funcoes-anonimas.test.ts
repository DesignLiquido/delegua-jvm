/// <reference types="jest" />
import { CompiladorJvm } from '../fontes/compilador-jvm';

describe('CompiladorJvm - Funções anônimas / closures', () => {
    it('Lambda sem captura vira classe auxiliar Lambda0 com invocar()', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar([
            'var somar = funcao(a: inteiro, b: inteiro): inteiro {',
            '    retorna a + b',
            '}',
            'escreva(somar(3, 4))',
        ]);
        const lambdaTexto = compilador.obterClassesGeradas().get('Lambda0');
        expect(lambdaTexto).toBeTruthy();
        expect(lambdaTexto).toContain('.class public Lambda0');
        expect(lambdaTexto).toContain('.method public invocar(II)I');
        expect(lambdaTexto).toContain('.method public <init>()V');
        expect(resultado).toContain('new Lambda0');
        expect(resultado).toContain('invokespecial Lambda0/<init>()V');
        expect(resultado).toContain('invokevirtual Lambda0/invocar(II)I');
    });

    it('Lambda com captura gera campo e construtor com parâmetro', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar([
            'var fator = 3',
            'var multiplicar = funcao(x: inteiro): inteiro {',
            '    retorna x * fator',
            '}',
            'escreva(multiplicar(7))',
        ]);
        const lambdaTexto = compilador.obterClassesGeradas().get('Lambda0');
        expect(lambdaTexto).toContain('.field private final fator I');
        expect(lambdaTexto).toContain('.method public <init>(I)V');
        expect(lambdaTexto).toContain('putfield Lambda0/fator I');
        expect(lambdaTexto).toContain('getfield Lambda0/fator I');
        // No ponto de definição, a captura é lida da variável do escopo envolvente.
        expect(resultado).toContain('istore 1');
        expect(resultado).toContain('new Lambda0');
        expect(resultado).toContain('invokespecial Lambda0/<init>(I)V');
    });

    it('Duas lambdas distintas geram Lambda0 e Lambda1', async () => {
        const compilador = new CompiladorJvm();
        await compilador.compilar([
            'var f1 = funcao(x: inteiro): inteiro { retorna x + 1 }',
            'var f2 = funcao(x: inteiro): inteiro { retorna x * 10 }',
            'escreva(f1(5))',
            'escreva(f2(5))',
        ]);
        expect(compilador.obterClassesGeradas().has('Lambda0')).toBe(true);
        expect(compilador.obterClassesGeradas().has('Lambda1')).toBe(true);
    });

    it('Lambda sem parâmetros e sem retorno vira invocar()V com return implícito', async () => {
        const compilador = new CompiladorJvm();
        await compilador.compilar(['var v = 5', 'var imprimir = funcao() {', '    escreva(v)', '}', 'imprimir()']);
        const lambdaTexto = compilador.obterClassesGeradas().get('Lambda0');
        expect(lambdaTexto).toContain('.method public invocar()V');
        expect(lambdaTexto).toContain('return');
    });

    it('Mutação de captura usa getfield/putfield, não iinc', async () => {
        const compilador = new CompiladorJvm();
        await compilador.compilar([
            'var contador = 0',
            'var incrementar = funcao(): inteiro {',
            '    contador = contador + 1',
            '    retorna contador',
            '}',
            'escreva(incrementar())',
        ]);
        const lambdaTexto = compilador.obterClassesGeradas().get('Lambda0');
        expect(lambdaTexto).not.toContain('iinc');
        expect(lambdaTexto).toContain('putfield Lambda0/contador I');
    });

    it('++ em captura usa getfield/putfield, não iinc', async () => {
        const compilador = new CompiladorJvm();
        await compilador.compilar(['var total = 100', 'var f = funcao(): inteiro {', '    total++', '    retorna total', '}', 'escreva(f())']);
        const lambdaTexto = compilador.obterClassesGeradas().get('Lambda0');
        expect(lambdaTexto).not.toContain('iinc');
        expect(lambdaTexto).toContain('getfield Lambda0/total I');
        expect(lambdaTexto).toContain('putfield Lambda0/total I');
    });

    it('Chamar variável que não é função anônima lança ErroCompilador', async () => {
        const compilador = new CompiladorJvm();
        await expect(compilador.compilar(['var x = 5', 'escreva(x(1))'])).rejects.toThrow(/não é uma função anônima chamável/);
    });

    it('Parâmetro de lambda sem tipo explícito lança ErroCompilador', async () => {
        const compilador = new CompiladorJvm();
        await expect(compilador.compilar(['var f = funcao(x) { retorna x }'])).rejects.toThrow(/tipo explícito/);
    });

    it('Chamada de lambda com número de argumentos errado lança ErroCompilador', async () => {
        const compilador = new CompiladorJvm();
        await expect(
            compilador.compilar(['var f = funcao(a: inteiro, b: inteiro): inteiro { retorna a + b }', 'escreva(f(1))'])
        ).rejects.toThrow(/espera 2 argumento/);
    });
});
