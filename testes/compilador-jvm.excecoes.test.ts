/// <reference types="jest" />
import { CompiladorJvm } from '../fontes/compilador-jvm';

describe('CompiladorJvm - Exceções', () => {
    it('falhar lança RuntimeException com a mensagem convertida pra texto', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['falhar "deu ruim"']);
        expect(resultado).toContain('new java/lang/RuntimeException');
        expect(resultado).toContain('ldc "deu ruim"');
        expect(resultado).toContain('invokespecial java/lang/RuntimeException/<init>(Ljava/lang/String;)V');
        expect(resultado).toContain('athrow');
    });

    it('falhar com número converte pra texto via String.valueOf antes de lançar', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['falhar 42']);
        expect(resultado).toContain('invokestatic java/lang/String/valueOf(I)Ljava/lang/String;');
        expect(resultado).toContain('athrow');
    });

    it('tente/pegue gera .catch de RuntimeException e liga o parâmetro à mensagem', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['tente {', '    falhar "erro"', '} pegue (erro) {', '    escreva(erro)', '}']);
        expect(resultado).toMatch(/\.catch java\/lang\/RuntimeException from Ltente_inicio\d+ to Ltente_fim\d+ using Lpegue_inicio\d+/);
        expect(resultado).toContain('invokevirtual java/lang/RuntimeException/getMessage()Ljava/lang/String;');
        expect(resultado).toContain('invokevirtual java/io/PrintStream/println(Ljava/lang/String;)V');
    });

    it('finalmente duplica o corpo no caminho normal e no handler de relançamento', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar([
            'tente {',
            '    escreva("a")',
            '} pegue (erro) {',
            '    escreva("b")',
            '} finalmente {',
            '    escreva("c")',
            '}',
        ]);
        const ocorrenciasFinally = (resultado.match(/ldc "c"/g) || []).length;
        expect(ocorrenciasFinally).toBe(2);
        expect(resultado).toMatch(/\.catch java\/lang\/Throwable from Ltente_inicio\d+ to Lfinalmente_excecao\d+ using Lfinalmente_excecao\d+/);
        expect(resultado).toContain('athrow');
    });

    it('tente sem pegue com finalmente ainda gera o catch-all de relançamento', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['tente {', '    escreva("x")', '} finalmente {', '    escreva("y")', '}']);
        expect(resultado).not.toContain('java/lang/RuntimeException from');
        expect(resultado).toMatch(/\.catch java\/lang\/Throwable from/);
    });

    it('senao só é alcançado por goto do caminho de sucesso, nunca do pegue', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar([
            'tente {',
            '    escreva("a")',
            '} pegue (erro) {',
            '    escreva("b")',
            '} senao {',
            '    escreva("c")',
            '}',
        ]);
        expect(resultado).toContain('ldc "c"');
        expect(resultado).toMatch(/goto Ltente_senao\d+/);
    });

    it('Múltiplos blocos pegue lançam ErroCompilador', async () => {
        const compilador = new CompiladorJvm();
        await expect(
            compilador.compilar([
                'tente {',
                '    falhar "x"',
                '} pegue (a) {',
                '    escreva(a)',
                '} pegue (b) {',
                '    escreva(b)',
                '}',
            ])
        ).rejects.toThrow(/Múltiplos blocos 'pegue'/);
    });

    it('tente sem pegue nem finalmente compila (embora inútil) sem gerar catch nenhum', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['tente {', '    escreva("a")', '}']);
        expect(resultado).not.toContain('.catch');
    });
});
