/// <reference types="jest" />
import { CompiladorJvm } from '../fontes/compilador-jvm';

describe('CompiladorJvm - Controle de fluxo', () => {
    it('Comparação de inteiros gera if_icmp e valor lógico', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['escreva(1 < 2)']);
        expect(resultado).toContain('if_icmplt');
        expect(resultado).toContain('invokevirtual java/io/PrintStream/println(Z)V');
    });

    it('Comparação com numero usa dcmpg', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['escreva(1.5 >= 1)']);
        expect(resultado).toContain('dcmpg');
        expect(resultado).toContain('ifge');
    });

    it('Comparação de texto usa String.equals', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['escreva("a" == "b")']);
        expect(resultado).toContain('invokevirtual java/lang/String/equals(Ljava/lang/Object;)Z');
    });

    it('Operador lógico e/ou faz curto-circuito', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['escreva(verdadeiro e falso)']);
        expect(resultado).toContain('ifeq');
        expect(resultado).toMatch(/iconst_1[\s\S]*ifeq/);
    });

    it('Negação lógica usa ixor', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['escreva(!verdadeiro)']);
        expect(resultado).toContain('ixor');
    });

    it('se/senao gera rótulos e ifeq', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['se (1 < 2) {', '    escreva("sim")', '} senao {', '    escreva("nao")', '}']);
        expect(resultado).toContain('ifeq');
        expect(resultado).toContain('ldc "sim"');
        expect(resultado).toContain('ldc "nao"');
        expect(resultado).toContain('goto');
    });

    it('senao se encadeia como se aninhado', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar([
            'se (1 > 2) {',
            '    escreva("a")',
            '} senao se (2 > 1) {',
            '    escreva("b")',
            '} senao {',
            '    escreva("c")',
            '}',
        ]);
        expect(resultado).toContain('ldc "a"');
        expect(resultado).toContain('ldc "b"');
        expect(resultado).toContain('ldc "c"');
    });

    it('enquanto gera rótulo de início, condição e goto de volta', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var i = 0', 'enquanto (i < 3) {', '    escreva(i)', '    i = i + 1', '}']);
        expect(resultado).toMatch(/Lenquanto_inicio\d+:/);
        expect(resultado).toContain('if_icmplt');
        expect(resultado).toContain('istore 1');
        expect(resultado).toMatch(/goto Lenquanto_inicio\d+/);
    });

    it('para com i++ usa iinc no incremento', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['para (var i = 0; i < 3; i++) {', '    escreva(i)', '}']);
        expect(resultado).toContain('iinc 1 1');
        expect(resultado).toMatch(/Lpara_incremento\d+:/);
    });

    it('continua salta para o topo do laço mais interno', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['enquanto (verdadeiro) {', '    continua', '}']);
        expect(resultado).toMatch(/goto Lenquanto_inicio\d+/);
    });

    it('sustar salta para o fim do laço mais interno', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['enquanto (verdadeiro) {', '    sustar', '}']);
        expect(resultado).toMatch(/goto Lenquanto_fim\d+/);
    });

    // O parser da linguagem já rejeita `continua`/`sustar` fora de laço antes de chegar
    // ao compilador; estes testes exercitam a guarda defensiva do próprio visitante.
    it('continua fora de laço lança ErroCompilador', async () => {
        const compilador = new CompiladorJvm();
        await compilador.compilar(['']);
        await expect((compilador as any).visitarExpressaoContinua({})).rejects.toThrow(/fora de um laço/);
    });

    it('sustar fora de laço lança ErroCompilador', async () => {
        const compilador = new CompiladorJvm();
        await compilador.compilar(['']);
        await expect((compilador as any).visitarExpressaoSustar({})).rejects.toThrow(/fora de um laço/);
    });

    it('escolha gera comparações por caso e cai adiante sem sustar', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar([
            'var x = 2',
            'escolha (x) {',
            '    caso 1:',
            '        escreva("um")',
            '        sustar',
            '    caso 2:',
            '        escreva("dois")',
            '        sustar',
            '    padrao:',
            '        escreva("outro")',
            '}',
        ]);
        expect(resultado).toContain('if_icmpeq');
        expect(resultado).toContain('ldc "um"');
        expect(resultado).toContain('ldc "dois"');
        expect(resultado).toContain('ldc "outro"');
        expect(resultado).toMatch(/goto Lescolha_fim\d+/);
    });

    it('atribuição a variável existente reusa o slot', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var x = 1', 'x = 2', 'escreva(x)']);
        expect(resultado).toContain('istore 1');
        expect((resultado.match(/istore 1/g) || []).length).toBe(2);
    });
});
