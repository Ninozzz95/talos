# Accesso pieno — esecuzione e percorsi, 08/09/2026

Owner security/kernel e desktop registry. Base immagini consegnata: `151ae648223c19057ded1c9ab43b56c4d984b7a3`.

## Decisione acquisita

Owner ha chiarito «cioe opzione 2 scusa»: Accesso pieno supera anche la conferma della trifecta. Le ricevute del kernel continuano a riportare la condizione, senza bloccare Full access; nessuna nuova superficie UI E22 viene dichiarata completa. I divieti espliciti, gli override `chiedi`, i file di controllo e i blocchi senza recupero restano invariati. Nessun cambiamento automatico ai permessi delle sessioni dell'owner.

## Evidenza del difetto

Sessione ciso `04d51688-53be-4d9b-a6ae-19350172185d`: `RunStarted`74 Full access; shell75 esegue anche `ls -la ..` fuori dal workspace; shell79 chiede `ls -la /mnt/c/Users/Antonino/Desktop`; risultato82 REFUSED perché trifecta forza conferma e manca il canale. Nessun rifiuto del percorso nel trace. Il registry passava Full access come livello undefined; il kernel non poteva distinguerlo dalla modalità implicita del banco.

Difetto adiacente riprodotto: `discoNode` usa `join(radice, percorso)` anche con percorsi assoluti. Su Windows produce `C:\work\project\C:\outside\file.txt`, non il file richiesto. La risoluzione deve seguire node:path, conservando le politiche di scrittura già applicate prima dell'I/O. Non introdurre una seconda allowlist né ampliare la cartella di lavoro.

## Ricerca primaria e scelta upstream (letta 08/09/2026)

- Hermes Security: https://hermes-agent.nousresearch.com/docs/user-guide/security. Modalità smart/manual/off; off/YOLO salta approvazioni ordinarie, non floor o deny espliciti. SAFE_ROOT opzionale, separato. Le guardie dei file non sono una sandbox della shell: la documentazione lo dichiara.
- Codice Hermes `tools/approval.py::check_all_command_guards` al commit `2237be355906fbe6065ce1815711eee52b2d646e`, tag v2026.9.7, MIT: https://github.com/NousResearch/hermes-agent/blob/2237be355906fbe6065ce1815711eee52b2d646e/tools/approval.py. Copia già acquisita e verificata dal banco: floor prima di mode off, poi approvazione. Ispezionata direttamente, nessun codice del competitor copiato.
- Claude Code: https://code.claude.com/docs/en/permission-modes. Bypass delle verifiche ordinarie; deny/ask espliciti e alcune eccezioni restano. Permesso e sandbox sono confini distinti.
- Codex: https://learn.chatgpt.com/docs/agent-approvals-security. Filesystem e approvazioni separati. Full access è una scelta esplicita; non equivale a cambiare directory corrente.
- Node path: https://nodejs.org/api/path.html#pathresolvepaths. `resolve` gestisce un assoluto come destinazione; `join` concatena. Runtime locale Node24.18.0.

Decisione upstream: ADATTARE il contratto di bypass esplicito dietro la policy TALOS esistente; ADOTTARE direttamente node:path per la risoluzione. Non integrare l'intero sistema Python Hermes per correggere due rami del kernel Node: introdurrebbe regia, dipendenze e stato duplicati. Nessun classificatore LLM introdotto dopo la scelta owner.

## File e simboli esatti prima degli edit

1. `harness-ui/src/session-registry.mjs`: `avviaESegui` mappa Full access su `livelloAccesso: accesso-pieno`; Read only/On request/Workspace write mantengono i valori precedenti. `createSessionRegistry`, resume/fork/restore e schema restano compatibili.
2. `harness-ui/src/kernel/talosHarness.mjs`: `verificaPermessoScrittura` esclude la forzatura trifecta SOLO con accesso-pieno esplicito; `verdettoTrifecta`, `creaRicevutaOperazione`, floor e override conservati. Documentazione locale aggiornata.
3. `harness-ui/src/kernel/dist/kernelPerIlBanco.js`: `discoNode`, helper interno `dentro`, risolve gli assoluti usando node:path. Export e firme invariati; file distribuito autonomo, nessun checkout fratello da importare o modificare.
4. Creare `harness-ui/tests/full-access-policy.test.mjs`: FULL-ACCESS-01 catena scrivi→shell→shell con override sempre, con/senza callback; niente REFUSED né conferma e ricevuta trifecta vera. FULL-ACCESS-02 deny/chiedi/lettura/scrittura-area preservati. FULL-ACCESS-03 percorsi assoluti letti/scritti realmente fuori dalla cartella con file temporanei. RED: rifiuto trifecta e percorso inesistente.
5. `harness-ui/tests/session-registry.test.mjs`: FULL-ACCESS-REGISTRY-01 mappatura esplicita, aggiornare caratterizzazioni che prima pretendevano undefined per Full access; cambio livello e ripresa/ripristino conservati.
6. Questo ledger; creare `.claude/CONSEGNA-FULL-ACCESS-2026-09-08.md`; aggiornare `.claude/CODA-BUG-ASTRA-2026-09-08.md` al termine.

## Cancelli

Artefatto di verifica: creare `scratchpad/prove/full-access-20260908/cattura.mjs`, Playwright1.62.1 contro 4174 reale, nessuna simulazione API né inferenza aggiuntiva. Tre PNG in `.claude/immagini/full-access-2026-09-08/`, con manifest e ispezione personale. Fonte Playwright page.screenshot già verificata oggi nel ledger immagini.

RED prima del codice. GREEN: `node --test tests/full-access-policy.test.mjs tests/session-registry.test.mjs tests/radice-disco-windows.test.mjs tests/full-access-root-e2e.test.mjs`, `npm run test:kernel`, poi suite backend completa e `git diff --check`. Nessuna UI modificata in questa correzione.

Gate reale: nuova sessione di prova Full access dal composer, lettura di un file innocuo in cartella esterna controllata, due comandi shell consecutivi e seguito dopo reload. Nessuna lettura di segreti né modifica di file dell'owner. Verificare byte sul disco, trace tool, nessuna richiesta di conferma trifecta, permesso visibile. Modello disponibile con collegamento già qualificato. Screenshot nelle tre risoluzioni se si modifica UI; prove UI della consegna immagini già complete.

Rollback: revert solo del commit Full access; dati e sessioni conservati. Nessun push. La guardia di confronto col kernel mobile resta dichiarata, nessuna sovrascrittura del fratello.

Cosa deve fare l'owner: nulla, opzione 2 acquisita.
Cosa fai tu dopo: RED, correzione e prova reale.
Cosa rimane: consegna Full access e proposte in coda.

## Chiusura

Gate reale superato: sessione `2236ac46-59f9-4db6-b0fe-4572807c1b10`, Claude/OpenRouter, stessa cartella iniziale scelta. Prima prova: shell crea/legge file esterni, zero REFUSED e ApprovalRequested. Un exit1 iniziale per comando Windows `type` su Bash/WSL, conservato. Dopo reload, `leggi`/`scrivi` su assoluti Windows aggiorna la fixture da tormalina ad ametista; verifica disco indipendente. Tre screenshot scuri esatti aperti e ispezionati. La telemetria trifecta del kernel è conservata; nessuna nuova UI E22 dichiarata. Consegna dedicata aggiornata.

Fixture gate reale: scratchpad/prove/full-access-20260908/progetto/README.txt; esterno C:/Users/Antonino/Desktop/TALOS-prova-accesso-20260908/controllo.txt (creazione esclusiva), risposta.txt generato dal modello. File creati solo per questa prova; nessun file owner sostituito.

RED osservati: due casi FULL-ACCESS-01 denied/conferma inattesa; FULL-ACCESS-03 ENOENT con percorso assoluto concatenato; FULL-ACCESS-REGISTRY-01 livello undefined. GREEN focalizzato 310/310; backend 1803/1803; kernel 552/552, vecchie prove trifecta comprese. Prova reale dalla chat completata sulla versione aggiornata, anche dopo ricaricamento.

**Cosa deve fare l'owner:** ricaricare 4174 e riprovare la conversazione con Accesso pieno.
**Cosa fai tu dopo:** riprendere la decisione Autocompact dai benchmark conservati.
**Cosa rimane:** scelta e integrazione dell'engine, gate reale Anthropic e proposte nelle code.
