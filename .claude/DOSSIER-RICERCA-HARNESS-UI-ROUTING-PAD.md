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

## Pin upstream

- `vue@3.5.40`
- `vue-router@5.2.0`
- `@capacitor/core@8.4.2`
- `@capacitor/android@8.4.2`
- `@capacitor/keyboard@8.0.5`
- `vaul-vue@0.4.1`
- `reka-ui@2.10.1`

Nessuna nuova dipendenza. Container Queries, ResizeObserver, Shadow DOM e
top-layer sono API native del browser target.

## Alternative respinte

- Iframe: viola `frame-src 'none'` e separa nuovamente la SPA.
- Nuovo framework/microfrontend package: non risolve il contratto dell'host.
- Media query viewport-only: non misura lo spazio reale di Harness.
- Solo aumento di z-index: non supera il browser top layer.
- Solo Back hardware Android: lascia la gerarchia senza un comando visibile e
  non copre iOS.
- Nuovo backend/TALOS-BANCO: fuori perimetro owner.
- Tema Calm fissato: superato dalla decisione owner sui token TALOS.

Se una prova invalida il ledger, dossier e ledger vengono aggiornati prima di
proseguire. Nuove dipendenze o confini richiedono una nuova decisione owner.
