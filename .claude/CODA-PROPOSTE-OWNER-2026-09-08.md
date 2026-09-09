# Coda delle proposte dell'owner — 08/09/2026

Stato: **IN CODA — ricerca tecnica e proposta implementativa da svolgere**.
Richiesta dell'owner ricevuta insieme a `TICKET-CONSEGNA-AD-ASTRA-2026-09-08.md`.
Queste proposte seguono il lavoro corrente del ticket; non lo sostituiscono.
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

Stato: **IN CODA**, non implementato. Si collega al pannello destro del ticket; non interrompe la diagnosi dei difetti segnalati oggi (ragionamento dopo cambio sessione, ritorno in fondo, ripresa locale).

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

### PO-09 — Terminale in split orizzontale in basso (owner, 09/09)
«Un pulsantino per far aprire il terminale splittato in orizzontale in basso, come fa Hermes, Codex e tanti
altri tipo VS Code: resizable, intuitivo.» Requisiti: un pulsante piccolo (topbar o piede), pannello in basso
sotto la chat, maniglia di ridimensionamento con misura ricordata (stessa chiave dei dialoghi), chiusura e
riapertura senza perdere la sessione del terminale; ricerca su Hermes/Codex/VS Code prima di disegnare.

### PO-10 — I comandi dell'agente dentro la sezione Terminale (owner, 09/09)
«Nella sezione terminale si integrano tutti i comandi effettuati fino a quel momento dall'agente, e quindi
distinguere tra schede terminale agente e utente.» Requisiti: ogni comando eseguito dall'agente (shell/prova)
compare nel Terminale con output e stato, in ordine; schede **agente** distinte dalle schede **utente** (nome,
colore/pallino, sola lettura per quelle dell'agente); nessun comando inventato — solo quelli davvero eseguiti,
letti dagli eventi ToolCall; stessa fonte del pannello Processi.

### PO-11 — Il DIFF del file modificato, dentro la chat (owner, 09/09)
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
