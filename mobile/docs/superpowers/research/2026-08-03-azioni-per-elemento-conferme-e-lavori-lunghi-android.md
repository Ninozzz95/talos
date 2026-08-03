# Azioni per elemento, conferme distruttive e controllo di lavori lunghi su Android

**Ricerca per TALOS — Capacitor 8 + Vue 3 in WebView Android**  
**Data della ricerca:** 3 agosto 2026  
**Ambito:** lista della stazione «Ricerca approfondita», lavori locali lunghi e costosi, foreground service, archivio cifrato sul dispositivo.

---

## Metodo, attendibilità e legenda

[DOC] La sigla `[DOC]` identifica documentazione primaria o normativa: Android Developers, Material/Android Design, W3C/WCAG/APG, documentazione ufficiale Capacitor o documentazione tecnica ufficiale di piattaforma.

[UI] La sigla `[UI]` identifica un comportamento di un'app reale ricostruito da istruzioni e schermate della guida ufficiale dell'app, consultate il 3 agosto 2026; non significa che sia stato eseguito un test strumentato sull'ultima build installata.

[3P] La sigla `[3P]` identifica studi, paper o fonti tecniche terze; quando una fonte è anteriore al 2023 viene usata soltanto se descrive un risultato metodologico ancora pertinente e viene indicato esplicitamente.

[NV] La sigla `[NV]` identifica una deduzione progettuale, una proposta per TALOS o un punto che non ho trovato documentato in modo diretto.

[DOC] Nelle conclusioni prevalgono, in ordine: requisiti normativi WCAG; documentazione Android corrente; comportamento documentato delle app reali; studi; deduzioni.

[DOC] La documentazione Android citata come “corrente” è una pagina viva consultata il 3 agosto 2026; quando la pagina espone una data di aggiornamento, tale data è riportata.

[UI] Le osservazioni su Gmail, Drive, Foto, Files e Keep sono prove di convenzione di prodotto, non norme universali.

[NV] La ricerca non assume che una raccomandazione Compose sia automaticamente implementabile in una WebView: per ogni punto viene separato il principio d'interazione dal meccanismo tecnico HTML/ARIA o nativo.

---

# 1. Risposte secche alle sei domande

## 1.1 Tieni-premuto contro tre puntini

[DOC] Per TALOS la via primaria deve essere un pulsante overflow visibile per ogni riga; Android 2026 mostra esplicitamente l'overflow inline nell'elemento di lista per le azioni aggiuntive.

[UI] Gmail, Drive, Foto, Files e Keep usano il tieni-premuto soprattutto per entrare in selezione; Drive e Files espongono “Altro” accanto all'elemento.

[DOC] Il tieni-premuto può essere un acceleratore contestuale, ma non deve essere l'unico accesso e non deve cambiare significato tra liste della stessa app.

[NV] Poiché in TALOS il gesto significa già selezione multipla altrove, riusarlo come menu nella Ricerca è la scelta sbagliata: tre puntini per le azioni, tieni-premuto per selezionare.

## 1.2 Accessibilità

[DOC] Un menu soltanto a tieni-premuto non è una soluzione robusta: il gesto non viola automaticamente WCAG 2.5.1, ma la funzione deve essere raggiungibile da tastiera secondo 2.1.1 e avere nome, ruolo, stato e bersaglio adeguati.

[DOC] In WebView la via affidabile è un vero `<button>` con `aria-haspopup="menu"`, `aria-expanded` e un popup con `role="menu"`/`menuitem`, più gestione completa del fuoco.

[DOC] TalkBack può annunciare il long-click di una `View` nativa; le API sono `ViewCompat.replaceAccessibilityAction(...)` e `ViewCompat.addAccessibilityAction(...)`.

[NV] Quelle API non aggiungono in modo affidabile azioni distinte alle singole righe DOM dentro una sola WebView: per TALOS l'azione accessibile va esposta nell'HTML, non affidata a un timer JavaScript di long-press.

[DOC] All'apertura il fuoco entra nel primo elemento; con Esc, azione o chiusura torna al pulsante che ha aperto il menu, salvo che l'elemento sia stato eliminato.

## 1.3 Conferma distruttiva

[DOC] Undo/Snackbar è adatto quando l'azione è realmente reversibile e resta un'altra via di recupero; un dialogo è appropriato per una perdita permanente o molto grave.

[UI] Keep, Drive e Foto rendono reversibile la prima cancellazione tramite Cestino; la cancellazione definitiva è distinta e nominata come tale.

[NV] Eliminare un rapporto TALOS pagato insieme ai dossier delle fonti richiede conferma preventiva, a meno di introdurre un Cestino locale affidabile.

[NV] Testo consigliato: titolo con il nome della ricerca, corpo che elenca rapporto e dossier eliminati, pulsanti “Annulla” e “Elimina definitivamente”.

[NV] Anche l'annullamento di un lavoro in corso va confermato se scarta output già acquistato o checkpoint; la sola pausa non va confermata.

## 1.4 Pausa contro annullamento

[DOC] WorkManager non ha uno stato `PAUSED`: la cancellazione porta a `CANCELLED`, è terminale e richiede cooperazione del worker tramite stop e rilascio delle risorse.

[NV] La pausa vera va implementata nello stato applicativo, fermando la pianificazione dopo un checkpoint e creando un nuovo lavoro alla ripresa.

[NV] Se una chiamata al modello già pagata è in volo, il default prudente è “finisci il passo, salva atomicamente, poi metti in pausa”, non buttare il risultato.

[DOC] In pausa non c'è lavoro foreground: fermare/demotare il servizio e sostituire la notifica ongoing con una notifica normale “Ricerca in pausa” con azione “Riprendi”.

[NV] Ogni passo deve avere journal, identificatore stabile, stato `IN_FLIGHT/COMMITTED`, checkpoint e chiave di idempotenza quando il provider la supporta.

## 1.5 Stati di caricamento

[DOC] Progress bar determinata se esiste un avanzamento reale misurabile; indicatore indeterminato se la durata è ignota; skeleton solo quando la struttura del contenuto è già nota.

[3P] Le linee guida Fluent correnti danno una soglia utile: sotto 1 secondo nessuna animazione, 1–3 secondi spinner, oltre 3 secondi barra o testo di stato; Android non pubblica una soglia numerica universale equivalente.

[NV] Una rinomina o cancellazione locale da 40 ms non deve mostrare spinner: bloccare i doppi invii, aggiornare la riga e mostrare errore/rollback solo se necessario.

[NV] Il progresso di un'azione di riga vive sulla riga o sul relativo controllo, non dentro un menu che dovrebbe chiudersi dopo la scelta.

[DOC] Il feedback non visivo va reso anche come stato ARIA; l'aptica è un rinforzo discreto, mai il solo canale e mai a ogni tick.

## 1.6 Rinominare

[UI] Le app Google usano entrambi i modelli: Files e Docs aprono un flusso “Rinomina”; Foto e Keep permettono la modifica diretta nella schermata di dettaglio.

[NV] Nella lista compatta di TALOS sceglierei menu → dialogo di rinomina; l'inline editing è più fragile con tastiera, scroll, overflow e fuoco.

[DOC] Il vuoto va bloccato con errore testuale; un limite lungo va dichiarato e annunciato; `aria-invalid` va impostato soltanto dopo che il valore è stato validato come errato.

[NV] I duplicati possono essere ammessi perché l'identità deve stare in un ID, non nel titolo; al massimo mostrare un avviso non bloccante.

[NV] Conservare `originalQuestion` immutabile e `displayTitle` modificabile, mostrando “Domanda originale” nei dettagli e offrendo “Ripristina titolo originale”.

---

# 2. Le prove

## 2.1 Tieni-premuto contro tre puntini

### 2.1.1 La regola corrente di Android

[DOC] La guida Android “Layouts and navigation patterns”, aggiornata il 17 giugno 2026, dice di collocare le azioni secondarie nella top bar o vicino al contenuto correlato e di mettere le azioni aggiuntive non immediate o non frequenti in un overflow menu.

[DOC] La stessa pagina illustra esplicitamente un'icona di overflow inline all'interno di un elemento di lista; è la prova più diretta e corrente per il caso TALOS. URL: https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns

[DOC] La documentazione Compose dei menu presenta il pattern standard come `IconButton` con tre punti verticali, descrizione accessibile “More options” e `DropdownMenu`. URL: https://developer.android.com/develop/ui/compose/components/menu

[DOC] Il valore della pagina Compose non è il codice da copiare in Vue, ma il pattern Android: controllo visibile, etichettato, ancorato al relativo contenuto e capace di aprire un menu.

[DOC] La guida Views distingue tre meccanismi: context menu attivato da touch-and-hold; contextual action mode per contenuto selezionato o selezione multipla; popup menu ancorato a una `View`, adatto anche a overflow relativo a una porzione di contenuto. URL: https://developer.android.com/develop/ui/views/components/menus

[DOC] La documentazione non formula una regola universale “mostra sempre sia tre puntini sia long-press”.

[NV] Dall'insieme delle guide deriva una regola più precisa: rendere visibile il percorso canonico; usare il long-press soltanto come gesto contestuale coerente e non come sostituto dell'affordance.

[DOC] Per dispositivi con mouse o trackpad, Android raccomanda che i menu contestuali da touch-and-hold rispondano anche al click secondario. URL: https://developer.android.com/develop/ui/views/touch-and-input/input-compatibility-on-large-screens

[DOC] La guida desktop Android dice analogamente di aprire il menu contestuale col click secondario, invece di richiedere un long-click. URL: https://developer.android.com/design/ui/desktop/guides/interaction/pointer-interactions

[NV] Un menu soltanto a long-press sarebbe quindi incompleto anche oltre l'accessibilità: su tablet, Chromebook e desktop Android non offre il comportamento atteso del puntatore senza lavoro aggiuntivo.

### 2.1.2 Scopribilità del long-press

[3P] GhostUI, paper CHI 2026 e preprint arXiv 2601.19258, tratta long-press e swipe come interazioni “nascoste” prive di indizi visivi e difficili da scoprire; nel dataset il long-press rappresenta 379 casi, circa il 19,3% delle interazioni nascoste annotate. URL: https://arxiv.org/abs/2601.19258

[3P] GhostUI non fornisce una percentuale sperimentale del tipo “X% degli utenti non trova il long-press” per una lista Android; documenta la classe di problema e la sua frequenza nei pattern raccolti.

[3P] Lo studio “Evaluating gesture user interfaces with scales for discoverability, learnability and social acceptability”, International Journal of Human-Computer Studies, 2024, propone misure sperimentali specifiche per scopribilità e apprendibilità dei gesti. DOI: 10.1016/j.ijhcs.2024.103242 — URL: https://www.sciencedirect.com/science/article/abs/pii/S1071581924000260

[3P] Lo studio del 2024 non è una misura specifica del long-press in un menu di riga Android; è utile perché conferma che la scopribilità deve essere misurata separatamente dall'efficienza dopo l'apprendimento.

[3P] “Modeling Mobile Interface Tappability Using Crowdsourcing and Deep Learning”, 2019, mostra che perfino la tappabilità di controlli visivi richiede segnali riconoscibili; il modello raggiunge precisione 90,2% e recall 87,0% sulle valutazioni aggregate. URL: https://arxiv.org/abs/1902.11247

[3P] La fonte del 2019 è più vecchia del limite richiesto, ma resta metodologicamente pertinente perché studia la percezione degli affordance visivi, non una versione superata di Android; non viene usata come prova della convenzione 2026.

[NV] Non ho trovato uno studio recente e forte che misuri direttamente quante persone scoprono, senza istruzioni, “tieni premuto per aprire il menu delle azioni di una riga”.

[NV] L'assenza di quel numero non rende neutra la scelta: un controllo visibile espone l'esistenza delle azioni, un gesto senza segno no.

### 2.1.3 Cosa fanno le cinque app Google

| App | Comportamento documentato | Conseguenza per TALOS |
|---|---|---|
| Gmail | [UI] La guida Android dice di toccare e tenere premuto un messaggio per selezionarlo; dopo la selezione si possono selezionare altri messaggi e usare le azioni contestuali. URL: https://support.google.com/mail/answer/7401?co=GENIE.Platform%3DAndroid&hl=en | [NV] Il long-press ha semantica di selezione, non di menu per la singola riga. |
| Gmail | [UI] Per altre azioni su un messaggio aperto, la guida rimanda al comando “More/Altro”. URL: https://support.google.com/mail/answer/7401?co=GENIE.Platform%3DAndroid&hl=en | [NV] Le azioni meno frequenti restano scopribili in un menu esplicito. |
| Google Drive | [UI] Le istruzioni dicono di toccare “More” accanto al file o alla cartella per operazioni come rimuovere, gestire o spostare. URL: https://support.google.com/drive/answer/2424384?co=GENIE.Platform%3DAndroid&hl=en | [NV] Il menu è ancorato visibilmente all'elemento. |
| Google Foto | [UI] La selezione multipla inizia tenendo premuta la prima foto, poi toccando le altre. URL: https://support.google.com/photos/answer/6220402?co=GENIE.Platform%3DAndroid&hl=en | [NV] Anche qui il long-press è selezione. |
| Files by Google | [UI] In vista elenco le istruzioni usano il pulsante “More” accanto al file; in vista griglia alcune operazioni iniziano con touch-and-hold e proseguono dal menu. URL: https://support.google.com/files/answer/9808835?hl=en | [NV] La rappresentazione può cambiare con il layout, ma la funzione resta disponibile tramite un comando esplicito dopo la selezione. |
| Google Keep | [UI] Le istruzioni per operazioni su più note iniziano con touch-and-hold di una nota e selezione delle successive. URL: https://support.google.com/keep/answer/6191044?co=GENIE.Platform%3DAndroid&hl=en | [NV] Il gesto è coerente con la selezione multipla delle altre app Google. |

[UI] Il confronto non prova che ogni versione, account o esperimento A/B presenti sempre la stessa disposizione; prova che le guide ufficiali correnti insegnano agli utenti una semantica coerente del long-press come selezione.

[NV] TALOS ha già la stessa semantica nelle liste Chat e Libreria; introdurre “menu” soltanto nella lista Ricerca spezzerebbe sia il modello interno sia il modello appreso dalle app Android comuni.

### 2.1.4 Decisione operativa per TALOS

[NV] Ogni riga deve avere un `button` overflow visibile, con area interattiva di almeno 48 × 48 dp lato Android e icona dei tre punti verticali.

[DOC] Android raccomanda target touch di almeno 48 dp; WCAG 2.5.8 richiede almeno 24 × 24 CSS px oppure una delle eccezioni di spaziatura/equivalenza. URL Android: https://developer.android.com/guide/topics/ui/accessibility/views/apps-views — URL W3C: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum

[NV] L'etichetta accessibile deve includere il contesto, per esempio “Altre azioni per Ricerca sul fotovoltaico”, non il generico “Altro” ripetuto senza distinzione.

[NV] Il tap sulla parte testuale della riga apre il rapporto o il dettaglio; il tap sui tre puntini apre il menu; le hit area non devono sovrapporsi.

[NV] Il long-press deve continuare a entrare in selezione multipla in tutte le liste TALOS.

[NV] Dopo il primo elemento selezionato, la UI passa a modalità contestuale con conteggio e azioni applicabili al gruppo; “Pausa/Riprendi” di gruppo va mostrato solo se la semantica su stati misti è definita.

[NV] Non aggiungerei anche “long-press apre lo stesso menu” in questa specifica app, perché il gesto è già occupato e l'acceleratore sarebbe ambiguo.

[NV] Il click destro su WebView desktop/Chromebook può aprire lo stesso menu dell'overflow soltanto se non interferisce con il menu del browser/WebView e viene testato con tastiera e puntatore.

---

## 2.2 Accessibilità vincolante

### 2.2.1 WCAG: cosa passa e cosa no

[DOC] WCAG 2.5.1 “Pointer Gestures” richiede un'alternativa a singolo puntatore senza percorso per gesti multipunto o basati su traiettoria; l'Understanding corrente cita il long-press come gesto a singolo puntatore. URL: https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html

[DOC] Quindi “long-press” non equivale automaticamente a violazione di 2.5.1.

[DOC] La guida W3C sulle modalità di input riconosce però che un'attivazione temporizzata come il long-press può essere difficile per persone con limitazioni motorie e raccomanda alternative. URL: https://www.w3.org/WAI/WCAG22/Understanding/input-modalities.html

[DOC] WCAG 2.1.1 richiede che tutta la funzionalità sia utilizzabile tramite interfaccia da tastiera senza dipendere da tempi specifici delle singole battute. URL: https://www.w3.org/TR/WCAG22/#keyboard

[DOC] La tecnica G202 applica questo requisito anche a menu e funzionalità contestuali. URL: https://www.w3.org/WAI/WCAG22/Techniques/general/G202

[DOC] WCAG 4.1.2 richiede nome, ruolo, stato e valore determinabili programmaticamente per componenti, inclusi quelli creati via script. URL: https://www.w3.org/TR/WCAG22/#name-role-value

[DOC] WCAG 2.5.8 fissa 24 × 24 CSS px come minimo AA, salvo spaziatura o altre eccezioni; 48 dp Android rimane il target progettuale più sicuro. URL: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum

[NV] Un menu soltanto a long-press tende quindi a fallire non perché il gesto sia proibito, ma perché manca una via visibile, attivabile con tastiera e semanticamente esposta.

### 2.2.2 TalkBack, long-click nativo e WebView

[DOC] Per una `View` Android con long-click nativo, TalkBack può annunciare l'azione come “Double tap and hold to long press”. URL: https://developer.android.com/guide/topics/ui/accessibility/views/principles-views

[DOC] Android permette di rinominare l'azione long-click con `ViewCompat.replaceAccessibilityAction(view, AccessibilityNodeInfoCompat.AccessibilityActionCompat.ACTION_LONG_CLICK, label, null)`. URL: https://developer.android.com/guide/topics/ui/accessibility/views/principles-views

[DOC] Android permette di aggiungere un'azione personalizzata a una `View` con `ViewCompat.addAccessibilityAction(view, label) { ... }`. URL: https://developer.android.com/guide/topics/ui/accessibility/views/principles-views

[DOC] Chromium documenta che Android WebView usa il motore Chrome e che `WebContentsAccessibilityImpl` espone il DOM/ARIA come albero di nodi virtuali tramite `AccessibilityNodeProvider`. URL: https://chromium.googlesource.com/chromium/src/+/HEAD/docs/accessibility/browser/android.md

[DOC] Chromium documenta inoltre che HTML, CSS e ARIA contribuiscono all'albero di accessibilità del contenuto web. URL: https://chromium.googlesource.com/chromium/src/+/HEAD/docs/accessibility/browser/how_a11y_works.md

[NV] `ViewCompat.addAccessibilityAction` applicato alla `WebView` aggiunge un'azione al wrapper nativo, non automaticamente un'azione distinta a ciascuna riga DOM virtuale.

[NV] Non ho trovato un'API Android pubblica e supportata che consenta a Capacitor di associare direttamente `AccessibilityActionCompat` a un singolo elemento DOM interno senza costruire un'integrazione nativa personalizzata.

[NV] Un rilevatore JavaScript basato su `pointerdown` + timer non va considerato automaticamente equivalente a `ACTION_LONG_CLICK` per TalkBack.

[NV] La soluzione primaria deve quindi essere un normale pulsante HTML nel DOM, che TalkBack possa raggiungere, nominare e attivare con doppio tap.

### 2.2.3 Pattern ARIA corretto per il menu di azioni

[DOC] APG “Menu Button Pattern” richiede che l'elemento di apertura abbia ruolo `button`, `aria-haspopup="menu"` o `true`, e che `aria-expanded` rifletta lo stato; `aria-controls` è opzionale ma utile. URL: https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/

[DOC] Il popup usa `role="menu"`; le azioni usano `role="menuitem"`; il focus viene gestito all'interno del menu invece di lasciare tutti gli item nel normale ordine di tabulazione.

[DOC] Enter e Space sul pulsante aprono il menu e portano il fuoco al primo elemento; freccia giù può fare lo stesso; Escape chiude e riporta il fuoco al pulsante. URL: https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/examples/menu-button-actions/

[DOC] Nel menu, frecce su/giù spostano il fuoco, Home/End raggiungono gli estremi, i caratteri possono attivare il typeahead, Enter/Space eseguono l'azione.

[DOC] APG avverte che gli esempi illustrano un pattern e devono essere testati con combinazioni reali di browser e tecnologie assistive, specialmente su mobile.

[NV] Per TALOS il markup di base può essere il seguente; gli ID devono essere unici e il nome accessibile deve includere il titolo della ricerca.

```html
<article class="research-row" aria-labelledby="research-title-42">
  <h3 id="research-title-42">Impatto delle pompe di calore</h3>

  <button
    id="research-actions-42"
    type="button"
    aria-label="Altre azioni per Impatto delle pompe di calore"
    aria-haspopup="menu"
    aria-expanded="false"
    aria-controls="research-menu-42">
    <span aria-hidden="true">⋮</span>
  </button>

  <ul
    id="research-menu-42"
    role="menu"
    aria-labelledby="research-actions-42"
    hidden>
    <li role="menuitem" tabindex="-1">Rinomina</li>
    <li role="menuitem" tabindex="-1">Metti in pausa</li>
    <li role="menuitem" tabindex="-1">Esporta</li>
    <li role="menuitem" tabindex="-1">Elimina</li>
  </ul>
</article>
```

[NV] In Vue è preferibile rappresentare ogni azione come componente realmente attivabile e centralizzare la navigazione roving-focus, invece di affidarsi soltanto a eventi `click` su elementi generici.

[NV] `aria-expanded` deve essere impostato a `true` soltanto quando il popup è aperto e riportato a `false` prima o durante la chiusura.

[NV] Il menu deve essere inserito in un layer che non venga tagliato da `overflow:hidden`, ma il rapporto logico col pulsante deve restare tramite ID e stato.

[NV] L'azione distruttiva può essere visivamente separata, ma continua a essere un `menuitem`; colore e icona non devono essere l'unico segnale di pericolo.

### 2.2.4 Gestione del fuoco, apertura e chiusura

[DOC] All'apertura tramite Enter, Space o tap assistito, APG porta il focus al primo item disponibile; il pulsante non resta il focus attivo dietro il menu.

[DOC] Escape chiude senza eseguire azioni e riporta il focus al pulsante di origine.

[DOC] Dopo un'azione non distruttiva che chiude il menu, il focus torna normalmente al pulsante di origine.

[NV] Dopo “Elimina”, il pulsante di origine non esiste più: il focus deve andare all'elemento successivo, oppure al precedente se era l'ultimo, oppure al titolo della lista se è rimasta vuota.

[NV] Dopo “Rinomina”, il focus entra nel campo del dialogo; alla chiusura torna al pulsante overflow della stessa riga e la sua etichetta deve riflettere il nuovo titolo.

[NV] Dopo “Pausa/Riprendi”, il focus può tornare al pulsante overflow e un `role="status"` deve annunciare il nuovo stato senza spostare il focus.

[NV] Il click/tap fuori dal menu può chiuderlo, ma non sostituisce Escape e non deve causare l'attivazione accidentale della riga sottostante.

[NV] Il tasto Back di Android, intercettato nel livello appropriato, deve prima chiudere il menu aperto, poi il dialogo, poi navigare indietro.

### 2.2.5 Checklist di test obbligatoria

[NV] Testare TalkBack su almeno una versione Android supportata minima e una corrente, con esplorazione al tocco, swipe avanti/indietro, doppio tap e doppio tap mantenuto.

[NV] Verificare che il pulsante venga annunciato con titolo distinto, ruolo di pulsante, disponibilità del menu e stato espanso/collassato.

[NV] Testare tastiera hardware: Tab, Shift+Tab, Enter, Space, Escape, frecce, Home, End e typeahead.

[NV] Testare Switch Access e Voice Access, perché una soluzione raggiungibile con TalkBack può comunque essere difficile con scansione o comandi vocali.

[NV] Testare font di sistema ingranditi e zoom WebView senza sovrapposizione tra titolo, stato e overflow.

[NV] Testare target 48 dp anche quando l'icona visiva è 24 dp, mantenendo distanza sufficiente dalla riga cliccabile.

[NV] Testare ChromeOS/mouse: click primario sul pulsante, click secondario se supportato, hover e focus visibile.

[NV] Testare che un aggiornamento di stato non annunci ripetutamente percentuali o fasi a ogni piccolo tick.

---

## 2.3 Conferma delle azioni distruttive

### 2.3.1 Dialogo prima o annulla dopo

[DOC] La documentazione Android corrente sugli Snackbar usa come caso tipico l'eliminazione di un messaggio seguita dall'azione “Undo”. URL Compose: https://developer.android.com/develop/ui/compose/components/snackbar

[DOC] La documentazione Views sugli Snackbar precisa che l'azione può offrire “Undo”, ma ricorda che lo Snackbar scompare automaticamente e può non essere visto; per operazioni importanti deve esistere un'altra via di recupero. URL: https://developer.android.com/develop/ui/views/notifications/snackbar/action

[DOC] Lo Snackbar è feedback breve e non bloccante; non è un archivio né una garanzia di recupero. URL: https://developer.android.com/develop/ui/views/notifications/snackbar

[DOC] La documentazione Android sui dialoghi li descrive come superfici modali che richiedono una decisione e include l'eliminazione di un file tra i casi di conferma. URL Compose: https://developer.android.com/develop/ui/compose/components/dialog

[DOC] La documentazione Views conferma che un dialogo interrompe il flusso per ottenere una decisione o informazione necessaria. URL: https://developer.android.com/develop/ui/views/components/dialogs

[DOC] La tecnica W3C G168 raccomanda di chiedere conferma quando un'azione non può essere annullata e di comunicare chiaramente sia l'azione sia le conseguenze. URL: https://www.w3.org/WAI/WCAG22/Techniques/general/G168

[DOC] Il tutorial W3C sulla validazione ricorda che, per azioni permanenti o critiche, gli utenti devono poter rivedere, correggere o confermare; WCAG 3.3.4 accetta reversibilità, controllo o conferma come protezioni alternative nei contesti coperti. URL: https://www.w3.org/WAI/tutorials/forms/validation/

[DOC] La vecchia guida Material 1 affermava esplicitamente che la conferma è superflua quando le conseguenze sono reversibili o trascurabili, mentre una cancellazione irreversibile richiede conferma. URL archiviato: https://m1.material.io/patterns/confirmation-acknowledgement.html

[DOC] La fonte Material 1 è antecedente al 2023 e non viene presentata come guida corrente; viene mantenuta perché il principio è coerente con le attuali pagine Android su Dialog/Snackbar e con W3C G168.

[NV] La regola operativa risultante non è “sempre dialogo” né “sempre undo”: è scegliere in base a reversibilità reale, gravità, portata e possibilità di recupero persistente.

### 2.3.2 Dati disponibili sul prevenire la perdita

[NV] Non ho trovato uno studio controllato recente e direttamente applicabile che confronti, per cancellazioni in app Android, il tasso di perdita dati tra dialogo di conferma e Undo/Snackbar.

[NV] Non è quindi corretto attribuire una superiorità quantitativa universale a uno dei due pattern.

[DOC] La documentazione offre invece una distinzione funzionale: il dialogo previene l'esecuzione prima dell'evento; l'Undo recupera dopo l'evento e dipende dalla visibilità e dalla durata dell'opportunità.

[NV] Un dialogo ripetuto su azioni frequenti e facilmente reversibili può produrre conferme automatiche; uno Snackbar effimero su una cancellazione permanente può invece essere perso o non percepito.

[NV] Per TALOS la domanda decisiva è quindi: esiste una copia recuperabile e per quanto tempo, non “quale componente è più moderno”.

### 2.3.3 Confronto con app reali

[UI] Google Keep sposta le note eliminate nel Cestino e le conserva per sette giorni prima dell'eliminazione definitiva. URL: https://support.google.com/keep/answer/6262765?co=GENIE.Platform%3DAndroid&hl=it

[UI] Google Drive sposta gli elementi nel Cestino e li elimina dopo 30 giorni; l'azione finale è distinta come eliminazione definitiva. URL: https://support.google.com/drive/answer/2375102?co=GENIE.Platform%3DAndroid&hl=it

[UI] Google Foto conserva nel Cestino gli elementi sottoposti a backup per 60 giorni e altri elementi per 30 giorni; lo svuotamento o l'eliminazione definitiva non è recuperabile. URL: https://support.google.com/photos/answer/6128858?co=GENIE.Platform%3DAndroid&hl=en

[UI] In questi prodotti la prima azione chiamata “elimina” è in realtà un soft delete con periodo di recupero.

[NV] Paragonare direttamente quella prima eliminazione alla cancellazione irreversibile di TALOS sarebbe fuorviante se TALOS non possiede un Cestino locale.

### 2.3.4 Matrice di decisione per TALOS

| Azione | Reversibilità reale | Pattern consigliato | Motivazione |
|---|---|---|---|
| Rimuovere una ricerca completata e spostarla in un Cestino locale | [NV] Alta entro una finestra dichiarata | [NV] Esecuzione immediata + Snackbar “Spostata nel Cestino — Annulla” | [NV] L'oggetto resta recuperabile anche dopo la scomparsa dello Snackbar. |
| Eliminare definitivamente rapporto e dossier | [NV] Nessuna | [NV] Dialogo preventivo | [DOC] W3C G168 copre azioni non annullabili. |
| Eliminare una ricerca fallita senza output né fonti | [NV] Bassa gravità, ma dipende da log/costi conservati | [NV] Undo oppure dialogo leggero in base ai dati presenti | [NV] La gravità è inferiore, ma il titolo e la cronologia possono avere valore. |
| Mettere in pausa un lavoro | [NV] Completamente reversibile | [NV] Nessun dialogo; feedback di stato | [NV] Confermare aggiungerebbe attrito senza proteggere dati. |
| Riprendere un lavoro | [NV] Può generare nuovi costi | [NV] Nessun dialogo se il costo è già spiegato e previsto; conferma solo per un nuovo budget eccezionale | [NV] La ripresa è l'azione attesa, ma non deve nascondere un salto di spesa. |
| Annullare dopo il checkpoint corrente | [NV] Conserva tutto ciò che è già committato | [NV] Dialogo se il lavoro non potrà essere ripreso | [NV] L'utente deve conoscere cosa resta e cosa non verrà completato. |
| Interrompere subito una chiamata in volo | [NV] Potenziale perdita di output già addebitato | [NV] Dialogo forte e descrizione del rischio | [NV] Costo e recuperabilità dipendono dal provider. |
| Esportare | [NV] Non distruttiva | [NV] Nessun dialogo; progress/status se necessario | [NV] Conferma solo per sovrascrivere un file esistente. |

### 2.3.5 Testo del dialogo di eliminazione

[DOC] Le linee guida storiche Material sui dialoghi raccomandano un titolo significativo, una domanda esplicita, conseguenze comprensibili e pulsanti con verbi specifici; la coerenza con W3C G168 rende ancora valido il principio. URL: https://m1.material.io/components/dialogs.html

[NV] Il titolo deve nominare l'oggetto, non usare il generico “Sei sicuro?”.

[NV] Copia consigliata quando non esiste Cestino:

> **Eliminare “Impatto delle pompe di calore”?**  
> Verranno eliminati definitivamente il rapporto e i 18 dossier delle fonti associati. Questa azione non può essere annullata.
>
> **Annulla** · **Elimina definitivamente**

[NV] Se il conteggio dei dossier non è disponibile, usare “tutti i dossier delle fonti associati” invece di inventare un numero.

[NV] Se alcune fonti sono condivise con altre ricerche e non verranno eliminate, il testo deve dirlo; non deve suggerire una portata maggiore di quella reale.

[NV] Il pulsante primario distruttivo deve chiamarsi “Elimina definitivamente”, non “OK”, “Sì” o “Continua”.

[NV] Il focus iniziale non deve essere collocato automaticamente sul pulsante distruttivo; in WebView, la scelta più prudente è il titolo/dialogo o “Annulla”, verificando il comportamento con TalkBack.

[NV] Il dialogo non deve chiudersi con tap esterno se ciò rende facile confermare o perdere il contesto accidentalmente; Escape/Back deve equivalere ad “Annulla”.

### 2.3.6 Conferma dell'annullamento di un lavoro in corso

[NV] Il denaro già speso non è, da solo, motivo per una conferma: è un costo sommerso che il dialogo non recupera.

[NV] La conferma è giustificata quando l'azione distrugge un risultato in volo, rende il lavoro non riprendibile o elimina checkpoint e fonti già archiviate.

[NV] Se “Annulla” significa soltanto “non avviare altri passi, conserva tutto il resto”, il dialogo può essere breve.

[NV] Se “Annulla ora” tenta di interrompere una richiesta al provider e potrebbe scartare una risposta già pagata, il dialogo deve dirlo esplicitamente.

[NV] Copia consigliata per arresto sicuro:

> **Annullare questa ricerca?**  
> TALOS terminerà il passaggio già in corso, salverà i risultati ricevuti e non avvierà altri passaggi. La ricerca non potrà essere ripresa.
>
> **Continua la ricerca** · **Annulla dopo questo passaggio**

[NV] Copia consigliata per interruzione immediata, soltanto se tecnicamente disponibile:

> **Interrompere subito?**  
> La risposta in corso potrebbe essere già stata addebitata e non venire salvata. I passaggi completati resteranno disponibili.
>
> **Torna indietro** · **Interrompi subito**

[NV] È preferibile esporre tre concetti distinti nella UI: “Metti in pausa”, “Annulla dopo il passaggio corrente” e, solo se necessario, “Interrompi subito”.

---

## 2.4 Fermare un lavoro lungo: pausa contro annullamento

### 2.4.1 Semantica da rendere visibile

[NV] “Pausa” significa: nessun nuovo passo viene iniziato, lo stato necessario a riprendere viene conservato, la ripresa continua dal checkpoint.

[NV] “Annulla” significa: il lavoro entra in uno stato terminale, non riparte e l'eventuale nuova esecuzione è una nuova operazione.

[NV] “Interrompi subito” significa: tentare di abortire anche l'operazione in volo, accettando che costo, output e stato remoto possano non essere recuperabili.

[NV] “Ferma dopo il passaggio corrente” significa: lasciare finire l'unità atomica, committarla e poi passare allo stato terminale o in pausa.

[UI] Chrome per Android documenta controlli separati “Pause” e “Cancel” durante un download. URL: https://support.google.com/chrome/answer/95759?co=GENIE.Platform%3DAndroid&hl=it-IT

[UI] Il modello del download conferma che pausa e annullamento non sono sinonimi; non prova però come gestire una chiamata a un modello già fatturata.

[UI] La guida ufficiale OpenAI Deep Research consente di seguire il progresso e interrompere la ricerca per rifinire il focus o le fonti; non documenta una semantica generale pausa/ripresa equivalente a un download. URL: https://help.openai.com/it-it/articles/10500283-deep-research

[UI] La guida Gemini Deep Research per Android dice che la ricerca può continuare in background e che l'app invia una notifica al completamento; non documenta un modello dettagliato di pausa vera. URL: https://support.google.com/gemini/answer/15719111?co=GENIE.Platform%3DAndroid&hl=it

[NV] Le app IA pubbliche non forniscono quindi, nelle guide trovate, un precedente sufficientemente preciso per la semantica costosa e locale di TALOS.

### 2.4.2 Cosa fa davvero WorkManager quando si cancella

[DOC] WorkManager permette di cancellare per ID, nome univoco o tag; un lavoro non ancora terminato passa a `CANCELLED` e la cancellazione si propaga ai dipendenti. URL: https://developer.android.com/develop/background-work/background-tasks/persistent/how-to/manage-work

[DOC] Se il worker è in esecuzione, WorkManager lo segnala come fermato e invoca il percorso di stop; il worker deve rilasciare risorse e cooperare controllando `isStopped()` o gestendo la cancellazione della coroutine/future.

[DOC] Un risultato restituito dopo che il worker è stato fermato viene ignorato da WorkManager.

[DOC] Gli stati documentati sono `ENQUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED` e `BLOCKED`; non esiste `PAUSED`. URL: https://developer.android.com/develop/background-work/background-tasks/persistent/how-to/states

[DOC] `CANCELLED` è terminale: non è possibile “riprendere” la stessa `WorkRequest` cancellata.

[DOC] WorkManager può gestire lavoro long-running e foreground notification, ma questo non aggiunge uno stato di pausa. URL: https://developer.android.com/develop/background-work/background-tasks/persistent/how-to/long-running

[DOC] WorkManager offre `createCancelPendingIntent(getId())` per collegare un'azione di notifica alla cancellazione del lavoro; è un'azione di cancel, non un'API di pausa.

[NV] Chiamare `cancelWorkById` quando l'utente preme “Pausa” sarebbe semanticamente sbagliato se l'app non ha prima salvato un checkpoint e predisposto una nuova esecuzione per la ripresa.

### 2.4.3 Modello di stato applicativo consigliato

[NV] Usare un ID logico stabile `researchId` separato dall'UUID della singola `WorkRequest`.

[NV] Modello minimo:

```text
QUEUED
  └─> RUNNING
        ├─> PAUSE_REQUESTED
        │     └─> PAUSED
        │            └─> RESUMING
        │                   └─> RUNNING
        ├─> CANCEL_REQUESTED
        │     └─> CANCELLED
        ├─> FAILED_RETRYABLE
        │     └─> QUEUED
        ├─> FAILED_FINAL
        └─> COMPLETED
```

[NV] `PAUSE_REQUESTED` è necessario perché la richiesta può arrivare mentre un passo atomico è in corso; mostra che l'intenzione è stata ricevuta ma la pausa sicura non è ancora raggiunta.

[NV] `RESUMING` distingue il ripristino del checkpoint dalla normale esecuzione e permette di mostrare errori di migrazione o corruzione prima di addebitare nuovi passi.

[NV] Un eventuale `PAUSED_SYSTEM` può distinguere la pausa richiesta dall'utente da una sospensione provocata da timeout, batteria, spazio o riavvio.

[NV] Il database locale cifrato è la fonte di verità dello stato; la notifica e la UI sono proiezioni, non autorità indipendenti.

[NV] Le transizioni devono essere transazionali e idempotenti, così che due tap su Pausa non producano due operazioni concorrenti.

### 2.4.4 Una pausa vera sopra WorkManager/foreground service

[NV] Quando l'utente chiede Pausa, impostare atomicamente `pauseRequested=true` e aggiornare subito la UI a “Pausa richiesta”.

[NV] Il motore non avvia un nuovo passo se vede `pauseRequested` prima della prenotazione del passo.

[NV] Se nessun passo è in volo, il motore salva il checkpoint, passa a `PAUSED`, termina il worker/servizio e aggiorna la notifica.

[NV] Se un passo è in volo, applicare la policy “drain then checkpoint”: attendere la risposta, validarla, salvarla, committare costi e fonti, poi passare a `PAUSED`.

[NV] La ripresa legge il checkpoint, verifica versione/schema e precondizioni, imposta `RESUMING`, crea una nuova `WorkRequest` o avvia un nuovo foreground service e torna a `RUNNING`.

[NV] La nuova esecuzione deve riusare `researchId` ma avere un nuovo `runAttemptId`, così log e diagnosi distinguono le sessioni.

[NV] Se il processo viene ucciso prima del commit, il journal del passo consente di capire se l'operazione era `IN_FLIGHT` e richiede riconciliazione.

### 2.4.5 Cosa fare a metà di una chiamata già pagata

[DOC] La guida Google Cloud Run sui retry raccomanda lavori idempotenti e checkpoint per riprendere senza ricominciare da zero; suggerisce identificatori univoci e verifica dell'output esistente. URL: https://docs.cloud.google.com/run/docs/jobs-retries?hl=it

[DOC] AWS Builders' Library raccomanda un identificatore di richiesta fornito dal client per rendere sicuri i retry e registrare atomicamente intenzione ed effetti. URL: https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/

[DOC] Il pattern Azure Async Request-Reply include stato cancellato, endpoint di cancellazione, compensazione degli effetti parziali e idempotency key per evitare lavori duplicati. URL: https://learn.microsoft.com/en-us/azure/architecture/patterns/asynchronous-request-reply

[DOC] Queste fonti sono architetture cloud, non prescrizioni Android; vengono usate per il problema generale di passi costosi, retry e idempotenza.

[NV] Per TALOS ogni passo dovrebbe registrare almeno:

```text
researchId
stepId
runAttemptId
inputHash
providerRequestId
idempotencyKey (se supportata)
state = NOT_STARTED | IN_FLIGHT | COMMITTED | UNKNOWN
startedAt
completedAt
estimatedCost / actualCost
outputArtifactId
sourceArtifactIds[]
error / reconciliationNote
```

[NV] Il passaggio da `IN_FLIGHT` a `COMMITTED` deve includere, nella stessa transazione locale o in un protocollo equivalente, output validato, fonti, metadati di costo e avanzamento del piano.

[NV] Non segnare il passo completato prima che gli artefatti siano durable; altrimenti una morte del processo può far saltare un passo senza averne conservato l'output.

[NV] Non avviare il passo successivo prima del commit del precedente; altrimenti una pausa può lasciare più richieste costose in volo.

[NV] Se il provider supporta cancellazione della connessione ma non garantisce l'annullamento della fatturazione, la UI non deve promettere “nessun costo”.

[NV] Se il provider supporta una chiave di idempotenza, riusare la stessa chiave per la riconciliazione/retry del medesimo passo; non riusarla per un passo semanticamente nuovo.

[NV] Se il provider non supporta idempotenza né recupero per request ID, uno stato locale `IN_FLIGHT` dopo crash è ambiguo: ritentare può duplicare il costo, saltare può perdere il risultato.

[NV] In quello stato ambiguo TALOS dovrebbe mostrare “Passaggio da verificare” e chiedere una decisione informata, oppure adottare una policy documentata di retry con tetto di costo.

[NV] La policy consigliata al tap su Pausa è quindi:

```text
1. Registra PAUSE_REQUESTED.
2. Impedisci la prenotazione di nuovi passi.
3. Se non c'è una richiesta in volo, committa il checkpoint e passa a PAUSED.
4. Se c'è una richiesta in volo già inviata, attendi la risposta entro un timeout sicuro.
5. Valida e salva atomicamente risposta, fonti, request ID e costo.
6. Passa a PAUSED e ferma il lavoro foreground.
7. Se la richiesta fallisce, salva l'esito e metti in pausa senza retry automatico.
```

[NV] Il punto 7 evita che una “pausa” richiesta dall'utente generi un nuovo tentativo e un nuovo possibile addebito.

### 2.4.6 Foreground service in pausa e limiti di tempo

[DOC] Un foreground service deve eseguire lavoro percepibile dall'utente e mostrare una notifica di stato. URL: https://developer.android.com/develop/background-work/services/fgs

[DOC] Una notifica di foreground service non può normalmente essere rimossa finché il servizio non viene fermato o rimosso dal foreground. URL: https://developer.android.com/develop/background-work/services

[DOC] `stopForeground()` rimuove il servizio dal foreground; il servizio può continuare brevemente come servizio normale, ma sarà soggetto ai limiti di background. URL: https://developer.android.com/develop/background-work/services/fgs/stop-fgs

[DOC] Su Android 15 e target compatibile, i foreground service `dataSync` e `mediaProcessing` condividono un limite totale di sei ore in 24 ore per tipo; allo scadere viene chiamato `onTimeout(int, int)` e l'app ha pochi secondi per fermarsi. Pagina aggiornata il 14 luglio 2026. URL: https://developer.android.com/develop/background-work/services/fgs/timeout

[DOC] Il conteggio è condiviso tra tutti i foreground service dello stesso tipo dell'app, non garantito per ogni singola ricerca.

[NV] Se una ricerca è davvero in pausa, non c'è lavoro utente-percepibile in corso: mantenere il foreground service attivo spreca quota e comunica falsamente attività.

[NV] Alla pausa completata, fermare il worker/foreground service e pubblicare una notifica normale separata, eventualmente mantenendo la notifica con `STOP_FOREGROUND_DETACH` prima dell'aggiornamento se l'implementazione lo richiede.

[NV] La corretta classificazione del tipo FGS per un agente IA locale che effettua chiamate di rete non è esplicitamente documentata; `dataSync` può sembrare plausibile, ma deve essere verificato contro la funzione effettiva e le policy Android/Play applicabili.

[NV] Non classificare il lavoro come `mediaProcessing` soltanto perché elabora testo o documenti: il nome del tipo non basta a dimostrarne l'idoneità.

[NV] `onTimeout()` deve salvare uno stato consistente, impedire nuovi passi, segnare una pausa/stop di sistema e chiamare `stopSelf()` entro la finestra prevista.

[NV] Il timeout non deve essere trattato come normale `FAILED` se il checkpoint è valido e la ricerca può essere ripresa.

### 2.4.7 Notifica durante esecuzione e pausa

[DOC] Android consente fino a tre action button nelle notifiche tramite `addAction()` e `PendingIntent`; le azioni essenziali devono comunque esistere nell'app perché potrebbero non essere visibili nella forma collassata. URL: https://developer.android.com/develop/ui/compose/notifications/create-notification

[DOC] La reference `Notification.Builder` conferma fino a tre azioni contestuali e raccomanda di non duplicare inutilmente l'azione principale del tap. URL: https://developer.android.com/reference/kotlin/android/app/Notification.Builder

[NV] Notifica durante `RUNNING`:

```text
Titolo: Ricerca approfondita in corso
Testo: Verifica delle fonti · passaggio 4 di 9
Progresso: determinato solo se 4/9 è un denominatore stabile
Azioni: Metti in pausa · Annulla
Tap: apre il dettaglio della ricerca
```

[NV] Notifica durante `PAUSE_REQUESTED`:

```text
Titolo: Pausa della ricerca in corso
Testo: Salvataggio del passaggio attuale…
Azioni: Apri
```

[NV] Notifica durante `PAUSED`:

```text
Titolo: Ricerca in pausa
Testo: 4 passaggi completati · risultati salvati
Azioni: Riprendi · Annulla
Tap: apre il dettaglio e il riepilogo dei costi
```

[NV] La notifica `PAUSED` non deve essere una notifica foreground se il servizio è stato realmente fermato.

[NV] “Riprendi” può avviare una nuova esecuzione soltanto dopo controllo di connettività, spazio, stato delle chiavi e budget applicabile.

[NV] Se la ripresa richiede una scelta complessa o un nuovo consenso di costo, l'azione di notifica deve aprire l'app invece di avviare silenziosamente il lavoro.

[NV] Tutti i `PendingIntent` devono essere univoci per `researchId` e protetti contro l'applicazione dell'azione alla ricerca sbagliata.

### 2.4.8 Errori e casi limite

[NV] Se l'utente preme Pausa due volte, la seconda richiesta è idempotente e non crea un secondo checkpoint.

[NV] Se preme Riprendi mentre il passaggio a `PAUSED` non è ancora completato, mettere in coda l'intenzione o mostrare “Pausa in completamento”, senza avviare un secondo motore.

[NV] Se elimina la ricerca mentre un passo è in volo, prima portare il motore a una condizione terminale sicura; non cancellare i record necessari alla riconciliazione finché l'operazione remota è ambigua.

[NV] Se il dispositivo si riavvia, ricostruire lo stato dal journal e non dalla sola presenza della notifica.

[NV] Se manca spazio durante il commit, non segnare il passo completato e non procedere al successivo; conservare metadati sufficienti a spiegare l'incertezza.

[NV] Se la chiave dell'archivio non è disponibile dopo riavvio, mantenere la ricerca bloccata e richiedere sblocco esplicito prima di riprendere o riconciliare.

[NV] Se cambia la versione del piano/agente, una ripresa deve usare una migrazione esplicita o continuare con la versione originale; non reinterpretare silenziosamente checkpoint già pagati.

---

## 2.5 Stati di caricamento

### 2.5.1 Spinner, barra e skeleton: ciò che è documentato

[DOC] Android distingue progress indicator determinati, quando si può mostrare quanto del lavoro è stato completato, e indeterminati, quando il tempo o l'avanzamento non sono noti. Pagina aggiornata il 14 luglio 2026. URL: https://developer.android.com/develop/ui/compose/components/progress

[DOC] La reference Android `ProgressBar` raccomanda di mostrare il progresso in modo non interruttivo dentro la UI o una notifica, usando la modalità determinata quando l'avanzamento è noto e indeterminata quando non lo è. URL: https://developer.android.com/reference/android/widget/ProgressBar.html

[DOC] Le pagine Android correnti trovate non fissano una soglia universale in millisecondi per decidere quando far comparire un indicatore.

[3P] Fluent 2 “Wait UX” indica: meno di un secondo, nessuna animazione; tra uno e tre secondi, spinner; oltre tre secondi, progress bar o testo che descrive lo stato. URL: https://fluent2.microsoft.design/wait-ux

[3P] Fluent 2 Spinner raccomanda lo spinner per compiti superiori a un secondo e una label quando l'attesa supera circa tre secondi. URL: https://fluent2.microsoft.design/components/web/react/core/spinner/usage

[3P] Fluent 2 Android Progress Indicator dice di usare indicatori soltanto per compiti superiori a un secondo, di preferire il determinato quando possibile e di usare shimmer/skeleton quando la struttura è nota e il caricamento non blocca l'intera esperienza. URL: https://fluent2.microsoft.design/components/android/core/progressindicator/usage

[3P] Fluent 2 Skeleton limita il pattern a contenuti con struttura prevedibile e caricamento graduale superiore a un secondo; non lo propone per processi lunghi senza forma di contenuto. URL: https://fluent2.microsoft.design/components/web/react/core/skeleton/usage

[3P] Carbon Design System associa lo skeleton al caricamento iniziale di contenitori noti come liste, tabelle e card e sconsiglia skeleton in menu e modali. URL: https://carbondesignsystem.com/patterns/loading-pattern/

[3P] Carbon usa una regola diversa per alcune durate, includendo una preferenza per loading indicator su attese brevi e progress bar su lavori più lunghi; ciò dimostra che le soglie numeriche sono convenzioni di design system, non legge percettiva unica. URL: https://carbondesignsystem.com/components/progress-bar/usage/

[3P] SAP Fiori for Android usa skeleton quando il layout finale è noto e il caricamento supera approssimativamente un secondo. URL: https://www.sap.com/design-system/fiori-design-android/ui-elements/patterns/skeleton-loading/usage

[NV] Per TALOS le soglie Fluent sono una base ragionevole di prodotto, ma devono essere validate su dispositivi reali e non etichettate come raccomandazione Material.

### 2.5.2 Tabella decisionale

| Situazione | Indicatore | Posizione | Regola TALOS |
|---|---|---|---|
| Apertura lista da DB locale, attesa tipica 40–200 ms | [NV] Nessuno | [NV] Nessuna | [NV] Mostrare subito il contenuto precedente o la lista quando pronta; evitare lampeggio. |
| Apertura lista, struttura nota, oltre ~1 s | [3P] Skeleton | [NV] Nell'area delle righe | [NV] Stesso numero approssimativo di righe, senza simulare dati testuali reali. |
| Rinomina locale atomica | [NV] Nessuno sotto ~1 s | [NV] Campo/dialogo o riga | [NV] Disabilitare Salva durante il commit; mostrare stato soltanto se l'attesa supera la soglia. |
| Cancellazione con DB e file locali | [NV] Nessuno se immediata; inline se lenta | [NV] Riga interessata | [NV] Non tenere il menu aperto con spinner; chiuderlo e rendere la riga occupata. |
| Esportazione di durata ignota | [DOC] Indeterminato + testo | [NV] Schermata/dialogo non modale o notifica | [NV] Mostrare fase e destinazione, con Annulla se realmente supportato. |
| Esportazione con byte totali noti | [DOC] Progress bar determinata | [NV] Schermata e notifica | [NV] Percentuale derivata dai byte scritti, non da un timer. |
| Ricerca lunga con N passi stabili | [DOC] Determinata | [NV] Riga, dettaglio e notifica | [NV] “4 di 9” solo se il piano non aggiunge passi dinamicamente. |
| Ricerca lunga con piano adattivo | [DOC] Indeterminata | [NV] Riga/dettaglio/notifica | [NV] Mostrare fase, attività corrente, tempo trascorso e costi, non una percentuale finta. |
| Aggiornamento di molte righe | [DOC] `aria-busy` sul contenitore | [NV] Lista | [NV] Aggregare gli annunci e riportare `aria-busy=false` alla fine. |

### 2.5.3 Azioni di riga che toccano il disco

[NV] Al tap su “Rinomina”, chiudere il menu e aprire il dialogo; il menu non è il luogo in cui mostrare il progresso della scrittura.

[NV] Dopo “Salva”, disabilitare il pulsante e prevenire invii duplicati fino alla conclusione della transazione.

[NV] Se la scrittura termina prima della soglia di visualizzazione, aggiornare titolo e nome accessibile senza mostrare spinner.

[NV] Se supera circa un secondo, mostrare un piccolo indicatore e testo “Salvataggio…” nel dialogo o sulla riga, mantenendo leggibile il titolo.

[NV] Se fallisce, mantenere il dialogo aperto o ripristinare il titolo precedente e mostrare un errore vicino al controllo; non far sparire il dato inserito.

[NV] Al tap su “Elimina” confermato, il menu e il dialogo si chiudono; la riga può passare a stato occupato “Eliminazione…” se l'operazione non è istantanea.

[NV] Se la cancellazione è implementata come transazione logica più pulizia file asincrona, rimuovere la riga soltanto quando il soft-delete è durable; la pulizia fisica può continuare in background con retry.

[NV] Se la pulizia fisica fallisce ma l'oggetto è già nel Cestino, non reinserire silenziosamente la riga nella lista attiva; registrare il debito di pulizia e ritentare.

[NV] Se non esiste Cestino e la cancellazione fisica fallisce a metà, il database deve conservare uno stato recuperabile e non far apparire l'operazione come completata.

### 2.5.4 Evitare il lampeggio

[3P] La soglia Fluent di un secondo offre un modo documentato per non mostrare animazioni su operazioni che si risolvono rapidamente.

[NV] Implementazione consigliata: programmare la comparsa dell'indicatore dopo 800–1000 ms e annullare il timer se l'operazione finisce prima.

[NV] Non ho trovato in Android/Material 3 corrente un minimo ufficiale di permanenza dello spinner una volta apparso.

[3P] Carbon v10 documentava una permanenza di 1,5 secondi per lo stato di successo dell'inline loading; non è una regola generale sulla durata minima di uno spinner e non va trasferita automaticamente. URL: https://v10.carbondesignsystem.com/components/inline-loading/usage/

[NV] Se un indicatore è apparso, una permanenza minima di circa 400–600 ms può ridurre il flash percettivo, ma è una scelta di prodotto non verificata da una norma Android.

[NV] Una soluzione ancora migliore per operazioni locali è evitare l'indicatore: usare aggiornamento immediato, stato disabilitato breve e rollback in caso di errore.

[NV] L'ottimismo è appropriato soltanto se il rollback non espone dati inconsistenti e se l'azione non viene comunicata come definitivamente riuscita prima del commit.

### 2.5.5 Progresso accessibile nella WebView

[DOC] WCAG 4.1.3 richiede che i messaggi sul risultato, lo stato dell'applicazione, il progresso o gli errori siano determinabili programmaticamente senza ricevere focus. URL: https://www.w3.org/WAI/WCAG22/Understanding/status-messages

[DOC] W3C indica `role="status"` come tecnica per messaggi consultivi; il ruolo implica `aria-live="polite"` e `aria-atomic="true"`. URL: https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA22

[DOC] Un progressbar determinato usa `aria-valuemin`, `aria-valuemax` e `aria-valuenow`; per uno stato indeterminato `aria-valuenow` va omesso. URL: https://www.w3.org/WAI/ARIA/apg/practices/range-related-properties/

[DOC] `aria-busy="true"` indica che un contenitore è in aggiornamento e può far aggregare le modifiche alle tecnologie assistive; deve tornare a `false` al termine. URL: https://www.w3.org/TR/wai-aria/#aria-busy

[DOC] La tecnica W3C F103 considera un possibile fallimento la presenza di messaggi dinamici di stato non esposti con `status`, `alert`, `log`, `aria-live` o meccanismo equivalente. Pagina aggiornata il 9 marzo 2026. URL: https://www.w3.org/WAI/WCAG22/Techniques/failures/F103.html

[DOC] `ariaNotify`, aggiunto alle tecniche W3C nel 2026, è ancora sperimentale e deve essere soltanto un progressive enhancement accanto a una live region più affidabile. URL: https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA27

[NV] Esempio per una ricerca con progresso determinato:

```html
<div
  role="progressbar"
  aria-label="Avanzamento della ricerca Impatto delle pompe di calore"
  aria-valuemin="0"
  aria-valuemax="9"
  aria-valuenow="4"
  aria-valuetext="4 passaggi completati su 9">
</div>
<div role="status" aria-live="polite">Verifica delle fonti in corso</div>
```

[NV] Gli aggiornamenti pronunciati devono essere limitati a cambi di fase o traguardi significativi; annunciare ogni punto percentuale renderebbe TalkBack inutilizzabile.

[NV] Per un piano adattivo, omettere `aria-valuenow` e usare un testo utile come “Confronto delle fonti in corso, 6 fonti archiviate”.

[NV] Non spostare il focus su spinner, Snackbar o testo di stato; il ruolo live deve comunicare senza interrompere il controllo dell'utente.

### 2.5.6 Feedback aptico

[DOC] Android raccomanda “less is more”: l'aptica è adatta a confermare cambi di stato discreti, ma un uso eccessivo riduce significato e comfort. Pagina corrente 2026. URL: https://developer.android.com/develop/ui/views/haptics/haptics-principles

[DOC] Android preferisce `View.performHapticFeedback()` e costanti semantiche; `CONFIRM` rappresenta una conferma breve/leggera e `REJECT` un rifiuto più evidente, rispettando le impostazioni di sistema. URL: https://developer.android.com/develop/ui/views/haptics/haptic-feedback

[DOC] Le costanti includono `CONFIRM`, `REJECT`, `LONG_PRESS` e `CONTEXT_CLICK`. URL: https://developer.android.com/reference/android/view/HapticFeedbackConstants

[DOC] Capacitor espone il plugin ufficiale `@capacitor/haptics` con `impact`, `notification`, `vibrate` e gli eventi di selezione; `NotificationType.Success`, `Warning` ed `Error` esprimono esiti. URL principale del runtime: https://capacitorjs.com/docs — API Haptics indicizzata: https://capacitorjs.jp/docs/apis/haptics

[DOC] La documentazione ufficiale Capacitor afferma che sui dispositivi senza motore aptico o vibratore le chiamate si risolvono senza produrre effetto.

[NV] Per TALOS usare aptica leggera quando una pausa diventa effettiva, una rinomina viene salvata o un'azione fallisce; non al semplice apertura del menu, a ogni passo o a ogni aggiornamento della barra.

[NV] La cancellazione definitiva non deve affidarsi a vibrazione come avvertimento: testo, ruolo, conseguenze e conferma restano necessari.

[NV] `Haptics.notification({ type: NotificationType.Success })` è adatto a un completamento esplicito; per operazioni invisibili e rapidissime può essere superfluo.

[NV] Rispettare sempre le impostazioni del dispositivo e non tentare di “compensare” l'aptica disattivata con vibrazioni forzate.

---

## 2.6 Rinominare in una lista

### 2.6.1 Dialogo o modifica sul posto

[UI] Files by Google documenta: aprire “More” accanto al file, scegliere “Rename”, inserire il nuovo nome e confermare. URL: https://support.google.com/files/answer/9746888?hl=it

[UI] Google Docs, Fogli e Presentazioni su Android documentano un flusso analogo “More” → “Rename” → nome → OK. URL: https://support.google.com/docs/answer/49114?co=GENIE.Platform%3DAndroid&hl=IT

[UI] Google Foto permette di aprire un album, toccarne il titolo e modificarlo direttamente nella schermata di dettaglio. URL: https://support.google.com/photos/answer/6128849?co=GENIE.Platform%3DAndroid&hl=it-IT

[UI] Google Keep rende il titolo della nota direttamente modificabile quando la nota è aperta. URL: https://support.google.com/keep/answer/2888246?co=GENIE.Platform%3DAndroid&hl=it

[UI] Le app reali non applicano una regola assoluta: il comando “Rinomina” è comune per oggetti in una lista/file browser; l'editing inline è comune quando il titolo è contenuto primario della schermata di dettaglio.

[NV] La lista Ricerca di TALOS assomiglia più a un browser di oggetti che a un editor di documenti; menu → dialogo è quindi il default più stabile.

[NV] L'editing inline nella riga può diventare appropriato su tablet o modalità list-detail se la riga resta stabile, c'è spazio, il campo non viene virtualizzato fuori vista e il comportamento tastiera è testato.

[NV] Non usare un dialogo se l'utente è già nella schermata di dettaglio e il titolo è un elemento chiaramente editabile: lì il tap sul titolo può essere più diretto.

### 2.6.2 Flusso consigliato del dialogo

[NV] Aprendo “Rinomina”, inizializzare il campo col `displayTitle` corrente e selezionare il testo, senza cancellarlo preventivamente.

[NV] Usare un `label` visibile “Titolo della ricerca”, non soltanto placeholder.

[NV] Usare un campo a riga singola; Enter/azione IME “Fine” equivale a Salva soltanto se il valore è valido.

[NV] “Salva” è disabilitato quando il valore, dopo trim, è vuoto o identico al titolo corrente.

[NV] “Annulla”, Escape e Back chiudono senza cambiare il titolo.

[NV] Dopo successo, chiudere il dialogo, aggiornare riga, accessibile name del pulsante overflow e dettagli; riportare il focus al pulsante overflow.

[NV] Dopo errore di persistenza, mantenere testo e focus nel dialogo e mostrare il messaggio associato al campo o allo stato del dialogo.

### 2.6.3 Nome vuoto

[DOC] W3C raccomanda validazione testuale comprensibile e supporta vincoli nativi come `required` e `maxlength`; l'errore deve essere identificato e descritto. URL: https://www.w3.org/WAI/tutorials/forms/validation/

[DOC] WCAG 3.3.1 richiede che un errore di input rilevato venga identificato e descritto in testo. Pagina Understanding aggiornata il 9 marzo 2026. URL: https://www.w3.org/WAI/WCAG22/Understanding/error-identification

[DOC] La tecnica ARIA21 indica di applicare `aria-invalid="true"` quando la validazione ha determinato che il campo è errato, non preventivamente. URL: https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA21

[NV] Normalizzare gli spazi iniziali e finali; una stringa composta soltanto da spazi è vuota.

[NV] Messaggio consigliato: “Inserisci un titolo”.

[NV] Collegare l'errore al campo con `aria-describedby` o meccanismo equivalente e portare il focus sul campo quando l'utente tenta di salvare.

[NV] Non sostituire silenziosamente il vuoto con “Senza titolo” durante la rinomina: l'utente ha scelto un'azione esplicita e deve sapere cosa è stato salvato.

### 2.6.4 Nome duplicato

[NV] Un duplicato non è necessariamente un errore: due ricerche diverse possono avere la stessa domanda o la stessa etichetta, e l'identità tecnica deve essere `researchId`.

[NV] Bloccare i duplicati può costringere a titoli artificiali e trasmettere una falsa unicità semantica.

[NV] Consiglio: consentire il duplicato e, se utile, mostrare un avviso non bloccante “Esiste già una ricerca con questo titolo”.

[NV] Nell'elenco, distinguere elementi omonimi con data, stato, durata o breve estratto della domanda originale.

[NV] Se un vincolo esterno rende il nome univoco, dichiararlo prima del salvataggio e proporre una correzione; non aggiungere automaticamente suffissi invisibili.

### 2.6.5 Nome molto lungo

[DOC] Material 3 `TextField` per Compose espone supporting text, stato di errore e indicatori/limiti di caratteri; il concetto è trasferibile al campo web, non il codice Compose. URL: https://developer.android.com/reference/kotlin/androidx/compose/material3/TextField.composable

[DOC] HTML `maxlength` può imporre un limite tecnico e il messaggio/contatore deve restare accessibile.

[NV] Non esiste nelle fonti trovate un limite Android universale per il titolo di una ricerca.

[NV] Scegliere il limite dal modello dati e dai casi d'uso; una proposta ragionevole è 120 grafemi Unicode, ma è una decisione TALOS, non una norma.

[NV] Contare grafemi e non byte o semplici code unit, per non penalizzare emoji e caratteri composti.

[NV] Mostrare il contatore soltanto vicino al limite, per esempio dagli ultimi 20 caratteri, e annunciarlo senza rendere la live region verbosa a ogni battuta.

[NV] Nella lista usare massimo due righe con ellissi visiva; nella schermata di dettaglio mostrare il titolo completo.

[NV] L'accessible name del pulsante “Altre azioni” può usare una versione completa ma deve restare conciso; per titoli enormi è utile includere un identificatore contestuale più breve.

### 2.6.6 Etichetta modificabile sopra un fatto immutabile

[NV] Separare nel modello:

```ts
interface ResearchIdentity {
  researchId: string;
  originalQuestion: string;  // immutabile dopo la creazione
  displayTitle: string;      // modificabile dall'utente
  titleOrigin: 'generated' | 'custom' | 'restored';
  titleUpdatedAt: string | null;
}
```

[NV] `originalQuestion` resta il fatto storico usato per avviare la ricerca; `displayTitle` è un'etichetta di organizzazione.

[NV] La rinomina non deve modificare prompt, piano, hash degli input, riferimenti delle fonti o provenienza del rapporto.

[NV] Nel dettaglio mostrare una sezione “Domanda originale” non editabile; quando il titolo è personalizzato, mostrare una piccola indicazione “Titolo personalizzato”.

[NV] Offrire “Ripristina titolo originale” nel menu o nell'editor, senza dialogo distruttivo perché l'operazione è reversibile con Annulla o nuovo rename.

[NV] Se il titolo iniziale è una versione abbreviata/generata e non la domanda letterale, conservare separatamente anche `generatedTitle`; non chiamare “originale” qualcosa che non era la domanda.

[NV] In esportazione includere sia titolo visualizzato sia domanda originale, con etichette distinte, per evitare che il rename alteri la tracciabilità.

[NV] Non ho trovato una linea guida Android/Material specifica per “etichetta modificabile sopra un fatto immutabile generato”; questa è una soluzione di information architecture derivata dal dominio TALOS.

[NV] Le app trovate mostrano esempi di titoli modificabili, ma non documentano la conservazione visibile del prompt che ha generato il titolo.

### 2.6.7 Markup accessibile del campo

[NV] Esempio minimo:

```html
<form aria-labelledby="rename-heading" @submit.prevent="saveRename">
  <h2 id="rename-heading">Rinomina ricerca</h2>

  <label for="rename-title">Titolo della ricerca</label>
  <input
    id="rename-title"
    v-model="draftTitle"
    type="text"
    required
    maxlength="120"
    :aria-invalid="titleError ? 'true' : 'false'"
    :aria-describedby="titleError ? 'rename-error rename-count' : 'rename-count'" />

  <p v-if="titleError" id="rename-error">{{ titleError }}</p>
  <p id="rename-count">{{ graphemeCount }} di 120 caratteri</p>

  <button type="button" @click="closeRename">Annulla</button>
  <button type="submit" :disabled="!canSave">Salva</button>
</form>
```

[NV] Se il contenitore è un dialogo custom, applicare il pattern APG Dialog Modal completo, incluso focus trap, nome accessibile e ritorno del focus; preferire `<dialog>` soltanto dopo test nell'insieme di WebView supportate.

[DOC] Pattern APG Dialog Modal: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/

---

# 3. Tabella dei conflitti e delle apparenti contraddizioni

| Tema | Fonte/posizione A | Fonte/posizione B | Quale prevale per TALOS | Motivo |
|---|---|---|---|---|
| Long-press | [DOC] Android Views ammette context menu da touch-and-hold. | [DOC] Android Design 2026 illustra overflow inline per azioni aggiuntive; app Google usano long-press per selezione. | [NV] Overflow visibile + long-press selezione. | [NV] Il gesto è già occupato e la via visibile serve a scoperta, tastiera e AT. |
| “Entrambi” | [NV] Duplicare menu su tap e long-press può accelerare utenti esperti. | [UI] Nelle app osservate il long-press spesso cambia modalità in selezione, non duplica l'overflow. | [NV] Non duplicare in TALOS. | [NV] Coerenza interna e prevenzione di un gesto ambiguo prevalgono sul piccolo guadagno di velocità. |
| WCAG 2.5.1 | [DOC] Le interazioni gestuali complesse richiedono alternativa. | [DOC] Il long-press è un gesto a singolo puntatore e non è vietato da 2.5.1. | [DOC] Non dichiarare una violazione automatica di 2.5.1. | [DOC] La criticità concreta è 2.1.1/4.1.2 e l'assenza di un controllo accessibile. |
| Target | [DOC] WCAG AA minimo 24 CSS px o eccezioni. | [DOC] Android raccomanda almeno 48 dp. | [NV] Progettare 48 dp. | [NV] È più robusto su touch e soddisfa più facilmente il minimo WCAG. |
| Conferma | [DOC] Snackbar + Undo è esempio Android corrente. | [DOC] Dialog è esempio Android per decisioni/eliminazione; W3C G168 copre azioni irreversibili. | [NV] Undo con Cestino; dialogo senza recupero. | [NV] Le fonti descrivono condizioni diverse, non vere raccomandazioni contraddittorie. |
| Material vecchio | [DOC] Material 1 contiene regole testuali molto esplicite su reversibilità. | [DOC] È una fonte archiviata e non rappresenta Material 3 corrente. | [NV] Usarla solo come corroborazione. | [NV] La decisione si fonda su Android 2026 e W3C; la pagina storica serve a chiarire il principio. |
| Pausa WorkManager | [DOC] WorkManager cancella e ferma cooperativamente. | [NV] Il prodotto vuole pausa riprendibile. | [NV] Stato applicativo + nuova WorkRequest alla ripresa. | [DOC] `CANCELLED` è terminale e non esiste `PAUSED`. |
| Pausa a metà chiamata | [NV] Abortire subito sembra più fedele alla parola “pausa”. | [DOC] Pattern idempotenti/checkpoint favoriscono conservazione dell'unità completata; la chiamata può essere già addebitata. | [NV] Drain then checkpoint come default. | [NV] Minimizza costo sprecato e ambiguità; hard stop resta opzione esplicita. |
| FGS in pausa | [NV] Tenere il servizio facilita una ripresa immediata. | [DOC] FGS comunica lavoro attivo ed è soggetto a quota/timeout. | [NV] Fermare FGS e usare notifica normale. | [NV] In vera pausa non c'è lavoro foreground da giustificare. |
| Spinner breve | [3P] Fluent: niente animazione sotto 1 s. | [3P] Carbon usa soglie e componenti non identici. | [NV] Delay di circa 1 s, da testare. | [NV] Non esiste una soglia Android ufficiale; si adotta una convenzione esplicita e misurabile. |
| Minimo di permanenza | [NV] Molte pratiche UX suggeriscono un minimo per evitare flash. | [DOC] Android/Material corrente non documenta un numero universale. | [NV] Nessun numero presentato come norma; eventuali 400–600 ms sono scelta TALOS. | [NV] Evita falsa precisione. |
| Skeleton | [3P] Fluent/Carbon/SAP lo usano con layout noto. | [NV] Può sembrare più moderno di uno spinner anche quando il contenuto è ignoto. | [NV] Solo caricamento iniziale di lista/card note. | [3P] Le guide convergono sulla prevedibilità della struttura. |
| Rinomina | [UI] Files/Docs usano comando e dialogo/flusso dedicato. | [UI] Foto/Keep consentono editing diretto nel dettaglio. | [NV] Dialogo dalla lista; inline nel dettaglio. | [NV] Il contesto, non una regola assoluta, determina il pattern. |
| Duplicati | [NV] Alcuni file system impongono unicità nel contenitore. | [NV] Una ricerca ha ID stabile e il titolo è etichetta. | [NV] Consentire duplicati. | [NV] Non esiste necessità tecnica di unicità nel modello proposto. |
| Aptica | [DOC] Android consente feedback semantico. | [DOC] Android raccomanda uso parsimonioso e rispetto impostazioni. | [NV] Solo cambi di stato discreti. | [NV] L'aptica rinforza ma non sostituisce feedback visivo/uditivo. |
| ARIA menu | [DOC] APG specifica `menu`/`menuitem` e roving focus. | [NV] Un semplice elenco di normali button è spesso più facile da implementare. | [NV] Usare il pattern menu solo se implementato e testato integralmente; altrimenti un popover di button semanticamente semplice può essere più robusto. | [NV] ARIA complessa senza tastiera completa è peggiore di HTML semplice corretto. |

---

# 4. Cosa faresti tu al mio posto — dieci righe operative

1. [NV] Metterei un pulsante overflow visibile da 48 dp in ogni riga e manterrei il long-press esclusivamente per la selezione multipla in tutte le liste TALOS.
2. [NV] Implementerei il popup come menu button HTML accessibile, con nome contestuale, tastiera completa, Escape/Back e ritorno del focus verificato con TalkBack nella WebView reale.
3. [NV] Separerei `originalQuestion` immutabile da `displayTitle` modificabile e farei la rinomina in un dialogo dalla lista, mostrando la domanda originale nel dettaglio.
4. [NV] Introdurrei un Cestino locale cifrato; fino ad allora userei un dialogo prima di eliminare rapporto e dossier, nominando oggetto, portata e irreversibilità.
5. [NV] Modellerei pausa e annullamento come stati diversi nel database, con `PAUSE_REQUESTED`, `PAUSED` e `CANCELLED`, senza fingere che WorkManager possieda una pausa nativa.
6. [NV] Suddividerei la ricerca in passi atomici con journal, input hash, request ID, costo e checkpoint; alla pausa lascerei finire e committerei una chiamata già inviata.
7. [NV] Alla ripresa creerei un nuovo worker/servizio sullo stesso `researchId`; in pausa fermerei il foreground service e mostrerei una notifica normale con “Riprendi”.
8. [NV] Non mostrerei indicatori per operazioni locali sotto circa un secondo; userei skeleton solo per strutture note e percentuali solo quando il denominatore è autentico.
9. [NV] Annuncerei esiti e fasi con `role="status"`/progressbar ARIA, usando aptica leggera soltanto per completamenti, pausa effettiva o errori discreti.
10. [NV] Prima del rilascio eseguirei test di stato e costo su crash, riavvio, doppio tap, timeout FGS, rete persa e chiamata `IN_FLIGHT`, oltre a TalkBack, tastiera, Switch Access e Voice Access.

---

# 5. Cosa non sono riuscito a trovare

[NV] Non ho trovato una regola Material Design 3 testuale che dica letteralmente “per ogni azione di riga mostra sia overflow sia long-press”; la guida Android corrente mostra l'overflow inline, mentre il long-press è documentato come context menu o selezione contestuale.

[NV] Non ho trovato un dato recente e direttamente applicabile del tipo “solo il X% degli utenti scopre un menu da long-press” su liste Android; i paper trovati dimostrano il problema delle interazioni nascoste ma non forniscono quella percentuale specifica.

[NV] Non ho eseguito un'osservazione strumentata delle build correnti di Gmail, Drive, Foto, Files e Keep; il confronto `[UI]` deriva dalle guide ufficiali correnti, che possono non riflettere esperimenti A/B o varianti di dispositivo.

[NV] Non ho trovato una prova che un long-press JavaScript arbitrario dentro WebView venga esposto automaticamente a TalkBack come azione long-click della singola riga.

[NV] Non ho trovato un'API Android pubblica semplice che aggiunga `AccessibilityActionCompat` direttamente a ciascun nodo DOM virtuale di una WebView Capacitor; le API documentate agiscono sulle `View` native.

[NV] Non ho trovato uno studio contemporaneo controllato che dimostri quantitativamente se dialogo preventivo o Undo/Snackbar prevenga più perdite di dati nel caso di cancellazioni Android.

[NV] Non ho trovato una regola Android/Material corrente che obblighi a nominare nel dialogo ogni artefatto correlato eliminato; la raccomandazione deriva da W3C G168, dalle guide storiche Material e dal requisito di descrivere le conseguenze.

[NV] Non ho trovato documentazione ufficiale di un agente IA mobile che definisca una pausa riprendibile con semantica di fatturazione e checkpoint comparabile a TALOS.

[NV] Non ho trovato una garanzia generale che interrompere una richiesta HTTP al modello interrompa anche l'elaborazione remota o l'addebito; questo deve essere verificato provider per provider.

[NV] Non ho trovato una mappatura normativa esplicita “ricerca IA = foreground service type dataSync”; il tipo deve essere scelto sulla funzione effettiva e validato contro la documentazione/policy applicabile.

[NV] Non ho trovato un modello WorkManager ufficiale per pausa vera; la soluzione con checkpoint e nuova WorkRequest è un livello applicativo dedotto dagli stati e dalle API disponibili.

[NV] Non ho trovato una soglia Material/Android universale in millisecondi per spinner, progress bar o skeleton; le soglie riportate appartengono a Fluent, Carbon e SAP.

[NV] Non ho trovato un minimo Android/Material ufficiale di permanenza di un indicatore dopo la comparsa; i 400–600 ms citati sono soltanto una possibile scelta TALOS da validare.

[NV] Non ho trovato un limite ufficiale di lunghezza per il titolo di una ricerca; 120 grafemi è una proposta di prodotto.

[NV] Non ho trovato un pattern Android/Material nominato per “etichetta modificabile sopra un fatto immutabile”; la separazione `displayTitle`/`originalQuestion` è una deduzione di information architecture.

[NV] Non ho verificato con test reali la compatibilità completa di `<dialog>`, APG menu e gestione del tasto Back nelle precise versioni di Android System WebView supportate da TALOS.

[NV] Non ho verificato le caratteristiche di atomicità, idempotenza, cancellazione e fatturazione del provider di modello usato da TALOS, perché il brief non lo identifica.

---

# 6. Indice ragionato delle fonti

## 6.1 Android e Material/Android Design

[DOC] Android Design, “Layouts and navigation patterns”, aggiornato 17 giugno 2026: overflow inline nella riga e azioni aggiuntive nel menu. https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns

[DOC] Android Developers, “Menus” per Compose: menu ancorato a IconButton “More options”. https://developer.android.com/develop/ui/compose/components/menu

[DOC] Android Developers, “Add menus” per Views: options menu, context menu, contextual action mode e popup menu. https://developer.android.com/develop/ui/views/components/menus

[DOC] Android Developers, “Tap and press” per Compose: long press e semantica di `combinedClickable`. https://developer.android.com/develop/ui/compose/touch-input/pointer-input/tap-and-press

[DOC] Android Developers, input compatibility su grandi schermi: equivalenza touch-and-hold/click secondario. https://developer.android.com/develop/ui/views/touch-and-input/input-compatibility-on-large-screens

[DOC] Android Design, pointer interactions desktop: menu contestuale al click secondario. https://developer.android.com/design/ui/desktop/guides/interaction/pointer-interactions

[DOC] Android accessibility per Views: long-click, azioni sostitutive/custom e target. https://developer.android.com/guide/topics/ui/accessibility/views/principles-views

[DOC] Android accessibility, target touch raccomandati. https://developer.android.com/guide/topics/ui/accessibility/views/apps-views

[DOC] Android Snackbar Compose. https://developer.android.com/develop/ui/compose/components/snackbar

[DOC] Android Snackbar Views e azioni Undo. https://developer.android.com/develop/ui/views/notifications/snackbar/action

[DOC] Android Dialog Compose. https://developer.android.com/develop/ui/compose/components/dialog

[DOC] Android Dialog Views. https://developer.android.com/develop/ui/views/components/dialogs

[DOC] Android WorkManager, gestione e cancellazione del lavoro, aggiornato 12 maggio 2026. https://developer.android.com/develop/background-work/background-tasks/persistent/how-to/manage-work

[DOC] Android WorkManager, stati del lavoro. https://developer.android.com/develop/background-work/background-tasks/persistent/how-to/states

[DOC] Android WorkManager, long-running workers e foreground. https://developer.android.com/develop/background-work/background-tasks/persistent/how-to/long-running

[DOC] Android foreground services. https://developer.android.com/develop/background-work/services/fgs

[DOC] Android stop di un foreground service. https://developer.android.com/develop/background-work/services/fgs/stop-fgs

[DOC] Android FGS timeouts, aggiornato 14 luglio 2026. https://developer.android.com/develop/background-work/services/fgs/timeout

[DOC] Android notifiche e action button. https://developer.android.com/develop/ui/compose/notifications/create-notification

[DOC] Android `Notification.Builder`. https://developer.android.com/reference/kotlin/android/app/Notification.Builder

[DOC] Android progress indicators, aggiornato 14 luglio 2026. https://developer.android.com/develop/ui/compose/components/progress

[DOC] Android `ProgressBar`. https://developer.android.com/reference/android/widget/ProgressBar.html

[DOC] Android haptics principles. https://developer.android.com/develop/ui/views/haptics/haptics-principles

[DOC] Android haptic feedback APIs. https://developer.android.com/develop/ui/views/haptics/haptic-feedback

[DOC] Android `HapticFeedbackConstants`. https://developer.android.com/reference/android/view/HapticFeedbackConstants

[DOC] Android Material 3 `TextField` API. https://developer.android.com/reference/kotlin/androidx/compose/material3/TextField.composable

[DOC] Material Design 1 archiviato, confirmation/acknowledgement. https://m1.material.io/patterns/confirmation-acknowledgement.html

[DOC] Material Design 1 archiviato, dialogs. https://m1.material.io/components/dialogs.html

## 6.2 W3C, WCAG e ARIA APG

[DOC] WCAG 2.2, 2.1.1 Keyboard. https://www.w3.org/TR/WCAG22/#keyboard

[DOC] Understanding 2.5.1 Pointer Gestures. https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html

[DOC] Understanding input modalities. https://www.w3.org/WAI/WCAG22/Understanding/input-modalities.html

[DOC] Understanding 2.5.8 Target Size (Minimum). https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum

[DOC] G202, keyboard control for all functionality. https://www.w3.org/WAI/WCAG22/Techniques/general/G202

[DOC] G168, confirmation before actions that cannot be undone. https://www.w3.org/WAI/WCAG22/Techniques/general/G168

[DOC] APG Menu Button Pattern. https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/

[DOC] APG Menu Button Actions Example, aggiornato 20 gennaio 2026. https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/examples/menu-button-actions/

[DOC] APG Menu and Menubar Pattern. https://www.w3.org/WAI/ARIA/apg/patterns/menubar/

[DOC] APG Dialog Modal Pattern. https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/

[DOC] WCAG Understanding Status Messages. https://www.w3.org/WAI/WCAG22/Understanding/status-messages

[DOC] ARIA22, `role=status`. https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA22

[DOC] WAI-ARIA 1.2, `aria-busy` e ruolo status. https://www.w3.org/TR/wai-aria/

[DOC] F103, mancata esposizione dei messaggi di stato, aggiornato 9 marzo 2026. https://www.w3.org/WAI/WCAG22/Techniques/failures/F103.html

[DOC] ARIA27, `ariaNotify` sperimentale, aprile 2026. https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA27

[DOC] W3C Forms Tutorial, validation. https://www.w3.org/WAI/tutorials/forms/validation/

[DOC] Understanding 3.3.1 Error Identification. https://www.w3.org/WAI/WCAG22/Understanding/error-identification

[DOC] ARIA21, `aria-invalid`. https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA21

## 6.3 WebView e Capacitor

[DOC] Chromium, accessibilità Android/WebView e albero virtuale. https://chromium.googlesource.com/chromium/src/+/HEAD/docs/accessibility/browser/android.md

[DOC] Chromium, funzionamento dell'albero di accessibilità da HTML/CSS/ARIA. https://chromium.googlesource.com/chromium/src/+/HEAD/docs/accessibility/browser/how_a11y_works.md

[DOC] Capacitor documentation, runtime e plugin API. https://capacitorjs.com/docs

[DOC] Capacitor Haptics API indicizzata. https://capacitorjs.jp/docs/apis/haptics

## 6.4 Guide ufficiali delle app osservate

[UI] Gmail Android, selezione messaggi e altre azioni. https://support.google.com/mail/answer/7401?co=GENIE.Platform%3DAndroid&hl=en

[UI] Google Drive Android, gestione file e pulsante More. https://support.google.com/drive/answer/2424384?co=GENIE.Platform%3DAndroid&hl=en

[UI] Google Drive, Cestino ed eliminazione definitiva. https://support.google.com/drive/answer/2375102?co=GENIE.Platform%3DAndroid&hl=it

[UI] Google Foto Android, selezione multipla. https://support.google.com/photos/answer/6220402?co=GENIE.Platform%3DAndroid&hl=en

[UI] Google Foto, Cestino e cancellazione permanente. https://support.google.com/photos/answer/6128858?co=GENIE.Platform%3DAndroid&hl=en

[UI] Google Foto, modifica titolo album. https://support.google.com/photos/answer/6128849?co=GENIE.Platform%3DAndroid&hl=it-IT

[UI] Files by Google, azioni in lista/griglia. https://support.google.com/files/answer/9808835?hl=en

[UI] Files by Google, rinomina. https://support.google.com/files/answer/9746888?hl=it

[UI] Google Keep, selezione multipla. https://support.google.com/keep/answer/6191044?co=GENIE.Platform%3DAndroid&hl=en

[UI] Google Keep, eliminazione e Cestino. https://support.google.com/keep/answer/6262765?co=GENIE.Platform%3DAndroid&hl=it

[UI] Google Keep, modifica della nota/titolo. https://support.google.com/keep/answer/2888246?co=GENIE.Platform%3DAndroid&hl=it

[UI] Google Docs Android, rinomina. https://support.google.com/docs/answer/49114?co=GENIE.Platform%3DAndroid&hl=IT

[UI] Chrome Android, pausa e annullamento download. https://support.google.com/chrome/answer/95759?co=GENIE.Platform%3DAndroid&hl=it-IT

[UI] OpenAI Deep Research, progresso e interruzione. https://help.openai.com/it-it/articles/10500283-deep-research

[UI] Gemini Deep Research Android, esecuzione in background e notifica. https://support.google.com/gemini/answer/15719111?co=GENIE.Platform%3DAndroid&hl=it

## 6.5 Studi e altri design system

[3P] GhostUI, CHI 2026 / arXiv 2601.19258, interazioni nascoste e long-press. https://arxiv.org/abs/2601.19258

[3P] “Evaluating gesture user interfaces with scales for discoverability, learnability and social acceptability”, IJHCS 2024. https://www.sciencedirect.com/science/article/abs/pii/S1071581924000260

[3P] “Modeling Mobile Interface Tappability Using Crowdsourcing and Deep Learning”, 2019. https://arxiv.org/abs/1902.11247

[3P] Fluent 2 Wait UX. https://fluent2.microsoft.design/wait-ux

[3P] Fluent 2 Spinner. https://fluent2.microsoft.design/components/web/react/core/spinner/usage

[3P] Fluent 2 Android Progress Indicator. https://fluent2.microsoft.design/components/android/core/progressindicator/usage

[3P] Fluent 2 Skeleton. https://fluent2.microsoft.design/components/web/react/core/skeleton/usage

[3P] Carbon Loading Pattern. https://carbondesignsystem.com/patterns/loading-pattern/

[3P] Carbon Progress Bar. https://carbondesignsystem.com/components/progress-bar/usage/

[3P] SAP Fiori Android Skeleton Loading. https://www.sap.com/design-system/fiori-design-android/ui-elements/patterns/skeleton-loading/usage

## 6.6 Idempotenza, checkpoint e retry

[DOC] Google Cloud Run, retries e checkpoint per job. https://docs.cloud.google.com/run/docs/jobs-retries?hl=it

[DOC] AWS Builders' Library, idempotent APIs. https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/

[DOC] Microsoft Azure Architecture Center, Async Request-Reply. https://learn.microsoft.com/en-us/azure/architecture/patterns/asynchronous-request-reply

---

# Conclusione

[DOC] La guida Android corrente rende visibile l'overflow inline per le azioni aggiuntive di un elemento di lista; le app Google documentate associano il long-press alla selezione.

[DOC] WCAG non vieta il long-press in assoluto, ma richiede che la funzionalità sia raggiungibile e semanticamente esposta tramite tastiera e tecnologie assistive.

[NV] Per TALOS il modello giusto è quindi: tre puntini visibili come via primaria, long-press coerente per selezione, conferma soltanto per perdita irreversibile, pausa applicativa a checkpoint e stato accessibile in WebView.

[NV] Il punto più importante da implementare prima della UI è il contratto del motore: che cosa viene salvato, che cosa può essere ripreso e che cosa accade a una chiamata già inviata; senza quel contratto, le etichette “Pausa” e “Annulla” non possono essere veritiere.
