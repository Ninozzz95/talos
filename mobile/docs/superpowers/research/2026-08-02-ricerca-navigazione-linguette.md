# La grammatica delle linguette — ricerca web per il refactor UI

Data: 2026-08-02
Stato: **ricerca. Nessuna implementazione, nessun file di sorgente toccato.**
Trigger: owner — "l'app ha quattro linguette diverse e due non dichiarano
nemmeno `role="tablist"`; cerca sul web come lo risolvono i migliori."
Ambito: TALOS mobile (Android, Capacitor 8 + Vue 3.5 + Tailwind v4 + Reka UI 2.10).

Nota sulle fonti: dove una pagina ufficiale è renderizzata in JavaScript e non
si lascia leggere da un fetch (è il caso di `m3.material.io` e di
`developer.apple.com/design`), lo dico esplicitamente e cito il mirror o la
fonte secondaria da cui viene la citazione. Dove non ho trovato conferma,
scrivo **non confermato** invece di riempire il buco.

---

## 0. Cosa c'è già in casa: non quattro grammatiche, cinque

Prima di guardare fuori conviene contare bene, perché il numero cambia la
diagnosi. Nel sorgente ci sono **cinque** modi diversi di dire "scegli una
vista", e la frattura non è dove sembra.

Tre usano davvero `TabsRoot` di Reka UI — quindi `role="tablist"` c'è, generato
a runtime, ed è per questo che un grep su `role="tablist"` nel sorgente non
trova niente. **Sottolineatura**: le sezioni del Model Lab (`providers` /
`catalog` / `onDevice`) con `border-b-2` sull'accento, in
`src/components/talos/settings/TalosMobileSettingsModelsPanel.vue:32`.
**Riquadro con traccia** (un segmented control a tutti gli effetti): le sezioni
del Doctor, `grid grid-cols-3` dentro un `rounded-xl border p-1` con lo sfondo
attivo pieno, in `src/screens/DoctorScreen.vue:289`. **Chip con bordo**: le
sezioni di Aspetto, `rounded-md border-transparent` che al selezionato diventa
bordo accento + sfondo pannello, appiccicate in alto (`sticky`) e con swipe
orizzontale, in
`src/components/talos/settings/TalosMobileSettingsAppearancePanel.vue:147`.

Il quarto è il caso interessante:
`src/components/talos/settings/TalosMobileSettingsCenter.vue:184` usa
`TabsRoot orientation="vertical"`, ma sul telefono non si comporta affatto da
tablist — è un **master-detail**: tocchi una categoria, la lista sparisce
(`mobilePane === 'detail' ? 'hidden' : 'block'`), il pannello prende tutto lo
schermo e compare un "indietro" (`sheetNav.setSubView({ title, back })`). È una
navigazione travestita da linguette, ed è esattamente il caso che le linee guida
ARIA dicono di non modellare come tabs (§3).

Il quinto non dichiara niente: **pillole piene** `rounded-full` con sfondo
accento e `aria-pressed`, in `src/screens/ContextScreen.vue:782` (filtro per
tipo nella Libreria) e in
`src/components/chat/TalosMobileChatMediaPanel.vue:658-670` — dove la costante
si chiama letteralmente `TABS` e la variabile `tab`, ma il contenitore è
`role="group"` e i figli sono bottoni a due stati. Stessa idea, due gradi di
semantica diversi, zero coerenza per chi ascolta invece di guardare.

Da tenere a mente per dopo: `src/App.vue:690` fa già la cosa **giusta** per la
navigazione vera — `:aria-current="item.name === activeRoute ? 'page' : undefined"`
sui link di rotta. La distinzione che serve al refactor è quindi già nel
codice, applicata in un posto solo.

---

## 1. Come lo risolvono i migliori

### 1a. Gli assistenti

Premessa metodologica onesta: i quattro prodotti sono SPA dietro autenticazione,
quindi **non ho potuto ispezionare il DOM di nessuno**. Di conseguenza non ho
prova diretta di `role="tablist"` o `aria-selected` per nessuno dei quattro, e
— dettaglio importante — **per nessuno dei quattro ho trovato una fonte che
dichiari il trattamento visivo** (sottolineatura, riquadro pieno, pillola,
bordo). Le fonti nominano il controllo ("tabs", "horizontal bar", "switcher")
ma non lo stile. Mobbin risponde 403 all'accesso automatico. Quindi la domanda
"quando usano tabs vs segmented control vs pillole" si può rispondere sul
**quando**, non sul **come**.

**Perplexity è l'unico dei quattro con linguette vere, e le ha in tutti e due i
sensi.** In-pagina, le linguette della risposta sono ufficiali: "You can now
instantly access search results including Links, Images, Videos, Shopping,
Places, and more directly from the top of each thread… These updates are live on
web and **coming soon to iOS and Android**"
(<https://www.perplexity.ai/changelog/what-we-shipped---december-5th>, 4–5
dicembre 2025). Ed è l'unico con una barra di linguette in fondo — Home /
Discover / Spaces / Library (<https://www.testingdocs.com/perplexity-ai-tutorials/>,
corroborato dalla scheda App Store che nomina Discover e Library). Non è un
caso: Perplexity è l'unico dei quattro il cui modello di prodotto è "un
risultato di ricerca con modalità", che è **esattamente ciò per cui le
linguette esistono**. Due dettagli rubabili: le fonti hanno **sia** una
linguetta **sia** un pannello laterale ("Links Tab: peer navigation alongside
Answer/Images tabs" e "Sources Sidebar… keeping the answer visible while
reviewing references", <https://aiuxplayground.com/teardowns/perplexity/citations/>,
15 giugno 2026) — due porte per lo stesso dato, come da dottrina interna; e la
striscia sembra **dipendere dalla query**, cioè le linguette compaiono solo dove
quella modalità ha risultati (dedotto dal confronto fra l'elenco del changelog e
i teardown, **non confermato** da fonte esplicita).

**ChatGPT non tabbizza la risposta, e non ha barra in fondo.** Il thread resta
una superficie continua con collassabili — scelta descritta come deliberatamente
opposta a Perplexity (<https://aiuxplayground.com/teardowns/compare/output-artifacts-refinement/>,
11 luglio 2026). La cosa più vicina a una striscia segmentata è **dentro il
cassetto**: "the sidebar menu is now simplified on iOS and Android. ChatGPT
experiences available to you based on your plan and usage—like Images, Codex,
Pulse, and Apps—now appear in a **horizontal bar above your chats and projects**"
(<https://help.openai.com/en/articles/6825453-chatgpt-release-notes>, 26 marzo
2026). Il cambio di modalità non è una linguetta ma un "**global switcher**"
Chat/Work e ChatGPT/Codex (stessa fonte, 16 luglio 2026). Da segnalare come
monito: quando a giugno 2026 hanno collassato i pinnati in una sola sezione e
spinto i GPT dietro un menu "More", la critica è stata immediata e centrata —
collassare nasconde proprio gli elementi che l'utente aveva marcato come
importanti (<https://www.popularai.org/p/chatgpt-sidebar-pinned-chats-gpts-projects-missing>).

**Claude è il più utile dei quattro, perché Anthropic documenta i propri
errori.** Sul desktop le linguette esistono e si chiamano così: Chat / Cowork /
Code in cima, più linguette di impostazioni e linguette in-pannello (All /
Organization nella directory dei plugin) — tutto datato nel changelog ufficiale
(<https://claude.com/docs/cowork/changelog>). Due righe di quel changelog valgono
metà di questa ricerca. La prima, 9 luglio 2026: *"Fixed the app **forgetting
your last-used tab** (for example Code) after an update or re-login"* — cioè la
linguetta scelta **deve** sopravvivere al riavvio, e non sopravviveva. La
seconda, 21 luglio 2026: *"Improved keyboard and screen reader support across the
app: **settings tabs and share-visibility choices respond to arrow keys**…"* —
cioè il contratto da tastiera del pattern ARIA (un solo Tab stop, frecce dentro)
è arrivato **dopo**, come correzione. Anthropic non dice `role="tablist"`, quindi
l'attributo resta **non confermato**; ma il comportamento documentato è la firma
del pattern, ed è stato trattato come un bug da chiudere. Hanno applicato la
stessa dottrina ai pulsanti azione di un messaggio, resi "a **single Tab stop,
with arrow keys** to move between them" (25 giugno 2026).

E c'è il dettaglio che riguarda direttamente il nostro one-up: **su web e
mobile, Claude mette il cambio di modalità dentro il composer, non nella
cromatura.** La documentazione ufficiale dice di selezionare "Cowork" *"in the
bottom left corner"* della casella del messaggio, e "Chat" per tornare indietro
(<https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile>).
Anthropic non lo chiama mai né tab né toggle né switcher. È la stessa mossa di
Raycast (§1b) fatta da un prodotto di chat: **il selettore vive sulla superficie
che l'utente sta già guardando.** Sul desktop stavano però testando la mossa
opposta, portando il toggle Chat/Cowork dalla barra del prompt alla cima della
finestra, "mirroring OpenAI's approach"
(<https://www.testingcatalog.com/anthropic-tests-new-placement-for-projects-on-claude-desktop/>,
20 luglio 2026, test A/B, non rollout).

**Gemini ha rinunciato del tutto alle linguette.** Il redesign del 3 maggio 2026
"moves away from traditional bottom tab navigation. Instead, Google implements a
**navigation drawer**", con il selettore di modello tornato a un dropdown in alto
a sinistra e gli strumenti (Images, Videos, Music, Canvas, Deep research, Guided
learning) presentati "in a unified **list** format"
(<https://9to5google.com/2026/05/03/gemini-full-redesign/>; il cassetto era
arrivato già a giugno 2025, <https://9to5google.com/2025/06/16/gemini-nav-drawer-android/>).
Cassetto, lista, dropdown: niente tabs, niente segmented, niente barra in fondo.
E qui c'è una prova indiretta che vale la pena notare: l'Accessibility
Conformance Report pubblico di Gemini (dicembre 2025,
<https://services.google.com/fh/files/misc/google_gemini_desktop_vpat.pdf>) elenca
i difetti componente per componente — Left Navigation sotto 2.1.1 (tastiera),
2.4.3 (ordine di focus) **e** 4.1.2 (nome/ruolo/valore) contemporaneamente, più
combo box, breadcrumb e "missing menu role attributes" — e **non nomina mai
tabs o tablist**. Coerente con un prodotto che il pattern non lo usa.

**Le tre lezioni che i quattro danno insieme.** Primo: **la risposta non si
tabbizza mai, tranne in Perplexity** — e Perplexity è l'unico che non è un
prodotto di chat. Secondo: **nessuno dei quattro pubblica la semantica ARIA
delle proprie linguette**, e i due unici artefatti pubblici (il changelog
Anthropic e l'ACR Google) raccontano la stessa storia — questi controlli sono
stati spediti **senza** i ruoli e la tastiera giusti, e sistemati dopo. Terzo, ed
è la direzione di marcia di tutti e tre i chat-shaped: **si sta consolidando, non
proliferando.** Perplexity ha fuso cinque verticali della home in un menu solo
(<https://releasebot.io/updates/perplexity-ai>, 27 luglio 2026), ChatGPT ha
collassato i pinnati e nascosto i GPT dietro "More", Gemini ha messo gli
strumenti in una lista unica. Nessuno sta aggiungendo strisce di linguette.

### 1b. I prodotti che la navigazione la fanno di mestiere

Qui il risultato è secco e va detto senza attenuanti: **Linear, Raycast, Arc e
Things 3 non hanno il problema che abbiamo noi, perché quasi non usano le
linguette.**

**Linear** mette tutte le destinazioni in una barra laterale e le viste
filtrate diventano oggetti salvabili, non schede: qualunque lista filtrata si
congela in una custom view con `Option/Alt V`
(<https://linear.app/docs/custom-views>), e ogni destinazione ha due o tre porte
diverse — voce in sidebar, scorciatoia da tastiera, command menu — mai un'altra
striscia di cromatura. Le uniche vere linguette che ho trovato sono le quattro
dentro *My Issues* (assegnate / create / sottoscritte / attività recente,
<https://linear.app/docs/my-issues>): quattro sfaccettature di **un solo**
concetto, in fondo alla gerarchia, mai in cima. Sul mobile, e questo è il
dettaglio che conta di più, la barra in basso **non è cromatura fissa**: è
riordinabile dall'utente e ci si possono appuntare progetti e documenti
arbitrari (<https://linear.app/changelog/2026-01-22-customize-your-navigation-in-linear-mobile>,
22 gennaio 2026). La navigazione è trattata come dato dell'utente, non come
layout del designer. Nel redesign del 2024 hanno esplicitamente **rifiutato** di
toccare l'architettura di navigazione — "I made the call to focus purely on a
redesign" — perché cambiarla significava lavoro d'ingegneria e rischio
(<https://linear.app/now/how-we-redesigned-the-linear-ui>, 28 marzo 2024).

**Raycast** è il caso limite: nell'API pubblica delle estensioni **non esiste un
componente Tabs**. I componenti di alto livello sono quattro — `List`, `Grid`,
`Detail`, `Form` (<https://developers.raycast.com/api-reference/user-interface>) —
e la navigazione è uno stack push/pop, con `ESC` che fa pop automatico
(<https://developers.raycast.com/api-reference/user-interface/navigation>). La
risposta di Raycast alla domanda "e se l'utente deve scegliere fra più viste?"
è la cosa più direttamente rubabile di tutta questa ricerca: **il selettore di
vista sta dentro la barra di ricerca che l'utente sta già guardando**. Il prop
si chiama `searchBarAccessory` ed è "a List.Dropdown that will be shown in the
right-hand-side of the search bar", richiamabile con `⌘P`
(<https://developers.raycast.com/api-reference/user-interface/list>). Zero
cromatura verticale aggiunta, zero nuova banda di UI, un solo posto dove
guardare. La motivazione di fondo è dichiarata: l'obiettivo di progetto era
evitare che ogni estensione inventasse il proprio paradigma di interfaccia —
"we avoid a second-class mini-app… where developers use technology X and user
interface paradigm Y"
(<https://www.raycast.com/blog/how-raycast-api-extensions-work>, 31 maggio 2023).
È letteralmente il nostro problema, risolto togliendo il componente dal
catalogo.

**Things 3** non ha linguette da nessuna parte: barra laterale di liste, e la
differenziazione dentro una vista si fa **raggruppando** invece che aggiungendo
un controllo (Oggi si può raggruppare per progetto o area, Anytime fa
galleggiare in cima i to-do senza genitore,
<https://culturedcode.com/things/support/articles/4001304/>). Il pezzo forte è
Quick Find, che "combines navigation and search into a single function"
(<https://culturedcode.com/things/support/articles/2803584/>): cinque viste
reali e utili — Tomorrow, Deadlines, Repeating, All Projects, Logged Projects —
esistono **solo** dietro la palette, senza nessuna cromatura dedicata. È la
formulazione più pulita della dottrina: la palette assorbe la coda lunga, ed è
questo che impedisce alla cromatura di moltiplicarsi.

**Arc** è il contro-esempio, e va letto per intero prima di innamorarsi
dell'idea di abolire le linguette. Arc ha sostituito la barra delle schede con
sidebar + Spaces, ha unificato tutto sotto `⌘T` come barra comandi
(<https://start.arc.net/command-bar-actions>) — e The Browser Company ha
pubblicamente attribuito a questo il fallimento del prodotto. Dalla lettera del
26 maggio 2025 (<https://browsercompany.substack.com/p/letter-to-arc-members-2025>):
"we started running into something we called the **'novelty tax'** problem";
"Arc was simply **too different, with too many new things to learn, for too
little reward**"; e il numero che fa male, **"Only 5.52% of DAUs use more than
one Space regularly"**. Il meccanismo elaborato di cambio-vista veniva usato
oltre la prima istanza da circa un utente su diciotto. La lezione non è "non
innovare": è che gli altri tre — Linear, Raycast, Things — **non hanno inventato
nessuna primitiva nuova**. Hanno preso un contenitore noioso e familiare
(sidebar, campo di ricerca, lista) e l'hanno reso velocissimo.

La sintesi in una riga: **i prodotti bravi a navigare non scelgono fra tabs,
segmented control e pillole — attaccano il selettore a una superficie che esiste
già, e mandano tutto il resto nella palette.**

E i due gruppi dicono la stessa cosa da direzioni opposte. Gli assistenti la
dicono per sottrazione (tre su quattro non hanno linguette in cima e stanno
riducendo le superfici visibili); i prodotti di mestiere la dicono per
costruzione (una gerarchia sola, due o tre porte per destinazione, la palette
che assorbe la coda lunga). L'unico che le linguette le usa davvero, Perplexity,
le usa dove servono per definizione — modalità diverse dello stesso risultato —
e non per navigare.

Onestà sul confronto: **non posso affermare quante grammatiche *visive* abbia
ciascuno degli otto**, perché per i quattro assistenti il trattamento visivo non
è verificabile (§1a). Quello che posso affermare è la cosa più utile comunque:
in nessuno degli otto ho trovato **due ruoli diversi assegnati allo stesso
controllo**, né una fonte che descriva grammatiche concorrenti dentro la stessa
app. Le nostre cinque, invece, non sono una stima: sono lettura diretta del
sorgente, e due di esse non dichiarano nemmeno un ruolo.

---

## 2. Le linee guida: Material 3 e Apple HIG

**Material 3 distingue primary e secondary tabs per gerarchia, non per gusto.**
Le primary "are placed at the top of the content pane under an app bar. They
display the main content destinations" e vanno usate "when just one set of tabs
are needed"; le secondary sono "used within a content area to further separate
related content and establish hierarchy" e sono "necessary when a screen
requires more than one level of tabs"
(<https://github.com/material-components/material-components-android/blob/master/docs/components/Tabs.md>
e <https://developer.android.com/develop/ui/compose/components/tabs>). La
differenza visiva non è decorativa: la primary ha l'indicatore più spesso e usa
il colore primario, la secondary un indicatore più sottile sul colore
secondario. **Tradotto su di noi**: le sezioni del Model Lab sono secondary
tabs dentro Impostazioni → Modelli; le sezioni di Aspetto sono secondary tabs;
le sezioni del Doctor sono secondary tabs. Non abbiamo, in tutta l'app, un
singolo caso legittimo di primary tab — e questa è già metà della risposta al
perché ne abbiamo quattro stili.

Su fisso contro scorrevole M3 è netto: le fixed tabs "don't scroll to reveal
more tabs; the visible tab set represents the only tabs available", le
scrollable sono "displayed without fixed widths… such that some tabs will
remain off-screen until scrolled" (stessa fonte). Le regole negative — non usare
le tabs per contenuto sequenziale che va letto in ordine, non usarle per
confrontare contenuti fra loro, non usarle come barra di navigazione in fondo
allo schermo — le ho trovate nella documentazione Material ma **non ho potuto
verificarle sulla pagina M3 ufficiale**: `m3.material.io/components/tabs/guidelines`
è renderizzata in JavaScript e restituisce solo il titolo a un fetch. Le
riporto quindi come provenienti dal corpus Material via ricerca, non come
citazione verificata dalla pagina.

**Le segmented button di M3 non sono linguette, e M3 lo dice.** Funzionano
meglio con 2–5 opzioni, servono a "select options, switch views, or sort
elements", e la formulazione ricorrente nel corpus è che non sono un
rimpiazzo delle tabs e non devono reggere navigazione pesante
(<https://m3.material.io/components/segmented-buttons/guidelines> — anche questa
non fetchabile, riporto la sintesi di ricerca). Il discriminante visivo che ho
trovato più utile, e che spiega il nostro Doctor: **in un segmented control gli
elementi sono uniti da una traccia; se sono separati, sono linguette**
(<https://note.com/tajima7878/n/ne1e50bf12cad>, secondaria). Il Doctor ha la
traccia (`rounded-xl border p-1`): è un segmented control con la semantica di
un tablist.

**Apple HIG sui segmented control** è la parte più quantitativa di tutta la
ricerca. La pagina viva (<https://developer.apple.com/design/human-interface-guidelines/segmented-controls>)
non è fetchabile, ma il mirror archiviato delle iOS HIG dà le frasi esatte
(<https://codershigh.github.io/guidelines/ios/human-interface-guidelines/ui-controls/segmented-controls/index.html>):
"On iPhone, a segmented control should have **five or fewer segments**";
"Within the control, all segments are **equal in width**"; "Try to keep segment
content size consistent. Because all segments have equal width, it doesn't look
great if content fills some segments but not others"; "**Avoid mixing text and
images** in a segmented control… mixing the two in a single control can lead to
a disconnected and confusing interface". La versione corrente aggiunge l'uso
canonico — "Use a segmented control to provide closely related choices that
affect an object, state, or view" — e due divieti: niente azioni (aggiungere,
rimuovere, modificare) dentro un segmented control, e su iOS evitarli nelle
toolbar perché cambiano contesto invece di agire sul contenuto corrente
(<https://raw.githubusercontent.com/tmaasen/apple-dev-mcp/b82f0efe2115dc4539c83a2374a714a84aeb350a/content/universal/segmented-controls.md>,
mirror testuale delle HIG universali).

**Cosa ci dicono queste due linee guida messe insieme.** Il nostro Doctor ha 3
segmenti di larghezza uguale con etichette di lunghezza simile: è conforme.
Aspetto ha 3 chip di larghezza variabile e scorrevoli: è un ibrido che non è né
l'uno né l'altro. Il Model Lab ha 3 linguette `flex-1` **con icona più testo** —
e quel mix icona+testo è precisamente quello che le HIG scoraggiano in un
segmented control, mentre M3 lo ammette per le tabs. Il fatto che due dei tre
controlli siano difendibili solo sotto linee guida *diverse* è la prova che il
problema è la mancanza di una regola, non l'estetica dei singoli.

---

## 3. Accessibilità: quando il pattern ARIA è **sbagliato**

### La regola, in una frase

Il pattern ARIA Tabs descrive "a set of layered sections of content, known as
tab panels, that display **one panel of content at a time**", con la lista di
tab "arranged along one edge of the **currently displayed panel**"
(<https://www.w3.org/WAI/ARIA/apg/patterns/tabs/>). Le due condizioni sono
congiunte: i pannelli stanno **nella stessa pagina** della lista, e la lista
resta **visibile accanto** al pannello. Se toccare una "linguetta" porta a una
schermata nuova, non è una linguetta: è un link, e va marcato come navigazione.
La formulazione che ho trovato più diretta — "If clicking a 'tab' loads a new
page, it is not a tab, it is a link. Use `<nav>` with a list of links and skip
the entire tab pattern" — viene da una fonte secondaria
(<https://getaccessguard.com/posts/accessible-accordions-and-tabs-two-patterns-everyone-confuses>),
ma è la stessa distinzione che fa NN/g fra "in-page tabs" e "navigation tabs",
con la regola di non mescolarle mai
(<https://www.nngroup.com/articles/tabs-used-right/>).

Heydon Pickering lo dice ancora meglio, ed è la frase da appendere al muro:
"we'd be making a table of contents **appear** like a tab list. We should avoid
this since users who **see** tabs expect certain behaviors not offered by a
simple list of links" (<https://inclusive-components.design/tabbed-interfaces/>).
La sua raccomandazione generale è di restrizione: "Don't provide tabbed
interfaces unless they are suited to the use case and are likely to be
understood and appreciated by the user."

L'attributo giusto per la navigazione è un altro. `aria-selected` vale sui ruoli
di selezione (`tab`, `option`, `row`, `gridcell`); per dire *dove sei* si usa
`aria-current="page"` — e MDN è esplicita nel divieto incrociato: non usare
`aria-current` come sostituto di `aria-selected` su `tab`, e viceversa non
usare `aria-selected` su un link, dove semplicemente non ha effetto sui lettori
di schermo (<https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-current>,
<https://www.stefanjudis.com/blog/aria-selected-and-when-to-use-it/>).

**Applicato a noi**, il verdetto è chiaro e riguarda il caso più grosso:
`TalosMobileSettingsCenter.vue` è un `tablist` verticale che sul telefono
**nasconde la lista** e mette il pannello a tutto schermo con un pulsante
indietro. Non soddisfa nessuna delle due condizioni del pattern. Su tablet
(`md:`), dove lista e dettaglio stanno affiancati, il `tablist` è difendibile;
sul telefono no. È lo stesso componente che si comporta in due modi diversi a
seconda della larghezza, quindi la semantica va scelta in funzione del layout,
non del componente — oppure va scelta la navigazione (link + `aria-current`)
per entrambi, che è l'opzione più semplice e quella che l'app già usa in
`App.vue:690`.

Nell'altro senso, le pillole di `ContextScreen.vue:782` e
`ChatMediaPanel.vue:658` sono bottoni con `aria-pressed`, cioè **N interruttori
indipendenti**: un lettore di schermo annuncia "premuto / non premuto" su
ciascuno, e non dice mai né *quanti sono* né *qual è quello attivo del gruppo*.
Non sono la scelta sbagliata in assoluto — sono filtri dentro una vista, quindi
`tablist` sarebbe sbagliato — ma il ruolo giusto per una scelta singola
mutuamente esclusiva è `radiogroup` con `aria-checked`, non un gruppo di toggle.
Almeno `ChatMediaPanel` ha un `role="group"` con `aria-label`; `ContextScreen`
non ha nemmeno quello.

### Tastiera e focus, e perché ci riguarda anche su un telefono

Il pattern impone un roving tabindex: `Tab` entra sulla tab attiva e poi esce
verso il pannello, le frecce si muovono **dentro** la lista, `Home`/`End`
saltano agli estremi, tutte le tab non attive hanno `tabindex="-1"` e l'attiva
`tabindex="0"` (<https://www.w3.org/WAI/ARIA/apg/patterns/tabs/>,
<https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/tab_role>).
MDN raccomanda esplicitamente `<button>` come elemento portante del ruolo `tab`
"for their built-in functional and accessible features", e avverte che non
esiste una combinazione HTML+CSS che dia lo stesso risultato senza JavaScript.
Reka UI implementa già tutto questo con il suo `RovingFocusGroup`
(<https://reka-ui.com/docs/utilities/roving-focus>,
<https://reka-ui.com/docs/components/tabs>), quindi per noi non è lavoro da
fare — è lavoro da **non buttare via** riscrivendo a mano righe di bottoni.
E ci riguarda davvero, perché TALOS ha già una lane tablet con tastiera.

Che non sia teoria lo dimostra chi ci è passato: Anthropic ha dovuto spedire
una correzione perché le linguette delle impostazioni **non rispondevano alle
frecce** — "settings tabs and share-visibility choices respond to arrow keys"
(<https://claude.com/docs/cowork/changelog>, 21 luglio 2026) — e Google, nel
proprio ACR, si porta la navigazione sinistra segnata sotto 2.1.1, 2.4.3 e
4.1.2 in una volta sola
(<https://services.google.com/fh/files/misc/google_gemini_desktop_vpat.pdf>,
dicembre 2025). Il contratto da tastiera è la parte che tutti dimenticano per
prima. Noi, per una volta, siamo nella posizione buona: Reka UI ce lo dà gratis
nei tre punti dove `TabsRoot` è usato — e non ce l'ha nei due dove abbiamo
scritto i bottoni a mano.

C'è però un dettaglio che oggi **sbagliamo**. L'APG raccomanda l'attivazione
automatica al focus solo se i pannelli compaiono senza latenza percepibile, e
l'esempio ufficiale lo stringe ulteriormente: "Automatic activation of tabs
**only in** circumstances where panels can be displayed instantly, i.e., all
panel content is present in the DOM"
(<https://www.w3.org/WAI/ARIA/apg/patterns/tabs/examples/tabs-automatic/>).
`TalosMobileSettingsModelsPanel.vue:56` usa `activation-mode="automatic"`, ma il
pannello `onDevice` monta `TalosMobileLocalModels.vue`, che all'`onMounted`
chiama `talosLocalEngineStatus()` (riga 119). Scorrere la striscia con le frecce
da tastiera monta e interroga il motore locale a ogni passaggio. Stessa cosa per
`SettingsCenter`, dove i pannelli sono pesanti. La regola sana: **automatic solo
per pannelli già nel DOM e istantanei; manual dove il pannello fa lavoro.**
L'altra raccomandazione da adottare è rendere i `tabpanel` focalizzabili
(`tabindex="0"`) quando il primo elemento del pannello non è focalizzabile —
altrimenti da tastiera si esce dalla lista e si finisce oltre il contenuto.

### TalkBack: la notizia buona e quella cattiva

La notizia buona, ed è controintuitiva: **in una WebView le linguette ARIA sono
supportate meglio delle linguette native Android.** Su contenuto web "a screen
reader such as TalkBack… will announce an appropriate role for almost all UI
elements on the page", mentre nelle app native "only certain roles are
announced" (<https://tetralogical.com/blog/2022/07/07/android-accessibility-roles-and-talkback/>).
Quanto sia messa male la strada nativa lo documenta Deque: su una `TabWidget`
Android "the default announcement is only the text (if any) in the current tab…
It does not announce it's state – whether the tab is selected or not – nor where
the current tab lies in the entire TabWidget… It also does not announce it's
role – that it is a tab" (<https://www.deque.com/blog/tabbed-navigation/>), e per
avere ruolo, stato e posizione bisogna sovrascrivere `getContentDescription` a
mano. Chrome, dal canto suo, ha il macchinario per mappare la semantica web
sulle API Android: mette `Chrome role`, `roleDescription` e `targetUrl` negli
extras di `AccessibilityNodeInfo`, popola `CollectionInfo`/`CollectionItemInfo`
per le collezioni e "make[s] heavy use of the state description to try and
capture the richness of the web"
(<https://chromium.googlesource.com/chromium/src/+/112.0.5615.165/docs/accessibility/browser/android.md>).
Essere Capacitor, per una volta, è un vantaggio.

La notizia cattiva è che **non esiste una matrice di supporto pubblica e
aggiornata** per `role="tab"` con TalkBack. Su a11ysupport.io la scheda del
ruolo `tab` è vuota — "No expectations have been created for this feature yet"
(<https://a11ysupport.io/tech/aria/tab_role>). L'unica tabella che ho trovato con
un verdetto esplicito per TalkBack + Chrome è di **ottobre 2015** e segna "No"
per `tab`/`tablist` (<http://mraccess77.github.io/test_results/ARIA_Mobile_Browser_Support.html>):
undici anni fa, su Android 5/6 e Chrome 40–46. **Non la userei per decidere
niente**, e la cito solo perché è l'unica che esiste. La conclusione onesta è
che l'annuncio esatto di TalkBack sulle nostre linguette **va misurato sul
OnePlus**, non dedotto: è una riga di test manuale, non una ricerca.

---

## 4. Quando non ci stanno: le linguette scorrevoli

La ricerca su questo punto è più severa di quanto ci si aspetti. NN/g: "When the
number of tabs overflows the tab list, the tab bar often becomes a carousel… the
hidden tabs become **less discoverable**, and the interaction cost needed to
access them increases, as users need to manipulate secondary controls to reveal
those tabs" (<https://www.nngroup.com/articles/tabs-used-right/>). Stessa fonte,
altre due regole utili: mai impilare le linguette su più righe ("Websites and
simple apps should avoid stacking tab lists within one tab control"), etichette
di 1–2 parole, mai tutto maiuscolo perché "all caps negatively impacts
legibility", e **sempre una linguetta selezionata di default**.

Baymard porta i numeri sul campo, e sono numeri di test con utenti veri: il 29%
dei siti usa ancora tab orizzontali per le sezioni principali di scheda
prodotto, e i partecipanti "repeatedly overlooked core product content" nascosto
dietro le tab — "So, where did the reviews go?" dopo aver percorso tutta la
pagina. Sul mobile aggiungono il problema specifico: "Some tabs themselves become
hidden, requiring horizontal scrolling to discover them". La loro conclusione è
la più direttamente applicabile al nostro caso: **le tab orizzontali sono
accettabili solo per *sottosezioni* dentro un'area di contenuto, mai per le
sezioni portanti** (<https://baymard.com/blog/avoid-horizontal-tabs>).

Su cosa fare quando comunque non ci stanno, la risposta convergente è: **scorri,
non andare a capo**, e fai vedere che c'è dell'altro. Carbon rende le tab
scorrevoli con frecce laterali quando eccedono lo spazio, e la parte importante
è l'accessibilità: le frecce servono al mouse, "these are not needed for
keyboard users and **they are not in the focus order**", mentre da tastiera "the
user presses the arrow key, which moves the focus to the next tab item and,
where necessary, **scrolls the tablist to keep the selected item visible**"
(<https://carbondesignsystem.com/components/tabs/usage/> e
<https://carbondesignsystem.com/components/tabs/accessibility/> — le due pagine
si troncano al fetch, riporto la sintesi di ricerca). Il resto sono buone
pratiche da fonti secondarie ma coerenti fra loro: far spuntare la linguetta
successiva dal bordo come indizio, tenere i bersagli a 48×48, e considerare che
su mobile il tetto pratico è 4–5 linguette
(<https://www.setproduct.com/blog/tabs-ui-design>).

**Cosa NON funziona su touch, e qui la fonte è Android stesso.** Lo swipe
orizzontale per cambiare linguetta collide con la navigazione a gesti: "The new
system gesture for back is an **inward swipe from either the left or the right
edge of the screen**", e i caroselli sono citati come caso tipico di conflitto;
l'unico rimedio è dichiarare le zone da escludere con
`View.setSystemGestureExclusionRects()`, introdotta in Android 10
(<https://developer.android.com/develop/ui/views/touch-and-input/gestures/gesturenav>,
<https://medium.com/androiddevelopers/gesture-navigation-handling-gesture-conflicts-8ee9c2665c69>).
Il nostro `TalosMobileSettingsAppearancePanel.vue:158-169` implementa lo swipe a
mano, con soglia 56px e dominanza orizzontale 1.5× — la logica è corretta e
protegge lo scroll verticale, ma **parte dai bordi il sistema se lo prende
prima**, e quel `Rect` di esclusione è un'API nativa che una WebView Capacitor
non applica da sola. Peggio: lo swipe esiste **solo lì**. Nel Model Lab e nel
Doctor non c'è. Un gesto che funziona in una schermata su cinque è peggio di un
gesto che non c'è, perché insegna un'aspettativa e poi la tradisce — è
esattamente la "novelty tax" di Arc in miniatura.

---

## 5. Lo stato sopravvive al ritorno?

Oggi, da noi, **quasi mai**. `SettingsCenter` fa `const activeTab = ref('models')`
(riga 36), `SettingsModelsPanel` fa `ref('providers')` (riga 13),
`AppearancePanel` fa `ref('design')` (riga 155), `DoctorScreen` fa
`ref('status')` (riga 70). Tutte tornano al punto di partenza a ogni visita. C'è
un mezzo aggancio: `SettingsScreen.vue:11` legge `route.query.tab` e lo passa
come `requestedTab`, e la chat ci naviga dentro con
`router.push({ name: 'settings', query: { tab: 'models' } })`
(`ChatScreen.vue:684`). Ma è **a senso unico**: la query scrive nella linguetta,
la linguetta non riscrive mai la query. Basta che l'utente tocchi un'altra
categoria e l'URL è già bugiardo — e al ritorno si riparte da `models`.

Che questo sia un difetto e non una scelta ce lo dice il repository stesso: in
`src/stores/settings.ts:191-193` c'è `library_view: 'list'` persistito, con il
commento *"Owner 2026-07-25 set grouping on; it just never survived a reopen"* e
il riferimento al debito P6. **Stessa classe di bug, già riconosciuta e già
sanata una volta.** Il precedente c'è; manca la regola generale.

Cosa fanno i migliori. La prova più diretta che questo è un difetto e non una
sfumatura viene da Anthropic, che l'ha corretto come bug: *"Fixed the app
**forgetting your last-used tab** (for example Code) after an update or
re-login"* (<https://claude.com/docs/cowork/changelog>, 9 luglio 2026). Non
"dopo una navigazione": **dopo un aggiornamento e dopo un nuovo login.** La
soglia che un prodotto serio si dà è quella.

Android è esplicito su cosa va salvato: "data stored in
saved state is transient state that depends on user input or **navigation**.
Examples of this can be the scroll position of a list, the ID of the item the
user wants more detail about, **the in-progress selection of user preferences**,
or input in text fields" — e distingue tre casi che vanno trattati diversamente:
cambio di configurazione (rotazione, multi-window), morte del processo mentre
l'utente è altrove, e **congedo volontario** (swipe via da Recents, force-quit,
riavvio), dove "if they return, they expect the screen to start from a clean
state" (<https://developer.android.com/topic/libraries/architecture/saving-states>).
Quest'ultima distinzione è la più preziosa e la più ignorata: non tutto va
ricordato per sempre.

Raycast risolve il problema **a livello di framework**, con un booleano:
`storeValue` — "Indicates whether the value of the dropdown should be persisted
after selection, and **restored next time the dropdown is rendered**"
(<https://developers.raycast.com/api-reference/user-interface/list>). Il valore
memorizzato batte perfino il `defaultValue`. Il punto non è la feature, è **dove
vive**: nel componente, non in ogni schermata. Così non si può dimenticare alla
schermata numero sette su dodici — che è esattamente come ci siamo ridotti noi.

Linear stratifica: c'è un "Default home view" impostabile, che "opens whenever
you close or log out of Linear and re-open/re-login"
(<https://linear.app/docs/account-preferences>), e sopra ci sono le display
options dove le modifiche personali "**persist even if you navigate away from
the current view**" mentre un amministratore può premere "Set as default" per
tutto il workspace (<https://linear.app/docs/display-options>). Una vista, un
default condiviso e un override personale ricordato in silenzio, senza pulsante
"salva".

Sul web la risposta canonica è **mettere la scelta nell'URL**, con un criterio
di decisione secco: "If someone else clicking this URL, should they see the same
state? If so, it belongs in the URL". Tab attive, filtri, modalità vista e
ordinamento sono candidati buoni; stati temporanei di UI (modale aperto,
dropdown espanso) e input non salvati sono candidati cattivi. Due dettagli
operativi: non sporcare l'URL con i valori di default, e usare `pushState` per
le navigazioni deliberate ma `replaceState` per i raffinamenti, per non
inondare la cronologia (<https://alfy.blog/2025/10/31/your-url-is-your-state.html>).
Per le linguette in particolare, la query beats the hash: l'hash fa saltare lo
scroll all'elemento con quell'id e riempie la cronologia, così che il tasto
indietro cicli fra le linguette invece che fra le pagine — la ricetta è
`?tab=…` con `history.replaceState` (<https://css-tricks.com/better-linkable-tabs/>).

**La regola che ne esce, e che va scritta una volta sola:** la linguetta scelta
sta nella query di rotta, in `replaceState`; il default non compare nell'URL;
alla chiusura volontaria dell'app si riparte dal default, ma dentro la sessione e
attraverso la morte del processo la scelta sopravvive. E il codice che lo fa
sta nel componente, non nelle dodici schermate.

---

## 6. ONE-UP: dove sono deboli tutti, e cosa può fare TALOS

Il punto di partenza è che TALOS ha una proprietà che nessuno dei prodotti
studiati ha: **ogni schermata è anche uno strumento chiamabile dal modello**.
Oggi però questa proprietà si ferma sulla soglia. In
`src/lib/mobileCommandRegistry.ts` i comandi si chiamano `open_context_vault`,
`open_doctor`, `open_model_center`, `open_notes`, `open_tasks`: aprono **una
schermata**. Le rotte in `src/lib/mobileRoutes.ts` sono dieci nomi piatti. Il
Model Lab ha tre sezioni interne che nessun comando sa nominare, il Doctor ne ha
tre, Aspetto ne ha tre, Impostazioni ne ha una decina. La richiesta dell'owner —
*"portami dove si imposta la chiave di ricerca"* — oggi può arrivare al massimo a
`settings?tab=…` e poi molla l'utente davanti a una schermata da esplorare a
mano. **Il modello sa aprire le stanze ma non i cassetti.**

### La debolezza comune a tutti quanti

Nessuno dei quattro prodotti di mestiere ha un indirizzo stabile e macchina-leggibile
per *ogni* stato di vista. Linear ha le custom views, ma sono oggetti creati
dall'utente, non un'anagrafe delle sezioni dell'app. Raycast ha `storeValue` e
una navigazione a stack, ma lo stack non ha un URL. Arc ha una barra comandi
potentissima e nessuna nozione di "sezione dentro una schermata". Things nasconde
cinque viste dietro Quick Find, il che è elegante per l'umano e **invisibile a
chiunque non sappia già che esistono**. In tutti e quattro, la mappa della
navigazione vive nella testa del designer e nel codice — mai in una struttura
dati che qualcuno possa interrogare.

Gli assistenti stanno anche peggio, ed è ironico: sono prodotti costruiti attorno
a un modello di linguaggio, e **nessuno dei quattro lascia che il modello
navighi il proprio prodotto**. Si chiede a ChatGPT di aprire le impostazioni
delle immagini e risponde a parole; la striscia orizzontale nel cassetto la
tocca l'utente. Gemini ha rinunciato perfino alle linguette e non ha messo
niente al loro posto che sia interrogabile. È un buco enorme, ed è vuoto perché
per quei prodotti la chat è **il** prodotto, mentre l'app attorno è cromatura.
Per TALOS è il contrario: la chat è la porta, e ogni stazione è già dichiarata
come funzione.

Anche gli standard emergenti si fermano a metà. App Actions di Android permette a
un assistente di raggiungere una destinazione interna via `<url-template>`, con
i parametri estratti dalla frase — `myapp://start{?exercise}` che diventa
`myapp://start?exercise=Running`
(<https://developer.android.com/develop/devices/assistant/action-schema>): è
esattamente la forma giusta, ma è un contratto **verso l'esterno**, verso
Assistant, e va dichiarato a mano in `shortcuts.xml`, capability per capability.
Apple con App Intents fa la stessa cosa con `openAppWhenRun` / `supportedModes:
.foreground` per portare in primo piano una vista specifica
(<https://developer.apple.com/videos/play/wwdc2024/10210/>). Dal lato agenti, MCP
Apps rende un tool capace di renderizzare una UI dentro la conversazione, e cita
fra i casi d'uso i "multi-step workflows" dove l'app fornisce "navigation
controls, action buttons, and **state that persists across interactions**"
(<https://modelcontextprotocol.io/extensions/apps/overview>) — ma è UI *dentro
la chat*, non pilotaggio dell'app ospite. Il caso più vicino al nostro l'ho
trovato in Dynamics 365, dove la risposta MCP include un deep link che apre il
record nel contesto applicativo giusto
(<https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/copilot/mcp/mcp-deep-links>):
la chat risponde **e** consegna l'indirizzo. Nessuno però tratta la mappa delle
viste come un'anagrafe interrogabile dal modello.

### La mossa strutturale

C'è un'osservazione che unisce tutti e cinque i capitoli precedenti, e credo sia
il vero one-up. **Le tre cose che dobbiamo comunque costruire sono la stessa
cosa scritta tre volte.**

Per l'accessibilità serve, per ogni linguetta, un'identità stabile con etichetta,
stato di selezione e posizione nel gruppo — è quello che chiede `aria-selected`
più `aria-controls` più il roving tabindex (§3). Per la persistenza serve, per
ogni linguetta, un identificatore serializzabile da mettere nella query e da
rileggere al ritorno (§5). Per la navigazione pilotata dalla chat serve, per ogni
sezione, un nome che il modello possa pronunciare e un indirizzo dove atterrare.
**Sono tre facce dello stesso registro.** Chi le implementa separatamente le
tiene disallineate per sempre — che è precisamente la condizione attuale, con
`route.query.tab` che conosce le categorie di Impostazioni, Reka UI che conosce i
`value` dei trigger, e il command registry che non conosce nessuno dei due.

Quindi: **una sola dichiarazione per superficie di scelta**, che produce insieme
il markup accessibile, la chiave di persistenza e la voce del catalogo strumenti.
Un `talos.view` (chiamiamolo così) con id stabile, etichetta localizzata,
sinonimi per l'aggancio linguistico, e la dichiarazione di *che tipo* di scelta
è — pannelli affiancati (→ `tablist`), navigazione a schermata piena (→ `nav` +
`aria-current`), o filtro dentro una vista (→ `radiogroup`). La forma visiva
segue dal tipo, non dal gusto: ed è così che le cinque grammatiche diventano tre,
con una regola dietro ciascuna invece di un'abitudine.

Da quel registro discendono, gratis, quattro cose che oggi non abbiamo.
**Indirizzi profondi**: `settings?tab=models&section=onDevice` invece di
`settings?tab=models`, e la chat può finalmente atterrare sul cassetto giusto —
`talos://search-source` porta dove si imposta la chiave di ricerca, non "in
Impostazioni". **Due porte per ogni sezione**, come già impone la dottrina
interna: la stazione e il tool, ma stavolta senza scriverli due volte, perché
sono la stessa dichiarazione. **Un tool `navigate_to` con enum chiuso**: il
modello non inventa rotte, sceglie fra gli id dichiarati, e ogni id ha i suoi
sinonimi, così *"la chiave di ricerca"*, *"searxng"* e *"il motore di ricerca"*
convergono senza che il modello debba indovinare un percorso. E soprattutto
**un invariante testabile**: nessuna schermata è raggiungibile solo a mano.
Un test che itera il registro e verifica che ogni sezione dichiarata abbia un
indirizzo, un'etichetta e una semantica ARIA coerente col suo tipo — è il tipo
di gate che morde davvero, perché fallisce il giorno che qualcuno aggiunge la
sesta grammatica.

C'è un ultimo pezzo che vale la pena rubare, e stavolta due prodotti diversi
convergono sulla stessa mossa. Raycast mette il selettore di vista dentro la
barra di ricerca con `searchBarAccessory`, "shown in the right-hand-side of the
search bar" (<https://developers.raycast.com/api-reference/user-interface/list>);
Anthropic, su web e mobile, mette il cambio di modalità **dentro la casella del
messaggio**, "in the bottom left corner" del composer
(<https://support.claude.com/en/articles/15520349-use-claude-cowork-on-web-desktop-and-mobile>).
Un'utility di produttività e un assistente di chat, partiti da premesse opposte,
arrivano alla stessa conclusione: **il selettore va sulla superficie che l'utente
sta già guardando, non su una banda nuova.** Da noi quella superficie è il
**composer**. Se il registro
delle viste è interrogabile, allora scrivere una destinazione nel composer è già
navigazione — e la striscia di linguette diventa quello che dovrebbe essere: la
scorciatoia visibile per le due o tre destinazioni frequenti, non l'unico modo
di raggiungerne dodici. È la lezione di Things (la palette assorbe la coda lunga)
applicata a un prodotto in cui la palette è, letteralmente, una conversazione.

Con un'avvertenza, e Arc l'ha pagata cara: **la novità va aggiunta accanto al
familiare, non al suo posto**. Il 5,52% di Arc non è un aneddoto, è il costo di
chiedere alle persone di imparare un modello nuovo per fare una cosa vecchia
(<https://browsercompany.substack.com/p/letter-to-arc-members-2025>). Le
linguette restano, ordinate e ridotte a tre grammatiche; la navigazione dalla
chat è la porta **in più**, per chi non sa dove guardare.

---

## 7. Le decisioni che questa ricerca propone

**Tre grammatiche, non cinque, scelte dalla semantica.** *Linguette*
(`tablist` via Reka UI, indicatore a sottolineatura, stile M3 secondary) solo
quando i pannelli stanno nella stessa schermata e la lista resta visibile: Model
Lab, Aspetto, Doctor. *Navigazione* (`nav` + link + `aria-current="page"`, riga
con chevron) quando il pannello sostituisce la schermata: il Centro
Impostazioni sul telefono, come già fa `App.vue:690`. *Filtro*
(`radiogroup` + `aria-checked`, pillole) quando la scelta restringe un elenco
senza cambiare vista: Libreria e pannello media. Il Doctor, con la sua traccia
piena e tre etichette corte di larghezza uguale, è l'unico caso che può restare
un segmented control — ed è conforme alle HIG (≤5 segmenti, larghezze uguali,
niente mix icona/testo). Il mix icona+testo del Model Lab va deciso: o via le
icone, o via l'aspetto da segmented.

**Attivazione manuale dove il pannello lavora.** `activation-mode="automatic"`
solo con pannelli già nel DOM, per la lettera dell'APG. Model Lab e Settings
Center vanno a `manual`.

**Un solo posto che ricorda.** La linguetta attiva nella query di rotta con
`replaceState`, default fuori dall'URL, ripristino dentro la sessione e
attraverso la morte del processo, ritorno al default dopo un congedo volontario.
Implementato nel componente, non nelle dodici schermate — il modello è
`storeValue` di Raycast, il precedente interno è `library_view`.

**Niente swipe finché non è ovunque e non è protetto dal gesto di sistema.** Oggi
esiste in una schermata su cinque e nasce già in conflitto col back gesture di
Android. O si generalizza con l'esclusione delle zone di bordo, o si toglie.

**Il registro delle viste come lavoro fondante, non come rifinitura.** È la cosa
che rende l'accessibilità, la persistenza e la navigazione da chat un
implementazione sola invece di tre, ed è il pezzo che nessuno dei prodotti
studiati ha.

---

## Cosa non ho potuto confermare

- Le pagine ufficiali `m3.material.io/components/tabs/guidelines` e
  `m3.material.io/components/segmented-buttons/guidelines` sono renderizzate in
  JavaScript e restituiscono solo il titolo. Le citazioni Material verificate
  vengono da `material-components-android` su GitHub e da
  `developer.android.com`; il resto è sintesi di ricerca, segnalata come tale.
- Idem per `developer.apple.com/design/human-interface-guidelines/segmented-controls`:
  le frasi esatte vengono da un mirror archiviato delle iOS HIG e da un mirror
  testuale delle HIG universali.
- **Non esiste una matrice di supporto pubblica e recente per `role="tab"` con
  TalkBack.** a11ysupport.io ha la scheda vuota; l'unica tabella con un verdetto
  è del 2015. L'annuncio reale va misurato sul dispositivo.
- Le pagine di Carbon su tabs si troncano al fetch: le due frasi sull'ordine di
  focus delle frecce e sullo scroll da tastiera vengono dalla sintesi di ricerca
  sulle stesse URL, non da una lettura diretta.
- Il numero massimo di linguette raccomandato da M3 non l'ho trovato dichiarato
  in nessuna fonte ufficiale; i tetti citati (5 su iPhone, 4–5 pratici su mobile,
  2–5 per i segmented) vengono rispettivamente da Apple HIG, da un blog di
  design system e dal corpus Material via ricerca.
- **Sui quattro assistenti**: il DOM non è ispezionabile (SPA dietro
  autenticazione) e Mobbin risponde 403. Quindi restano non confermati: il
  **trattamento visivo** di tutti e quattro i controlli (sottolineatura /
  riquadro pieno / pillola / bordo); la presenza di `role="tablist"` o
  `aria-selected` in tutti e quattro; se le "universal tabs" di Perplexity siano
  mai arrivate su iOS e Android; se Claude abbia (o abbia testato) una barra di
  linguette in fondo su iOS — l'unica fonte che lo afferma è inattendibile e non
  corroborata; se la striscia orizzontale di ChatGPT nel cassetto sia scorrevole,
  con sole icone o con etichette. Le note di rilascio degli app store dei due
  prodotti sono inutili allo scopo: dicono solo "bug fixes and improvements".
- Anthropic e Google pubblicano ACR formali per le app mobile, ma quelli di
  Anthropic (iOS maggio 2026, Android maggio 2026 — quest'ultimo copre
  esplicitamente "TalkBack labeling and reading order") sono **dietro richiesta
  di accesso** nel Trust Center e non li ho potuti leggere
  (<https://trust.anthropic.com/>). OpenAI non pubblica alcun VPAT/ACR.
