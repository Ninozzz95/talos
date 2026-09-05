# LEDGER — Fase 3, le richieste al server/kernel che il cutover sblocca (05/09/2026)

> La Fase 2 ha reso vivo il mockup senza toccare il contratto congelato (7 chiavi di
> `localStorage`, 23 tipi di evento, 19 frammenti di endpoint). Queste sono le cose che il mockup
> promette e che vogliono una rotta o un campo in più: si aprono TUTTE insieme, una volta sola, al
> cutover (piano §3 Fase 3), col sì dell'owner riga per riga. Ogni riga dice il blocco del mockup
> che aspetta, la rotta o il campo, e come si prova.

| # | Blocco del mockup | Cosa manca (server/kernel) | Come si prova |
|---|---|---|---|
| K-A | Sidebar «Fissate» (A5: si fissa dal menu della riga) | campo `fissata` in `GET /api/v1/sessions` + `PATCH /api/v1/sessions/:id` `{fissata}` (o nella rotta di rinomina) | fissa dal menu → la riga sale in «Fissate», sopravvive al ricarico e a un altro client |
| K-B | Review: Accetta questo file · Scarta · Accetta tutto · Scarta tutto («Scartare ripristina il file dal checkpoint del giro N») | checkpoint per giro (il kernel ha `prima`/`dopo` nello StateDelta): `POST /api/v1/sessions/:id/review/{accetta,scarta}` con `{percorso, giro}`; scarta = riscrive `prima` | scrivi un file, Scarta → il file torna com'era; Accetta → la voce esce dalla Review |
| K-C | Review: «Apri nell'editor» | `POST /api/v1/sessions/:id/apri-editor {percorso}` lato server (editor di sistema) | clic → l'editor si apre sul file |
| K-D | Review: ambito «Non committato · Ramo · Ultimo giro» (Hermes) e SignedReceipt/«Ricevuta a1f4…9c02» | il servizio git W1-05/W1-06 già esiste per lo stato; per le ricevute il server ha la chiave (`TALOS_HARNESS_RECEIPT_*`): emettere `hash` nello StateDelta della scrittura (`/file/...`) | ogni scrittura porta un badge «Ricevuta …» e il blocco SignedReceipt nel turno |
| K-E | Stato vuoto: suggerimenti dai fatti della cartella per un progetto con id (T-13) | `GET /api/v1/projects` con `percorso`, o `workspace-browser?projectId=`; e il browser che elenca anche i FILE (package.json, README) | apri «Nuova» su un progetto → tre suggerimenti veri |
| K-F | ApprovalCard «— Approvato (da un altro client)» dopo un ricarico (T-14) | la risposta all'approvazione porta `clientId`/`richiedente` nell'evento ApprovalResolved | rispondi, ricarica → «Approvato.» senza «da un altro client» |
| K-G | Testata: badge «Terminale N» (schede W1-01) | il numero di schede aperte nel registro terminali esposto al client (evento o `GET /api/v1/sessions/:id/terminals`) — B1 Astra ne fa la UI | apri due schede → «Terminale 2» |
| K-H | Chip «Sessione ~$0,08» (costo stimato) | costo nel `usage` (`costo_stimato`, dal listino del fornitore) — mai stimato dal client | il chip compare solo quando il server lo manda |

Cutover in sé (piano Fase 3): `public/` ← build di `frontend/dist`; via il frontend parallelo di Opus
(`src/app/*`, `src/services/*`, `src/styles/surfaces.css`, `lab/routes/*`, i suoi test: decide
l'owner, piano §6 — la mia raccomandazione è cancellarlo al cutover: codice senza chiamanti e un
test rosso `PHASE3-TOKEN-CONTRACT-01` che parla del suo CSS); sblocco del contratto UNA volta con
le righe sopra approvate.
