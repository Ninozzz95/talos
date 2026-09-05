# BRIEF per Astra — le schermate che mancano al mockup di TALOS (05/09/2026)

> Autosufficiente: non serve altro contesto oltre a questo file e ai file che nomina.
> Lingua di lavoro: **italiano**, in ogni commento e in ogni testo a schermo.

## 0. In una frase

Il mockup approvato `.claude/MOCKUP-REDESIGN-TALOS-2026-09-04.html` sta diventando il
frontend vero di TALOS. Il monolite attuale (`harness-ui/public/app.js`, 14 mila
righe) ha **funzioni che il mockup non disegna**. Tu **disegni quelle schermate DENTRO
il mockup**, con il suo identico linguaggio visivo, così che si possano collegare al
codice senza inventare niente. Non scrivi JavaScript di prodotto: solo markup e CSS
nel file del mockup, più la voce di regia per navigarci.

## 0-bis. PRIMA di disegnare: naviga il mockup, da solo, in una tua istanza

Apri `.claude/MOCKUP-REDESIGN-TALOS-2026-09-04.html` in **una nuova istanza del browser**
(Chrome, file locale, oppure il tuo strumento di computer use) e **navigalo liberamente e
per intero** prima di scrivere una riga: ogni voce della regia in alto, ogni luogo della
sidebar, ogni vista di sessione (Chat, Terminale, Review), la colonna dei dettagli con le
sue quattro schede, i tre dialoghi (Nuova, Permessi, Albero), i due temi, le due densità,
le maniglie che ridimensionano, l'inventario dei componenti. Fai screenshot mentre
navighi: sono il tuo metro. Il punto è che tu **veda** il linguaggio visivo — spazi,
raggi, pesi, colori, ritmo delle righe, come parlano i testi — prima di estenderlo.

⛔ **Lo stile del mockup non si viola, in nessun caso.** Non un colore nuovo, non un
raggio diverso, non un font, non un'ombra, non un'icona di un altro set, non un tono di
voce diverso nei testi. Se una tua schermata sembra venire da un altro prodotto, è
sbagliata anche se funziona. Nel dubbio, copia un blocco esistente e cambia solo i dati.

⛔ **Ricontrolla visivamente il lavoro fatto, alla fine, tu stesso**: riapri il mockup
nell'istanza, naviga ogni schermata nuova alle tre larghezze, confrontala fianco a fianco
con una schermata esistente simile, e scrivi nel ledger cosa hai guardato e cosa hai
corretto dopo averlo guardato. Un lavoro che non è stato riguardato non è consegnato.

## 1. Il file che tocchi, e come è fatto

`.claude/MOCKUP-REDESIGN-TALOS-2026-09-04.html` (190 KB), parti da **commit `2c554509`**
del branch `lane/harness-desktop`, in un **worktree tuo** (`git worktree add`), mai nel
worktree di un'altra sessione. È un frammento HTML (senza `<html>`/`<body>`: li aggiunge
la pubblicazione). Dentro:

- **`<style>` unico** (51 KB): in testa il blocco `:root{…}` con i **token** (`--talos-*`:
  colori, font, spazi, raggi, durate). Sotto, un blocco per componente.
  ⛔ **Solo token**: nessun colore, durata o misura scritti a mano. Se ti serve un valore
  che non esiste, lo aggiungi come token in testa e lo dichiari nel commit.
- **Sprite SVG** `<svg class="talos-sprite">` con 29 `<symbol id="i-…">`: si usano con
  `<svg class="i"><use href="#i-nome"/></svg>`. Aggiungi simboli solo se indispensabili,
  nello stesso stile (tratto 1,5, 24×24, `stroke="currentColor"`).
- **Regia** (`<div class="talos-regia">`, barra in alto solo del mockup) con la tablist
  `#regiaSchermo` che elenca le schermate; e uno **script** in fondo con `SCHERMI` (nome →
  id sezione) e `DI_SESSIONE`. Ogni schermata è `<section class="talos-screen"
  id="schermoX" data-c="XScreen" hidden>` dentro `<main id="centro">`.
- **Componenti**: classi BEM `talos-*` + attributo **`data-c="NomeBlocco"`** su ogni
  blocco riusabile. L'inventario dei 93 blocchi esistenti è nella schermata
  `#schermoComponenti`. **Riusa** i blocchi esistenti (Page, Toolbar, FilterChips, ListRow,
  DataTable, CheckCard, SettingRow, Switch, Select, Field, Dialog, Steps, Callout, Chip,
  Badge, Button, IconButton, Kbd, Measure, EmptyState, DetailPanel, CodeBlock…). Un blocco
  nuovo nasce solo se nessuno esistente esprime la cosa, e va aggiunto all'inventario.
- **Convenzioni di onestà** che il mockup già segue e che devi seguire: le stime hanno la
  tilde (`.talos-measure--estimate`), «non misurato» è un trattino con il motivo, ogni
  severità ha una PAROLA e non solo un colore, ogni azione ha il suo nome e lo stesso nome
  ovunque, niente nomi tecnici a schermo (`web_search` → «ricerca sul web»).
- **Accessibilità** come nel resto del file: tablist/tab/tabpanel con `aria-controls`,
  dialoghi con `role="dialog" aria-modal="true" aria-labelledby`, `hidden` per ciò che
  non si vede, `role="status"` solo per ciò che deve parlare, testo vero per chi ascolta
  (`.sr-only`), mai solo `aria-label`.

## 2. Cosa devi disegnare (7 cose), e con quale contenuto

Per ognuna: **una schermata o un dialogo nel mockup**, agganciata alla regia, riempita con
dati **finti ma plausibili** (come le altre), e coerente al pixel con il resto. Il
contenuto lo ricavi dal monolite: i file di riferimento sono indicati.

### 2.1 Model Lab — nuova schermata `schermoModelLab` (`data-c="ModelLabScreen"`), pagina
Riferimento: `harness-ui/public/index.html`, sezione `data-view="settings"`, pannello
`modelLabCard` (≈ 26 KB) e le funzioni `*ModelLab*` in `public/app.js`. Deve mostrare,
con le schede interne (`Tabs`): **Modelli installati** (elenco con dimensione, contesto,
verdetto di compatibilità «entra / entra stretto / non entra» con il motivo, azioni
carica/scarica/rinomina/elimina), **Catalogo** (ricerca + filtro per fornitore + righe),
**Hugging Face** (ricerca repo, filtri autore/ordinamento, dettaglio del repo con file e
stima «entra?», pulsante scarica), **Download** (coda con avanzamento, pausa/riprendi/
annulla, badge «↓ N»), **Runtime** (quale motore, stato, memoria usata/tenuta con
barra, «rimisura», «scarica»), **Prova** (prompt + esecuzione + flusso di risposta +
annulla). Le stime sono stime. Un download in corso e uno fallito devono entrambi
esistere nella fixture.

### 2.2 Intro al primo avvio — dialogo `veloIntro` (`data-c="IntroDialog"`)
Riferimento: `#introDialog` in `public/index.html` e `apriIntroSeServe`/`progressoIntro`
in `app.js`. Un dialogo a passi (`Steps`) con rail laterale, corpo, «Indietro» /
«Avanti» / «Salta». Contenuto dei passi: scelta della cartella, scelta del modello, cosa
TALOS può fare da solo (permessi), fine.

### 2.3 Vista Browser — nuova schermata `schermoBrowser` (`data-c="BrowserScreen"`), di sessione
Riferimento: `data-view="browser"` in `index.html`, `appendBrowserEntry`/
`mostraPaginaBrowser` in `app.js`. Barra con URL e azioni (indietro, ricarica, apri
fuori), l'area della pagina, la cronologia delle pagine aperte dall'agente con chi le ha
aperte (tu / l'agente) e quando; stato di permesso quando la navigazione è bloccata.
Va nella tablist delle viste di sessione (Chat · Terminale · Review · **Browser**).

### 2.4 Palette dei comandi — dialogo `veloComandi` (`data-c="CommandPalette"`)
Riferimento: `#commandDialog` in `index.html`, `openCommandPalette`/`filterCommands`/
`executeCommand` in `app.js`. Campo di ricerca in testa, risultati raggruppati, ogni
comando con nome, descrizione breve e `Kbd`; stato «nessun risultato» onesto; la riga
attiva evidenziata. Si apre con `Ctrl K` (mostralo).

### 2.5 Toast — blocco `Toast` in un contenitore fisso (`data-c="ToastRegion"`)
Riferimento: funzione `toast()` in `app.js`. Tre toni (nota, riuscito, guasto), testo,
azione facoltativa, chiusura; `role="status"`; posizione in basso a destra sopra la
barra di stato. Disegna tre esempi impilati.

### 2.6 Albero della cartella — dentro `#railFile` della colonna dei dettagli
Riferimento: `#inspector-files` in `index.html` (barra comandi: nuovo file, nuova
cartella, su, aggiorna, comprimi; campo filtro; albero con cartelle apribili, file con
icona per tipo, riga selezionata, menu azioni per riga: apri, rinomina, elimina, copia,
allega alla chat, imposta come radice). Oggi `#railFile` ha il pulsante «Mostra l'albero
della cartella»: disegna lo stato **aperto**, sotto quel pulsante, che diventa «Nascondi».

### 2.7 I dialoghi generici — un `Dialog` per ognuno di questi fogli del monolite
Riferimento: `sheetTemplates` in `app.js` (chiavi: `model`, `environment`, `rename`,
`references`, `fileViewer`, `renameFile`, `deleteFile`, `deleteSession`, `createFile`,
`export`, `control`, `capabilities`). Per **model** (scelta modello + livello di
ragionamento con cursore), **environment** (ramo, worktree, radice, repo annidati),
**rename** / **renameFile** / **createFile** (un campo, conferma), **deleteFile** /
**deleteSession** (conferma con conseguenze dette), **export** (formato e destinazione),
**fileViewer** (un file con `CodeBlock` e azioni), **references** (suggerimenti `@`).
`control` e `capabilities` **non li disegni**: sono già il Doctor e la Capability.
Tutti nello stesso `OverlayLayer` + `Dialog` di `veloNuova`, stessa testata, stesso piede.

## 2-bis. Regola critica dell'owner (05/09): MAI SOTTO L'ORIGINALE

«Se ogni singolo aspetto è inferiore alla UI originale, quale è il senso di implementarlo?» Per
ogni schermata e dialogo che disegni, elenca nel ledger le funzioni dell'originale
(`public/index.html` + `public/app.js`) e spuntale una per una: ciò che manca si aggiunge nel
linguaggio del mockup, non si rimanda. In particolare:
- **l'intro porta l'albero delle cartelle in versione compatta dentro il dialogo** (come il
  chooser dell'originale: recenti, progetti, scelte rapide, albero con ricerca — F3-F6);
- **tutti i dialoghi sono ridimensionabili e la misura è ricordata** (chiave del contratto
  `talos-harness-modal-sizes-v1`, come `setupModalResize` nell'originale): maniglia nel
  linguaggio del mockup (`.talos-resizer`), doppio clic per la misura normale;
- ogni screenshot si guarda tutto, a standard alto: un difetto visibile si corregge nello
  stesso giro.

## 3. Cosa NON fare

- Non toccare le schermate e i dialoghi esistenti, se non per aggiungere la voce di
  navigazione che porta alle tue (tab nella regia; «Browser» nelle viste; «Model Lab» nelle
  Impostazioni o nei Luoghi — decidi tu il posto più coerente e dillo).
- Non toccare `harness-ui/` (né `public/`, né `frontend/`, né `src/`): lì lavora un'altra
  sessione. Il tuo perimetro è **il file del mockup**.
- Niente librerie, niente CSS esterno, niente font da rete (il mockup ha i link a Google
  Fonts: lasciali come sono, la app usa i font locali).
- Niente `git push`. Commit sì, nel tuo worktree, **senza** trailer `Co-Authored-By` o
  `Claude-Session`.

## 4. Come si accetta

1. Apri il mockup in Chrome (file locale) e **guarda ogni schermata nuova** alle tre
   larghezze 1440, 1280 e 1024 px. Fai gli screenshot e mettili in
   `.claude/immagini/astra-mockup/`. Ogni schermata nuova deve sembrare **nata insieme**
   alle altre: stessi spazi, stessi raggi, stessi pesi.
2. `document.querySelectorAll('[data-c]')` deve contare ogni blocco nuovo; lo script della
   regia aggiorna da solo il conteggio in `#schermoComponenti`.
3. Nessuno scorrimento orizzontale a 1024 px. Nessun `#hex`, nessun `ms` scritto a mano
   nel CSS nuovo (`grep` lo verifica).
4. Consegna: un solo commit con il mockup, gli screenshot, e un ledger
   `.claude/LEDGER-ASTRA-SCHERMATE-MANCANTI-2026-09-05.md` che elenca per ogni schermata:
   cosa mostra, quali blocchi riusa, quali blocchi nuovi (e perché), i token aggiunti, e le
   scelte che hai fatto dove il monolite era ambiguo.
5. **Ogni schermata la approva l'owner, una per una**, guardando i tuoi screenshot: la
   consegna finisce lì, non con «fatto».

## 5. Se una premessa di questo brief è falsa

Fermati e dillo nel ledger con la misura (che file, che riga), invece di adattare il
disegno a una premessa sbagliata. È già successo due volte in questo progetto e la misura
valeva più del lavoro fatto sopra l'errore.
