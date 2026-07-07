/// <reference types="jest" />
import { CompiladorJvm } from '../fontes/compilador-jvm';

describe('CompiladorJvm - Aritmética', () => {
    it('Soma de inteiros permanece inteira', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['escreva(1 + 2)']);
        expect(resultado).toContain('ldc 1');
        expect(resultado).toContain('ldc 2');
        expect(resultado).toContain('iadd');
        expect(resultado).toContain('invokevirtual java/io/PrintStream/println(I)V');
    });

    it('Mistura de inteiro e numero promove para double', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['escreva(1 + 2.5)']);
        expect(resultado).toContain('ldc 1');
        expect(resultado).toContain('i2d');
        expect(resultado).toContain('ldc2_w 2.5');
        expect(resultado).toContain('dadd');
        expect(resultado).toContain('invokevirtual java/io/PrintStream/println(D)V');
    });

    it('Divisão sempre produz numero, mesmo entre inteiros', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['escreva(5 / 2)']);
        expect(resultado).toContain('i2d');
        expect(resultado).toContain('ddiv');
        expect(resultado).toContain('invokevirtual java/io/PrintStream/println(D)V');
    });

    it('Expressão com agrupamento', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['escreva((1 + 2) * 3)']);
        expect(resultado).toContain('iadd');
        expect(resultado).toContain('imul');
    });
});
