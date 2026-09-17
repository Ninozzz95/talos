# Brief — BC-73: l'attrezzo immagini dice dove va, chiede sempre fuori da OpenRouter, e senza chiave non chiama

> Approvato dall'owner il 17/09/2026 («sì a tutte» sulle tre cure). Parte DOPO la fusione del ramo `cli-req` (tocca
> `src/agent-service.mjs` e `src/session-registry.mjs`, in mano a quel ramo). Un agente Opus 5 high; la revisione avversariale la fa l'orchestratore, non un agente (owner 17/09).
> La scheda con le misure è in `.claude/CODA-BUG-CRITICI-2026-09-08.md`, cerca `BC-73`.

## Cosa esiste già (misurato/letto il 17/09 — riaccertalo sul tuo albero)
- `src/image-generator.mjs`: URL di OpenRouter FISSI, `fetch` nuda, chiave di OpenRouter; modello fisso
  `bytedance-seed/seedream-4.5` (`config.mjs`, `parseImmagine`, `TALOS_HARNESS_UI_IMMAGINE_MODELLO`/`_NATIVA`). ⇒ due terzi:
  OpenRouter e il fornitore del modello immagini. Scelta DICHIARATA («zero provider nuovo»): NON si cambia la destinazione.
- ✅ MISURATO: senza chiave la descrizione parte lo stesso (`POST …/api/v1/images`, `Authorization: "Bearer undefined"`, prompt
  intero nel corpo) e torna 401. In `onImmagine` (`agent-service.mjs` ~1331) l'unica guardia è `if (!immagine)`.
- LETTO: `generate_image` è in `strumentiEstesi` sempre (`session-registry.mjs` ~1622), sessioni LOCALI comprese. Permesso:
  `requiredActions: ['outbound','write']` (`talosHarness.mjs` ~5414) + cancello per-attrezzo. A schermo: «Genera un'immagine da una
  descrizione e la salva nel progetto come file vero.» (`frontend/src/components/nomi-attrezzi.js:167`) — non dice dove va.
- Il precedente da IMITARE, non reinventare: F15 «la shell chiede davanti a un segreto» (ramo `p0bis`, `path-policy.mjs`
  `motivoDaChiedere`, ricevuta `segreto-forza-conferma`, `azione.segreto.frase` mostrata dalla scheda di approvazione, «Per
  questa sessione» nascosto): un motivo che FORZA la domanda anche con «sempre», con la sua frase umana.

## Le tre cure (tutte approvate)
1. **La destinazione detta dove si decide.** La richiesta di approvazione porta una frase umana con la destinazione letta dalla
   CONFIGURAZIONE (mai scritta a mano): «Invia la descrizione dell'immagine a OpenRouter (modello <nome>) e salva il file nel
   progetto.» Stessa informazione nella descrizione del foglio dei permessi. Nessun nome tecnico (`generate_image`, id grezzi del
   modello: serve un nome leggibile; se non c'è una mappa, mostra l'id come dettaglio secondario e dillo nel rapporto).
2. **Chiede SEMPRE fuori da OpenRouter.** Se la sessione è LOCALE o il suo modello è di un fornitore ≠ OpenRouter
   (`separaFonteModello`; ⛔ una sessione locale salva l'id GGUF NUDO, che `separaFonteModello` legge «openrouter»: decidi sul
   `provider` della sessione, non sul nome del modello), l'attrezzo chiede ogni volta, anche con il permesso su «sempre» e senza
   «Per questa sessione» — stessa meccanica di F15, con la frase: «Questa sessione lavora con <fornitore/sul tuo computer>: per
   l'immagine la descrizione uscirebbe verso OpenRouter. Vuoi inviarla?». In una sessione OpenRouter vale la grammatica normale.
   Se il canale di approvazione non c'è (sessione non interattiva), NEGA con frase, mai procede.
3. **Senza chiave OpenRouter, nessuna chiamata.** `onImmagine` risponde al modello con una frase onesta (inglese, minuscolo, fatto
   negativo per primo, come gli altri attrezzi) e a schermo «Manca la chiave di OpenRouter» con la via per collegarla; ZERO
   richieste di rete (RED: fetch finta che fallisce se chiamata).

## Regole
Ricerca web prima di scrivere (consenso informato per invii a terzi negli agenti: Claude Code, Codex, Hermes — fonte+data).
RED → GREEN → al contrario con ripristino per copia e sha256. Le prove passano dalla STRADA VERA (sessione nel registro vero,
permesso «sempre», fetch di base finta che registra gli indirizzi), mai da una finta che decide da sé l'esito — è l'errore che ha
fatto bocciare D3 oggi. Casi obbligati: sessione OpenRouter con «sempre» → non chiede; sessione DeepSeek con «sempre» → chiede;
sessione locale con «sempre» → chiede; rifiuto → zero rete; senza chiave → zero rete; canale assente → nega.
Il frontend: la scheda di approvazione mostra già `azione.segreto.frase` — verifica se il campo è generico o legato al segreto;
se serve un campo nuovo, FERMATI e scrivimi quale file del frontend va toccato. Mai 4174/4177/9333, nessun giro col modello,
mai `mobile/`/`core/`, `git.exe`, commit in inglese da file senza trailer, processi lasciati vivi chiusi per PID.
Chiusura: `npm run test:kernel` se tocchi il kernel, suite backend INTERA da sola, conteggi interi.
