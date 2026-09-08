# Ledger e consegna della ripresa — 08/09/2026

## Perimetro di questa fase

Presa in carico del ticket, verifica della base e registrazione delle proposte richieste dall'owner. Nessuna implementazione del pannello o delle proposte dichiarata consegnata.

- Worktree: `C:/Users/Antonino/Desktop/projects/AVM-harness-desktop`.
- Branch: `lane/harness-desktop`.
- Base effettiva: `dff4d2ef`, più recente dell'intestazione del ticket e coerente con il suo ultimo registro.
- La fonte del disegno è `harness-ui/frontend/mockup/talos-mockup.html`.
- 4174: app dell'owner; visitata senza nuove sessioni, giri o modifiche alla configurazione del server.
- 4314: istanza richiesta per le future prove che scrivono; non avviata in questa fase.
- La suite componenti usa il proprio laboratorio sulla 4176.
- Nessuna build di produzione, copia in public o modifica del prodotto: nessun riavvio necessario per questa consegna documentale.
- La vecchia suite `playwright.lab.config.mjs` resta rimossa.

## File di questa consegna

1. `.claude/CODA-PROPOSTE-OWNER-2026-09-08.md` — nuovo: requisiti PO-01–PO-07 e ricerca preliminare.
2. `.claude/LEDGER-RIPRESA-2026-09-08.md` — nuovo: questo registro e indicazioni di consegna.
3. `.claude/ISPEZIONI-RIPRESA-2026-09-08.md` — nuovo: copia persistente dei giudizi sulle immagini effettivamente aperte.

Nessun simbolo pubblico, contratto, dipendenza, migrazione, token CSS o componente modificato. RED/GREEN e mutazione di codice non applicabili alla sola registrazione documentale. Le prossime modifiche di comportamento richiedono un ledger esecutivo dedicato, ricerca e RED prima dell'edit.

Stato trovato prima del lavoro: `.gitignore` modificato; `.claude/`, `AGENTS.md` e `CLAUDE.md` non tracciati. Nessun file di prodotto modificato. Questi cambiamenti dell'owner sono conservati. Si aggiungono all'indice soltanto i tre file elencati, senza raccogliere gli altri documenti.

Rollback documentale: rimuovere soltanto i tre nuovi documenti di questa consegna con una successiva modifica esplicita; nessun dato di prodotto da migrare o ripristinare.

## Verifiche fresche della base

Tutte terminate con codice di uscita 0, in sequenza. Nessun modello a pagamento usato.

| Verifica | Directory | Esito |
|---|---|---|
| `rtk proxy node --test tests/*.test.mjs` | harness-ui | 1767 pass, 0 fail, 0 skipped; 16564,7349 ms |
| `rtk proxy node --test src/kernel/talosHarness.test.mjs` | harness-ui | 551 pass, 0 fail, 0 skipped; 6211,3364 ms |
| `rtk proxy npm run test:unit` | harness-ui/frontend | 463 pass, 0 fail, 0 skipped; 1176,6782 ms |
| `rtk proxy npm run test:componenti` | harness-ui/frontend | 120 passed; 2,0 minuti dichiarati dal runner |

Log grezzi conservati:

- `C:/Users/Antonino/AppData/Local/Temp/talos-consegna-20260908-server.log`
- `C:/Users/Antonino/AppData/Local/Temp/talos-consegna-20260908-kernel.log`
- `C:/Users/Antonino/AppData/Local/Temp/talos-consegna-20260908-unit.log`
- `C:/Users/Antonino/AppData/Local/Temp/talos-consegna-20260908-componenti.log`

I numeri superano quelli di alcune righe del ticket perché la base è avanzata. Il precedente difetto di parità Browser risulta corretto in `2501833d`; non è stato riaperto.

Queste suite non provano automaticamente i percorsi con un modello remoto dal composer, i download autentici o l'installazione su una macchina pulita. Nessuna delle righe “curata ma mai vista” viene chiusa sulla base di questi numeri.

## Ispezione delle immagini e del 4174

- Aperte singolarmente con `view_image` tutte le **218 immagini** generate dalla suite: 37 componenti, app e mockup, nelle larghezze 1440/1280/1024.
- Sono 218 e non 222 perché `componenti.spec.mjs` termina prima della foto per Inspector e Inspector_processi a 1024: due componenti per due immagini. Il comportamento è esplicito nel test.
- Aperte altre **3 immagini dal 4174**, viewport 1280×720: primo avvio, Review vuota e impostazioni Aspetto.
- Registro operativo: `C:/Users/Antonino/AppData/Local/Temp/talos-consegna-20260908/prove/ispezioni.md`.
- Copia persistente: `.claude/ISPEZIONI-RIPRESA-2026-09-08.md`.
- Originali componenti: `harness-ui/frontend/artifacts/parita/`.
- Copia conservata delle 218 immagini: `C:/Users/Antonino/AppData/Local/Temp/talos-consegna-20260908/prove/foto/`, insieme alle 3 foto dal vivo. Copie effettuate senza sovrascrivere file esistenti.
- Il registro copre tutti i 218 nomi dei componenti, senza immagini mancanti. Non sono immagini di un flusso reale: contengono dati di fixture.
- La modale di primo avvio è stata chiusa con “Salta per ora” per leggere la sessione già aperta. Non è stata cambiata la configurazione dei provider. La scheda del browser creata per queste letture è stata chiusa a fine ispezione.

## Scenari permanenti da seguire

| ID | Evidenza osservata | Stato e prova ancora necessaria |
|---|---|---|
| RIP-V01 — Review, schede coperte dalle azioni | Nelle sei immagini Review della suite i pulsanti della testata coprono le schede. Riprodotto sul 4174, Review vuota a 1280×720: Browser parzialmente coperto. Foto `4174-review-vuota.jpg`. | **APERTO, visto dal vivo, non corretto.** Prima della cura: ricerca specifica, test geometrico nominato che fallisca sulla sovrapposizione e verifica al contrario; poi foto nelle tre larghezze. Parità verde non equivale a layout corretto. |
| RIP-V02 — SettingRow, selezioni senza testo nella fixture | Le immagini app hanno Densità e Lingua vuote, il mockup mostra Comoda e Segui il sistema. Sul 4174 i valori sono invece corretti: Comoda e Segui il sistema (italiano), foto `4174-impostazioni-aspetto.jpg`. | **Difetto della fixture osservato; regressione del prodotto NON dimostrata.** Occorre caratterizzare i valori selezionati nel laboratorio prima di modificare impostazioni reali. |
| RIP-V03 — azioni oltre la porzione dipinta | A 1024 alcuni dettagli del Model Lab/Officina e a 1280 parte del Board escono dal ritaglio del componente. Alcuni chip nel ChatFooter sono molto abbreviati. | **⛔ NON VERIFICATO:** accessibilità delle azioni tramite scorrimento/tastiera nel flusso reale. Il solo ritaglio non dimostra che l'azione sia irraggiungibile. Non è una diagnosi di bug. |

Le diagnosi non vengono confuse con i fix. RIP-V01 deve ottenere un test automatico permanente prima della chiusura; in questa fase nessun test nuovo o correzione è stato scritto.

## Stato del ticket ripreso

- Le correzioni di delega/cartella/fork risultano nei commit `da8df6f1`, `23eb8fdb`, `ab2b5e1b`, `044b52aa`; le suite aggiornate passano.
- O-10 è chiuso con la foto della madre nel ticket §8.1; non si riapre sulla base della vista vuota di una figlia.
- L'albero delle deleghe è nel commit `dff4d2ef`; nella lettura attuale si vedono le linee e il rientro delle figlie nella barra.
- Il prossimo intervento di prodotto rimane il pannello destro del §4.2, preceduto dalla risoluzione della regressione visiva riprodotta e dal relativo test.
- L'ispezione locale conferma che il record ToolCallResult in `frontend/src/legacy/app.js` non conserva l'output per l'inspector; `components/inspector.js` usa un ripiego 0/1 se manca il codice d'uscita. Sono punti da trattare con dati e contratti verificati, non numeri dedotti.
- **⛔ NON VERIFICATO:** frequenza degli eventi, costo di rendering, consumo dei figli e correttezza della finestra dichiarata in una run nuova. Nessuna misura inventata.
- **⛔ NON VERIFICATO:** le righe residue del giro umano sul modello e il pacchetto su una macchina pulita. Nessuna esecuzione scrivente effettuata sul 4174.
- L'audit delle 193 decisioni resta rinviato a prima della release, come richiesto.

## Nuove proposte registrate e fonti

La coda separata PO-01–PO-07 mantiene OAuth OpenAI/Anthropic, modale Context Compactor con auto attiva/progresso/separatore, engine recente, suite documenti, download diretto, Bash con ! e computer use già richiesto. Non cambia l'ordine corrente del ticket.

Ricognizione preliminare consultata l'08/09/2026:

- OpenAI: https://learn.chatgpt.com/docs/app-server — flussi di accesso ChatGPT.
- Anthropic: https://code.claude.com/docs/en/interactive-mode — prefisso ! e shell interattiva.
- Nous Research: https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard — riferimento per la verifica del dossier ereditato.

Nessuna scelta di upstream o pin per nuove integrazioni è stata presa: sono proposte in coda, non un piano implementativo. Le versioni delle librerie documentali già presenti sono annotate nella coda. La ricerca completa su OAuth Anthropic, tecniche di compattazione recenti, documenti/download e computer use resta da fare.

## Chiarimento richiesto per la fase implementativa

Il ticket §2.12 prescrive deleghe a **Opus 5 high**. Il modello non è selezionabile fra gli strumenti disponibili in questa sessione. È stata inviata una domanda all'owner: procedere con il principale Astra oppure usare subagenti Astra per verifiche circoscritte. **Risposta non ancora ricevuta** alla chiusura di questa fase; nessuna sostituzione fatta di iniziativa.

L'istruzione attuale di progetto limita comunque i subagenti a prove semplici e revisioni meccaniche; piano, implementazione e review complessa restano al principale. Non è stata richiesta un'autorizzazione generica a fare il lavoro: il chiarimento riguarda il vincolo concreto sul modello della delega.

## Consegna

- **Cosa devi fare tu:** rispondere al chiarimento sul modello delle deleghe; nessuna azione per conservare la coda.
- **Cosa faccio io dopo:** affrontare RIP-V01 e il pannello destro secondo il ticket, con ricerca e ledger esecutivo prima del codice.
- **Cosa rimane:** implementazione del pannello, prove reali isolate, macchina pulita, debiti residui e ricerca/proposte PO-01–PO-07.

Commit documentale soltanto; nessun push. Evidenze e stato della consegna non certificano l'app pronta per la release.
