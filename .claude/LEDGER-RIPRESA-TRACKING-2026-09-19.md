# D-TRACK-01 — ciclo di vita ragionamento reale
Owner backend harness; main implementa. File esatti: harness-ui/src/session-registry.mjs (operazioneAgenteDaEvento, operazioneCorrenteDaEventi); harness-ui/tests/session-registry.test.mjs (nuovo RIPRESA-TRACKING-REASONING); questo ledger; .claude/ROADMAP-GLOBALE-RIPRESA-2026-09-19.md (stato/prove).
Contratti stabili CUSTOM talos.agenti v1, snapshot children, kernel AG-UI invariato; nessun testo di ragionamento/argomenti/output riportato nei segnali di stato.
Ricerca primaria 19/09: https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/sdk/js/core/events.mdx e https://github.com/ag-ui-protocol/ag-ui/blob/main/docs/concepts/events.mdx . Distinguono ReasoningStart/End di fase e ReasoningMessageStart/End di messaggio. Il kernel locale emette la seconda famiglia, oggi ignorata dall'adapter. Adattare le due famiglie dichiarate dal contratto esistente; non aggiungere SDK/nuovo protocollo per riconoscere discriminanti già presenti. Pin locale HEAD a89be85374acf3a83b767b61e3ee44589f40f4a6; schema kernel letto, nessuna modifica cross-lane.
RED RIPRESA-TRACKING-REASONING: ReasoningMessageStart deve produrre snapshot operation reasoning/running e annuncio antenato; contenuto privato mai copiato; fine deve chiudere solo il ragionamento pertinente, mai cancellare un tool subentrato. Provare entrambe le famiglie e fine con messageId vecchio.
GREEN backend isolato con runner ripresa-run.mjs backend session-registry.test.mjs, poi suite interessata orchestrazione. Banco runtime finto controllabile dimostra propagazione eventi e snapshot, non inferenza reale del provider. Attivazione4174 rimane distinta/bloccata; non riavviare per aggirare rifiuto precedente.
Rollback solo diff nominativo, nessun reset. Prove failure: eventi sconosciuti ignorati, fine dopo cambio operazione non cancella stato nuovo, fine run azzera stato; privacy su stream e snapshot. Nessuna attestazione di rewind persistente in questo lotto.

Pin contratto harness-ui/src/agui-events.mjs SHA256 bda2b9e3cb45f7ab262fc2bc27a20aa8b3955cda09d8605722908750f2f6e859. Sola lettura, nessuna modifica kernel.

RED38565cb4:361 test passati,2 fallimenti pertinenti: messaggio reasoning ignorato; fine vecchia cancellava operazione corrente. Ora famiglie entrambe riconosciute e fine abbinata a kind+messageId, senza modificare payload/copiare testo.

Gate aggiuntivo D-PAR-04 nello stesso session-registry.test.mjs: RIPRESA-QUATTRO-DELEGHE, quattro callback delegate consecutive restituiscono avviato prima di completare alcun figlio, runtime5giri ancora aperti, padre emette tool mentre4figli vivi. Nessuna correzione di comportamento nuova: caratterizzazione del backend su disco. Non prova che il modello live scelga quattro deleghe o che la4174 abbia caricato questo codice.

GREEN76a4d0ad:393/393 registro+orchestratore; GREEN0985dc4f:364/364 registro incluso nuovo scenario quattro deleghe. Backend su disco verificato, non attivato4174.
