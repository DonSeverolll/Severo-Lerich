# Severo App — PC (Windows) e Android

Assistente de IA pessoal com tema dourado e um **orbe Morph** como ícone central de interação:
toque no orbe, fale, e o Severo responde (em texto e em voz). No PC ele também é um **agente** que executa
comandos no PowerShell e lê/cria/edita arquivos, sempre mostrando cada ação e pedindo sua aprovação.

- Interface inspirada no [OpenJarvis](https://github.com/open-jarvis/OpenJarvis) (Apache-2.0): barra lateral de
  conversas, chat em streaming com Markdown/código, cards de ferramentas.
- Orbe inspirado em ["Morph." (acream motion)](https://www.inspora.design/posts/morph-shap), recriado em dourado
  com CSS animado e reativo ao microfone.
- Sistema de design em [DESIGN.md](DESIGN.md) (formato TypeUI/design-md-chrome), definido com as skills
  ui-ux-pro-max, design-taste-frontend, redesign-existing-projects e design-motion-principles: um único acento
  dourado sobre neutros stone, temas claro e escuro (ou do sistema), Geist + Geist Mono, ícones Phosphor,
  animações com Motion que respeitam "reduzir movimento" e contraste AA verificado nos dois temas.
- **Fallback de LLM** portado do `llm_fallback.py`: Groq → Cerebras → Gemini → Mistral → OpenRouter.
  Provedores sem chave são pulados; em qualquer falha (limite, erro, modelo indisponível) passa para o próximo.
  Várias chaves por provedor (separadas por vírgula) fazem rotação. Ordem, modelos e provedores extras
  (Ollama, LM Studio, gateway próprio) são editáveis em Configurações.

## Baixar

Vá em **[Releases](https://github.com/DonSeverolll/Severo-Lerich/releases)**:

| Plataforma | Arquivo |
|---|---|
| Windows 10/11 | `Severo_x.y.z_x64-setup.exe` (ou `.msi`) |
| Android 7+ | `Severo_x.y.z_android.apk` — permita "instalar apps desconhecidos" |

Na primeira abertura, vá em **Configurações** e cole ao menos uma chave (todas gratuitas):
[Groq](https://console.groq.com/keys) · [Cerebras](https://cloud.cerebras.ai/) ·
[Gemini](https://aistudio.google.com/app/apikey) · [Mistral](https://console.mistral.ai/api-keys) ·
[OpenRouter](https://openrouter.ai/keys). Para a **voz**, a chave da Groq é necessária (Whisper gratuito).

As chaves e conversas ficam salvas **somente no aparelho**; nada passa por servidor nosso.

## Como funciona

| | PC (Windows) | Android |
|---|---|---|
| Chat com fallback e streaming | ✓ | ✓ |
| Orbe de voz (Whisper da Groq) | ✓ | ✓ |
| Resposta falada | ✓ (vozes do Windows) | quando o sistema oferece síntese de voz |
| Agente: PowerShell, arquivos, busca | ✓ com aprovação por ação | — |

Ferramentas do agente no PC: `execute_command` (PowerShell com saída ao vivo, timeout e encerramento da árvore
de processos), `write_file`, `read_file` (paginado), `edit_file_diff` (search & replace exato, atômico, com diff),
`list_directory` e `file_search` (glob/grep), ignorando `node_modules`, `.git`, `venv` etc.

## Desenvolvimento

Requisitos: Node 22+. Para o app nativo: [Rust](https://rustup.rs) e os
[pré-requisitos do Tauri](https://v2.tauri.app/start/prerequisites/) (no Android: JDK 17, Android SDK e NDK).

```powershell
cd app
npm install
npm run dev            # interface no navegador (http://localhost:5173), sem as ferramentas do PC
npx tauri dev          # app desktop com agente
npx tauri android init # uma vez, depois:
npx tauri android dev  # celular/emulador conectado
```

### Builds e releases (GitHub Actions)

[.github/workflows/app.yml](../.github/workflows/app.yml) compila o instalador do Windows e o APK:

- todo push em `main` que altere `app/` gera os instaláveis como artefatos do run;
- uma tag `vX.Y.Z` publica uma **Release** com os arquivos para download.

```powershell
git tag v0.1.0
git push origin v0.1.0
```

**Assinatura do APK:** sem configuração, cada build usa uma chave temporária (para atualizar será preciso
desinstalar a versão anterior). Para uma chave fixa, crie os secrets do repositório `ANDROID_KEYSTORE_B64`
(keystore em base64), `ANDROID_KEYSTORE_PASSWORD` e `ANDROID_KEY_ALIAS`.

## Estrutura

```
app/
├── src/
│   ├── App.tsx                 # layout: barra lateral + chat/configurações
│   ├── index.css               # tokens dos temas claro/escuro + orbe Morph (CSS)
│   ├── components/             # Orb, Sidebar, ChatArea, MessageBubble, ToolCallCard, InputArea, SettingsPage
│   └── lib/
│       ├── llm.ts              # fallback entre provedores (streaming + tool calling)
│       ├── providers.ts        # ordem padrão (do llm_fallback.py)
│       ├── agent.ts            # loop ReAct com aprovação
│       ├── tools/              # ferramentas do PC
│       ├── voice.ts            # gravação, Whisper, fala
│       ├── voice-flow.ts       # toque no orbe → ouvir → transcrever → responder → falar
│       └── store.ts            # estado persistido no aparelho
└── src-tauri/                  # app nativo (Tauri 2): plugins http/shell + comandos de arquivo em Rust
```
