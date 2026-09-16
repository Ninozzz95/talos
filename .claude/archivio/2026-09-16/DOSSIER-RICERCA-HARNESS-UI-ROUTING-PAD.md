# Dossier ricerca — Harness UI routing e verifica Pad

Data: 2026-08-25  
Owner: TALOS UI mobile  
Stato: gate di ricerca superato prima delle modifiche di comportamento.

## Perimetro ed evidenza

Il lavoro riguarda esclusivamente l'integrazione della Harness UI demo nella
shell Vue mobile. Restano fuori TALOS-BANCO, execution plane, control-plane,
desktop, motore locale, voce nativa e repository `AVM-harness-ui`.

Le funzioni non collegate restano esplicitamente `Demo UI · non collegato`.
Nessuna superficie deve simulare un successo di rete o backend.

- Device: OPD2415, seriale `2ea6573c`.
- Pacchetto verificato: `ai.talos.dev`.
- Browser/WebView osservato: Chrome 151.0.7922.173.
- 140 screenshot reali ispezionati integralmente in
  `C:\Users\Antonino\AppData\Local\Temp\talos-harness-readonly-20260824-2307`.
- Matrice: tablet portrait/landscape e phone portrait/landscape simulato,
  tastiera aperta/chiusa, controlli e scroll completi.
- Ripristino: 2400x3392, density 420, rotazione automatica attiva.

## Cause misurate

1. Il rail Vue delle sessioni Harness non espone compressione.
2. Il drawer globale usa `z-50`, mentre la station sheet usa `z-[70]`.
3. Un `<dialog>` modale Harness entra nel top layer: nessun normale `z-index`
   può superarlo.
4. La station sheet scorre esternamente e il mockup usa ancora `100dvh`: il
   composer è ancorato a un rettangolo più alto dell'host.
5. Il comportamento mobile dipende da `window` e dalla sola larghezza; il
   phone landscape reale è largo ma molto basso.
6. Il parametro Vue Router è solo diagnostico: il mockup resta sulla sessione
   statica `Refactor auth flow`.
7. Il filtro imposta `hidden`, ma `.command-results button { display:flex }`
   ne forza ancora il rendering.
8. Il microfono non ha un listener.
9. I badge demo assoluti collidono con controlli diversi per struttura.
10. I colori locali imitano Calm ma non consumano i token del theme engine.

## Fonti ufficiali e decisioni

### Vue Router 5.2.0 — adottato direttamente

- https://router.vuejs.org/guide/advanced/composition-api.html
- https://router.vuejs.org/guide/essentials/dynamic-matching.html

La stessa istanza viene riusata quando cambia un parametro dinamico. Si osserva
la sola proprietà `route.params.id`, non l'intera route. Il pin esistente resta.

### Capacitor Keyboard 8.0.5 — adottato direttamente

- https://capacitorjs.com/docs/apis/keyboard

Il plugin espone eventi show/hide e listener removibili. Su Android il layout
deve reagire alla WebView/host reale e agli eventi; nessun inset presunto e
nessun plugin nuovo.

### Container Queries e ResizeObserver — adottati direttamente

- https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries
- https://developer.mozilla.org/en-US/docs/Web/API/Resize_Observer_API

Le container query rispondono al rettangolo realmente assegnato allo shadow
host. `ResizeObserver` serve solo ai comportamenti JS non esprimibili in CSS e
viene sempre disconnesso nel distruttore.

### `hidden`, stacking e top layer — adattamento AVM

- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/hidden
- https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Positioned_layout/Stacking_context
- https://developer.mozilla.org/en-US/docs/Glossary/Top_layer

Una dichiarazione autore `display` può prevalere su `hidden`. Un elemento nel
top layer sta sopra i normali stacking context. Servono quindi sia livelli
globali coerenti sia un ponte AVM che chiuda le superfici transitorie Harness
prima di aprire la navigazione globale.

### Shadow DOM e theme engine — mantenuto e adattato

- https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM

Le proprietà personalizzate ereditano attraverso lo shadow boundary salvo
ridefinizioni locali. Gli alias Harness verranno mappati su `--talos-*`, con
fallback soltanto per l'apertura statica del mockup.

### Back Android, scroll annidato e chrome di sezione — adattamento AVM

- https://capacitorjs.com/docs/apis/app
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overscroll-behavior
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/header
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/Heading_Elements

Il listener `backButton` di Capacitor sostituisce il comportamento Android
predefinito: il primo Back deve quindi essere consumato dal layer transitorio
più interno e la navigazione può partire soltanto quando nessun layer è stato
chiuso. Il ponte AVM restituisce l'esito reale del dismiss, non la sola presenza
del metodo.

`overscroll-behavior: contain` impedisce intenzionalmente lo scroll chaining.
Sul diff inline, che ha bisogno soltanto dello scorrimento orizzontale, viene
quindi mantenuto il contenimento sull'asse X e ripristinata la propagazione
verticale verso la conversazione.

La testata globale del foglio di stazione è ridondante quando la superficie
Codice possiede già la riga contestuale della sessione. Viene omessa solo per
`harness-session`; il dialogo conserva un nome accessibile e la topbar che
inizia da «Refactor auth flow» conserva un solo safe-area superiore. Nessuna
intestazione delle altre stazioni cambia.

### Ritorno visibile lista → dettaglio senza ripristinare la doppia testata

- https://developer.android.com/guide/navigation/principles
- https://developer.apple.com/design/human-interface-guidelines/toolbars
- https://router.vuejs.org/guide/essentials/navigation.html

La prova Pad telefono portrait del 25/8 ha mostrato che togliere l'intera
testata del foglio eliminava anche l'unico comando visibile per risalire dal
dettaglio alla lista. Il Back hardware Android funzionava, ma non è una
controparte visibile e non esiste su iOS. Android distingue la destinazione
figlia, che espone Up nella app bar, dalla destinazione radice; Apple colloca
Back al leading edge, immediatamente prima del titolo. Vue Router conferma che
la navigazione deve attraversare il router installato, non un nuovo
`window.location`.

Decisione upstream: **adattare** il controllo mobile già presente nella topbar
statica. Quando il mockup è incorporato, il vecchio pulsante che apriva la sua
sidebar duplicata diventa un solo Back/Up con icona standard e chiama il router
Vue tramite un callback AVM posseduto dall'host. La testata «Codice» non torna:
«Refactor auth flow» resta il primo e unico titolo. Su tablet la lista/rail
persistente resta il controllo di navigazione e il Back non viene duplicato.

### Gutter mobile della superficie incorporata

- https://developer.android.com/design/ui/mobile/guides/layout-and-content/edge-to-edge
- https://developer.apple.com/design/human-interface-guidelines/layout

La schermata telefono reale ha misurato due gutter orizzontali sommati: 16px
del `TalosMobileScreen` esterno e 12px della conversazione Codice. L'owner ha
identificato visivamente la colonna risultante come troppo stretta. Le linee
guida ufficiali distinguono il piano che deve estendersi fino ai bordi dal
contenuto critico, che mantiene un inset minimo e sicuro. Adattamento AVM:
rendere edge-to-edge solo il corpo host di questa superficie incorporata e
lasciare a Codice il suo unico gutter interno responsive. Safe-area superiore,
bottom navigation, composer e target interattivi restano invariati. Nessuna
altra stazione perde il proprio padding.

Decisione upstream: adattare API native e semantica HTML dietro i confini TALOS
già presenti. Nessuna nuova dipendenza risolve meglio naming, chrome, consumo
del Back o scorrimento per asse.

### Palette Codice nella forma telefono larga e bassa

- https://www.w3.org/TR/css-values-4/#viewport-variants
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length

La prova Pad telefono landscape del 25/8 ha misurato la palette con bordo
inferiore a `399.85px` dentro un viewport dinamico alto `392px`: la chiusura e
le voci erano usabili, ma circa 8px CSS uscivano realmente dal riquadro. CSS
Values Level 4 definisce `dvh` rispetto al viewport dinamico e lo rende quindi
il riferimento corretto quando l'interfaccia del browser o la tastiera possono
cambiarne l'altezza.

Decisione upstream: **adattare** le unità dinamiche già in uso, senza nuova
dipendenza. Nella classe runtime `talos-embedded-wide-short` la palette usa un
margine superiore fisso di 8px e torna al limite prudente
`calc(100dvh - 40px)`, lasciando visibili entrambi i bordi anche quando l'host
incorporato parte sotto la status bar. RED permanente:
`CODE-PALETTE-LANDSCAPE-01`; prova reale richiesta dopo build e deploy.

### Feedback transitorio sopra la navigazione

- https://developer.android.com/reference/com/google/android/material/snackbar/Snackbar

La prova dei controlli Board e Inspector in landscape ha mostrato il toast nel
DOM (`320.67–380.12px` in un viewport alto `392px`) ma non nel fotogramma: la
bottom navigation larga e bassa lo copriva. La guida Android richiede che lo
snackbar dia feedback leggero sopra gli altri elementi e prevede esplicitamente
un'anchor view per ricalcolarne la posizione.

Decisione upstream: **adattare** il toast AVM già esistente alla nav posseduta
dalla stessa superficie. Nella forma `talos-embedded-wide-short` il suo bordo
inferiore viene ancorato a `var(--mobile-nav-h) + 8px`; nessuna libreria nuova e
nessuna modifica alle altre forme. RED permanente: `CODE-TOAST-WIDE-SHORT-01`.

### Altezza intrinseca del diff in Review landscape

- https://www.w3.org/TR/css-sizing-3/#min-size-properties

Al fondo reale di Review il Pad mostrava un pannello vuoto: le cinque righe del
diff erano già scorse sopra il viewport, mentre `min-height: 420px` continuava
a imporre una coda desktop. CSS Sizing distingue la dimensione minima imposta
dalla dimensione intrinseca del contenuto; qui il minimo fisso non rappresenta
né il contenuto né l'altezza disponibile dell'host basso.

Decisione upstream: **adattare** soltanto `talos-embedded-wide-short` con un
minimo dinamico e limitato,
`min(180px, calc(100dvh - 180px))`. I diff lunghi continuano a crescere con il
contenuto; quelli corti non fabbricano più scroll vuoto. RED permanente:
`CODE-REVIEW-WIDE-SHORT-01`.

### Stato terminale demo

- https://www.w3.org/TR/aria-role/roles#status

La superficie Terminale dichiarava insieme `Demo UI · non collegato` e
`pty attiva`. Un testo di stato è informazione advisory sullo stato corrente:
non può affermare l'esistenza di un processo che la demo non avvia. Decisione
owner applicata senza backend: badge neutro `pty demo`, niente colore success e
RED permanente `CODE-TERMINAL-DEMO-TRUTH-01` che vieta il vecchio claim.

### Raggiungibilita' delle Impostazioni nella superficie embedded

- https://developer.android.com/design/ui/mobile/guides/patterns/settings?hl=en
- https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns?hl=en

La guida Android tratta le Impostazioni come destinazione secondaria ma ne
richiede un accesso chiaro e prevedibile, normalmente da top bar o menu; le
azioni non frequenti appartengono all'overflow. Nel documento statico
standalone l'ingresso era nel footer della sidebar sessioni, ma l'host Vue
nasconde intenzionalmente quella sidebar: la vista restava nel DOM senza un
percorso utente.

Decisione upstream: **adattare** il pannello di controllo gia' raggiungibile
dalla palette, senza una dipendenza e senza aggiungere una quindicesima voce al
contratto dei comandi. `Agents, hook e doctor` continua ad aprire lo stesso
pannello; in fondo al gruppo runtime compare `Impostazioni Codice`, che chiude
il foglio e apre la vista locale esistente. Automazioni conserva invece il suo
ingresso contestuale dalla Board. RED permanente:
`CODE-SETTINGS-REACHABLE-01`.

### Coerenza degli asset dopo l'aggiornamento APK

- https://www.rfc-editor.org/rfc/rfc9111.html#section-2
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching#cache_busting
- https://developer.android.com/reference/android/webkit/WebView#clearCache(boolean)
- https://developer.android.com/reference/android/webkit/WebSettings#LOAD_NO_CACHE
- https://developer.android.com/reference/android/content/pm/PackageInfo#lastUpdateTime
- https://developer.android.com/reference/android/net/Uri.Builder#appendQueryParameter(java.lang.String,java.lang.String)
- https://developer.android.com/reference/android/webkit/WebView#loadUrl(java.lang.String)
- https://developer.android.com/reference/android/webkit/WebView#stopLoading()
- https://github.com/ionic-team/capacitor/blob/8.4.2/android/capacitor/src/main/java/com/getcapacitor/Bridge.java
- https://github.com/ionic-team/capacitor/blob/8.4.2/android/capacitor/src/main/java/com/getcapacitor/PluginHandle.java

Durante la reinstallazione `adb install -r` del 25/8 i dati dell'app sono rimasti
correttamente intatti. Un primo confronto sembrava mostrare l'APK nuovo
(`HarnessSessionScreen-B4usZPPD.js`, entry `index-D9qA_LV5.js`) e il processo
riaperto ancora sui file precedenti (`HarnessSessionScreen-DN8hvzqU.js`, entry
`index-6WJkTLa4.js`). L'ispezione successiva con `aapt2` e `dumpsys package` ha
identificato la causa vera: il comando senza `-PtalosSideBySide` aveva creato e
installato il pacchetto `ai.talos`, ma PID e CDP continuavano intenzionalmente a
osservare `ai.talos.dev`, il cui `lastUpdateTime` era ancora 12:55. Non era una
risposta cache della stessa applicazione: erano due applicazioni diverse.

Android documenta `WebView.clearCache(true)` come pulizia della cache risorse,
separata da form data, cookie e Web Storage. Nel sorgente Capacitor 8.4.2
pinning locale, `Bridge` registra i plugin e chiama il loro `load()` prima di
`loadWebView()`. La prima implementazione ha quindi pulito la cache e imposto
`LOAD_NO_CACHE` in quel punto.

Il tentativo intermedio `clearCache(true)` + `LOAD_NO_CACHE`, e poi la proposta
di una seconda navigazione versionata con `lastUpdateTime`, sono stati rimossi
prima della consegna: rispondevano a una diagnosi smentita dall'ID pacchetto e
avrebbero cambiato inutilmente tutte le richieste della build debug.

RFC 9111 usa l'URI nella chiave cache; Android espone `PackageInfo.lastUpdateTime`
come istante dell'ultimo aggiornamento e `Uri.Builder.appendQueryParameter()`
per costruire la variante senza concatenazioni fragili. Capacitor 8.4.2 chiama
sincronicamente `webView.loadUrl(appUrl)` alla fine del costruttore del bridge.

Decisione upstream finale: **adattare soltanto il livello della superficie
statica Codice**. `TALOS_APP_BUILD`, identificatore
AVM gia' generato da commit e timestamp, versiona poi `index.html`, `styles.css`
e `app.js` della superficie Codice, con `cache: no-cache` per l'HTML. Non si
cancellano localStorage, chat o preferenze; il plugin debug-only resta il puro
cancello preesistente e non riceve comportamento di cache. Il gate di deploy
deve verificare con `aapt2` che l'APK sia `ai.talos.dev` prima di osservare quel
pacchetto con PID/CDP. RED permanente: `CODE-ASSET-CACHE-01`.

### Toast rispetto ai controlli persistenti

- https://developer.android.com/develop/ui/compose/components/snackbar
- https://developer.android.com/design/ui/mobile/guides/layout-and-content/edge-to-edge
- https://developer.android.com/design/ui/mobile/guides/foundations/system-bars

Android descrive lo snackbar come feedback breve che non interrompe
l'esperienza e richiede che contenuti e controlli importanti non siano
oscurati. Lo screenshot wide-short con timer congelato ha mostrato il toast
leggibile e sopra la navigazione, ma sovrapposto ai controlli permanenti del
composer, incluso Invio.

La prima correzione sopra il composer ha superato Chat (`toast 197.27–256.73`,
composer da `264.73`), ma la prova al contrario su Automazioni ha mostrato lo
stesso toast sopra `Nuova automazione`. Decisione upstream finale: **adattare**
la collocazione da scaffold alla struttura CSS esistente. Nell'host
`talos-embedded-wide-short` il feedback diventa una sola riga compatta subito
sotto topbar e run strip, a destra, lasciando libero il badge demo a sinistra e
i controlli che iniziano piu' sotto. Con tastiera aperta topbar/run spariscono e
il toast si ancora sopra il composer. Nessun cambiamento alle altre forme. RED
permanente: `CODE-TOAST-NO-CONTROL-OVERLAP-01`.

### Contenuto scorrevole sopra la navigazione persistente

- https://developer.android.com/design/ui/mobile/guides/layout-and-content/edge-to-edge
- https://developer.android.com/design/ui/mobile/guides/foundations/system-bars

Le indicazioni Android richiedono che edge-to-edge non trasformi barre e
controlli persistenti in coperture del contenuto interattivo. La prova inversa
del Browser nella forma larga e bassa ha individuato due problemi distinti: il
fondo delle viste non-Chat poteva finire sotto la nav e l'anteprima Browser
conservava un padding mobile duplicato, percepito come coda vuota.

Decisione upstream: **adattare** gli inset al vero scrollport della demo.
Soltanto nell'host wide-short, le viste non-Chat ricevono padding e
`scroll-padding-bottom` dalla variabile della bottom nav; Browser azzera il
proprio padding duplicato. Nessuna misura fissa nuova e nessun cambiamento al
tablet o al telefono portrait. RED permanente: `CODE-WIDE-SHORT-SCROLL-01`.

### Verità dello stato dei pulsanti di modalità

- https://www.w3.org/WAI/ARIA/apg/patterns/button/
- https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-pressed

Il pattern ARIA Button distingue il toggle premuto dal semplice pulsante e
richiede che lo stato esposto corrisponda allo stato corrente. Lasciare Chat
attiva mentre Browser, Review o Terminale sono visibili è quindi sia una
incongruenza visiva sia un contratto semantico falso.

Decisione upstream: **adottare direttamente** la semantica del toggle. Chat,
Split e Board restano gli unici tre modi selezionabili; quando una superficie
diversa è visibile, nessuno dei tre è premuto. Tornando a uno dei tre modi,
stile attivo e `aria-pressed` cambiano insieme. Nessuna nuova dipendenza. RED
permanente: `CODE-MODE-STATE-TRUTH-01`.

### Theme engine attraverso il confine Shadow DOM

- https://www.w3.org/TR/css-shadow-parts-1/
- https://www.w3.org/TR/css-variables-1/
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/color_value/color-mix
- https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/

L'ispezione del codice vero ha misurato un confine già completo nel prodotto:
`applyTalosTheme()` applica sul `document.documentElement` la palette canonica,
i font, la densità, i raggi, i token di stato e gli alias
`--talos-effective-*`; il cambio preset riscrive lo stesso root a componente
montato. Lo Shadow DOM eredita le custom properties dall'host, ma
`styles.css` dichiarava direttamente su `:host` tutti gli alias con valori
Calm. Una dichiarazione diretta sull'host prevale sul valore ereditato: per
questo Codice restava scuro anche dentro Paper.

CSS Shadow Parts indica le custom properties come il canale intenzionale con
cui una pagina esterna tematizza gli internals di uno shadow tree. La
specifica Design Tokens 2025.10 definisce gli alias come riferimenti alla
stessa decisione di design; duplicare i valori invece del riferimento produce
deriva. `color-mix()` è disponibile nel Chrome/WebView target e permette di
derivare livelli e trasparenze senza reintrodurre una tavolozza fissa.

Decisione upstream: **adottare direttamente** ereditarietà e alias CSS. Il
vocabolario locale del mockup resta un adapter piccolo e stabile, ma ogni alias
punta prima al corrispondente `--talos-*`; Calm sopravvive soltanto come
fallback per il documento statico standalone. Superfici elevate, hover,
overlay, ombre e bagliori sono derivate dagli alias con `color-mix()`, non da
bianco/nero/ambra codificati. Nessun MutationObserver, bridge JavaScript o
nuovo store: il cambio live è già garantito dalla cascata del browser e dal
theme engine esistente. Pin invariati; nessuna dipendenza nuova.

Alternative respinte:

- copiare i token computati via JavaScript a ogni cambio: duplica il lifecycle
  del theme store e può perdere aggiornamenti o custom theme;
- aggiungere classi Paper/Telemetry dentro il mockup: crea una seconda fonte
  di verità e non copre gli altri preset o i temi nominati;
- lasciare i raw color purché il fondo cambi: produce superfici ibride e non
  soddisfa il contratto owner sui token stilistici;
- rimuovere tutti i fallback: rompe l'apertura standalone usata per revisione.

RED permanenti: `CODE-THEME-ALIASES-01`, `CODE-THEME-CHROME-01`,
`CODE-THEME-COPY-TRUTH-01`, `HARNESS-THEME-LIVE-01` e
`CODE-THEME-INVERSE-STANDALONE-01`.

### Ritorno da Impostazioni a una rotta dinamica

- https://router.vuejs.org/guide/essentials/named-routes
- https://router.vuejs.org/guide/essentials/navigation.html
- https://developer.android.com/design/ui/mobile/guides/patterns/predictive-back

La prova Pad ha trovato un URL impossibile: tornando da Impostazioni alla
sessione Codice, il guscio naviga a `/harness/:id`. La causa è misurata nel
contratto locale: `TalosStationEntry` conserva soltanto il nome
`harness-session`, mentre `navigate()` passa a Vue Router il pattern dichiarato
come se fosse un path già risolto. La documentazione ufficiale Vue Router
richiede invece una navigazione per `name` + `params` per i segmenti dinamici;
inoltre i parametri sono ignorati se si passa `path`. Le linee guida Android
richiedono che Back rappresenti una destinazione reale e prevedibile.

Decisione upstream: **adottare direttamente** la navigazione nominata di Vue
Router e preservare i parametri della porta di ingresso. Niente URL costruiti a
mano e nessun default silenzioso che possa cambiare sessione. Lo stato continua
a ricordare soltanto il minimo necessario (nome, parametri, provenienza dalla
sidebar). Pin invariati; nessuna dipendenza. RED permanente:
`CODE-SETTINGS-RETURN-SESSION-01`.

### Stabilità della testata durante un fling — regressione owner 25/8

- https://www.w3.org/TR/2025/WD-cssom-view-1-20250916/#scrolling-events
- https://developer.mozilla.org/en-US/docs/Web/API/Document/scroll_event

La CSSOM View 2025 specifica che gli eventi `scroll` vengono emessi anche
quando lo spostamento non nasce da un nuovo gesto dell'utente: qualunque
variazione della scrolling box entra nella stessa coda di eventi. MDN ricorda
inoltre che gli eventi possono arrivare ad alta frequenza durante uno scroll
veloce. Il codice precedente confrontava soltanto due valori consecutivi di
`scrollTop`, quindi scambiava per inversione dell'utente anche il ricalcolo
prodotto dalla propria animazione.

La prova reale sul Pad rende la causa deterministica. Il primo fling verso il
basso applica `.is-scroll-hidden`; la topbar riduce la propria altezza e il
contenitore acquista spazio verticale. Se il transcript era vicino al fondo,
il nuovo massimo di scroll diventa più piccolo e il browser riporta
automaticamente `scrollTop` entro quel massimo. Il delta risulta negativo pur
senza alcun gesto verso l'alto: la testata viene riaperta e il layout torna a
spostarsi, generando il lampeggio compatta/espansa segnalato dall'owner. Due
screenshot consecutivi con soli fling verso il basso mostrano rispettivamente
topbar nascosta e poi riapparsa.

Decisione upstream: **adattare direttamente la semantica della scrolling box**
senza nuova dipendenza. Un delta negativo riapre la testata soltanto quando lo
scrollport non è ancora ancorato al suo fondo corrente
(`scrollHeight - clientHeight - scrollTop` oltre una piccola tolleranza CSS).
La riduzione imposta dal layout, che termina esattamente al nuovo massimo, non
è un'intenzione dell'utente e viene ignorata. Appena un vero gesto risale,
`scrollTop` si stacca dal massimo e la testata torna. Sono respinti sia un timer
cieco (ritarderebbe anche un vero gesto inverso), sia una topbar solo traslata
che conserverebbe il vuoto verticale già esplicitamente rifiutato dall'owner.
Pin invariati; nessuna dipendenza. RED permanente:
`CODE-TOPBAR-NO-FLAP-01`.

### Composer limitato alla colonna di conversazione — correzione owner 25/8

- https://www.w3.org/TR/resize-observer/
- https://developer.mozilla.org/en-US/docs/Web/API/Resize_Observer_API
- https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect

L'ispezione completa richiesta dall'owner ha invalidato il precedente esito
tablet landscape: il composer Vue condiviso era ancorato ai due bordi della
surface TALOS, mentre dentro lo Shadow DOM la griglia Codice divide quella
stessa surface in `workspace-shell` e `inspector-panel`. Di conseguenza il
composer passava sotto la colonna Contesto per tutta la sua larghezza. Il vecchio
RED `CODE-COMPOSER-TABLET-RAIL-01` proteggeva soltanto il rail globale sinistro e
non esprimeva il confine destro; era quindi necessario ma incompleto.

W3C definisce `ResizeObserver` come l'API per osservare i cambi di dimensione di
un elemento, e MDN conferma che `getBoundingClientRect()` restituisce dimensione
e posizione nello stesso sistema di coordinate del viewport. Decisione
upstream: **adottare direttamente entrambe le primitive native**, senza package
o timer. L'adattatore Vue misura il rettangolo dell'host e quello della sua
`.workspace-shell`, converte le differenze nei due inset del dock e osserva host,
workspace e composer. In questo modo il componente resta esattamente
`TalosMobileComposer.vue`, ma segue anche apertura, chiusura e ridimensionamento
animato della colonna Contesto. Sotto 1041px la workspace coincide con l'host e
gli inset tornano naturalmente a zero.

Respinti: un valore fisso da 310/340px, perché il Context rail è ridimensionabile;
un nuovo composer interno allo Shadow DOM, perché violerebbe la fonte unica già
decisa; un ritaglio con `overflow`, perché nasconderebbe controlli e hit target
senza correggere la geometria. Pin invariati, nessuna nuova dipendenza. RED
permanente: `CODE-COMPOSER-CONTEXT-RAIL-01`.

## Decisione prodotto owner 25/8 — «Codice»

Ogni riferimento visibile al nome prodotto Harness diventa **Codice** in
italiano e **Code** in inglese: navigazione, testate, messaggi, stati vuoti,
azioni di ritorno, etichette accessibili e mockup statico. Identificatori
tecnici compatibili (`harness-session`, file, simboli, `data-testid`) restano
stabili: non sono testo prodotto e rinominarli allargherebbe inutilmente la
migrazione.

La testata del foglio «Harness/Codice» viene rimossa. La prima testata visibile
del dettaglio è quella della sessione, a partire da «Refactor auth flow» (o dal
titolo selezionato). La shell TALOS e la sidebar globale restano proprietarie
della navigazione e devono continuare a sovrapporsi alla superficie Codice.

### Continuità dello sfondo, gutter della conversazione e motion contract

- https://www.w3.org/TR/css-backgrounds-3/
- https://www.w3.org/TR/CSS22/zindex.html
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/scrollbar-width
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/scrollbar-gutter
- https://www.w3.org/TR/web-animations-1/
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion
- https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Animation_performance_and_frame_rate

La misura reale sul Pad, forma telefono portrait 392×872 CSS, spiega lo
screenshot owner senza interpretazioni: `.chat-view` riservava 8px con
`scrollbar-gutter: stable` pur essendo un contenitore `overflow:hidden`; la
conversazione interna riservava altri 8px per la propria scrollbar e il calcolo
`width:calc(100% - 24px)` aggiungeva 12px di margine. Risultato: il bordo della
missione finiva a 28px dal limite destro della vista, con 20px ancora vuoti
dopo il bordo esterno della scrollbar. A sinistra il margine intenzionale era
soltanto 12px. Non è simmetria: è una doppia riserva annidata.

Nello stesso stato il foglio TALOS misurava un `background-color` opaco, l'host
Shadow un secondo colore opaco e `.app-shell` un terzo fondo opaco. Il renderer
`TalosMobileBackground` era presente dietro la stazione, ma quei tre livelli lo
coprivano completamente. CSS Backgrounds e l'ordine di painting confermano che
un discendente opaco dipinge sopra gli strati precedenti; MDN precisa inoltre
che il backdrop può essere percepito solo attraverso una superficie almeno
parzialmente trasparente.

Decisione upstream: **adottare direttamente** il compositing CSS esistente,
senza creare un secondo sfondo in Codice. Solo la stazione Codice chiede al
`TalosMobileToolSheet` una superficie trasparente; l'host embedded e la sua
`.app-shell` non dipingono un fondo pieno. Topbar, pannelli, schede e composer
restano superfici semantiche traslucide collegate ai token TALOS, quindi testo e
controlli restano leggibili mentre l'unico renderer animato dell'app resta
visibile. In standalone i fallback e il fondo proprio rimangono invariati.

La prima correzione aveva lasciato una sola scrollbar da 8px nello scrollport
vero. L'owner l'ha poi superata il 25/8 con un requisito più preciso: in Codice
embedded nessuna scrollbar deve essere visibile o occupare spazio, mentre lo
scroll deve restare. MDN definisce `scrollbar-width:none` proprio come «nessuna
scrollbar mostrata, elemento ancora scorrevole»; `scrollbar-gutter:auto` evita
la riserva stabile quando la barra non viene resa. Decisione upstream:
**adottare direttamente il contratto CSS standard**, con il selettore WebKit
equivalente per la WebView Android target. Le proprietà `overflow:auto` e
`overflow-y:auto` esistenti non vengono cambiate. La regola è confinata a
`:host(.talos-embedded)` e copre conversazione, liste, sheet, inspector,
risultati e blocchi preformattati; la preview standalone conserva la propria
indicazione visiva. Il test browser prova sia `none/auto` sia uno `scrollTop`
positivo, quindi non confonde una barra invisibile con uno scroll disabilitato.

Il codice locale usava durate indipendenti (`.14s`, `.16s`, `.18s`, `.22s`,
`.24s`, `1.2s`) e cambi di DOM istantanei. Web Animations definisce
esplicitamente il caso "attendere la fine prima di rimuovere l'elemento"; le
indicazioni di performance privilegiano `transform` e `opacity`, mentre
`prefers-reduced-motion` richiede una via senza moto. Decisione upstream:
**adottare il motion contract TALOS già applicato al root**. Gli alias locali
puntano a `--talos-motion-duration-*`, `--talos-motion-ease*` e ai transform
canonici. CSS gestisce gli stati che restano nel DOM; un adapter Web Animations
minimo conserva toast, approvazioni e dettagli durante l'uscita e applica poi
lo stato finale. Se `Element.animate` non esiste o la durata computata è 0ms,
il risultato finale è sincrono. Ogni animazione attiva viene cancellata dal
destroyer embedded. Nessuna dipendenza e nessun secondo motion engine.

RED permanenti: `CODE-BG-CONTINUITY-01`, `CODE-MOBILE-SCROLLBAR-HIDDEN-01`,
`CODE-MOTION-TOKENS-01`, `CODE-MOTION-SURFACES-01`, `CODE-MOTION-EXIT-01` e
`CODE-MOTION-REDUCED-01`.

### Un solo composer reale fra Chat e Codice

- https://vuejs.org/guide/essentials/component-basics
- https://vuejs.org/guide/components/props
- https://vuejs.org/guide/components/events
- https://vuejs.org/guide/components/v-model.html

L'ispezione del codice ha confermato che il mockup Codice contiene un secondo
composer HTML/CSS/JS (`#composerForm`, `.composer`, `#composerInput`) mentre la
Chat monta il componente prodotto `mobile/src/components/chat/TalosMobileComposer.vue`.
Il componente vero possiede già: forma classic/standard/compact, superficie `+`
drawer/menu, model/effort picker, thinking, Browse, slash menu, allegati,
contesto, prompt enhancer, dictation policy, safe-area, token tema e motion.
Continuare a sincronizzare il duplicato non può soddisfare “identico”: ogni
evoluzione della Chat ricreerebbe subito deriva.

Vue definisce il componente come unità riusabile con flusso props-down ed
events-up. Decisione upstream: **adottare direttamente la stessa SFC**, senza
wrapper visivo alternativo e senza copiare markup o stile. `HarnessSessionScreen`
monta `TalosMobileComposer` come figlio Vue e usa le stesse preferenze
`talosComposerFlags()` della Chat. L'adapter Codice possiede soltanto stato demo
locale (bozza, profilo, effort, thinking, Browse) e traduce gli eventi nel
runtime statico onesto: invio aggiunge il messaggio alla conversazione demo;
`!`/`!!` conservano il passaggio al terminale; le azioni prive di backend
mostrano feedback “Demo UI · non collegato”; le destinazioni TALOS già reali
usano Vue Router. Non viene chiamato l'API Chat e non viene mutata la bozza della
chat reale.

Il composer duplicato resta nel documento soltanto per l'anteprima standalone
del mockup, ma `:host(.talos-embedded)` lo esclude completamente da layout,
accessibility tree e hit testing. Un ResizeObserver sull'istanza vera aggiorna
un solo token di clearance dell'host, così transcript, tastiera e bottom nav non
si coprono quando il composer passa da compatto a espanso. Nessuna nuova
dipendenza e nessun fork di `TalosMobileComposer.vue`.

RED permanenti: `CODE-COMPOSER-SINGLE-SOURCE-01`,
`CODE-COMPOSER-GRAMMAR-01`, `CODE-COMPOSER-DEMO-SEND-01`,
`CODE-COMPOSER-NO-CHAT-BACKEND-01` e `CODE-COMPOSER-CLEARANCE-01`.

### Testata Codice enter-always e simmetria dopo la rimozione scrollbar

- https://developer.android.com/develop/ui/compose/components/app-bars
- https://developer.android.com/reference/kotlin/androidx/compose/material3/TopAppBarDefaults

Il requisito owner del 25/8 chiede due cose collegate alla superficie mobile:
ora che nessuna scrollbar occupa più la destra, il contenuto deve conservare lo
stesso inset reale di 12px sui due lati; inoltre la testata sessione deve
ritirarsi quando il contenuto sale e riapparire appena il gesto torna verso il
basso. La documentazione Android definisce questo comportamento
`enterAlwaysScrollBehavior`: l'app bar collassa quando l'utente tira verso
l'alto il contenuto e riappare immediatamente quando lo tira verso il basso.

Decisione upstream: **adattare il comportamento Material dietro il runtime
Codice esistente**, senza introdurre Compose o una libreria JavaScript. Gli
scrollport principali già posseduti dal componente emettono `scroll`; un
adapter privato confronta la posizione corrente con la precedente, ignora il
rumore sub-pixel, nasconde dopo l'avvio reale dello scroll e mostra subito alla
prima inversione verso l'origine. Vicino all'inizio la testata è sempre
visibile. Il cambio vista la ripristina; il destroy rimuove tutti i listener.
CSS collassa realmente l'altezza della `.topbar` e muove la striscia di stato e
il contenuto, invece di lasciare un rettangolo vuoto; durata ed easing derivano
dai token disclosure/surface TALOS e 0ms resta il percorso reduced-motion.

RED permanenti: `CODE-CONTENT-INSET-SYMMETRY-01`,
`CODE-TOPBAR-ENTER-ALWAYS-01`, `CODE-TOPBAR-MOTION-01` e il rafforzato
`CODE-COMPOSER-KEYBOARD-01` che verifica il CSS compilato, non il solo sorgente.

### Composer condiviso in viewport landscape ridotto dalla tastiera

- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/height
- https://developer.mozilla.org/en-US/docs/Web/CSS/env

La prova fisica telefono landscape ha misurato un viewport WebView alto
144,36px con Gboard aperta. Il `TalosMobileComposer` espanso occupa 148,18px:
inizia a -3,82px e invade la status bar. La controprova sulla rotta Chat mostra
lo stesso identico difetto e la stessa geometria; non è un problema del wrapper
Codice e non va corretto con una variante locale.

MDN definisce la media feature `height` come query sull'altezza del viewport,
con `max-height` disponibile e interoperabile; `env(safe-area-inset-top)`
definisce invece il rettangolo in cui il contenuto resta visibile senza essere
coperto dall'interfaccia del dispositivo. Sul WebView reale la query
`(max-height:180px) and (orientation:landscape)` cambia a `true` soltanto nello
stato estremo con tastiera.

Decisione upstream: **adottare direttamente la media query standard tramite
il composable AVM già esistente `useTalosMediaQuery`**. Lo stesso
`TalosMobileComposer.vue`, sia in Chat sia in Codice, mantiene la forma compatta
quando il prompt è vuoto e il viewport landscape è troppo basso, anche se il
campo ha focus. Restano sempre disponibili input, `+` e azione destra; modello
e ragionamento tornano appena la tastiera si chiude o il viewport supera la
soglia. Nessuna duplicazione, nessuna prop Code-only, nessun nuovo listener
manuale e nessuna dipendenza.

RED permanente: `CODE-COMPOSER-LANDSCAPE-IME-SAFE-01`.

Amendamento dopo il primo GREEN unitario: il collegamento reattivo tramite
`useTalosMediaQuery` è stato respinto dal gate di distribuzione, non dal gusto.
Pur passando 61 test, portava il chunk iniziale a 614.414 byte contro il limite
614.000 (+414). MDN documenta anche `:has()` come selettore interoperabile dal
2023 e raccomanda ancore specifiche e combinatori diretti per limitarne il
costo: https://developer.mozilla.org/en-US/docs/Web/CSS/:has

Decisione finale upstream: **adottare direttamente CSS `@media height` e
`:has(> child)`**, ancorati esclusivamente al piccolo
`[data-testid="talos-mobile-composer"]`. Nello stato corto, la riga già esistente
che contiene `+` e model chip diventa assoluta: il `+` si sovrappone nella sua
posizione canonica al campo, model chip e filler vengono nascosti, il campo
resta alto 48px e il root è limitato all'area sicura con scroll invisibile.
Nessun byte JavaScript, nessun listener, nessuna nuova prop; chiusa la tastiera,
la media query non corrisponde e il DOM torna identico senza stato da pulire.

## Ricerca aggiuntiva — dock fisso dentro la superficie traslata

La matrice Pad tablet portrait ha misurato un doppio offset: rail 323px, tool
surface da x=323px, dock da x=646px. La causa è normativa, non specifica del
WebView: secondo CSS Transforms Level 1 e la documentazione MDN corrente, un
antenato con `transform` oppure con le proprietà individuali `translate`,
`rotate` o `scale` diverse da `none` crea il containing block dei discendenti
`position:fixed`. `TalosMobileToolSheet` mantiene `translate-y-0`, quindi il
dock è già relativo alla superficie spostata; applicargli anche
`left:var(--talos-tablet-rail)` somma una seconda volta il rail.

Fonti primarie/ufficiali consultate il 25/8:

- W3C CSS Transforms Level 1, containing block dei discendenti fixed:
  https://www.w3.org/TR/css-transforms-1/
- MDN `position`, fixed positioning containing block:
  https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/position
- MDN `transform`, stacking context e containing block:
  https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/transform
- MDN Containing block, incluse le proprietà individuali di trasformazione:
  https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Display/Containing_block

Decisione upstream: **adattare senza dipendenze**. Il dock non deve possedere
la geometria globale che il tool surface ha già applicato. Diventa assoluto
rispetto alla superficie `position:relative`, con `left:0;right:0;bottom:0`.
Il componente Chat, il rail, il motion della surface e i contratti tastiera
restano invariati.

## Pin upstream

## Conformità Drawer globale

La suite completa ha scoperto che l'adattamento Harness di
`DrawerContent.vue` era funzionale e già verificato sul Pad, ma non dichiarato
nel manifest upstream. La ricerca dedicata è in
`mobile/docs/superpowers/research/2026-08-25-harness-drawer-layering-conformance.md`.
Fonti primarie: documentazione Drawer e repository ufficiali shadcn-vue;
pin npm verificato `2.8.0`, integrità identica al manifest, licenza MIT.

Decisione: **adattare**. L'hash upstream resta immutabile; l'hash accettato
registra solo la prop `overlayClass` inoltrata all'overlay del portal. Il test
mantiene un elenco esatto di quattro adattamenti e un dossier esatto per
destinazione. Nessun bypass e nessuna accettazione aperta del drift.

RED permanente: `HARNESS-DRAWER-UPSTREAM-ADAPTATION-01`.

## Larghezza estrinseca del composer quando i rail sono chiusi

Fonti ufficiali consultate il 25/8:

- W3C CSS Box Sizing Module Level 3, proprietà di dimensione massima:
  https://www.w3.org/TR/css-sizing-3/
- MDN, allineamento dei blocchi con margini automatici:
  https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Box_alignment/In_block_abspos_tables
- MDN, `calc()` per sottrarre il margine minimo dalla larghezza disponibile:
  https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/calc

La specifica stabilisce che `max-width` limita la dimensione preferita del box;
i margini inline `auto` assorbono lo spazio residuo. È quindi possibile
esprimere interamente in CSS il contratto richiesto: larghezza fluida nelle
viewport strette, tetto massimo e centratura nelle workspace larghe.

Decisione upstream: **adottare direttamente** `width`, `max-width` e
`margin-inline:auto` sulla stessa istanza condivisa di
`TalosMobileComposer.vue`, confinata dalla regola scoped di Codice. Il pin
prodotto è `920px`, già presente in `public/harness-ui/styles.css` per
`.conversation` e `.composer-wrap`; non viene introdotto un nuovo numero di
design. Respinti un listener JS per la larghezza, un secondo composer e un
limite sul dock intero: il primo duplicherebbe il layout CSS, il secondo
violerebbe la fonte unica Chat, il terzo romperebbe l'aggancio dinamico al
Context rail.

RED permanente: `CODE-COMPOSER-MAX-WIDTH-01`.

- `vue@3.5.40`
- `vue-router@5.2.0`
- `@capacitor/core@8.4.2`
- `@capacitor/android@8.4.2`
- `@capacitor/keyboard@8.0.5`
- `vaul-vue@0.4.1`
- `reka-ui@2.10.1`

Nessuna nuova dipendenza. Media Queries, `:has()`, Container Queries,
ResizeObserver, Shadow DOM e top-layer sono API native del browser target.

## Composer Codice — ripristino autonomia agente

Ricerca svolta il 25/8 dopo aver verificato il flusso locale:

- Vue 3, named slots: https://vuejs.org/guide/components/slots.html
- HTML Living Standard, `dialog` e `close` event:
  https://html.spec.whatwg.org/multipage/interactive-elements.html#the-dialog-element
- MDN, `HTMLDialogElement`:
  https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement

Il pin applicativo resta `vue@3.5.40`. Vue definisce il named slot come outlet
del frammento posseduto dal genitore; lo Standard HTML garantisce che la
chiusura di un `dialog` tramite il suo contratto nativo emetta `close`. Nel
progetto il runtime statico possiede già il dialog completo con le quattro
policy e `TalosMobileComposer.vue` possiede già i due layout della toolbar.

Decisione upstream: **adottare direttamente** lo slot Vue e il dialog nativo
esistente. Si aggiunge il solo outlet predefinito in entrambi i layout
del composer; Codice fornisce la pill e il runtime esistente resta unica fonte
delle opzioni. Respinti un nuovo drawer Vue, la copia delle quattro policy e un
secondo composer: tutti duplicherebbero comportamento già presente.

RED permanenti: `CODE-COMPOSER-AUTONOMY-PILL-01` e
`CODE-COMPOSER-AUTONOMY-SHEET-01`.

Il primo build ha misurato 614.024 byte su un tetto di 614.000 usando il named
slot. Poiché non esiste un secondo contenuto da distinguere, il default slot è
la forma standard più corta e conserva lo stesso contratto; il budget resta
invariato.

## Clipping della surface globale senza pan invisibile

Ricerca svolta il 25/8 dopo la misura reale
`scrollWidth=745px / clientWidth=393px / scrollLeft=49,09px`:

- CSS Overflow Module Level 3, §3.1:
  https://drafts.csswg.org/css-overflow/#propdef-overflow
- MDN, proprietà `overflow`:
  https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overflow

Lo standard classifica `hidden` fra i valori scrollabili: il box resta uno
scroll container. MDN esplicita che focus, `scrollLeft` e `scrollTo()` possono
muoverlo anche senza scrollbar. `clip` è invece non scrollabile e impedisce lo
scroll programmatico conservando il clipping.

Decisione upstream: **adottare direttamente `overflow:clip`** sulla surface
esterna di `TalosMobileToolSheet`. È la più piccola correzione della proprietà
reale: la surface non è la sede dello scroll, perché lo scroll verticale
appartiene già al body figlio. Respinti un listener di focus, un reset
`scrollLeft=0` e una compensazione negativa del dialog: curerebbero singoli
sintomi lasciando scrollabile l'antenato condiviso.

RED permanente: `CODE-MODAL-NO-HORIZONTAL-PAN-01`.

## Alternative respinte

- Iframe: viola `frame-src 'none'` e separa nuovamente la SPA.
- Nuovo framework/microfrontend package: non risolve il contratto dell'host.
- Media query viewport-only per il layout interno Harness: non misura lo spazio
  reale del suo host. È invece appropriata per il composer condiviso quando il
  dato da misurare è precisamente il viewport ridotto dalla tastiera.
- Solo aumento di z-index: non supera il browser top layer.
- Solo Back hardware Android: lascia la gerarchia senza un comando visibile e
  non copre iOS.
- Nuovo backend/TALOS-BANCO: fuori perimetro owner.
- Tema Calm fissato: superato dalla decisione owner sui token TALOS.
- Conservare `position:fixed` e compensare il doppio offset con calcoli o
  variabili negative: dipenderebbe incidentalmente dal containing block creato
  dal motion. L'ancoraggio assoluto alla surface esprime invece la proprietà
  reale richiesta.

Se una prova invalida il ledger, dossier e ledger vengono aggiornati prima di
proseguire. Nuove dipendenze o confini richiedono una nuova decisione owner.
