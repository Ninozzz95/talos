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
