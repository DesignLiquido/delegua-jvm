/// <reference types="jest" />
import { CompiladorJvm } from '../fontes/compilador-jvm';

describe('CompiladorJvm - Classes', () => {
    it('Classe com campos e construtor gera .field e <init>', async () => {
        const compilador = new CompiladorJvm();
        await compilador.compilar([
            'classe Pessoa {',
            '    nome: texto',
            '    idade: inteiro',
            '',
            '    construtor(nome: texto, idade: inteiro) {',
            '        isto.nome = nome',
            '        isto.idade = idade',
            '    }',
            '}',
            'var p = Pessoa("Ana", 30)',
        ]);
        const classeTexto = compilador.obterClassesGeradas().get('Pessoa');
        expect(classeTexto).toBeTruthy();
        expect(classeTexto).toContain('.class public Pessoa');
        expect(classeTexto).toContain('.super java/lang/Object');
        expect(classeTexto).toContain('.field public nome Ljava/lang/String;');
        expect(classeTexto).toContain('.field public idade I');
        expect(classeTexto).toContain('.method public <init>(Ljava/lang/String;I)V');
        expect(classeTexto).toContain('putfield Pessoa/nome Ljava/lang/String;');
        expect(classeTexto).toContain('putfield Pessoa/idade I');
    });

    it('Instanciação usa new/dup/invokespecial <init>', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar([
            'classe Pessoa {',
            '    nome: texto',
            '    construtor(nome: texto) {',
            '        isto.nome = nome',
            '    }',
            '}',
            'var p = Pessoa("Ana")',
        ]);
        expect(resultado).toContain('new Pessoa');
        expect(resultado).toContain('dup');
        expect(resultado).toContain('invokespecial Pessoa/<init>(Ljava/lang/String;)V');
    });

    it('Classe sem construtor explícito ganha <init>()V trivial', async () => {
        const compilador = new CompiladorJvm();
        await compilador.compilar(['classe Contador {', '    valor: inteiro', '}', 'var c = Contador()']);
        const classeTexto = compilador.obterClassesGeradas().get('Contador');
        expect(classeTexto).toContain('.method public <init>()V');
        expect(classeTexto).toContain('invokespecial java/lang/Object/<init>()V');
    });

    it('Método de instância usa aload_0 para isto e invokevirtual na chamada', async () => {
        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar([
            'classe Pessoa {',
            '    nome: texto',
            '    construtor(nome: texto) {',
            '        isto.nome = nome',
            '    }',
            '    apresentar(): texto {',
            '        retorna isto.nome',
            '    }',
            '}',
            'var p = Pessoa("Ana")',
            'escreva(p.apresentar())',
        ]);
        const classeTexto = compilador.obterClassesGeradas().get('Pessoa');
        expect(classeTexto).toContain('.method public apresentar()Ljava/lang/String;');
        expect(classeTexto).toContain('aload_0');
        expect(classeTexto).toContain('getfield Pessoa/nome Ljava/lang/String;');
        expect(classeTexto).toContain('areturn');
        expect(resultado).toContain('invokevirtual Pessoa/apresentar()Ljava/lang/String;');
    });

    it('Herança: construtor filho chama super() via invokespecial', async () => {
        const compilador = new CompiladorJvm();
        await compilador.compilar([
            'classe Animal {',
            '    nome: texto',
            '    construtor(nome: texto) {',
            '        isto.nome = nome',
            '    }',
            '}',
            'classe Cachorro herda Animal {',
            '    construtor(nome: texto) {',
            '        super(nome)',
            '    }',
            '}',
            'var c = Cachorro("Rex")',
        ]);
        const classeTexto = compilador.obterClassesGeradas().get('Cachorro');
        expect(classeTexto).toContain('.super Animal');
        expect(classeTexto).toContain('invokespecial Animal/<init>(Ljava/lang/String;)V');
    });

    it('Override de método + super.metodo() usa invokespecial apontando pra superclasse', async () => {
        const compilador = new CompiladorJvm();
        await compilador.compilar([
            'classe Animal {',
            '    nome: texto',
            '    construtor(nome: texto) {',
            '        isto.nome = nome',
            '    }',
            '    falar(): texto {',
            '        retorna isto.nome',
            '    }',
            '}',
            'classe Cachorro herda Animal {',
            '    construtor(nome: texto) {',
            '        super(nome)',
            '    }',
            '    falar(): texto {',
            '        retorna super.falar()',
            '    }',
            '}',
            'var c = Cachorro("Rex")',
        ]);
        const classeTexto = compilador.obterClassesGeradas().get('Cachorro');
        expect(classeTexto).toContain('invokespecial Animal/falar()Ljava/lang/String;');
    });

    it('Herança sem super() explícito e sem construtor no-arg na superclasse lança ErroCompilador', async () => {
        const compilador = new CompiladorJvm();
        await expect(
            compilador.compilar([
                'classe Animal {',
                '    nome: texto',
                '    construtor(nome: texto) {',
                '        isto.nome = nome',
                '    }',
                '}',
                'classe Cachorro herda Animal {',
                '    latir() {',
                '        escreva("au")',
                '    }',
                '}',
            ])
        ).rejects.toThrow(/construtor sem argumentos/);
    });

    it('Herança múltipla lança ErroCompilador', async () => {
        const compilador = new CompiladorJvm();
        await expect(
            compilador.compilar(['classe A {', '}', 'classe B {', '}', 'classe C herda A, B {', '}'])
        ).rejects.toThrow(/herança múltipla/);
    });

    it('Propriedade sem tipo explícito não é aceita pelo parser (linha exige tipo)', async () => {
        // A gramática de `classe` do parser já exige `nome: tipo` (sem tipo é erro de sintaxe).
        const compilador = new CompiladorJvm();
        await expect(compilador.compilar(['classe X {', '    campo', '}'])).rejects.toThrow();
    });
});
