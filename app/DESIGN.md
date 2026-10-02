---
name: design-system-severo
description: Sistema de design do app Severo (assistente de IA pessoal, PC e Android). Tokens, componentes, motion e acessibilidade. Use ao criar ou alterar qualquer tela do app.
---

<!-- Formato TypeUI DESIGN.md (bergside/design-md-chrome). Decisões tiradas das skills
     ui-ux-pro-max, design-taste-frontend, redesign-existing-projects e design-motion-principles. -->

# Severo

## Mission
Um assistente pessoal que se sente como um objeto de luxo silencioso: interface mínima, um único acento dourado
e o orbe Morph como ponto central de interação (voz, estado da IA). A interface some; a conversa e as ações do
agente ficam em primeiro plano.

## Brand
- Produto: Severo, assistente de IA pessoal com voz e agente para o PC
- Público: uso pessoal diário, em português do Brasil, no PC (Windows) e no celular (Android)
- Superfície: app nativo (Tauri) com chat em streaming, orbe de voz, cards de ferramentas e configurações
- Leitura de design: app de IA conversacional para uso diário, linguagem premium escura e discreta, com acento
  dourado; Tailwind v4 + Geist + Motion + Phosphor

## Style Foundations
- Estilo: AI-Native UI + minimalismo (ui-ux-pro-max: "AI/Chatbot Platform"). Sem grade decorativa, sem neon,
  sem texto em degradê grande. Textura apenas como grão fixo e quase invisível.
- Dials (design-taste-frontend): VARIANCE 4, MOTION 5, DENSITY 4 (produto de uso diário, não landing page).
- Tema: `system` por padrão, com `dark` e `light` completos (seletor em Configurações). Uma família de cinza
  (stone, quente). Nunca `#000` ou `#fff` puros como fundo.

### Cores (tokens semânticos)
| Token | Escuro | Claro | Uso |
|---|---|---|---|
| `--bg` | `#0c0a09` | `#fafaf9` | fundo do app |
| `--bg-raised` | `#141210` | `#ffffff` | barra lateral, compositor |
| `--surface` | `#1c1917` | `#f5f5f4` | cards, blocos de código |
| `--line` | `rgb(214 211 209 / .10)` | `rgb(28 25 23 / .10)` | divisórias |
| `--line-strong` | `rgb(214 211 209 / .18)` | `rgb(28 25 23 / .18)` | bordas de controles |
| `--text` | `#f5f5f4` | `#1c1917` | texto principal |
| `--text-2` | `#a8a29e` | `#57534e` | texto secundário (≥ 4.5:1) |
| `--text-3` | `#938c86` | `#6b645e` | metadados (≥ 4.5:1) |
| `--accent` | `#e2b04a` | `#a16207` | único acento: botão primário, foco, seleção |
| `--on-accent` | `#1c1407` | `#ffffff` | texto sobre o acento |
| `--accent-soft` | `rgb(226 176 74 / .12)` | `rgb(161 98 7 / .10)` | fundo de item ativo |
| `--danger` | `#f0857a` | `#b91c1c` | erro, ação destrutiva |
| `--success` | `#86c48a` | `#15803d` | ferramenta concluída |
| `--warning` | `#e9b45f` | `#a16207` | aguardando aprovação |

O dourado rico em degradê é exclusivo do orbe (marca). Nenhum outro elemento usa degradê dourado.

### Tipografia
- Sans: Geist Variable. Mono: Geist Mono Variable (código, comandos, números de latência).
- Escala: 12 (meta) · 13 (rótulos) · 14 (UI) · 16 (texto do chat, base) · 20 (títulos de seção) · 28/34 (saudação).
- Pesos: 400 texto, 500 rótulos, 600 títulos. Títulos com `letter-spacing: -0.02em` e `text-wrap: balance`.
- Sentence case em tudo. Sem rótulos em caixa alta com tracking largo.

### Espaçamento
Ritmo de 4/8 px: 4, 8, 12, 16, 24, 32, 48. Coluna do chat com no máximo 720 px.

### Forma (lock)
- Controles interativos (botões, chips, toggles, botão de enviar, botões de ícone): pílula (`9999px`).
- Superfícies (cards, compositor, bolhas, painéis): `18px`. Bolha do usuário: canto inferior direito `6px`.
- Campos e blocos de código: `10px`.

### Ícones
Phosphor (`@phosphor-icons/react`), peso `regular`, tamanhos 16 (inline) e 20 (botões). Ícone decorativo ao lado
de texto: `aria-hidden`. Botão só com ícone: `aria-label` obrigatório e área de toque ≥ 44 px no celular.

### Motion
Ponderação (design-motion-principles): Jakub primário, Emil secundário, Jhey só no orbe.

| Token | Valor | Uso |
|---|---|---|
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | entradas, hover |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | mudança de estado visível |
| `--dur-fast` | `150ms` | hover, press |
| `--dur-base` | `220ms` | entradas de mensagens e cards |
| `--dur-slow` | `380ms` | gaveta, troca de tela |
| spring | `{ type: "spring", duration: 0.4, bounce: 0 }` | gaveta, cards de aprovação |

- Entrada: opacidade 0→1, `y` 8→0, `blur` 4→0. Saída mais sutil que a entrada (`y` −4, sem blur).
- Press: `scale(0.97)` em 150 ms. Sem animação em ações de teclado e na troca de conversa (alta frequência).
- Orbe: movimento contínuo lento em repouso (é o indicador de estado da IA, não decoração); acelera ao pensar,
  reage ao microfone ao ouvir e às palavras ao falar.
- `prefers-reduced-motion: reduce`: tudo instantâneo; o orbe fica estático e o estado é indicado só pela
  intensidade do brilho.

## Accessibility
- Alvo: WCAG 2.2 AA nos dois temas.
- Foco visível em todos os controles (`outline: 2px solid var(--accent)`, offset 2 px).
- Toque mínimo de 44×44 px no celular; áreas seguras (`env(safe-area-inset-*)`) respeitadas.
- Status de streaming e de voz anunciado em região `aria-live="polite"`.
- Cor nunca é o único indicador: status de ferramenta tem ícone + texto.

## Writing Tone
Direto, calmo, em português do Brasil. Sem exclamações, sem "Oops", sem travessões (use ponto, vírgula ou dois-pontos).

## Rules: Do
- Usar só tokens semânticos; nenhum hex solto em componente.
- Definir estados: padrão, hover, foco, ativo, desabilitado, carregando, erro, vazio.
- Usar o acento apenas para ação primária, foco e seleção.
- Mostrar cada ação do agente como card com status por ícone + texto e prévia antes da aprovação.

## Rules: Don't
- Não usar degradês dourados fora do orbe, nem brilho externo em botões.
- Não usar grade de linhas decorativa, pontos de status decorativos ou rótulos em caixa alta.
- Não usar `window.confirm`/`alert`; confirmações são inline.
- Não animar `width`, `height`, `top` ou `left`; só `transform`, `opacity` e `filter`.
- Não usar emoji como ícone, nem misturar famílias de ícones.

## Component Rule Expectations
- **Barra lateral:** 272 px no desktop; gaveta com scrim no celular (spring 0.4 s). Item ativo com fundo
  `--accent-soft` e texto `--text`. Apagar conversa: botão de ícone com rótulo, visível no hover (desktop) e
  sempre no celular.
- **Mensagens:** usuário à direita em bolha `--surface`; IA à esquerda sem bolha, Markdown com código em bloco
  `--surface` e botão copiar. Ações (copiar, ouvir) com rótulo acessível.
- **Card de ferramenta (context card):** borda esquerda de 2 px na cor do status, nome da ferramenta, resumo em
  mono, latência; expande para argumentos e saída.
- **Aprovação:** card destacado com prévia (comando, arquivo ou diff) e três ações: Permitir (primária),
  Permitir nesta tarefa, Negar.
- **Compositor:** fixo no rodapé, orbe pequeno à esquerda quando há conversa, textarea que cresce até 200 px,
  enviar/parar à direita.
- **Configurações:** seções com título e divisória (sem cards empilhados), provedores como cards (entidades
  reordenáveis), confirmações destrutivas inline.

## Quality Gates
- Contraste de texto ≥ 4.5:1 nos dois temas (verificar `--text-3`).
- Zero travessões (`—`, `–`) em textos visíveis.
- Testado em 375 px, 768 px e 1280 px, nos temas claro e escuro e com movimento reduzido.
- Todo botão de ícone tem `aria-label`; todo ícone decorativo tem `aria-hidden`.
