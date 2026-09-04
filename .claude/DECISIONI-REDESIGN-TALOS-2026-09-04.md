# DECISIONI DI REDESIGN — risposte dell'owner, categoria per categoria

> Le domande stanno in `DOMANDE-REDESIGN-TALOS-2026-09-04.md` (240, trenta per
> ognuna delle otto categorie). Qui ci sono **solo le decisioni prese**, nelle
> parole con cui sono state scelte nell'interfaccia. Il mockup si costruisce da
> questo file: dove una decisione manca, si torna a chiedere, non si indovina.
>
> ⛔ Dove l'owner ha scelto **contro** il mio consiglio la riga lo dice. Serve a
> non riproporre di nascosto la mia versione mentre disegno.

## A · SIDEBAR E NAVIGAZIONE — decisa

| # | Decisione |
|---|---|
| A1 | **Tre blocchi**: azioni · luoghi · cronologia. |
| A2 | Massimo **5-7 voci** di primo livello; il resto dietro «Altro». |
| A3 | Le sezioni si chiamano col **nome della cosa** (Memoria), non dell'azione. |
| A4 | Resta **«Capability»**, con sottotitolo esplicativo dentro la pagina. |
| A5 | Sezione **«Fissate»** sopra le sessioni; si fissa dal menu della riga. |
| A6 | **Ricerca dentro le conversazioni**, non solo nei titoli. |
| A7 | Le **scorciatoie disegnate accanto** alle voci. |
| A8 | La sidebar **si riduce a icone**. |
| A9 | Larghezza **260-280 px**. |
| A10 | Via il suggerimento «Tieni premuta una chat» (è mobile). |
| A11 | **«SESSIONI REALI» → «Sessioni»**: il maiuscolo urlato e la parola «reali» sono nostri, non dell'utente. |
| A12 | Icone delle sezioni **monocrome**. |

## B · CHAT, COMPOSER E STATO VUOTO — decisa il 04/09

| # | Decisione |
|---|---|
| B1 | Stato vuoto: **logo + cosa può fare l'app + tre esempi cliccabili** (l'owner ha unito le due opzioni: voleva anche il logo). |
| B2 | L'hero **nomina il progetto**: «Cosa costruiamo in AVM-harness-desktop?». |
| B3 | I tre esempi sono **dedotti dal progetto** (se c'è una suite di test, il primo la nomina). |
| B4 | Il «+» **serve solo ad allegare**. Capability esce dal foglio del composer. |
| B5 | L'ingresso a Capability sta **in tutti e due i posti**: voce nella sidebar *e* scorciatoia nel composer, che aprono la stessa pagina. ⚠️ *Contro il mio consiglio* (dicevo solo sidebar): vanno tenuti allineati. |
| B6 | Il «+» allega **tutte e quattro le cose**: file del workspace · file dal disco · immagini · ultimo screenshot. |
| B7 | **Incolla e trascina**, entrambi. |
| B8 | I tetti (quanti file, quanto grandi) **scritti nel foglio**, non scoperti sbattendoci. |
| B9 | Ogni allegato dichiara **quanto contesto costa, in token stimati**. È il nostro +1: nessun concorrente lo fa. |
| B10 | Pillola del modello nel composer, **con la scorciatoia Ctrl+Shift+M scritta**. |
| B11 | Pillola del permesso accanto, **col colore del rischio**. |
| B12 | Contatore dei giri: **compare dal 50% del tetto, in grigio**, e si accende avvicinandosi. |
| B13 | **Invio manda, Shift+Invio va a capo.** |
| B14 | Invio durante un giro: **chiede quale dei due** (indirizza ora / accoda), con due pulsanti sotto il composer. ⚠️ *Contro il mio consiglio* (dicevo «indirizza sempre»): il bivio è esplicito. |
| B15 | Si accoda con **Ctrl+Invio**, e la coda è **a vista** sotto il composer, con la possibilità di togliere un messaggio. |
| B16 | **Esc ferma il giro, con conferma.** ⚠️ *Contro il mio consiglio* (dicevo senza conferma). |
| B17 | Il pulsante di invio **diventa «ferma»** durante il giro, come oggi. |
| B18 | Il ragionamento è un **blocco apribile, chiuso di default**. |
| B19 | Gli attrezzi si vedono **in linea mentre lavora, poi si raccolgono** in un blocco per giro a fine giro. ⚠️ *Contro il mio consiglio* (dicevo raccolte da subito). |
| B20 | Un attrezzo fallito è una **riga rossa col motivo in italiano e un pulsante «riprova»**. Mai JSON crudo. |
| B21 | Le fonti web: **titolo cliccabile e dominio**, mai l'URL nudo. |
| B22 | I file toccati **in tutti e due i posti**: elenco compatto in fondo al messaggio *e* pannello di destra. |
| B23 | **Indice dei giri nella colonna di destra**, per saltare al giro N. |
| B24 | Si copia il messaggio, il giro intero, **e si esporta la sessione** in markdown. ⚠️ *Più* di quanto consigliavo. |
| B25 | Modificare un messaggio dell'utente **crea un ramo** (l'albero delle sessioni c'è già). |
| B26 | Il costo si mostra **per sessione, non per messaggio**. |
| B27 | Lo scorrimento **segue sempre** il testo che arriva. ⚠️ *Contro il mio consiglio* (dicevo «con torna in fondo»): niente ancoraggio condizionale. |
| B28 | Il composer **si ridimensiona e ricorda l'altezza**. |
| B29 | La dettatura vocale **resta solo se funziona davvero**: prima si prova, poi si decide. Oggi il microfono c'è e non è verificato. |
| B30 | **Tetto dei giri: illimitato, con freno a costo/tempo dichiarato.** ⚠️ Decisione grossa, e *più avanti* del consiglio: Hermes è passato da 90 a 500 ed è illimitato di default; noi siamo a **24**. ⛔ Non si tocca da sola: va insieme alla cache delle letture idempotenti e a più chiamate per giro, altrimenti i token crescono col quadrato dei giri (lezione `talos-esaurisce-i-giri-non-le-capacita`). Ricade su **K-12** (il tetto è nel kernel) e su O-07. |
| B31 | **Striscia di stato fissa sopra il composer** mentre il giro lavora: cosa sta facendo, quale giro, da quanto. |
| B32 | Cliccare un file citato apre un **menu con le due vie**: anteprima interna o editor di sistema. |

## C · CAPABILITY: ATTREZZI, SKILL, CONNETTORI, PLUGIN — decisa il 04/09

> ⛔⛔ **Istruzione dell'owner dentro C24, che vale per TUTTA la categoria:**
> «abbiamo già fatto questo lavoro per il mobile quindi non serve reinventare la
> ruota». ⇒ Per Libreria, Memoria, Note, Attività, Ricerca e Officina si **apre
> prima il mobile** e si riprende il suo modello (strati della memoria, autore
> delle attività, elenco dei rapporti di ricerca). ⛔ Leggere il mobile è
> autorizzato, **scriverci no**: la mia ownership è solo `lane/harness-desktop`.

| # | Decisione |
|---|---|
| C1 | Capability diventa una **pagina intera**, non più un foglio con dodici sezioni in un unico scorrimento. |
| C2 | **Quattro schede** nella pagina (Attrezzi · Skill · Connettori · Plugin) e **sei voci di sidebar** (Libreria · Memoria · Note · Attività · Ricerca · Officina). |
| C3 | Le schede portano **il numero**, come Hermes: «Attrezzi 43 · Skill 12». |
| C4 | Gli attrezzi si spengono **uno per uno, per sessione**, col permesso sulla stessa riga. |
| C5 | Ogni attrezzo dichiara **il suo costo in token**, e in cima c'è il **totale**. |
| C6 | Il totale è anche **percentuale della finestra** del modello scelto. |
| C7 | **Ricerca fra gli attrezzi**, con un esempio vero nel segnaposto. |
| C8 | Ordine per **più usati in questa sessione** (il conteggio c'è già da O-02). |
| C9 | **Pannello di dettaglio a destra**: descrizione, costo, permesso, **ultime chiamate**. |
| C10 | Descrizione **nostra in italiano**; quella del kernel resta visibile come «testo inviato al modello». |
| C11 | Gli attrezzi che il modello scelto **non supporta** sono dichiarati e spenti (lezione Gemma 3). |
| C12 | Le skill si governano con **tre stati**: sempre / chiedi / mai. La stessa grammatica dei permessi. |
| C13 | **«Trasforma questo lavoro in una skill»** dalla sessione corrente, costruita dai giri già registrati. |
| C14 | **Nessun mercato di skill adesso**: è una riga a parte, da stimare da sola. |
| C15 | I connettori MCP dichiarano **l'origine**: progetto, utente o gestito. |
| C16 | Per ogni connettore: **timeout, elenco permesso e costo dello schema**, tutti e tre. |
| C17 | Un connettore si spegne **per sessione**, come gli attrezzi. |
| C18 | Un plugin dichiara **cosa porta dentro** (quante skill, quanti hook, quali attrezzi) prima che tu ti fidi. |
| C19 | La fiducia di un plugin vale **per progetto, legata all'impronta**, come già per gli hook. |
| C20 | **PUNTO CRITICO — tutte e sei** le sezioni-luogo entrano nella sidebar. Vanno verificate una per una: le funzionalità dovrebbero esserci già. |
| C21 | Un file in Libreria dichiara **il costo in token** (coerente con B9). |
| C22 | La Memoria distingue **gli strati** (di lavoro, episodica, semantica), come Hermes. |
| C23 | Una memoria **si corregge a mano** e mostra **quando è stata usata l'ultima volta**. |
| C24 | Note e Attività restano **separate** — riprendendo il lavoro già fatto sul mobile. |
| C25 | Le Attività mostrano **l'autore su ogni riga**: tu o l'agente. |
| C26 | La Ricerca approfondita è una sezione con **l'elenco dei rapporti**, riapribili. |
| C27 | L'Officina mostra **il codice dell'attrezzo in sola lettura**, con «disabilita» in evidenza. |
| C28 | Le voci non implementate restano **in fondo, come elenco piatto**: sono promesse, non funzioni. |
| C29 | **Dove vivono i file** scritto in piccolo sotto ogni elenco: è ciò che rende l'app ispezionabile. |
| C30 | **La portata di una modifica è dichiarata in fondo alla pagina** («vale dalle sessioni nuove»). |

## D-H — non ancora chieste

Restano **D** (impostazioni), **E** (permessi e sicurezza), **F** (nuova sessione e
workspace), **G** (viste della sessione), **H** (doctor, errori, primo avvio, voce
dell'interfaccia). Si chiedono nell'interfaccia, a gruppi, come le prime tre.
