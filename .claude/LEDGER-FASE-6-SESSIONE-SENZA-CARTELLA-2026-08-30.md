# Ledger Fase 6 — sessione senza cartella (analisi, contratto mancante)

Data: 2026-08-30  
Ownership: Harness Desktop soltanto. Mobile/Pad e i repository sibling restano
sola lettura.

## Stato osservato

- `harness-ui/src/http-app.mjs#requireCustomTaskBody()` accetta oggi solo un
  corpo con `cartellaId XOR cartellaLibera`; senza uno dei due ritorna
  `QUERY_INVALID`.
- `harness-ui/src/custom-task.mjs#preparaEsecuzioneLibera()` rifiuta entrambi
  i valori assenti e non crea cartelle automaticamente.
- `harness-ui/src/session-registry.mjs#avviaESegui()` salva `cartella` nella
  voce, apre il watcher su quella radice e il kernel usa la stessa radice per
  tool, contesto e permessi.
- `harness-ui/src/session-registry.mjs#elimina()` rimuove la sessione e il suo
  JSONL, ma oggi non possiede un contratto per eliminare una radice workspace.

Conclusione: “nessuna cartella” è una lacuna di prodotto confermata, non un
bug letterale del percorso esistente. Non è stata fatta alcuna modifica.

## Ricerca primaria (30/08/2026)

- Node documenta `os.tmpdir()` come directory temporanea di sistema e
  `fs.mkdtemp()` per creare una sottocartella unica; la directory temporanea
  deve essere trattata come risorsa con ciclo di vita esplicito:
  https://nodejs.org/api/os.html e
  https://nodejs.org/download/release/v10.3.0/docs/api/fs.html
- VS Code descrive Workspace Trust come confine esplicito prima di eseguire
  contenuto di una cartella:
  https://code.visualstudio.com/docs/editing/workspaces/workspace-trust
- OpenAI Codex descrive ambienti locali/workspace e la separazione del lavoro
  degli agenti; non autorizza a trasformare la root implicita in workspace:
  https://developers.openai.com/codex/subagents

## Confronto competitivo

| Sistema | Forza | Debolezza/rischio | Decisione TALOS |
|---|---|---|---|
| Hermes | sessioni persistite e profili isolati; `/new` separa i contesti | la documentazione non dà una root scratch desktop con cleanup garantito | adottare isolamento e metadati, non un percorso implicito |
| Codex | workspace esplicito e sandbox locale | nessuna prova che una sessione senza workspace debba scrivere nella root | adottare un workspace temporaneo dichiarato, mai la root |
| VS Code | trust esplicito per cartella prima dell’esecuzione | trust non equivale a lifecycle/cleanup | adattare il confine con permesso e cleanup verificabili |

## Contratto proposto al main agent (decisione necessaria)

Introdurre un’opzione esplicita `workspace: "scratch"` (nome da confermare)
mutuamente esclusiva con `cartellaId`/`cartellaLibera`. Il server dovrebbe:

1. creare una directory unica sotto `os.tmpdir()` con `fs.mkdtemp()`;
2. registrarla nella sessione come `cartella`, `workspaceKind:"scratch"` e
   `cleanupPending:true`;
3. applicare gli stessi permessi, watcher, receipt e policy della sessione
   normale;
4. mostrare nel client “Workspace temporaneo — verrà eliminato alla chiusura”;
5. eliminare la directory soltanto dopo sessione conclusa/fermata e azione
   esplicita di chiusura, con un fallback di startup per gli scratch orfani;
6. non persistere dati oltre il percorso dichiarato e non usare mai la root del
   repository come fallback.

La scelta alternativa è `workspace: "none"`, ma richiederebbe rendere
condizionali tutti i tool che oggi assumono `cartella`; non è la via minima.

## RED/GREEN richiesti (non eseguiti)

- RED HTTP: body senza `cartellaId`/`cartellaLibera` oggi è `QUERY_INVALID`;
  il nuovo contratto deve fallire finché `workspace:"scratch"` non è presente.
- RED lifecycle: scratch creato → sessione conclusa → cleanup; sessione
  interrotta → cleanup solo dopo chiusura; processo riavviato con scratch
  orfano → cleanup dichiarato e sicuro.
- GREEN: nessuna scrittura fuori dalla directory temporanea; `cartella` del
  RunStarted e dei tool coincide; path traversal e `cartellaLibera` senza
  Full access restano rifiutati.
- Regressioni: allowlist e Full access esistenti invariati; sessioni persistite
  precedenti ripristinabili; nessun watcher su `null`.
- QA: API avanti/indietro, errore, stop, retry, reload; screenshot desktop del
  foglio “Nuova sessione” e del Context Rail. Mobile/Pad: N/A in questa lane.

## Esito

**Analisi completata; implementazione sospesa per decisione di contratto.**
Creare automaticamente una cartella senza fissare nome, permesso e momento
di cleanup sarebbe una scelta di prodotto non autorizzata e rischierebbe dati
orfani. Ledger pronto per il main agent:
`.claude/LEDGER-FASE-6-SESSIONE-SENZA-CARTELLA-2026-08-30.md`.
