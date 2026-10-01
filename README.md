# Severo

Agente autônomo de IA para o terminal, feito para Windows (funciona também em Linux/macOS).
Recebe um objetivo, decide quais ferramentas usar, executa no seu PC (PowerShell, arquivos, buscas),
observa o resultado e repete até concluir — o padrão **ReAct** com *tool calling* da OpenAI.

Consome qualquer gateway compatível com `POST /v1/chat/completions` (LiteLLM, OpenRouter, proxy próprio…)
com **rotação automática de chaves** em erro 429/5xx.

## Instalação

Requisitos: Node.js 20.10+ e Git.

```powershell
git clone https://github.com/DonSeverolll/Severo-Lerich.git
cd Severo-Lerich
npm install
copy .env.example .env   # depois edite LLM_BASE_URL, LLM_API_KEYS e LLM_MODEL
npm run build
npm link                 # opcional: deixa o comando `severo` disponível globalmente
```

Sem `npm link`, rode com `npm start` (build) ou `npm run dev` (direto do TypeScript via tsx).

## Uso

```powershell
severo                                   # modo interativo (REPL)
severo -C C:\projetos\api                # define o diretório de trabalho
severo "crie um script que liste os 10 maiores arquivos desta pasta"   # one-shot
severo -y "rode os testes e corrija o que falhar"                      # sem confirmações
```

| Opção | Descrição |
|---|---|
| `-y, --auto-approve` | Executa comandos e alterações sem pedir confirmação |
| `-m, --model <nome>` | Modelo (sobrescreve `LLM_MODEL`) |
| `-C, --cwd <pasta>` | Diretório de trabalho do agente |
| `--base-url <url>` | URL do gateway (sobrescreve `LLM_BASE_URL`) |
| `--shell <shell>` | `powershell` (padrão no Windows), `pwsh`, `cmd` ou `bash` |
| `--max-iterations <n>` | Máximo de ciclos por objetivo (padrão 40) |

Comandos no REPL: `/ajuda`, `/auto` (liga/desliga aprovação automática), `/modelo <nome>`, `/cd <pasta>`,
`/limpar`, `/status`, `/sair`. Termine a linha com `\` para escrever em várias linhas. **Ctrl+C** interrompe
a tarefa em andamento (mata o processo do comando, se houver); dois Ctrl+C seguidos saem.

Sem `--auto-approve`, toda ação com efeito colateral (`execute_command`, `write_file`, `edit_file_diff`) mostra
uma prévia — comando com destaque de sintaxe, conteúdo do arquivo ou diff — e pergunta
`[S]im / [n]ão / [t]odos`. Ao negar, você pode escrever uma instrução que é repassada ao agente.

## Configuração (`.env`)

Veja [.env.example](.env.example). O `.env` do diretório atual tem prioridade sobre o da pasta de instalação.

| Variável | Padrão | |
|---|---|---|
| `LLM_BASE_URL` | `http://localhost:4000/v1` | URL base do gateway |
| `LLM_API_KEYS` | — | Chaves separadas por vírgula (vazio = sem `Authorization`) |
| `LLM_MODEL` | `gpt-4o` | Modelo com suporte a tool calling |
| `LLM_TEMPERATURE` | — | Opcional |
| `LLM_STREAM` | `true` | Streaming SSE de tokens |
| `LLM_REQUEST_TIMEOUT_MS` | `120000` | Timeout de **inatividade** da conexão |
| `LLM_MAX_RETRIES` | `6` | Mínimo de tentativas (real: `max(isto, nº chaves × 2)`) |
| `LLM_EXTRA_HEADERS` | — | JSON com cabeçalhos extras para o gateway |
| `AGENT_MAX_ITERATIONS` | `40` | Ciclos por objetivo |
| `AGENT_SHELL` | `powershell` | Shell do `execute_command` |
| `COMMAND_TIMEOUT_MS` | `120000` | Timeout padrão por comando |
| `TOOL_OUTPUT_MAX_CHARS` | `30000` | Saída máxima de ferramenta enviada ao modelo (corta o meio) |
| `AGENT_AUTO_APPROVE` | `false` | Igual a `--auto-approve` |

### Rotação de chaves / fallback

- **429, 408, 409, 425, 5xx, timeout ou queda de conexão** → a chave entra em *cooldown*
  (respeita `Retry-After`; senão backoff exponencial 1s → 30s) e a próxima chave é usada.
- **401/403** → a chave é desativada até o fim da sessão.
- **400/404/422** → erro da requisição; não adianta trocar de chave, o erro é mostrado.
- Se todas as chaves estão em cooldown, o cliente espera a primeira liberar. A chave que funciona continua
  sendo usada (*sticky*) até falhar.

## Ferramentas do agente

| Ferramenta | O que faz |
|---|---|
| `execute_command` | Roda comando no PowerShell/CMD/bash com stdout/stderr **em tempo real**; retorna exit code e saídas. Usa `-EncodedCommand` (sem problemas de aspas), força UTF-8, sem stdin, timeout com kill da árvore de processos |
| `write_file` | Cria/sobrescreve arquivos em qualquer caminho, criando pastas |
| `read_file` | Lê com linhas numeradas e paginação (`offset`/`limit`); recusa binários |
| `edit_file_diff` | *Search & replace* exato, múltiplas edições atômicas, exige trecho único (ou `replace_all`), preserva CRLF |
| `list_directory` | Árvore recursiva com tamanhos, ignorando `node_modules`, `.git`, `venv`, `dist`… |
| `file_search` | `glob` por padrão de caminho ou `grep` por regex no conteúdo (com filtro `include`) |

## Estrutura

```
src/
├── index.ts              # CLI (commander), REPL, slash commands, Ctrl+C
├── agent.ts              # loop ReAct: modelo → tool_calls → execução → role:tool → repete
├── config.ts             # .env + flags
├── llm/
│   ├── client.ts         # cliente Chat Completions: streaming SSE, tool calls, rotação de chaves
│   └── types.ts
├── executor/
│   └── shell.ts          # spawn PowerShell/CMD/bash, streaming, timeout, kill tree
├── tools/
│   ├── index.ts          # registro + schemas OpenAI
│   ├── types.ts          # interface Tool, helpers de caminho
│   ├── execute_command.ts
│   ├── write_file.ts
│   ├── read_file.ts
│   ├── edit_file_diff.ts
│   ├── list_directory.ts
│   └── file_search.ts
└── ui/
    ├── terminal.ts       # spinner, logs de ações, prévias, diffs, confirmação
    ├── markdown-stream.ts# streaming com destaque de blocos ```código```
    └── highlight.ts
```

## Adicionando uma ferramenta

Crie `src/tools/minha_tool.ts` exportando um objeto `Tool` (nome, descrição, JSON Schema, `requiresApproval`,
`summarize`, `execute` e opcionalmente `preview`) e adicione-o a `ALL_TOOLS` em `src/tools/index.ts`.

## Segurança

O agente roda com as **suas** permissões de usuário. Com `--auto-approve` ele executa qualquer comando que o
modelo decidir sem perguntar — use em pastas/projetos onde isso é aceitável.
