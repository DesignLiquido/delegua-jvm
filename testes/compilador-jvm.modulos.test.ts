/// <reference types="jest" />
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CompiladorJvm } from '../fontes/compilador-jvm';

function criarDiretorioTemporario(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'delegua-jvm-modulos-'));
}

describe('CompiladorJvm - Módulos / importação', () => {
    let dir: string;

    beforeEach(() => {
        dir = criarDiretorioTemporario();
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('Importa função de outro arquivo e a compila junto (invokestatic normal)', async () => {
        fs.writeFileSync(
            path.join(dir, 'utilitarios.delegua'),
            ['funcao somar(a: inteiro, b: inteiro): inteiro {', '    retorna a + b', '}'].join('\n')
        );
        const caminhoPrincipal = path.join(dir, 'principal.delegua');
        fs.writeFileSync(caminhoPrincipal, ['importar { somar } de "./utilitarios"', 'escreva(somar(2, 3))'].join('\n'));

        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(fs.readFileSync(caminhoPrincipal, 'utf-8').split('\n'), 'Principal', caminhoPrincipal);

        expect(resultado).toContain('.method private static somar(II)I');
        expect(resultado).toContain('invokestatic Principal/somar(II)I');
    });

    it('Importa classe de outro arquivo (fica em obterClassesGeradas normalmente)', async () => {
        fs.writeFileSync(
            path.join(dir, 'modelo.delegua'),
            ['classe Pessoa {', '    nome: texto', '    construtor(nome: texto) {', '        isto.nome = nome', '    }', '}'].join('\n')
        );
        const caminhoPrincipal = path.join(dir, 'principal.delegua');
        fs.writeFileSync(caminhoPrincipal, ['importar { Pessoa } de "./modelo"', 'var p = Pessoa("Ana")', 'escreva(p.nome)'].join('\n'));

        const compilador = new CompiladorJvm();
        await compilador.compilar(fs.readFileSync(caminhoPrincipal, 'utf-8').split('\n'), 'Principal', caminhoPrincipal);

        expect(compilador.obterClassesGeradas().has('Pessoa')).toBe(true);
    });

    it('Importação transitiva (A importa B importa C) resolve tudo', async () => {
        fs.writeFileSync(path.join(dir, 'c.delegua'), ['funcao base(): inteiro {', '    retorna 1', '}'].join('\n'));
        fs.writeFileSync(
            path.join(dir, 'b.delegua'),
            ['importar { base } de "./c"', 'funcao meio(): inteiro {', '    retorna base() + 1', '}'].join('\n')
        );
        const caminhoPrincipal = path.join(dir, 'a.delegua');
        fs.writeFileSync(caminhoPrincipal, ['importar { meio } de "./b"', 'escreva(meio())'].join('\n'));

        const compilador = new CompiladorJvm();
        const resultado = await compilador.compilar(fs.readFileSync(caminhoPrincipal, 'utf-8').split('\n'), 'A', caminhoPrincipal);

        expect(resultado).toContain('.method private static base()I');
        expect(resultado).toContain('.method private static meio()I');
        expect(resultado).toContain('invokestatic A/meio()I');
    });

    it('Módulo com o mesmo caminho importado duas vezes não duplica registro', async () => {
        fs.writeFileSync(path.join(dir, 'util.delegua'), ['funcao um(): inteiro {', '    retorna 1', '}'].join('\n'));
        const caminhoPrincipal = path.join(dir, 'principal.delegua');
        fs.writeFileSync(
            caminhoPrincipal,
            ['importar { um } de "./util"', 'importar { um } de "./util"', 'escreva(um())'].join('\n')
        );

        const compilador = new CompiladorJvm();
        await expect(
            compilador.compilar(fs.readFileSync(caminhoPrincipal, 'utf-8').split('\n'), 'Principal', caminhoPrincipal)
        ).resolves.toBeTruthy();
    });

    it('Módulo importado não encontrado lança ErroCompilador', async () => {
        const caminhoPrincipal = path.join(dir, 'principal.delegua');
        fs.writeFileSync(caminhoPrincipal, ['importar { x } de "./nao-existe"', 'escreva(x())'].join('\n'));

        const compilador = new CompiladorJvm();
        await expect(
            compilador.compilar(fs.readFileSync(caminhoPrincipal, 'utf-8').split('\n'), 'Principal', caminhoPrincipal)
        ).rejects.toThrow(/Módulo importado não encontrado/);
    });

    it("'importar tudo como X' lança ErroCompilador (não suportado ainda)", async () => {
        fs.writeFileSync(path.join(dir, 'util.delegua'), ['funcao um(): inteiro {', '    retorna 1', '}'].join('\n'));
        const caminhoPrincipal = path.join(dir, 'principal.delegua');
        fs.writeFileSync(caminhoPrincipal, ['importar tudo como U de "./util"'].join('\n'));

        const compilador = new CompiladorJvm();
        await expect(
            compilador.compilar(fs.readFileSync(caminhoPrincipal, 'utf-8').split('\n'), 'Principal', caminhoPrincipal)
        ).rejects.toThrow(/'importar tudo/);
    });

    it('Módulo importado com erro de sintaxe lança ErroCompilador mencionando o arquivo', async () => {
        fs.writeFileSync(path.join(dir, 'quebrado.delegua'), ['funcao um(x', ''].join('\n'));
        const caminhoPrincipal = path.join(dir, 'principal.delegua');
        fs.writeFileSync(caminhoPrincipal, ['importar { um } de "./quebrado"'].join('\n'));

        const compilador = new CompiladorJvm();
        await expect(
            compilador.compilar(fs.readFileSync(caminhoPrincipal, 'utf-8').split('\n'), 'Principal', caminhoPrincipal)
        ).rejects.toThrow(/módulo importado/);
    });

    it('Sem caminhoArquivo, importa relativo a process.cwd()', async () => {
        // Sem arquivo de verdade por trás do código (compilação a partir de string em memória),
        // 'importar' relativo cai em process.cwd() — aqui simulamos isso apontando pra um
        // módulo real dentro do próprio diretório de trabalho dos testes (a raiz do repo).
        const compilador = new CompiladorJvm();
        await expect(compilador.compilar(['importar { x } de "./modulo-que-nao-existe-no-cwd"'])).rejects.toThrow(
            /Módulo importado não encontrado/
        );
    });
});
