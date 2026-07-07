/// <reference types="jest" />
import { CompiladorJvm } from '../fontes/compilador-jvm';

describe('CompiladorJvm - Base', () => {
    it('Trivial', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['']);
        expect(resultado).toBeTruthy();
        expect(resultado).toContain('.class public Programa');
        expect(resultado).toContain('.method public static main([Ljava/lang/String;)V');
    });

    it('Escreva com inteiro', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['escreva(123)']);
        expect(resultado).toContain('ldc 123');
        expect(resultado).toContain('getstatic java/lang/System/out Ljava/io/PrintStream;');
        expect(resultado).toContain('invokevirtual java/io/PrintStream/println(I)V');
    });

    it('Escreva com numero', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['escreva(1.5)']);
        expect(resultado).toContain('ldc2_w 1.5');
        expect(resultado).toContain('invokevirtual java/io/PrintStream/println(D)V');
    });

    it('Escreva com texto', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['escreva("teste")']);
        expect(resultado).toContain('ldc "teste"');
        expect(resultado).toContain('invokevirtual java/io/PrintStream/println(Ljava/lang/String;)V');
    });

    it('Escreva com logico', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['escreva(verdadeiro)']);
        expect(resultado).toContain('iconst_1');
        expect(resultado).toContain('invokevirtual java/io/PrintStream/println(Z)V');
    });

    it('Nome de classe customizado', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar([''], 'MeuPrograma');
        expect(resultado).toContain('.class public MeuPrograma');
    });
});
