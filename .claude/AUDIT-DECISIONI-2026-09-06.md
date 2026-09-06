# Audit — le decisioni del 04/09 contro la app viva del 06/09

> Owner 06/09: «rileggere tutte le domande decisionali, una per una, riga per riga, lettera per
> lettera, e assicurarti che la nuova interfaccia e le funzioni rispettino esattamente le nostre
> domande decisionali».
>
> Fonte delle decisioni: `.claude/DECISIONI-REDESIGN-TALOS-2026-09-04.md` (le risposte dell'owner
> alle 240 domande di `DOMANDE-REDESIGN-TALOS-2026-09-04.md`). Ogni riga qui sotto è una decisione
> di quel file, nell'ordine in cui sta lì.
>
> **Come è stato verificato.** Due giri di ispezione automatica, solo letture, nessuna sessione
> avviata: `scratchpad/audit-decisioni/ispeziona.mjs` sul server di prova 4175 (10 schermate, 8
> sezioni di impostazioni, 10 dialoghi, menu della riga sessione, 4 viste della sessione) e
> `ispeziona4174.mjs` sul 4174 dell'owner, che ha il runtime vero (Capability con i 43 attrezzi,
> scorciatoie, pillole del composer). Foto in `scratchpad/audit-decisioni/foto/` e `foto4174/`,
> dati grezzi in `rapporto.json` e `rapporto4174.json`. Il resto è letto nel codice servito
> (`harness-ui/frontend/src/…`, commit `17c56315`).
>
> **Legenda.** ✅ rispettata · ⚠️ parziale (dice cosa manca) · ❌ non rispettata · 🔜 non
> verificabile senza un giro vero col modello (dichiarata, non giudicata).

## Il quadro in numeri

| Categoria | ✅ | ⚠️ | ❌ | 🔜 |
|---|---:|---:|---:|---:|
| A · sidebar (12) | 8 | 1 | 3 | 0 |
| B · chat e composer (32) | 13 | 8 | 7 | 4 |
| C · capability (30) | 9 | 6 | 8 | 7 |
| D · impostazioni (28) | 8 | 6 | 11 | 3 |
| E · permessi (30) | 13 | 5 | 5 | 7 |
| F · nuova sessione (23) | 8 | 5 | 9 | 1 |
| G · viste della sessione (20) | 12 | 4 | 2 | 2 |
| H · doctor, errori, voce (18) | 9 | 6 | 1 | 2 |
| **totale (193 righe)** | **80** | **41** | **46** | **26** |

⛔ Le tre cose che contraddicono una decisione **in faccia all'utente**, cioè promettono a schermo
qualcosa che non succede: la scorciatoia `Ctrl ⇧ M` disegnata sulla pillola del modello e **morta**
(B10), la ricerca della sidebar che si dichiara «Cerca nelle conversazioni» e **filtra solo i
titoli** (A6), la barra di stato che su una sessione nuova mostra **i consumi di quella precedente**
(G30, difetto già noto e ancora vivo).

---

## A · SIDEBAR E NAVIGAZIONE — 12 decisioni

| # | Decisione | Esito | Prova |
|---|---|---|---|
| A1 | Tre blocchi: azioni · luoghi · cronologia | ✅ | «Nuova» + ricerca in cima, `LUOGHI`, `SESSIONI` (foto `foto4174/sidebar.png`) |
| A2 | Massimo 5-7 voci, il resto dietro «Altro» | ✅ | Capability · Board · Libreria · Memoria · Attività + «Altro» |
| A3 | Nome della cosa, non dell'azione | ✅ | Memoria, Libreria, Attività, Board |
| A4 | «Capability» con sottotitolo esplicativo nella pagina | ⚠️ | La pagina ha il sottotitolo della scheda («Quello che il modello può usare»), non uno di Capability |
| A5 | Sezione «Fissate» sopra le sessioni, si fissa dal menu | ❌ | Nessun gruppo «Fissate» a schermo; il menu della riga ha Apri · Rinomina · Fork · Copia identificativo · Elimina, **senza «Fissa»**. Il bridge lo dichiara: `legacy-dom.js:126` «la app non ha ancora il pin delle sessioni» |
| A6 | Ricerca **dentro le conversazioni**, non solo nei titoli | ❌ | Nessuna rotta di ricerca lato server (`sessions/search` non esiste); il campo filtra i titoli. ⛔ E l'etichetta per lo screen reader dice «Cerca nelle conversazioni»: promette ciò che non fa |
| A7 | Scorciatoie disegnate accanto alle voci | ❌ | Nessun `kbd` nella sidebar (`rapporto4174.json`, `sidebar.kbd` vuoto) |
| A8 | La sidebar si riduce a icone | ✅ | `#sessionsCollapseBtn` presente e etichettato |
| A9 | Larghezza 260-280 px | ✅ | 274 px misurati sulle foto |
| A10 | Via il suggerimento «Tieni premuta una chat» | ✅ | Assente |
| A11 | «SESSIONI REALI» → «Sessioni» | ✅ | L'etichetta è `SESSIONI` (maiuscolo ammesso da H23 per le etichette di sezione) |
| A12 | Icone delle sezioni monocrome | ✅ | Foto |

## B · CHAT, COMPOSER E STATO VUOTO — 32 decisioni

| # | Decisione | Esito | Prova |
|---|---|---|---|
| B1 | Logo + cosa può fare + **tre** esempi cliccabili | ⚠️ | Logo e testo ci sono, gli esempi sono **due** («Esegui i test», «Fammi una mappa di src») |
| B2 | L'hero nomina il progetto | ✅ | «Cosa costruiamo in progetto-1?» |
| B3 | Esempi dedotti dal progetto | ✅ | «cartella test trovata alla radice» |
| B4 | Il «+» serve **solo** ad allegare; Capability esce dal composer | ❌ | Il «+» (`#capabilityBtn`, etichetta «Aggiungi contesto») apre il foglio **«Strumenti, skill e connettori»** con attività, ricordi e promemoria: è ancora l'hub |
| B5 | Capability in sidebar **e** scorciatoia nel composer | ✅ | Voce di sidebar + bottone nel composer |
| B6 | Il «+» allega tutte e quattro le cose | ⚠️ | Nel foglio si vede «Allega un file del workspace»; disco, immagini e ultimo screenshot non compaiono nell'elenco visibile |
| B7 | Incolla **e** trascina | ❌ | Nessun gestore `paste` nel codice servito |
| B8 | Tetti (quanti file, quanto grandi) scritti nel foglio | 🔜 | Non trovati nel foglio; da riguardare con un allegato vero |
| B9 | Ogni allegato dichiara il costo in token | ❌ | Nessun calcolo né riga a schermo |
| B10 | Pillola del modello con `Ctrl+Shift+M` **scritta** | ⚠️ | La scritta c'è («deepseek-v4-flash-latest Ctrl ⇧ M»); ⛔ **il tasto non apre niente** |
| B11 | Pillola del permesso col colore del rischio | ✅ | «Scrittura nel workspace» / «Accesso completo» in rosso |
| B12 | Contatore dei giri **dal 50%** del tetto | ❌ | Mostra «Giri 9» con tetto 24, cioè al 37% |
| B13 | Invio manda, Shift+Invio va a capo | ✅ | `app.js:13744` |
| B14 | Invio durante un giro: **bivio** indirizza / accoda | ⚠️ | Esiste il pulsante «Reindirizza»; il bivio a due pulsanti all'Invio non è a schermo |
| B15 | `Ctrl+Invio` accoda, coda a vista | ⚠️ | La coda esiste davvero (banner e rotta `queue`), **la scorciatoia no**: nessun gestore per Ctrl+Invio |
| B16 | Esc ferma il giro, con conferma | ❌ | Escape chiude solo dialoghi e pannelli; l'arresto è legato al solo pulsante |
| B17 | Il pulsante di invio diventa «ferma» | ✅ | Classe `talos-send--stop` |
| B18 | Ragionamento in un blocco chiuso di default | ✅ | Interruttore «Mostra ragionamento» più il blocco |
| B19 | Attrezzi in linea, poi raccolti per giro | ✅ | «1 ricerca completata, 4 comandi eseguiti» |
| B20 | Attrezzo fallito: riga rossa col motivo e «riprova» | ⚠️ | La riga rossa c'è («3 attività non riuscite»); il «riprova» per attrezzo non è visibile |
| B21 | Fonti web: titolo cliccabile e dominio | 🔜 | Serve un giro con ricerca web |
| B22 | File toccati in fondo al messaggio **e** nel pannello | ✅ | Pannello «File toccati in questa sessione» |
| B23 | Indice dei giri nella colonna di destra | ✅ | «Indice dei giri» con una riga per giro |
| B24 | Copia messaggio, copia giro, **esporta sessione** | ⚠️ | «Copia la risposta» c'è, l'esportazione c'è nella palette; la copia del giro intero non si vede |
| B25 | Modificare un messaggio crea un ramo | 🔜 | C'è «Chiedi di nuovo»; il ramo si prova solo in un giro |
| B26 | Costo per sessione, non per messaggio | ✅ | «Sessione $0,08» nel composer |
| B27 | Lo scorrimento segue sempre | 🔜 | Da provare durante uno streaming vero |
| B28 | Il composer si ridimensiona e ricorda | ✅ | `#composerResizeHandle` |
| B29 | Dettatura vocale solo se funziona | ⚠️ | Il microfono c'è, il funzionamento non è mai stato verificato (come dice la decisione stessa) |
| B30 | Tetto dei giri illimitato con freno dichiarato | ❌ | Ancora 24 giri: decisione grossa, legata al kernel (riga K-12) |
| B31 | Striscia di stato fissa sopra il composer | ⚠️ | C'è una riga di stato nel piede; la striscia «cosa sta facendo, quale giro, da quanto» non è quella |
| B32 | Clic su un file citato: menu con anteprima o editor | 🔜 | Serve un giro che citi un file |

## C · CAPABILITY — 30 decisioni

| # | Decisione | Esito | Prova |
|---|---|---|---|
| C1 | Capability è una **pagina** | ✅ | Schermata intera con testata propria |
| C2 | Quattro schede + sei voci di sidebar | ✅ | Attrezzi · Skill · Connettori · Plugin · **Hook** (una in più); Libreria, Memoria e Attività in sidebar, Note, Ricerca e Officina sotto «Altro» |
| C3 | Il numero sulle schede | ⚠️ | Solo «Attrezzi 43»; Skill, Connettori, Plugin e Hook senza numero |
| C4 | Attrezzi spegnibili uno per uno, per sessione | ✅ | Foglio permessi con un menu per attrezzo |
| C5 | Costo in token per attrezzo più il totale in cima | ❌ | Assente |
| C6 | Totale come percentuale della finestra | ❌ | Assente |
| C7 | Ricerca fra gli attrezzi | ✅ | «Cerca un attrezzo…» |
| C8 | Ordine per più usati nella sessione | ⚠️ | Il conteggio d'uso c'è («Uso registrato: 11 chiamate»), l'ordinamento no |
| C9 | Pannello di dettaglio a destra | ❌ | Nessun pannello |
| C10 | Descrizione **in italiano**, quella del kernel dichiarata | ❌ | Le righe mostrano solo l'inglese del kernel: «Lists the files of the workspace, with their sizes…» |
| C11 | Attrezzi non supportati dal modello dichiarati | 🔜 | Serve un modello senza attrezzi |
| C12 | Skill a tre stati (sempre, chiedi, mai) | 🔜 | Scheda Skill non ispezionata a fondo in questo giro |
| C13 | «Trasforma questo lavoro in una skill» | ❌ | Assente |
| C14 | Nessun mercato di skill adesso | ✅ | Assente per scelta |
| C15 | Connettori: origine dichiarata | 🔜 | Da ispezionare |
| C16 | Timeout, elenco permesso, costo dello schema | 🔜 | Da ispezionare |
| C17 | Connettore spegnibile per sessione | 🔜 | Da ispezionare |
| C18 | Un plugin dichiara cosa porta dentro | 🔜 | Da ispezionare |
| C19 | Fiducia del plugin per progetto, con impronta | 🔜 | Da ispezionare |
| C20 | Tutte e sei le sezioni-luogo nella sidebar | ✅ | Presenti: tre dirette, tre sotto «Altro» |
| C21 | Costo in token per un file della Libreria | ❌ | Assente |
| C22 | La Memoria distingue gli strati | ⚠️ | Mostra il genere («Preferenza»), non gli strati di lavoro, episodica e semantica |
| C23 | Memoria correggibile a mano più l'ultimo uso | 🔜 | Da provare con un ricordo vero |
| C24 | Note e Attività separate | ✅ | Due voci distinte |
| C25 | Le Attività mostrano l'autore | ⚠️ | La riga dice «Autore non registrato»: la colonna c'è, il dato no |
| C26 | Ricerca approfondita con elenco dei rapporti | ✅ | Sezione con elenco |
| C27 | Officina: codice in sola lettura più «disabilita» | 🔜 | Da ispezionare |
| C28 | Non implementate in fondo, elenco piatto | ✅ | «NON ANCORA IMPLEMENTATI» in fondo alla pagina |
| C29 | Dove vivono i file, scritto in piccolo | 🔜 | Non visto nelle schede aperte |
| C30 | Portata della modifica in fondo alla pagina | ⚠️ | In fondo c'è una nota, ma dice altro: «un attrezzo offerto può avere una dipendenza non configurata» |

## D · IMPOSTAZIONI — 28 decisioni

| # | Decisione | Esito | Prova |
|---|---|---|---|
| D1 | Navigazione a sinistra | ✅ | Otto voci in colonna |
| D2 | Dieci sezioni in due gruppi | ⚠️ | **Otto** sezioni e **nessun gruppo**: Aspetto e movimento · Chat e composer · Laboratorio modelli · Provider e accessi · Strumenti agente e permessi · Privacy e dati locali · File e workspace · Account, Doctor e backup |
| D3 | Ricerca in cima alla navigazione | ✅ | «Cerca una preferenza…» |
| D4 | Sotto-sezioni, mai oltre due livelli | ✅ | Rispettato |
| D5 | Esporta, importa, ripristina | ❌ | Nessuno dei tre |
| D6 | Ogni riga dichiara quando morde | ⚠️ | Presente su alcune righe, non è una regola della lista |
| D7 | Un modello ausiliario per mestiere | ❌ | Solo il modello principale, più il planner che secondo F14 doveva venire qui |
| D8 | Valore corrente in monospazio | ✅ | Classe monospazio sui valori |
| D10-D12 | Pannello scorciatoie con ricerca, riassegnabili, `Ctrl+/` | ❌ | `Ctrl+/` non apre niente e non esiste il pannello. ⛔ Anche `Ctrl ,`, scritto nel titolo del pulsante Impostazioni, non fa niente |
| D13 | «Sicurezza» sezione a parte | ⚠️ | Diluita fra «Strumenti agente e permessi» e «Privacy e dati locali» |
| D14 | Timeout dell'approvazione configurabile | ❌ | Assente |
| D15 | Redazione dei segreti accesa di default | ❌ | Assente |
| D16 | Comandi permessi **per progetto** | 🔜 | Da ispezionare in «Strumenti agente e permessi» |
| D17 | Indirizzi privati: chiedi ogni volta | 🔜 | Da ispezionare |
| D18 | Checkpoint dei file, opzione spenta | ❌ | Assente |
| D19 | Provider con pallino di salute e ultima verifica | ⚠️ | La sezione c'è e la prova della chiave esiste dal 03/09; il pallino e la data non si vedono nell'elenco |
| D20 | Chiavi mai in chiaro | ✅ | Solo stato e «rimuovi» |
| D21 | Sezione **Costi** | ❌ | Assente: il costo si vede solo nel composer, per sessione |
| D22 | Consumo per giorno e per modello | ❌ | Assente |
| D23 | Aspetto: tema, densità, dimensione del testo, movimento, più i temi già esistenti | ✅ | Tema TALOS · Modalità colore · Densità delle liste · **Lingua dei menu** · Sfondo animato · Dimensione interfaccia · Testo chat |
| D26 | Memoria e contesto con la ripartizione della finestra | ❌ | Assente |
| D27 | Chat archiviabili | ❌ | Solo eliminazione |
| D28 | Profili: dopo | ✅ | Assenti per decisione |
| D29 | Doctor dentro le impostazioni | ✅ | «Account, Doctor e backup» |
| D30 | Informazioni: versione, cartelle, licenze, «apri la cartella dei dati» | ⚠️ | Parte dei dati sta nella sezione Account; «apri la cartella dei dati» non si trova |

## E · PERMESSI E SICUREZZA — 30 decisioni

| # | Decisione | Esito | Prova |
|---|---|---|---|
| E1 | Carte nel foglio **e** tendina nella testata | ⚠️ | Le quattro carte ci sono nel foglio; nella testata non c'è tendina, il cambio rapido è la pillola del composer |
| E2 | Etichetta di rischio | ✅ | «Minimo rischio» · «Consigliato» · «Controllato» · «Alto rischio» |
| E3 | «Consigliato» su scrittura nel workspace | ✅ | Foglio permessi |
| E4 | «Accesso pieno» con la spunta «ho capito» | ✅ | Passo 3 dell'intro |
| E5 | Il permesso per attrezzo vince, e la riga lo dice | ✅ | «La scelta per attrezzo precede la politica generale» |
| E6 | Nome e descrizione su due righe | ✅ | Righe del foglio |
| E7 | Tutti i 43 attrezzi con «come la sessione» più il filtro | ⚠️ | I 43 stanno in Capability con i filtri (Tutti · Con permesso · Da configurare); nel **foglio** ne compaiono pochi |
| E8 | Ultime tre chiamate nel dettaglio | ❌ | Nessun pannello di dettaglio |
| E9 | La richiesta dice sempre perché | 🔜 | Serve una richiesta vera |
| E10 | Differenza prima e dopo prima di approvare una scrittura | ❌ | Nessuna anteprima nella carta di approvazione |
| E11 | Nessun conto alla rovescia | ✅ | Assente per decisione |
| E12 | «Sempre per questa sessione», tranne i file di controllo | ✅ | Attributo `data-allow-session` |
| E13 | Sezione «Registro» delle approvazioni | ❌ | Assente |
| E14 | Le ricevute firmate si mostrano | ✅ | Componente ricevute vivo |
| E15 | File di controllo elencati nella sicurezza | 🔜 | Da ispezionare |
| E16 | Repo annidati mostrati | ✅ | Scheda Ambiente |
| E17 | Radice enorme: misurata e proposta al momento della scelta | ❌ | Nessun conteggio, nessun avviso |
| E18 | Ogni giro dichiara il permesso | ✅ | Bolla utente con il permesso |
| E19 | Cambio di permesso annotato in chat | ✅ | Già fatto |
| E20 | Attrezzo rifiutato è una nota, non un errore | ✅ | Nota |
| E21 | Negare vale per la sessione | ✅ | Per sessione |
| E22 | La trifecta si mostra quando scatta | ❌ | Il kernel la calcola, la interfaccia non la mostra |
| E23 | Comando intero più cartella prima di approvare | 🔜 | Serve una richiesta vera |
| E24 | Variabili d'ambiente con i valori nascosti | 🔜 | Serve una richiesta vera |
| E25 | «Sola lettura» con la conseguenza scritta | ✅ | «Legge progetto e comandi non mutanti» |
| E26 | Rete e filesystem due assi distinti | ⚠️ | Un solo asse nelle quattro carte; la rete sta dentro i permessi per attrezzo |
| E27 | Elenco di permessi per la rete, mai di divieti | 🔜 | Da ispezionare |
| E28 | Registro esportabile in JSONL e come rapporto | ⚠️ | L'esportazione della sessione c'è; il registro delle azioni come tale no |
| E29 | Il permesso scade a fine sessione | ✅ | Per sessione |
| E30 | «Riporta a scrittura nel workspace» sempre visibile | 🔜 | Non visto nel foglio |

## F · NUOVA SESSIONE — 23 righe di decisione

| # | Decisione | Esito | Prova |
|---|---|---|---|
| F1-F2 | Modale in **due passi** (dove, poi come) | ❌ | È ancora una modale a **due colonne** piene, il foglio del monolite: workspace a sinistra, sessione a destra |
| F3-F5 | Recenti · progetti con quante sessioni · scelte rapide · albero | ⚠️ | Ci sono tutte e quattro le vie; **manca il numero di sessioni** accanto al progetto |
| F6 | Albero stretto con ricerca per nome | ⚠️ | L'albero c'è ed è largo mezza modale; la ricerca per nome non è nel foglio |
| F7-F8 | Percorso in cima, cartella scelta **accanto al pulsante** | ⚠️ | Il campo in cima c'è; la cartella scelta è in basso a sinistra, lontana dal pulsante, cioè il difetto che la decisione voleva togliere |
| F9-F10 | Numero di file e avviso se è una radice | ❌ | Nessuno dei due |
| F11-F14 | Modello · ragionamento · permessi · comando dei test, e **il planner esce** | ⚠️ | I primi quattro ci sono; ⛔ «PLANNER OPZIONALE» è **ancora nella modale**, contro F14 |
| F16 | Default: scrittura nel workspace | ⚠️ | Nella modale aperta oggi era selezionato **«Full access»** (foto `banco-umano/foto/scopri3-nuova.png`): il default segue l'ultima scelta, non la decisione |
| F17 | Nessun nome alla creazione | ✅ | Il titolo lo scrive il primo messaggio |
| F18 | «Continua da…», ramo da una sessione esistente | ❌ | Assente nel foglio |
| F19-F21 | Ramo git · modifiche non salvate · repo annidati | ❌ | Nessuna delle tre nella modale |
| F22 | Comando dei test correggibile, con la fonte | ⚠️ | Il campo c'è; «trovato in package.json» non è dichiarato |
| F23-F24 | Riga col totale attrezzi, senza spegnerli qui | ⚠️ | Non si spengono, ed è giusto; ma **manca la riga del totale** |
| F25 | Il pulsante nomina la cartella | ✅ | «Continua nella chat — AVM-harness-desktop» |
| F26 | Annullare non perde la configurazione | 🔜 | Da provare |
| F27 | «Riapri l'ultima sessione» in cima allo stato vuoto | ✅ | Presente |
| F28 | Una sessione creata e non avviata **non compare** | ❌ | Compare: «Nuova · progetto-1 — in attesa del primo messaggio» |
| F29 | Nessuna sessione senza cartella | ✅ | Il foglio esige la cartella |
| F30 | Primo messaggio suggerito dal progetto | ✅ | Esempi dedotti |

⛔ **RITIRATO il 06/09**: avevo scritto che la modale avviava un modello diverso da quello scelto. Riprodotto: non è vero, era la mia sonda che scambiava una **delega del kernel** (che gira con `glm-4.7-flash`) per la sessione sotto prova.

⛔ **RITIRATO il 06/09.** Avevo scritto qui che «il modello scelto non è quello avviato» (scelto 5.3,
partito 4.7). **Non è vero.** Riprodotto catturando la richiesta: il client manda `z-ai/glm-5.3-flash` e
la sessione nasce con `z-ai/glm-5.3-flash`. Era la mia sonda a prendere «la prima sessione nuova»
dell'elenco, e fra quelle c'erano le **deleghe del kernel** (`taskId: delega:…`), che girano con
`glm-4.7-flash`. Resta vero, e riguarda il kernel: **le deleghe non ereditano il modello della madre**.

⛔ **Fuori tabella, trovato provando la modale come farebbe una persona (06/09).** Con una cartella
fuori dall'elenco dei progetti il server esige «Accesso pieno»: se scegli «Scrittura nel workspace»,
cioè il default deciso in F16, il primo messaggio **resta nel composer** e appare la nota «Serve
Full access». L'intro ti lascia scegliere una cartella qualunque e un permesso che con quella
cartella non può funzionare, e lo scopri solo al primo invio. Va detto al momento della scelta, come
vuole E17. Codice: `app.js`, ramo `cartellaLibera` con permesso diverso da «Full access».

## G · VISTE DELLA SESSIONE — 20 righe di decisione

| # | Decisione | Esito | Prova |
|---|---|---|---|
| G1-G2 | Chat e Terminale nella sessione, Board nella sidebar, nomi scritti | ✅ | Chat · Terminale · Review · Browser con il nome; Board è una voce di sidebar |
| G3-G4 | Board a righe con le sette colonne più cache, primo token e motivo di chiusura | ✅ | «Stato, token, cache e motivo di chiusura delle tue sessioni» |
| G5-G7 | Ordinare · filtrare per stato · costo come stima · filtrare per cartella | ⚠️ | Filtri e ordinamento presenti; il filtro per cartella e la memoria dell'ordinamento non verificati |
| G8-G10 | Terminale: cartella · isolamento · chi ha lanciato · schede | ✅ | Barra delle schede con cartella e stato, fatta il 06/09 |
| G11-G13 | Colonna a quattro schede; «File» mostra i toccati, albero dietro un interruttore | ✅ | Contesto · File · Agenti · Processi, e «Nascondi l'albero della cartella» |
| G14-G16 | Ambiente nella colonna; Control plane diventa Doctor | ✅ | Scheda Ambiente nella colonna; Doctor nelle impostazioni |
| G17-G19 | Albero dei rami come foglio, anche dalla colonna, con token e giri per nodo | ⚠️ | Il foglio c'è e si apre dalla colonna; token e giri per nodo non verificati |
| G20-G21 | Processi con durata, esito e avviso di stallo | ✅ | Scheda «Processi» |
| G22/G29 | Contrassegno sulla sessione · pannello notifiche · notifica di sistema | ❌ | ⛔ Il pulsante notifiche **non apre niente**, etichetta «Notifiche: nessuna»; nessun pannello |
| G23-G26 | Review separata e da tastiera; automazioni con la storia | ⚠️ | Review separata e automazioni come destinazione ci sono; la scorciatoia della Review vive solo nella palette, la storia delle esecuzioni non è verificata |
| G27 | «File toccati oggi»: dopo | ✅ | Assente per decisione |
| G28 | Interrotte e concluse distinte | ✅ | Stati distinti nella sidebar |
| G30 | La barra di stato dice il vero | ❌ | Senza sessione aperta mostra «92,1k token · 9 giri · cache 83%» della precedente |

## H · DOCTOR, ERRORI, PRIMO AVVIO, VOCE — 18 righe di decisione

| # | Decisione | Esito | Prova |
|---|---|---|---|
| H1-H5 | Doctor con severità, conteggio e rimedi eseguibili | ⚠️ | Il Doctor c'è dentro le impostazioni; severità, conteggio e rimedi non ispezionati in questo giro |
| H6 | Quanto occupano la app e lo store | ⚠️ | Presente nei componenti, non verificato a schermo |
| H7 | Doctor esportabile in JSON | ⚠️ | Presente nel codice, non verificato a schermo |
| H8 | Solo contrassegno, mai apertura automatica | ✅ | Nessuna apertura automatica |
| H9-H10 | Pagina più nuova del server: due versioni e riavvio proposto | ❌ | Nessun controllo di versione fra pagina e server, riga W0-09 |
| H11-H13 | Errore: due frasi · niente JSON · codice citabile · momento e sessione | ✅ | Envelope con titolo, spiegazione, azione e riferimento per il Doctor |
| H14-H15 | «Giri esauriti» è una nota; note di sistema distinte e nascondibili | ✅ | Nota con diagnosi |
| H16-H19 | Intro a quattro passi, saltabile, ripetibile, solo se serve, chiave più locale, poi una sessione | ⚠️ | Tutto vero tranne l'ultimo: alla fine si apre una chat **vuota** con esempi, non un compito pronto |
| H20 | «Niente telemetria, niente esce da questa macchina» | ⚠️ | Frase equivalente nello stato vuoto della chat; nell'intro c'è solo la riga sul fornitore |
| H21 | La lingua segue il sistema, italiano e inglese | ✅ | «Lingua dei menu» in Aspetto, fatto il 06/09 |
| H22 | Nessun nome tecnico, con una mappa unica | ⚠️ | Gli attrezzi hanno nomi umani; ⛔ il foglio dei modelli mostra gli identificatori grezzi e la pillola pure |
| H23 | Maiuscole solo per le etichette di sezione | ✅ | Rispettato |
| H24-H26 | Unità sempre · stime dichiarate · tempi relativi fino a 24 ore | ✅ | «74 sessioni», «2 giorni fa», «stima» |
| H27-H30 | Tastiera come cancello · focus visibile · movimento ridotto ovunque · alto contrasto dopo | ⚠️ | Il focus si vede e il movimento si regola; ⛔ due scorciatoie dichiarate a schermo sono morte e manca il pannello: il cancello «tutto da tastiera» non è passato |

## Fuori dalle decisioni, trovato nello stesso giro

- **13 errori di Content Security Policy in console** su 4175 e altrettanti su 4174: «Applying
  inline style violates the following Content Security Policy directive». Sono stili in linea
  applicati da JavaScript. Non rompono niente a schermo, ma sporcano la console e nascondono errori
  veri.
- **La palette dei comandi usa i simboli del Mac su Windows**: «Nuova sessione ⌘N», «Apri review
  ⌘R», «Apri terminale ⌘T». Su questa macchina la combinazione è Ctrl.

## Cosa propongo, nell'ordine

1. **Le tre promesse rotte**, mezza giornata: `Ctrl ⇧ M` e `Ctrl ,` che aprono davvero, la barra di
   stato azzerata su una sessione nuova (G30), e l'etichetta della ricerca allineata a ciò che fa
   finché A6 non è vera.
2. **Il «+» del composer** (B4): deve allegare e basta, con i quattro ingressi decisi in B6.
3. **La modale «Nuova sessione»** (F1-F28): è il pezzo più lontano dalle decisioni, undici righe fra
   mancate e parziali, ed è anche il foglio che il cutover aveva lasciato senza stile. Va portata
   nel `veloNuova` del mockup in due passi, con dentro E17 (misura della cartella) e il permesso
   coerente con la cartella scelta.
4. **Il pannello delle scorciatoie** (D10-D12) e le notifiche (G22/G29): due superfici mancanti.
5. **Capability, seconda metà** (C5, C6, C9, C10): costo per attrezzo, percentuale del contesto,
   pannello di dettaglio, descrizione in italiano.
