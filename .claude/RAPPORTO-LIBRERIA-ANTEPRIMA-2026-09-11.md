# Il contenuto di un file nel dettaglio della Libreria — 11/09/2026

> Lane `lane/harness-desktop`, cartella `harness-ui/frontend/`. Nessun giro col modello, nessun
> gesto sulla **4174**: laboratorio su porta effimera (`61732`), banco della app su `63807`.
> Niente git.

---

## 1. Il difetto, com'era

Foto dell'owner sul 4174, sera dell'11/09: elenco a sinistra coi quattro file generati, dettaglio a
destra con «Libreria / Dettaglio», il titolo «File di prova – Markdown.md», la riga «Azioni sul
file» e **un riquadro vuoto** con dentro solo «Tutte le azioni ⋯».
Owner: «il file non viene visualizzato come nel mockup, sia renderizzato che in versione testuale».

**Cosa c'era davvero in codice** — `src/components/sezioni-adattatori.js`, `dettaglio` della
Libreria: tre metadati, il nome in `h2`, `h3` «Azioni sul file», la riga vera ospitata, e una frase
sul percorso. **Del contenuto del file non c'era una riga.** Non un guasto di resa: la funzione non
lo mostrava affatto.

## 2. Cosa mostra il mockup, con la riga

`.claude/refactor-ui-owner-2026-09-11/Talos_Desktop_Final_Mockup_Interattivo.html`

| riga | cosa fa |
|---|---|
| **6078** | il **dettaglio**: `if(k==='libreria')body+='<h3>Contenuto locale</h3><pre class="td-code">'+esc(i.contenuto)+'</pre>'` — il testo grezzo del file |
| **6072** (`renderDetail`) | poco sopra, `<div class="td-prose">${esc(i.descrizione??i.contenuto??'')}</div>` — **lo stesso contenuto una seconda volta**, come prosa |
| **6309** (`fileCover`) | la **copertina della scheda**: una resa PER TIPO — `<table>` per il CSV (prime 5 righe × 4 colonne), `<h4>` del primo titolo per il MD, eyebrow + titolo grande per le slides |
| **4269-4277** | il CSS della copertina: tabella `9px` monospazio, `th` su `--talos-accent-soft` |
| **4148** | `.td-code`: `pre-wrap`, `12px`, `padding 16px`, bordo e fondo `--talos-window-bg` |
| **6008-6013** | i dati: sei file, tipi `md · csv · slides · txt · html`. **Nessun PDF, nessun DOCX** |

⇒ I «due modi» che l'owner nomina esistono nel mockup ma in **due punti diversi**: la resa per tipo
sta nella scheda, il testo grezzo nel dettaglio. Nel dettaglio il mockup stampa il contenuto **due
volte di fila**, e la prima delle due **non è resa** (si vede `# TALOS Desktop` col cancelletto —
misurato sulla foto `mockup-md-chiaro-1440.png`).

## 3. La cura

### 3.1 File nuovo — `src/components/libreria-anteprima.js`

| riga | cosa |
|---|---|
| `formatoFile()` :59 | dal nome: `markdown` · `tabella` · `testo` · `binario`. Un nome **senza estensione è binario**, non testo: stampare byte ignoti in un `<pre>` è la riga onesta e inservibile `[binary docx file, 7714 bytes]` in un'altra forma |
| `modiFile()` :80 | due modi dove la resa è diversa dal testo (md, csv, binari), **uno solo** per `.json`/`.txt`/`.html` — un interruttore con una scelta sola non è un interruttore (stessa regola che in `sezione-elenco-dettaglio.js` nasconde la riga dei filtri quando il filtro è uno) |
| `righeCsv()` :121 | parser RFC 4180 scritto a mano: virgolette, virgolette raddoppiate, CRLF. `split(',')` avrebbe spezzato in due la cella `"Rossi, Mario"` — cioè un dato **sbagliato con l'aria di essere giusto** |
| `frasiRighe()` :159 | «31 righe» per un file, «30 righe di dati» per una tabella |
| `contenutoModoFile()` :273 | il contenuto di un modo: markdown reso · tabella · `<pre class="td-code">` · carta del formato esterno · attesa · errore con `role="alert"` |
| `montaAnteprimaFile()` :339 | `h3` «Contenuto del file» + interruttore + pannello, e la lettura che parte **una volta sola** per file |
| `lettoreFileLibreria()` :447 | il lettore predefinito sulla rotta che **esiste già** |

**Nessun secondo motore Markdown**: si passa da `prosaInNodi` di `ricerca-dettaglio.js`, che con
`rendiMarkdown` iniettato usa il render della chat e senza cade sulla lettura strutturale minima.

### 3.2 Aggancio — `src/components/sezioni-adattatori.js`

* :41 import · :327-334 magazzino, `ridisegna`, `leggiFile` (iniettabile; senza iniezione
  `lettoreFileLibreria(sessionId)`) · :406-415 il pannello **sopra** le azioni · :416 `h3` «Azioni
  sul file» · :359-364 `apriConSistema`, che chiama la rotta vera `POST …/apri` e, se il server dice
  di no, lo **dice** con un avviso.

### 3.3 Stile — `src/styles/mockup-td.css` :380-420

Solo token dei temi, nessun colore nuovo, nessuna animazione. L'interruttore è il `.td-segment
.td-viste` già usato dalle viste della Ricerca; la tabella prende i pesi della copertina del mockup
(4274-4276); il testo grezzo è il `.td-code` che il mockup usa al suo posto.

## 4. Le rotte e la CSP — misurato, non dedotto

`harness-ui/src/http-app.mjs`

| cosa | dove | esito |
|---|---|---|
| `GET /api/v1/sessions/:id/library/:voceId/file` | :2023-2062 | `Content-Type: application/octet-stream` · `Content-Disposition: attachment` · `X-Content-Type-Options: nosniff` · `Cache-Control: private, no-store` · `Content-Security-Policy: default-src 'none'; sandbox` |
| CSP della pagina | :442 | `frame-src 'self' http://localhost:* http://127.0.0.1:* https:` · **`object-src 'none'`** |
| estrazione testo da PDF/DOCX | — | **non esiste**: `grep -n "estraiTesto\|mammoth\|pdf-parse\|pdfjs" harness-ui/src/*.mjs` → zero. Ci sono i **generatori** (`document-generator.mjs`, `docx`/`pdf-lib`/`pdfmake`/`xlsx`), non i lettori |

**Perché un PDF non si incornicia oggi — tre motivi, non uno:**

1. `Content-Disposition: attachment` — «indicating it should be downloaded; most browsers presenting
   a "Save as" dialog» ([MDN, `Content-Disposition`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Disposition), letta **11/09/2026**). Un `<iframe>` su
   quell'indirizzo **scaricherebbe** il file, non lo mostrerebbe.
2. `Content-Type: application/octet-stream` con `nosniff`: il browser non può trattarlo da PDF.
3. La CSP della risposta, `sandbox` senza valore, «prevents the execution of plugins»
   ([MDN, CSP `sandbox`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/sandbox), letta **11/09/2026**) — cioè spegne il lettore PDF del browser
   anche se i primi due fossero a posto.
   `<object>`/`<embed>` sono esclusi a monte: la pagina ha `object-src 'none'`.

⇒ **La proposta al server, non applicata** (`http-app.mjs` non è di questa lane): una rotta gemella
`GET …/library/:voceId/anteprima`, da aggiungere accanto alla riga **:834**

```js
{ schema: /^\/api\/v1\/sessions\/([^/]+)\/library\/([^/]+)\/anteprima$/, metodi: ['GET'] },
```

con lo stesso corpo dello scarico (:2023) e queste intestazioni al posto delle sue:

```js
'Content-Type': 'application/pdf',            // SOLO se l'estensione è .pdf: mai il mediaType dichiarato
'Content-Disposition': `inline; filename="${nomi.ascii}"`,
'Content-Security-Policy': "default-src 'none'; sandbox allow-scripts; object-src 'none'",
```

`allow-scripts` serve al lettore PDF del browser (punto 3); resta un 404 per ogni estensione che non
sia `.pdf`, così la rotta non diventa un modo generico di servire byte in linea. La CSP della pagina
va già bene (`frame-src 'self'`): **non serve toccarla.**

## 5. Confronto testa a testa col mockup

Foto in `.claude/foto-libreria-anteprima-2026-09-11/` — **56 immagini** (44 della app, 12 del mockup), coppie con lo stesso nome:
`app-<vista>-<tema>-<larghezza>.png` e `mockup-<vista>-<tema>-<larghezza>.png`.
App: 8 viste Libreria + 3 Ricerca × {chiaro, scuro} × {1440×900, 1024×800}.
Mockup: `md`, `csv`, `ricerca` × {chiaro, scuro} × {1440, 1024}.

### 5.1 Markdown — `app-md-anteprima-*` / `app-md-testo-*` vs `mockup-md-*`

| | mockup | app | differenza, e perché |
|---|---|---|---|
| **struttura** | meta → `h2` → prosa (non resa) → `h3` «Contenuto locale» → `<pre>` → piede con Modifica / ⬇ / 🗑 | meta → `h2` → `h3` «Contenuto del file» → interruttore → pannello → `h3` «Azioni sul file» → riga vera | Il mockup stampa **lo stesso testo due volte** e la prima non è resa. L'owner ha chiesto «renderizzato **e** testuale»: l'interruttore dà i due contenuti **veri** senza il doppione |
| **parole** | «Contenuto locale» | «Contenuto del file» | «locale» nel mockup distingueva i dati della demo da una rete che non c'era. Qui **ogni** file è sul disco del progetto: la parola non distinguerebbe niente |
| **parole** | chip `file` · `11 set` | chip `Documento` · `Generato` · `Aggiornato il 11/09/2026, 11:20:00` | **dato vero che il mockup non aveva**: `fileType` e `origine` arrivano dalla rotta |
| **azioni** | tre bottoni affiancati nel piede | menu «⋯» + tasto destro | **regola dell'owner del 10/09**: più di due azioni su un oggetto ⇒ menu overflow |
| **spaziature** | `.td-detail-body` padding `28px`; `h2` **28px**/margine 22px; meta gap **9px**; `.td-code` 12px padding 16px | padding `28px 24px`; `h2` **24px**/margine 18px; meta gap **7px**; `.td-code` **identico** | Il blocco di testo è **pari al pixel**. Le tre differenze stanno in `.td-detail-body` (`mockup-td.css` §5) e valgono per **tutte e sei** le sezioni: sono del porting del lotto C, non di questo pannello — **registrate, non corrette** (cambiarle ora invaliderebbe le foto già approvate delle altre cinque) |
| **scheda dell'elenco** | copertina con un **estratto del contenuto** | copertina con **estensione + nome** | `GET …/library` manda i metadati, **non i byte**: un estratto per scheda sarebbe una richiesta per file all'apertura della sezione. Già dichiarato in `sezioni-adattatori.js` |

### 5.2 CSV — `app-csv-*` vs `mockup-csv-*`

| | mockup | app | differenza |
|---|---|---|---|
| **struttura** | tabella **solo nella scheda** (5 righe × 4 colonne, `aria-hidden`), nel dettaglio il `<pre>` | tabella **nel dettaglio**, intestazione fissa, 30 righe + «Mostra tutte le 60 righe» | Il mockup aveva 4 righe di dati: la paginazione non gli serviva. Con dati veri serve |
| **parole** | — | «30 righe di dati · 1,5 kB» | **difetto mio, trovato nella foto e corretto**: diceva «31 righe» mentre il bottone diceva «30» — due verità che insieme sembravano un errore di conteggio |
| **spaziature** | celle `5px 7px`, font 9px | celle `7px 11px`, font 12px | La copertina del mockup è una **miniatura decorativa** (`aria-hidden="true"`); qui la tabella si **legge**, e 9px non si legge |
| **colori** | `th` su `--talos-accent-soft`, testo `--talos-accent-text` | **gli stessi token** | nessuna differenza |

### 5.3 PDF e DOCX — `app-pdf-*`, `app-docx-*`

**Il mockup non ha nessun PDF né DOCX** (`state.data.libreria`, riga 6008: `md · csv · slides · txt
· html`). Nessuna foto affiancata è possibile: la differenza è che qui c'è un **dato vero** che il
mockup non aveva.

* **Anteprima**: «Questo formato si apre con l'app del sistema: TALOS non lo disegna in questa
  finestra.» + **Apri con l'app del sistema** (rotta vera `POST …/apri`).
* **Testo**: «Il testo di questo formato non si estrae: TALOS sa creare PDF, DOCX e fogli di calcolo,
  non rileggerne le parole.»
  Le due frasi **non sono la stessa scusa due volte**: una parla di come si *guarda* il file, l'altra
  di estrarne le *parole*. Sono due assenze con due cause diverse (§4).

### 5.4 Ricerca — `app-ricerca-scusa-*` vs `mockup-ricerca-*`

Il mockup ha una sola vista di dettaglio per la ricerca (Piano · Rapporto · Fonti stampati uno sotto
l'altro, riga 6076) e **nessuno stato oltre `running`/`paused`/`done`**: il caso «file depositato che
non è un rapporto» non esiste nel mockup, e con esso le cinque viste su interruttore. Differenza di
**dato vero**, non di stile: gli stati oggi sono otto e il cancello di consegna esiste.

## 6. I due difetti della sezione Ricerca (foto del 4174, ricerca `d2a453a8`)

Stato `senza-rapporto` **con** `reportLibraryId` vero, perché il file in Libreria esiste davvero: è
la scusa da 290 byte. Sulla stessa schermata quattro voci, tre in disaccordo con la quarta.

| difetto | causa | cura |
|---|---|---|
| filtri «Col rapporto 1 · Senza rapporto 0» contro il timbro «Senza rapporto» | il filtro guardava `reportLibraryId` | `sezioni-adattatori.js:573-574` → `haRapportoLeggibile` |
| il piede della scheda diceva «Col rapporto» sotto un timbro «Senza rapporto» | stessa causa | `sezioni-adattatori.js:615` — a destra si scrive **solo** l'anomalia che il timbro non dice già («Nessun rapporto» su una conclusa senza file) |
| il pannello «Rapporto» stampava la scusa **come rapporto** | `vistaRapporto` apriva su `frasi.haRapporto` | `ricerca-dettaglio.js:564` → `haRapportoLeggibile`; il file depositato compare sotto `h3` «Ciò che è stato depositato» come **allegato** (`.td-allegato`), mai come prosa del rapporto |
| *(trovato per strada)* il **menu** offriva «Copia il rapporto» / «Esporta il rapporto» sullo stesso file | `vociMenuRicerca` non guardava lo stato | `ricerca-dettaglio.js:818-824` → «Copia il file depositato» / «Esporta il file depositato»; e l'avviso di esito, `sezioni-adattatori.js:515` |
| *(trovato per strada)* il dettaglio si **apriva** su «Rapporto» anche senza rapporto | `voce?.reportLibraryId ? 'rapporto' : 'andata'` | `ricerca-dettaglio.js:898` — si apre dove c'è da leggere |
| *(visto nella foto, corretto)* «la consegna l'ha respinto» stampato **due volte** nella stessa schermata | la mia riga ripeteva il `motivo` del server | `ricerca-dettaglio.js:583` — qui si dice solo **che cos'è** il file; il perché lo dice il motivo, una volta sola |

**La regola sta in una funzione sola**, `haRapportoLeggibile` (`ricerca-dettaglio.js:106`):
`stato === 'done' && Boolean(reportLibraryId)`. Quando le due domande sono in disaccordo **vince lo
stato**, e non è una preferenza: se il cancello di consegna avesse accettato quel file, la ricerca
sarebbe `done`.

## 7. Scostamento dal brief, dichiarato

**`role="tablist"` e non `role="radiogroup"`.** Sono due viste dello **stesso** pannello, che è il
caso del pattern Tabs delle APG del W3C ([w3.org/WAI/ARIA/apg/patterns/tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/), letto **11/09/2026**:
`tablist`/`tab`/`tabpanel`, `aria-selected`, `aria-controls`, `aria-labelledby`, un solo stop del Tab
sulla striscia, attivazione automatica con le frecce «as long as their associated tab panels are
displayed without noticeable latency»). Un `radiogroup` sceglie un **valore** dentro un modulo. E il
dettaglio della Ricerca — stessa colonna, stesso gesto, cinque viste — usa **già** `tablist`: due
grammatiche per lo stesso gesto sarebbero due cose da imparare invece di una. Roving tabindex e
attivazione automatica ci sono, come chiedeva il brief.

## 8. Le prove

* `npm run test:unit` → **787 test, 0 rossi** (`tests/unit/libreria-anteprima.test.mjs`, 11 nuovi;
  `tests/unit/ricerca-dettaglio.test.mjs`, 4 nuovi). **Ognuna anche al verso contrario**: un formato
  che si rende deve rendersi *e* uno che non si rende deve dirlo; una `senza-rapporto` mostra
  l'allegato *e* una `done` col record mostra il rapporto pieno e **nessun** «depositato».
* `tests/parity/nessun-errore-a-runtime.spec.mjs` → **3/3 verdi** su banco proprio
  (`TALOS_LAB_PORT=63806 TALOS_ASPETTO_PORT=63807`), tre viewport desktop. **Mai la 4174.**
* 56 foto, chiaro **e** scuro, 1440 **e** 1024, ognuna guardata. Difetti trovati guardandole e
  corretti in lotto: la carta del formato esterno che si stirava per 700 px (`max-width: 62ch`), la
  misura del CSV incoerente col bottone, la frase ripetuta nel dettaglio della Ricerca, la fixture
  che dava lo stesso testo al file depositato e all'ultimo messaggio.

## 9. L'aggancio in `legacy/app.js` — **NON applicato**

Un altro agente lavora su quel file adesso. È **una riga sola**, in
`caricaPannelloLibreria` (chiamata a `aggiornaPaginaLibreria`, **:5141-5157**):

```diff
           onCambiata: () => {
             caricaPannelloLibreria({ pagina: true });
             void aggiornaContatoriLuoghi(state.sessionSelection.available?.size ?? 0);
           },
           onMenu: apriMenuAzioniLibreria,
+          /* 11/09 — il contenuto del file nel dettaglio: la stessa iniezione che la Ricerca ha
+             già (:5343). Senza, il pannello cade sulla lettura strutturale minima e gli elenchi
+             e i blocchi di codice di un .md si leggono come paragrafi. */
+          rendiMarkdown: renderizzaMarkdownSemplice,
         });
```

`leggiFile` **non serve**: `sessionId` è già passato e l'adattatore cade da solo su
`lettoreFileLibreria(sessionId)`, cioè sulla rotta che esiste.

## 10. Cosa NON ho verificato

1. **Il Markdown col render della chat.** `renderizzaMarkdownSemplice` è una funzione locale di
   `app.js`, non esportata: nel laboratorio non c'è. Le foto `app-md-anteprima-*` mostrano il
   **ripiego** di `prosaInNodi` — titoli, citazioni e paragrafi sì, **elenchi e blocchi di codice
   no** (un elenco diventa un paragrafo unico, un fence si legge coi tre apici). È il difetto che la
   riga del §9 chiude, e finché quella riga non è applicata **la vista è peggiore di così**.
2. **La rotta vera dei byte.** `leggiFile` non è mai passato per `GET …/library/:voceId/file` in
   questa corsa: nessuna sessione vera, nessun 4174. Il lettore è coperto dai test e dalle fixture,
   non da un giro vero.
3. **La rotta `POST …/apri`** dal bottone «Apri con l'app del sistema»: nel laboratorio risponde
   404 e il pannello lo dice. Il giro vero su Windows non è stato fatto.
4. **La proposta di §4** (`/anteprima` per il PDF) non è stata scritta né provata: è una proposta.
5. **`.td-detail-body h2` a 24px contro i 28px del mockup** (e meta gap 7 vs 9, padding laterale 24
   vs 28): misurato, **non corretto**. Tocca tutte e sei le sezioni e le foto già approvate del
   lotto C — vuole un sì separato.
6. **Il riquadro «Azioni sul file» largo tutta la colonna** con il solo «Tutte le azioni ⋯» dentro e
   il resto vuoto (si vede in `app-docx-testo-chiaro-1024.png`): è `.td-riuso-riga`, del lotto E.
   Segnalato, non toccato.
7. **La tabella del CSV scorre in orizzontale senza dirlo**: a 415 px di dettaglio le ultime colonne
   escono. È raggiungibile da tastiera (`role="region"`, `tabIndex=0`) ma non c'è un segno visivo
   che ci sia dell'altro a destra. Debito.

---

## Cosa devi fare tu

* **Sì o no** alla riga del §9 in `legacy/app.js` (la fa chi ha quel file in mano, non io) — senza,
  gli elenchi e il codice di un `.md` non si rendono.
* **Sì o no** alla rotta `/anteprima` del §4, che è l'unica strada per vedere un PDF dentro TALOS.
* **Sì o no** all'allineamento di `.td-detail-body` al mockup (§10.5): tocca sei sezioni e vuole
  nuove foto di tutte.

## Cosa faccio io

Niente in attesa: il lotto è chiuso, provato e fotografato. Se arriva il sì sul §4 scrivo io la
rotta lato frontend appena il server ce l'ha.

## Cosa rimane

Il ripiego del Markdown fino all'aggancio (§10.1) · il giro vero sulla rotta dei byte e su «Apri»
(§10.2-3) · `.td-detail-body` fuori misura di 4 px in tre punti (§10.5) · il riquadro azioni del
lotto E (§10.6) · lo scorrimento muto della tabella CSV (§10.7).
