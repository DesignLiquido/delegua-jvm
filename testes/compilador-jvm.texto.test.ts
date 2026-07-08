/// <reference types="jest" />
import { CompiladorJvm } from '../fontes/compilador-jvm';

describe('CompiladorJvm - Texto (métodos nativos)', () => {
    it('maiusculo/minusculo/aparar/tamanho mapeiam 1:1 pra String', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar([
            'var t = "  ola  "',
            'escreva(t.maiusculo())',
            'escreva(t.minusculo())',
            'escreva(t.aparar())',
            'escreva(t.apararInicio())',
            'escreva(t.apararFim())',
            'escreva(t.tamanho())',
        ]);
        expect(resultado).toContain('invokevirtual java/lang/String/toUpperCase()Ljava/lang/String;');
        expect(resultado).toContain('invokevirtual java/lang/String/toLowerCase()Ljava/lang/String;');
        expect(resultado).toContain('invokevirtual java/lang/String/strip()Ljava/lang/String;');
        expect(resultado).toContain('invokevirtual java/lang/String/stripLeading()Ljava/lang/String;');
        expect(resultado).toContain('invokevirtual java/lang/String/stripTrailing()Ljava/lang/String;');
        expect(resultado).toContain('invokevirtual java/lang/String/length()I');
    });

    it('inclui/terminaCom/substituir mapeiam pra métodos de String com CharSequence', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar([
            'var t = "ola mundo"',
            'escreva(t.inclui("mundo"))',
            'escreva(t.terminaCom("do"))',
            'escreva(t.substituir("ola", "oi"))',
        ]);
        expect(resultado).toContain('invokevirtual java/lang/String/contains(Ljava/lang/CharSequence;)Z');
        expect(resultado).toContain('invokevirtual java/lang/String/endsWith(Ljava/lang/String;)Z');
        expect(resultado).toContain(
            'invokevirtual java/lang/String/replace(Ljava/lang/CharSequence;Ljava/lang/CharSequence;)Ljava/lang/String;'
        );
    });

    it('encontrar/fatiar/subtexto exigem índices inteiros e usam indexOf/substring', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar([
            'var t = "ola mundo"',
            'escreva(t.encontrar("mundo"))',
            'escreva(t.fatiar(1, 3))',
            'escreva(t.subtexto(1, 3))',
        ]);
        expect(resultado).toContain('invokevirtual java/lang/String/indexOf(Ljava/lang/String;)I');
        expect(resultado).toContain('invokevirtual java/lang/String/substring(II)Ljava/lang/String;');
    });

    it('inverter usa StringBuilder', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var t = "abc"', 'escreva(t.inverter())']);
        expect(resultado).toContain('new java/lang/StringBuilder');
        expect(resultado).toContain('invokevirtual java/lang/StringBuilder/reverse()Ljava/lang/StringBuilder;');
        expect(resultado).toContain('invokevirtual java/lang/StringBuilder/toString()Ljava/lang/String;');
    });

    it('tudoMaiusculo/tudoMinusculo comparam com toUpperCase/toLowerCase via equals', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var t = "ABC"', 'escreva(t.tudoMaiusculo())']);
        expect(resultado).toContain('invokevirtual java/lang/String/toUpperCase()Ljava/lang/String;');
        expect(resultado).toContain('invokevirtual java/lang/String/equals(Ljava/lang/Object;)Z');
    });

    it('concatenar encadeia String.concat por argumento', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var t = "a"', 'escreva(t.concatenar("b", "c"))']);
        const ocorrencias = (resultado.match(/invokevirtual java\/lang\/String\/concat\(Ljava\/lang\/String;\)Ljava\/lang\/String;/g) || [])
            .length;
        expect(ocorrencias).toBe(2);
    });

    it('dividir retorna vetor de texto via Arrays.asList + ArrayList', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var t = "a,b,c"', 'var partes = t.dividir(",")', 'escreva(partes[0])']);
        expect(resultado).toContain('invokevirtual java/lang/String/split(Ljava/lang/String;)[Ljava/lang/String;');
        expect(resultado).toContain('invokestatic java/util/Arrays/asList([Ljava/lang/Object;)Ljava/util/List;');
        expect(resultado).toContain('invokespecial java/util/ArrayList/<init>(Ljava/util/Collection;)V');
    });

    it('particao gera ramo encontrado/não encontrado e retorna tupla', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(['var t = "a b"', 'var p = t.particao(" ")', 'escreva(p[0])']);
        expect(resultado).toContain('anewarray java/lang/Object');
        expect(resultado).toMatch(/Lparticao_naoencontrado\d+:/);
        expect(resultado).toMatch(/Lparticao_fim\d+:/);
    });

    it('Método de texto com número de argumentos errado lança ErroCompilador', async () => {
        const compilador = new CompiladorJvm();
        await expect(compilador.compilar(['var t = "abc"', 'escreva(t.inclui())'])).rejects.toThrow(/espera 1 argumento/);
    });

    it('Argumento de tipo errado em método de texto lança ErroCompilador', async () => {
        const compilador = new CompiladorJvm();
        await expect(compilador.compilar(['var t = "abc"', 'escreva(t.fatiar("x"))'])).rejects.toThrow(/precisa ser inteiro/);
    });

    it('Método de texto desconhecido lança ErroCompilador', async () => {
        const compilador = new CompiladorJvm();
        await expect(compilador.compilar(['var t = "abc"', 'escreva(t.metodoQueNaoExiste())'])).rejects.toThrow();
    });

    it('Método não implementado para outros tipos primitivos lança ErroCompilador', async () => {
        const compilador = new CompiladorJvm();
        await expect(compilador.compilar(['var v = [1, 2, 3]', 'escreva(v.tamanho())'])).rejects.toThrow();
    });
});

describe('CompiladorJvm - FormatacaoEscrita (construto não alcançável pelo parser atual)', () => {
    // `FormatacaoEscrita` nunca é instanciado por avaliador-sintatico.js nesta versão do
    // parser (mesma categoria de achado dos construtos "não alcançáveis" da Fase 5). O
    // teste abaixo chama o visitante diretamente pra provar que a geração de código está
    // correta, mesmo sem um programa `.delegua` real que a exercite hoje.
    it('visitarExpressaoFormatacaoEscrita com casasDecimais usa String.format', async () => {
        const compilador = new CompiladorJvm();
        await compilador.compilar(['var x = 3.14159']);
        const { FormatacaoEscrita, Variavel } = require('@designliquido/delegua');
        const construto = new FormatacaoEscrita(-1, 0, new Variavel(-1, { lexema: 'x' }), 0, 2);
        const resultado = await (compilador as any).visitarExpressaoFormatacaoEscrita(construto);
        expect(resultado).toBe('texto');
        const jasmin = (compilador as any).instrucoes.join('\n');
        expect(jasmin).toContain('invokestatic java/lang/String/format(Ljava/lang/String;[Ljava/lang/Object;)Ljava/lang/String;');
        expect(jasmin).toContain('ldc "%.2f"');
    });
});
