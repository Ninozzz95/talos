# Ritorno da Codex — Harness UI, 2026-08-24

> Salvato su richiesta dell'owner ("salva il messaggio e continua"),
> ricevuto testuale via chat mentre la sessione principale era a metà
> della verifica multi-viewport del restyle Model Lab. Non ancora
> auditato dalla sessione principale — questo file è il verbatim del
> ticket di ritorno di Codex, non una revisione. Confronta con
> `TICKET-APPROVAZIONE-CODEX-HARNESS-UI.md` (l'audit PRONTO/§Q1=A/Q2=A
> che lo ha autorizzato) e con `DECISIONI-CODEX-HARNESS-UI.md` §9
> quando arriva il momento di revisionarlo.

## TICKET DI RITORNO — TALOS HARNESS UI

Data: 24 agosto 2026
Destinatario: Main Agent / Owner
Repository di implementazione:
C:\Users\Antonino\Desktop\projects\AVM-harness-ui

Branch:
lane/harness-ui

### ESITO
PRONTO nel perimetro ridotto approvato.

Harness UI è stato realizzato come strumento autonomo, locale e in sola
lettura. La Board usa i dati reali delle due campagne autorizzate.
Tutte le altre superfici sono UI dimostrative funzionanti nel browser e
sono indicate esplicitamente come:

Demo UI · non collegato

Nessun push è stato effettuato.

============================================================
### 1. PERIMETRO RISPETTATO
============================================================

- Nessuna modifica effettuata dentro TALOS-BANCO.
- Nessun collegamento con Vue, Vite, il commit mobile o la cartella mobile.
- Nessuna importazione di rapportoCampagna.mjs.
- Nessun child_process, exec, spawn o PowerShell lanciato verso TALOS-BANCO.
- Server accessibile soltanto in locale tramite loopback.
- Nessun package.json, package-lock.json, node_modules o npm install.
- Runtime esatto: Node.js 24.18.0.
- Browser di verifica: Chrome 151.0.7922.173.
- Mobile prioritario e completamente locale.
- Nessun requisito offline, service worker o WCAG bloccante.
- Nessuna soglia prestazionale bloccante.
- Un solo browser previsto: Chrome.
- I dati esterni vengono riletti soltanto premendo Aggiorna.
- Le campagne ammesse sono esclusivamente:
  - esiti-22ago-progetti
  - esiti-22ago-storia

============================================================
### 2. FUNZIONALITÀ REALIZZATE
============================================================

#### A. Mockup e interfaccia

- Conservata una copia byte-per-byte dei 18 file originali del mockup.
- Registrata la provenienza del mockup e delle immagini di riferimento.
- Realizzata una versione autonoma HTML, CSS e JavaScript.
- Tutte le 18 superfici previste hanno una controparte visibile.
- Le interazioni puramente visive continuano a funzionare.
- Tutte le superfici non integrate mostrano localmente:
  Demo UI · non collegato
- Nessuna risorsa grafica o JavaScript viene caricata da Internet.

#### B. Board collegata ai dati reali

La Board permette di:

- scegliere una delle due campagne autorizzate;
- visualizzare lo stato della campagna;
- vedere riepilogo, conteggi, tempi e costi;
- leggere le righe reali dei file JSONL;
- filtrare per harness ed esito;
- caricare altre righe tramite paginazione;
- aggiornare manualmente i dati;
- aprire l'evidenza testuale completa;
- rimuovere l'evidenza dalla pagina con Svuota evidenze;
- visualizzare il rapporto quando rapporto.txt sarà disponibile;
- mostrare Rapporto non ancora prodotto quando il file non esiste.

Dati reali verificati:

- esiti-22ago-progetti: 120 righe, zero diagnostiche;
- esiti-22ago-storia: 40 righe, zero diagnostiche;
- costo canonico progetti: $0.846658447;
- costo canonico storia: $0.660550154.

Il costo viene letto da <harness>.costo.json.
Se il file manca, viene usata la somma delle righe marcata con ~.
Se non esiste nessuna fonte valida, il costo resta assente e non viene
trasformato falsamente in zero.

#### C. Rapporto

- rapporto.txt viene letto come testo opaco e preformattato.
- Non viene riparsato campo per campo.
- Il server non tenta mai di produrlo.
- Il server non importa né esegue rapportoCampagna.mjs.
- I due rapporto.txt reali oggi non esistono.
- Entrambi gli endpoint restituiscono correttamente:
  HTTP 404 — REPORT_UNAVAILABLE
- La UI mostra:
  Rapporto non ancora prodotto
- Nessun rapporto finto è stato introdotto.

#### D. Server locale

API disponibili:

- GET/HEAD /api/v1/health
- GET/HEAD /api/v1/campaigns
- GET/HEAD /api/v1/campaigns/{campagna}/snapshot
- GET/HEAD /api/v1/campaigns/{campagna}/runs
- GET/HEAD /api/v1/campaigns/{campagna}/report

Protezioni applicate:

- ascolto consentito soltanto su indirizzi loopback;
- allowlist delle campagne fissa e soltanto restringibile;
- rifiuto di percorsi assoluti, UNC e attraversamenti con ..;
- controllo di symlink e junction che escono dal banco;
- nessuna directory listing;
- nessun CORS;
- metodi di scrittura rifiutati;
- limiti su file, righe, query, cursori e rapporti;
- errori ripuliti da percorsi assoluti, stack ed evidenze;
- CSP, nosniff, frame denial e no-store;
- dati inseriti nella pagina come testo, senza esecuzione HTML;
- cursore di paginazione opaco;
- filtri soltanto per valori esatti.

============================================================
### 3. VERIFICA VISIVA
============================================================

Verificati con Chrome reale i sei stati canonici:

- desktop: 1440×900
- laptop: 1024×800
- tablet: 768×1024
- mobile: 390×844
- mobile stretto: 320×720
- capabilities: 390×844

Esito:

- viewport richiesto e misurato identici;
- nessuno scorrimento orizzontale indesiderato;
- DOM pronto in tutti i casi;
- zero problemi segnalati dal browser;
- Board reale aperta automaticamente nei cinque stati principali;
- pannello capability aperto nello stato dedicato;
- nessuna sovrapposizione del badge demo;
- nessun taglio causato dalla dimensione minima della finestra Windows;
- nessun processo o profilo Chrome temporaneo rimasto dopo il collaudo.

Gli artefatti locali del collaudo sono ignorati da Git e si trovano sotto:

C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\.artifacts\chrome-qa\

Contenuto finale:

- desktop.png
- laptop.png
- tablet.png
- mobile.png
- mobile-narrow.png
- capabilities.png
- qa-summary.json

============================================================
### 4. TEST ED EVIDENZE
============================================================

Suite automatica:

67 test superati su 67
0 fallimenti
0 test saltati

Comando:

node --test harness-ui/tests/*.test.mjs

Ulteriori controlli superati:

- sintassi JavaScript;
- sintassi PowerShell;
- git diff --check;
- smoke test locale sulle fixture;
- server reale avviato con Node Permission Model;
- nessun permesso di scrittura;
- nessun permesso child process;
- nessuna dipendenza npm;
- repository di implementazione pulito dopo il commit;
- nessun processo Chrome QA residuo.

Misure locali, non bloccanti:

- avvio server fino alla prima health: 78,46 ms;
- elenco campagne: 12,12 ms;
- snapshot progetti: 29,32 ms;
- snapshot storia: 21,89 ms;
- prime 40 righe progetti: 4,98 ms;
- report progetti mancante: 2,08 ms;
- report storia mancante: 1,78 ms.

Immutabilità TALOS-BANCO:

Digest prima:
7466806ef1c7b1812178cc9b0500ae1dbe5c6b84eac96064b671f707a02141d3

Digest dopo:
7466806ef1c7b1812178cc9b0500ae1dbe5c6b84eac96064b671f707a02141d3

Le due campagne contenevano 16 file ciascuna prima e dopo.
Esito: TALOS-BANCO è rimasto identico.

============================================================
### 5. REGRESSIONI SCOPERTE E RISOLTE
============================================================

Sono stati identificati, corretti e trasformati in controlli permanenti:

- query QA non correttamente instradate;
- perdita del focus dopo Carica altro;
- badge demo sovrapposto nella risoluzione laptop;
- badge capability sovrapposto al pulsante di chiusura su mobile;
- uso di stili inline incompatibili con la CSP;
- messaggio di errore di rete non abbastanza utile all'owner;
- dimensioni Chrome da riga di comando non affidabili su Windows;
- possibile permanenza del profilo Chrome temporaneo dopo il collaudo.

Per ottenere dimensioni esatte, il collaudo usa Chrome DevTools Protocol
e non si affida soltanto a --window-size.

============================================================
### 6. MODIFICHE PER COMMIT
============================================================

1. a2fa3904 — harness-ui: preserve approved mockup reference
   - copia immutata dei 18 file originali; manifest SHA-256; provenienza;
     aggiornamento avvisi di terze parti; test di fedeltà byte-per-byte.
2. a5ade0e4 — harness-ui: implant complete responsive mockup
   - versione autonoma del mockup; tutte le 18 superfici; comportamento
     responsive; interazioni UI; etichette demo locali.
3. a85709cf — harness-ui: add safe bank readers
   - configurazione; allowlist; protezione percorsi; lettura JSONL;
     normalizzazione sicura; limiti e diagnostiche; fixture sintetiche;
     relativi test.
4. 0339f448 — harness-ui: add read-only campaign server
   - server locale; servizio campagne; lettore dei costi; sorgente
     rapporto opaca; API HTTP; file statici; test del server e delle API.
5. 1f86cc44 — harness-ui: connect safe campaign board
   - Board collegata alle campagne reali; filtri; paginazione;
     aggiornamento; evidenze; rapporto; stati di errore; correzioni
     responsive e CSP.
6. 83570aae (hash completo 83570aaed1a9c6ddf59086e9e98ec16eb2475eb5) —
   harness-ui: add local QA and CI gate
   - manuale operativo; ticket di ritorno; collaudo Chrome; sei stati
     deterministici; CI senza installazioni; esclusione degli artefatti
     temporanei; test finali.

Nessun push effettuato.

Intervallo completo da revisionare: a2fa3904^..83570aae

Totale: 55 file modificati o creati; 9.961 inserimenti; zero file eliminati.

============================================================
### 7. ELENCO COMPLETO DEI FILE DI PRODOTTO
============================================================

File di repository modificati:
- [M] AVM-harness-ui\.github\workflows\ci.yml
- [M] AVM-harness-ui\.gitignore
- [M] AVM-harness-ui\THIRD_PARTY_NOTICES.md

Documentazione Harness UI:
- [A] AVM-harness-ui\harness-ui\PROVENANCE.md
- [A] AVM-harness-ui\harness-ui\README.md
- [A] AVM-harness-ui\harness-ui\RITORNO-HARNESS-UI.md

Runtime e interfaccia:
- [A] AVM-harness-ui\harness-ui\server.mjs
- [A] AVM-harness-ui\harness-ui\public\index.html
- [A] AVM-harness-ui\harness-ui\public\styles.css
- [A] AVM-harness-ui\harness-ui\public\app.js
- [A] AVM-harness-ui\harness-ui\scripts\qa-chrome.ps1

Moduli di lettura e servizio:
- [A] AVM-harness-ui\harness-ui\src\config.mjs
- [A] AVM-harness-ui\harness-ui\src\path-policy.mjs
- [A] AVM-harness-ui\harness-ui\src\jsonl-reader.mjs
- [A] AVM-harness-ui\harness-ui\src\cost-reader.mjs
- [A] AVM-harness-ui\harness-ui\src\campaign-service.mjs
- [A] AVM-harness-ui\harness-ui\src\report-source.mjs
- [A] AVM-harness-ui\harness-ui\src\http-app.mjs
- [A] AVM-harness-ui\harness-ui\src\static-files.mjs

Test:
- [A] AVM-harness-ui\harness-ui\tests\campaign-service.test.mjs
- [A] AVM-harness-ui\harness-ui\tests\config.test.mjs
- [A] AVM-harness-ui\harness-ui\tests\cost-reader.test.mjs
- [A] AVM-harness-ui\harness-ui\tests\http-app.test.mjs
- [A] AVM-harness-ui\harness-ui\tests\jsonl-reader.test.mjs
- [A] AVM-harness-ui\harness-ui\tests\mockup-fidelity.test.mjs
- [A] AVM-harness-ui\harness-ui\tests\path-policy.test.mjs
- [A] AVM-harness-ui\harness-ui\tests\report-source.test.mjs
- [A] AVM-harness-ui\harness-ui\tests\ui-contract.test.mjs

Fixture sintetiche:
- [A] .../tests\fixtures\banco\esiti-22ago-progetti\alpha.jsonl
- [A] .../tests\fixtures\banco\esiti-22ago-progetti\beta.jsonl
- [A] .../tests\fixtures\banco\esiti-22ago-progetti\alpha.costo.json
- [A] .../tests\fixtures\banco\esiti-22ago-progetti\beta.costo.json
- [A] .../tests\fixtures\banco\esiti-22ago-progetti\rapporto.txt
- [A] .../tests\fixtures\banco\esiti-22ago-storia\alpha.jsonl
- [A] .../tests\fixtures\banco\esiti-22ago-storia\alpha.costo.json
- [A] .../tests\fixtures\banco\esiti-22ago-storia\rapporto.txt
- [A] .../tests\fixtures\banco\esiti-non-ammessi\evil.jsonl

============================================================
### 8. COPIA ORIGINALE DEL MOCKUP — 18 FILE
============================================================

Sotto AVM-harness-ui\harness-ui\mockup-originale\: README.md,
RESEARCH.md, UI_REVIEW.md, app.js, index.html, styles.css,
talos-harness-standalone.html, preview-desktop.png, preview-laptop.png,
preview-mobile.png, preview-mobile-narrow.png, preview-mobile-review.png,
preview-mobile-capabilities.png, preview-tablet.png,
references\claude-mobile-reference.jpg,
references\deepseek-harness-reference.png,
references\openclaw-workbench-reference.png,
references\talos-current-reference.jpg.

============================================================
### 9. PERCORSI COMPLETI DELLA DOCUMENTAZIONE
============================================================

Documentazione finale e operativa nel repository di implementazione:
- AVM-harness-ui\harness-ui\README.md
- AVM-harness-ui\harness-ui\RITORNO-HARNESS-UI.md
- AVM-harness-ui\harness-ui\PROVENANCE.md
- AVM-harness-ui\THIRD_PARTY_NOTICES.md
- AVM-harness-ui\harness-ui\mockup-originale\README.md
- AVM-harness-ui\harness-ui\mockup-originale\RESEARCH.md
- AVM-harness-ui\harness-ui\mockup-originale\UI_REVIEW.md

Documentazione decisionale e di pianificazione nel repository AVM principale:
- AVM\.claude\PROMPT-CODEX-HARNESS-UI.md
- AVM\.claude\PROPOSTA-CODEX-HARNESS-UI.md
- AVM\.claude\CONSEGNA-CODEX-HARNESS-UI.md
- AVM\.claude\DECISIONI-CODEX-HARNESS-UI.md
- AVM\.claude\DOSSIER-RICERCA-CODEX-HARNESS-UI.md
- AVM\.claude\LEDGER-CODEX-HARNESS-UI.md
- AVM\.claude\TICKET-APPROVAZIONE-CODEX-HARNESS-UI.md

Stato dei documenti nel repository AVM principale (dichiarato da Codex):
- DECISIONI-CODEX-HARNESS-UI.md: modificato, non incluso nei commit del
  repository AVM-harness-ui;
- DOSSIER-RICERCA-CODEX-HARNESS-UI.md: nuovo e non tracciato;
- LEDGER-CODEX-HARNESS-UI.md: nuovo e non tracciato;
- TICKET-APPROVAZIONE-CODEX-HARNESS-UI.md: nuovo e non tracciato;
- PROMPT, PROPOSTA e CONSEGNA: letti come documenti sorgente e non modificati.

Dichiarazione di Codex: gli stati "implementazione non autorizzata"
eventualmente presenti nei documenti preparatori descrivono la fase
storica precedente all'autorizzazione; lo stato corrente è in
RITORNO-HARNESS-UI.md (dentro AVM-harness-ui, non questo file).

Dichiarazione di Codex: la modifica già presente in
AVM\mobile\third_party\llama.cpp è estranea a Harness UI ed è stata
lasciata completamente intatta.

============================================================
### 10. DIPENDENZA ESTERNA ANCORA APERTA
============================================================

Mancano:
- esiti-22ago-progetti\rapporto.txt
- esiti-22ago-storia\rapporto.txt

Devono essere prodotti esternamente da chi possiede le rispettive corse,
quando Stadio B sarà stabile, usando il redirect dell'output testuale di
rapportoCampagna.mjs già approvato dall'owner (DEC-054 — coerente con la
risposta data a Codex in chat su questo stesso punto, stessa giornata).

Harness UI non deve produrli, non deve eseguire il banco e non deve
sostituirli con dati inventati.

Finché i due file non esistono restano pendenti:
- il gate end-to-end dei rapporti reali;
- il confronto fra il costo canonico e il costo dichiarato nel rapporto.

Questo non impedisce l'uso della Board e non richiede ulteriori modifiche
all'interfaccia.

============================================================
### 11. COSA DEVE FARE L'OWNER (dichiarato da Codex)
============================================================

Adesso non è richiesta alcuna azione tecnica. Quando Stadio B sarà stabile:
1. far produrre i due rapporto.txt a chi possiede le corse;
2. rilanciare il controllo dei due endpoint report;
3. verificare il confronto costo/rapporto;
4. autorizzare separatamente un eventuale push o integrazione.

============================================================
### 12. COSA DEVE FARE IL MAIN AGENT (dichiarato da Codex)
============================================================

- Revisionare l'intervallo a2fa3904^..83570aae
- Usare RITORNO-HARNESS-UI.md come resoconto corrente.
- Non modificare o avviare TALOS-BANCO.
- Non collegare il lavoro a Vue/Vite/mobile.
- Non trasformare le superfici demo in funzionalità dichiarate reali.
- Non considerare i rapporto.txt già disponibili.
- Dopo l'arrivo dei due rapporti, rieseguire soltanto il gate report e il
  confronto dei costi.
- Non effettuare push senza autorizzazione esplicita dell'owner.

============================================================
### 13. ROLLBACK (dichiarato da Codex)
============================================================

Rollback consentito esclusivamente tramite git revert, in ordine inverso:
1. git revert 83570aae
2. git revert 1f86cc44
3. git revert 0339f448
4. git revert a85709cf
5. git revert a5ade0e4
6. git revert a2fa3904

Non usare git reset --hard. TALOS-BANCO non richiede rollback perché non
è stato modificato (dichiarato).

============================================================
### RIEPILOGO SEMPLICE (di Codex)
============================================================

Lo strumento è costruito, funziona in locale, legge davvero le due
campagne, non può modificare il banco e presenta chiaramente come demo
tutto ciò che non è collegato. La versione mobile è stata trattata come
prioritaria e verificata anche a 320 pixel. Tutti i 67 test passano e
TALOS-BANCO è rimasto identico. L'unica cosa non disponibile sono i due
rapporti reali, che dovranno essere prodotti in seguito dal proprietario
delle corse. Non è stato eseguito alcun push.

---

## Nota della sessione principale — non ancora fatto

Questo è il testo di Codex, non verificato in modo indipendente da questa
sessione (nessun `git log`/`git diff` su AVM-harness-ui, nessun `node --test`
rilanciato, nessuna riapertura degli screenshot Chrome). Da fare quando la
sessione principale torna a questo lavoro, prima di trattarlo come chiuso:
leggere `RITORNO-HARNESS-UI.md` dentro AVM-harness-ui, controllare
`git log a2fa3904^..83570aae --stat` per conferma indipendente dei 55 file,
e verificare a campione almeno un test reale invece di fidarsi del conteggio
dichiarato — stessa disciplina già applicata al resto di questo workstream.
