# RIPRESA — LA PARITÀ COL MOCKUP · scritto il 18/09/2026

> **Documento di ripresa autosufficiente.** Se la sessione che l'ha scritto si interrompe, chi
> arriva dopo deve poter riprendere **da qui**, senza leggere trascritti (che sono centinaia di MB)
> e senza rifare misure già fatte.
> ⛔ **Si aggiorna a ogni passo chiuso**, e ogni aggiornamento porta la data.

---

## ⛔⛔ PRIMA COSA: L'OWNER NON È CONVINTO, ED È SCETTICO

**Va letto come il presupposto di tutto il resto, non come una nota di colore.** Owner, 18/09/2026,
testuale: «*L'owner non si fida di te, dai per scontato che tutte le modifiche che fai non sono
deployabili, ogni tua modifica ha bisogno di code review avversariali per essere resa utilizzabile*».
E nello stesso giorno, dopo aver guardato le foto: «*vedo già tantissime incongruenze, la app 4174
ha tante cose che non vanno rispetto al mockup*» · «*Hai fatto un pessimo lavoro e te ne devi
vergognare*» · «*smettila di usare risoluzione, tema o altre variabili come scuse*».

⇒ **Conseguenze operative, obbligatorie:**
1. **Nessuna modifica si dichiara usabile** senza una **review avversaria** fatta su quella
   modifica. Non basta la mia verifica: unit, suite e foto verdi **non** la rendono usabile.
2. **Le mie stesse conclusioni vanno rimisurate.** In questa sessione ho trovato e corretto **tre
   difetti nel mio metodo** (elencati più sotto), tutti trovati **guardando le foto**, non
   rileggendo il codice.
3. **Zero scuse**: mai attribuire un difetto a viewport, tema o ambiente prima di aver fatto la
   prova che dovrebbe smentire quell'attribuzione.

## ⛔⛔ SECONDA COSA: LA VERIFICA OBBLIGATORIA PRIMA DI DIRE «FUNZIONA»

Owner, 18/09/2026: «*ultima regola durante il processo di verifica è OBBLIGATORIO verificare
VISIVAMENTE usando screenshot dell'ambiente 4174 e verificare automaticamente e autonomamente
errori visivi, glitch, disallineamenti*».

⇒ **Chi riprende deve, prima di dichiarare qualunque cosa funzionante:**

1. **Ispezione visiva** dell'app sul **server locale `http://127.0.0.1:4174`** (sola lettura: si
   legge e si fotografa, **ogni richiesta non-GET va fermata**), e **confronto con l'app
   dell'ultima release**.
2. **Che non ci siano funzioni perse.** Il riferimento è la release pubblica:
   **`refs/pr/public-main` = `13f65c15cdeaf8986b882993a0773cdeafb867d2`** (16/09/2026), identico al
   tag **`desktop-v0.1.13` (`a898162f`)**. Regola dell'owner: «**NON DOBBIAMO NASCONDERE O PERDERE
   NESSUNA FUNZIONE ATTUALE DELLA APP**».
3. **Che non ci sia niente di rotto** — a prescindere dal fatto che il lavoro riprenda o no.
4. Le **coppie di foto** in `C:\Users\Antonino\Downloads\confronto-fase1\` (vedi la ricetta sotto).

⛔ **Le due perdite già note** verso la release pubblica, misurate il 18/09/2026:
- l'**Intro / «Primo avvio»**: rimossa **di proposito** il 17/09 (PO-27) — ✅ owner: «quella va
  mantenuta cancellata»;
- **`shareSession()`** con `navigator.share`: **caduta senza che nessuno lo decidesse**. ✅ owner:
  «solo se esporta in file fisici» — e **esporta già** file fisici (`.md`/`.json`), quindi resta il
  comportamento e va corretta solo la **parola** (il comando si chiama «Prepara una copia da
  condividere», `services/commands/registry.ts:53`).

---

## LA DIREZIONE (owner, 18/09/2026)

Riprodurre **Impostazioni** e **Laboratorio modelli** dal mockup **vista per vista**, collegando
ogni pezzo ai dati veri dell'app, e **nascondendo** ciò che non si può collegare.
Le **quattro schede** del laboratorio sono, coi nomi dell'owner:
**Hugging Face** (i modelli locali) · **Provider** (le chiavi API, «*esattamente con lo stesso
stile, layout, card, il bottone "Configura" che apre le modali*») · **Download** · **Sistema**
(con la **Panoramica** dentro, senza perdere un id).

## ⛔ IL MOCKUP È LA LEGGE, MA NON È PIENO DAPPERTUTTO

`C:\Users\Antonino\Downloads\TALOS-Calm-Lab-04.html` (md5 `952fd467eff2cdd331f968c419fa1cc0`) è
**autonomo**: si apre con `file://`, senza server.
⛔ **Delle sue 10 voci di sidebar, 7 sono ATTENUATE** (`disabled`, `opacity .58`, nessuna rotta le
mostra) e il mockup stesso scrive «*Le voci attenuate sono fuori da questo primo lotto*».
⇒ **Solo `appearance` e `models` sono PIENE.** Per le altre sette non c'è **nessun disegno da
copiare**: si porta il suo **stile** sul **contenuto vero** dell'app.

---

## I DOCUMENTI (percorsi, tutti nel repo)

| percorso | cos'è |
|---|---|
| `.claude/PIANO-PARITA-MOCKUP-2026-09-18.md` | **le tre mappe misurate** (§6.1 mockup · §6.2 app · §6.3 release pubblica) + §7 il delta di ciò che non si collega + §8 le decisioni |
| `.claude/INVENTARIO-INCONGRUENZE-2026-09-18.md` | **l'inventario delle incongruenze**, con la gravità, visto foto per foto |
| `C:\Users\Antonino\.claude\plans\fizzy-pondering-diffie.md` | **il piano attuabile** approvato (fasi, proprietà dei file, verifica) |
| `harness-ui/frontend/tests/browser/_confronto-fase1.spec.mjs` | **lo strumento delle foto**, con le sue quattro guardie |
| `C:\Users\Antonino\Downloads\confronto-fase1\` | **le foto**: 32 file, coppie `<vista>_<risoluzione>_mockup.png` / `_real.png` + `LEGGIMI.txt` |
| `.claude/RIPRESA-SESSIONE.md` | la ripresa della sessione **precedente** (le cinque corsie del mattino): storia, non si cancella |

**I brief delle corsie di oggi** sono stati scritti nei `prompt` degli agenti, non su file; le loro
regole ripetono quelle di questo documento.

## LE FOTO: LA RICETTA (owner, 18/09/2026 — tre sue parole in ordine)

1. «*non ce bisogno affiancarle basta che fai **foto singole** e poi le **nomini a coppia***»;
2. «*salta la regola dei due temi, non ha senso **usa solo tema scuro***»;
3. «*fai le foto **dalla prossima volta il 1440p e 1080p***» ⇒ **2560×1440** e **1920×1080**.

⛔ Solo dove il mockup ha contenuto: `aspetto`, i 4 tab del laboratorio, i 3 lati della pagina
modello. **Mai** le sette sezioni attenuate.
⛔ **Le tre trappole, tutte costate un giro di foto false in un giorno:**
1. **`data-mode` è il meccanismo del MOCKUP, non dell'app**: sull'app il tema si dichiara in
   `localStorage` (`appearance.colorMode`) **e nell'`addInitScript`**, mai dopo il caricamento —
   l'init script riscrive `localStorage` a ogni navigazione e cancella la preferenza;
2. **il mockup RICORDA il tema**: cliccare il suo tasto alla cieca lo porta nel tema **opposto**;
3. **due lati in temi diversi** = confronto falso in ogni riga, e si vede dai **BYTE** prima che
   dall'immagine (due file da 164.182 byte erano la stessa foto).

---

## I COMMIT DI OGGI (lane `lane/harness-desktop`)

| commit | cosa |
|---|---|
| `247e79f8` | FASE 1 — il breadcrumb, il **punto della voce attiva**, e le cinque misure della voce |
| `b4ef580f` | FASE 1b — il **cercatore del mockup in sidebar**, con Ctrl K **con un ambito** |
| `eb765a9e` | lo **strumento delle foto**: due risoluzioni, tema scuro, quattro guardie |
| `6da75b08` | la cura del **`[object Object]`** nella scheda Compatibilità |
| `c42d909f` | il **README di Hugging Face reso in HTML** — a nodi, mai come stringa |
| `3c4d90e4` | la soglia di tocco delle impostazioni scende a **24** — che è **WCAG 2.5.8**, non un numero scelto per passare |
| `a89b9c88` | la **colonna dell'anteprima** e il vestito delle sezioni, più quattro decisioni applicate |
| `485947fd` | la **struttura del mockup in Aspetto**: i cinque gruppi, la banda, la pastiglia, la colonna dell'anteprima |
| `df148e19` | il **documento di ripresa** (questo file), con le tre PR e i difetti della review |
| `4b4c753b` | la **barra di ricerca scende in sidebar** (§ «LA BARRA DI RICERCA» qui sotto) |
| `51986627` | il **documento di ripresa** aggiornato con la barra, i due difetti e l'A/B |
| `719565f2` | **una sola × di cancellazione**: si spegne quella del browser, che non ha nome |
| `bb148037` | la **× entra nel campo** — la colonna non salta più di 48 px cercando (D1 della review) |
| `be736bc9` | **Laboratorio**: il selettore dell'ordine non si mangia più la riga delle faccette |
| `1f22bb32` | le carte del runtime **parlano, non stampano codici** (`RUNTIME_UNREACHABLE` → frase) |
| `a59aa16a` | la scheda del modello: «Sconosciuto · Sconosciuto» diventa **una parola sola** |
| `47ee6c69` | la tab **Download** tiene **un titolo, non tre** |

⛔ **Tutti marcati «NON DEPLOYABILE — in attesa di review avversaria».**
⛔ Il push **non è stato chiesto**: si chiede a blocchi, col sì dell'owner.

## ⛔ LA BARRA DI RICERCA — spostata in sidebar il 18/09/2026 (commit `4b4c753b`)

Owner, due volte: «*attento alla barra di ricerca io la vedo ancora full width e no sopra sidebar*»
e poi «*sposta la barra*». Il campo era un blocco di PAGINA (`page.insertBefore(toolbar, layout)`)
largo quanto il contenuto; ora è dentro la colonna da 220 px, sotto il bottone del mockup e sopra
l'elenco delle sezioni. **Lo stesso nodo**, non una copia: filtro in pagina, «Cancella ricerca»,
Ctrl K e palette restano quelli che erano. Misure dal DOM vivo: campo **203×38**, colonna **220**,
intelaiatura **2204** → la barra è il **9%** della larghezza.

La direzione della ricerca (citata nel commit, col giorno):
- **MDN «ARIA: search role»**, letta il 18/09/2026 — `<input type="search">` **non** è una
  landmark: la ricerca va dentro una regione sua. ⇒ il contenitore è un **`<search>`**.
  ⛔ **Non** `<form role="search">`: un form con un solo campo e nessun gestore di submit fa
  **ricaricare la pagina** al primo Invio.
- **Apple, WWDC26 sessione 292 «Design intuitive search experiences»**, letta il 18/09/2026 — la
  ricerca sta in sidebar quando filtra contenuto che vive lì, e cita le app di impostazioni.

⛔ **DUE DIFETTI TROVATI GUARDANDO LA FOTO DEL 4174, non leggendo il CSS** (la regola: la foto si
ispeziona tutta):
1. la riga del bottone del mockup andava **a capo** («Cerca / impostazioni») ed era alta **22 px**,
   cioè **sotto la soglia di tocco 24×24 di WCAG 2.5.8** che il cancello `baseline-shell` misura.
   Ora ha le misure che il mockup dà a **quella** riga (min-height 42, padding 10px 11px, gap 8,
   label 12 px, kbd padding 2px 4px). ⛔ Il selettore ha bisogno dell'`#id` **e** di
   `.talos-nav-item`: la prima stesura è arrivata **INERTE** e la foto mostrava ancora il capo.
2. il **segnaposto era tagliato a metà parola**: 252 px di testo in **181 utili**. Misurato nella
   font vera del campo e sostituito con uno che ci sta in entrambe le lingue (136 px / 113 px).

⛔ **LA PROVA CHE MORDE**: `INTELAIATURA-06` asserisce che il campo sta **dentro** la colonna e che
è più stretto di metà intelaiatura. Provata **nei due versi**: rimettendo il campo nella pagina, la
prova va **rossa** con «il campo di ricerca deve stare nella colonna delle sezioni».
⛔ Una nota sul metodo, perché è costata un giro: la prima prova a rovescio lasciava **entrambe**
le inserzioni, e vince l'ultima — quindi il test restava verde e sembrava che la prova non
mordesse. **Si toglie la riga vera, non se ne aggiunge una seconda.**

⛔ **UN TERZO DIFETTO, VISTO E CURATO** (a larghezza stretta): il campo è `type="search"` e Chromium
gli mette dentro la sua **×** di cancellazione — che compare **esattamente quando** compare il
nostro bottone «Cancella ricerca». Due comandi per la stessa azione, uno dei due senza nome.
Cura in `719565f2`: si spegne quello del **browser** (`::-webkit-search-cancel-button`), non il
nostro, che ha un nome e sta nel tab order.

## ⛔⛔ LA REVIEW AVVERSARIA DELLA BARRA — referto del 18/09/2026 sera

Un revisore avversario (Opus, effort high) su `4b4c753b`, con l'obbligo di **rompere** il codice e
di **chiedersi se il difetto esisteva prima**. Ha consegnato due difetti e nove ipotesi che NON
hanno prodotto un rosso.

**D1 — [MEDIA] la colonna saltava di 48 px a ogni ricerca. MIO, curato in `bb148037`.**
Nei 203 px della colonna il bottone «Cancella ricerca» (141×40) non stava sulla stessa riga del
campo: andava **a capo**, la barra passava da 38 a **86 px** e tutto quello che sta sotto — l'elenco
delle sezioni e «COMPORTAMENTO» compresi — **scendeva di 48 px**, dentro una colonna `sticky`.
⛔ A/B **nello stesso build**: con lo stesso nodo rimesso nella pagina il salto è di **3 px** ⇒ era
la colonna a causarlo, non il nodo. ⛔ E la mia nota in `settings.css` («il bottone compare solo
mentre si cerca, quindi a capo ci va **di rado**») era **falsa**: misurato, ci va **ogni volta**
(203 + 8 + 141 = 352 > 203).
⇒ Cura: la × sta **dentro** il campo (posizione assoluta, posto riservato dal `padding-inline-end`),
la riga è una sola e alta uguale. Verificato sul 4174: distanza barra↔prima voce **40 px prima e
40 px durante**, cioè **salto 0**.

**D2 — [BASSA, qualità della prova] l'asserzione (b) di `INTELAIATURA-06` era falsa sul layout
stretto. MIA, curata in `bb148037`.**
Sotto i 660 px di contenitore il prodotto rende la colonna un blocco a tutta larghezza, quindi
`campo == colonna == intelaiatura` e «meno di metà intelaiatura» diventa **rosso su codice
corretto** (misurato: `{528, 528, 528}` contro `< 264`). Era verde **solo perché la viewport
predefinita di Playwright è 1280**. Ora l'asserzione vale solo dove la colonna è davvero una
sidebar; `campo <= colonna` resta incondizionata, e vale nei due layout.

**D3 — [BASSA, NON attribuibile a questo commit]** fra 660 e 950 px di contenitore la colonna è
185 px e l'etichetta «Cerca impostazioni» si tronca (105 richiesti, 77 disponibili). A/B dichiarato
dal revisore: **prima** andava a capo su 2 righe, la seconda **anch'essa troncata**; adesso sta su
1 riga troncata. Il commit ha cambiato il sintomo, non creato il difetto. ⛔ E la mia frase «ne
servono ~194 e ci sta intera» è **vera nei 220 px della colonna e falsa nei 185** che l'app stessa
usa: era una misura presa a **una sola larghezza**.

**LE NOVE IPOTESI CHE NON HANNO PRODOTTO UN ROSSO** (provare e non trovare è il valore del referto):
1. **nessun doppione al rimontaggio** — dalla porta vera (Ripristina i valori iniziali), dopo 1 e 3
   rimontaggi: 1 barra, 1 `<search>`, 1 campo, ancora dentro la colonna, e il campo resta **vivo**;
2. **`<search>` è una landmark vera** nell'albero di accessibilità (via CDP): `role=search`, nome,
   `ignored=false`, una sola, senza `role` ridondante; annidata in `<nav>` è legittima;
3. **le regole nuove vincono davvero** (computed style, non testo del CSS);
4. **`INTELAIATURA-06` morde per la ragione giusta** (ricopiata su una pagina col campo rimesso);
5. **soglia di tocco**: i due cancelli dell'area di tocco **non** sono fra i rossi; il mio «22 su 65»
   è **verificato esatto**;
6. **larghezza stretta**: il campo vive e si usa a **11 larghezze**, da 1920 a 390;
7. **segnaposto**: entra in entrambe le lingue alle larghezze vere (136 px su 179 e 144 disponibili);
8. **ordine di tabulazione**: bottone → campo → le 10 tab, e il campo **non** sta dentro il `tablist`;
9. **Ctrl K** col fuoco nel campo: la palette delle **impostazioni** non si apre (la guardia regge).

⛔ **Cosa il revisore NON ha potuto verificare** (dichiarato, ed è la parte onesta del referto):
la metà «23 su 65» del mio A/B (l'ha misurata solo io), un lettore di schermo **reale** (ha guardato
l'albero AX via CDP), la × nativa di `type="search"` (non cliccabile in modo affidabile), il
confronto col mockup a 185 px, la modalità `data-sidebar="icone"` e l'avvio a freddo.

⭐⭐ **E una osservazione, non un difetto**: nella colonna ci sono ora **due porte di ricerca una
sotto l'altra** — il cercatore del mockup (che apre la modale) e, pochi px sotto, il campo che
filtra in pagina. **Il mockup ne ha una.** È la direzione che l'owner ha chiesto, quindi non si
cambia da soli: è una sua decisione (tenere due porte o fonderle in una).

## ⛔⛔ L'ISPEZIONE VISIVA DELLE OTTO VISTE (18/09/2026, sera) — tre difetti trovati guardando

Il proprietario della prova non è il codice: è la **foto**. Guardate tutte e otto le viste del
confronto alle due risoluzioni (aspetto, i quattro tab del laboratorio, i tre lati della pagina del
modello), confrontate coi rispettivi lati del mockup. Tre difetti, tutti **veri**, tutti curati:

1. **`RUNTIME_UNREACHABLE` a schermo** — nelle carte di Ollama e LM Studio (`lab-sistema`). È un
   **codice di contratto** del server arrivato fino alla persona. Cura `1f22bb32`: la mappa
   codice→frase sta in `runtime-modelli.js` (un posto solo), le frasi sono **quelle del server**
   (`public-problem.mjs`), e il grezzo resta nel `title`. ⛔ Un **codice nudo** si traduce, un
   **messaggio** no: `failureReason` porta anche guasti veri («connect ECONNREFUSED»), e sostituirli
   con una frase generica sarebbe **perdere** l'informazione. Fonte: euristica 9 di Nielsen
   («nessun codice d'errore») + la regola 2026 «tieni i codici nei log, non nella interfaccia»
   (Security Boulevard, luglio 2026), lette il 18/09/2026.
2. **«Sconosciuto · Sconosciuto»** nella scheda Compatibilità: `backend` e `build` sono due fatti e,
   col runtime irraggiungibile, sono ignoti **tutti e due**. Cura `a59aa16a`: si tiene la prima
   occorrenza di ogni testo, in ordine — due valori diversi restano due, due uguali diventano uno.
3. **Tre nomi per la stessa cosa nella tab Download**: la linguetta, il motto del mockup («Ogni
   download, al suo posto.») e un `talos-page__head` che ripeteva «Download» + «Una coda per tutti i
   modelli…». ⛔ Il **mockup ha solo il motto** (misurato su `lab-download_1440p_mockup.png`), e
   l'owner aveva già detto: «*ogni sezione ha due titoli e sottotitoli, devi lev… tutti i titoli e
   sottotitoli introduttivi dentro la sezione*». Cura `47ee6c69`.

⛔ **E un difetto che NON c'era**: nella foto della scheda del modello il link «and efficiency.»
   sembrava inventato dal nostro rendering. Alla fonte (README grezzo di Hugging Face, revisione
   `0d32489ecb9d`) quella frase è **prosa senza link**, e il **DOM vivo** lo conferma: nessun `<a>`,
   testo identico alla fonte. ⇒ Era un mio sospetto sbagliato guardando un'immagine a bassa
   risoluzione. **Non si riporta come difetto.**

⛔ **Delta di parità dichiarati, non curati** (sono di fase): la **banda** del mockup («MODELLO PER
LE NUOVE CHAT» · budget RAM · «Nessun passaggio automatico al cloud») è la FASE 3; il bottone
**«Configura»** dei fornitori è la FASE 4; la tab del mockup si chiama «Modelli» e la nostra
«Hugging Face» — **decisione dell'owner**, non una divergenza.

## ⛔ L'ALTRO DIFETTO VERO, nel Laboratorio — curato in `be736bc9`

Misurato sul 4174 con una sonda di sola lettura: la riga delle faccette è **1912 px**, il campo di
ricerca del catalogo sta **appeso al suo minimo di 220** e il suo segnaposto **non ci sta per 1 px**
(171 di testo in 170 utili — è il «Cerca un repository GGU» tagliato che si vede in foto), mentre il
selettore dell'ordine si prende **1288 px**, due terzi della riga.
⛔ **La causa è un selettore mancante, non una scelta**: `.talos-toolbar--hf .talos-select{flex:0 0
150px}` colpisce il select **nativo** (che in pagina è largo 0), e chi si vede è il componente
`calm-control--select`, che non compariva in **nessuna** regola di quella riga. L'intenzione era
scritta; mancava il selettore. Dopo la cura: campo **1358 px** col segnaposto intero, ordine a 150.
⛔ **Resta aperto e NON è mio**: il cancello `baseline-shell` «Model Lab filters have explicit names
and hit areas» pretende un campo nome `Cerca nel catalogo` e non lo trova (0). È **preesistente**
(rosso anche prima di questa modifica) ed è una divergenza di **nome accessibile**, da decidere con
la corsia del laboratorio.

⛔ **I ROSSI CHE NON SONO MIEI — misurati con A/B sulla base committata, nello stesso momento:**
`baseline-shell` fa **23 rossi su 65** sul codice committato e **22 su 65** con questa modifica;
`PARITA-08` e la prova della colonna dell'anteprima falliscono **identiche sui due lati**. Sono di
**chat** (composer, loader, streaming) e della **colonna destra**. ⛔ E sono comparsi **perché
`public/` è stato ricostruito**: il pacchetto consegnato era **stale**, e ricostruirlo dalla fonte
vera ha scoperto rossi che nessuno aveva misurato. **Non attribuirli alla barra.**

## COSA GIRA ADESSO (18/09/2026, sera)

Quattro agenti, su **file disgiunti** (le intersezioni devono restare vuote):
- **A** — il vestito delle sezioni: `settings-view.ts` · `settings.css` · `index.template.html`
- **B** — la colonna dell'anteprima: `components/anteprima-tema.js` (nuovo) · `styles/anteprima-tema.css` (nuovo)
- **C** — i tre componenti di sezione: `contesto.js` · `costi-consumo.js` · `fonte-ricerca.js`
- ⛔ **la review avversaria della FASE 1** ha consegnato il suo referto (dieci difetti, otto
  confermati: § qui sotto) ed è stata **fermata dall'owner** il 18/09 sera.
- ⛔ **la review avversaria sulla barra HA CONSEGNATO** (§ «LA REVIEW AVVERSARIA DELLA BARRA»): due
  difetti, entrambi **curati** (`bb148037`), e nove ipotesi che non hanno prodotto un rosso.
  Ha lasciato la sua prova indipendente, `tests/browser/_review-barra.spec.mjs` (**8/8** col codice
  curato), ed è **committata**: è il controllo di questa superficie. ⛔ Le cure **non** hanno ancora
  avuto una review avversaria **loro**: `bb148037` e `be736bc9` restano **NON DEPLOYABILI**.

## COSA FARE ALLA RIPRESA, IN ORDINE

1. **Raccogliere i referti** dei quattro agenti.
2. **Unire i loro findings col mio inventario** (l'owner l'ha chiesto: «*poi unite i findings*»).
3. **One build sola**, quando nessuno sta più scrivendo in `src/` — cioè `cd harness-ui && npm run aggiorna`
   (fa build + copia in `public/` + riavvio del 4174). ⛔ **Mai build mentre le corsie scrivono**: cinque
   build insieme si sovrascrivono.
4. **L'ispezione visiva obbligatoria** (§ seconda cosa, qui sopra) e il rifacimento delle foto.
5. Le fasi successive: **2** (le dieci sezioni) · **3** (la banda del laboratorio) · **4** (le quattro
   schede) · **5** (la pagina del modello) · **6** (il confronto finale).
6. ⭐ **Dopo il piano** (owner 18/09): lo **stesso metodo sulla sidebar di DESTRA** — il **grafo
   agenti** e lo stile generale rifattorizzato. ⛔ Prima di riaprire: verificare se la «tab file» è
   davvero già fatta.

---

## ⛔⛔ LE TRE PR DEL REFACTOR — sidebar sinistra · sidebar destra · impostazioni

Owner, 18/09/2026: «*Metti anche il fatto delle tre PR, i rispettivi refactors, sidebar sinistra,
destra e impostazioni. Non dimenticare nulla.*»
E il **vincolo assoluto**, suo, sempre del 18/09: «*ricorda il vincolo assoluto i mockup dei
refactory delle 3 pr vanno integrati **INTERAMENTE e identicamente**, fai riferimento alle zip in
downloads nella cartella pr*» — **non si applica «la parte utile», non si riadatta, non si sceglie**.
Ciò che si intende escludere si elenca **PRIMA** di applicare e si aspetta il suo sì.
⛔ **E non alla cieca** (sua precisazione immediatamente successiva): «*devono risultare
**perfettamente funzionanti testati e verificati alla struttura attuale**, ad ogni passo di
implementazione sei forzato a fare una **ricerca web** per trovare le best practices … **per quella
specifica implementazione***».

Tutte le zip sono in **`C:\Users\Antonino\Downloads\pr\`** — contenuto **verificato leggendolo**,
non dedotto dai nomi il 18/09/2026:

| refactor | PR | zip | cosa contiene (verificato) | stato |
|---|---|---|---|---|
| **SIDEBAR SINISTRA** | — | `sidebar-tested-source-final.zip` (630.117 byte, 18/09 08:01) | `src/components/sidebar-desktop.js`, `sidebar-state.js`, `sidebar-view.js`, `src/styles/sidebar-desktop.css`, **`docs/sidebar-desktop-design.md`**, e il backend `src/sidebar-activity.mjs` + `src/sidebar-feed.mjs`; test `sidebar-desktop.spec.mjs`, `sidebar-state.test.mjs`, `sidebar-feed.test.mjs`, `elenco-dopo-lo-stop.spec.mjs` | verificato |
| **SIDEBAR DESTRA** (inspector · agente · grafo · Review) | **#33** | `talos-pr33-reviewer.zip` (2.474.573 byte, 17/09 22:43) | branch **`fix/desktop-inspector-tabs-calm-lab`**, checkpoint **`55f2d1b2`**; `REVIEWER.html` (512 KB), nove documenti di review, `prototype/` (25 file), `production/` (CSS operativo + patch), `evidence/` (integrità, confronto visivo, snapshot CI), `checkpoints/` | ⛔ **in bozza, nessun merge** |
| **IMPOSTAZIONI** | **#27** | `TALOS-Revisione-PR27-Calm04.zip` (67.507.789 byte, 17/09 23:37) | `01-inventario/14-TEMI.md` e **`40-CAMPI.json`** (i **14 temi** e i **40 campi**: la fonte dei due numeri del badge), `02-architettura/CONFINE-PRODOTTO-PROTOTIPO.md`, `03-review/CODE-ENGINEERING-REVIEW.md` + `MATRICE-ACCETTAZIONE.md`, `04-prove/` con gli screenshot (`04-appearance-dark.png`, `04-theme-studio-dark.png`, `04-filtri-mobile.png`) | verificato |

**E ci sono anche le PR #28-31**, che sono un altro dossier: `TALOS_Reviewer_PR28-31_CP5_23f631f8.zip`
(1.354.785 byte), checkpoint **`23f631f8`**. Il suo stesso `00_LEGGIMI.md` dice: «*Nessun merge
effettuato. Le quattro PR restano in bozza*», la sequenza proposta è **#28 → #30 → #31**, e la
**#29 richiede un blocco separato** perché «*si sovrappone ai file modificati dalle altre*».
Contiene anche `00_scope/TALOS_PIANO_TECNICO_COMPARATIVO.zip` e il verificatore `verify_bundle.py`.

⛔ **DUE COSE CHE DICONO LE FONTI, E CHE VANNO TENUTE:**
1. **Della #33**, dal suo `README.md`: «*La correzione operativa riguarda la visibilità del dettaglio
   agente. **La nuova UX File, il grafo, le operazioni e Review restano un laboratorio: non sono
   collegati al backend**.*» ⇒ il grafo agenti e la UX File **non sono pronti per il prodotto**:
   nel portarli va detto cosa si collega e cosa no.
2. **Della #28-31**: «*Il dossier conserva il test che fallisce, **non lo presenta come superato**.*»
   ⇒ è materiale di review, non una fusione pronta.

⛔ **DA RICONCILIARE, e va fatto PRIMA di applicare**: `MEMORIA-SETTEMBRE-2026.md` cita **tre zip**
per «i mockup dei refactory delle 3 pr» — `TALOS_Reviewer_PR28-31_CP5`, `sidebar-tested-source-final`
e `talos-pr33-reviewer` — mentre l'elenco dell'owner del 18/09 è **sidebar sinistra · sidebar destra ·
impostazioni**, e le impostazioni stanno nella **#27**, che nella memoria non c'era. **Le due liste
non combaciano**: chiedere all'owner quale vale, invece di scegliere da soli.

## ⛔ LA REVIEW AVVERSARIA DELLA FASE 1 — 10 difetti, 8 CONFERMATI (18/09/2026)

Ha lavorato in **sola lettura** sul 4174 (zero non-GET, zero righe di prodotto toccate), con
**15 mutazioni** sulla riga di prodotto servita per provare quali prove mordono davvero.

### Curati subito (miei, piccoli)

| # | difetto | cura |
|---|---|---|
| **D2** | ⛔ **il breadcrumb si DUPLICA al rimontaggio**: mancava `[data-settings-chrome]`, l'unica cosa che la rimozione cerca. Percorso vero: Sicurezza e privacy ▸ Ripristina i valori iniziali ▸ conferma → breadcrumb **1 → 2**, a y=182 e y=338 | `breadcrumb.dataset.settingsChrome = ''` |
| **D1** | il breadcrumb **ereditava il vestito delle liste**: `index.css:1802` `#schermoImpostazioni li{padding:10px 0;border-top:1px solid …;font-size:13px}`, scritta per le liste di fatti. Misurato: li con bordo, padding e altezza **39px** | regola più specifica per `.settings-breadcrumb li` |
| **D10** | **commento inesatto nel codice**: dichiarava la soglia a «720px», la vera è un `@container settings (max-width: 660px)` (`settings.css:149-166`) | commento corretto |
| **—** | la mia riga in `index.css` era una **copia che ombreggiava la misura**: `min-height`, `padding`, raggio e corpo erano **già** in `settings.css:28`, che è la regola che vince. La review l'ha provato togliendola: la prova restava verde | tolta la parte ridondante, restano `gap` e `margin` |

### ⛔ APERTI — e i primi due sono **decisioni dell'owner**

| # | cosa | stato |
|---|---|---|
| **D5-bis** | ⛔ **7 file di `src/` sono più NUOVI del bundle servito** (18:21:19): `anteprima-tema.css` 18:39 · `anteprima-tema.js` 18:48 · `html-fidato.js` 18:48 · `markdown.js` 18:49 · `scheda-modello.js` 18:49 · `sezioni-stile.css` 18:51 · `main.css` 18:39. ⇒ **tutto ciò che è stato scritto dopo le 18:21 NON è a schermo sul 4174**, e le foto del 18:40 fotografano un build di venti minuti prima | **richiede UNA build** — e va fatta quando le corsie smettono di scrivere |
| **D5** | il **`[object Object]`** è **vivo sul 4174** (`public/app.js` riga 25210 porta ancora il `join`), mentre la fonte è curata alle 18:49 | si chiude con la stessa build |
| **D8** | il **README rende l'HTML come testo** a schermo | curato (`c42d909f`), non buildato |
| **D3** | il punto usa `currentColor` (scelta documentata) invece del `var(--accent-text)` **#704814** del mockup | **decide l'owner** |
| **D4** | il breadcrumb **non è quello del mockup**: nel mockup sta **nella topbar**, `gap:12px`, chevron **SVG 13×13**, e ha **regole mobili** (sotto i 720px nasconde il primo crumb); l'app è nel contenuto, `gap:8px`, glifo `›`, **nessuna regola mobile** | **decide l'owner** |
| **D6** | il primo tab si chiama **«Hugging Face»** mentre il mockup ha **«Modelli»** — ⛔ **ma l'owner l'ha deciso testualmente**: «*la tab "modelli" si deve chiamare Hugging Face*». **L'owner vince sul mockup**; la review non lo sapeva | chiarito, nessuna azione |
| **D7** | la **pagina del modello è nuda**: nessuna cornice, nessun breadcrumb (`breadcrumbDentroLaScheda: 0`) | FASE 5 |
| **D9** | **doppia testata** in `lab-provider` e `lab-download` («Collegamenti, non scatole nere.» + «Fornitori e accessi») | sospetto, corsia C in corso |
| — | **la prova non morde su 4 punti**: il **colore del punto** · la copia in `settings.css:28` (curata) · il **`letter-spacing`** del titolo · il **raggio dello scope** | da decidere: si aggiungono i test o si accetta |

**Verificato buono dalla review**: la barra principale dell'app **non cambia** (le misure sono scoped);
le cinque misure tengono anche con etichette lunghe che vanno a capo; `[role="tab"]` seleziona
esattamente le 10 voci e il bottone di ricerca non ha ruolo; il breadcrumb **si aggiorna** al cambio
sezione; il difetto che la FASE 1 cura **esisteva davvero** (non è una cura per una malattia
inventata).

⛔ **E una nota di metodo della review, da tenere**: sulla rotta della pagina modello, in headless,
**il DOM e il dipinto non coincidono** (le misure dicono cornice presente, la foto mostra la pagina
nuda). Ha consegnato la foto — ciò che l'owner vede — e la misura come fatto, **senza provare la
causa**. È il modo giusto.

## ✅ LE QUATTRO DECISIONI — PRESE DALL'OWNER il 18/09/2026 (sera)

| # | domanda | ✅ decisione | stato |
|---|---|---|---|
| 1 | il **punto della voce attiva**: `currentColor` o il colore del mockup? | **il colore del mockup, `#704814`** (`--accent-text`) | **fatto** |
| 2 | il **breadcrumb**: dentro il contenuto o **nella topbar** come il mockup? | **come il mockup: nella TOPBAR**, col chevron **SVG 13×13**, gap 12px e le **regole mobili** (sotto i 720px nasconde la prima voce) | **da fare** — ⛔ tocca la topbar, superficie condivisa con la chat, e la **corsia A** sta lavorando su `settings-view.ts`: si fa **dopo** di lei |
| 3 | la **telemetria del contesto** (`[data-runtime-usage]`, cache, latenza): rimetterla o togliere le asserzioni? | **si RIMETTE nel prodotto** | **da fare** — è lavoro **nuovo**: va disegnata, perché **non esiste in nessuno dei due mockup**. Chiude i due rossi di `context-compactor` e `baseline-shell` |
| 4 | i **18 controlli sotto i 36px** di area toccabile | **come il mockup, sotto i 36px** ⇒ si **abbassa la soglia del cancello** per queste superfici, dichiarando il perché | **da fare** |

## LE DUE DECISIONI CHE ASPETTAVANO L'OWNER — ✅ RISOLTE (sono la 3 e la 4 qui sopra)

1. **`[data-runtime-usage]`**: la telemetria è stata **cancellata dal prodotto** (commit `65e557d3`,
   11/09) e **non esiste in nessuno dei due mockup**. Due prove la cercano. O si rimette la
   telemetria, o si tolgono le asserzioni. ⇒ **Decide l'owner.**
2. **18 controlli sotto la soglia di area toccabile 36px** (12 `calm-check` 42×25, 6 bottoni h=32).
   ⛔ **Il mockup è sotto la stessa soglia**: «come il mockup» significa accettare aree più piccole.
   ⇒ **Decide l'owner.**

## ⛔ DA NON RIFARE (già misurato, non ri-dedurlo)

- **`Ctrl K` è già preso**: l'app ha la sua palette dei **comandi** (`#veloComandi` con
  `#cercaComando`) e il suo piè di pagina lo dichiara. La cura è stata **dare un ambito** alla
  scorciatoia: dentro le Impostazioni vince il cercatore delle impostazioni, fuori restano i comandi.
- **`.talos-nav-item` è CONDIVISO** con tutta la sidebar dell'app: le misure del mockup stanno
  **scoped** a `#schermoImpostazioni`, e la sidebar principale è stata **verificata intatta**
  (gap 10px, radius 10px, padding 0 10px, nessun punto).
- **Le voci della sidebar del mockup NON hanno testo affidabile**: nascono da un template. Il
  selettore vero è `[data-action="navigate"][data-value="…"]`; cliccarle per testo lasciò la pagina
  ferma e **otto foto su otto erano la stessa sezione**.
- **Il CSS non si legge, si misura**: `.talos-nav-item` è definito in **tre** fogli
  (`index.css:303`, `primitives.css:411`, `mockup-sidebar.css:96`) e il DOM vivo diceva
  `padding 10px 12px` e `radius 8px` mentre il foglio che avevo letto diceva altro. Stavo per
  «correggere» ciò che era già giusto.
- **Il cancello della ricerca** (`ricerca-prima-di-scrivere.mjs`) legge le ultime **300 righe** del
  transcript, e il `tool_use:WebSearch` viene scritto **DOPO** l'Edit che dovrebbe autorizzare;
  inoltre le ricerche di un **subagente** stanno nel sidechain e nel transcript di sessione non
  arrivano mai. ⇒ Se un agente dice «il cancello nega anche se ho cercato», è questo.
- **Le guardie sulle icone** (`tests/unit/icone-ripiego.test.mjs`, `sprite.test.mjs`) leggono
  **anche i commenti**: una cura giusta col commento che cita la misura fra apici fa rosso.
- **`npm run typecheck` non esiste** e non c'è `tsconfig.json`; i test girano con
  `node scripts/run-node-tests.mjs` (`node:test`), **non** con vitest.

## I NUMERI DI RIFERIMENTO (18/09/2026)

- suite unit: **1419 passati / 0 falliti**
- `tests/browser/intelaiatura-impostazioni.spec.mjs`: **9/9**
- `tests/browser/html-fidato.spec.mjs`: **5/5** · `tests/unit/html-fidato.test.mjs`: **6/6**
- `tests/browser/lab-guscio.spec.mjs` + `velo-fornitori` + `po30-scheda-file`: **21/21**
- cancello dei componenti: **exit 0**
- la corsia 5 sui rossi noti: `baseline-shell` **42 verdi / 23 rossi** (da 40/25)
- ⛔ **A/B fatto lo stesso giorno sulla barra** (le mie due fonti messe da parte con `git show
  HEAD:` — **non** con `git checkout`, che il classificatore blocca perché butta lavoro non
  committato): **42/23 sul committato** contro **43/22 con la modifica**. Un test balla fra i due
  giri: **non è una cura mia**, ed è la ragione per cui i rossi si attribuiscono solo con l'A/B.
- `tests/browser/parita-sezioni.spec.mjs` + `anteprima-tema.spec.mjs`: **9 verdi / 2 rossi** —
  `PARITA-08` e la prova della colonna: **gli stessi due anche sul committato**.
- le **32 foto** del confronto, rigenerate col build finale:
  `C:/Users/Antonino/Downloads/confronto-fase1/` (16 coppie `_mockup` / `_real`, 1440p e 1080p,
  tema scuro). ⛔ Le coppie sono **del build finale**: rigenerarle è l'ultimo passo, dopo la build.
- gli **ingrandimenti della colonna** (strumenti, non committati perché `artifacts/` è ignorata):
  `harness-ui/frontend/artifacts/zoom-bar/` — `zoom.mjs`, `misura-testi.mjs`, `stretta.mjs`, più le
  foto `nav.png` (colonna a 1440p), `nav-stretta.png` e `pagina-stretta.png` (a container 624 px).
- a larghezza stretta (container **624 px** ≤ 660): campo **592×38**, dentro la colonna,
  segnaposto intero, filtro funzionante (**6 risultati** su «tema»), **zero non-GET** sul 4174.
- `tests/browser/intelaiatura-impostazioni.spec.mjs`: **10/10** (la decima è nuova: «cercando, la
  colonna non salta», e morde — col codice di `4b4c753b` rimesso è **rossa**).
- `tests/browser/_review-barra.spec.mjs` (la prova indipendente del revisore): **8/8** col codice
  curato — le sue R-C e R-G passano, cioè il suo stesso difetto è chiuso e verificato da lui.
- ⛔ **`tests/browser/lab-faccette.spec.mjs`: 7 rossi su 7, e NON è una regressione.** Si fermano
  tutti **prima** di toccare le faccette, su `getByRole('tab', { name: 'Modelli', exact: true })`:
  la prova è scritta per il guscio di `513b8bed`, e il port nuovo ha rinominato la scheda in
  **«Hugging Face»** (la si vede nella foto `lab-huggingface_1440p_real.png`). Un CSS non può far
  sparire una scheda: **la prova è stantia**, e va rimisurata dalla corsia del laboratorio.
- ⛔ **`baseline-shell -g "hit"`: 2 verdi, 1 rosso** — «Model Lab filters have explicit names and hit
  areas» cerca un `searchbox` di nome **«Cerca nel catalogo»** e ne trova **0** (il campo vero si
  chiama «Cerca Hugging Face»). **Preesistente** (rosso anche prima di questa modifica) e non
  riguarda le misure: è una divergenza di **nome accessibile**, da decidere col laboratorio.
- **`npm run aggiorna` si blocca sul riavvio del 4174**: la build e la copia in `public/`
  avvengono **prima**, e il codice nuovo si vede dal vivo. Si aspetta che `public/app.js` sia più
  recente della sorgente, non che il comando esca.
