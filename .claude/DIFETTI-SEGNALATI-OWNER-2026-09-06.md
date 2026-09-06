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
| O-10 | «spawno un sottoagente e non si vede in tab Agenti» | Colonna destra | ✅ | `disegnaAgenti()` su `/children` |
| O-11 | «la barra sopra il composer è ridondante» | Striscia di stato | ✅ | tace col fondo in vista (T02) |
| O-12 | «maniglietta sull'angolo del composer» | Composer | ✅ | `.talos-resizer--composer` |
| O-13 | «col permesso *chiedi* non è comparsa nessuna richiesta» | Permessi | ✅ | `session-registry.mjs`, T03: 2 approvazioni |
| O-14 | la coda non si vedeva *(trovato in T04)* | Composer | ✅ | T04 |
| O-15 | «perché *chiede di eseguire* se siamo in full access?» | Carta di approvazione | 🔧 | la carta dice il motivo |
| O-16 | «i comandi devono essere formattati in codice, così è brutto» | Carta di approvazione | 🔧 | blocco codice dedicato |
| O-17 | «JavaScriptCopia» attaccato | Blocchi di codice in chat | 🔧 | CSS dell'intestazione riscritto |
| O-18 | «la schermata huggingface è orrenda, ridisegnala» | Model Lab | 🔜 delegato | metà «luoghi», worktree `AVM-harness-luoghi` |
| O-19 | «mentre il modello scrive lo scrolling deve seguirlo» | Conversazione | 🔧 | scroller corretto |
| O-20 | «cliccando una sessione va a fine conversazione» | Elenco sessioni | 🔧 | scroller corretto |
| O-21 | «scrollata al massimo deve stare a metà pagina» | Conversazione | ✅ | misurato dal vivo: fondo dell'ultimo messaggio al **48%** dell'altezza visibile, spazio in coda 342px su 684px |
| O-22 | «flusso SSE senza contenuto ne tool_calls» | Errori in chat | 🔜 | errore tecnico grezzo a schermo |
| O-23 | «HTTP 400 … exceeds the available context size» | Errori / modelli locali | 🔜 | JSON crudo, e il fatto vero non è detto |
| O-24 | identificatore grezzo del modello locale a schermo | Intestazione, pillola | 🔜 | decisione H22 |
| O-25 | «le bolle di domanda devono essere colore accent, oro nel tema Calm» | Conversazione | 🔧 | fondo accento velato + bordo d'accento |
| O-26 | *(trovato da me nello screenshot di O-21)* le tabelle markdown non vengono rese: a schermo restano `\| Funzione \| Input atteso \|` e `\|---\|---\|` | Conversazione, markdown | 🔧 in corso | il renderer non conosce le tabelle |
| O-27 | «non far partire l'animazione di scroll se la conversazione è già scrollata alla fine» | Conversazione | 🔧 | si anima solo quando c'è una distanza da percorrere |
| O-28 | «nel browser il contenuto si vede così» — «Letture della sessione» mostra l'HTML grezzo della pagina | Vista Browser | 🔴 aperto | il testo acquisito è il sorgente, non il testo |
| O-29 | «la bolla di domanda non deve avere larghezza al massimo: bolla di chat con la codina, da destra» | Conversazione | 🔧 | larghezza sul contenuto, ancorata a destra, angolo-codina |

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
