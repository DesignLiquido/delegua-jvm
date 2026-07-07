#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

import { CompiladorJvm } from './compilador-jvm';
import { ErroCompilador } from './erros/erro-compilador';

function localizarJasmin(): string | undefined {
    const candidato = process.env.JASMIN_JAR;
    if (candidato && fs.existsSync(candidato)) return candidato;
    const local = path.join(__dirname, '..', 'ferramentas', 'jasmin.jar');
    if (fs.existsSync(local)) return local;
    return undefined;
}

function capitalizar(nome: string): string {
    return nome.charAt(0).toUpperCase() + nome.slice(1);
}

async function principal() {
    const args = process.argv.slice(2);
    const arquivoEntrada = args[0];

    if (!arquivoEntrada || !fs.existsSync(arquivoEntrada)) {
        console.log('Uso: npx @designliquido/delegua-jvm <arquivo.delegua>');
        process.exit(1);
    }

    const conteudo = fs.readFileSync(arquivoEntrada, 'utf-8');
    const codigo = conteudo.split('\n');
    const nomeBase = capitalizar(path.basename(arquivoEntrada, path.extname(arquivoEntrada)));
    const diretorioSaida = path.dirname(arquivoEntrada);
    const caminhoJ = path.join(diretorioSaida, `${nomeBase}.j`);

    const compilador = new CompiladorJvm();

    try {
        console.log('Gerando bytecode JVM (Jasmin)...');
        const jasmin = await compilador.compilar(codigo, nomeBase);
        fs.writeFileSync(caminhoJ, jasmin);
        console.log(`Jasmin gerado: ${caminhoJ}`);

        const caminhoJasminJar = localizarJasmin();
        if (!caminhoJasminJar) {
            console.log('');
            console.log('Aviso: jasmin.jar não encontrado. O arquivo .j foi gerado,');
            console.log('mas não foi montado em um .class.');
            console.log('');
            console.log('Defina a variável de ambiente JASMIN_JAR apontando para o jasmin.jar,');
            console.log('ou coloque-o em ./ferramentas/jasmin.jar.');
            return;
        }

        console.log('Montando .class...');
        execSync(`java -jar "${caminhoJasminJar}" -d "${diretorioSaida}" "${caminhoJ}"`, { stdio: 'inherit' });
        console.log(`Classe gerada: ${path.join(diretorioSaida, `${nomeBase}.class`)}`);
    } catch (erro: any) {
        if (erro instanceof ErroCompilador) {
            console.error(`erro: ${erro.message}`);
        } else {
            console.error('Erro interno durante compilação:');
            console.error(erro.message || erro);
        }
        process.exit(1);
    }
}

principal();
