/// <reference types="jest" />
import { CompiladorJvm } from '../fontes/compilador-jvm';

describe('CompiladorJvm - Var', () => {
    it('Var inteiro usa slot inteiro e istore', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var x = 10']);
        expect(resultado).toContain('ldc 10');
        expect(resultado).toContain('istore 1');
        expect(resultado).toContain('.limit locals 2');
    });

    it('Var numero ocupa dois slots (double)', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var x = 3.14', 'var y = 1']);
        expect(resultado).toContain('dstore 1');
        // y deve começar no slot 3, já que x (double) ocupou os slots 1 e 2.
        expect(resultado).toContain('istore 3');
        expect(resultado).toContain('.limit locals 4');
    });

    it('Var texto usa astore', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var x = "ola"']);
        expect(resultado).toContain('ldc "ola"');
        expect(resultado).toContain('astore 1');
    });

    it('Var logico usa istore', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var x = falso']);
        expect(resultado).toContain('iconst_0');
        expect(resultado).toContain('istore 1');
    });

    it('Leitura de variável em escreva', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var x = 10', 'escreva(x)']);
        expect(resultado).toContain('istore 1');
        expect(resultado).toContain('iload 1');
        expect(resultado).toContain('invokevirtual java/io/PrintStream/println(I)V');
    });
});
