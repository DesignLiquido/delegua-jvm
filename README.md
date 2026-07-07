# delegua-jvm

Back-end para geração de código Delégua para a JVM.

## Arquitetura

Segue a mesma arquitetura de [`delegua-llvm`](https://github.com/DesignLiquido/delegua-llvm): reaproveita o `Lexador` e o `AvaliadorSintatico` de [`@designliquido/delegua`](https://github.com/DesignLiquido/delegua) e implementa `VisitanteDeleguaInterface` para percorrer a AST diretamente. Ao invés de gerar LLVM IR, este compilador gera **bytecode JVM em formato texto Jasmin** (`.j`), que é então montado em `.class` pelo montador Jasmin.

Diferente de `delegua-llvm` (que usa bindings nativos do LLVM), este back-end usa **emissão textual**, no mesmo espírito dos `Tradutor*` de assembly (`tradutor-assembly-x64.ts`, `tradutor-webassembly.ts`) já existentes no repositório principal `delegua`.

## Estado atual (primeira fatia vertical)

Suporta apenas:

- `var` com literais (`inteiro`, `numero`, `texto`, `logico`);
- leitura de variáveis já declaradas;
- aritmética (`+ - * /`) entre `inteiro`/`numero`, com promoção para `double` quando misturados (divisão sempre produz `numero`, mesmo entre inteiros);
- `escreva(...)` com os tipos acima (via `System.out.println`).

Todo o restante da gramática (`se`/`enquanto`/`para`/`escolha`, funções, classes, vetores, `importar`, exceções, closures, FFI) ainda **não é suportado** e lança `ErroCompilador` — ver `fontes/visitante-base-nao-implementado.ts`.

## Mapeamento de tipos (nesta versão)

| Delégua    | JVM (descritor)         |
|------------|-------------------------|
| `inteiro`  | `I` (int)               |
| `numero`   | `D` (double, 2 slots)   |
| `logico`   | `Z` (int 0/1)           |
| `texto`    | `Ljava/lang/String;`    |

Os tipos são fixos e estaticamente tipados no código gerado — não há BigInt/precisão arbitrária como no interpretador dinâmico (mesma divergência deliberada adotada por `delegua-llvm`).

## Uso

```bash
yarn executar caminho/para/arquivo.delegua
```

Gera um `.j` ao lado do arquivo de entrada, com o nome da classe derivado do nome do arquivo. Se um `jasmin.jar` for encontrado (via variável de ambiente `JASMIN_JAR` ou em `./ferramentas/jasmin.jar`), também monta um `.class`.

## Pré-requisitos de toolchain

- JDK instalado (`java -version` / `javac -version`).
- [Jasmin](http://jasmin.sourceforge.net/) (`jasmin.jar`): não é incluído neste repositório. Baixe o jar e aponte `JASMIN_JAR` para ele, ou copie-o para `./ferramentas/jasmin.jar`.

## Testes

```bash
yarn testes-unitarios
```

Os testes verificam o texto Jasmin gerado diretamente (sem precisar de `jasmin.jar`/JDK instalado), no mesmo estilo de `delegua-llvm/testes/compilador-llvm.base.test.ts`.
