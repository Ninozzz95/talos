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
| O-36 | «Attività non riuscita» mostra JSON grezzo e `REFUSED. Empty html: nothing was created.` | Conversazione, errori | 🔧 | il rifiuto si legge in italiano e l'argomento enorme si apre a richiesta; ⛔ non ancora rivisto dal vivo su un rifiuto vero |
| O-37 | «con i modelli a chiave API gli artefatti vengono creati ma non salvati nella Libreria» | Artefatti / Libreria | 🔴 aperto | segnalato dall'owner, da riprodurre |
| O-38 | «al posto di Tema Calm metti l'output medio di token al secondo se uso un modello locale; se non è locale togli la scritta» | Barra di stato | ✅ | `testoVelocitaLocale`, con la prova nei due versi |
| O-39 | «rendere tutte le scrollbar completamente custom e più compatte (meno larghe)» | Tutta l'app, 30 scroller | ✅ | un blocco solo su `*` sui token; dal vivo a 3 viewport × 2 temi: **0 scroller con la barra di sistema**, colore che segue il tema |
| O-40 | «fare in modo che tutti i tooltip siano custom e stilizzati secondo il tema» | Tutta l'app, 220 tooltip | ✅ | `tooltip.js` + `popover=hint` + ancoraggio CSS; dal vivo: si apre col mouse E col fuoco, hoverable, Esc lo chiude, `title` migrati al volo |
| O-41 | «gli allegati di questo messaggio non devono apparire nella bolla ma fuori o nascosti: la bolla è riservata ai messaggi dell'utente» | Conversazione | 🔧 in corso | il testo dell'allegato finiva DENTRO la bolla utente, mescolato a ciò che la persona ha scritto |
| O-42 | il Browser mostra un riquadro rotto al posto della pagina (screenshot su github.com) | Browser | 🔴 aperto | GitHub vieta la cornice: l'iframe non carica e il ripiego al testo non scatta in tempo |
| O-43 | «il testo scritto nel composer (solo quello realmente scritto, non il placeholder) deve avere l'accent color» | Composer | 🔴 aperto | segnalato 07/09 |
| O-44 | «i loghi sono ancora mockup e non usano quelli veri — vedi mobile, lui lo fa alla perfezione» | Marchio, tutta l'app | 🔴 aperto | il mobile è il riferimento: si guarda come fa lui |
| O-45 | «quando carica una risposta, il logo dei 3 pallini attraversati dalla linea non è animato» | Attesa della risposta | 🔴 aperto | segnalato 07/09 |
| O-46 | «nella nuova sessione vuota (senza messaggio) non c'è il logo reale e la scritta TALOS in Orbitron sopra il messaggio di benvenuto» | Chat vuota | 🔴 aperto | ⭐ la causa è già nota: `costruisciConversationHero` è una delle 7 funzioni MAI CHIAMATE |
| O-47 | «quando voglio fermare una chat in corso devo poter fermarla immediatamente» | Fermare un giro | 🔴 aperto | ricerca su Codex, Claude e Hermes chiesta dall'owner |
| O-48 | «il pulsante di un'altra sessione è su stop quando una sessione separata è in reasoning» | Composer, stato del giro | 🔴 aperto | **di correttezza**: lo stato «in corso» è globale invece che della sessione aperta |
| O-49 | «Risposta non riuscita · Query non valida» ripetuto in basso a destra | Errori | 🔴 aperto | visto in due screenshot diversi il 07/09; una chiamata manda una query che il server rifiuta |
| O-50 | «Messaggio non accodato · Sessione non pronta per questa azione» su una sessione interrotta, col testo che resta nel composer | Composer, coda | 🔧 forse già chiuso da O-48 | il messaggio del kernel è molto migliore di quello mostrato, e va portato a schermo |

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

### O-39 · Le scrollbar: nessuna è nostra, e sono grosse — segnalato il 06/09

**Cosa ha chiesto l'owner.** «Rendere tutte le scrollbar completamente custom e più compatte (meno
larghe).»

**Cosa ho misurato**, contando nel mockup (che è la fonte del disegno) e non a occhio:

| Fatto | Numero |
|---|---|
| Elementi che scorrono (`overflow: auto\|scroll`) | **30** |
| Con una scrollbar davvero disegnata da noi | **0** |
| Con `scrollbar-width:thin` (solo `.talos-tabs__list`) | 3 dichiarazioni, 1 selettore |
| Con `::-webkit-scrollbar` | 1, e serve a **nasconderla** (`display:none`) |

⇒ Tutto il resto mostra la scrollbar di sistema: su Windows ~15 px di grigio che non conosce il tema
Calm, identica in chiaro e in scuro. Anche i tre `thin` non sono nostri: `scrollbar-width` accetta
solo `auto|thin|none`, quindi «thin» è la barra **di sistema stretta**, non la nostra.

**Cosa dice lo stato dell'arte** (letto il 06/09/2026 — [Chrome for Developers, «Scrollbar
styling»](https://developer.chrome.com/docs/css-ui/scrollbar-styling), [MDN
`::-webkit-scrollbar`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/::-webkit-scrollbar),
[ishadeed, «Custom Scrollbars In CSS»](https://ishadeed.com/article/custom-scrollbars-css/)):

- le due proprietà **standard** sono `scrollbar-width` (`auto|thin|none`) e `scrollbar-color`
  (pollice e binario). Sono semplici e portabili, ma **non permettono** raggio, stato al passaggio
  del mouse, angoli o margini: esattamente ciò che serve per farle nostre;
- `::-webkit-scrollbar` dà quel controllo (`-thumb`, `-track`, `-corner`, `-button`) ed è
  disponibile su Chrome, Edge, Safari e Opera. ⭐ **TALOS Desktop gira su Chromium**, quindi qui non
  è un ripiego: è la via principale, con le standard come rete di sicurezza sotto `@supports`;
- ⛔ **vincolo che non conoscevo e che cambia il disegno**: dando una larghezza a
  `::-webkit-scrollbar` la barra diventa **sempre a sovrapposizione** (overlay) — smette di
  riservarsi spazio nel flusso. Su un elenco stretto come la sidebar significa che il pollice
  finisce **sopra** il testo: va previsto un `padding-right`, oppure si accetta la sovrapposizione
  e la si rende leggibile (pollice semitrasparente che si accende al passaggio).

**Come la farei** (da decidere insieme, niente codice finché non è il suo turno): un blocco solo nel
mockup, sui token del tema, applicato a `*` invece che ai 30 scroller uno per uno — pollice
`var(--talos-border)` che diventa `var(--talos-muted)` al passaggio, binario trasparente, **8 px**
contro i ~15 di sistema (i 6 px sono un bersaglio scomodo da afferrare col mouse), raggio pieno,
niente frecce. Le due standard nello stesso blocco per chi non è Chromium. ⛔ E una prova che le
conti: oggi non c'è niente che si accorga se un pannello nuovo nasce con la barra di sistema.

### O-40 · I tooltip: sono 220 e sono tutti quelli di Windows — segnalato il 06/09

**Cosa ha chiesto l'owner.** «Fare in modo che tutti i tooltip siano custom e stilizzati secondo il
tema.»

**Cosa ho misurato:**

| Fatto | Numero |
|---|---|
| `title="…"` scritti nel template | **156** |
| `title` assegnati dal codice a runtime | **64** |
| Totale tooltip dell'app | **220** |
| Con `role="tooltip"` | **0** |

⇒ Nessun tooltip è nostro. Sono tutti il riquadro giallino del sistema operativo: **ritardo di circa
un secondo che non si può cambiare**, nessun colore del tema, sparizione automatica dopo pochi
secondi anche se stai ancora leggendo, nessuna formattazione, e **niente** su touch o da tastiera.
⛔ Uno l'ho aggiunto io stamattina (il consiglio sulle sessioni interrotte): quella riga è la prova
che il difetto continua a crescere finché non c'è il pezzo giusto da usare.

**Cosa dice lo stato dell'arte** (letto il 06/09/2026 — [MDN, «Using the Popover
API»](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API/Using), [GoogleChrome,
«position-aware-tooltips»](https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/modern-web-guidance/guides/ui-atoms/position-aware-tooltips.md),
[Voorhoede, «The Popover API: your new best friend for
tooltips»](https://www.voorhoede.nl/en/blog/the-popover-api-your-new-best-friend-for-tooltips/)):

- l'API **Popover** è supportata da tutti i browser principali e porta gratis il livello superiore
  (niente `z-index` da inseguire) e la chiusura leggera con Esc;
- il **posizionamento ad ancora** CSS (`position-anchor`, `position-area`, `@position-try`) fa
  quello per cui prima serviva una libreria: attaccarsi al bersaglio e **ripiegare da solo** quando
  non c'è spazio, senza JavaScript. ⛔ Vincolo: in produzione è **Chrome/Edge** (Firefox dietro
  flag, Safari in lavorazione) — per noi va bene, siamo su Chromium, ma va scritto, non dato per
  scontato;
- ⛔ **accessibilità, ed è la parte che si sbaglia**: il pezzo non basta che appaia. Serve
  `aria-describedby` dal grilletto al riquadro e `role="tooltip"`, altrimenti si sostituisce un
  tooltip che almeno gli screen reader leggono con uno che **non esiste** per chi non vede.

**Come lo farei** (da decidere insieme): un componente solo, `src/components/tooltip.js`, con
`ancoraTooltip(elemento, testo)`; il markup nel mockup con i token del tema; una migrazione che
sostituisce i 220 `title` con l'attributo nostro **in un passaggio solo**, così non restano due
sistemi vivi insieme; ritardo di apertura scelto da noi (~350 ms) e chiusura immediata; il `title`
nativo **tolto** dove il nostro subentra, altrimenti compaiono tutti e due.

⛔ **Ordine consigliato**: O-39 prima (è un blocco di CSS e una prova, mezza giornata), O-40 dopo
(tocca 220 punti e vuole il componente, la migrazione e le prove di accessibilità).

### O-41 · Gli allegati dentro la bolla dell'utente — segnalato il 07/09

**Cosa vede l'owner** (screenshot): la sua bolla contiene «mm h ti ricorda qualcosa? **Allegati di
questo messaggio: - Pagina aperta: raw.githubusercontent.com/... --- 404: Not Found**». Cioè: cinque
righe di roba che lui non ha scritto, dentro la bolla che dovrebbe contenere solo le sue parole.

**Perché è sbagliato, e non è una questione di gusto.** La bolla dell'utente è l'unico posto della
schermata dove sta ciò che ha detto **una persona**. Mescolarci dentro il contenuto degli allegati
fa due danni: rende illeggibile il messaggio vero (qui: quattro parole affogate in quattro righe di
URL), e cancella la distinzione fra «l'ho detto io» e «il sistema l'ha aggiunto». Quando poi si
rilegge una conversazione per capire cosa era stato chiesto, non si distingue più.

**Cosa fanno gli altri** (letto il 07/09/2026 — shadcn/ui, «Components for Chat Interfaces», giugno
2026): gli **Attachment sono componenti separati dai Bubble**. «File attachments can be shown with
the user profile and timestamp **outside the chat bubble**»; la bolla rende la superficie del
messaggio, gli allegati sono oggetti a fianco con i loro metadati e le loro azioni.

**La proposta.** Gli allegati escono dalla bolla e diventano una **riga di chip sotto di essa**: uno
per allegato, col tipo e la fonte in breve («Pagina aperta · raw.githubusercontent.com»), il peso in
token, e apribili con un clic per vedere il contenuto intero. ⛔ Ciò che si manda al modello **non
cambia**: il contenuto continua a viaggiare nel messaggio, perché è quello che serve al giro. Cambia
solo cosa si legge a schermo — e la bolla torna a contenere le parole della persona, e basta.

### O-42 · Il Browser mostra un riquadro rotto al posto della pagina — segnalato il 07/09

**Cosa vede l'owner** (screenshot): la scheda «Pagina» su `github.com/Ninozzz95/talos` mostra un
rettangolo grigio con l'icona dell'immagine rotta. Sopra, la lettura dice `HTTP 200 · 4116
caratteri`: il testo c'è, è la **cornice** a non mostrarlo.

**Perché.** Per una lettura, il Browser incornicia la pagina vera
(`browser.js`: `frame.src = s.url`). **GitHub vieta di essere incorniciato** (`X-Frame-Options`), e
un sito che rifiuta non manda nessun evento `load`: resta un riquadro vuoto. Il ripiego esiste —
dopo un'attesa si torna al testo con un avviso — ma nello screenshot non era scattato.

Ricerca 07/09/2026 (openclaw #71979, «CSP blob: URL blocked»; content-security-policy.com,
«img-src»): la stessa famiglia — una risorsa rifiutata dalla policy non dà errore visibile, lascia
un segnaposto rotto, e in Firefox non compare nemmeno nella scheda Rete.

**La proposta, in due mosse.**
1. **Non aspettare il fallimento: prevederlo.** Prima di incorniciare si chiede al nostro server se
   quella pagina è incornicabile (la rotta `/api/v1/browser/incorniciabile` **esiste già**): se
   l'intestazione lo vieta, si va dritti al testo, e la scheda «Pagina» lo dichiara invece di
   provarci. Zero riquadri rotti, e nessuna attesa.
2. **Se proprio si prova, il ripiego deve essere immediato e leggibile**: al posto del rettangolo
   grigio, una riga che dice «GitHub non si lascia mostrare dentro TALOS — qui sotto c'è il testo
   che ha letto l'agente», con il testo già visibile sotto, non dopo un timeout.

### O-45 · I tre pallini attraversati dalla linea non si animano — diagnosi del 07/09

**Quello che ho trovato guardando il codice** (e che smentisce la mia prima ipotesi):
- il markup **c'è già**: `components/conversazione.js:530` costruisce l'SVG con binario, sweep e i
  tre nodi, con le stesse classi del mobile;
- il CSS **ha le animazioni**: `talosLineSweep` e `talosLineNodeFill` esistono in `index.css`;
- le regole che le SPENGONO (`animation: none`, nodi già pieni, sweep già completo) sono
  **correttamente dentro** `@media (prefers-reduced-motion: reduce)` — non spengono sempre.

⇒ Quindi il CSS non è rotto, e la causa è altrove. Le due ipotesi da misurare, in ordine:
1. **Windows ha «riduci animazioni» acceso** sulla macchina dell'owner: il browser rispetterebbe
   `prefers-reduced-motion` e le animazioni sarebbero spente **per scelta del sistema**. Si verifica
   in un minuto (Impostazioni → Accessibilità → Effetti visivi), e se è così la cura non è forzare
   l'animazione — è che il caricatore resti leggibile anche da fermo, cosa che già fa.
2. Il caricatore **non viene montato** durante l'attesa vera, e l'owner vede un altro elemento.

⛔ **NON MISURATO dal vivo**: il caricatore esiste solo mentre una risposta sta arrivando, e a
pagina ferma non è nel DOM (verificato: `presente: false` in entrambi i modi). Serve un giro vero.

**E una differenza col mobile, misurata**: il desktop usa **2,2 s** con ritardi 0 / 0,5 / 1 s; il
mobile (`TalosLineLoader.vue` + `style.css`) usa **1,6 s** con ritardi 0 / 0,36 / 0,73 s. Il nostro
è più lento di mezzo secondo a giro. Se l'owner dice che il mobile «lo fa alla perfezione», i tempi
da prendere sono quelli.

### O-50 · «Sessione non pronta per questa azione» — segnalato il 07/09

**Cosa vede l'owner** (screenshot): scrive un follow-up su una sessione **interrotta**; compare
«Messaggio non accodato · Sessione non pronta per questa azione», e il testo resta nel composer.
Nel pannello destro l'indice dei giri dice ancora «in corso» mentre la sidebar dà la sessione per
interrotta.

**La catena, letta nel codice.** `submitPrompt` manda alla CODA (`accodaMessaggioReale`) quando
`!eventoTerminaleVisto`; il server rifiuta perché una sessione interrotta non può accodare — e ha
ragione: «un messaggio in coda qui non verrebbe mai consegnato» (`session-registry:2600`). Nel
`catch` (`app.js:12284`) il testo torna nel composer, che è giusto: non si perde.

⭐ **Ma questo caso dovrebbe essere già chiuso da O-48**, curato poche ore prima: con
`chiusaDalServer` una sessione interrotta ha `eventoTerminaleVisto = true`, quindi `submitPrompt`
non passa più dalla coda ma dalla **ripresa** — che è la strada giusta e funziona. Lo screenshot
potrebbe essere di prima della consegna, o di una pagina non ricaricata.
⛔ **Da misurare**: scrivere un follow-up su una sessione interrotta e vedere se riparte.

**Quello che resta da curare comunque, e non dipende da O-48:** il messaggio mostrato è
«Sessione non pronta per questa azione» — una frase che non dice né cosa è successo né cosa fare.
Il kernel, per lo stesso caso, ha già la frase giusta: «Questa sessione è stata interrotta: scrivi
un nuovo messaggio per riprenderla in sicurezza». Quella va a schermo, non la sua traduzione
generica. È la stessa famiglia di O-22/O-23 (errori grezzi tradotti) e la mappa dove aggiungerla
esiste già: `components/errori.js`.

⛔ E un terzo difetto nello stesso screenshot: **l'indice dei giri, nel pannello destro, dice «in
corso»** su una sessione interrotta. È O-48 un piano più sotto — la cura di O-48 tocca il composer,
non quel pannello, e va portata anche lì.

### O-51 · «ricorda lo stile delle caselle e falle un po' più piccole» — 07/09 · CURATO

**Cosa vedeva l'owner** (screenshot della sidebar in selezione): le caselle delle sessioni erano
**blu**, col segno di spunta bianco di Windows, dentro un tema che non ha una sola cosa blu; e in
una riga alta 66 px pesavano quanto il titolo.

**Causa, chiesta al browser e non dedotta.** La casella è un `<input type="checkbox">` vero
(`components/session-item.js:173`), e `.talos-checkbox` rispondeva **solo** a `[aria-checked="true"]`
— un attributo che un input non ha mai. Il sistema di design vestiva quindi soltanto il *bottone*
del mockup; l'input restava al disegno del sistema operativo.

**Cura.** `.talos-checkbox` vale ora nelle due forme (bottone con `aria-checked` e input con
`:checked`): `appearance:none`, spunta disegnata con `clip-path`, fuoco su `:focus-visible` con
offset, e stato dichiarato col **fondo** in alto contrasto (`forced-colors`). Misura 28 → **20 px**
(la grande 36 → 28), colonna della riga adeguata. Verificato dal vivo sul 4174: `w:20 h:20
raggio:6px appearance:none`, e nella foto la spunta è oro su fondo d'accento.

### O-52 · «tutti i component devono essere stilizzati custom, anche il dialog» — 07/09 · in corso

**Chi disegnava cosa, censito.** Nel prodotto restavano **quattro famiglie** di controlli disegnati
dal sistema operativo, non dal tema: 15 caselle (di cui 13 nel monolite), 12 cursori a scorrimento
(`accent-color` tinge il cursore di Windows, non lo sostituisce), 31 menu a tendina — il *bottone*
era nostro dal principio, ma il **menu che si apre** era bianco col font di sistema — e gli
interruttori delle Impostazioni, che avevano la pillola giusta e nessun pomello (l'input non può
avere figli).

**Cura, in un posto solo.** Le regole vestono ora l'**elemento**, non solo la classe:
`select`, `input[type="range"]`, `input[type="checkbox"]:not(.talos-switch)` e
`input.talos-switch`. Così cadono anche i quattordici menu e gli undici cursori del monolite, che
nessuna classe raggiungeva. Il menu a tendina passa da `appearance: base-select` (Chrome 135+,
Safari 27) dentro `@supports`, con `::picker(select)` sui token del tema, chevron nostro al posto
del triangolo pieno e lo spazio della spunta riservato col padding.
Fonti 07/09/2026: Chrome for Developers, «The `<select>` element can now be customized with CSS»;
modern-css.com, «Customizable selects without a JavaScript library»; Modern CSS, «Pure CSS Custom
Checkbox Style»; Evinced, «Creating accessible styled checkboxes».

⛔ **Resta aperto**: i **fogli** del monolite (`dialog.sheet-dialog`, in `src/legacy/frammenti.html`)
sono ancora finestre legacy — Permessi, Albero sessione, Strumenti/skill, Agents e diagnostica,
File, Modello. Con i controlli vestiti sembrano del tema, ma la struttura non è quella dei veli.
La strada è quella già in uso (`VELO_PER_FOGLIO` + `preparaVeloDaFoglio`), e tre veli esistono già
nel mockup: `veloPermessi`, `veloAlbero`, `veloModello`.

### O-53 · «"nessuna selezionata" deve sparire se non è selezionato nulla» — 07/09 · CURATO

Erano due difetti in uno: la barra della selezione restava a schermo anche con la **selezione
spenta** (bastava che ci fossero sessioni), e dentro viveva una frase che parlava solo di sé.
Ora la barra dura quanto la selezione e il conteggio compare quando c'è qualcosa da contare.
Provato coi clic veri: 0 → nessuna frase · 1 → «1 selezionata» · tutte → «2 selezionate» ·
di nuovo 0 → la frase sparisce · selezione spenta → la barra sparisce.

### O-54 · la regola che non c'era: una GRAFFA ORFANA la buttava via — 07/09 · CURATO

Trovato misurando, non leggendo. La barra della selezione aveva la sua regola nel foglio e sullo
schermo non aveva né bordo né fondo né griglia: il browser diceva `display: block`, `padding: 0px`.
Sei righe più su era rimasta una `}` **orfana**, resto della container query cancellata il giorno
prima. Per la specifica CSS un `}` fuori posto viene inghiottito nel **preludio** della regola
successiva, che diventa `} .talos-sidebar__selezione` — selettore non valido, regola **scartata**,
nessun errore da nessuna parte.
⇒ Ora lo conta una macchina, a ogni giro: `scripts/cancello/graffe-orfane.mjs`, agganciato al
cancello statico e provato anche al verso contrario (un foglio sano non accusa niente).

### O-55 · il riferimento Doctor non portava a niente — 07/09 · CURATO

Il difetto dietro «Query non valida» (O-49), e più grave di quello. Ogni errore dice «Apri Doctor,
copia il riferimento e riprova»; la scheda Doctor rispondeva **solo col codice**, cioè con quello
che si leggeva già a schermo. Il motivo vero non era nascosto per prudenza: **non veniva mai
registrato**. `errorEnvelope(code, clock)` costruiva `toPublicProblem({ code })` — un oggetto col
solo codice, senza `message` — e il registro diagnostico salvava un dettaglio vuoto.

**Cura**, in due punti: l'errore vero viaggia nel contesto (`{ errore: error }`, 46 punti di
`catch`) e il suo messaggio viene registrato — già ripulito da `safeDiagnosticDetail` (chiavi,
percorsi, nomi di variabili d'ambiente); la rotta `/api/v1/doctor/<rif>` restituisce quel
dettaglio. Fuori non cambia niente: la persona continua a vedere il testo pubblico.

⭐ **Provato subito, e ha pagato**: la prima richiesta rifiutata dopo la cura diceva «Corpo JSON non
valido», la seconda «cartellaLibera deve essere un percorso assoluto» — due difetti dei miei script
diagnosticati in un colpo, dove prima c'erano dieci minuti di tentativi al buio.

### O-47 · «devo poter fermarla immediatamente» — 07/09 · MISURATO: 4 ms

Misurato dal vivo su istanza di prova (4211, store separato) con una sessione vera GLM 5.3 Flash:
dalla `POST /stop` all'evento terminale sono passati **4 ms** (`StateDelta` e poi `RunFinished`).
La catena dell'annullamento è intera: `ferma()` → `voce.controller.abort()` → `segnaleStop` →
`userSignal` dentro il fetch verso OpenRouter, che viene chiuso, non aspettato.

⛔ **Quello che invece è lento non è lo stop**: il primo pezzo di risposta è arrivato dopo **96
secondi**. Finché non arriva niente non c'è niente da fermare, e chi guarda vede una chat immobile
con un pulsante che non sembra fare effetto. È un difetto di ATTESA, non di interruzione: la
striscia deve dire cosa sta succedendo (il modello sta ragionando, da quanto), e lo stop deve poter
essere premuto anche prima del primo pezzo.

### O-50 · riprendere una sessione interrotta — 07/09 · CHIUSO con prova dal vivo

Riprodotto lo scenario vero: sessione avviata, **server ucciso a giro in corso** (è così che una
sessione diventa «interrotta»), server riavviato, sessione `{conclusa:false, interrotta:true}`.
Poi il follow-up, scritto nel composer come lo scriverebbe una persona: la UI ha preso la strada
della **ripresa** («Ripresa della sessione · avviata 45 s fa · riprendere costa circa 8,1k token»),
TALOS ha risposto, la sessione è tornata `conclusa · 3 giri`. **Nessun errore, nessun toast rosso.**
Foto: `scratchpad/prove/foto/C03-followup/`.

### O-56 · il pulsante «Invia» era ROSSO — 07/09 · CURATO

Trovato guardando la foto della prova qui sopra e poi chiedendo al browser: il pulsante del
composer aveva addosso `talos-send--stop` **sempre** — `rgb(216,125,114)`, il colore del pericolo —
mentre il suo `aria-label` diceva «Invia». Il monolite cambiava icona e nome ma non la classe,
perché usa un altro vocabolario (`is-stop`). Ora il pulsante nasce «Invia» e il rosso arriva solo
col giro in corso; il CSS riconosce entrambi i nomi.

### O-57 · quattro nomi per quattro politiche — 07/09 · CURATO

La stessa politica si chiamava in quattro modi a seconda della schermata: il foglio Permessi
mostrava i valori grezzi del kernel in inglese («Read only»), la modale «Nuova sessione» diceva
«Scrive qui», l'intro «Scrive nel progetto», la pillola del composer «Scrittura nel workspace».
⇒ Una mappa sola (`components/politiche.js`, con test), e le quattro superfici sono sue viste. Il
valore che viaggia verso il kernel non è cambiato di un byte — è il contratto, non un'etichetta.
Ricerca 07/09/2026: Claude Code v2.1.200 ha rinominato «default» in «Manual» su tutte le
interfacce **tenendo invariato** il valore di configurazione per hook e SDK: stessa separazione.

### O-58 · «non riesco a riprendere» — la pagina credeva a un giro che non c'era più — 07/09 · CHIUSO

**Cosa vedeva l'owner** (screenshot delle 13:24): pulsante del composer **rosso** con «Interrompi al
prossimo punto sicuro», indice dei giri «in corso», sidebar «interrotta», e al primo invio
«Messaggio non accodato · Sessione non pronta per questa azione». Tre stati per la stessa sessione,
e quello sbagliato era il nostro.

**Perché la cura di O-48 non bastava.** Guardava lo stato del server **solo all'apertura** di una
sessione (`apriSessioneReale`). Nel caso vero la sessione era già aperta da ieri e nel frattempo il
server è stato riavviato — anche da me, decine di volte oggi, per consegnare: nessuno riapre niente,
l'evento terminale non arriva mai, e la pagina resta convinta di un giro che non esiste. Da lì il
messaggio prendeva la strada della **coda**, e il server la rifiutava con ragione (un messaggio
accodato lì non verrebbe consegnato mai).

**Cura, in tre punti — perché una sola non basta a impedire il muro:**
1. **Il polling corregge lo stato**: `aggiornaElencoSessioniReali` gira ogni pochi secondi e ha già
   in mano `conclusa`/`interrotta` della sessione aperta. Se il server la dà chiusa, il giro è
   finito: si dichiara, e il composer si ridisegna da solo.
2. **La rete di sicurezza all'invio**: se l'accodamento viene rifiutato perché la sessione non è in
   corso, si prende la strada giusta — la **ripresa** — invece di restituire un errore. Ogni altro
   errore resta un errore.
3. **Lo stato «fermata»**: una sessione fermata dall'owner diceva **«errore»** nella sidebar, perché
   il giro si chiude con `RunError` di codice `fermato`. Il motivo ora viaggia nell'elenco
   (`motivoChiusura`) e vince sull'esito. Fonti 07/09/2026: opencode #25899 e #28453 — un
   annullamento chiesto dalla persona non è né `end_turn` («fa sembrare completamento uno stop») né
   `agent_error` («fa sembrare un guasto un gesto voluto»): è un terzo esito.

**Misurato dal vivo**, riproducendo il caso alla lettera su istanza di prova: giro in corso →
server ucciso e riavviato → **entro 3 secondi** il pulsante torna «Invia» e la riga dice
«interrotta» → si scrive → il giro riparte, TALOS risponde, sessione «conclusa · 5 giri». Nessun
toast d'errore. Foto: `scratchpad/prove/foto/C06-caso-owner/`.

⛔ **Chi ha la pagina aperta da prima deve ricaricarla** (Ctrl+F5): il codice vecchio resta in
memoria finché il browser non lo rilegge.
