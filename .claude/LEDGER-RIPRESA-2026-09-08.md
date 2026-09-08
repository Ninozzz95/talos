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
| RIP-V01 — Review, schede coperte dalle azioni | Nelle sei immagini Review della suite i pulsanti della testata coprono le schede. Riprodotto sul 4174, Review vuota a 1280×720: Browser parzialmente coperto. Foto `4174-review-vuota.jpg`. | **CORRETTO 08/09, consegnato sul 4174.** Scelta icona adattiva approvata dall’owner; RED geometrico, GREEN e prova inversa, tre foto dal vivo. Vedi `LEDGER-REVIEW-RIP-V01-2026-09-08.md`. |
| RIP-V02 — SettingRow, selezioni senza testo nella fixture | Le immagini app hanno Densità e Lingua vuote, il mockup mostra Comoda e Segui il sistema. Sul 4174 i valori sono invece corretti: Comoda e Segui il sistema (italiano), foto `4174-impostazioni-aspetto.jpg`. | **Difetto della fixture osservato; regressione del prodotto NON dimostrata.** Occorre caratterizzare i valori selezionati nel laboratorio prima di modificare impostazioni reali. |
| RIP-V03 — azioni oltre la porzione dipinta | A 1024 alcuni dettagli del Model Lab/Officina e a 1280 parte del Board escono dal ritaglio del componente. Alcuni chip nel ChatFooter sono molto abbreviati. | **⛔ NON VERIFICATO:** accessibilità delle azioni tramite scorrimento/tastiera nel flusso reale. Il solo ritaglio non dimostra che l'azione sia irraggiungibile. Non è una diagnosi di bug. |

Le diagnosi non vengono confuse con i fix. La fase iniziale era documentale; la successiva consegna RIP-V01 aggiunge il test automatico permanente e corregge la Review. RIP-V02 e RIP-V03 restano nei rispettivi stati dichiarati.

## Stato del ticket ripreso

- Le correzioni di delega/cartella/fork risultano nei commit `da8df6f1`, `23eb8fdb`, `ab2b5e1b`, `044b52aa`; le suite aggiornate passano.
- O-10 è chiuso con la foto della madre nel ticket §8.1; non si riapre sulla base della vista vuota di una figlia.
- L'albero delle deleghe è nel commit `dff4d2ef`; nella lettura attuale si vedono le linee e il rientro delle figlie nella barra.
- Il prossimo intervento di prodotto rimane il pannello destro del §4.2, preceduto dalla risoluzione della regressione visiva riprodotta e dal relativo test.
- L'ispezione locale conferma che il record ToolCallResult in `frontend/src/legacy/app.js` non conserva l'output per l'inspector; `components/inspector.js` usa un ripiego 0/1 se manca il codice d'uscita. Sono punti da trattare con dati e contratti verificati, non numeri dedotti.
- **⛔ NON VERIFICATO:** frequenza degli eventi, costo di rendering, consumo dei figli e correttezza della finestra dichiarata in una run nuova. Nessuna misura inventata.
- **⛔ NON VERIFICATO:** le righe residue del giro umano sul modello e il pacchetto su una macchina pulita. Nessuna esecuzione scrivente effettuata sul 4174.
- La nuova verifica integrale dell'app contro le 193 righe dell'audit resta prevista prima della release. La lettura integrale delle decisioni è stata invece completata ora, su nuova richiesta dell'owner: vedi il registro seguente.

## Nuove proposte registrate e fonti

La coda separata PO-01–PO-07 mantiene OAuth OpenAI/Anthropic, modale Context Compactor con auto attiva/progresso/separatore, engine recente, suite documenti, download diretto, Bash con ! e computer use già richiesto. Non cambia l'ordine corrente del ticket.

Ricognizione preliminare consultata l'08/09/2026:

- OpenAI: https://learn.chatgpt.com/docs/app-server — flussi di accesso ChatGPT.
- Anthropic: https://code.claude.com/docs/en/interactive-mode — prefisso ! e shell interattiva.
- Nous Research: https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard — riferimento per la verifica del dossier ereditato.

Nessuna scelta di upstream o pin per nuove integrazioni è stata presa: sono proposte in coda, non un piano implementativo. Le versioni delle librerie documentali già presenti sono annotate nella coda. La ricerca completa su OAuth Anthropic, tecniche di compattazione recenti, documenti/download e computer use resta da fare.

## Chiarimento risolto e istruzioni operative dell'owner

**Aggiornamento 08/09/2026, risposta esplicita dell'owner:** scelta autonoma di modello ed effort dei subagenti secondo il compito, senza privilegiare il risparmio a scapito della qualità. Questa istruzione sostituisce il vincolo del ticket §2.12 su Opus 5 high.

- Avvisare l'owner **prima** di iniziare una parte del lavoro che richiede effort xhigh o modalità Fast; spiegare in breve il motivo. Non cambiare silenziosamente le impostazioni della task principale. L'avviso precede il lavoro interessato.
- Impostazione abituale concordata: Astra high, Fast disattivato. Xhigh consigliato per architettura complessa, OAuth, sandboxing, engine di compattazione, computer use e diagnosi difficili. Fast soltanto quando il vantaggio di latenza giustifica il consumo, dopo l'avviso.
- Autorizzati fino a **cinque subagenti paralleli** per lavori lunghi o complessi, entro i limiti effettivi del runtime. La sessione attuale offre quattro slot totali: principale più tre subagenti contemporanei. Per ulteriori incarichi usare gruppi successivi.
- Distribuire un carico comparabile e delimitare obiettivo, file, responsabilità e risultato atteso di ciascun incarico prima dell'avvio. Niente scritture concorrenti sugli stessi file, inclusi ledger e generati. Il principale integra i risultati.
- Piano, architettura e review complessa restano al principale; le verifiche circoscritte possono essere delegate secondo le istruzioni di progetto. Nessuna modifica ad AGENTS.md.
- Avviso già dato per il prossimo passo: correzione Review su high, Fast spento. Nessun subagente avviato in questa fase documentale.

Riferimenti OpenAI verificati l'08/09/2026: https://learn.chatgpt.com/docs/models e https://learn.chatgpt.com/docs/agent-configuration/speed. Effort e Fast sono impostazioni distinte; per Astra Fast la tariffa in crediti documentata è 2,5 volte Standard dove disponibile. La distribuzione dei compiti sopra è una decisione operativa dell'owner, non una misura comparativa dei modelli.

## Lettura integrale delle decisioni — richiesta owner 08/09/2026

Letti per intero, in sequenza e senza limitarsi ai riepiloghi:

1. `.claude/DOMANDE-REDESIGN-TALOS-2026-09-04.md`: tutte le 240 domande, A1–A30, B1–B30, C1–C30, D1–D30, E1–E30, F1–F30, G1–G30, H1–H30.
2. `.claude/DECISIONI-REDESIGN-TALOS-2026-09-04.md`: tutte le risposte definitive delle otto categorie, incluse B31–B32, le righe aggregate, i chiarimenti e le tre ricerche E17/G3–G4/H21.
3. `.claude/AUDIT-DECISIONI-2026-09-06.md`: tutte le righe decisionali, prove, ritiri delle diagnosi e note finali. Il documento dichiara 193 righe; gli esiti sono storici al 06/09 e non sono certificati di nuovo sul codice attuale.

Le risposte definitive prevalgono sui consigli del questionario. Gli identificatori non sono sempre equivalenti fra domande e risposte (in particolare A e B): riferire requisito e documento, non il solo numero. Le istruzioni successive dell'owner e il ticket aggiornato governano le evoluzioni già autorizzate. Nessun consiglio scartato viene riproposto come decisione approvata.

Vincoli che guidano le prossime consegne:

- RIP-V01 / Review: G1–G2, G23–G26 e H27–H30 impongono nomi delle viste visibili, Review separata, navigazione da tastiera e focus visibile. Conservare inoltre la testata su una riga, come richiesto successivamente dall'owner/orchestratore. Il fix della sovrapposizione non ridisegna la diff approvata.
- Pannello destro: B22–B23, G11–G21 richiedono file toccati, indice dei giri, Contesto/File/Sotto-agenti/Processi, ambiente compatto, albero raggiungibile, durata/esito/stallo. La proposta successiva «Adesso» del ticket va integrata conservando queste funzioni. G30 e H24–H26 vietano consumi ereditati, numeri privi di unità e stime non dichiarate.
- OAuth in coda: D19–D20 richiedono salute e ultima verifica dei provider, chiavi mai in chiaro. Fattibilità e autorizzazioni dei fornitori si verificano nelle fonti attuali; la presenza nei competitor non costituisce prova sufficiente.
- Compattazione in coda: D7 mantiene il modello del composer come default, ausiliario configurabile per mestiere; D26 esige la ripartizione reale della finestra. B30 collega i giri illimitati a freni costo/tempo dichiarati, cache e chiamate multiple; non basta aumentare un tetto.
- Documenti e Bash in coda: B6–B9, B21–B22 e B32 governano allegati, costo stimato e aperture dei file; E9–E12, E23–E29 governano motivazione, anteprima, comando intero/cartella, segreti, rete e filesystem separati e permessi con scadenza dichiarata.
- Globali: E11 esclude il conto alla rovescia ma richiede una nota alla scadenza; D29 colloca il Doctor nelle impostazioni; F28 richiede gestione delle sessioni pendenti anche nello store, non solo occultamento; H21 conserva lingua preferita distinta da quella risolta; H22 richiede nomi umani da una mappa unica. Le affermazioni storiche di superiorità e la frase privacy H20 vanno confrontate con dati e comportamento reali prima di usarle come promesse di prodotto.

Questa è una lettura dei requisiti, non una nuova certificazione di conformità né una riapertura di tutte le implementazioni. Nessun file AGENTS modificato. Nessun intervento richiesto all'owner: prosegue RIP-V01, poi il pannello e la coda già registrata.

## Decisioni riservate all'owner — precisazione 08/09/2026

Istruzione esplicita: «non prendere mai decisioni fondamentali da solo [...] ad ogni dubbio o domanda o decisione interpellerai me».

- Non scegliere autonomamente direzione di prodotto, architettura fondamentale, compromessi funzionali o di sicurezza, modifiche ai requisiti approvati o alternative ancora aperte.
- In presenza di un dubbio, domanda, conflitto fra requisiti o scelta da decidere, interpellare l'owner prima del lavoro dipendente dalla risposta. Esporre il punto concreto e le conseguenze, senza trattare il silenzio come consenso.
- Proseguire le ispezioni e le attività indipendenti già autorizzate. L'autonomia esecutiva non autorizza a ridefinire il prodotto.
- La diagnosi RIP-V01 continua entro la testata a una riga e il disegno Review già approvati. Eventuali alternative che cambiano disposizione o disponibilità delle azioni vanno presentate all'owner prima di implementarle.
- Questa precisazione si applica anche a pannello destro e proposte PO-01–PO-07. Nessuna modifica ai file AGENTS.

## Consegna

- **Cosa devi fare tu:** nessuna azione adesso; riceverai un avviso prima dei passaggi che richiedono xhigh o Fast.
- **Cosa faccio io dopo:** affrontare RIP-V01 e il pannello destro secondo il ticket, con ricerca e ledger esecutivo prima del codice.
- **Cosa rimane:** implementazione del pannello, prove reali isolate, macchina pulita, debiti residui e ricerca/proposte PO-01–PO-07.

Commit documentale soltanto; nessun push. Evidenze e stato della consegna non certificano l'app pronta per la release.
