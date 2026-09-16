# Ledger Fase 5 — A: anti‑fabbricazione e richieste di nuove feature

Data: 2026-08-30  
Ownership: Harness Desktop (`AVM-harness-desktop`) soltanto. `AVM-harness` e
`AVM`/mobile sono stati letti senza modifiche.

## 1. Problema riprodotto e punto di morte

La sessione persistita
`harness-ui/.sessions-store/5c280231-a4fd-4e3c-8a86-07168506c3f0.jsonl` contiene
la richiesta owner di aggiungere un modulo di “sconti fedeltà”, nuovi test e
un aggiornamento del totale. La prima risposta e il follow-up rifiutano il
lavoro perché il modulo non esiste e non ci sono specifiche; non viene aperto
un percorso di chiarimento strutturato. La richiesta di refactor ancorata a
simboli esistenti (Task 12d) invece termina correttamente: il cancello non è
rotto per i lavori già presenti.

Il comportamento nasce nel kernel fuori ownership:
`C:\Users\Antonino\Desktop\projects\AVM-harness\mobile\scripts\harness-talos\talosHarness.mjs`
(prompt `ISTRUZIONI` e `premessaDellaScrittura`). Il ponte desktop
`harness-ui/src/agent-service.mjs` inoltra soltanto `task` e
`messaggiIniziali`; non possiede né duplica il cancello. Non è stata fatta
alcuna modifica a questi file.

## 2. Ricerca primaria (30/08/2026)

- OpenAI Codex documenta che i subagent lavorano in contesti isolati e che il
  principale raccoglie il risultato; la superficie deve mantenere visibili
  stato e risultati, non assumere effetti non provati:
  https://developers.openai.com/codex/subagents
- Hermes documenta contesto esplicito passato al figlio, transcript append-only
  e stato `unknown` dopo un riavvio quando gli effetti non sono dimostrabili:
  https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation
- SWE-agent accetta un problem statement esplicito e impone il ciclo
  riproduci → modifica → riesegui, senza modificare test per farli passare:
  https://github.com/SWE-agent/SWE-agent/blob/main/config/default.yaml
  e https://github.com/SWE-agent/SWE-agent/blob/main/docs/reference/problem_statements.md

Decisione upstream: **adattare** questi principi al contratto TALOS; non
adottare un bypass basato sulla sola insistenza dell'utente. Una richiesta di
feature nuova deve prima diventare una specifica verificabile; l'autorizzazione
owner è necessaria ma non sostituisce criteri, percorso e test.

## 3. Confronto competitivo

| Sistema | Forza | Debolezza/rischio | Decisione TALOS |
|---|---|---|---|
| Hermes | contesto figlio esplicito, transcript e stato `unknown` se l'effetto non è provabile | la delega può restare in background e legata al processo/sessione | adottare evidenza e stato indeterminato; mantenere il gate di scrittura TALOS |
| Codex | subagent isolati e risultati ispezionabili dal thread principale | la doc non definisce il dominio prodotto del repository | adottare raccolta/visibilità, non inferire requisiti dal prompt |
| SWE-agent | problem statement formale e ciclo riproduzione/verifica | orientato a issue già specificate, non a discovery di prodotto | adottare un `brief` minimo prima dell'editing |

## 4. Proposta TALOS (da implementare nel kernel owner)

Conservare il rifiuto di inventare comportamento e separare tre esiti:

1. `non-supportato`: richiesta incompatibile con il perimetro o con la policy;
2. `specifica-mancante`: feature nuova senza brief sufficiente; rispondere con
   domande mirate (file/area, comportamento, criteri di accettazione, test,
   limiti e dati) e non modificare nulla;
3. `pronto-a-implementare`: owner ha fornito/approvato il brief; eseguire il
   normale ciclo semantico, test RED/GREEN e verifica postcondizione.

L'insistenza senza nuova informazione resta `specifica-mancante`, non diventa
un bypass. Qualunque scrittura mantiene `premessaDellaScrittura`, permessi,
diff e prova su disco. Se il risultato del modello dichiara successo senza
evidenza, resta fallito/indeterminato come nella Fase J.

Livello: L3 (stato e motivazione persistiti, richiesta di chiarimento
riproducibile e nessun effetto non provato). La decisione richiede il
proprietario del kernel; il desktop non può chiuderla in autonomia.

## 5. Ledger esecutivo per il main agent (non eseguito in questa lane)

- File da modificare: `AVM-harness/mobile/scripts/harness-talos/talosHarness.mjs`
  (prompt/ciclo di chiarimento); eventuali test kernel adiacenti individuati
  dal proprietario. `harness-ui/src/agent-service.mjs` solo se il nuovo stato
  deve essere trasportato, senza logica duplicata.
- RED: replay del JSONL `5c280231-a4fd-4e3c-8a86-07168506c3f0` deve produrre
  `specifica-mancante` con domande; insistenza identica non deve scrivere.
- GREEN: brief completo su simbolo/file esistente o nuova feature approvata
  deve attraversare il ciclo semantico e lasciare scrittura/artefatto verificato.
- Regressioni: task-trappola deve continuare a rifiutare; refactor 12d deve
  continuare a concludere; deleghe senza artefatto devono restare `fallito`.
- Gate upstream: suite test del kernel, replay dei tre casi, controllo dei
  file prima/dopo e percorso contrario (brief revocato, permesso negato,
  tool fallito). Solo dopo, QA desktop con screenshot dello stato di richiesta.
- Rollback: revert del solo commit kernel/ponte della fase; nessun reset della
  sessione o cancellazione dei JSONL.

## 6. Esito di questa fase desktop

**Analisi completata, implementazione bloccata correttamente dal confine di
ownership.** Non sono stati toccati kernel sibling, mobile, TALOS-BANCO o dati
di sessione. La UI desktop conserva il comportamento onesto osservato.

Visual QA desktop: nessuna nuova superficie o codice UI modificato; screenshot
Pad/mobile: N/A in questa lane (mobile è sola lettura). Il taccuino conferma
che non è corretto mostrare “concluso” o inventare un piano quando mancano
specifiche; il miglioramento proposto è un chiarimento strutturato, non un
allentamento del cancello.
