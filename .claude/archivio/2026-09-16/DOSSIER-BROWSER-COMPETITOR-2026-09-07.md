# Come vedono le pagine i nostri tre concorrenti diretti — 07/09/2026

> ⛔ Owner, 07/09: «non hai fatto la ricerca sui competitor diretti di noi: quindi Hermes, Claude
> Code, Codex. Questo è importante e l'hai dimenticato». Aveva ragione: il dossier del 03/09
> (`cap-01-hermes.md`, `cap-02-claude-code.md`, `cap-03-codex.md`) **non nomina mai il browser**.
> Questo capitolo lo aggiunge, e come gli altri è **letto nel codice**, non negli articoli.
>
> Cloni a commit fissato in `%LOCALAPPDATA%\Temp\talos-competitor`.

## 1 · Hermes v0.21 — un `<webview>` di Electron, e un limite che dichiarano loro

Letto in `apps/desktop/electron/` e `apps/desktop/src/app/chat/right-rail/`:

- **Il motore è un `<webview>` di Electron**, cioè un *guest out-of-process*: una webContents di
  primo livello, non un iframe. `X-Frame-Options` e `frame-ancestors` **non la riguardano**, e i
  cookie sono quelli veri dell'utente (`session-windows.ts`: `webviewTag: true`).
- **L'annotazione** (`preview-annotate-host.ts`) inietta un overlay nel guest con
  `executeJavaScript`, e `preview-capture.ts` **ritaglia lo screenshot** dello spillo con
  `webContents.capturePage`: il commento che arriva all'agente porta anche l'immagine.
- **Finestre staccate** (`browser-windows.ts`): il Browser si sgancia in una finestra 960×720 e
  la scheda resta in archivio, così richiudendola torna al suo posto.

⛔ **Il limite lo scrivono loro, nel commento in testa a `preview-reach.ts`:**

> «The `<webview>` renders on the user's machine. The agent runs on the gateway host. So when the
> agent says "your dev server is at http://localhost:5173", that address is true *there* and
> meaningless *here*.»

La loro cura è un inoltro SSH locale→remoto; e lo dicono chiaro: **con un gateway `url`/`cloud`
non si può fare** («there is nothing to forward through»), il pannello si limita a spiegare il
disallineamento.

## 2 · Claude Code — non renderizza niente: guida il Chrome dell'utente

Dal `CHANGELOG.md` del clone e dagli internals dell'estensione (v1.0.56):

- **Claude in Chrome**: un'estensione più un *native messaging host*
  (`com.anthropic.claude_code_browser_extension`) che parla con la CLI. Non c'è nessuna vista
  dentro l'app: le pagine stanno nel **Chrome vero dell'utente**.
- Una sessione possiede un **gruppo di schede** (`/clear` chiude il gruppo, `/resume` chiude i
  gruppi vuoti), `tabs_context` dice all'agente quale `tabId` toccare, e `browser_batch` manda
  più azioni in un colpo.
- **Le azioni del browser passano dai permessi di Claude Code** (changelog: prima usavano i
  prompt dell'estensione), e c'è una allowlist di domini.
- Costo: l'estensione chiede ~14 permessi, fra cui `debugger` e `scripting`, e **ogni apertura
  del pannello cattura la scheda attiva** dentro la conversazione — non filtrata.

## 3 · Codex — tre superfici, e un crash noto proprio sul nostro caso

- Il suo `codex-self-knowledge.md` elenca le superfici del prodotto e ne nomina tre che ci
  riguardano: **«in-app browser testing»**, **«the user's existing Chrome session»**, **«desktop
  Computer Use»**.
- L'in-app browser è una **vista condivisa**: si carica una pagina o un dev server locale e ci si
  attaccano **commenti visivi** — la stessa idea del nostro pannello «Commenti sulla pagina».
  Con il plugin Browser attivo, Codex clicca, digita, ispeziona il DOM, scatta e verifica.
- ⛔ **Issue openai/codex #32040 (2026), Windows**: aprire l'in-app Browser su una applicazione
  locale **blocca o chiude l'app** — il ciclo arriva all'attach del webview e alla navigazione su
  localhost, poi il PiP fallisce. È esattamente la nostra piattaforma e il nostro caso d'uso.

## 4 · Dove siamo noi, e come si passa avanti

**Il pareggio.** Tutti e tre usano un **browser vero** (webview di Electron, o il Chrome
dell'utente). Noi siamo gli unici a incorniciare col tag `<iframe>`: è la ragione tecnica, non
estetica, del riquadro grigio su github. Finché resta un iframe, «ogni pagina» è una promessa che
non possiamo mantenere. ⇒ La via **B** (Chromium pilotato) non è un lusso: è il pareggio.

**I tre sorpassi, e sono strutturali.**

1. **Il browser sta dove sta l'agente.** Hermes ammette nel proprio codice che il suo webview è
   sulla macchina dell'utente mentre l'agente è sul gateway, e che con un gateway cloud il
   problema **non ha soluzione**. Da noi il Chromium lo apre il **server**, cioè lo stesso posto
   dove gira l'agente e dove vive il dev server: `localhost:5173` è vero per tutti e due, sempre,
   senza tunnel e senza spiegazioni all'utente.
2. **Nessuna estensione, nessuna scheda personale.** Claude Code chiede `debugger` su Chrome e si
   porta in conversazione ciò che c'è nelle schede del gruppo. Noi apriamo un **profilo nostro**,
   separato: TALOS non vede la posta né le schede di chi lo usa, e non c'è niente da installare.
3. **Pixel + DOM + testo, insieme.** Browserbase e Steel danno i pixel; Hermes dà DOM e ritaglio;
   Codex dà i commenti. Con lo screencast CDP più l'overlay iniettato via CDP diamo le tre cose
   nella stessa scheda: si guarda la pagina viva, ci si mettono gli spilli sul DOM vero
   (selettore stabile, HTML, stili, errori di console) e il testo va al modello — e il pacchetto
   dei commenti **non parte mai da solo**, come già oggi.

**E il rischio da non ripetere.** Codex crasha su Windows aprendo l'in-app browser su localhost.
La nostra via B non incorpora niente nella UI: il browser è un **processo separato**, la pagina
arriva come stream. Se muore, muore il processo — non la app.

## Fonti

Codice, nei cloni: `hermes-agent-v21/apps/desktop/electron/{preview-reach,preview-capture,browser-windows,session-windows}.ts`,
`.../right-rail/preview-annotate-host.ts` · `claude-code/CHANGELOG.md` (righe su Claude in Chrome,
`browser_batch`, tab group, permessi) · `codex/codex-rs/skills/src/assets/samples/openai-docs/references/codex-self-knowledge.md`.
Web, 07/09/2026: gist «Claude for Chrome Extension Internals (v1.0.56)» · openai/codex issue #32040 ·
openai.com «Codex for (almost) everything» · docs.browserbase.com «Session live view» ·
developers.cloudflare.com «Browser Run — Live View» · playwright.dev «Browsers» ·
brave.com «Comet prompt injection».
