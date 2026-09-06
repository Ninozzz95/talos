# Registro delle segnalazioni dell'owner — 06/09/2026

> ⛔ **Questo file è il contratto.** Ogni cosa che l'owner ha visto con i suoi occhi e mi ha
> detto sta qui, con l'analisi e lo stato. Una riga si chiude solo quando è **curata E
> riverificata dal vivo**, con la prova nominata. Niente altro chiude una riga.
> Puntato da `.claude/RIPRESA-SESSIONE.md`: sopravvive alla fine di questa sessione.

## Quadro

| # | Cosa ha detto | Superficie | Stato | Prova |
|---|---|---|---|---|
| O-01 | «sistema lo spazio enorme nella parte inferiore della modale» | Intro, primo avvio | ✅ | commit `e9cf5e8f` |
| O-02 | «la modale sessione è ancora senza css» · «altro css mancante» | Foglio «Nuova», palette, menu tasto destro | ✅ | `17c56315` + estrattore CSS riparato + sentinella `.talos-tampone-fine` |
| O-03 | «clicco slider ragionamento e il selettore modello sparisce» | Foglio modello | ✅ | il chiuditore esterno non si registra con `apriSubito` |
| O-04 | «skeleton loader non ci deve essere, logo loading non animato» | Attesa in chat | ✅ | prova T02: `scheletri: 0` |
| O-05 | «la barra dei segmentini all'estrema sinistra, naviga come ChatGPT» | Cronologia | ✅ | `components/cronologia.js`, misure prese dall'app ChatGPT desktop |
| O-06 | «i numeri dei giri devono SPARIRE» · «fondi i giri nella navigation history» | Spina dei giri | ✅ | spina nascosta, i dati vivono nel fumetto |
| O-07 | «la barra resta ancorata quando scrollo» | Cronologia | ✅ | `position:absolute` sullo schermo |
| O-08 | «lampeggio soft cliccando una voce» · «padding coerente» | Chat | ✅ | `talos-lampeggio` |
| O-09 | «via il percorso dalla testata, segment sempre al centro» | Testata | ✅ | `nomeCartella()`, griglia a tre colonne |
| O-10 | «spawno un sottoagente e non si vede in tab Agenti» | Colonna destra | ✅ | misurato: la scheda mostra le 4 deleghe con esito, ora e conteggi; il buco vero era che si aggiornava solo a giro FINITO — ora si rilegge quando la delega parte e quando finisce |
| O-11 | «la barra sopra il composer è ridondante» | Striscia di stato | ✅ | tace col fondo in vista (T02) |
| O-12 | «maniglietta sull'angolo del composer» | Composer | ✅ | `.talos-resizer--composer` |
| O-13 | «col permesso *chiedi* non è comparsa nessuna richiesta» | Permessi | ✅ | `session-registry.mjs`, T03: 2 approvazioni |
| O-14 | la coda non si vedeva *(trovato in T04)* | Composer | ✅ | T04 |
| O-15 | «perché *chiede di eseguire* se siamo in full access?» | Carta di approvazione | ✅ | la carta nomina il motivo; pillola «Accesso completo · 2 eccezioni» misurata in T04 |
| O-16 | «i comandi devono essere formattati in codice, così è brutto» | Carta di approvazione | ✅ | blocco codice monospazio con scorrimento; esito su una riga sua |
| O-17 | «JavaScriptCopia» attaccato | Blocchi di codice in chat | ✅ | misurato: intestazione alta 41px, «JavaScript» e «Copia» a 8px di distanza |
| O-18 | «la schermata huggingface è orrenda, ridisegnala» | Model Lab | 🔜 delegato | metà «luoghi», worktree `AVM-harness-luoghi` |
| O-19 | «mentre il modello scrive lo scrolling deve seguirlo» | Conversazione | ✅ | misurato su un giro vero: il fondo del testo resta fra il 28% e il 48% dell’altezza, mai incollato al composer |
| O-20 | «cliccando una sessione va a fine conversazione» | Elenco sessioni | ✅ | misurato: aprendo una sessione la distanza dal fondo è **0 px** |
| O-21 | «scrollata al massimo deve stare a metà pagina» | Conversazione | ✅ | misurato dal vivo: fondo dell'ultimo messaggio al **48%** dell'altezza visibile, spazio in coda 342px su 684px |
| O-22 | «flusso SSE senza contenuto ne tool_calls» | Errori in chat | ✅ | la nota tradotta si vede su una sessione vera; trovato e mappato un terzo errore («il motore locale non si è acceso in tempo») |
| O-23 | «HTTP 400 … exceeds the available context size» | Errori / modelli locali | ✅ | tradotto coi numeri veri, tre rimedi, testo del server richiuso sotto — verificato dal vivo |
| O-24 | identificatore grezzo del modello locale a schermo | Intestazione, pillola | ✅ | misurato dal vivo: pillola «gpt oss · 20b», id completo nel suggerimento |
| O-25 | «le bolle di domanda devono essere colore accent, oro nel tema Calm» | Conversazione | ✅ | accento velato col suo bordo, verificato: rgba(192,139,60,.14) |
| O-26 | *(trovato da me nello screenshot di O-21)* le tabelle markdown non vengono rese: a schermo restano `\| Funzione \| ✅ | misurato: 1 tabella resa (4 colonne, 2 righe), zero pipe rimaste a schermo |---\|---\|` | Conversazione, markdown | 🔧 in corso | il renderer non conosce le tabelle |
| O-27 | «non far partire l'animazione di scroll se la conversazione è già scrollata alla fine» | Conversazione | ✅ | niente animazione entro 24px dal fondo; nessuna se il fondo è in vista |
| O-28 | «nel browser il contenuto si vede così» — «Letture della sessione» mostra l'HTML grezzo della pagina | Vista Browser | ✅ | misurato: cornice visibile su https://example.org, caricata, due modi; il testo dell’agente esce ripulito col sorgente sotto |
| O-29 | «la bolla di domanda non deve avere larghezza al massimo: bolla di chat con la codina, da destra» | Conversazione | ✅ | misurato: bolla al 67% della colonna, a destra, angolo-codina in basso a destra |
| O-30 | «non riesco ad aprire la sidebar di destra dopo averla collassata» | Colonna destra | ✅ | due gestori sullo stesso clic si annullavano; verificato su 4 viste, dalla Review alla Chat, e dopo un ricaricamento |
| O-31 | «il modello deve avere gli occhi sulla sezione Browser anche se sono io a navigarci dentro» | Vista Browser | ✅ | provato dal vivo: navigo su example.org, chiedo, e il modello risponde sulla pagina — «They've attached the page content» |
| O-32 | «se scrollo un po' piu' in alto e aspetto qualche secondo mi porta con uno snap alla fine» | Conversazione | ✅ | l'osservatore del ripristino si stacca al primo scorrimento della persona — misurato: resta fermo 15 s |
| O-33 | «la chat a tutta larghezza non funziona, si vede buttata a sinistra» | Conversazione | ✅ | respiro simmetrico; misurato 736 (44/44), 819 a colonna chiusa, 1076 a tutta larghezza |
| O-34 | «il ragionamento in corso non scompare col fondo inquadrato, e scompare quando sali» | Striscia di stato | 🔧 | «in fondo» ora guarda la fine del CONTENUTO; ⛔ il caso «sono salito» non ancora visto dal vivo |
| O-35 | «se clicco *Per questa sessione* continua a chiedermi permesso anche con full access» | Permessi / kernel | 🔧 in corso | la clausola del kernel che chiede quando esiste un canale, ora autorizzato a toglierla |
| O-36 | «Attività non riuscita» mostra JSON grezzo e `REFUSED. Empty html: nothing was created.` | Conversazione, errori | 🔴 aperto | argomenti dell'attrezzo e rifiuto del kernel a schermo, in inglese |
| O-37 | «con i modelli a chiave API gli artefatti vengono creati ma non salvati nella Libreria» | Artefatti / Libreria | 🔴 aperto | segnalato dall'owner, da riprodurre |
| O-38 | «al posto di Tema Calm metti l'output medio di token al secondo se uso un modello locale; se non è locale togli la scritta» | Barra di stato | ✅ | `testoVelocitaLocale`, con la prova nei due versi |

---

## Analisi, una per una — le righe ancora aperte

### O-15 · «Perché chiede il permesso se sono in Accesso completo?»

**Cosa succede.** Una sessione creata scegliendo «Accesso completo» mostra lo stesso la carta
«Chiede di eseguire». Sembra una contraddizione, e la carta non spiegava niente.

**Perché.** Tre cause diverse, tutte vere in casi diversi:

1. un **cancello per attrezzo** su «chiedi» — vive fuori dalla politica e **si eredita**: premendo
   «Nuova» la sessione nuova copia i cancelli della sessione che stavi guardando (misurato in T04:
   `permessiPerAttrezzo {scrivi:'chiedi', shell:'chiedi'}` su una sessione «Full access»);
2. la politica della sessione è «Su richiesta»;
3. la sessione ha un canale di approvazione aperto per **un altro** attrezzo: il kernel di oggi,
   quando il canale c'è, chiede anche per gli attrezzi senza cancello (clausola `vaChiesto` in
   `talosHarness.mjs`). È il costo dichiarato della cura del 06/9 al canale delle approvazioni.

**Cura.** La carta scrive il motivo in italiano (`motivoRichiestaApprovazione`), e la pillola del
permesso dichiara le eccezioni: «Accesso completo · 2 eccezioni», col dettaglio nel `title`.
**Cura definitiva, fuori dalla mia lane:** togliere quella clausola nel kernel e usare
`livelloAccesso: 'su-richiesta'`, che `talosHarness.mjs` già riconosce.

**Come si verifica.** Prove T03 e T04 sul 4174: pillola con le eccezioni, e la carta che nomina
l'attrezzo col cancello.

### O-16 · Il comando dentro la carta era un muro di testo

**Perché.** `descriviAzioneApprovazione` incollava il comando **dentro la frase**
(«Vuole eseguire il comando: node --input-type=module -e …»), reso come paragrafo giustificato:
proprio la cosa che va letta prima di dire sì era la meno leggibile della carta. In coda ci
finiva anche l'esito («— Approvato (da un altro client)»), che si leggeva come parte del comando.

**Cura.** La carta ha tre pezzi distinti: la frase (cosa vuole fare), il **blocco codice**
(monospazio, fondo suo, scorrimento orizzontale, tetto d'altezza, raggiungibile da tastiera), il
motivo. L'esito ha una riga sua, col tono giusto, e non tocca più la frase.
Fonti 06/09/2026: streamdown.ai/docs/code-blocks; shiki.style.

### O-17 · «JavaScriptCopia»

**Perché.** Il markup dell'intestazione dei blocchi di codice esisteva già in `renderizzaMarkdown`
(`code-block-head`, `code-block-lang`, `code-block-copy`), ma dopo il passaggio al foglio nuovo
**nessuna regola CSS lo vestiva**: nel foglio del monolite erano rimaste solo tre righe su
`.code-block`. Senza barra, senza spazio e senza pulsante disegnato, il nome del linguaggio e la
parola «Copia» finivano incollati.

**Cura.** Regole nel mockup: barra sottile sopra il codice, linguaggio a sinistra in tono spento,
«Copia» a destra come pulsante leggero con stato «Copiato», scorrimento orizzontale sul blocco,
bordo d'accento finché il blocco arriva ancora dal modello.

### O-19 / O-20 / O-21 · Lo scorrimento della conversazione — una sola causa per tre difetti

**Cosa succede.** Il testo che arriva non viene seguito; aprendo una sessione non si finisce in
fondo; scrollando al massimo l'ultimo messaggio resta incollato al composer invece di stare a metà.

**Perché (la stessa causa).** Dopo il passaggio al mockup, `#conversation` è la **colonna interna**
(`.talos-conversation__column`, nessun overflow): chi scorre davvero è il contenitore
`.talos-conversation`. Tutto il codice ereditato dal monolite — `scrollTop`, `scrollHeight`,
`clientHeight`, l'ascoltatore `scroll`, il «segui mentre scrive», il «vai in fondo» — lavorava
sull'elemento sbagliato: assegnare `scrollTop` a un elemento che non scorre non fa niente, e il
bersaglio «a metà» era calcolato su un'altezza che non è quella visibile. In più
`--stream-follow-space` veniva impostata dalla regia ma **nessuna regola la usava**: sotto
l'ultimo messaggio non c'era mezzo schermo di spazio, quindi il centro era irraggiungibile.

**Cura.** Una funzione sola risponde «chi scorre» (`scrollerConversazione`), e la usano tutti:
spazio in coda, streaming, ascoltatore, apertura di sessione, «sono in fondo?». Nel mockup la
colonna prende `padding-bottom: var(--stream-follow-space, 0px)` — a 0 finché non c'è una
conversazione vera, così la schermata vuota resta centrata.

**Come si verifica.** Prova dal vivo: aprire una sessione lunga (deve partire dal fondo), lanciare
un giro e guardare che il testo resti a metà mentre arriva, e che scrollando al massimo l'ultimo
messaggio stia a metà pagina. ⛔ **NON ancora verificato dal vivo**: cura scritta, prova da fare.

### O-22 · «flusso SSE senza contenuto ne tool_calls»

**Cosa succede.** Con un modello locale, ogni tanto il giro finisce con una carta rossa che porta
questo testo, in gergo e senza rimedio. Nasce in `agent-service.mjs` come `runError({code:
'internal-error'})` e arriva a schermo così com'è.

**Cosa manca.** Il messaggio non dice **cosa** è successo a chi guarda («il modello ha risposto
senza dire niente»), non dice **perché** capita coi modelli locali, non offre **cosa fare**
(riprova, cambia modello, guarda il runtime). 🔜 Da fare: una mappa `codice → (cosa, perché,
rimedio)` in un posto solo, col testo grezzo relegato a dettaglio secondario.

### O-23 · «exceeds the available context size (16384 tokens)»

**Cosa succede.** JSON crudo del provider a schermo, dentro una carta d'errore.

**Il fatto vero, che nessuno dice.** La finestra del modello locale (16.384 token) è **più piccola**
di quello che TALOS gli manda (17.993). Non è un guasto: è un limite dichiarato, e la app ha già
tutto per prevederlo. 🔜 Da fare: (a) tradurre l'errore in italiano con il rimedio giusto
(compattare il contesto, alzare la finestra nel runtime, ridurre l'albero della cartella);
(b) meglio ancora, **prevenirlo**: la barra del contesto deve conoscere la finestra vera del
modello locale e avvisare prima di partire, invece che dopo quattro tentativi falliti.

### O-24 · L'identificatore grezzo del modello locale

**Cosa succede.** A schermo compare
`local:bartowski-nvidia_Nemotron-Cascade-2-30B-A3B-GGUF-931b595fc71b-nvidia-Nemotron-Cascade-2-30B-A3B-Q4-0-gguf`,
su due righe, sia nell'intestazione del messaggio sia nella pillola del composer.

**Perché.** La decisione H22 vieta gli identificatori grezzi a schermo, ma per i modelli locali non
esiste ancora la mappa id → nome umano: si stampa la chiave del runtime. 🔜 Da fare: nome corto
(«Nemotron Cascade 2 · 30B · Q4»), quantizzazione come dettaglio, identificatore completo solo nel
suggerimento del puntatore.

---

## Le regole che l'owner ha ripetuto oggi

- **Un solo agente alla volta.** «PER ADESSO PASSA MA LA PROSSIMA VOLTA VERRAI TERMINATO».
- **Mai la via più pigra.** La cosa che nomina lui si fa per prima e per intera.
- **Carica sempre le skill di frontend design**, ufficiali e scelte, prima di disegnare.
- **Ricerca web prima di scrivere**, con fonte e data nel ledger e nel commit.
- Ogni fase chiude con **Cosa devi fare tu · Cosa faccio io · Cosa rimane**.

### O-27 · L'animazione di scroll che parte da ferma

**Cosa succede.** Arriva un messaggio mentre sei già in fondo, e parte comunque un'animazione di
scorrimento: un movimento che non porta da nessuna parte.

**Strumentato prima di scrivere** (non supposto): le chiamate animate erano tre — `scorriAllaBollaAppesa`
(`scrollTo` con `smooth`), l'aggancio delle righe attrezzo (`scrollIntoView` con `smooth`), e il clic
sulla barra della cronologia. Le prime due chiamavano `#conversation`, che dopo il passaggio al mockup
è la **colonna** e non scorre: erano inerti sull'elemento e insieme rumorose sulla pagina.

**Cura.** Una funzione sola (`scorriInFondoConversazione`) misura la distanza dal fondo: entro 24 px si
aggiusta di scatto, oltre si anima. L'aggancio delle righe non scorre affatto se il fondo è già in
vista. Il clic sulla cronologia resta animato: lì il movimento è la risposta a un'azione, e dice dove
ti sta portando. Ricerca 06/09/2026: shadcn/ui «Message scroller», stackblitz-labs/use-stick-to-bottom
(si segue solo mentre si è già in fondo; lo scorrimento della persona si distingue da quello
dell'animazione senza debounce).

### O-28 · Nel Browser si vede l'HTML grezzo — 🔴 APERTO

**Cosa succede.** «Letture della sessione» mostra il **sorgente** della pagina (`<!DOCTYPE html>`,
`<meta property="og:…">`, `<li class="right">…`), con in mezzo «438747 caratteri tolti nel mezzo».

**Da dove viene.** La vista mostra fedelmente `pagina.testo`, cioè **ciò che l'attrezzo `naviga` ha
consegnato al modello**. Il testo grezzo è quello: non è la vista a sbagliarlo, è la cattura.

**Le due metà della cura.**
- *Kernel (fuori dalla mia lane, da segnalare):* `naviga` dovrebbe consegnare il **testo leggibile**
  della pagina, non il sorgente — oggi il modello paga in token centinaia di righe di `<meta>` e
  navigazione, e le legge al posto del contenuto.
- *Interfaccia (mia):* due modi dichiarati — «Leggibile» (titolo, paragrafi, link) come predefinito, e
  «Sorgente» per vedere esattamente ciò che ha ricevuto l'agente. ⛔ Non si può sostituire in silenzio
  il testo con una versione ripulita: questa vista serve proprio a sapere **cosa ha letto l'agente**.

### O-29 · La bolla della domanda

**Cosa succede.** Il messaggio dell'utente occupava tutta la larghezza della colonna, indistinguibile
per forma da una risposta.

**Cura.** Larghezza sul contenuto con tetto al 72% della colonna, ancorata a destra, angolo in basso a
destra squadrato che fa da codina (niente triangolo appiccicato: si stacca quando la bolla va a capo),
riga dell'autore allineata a destra. Il colore è l'accento velato di O-25: la forma la riconosci prima
del colore.

### O-30 · La colonna di destra che non si riapriva

**Strumentato, non supposto.** Il clic arrivava a `document` (capture e bubble, mai `preventDefault`),
il delegato partiva, la condizione era vera — e la colonna non si muoveva di un pixel. Aggiungendo a
mano la classe `inspector-collapsed` la colonna spariva: quindi il CSS era sano e il difetto stava
nella regia.

**Causa.** Il ponte del mockup battezza il **primo** `[data-azione="dettagli"]` — quello della chat —
con `desktop-context-toggle` e `data-open-panel="inspector"`, che ha già il suo ascoltatore diretto.
Due gestori sullo stesso clic chiamavano `toggleDesktopInspector()` **due volte**: la classe si
aggiungeva e si toglieva nello stesso clic. Le altre tre copie (una per vista) non sono battezzate e
avevano un solo gestore — ecco perché si riusciva a chiudere la colonna da Terminale/Review/Browser
e non a riaprirla dalla Chat.

**Cura.** Il delegato serve le **copie**, mai ciò che è già cablato: salta anche i pulsanti con
`data-open-panel`, non solo quelli con un id.

**Verificato tre volte** (owner: «double e triple check ad ogni implementazione»): chiude e riapre da
tutte e quattro le viste; chiuso dalla Review si riapre dalla Chat (il caso esatto segnalato); e dopo
un ricaricamento il collasso è ricordato e il pulsante lo riapre lo stesso.

## Verifica finale del 06/09 — le cure provate su sessioni vere

Prova `V01-scorrimento-e-browser` (una sola sessione vera, glm-5.3-flash, consegna «apri
https://example.org»), taccuino in `.claude/taccuini/`:

- **O-19** lo scorrimento segue il testo mentre arriva: sei campioni, il fondo resta fra il 28% e il
  48% dell'altezza visibile — mai incollato al composer. **PASSA**
- **O-20** aprendo un'altra sessione e tornando: distanza dal fondo **0 px**. **PASSA**
- **O-28** la lettura si apre come **pagina renderizzata** (`https://example.org/`, cornice caricata,
  due modi a schermo); il modo «Testo dell'agente» mostra il testo ripulito, senza un solo tag, col
  sorgente richiuso sotto. **PASSA**

Sonda `sonda-nota-errore` sulla sessione vera **0363607d** dell'owner (modello locale):

- **O-22/O-23** la nota è tradotta davvero: «Il motore locale non si è acceso in tempo», il perché coi
  numeri presi dall'errore (1,4 GB, 36 secondi), tre rimedi, e il testo del server richiuso sotto.
  ⭐ Riaprendo quella sessione è saltato fuori un **terzo** errore che l'owner non mi aveva mostrato —
  la nota lo dichiarava onestamente come «non ancora tradotto», ed è stato il segnale per mapparlo.
- Difetto trovato guardando lo screenshot e corretto nello stesso giro: il triangolino del dettaglio
  si leggeva «b8» — un escape CSS senza terminatore veniva letto come `` più il testo «b8».

## ⛔ O-10 riaperto — una chiusura mia che non reggeva

La prova `T09-colonna-destra` (agente delle prove, 06/09) ha guardato lo schermo dove io avevo
guardato il codice: la scheda **Agenti** scrive «Nessun sotto-agente» mentre `GET /children` ne
restituisce tre, e il foglio «Albero sessione» della stessa app li elenca come «Delega · fallito».
Avevo cablato `disegnaAgenti()` e dichiarato la riga chiusa senza aprire quella scheda con una
delega vera davanti.

⇒ Torna aperto, e questa volta si chiude con una foto della scheda piena, non con una riga di codice.

**E il contorno è peggiore del difetto**, sempre dalla stessa prova: un giro con **una** delega ha
prodotto quattro sessioni figlie, otto giri e 76,8k token, tutte fallite; i figli sono partiti con
`glm-4.7-flash` mentre la sessione aveva scelto `glm-5.3-flash`, senza una riga a schermo che lo
dicesse. La causa sta nel kernel (`talosHarness.mjs`, la delega sulla stessa cartella del padre viene
rifiutata e il modello riscrive il percorso in forma WSL per farla passare): **fuori dalla mia lane**,
e va detto all'owner invece di aggirato.

### O-31 · Quello che guardo io, lo deve vedere anche lui — 🔴 APERTO, critico

**Cosa chiede l'owner.** «Se navigo manualmente in una pagina del browser, il modello deve leggere
anche quella. Per esempio gli chiedo di cercare l'ultima versione di Python, poi vado su YouTube e
gli chiedo quali video mi consiglia: lui deve rispondere in base alla pagina che vede.»

**Ricerca tecnica, 06/09/2026** (browser-use «Leaving Playwright for CDP», microsoft/playwright
#21780, vercel-labs/agent-browser #279, Browserbase «Taming iframes»):

- una pagina di un'altra origine dentro una cornice **non si può leggere** dal JavaScript della
  pagina che la ospita: è il confine di origine del browser, e non c'è trucco che lo aggiri;
- chi ci riesce lo fa **fuori dalla pagina**: con il protocollo di DevTools (CDP) attaccato al
  browser, o con un motore che possiede la finestra. TALOS gira dentro il Chrome dell'owner: non
  possiede quella finestra e non può attaccarcisi;
- resta la via del **proxy**, che TALOS ha già per i dev server locali: la pagina diventa della
  nostra origine e allora si legge tutta.

**Le tre vie, e cosa costa ognuna.**

1. **Lettura lato server all'atto della navigazione** (la più semplice, si fa oggi): quando digiti
   un indirizzo nella barra della vista Browser, il server legge quella pagina e la mette nel
   contesto della sessione, esattamente come farebbe l'attrezzo `naviga`. ⛔ Costo onesto da
   dichiarare a schermo: il server non ha i tuoi cookie, quindi di YouTube vede la **home pubblica**,
   non la tua — e su una pagina dietro login vedrebbe la schermata di accesso.
2. **Proxy esteso a qualunque sito**: la pagina passa dal nostro server, diventa della nostra
   origine, e l'agente vede *esattamente* il DOM che vedi tu. Più lavoro (riscrittura di CSP, base,
   risorse) e più rischio; oggi il proxy è limitato ai server locali proprio per questo.
3. **Un browser posseduto da TALOS** (finestra Chrome avviata da noi con il protocollo di DevTools):
   è la via che usano gli agenti di navigazione seri, e l'unica che vede anche le pagine dietro
   login, perché sarebbe **la tua sessione dentro quella finestra**. È il lavoro più grande dei tre.

**Proposta**: fare subito la (1), che copre il caso che l'owner ha descritto, dichiarando a schermo
cosa vede l'agente; e tenere la (3) come la vera risposta, da decidere insieme.

### O-35 · «Per questa sessione» che continua a chiedere — la cura vera, finalmente

**Cosa vede l'owner.** Con la sessione su «Accesso completo» arriva lo stesso la carta, e la carta
stessa lo spiega: «comando nel terminale ha il cancello Chiedi conferma». Premendo **Per questa
sessione** quell'attrezzo passa a «sempre»… e la richiesta successiva torna uguale.

**Perché.** La cura del 06/9 al canale delle approvazioni (una sessione che ha *un* attrezzo su
«chiedi» ottiene un canale) ha un costo che avevo dichiarato quel giorno: il kernel, quando il canale
esiste, chiede **anche per gli attrezzi senza cancello** — la clausola `vaChiesto` include
`!haOverride && Boolean(chiediApprovazioneFn)`. Quindi finché *un solo* attrezzo resta su «chiedi»,
tutti gli altri continuano a chiedere, e «Per questa sessione» non basta.

**La cura definitiva era fuori dalla mia lane, e l'owner l'ha autorizzata il 06/9**: togliere quella
clausola e far decidere `livelloAccesso`, che `talosHarness.mjs` già riconosce.

### O-36 · «Attività non riuscita» con il JSON dell'attrezzo a schermo

Nel riquadro compaiono gli **argomenti grezzi** della chiamata
(`{"titolo":"GPT Tokenizer Interactive Demo","html":"<!doctype html>…`) e il rifiuto del kernel in
inglese: `REFUSED. Empty html: nothing was created.` Due difetti in uno — il JSON non è per gli
occhi di una persona, e il rifiuto va detto in italiano con il rimedio. La nota d'errore sotto lo
conferma dichiarandosi «non ancora tradotta»: è la stessa famiglia di O-22/O-23, e va nella stessa
mappa.

---

## Proposte dell'owner (non difetti: cose da costruire)

### P-01 · Un «miglioratore del prompt», col contesto della chat a scelta — proposto il 06/09

**Cosa ha chiesto.** «Aggiungi la proposta di un prompt enhancer, un po' come fa il mobile, ma con la
differenza di un **interruttore che aggiunge tutta l'ultima parte di contesto della chat**, per una
risposta più dettagliata ma lenta.»

**Come sta.** Il mobile ha già un miglioratore del prompt; il desktop no. La differenza che l'owner
chiede è nostra e non ce l'ha nessuno dei due: un interruttore che decide **cosa vede** il
miglioratore — solo la frase che hai scritto, oppure la frase *più la coda della conversazione*.
Il costo si dichiara prima di premere: più contesto significa una riscrittura più mirata e un'attesa
più lunga, ed è esattamente il genere di scelta che TALOS mostra invece di decidere di nascosto.

**Come la vedo (da discutere, non ancora autorizzata).** Un pulsante nel composer, accanto al «+»;
l'interruttore «usa la conversazione» accanto; il prompt riscritto compare **in anteprima** con la
possibilità di rifiutarlo, mai sostituito d'ufficio; il costo stimato in token della coda inclusa,
come già fanno gli allegati. Il modello che riscrive è quello ausiliario delle impostazioni, non
quello della sessione.

⛔ Da fare prima: leggere il miglioratore del mobile (lettura consentita) e cercare come lo fanno gli
altri, che è la regola prima di scrivere.
