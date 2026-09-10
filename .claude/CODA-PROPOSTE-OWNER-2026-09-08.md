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

### PO-12 — UN ATTREZZO DI MODIFICA per il modello, come `Edit` di Claude Code (owner, 09/09)
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

### PO-01 — aggiunta dell'owner (10/09): **anche OAuth OpenRouter**
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

### D-10A · L'Indice dei giri salta i numeri, con passo 3
Misurato nelle foto del 10/09 (`dopo-02-dove-finisce.png`): l'indice mostra 2, 3, 5, 6, 8, 9, 11, 12,
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
