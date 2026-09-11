# Rapporto — lotto L7: la Ricerca approfondita adesso si CONSULTA (11/09/2026)

Agente Opus 5 (effort high), lane `lane/harness-desktop`, cartella `harness-ui/frontend/`.
Disegno di riferimento: `.claude/DISEGNO-RICERCA-APPROFONDITA-2026-09-11.md` §1.5, §2.5, §6.7, §7 (L7).
Impianto riusato: `.claude/RAPPORTO-PORTING-SEZIONI-2026-09-11.md` (elenco+dettaglio, lotto C).

⛔ **File toccati, e nessun altro.** `git status --short` lo conferma: le modifiche al kernel
(`src/kernel/talosHarness.mjs`, `src/research-*.mjs`, `src/session-registry.mjs`) sono dell'agente
che sta scrivendo il backend, non mie. Io ho toccato solo:

| file | stato | righe |
|---|---|---|
| `frontend/src/components/ricerca-dettaglio.js` | **nuovo** | 941 |
| `frontend/src/components/sezioni-adattatori.js` | solo l'adattatore Ricerca (`:443-578`) e le sue frasi | ~135 |
| `frontend/src/components/ricerca.js` | la tabella degli stati e il pulsante del rapporto | ~20 |
| `frontend/src/styles/mockup-td.css` | **solo in coda** (`:299-369`) | 70 |
| `frontend/lab/fixtures/ricerche.js` | **nuovo** | 344 |
| `frontend/lab/main.js` | le undici pagine del banco e la coda asincrona | ~50 |
| `frontend/tests/unit/ricerca-dettaglio.test.mjs` | **nuovo**, 20 prove | 457 |
| `frontend/tests/unit/ricerca.test.mjs` | una pretesa allineata alla data senza secondi | 3 |
| `frontend/tests/parity/componenti.spec.mjs` | **fuori dal perimetro del brief**, e spiegato al §3-bis | 20 |

⛔ **Non toccati da me**: `legacy/app.js`, `index.template.html`, `public/`. Gli agganci li ho
scritti come diff (§4) — e un'**altra sessione li ha applicati e ha committato tutto** mentre
lavoravo (`66bbe73d`): stesso checkout, e `git commit` fotografa l'indice condiviso. Li ho riletti
riga per riga: sono i miei, verbatim.

---

## 0. Ricerca web PRIMA di scrivere (fonte + data)

⛔ `WebSearch` era **esaurito** per questa sessione (200/200), come già per l'agente del disegno.
Tutto ciò che segue è preso con `WebFetch` diretto sulle fonti primarie, l'**11/09/2026**.

| fonte (letta 11/09/2026) | il numero o il fatto che porta | dove l'ho usato |
|---|---|---|
| W3C APG, **Tabs Pattern** — `w3.org/WAI/ARIA/apg/patterns/tabs/` | «Each element with role tab has the property aria-controls referring to its associated tabpanel»; «The active tab element has aria-selected true and all other tab elements have it set to false» | le cinque viste |
| W3C APG, **Tabs — esempio ad attivazione automatica** | tab non scelte con `tabindex="-1"` (**un solo stop del Tab**); Freccia dx/sx sposta **e attiva**, con ritorno circolare; Home/End agli estremi; il `tabpanel` prende `tabindex="0"` | `montaDettaglioRicerca` (`ricerca-dettaglio.js:826-880`) e la prova `L7-SCHEDE` |
| W3C APG, **Menu Button Pattern** | `aria-haspopup` su `menu` o `true`; Invio/Spazio aprono **e mettono il fuoco sulla prima voce** | il «⋯» del dettaglio e della scheda |
| **Gemini Deep Research** — `blog.google/products/gemini/google-gemini-deep-research/` (11/12/2024) | «it creates a multi-step research plan for you to either revise or approve»; il rapporto «you can export into a Google Doc… neatly organized with links to the original sources» | il **Piano** è una vista vera (oggi stato vuoto onesto), e «Esporta» esiste perché il rapporto è un artefatto che esce |
| **Claude Research** — `claude.com/blog/research` (15/04/2025) | «thorough answers, complete with **easy-to-check citations**»; citazioni in linea con Workspace | le affermazioni portano il **passaggio** e il link, non il solo indirizzo |

⛔ **Quello che NON ho potuto leggere, e quindi non dico:** OpenAI Deep Research
(`openai.com/index/introducing-deep-research/` → **403** a `WebFetch`) e Perplexity
(`perplexity.ai/hub/blog/...` → **403**; `docs.perplexity.ai` non documenta più la modalità).
Di quei due prodotti **non ho fatti di prima mano**: dove il disegno §4.2 scrive `n/d`, resta `n/d`.

⭐ Il fatto che ha cambiato una decisione: Gemini fa **approvare il piano prima che parta**. È la
ragione per cui «Piano» è una delle cinque viste anche se oggi è vuota — quando il motore arriverà,
quel pannello è il posto dove si approva, non una scheda in più da inventare allora.

---

## 1. Cosa esisteva, e cosa c'è adesso

### 1.1 Il guasto, in tre righe di codice

| dove | cosa diceva | perché era falso |
|---|---|---|
| `sezioni-adattatori.js:418` (prima) | «Il rapporto è stato scritto in `.harness-ui-research/`» | lì c'è **solo la scheda** della ricerca; il rapporto è una voce di Libreria (`research-orchestrator.mjs:132`) |
| `sezioni-adattatori.js:467-468` (prima) | «Da qui non si consultano ancora» + «Lo stato ‹Conclusa› non certifica le fonti» | era vero, ed era la descrizione di un buco, non di un prodotto |
| `ricerca.js:21` (prima) | `apri.hidden = true; apri.dataset.richiede = 'fase3'` | un pulsante spento **da diciotto giorni** |
| `index.template.html:1058` | «I rapporti vivono in `.harness-ui-research/`, dentro il progetto» | falsa: il file non è di questa lane, il diff è al §4.2 ed è stato **applicato** |

### 1.2 La cura, con file:riga

| cosa | dove |
|---|---|
| gli **otto stati** con parola, tono e **cosa fare** | `ricerca-dettaglio.js:60-87` (`STATI_RICERCA`, `statoRicercaApprofondita`, `conclusaDavvero`) |
| il **motivo del server** che vince sulla frase generica | `ricerca-dettaglio.js:143-175` (`frasiVoce`) |
| lettura del rapporto: prosa + record recintato, o **perché non c'è** | `ricerca-dettaglio.js:177-214` (`leggiDocumentoRapporto`, `PERCHE_SENZA_RECORD`) |
| il **bilancio** a cinque categorie e la sua barra | `ricerca-dettaglio.js:216-248`, `510-534` |
| i verdetti in parole (porto di `researchReport.ts:67-77`) | `ricerca-dettaglio.js:250-266` |
| **prove distinte** per dominio registrabile (porto di `researchIndependence.ts:45-80`) | `ricerca-dettaglio.js:268-325` |
| **BibTeX/RIS** (porto di `researchCitationExport.ts:80-118`) | `ricerca-dettaglio.js:327-406` |
| il **dettaglio a cinque viste** con le schede accessibili | `ricerca-dettaglio.js:783-908` |
| il **menu «⋯»** e il **tasto destro** per delega | `ricerca-dettaglio.js:754-781`, `912-931` |
| l'adattatore: filtri, scheda, dettaglio, lettura dalla rotta di Libreria | `sezioni-adattatori.js:443-578` |
| la frase falsa dell'intro, corretta finché il template non cambia | `sezioni-adattatori.js:496-506` |
| il pulsante «Apri il rapporto» che esiste solo se c'è un rapporto | `ricerca.js:29-36` |
| le classi nuove, **in coda** e senza colori nuovi | `styles/mockup-td.css:299-369` |

### 1.3 Le decisioni che si discostano dal disegno §6.7, e perché

1. **Il passaggio non ha una porzione «evidenziata» dentro.** Il disegno dava per scontato che qui
   arrivassero gli offset **e il testo intero della fonte**. Non è così: sul mobile il passaggio
   **nasce** come `source.text.slice(span.from, span.to)` (`researchVerification.ts:424`) ⇒ il
   passaggio **è già** la porzione citata, e non c'è niente da evidenziare dentro. Mostrarlo come
   citazione è la forma giusta; inventare un'evidenziazione avrebbe voluto dire ricercare la frase
   dentro sé stessa.
2. **«durata», non «4 min 12 s di lavoro».** Fra avvio e fine passa anche il tempo in cui la ricerca
   aspettava: il tempo *lavorato* è una misura che il server non manda. Si scrive quello che si sa.
3. **Il bilancio nella riga dell'elenco compare solo quando quel rapporto è già stato letto.** Il
   disegno lo vuole sempre; la rotta (contratto di stasera) manda l'elenco, **non i bilanci**, e
   leggere venti file all'apertura della sezione sarebbe venti richieste per una riga di testo.
   🔜 **Richiesta all'agente del backend**: se `GET /research` porta anche `bilancio`
   (sostenute/in parte/contese/non sostenute/non verificate) e `proveDistinte`, la scheda guida col
   bilancio **sempre**, come chiede §6.7, e questa nota sparisce. Il frontend è già pronto a usarli.
4. **Quattro filtri, non otto.** Un filtro per stato darebbe una riga di bottoni di cui quattro
   direbbero sempre zero. Le domande vere sono tre: cosa sta lavorando, cosa ha prodotto un
   rapporto, cosa no. ⛔ «Col rapporto» guarda il **rapporto**, non lo stato: è l'unica domanda che
   non può mentire, ed è la stessa distinzione che fa il cancello di consegna lato server.
5. **La vista «Rapporto» mostra la RISPOSTA, non il file intero.** Il file è domanda + risposta +
   riga del bilancio + affermazioni + fonti; la schermata mostra già la domanda nel titolo, il
   bilancio nella barra, affermazioni e fonti nelle loro viste. Stampare il file intero faceva
   leggere ogni cosa **due volte** e il titolo **tre** (visto nelle foto). Il file intero esce
   com'è da «Esporta».
6. **Niente `pausa`/`riprendi`/`ri-verifica`/`elimina`.** Non esistono rotte (disegno L5, decide
   l'owner): un pulsante lì sarebbe la promessa vuota che questo lotto sta togliendo.
7. **Il menu si inietta, non si riscrive.** Le voci le costruisce `vociMenuRicerca`; a disegnarlo è
   `apriMenuAzioniLibreria` di `legacy/app.js:13328`, lo stesso menu dell'albero dei file e della
   Libreria. Un secondo menu sarebbe una seconda cosa da tenere allineata alla prima.
8. **Una parola sola per uno stato solo.** `ricerca.js` aveva una **seconda** tabella di cinque
   stati: con gli otto di oggi la riga del foglio laterale avrebbe detto «Stato non registrato»
   proprio sui tre stati nati per dire la verità, **senza che un test diventasse rosso**. Adesso
   legge la stessa mappa (prova `L7-UNA-PAROLA-SOLA`).

---

## 2. Le foto: 28 immagini, tutte guardate una per una

`harness-ui/frontend/artifacts/l7/` — chiaro **e** scuro, 1440×900 e 1024×800, banco sulla
**porta 4188** (`TALOS_FRONTEND_LAB_PORT=4188 node scripts/serve-lab.mjs`; ⛔ mai la 4174).

`SezioneRicerca` (1440+1024) · `SezioneRicerca_vuota` · `SezioneRicerca_rapporto` (1440+1024) ·
`SezioneRicerca_senza` (1440+1024) · `SezioneRicerca_affermazioni` · `SezioneRicerca_fonti` ·
`SezioneRicerca_piano` · `SezioneRicerca_andata` · `SezioneRicerca_senza_record` ·
`SezioneRicerca_menu` · `SezioneRicerca_elenco` — ognuna in `-dark` e `-light`.

**Errori JavaScript a runtime durante le 28 pagine: nessuno** (console ed eccezioni raccolte dallo
script delle foto).

### I difetti trovati guardando, corretti in LOTTO e riverificati una volta

| # | trovato nella foto | cura |
|---|---|---|
| 1 | la scheda di una conclusa diceva «il rapporto… **lo leggi qui sotto**»: in una scheda «qui sotto» non è un posto | la frase di `done` è scritta per la scheda — «Aprila per leggere il rapporto e il bilancio» — perché nel dettaglio quello spazio lo prende il bilancio |
| 2 | il piede della scheda troncava: «Avviata il 11/09/20…», «Rapporto disponibi…» | a destra si scrive **solo quando aggiunge**: «Nessun rapporto» su una **conclusa** (l'anomalia) e «Col rapporto» su una non conclusa; negli altri due casi lo dice già il timbro |
| 3 | «avviata il 11/09/2026, **20:56:46**» | via i secondi (data e ora dichiarate campo per campo) |
| 4 | «Avviata **il** 11/09» | `articoloData`: «l'8», «l'11», «il 10» — vale anche per la riga del foglio laterale |
| 5 | il rapporto ripeteva il **titolo** già in cima al dettaglio | il primo titolo del file si salta quando è la domanda |
| 6 | il rapporto ripeteva **la riga del bilancio, le affermazioni e le fonti** già mostrate altrove | col record si mostra la sola risposta (§1.3.5) |
| 7 | i paragrafi tenevano gli **a capo a cento colonne** del file, spezzati a metà frase | le righe di un paragrafo si ricompongono con uno spazio, e `white-space: normal` su quei `<p>` |
| 8 | la spiegazione dello stato compariva **due volte** (sotto il titolo e dentro «Rapporto»/«Come è andata») | si scrive una volta sola: sotto il titolo quando non è conclusa, dentro le viste quando lassù non c'è |
| 9 | la striscia delle cinque viste si **stirava** da un bordo all'altro a 1024 px | `inline-flex` come il segmento del prodotto |
| 10 | in «Fonti» la frase «due pagine dello stesso dominio non fanno due prove» compariva **anche quando ogni fonte era di un dominio diverso** | la regola si spiega solo quando morde; altrimenti «ogni fonte viene da un dominio diverso» |
| 11 | su una ricerca **senza** rapporto si apriva «Rapporto»: tre righe che spiegano un'assenza, mentre «Come è andata» ha stato, motivo, tempi e ultimo messaggio | la vista d'apertura è il registro quando non c'è un rapporto; la scelta della persona vince e si ricorda |
| 12 | **trovato dal test, non dalla foto**: l'etichetta della data di fine era «Conclusa» — la **stessa parola** del timbro di stato, accanto a un orario, su una ricerca bloccata | l'etichetta è «Finita» |
| 13 | **trovato prima di consegnare**: senza `leggiRapporto` iniettato il pannello restava su «Leggo il rapporto…» **per sempre** — un'attesa che non finisce è una bugia come «Conclusa» | se nessuno sa aprirlo, si dice che il rapporto è in Libreria; e l'adattatore lo legge **da solo** appena riceve `sessionId` |

---

## 3. Le prove

- `npm run test:unit` → **763 verdi, 0 rossi** (erano 743 prima di questo lotto: +20 miei).
  Le mie stanno in `tests/unit/ricerca-dettaglio.test.mjs`, ognuna **anche nel verso contrario**.
- **La prova che porta il peso è `L7-SCUSA`**: i **290 byte verbatim** dell'11/09 («La sessione è in
  sola lettura, quindi non posso creare documenti…») entrano come `ultimoMessaggio`, e si pretende
  che (a) il timbro dica «Bloccata» e la parola «Conclusa» **non esista** nella schermata, (b) la
  vista che si apre sia «Come è andata», (c) la scusa si legga lì con la riga «non il suo rapporto»,
  (d) ⛔ **nel pannello «Rapporto» quella scusa non ci sia**.
- `L7-SCHEDE`: un solo stop del Tab, `aria-controls`/`aria-labelledby` incrociati, frecce che
  **aprono** e non solo spostano, ritorno circolare, Home/End, e un tasto qualunque che non fa niente.
- `L7-BILANCIO-A-SCHERMO`: col record la barra c'è e ha il suo `aria-label` (il bilancio non vive
  solo nel colore); **senza record nessun bilancio si stima**, e si dice perché.
- `L7-BIBTEX` / `L7-RIS`: chiavi distinte su tre fonti dello stesso dominio e anno, graffe tolte,
  nessun anno inventato, `ER  - ` con lo spazio finale.
- `L7-CITAZIONI`: dal file di bibliografia **non escono** la domanda né il giudice (privacy, è la
  decisione del mobile e qui si rispetta).
- **Cancello del runtime**: `tests/parity/nessun-errore-a-runtime.spec.mjs` rilanciato sulla app
  costruita → **3 passati** (1440×900, 1280×800, 1024×800), su un banco a parte
  (`TALOS_LAB_PORT=4189 TALOS_ASPETTO_PORT=4190`), **mai la 4174**.
- `npm run build` → 32 asset verificati.

---

## 3-bis. ⛔ Il cancello dei componenti era INERTE, e adesso non lo è

Rilanciando la parità su `ReportRow` ho trovato una cosa più grande del mio lotto.

**Il sintomo:** `ReportRow` cadeva sulle PAROLE (le due frasi corrette del §4.2 — vera divergenza,
attesa). Curata quella, cadeva di nuovo: `locator.screenshot: element is not visible`, sessanta
secondi di timeout.

**La misura, non la deduzione:** ho lanciato lo stesso cancello su `TaskRow`, che **non ho toccato**.
Stesso identico errore. ⇒ non era il mio componente.

**La causa:** `#talosAvvio`, il velo d'avvio, arriva col template ma la regola che lo rende
`position:fixed` vive nell'inline `<style>` di `index.template.html`, che `lab/index.html` non ha.
Fuori dal `fixed` è un blocco alto **8.697 px** dentro un body flex da 900: la shell riceve 0 px e
ogni schermata del laboratorio è **invisibile**. `lab/main.js` lo toglieva **solo dentro
`mostraSchermo`** — e le pagine dei componenti (`ReportRow`, `TaskRow`, …) da lì non passano.
Il debito era **già dichiarato** dal rapporto dei lotti C/E/F/G («il cancello di parità apre le
stesse pagine: va guardato prima di fidarsi del suo verde»): qui si chiude.

**La cura:** una riga in `lab/main.js:105-118`, il velo tolto **una volta all'ingresso**. Nessun
laboratorio lo disegna di proposito.

**Cosa dice il cancello adesso che è vivo** (`--project=desktop-1440x900`, banco su 4189/4190):

```
26 passati · 11 falliti   (prima: 0 passati sul confronto a pixel, tutti in timeout)
✅ ReportRow — il mio, con la divergenza dichiarata
✅ TaskRow · MemoryRow · Board · Topbar · Terminale · Review · Toast · Inspector (×2) ·
   SettingRow · SettingsNav · CheckCard · ExtensionList (×4) · CatalogoModelli · CatalogoHf ·
   ModelliInstallati · CodaDownload · RuntimeCard · MemoryMeter · FonteRicerca · AutomationRow · ForgeList
❌ ProviderCard · ToolList · LibraryRow · SessionItem · NavItem · WorkspaceFooter ·
   Conversazione · Browser · NotificationPanel · ChatFooter · EmptyState
```

⛔ **Gli undici rossi NON sono miei e non li ho indagati**: sono le superfici dei lotti A/B/D (barra a
gruppi, sessioni, chat) e della Libreria, cioè proprio quelle che il porting del mockup ha cambiato
**di proposito**. Per ognuna la domanda è la stessa del §4.2: la divergenza è voluta (e allora si
dichiara, come ho fatto per `ReportRow`) o è una regressione? **Decide chi possiede quelle
superfici** — io ho riacceso la luce, non ho riordinato la stanza.

⛔ E una lezione che vale più del lotto: **un cancello che fallisce sempre allo stesso modo non è un
cancello rosso, è un cancello spento**. Nessuno se n'era accorto perché nessuno l'aveva rilanciato
dopo il velo.

---

## 4. L'aggancio — **già applicato**, e resta qui come registro

⛔ **Mentre lavoravo, un'altra sessione ha committato questo lotto** (`66bbe73d`, 23:09) —
stesso checkout, e `git commit` fotografa l'indice condiviso (lezione «DUE SESSIONI, STESSA
CARTELLA»). In quel commit sono entrati **anche i due agganci qui sotto**: li ho riletti riga per
riga e sono quelli che avevo scritto, verbatim. Restano scritti qui perché un aggancio senza il
suo motivo è una riga che il primo che legge toglie.

### 4.1 `frontend/src/legacy/app.js` — ✅ dentro (`app.js:5330-5343`)

L'`import` del lotto C è **già dentro** (`app.js:21-25`): `aggiornaPaginaRicerca` viene già dal mio
adattatore. Manca solo dirgli **cosa sa fare la app**.

```diff
@@ src/legacy/app.js:5330 (dentro caricaPannelloRicerca → mostra)
-        aggiornaPaginaRicerca(mount, ricerche, { errore, caricamento, onAggiorna: () => caricaPannelloRicerca({ pagina: true }) });
+        aggiornaPaginaRicerca(mount, ricerche, {
+          errore, caricamento,
+          onAggiorna: () => caricaPannelloRicerca({ pagina: true }),
+          /* 11/09 L7 — con `sessionId` il rapporto si legge dalla rotta che esiste già,
+             `GET /library/:voceId/file`: nessuna rotta nuova. */
+          sessionId,
+          notifica: toast,
+          copia: (testo) => copyText(testo, 'Rapporto copiato'),
+          onMenu: apriMenuAzioniLibreria,                       // lo stesso menu dell'albero e della Libreria
+          onApriSessione: ({ id }) => passaASessione(id),        // «Apri la conversazione»
+          rendiMarkdown: renderizzaMarkdownSemplice,             // il render della chat, non un secondo motore
+        });
```

⛔ Le quattro funzioni esistono già e sono nello stesso scope: `apriMenuAzioniLibreria` (`:13328`),
`passaASessione` (`:15770`), `renderizzaMarkdownSemplice` (`:2267`), `copyText` (`:6481`).
⛔ Senza questa riga **niente si rompe**: il dettaglio dice che il rapporto è in Libreria, il menu
non si apre e nessun bottone mente. È degradazione dichiarata, non un guasto silenzioso.

Facoltativo, per la riga del foglio laterale (il pulsante «Apri il rapporto» che non è più `hidden`):

```diff
@@ src/legacy/app.js:5351
-  function rigaRicerca(ricerca) {
-    return creaReportRow(ricerca);
-  }
+  function rigaRicerca(ricerca) {
+    // 11/09 L7: il pulsante compare solo se c'è un rapporto E se sappiamo dove portare chi lo preme.
+    return creaReportRow(ricerca, { onApriRapporto: () => { setView('ricerca'); caricaPannelloRicerca({ pagina: true }); } });
+  }
```

### 4.2 `frontend/index.template.html` (e la copia in `public/`) — ✅ dentro (`:1058`, `:1071`)

⛔ **Non era la mia lane**, e adesso è applicato. La toppa nell'adattatore
(`sezioni-adattatori.js:496-506`) **resta** ed è inerte: corregge la frase solo se la ritrova.
Toglierla è una riga — ma il mockup statico la porta ancora (§3-bis), quindi per ora fa da rete.

```diff
@@ index.template.html:1058
-        <div class="talos-page__head"><span class="talos-eyebrow">Ricerca</span><h2>Ricerche del progetto</h2><p>Cerca per titolo o stato e consulta la data di avvio. Lo stato «Conclusa» non certifica le fonti del rapporto. I rapporti vivono in <code>.harness-ui-research/</code>, dentro il progetto.</p><p data-research-esito role="status">5 ricerche elencate</p></div>
+        <div class="talos-page__head"><span class="talos-eyebrow">Ricerca</span><h2>Ricerche del progetto</h2><p>Ogni ricerca approfondita di questo progetto, col suo rapporto, le affermazioni verificate e le fonti da cui vengono.</p><p data-research-esito role="status">5 ricerche elencate</p></div>
@@ index.template.html:1071
-        <div class="talos-where">Fino a 20 ricerche recenti di questo progetto. La consultazione del rapporto e delle fonti non è ancora disponibile qui.</div>
+        <div class="talos-where">Fino a 20 ricerche recenti di questo progetto.</div>
```

(La seconda riga sparisce comunque: `montaSezione` sostituisce l'intera `.talos-page`. Si toglie
perché una frase falsa nel sorgente torna a galla al primo che ricostruisce la pagina.)

---

## 5. Cosa NON ho verificato

1. **Col server vero, mai.** Tutte le foto vengono dal laboratorio con fixture nella forma **esatta**
   del contratto di stasera. La sezione non l'ho vista sul 4174 con una ricerca vera: il brief lo
   vieta, e il backend lo sta scrivendo un altro agente **adesso**. Va rifatto un giro vero appena
   la rotta manda i campi nuovi — in **chiaro e scuro**, con una ricerca `done` e una
   `bloccata-dal-permesso`.
2. **Il menu vero non è provato.** Nel laboratorio lo disegna una copia fedele del markup
   (`.ft-actions-menu`, stesse classi, stesso CSS) in `lab/fixtures/ricerche.js`: la foto mostra i
   colori e la forma veri, **non** la regia di `apriMenuAzioniLibreria` (clic fuori, Esc, ritorno
   del fuoco), che gira solo dentro il monolite.
3. **Il tasto destro non è in nessuna foto.** È provato come codice (delega sulla sezione,
   `preventDefault` solo quando c'è una scheda sotto il puntatore); non l'ho scattato con un
   puntatore vero — Playwright lo può fare, e va fatto nel giro sul 4174.
4. **La copia negli appunti e i due scarichi** (Markdown, BibTeX, RIS) sono provati **come funzioni**
   (contenuto dei due formati, nomi dei file, quali voci del menu esistono), non premendo i bottoni
   in una pagina: `URL.createObjectURL` e `navigator.clipboard` non esistono nel laboratorio Node.
5. **Tastiera e lettore di schermo**: le schede sono provate nei loro attributi e nei tasti
   (`L7-SCHEDE`), non con un giro NVDA.
6. **`rendiMarkdown` della chat non l'ho mai eseguito**: nel laboratorio `legacy/app.js` non gira, e
   la prosa passa dal ripiego strutturale di `prosaInNodi`. Da guardare al primo giro vero, perché
   il rapporto vero ha titoli, citazioni ed elenchi.
7. **Un solo tema.** Le foto sono su **Calm**, chiaro e scuro. I toni del bilancio vengono dai token
   semantici (`--talos-success/warning/info/danger`), quindi seguono ogni tema per costruzione — ma
   sugli altri tredici non l'ho visto.

---

## Riepilogo veloce

**Cosa devi fare tu**
1. Decidere chi guarda gli **undici componenti rossi** del §3-bis: il cancello di parità era spento
   da quando è nato il velo d'avvio, e adesso dice la verità su tutta la app, non solo sul mio pezzo.
2. Dire se la mia **divergenza dichiarata** in `componenti.spec.mjs` (correggo le due frasi false
   anche nella copia del mockup) ti va bene, o se preferisci che il mockup resti intoccato e
   `ReportRow` esca dal cancello.
3. Guardare le 28 foto in `harness-ui/frontend/artifacts/l7/` e bocciare quello che non ti torna.

**Cosa faccio io**
Appena la rotta manda i campi nuovi, rifaccio il giro vero sul 4174 — chiaro e scuro, una ricerca
conclusa e una bloccata, foto **durante** e non solo alla fine.

**Cosa rimane**
Gli **undici componenti rossi** del §3-bis, che non sono miei e ora si vedono; il giro col server
vero (punto 1 di §5); il menu con la regia del monolite; il tasto destro
fotografato; copia ed esportazioni premute davvero; un giro di tastiera/lettore di schermo; il
`bilancio` nella rotta, che farebbe guidare **ogni** riga dell'elenco col bilancio invece che con la
frase dello stato.
