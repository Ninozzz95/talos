# Dossier ricerca — ripresa dopo RunError su desktop

Data: 2026-09-01  
Perimetro: registro sessioni desktop e composer reale su `4174`.

## Problema misurato

- `GET /api/v1/sessions` su `4174` mostra la sessione
  `bd74c70a-b0da-46ea-af8b-e141842aec2e` come conclusa.
- Il replay SSE termina con `RunError` (`internal-error`) e non contiene una
  riga durevole `messaggi-finali`.
- Il composer vede correttamente un evento terminale e chiama `resume`, ma
  `session-registry.resume()` rifiuta qualsiasi sessione conclusa priva di
  `messaggiFinali` con `SESSION_NOT_READY`.
- Quattro sessioni reali, inclusa
  `b9d67958-93fb-4f44-b06a-12e584b5c513`, terminano con `RunError` ma hanno
  successivi `WorkspaceChanged`: il ripristino guardava l'ultima riga globale
  e le classificava erroneamente come ancora interrotte.
- Risultato: una chat visibile e selezionabile diventa definitivamente morta
  anche se gli eventi persistiti contengono almeno il prompt dell'utente.

## Fonti primarie e upstream

1. Hermes Sessions: ogni conversazione salva cronologia completa e `resume`
   carica la storia della conversazione.
   - https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/sessions.md
2. Hermes Session lifecycle: `resume_pending` conserva lo stesso session ID
   dopo timeout/restart e viene rimosso soltanto dopo un turno riuscito.
   - https://github.com/NousResearch/hermes-agent/blob/main/docs/session-lifecycle.md
3. OpenAI Responses: una conversation antepone gli item già associati e
   aggiunge automaticamente input/output successivi alla stessa conversazione.
   - https://developers.openai.com/api/reference/cli/resources/responses/methods/create
4. OpenAI Agents SDK Sessions: la sessione resta disponibile per turni futuri
   anche dopo un `RunState` interrotto; gli input ammessi vengono persistiti
   prima dello streaming e gli output soltanto dopo il completamento.
   - https://openai.github.io/openai-agents-js/guides/sessions/
5. OpenAI Agents SDK Results: un flusso cancellato può non avere output finale;
   il recupero deve usare stato/sessione durevoli senza promuovere il suffisso
   incompleto a cronologia definitiva.
   - https://openai.github.io/openai-agents-js/guides/results/

## Decisione upstream

- **Adatta Hermes:** stesso session ID e transcript durevole; un errore del
  turno non rende morta la conversazione.
- **Adatta il contratto OpenAI:** il nuovo messaggio viene aggiunto a una lista
  tipizzata di messaggi ricostruiti, non concatenato in una stringa opaca.
- **Non introdurre un endpoint parallelo:** `/resume` è già il confine giusto;
  il difetto è nel modo in cui il registro ricostruisce il contesto.
- **Adatta OpenAI Sessions per i riavvii:** un processo nuovo non può avere una
  corsa ancora viva del processo precedente. La sessione ripristinata può
  ricevere un nuovo messaggio, usando solo input utente e risposte assistant
  complete già provate dal log; tool, reasoning e suffissi incompleti restano
  fuori. Non si pretende di continuare il frame esatto della tool-call persa.
- **Fail closed per concorrenza reale:** una voce ancora viva nello stesso
  processo, `interrotta:false` e `conclusa:false`, resta non riprendibile per
  impedire due giri concorrenti sullo stesso ID.
- **Lifecycle tipizzato:** per stabilire se il giro è terminale si considera
  l'ultimo fra `RunStarted`, `RunFinished` e `RunError`; eventi ortogonali come
  `WorkspaceChanged` non possono cambiare lo stato del ciclo. Checkpoint e
  snapshot finali portano una `versioneGiro`: la correlazione è semantica, mai
  dedotta dall’ordine fisico delle append concorrenti.
- **Snapshot finale sincronizzato:** il salvataggio di `messaggi-finali` è
  sincrono e versionato. L’append asincrona di un evento può assestarsi dopo,
  ma uno snapshot del giro 1 non può più prevalere sul checkpoint del giro 2.

## Contratto TALOS definitivo

Per una sessione conclusa senza `messaggiFinali`, oppure ripristinata come
`interrotta:true`, `resume(sessionId, nuovoMessaggio)` ricostruisce un
transcript minimo dagli eventi persistiti:

- prompt utente da `RunStarted.input` tipizzato;
- messaggi assistant soltanto se hanno un `TextMessageEnd` completo;
- reasoning, tool call parziali e risultati tecnici non vengono promossi a
  testo conversazionale;
- se gli eventi legacy non hanno `input`, si usa il task utente persistito
  nell'intestazione;
- il nuovo messaggio viene aggiunto come nuovo turno user e la sessione riparte
  con lo stesso ID, workspace, modello, reasoning e permessi.
- senza un nuovo messaggio non viene simulata la continuazione esatta di una
  tool-call interrotta: la richiesta resta bloccata in modo esplicito.
- il nuovo input ammesso usa un record distinto `checkpoint-ripresa`, scritto
  sincronicamente prima di invocare il runtime; non viene mai spacciato per
  output finale;
- `messaggi-finali` resta riservato alla chiusura del giro. Al riavvio il
  checkpoint più recente è la base del retry se nessun output finale più
  recente della stessa o di una generazione successiva lo ha superato;
- finché esiste un checkpoint pendente, esso precede la vecchia storia finale
  anche nello stesso processo: un rigetto della Promise runtime non perde il
  follow-up già accettato;
- la ripartenza azzera `interrotta` e un secondo `resume` concorrente resta
  bloccato finché il giro vivo non termina.
- un terminale è prova del giro corrente soltanto se il numero dei
  `RunStarted` osservati coincide con la `versioneGiro`: il terminale del giro
  1 non può chiudere un checkpoint già accettato per il giro 2;
- anche `Reindirizza` persiste il checkpoint canonico e la nuova versione
  prima di annunciare `RunRedirectApplied` e prima di invocare il runtime.

Nessun package nuovo. Pin: Hermes `main` e OpenAI docs consultati il
2026-09-01.
