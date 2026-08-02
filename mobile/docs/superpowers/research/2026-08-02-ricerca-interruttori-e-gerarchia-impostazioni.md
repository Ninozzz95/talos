# Ricerca — interruttori, caselle di spunta e gerarchia delle impostazioni

**Data:** 2026-08-02
**Ambito:** refactor delle Impostazioni di TALOS mobile (Capacitor + Vue 3 + Tailwind v4, WebView Chrome su Android)
**Natura del documento:** ricerca. Nessun file sorgente è stato modificato.

---

## 0. Il contesto misurato, prima delle fonti

Prima di citare chiunque, i numeri veri del sorgente, perché le linee guida vanno lette contro questi e non contro un'app immaginaria.

L'app disegna un interruttore on/off in **tre modi strutturalmente diversi**, più una coda di varianti:

- **Modo A — `<button type="button" role="switch" :aria-checked>` con pallina disegnata a mano.** 11 occorrenze: `TalosMobileSettingsAppearancePanel.vue` (righe 223, 238, 253, 268, 283), `TalosMobileSettingsAccountPanel.vue` (238, 301, 329), `TalosMobileComposerDrawer.vue` (130, 151), `TalosMobileEffortPicker.vue` (70).
- **Modo B — `<input type="checkbox" role="switch">` con `accent-[var(--talos-accent)]`.** 11 punti di codice, 16 istanze a schermo: `TalosMobileSettingsBrowserPanel.vue` (83, 98), `TalosMobileSettingsAppearancePanel.vue` (380, 384, 410 ×6, 415, 416), `TalosMobileSettingsAiDefaultsPanel.vue` (186, 203, 251), `DoctorScreen.vue` (428). **Questi non sono interruttori: sono caselle di spunta native che si dichiarano interruttori.**
- **Modo C — `<input class="peer sr-only">` + div fratello con `peer-checked:`.** Un solo punto di codice, `TalosMobileSettingsAgentToolsPanel.vue:148-162`, ma 18 istanze a schermo (una per tool del catalogo).
- **Modo D — il resto.** ~30 controlli booleani espressi come `aria-pressed`, `role="menuitemcheckbox"`, `role="switch"` senza pallina (icona Eye/EyeOff), gruppi radio, caselle nude.

Fatti che pesano sul refactor:

1. **Non esiste alcun componente interruttore condiviso.** Nessun file `*Switch*` o `*Toggle*` sotto `src/`. `components/ui/` contiene solo `button/`, `dialog/`, `drawer/`.
2. **Ma la primitiva esiste già ed è inutilizzata.** `reka-ui@2.10.1` è una dipendenza di produzione e distribuisce `SwitchRoot`/`SwitchThumb`. Il codice importa già `TabsRoot`, `DialogRoot`, `DropdownMenu*`, `Primitive`, `useForwardProps` da reka-ui, ma **mai `SwitchRoot`**. Sono presenti e inutilizzati anche `class-variance-authority`, `clsx`, `tailwind-merge`, cioè esattamente gli ingredienti del `Button.vue` già in `components/ui/button/`.
3. **`TalosMobileSettingsAppearancePanel.vue` usa A e B nello stesso file**, separati da una sola linguetta orizzontale: cinque interruttori-bottone nella scheda Design (223-291) e undici caselle-accent nella scheda Movimento (380-416). Sono due oggetti visivamente diversi che l'utente raggiunge con uno swipe.
4. **La cartella `components/talos/settings/` contiene tutti e tre i modi**: Account = A, Browser e AI Defaults = B, Agent tools = C, Aspetto = A+B.
5. **Un solo interruttore in tutta l'app mostra un'etichetta di stato testuale**: `TalosMobileModelCatalog.vue:143` ("In composer" / "Nascosto"). Tutti gli altri comunicano lo stato con colore + posizione della pallina.
6. `browseMode` ha **tre implementazioni distinte** dello stesso booleano: interruttore modo A (`TalosMobileComposerDrawer.vue:130`), voce di menu con `aria-pressed` (`TalosMobileComposer.vue:763`), bottone-icona con `aria-pressed` (`TalosMobileComposer.vue:955`).
7. La scheda **Aspetto → Design espone 12 preferenze piatte** (5 interruttori + 7 select) in un `grid gap-4 sm:grid-cols-2`, senza una sola intestazione o `fieldset`. La scheda **Movimento ne espone 25**, con una sola `<h4>` e un solo `<fieldset>`. Aspetto da sola rende **41 controlli** su tre linguette: più di tutti gli altri pannelli messi insieme.

---

## 1. Interruttore o casella di spunta: qual è la regola vera

### 1.1 La regola su cui tutte le fonti concordano

Il discrimine non è "singola opzione contro opzioni multiple", come si ripete di solito. È **quando l'effetto avviene**.

Material 3, nella documentazione per sviluppatori Android che rispecchia le linee guida, lo dice in una frase sola: *«The effects of a switch should start immediately, without needing to save»* — e definisce i casi d'uso come «toggle a single item on or off» e «immediately activate or deactivate something» (https://raw.githubusercontent.com/material-components/material-components-android/master/docs/components/Switch.md, pagina di riferimento https://m3.material.io/components/switch/guidelines).

Nielsen Norman Group è la fonte più esplicita e la più utile per il nostro caso: *«Toggle switches should take immediate effect and should not require the user to click Save or Submit to apply the new state»*, motivata dall'analogia fisica — *«Users expect the same immediate results from a digital toggle as they do from their real-world counterparts (e.g., light switches)»*. E soprattutto l'avvertimento diretto: *«If you're considering including toggles in long forms where other types of form fields are present, and users will need to click a Submit button for other changes to take effect, don't. This scenario confuses users because they can't be sure whether their toggle choice will take immediate effect»* (https://www.nngroup.com/articles/toggle-switch-guidelines/).

Microsoft dice la stessa cosa dal lato opposto, come regola sulle pagine di impostazioni: *«A toggle switch is usually the best control for a binary setting»* e *«When a user changes a setting, the app should immediately reflect the change — don't require a confirmation button»* (https://learn.microsoft.com/en-us/windows/apps/design/app-settings/guidelines-for-app-settings).

La versione ingegneristica della stessa regola, quella che decide il markup, la danno Adrian Roselli e Kitty Giraudel e coincidono. Roselli: si usa un `<button>` se *«flipping the toggle has an immediate effect»* e *«the toggle will never have an indeterminate state»*; si usa una checkbox se si vuole *«progressively enhance the control»* o se *«flipping the toggle will only take effect when the user submits it»* (https://adrianroselli.com/2019/08/under-engineered-toggles-too.html). Giraudel: *«If the toggle causes an immediate action (such as switching a theme) and therefore relies on JavaScript, it should use a `<button>` instead»* (https://kittygiraudel.com/2021/04/05/an-accessible-toggle/).

**Applicazione a TALOS.** Ogni preferenza delle Impostazioni scrive nello store e si applica subito: non c'è un bottone Salva da nessuna parte. Quindi **tutte** le preferenze booleane di TALOS soddisfano il criterio dell'interruttore, e nessuna soddisfa il criterio della casella di spunta. Le uniche caselle legittime nel sorgente sono quelle che accompagnano una conferma differita: `TalosMobileDeleteChatDialog.vue:123` (`deleteMedia`, applicata quando si preme Elimina) e `ChatsScreen.vue:646` (`bulkDeleteMedia`). Ed è esattamente il rovescio di come sono disegnate oggi: quelle due sono caselle e vanno bene, mentre le sedici preferenze del modo B sono caselle che dovrebbero essere interruttori.

### 1.2 Dove le fonti si contraddicono davvero: il caso della singola opzione minore

Qui Material e Apple dicono il contrario l'una dell'altra, e non è una sfumatura.

**Material** (linee guida storiche, ancora online e mai ritrattate su questo punto): *«If you have a single option, avoid using a checkbox and use an on/off switch instead»*, e *«If you have multiple options appearing in a list, you can preserve space by using checkboxes instead of on/off switches»* (https://m1.material.io/components/selection-controls.html). Tradotto: opzione singola → interruttore; lista di opzioni → caselle.

**Apple HIG** dice l'opposto sulla prima metà: *«Avoid using a switch to control a single detail or a minor setting. A switch has more visual weight than a checkbox, so it looks better when it controls more functionality than a checkbox typically does. For example, you might use a switch to let people turn on or off a group of settings, instead of just one setting»* (https://developer.apple.com/design/human-interface-guidelines/toggles). Tradotto: opzione singola e minore → **non** interruttore; l'interruttore si merita un gruppo di impostazioni.

Non le concilio. Sono in conflitto sul caso letterale. La differenza è di dottrina: Material tratta l'interruttore come il controllo binario di default, Apple lo tratta come un controllo pesante da spendere con parsimonia perché sulle sue piattaforme l'interruttore è grosso, verde e regola cose come il Wi-Fi.

Osservo però che **la posizione di Apple descrive meglio il problema di TALOS**. Le sei caselle di categoria movimento (`interface.categories.*`, riga 410: windows, surfaces, navigation, composer, messages, feedback) sono esattamente il caso Material «multiple options appearing in a list»: sono sotto-opzioni omogenee, non impostazioni indipendenti. Per Material vanno bene come caselle; per Apple sono il caso in cui l'interruttore sarebbe sprecato. **Su queste sei, e solo su queste, le due fonti concordano nel non usare l'interruttore.** Tutte le altre quindici occorrenze del modo B sono impostazioni indipendenti che, per entrambe le fonti, non dovrebbero essere caselle di spunta.

Vincolo aggiuntivo di Apple che vale la pena tenere: *«Use the switch toggle style only in a list row. You don't need to supply a label in this situation because the content in the row provides the context for the state the switch controls»* (https://developer.apple.com/design/human-interface-guidelines/toggles). È la forma che TALOS già usa in `switchRowClass` — riga con titolo, sottotitolo e controllo a destra — e va conservata.

### 1.3 Il difetto che nessuna delle due dottrine perdona

Il modo B produce un controllo che **si vede come casella di spunta e si annuncia come interruttore**. Scott O'Hara pone la regola di coerenza esattamente su questo asse: *«if a checkbox is visually designed to look like a switch (but continued to be announced as a checkbox), then there should be no instances where the same design is used for a `role='switch'`»* (https://scottaohara.github.io/a11y_styled_form_controls/src/checkbox--switch/). TALOS ha il caso simmetrico e peggiore: stesso disegno di casella, ruolo dichiarato di interruttore.

Il documento Understanding di WCAG SC 4.1.2 Name, Role, Value non vieta esplicitamente il disallineamento fra aspetto e ruolo, ma avverte: *«If custom controls are created, however, or interface elements are programmed (in code or script) to have a different role and/or function than usual, then additional measures need to be taken to ensure that the controls provide important and appropriate information to assistive technologies»* (https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html). Il testo normativo richiede solo che nome e ruolo siano determinabili programmaticamente. Quindi: **non è una violazione formale, è un difetto di coerenza fra il canale visivo e il canale assistivo.** Va detto onestamente, senza gonfiarlo in una non-conformità.

---

## 2. Come si costruisce un interruttore accessibile sul web

### 2.1 Il contratto minimo

W3C ARIA Authoring Practices Guide, pattern Switch (https://www.w3.org/WAI/ARIA/apg/patterns/switch/):

- ruolo `switch`;
- `aria-checked` a `true`/`false`;
- etichetta da contenuto testuale, `aria-labelledby` o `aria-label`, **e l'etichetta deve essere visibile**;
- **Spazio** cambia lo stato; Invio è opzionale;
- niente stato intermedio: *«checkboxes and toggle buttons allow implementations the option of supporting a third middle state»*, l'interruttore no;
- e la regola che conta per il punto 4 di questa ricerca: *«it is critical the label on a switch does not change when its state changes»*.

MDN conferma e aggiunge la sanzione sul mixed: *«The `switch` role does not support the value `mixed` for the `aria-checked` attribute; assigning a value of `mixed` to a `switch` instead sets the value to `false`»*, `aria-checked` è **obbligatorio**, e la scorciatoia attesa è lo Spazio. MDN chiude con un avvertimento che è la sintesi onesta di tutta la letteratura: *«There are varying opinions on how assistive technologies should handle this role; the above is a suggested practice and may differ from other sources»* (https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/switch_role).

### 2.2 Cosa succede davvero con TalkBack e VoiceOver

I dati veri sono nella matrice di test di Adrian Roselli (https://adrianroselli.com/2021/10/switch-role-support.html). Riassunta sulle combinazioni che riguardano TALOS:

| Lettore + browser | `<input type=checkbox role=switch>` | `<button role=switch aria-checked>` |
|---|---|---|
| **TalkBack 9.1-13 (Android 11-13) + Chrome 94-106** | «on/off, [nome], switch» | «on/off, [nome], switch» |
| TalkBack + Firefox 93-105 | «checked/not checked, [nome], switch» | «checked/not checked, [nome], switch» |
| **VoiceOver iOS 14.8-15.7 + Safari** | non annuncia nulla come switch | non annuncia nulla come switch |
| VoiceOver macOS 11.4-12.6 + Safari | «[nome], on/off, switch» | «[nome], on/off, switch» |

Roselli documenta anche l'infrazione sul mixed: TalkBack + Chrome annuncia `aria-checked="mixed"` su una checkbox con ruolo switch come «partially checked» e su un bottone con ruolo switch come «checked», entrambi contro specifica. Su Android 5 il ruolo era esposto ma lo stato era sempre «not checked».

**Il dato decisivo per TALOS: su TalkBack + Chrome — che è esattamente l'ambiente di TALOS, WebView Chrome su Android — i due markup si comportano in modo identico e corretto.** La scelta fra bottone e checkbox non è quindi una questione di annuncio su Android. È una questione di semantica di form e di progressive enhancement.

### 2.3 La contraddizione fra le fonti sul `role="switch"`

Roselli, nello stesso corpus, prende posizione contro: *«Generally I recommend against a control with a `switch` role. Scott O'Hara has tracked a bunch of issues with screen readers, so you can see that the experience is sub-par overall»* (https://adrianroselli.com/2019/08/under-engineered-toggles-too.html).

Questa raccomandazione **contraddice i suoi stessi dati di test del 2021**, che mostrano supporto corretto su TalkBack+Chrome e su VoiceOver macOS. La contraddizione è reale e va riportata così com'è. La lettura più caritatevole: la raccomandazione è formulata per il web generalista, dove Safari/iOS e NVDA pesano quanto Chrome/Android; TALOS non è web generalista, è un'app Android impacchettata con Capacitor, e il suo unico motore di rendering è il WebView Chrome.

Scott O'Hara è più neutrale e riporta il costo residuo: *«NVDA and iOS Safari/VoiceOver are the hold outs on respecting the `switch` role, but at least these announce the switch as a checkbox with proper states»* (https://scottaohara.github.io/a11y_styled_form_controls/src/checkbox--switch/). Cioè: nel peggiore dei casi il degrado è «annunciato come casella con lo stato giusto», non «annunciato male».

### 2.4 Bottone o checkbox: la conclusione difendibile per TALOS

Il criterio di Roselli e Giraudel, applicato letteralmente:

- effetto immediato — **sì**, ogni preferenza TALOS si applica subito;
- mai stato indeterminato — **sì**, sono booleani puri;
- JavaScript sempre disponibile — **sì**, è un'app Vue in un WebView; senza JS non esiste niente;
- invio differito in un form — **no**, non esiste alcun form con Salva.

Tre criteri su tre puntano al **bottone con `role="switch"` e `aria-checked`**, cioè il modo A già in uso. La checkbox conserva un solo vantaggio reale in questo contesto — arriva gratis nella serializzazione dei form — che TALOS non sfrutta da nessuna parte, perché scrive nello store con `@change`.

C'è però una considerazione di manutenzione che sposta la raccomandazione operativa: **`reka-ui` è già una dipendenza di produzione, distribuisce `SwitchRoot`/`SwitchThumb`, dichiara di aderire al pattern APG** (*«Adheres to the switch role requirements»*), gestisce Spazio e Invio, espone `[data-state="checked|unchecked"]` e `[data-disabled]` per lo styling, e **rende un `<input>` nascosto quando è dentro un `<form>`** per la propagazione degli eventi (https://reka-ui.com/docs/components/switch). Adottarlo dà il modo A con la conformità APG già scritta e testata da terzi, invece di riscrivere `role`/`aria-checked`/tastiera a mano in undici punti. È anche la scelta coerente con la dottrina interna sulle librerie affermate.

Un dettaglio da non perdere nel passaggio: `TalosMobileSettingsAgentToolsPanel.vue:41-43` contiene un rollback ottimistico manuale (`input.checked = …`) reso necessario dal fatto che la checkbox nativa cambia stato *prima* che `change` arrivi. Un controllo pilotato (bottone o `SwitchRoot` con `v-model`) fa sparire quella riga: lo stato viene dal modello, non dal DOM.

---

## 3. La tecnica `peer sr-only`: cosa le si contesta davvero

Va detto subito, perché la premessa del refactor rischia di essere ingiusta: **la tecnica di per sé non è considerata un difetto di accessibilità.** È la tecnica che Adrian Roselli usa e insegna: *«I hide the checkbox without removing it from the DOM nor the accessibility tree»* (https://adrianroselli.com/2019/03/under-engineered-toggles.html). Giraudel fa lo stesso con `position:absolute; opacity:0; width:100%; height:100%` (https://kittygiraudel.com/2021/04/05/an-accessible-toggle/).

Risposte dirette alle tre domande poste:

**Il focus da tastiera funziona?** Sì. `sr-only` di Tailwind nasconde con `position:absolute; width:1px; height:1px; clip:rect(0,0,0,0)` e non con `display:none` o `visibility:hidden`: l'elemento resta focalizzabile. Ma **il focus diventa invisibile** se non lo si inoltra esplicitamente al div stilizzato, perché l'anello del browser si disegna su un rettangolo di 1×1 px fuori campo. Roselli affronta il problema combinando più indicatori — colore del testo dell'etichetta, `box-shadow` sulla pillola, disco semitrasparente sulla pallina — perché i singoli non bastavano. Giraudel usa il combinatore di fratelli per *«provide the display the default outline styles from the browser to mimic a native control»*, e rimuove l'anello sul clic con `:focus:not(:focus-visible)` per imitare il comportamento nativo.

**Lo stato viene annunciato?** Sì. L'input resta nell'albero di accessibilità, quindi `checked`/`aria-checked` sono esposti normalmente. Non è questo il punto debole.

**Allora qual è il difetto?** Due, e sono entrambi di *esecuzione*, non di principio.

1. **Modalità a colori forzati / alto contrasto.** Il div stilizzato comunica lo stato con `background-color`; in `forced-colors: active` i colori d'autore vengono sostituiti dal sistema e la pillola può sparire o diventare indistinguibile. Giraudel lo risolve così: *«For the toggle to be visible in Windows High-Contrast Mode, we apply a thin semi-transparent (or fully transparent) border»* — un bordo trasparente sopravvive alla sostituzione e diventa visibile. Il rimedio generale è dare al fondo un valore che il sistema mappa, come `CanvasText`, dentro `@media (forced-colors: active)` (https://gomakethings.com/forced-colors-mode/); Tailwind espone `forced-color-adjust-*` e la variante `forced-colors:` per farlo (https://tailwindcss.com/docs/forced-color-adjust).
2. **La cliccabilità dipende interamente dall'involucro.** Con l'input ridotto a 1×1 px, l'unica superficie toccabile è il `<label>`. Se manca il `for` o l'annidamento, il controllo non è azionabile con il dito pur restando azionabile da tastiera.

**Verifica sul codice di TALOS.** L'unica istanza del modo C, `TalosMobileSettingsAgentToolsPanel.vue:148-162`, è fatta bene su quasi tutto: c'è il `<label :for>` che avvolge (144-147, con `min-h-11` = 44 px di superficie), il visuale è `aria-hidden="true"` e `pointer-events-none`, e il focus **è** inoltrato con `peer-focus-visible:ring-2 ring-offset-2`. È l'unico interruttore dell'app con transizione della pallina, anello di focus e gestione dello stato disabilitato. **L'unico difetto reale è l'assenza di trattamento `forced-colors`.** La conclusione onesta non è «la tecnica `peer sr-only` è sbagliata», è: «è l'implementazione migliore delle tre, è costosa da ripetere a mano, ed è stata scritta una volta sola su ventisei siti che ne avrebbero bisogno».

**Nota su SC 2.5.8 Target Size (Minimum).** Il criterio chiede 24×24 px CSS: *«The size of the target for pointer inputs is at least 24 by 24 CSS pixels, except when…»*, con l'eccezione di spaziatura formulata come *«Undersized targets … are positioned so that if a 24 CSS pixel diameter circle is centered on the bounding box of each, the circles do not intersect another target or the circle for another undersized target»* (https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). Le caselle del modo B sono `h-5 w-9`, cioè **20×36 px: sotto i 24 px in altezza**. Passano solo perché sono avvolte da un `<label>` alto 44-56 px che costituisce il bersaglio effettivo. È un margine che dipende da un dettaglio di markup, non da una scelta. Il modo A, `h-6 w-11` = 24×44, sta esattamente sul minimo.

---

## 4. «Attivo/Disattivo» accanto all'interruttore: serve o disturba

Su questo le fonti sono **apertamente in disaccordo**, e riporto il disaccordo.

**A favore del testo di stato — Nielsen Norman Group.** Raccomanda di includere *«both off and on to the left and right side, respectively, of the toggle to avoid confusion»*. Nello stesso articolo però ammette il contrario mostrando un caso reale in cui *«a contrasting color (purple) and no state descriptors»* funziona ugualmente (https://www.nngroup.com/articles/toggle-switch-guidelines/).

**Contro il testo di stato — Apple HIG.** Consiglia esplicitamente di evitare etichette che descrivano i valori dell'interruttore, come «On» o «Off», perché ridondanti: lo stato visivo dell'interruttore più l'etichetta descrittiva della riga bastano (https://developer.apple.com/design/human-interface-guidelines/toggles).

**Contro, dal lato Material.** La forma con «on» e «off» stampati dentro il controllo è dichiarata deprecata: *«The on/off slide toggle with the text "on" and "off" included within the asset is deprecated»*; al suo posto si usa un'etichetta inline che chiarisce quale opzione si controlla e il suo stato (https://m1.material.io/components/selection-controls.html). La documentazione Android aggiunge: *«Switches support content labeling for accessibility and are readable by most screen readers, such as Talkback. … Additional content labels are usually unnecessary»* (https://raw.githubusercontent.com/material-components/material-components-android/master/docs/components/Switch.md).

**Il vincolo che sta sopra al disaccordo, e che decide il progetto.** L'APG è categorica: *«it is critical the label on a switch does not change when its state changes»* (https://www.w3.org/WAI/ARIA/apg/patterns/switch/). Quindi «Attivo/Disattivo» **non può mai essere il nome accessibile**. Se lo si mostra, deve essere testo decorativo (`aria-hidden`) accanto a un'etichetta stabile, perché lo stato lo comunica già `aria-checked` e un lettore di schermo che legga «Movimento sfondo, attivo, interruttore, attivato» dice due volte la stessa cosa.

**Regola sul contenuto dell'etichetta, su cui invece tutti concordano.** NN/g: *«The toggle labels should describe what the control will do when the switch is on; they should not be neutral or ambiguous»*. Android, per le impostazioni: usare etichette impersonali («Notifications» e non «Notify me»), evitare i termini negativi — *«Avoid negative terms like "Don't" or "Never," in favor of neutral terms like "Block"»* — e non ripetere le parole del titolo di sezione (https://developer.android.com/design/ui/mobile/guides/patterns/settings). La negazione è la trappola vera: un interruttore chiamato «Disattiva animazioni» produce il doppio negativo «Disattiva animazioni: spento», che nessuno decodifica al primo colpo.

**Sul colore.** Sara Soueidan lo lega a WCAG: *«According to WCAG, you should not use color alone to convey information»* (https://www.sarasoueidan.com/blog/toggle-switch-design/); Apple aggiunge di non affidarsi al solo colore perché non tutti lo percepiscono allo stesso modo, e di limitare i cambi al colore predefinito dell'interruttore. **La posizione della pallina è già il secondo canale**, quindi un interruttore ben disegnato soddisfa il requisito senza testo di stato — mentre le caselle del modo B, che cambiano solo colore di riempimento, si appoggiano molto di più al colore.

**Raccomandazione derivata per TALOS.** Non scrivere «Attivo/Disattivo». L'app oggi è già coerente su questo (un solo caso su ventisei, `TalosMobileModelCatalog.vue:143`, e lì l'etichetta è «In composer»/«Nascosto», cioè descrive l'*effetto*, non lo stato astratto: è la forma buona). Il testo secondario sotto il titolo, che TALOS usa già ovunque, è il posto giusto — e Android dà la regola per scriverlo: *«Supporting text helps the user better understand the current state of a setting or indicate what happens when a setting is enabled. If the label is sufficient on its own, don't add secondary text. Keep explanations brief and show the setting status instead of describing the setting»*.

---

## 5. Gerarchia: dodici preferenze allo stesso livello

### 5.1 Quello che la ricerca vera dice — e quello che non dice

**Il numero magico non esiste.** Va detto per primo perché è la fonte più citata a sproposito. NN/g smonta l'applicazione del 7±2: Miller riguarda la memoria a breve termine, non la densità di una schermata, e *«In the field of user experience, Miller's magical number seven is often misunderstood to mean that humans can only process seven chunks at any given time»*; la conclusione operativa è che *«Menus can still be easy to use with more than seven choices, as long as the options are structured in a meaningful way»* (https://www.nngroup.com/articles/chunking/). UX Myths dà l'argomento decisivo: i menu vivono di **riconoscimento, non di richiamo** — le opzioni restano sullo schermo, quindi non c'è alcun guadagno di usabilità nel limitarle a sette (https://uxmyths.com/post/931925744/myth-23-choices-should-always-be-limited-to-seven). La letteratura più recente colloca peraltro la capacità reale intorno a quattro elementi (Cowan 2001), il che rende il 7±2 doppiamente inservibile come regola di layout.

**Non ho trovato alcuno studio empirico che fissi una soglia numerica per le impostazioni.** Le soglie che circolano vengono da linee guida di piattaforma, cioè da convenzione motivata, non da esperimenti. Riportarle come «ricerca» sarebbe disonesto.

**La ricerca vera che esiste riguarda la stabilità, non il conteggio.** Findlater e McGrenere, CHI 2004, «A Comparison of Static, Adaptive, and Adaptable Menus»: il menu **statico è risultato più veloce di quello adattivo**, e quello adattabile (riorganizzato dall'utente) è risultato paragonabile allo statico, tranne quando era la prima condizione dell'esperimento, dove era lento quanto l'adattivo (https://www.cs.ubc.ca/labs/imager/tr/2004/findlater04menus/, https://dl.acm.org/doi/10.1145/985692.985704). La lezione trasferibile a un pannello di impostazioni: **una struttura stabile e prevedibile batte una struttura che il sistema riordina.** Quindi niente sezioni che compaiono e scompaiono, niente ordinamento per frequenza d'uso — e questo colpisce direttamente `TalosMobileSettingsBrowserPanel.vue:98`, dove `developer_untrusted_evidence` è sotto `v-if="developmentMode"` e il pannello ha un numero di controlli diverso a seconda della build.

GNOME dice la stessa cosa come regola di redazione: i gruppi vanno organizzati *«by topic rather than level of ability or frequency of use»* (https://developer.gnome.org/hig/patterns/controls/switches.html, https://developer.gnome.org/hig/patterns/containers/boxed-lists.html).

### 5.2 Le soglie di piattaforma, e la loro contraddizione

**Android** (https://developer.android.com/design/ui/mobile/guides/patterns/settings):
- *«Group settings in smaller relevant groups. Use visual or intrinsic containment and headings between groups instead of individual items.»*
- *«For 15 or more settings, group related settings under a subscreen.»*
- *«Use subscreens to simplify multiple settings or extensive categories, helping users focus on fewer choices. For complex or deep settings hierarchies, add search functionality so users can find the correct preference.»*
- Regola di coerenza dei nomi: *«the label of the setting that opens a group must match the subscreen title»*.

**Microsoft** (https://learn.microsoft.com/en-us/windows/apps/design/app-settings/guidelines-for-app-settings):
- *«Group similar or related settings under one section header.»*
- *«Try to keep the total number of settings to a maximum of four or five.»*
- *«Keep your settings simple. Define smart defaults and keep the number of settings to a minimum.»*
- *«Combine less-used settings into a SettingsExpander so that common settings can each have their own SettingsCard.»*

**La contraddizione:** quattro o cinque contro quindici. Sono un ordine di grandezza di distanza. Non la risolvo scegliendo: leggendo il contesto, il «four or five» di Microsoft riguarda una pagina di impostazioni desktop pensata come vetrina breve, mentre il «15 or more» di Android è la soglia oltre la quale un albero di impostazioni telefoniche richiede una sottoschermata. Entrambe però convergono su una cosa sola, ed è quella che conta: **raggruppare con intestazioni scatta molto prima di dodici voci.**

**NN/g sulla profondità** (https://www.nngroup.com/articles/progressive-disclosure/): *«Progressive disclosure defers advanced or rarely used features to a secondary screen, making applications easier to learn and less error-prone»*, in due passi — mostrare all'inizio solo le poche opzioni più importanti, offrire il resto su richiesta. E il limite: *«In practice, designs that go beyond 2 disclosure levels typically have low usability because users often get lost when moving between the levels»*. Microsoft pone lo stesso limite in forma concreta: *«Avoid nesting expanders deeper than one level»*.

> **Avvertenza sulle fonti.** Durante la ricerca è comparsa, in materiale di sintesi secondario, l'affermazione che uno studio del 2006 avrebbe misurato un miglioramento del 30-50% nei tempi di completamento grazie al progressive disclosure. **Non l'ho trovata nell'articolo NN/g originale e non la considero verificata: non va citata.** Il testo NN/g menziona il test di 46 applicazioni web, non quelle percentuali.

### 5.3 Verdetto sulle dodici voci di Aspetto → Design

Dodici preferenze piatte sono **sotto** la soglia Android della sottoschermata (15) e **sopra** ogni soglia di raggruppamento di qualunque fonte. La risposta difendibile è quindi: **non spezzare in una nuova schermata, raggruppare sul posto con intestazioni e contenimento visivo**, che è letteralmente ciò che chiede Android («use visual or intrinsic containment and headings between groups instead of individual items») ed è già come è fatto il pannello Agent tools di TALOS, l'unico ben strutturato (cinque `<h4>` su schede arrotondate, `TalosMobileSettingsAgentToolsPanel.vue:101-104`).

Il caso realmente fuori scala è **Aspetto → Movimento con 25 controlli** (10 booleani, 4 select, 11 slider), che supera la soglia dei 15 di Android e ha una sola intestazione. Lì la sottoschermata è indicata, e il candidato naturale sono gli otto slider di `motionControls` (`speed`, `intensity`, `glow_intensity`, `density`, `depth`, `trails`, `contrast`, `parallax`) più i tre di `interfaceControls`: sono regolazioni fini che nessuno tocca al primo avvio — esattamente le *«advanced or rarely used features»* che NN/g manda al secondo livello.

Il modello di riga da adottare è quello che GNOME formalizza per le liste di preferenze: righe con titolo, sottotitolo e un controllo, con il vincolo *«Rows that include controls should generally just have one and should have a maximum of two, and when there is a control, clicking the list background should trigger the control»*. La seconda metà — tutta la riga cliccabile — TALOS la rispetta dove usa `<label>` come riga (`switchRowClass`), non dove la riga è un `<div>` con un bottone dentro.

---

## 6. Impostazioni interdipendenti: tre interruttori che si contraddicono

### 6.1 Il caso reale nel sorgente, perché la risposta dipende da quale dei tre casi è

`TalosMobileSettingsAppearancePanel.vue`, area movimento, espone contemporaneamente:

- una select **modalità renderer** (riga 370) su `mode: 'off' | 'static' | 'simple' | 'complex' | 'adaptive'`;
- un interruttore **movimento di sfondo** (riga 380) su `background_enabled`;
- un interruttore **movimento interfaccia** (riga 384) su `interface_enabled`;
- una select **profilo interfaccia** (riga 397) su `interface.profile`, che ha **anch'essa un valore `'off'`**;
- sei categorie (riga 410), più `pause_when_hidden` e `respect_data_saver` (415-416).

Le combinazioni prive di senso non sono ipotetiche, sono già compensate nel codice:

1. **`mode === 'off'` e `background_enabled === false` dicono la stessa cosa.** Due controlli, un significato. La riga 380 rende `:checked="background_enabled && mode !== 'off'"` — **l'interruttore non mostra il valore che scrive**. E `setMotionBoolean` (100-109) riscrive silenziosamente l'enum quando il booleano viene acceso, con il commento «would be a silent no-op — promote to `'simple'` so the switch does what it says»: accendere un interruttore **muta la select che gli sta sopra, senza dirlo all'utente**.
2. **È asimmetrico:** spegnere l'interruttore non tocca `mode`, quindi la select può leggere «complex» mentre lo sfondo è spento.
3. **`'static'` è un terzo stato di spegnimento che il booleano non sa esprimere:** con `mode: 'static'` l'espressione di riga 380 controlla solo `!== 'off'`, quindi **l'interruttore legge acceso mentre nulla si anima**.
4. **`interface_enabled` duplica `interface.profile === 'off'`** — stessa sovrapposizione enum/booleano un livello più sotto.
5. Le otto sotto-opzioni restano vive e commutabili mentre i loro master sono spenti.

Casi analoghi altrove: Browser (`presentation === 'system_browser'` consegna l'URL al browser di sistema, dove TALOS non può osservare né filtrare nulla, mentre la select di policy `confirm_every_interaction` resta abilitata e promette una cosa che l'app non può mantenere); AI Defaults (un booleano di contesto libreria memorizzato in due posti che possono divergere, più un terzo stato solo-UI); Account (abilitare il blocco forza `screen_secure: true` ma disabilitarlo non lo ripristina, e `app_lock_biometric` può restare `true` mentre la sua riga è nascosta da `v-if`).

### 6.2 Le tre soluzioni, e quale fonte prescrive quale

**(a) Trasformarli in una scelta singola — è la risposta corretta quando i booleani descrivono stati mutuamente esclusivi della stessa cosa.** NN/g: *«Radio buttons are used when there is a list of two or more options that are mutually exclusive and the user must select exactly one choice»*, mentre le caselle servono quando *«the user may select any number of choices, including zero, one, or several»*; e la casella autonoma *«is used for a single option that the user can turn on or off»* (https://www.nngroup.com/articles/checkboxes-vs-radio-buttons/). L'articolo apre proprio con l'errore di usare caselle per due scelte mutuamente esclusive. Microsoft dà il limite di cardinalità: radio *«to let users choose one item from a set of up to 5 mutually exclusive, related options»*, oltre i cinque si passa a una combo box (https://learn.microsoft.com/en-us/windows/apps/design/app-settings/guidelines-for-app-settings).

Questo è **esattamente** il caso `mode` + `background_enabled`: un enum a cinque valori di cui uno è `'off'`, più un booleano che ridice lo stesso `'off'`. Non sono un master e un dettaglio: sono un unico concetto scritto due volte. La cura è collassarli in un solo controllo di scelta a cinque valori (Off / Statico / Semplice / Complesso / Adattivo), che **rende le combinazioni illegali non rappresentabili** invece di gestirle a valle. Idem per `interface_enabled` + `interface.profile`.

**(b) Interruttore padre con dipendenti disabilitati — è la risposta quando c'è un vero master e vere sotto-opzioni.** Android è testuale su tutto il pattern: *«Use this section if the value of one setting controls the availability of one or more other settings. Place a dependent setting below the setting on which it depends, with a brief explanation of why the dependent setting is unavailable. Use a parent switch on a subscreen to toggle a group of dependent settings. Disabling the parent switch disables the dependent controls. If the setting depends on a system setting, explain the dependency and direct users to the appropriate device setting»* (https://developer.android.com/design/ui/mobile/guides/patterns/settings). Apple arriva allo stesso posto per un'altra strada, quella del peso visivo: *«you might use a switch to let people turn on or off a group of settings, instead of just one setting»*. GNOME concorda sul disabilitare: *«If a feature has been disabled or is unavailable, it is better to make the switch insensitive, since this avoids the suggestion that the service ought to respond to user action»*.

Questo è il caso delle sei categorie movimento e di `pause_when_hidden` / `respect_data_saver` rispetto ai loro master.

**(c) Annidare / rivelare su richiesta — la variante Microsoft.** *«Use a SettingsExpander when a setting has sub-options that should be revealed on demand. The expander shows a primary action control on the header row and additional SettingsCard items inside the Items collection. This keeps the page compact while still surfacing advanced options. Avoid nesting expanders deeper than one level.»* Con un vincolo importante contro il nascondere per contesto: *«Display the same settings regardless of the app context. If some settings aren't relevant in a certain context, disable the SettingsCard by setting IsEnabled to false»*, e *«Add a descriptive message if one of the controls is disabled»*. Cioè Microsoft preferisce **disabilitare e spiegare** rispetto a **far sparire** — il che condanna direttamente il `v-if` sulla riga biometrica in `TalosMobileSettingsAccountPanel.vue:324-327` e il `v-if="developmentMode"` del pannello Browser.

### 6.3 La contraddizione sul disabilitare

Android, Microsoft e GNOME dicono tutti di disabilitare i dipendenti. **Adrian Roselli sostiene di non disabilitare affatto i controlli di form** (https://adrianroselli.com/2024/02/dont-disable-form-controls.html), con tre argomenti concreti: i controlli disabilitati **sono esentati dai requisiti di contrasto** di WCAG, quindi diventano legittimamente illeggibili; *«Default styles are a terrible signal a field is disabled. Authors trying to make obvious disabled styles often leave users unable to either see a field at all or distinguish it from the other fields»*; e *«Rarely do authors explain why users cannot interact with a disabled field»*. Come alternativa indica `aria-disabled` per i controlli dove l'attributo `disabled` non è ammesso, e in generale buone istruzioni e messaggi d'errore al posto della disabilitazione.

**La contraddizione è reale ma si compone quasi del tutto**, e vale la pena mostrarlo invece di scegliere a caso: l'obiezione centrale di Roselli è che nessuno spiega *perché*. Android e Microsoft **impongono esattamente quella spiegazione** — «with a brief explanation of why the dependent setting is unavailable», «add a descriptive message if one of the controls is disabled». Il residuo non componibile è il contrasto: quello resta un problema di TALOS da risolvere con uno stile disabilitato che rimanga leggibile, non con l'opacità di default.

### 6.4 Il criterio per decidere, in una riga

Se spegnere A rende B **privo di significato** → A è un master, B va sotto A, disabilitato e spiegato (Android). Se A e B **descrivono lo stesso stato con parole diverse** → non sono due impostazioni, sono una scelta singola (NN/g). E in nessun caso un controllo deve scrivere il valore di un altro senza mostrarlo, che è il difetto di `setMotionBoolean`.

---

## 7. Sintesi operativa

1. **Un solo componente interruttore**, costruito su `SwitchRoot`/`SwitchThumb` di `reka-ui` — già dipendenza di produzione, già conforme APG, già dotato di tastiera e `data-state` — a sostituire tutti e tre i modi. Il modo A è semanticamente giusto ma ripetuto a mano undici volte; il modo B va eliminato del tutto.
2. **`role="switch"` si tiene.** Su TalkBack + Chrome, l'unico ambiente di TALOS, il supporto è corretto e identico per bottone e checkbox (dati Roselli 2021). La raccomandazione contraria di Roselli vale per il web generalista e contraddice i suoi stessi test su Android.
3. **Nessun testo «Attivo/Disattivo».** L'APG vieta un'etichetta che cambia con lo stato; Apple e Material la considerano ridondante; NN/g è l'unica voce a favore. Lo stato lo dicono posizione della pallina e `aria-checked`; il testo secondario spiega l'effetto.
4. **Portare nel componente condiviso ciò che oggi esiste solo in Agent tools**: anello di focus, stato disabilitato, transizione — e aggiungere il trattamento `forced-colors` che manca ovunque.
5. **Raggruppare con intestazioni** i 12 controlli di Aspetto → Design; **spostare in sottoschermata** gli 11 slider fini di Aspetto → Movimento, che porta il pannello sotto la soglia dei 15 di Android. Mai più di due livelli (NN/g), mai più di un livello di annidamento (Microsoft).
6. **Collassare `mode` + `background_enabled` in una scelta unica a cinque valori**, e `interface_enabled` + `interface.profile` allo stesso modo: sono lo stesso concetto scritto due volte, e la prova è che il codice deve già compensarli in due punti. **Gerarchizzare** le sotto-opzioni sotto il loro master, disabilitate e con la spiegazione del perché. **Smettere di nascondere** controlli con `v-if` per contesto o per build.

---

## Fonti

**Interruttore contro casella di spunta**
- Material 3 — Switch, guidelines: https://m3.material.io/components/switch/guidelines
- Material Components Android — Switch (mirror testuale delle stesse indicazioni): https://raw.githubusercontent.com/material-components/material-components-android/master/docs/components/Switch.md
- Material — Selection controls (linee guida storiche, ancora online): https://m1.material.io/components/selection-controls.html
- Material 3 — Checkbox, guidelines: https://m3.material.io/components/checkbox/guidelines
- Apple Human Interface Guidelines — Toggles: https://developer.apple.com/design/human-interface-guidelines/toggles
- Nielsen Norman Group — Toggle-Switch Guidelines: https://www.nngroup.com/articles/toggle-switch-guidelines/
- Microsoft Learn — Guidelines for app settings: https://learn.microsoft.com/en-us/windows/apps/design/app-settings/guidelines-for-app-settings
- Sara Soueidan — On Designing and Building Toggle Switches: https://www.sarasoueidan.com/blog/toggle-switch-design/

**Accessibilità dell'interruttore**
- W3C ARIA APG — Switch Pattern: https://www.w3.org/WAI/ARIA/apg/patterns/switch/
- MDN — ARIA switch role: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/switch_role
- Adrian Roselli — Switch Role Support (matrice di test lettori di schermo): https://adrianroselli.com/2021/10/switch-role-support.html
- Adrian Roselli — Under-Engineered Toggles: https://adrianroselli.com/2019/03/under-engineered-toggles.html
- Adrian Roselli — Under-Engineered Toggles Too: https://adrianroselli.com/2019/08/under-engineered-toggles-too.html
- Scott O'Hara — Checkbox as switch: https://scottaohara.github.io/a11y_styled_form_controls/src/checkbox--switch/
- Kitty Giraudel — An Accessible Toggle: https://kittygiraudel.com/2021/04/05/an-accessible-toggle/
- Reka UI — Switch: https://reka-ui.com/docs/components/switch
- WCAG 2.2 — Understanding SC 4.1.2 Name, Role, Value: https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html
- WCAG 2.2 — Understanding SC 2.5.8 Target Size (Minimum): https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- Chris Ferdinandi — Forced Colors Mode: https://gomakethings.com/forced-colors-mode/
- Tailwind CSS — forced-color-adjust: https://tailwindcss.com/docs/forced-color-adjust

**Gerarchia e struttura delle impostazioni**
- Android Developers — Settings (design patterns): https://developer.android.com/design/ui/mobile/guides/patterns/settings
- Nielsen Norman Group — Progressive Disclosure: https://www.nngroup.com/articles/progressive-disclosure/
- Nielsen Norman Group — How Chunking Helps Content Processing: https://www.nngroup.com/articles/chunking/
- UX Myths — Myth #23: Choices should always be limited to 7±2: https://uxmyths.com/post/931925744/myth-23-choices-should-always-be-limited-to-seven
- Findlater & McGrenere, CHI 2004 — A Comparison of Static, Adaptive, and Adaptable Menus: https://www.cs.ubc.ca/labs/imager/tr/2004/findlater04menus/ · https://dl.acm.org/doi/10.1145/985692.985704
- GNOME HIG — Switches: https://developer.gnome.org/hig/patterns/controls/switches.html
- GNOME HIG — Boxed Lists: https://developer.gnome.org/hig/patterns/containers/boxed-lists.html

**Impostazioni interdipendenti**
- Nielsen Norman Group — Checkboxes vs. Radio Buttons: https://www.nngroup.com/articles/checkboxes-vs-radio-buttons/
- Adrian Roselli — Don't Disable Form Controls: https://adrianroselli.com/2024/02/dont-disable-form-controls.html
