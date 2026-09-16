# Consegna — modali ridimensionabili e comandi File Explorer

Data: 2026-09-01  
Lane: `C:\Users\Antonino\Desktop\projects\AVM-harness-desktop`  
Ownership: desktop; mobile non modificato.  
Esito: **implementazione e prove tecniche verdi; verifica visuale ufficiale e
gate Qwen fresco non chiusi**.

## Riassunto semplice per l'owner

Le finestre di TALOS possono ora essere ridimensionate dal bordo destro, dal
bordo inferiore o dall'angolo. Ogni tipo di finestra ricorda la propria misura:
ridimensionare Modello non cambia Permessi o Nuova sessione. Su viewport
compatto tornano automaticamente bottom sheet e non escono dallo schermo.

Entrambi gli alberi cartelle hanno comandi visibili e coerenti con Explorer:

- la sidebar Files offre Nuovo file, Nuova cartella, Aggiorna e Comprimi tutto;
- Nuova sessione offre Nuova cartella, Aggiorna, Comprimi tutto e Copia
  percorso;
- nessun comando è decorativo: quando non esiste una sessione reale è
  disabilitato; la cartella del chooser viene creata davvero e poi selezionata;
- nomi Windows non validi, traversal, link/reparse e destinazioni già esistenti
  vengono rifiutati con un messaggio comprensibile.

## File di prodotto modificati

- `harness-ui/public/app.js`
- `harness-ui/public/index.html`
- `harness-ui/public/styles.css`
- `harness-ui/src/workspace-browser.mjs`
- `harness-ui/src/http-app.mjs`

## Test e contratti modificati

- `harness-ui/tests/workspace-browser.test.mjs`
- `harness-ui/tests/http-routes-workspace-browser.test.mjs`
- `harness-ui/frontend/tests/browser/baseline-shell.spec.mjs`
- `harness-ui/frontend/tests/browser/workspace-chooser.spec.mjs`
- `harness-ui/frontend/tests/fixtures/legacy-contract.snapshot.json`

## Documenti della slice

- `.claude/DOSSIER-RICERCA-MODALI-FILE-EXPLORER-2026-09-01.md`
- `.claude/LEDGER-MODALI-FILE-EXPLORER-2026-09-01.md`
- `.claude/CONSEGNA-MODALI-FILE-EXPLORER-2026-09-01.md`

## Decisione tecnica

La soluzione adotta Pointer Events, pointer capture, Web Storage e il contratto
WAI-ARIA dei dialog; adatta la command bar di VS Code/Windows alla grammatica e
ai token TALOS. Non è stato aggiunto un framework di resize e il chooser non è
stato trasformato in un file manager distruttivo.

## Prove concluse

- backend completo: **1219/1219**;
- browser prodotto: **70/70 scenari ordinari**, con 1 gate reale opt-in
  separato;
- frontend unit/contract: **14/14**;
- build: **23 asset** e `verify` verde;
- UI + endpoint reale su `4176`: **1/1**;
- cartella temporanea reale: creazione, rilettura e pulizia verdi;
- sintassi JS e `git diff --check`: verdi.

La suite completa ha trovato due regressioni prima della chiusura: ciclo Tab
rotto dalle maniglie e larghezza fuori viewport a 780 px. Entrambe sono state
corrette e trasformate in controlli permanenti.

## Stato onesto dei gate aperti

Il browser ufficiale dell'app non è disponibile: la lista istanze è `[]`.
Le prove automatiche misurano comportamento e geometria, ma non vengono
spacciate per screenshot ufficiali ispezionati per intero.

Una nuova corsa Qwen 3.8 Flash sul server isolato ha prodotto `RunStarted` ma
non testo né chiusura entro oltre due minuti; è stata annullata senza lasciare
un run appeso. La precedente prova Qwen della slice chooser rimane verde, ma
questa nuova corsa resta un gate rosso/instabile da ripetere.

Il server owner `4174` non è stato riavviato né modificato. Il server isolato
deve essere fermato a fine consegna.

## Ripresa esatta

1. chiudere la review indipendente e correggere ogni finding bloccante;
2. quando il browser ufficiale torna disponibile, aprire `4174` senza
   riavviarlo e catturare 1440×900, 1920×1080 e 1280×800;
3. ispezionare Modello e Permessi con misure separate, Nuova sessione con
   toolbar e sidebar Files con una sessione reale;
4. ripetere il messaggio reale esclusivamente con Qwen 3.8 Flash;
5. promuovere la fase a green completa solo quando entrambi i gate sono verdi.

Nessun push è stato eseguito.
