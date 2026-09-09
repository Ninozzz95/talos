# Dossier — Full access: cosa fanno i competitor, settembre 2026

> Scritto dalla sessione mobile su richiesta dell'owner. Le sue parole
> esatte, perché la sfumatura conta: *"se io parto in una cartella tipo
> avm, non posso chiedere di salvare file al di fuori di essa anche se ho
> abilitato full access... anche nel file tree dovrei poter navigare al di
> fuori della cartella scelta a prescindere se full access è attivo o no,
> adesso è un file explorer castrato solo alla cartella da me scelta...
> questa è una cosa delicatissima e va trattata con serietà e guanti
> d'oro"*.
>
> ⛔ **SOLO RICERCA.** Stessa regola del dossier GPU: questa sessione non
> implementa qui. E qui il motivo pesa doppio — l'owner stesso l'ha
> chiamata delicata: nessuna riga di codice, nessuna proposta presentata
> come già decisa. Quello che segue è materiale per LA SUA decisione.

## Le due cose sono DIVERSE, e i competitor le trattano diversamente

L'owner ne ha nominate due nello stesso paragrafo, ed è cruciale non
confonderle:

1. **Il MODELLO scrive fuori dalla cartella** — un'azione dell'IA, con
   conseguenze reali sul disco.
2. **LA PERSONA guarda l'albero dei file fuori dalla cartella** — un
   essere umano che legge, non l'IA che scrive.

Nessun competitor esaminato tratta queste due cose con lo stesso
interruttore. La (2) è sempre libera; la (1) è sempre un livello a parte.

## ⭐⭐⭐ Hermes Agent (Nous Research) — il dato più forte di questo dossier

Vincolo permanente di questa sessione: Hermes è il primo nome su ogni
ricerca competitiva. Qui è anche il più utile — non un'altra riga nella
tabella, un pattern diverso da tutti gli altri.

`HERMES_WRITE_SAFE_ROOT`: una variabile che accetta un **elenco di
cartelle separate da `:`**, non una sola. `write_file`/`patch` possono
toccare solo percorsi dentro quei prefissi; il resto è bloccato a livello
duro.⁶

```
export HERMES_WRITE_SAFE_ROOT=/path/to/project:/home/you/.hermes
```

⛔ **Ma il punto chiave è cosa succede quando NON è impostata.** Sul
backend locale: *"the agent has the same filesystem access as your user
account"* — l'accesso pieno è il **punto di partenza**, e `SAFE_ROOT` è la
restrizione **facoltativa** che si aggiunge sopra, non il contrario.⁶

⇒ È l'opposto esatto della TALOS di oggi. TALOS parte castrata a una
cartella e "Full access" È l'eccezione da accendere. Hermes parte con
l'accesso dell'account e la cartella-recinto è l'eccezione da accendere.
Lo stesso confine, la stessa quantità di sicurezza finale — ma il
DEFAULT è invertito, ed è il default che l'owner sta descrivendo come
rotto.

Sul GPU (per completezza, meno rilevante qui): Hermes non ha una propria
selezione di backend — delega tutto a Ollama/vLLM come motore esterno,
che gestisce l'offload in modo trasparente (CUDA automatico se c'è una
NVIDIA, Metal su Mac, 50-80 tok/s su un 7B).⁷ TALOS gestisce il motore
locale direttamente (llama-server, non un'app esterna): un vantaggio
architetturale reale — nessuna dipendenza da installare a parte — che il
dossier GPU non aveva nominato.

## Come tratta la (1) — il modello che scrive — ogni competitor esaminato

| Prodotto | Livello più permissivo | Cosa resta bloccato SEMPRE, anche lì |
|---|---|---|
| **Hermes Agent** | Backend locale: **stesso accesso dell'account utente, di default** — nessuna cartella-recinto finché non la si accende. | `HERMES_WRITE_SAFE_ROOT`, quando impostata, e' un elenco (non una singola cartella) — resta l'unica restrizione, opt-in. |
| **OpenAI Codex CLI** | `danger-full-access` — scrive ovunque, **mai un'approvazione**.¹ | Se un'azienda ha impostato una `deny-read policy` (chiavi SSH, credenziali AWS, `.env`, `.key`), **non è annullabile localmente nemmeno in questa modalità** — Codex si riduce da solo a `read-only`/`workspace-write` per rispettarla.² |
| **Cursor / Windsurf** | Accesso pieno al filesystem **di default**, nessun recinto per progetto da attivare.³ | (nessun dato trovato su un floor equivalente — verificare se rilevante prima di replicarlo) |
| **Claude Code (questo prodotto)** | Dentro il progetto: leggi/scrivi/crea/elimina liberamente. Fuori: richiede conferma per singola azione.³ | — |

Il dato più utile per la decisione dell'owner è la **modalità di mezzo** di
Codex, che oggi TALOS non ha affatto — solo "dentro" (castrato) o
"fuori senza freni" (quello richiesto):

> **Auto** (workspace-write): legge/scrive/esegue dentro il progetto senza
> chiedere ogni volta; **si ferma e chiede conferma prima di scrivere fuori
> dal progetto o di usare la rete** — una spunta per azione, non un
> interruttore per sessione.¹

Il principio riassunto dalla ricerca 2026 sul tema, indipendente dal
prodotto: *"le scritture fuori dallo spazio di lavoro vanno bloccate a
livello di sistema operativo per i percorsi sensibili noti, indipendente-
mente dall'approvazione manuale dell'utente; ogni ALTRA scrittura fuori
spazio di lavoro può essere concessa con approvazione manuale."*⁴

## Come tratta la (2) — la persona che naviga — il caso VS Code

VS Code (la base su cui i più dei competitor sopra sono costruiti) separa
esplicitamente "la cartella del progetto" da "cosa può vedere l'Explorer":
i **workspace multi-radice** permettono di aggiungere qualunque cartella
sul disco all'albero visibile, **senza che questo tocchi alcun permesso
dell'IA** — è una funzione dell'editor, non della sicurezza.⁵ Aggiungere
una cartella fuori dalla radice è un'azione ORDINARIA, sempre disponibile,
mai dietro un interruttore di sicurezza.

⇒ Questo è esattamente ciò che l'owner descrive come mancante: un file
explorer che non dipende da "Full access acceso o no". Nessun competitor
esaminato lega le due cose.

## Cosa dice questo per TALOS — opzioni, non una decisione presa

**Sulla (2), file explorer della persona**: il dato è netto e senza
controindicazioni di sicurezza — è un umano che guarda file suoi, sul suo
PC, non l'IA che agisce. Slegarlo dal toggle "Full access" combacia con
ogni prodotto esaminato. ⛔ Nessun rischio nuovo da introdurre: la persona
può già aprire quei file con Esplora risorse di Windows, questo aggiunge
solo comodità.

**Sulla (1), il modello che scrive**: qui la ricerca offre TRE forme
possibili, non una — la scelta fra loro è dell'owner, non tecnica:

- **A — come richiesto alla lettera**: "Full access" acceso = scrive
  ovunque sul PC, senza altre conferme. È quello che l'owner ha descritto
  ("dare al modello accesso libero a tutto il pc"). Combacia col
  `danger-full-access` di Codex.
- **B — la modalità di mezzo di Codex**: "Full access" acceso = può
  ESSERE indirizzato fuori dalla cartella, ma OGNI scrittura fuori chiede
  conferma puntuale (non un sì una volta per tutte). Più lento da usare,
  ma nessun prodotto esaminato che offre "scrivi ovunque senza chiedere"
  lo fa senza ANCHE offrire questa via di mezzo come opzione separata.
- **C — A, ma con un piccolo elenco di percorsi mai scrivibili** (chiavi
  SSH, credenziali, wallet) **anche a Full access acceso** — il pattern
  Codex enterprise, che l'owner potrebbe voler adottare come rete di
  sicurezza minima indipendentemente da quale delle due sopra sceglie.

Il dossier non sceglie fra A/B/C: è la parte "delicata" che l'owner ha
chiesto di trattare con serietà, e la ricerca mostra che i migliori
prodotti del settore la trattano in modi diversi fra loro — non c'è
un unico "come fanno tutti".

## ⭐ La soluzione che questo dossier segnala come migliore, se l'owner la vuole

Non è A, B o C da sole: è **il pattern Hermes applicato sopra una lista,
non un booleano**. Concretamente, invece di un solo interruttore
"Full access on/off":

- una **lista di cartelle consentite** (come `HERMES_WRITE_SAFE_ROOT`),
  non solo "quella scelta all'avvio" — l'owner potrebbe aggiungere altre
  radici (es. una cartella Download, un'altra repo) senza dover scegliere
  fra "tutto" e "una sola";
- **"Full access" diventa il caso limite della stessa lista**: una voce
  speciale che significa "l'intero disco", non un meccanismo separato —
  meno codice, un solo percorso di controllo invece di due;
- il floor di Codex (C) resta comunque valido come rete di sicurezza
  SOPRA qualunque lista, indipendente da essa — le due idee non si
  escludono, si sommano.

Perché è "migliore" e non solo "diversa": risolve la richiesta esatta
dell'owner (accesso libero quando lo vuole) SENZA il tutto-o-niente che
rende delicata la scelta A da sola — la persona può concedere "questa
cartella in più" senza dover concedere "l'intero PC". Resta comunque la
sua decisione se adottarlo, e in che forma.

## Fonti

¹ [OpenAI Codex — Agent approvals & security](https://developers.openai.com/codex/agent-approvals-security) · [Understanding Codex Sandbox and Agent Approvals](https://azukiazusa.dev/en/blog/codex-sandbox-agent-authorization/)
² [Codex CLI Filesystem Security: Deny-Read Policies](https://codex.danielvaughan.com/2026/04/25/codex-cli-filesystem-security-deny-read-policies-credential-protection/) · [How can sensitive files remain uncompromised when using Codex CLI? (GitHub discussion)](https://github.com/openai/codex/discussions/5523)
³ [Claude Code vs Cursor vs Windsurf: A CTO's 2026 Verdict](https://prommer.net/en/tech/guides/claude-code-vs-cursor-vs-windsurf/) · [Claude Code Security: What Files It Actually Reads](https://tokenkarma.app/blog/claude-code-file-access-privacy-2026/)
⁴ [Practical Security Guidance for Sandboxing Agentic Workflows (NVIDIA)](https://developer.nvidia.com/blog/practical-security-guidance-for-sandboxing-agentic-workflows-and-managing-execution-risk/) · [How to sandbox AI agents in 2026 (Northflank)](https://northflank.com/blog/how-to-sandbox-ai-agents)
⁵ [VS Code — Multi-root Workspaces](https://code.visualstudio.com/docs/editing/workspaces/multi-root-workspaces) · [What is a VS Code workspace?](https://code.visualstudio.com/docs/editing/workspaces/workspaces)
⁶ [Hermes Agent — SECURITY.md](https://github.com/NousResearch/hermes-agent/blob/main/SECURITY.md) · [Hermes Agent Security Guide: Isolation and Authorization](https://fast.io/resources/hermes-agent-security/) · [user-guide/security.md](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/security.md)
⁷ [Run Hermes Agent with Ollama and Local LLMs](https://fast.io/resources/hermes-agent-ollama-local-llm/) · [Run Hermes Locally with Ollama](https://hermes-agent.nousresearch.com/docs/guides/local-ollama-setup) · [Run Local LLMs on Mac](https://hermes-agent.nousresearch.com/docs/guides/local-llm-on-mac)

## Non autorizzato — decide l'owner

Nessuna riga di codice qui dentro, per due motivi che si sommano: la
regola strutturale di questo repo (implementa solo la sessione
proprietaria del worktree) e la richiesta esplicita dell'owner di
trattare questo tema con serietà prima di muoversi. La domanda aperta,
sua e non tecnica: fra A, B, C sulla scrittura del modello — quale?
