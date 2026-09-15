# Coda delle proposte dell'owner — 08/09/2026

> **RETTIFICA DELLO STATO — 14/09/2026.** I requisiti originali sotto restano validi;
> lo stato corrente è nella [tabella completa](TABELLA-FASI-COMPLETA-2026-09-13.md).
> PO-12 è implementata (4e8bfd6d, incluso il permesso file_edit); la diagnosi «zero
> chiamanti» è storica. Per PO-09 la Fase 1 ha smentito l'assenza del terminale dal
> pacchetto: resta la verifica completa dell'installato, non una nuova implementazione.
> D-10C è dichiarato chiuso anche per l'ordine dei flussi nella propria sezione del 10/09;
> l'apertura rimasta nella roadmap è stata rettificata, senza fingere un nuovo test.
> Metodo, fonti e limiti della proposta multiagente nel
> [riallineamento del 14/09](RIALLINEAMENTO-ROADMAP-2026-09-14.md).

> ## ⛔ AGGIORNATA IL 13/09/2026 — l'intestazione qui sotto e' di due giorni fa
>
> Il blocco che segue dichiara «lo stato vero, 11/09/2026». **Quello stato non e' piu' vero**: fra il
> 12 e il 13 sono state chiuse altre righe, e tre proposte nuove dell'owner sono entrate come PO-17,
> PO-18, PO-19, PO-20, PO-21 dopo una collisione di numeri sanata il 13.
>
> ⇒ **Lo stato aggiornato sta in `TABELLA-FASI-COMPLETA-2026-09-13.md`**, sezione «Registro degli
> obsoleti». Questa coda resta la descrizione distesa di ogni proposta; per sapere **se una riga e'
> aperta**, si guarda la tabella, non questa intestazione.
>
> ⛔ E vale comunque la regola che e' costata crediti veri oggi: **prima di aprire una riga, lo stato
> si riaccerta NEL CODICE**. Due righe erano marcate «in lavorazione» ed erano chiuse da un commit.

> ⛔⛔⛔ **RISCRITTA L'11/09/2026, dopo che l'owner ha detto: «non voglio assolutamente vedere fasi già
> fatte in documenti di debiti/implementazioni in corso».**
> Questo documento diceva «IN CODA» per **sette proposte su dodici che erano già state fatte**, e
> teneva fra le aperte righe chiuse da giorni. Ogni riga è stata **riaccertata provandola**, non
> rileggendo il codice: le prove riga per riga stanno in
> **`.claude/STATO-VERO-DELLE-RIGHE-2026-09-11.md`**. Le chiuse sono state spostate nella sezione
> «✅ CHIUSE» in fondo: nessuna riga è stata cancellata.

## ⛔ Lo stato vero, 11/09/2026

| ID | proposta | stato accertato l'11/09 |
|---|---|---|
| **PO-10** | comandi dell'agente nel Terminale, schede agente vs utente | ⛔⛔⛔ **RIAPERTA — NON È MAI STATA FATTA**, vedi il riquadro qui sotto |
| **PO-12** | attrezzo di modifica per il modello | ⚠️ **A METÀ** — il modulo esiste con 9 prove verdi e **zero chiamanti**; `modifica` non è fra gli attrezzi che il kernel dichiara al modello |
| **PO-09** | terminale in split orizzontale in basso | ⚠️ **FATTA MA NON CONSEGNATA** — `terminale-basso` compare **0 volte** in `public/app.js`, `public/styles.css` e `public/index.html`: sullo schermo dell'owner non esiste |
| **PO-02** | modale Context Compactor | ⚠️ **A METÀ** — codice e prove ci sono tutti, ma **sul 4174 il motore è vietato per costruzione**: modale disabilitata e 503 su ogni rotta |
| **PO-03** | engine di compattazione | ⚠️ **A METÀ** — 184 test verdi in unità, **zero confronti controllati**; mai chiuso formalmente (zero commit) |
| **PO-01** | OAuth | ⚠️ **OpenRouter a metà** (catena completa, 40 test verdi **contro un finto**, giro vero mai eseguito) · ❌ **ChatGPT e Claude: zero righe** |
| **PO-07** | computer use integrato | ❌ **mai iniziata** |
| PO-04 · PO-05 · PO-06 · PO-08 · PO-11 · N1 | documenti, download, `!`, sotto-agente nel pannello, diff in chat, barra viva | ✅ **CHIUSE e consegnate** — sezione «✅ CHIUSE» in fondo |

> ## ⛔⛔⛔ PO-10 È RIAPERTA. NON È MAI STATA FATTA.
>
> L'owner l'ha data per fatta («è stata fatta, assicurati di aver chiuso tutto»). **Non è vero, e non
> è nemmeno "a metà": non è mai iniziata.**
>
> - `git log --all --grep="PO-10"` trova **un solo commit**, `ca35b596`, che è quello che **ha
>   scritto la richiesta**. PO-09, PO-11 e PO-12 hanno ciascuno il proprio commit di implementazione.
>   PO-10 no.
> - **I comandi dell'agente non arrivano nel Terminale, e sono stati tolti di proposito**:
>   `frontend/src/legacy/app.js:13712-13720` — «⛔ 28/8 — il tool `shell` dell'AGENTE non viene più
>   specchiato nella vista Terminale… creerebbe una gara con la tastiera umana».
> - **La scheda "agente" è codice morto**: il ramo esiste (`components/terminale.js:111`) e l'unico
>   produttore reale forza `origine: 'tu' | 'standalone'` (`app.js:10241`, e identico nel bundle
>   servito `public/app.js:20262`). Gli unici `origine: 'agente'` del repo stanno in una fixture del
>   lab e in un test su funzione pura.
> - **Nessuna sola lettura** (`disableStdin` → nessun risultato), **nessuna distinzione visiva** (le
>   regole delle schede non hanno selettori per l'origine), e **il piede dichiara il falso per
>   costruzione**: «Aperta da te» è una costante.
> - **Non è la stessa fonte del pannello Processi**: `processiDagliEventi` (`inspector.js:412-431`)
>   produce già `{comando, stato, chi:'agente', giro, durataMs, uscita}` — cioè esattamente ciò che
>   PO-10 chiede — e **il Terminale non la chiama mai**.
> - La **risposta vera della rotta** `GET /api/v1/sessions/:id/terminals` (server su porta di prova,
>   poi chiusa) dà `origini: ["prima-scheda","rotta"]` e campi
>   `terminalId, sessionId, cartella, creatoAlle, origine, attiva`: **lo schema non ha un campo per il
>   giro né per la sola lettura**. Il server non potrebbe descrivere una scheda agente nemmeno volendo.
> - **81/81** test verdi sul terminale e **625/625** sul frontend: nessuno dei due insiemi tocca
>   PO-10 (`grep -i agente` sui quattro file del terminale → vuoto).
>
> ⛔ **Prima di scrivere codice serve una decisione dell'owner**: lo specchio fu tolto il 28/8 perché
> creava una gara con la tastiera umana. Rimetterlo **senza** le schede separate in sola lettura
> riaprirebbe quel difetto. PO-10 va fatta intera, o non va fatta.

⛔ Verifica visiva sul 4174: **non verificato** — il server è spento e il mandato vieta di avviarlo.

---

## I requisiti originali, invariati

Richiesta dell'owner ricevuta insieme a `TICKET-CONSEGNA-AD-ASTRA-2026-09-08.md`.
Questo documento registra requisiti, non certifica fattibilità, completezza o superiorità.

| ID | Proposta | Requisiti da conservare |
|---|---|---|
| PO-01 | Accesso OAuth OpenAI / ChatGPT e Anthropic | Ricognizione delle integrazioni reali di Hermes e altri competitor; distinguere login, abbonamento e API; verificare documentazione ufficiale, condizioni applicabili, flussi supportati, rinnovo, scadenza, logout, custodia dei segreti e recupero dagli errori. Proposta concreta per ogni provider, con limiti dimostrati. |
| PO-02 | Pulsante Compatta → modale Context Compactor | Modale completa nel linguaggio della UI approvata; autocompattazione **attiva di default**, preferenza persistente; compattazione manuale e automatica comprensibili; barra di progresso durante il lavoro e separatore visibile nella chat, conservato dopo ricarica. Misure reali quando disponibili, stato indeterminato dichiarato altrimenti. |
| PO-03 | Engine di compattazione del contesto | Ricerca approfondita dei metodi recenti, inclusi risultati degli ultimi mesi e aggiornamenti dell'ultimo mese; tecniche innovative soltanto se documentate, riproducibili e integrabili. Valutare conservazione dei vincoli, decisioni, prove e file; continuità multi-turno, coppie chiamata/esito, cache del prefisso, costi, latenza, annullamento, recupero e rollback. Dimostrare i miglioramenti con confronti controllati e log grezzi; nessuna etichetta “breakthrough” senza evidenza. |
| PO-04 | Suite di generazione dei documenti e dei file | Word/DOCX, PDF, CSV, PowerPoint/PPTX, Excel/XLSX, TXT e altri formati standard da inventariare. Prima ispezionare strumenti, librerie e rotte già presenti; poi completare i percorsi mancanti. File autentici, leggibili nelle applicazioni destinatarie, con contenuto verificato e impaginazione ispezionata. |
| PO-05 | Download immediato dalla chat | Ogni file generato deve avere un collegamento diretto per scaricarlo con un clic; nome, formato, dimensione e disponibilità reali. Verificare bytes scaricati, associazione alla sessione, persistenza dopo reload e riavvio, errori e file non più disponibili. Un link o una scheda senza file non soddisfa il requisito. Dipende da PO-04. |
| PO-06 | Bash diretto dal composer con prefisso ! | Modalità di esecuzione esplicita, come il riferimento Claude Code: comando umano eseguito direttamente, output visibile in chat. Ricercare UX, riconoscimento del prefisso, incolla, multilinea, cronologia, streaming stdout/stderr, codice d'uscita, arresto dei processi, timeout, workspace, concorrenza con il modello, Windows/WSL/Git Bash, sandbox e permessi. Nessun aggiramento implicito delle policy TALOS. |
| PO-07 | Computer use integrato in TALOS — richiesta precedente mantenuta | Dopo la consegna UI: ricognizione tecnica estremamente dettagliata di backend e frontend, documentazione e implementazioni reali, confronto con ChatGPT e gli altri competitor. Forze, debolezze e miglioramenti misurabili; architettura, contratti, dipendenze fissate, sicurezza, controllo umano, prove sul sistema reale e rollback. Nessuna supposizione presentata come fatto. |

### PO-08 — Conversazione del sotto-agente nel pannello destro

Richiesta aggiunta dall'owner l'08/09/2026, ACK dato in chat: cliccando il sommario/la riga di un sotto-agente si apre la conversazione diretta con quell'agente **dentro il pannello destro**. Un pulsante **Indietro** riporta all'elenco dei sotto-agenti. Il riferimento indicato è Codex: comportamento e documentazione da ispezionare, senza assumere conoscenza implicita del prodotto. Conservare relazione madre/figlio, identità della sessione mostrata e continuità della conversazione principale. Funzioni, permessi ed eventuali limiti dell'interazione diretta da proporre all'owner dopo la ricerca; nessuna scelta fondamentale autonoma.

Stato: ✅ **CHIUSA il 10/09/2026** (`e4fbbaa5`), consegnata al bundle servito — `conversazione-figlia` è presente in `public/app.js`. Verificato a schermo sul 4174 su una sessione con **due deleghe vere** (`187acfb7`), foto in `scratchpad/prove/foto/po08-figlia-20260910/`; frontend 571/571 all'epoca, 625/625 oggi. Resta fuori, **dichiarato**: il testo di TALOS nella vista è nudo, non markdown (il renderer incrementale vive nel monolite).
~~Stato: **IN CODA**, non implementato.~~ Si collegava al pannello destro del ticket.

## Metodo richiesto per ogni proposta

1. Ispezione dell'implementazione TALOS attuale e delle prove esistenti.
2. Ricerca web tecnica e funzionale su fonti primarie, documentazione ufficiale e repository mantenuti: data della fonte, data di consultazione, versione o commit.
3. Finestra prioritaria dell'ultimo mese; separare gli standard più vecchi ancora validi dai risultati nuovi, preliminari o non riproducibili.
4. Confronto di funzioni, UX, punti forti e deboli. Ogni “+1” deve avere una funzione concreta e una prova.
5. Decisione adotta / adatta / scarta motivata; versioni fissate e integrazione diretta dell'upstream quando appropriata.
6. Piano al livello dei singoli file, simboli, contratti, test RED/GREEN, regressioni, verifica dell'upstream reale, migrazioni e rollback, prima di modificare comportamento.
7. Accettazione dal composer con richieste umane, anche refusi e follow-up, esiti reali, ricarica e persistenza. Screenshot aperti e giudicati, prove anche al contrario.

## Ricognizione iniziale, non dossier concluso

- Base locale letta: `dff4d2ef`, `lane/harness-desktop`, 08/09/2026.
- `harness-ui/package.json` include già docx 9.5.1, pdf-lib 1.17.1, pdfmake 0.3.11, pptxgenjs 4.0.1, jszip 3.10.1 e SheetJS 0.20.3. La presenza delle dipendenze **non prova** il percorso completo dal composer al file scaricato.
- OpenAI, [Codex App Server](https://learn.chatgpt.com/docs/app-server), consultato 08/09/2026: documenta login ChatGPT via browser e device code, annullamento e logout. È un candidato da verificare per PO-01, non una scelta architetturale già approvata.
- Anthropic, [Interactive mode](https://code.claude.com/docs/en/interactive-mode#shell-mode-with--prefix), consultato 08/09/2026: documenta il prefisso `!`, output nel contesto e differenze tra shell umana e sandbox. Queste differenze vanno considerate nella ricerca PO-06.
- Nous Research, [Web Dashboard](https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard), consultato 08/09/2026: riferimento primario da usare nella ricognizione; le affermazioni del vecchio ticket sui competitor devono essere riverificate.
- **Da ricercare:** ammissibilità e supporto dell'accesso Anthropic; tecniche recenti di compattazione; copertura effettiva dei formati e download; computer use. Nessuna di queste ricerche è dichiarata chiusa.

## Consegna

### Debito UI non urgente — esito nella colonna destra degli strumenti, 09/09/2026

Richiesta owner: `C:/Users/Antonino/Downloads/ScreenShot Tool -20260909132722 (1).png`. Nello screenshot ogni riga ripete a destra la descrizione dell'azione già presente a sinistra. Stato: **annotato, non implementato**; priorità successiva al Context Engine.

Comportamento richiesto: azione a sinistra, esito reale a destra. Per esempio mostrare il risultato della ricerca, l'esito del comando o il motivo dell'errore quando attestati dall'output; durante l'esecuzione indicare lo stato in corso. Non dedurre un successo dal solo completamento della chiamata, non inventare quantità o risultati mancanti. Conservare accesso ai dettagli e all'output completo. Prima della patch: ispezionare renderer e contratto degli eventi, ricerca tecnica primaria, test RED della duplicazione e degli errori, verifica dalla chat con reload e screenshot 1080p/1440p/4K.

### Debito UI non urgente — blocchi di codice, 09/09/2026

Richiesta owner durante TCEC, riferimento visivo: `C:/Users/Antonino/Downloads/ScreenShot Tool -20260909110154.png`. Il codice multilinea appare frammentato in strisce come codice inline, separato dalla barra lingua/Copia. Stato: **in coda, non implementato**; non interrompere Context Engine.

Obiettivo: un contenitore unico coerente con TALOS; tipografia monospace leggibile, evidenziazione sintattica, contrasto e spaziatura curati, intestazione e Copia integrati. Preservare fedelmente contenuto, indentazione, selezione e copia; verificare righe lunghe, streaming, linguaggi non riconosciuti, tema chiaro/scuro, tastiera e viewport 1080p/1440p/4K. Prima della patch: ispezione renderer/CSS reali, ricerca primaria aggiornata, confronto visivo competitor e ledger RED/GREEN. Lo screenshot dimostra il difetto percepito, non identifica da solo la causa CSS. Decisioni fondamentali da sottoporre all'owner; nessun redesign della testata o delle altre viste implicato.

- **Cosa deve fare l'owner:** nessuna scelta richiesta per registrare la coda.
- **Cosa faccio io dopo:** completare la presa in carico del ticket e seguire le priorità correnti.
- **Cosa rimane:** ricerca approfondita, proposte applicabili e implementazioni PO-01–PO-08.

## Decisioni owner del 09/09/2026 (sera) — ordine vincolante

Debiti: **D1** approvato (un giro reale su Context Manager, processo isolato) · **D2** approvato (giro reale con
delega sul 4174) — ⛔ **unico modello permesso: `glm-5.3-flash`**, effort a scelta di Claude · **D4** prova
dell'owner dopo D1 · **D5** nella release solo cambio modello a metà chat e ripresa JSONL corrotta · **D6**
release in una giornata dedicata dopo D1-D2 · **D7** `C:\` storico si lascia, BC-04 da riverificare con foto ·
**D8** (blocchi di codice, righe strumenti) subito dopo D1 · **D3** (file-coordination fra figlie concorrenti):
l'owner vuole una spiegazione semplice, potrebbe essere critica — decisione sospesa.

Nuove implementazioni, in quest'ordine: **PO-04/05 → PO-06 → PO-08 → PO-01 → N1 (barra laterale viva) →
chiusura delle decisioni P-01…P-18 → il resto.**

> ✅ **11/09/2026 — QUESTO ORDINE È STATO PERCORSO FINO IN FONDO.** PO-04, PO-05, PO-06, PO-08 e N1
> sono **fatte e consegnate**; PO-01 è fatta per OpenRouter e manca solo del giro vero (che può fare
> solo l'owner). ⇒ Il prossimo passo di questa lista è la **chiusura delle decisioni P-01…P-18**, che
> l'owner promuove una alla volta. Le righe rimaste fuori dalla lista e ancora aperte sono
> **PO-10** (mai iniziata), **PO-12** (metà kernel), **PO-09** (da consegnare), **PO-07** (mai
> iniziata) e la parte ChatGPT/Claude di PO-01.

### ⚠️ PO-09 — Terminale in split orizzontale in basso — FATTA l'11/09, **NON ANCORA CONSEGNATA**

> ✅ Implementata da `a3e0464f` (11/09): pill nel composer accanto a «Giri», pannello in basso,
> maniglia `role="separator"` operabile da tastiera, altezza salvata a fine trascinamento e
> ripristinata, tetto a due terzi dello schermo. Il pannello **non crea** un terminale: sposta quello
> che c'è (xterm.js non sa misurarsi in un elemento nascosto — #3029, #494). 620 test frontend verdi,
> verificato nei due temi.
>
> ⛔ **Ma non è arrivata all'owner.** Il commit stesso lo dichiara («NON consegnato al 4174: cinque
> agenti stanno scrivendo nell'albero in questo momento»), e l'11/09 è ancora così: `terminale-basso`
> compare **1 volta** in `frontend/src/legacy/app.js` e **0 volte** in `public/app.js`,
> `public/styles.css` e `public/index.html`, cioè in tutto ciò che il 4174 serve.
> ⛔ **E non è un'ipotesi sul build**: col 4174 riacceso nel pomeriggio, scaricando in sola lettura
> ciò che serve davvero — `GET /app.js` → 200, **1.406.062 byte**, `terminale-basso` **0**; `GET /` →
> 200, 345.175 byte, **0**. Nello stesso file `conversazione-figlia` (PO-08) e `diff-hunk` (PO-11)
> compaiono **2 volte ciascuno**: quelle sono consegnate, questa no.
> ⇒ **Finché il bundle non viene rigenerato, per chi guarda lo schermo questa funzione non esiste.**
> La decisione di non consegnare era giusta; il debito è la consegna, e non si può fare finché altri
> stanno scrivendo nell'albero.

**Il testo originale della richiesta:**
«Un pulsantino per far aprire il terminale splittato in orizzontale in basso, come fa Hermes, Codex e tanti
altri tipo VS Code: resizable, intuitivo.» Requisiti: un pulsante piccolo (topbar o piede), pannello in basso
sotto la chat, maniglia di ridimensionamento con misura ricordata (stessa chiave dei dialoghi), chiusura e
riapertura senza perdere la sessione del terminale; ricerca su Hermes/Codex/VS Code prima di disegnare.

### ⛔⛔⛔ PO-10 — APERTA, MAI INIZIATA (accertato l'11/09/2026)

> L'owner la crede fatta. **Non lo è.** La prova completa è nel riquadro in testa a questo documento
> e in `.claude/STATO-VERO-DELLE-RIGHE-2026-09-11.md` §1. In una riga: un solo commit la nomina, ed è
> quello che ha scritto la richiesta; lo specchio dei comandi dell'agente **è stato tolto di
> proposito il 28/8**; la scheda «agente» esiste solo come **codice morto**; nessuna sola lettura;
> il piede dice «Aperta da te» per costante; e il Terminale non usa la fonte del pannello Processi.
> ⛔ Prima di implementarla serve una decisione dell'owner sul conflitto col vincolo del 28/8.

**Il testo originale della richiesta:**
«Nella sezione terminale si integrano tutti i comandi effettuati fino a quel momento dall'agente, e quindi
distinguere tra schede terminale agente e utente.» Requisiti: ogni comando eseguito dall'agente (shell/prova)
compare nel Terminale con output e stato, in ordine; schede **agente** distinte dalle schede **utente** (nome,
colore/pallino, sola lettura per quelle dell'agente); nessun comando inventato — solo quelli davvero eseguiti,
letti dagli eventi ToolCall; stessa fonte del pannello Processi.

### ✅ PO-11 — Il DIFF del file modificato, dentro la chat — CHIUSA il 10/09/2026

> `e62ae85c`: `diff-hunk.js` raggruppa le righe attorno ai cambiamenti con `ctx = 3` (lo stesso di
> git e di ogni strumento guardato), `creaDiffInChat` fa solo la resa e riusa `.talos-diff` così
> com'è. 18 prove nuove, provate **al contrario** (alzando la soglia di unione degli hunk ne cadono
> esattamente due). **Consegnata**: `diff-hunk` è presente nel bundle servito `public/app.js`.
> Verificata dal vivo sul 4174 con un giro vero (`glm-5.3-flash`) a 1440 e a 1024, nessuno
> scorrimento orizzontale della pagina.

**Il testo originale della richiesta:**
«Quando un file viene modificato non c'è il diff direttamente nella chat: bisogna farlo come Claude e il
resto dei competitor.»

Oggi, misurato nella foto dell'owner (sessione «Nella cartella C:\Users\Antonino\Desktop\TALOS-prova-accesso…»,
claude-sonnet-5): la riga «1 file letto, 1 file modificato · +1 −1» si apre e mostra **il testo dell'argomento
dell'attrezzo** — `percorso: … / contenuto: ametista / Esito: written: …` — non un diff. Il conteggio
«+1 −1» esiste già in testata, quindi la differenza è già calcolata da qualche parte: manca la resa.

Requisiti: sotto la riga dell'attrezzo di scrittura compare il **diff vero riga per riga** (verde/rosso,
numeri di riga, contesto attorno alla modifica), ripiegato o aperto secondo la lunghezza; percorso cliccabile;
per un file nuovo si mostra il contenuto come tutte-aggiunte; per un file grande si taglia dichiarando quanto
resta fuori; niente diff inventato — se il prima non è noto si dice, non si finge una riga rossa.
Da cercare prima di disegnare: come lo rendono Claude Code, Codex e Hermes (colori, tetto delle righe,
diff a parole dentro la riga), e cosa la Review già sa fare — il calcolo potrebbe essere già nostro
(`contaDiff` alimenta la testata), e allora è solo un pezzo di resa in più, non un motore nuovo.

### ⚠️ PO-12 — A METÀ: la funzione c'è, il modello non può usarla (accertato l'11/09/2026)

> `9ec96d60` (10/09) ha scritto `harness-ui/src/modifica-ancorata.mjs` (177 righe) con **9 prove
> verdi**, comprese quelle al contrario (testo vuoto, identico, solo spazi, non trovato, ambiguo con
> le righe vere). Il commit stesso chiude dichiarando: «⛔ Resta fuori il pezzo che vive nel KERNEL
> (schema dell'attrezzo + instradamento)».
>
> ⛔ **Verificato l'11/09: quel pezzo non è ancora stato fatto, e senza di esso la funzione non
> esiste per il modello.**
> - `grep -rn "modifica-ancorata\|modificaAncorata"` su `src/`, `frontend/src/` e `server.mjs`,
>   escluso il modulo stesso → **nessun risultato**. È una funzione coi test e **nessun chiamante**.
> - Gli attrezzi che il kernel dichiara al modello (`src/kernel/talosHarness.mjs`, righe 877-971)
>   sono `elenca · cerca · leggi · scrivi · prova · shell · naviga`: **`modifica` non c'è**.
>
> ⇒ Restano vere tutte e tre le conseguenze scritte qui sotto — costo, rischio, e soprattutto la
> terza: **la difesa contro D3 che PO-12 doveva portare oggi non è attiva**. Due figlie sullo stesso
> file continuano a sovrascriversi, perché `scrivi` rimpiazza il file intero.

**Il testo originale della richiesta e dell'analisi:**
«Oltre alle modifiche file da terminale, dare al modello LLM un tool di edit esattamente come Claude
Code da CLI, e praticamente come fanno tutti gli altri.»

**Non ce l'abbiamo, verificato nel kernel il 09/09.** Gli attrezzi di file sono `leggi`, `elenca`,
`cerca`, `scrivi`, `shell`. `scrivi` si dichiara al modello così, verbatim:
«Writes one file of the workspace, **replacing it entirely**. Read it first: the whole content is
required.» — parametri `percorso` + `contenuto`. Nessun attrezzo ancorato a un pezzo di testo.

**Tre conseguenze, non una.**
1. **Costo.** Per cambiare una riga in un file di 2.000 righe il modello deve rigenerare 2.000 righe.
   Ogni modifica costa quanto il file intero, in uscita, dove i token costano di più.
2. **Rischio.** Un file riscritto per intero da un modello è un file che può perdere pezzi che nessuno
   aveva chiesto di toccare: il resto del file passa dalla sua memoria, non dal disco.
3. ⛔ **È metà della soluzione di D3.** Letto nel repo di Claude Code il 09/09 (CHANGELOG, commit
   `f173a697`): ciò che impedisce a due sotto-agenti di cancellarsi il lavoro **non è un lucchetto**
   — non ne esiste nessuno per file — ma l'ANCORAGGIO TESTUALE di `Edit`: `old_string` deve combaciare
   in modo univoco, quindi se un altro agente ha già toccato quel punto la modifica fallisce da sola.
   Con un solo `scrivi` che sostituisce tutto, invece, la seconda figlia cancella la prima **senza
   accorgersene**. Un `modifica` ancorato al testo è quindi anche una difesa contro D3.

**Forma proposta** (da confermare con una ricerca prima di scrivere il codice): `modifica` con
`percorso`, `testo_da_sostituire`, `testo_nuovo`, e un `tutte_le_occorrenze` opzionale; fallisce con un
messaggio chiaro se il testo non c'è **o se compare più di una volta** (è l'ambiguità a rendere
pericolosa una sostituzione, non l'assenza). ⛔ Il nome che riceve il modello è un contratto col
kernel: si aggiunge, non si rinomina `scrivi`. E `scrivi` resta per i file NUOVI.
Da guardare prima: `Edit`/`Write` di Claude Code (e la riga del suo CHANGELOG che dice che un edit su
testo ancora univoco passa anche se il file è cambiato dopo la lettura), `apply_patch` di Codex, e
l'attrezzo di modifica di Hermes.

### DEBITO — `HF-DIRECT-CONTROLS-01` è un test FRAGILE (trovato 10/09, non mio)
Misurato lanciando `tests/hf-direct-transfer.test.mjs` tre volte di fila **sullo stesso codice**:
rosso, verde, verde. Il file `src/hf-direct-transfer.mjs` non era nel diff di chi l'ha visto fallire.
⇒ Un test che cambia esito senza che il codice cambi non protegge niente: il giorno che rompe
davvero quella funzione, nessuno gli crederà. Da guardare: la prova è su pausa/annullamento, quindi
il sospetto è un'attesa a tempo invece di un'attesa su uno stato.
⛔ Registrato e non curato: è un'altra area, e la lezione dice che un filo trovato dentro una fase
non è quella fase.

### ⚠️ PO-01 — OpenRouter A METÀ (manca il giro vero), ChatGPT e Claude a ZERO — accertato l'11/09

> **OpenRouter — la catena è completa e collegata**, sedici anelli verificati uno per uno l'11/09
> (elenco in `.claude/STATO-VERO-DELLE-RIGHE-2026-09-11.md` §6): pulsante in Impostazioni →
> Laboratorio modelli → *Provider*, regia del clic, rotta `POST /api/v1/auth/openrouter/inizia`,
> PKCE **S256** da `node:crypto`, stato opaco monouso con confronto a tempo costante, callback con lo
> stato nel percorso, scambio su `https://openrouter.ai/api/v1/auth/keys`, salvataggio nel
> **portachiavi di sistema**, chiave riletta a **ogni giro** (niente riavvio), logout locale.
> Test lanciati l'11/09: **14/14 + 17/17 + 9/9 = 40 verdi**.
> Misurato e non dedotto: `PRIMA di loadFromKeyring → origineChiave "ambiente"`, `DOPO → "custodia"`
> ⇒ **il portachiavi vince sull'ambiente**, come dichiarato in D-10I.
>
> ⛔ **Ma quei 40 verdi sono tutti contro un OpenRouter FINTO** (`fetchOpenRouterFn:
> openRouterFinto()`, `custodisciChiaveOpenRouter: custodiaFinta()` in ogni caso): nessuna riga esce
> in rete. **Il giro vero non è mai stato eseguito** — lo dichiara il commit stesso (`e6e2a549`), e le
> foto si fermano a «accesso premuto / popup non bloccato».
>
> **Quattro cose che mancano, per nome:**
> 1. **il giro vero** — solo l'owner può farlo, servono le sue credenziali;
> 2. ⛔ **due rami morti**: `provider-card.js:17` e `:43` confrontano con `origineChiave === 'accesso'`,
>    un valore che il server **non emette mai** (`provider-credential-store.mjs:260` produce solo
>    `'custodia' | 'ambiente' | null`) ⇒ **dopo un accesso riuscito la card dirà «Chiave salvata»**,
>    come se l'avessi incollata. Si vedrà esattamente nel momento del giro vero;
> 3. **la modalità «codice a schermo» non ha interfaccia**: la rotta `POST …/codice` esiste e ha la
>    sua prova, ma `grep "openrouter/codice"` in `frontend/src/` è **vuoto** — chi usa TALOS da
>    un'altra macchina oggi non può accedere;
> 4. **nessuna prova visiva rende il pulsante**: la fixture `frontend/lab/fixtures/provider-card.js`
>    non ha il campo `supportsOAuth`, quindi in tutte le prove Playwright il pulsante **non viene mai
>    disegnato** — la stessa famiglia del difetto che l'owner ha trovato premendolo.
>
> Più: **logout locale senza revoca** sul fornitore, e **abbonamento/credito assenti** (il requisito
> «distinguere login, abbonamento e API» è coperto per due terzi). *Rinnovo e scadenza non si
> applicano, ed è per progetto*: la fine dello scambio è una **chiave API**, non un token.
>
> **ChatGPT/OpenAI e Claude/Anthropic: zero righe, e la prova è il grep vuoto.** `supportsOAuth` vale
> **false** per entrambi. L'unica menzione è un commento che spiega perché non si fa (OAuth solo per
> client riservati, cioè un `client_secret` su un server che TALOS non ha e — local-first — non deve
> avere). ⛔ Quel commento è una nota **nostra** del 10/09 che **non cita una pagina ufficiale**: va
> riverificato alla fonte prima di progettare.

**Il testo originale dell'aggiunta dell'owner (10/09): anche OAuth OpenRouter**
«Nella fase oauth aggiungi anche oauth openrouter, è già stato fatto nel mobile, dovrebbe essere
facile e veloce da implementare.»

**Verificato: c'è davvero, ed è completo.** `AVM/mobile/src/lib/auth/openRouterOAuth.ts`, 173 righe,
con il flusso PKCE per intero:
- `TALOS_OPENROUTER_AUTH_URL = 'https://openrouter.ai/auth'` e
  `TALOS_OPENROUTER_KEYS_URL = 'https://openrouter.ai/api/v1/auth/keys'` (righe 46-47);
- `talosCreateCodeVerifier`, `talosBase64Url`, `talosCreateCodeChallenge` (S256), `talosCreatePkcePair`
  — cioè la parte che di solito costa fatica è già scritta e già provata;
- `TALOS_OAUTH_CALLBACK_PATH = '/talos-openrouter'`.

⛔ Che cosa cambia sul desktop, e perché non è una copia:
1. il **ritorno**: sul telefono è un deep link, qui è una rotta del nostro server — abbiamo già la
   4174, quindi il redirect può essere `http://127.0.0.1:4174/<percorso>` e il codice torna a casa
   senza inventare niente;
2. il **linguaggio**: il mobile è TypeScript, `harness-ui/src` è JavaScript — si porta la logica,
   non il file;
3. la **custodia della chiave**: dove finisce, chi la legge, come si revoca. È la parte che PO-01
   chiede per ogni provider («rinnovo, scadenza, logout, custodia dei segreti»), e sul desktop non
   può essere la stessa del telefono.
4. ⛔ **Non ho ownership sul mobile**: quel file si LEGGE come riferimento, non si tocca.

⇒ L'owner ha ragione sul «facile e veloce»: la parte crittografica è fatta. Resta il giro completo
da provare dal vivo — login, chiave che arriva, chiamata vera con quella chiave, logout — che è
l'unica cosa che dice se funziona.

## Debiti trovati il 10/09/2026 — misurati, non curati

Tutti nati lavorando su PO-06 (il `!` dal composer) e sul merge del Context Manager. Nessuno è stato
curato di straforo dentro un'altra riga: stanno qui perché l'owner decida quando valgono.

### D-10R · IL SEGNAVIA NON SI MUOVE SUL CHROME DELL'OWNER — «debito rompicoglioni»

> Nome dato dall'owner, 10/09, testualmente: «segnalo come debito rompicoglioni (si esattamente
> cosi)». Cinque tentativi in una sera, tutti falliti dal suo lato.

**Il fatto.** Sul Chrome dell'owner il segnavia a tre nodi della bolla d'attesa **non si muove**.
Su ogni banco che so costruire, si muove.

**Cosa è già stato provato, e con quale misura** (tutto in `scratchpad/prove/segnavia-quanto-dura/`):

| tentativo | misura sul mio banco | esito da lui |
|---|---|---|
| ingrandito 48×8 → 72×12, traccia 18% → 28% | visibile 5.040 ms su un giro di 5.914 | fermo |
| animazione CSS → **SMIL** (`<animate>`), che nessuna regola CSS può spegnere | 37 valori distinti di `stroke-dashoffset` su 37 campioni, `getAnimations()` vuoto | fermo |
| tolto ogni `stroke-dashoffset`/`animation` dal CSS (vincevano su SMIL) | idem | fermo |
| profilo dei nodi copiato dal mobile (pieno dal 22% all'82%), sfasamenti 0/0,36/0,73 | nodi 11 · 8 · 6 valori distinti su 30 | fermo |
| **motore JS di riserva** con `data-motore` (`smil` \| `js` \| `js-intervallo`) | al contrario, SMIL tolto: `smil → js`, 25 valori su 30 | fermo |

**Cause ESCLUSE con una misura, non per opinione:**
- non è il tema — due temi × tre modi di «riduci animazioni»: **12 valori distinti su 12, sei volte
  su sei**;
- non è l'interruttore «Riduci animazioni» dell'app né quello di Windows — stessa misura;
- non è la cache — `app.js` va con `Cache-Control: no-store`, e il bundle servito contiene l'SMIL
  (`curl` trova `"animate"`, `repeatCount`, `88;-88`);
- non è un secondo segnavia statico ereditato dal mockup — a riposo nel DOM ce ne sono **zero**.

**Cosa NON è stato provato, ed è dove va cercata la causa:** il suo Chrome vero. Il progetto sa già
che ha l'**accelerazione hardware disattivata** (misurato il 02/09: da 6,1 ms a 109 ms per
fotogramma, p95 212). Nessuna delle mie misure gira lì dentro.

**La prossima mossa, quando l'owner vorrà riaprirlo** — una sola, e decisiva: leggere `data-motore`
sul SUO schermo. Il valore dice in una parola dove sta il guasto e chiude cinque ipotesi insieme:
`smil` = il codice crede che SMIL funzioni e si sbaglia (bug nel rilevamento);
`js`/`js-intervallo` = il ripiego è acceso e allora nemmeno il JavaScript riesce a dipingere, e il
problema è il rendering, non il segnavia. Si legge passando il mouse sulla riga d'attesa con gli
strumenti aperti, o da una foto dell'ispettore.

⛔ Nessuna cura ulteriore senza quel dato: cinque tentativi al buio sono già cinque di troppo.

### ✅ D-10A · L'Indice dei giri salta i numeri, con passo 3 — CHIUSO il 10/09/2026, sera

> **Causa misurata** (sonda in sola lettura sul 4174, `scratchpad/prove/d10a-indice-giri/sonda.mjs`,
> otto sessioni vere): i numeri mancanti stavano tutti su un turno della PERSONA —
> `utente numeri=[1]`, `[4]`, `[7]`, `[10]`, `[13]` fra `talos numeri=[2,3]`, `[5,6]`, `[8,9]`. Ogni
> messaggio dell'utente prende un numero della spine e lo mostra in chat; `giriPerInspector()`
> guardava solo i turni di TALOS. Nessun numero perso, nessuna numerazione rotta: **mancavano le
> righe**. Cura: mostrare la riga omessa dicendo di chi è («4 · ma che cavolo significa?» / «tuo
> messaggio»), NON rinumerare — il numero dell'indice deve restare quello che la chat mostra accanto
> al messaggio. Verificato dal vivo: 1 · 2 · 3 · 4 · 5 · 6 · 7 · 8 · 9 · 10, senza un buco.
> Commit `7f0d4b0a`.

Il testo originale del debito, per memoria: misurato nelle foto del 10/09 (`dopo-02-dove-finisce.png`): l'indice mostra 2, 3, 5, 6, 8, 9, 11, 12,
14, 15, 17, 18, 20, 21. Cioè ogni ciclo consuma **tre** numeri e ne mostra due. ⛔ La causa NON è
ancora misurata: i numeri arrivano dalla spine del turno (`segnaGiroNellaSpine`), e prima di dire
perché salta uno serve strumentare, non rileggere. Non è grave (nessun dato è sbagliato, solo la
numerazione non è consecutiva) ma è il genere di cosa che fa dubitare di tutto il pannello.

### D-10B · L'output di un comando arriva tutto alla fine
`eseguiComandoDiretto` fa `await` dell'intero comando e poi emette un solo `ToolCallResult`: misurato
2.091 ms su un comando da 2.091 ms. Chi lancia `!npm test` guarda uno schermo fermo finché non
finisce. Anthropic per la shell mode dichiara il contrario («shows real-time progress and output»,
«Interactive mode», letto il 10/09/2026), e la stessa richiesta è aperta su altri due prodotti
(deepseek-harness #5584, anthropics/claude-code #33265).

### D-10C · stdout e stderr sono fusi **e riordinati**
Misurato: `console.log('FUORI-1'); console.error('ERRORE-1'); console.log('FUORI-2')` esce come
`"FUORI-1\nFUORI-2\n\nERRORE-1"`. L'ordine cronologico è perso — e quando si legge un errore, sapere
*dopo quale riga* è comparso è metà dell'informazione. (Mostrarli aggregati resta giusto: lo dicono
Nushell e Boot.dev sui flussi POSIX. È il RIORDINO il difetto.)

### D-10D · `!` non funziona mentre il modello lavora
`sessionRegistry.shell()` rifiuta con `SESSION_NOT_READY` se la sessione non è conclusa. Aprirlo
richiede un vocabolario di eventi separato (`ComandoUtenteIniziato/Finito`) perché oggi il comando si
traveste da giro del modello: `broadcast` mette `conclusa = true` sul suo `RunFinished`, e da lì
**sette** lettori del registro credono a una bugia (watcher del workspace spento a metà scrittura,
`resume`/`fork`/`compatta` permessi su una sessione viva, `reindirizza` che rifiuta, sidebar che la
dà per finita). Diagnosi completa con i file:riga nel resoconto dell'agente del 10/09.

### D-10E · Il token dell'API e la chiave privata di firma viaggiano nel processo del comando
L'ambiente del figlio esclude **una sola** chiave (`OPENROUTER_API_KEY`). Passano invece, misurate:
`TALOS_HARNESS_UI_TOKEN` (il token di loopback che protegge tutta l'API) e
`TALOS_HARNESS_RECEIPT_PRIVATE_KEY_B64` (chiave privata delle ricevute), più `HF_TOKEN` e la chiave
della ricerca. `src/process-policy.mjs` avrebbe un'allowlist di 12 chiavi neutre e non è usata da
questa catena. ⛔ Chiuderlo costa: `parseProcessCommand` rifiuta `&& | ; < >`, quindi `!npm test &&
npm run lint` smetterebbe di funzionare. È una decisione dell'owner, non mia.

### D-10F · Dove gira un comando dell'owner: WSL2, non Windows
`!npm --version` risponde `11.16.0`, che è l'npm di Linux. E se il programma non esiste in WSL, lo
stesso comando ripiega su `cmd.exe`: due sistemi operativi a seconda di cosa scrivi. Dal 10/09 la
riga di stato lo DICE a schermo, ma il comportamento non è cambiato. Ricerca 10/09/2026: Claude Code
su Windows è nativo e usa PowerShell (WSL solo se lo scegli), Codex CLI idem — in entrambi la scelta
è **una sola e dichiarata**, mai decisa comando per comando. Owner 10/09: «io punterei sulla scelta».
⇒ Proposta: una scelta per SESSIONE, visibile accanto alla pillola dei permessi.

### D-10G · Difetti nel kernel, che qui è una copia
Trovati misurando la catena del comando, e non toccabili da questa lane: il marcatore di troncamento
dice «l elenco completo dei test» su qualunque comando (`uscitaUtile`); l'output del ramo `none` si
accumula in memoria senza tetto e viene tagliato solo alla fine; il timeout a 120 s restituisce
`codice: null` con `outcome: success`, cioè un comando fermato è indistinguibile da uno riuscito e
muto (in chat la bugia è già smascherata, alla fonte no).

### D-10H · La chiave privata delle ricevute passa da un `.env`, e da lì all'ambiente di ogni figlio
Trovato il 10/09 lavorando a PO-01, guardando come il progetto maneggia già un segreto.
`src/harness-receipt-keypair.mjs:96-102` scrive la chiave privata Ed25519 delle ricevute dentro un
file `.env`. Quel file **diventa l'ambiente del processo**, e l'ambiente del processo arriva a **ogni
processo figlio** — cioè a ogni comando che l'agente o l'owner lanciano. È la stessa classe di
difetto misurata stamattina sui comandi `!` (D-10E), scritta però in casa nostra.

Tre cose fatte bene lì (temporaneo + rename + flag `wx`, `chmod 600`, validazione della coppia) e tre
che non tornano:
1. il `.env` è il canale sbagliato per un segreto: la sua natura è propagarsi ai figli;
2. il `chmod 600` ha un `.catch()` che **ingoia l'errore su Windows** — cioè lì non protegge e non lo
   dice (e su Windows `chmod` tocca solo il bit di sola lettura: doc di Node, letta il 10/09/2026);
3. il percorso del `.env` lo sceglie il chiamante e nessuno controlla che non sia dentro il repo.

⛔ Non curato: non è la riga su cui stavo lavorando, e toccare la firma delle ricevute vuole il suo
giro di prove. Registrato perché è il tipo di difetto che nessuno trova per caso una seconda volta.

### D-10I · PO-01: com'è finita davvero (la voce precedente era sbagliata, ed era colpa mia)

⛔ **Questa voce sostituisce quella scritta poche ore prima**, che raccomandava una cartella
`%APPDATA%\TALOS\custodia`, un file in chiaro e la precedenza «l'ambiente vince». Tutte e tre le cose
nascevano da una mia affermazione falsa nel brief dell'agente — «sul desktop non esiste nessuna
custodia» — che avevo dedotto da un grep su `config.mjs`.

**Come stanno le cose, misurate:** esiste `src/provider-credential-store.mjs`, e `server.mjs` gli
inietta il **portachiavi vero del sistema operativo** (`@napi-rs/keyring`; su questa macchina
`keyring-win32-x64-msvc`, verificato caricabile il 10/09/2026). Se manca, il server lo dice e il
Doctor segnala il limite. Cioè il progetto aveva già la custodia migliore delle due, e il modulo
scritto sulla premessa sbagliata è stato buttato invece di essere committato.

**La precedenza vera, letta nel codice:** l'ambiente semina la mappa delle chiavi alla partenza, poi
`loadFromKeyring()` la **sovrascrive**. Quindi **il portachiavi vince sull'ambiente** — l'opposto di
ciò che avevo registrato. Non è stato cambiato; è stato smesso di tacerlo: ogni card dice ora da dove
viene la chiave in uso («Chiave dall'ambiente» su OpenAI, DeepSeek, Anthropic e Gemini, «Chiave
salvata» su OpenRouter, misurato dal vivo).

**Cifratura a riposo: la domanda non si pone più.** Con il portachiavi di sistema la chiave non sta
in un file nostro, e il confronto con Claude Code (`.credentials.json` in chiaro su Windows), Codex
(`auth.json`) e npm (`.npmrc`) dice che siamo **sopra**, non sotto.

⛔ **Resta una cosa che l'owner deve fare, e che non posso fare io:** il giro vero. Nessun accesso
reale a OpenRouter è stato eseguito — richiede le sue credenziali sul sito del fornitore. Tutto è
provato con un OpenRouter finto (31 prove) e la card guardata a schermo con le rotte intercettate.

⛔ **E una domanda tecnica che resta all'owner:** se un giorno OpenRouter cambia il nome del campo
nella risposta (`api_key` → altro), oggi il flusso muore pulito con un errore dichiarato invece di
indovinare campi alternativi. Accettare oggi un campo che non esiste vuol dire accettare, il giorno
in cui esisterà, qualcosa di cui non conosciamo il significato.

---

## ✅ D-10C — CHIUSO il 10/09/2026, sera

**La causa, trovata nel codice**: i due flussi finivano in **due array separati** (`pezziFuori`,
`pezziErrori`) concatenati alla fine — e due array non sanno in che ordine sono arrivati. Non un caso
limite: l'ordine era perso **per costruzione**, in tutti e quattro i rami di esecuzione (WSL2,
adb-shell, Windows nativo, e la funzione ausiliaria dei comandi brevi).

**La cura**: un terzo accumulatore, `insieme`, che cresce nell'ordine in cui i dati **arrivano**.
`fuori` ed `errori` restano invariati byte per byte — nessun chiamante cambia. Ricerca 10/09/2026
(nodejs/node issue #9214; l'opzione `all` di execa, «interleaves stdout and stderr by creating a
mixed stream»): l'ordine si preserva facendo passare i due flussi per **lo stesso collo** mentre
arrivano, non catturandoli separatamente e unendoli dopo.

**Misurato dal vivo sul 4174**, col caso esatto del debito e nel ramo che l'owner usa davvero (WSL2):

| | prima | dopo |
|---|---|---|
| `console.log('FUORI-1'); console.error('ERRORE-1'); console.log('FUORI-2')` | `FUORI-1 FUORI-2 … ERRORE-1` | **`FUORI-1 ERRORE-1 FUORI-2`** |

Quattro prove nuove, due al contrario (solo stdout, comando muto). Suite 2115/2115.

---

# ✅ CHIUSE — spostate qui l'11/09/2026, con la prova rimisurata

> ⛔ Stanno qui e **non più fra gli aperti**, perché l'owner oggi ha chiesto di non vedere più «fasi
> già fatte in documenti di debiti/implementazioni in corso». Nessuna riga è stata cancellata: il
> testo originale della richiesta resta nelle sezioni sopra.
> Le prove complete, riga per riga, sono in `.claude/STATO-VERO-DELLE-RIGHE-2026-09-11.md`.

## ✅ PO-04 — Suite di generazione dei documenti — CHIUSA (10/09, `6f720607`), riverificata l'11/09

**Non fidandomi del commit, i file sono stati rigenerati e riaperti byte per byte.** Dodici file
prodotti con il modulo del repo:

| file | byte | firma | prova |
|---|---:|---|---|
| `Relazione di prova.docx` | 7.685 | `50 4b 03 04` | 20 parti ZIP, `word/document.xml`, marca `SPIA-PO04-7f3a9e` **dentro** il documento |
| `Tabella di prova.xlsx` | 15.964 | `50 4b 03 04` | 10 parti, `xl/workbook.xml`, marca in `sheet1.xml` |
| `Presentazione di prova.pptx` | 45.732 | `50 4b 03 04` | 39 parti, `ppt/presentation.xml`, marca in `slide1.xml` |
| `PDF da body.pdf` | 14.792 | `%PDF-1.3` | `%%EOF`, testo **estratto** decodificando la ToUnicode CMap |
| `PDF report impaginato.pdf` | 19.241 | `%PDF-1.3` | 2 pagine: cover, KPI, tabella, istogramma e torta tutti presenti nel testo estratto |
| `Prova CSV.csv` | 51 | — | RFC 4180: `"valore, con virgola"` quotato, CRLF |
| TXT · MD · HTML · JSON · PY · SQL | 25-148 | — | contenuto atteso verbatim |

Inventario reale: **40 estensioni**, di cui i sei formati chiesti (DOCX, PDF, CSV, PPTX, XLSX, TXT)
tutti autentici. L'attrezzo è davvero dichiarato al modello (`GET /api/v1/tools` sul 4174 vivo: 43
attrezzi, fra cui `document_create`). Rifiutati con errore onesto: `doc`, `xls`, `ppt`, `rtf`, `odt`,
`ods`, `odp`, `epub`.

⛔ **Tre difetti registrati e NON curati** (sono un'altra riga, non questa):
1. **`rows` viene buttato in silenzio** in `docx`, `pptx` e `html` — misurato: `{format:'docx',
   rows:[…]}` produce **0 tabelle `<w:tbl>`**, e la parola «Mese» non è nel file. `report` ha un
   guardrail esplicito, `rows` no: stessa classe di errore, due comportamenti opposti.
2. **Il DOCX è piatto mentre il PDF è impaginato, dallo stesso `body`**: `body.split('\n')` diventa
   un `Paragraph` per riga (riga 246) ⇒ `**grassetto**` finisce letterale, `- punto` non diventa
   elenco, i `#` non diventano titoli. Chi chiede «la stessa relazione in Word» ottiene markdown a
   vista.
3. **Il generatore vero non è provato da nessun test**: ogni test inietta un generatore finto, e
   `tests/document-generator.test.mjs` non esiste.

## ✅ PO-05 — Download immediato dalla chat — CHIUSA (10/09, `6f720607`), riverificata l'11/09

**I byte, contati due volte** (server vero su porta di prova, poi chiusa):

```
Relazione scaricabile.docx | disco 7672B  | 200 | content-length=7672  | ricevuti 7672B  | identici=true
Tabella scaricabile.xlsx   | disco 15953B | 200 | content-length=15953 | ricevuti 15953B | identici=true
Slide scaricabili.pptx     | disco 45428B | 200 | content-length=45428 | ricevuti 45428B | identici=true
PDF scaricabile.pdf        | disco 13208B | 200 | content-length=13208 | ricevuti 13208B | identici=true
```

`Content-Disposition` porta entrambe le forme del nome (RFC 6266), più `nosniff`, `no-store` e
`CSP default-src 'none'; sandbox`. **Al contrario**: file inesistente produce 404 `FILE_NOT_FOUND`;
un percorso che esce dalla cartella, 404; sessione ignota, 404; percorso vuoto, 400.
**Nessun 200 vuoto.**
**Sul 4174 vivo** (sola lettura): `GET …/file?percorso=README.md` risponde **200 con 4.444 byte
reali**.
**Persistenza dopo riavvio provata**: `ripristina()` restituisce `{ripristinate:1, totali:1}` e il
download torna **7.655 byte identici**; lo `StateDelta` con `allegato` è `durable` e viene rigiocato
in SSE, quindi dopo un reload la scheda si ridisegna.
Test: 72/72 · 9/9 · 139/139 · 4/4.

⛔ **Difetti registrati e non curati**: nessun test copre `allegato` su `document_create` (l'assert
esiste solo per `generate_image`); nessun test end-to-end attraversa la rotta `GET
/sessions/:id/file`; la scheda esiste **solo** per `document_create` e `generate_image`, quindi un
file scritto da `scrivi` non ha collegamento in chat; e — **probabile, non verificato in un browser
vero** — se il file è stato nel frattempo cancellato la rotta risponde 404 con JSON e un
`<a download>` su Chrome **salva comunque il corpo**, lasciando un `.docx` che contiene
`{"ok":false,…}`.
**Non verificato**: il clic reale nel browser, che richiede un giro col modello sul 4174.

## ✅ PO-06 — Bash dal composer col prefisso `!` — CHIUSA fra il 09 e il 10/09

Consegnata: il riconoscimento del prefisso compare **3 volte** sia in `frontend/src/legacy/app.js`
sia nel bundle servito `public/app.js`. La catena è stata costruita a pezzi, ognuno con la sua
misura: `fc37793f` (D-10B: l'uscita si vede **mentre esce**, +256 ms invece che mai) · `1849cf3c`
(D-10C: stdout ed errori tornano nell'ordine in cui sono comparsi) · `9ddb741f` (D-10D: il `!`
funziona **mentre il modello lavora** — erano **tre** cancelli, e un test proteggeva il difetto) ·
`97992536` (D-10E: da **1** chiave tolta dall'ambiente del figlio a **9**) ·
`55085750`/`5542a212`/`07d6f518` (D-10F: dove gira un comando è una **scelta della sessione**,
visibile a schermo) · `02b75f49` (la cartella di lavoro **resta** fra un comando e l'altro) ·
`0bb41565` e `d94375fa` (il comando, l'uscita e l'esito restano in chat, con interruttore).
⛔ **Resta una decisione dell'owner, non un debito tecnico** (D-10E, più sopra): chiudere del tutto
il passaggio dei segreti costa `!npm test && npm run lint`, perché `parseProcessCommand` rifiuta
`&& | ; < >`.

## ✅ N1 — Barra laterale viva — CHIUSA il 10/09 (`873b2bba`)

La riga della sessione cambia mentre il giro procede. Presente nel bundle servito.

## ⚠️ PO-02 e PO-03 — l'owner le dava per chiuse: **non lo sono, ed è per due ragioni diverse**

**PO-02 — il codice è tutto fatto e provato; sul 4174 la funzione non si può usare.**
`src/config.mjs:446-449` **vieta il motore del contesto sulla porta 4174 per costruzione**: con
`TALOS_CONTEXT_TRIAL` impostato su quella porta il server **non parte proprio**, e senza quella
variabile il motore è assente, quindi ogni rotta `/context` risponde **503 `CTX_NOT_ENABLED`**
(misurato su un server di prova con la stessa configurazione: stato 503, avvia 503, impostazioni 503).
⇒ Se l'owner apre il 4174 e preme Compatta: la modale si apre **completa e disabilitata**, «Compatta
ora» è `disabled`, la spunta dell'autocompattazione è `disabled`, nessun messaggio viene toccato.
Quello che **è** fatto e provato: catena del pulsante integra in sei anelli, autocompattazione
`default(true)` (`context-engine/src/contracts.mjs:21-27`), preferenza persistente su SQLite
(`journal_mode=WAL`, `synchronous=FULL`), barra di progresso e **separatore conservato dopo
ricarica**, quest'ultimo provato dal vivo (dopo `page.reload()` il separatore è presente, una volta
sola). Test: **101/101** più **83/83**.
⛔ **Decisione dell'owner**: accendere il motore sul 4174 vuol dire togliere quel divieto, che è
stato scritto apposta.

**PO-03 — a metà: l'engine c'è, le misure che il requisito chiedeva no.**
184 test verdi in unità, con i capitoli giusti coperti (`CTX-TOOL-PAIRING`, `CTX-CANCEL`,
`CTX-MUTATION-ROLLBACK`, `CTX-RESTORE-SUFFIX`, `CTX-SOURCE-VALIDATION`). Ma `git log --grep="PO-03"`
non trova **nessun commit**, e `PO-03` compare in **un solo posto** del repo: la riga del requisito.
Mancano, per nome: il **confronto controllato ON/OFF** sull'engine consegnato · la **latenza**
(misurata una volta sola e **fuori bersaglio**: primo token a **61,2 s**) · l'**hit-rate della cache**
(il «40%» è una fixture) · i **costi** prima/dopo · un **rollback eseguito** · l'**annullamento in
streaming**. La campagna da 96 casi che esiste ha misurato i **candidati esterni prima che l'engine
esistesse**, e conclude da sé «Nessun candidato promosso nel prodotto».
⭐ Va riconosciuto che la ricerca sullo stato dell'arte è **onesta**: dice per iscritto che la
superiorità di TALOS non è provata, e in tutto il materiale non c'è una sola etichetta «breakthrough».

## ⛔ Un difetto trovato accertando PO-02, registrato e non curato

`npm run verify:all` **è rosso oggi**. Il rosso è `CTX-UI-USAGE-CLOSED-RELOAD` in
`frontend/tests/browser/context-compactor.spec.mjs:138`: `[data-runtime-usage]` **non esiste** dopo la
ricarica di una sessione conclusa (`components/chat-foot.js:391`). Quel file è dentro
`playwright.componenti.config.mjs`, che `frontend/scripts/verify.mjs` esegue, che `verify:all` chiama.
⛔ E c'è una seconda conseguenza, peggiore della prima: morendo alla riga 138 **il test non eseguiva
le asserzioni successive**, fra cui quella del separatore dopo ricarica. Un test lungo che muore a
metà non prova ciò che sta sotto — dichiararlo verde sarebbe stato falso.

---

## ⛔⛔⛔ PO-10 — LA DECISIONE DELL'OWNER, 11/09/2026

Accertato oggi che **PO-10 non è mai stata iniziata** (un solo commit la nomina, ed è quello che ha
scritto la richiesta; la scheda «agente» esiste come codice morto in `terminale.js:111`, e l'unico
produttore forza `origine:'tu'|'standalone'`).

L'owner, 11/09: «**schede separate agente / utente, ma con utente che può interagire con schede
agente**».

⇒ Quindi non è uno specchio in sola lettura. Le schede dell'agente sono **terminali veri**, dove la
persona può scrivere: guarda l'agente lavorare e, se serve, mette le mani nella stessa shell.

### ⛔ Il vincolo che rende questa riga difficile, e che va rispettato

Lo specchio dei comandi dell'agente nel Terminale **era stato tolto di proposito il 28/8** (il
motivo è nel commento di `app.js:13712`). ⇒ Rimetterlo *senza* le schede separate riaprirebbe quel
difetto: è esattamente per questo che l'owner chiede le schede distinte, non un elenco unico.

### Che cosa serve, per nome

1. **Un'origine sulla scheda**: oggi la rotta `/terminals` non ha nemmeno un campo per il giro, e il
   piede dice «Aperta da te» per costante. Serve `origine: 'agente' | 'tu'` che arrivi dal server.
2. **I comandi dell'agente devono comparire** nel Terminale mentre girano — con esito e stato, in
   ordine.
3. **La scheda dell'agente è scrivibile**: la persona può digitare lì dentro. ⛔ E qui va deciso e
   dichiarato che cosa succede se scrive **mentre** l'agente sta eseguendo: due che scrivono nella
   stessa PTY sono due che si pestano i piedi, e il difetto non si vedrebbe finché non fa danno.
4. Le due famiglie devono **restare distinguibili a colpo d'occhio**: nome, e un segno che non sia
   solo il testo.

**Stato:** APERTA, decisa dall'owner, da implementare.

## PO-13 — GPT-Live-1 nell'API: voce full-duplex (owner 11/09/2026, «non urgente ma interessantissima»)

Fonte: https://openai.com/index/introducing-gpt-live-1-in-the-api/ (annuncio API del 10/09/2026; in
ChatGPT dall'8/07). Letto l'11/09/2026 dai riassunti pubblici (la pagina risponde 403 al fetch):
- **ascolta e parla nello stesso momento** (full duplex): l'agente vocale può interrompere e
  cambiare turno in modo naturale, invece di aspettare la fine della frase;
- +30 punti su Full Duplex Bench rispetto a GPT-Realtime-2.1, con guadagni grossi su latenza del
  turno e comportamento interattivo; più voci, accenti, dialetti e lingue;
- **prezzo**: $0,05 al minuto di sessione, fatturato al secondo ($3/ora) — e i modelli/tool di
  backend che usa durante la conversazione si pagano A PARTE.

⛔ Dove starebbe in TALOS: il pulsante microfono del composer oggi fa dettatura; questa è un'altra
cosa — una conversazione a voce continua con l'agente, con il kernel come backend degli attrezzi.
Prima di qualunque riga: (1) leggere la doc API vera (WebSocket/WebRTC, come si innesta il tool
calling nostro dentro la sessione vocale, quale modello di backend), (2) confrontare col mobile,
che ha già voce e TTS locali (Pocket TTS, 0.1.19) e con Hermes/Codex se hanno qualcosa di simile,
(3) misurare il costo reale su una sessione vera, perché $3/ora più il backend cambia la classe
di spesa rispetto a tutto il resto. ⛔ Fuori dal principio local-first del mobile: qui è desktop e
va bene come OPZIONE a chiave, mai come unica via per la voce.

## PO-17 — Installer con una vera interfaccia e il passo del consenso (owner 13/09/2026, dopo la 0.1.1)

Owner, parole sue: «dopo la release dobbiamo fare un installe migliore a livello ui con step user
agreeement ui a livello di installer talos». Cioe': l'installazione oggi e' muta e va bene per un
rilascio tecnico, non per una persona che installa TALOS per la prima volta.

**Cosa c'e' oggi.** NSIS `oneClick: true`, `perMachine: false`, `allowElevation: false`,
`allowToChangeInstallationDirectory: false`: un solo colpo, nessuna pagina, nessun consenso
mostrato, `runAfterFinish: true`. Le icone dell'installer e del disinstallatore ci sono gia'
(`installerIcon`, `uninstallerIcon`, `installerHeaderIcon`), e `assets/installer.nsh` personalizza
testi e colori del controllo nativo.

**Il vincolo gia' misurato**, da `LEDGER-R02.md`: un `oneClick` NSIS **non ospita pagine**. Un passo
di consenso vuole l'installer assistito (`oneClick: false`) con la sua pagina di licenza, oppure
pagine NSIS scritte a mano nell'include. ⛔ E il ledger avverte anche di non promettere un wizard
in HTML: NSIS disegna col controllo nativo di Windows, non col nostro tema Calm.

**Prima di scrivere una riga.** (1) Ricerca fresca su electron-builder: `oneClick: false`,
`license`, `installerSidebar`, `uninstallerSidebar`, e cosa cambia per un'installazione per utente
senza amministratore; (2) cosa fanno gli installer che l'owner cita come metro (Hermes, VS Code,
Codex): quante pagine, dove sta il consenso, se ricordano le scelte; (3) decidere QUALE licenza si
accetta: il prodotto e' AGPL-3.0-only, e un consenso alla AGPL non e' un EULA proprietario —
va scritto cosa si sta accettando, senza inventare clausole.

⛔ Non si tocca finche' la 0.1.1 non e' pubblicata e provata: cambiare la forma dell'installer
cambia anche lo smoke test del rilascio (installazione silenziosa, avvio, health, disinstallazione).

**Stato:** APERTA, decisa dall'owner, da fare DOPO la release.

## PO-18 — La finestra dell'app desktop, come interfaccia (owner 13/09/2026, dopo la 0.1.1)

Owner: «e finestra app desktop migliore come ui». La finestra oggi e' un guscio Electron che
mostra la stessa pagina del browser: nessuna barra del titolo propria, nessun cromo che dica «sono
una applicazione», niente che distingua la finestra installata dalla scheda del browser.

**Da guardare prima di disegnare** (regola: si inventaria cio' che c'e' gia'): la barra del titolo
del sistema contro una `titleBarStyle` personalizzata, dove finiscono i comandi della finestra sul
tema chiaro e su quello scuro, il menu «Motore locale» e le altre voci gia' presenti, e il
comportamento all'avvio (il velo, il primo disegno col tema salvato). Metro di paragone: Hermes,
VS Code e Codex, guardati davvero, non a memoria.

⛔ Vale la regola di sempre: si rispetta il sistema di design Calm gia' in casa, e nessuna funzione
che oggi esiste puo' sparire nella forma nuova.

**Stato:** APERTA, decisa dall'owner, da fare DOPO la release.

### RIFERIMENTO VISIVO per PO-17 e PO-18 | tre schermate di Hermes, mandate dall'owner il 13/09/2026

Owner: «ti mando degli screen per ricerca finestra e installer piu' belli stile hermes». Non sono
immagini custodite su disco (sono arrivate in chat), quindi qui resta la descrizione, che e' la
cosa che serve quando si disegnera'.

**L'installer di Hermes, prima schermata.** Una finestra piccola, propria, non il wizard nativo di
Windows: fondo blu notte pieno, il nome del prodotto scritto grandissimo con una grazia in stile
inciso, e SOTTO una sola riga di promessa («The agent that grows with you. We'll set things up in
the background — takes a few minutes.»). Una sola azione, scritta fra parentesi quadre:
[ INSTALL ]. Nessun percorso da scegliere, nessuna casella, nessun pulsante Avanti.

**L'installer, seconda schermata (durante).** Cambia intestazione: «Setting up Hermes Agent», e
spiega perche' l'attesa esiste — «This is a one-time setup… Subsequent launches will skip this
step.» Sotto, una barra di avanzamento con la percentuale a destra, e un ELENCO DEI PASSI VERI, in
chiaro, uno per riga: gestore di pacchetti, Git, rilevamento di Node, ripgrep e ffmpeg, clone del
repository, verifica di Python, ambiente virtuale, dipendenze Python, dipendenze Node, build della
app, aggiunta al PATH, scrittura dei file di configurazione. In fondo un «Show details» che si apre
e un «Cancel» sempre disponibile.

⇒ Cosa prendere per PO-17, in ordine di valore: (1) l'attesa si SPIEGA invece di essere subita, e
si dichiara che accade una volta sola; (2) i passi si mostrano per nome, quindi chi guarda sa
sempre a che punto e' e cosa sta scaricando; (3) una sola azione per schermata; (4) «Cancel»
esiste sempre. ⛔ Il loro installer fa molto lavoro perche' costruisce la app sulla macchina: il
nostro pacchetto e' gia' costruito, quindi da noi quell'elenco sarebbe corto e onesto (verifica
delle firme, scrittura dei file, collegamenti), e non va gonfiato per sembrare impegnativo.

**La finestra della app, per PO-18.** Barra laterale scura con quattro voci sole in alto (New
session, Capabilities, Messaging, Artifacts) e la scorciatoia accanto alla prima; poi PINNED con un
suggerimento in grigio su come si appunta una chat; poi SESSIONS, con le sessioni raggruppate per
mese e i titoli tagliati a una riga. A destra un pannello con l'elenco dei file. In basso una barra
sottile col modello scelto, il microfono e l'invio. Titolo della finestra e comandi di sistema
normali, con l'icona del prodotto a sinistra.

⇒ Cosa confrontare col nostro: noi abbiamo gia' piu' roba nella barra (Note, Attivita', Libreria,
Memoria, Ricerca, Progetti, Board, Strumenti). Il punto non e' copiare la loro sobrieta' togliendo
funzioni — vale la regola che una UI nuova non nasconde cio' che esiste — ma guardare COME
raggruppano e quanto lasciano respirare, e il raggruppamento delle sessioni per periodo.

## PO-19 | TALOS come CENTRO ASSISTENZA DI SE STESSO (owner 13/09/2026, «importantissima», dopo il rilascio)

Owner, parole sue: «bisogna usare talos come un vero e proprio centro assistenza di talos stesso, se
io ho qualche curiosita su come funziona talos, su una qualsiasi sua funzione tipo cosa fa "full
access?" talos deve chiamare un tool o qualcosa… deve dire anche cosa e' talos ovviamente, i dati
al suo riguardo tipo la repo github etc».

**Il caso d'uso, nelle sue parole:** la persona chiede «cosa fa Full access?» dentro la chat, e
TALOS risponde con la documentazione VERA di TALOS, non con quello che il modello si ricorda.

**Cosa esiste gia' (verificato il 13/09, prima di scrivere questa riga):**
- `docs/` alla radice del repo, con documentazione vera: architecture, alignment, agent-bus,
  PUBLISHING.md, README.md. E' materiale nostro, gia' scritto, oggi invisibile dal prodotto.
- I README di `harness-ui/` e `harness-ui/desktop/` (quest'ultimo in inglese) e i due CHANGELOG.
- Una superficie **Doctor** (`frontend/src/components/doctor.js`): diagnostica, non assistenza.
- Un attrezzo di **ricerca web** gia' nel kernel (chiave dedicata) e la sezione «Ricerca
  approfondita».
- I meccanismi che iniettano documenti di progetto nel contesto (istruzioni di progetto, contesto
  del progetto): la strada per far leggere documenti al modello esiste gia', non va inventata.
⇒ Il pezzo mancante non e' la capacita' di leggere o cercare: e' che TALOS **non sa niente di se
stesso** e non ha una fonte dichiarata su cui rispondere.

**Le tre fonti, in ordine di fiducia** (da decidere con l'owner):
1. **La documentazione nel repo** — sta gia' sul disco di chi usa la app, quindi risponde anche
   senza rete. E' la fonte primaria e va tenuta aggiornata come codice.
2. **I fatti su se stesso** — che cos'e' TALOS, la repo GitHub `Ninozzz95/talos`, la licenza
   AGPL-3.0-only, la versione installata, cosa fa e cosa NON fa ancora. ⛔ Devono venire dal
   REPOSITORY e dal pacchetto, mai dalla memoria del modello: un dato scritto a mano invecchia e
   diventa una bugia al primo rilascio.
3. **Il sito ufficiale di TALOS** — ⛔ **oggi non esiste**. L'owner lo nomina come fonte futura.
   Quindi l'attrezzo deve degradare in modo onesto quando non c'e', e il sito e' una decisione
   separata da prendere, non un presupposto di questa riga.

**Prima di scrivere una riga** (ricerca obbligatoria, e l'owner la chiede esplicitamente): come lo
fanno i concorrenti. Hermes ha un sito con DOCS e un PORTAL; Claude Code ha `/help` e una
documentazione interrogabile; Cursor e Codex hanno le loro. Interessa COME ancorano la risposta:
citano il file o la pagina? Dicono «non lo so» quando la documentazione tace? Funzionano offline?

**Vincoli che questa casa ha gia' pagato e che valgono qui:**
- ⛔⛔ **Una risposta sbagliata SICURA e' peggio del silenzio.** Misurato qui: un modello ha negato
  l'esistenza di una cartella che conteneva 104 file, con una motivazione costruita, e il banco l'ha
  registrata come successo. Un centro assistenza che inventa il comportamento di «Full access» e'
  peggio di nessun centro assistenza. ⇒ Ogni risposta cita la FONTE (file e sezione, o pagina), e
  quando la documentazione non copre la domanda lo dice.
- ⛔ Niente nomi tecnici a schermo: la persona chiede «Full access», non `cartellaEffettivaPerPermessi`.
- ⛔ La documentazione che l'attrezzo legge diventa di fatto pubblica: va trattata come il README,
  quindi niente percorsi personali, niente chiavi, niente roba interna.
- Local-first dove si puo': la fonte 1 non ha bisogno di rete.

**Un corollario che vale da subito:** se TALOS deve spiegare le sue funzioni, quelle funzioni devono
essere SCRITTE da qualche parte. Oggi «Full access» e' spiegato solo dal codice e da un commento.
Questa riga quindi non e' solo un attrezzo: e' anche la decisione di scrivere e mantenere una
documentazione d'uso, funzione per funzione.

**Stato:** APERTA, dichiarata «importantissima» dall'owner, da fare DOPO il rilascio.

> ⛔ **13/09/2026 — RINUMERATE.** Queste tre righe erano nate come PO-14, PO-15 e PO-16, ma quei tre
> numeri erano gia' stati usati il **12/09** nella coda dei debiti per tre cose diverse (i fornitori
> P-D…P-L, la delega a un agente esterno da CLI, la connessione a GitHub). Chi e' arrivato prima
> tiene il numero: le mie di oggi diventano **PO-17, PO-18, PO-19**. ⛔ La causa e' che i numeri PO
> si assegnano in DUE documenti diversi senza un registro unico: finche' resta cosi', succedera'
> ancora.

## PO-20 | Selezione MASSIVA nelle sezioni: Libreria, Note, Ricerca e le altre (owner 13/09/2026, post rilascio)

Owner, parole sue: «pulsante per selezionare massivamente i dati nelle sezioni libreria note ricerca
etc». Nasce guardando TALOS cancellare 214 file della Libreria uno per uno, per nove lotti, in 314
secondi: **la persona non ha alcun modo di farlo da se'**, e nemmeno il modello ce l'ha.

**Cosa manca, oggi.** Le sezioni con elenchi — Libreria (216 voci nello scatto), Note, Attivita',
Memoria, Ricerca approfondita, Progetti, Board — hanno azioni **per riga**. Nessuna selezione
multipla, nessun «seleziona tutto», nessuna azione su piu' voci insieme. Per togliere 214 file di
scarto l'unica via era chiederlo all'agente, che ha dovuto fare 214 chiamate.

**Cosa serve, come minimo:** caselle di selezione per riga; «seleziona tutto» che dichiari se
significa *tutto* o *tutto cio' che il filtro mostra* (sono due cose diverse e vanno distinte a
parole, non con un'icona); un contatore sempre visibile di quante voci sono scelte; e una barra di
azioni che compare solo quando c'e' una selezione.

⛔ **Vincoli che questa casa ha gia' pagato:**
- **La conferma di un'azione distruttiva su N voci deve dire quante e quali**, non ripetere N volte
  la domanda che oggi si fa per una. Un «Elimina 214 file?» senza l'elenco di cosa sta per sparire
  non e' una conferma, e' una trappola.
- ⛔ Deve esistere un modo di **tornare indietro**, o almeno di sapere cosa e' stato tolto. Oggi la
  cancellazione e' definitiva e silenziosa.
- **Piu' di due azioni su un oggetto vogliono un menu**, non cinque pulsanti affiancati: e' una
  regola esplicita dell'owner del 10/09, nata proprio da una riga della Libreria.
- Si rispetta il sistema di disegno Calm gia' in casa, e **nessuna funzione che oggi esiste sulla
  riga singola puo' sparire** nella forma nuova.

⭐ **Fondamenta in comune con BC-10.** Una selezione massiva senza un'operazione massiva sotto
produrrebbe esattamente il difetto di oggi, solo avviato da un pulsante invece che dall'agente. Le
rotte e gli attrezzi che accettano una lista di id servono a tutte e due le righe, e vanno disegnati
una volta sola. ⇒ Ordine consigliato: prima la meta' server/attrezzi di BC-10, poi questa.

**Prima di disegnare** (regola dell'owner): guardare come lo fanno i concorrenti che lui usa come
metro, e che cosa TALOS ha gia' nelle sue liste, invece di inventare da zero.

**Stato:** APERTA, decisa dall'owner, da fare DOPO il rilascio.

### PO-20, estensione | tutte le sezioni con un elenco, non solo la Libreria

Owner, 13/09: «fai in modo che si estenda a tutti i tool che ne hanno bisogno». Vale anche qui: la
selezione massiva non e' una funzione della Libreria, e' una funzione delle LISTE.

Le sezioni con un elenco e con azioni per riga, oggi: **Libreria**, **Note**, **Attivita'**,
**Memoria**, **Ricerca approfondita**, **Progetti**, **Board**, e le liste del contesto (lavori e
fatti). Ognuna ha sotto una rotta che opera su una voce per volta, censite in BC-10.

⇒ La selezione va disegnata **una volta sola come comportamento condiviso delle liste**, non
copiata sette volte. Cambiano solo quali azioni compaiono nella barra quando c'e' una selezione:
eliminare vale ovunque, completare solo per le Attivita', mettere in pausa o annullare solo per le
Ricerche.

⛔ Due avvertenze, dalla stessa giornata: una selezione massiva senza l'operazione massiva sotto
(BC-10) rifarebbe il ciclo di oggi con un pulsante al posto dell'agente; e l'esito va mostrato
**per voce**, perche' un «fatto» complessivo su 214 file nasconde quello che non e' andato.

**Stato:** APERTA, decisa dall'owner, da fare DOPO il rilascio, insieme a BC-10.

## PO-21 | Freccia su per la cronologia dei MESSAGGI, non solo dei comandi (owner 13/09/2026, post rilascio)

Owner: «tasto freccia su per accedere alla cronologia».

⛔ **Cosa esiste gia'** (verificato nel codice il 13/09, non ricordato): la cronologia c'e' gia', ma
registra **solo i comandi della shell**. I fatti:
- il legame ↑/↓ e' gia' nel gestore di tasti del composer (`legacy/app.js`, dentro il `keydown` di
  `composerInput`), introdotto con PO-06 il 10/09;
- chi la riempie e' `ricordaComandoDiretto`, e ha **un solo chiamante**: sta dentro
  `if (value.startsWith('!'))`, e salva il comando DOPO aver tolto il prefisso. Un messaggio
  normale al modello non entra mai nella lista;
- lo store e' `localStorage`, chiave `talos.harness.desktop.comandi.v1`, tetto **50**, **globale**
  (non per sessione), letto una volta e tenuto in memoria.

⇒ Il lavoro non e' costruire la funzione: e' **estenderla ai messaggi**. Il che e' piu' piccolo di
quanto sembri, e piu' delicato di quanto sembri.

⭐ **Una cosa da NON rompere.** La guardia esistente prende ↑ solo a campo vuoto, o se si sta gia'
scorrendo: in una textarea le frecce muovono il cursore fra le righe, ed e' quello che si aspetta
chi scrive un messaggio lungo. E' una decisione giusta e motivata nel codice. Chi tocchera' questa
riga la conservi: rubare sempre ↑ romperebbe la scrittura normale.

**Tre domande da decidere con l'owner, non da risolvere in silenzio:**
1. **Una lista o due?** Comandi e messaggi nello stesso storico significa che ↑ restituisce a volte
   un comando e a volte un messaggio; separarli significa due gesti diversi per la stessa idea.
2. **Globale o per sessione?** Oggi e' globale, e per i comandi ha senso. Per i messaggi meno: un
   messaggio richiamato dentro un altro progetto e' un errore facile da fare e difficile da notare.
3. **Il tetto di 50** e' tarato sui comandi. Con ogni messaggio dentro si riempie molto piu' in
   fretta, e va deciso se 50 resta la cosa giusta.

**Stato:** APERTA, decisa dall'owner, da fare DOPO il rilascio.

## PO-22 | Togliere i temi Paper, Claudius e Basicus (owner 13/09/2026)

**Richiesta, testuale:** «rimuovere temi basicus claudius e paper definitivamente dalla app,
motivo: non mi piacciono». Nessuna discussione da fare: e' una scelta di gusto dell'owner sul
proprio prodotto, ed e' la ragione sufficiente.

**Misurato il 13/09, non ricordato.** Oggi i temi sono **quattordici**, e il loro elenco e'
dichiarato in **DUE posti che devono restare allineati**: `frontend/src/avvio.js:56` e
`frontend/src/legacy/app.js:12665` (`TALOS_THEME_IDS`). Tutti e tre i nomi chiesti dall'owner sono
temi veri di quell'elenco, non parole che capitano.

**Dove vive un tema, per ognuno dei tre** — **otto** posti (li avevo contati sette: la descrizione e le traduzioni sono due file, non uno), e chi ne dimentica uno lascia un tema a
meta':

⛔ **L’elenco delle scene e’ PARALLELO PER POSIZIONE, ed e’ la trappola vera.** Verificato il 13/09 leggendo i tre elenchi: **quattordici** temi in `avvio.js`, **quattordici** in `legacy/app.js`, identici e nello **stesso ordine**; **quattordici** scene congelate, e l’ordine delle scene combacia con quello dei temi, posizione per posizione. ⇒ Togliere un tema dagli elenchi senza togliere **la sua scena, alla stessa posizione**, sposta tutti i temi successivi sulla scena sbagliata, e lo fa **in silenzio**: non c’e’ nessun errore, cambia solo il disegno dietro.

| dove | cosa c'e' |
|---|---|
| `frontend/src/avvio.js:56` | il nome nell'elenco dei quattordici |
| `frontend/src/legacy/app.js:12665` | lo **stesso** elenco, duplicato |
| `frontend/src/styles/temi.css` | il blocco dei semi di colore (accento, fondo, linea, raggi) |
| `frontend/src/styles/desktop-final.css` | regole in piu' per alcuni temi |
| `frontend/src/components/workspace-footer.js:45` | l'etichetta umana mostrata a schermo |
| `frontend/src/motion/desktop-scenes.js:122` | una scena animata a testa, dentro un elenco congelato di quattordici |
| `frontend/src/components/theme-studio.js` | la descrizione lunga mostrata nello studio dei temi |
| `frontend/src/i18n/en.js` | le voci tradotte |

## ⛔ Le due cose che l'owner deve sapere PRIMA, perche' sono conseguenze misurate

1. ✅ **CORRETTO IL 13/09 DALL’OWNER, e la misura gli da’ ragione.** Avevo scritto qui che i temi chiari erano quattro e che dopo la rimozione ne sarebbe restato **uno solo**. ⛔ **E’ FALSO, ed era mio.** L’owner: «ogni tema scuro ha una sua controparte chiara».
   Verificato in `frontend/src/styles/temi.css`, righe 115 e 123: il fondo chiaro e quello scuro leggono il seme del tema **con un ripiego** — se un tema non dichiara il proprio fondo, se lo **deriva dall’accento**. ⇒ **Tutti e quattordici i temi hanno entrambe le forme**; i quattro che dichiarano i semi per esteso stanno solo scavalcando il valore derivato.
   ⇒ **Togliere i tre non riduce le forme chiare disponibili.** La conseguenza che avevo scritto non esiste, e questa riga resta come promemoria: la mia fonte era un commento in `legacy/app.js:12774` che parla dell’impostazione del **mobile**, non dei temi del desktop. Un commento non e’ una misura.
2. **Chi ha gia' scelto uno dei tre** se lo ritrova salvato nelle proprie preferenze. Se si toglie
   il tema senza una migrazione, quella persona resta con un tema **che non esiste piu'**: e' la
   stessa famiglia del «default che nessun percorso produce» gia' in memoria. ⇒ Serve una riga che
   porti chi aveva paper/claudius/basicus su un tema vivo, e la scelta di quale la fa l'owner.

## Come si verifica che sia finita davvero

- I tre nomi non compaiono piu' in **nessuno** dei sette posti: una ricerca sul nome, non sul file.
- L'elenco congelato delle scene passa da quattordici a **undici**, e la app non lancia errori
  all'avvio (quell'elenco e' parallelo per posizione: toglierne uno a meta' sposta tutte le altre).
- Provato **anche al contrario**: si carica un profilo che ha uno dei tre salvato, e si verifica che
  venga portato su un tema vivo invece di restare senza.
- Foto nei due temi, chiaro e scuro, e con il tema chiaro superstite.

⛔ Tocca `frontend/src/legacy/app.js`, quindi in una fase e' una corsia con il lucchetto: un solo
agente per volta su quel file.

## PO-23 | L'icona del desktop su un fondo pieno, presa da quella del mobile (owner 13/09/2026)

**Richiesta, testuale, con foto del collegamento sul Desktop:** «mettere icona dietro un bg, direi
di prendere tale e quale icona della app mobile».

## ⛔ La causa vera di cio' che si vede nella foto, misurata

Nella foto l'icona e' un contorno sottile che si perde sullo sfondo rosso. Non e' solo questione di
gusto: **il file dell'icona contiene due sole misure**, 256 e 32 pixel. Windows per il collegamento
sul Desktop ne usa una da **48**, che li' dentro **non c'e'** ⇒ se la fabbrica da sola rimpicciolendo
quella da 256. Un disegno a filo sottile, ridotto cosi', si sfarina e sparisce.

⇒ Il lavoro ha **due meta'**, e farne una sola non basta:
1. **il fondo pieno**, che e' quello che l'owner ha chiesto;
2. **le misure mancanti**, senza cui anche un'icona col fondo resterebbe sgranata a 48 pixel.

## La proposta dell'owner regge, con una precisazione — verificato nel codice del mobile

L'icona del mobile e' **adattiva a due strati**, dichiarati separatamente: un **fondo pieno**
(`#1e1f22` per il tema calm) e un disegno di primo piano. Cioe' ha gia' esattamente la cosa che manca
al desktop. E il primo piano e' **vettoriale** (600x600 di area di disegno), quindi si ridisegna
pulito a qualunque misura, senza sgranare.

⛔ **Ma non si copia il file.** L'icona di Android e' fatta per essere **ritagliata dal telefono**
dentro un cerchio o un quadrato stondato: ha margini di sicurezza attorno al disegno. Portata su
Windows tale e quale darebbe un'icona con i bordi sbagliati, o troppo piccola dentro il suo quadrato.
⇒ Si prendono i **due strati** e si ridisegna per Windows, alle misure che Windows chiede.

⭐ **E c'e' gia' un generatore che lo fa**: `mobile/tools/android-assets/gen_theme_icons.py` produce
oggi **quindici** icone, una per tema. Estenderlo per emettere anche il formato di Windows e' molto
meno lavoro che ridisegnare a mano.

## ⛔ Due cose da decidere, e le decide l'owner

1. ✅ **DECISO: UNA SOLA** (owner 13/09). Il mobile ne ha quindici, una per tema. Sul desktop l'icona sta
   nel collegamento e nella barra: cambiarla quando la persona cambia tema e' possibile ma non
   gratuito, e su Windows un collegamento gia' creato non si aggiorna da solo. La via semplice e'
   **una sola**, quella del tema predefinito.
2. **Quale fondo.** Il mobile usa un fondo scuro. Sul Desktop di Windows, che puo' avere qualunque
   sfondo, un fondo scuro pieno funziona quasi sempre — ma va guardato su sfondo chiaro **e** scuro
   prima di dire che va bene.

⛔ **Incrocio con PO-22:** fra le quindici icone del mobile ci sono anche quelle di **basicus** e
**claudius**, due dei tre temi che l'owner ha chiesto di togliere. Se i temi spariscono, spariscono
anche le loro icone: le due righe vanno fatte nello stesso giro o si contraddicono.

## Come si verifica che sia finita davvero

- Il file dell'icona contiene **tutte** le misure che Windows usa, non due: si conta aprendo il file,
  non fidandosi del programma che l'ha scritto.
- Foto del collegamento **sul Desktop vero**, su sfondo chiaro e su sfondo scuro, e nella barra delle
  applicazioni: e' li' che il difetto si vede, non in un'anteprima.
- ⛔ Provato anche al contrario: si guarda l'icona a **16 pixel** (barra del titolo), la misura in cui
  un disegno complesso diventa una macchia.

## PO-24 | Rifare la modale del primo avvio (owner 13/09/2026)

**Richiesta, testuale:** «rifare la modale del primo avvio, sinceramente ora come ora fa cagare al
cazzo scusa la sincerita', deve seguire le linee guida delle modali intro moderne 2026, ui super
smooth e setup veloce e rapido».

⛔ E' la **prima cosa** che vede chiunque apra TALOS per la prima volta, e adesso l'installatore e'
pubblicato: da oggi quella schermata la incontrano persone che non siamo noi.

## Cosa c'e' oggi, misurato e non ricordato

`frontend/src/components/intro.js`, **296 righe**, **quattro passi**: cartella, modello, permessi,
pronto. Non e' uno scheletro: legge le cartelle vere del computer con un albero navigabile da
tastiera, i fornitori dal portachiavi, i modelli dal catalogo, e se un elenco non arriva **lo dice**
invece di mostrare valori finti.

⭐ **E dentro c'e' gia' una ricerca**, del 06/09, che va usata e non rifatta da zero: l'onboarding
deve portare **al primo valore nel minor numero di passi** e deve permettere di **saltare**; l'albero
delle cartelle segue le regole di accessibilita' per gli alberi (frecce, inizio e fine, ricerca per
lettera). ⇒ Chi rifa' la modale parte da qui.

## ⛔ Due cose morte attaccate a questa superficie, misurate oggi

1. `apriIntroPrimoAvvio` in `legacy/app.js`, **176 righe**, e il suo nome compare **una volta sola**
   in tutto il codice: la propria definizione. **Nessuno la chiama.** E' la vecchia modale, rimasta.
2. Un commento a `legacy/app.js:445` rimanda a `costruisciIntroPrimoAvvio` «per i dettagli». Quella
   funzione **non esiste** in nessun file. ⇒ Un commento che manda a leggere il nulla e' peggio di
   nessun commento: fa perdere tempo a chi si fida.

⇒ Vanno tolte nello stesso giro, altrimenti chi rifa' la modale trova due versioni e non sa quale sia
viva. Si incrocia con la corsia del codice morto gia' in tabella.

## ⛔ Cosa serve PRIMA di disegnare, e oggi non si puo' fare

L'owner chiede «le linee guida delle modali intro moderne 2026». Quella e' **una ricerca**, ed e'
obbligatoria prima di scrivere codice — regola di casa, violata due volte in un giorno solo a
settembre e mai piu'. ⛔ **Il budget di ricerca web di questa sessione e' esaurito** (200 su 200),
quindi la ricerca **non e' stata fatta** e non va spacciata per fatta. Chi apre questa riga la fa
come primo passo, e cita fonte e data.

Cosa cercare, concretamente: quanti passi tollera una persona prima di abbandonare; se conviene
chiedere le cose **dopo** il primo valore invece che prima; come si fa a far saltare tutto senza che
la app resti inutilizzabile; e che cosa vuol dire «smooth» in numeri — durate delle transizioni,
rispetto della preferenza di chi ha chiesto meno animazioni.

## Come si verifica che sia finita davvero

- ⛔ **Provata da profilo vergine**, non dalle preferenze salvate dell'owner: e' gia' successo che una
  foto sembrasse giusta solo perche' il profilo aveva gia' tutto dentro.
- Contato **quanti passi** e **quanti secondi** servono a una persona nuova per arrivare al primo
  messaggio utile. Sono i due numeri che dicono se «veloce e rapido» e' vero.
- Provata anche nel verso in cui si **salta tutto**: la app deve restare usabile, non rotta.
- Foto nei due temi, chiaro e scuro, e alle larghezze da portatile e da schermo grande.
- Le due funzioni morte non esistono piu', e nessun commento rimanda a funzioni inesistenti.

## PO-25 | Il pulsante «+» come pannello delle azioni, e le PROCEDURE GUIDATE (owner 13/09/2026)

**Richiesta, con quattro schermate del mobile:** riprodurre sul desktop il pannello che si apre col
«+», **e espanderlo**. «Soprattutto nella sezione Crea e Agente ci siano delle funzionalita'
estremamente studiate, come quelle che abbiamo studiato per il workflow con Paperclip, per rendere
quel tasto estremamente versatile». L'owner la chiama **«piu' un end game che altro»**.

## Cosa mostrano le schermate del mobile, letto dalle foto

Un foglio che sale dal basso, titolo **«Cosa vuoi fare?»**, una **casella di ricerca** delle azioni, e
**quattro categorie** in griglia due per due — Allega, Crea, Strumenti, Agente — dove la categoria
scelta si accende e sotto compare il suo elenco:

| categoria | sottotitolo | voci viste nelle foto |
|---|---|---|
| **Allega** | File, immagini, libreria | Allega un file · Scegli un'immagine · Scatta una foto · Dalla Libreria |
| **Crea** | Documenti e contenuti | Migliora il messaggio · Crea presentazione · Crea documento · Analizza un file |
| **Strumenti** | Note, memoria, telefono | Nuova nota · Nuova memoria · Controllo del telefono · Tool Forge · Modelli |
| **Agente** | Piani, ricerche, strumenti | Strumenti del modello (interruttore) · Pianifica un'attivita' · Ricerca approfondita · Lavora con Codice |

## ⛔ Il difetto e' scritto nelle schermate stesse

Tre voci della sezione **Crea** portano come sottotitolo, testualmente, **«Precompila il messaggio»**.
⇒ Oggi quel pulsante **scrive testo nel composer** e si ferma li'. E' un acceleratore di battitura,
non un modo di far partire un lavoro. L'owner lo dice con l'esempio: «Crea una presentazione non e'
che ti riempi il composer con il testo».

## Che cosa deve diventare, e con quale macchina

**Una procedura guidata**: la voce fa partire **un piano a passi** che il modello propone e la
persona approva, come la modalita' piano. Esempi dell'owner: una **presentazione**; e **un sito web**
con una procedura che chiede linguaggio, framework, obiettivo, stack.

⭐ **La macchina c'e' gia' nel piano**, ed e' quella della **modalita' workflow** (Fase 3-bis): il
modello propone un piano, la persona lo approva prima che parta, le lavorazioni dichiarano i file che
toccano, e l'esecuzione riprende dopo una chiusura. ⇒ Una procedura guidata **e' un piano di lavoro
con un modulo davanti**: non serve un secondo motore, serve un modo di **partire da un modello di
piano** invece che dal foglio bianco.

⛔ **Dipendenza vera, non formale:** questa riga **non si apre prima** della modalita' workflow. Senza
quella, «procedura guidata» diventerebbe una finestrella che alla fine incolla un testo nel composer,
cioe' esattamente il difetto di oggi con piu' passaggi.

## ⛔ Cosa NON so ancora, e va accertato prima di scrivere una riga di codice

Non ho misurato **cosa esiste oggi sul desktop** dietro al «+»: se ci sia un pannello, quali voci
abbia, e quali di esse precompilino soltanto. ⛔ Va accertato **nel codice**, non dedotto dalle foto
del mobile: oggi stesso ho aperto due lavorazioni su premesse che non avevo misurato, e una era un
difetto che non esisteva.

E va deciso: quali procedure guidate esistono al primo colpo (presentazione, documento, sito web,
altro), e se la casella di ricerca cerchi solo fra le azioni o anche dentro il prodotto.

## Come si verifica che sia finita davvero

- Una voce di **Crea** fa partire una procedura a passi che si puo' **approvare o annullare**, e alla
  fine produce **un artefatto vero**, non un messaggio precompilato.
- La procedura del **sito web** chiede linguaggio, framework, obiettivo e stack, e ogni risposta
  cambia davvero il piano — provato cambiando una risposta e verificando che il piano cambi.
- Provato **anche al contrario**: si annulla a meta' e non resta niente di sporco, ne' una sessione
  aperta ne' file a meta'.
- Il pannello si apre da tastiera e ci si muove da tastiera, e la ricerca filtra davvero.
- Foto nei due temi e alle due larghezze.
