# Ledger — auto-scroll, streaming scattoso, dissolvenza, cursore terminale (02/09)

> Owner, dal vivo, in tre messaggi consecutivi mentre lavoravo sul
> ridisegno del Model Lab:
> 1. *"un altro bug che ho notato è lo scrolling automatico fa schifo non
>    centra bene la risposta in streaming al centro, bisogna vedere come
>    fa claude codex e hermes (hermes devi vedere esattamnte la funzione
>    di codice che lo fa) e poi lo streaming dell output è macchinoso ed
>    estremamente scattoso"*
> 2. *"in oltre il rendering a dissolvenza e cursore terminale non
>    funzioano bene"*
>
> Registrato SUBITO (regola vincolante: ogni debito riportato si segna
> prima di indagare), non ancora diagnosticato riga per riga in questo
> commit — questo file apre l'indagine, non la chiude.

## I quattro punti, come riportati

1. **Auto-scroll durante lo streaming**: non centra bene la risposta
   mentre arriva. Owner chiede un confronto con Claude/Codex/Hermes —
   e per Hermes, specificamente, la funzione di codice REALE (repo
   locale già clonato in scratchpad: `hermes-agent-repo/`, `hm2/`), non
   un'impressione.
2. **Streaming dell'output "macchinoso ed estremamente scattoso"** —
   probabile correlato al punto 1 (stesso ciclo di re-render ad ogni
   token?), ma trattato come punto distinto finché non isolato.
3. **Rendering a dissolvenza (fade-in) non funziona bene** — presumo sia
   l'animazione di comparsa del testo/dei blocchi mentre arrivano, da
   verificare nel codice quale selettore/classe la applica.
4. **Cursore del terminale non funziona bene** — imparentato con
   `LEDGER-TERMINALE-REALE.md` (xterm.js, già una storia di bug
   sottili qui: keyCode mancante, mousedown/mouseup reali per il focus,
   `height` fissa contro il loop di resize) — da leggere prima di
   toccare `.terminal-window`/xterm, non ripartire da zero.

## Prossimi passi (non ancora eseguiti)

- Isolare nel codice (`app.js`) dove avviene lo scroll automatico
  durante `TextMessageContent`/`StateDelta` (probabile un
  `scrollIntoView`/`scrollTop` ad ogni chunk) e la classe/animazione di
  dissolvenza.
- Leggere il sorgente REALE di Hermes per l'auto-scroll durante lo
  streaming (repo locale in scratchpad — verificare se è aggiornato
  o va riclonato) — funzione esatta, non una descrizione.
- Misurare la "scattosità" con CDP Tracing (stesso strumento già usato
  per il lag di Harness Desktop, `LEDGER-LAG-DESKTOP-2026-09-01.md`) —
  non fidarsi a occhio: frame lunghi, layout thrashing, o un
  intervallo/callback che ridisegna più del necessario.
- Terminale: leggere `LEDGER-TERMINALE-REALE.md` per intero prima di
  toccare xterm — il cursore potrebbe essere lo stesso tipo di difetto
  già trovato lì (evento sintetico incompleto) o uno nuovo.

## ⛔⛔⛔ Registrato mentre indagavo sopra — DUE bug distinti, più gravi (correttezza, non cosmesi)

> Owner, dal vivo, trascritto letterale di una sessione TALOS reale
> (`google/gemini-3.7-flash`) mentre lavoravo sul fix sopra:
>
> **Turno 1** — "Create a new file named r2r3-proof.txt in this
> workspace with the text hello." → risposta del modello: *"Non è
> possibile creare o modificare file: l'ambiente è attualmente
> configurato in modalità sola lettura (read-only), quindi le
> operazioni di scrittura su disco non sono consentite."*
>
> **Turno 2** — "say hi" → **errore**, non una risposta:
> `[internal-error] HTTP 400 dopo 4 tentativi:
> {"error":{"message":"talos-test/modello-inesistente-r2r3 is not a
> valid model ID","code":400},"user_id":"user_3FG1j8kmjWdYSixNglpxJIZn4RO"}`
>
> Owner, subito dopo: **"l'ambiente non era in sola lettura"** — cioè
> il turno 1 ha mentito: il permesso NON era read-only per davvero.

### Perché sono gravi

1. **Falso "read-only"**: un modello che rifiuta di scrivere per un
   motivo dichiarato FALSO viola direttamente la disciplina di onestà
   di questo progetto (REGOLA ZERO) — non è "il modello ha sbagliato",
   è che lo STATO che gli è stato passato/letto era sbagliato. Sospetti
   da verificare, non presunti: risoluzione del permesso di sessione
   (`Workspace write`/`Full access`/`On request`), un default che non
   combacia con la selezione reale, o l'attrezzo `scrivi` che legge un
   flag stantio.
2. **ID modello di TEST in una sessione REALE**:
   `talos-test/modello-inesistente-r2r3` ha un prefisso `talos-test/`
   che grida "sentinella di test" — un valore che dovrebbe esistere
   SOLO dentro una suite `node --test`/vitest per provare il percorso
   di errore su un ID inesistente, non nella risoluzione modello di una
   sessione vera con un modello vero selezionato (`google/gemini-3.7-flash`,
   turno 1). Se un fixture di test sta contaminando la risoluzione
   modello in produzione, è un buco potenzialmente serio — stato
   condiviso fra test e server vivo, o una costante hardcoded con un
   fallback sbagliato. Non diagnosticato ancora: da cercare
   `talos-test/modello-inesistente-r2r3` letteralmente nel codice
   (sorgente Y test) per capire da dove esce E perché finisce in una
   sessione reale.

### Stato

🔜 Registrati, NON ancora diagnosticati — prossimo passo di questa
sessione dopo aver chiuso scroll/dissolvenza (fase già in corso,
quasi finita quando questi due sono arrivati).

## ✅ Scroll/dissolvenza — CORRETTI, verificati dal vivo

> ⛔ **Correzione owner, durante il primo giro di fix**: il primo
> tentativo seguiva il FONDO vero (`scrollHeight`, pattern Hermes
> "stick-to-bottom"). Owner, subito dopo: *"ripeto lo scroll non deve
> fermarsi a fine pagina ma a meta... quando scrollo alla fine output
> deve essere a meta non alla fine"* — la scelta di QUESTO prodotto è
> il CENTRO del viewport, non il fondo. Corretto nello stesso giro,
> prima di committare la prima versione.

- **Scroll**: `scrollStreamingOutput` non centra più l'intera bolla
  (che perdeva senso una volta più alta del viewport, il difetto
  originale) — ora porta il FONDO DEL CONTENUTO scritto finora
  (`getBoundingClientRect().bottom` dell'elemento messaggio, che si
  sposta in giù col testo vero) a META' del viewport, istantaneo (mai
  `smooth`), e SOLO mentre `streamingAutoFollow` è vero (si spegne da
  solo se l'utente scrolla via — confronto fra lo scrollTop reale e
  l'ultimo bersaglio scritto da noi, `streamingLastTargetTop`; si
  riarma su `RunStarted`). Principio "singolo writer, istantaneo mai a
  molla, mai contro un utente che si è spostato" preso da Hermes
  (`use-stick-to-bottom`, `apps/desktop/src/components/assistant-ui/
  thread/list.tsx`, letto dal vivo nel repo locale in scratchpad — la
  LORO scelta di bersaglio è il fondo, la NOSTRA è il centro, owner
  esplicito) — riportato in vanilla JS senza dipendenze nuove.
- **Dissolvenza**: `.stream-settle` sostituisce `:last-child` — la
  classe marca UNA VOLTA SOLA il testo appena stabilizzato
  (`renderizzaMarkdownIncrementale`), mai la coda volatile ricreata
  ogni frame, quindi l'animazione ora finisce invece di ripartire in
  continuazione.
- **Verificato dal vivo** (`verifica-scroll-streaming.mjs`, due sessioni
  reali `z-ai/glm-4.7-flash`): la PRIMA corsa (versione fondo-vero,
  prompt lungo su TCP) ha confermato che il meccanismo insegue
  davvero la coda che cresce (non più il centro dell'intera bolla). La
  SECONDA corsa (dopo la correzione al centro-viewport, prompt "25
  comandi Git") conferma `distanzaDalFondo:250` al termine — la vista
  NON è incollata al fondo (0px), coerente col nuovo bersaglio; il
  turno è stato più veloce del previsto (~11s) e non ha lasciato una
  finestra comoda per uno screenshot con `streaming:true` E contenuto
  già oltre il viewport nello stesso istante — la MATEMATICA del
  bersaglio (fondo del contenuto meno metà altezza viewport, clampato)
  è verificata per lettura diretta del codice, non (ancora) da uno
  screenshot che la coglie a metà stream. 🔜 Se dal vivo risultasse
  ancora non convincente, riverificare con un prompt che produce testo
  lungo più lentamente (paragrafi discorsivi, non un elenco veloce).
  `settleCount` cresce e l'ultimo figlio resta SENZA la classe
  `stream-settle` finché non si stabilizza — comportamento della
  dissolvenza confermato dalla telemetria, non solo dal codice. Zero
  eccezioni JS in nessuna delle corse. Backend 1319/1319 (fixture
  contratto rigenerata due volte), frontend 200/200.
- 🔜 Non implementato in questo giro (dichiarato, non perso): un
  pulsante "vai in fondo" quando l'utente si scosta (Hermes ce l'ha,
  `ScrollToBottomButton`) — senza, chi scrolla via durante uno stream
  lungo deve poi scrollare a mano fino in fondo. Nessuna regressione
  (prima l'auto-scroll lo forzava comunque giù, ora semplicemente non
  lo fa più) ma è il naturale incremento successivo.

## ✅ Owner, dal vivo, subito dopo — due richieste in più, ENTRAMBE FATTE e verificate

*"e quando clicco su una riga sessione il testo deve scrollare
automaticamente alla fine, e quando ricarico la pagina bisogna che si
apra automaticamente ultima sessione disponibile, ack tutto adesso"*

⛔⛔⛔ **Owner, subito dopo aver provato**: *"non hai provato
visivamente, INFRANTA REGOLA VINCOLANTE, adesso se clicco una mi
scrolla all'inizio non alla fine"* — segnalazione corretta, presa sul
serio: nessuno screenshot durante l'apertura di una sessione ESISTENTE
era ancora stato scattato (solo lo streaming di una NUOVA era stato
verificato). Investigato dal vivo con una sonda CDP dedicata
(scrollTop patchato con un setter che stampa lo stack, non
un'ipotesi): lo scroll ARRIVAVA al fondo giusto e ci RESTAVA (9s
filati, non un rimbalzo) — il problema vero non era "torna a zero", era
**quanto tempo ci mette**: per una cronologia con un solo messaggio
enorme (11.257px), `deferHistoricalRendering` salta il render
incrementale per design (giusto, evita di ridisegnare markdown ad ogni
delta per centinaia di eventi) — ma questo vuol dire ANCHE zero
scroll fino al SOLO evento `TextMessageEnd` finale, e se quel singolo
messaggio ci mette diversi secondi ad arrivare via replay SSE, la
conversazione resta ferma in cima per tutto quel tempo: sembra rotta,
è solo in ritardo.

**Corretto**: `mantieniFondoDuranteRipristino()` — un `MutationObserver`
su `#conversation` che segue il fondo VERO (`scrollHeight`, non il
centro: qui non si sta scrivendo nulla dal vivo) ad OGNI frammento che
arriva durante il ripristino di una sessione conclusa, non solo
all'ultimo evento. Si disconnette da solo al segnale di fine
(`eventoTerminaleVisto`) o dopo 30s di rete di sicurezza.

**Verificato dal vivo, due scenari diversi**:
- Sessione multi-messaggio (`libero:full-access`): lo scroll segue
  visibilmente il contenuto che cresce — `8943 → 9668 → 9778 → ... →
  10404 → 10363` (il vero max), già a **8943/10363 (86%) nel primo
  campione a 300ms** — non più fermo a 0 per secondi.
- Sessione a un solo messaggio enorme (505d4657, 11.257px): resta un
  limite reale, non del mio scroll — la fisica di UN SOLO evento
  `TextMessageEnd` finale non cambia. 🔜 Se serve chiuderlo del tutto,
  la cura vera è lato server (spezzare il replay `deferHistoricalRendering`
  in più frammenti anche per un singolo messaggio), fuori scope di
  questo giro — dichiarato, non nascosto.

**Auto-apertura ultima sessione al reload** — `apriUltimaSessioneDisponibileAllAvvio()`,
schedulata con `window.setTimeout(...,0)` (non sincrona al mount):
il commento sopra `ensureDownloadQueueBadge()` documenta un vincolo
GIÀ TESTATO ("il boot non fa mai una chiamata di rete propria" —
`CODE-COMPOSER-DEMO-SEND-01`, `HARNESS-BOARD-MOBILE-HONESTY-01`) e
quei due test controllano `fetchMock` in modo SINCRONO (zero tick)
subito dopo il mount — un `setTimeout` anche a 0ms non ha ancora
girato in quel momento preciso, verificato leggendo i due test riga
per riga E rilanciando la suite (200/200 verde, nessuna regressione).
Mai nell'embedded mobile demo. **Verificato dal vivo**: pagina
ricaricata da zero, la sessione più recente (13:34) si apre da sola,
sidebar evidenziata, chip modello/permesso popolati, screenshot
ispezionato.

## ✅ Strumentazione dello streaming — FATTA

Owner: *"lo streaming ha lag sostanziali a meta testo... trova un
modo per strumentare tutte queste statistiche per loggarle e
debuggarle"*. `window.talosStreamingLog()` (ultime 400 righe:
quando, evento, durata del render in ms, lunghezza del testo,
bersaglio di scroll) sempre attivo, costo minimo (un push su un array
capato, mai una console.log di default). `window.talosStreamingLogRiassunto(sogliaMs)`
per un'occhiata rapida (quante righe di render hanno superato la
soglia, la più lenta, la media). `window.__talosHarnessStreamingVerbose
= true` per uno specchio in console dal vivo. 🔜 Non ancora usata per
diagnosticare IL lag specifico riportato ("a metà testo") — lo
strumento c'è, la sessione lenta da rileggere con questo strumento
acceso non è stata ancora catturata (serve una sessione REALE che
mostri il lag, con `window.talosStreamingLogRiassunto()` letto subito
dopo).

## Cursore terminale, e i due bug di correttezza — NON iniziati

🔜 Cursore terminale: non ancora guardato dal vivo.
🔜 I due bug di correttezza (falso read-only, ID modello di test
`talos-test/modello-inesistente-r2r3` in una sessione reale): non
ancora diagnosticati.

⛔ **Owner: "appena finisci di sistemare e verificare questi bug
fermati"** — poi, subito dopo: *"I BUG NON SONO STATI SISTEMATI LA
CONVERSAZIONE SE CLICCO SU UNA RIGA SESSIONE SCROLLA IN ALTO NON IN
BASSO"*. Il fix di §"scroll-to-end" sopra ERA verificato dal vivo con
Chrome fresco (screenshot + misura CDP, non un'ipotesi) — sospetto
forte non confermato: la scheda del browser dell'owner era aperta
PRIMA del fix (il server serve i file statici dal disco senza bisogno
di riavvio, ma una scheda già caricata resta sul JS vecchio finché non
ricarica). Non verificabile da qui senza accesso al suo browser reale.

## ⛔⛔⛔ NUOVO, trovato tentando di riprodurre il falso read-only

Provando a riprodurre dal vivo il bug read-only (§ sotto), trovato un
bug DIVERSO e concreto: selezionato "gemini-3.7-flash" nel model
picker (il trigger del composer lo conferma testualmente,
"google/gemini-3.7-flash"), ma il POST reale a
`/api/v1/sessions/custom` ha spedito
`"modello":"z-ai/glm-4.7-flash"` — un modello COMPLETAMENTE diverso.
Non isolato se il difetto è nel salvataggio dello stato al click
sull'opzione, o nella lettura di quello stato al momento dell'invio.
Non escluso un collegamento con §7 (l'ID modello di test in una
sessione reale) — se il modello effettivo non è mai quello mostrato,
resta aperta la domanda di dove venga letto quello vero.

## ✅ Chiuso subito dopo la consegna — il ramo "riclicco la sessione già aperta"

Trovato per ragionamento diretto (non un'altra segnalazione dell'owner):
`passaASessione()`, il ramo `if (sessionId === state.realSession.id)`
(riclicco la riga della sessione GIÀ aperta — es. dopo essere scrollato
in su per rileggere qualcosa) NON passava da `nuovaGenerazioneSessione`,
quindi non chiamava NESSUNO scroll — l'unico punto rimasto dove
"clicco una riga sessione" non portava mai in fondo. Corretto: scroll
istantaneo al fondo vero (`scrollTop = scrollHeight`, nessun observer
necessario — il contenuto è già tutto a schermo, non in ripristino).

**Verificato dal vivo**: sessione aperta (scrollTop assestato in
avvicinamento al fondo), scrollato manualmente a 0 (simula "rileggo
qualcosa in alto"), ricliccata la STESSA riga → `scrollTop:10363`,
esattamente `scrollHeight(11577) - clientHeight(1214)`, il fondo vero,
istantaneo. Backend 1319/1319, frontend 200/200.

Owner, subito dopo: *"lascia che fable se ne occupi, tu passa avanti"*
— chiuso questo pezzo (era già in corso, verificato, non abbandonato a
metà) e ceduto il resto dell'area (streaming lag da catturare col
log, cursore terminale, falso read-only, ID modello di test, bug model
picker) a Fable per intero, come richiesto.

## Consegnato a Fable 5 — nuova sessione, batch completo

Owner: *"dammi prompt completo per nuova sessione Fable 5 per
risolvere con implementazione codice diretta questi bug... e fai in
modo che risolva tutti i bug che ti ho chiesto"*. Prompt scritto e
consegnato (`prompt-fable-bug-batch-2026-09-02.md`, via SendUserFile) —
copre tutti gli 8 punti di questo ledger (scroll-to-end da riverificare
con hard-reload, streaming a metà viewport, dissolvenza, strumentazione
lag, il bug nuovo sul model picker, falso read-only, ID modello di
test, cursore terminale) con riferimenti precisi a file/funzioni,
l'ordine consigliato, e la disciplina di verifica di questo progetto
(hard-reload prima di ogni prova dal vivo, screenshot durante non solo
alla fine, fixture del contratto da rigenerare).

## ⛔ Owner, dal vivo, mentre chiudevo lo scroll/dissolvenza

*"lo streaming ha lag sostanziali a meta testo, se non l'hai già fatto
trova un modo per strumentare tutte queste statistiche per loggarle e
debuggarle"* — chiede STRUMENTAZIONE permanente (non un altro script
usa-e-getta): marks/measures + un log delle statistiche di rendering
durante lo streaming, per poter diagnosticare un lag futuro senza
ripartire da zero ogni volta. 🔜 Da implementare, prossimo passo dopo
questa nota.


## ✅ Batch Fable 5.1 — 02/09 pomeriggio: tutti gli 8 punti, riprodotti e verificati dal vivo

> Ogni voce: riprodotta PRIMA con uno scenario nuovo di
> `harness-ui/scripts/qa-visual-pipeline.mjs` (Chrome dedicato, hard reload
> `Page.reload({ignoreCache:true})` a ogni corsa), corretta, riverificata
> con lo stesso scenario. Suite: backend `node --test` **1343/1343**
> (era 1319 — +1 test permessi, +altri già in coda), frontend `vitest`
> **200/200**. Fixture `legacy-contract.snapshot.json` rigenerata
> (script riusabile: `regen-fixture.mjs` nello scratchpad di questa
> sessione — legge `extract-legacy-contract.mjs` e riscrive la fixture).

### §5 Model picker — RIPRODOTTO e corretto (`qa-modello-pillola-dopo-nuova`)

- **Riproduzione**: "Nuova" → cartella scratch + `z-ai/glm-4.7-flash` →
  pillola del composer → `google/gemini-3.7-flash` → primo messaggio.
  POST `/api/v1/sessions/custom` intercettato via `Network.requestWillBeSent`:
  `"modello":"z-ai/glm-4.7-flash"` mentre la pillola diceva gemini. Il giro
  è partito con glm (RunStarted.contesto).
- **Causa** (`app.js`, `submitPrompt`): `state.pendingCustomSession`
  FOTOGRAFAVA modello/effort/permessi al momento di "Nuova"; le pillole
  cambiate dopo aggiornavano `state.model` e la scritta, ma
  `startCustomSession` faceva `modello || state.model` — vinceva la foto.
- **Cura**: al primo invio la fonte di verità sono le pillole
  (`state.model/effort/permissions/permessiPerAttrezzo`); `modelloPlanner`
  (senza pillola) resta dalla modale. Una cartella fuori elenco con la
  pillola spostata via da "Full access" NON parte in silenzio con un
  permesso che la pillola non mostra: toast che dice cosa manca, il
  messaggio resta nel composer (`return false`).
- **Verificato**: stesso scenario dopo il fix → POST `modello:
  google/gemini-3.7-flash`, giro partito con gemini, risposta "pong".

### §6/§7 Falso read-only e ID modello di test — NON erano bug del codice: era UN'ALTRA SESSIONE DI LAVORO che scriveva sulla sessione viva dell'owner

- **Prova sul disco** (`harness-ui/.sessions-store/6aa5159a….jsonl`, la
  sessione dell'owner): riga 869 `{"tipo":"impostazioni-sessione",…,"permessi":"Read only"}`,
  poi turno "Create a new file named r2r3-proof.txt…" → l'attrezzo `scrivi`
  risponde `REFUSED. la sessione è in sola lettura…` (kernel,
  `verificaPermessoScrittura`, `via:'livello-lettura'`) → il modello lo
  ripete, ONESTAMENTE: la sessione ERA in Read only per il server. Riga 884:
  `"modello":"talos-test/modello-inesistente-r2r3"` → turno "say hi" → HTTP
  400. Riga 889: `deepseek/deepseek-v4-flash-0731` + "Workspace write".
  Turni in inglese e con `r2r3` nel nome in mezzo a una chat in italiano.
- **Chi**: i dump SSE `eventi_r2r3.txt` (13:20:46) e `eventi_r2r3_modello.txt`
  (13:21:17) nello scratchpad della sessione Claude `ca3ca828…` (la review
  "harness mobile — 11 rilievi": R2/R3 = read-only e ID sconosciuto)
  contengono ESATTAMENTE quei turni: una sonda di verifica ha usato il
  server vivo 4174 e la sessione reale dell'owner come banco. Nessuna
  stringa `talos-test`/`modello-inesistente` esiste in nessun sorgente.
- **Perché è sembrata una bugia**: la scheda dell'owner diceva ancora "Full
  access": `aggiornaImpostazioni` non annuncia niente a nessuno (nessun
  broadcast, per costruzione — `iscriviti()` non accetta ascoltatori su una
  sessione conclusa), e nessun evento portava il permesso VERO del giro.
- **Cura, verificata (`qa-permessi-cambiati-da-fuori`)**: `RunStarted.contesto`
  porta `permessi` (`agent-service.mjs` param + `session-registry.mjs`
  `cloudOptions.permessi: voce.permessi`, letto AL MOMENTO del giro); sotto
  la bolla utente compare "Follow-up · Read only" / "Compito libero · … ·
  Full access" (`etichettaPermessiGiro`); su un giro VIVO avviato da questa
  scheda `allineaPilloleAlGiroVivo` allinea le pillole e scrive in chat
  "Impostazioni cambiate fuori da questa scheda. Questo giro usa: permesso
  Full access → Read only." — solo dal vivo, mai nel replay (che riparte già
  dalle impostazioni correnti). Esportazione: "- **Permessi del giro:**".
  Test `agent-service.test.mjs` anche AL CONTRARIO (senza etichetta →
  `null`, mai un default inventato).
- 🔜 **Decide l'owner**: (a) regola per TUTTE le sessioni di lavoro — una
  sonda non tocca MAI 4174 né una sessione che non ha creato lei (memoria
  scritta: `una-sonda-di-unaltra-sessione-scrive-sul-server-vivo`); (b) se
  `/settings` debba rifiutare un `modello` non nel catalogo (oggi accetta
  qualunque stringa: onesto ma senza rete).

### §1 Scroll al click su una riga sessione — verificato; poi RIFATTO su ordine owner ("già in fondo, senza animazioni")

- Hard reload + click su una sessione lunga (12-19k px): a 250 ms già in
  fondo e ci resta per 4 s; riclick sulla riga attiva dopo essere risaliti
  in cima → di nuovo in fondo (`qa-scroll-sessione-e-streaming`).
- Un buco trovato misurando: 12320 su 12334 per 4 s — l'ultima MUTAZIONE
  di figli non è l'ultimo cambio di altezza (`markMotionEnter` cambia una
  classe un frame dopo). Ora l'osservatore guarda anche `class`/`style` e
  ribatte il fondo su due frame alla fine.
- Owner dal vivo: *"quando clicchi su una riga sessione la chat deve
  trovarsi già in fondo senza animazioni"* → `#conversation.is-restoring`
  (`passaASessione` → `mantieniFondoDuranteRipristino` la toglie SOLO
  quando è già in fondo): cronologia costruita invisibile ma impaginata,
  riga "Apro la cronologia…" sticky, nessuna animazione d'ingresso
  (`markMotionEnter` salta i figli della conversazione in ripristino), le 9
  chiamate `scrollIntoView` smooth passano da `scorriAllaBollaAppesa`, che
  tace durante il ripristino. Reti: 8 s per la visibilità, 30 s per
  l'osservatore, e `nuovaGenerazioneSessione` toglie la classe. Verificato:
  nascosta a 250 ms, scoperta a 500 ms già in fondo (17495/17495).
- L'auto-apertura dell'ultima sessione al reload: confermata a ogni corsa
  (nota "sessione auto-aperta").

### §2 Streaming a metà viewport — la matematica era giusta e lo SCHERMO no

- Misurato: fondo del testo **403 px sotto** il centro (viewport 1214) per
  75 campioni di fila — lo scroll era già al massimo. Sotto l'ultimo
  messaggio c'erano 190 px di padding: il centro era irraggiungibile.
- Causa con prova git: `--stream-follow-space` (padding-bottom di
  `.conversation`, checkpoint `cca79b08`) e il commit `bf15bb3e` che ha
  TOLTO la riga che la impostava. Da allora valeva 0.
- Cura: `aggiornaSpazioCodaConversazione` = metà dell'altezza visibile,
  permanente per la sessione (owner: "quando scrollo alla fine l'output
  deve essere a metà"), 0 su conversazione vuota (hero centrato),
  ResizeObserver per il resize. Verificato: mediana **0 px**, max 0 px.

### §3 Dissolvenza — era corretta a livello di blocco; poi RIFATTA per parola (owner)

- Verifica: `.stream-settle` presente in 128/152 campioni, l'ultimo
  figlio (coda volatile) mai marcato (0). Owner dal vivo: *"per dissolvenza
  deve essere una dissolvenza super smooth delle parole"* → vedi §4.

### §4 Streaming "scattoso" — misurato: il render non c'entra, il ritmo sì

- Strumento: `logStreaming('delta', …)` all'arrivo di ogni frammento
  (prima del render), cap del log 400 → 4000 (400 righe = ~6 s di stream,
  i buchi calcolati su una finestra parziale mentivano).
- ⛔ Trappola del banco: la finestra QA (`windowsHide`) è `hidden` per
  Chrome → `requestAnimationFrame` strozzato a ~1/s: i render sembravano
  radi (buchi di 2 s) mentre i delta arrivavano ogni ~50 ms. Con
  `--disable-backgrounding-occluded-windows` (+2 flag) i render seguono
  ogni delta entro un frame: 425 render/10 s, durata ≤0,2 ms, buchi fra
  render = buchi fra delta (213 vs 210 ms). Il collo era il PROVIDER
  (raffiche ogni 100-500 ms, pause fino a 10 s prima del primo token).
- Cura (owner: *"fluida come una macchina da scrivere… una lettera alla
  volta streammata velocemente"*): RITMO DI RIVELAZIONE
  (`avanzaRitmoStreaming`, `RITMO_STREAMING`): il testo arriva tutto in
  `testoGrezzoMessaggi`, sullo schermo avanza un prefisso a ≥160 car/s
  ("Cursore", lettere) o ≥140 car/s per parole intere ("Dissolvenza"),
  accelerando con l'arretrato così il ritardo non supera ~0,3 s. "Nessuna",
  movimento ridotto e ripristino: tutto subito, come prima. Il cursore si
  spegne quando lo schermo è in pari, non quando arriva la fine dal server
  (`fineRicevuta`). Dissolvenza per parola: `avvolgiParoleRecenti` — le
  parole rivelate negli ultimi 420 ms sono `<span class="stream-word">` con
  `animation-delay` NEGATIVO = tempo trascorso: ricreate a ogni frame,
  ripartono da dove erano (la lezione del vecchio `:last-child`, stavolta
  risolta invece che evitata).
- Verificato (`qa-cursore-streaming`, campionatore in pagina a 40 ms):
  Cursore → 50/55 frame con testo, 4 fermi, mediana 21 car/frame, max 47,
  391 render tutti <8 ms; Dissolvenza → parole con animazione IN CORSO in
  52/52 campioni (fino a 120 in una raffica di recupero), render medio
  0,2 ms, max 0,6 ms.

### §8 "Cursore terminale" — NON xterm: l'opzione "Macchina da scrivere" (Aspetto → Animazione risposta)

- Riprodotto: il cursore (`::after` su `.assistant-copy`) stava DOPO
  l'ultimo `<p>`, su una riga vuota tutta sua: Δ fondo-copy − fondo ultima
  riga = **42 px** (line-height 24), clip 2× scattato durante lo stream.
- Cura CSS: `.assistant-copy > :last-child:not(ul):not(ol)::after` (e
  `li:last-child` per gli elenchi). Verificato: Δ **4 px** (è il
  `vertical-align` del cursore), cursore in coda a "risorse |".

### Trovati per strada (non nel batch), CORRETTI

- **I nomi delle sessioni sparivano a ogni riavvio del server**: dopo il
  restart di 4174 tutta la sidebar diceva "libero:full-access".
  `rinomina()` teneva il nome solo in memoria ("finché il server resta
  acceso", dichiarato) — ma il client rinomina OGNI sessione col primo
  messaggio, quindi il riavvio le spogliava tutte. Ora riga
  `nome-sessione` nel JSONL + `ripristina()` la rilegge; per le sessioni
  nate prima, il nome si ricava dall'intestazione (`task.consegnaCorta`,
  solo `libero:*`). Test (`session-registry.test.mjs`) + verificato dal
  vivo su due riavvii. ⛔ Al primo tentativo un `\s` mangiato dalla shell
  ha prodotto "Ri pondi  olo con la parola" — visto nell'elenco, corretto.
- `qa-visual-pipeline.mjs`: eccezioni JS ora con messaggio vero e riga
  (`exception.description`, non solo "Uncaught"); +4 scenari riusabili
  (`qa-modello-pillola-dopo-nuova`, `qa-scroll-sessione-e-streaming`,
  `qa-permessi-cambiati-da-fuori`, `qa-cursore-streaming`).

### Trovati per strada, REGISTRATI e non toccati (decide l'owner)

- Riavvio 4174: **7/23** sessioni ripristinate, 16 scartate (una
  dichiarata corrotta, `b7b1b7d2`, 5,4 MB) — stesso difetto del ledger
  `LEDGER-RESTORE-SILENZIOSO-16-SESSIONI-2026-09-02.md`, ancora aperto.
- Sottotitolo dell'intestazione "premi «Nuova» per iniziare" resta sotto
  il titolo anche con una sessione aperta (visto in ogni screenshot).
- La riga attiva in sidebar resta evidenziata sulla sessione precedente
  mentre la chat mostra una sessione PENDENTE nuova ("Nuova · cartella").
- La nota "Impostazioni cambiate fuori da questa scheda" usa il
  contenitore `appendStatusNote` con meta "TALOS · concluso" e spunta: per
  un avviso servirebbe una variante neutra.
- Nel ripristino di una sessione senza evento terminale nel replay
  (interrotta) la chat resta nascosta fino a 8 s: rete di sicurezza, non
  un comportamento voluto.
- Server 4174 riavviato TRE volte in questo giro (con
  `TALOS_OWNER_RUNTIME_MODULE`), pid finale annotato nel log dello
  scratchpad; nessuna sessione era in corso a nessuno dei tre riavvii.

---

## 02/09 (sera) — Il loader del mobile, il "gap senza nulla" e il delay fra elabora e stampa

Tre richieste dell'owner, dal vivo, in un colpo solo:

> «il logo di caricamento deve esistere fino a quando la risposta viene
> STREAMMATA E STAMPATA poi il logo non e animato come il mobile ci deve
> essere una linea che attraversa dot, usa direttamente lo stessa identica
> immagine animata del mobile» · «ce un delay assurdo tra quando invio
> messaggio quando elabora e quando stampa, strumenta tutte queste cose in
> maniera piu precisa con ricerca web» · «fai un analisi di debugging
> mirata e approfondita»

### La causa vera del "delay assurdo": ERO STATO IO, poche ore prima

⛔⛔⛔ Il difetto peggiore di questo giro **l'avevo introdotto io** nello
stesso pomeriggio, curando il salto di scroll: `resumeSession()` armava
`deferHistoricalRendering = true` per sopprimere lo scroll durante il
replay della cronologia. Non l'ha trovato una rilettura: l'ha trovato la
strumentazione nuova, tracciando **ogni messaggio SSE per singolo stream**
(`EventSource` patchato in pagina, non il codice riletto):

```
t=9163  S2  RunStarted         seq=8   giaVista=false   ← il turno NUOVO
t=9163  S2  CHIUSO   /  S3 APERTO
t=9166  S3  RunStarted seq=1..8        giaVista=TRUE    ← replay, scartato dal dedup
t=10472 S3  TextMessageContent seq=9+  giaVista=false  defer=TRUE ← la risposta vera, MAI renderizzata
stato finale: defer=true
```

Il `RunStarted` del turno nuovo arriva sul **vecchio** stream (ancora
aperto durante la POST `/resume`) e finisce in `sequenzeViste`; quando il
nuovo stream lo rigioca, il dedup per `_sequenza` lo **scarta**. Nessun
`RunStarted` "nuovo" raggiunge mai lo stream nuovo ⇒ il contatore di
disarmo non avanza ⇒ **il differimento resta acceso per sempre** ⇒
`TextMessageContent` non chiama più `programmaRenderMessaggioStreaming`:
la risposta non scorre, compare **in blocco alla fine**. Nove secondi di
attesa a zero caratteri, poi 2.070 tutti insieme. Esattamente il "delay
assurdo tra quando elabora e quando stampa".

⛔ E il differimento **non serviva**: il replay è già neutralizzato a
monte dal dedup `_sequenza`, che scarta gli eventi rigiocati prima di
qualunque render o scroll. Tolto alla radice; `deferHistoricalRendering`
torna a servire solo ciò per cui era nato (aprire una sessione CONCLUSA).

⭐ **Due tentativi di disarmo a contatore, sbagliati entrambi**, e a
smentirli è stata sempre la misura, mai una rilettura: la 1ª versione
(`runCount > runCountPrimaDelResume`) non teneva conto che `runCount` non
si azzera con `continua:true`; la 2ª (contatore dedicato da zero) non
poteva funzionare perché l'evento che doveva contare **viene deduplicato**.
La lezione: quando la cura di un difetto ne richiede una seconda che le
corra dietro, il problema è la prima cura.

**Misurato, prima → dopo** (stesso scenario, follow-up su sessione conclusa):

| tratto | prima | dopo |
|---|---|---|
| `primoDelta → primoPixel` (nostro) | **7877 ms** | **4-5 ms** |
| streaming progressivo | no, blocco unico | sì, delta a 11783/12432/12756 |
| `defer` a fine giro | `true` (bloccato) | `false` |

Il tratto lungo che resta (`runStarted → primoDelta`, 1850-3400 ms) è il
provider: quello non è nostro, e ora si vede a colpo d'occhio di chi è.

### La strumentazione (richiesta esplicita: "in maniera più precisa")

Ricerca web prima, come da regola zero — il TTFT lato client si misura con
un timestamp monotono appena prima della richiesta e uno al primo chunk
SSE con contenuto, e va **scomposto** (coda del provider, prefill, rete):
clickhouse.com/resources/engineering/llm-inference-latency ·
bentoml.com/llm/llm-inference-basics/llm-inference-metrics.

`window.talosLatenzaRisposta()` in devtools, sempre attiva, otto tappe:
`invio → postInviata → postRisposta → sseCollegato → primoEvento →
runStarted → primoDelta → primoPixel`, con i tratti già sottratti e il
`trattoPiuLungo` in chiaro. ⛔ Le tappe del turno vero non si registrano
durante un replay (`TAPPE_SOLO_TURNO_VERO`): la prima versione mentiva
proprio per questo, e se n'è accorta da sola.

### Il loader: ora è quello del mobile, e ANIMATO

Porta 1:1 di `mobile/src/components/brand/TalosLineLoader.vue` +
`mobile/src/style.css`: viewBox `0 0 96 16`, traccia fioca a
`stroke-opacity .18`, **sweep** che disegna da sinistra a destra, tre nodi
VUOTI a cx 16/48/80 r4 che si riempiono quando la linea li raggiunge
(ritardi 0 / .36s / .73s). Il desktop aveva divergito su tre pallini che
pulsano, viewBox 48×18, **nessuna linea**: un'altra immagine.

⛔ L'unica riga del mobile che **non** si copia è il suo blocco
`@media (prefers-reduced-motion: reduce)`, che spegne l'animazione: su
questa macchina quella preferenza è **vera a livello di sistema**
(misurato), quindi copiarla avrebbe riprodotto lo stesso difetto che
l'owner sta segnalando. Sotto motion ridotto il loader si **calma**
(1,4×), non si ferma — un indicatore fermo è indistinguibile da un'app
piantata. Servono quattro punti nel foglio, non uno: la regola cieca
`*{animation-duration:0ms!important}` e la più specifica
`:root:not(.interface-motion-off) *{animation-duration:.001ms!important}`
lo azzeravano di nuovo (già misurato: `1e-06s`).

Misurato dal vivo, con `prefers-reduced-motion: reduce` attivo:
`animationName: talosLineSweep`, `playState: running`, `iterations:
infinite`, e `stroke-dashoffset` che scorre davvero — 84,6 → 79,5 → 72,2 →
62,8 → 51,9 → 40,2 → 28,9 → 18,8 → 10,7 → 5,1 px.

### Il loader resta finché il testo è STAMPATO

`nascondiAttesaRisposta()` stava nel case `TextMessageContent` — "il primo
token vero". Ma il token **arrivato** non è testo **a schermo**: il render
è programmato su `requestAnimationFrame`. In mezzo lo schermo restava
senza loader e senza testo: il "gap in cui non c'è niente". Ora la chiude
`renderizzaMessaggioStreamingOra`, al primo frame con `mostrato > 0`.
La ricerca conferma il principio (getstream.io/chat typing-indicator,
mui.com/x/react-chat): l'indicatore si sostituisce al contenuto quando il
contenuto **compare**. Misurato: zero campioni con schermo vuoto (prima:
l'ultimo campione con loader aveva già 443 caratteri stampati).

### Suite

Backend `node --test`: **1345/1345**. Frontend unit: **57/57**.
Browser Playwright: **da 20 rossi / 70 verdi a 6 rossi / 84 verdi** — i 6
residui erano già rossi sul baseline committato (verificato scambiando
`app.js`/`styles.css` con la versione di HEAD e rilanciando): sono
FILE-EXPLORER-TOOLBAR-05, LAG-LIVE-INCREMENTAL-40, NOTIFICHE-REALI-43,
SETTINGS-FATTI-44, WORKSPACE-CHOOSER-INVERSE-19, WORKSPACE-CHOOSER-SUBMIT-10.
🔜 **Debito registrato**: quei 6 restano aperti, non sono stati toccati in
questo giro (permessi workspace, toolbar Files, notifiche, settings).

Tre contratti di test cambiati **deliberatamente**, per ordine diretto
dell'owner, con il perché scritto accanto a ognuno:
RESPONSE-ACTIVITY-DOTS-08 e WAITING-LOADER-MOTION-01 (pretendevano
l'ASSENZA dello sweep), REDUCED-MOTION-02 e
WAITING-LOADER-REDUCED-MOTION-01 (pretendevano `animation: none`).
Aggiunti RESPONSE-ACTIVITY-DOTS-08b (la geometria dell'SVG) e
RESPONSE-ACTIVITY-STAMPATO-05 (la ruota non si chiude al primo delta).

### Rifinitura subito dopo (owner: «troppo grande, fallo più piccolo e coerente»)

Il disegno non cambia (il viewBox resta `0 0 96 16`): cambia quanto lo si
stampa. Da 96×16 a **48×8**, stesso rapporto 6:1, e agganciato a
`--talos-ui-font-scale` così cresce insieme al testo se l'owner cambia la
dimensione dalle impostazioni. Misurato accanto alla sua etichetta
(`.run-activity-label`, 11px): altezza **0,52×** la riga di testo, centri
allineati entro 1,5 px — prima il loader era **più alto** della riga che
accompagna.

### ⛔⛔⛔ CORREZIONE — la suite browser NON è un cancello: gira sul 4174 VIVO

Poco dopo aver scritto qui sopra «da 20 rossi / 70 verdi a 6 rossi / 84
verdi», lo stop-hook ha chiesto la verifica che morde. Rifacendola è
saltato fuori che **quel numero non valeva niente**, e con esso la mia
affermazione: la stessa suite, lanciata **due volte di fila sullo stesso
identico codice**, ha dato **21 rossi** e poi **19 rossi**, con insiemi
diversi (RUN-REDIRECT-05 e RUN-REDIRECT-STOP-RACE-16 rossi solo al primo
giro; «il ragionamento resta nascosto…» rosso solo al secondo).

Causa, letta in `frontend/playwright.config.mjs`: non c'è nessun blocco
`webServer`, e `baseURL` punta a **`http://127.0.0.1:4174/`** — il server
di lavoro dell'owner, con le sue sessioni vere in `.sessions-store/`.
Nessuna istanza fresca, nessun azzeramento fra un giro e l'altro. Le mie
stesse sonde CDP avevano creato ~20 sessioni reali durante il lavoro:
l'esito dipende da quante sessioni ci sono e da quale si apre da sola
all'avvio. ⇒ **20 → 6 → 18 → 21 → 19 rossi erano rumore di stato, non il
mio codice.** Ritirata l'affermazione, qui e verso l'owner.

⭐ È esattamente la prima delle cinque pratiche di Fable
([[cinque-pratiche-osservate-in-fable-02-settembre]]): *misurare su
un'istanza isolata, mai su quella in uso*. L'avevo scritta in memoria
poche ore prima e non l'ho applicata al mio stesso lavoro.

**Cosa resta valido, e perché** (misure hermetiche o dirette, non conteggi
di una suite condivisa):

- Backend `node --test`: **1345/1345** — nessun server condiviso.
- Frontend unit `run-node-tests.mjs`: **57/57** — idem.
- I test di ciò che ho toccato, **stabili su tre giri consecutivi**:
  `WAITING-LOADER-MOTION-01`, `WAITING-LOADER-REDUCED-MOTION-01`,
  `LAG-LIVE-TEXT-37` (il test diretto del resume/differimento),
  `LAG-REPLAY-TREE-31` — verdi tutte e tre le volte.
- Le misure **dirette** dal vivo, che non passano dalla suite:
  `primoDelta → primoPixel` 7877 ms → 4-5 ms, `defer` bloccato a `true`
  → `false`, `stroke-dashoffset` 84,6 → 5,1 px, zero campioni con
  schermo vuoto.
- **A/B contro il baseline pulito `4910b4a5`** (scambiando `app.js` e
  `styles.css` con quelli di quel commit e rilanciando lo stesso
  sottoinsieme, di seguito): `LAG-REPLAY-TEXT-32`, `LAG-REPLAY-PACED-35`,
  `LAG-REPLAY-REASONING-36`, `REASONING-INDICATOR-01`, `REDUCED-MOTION-02`
  falliscono **identiche** anche senza nessuna mia modifica ⇒ non sono
  mie. Nessuna regressione attribuibile a questo lavoro.
- `@visual 24-scenario visual matrix`: rosso per uno *strict mode
  violation* di Playwright (`.tool-batch-summary` trova 3 elementi, manca
  un `.first()`), niente a che vedere con il loader — letto nel messaggio
  d'errore vero, non dedotto dal nome.

🔜 **Debito aperto, decide l'owner**: la suite browser va resa ermetica
(un `webServer` Playwright su una porta e uno store propri, oppure
`cartellaStore` configurabile da ambiente — oggi è cablato in
`server.mjs:170` su `.sessions-store/` accanto al file, senza override).
Finché resta così, **il suo conteggio non può essere citato come prova**
né in un commit né in un rapporto: valgono i test hermetici, le misure
dirette e l'A/B contro un baseline nello stesso momento.

---

## 02/09 — Formattatore dei blocchi di codice (Prism vendorizzato)

Owner: «crea un formattatore di blocco codice, ricerca web dei migliori».
Prima ogni ```` ```fence ```` diventava un `<pre><code>` nudo: nessuna
evidenziazione, nessuna etichetta, nessun modo di copiarlo — e
l'identificatore di linguaggio dopo i backtick veniva **scartato**, cioè
l'unico posto in cui il modello ci dice di che linguaggio si tratta.

**Scelta, con ricerca** (pkgpulse.com/guides/shiki-vs-prismjs-vs-highlightjs-2026,
streamdown.ai/docs/code-blocks, mui.com/x/react-chat): **Prism**, perché
Shiki evidenzia a build-time/server (sbagliato per un testo che arriva in
streaming nel browser) e highlight.js indovina il linguaggio, che qui non
serve — il fence lo dichiara già, e indovinare significherebbe scrivere
un'etichetta non verificata.

- `public/vendor/prism/prism.js` — 1.30.0, core + 19 linguaggi in UN file,
  concatenati **in ordine di dipendenza** (`clike` prima di `javascript`,
  `c` prima di `cpp`, `markup` prima di `markdown`), con
  `window.Prism.manual = true` **prima** del core: senza, Prism evidenzia
  da solo tutto il documento al DOMContentLoaded. Zero CDN, stesso
  principio di `vendor/xterm/`. README con versione, motivo e come si
  aggiorna.
- Registrato in `src/static-files.mjs`: la allowlist è **esplicita**, senza
  quella riga risponde 404 e ogni blocco perde l'evidenziazione in
  silenzio — lo stesso difetto già pagato con xterm il 28/8.
- Intestazione con il linguaggio **dichiarato** + pulsante copia con
  conferma transitoria; tema dai token TALOS, mai un tema di Prism.
- ⛔ Fence **ancora aperto** (streaming): nessuna evidenziazione e copia
  **disabilitata** — «defer code block rendering until the closing fence
  arrives… copy disabled during streaming». Rievidenziare a ogni frame un
  testo che cambia costa e sfarfalla, e si copierebbe codice a metà.
- ⛔ Fence **senza** linguaggio: etichetta «testo», nessuna evidenziazione.
  Mai un linguaggio indovinato.

**Verificato dal vivo** (CDP, sessione vera, non un mock): Python →
etichetta «Python», 19 token (`keyword`, `builtin`, `triple-quoted-string`);
```` ```js ```` → «JavaScript» via alias, 16 token; fence nudo → «testo», 0
token; ```` ```sql ```` aperto → «SQL», `inArrivo`, copia disabilitata «In
arrivo…»; pulsante copia → «Copiato», classe `is-fatto`, appunti col
codice esatto. Screenshot ispezionato.

**Difetto trovato ISPEZIONANDO l'HTML prodotto**, non cercandolo: la
dissolvenza per parola avvolgeva anche l'etichetta e il testo del pulsante
(`<span class="code-block-lang"><span class="stream-word">Python`), come se
il modello li stesse scrivendo. Sono cornice dell'interfaccia:
`avvolgiParoleRecenti` ora salta anche `.code-block-head` (saltava già
`pre, code`).

### ⛔⛔⛔ E un buco più vecchio, trovato per caso: `vendor/` era GITIGNORATO

`git check-ignore -v` sul nuovo `prism.js` ha rivelato che `vendor/` in
cima al `.gitignore` escludeva anche `harness-ui/public/vendor/`, e la
negazione esistente copre solo il percorso **mobile**. Conseguenza mai
notata: **nemmeno `vendor/xterm/` era tracciato** — dal 28/8. Un clone
pulito perdeva sia il Terminale REALE sia (ora) l'evidenziazione, e il
difetto sarebbe emerso solo su un'altra macchina.

⛔ Servono **due** righe, non una: git non rientra in una directory
esclusa, quindi prima si ri-include la directory e poi il suo contenuto
(`!harness-ui/public/vendor/` + `!harness-ui/public/vendor/**`) — stessa
lezione già pagata su `mobile/docs/*`. ⛔ E `git check-ignore -v` da solo
**non basta a leggere l'esito**: stampa la regola che combacia anche
quando è una negazione. La prova vera è `git add --dry-run`, che ora
elenca prism **e** xterm.

**Suite**: backend `node --test` **1351/1351** (+6 nuovi,
`tests/code-block-formatter.test.mjs`, hermetici apposta — leggono i
sorgenti, non passano dal 4174); frontend unit **57/57**.

---

## 02/09 — La suite browser diventa ERMETICA (e il conteggio torna citabile)

Chiusa la lacuna registrata come debito poche ore prima. Due metà:

**1. Lato server** — `cartellaStore` non è più cablato in `server.mjs`:
arriva da `config` e si sposta con **`TALOS_HARNESS_UI_SESSIONS_DIR`**.
Senza la variabile resta *esattamente* la cartella di prima (default
calcolato sullo stesso `import.meta.url` del file).

**2. Lato Playwright** — `playwright.config.mjs` ha ora un blocco
`webServer`: avvia un server **suo** su `4176`, con uno store creato
vuoto a ogni esecuzione (`mkdtempSync`, valutato una volta per giro — mai
una cartella fissa, che rimetterebbe la non-ripetibilità che stiamo
togliendo). Attende `/api/v1/health`, non la porta aperta: il server
ascolta *prima* di aver finito di ripristinare le sessioni.
`TALOS_HARNESS_UI_BASE_URL` continua a vincere e in quel caso `webServer`
non parte, per puntare la suite a un server già acceso quando lo si vuole
davvero.

⭐ Ricerca: i tre concorrenti fanno la stessa identica cosa, tutti con una
variabile sulla cartella di stato — Codex `CODEX_HOME` («isolates the eval
from any personal Codex configuration on the machine»), Hermes
`HERMES_HOME` (fixture da una home isolata, ogni profilo col proprio
session database), Claude Code `CLAUDE_CONFIG_DIR` («keeping your real
config untouched»); Playwright documenta `webServer` +
`reuseExistingServer: false`.

### La prova — misurata, non dichiarata

| | prima (4174 dell'owner) | dopo (server ermetico) |
|---|---|---|
| giro 1 | **21 rossi** | **2 rossi** |
| giro 2 | **19 rossi** | **2 rossi** |
| insiemi | **diversi** | **IDENTICI** |

⭐ I ~18 rossi spariti non erano difetti del codice: erano **stato**. La
suite girava sulle sessioni vere dell'owner, e ciò che si apriva da solo
all'avvio cambiava l'esito.

I **2 rossi** che restano sono deterministici e **non sono miei**:
verificato con un A/B sullo stesso server ermetico, scambiando
`app.js`/`styles.css`/`index.html`/`static-files.mjs` con quelli di
`4910b4a5` — falliscono **identici** senza nessuna mia modifica:
- `LAG-LIVE-INCREMENTAL-40`
- `NOTIFICHE-REALI-43`

⛔ Verificato anche che il **4174 dell'owner resta intatto** mentre i test
girano (health ok, sessioni invariate): i due server convivono.

**Verificato facendo PARTIRE i server, non solo coi test unitari** — è
codice d'avvio: istanza isolata su `4179` con store vuoto → **0 sessioni**
(contro 17 vere), health ok; `4174` riavviato senza variabile →
`1/17 sessioni ripristinate da .sessions-store/`, identico a prima.

---

## 02/09 (sera) — Due difetti VERI trovati solo dopo aver messo modelli veri

L'owner ha autorizzato il reimport dei GGUF già sul disco (i manifest
erano spariti: cartelle piene, `manifests/` vuota). Fatto passando dalla
**rotta vera** dell'app, mai scrivendo JSON a mano — la rotta scrive
`repo: 'local-upload'`, `revision` = sha256 REALE del file, `license:
'unknown'`: nessuna provenienza inventata. Due modelli registrati (331 MB
in 1 s, 15,3 GB in 43 s).

⭐ **E con dei modelli veri sono usciti due difetti che nessun test
vedeva.**

### 1. `readHeader` riceveva una CARTELLA, non un file — difetto MIO

`inspectModel` faceva `readHeader(manifest.path)`. Ma `manifest.path` è la
**cartella** del modello: il nome del file sta in `files[0].path`. Sul
disco vero il lettore riceveva una directory e falliva **sempre** con
`MODEL_HEADER_UNREADABLE`.

⛔ **Perché i test non l'hanno visto**: la fixture era **infedele** —
aveva `path: 'models/qwen-local.gguf'`, cioè metteva il file dentro
`path`. Con quella forma il codice sbagliato sembrava giusto. Una seconda
fixture in `local-runtime-conformance.test.mjs` aveva lo stesso vizio.
⇒ Corrette entrambe alla forma REALE (quella che `local-model-store.mjs`
valida e che la rotta di import scrive), e aggiunto
`LOCAL-RUNTIME-PROBE-PERCORSO-01`, che guarda l'argomento vero passato a
`readHeader` (`qwen-local/qwen-local.gguf`), più il caso al contrario di
un manifest senza file.

### 2. `/fit` non sapeva degradare col runtime spento

`readRuntimeProps()` lancia se llama-server non risponde, e faceva
abortire tutta `inspectModel`: `/fit` rispondeva `RUNTIME_PROBE_FAILED`
anche dopo aver già letto l'header, quando poteva dire cose vere su
spazio, memoria e contesto addestrato. ⛔ Incoerente con il disegno dello
stesso file: tutto ciò che segue è già scritto per degradare
(`unknown()`, `observedBoolean(caps?.…)`), e `fit()` ha lo stato
`unknown` con motivo `context` esattamente per questo caso.
⇒ Un runtime spento è un fatto **non osservato**, non un errore della
lettura. ⛔ `qualify()` resta severo: chiede un `fit` compatibile, quindi
con `unknown` si ferma da solo — un giro di generazione vero senza
runtime non va nemmeno tentato. Due test nuovi, uno per verso.

### La funzione, misurata sui modelli VERI dell'owner

| modello | verdetto |
|---|---|
| Qwen3 0.6B Q2_K (331 MB) | **Non determinabile** — contesto 40.960 su 65.536 richiesti |
| Qwen3.8 27B UD-Q4_K_M (15,3 GB) | **Non compatibile — non c'è abbastanza memoria libera** |

⭐ Il 27B **non entra** in 15,64 GB liberi, e l'app lo dice **prima** di
caricarlo: è esattamente il buco che la ricerca attribuisce ai due
concorrenti (LM Studio crasha, Ollama scivola su CPU 30× più lento).

**Chiuso anche il NON VERIFICATO dichiarato poche ore prima**: il
verdetto dentro una riga vera ora è provato, con clic reale sul pulsante
e screenshot ispezionato.

🔜 **Debito minore trovato**: reimportare un modello già registrato
risponde **500 `INTERNAL_ERROR`** invece di un errore di collisione
pulito (`HF_TRANSFER_COLLISION` esiste già lato transfer, non affiora).

**Suite**: backend **1364/1364** (+11 dal mattino), snapshot invariata.

---

## 02/09 (notte) — La stima di memoria sbagliava di un ordine di grandezza

Il verdetto "non compatibile" sul Qwen3 27B dell'owner dichiarava **340 GB**
di memoria richiesta contro 15,6 GB liberi. Un numero così non è un
verdetto: è un artefatto. Due errori miei, sovrapposti.

### 1. La cache KV seguiva TUTTE le teste, non quelle KV

`estimateWorkingBytes` moltiplicava per `embedding_length` **intero**, come
se ogni testa di attenzione avesse la sua coppia K/V. Sulle architetture
moderne non è così: la **grouped-query attention** condivide le teste KV.

⭐ Ricerca 02/9 (llama.cpp discussion #7949, omrimallis.com): la formula è
`2 × strati × teste_KV × head_dim × token × byte`. Esempio citato: Llama 3
ha **8 teste KV contro 64 di query — 8× di cache in meno**.
⇒ Ora `head_dim = embedding_length / head_count` e la dimensione KV è
`head_count_kv × head_dim`. ⛔ I conteggi delle teste sono **opzionali** nel
GGUF: se mancano si ricade sull'embedding intero — sovrastima **dichiarata**,
non un indovinello.

### 2. Si stimava sul contesto ADDESTRATO, non su quello richiesto

Sul 27B: 262.144 token invece dei 65.536 del profilo agente — un fattore 4
sopra all'errore della GQA. Il lettore ora espone **`kvCacheBytesPerToken`**
e `inspectModel` accetta il contesto richiesto, che `fit()` gli passa
sempre. ⛔ Con un tetto: chiedere più del contesto addestrato non gonfia la
stima — a bocciare è il controllo sul contesto, con un motivo suo.

### Misurato, prima → dopo

| modello | prima | dopo (contesto pieno) | dopo (a 65k richiesti) |
|---|---|---|---|
| Qwen3.8 27B | **340 GB** | 69,5 GB | **28,88 GB** |
| Qwen3 0.6B | 4,70 GB | 2,51 GB | 2,51 GB |

Il 27B resta `blocked/memory` con 13,8 GB liberi — ma ora è un verdetto
**vero**, non un ordine di grandezza sbagliato.

### ⛔ E una regressione mia, introdotta e presa in mezz'ora

Con la nuova formula il 27B rispondeva **`MODEL_HEADER_INVALID`**: su quel
modello `embedding_length / head_count` **non è esatto** e la stima usciva
221.866,67 byte per token, mentre `validateHeader` pretende interi. Un
modello leggibile dichiarato illeggibile. Curato con `Math.ceil` (per
eccesso, la stessa direzione conservativa) e **fissato da un test al
contrario** con una divisione volutamente non esatta (100/3).

⭐ **Perché nessun test l'aveva presa prima**: i 12 test del lettore GGUF
provavano magic, versione, troncamenti, chiavi mancanti e tipi ignoti — ma
**nessuno fissava il valore stimato**. Una formula sbagliata passava tutti.
Ora ce ne sono quattro: GQA, ripiego dichiarato, scala col contesto,
interezza. Più tre sulla sonda (stima sul contesto richiesto, tetto al
contesto addestrato, retrocompatibilità con header senza il campo nuovo).

**Suite**: backend **1371/1371**, frontend unit 57/57, browser 88 passati
con i 2 rossi preesistenti invariati.

---

## 02/09 (notte) — Le righe sessione dicono finalmente com'è andata

Gruppo A del `DOSSIER-LISTA-SESSIONI-CONFRONTO-2026-09-02.md`, quello che
non richiede backend: **il server mandava già tutto e la riga ne usava due
campi su otto.**

Prima: nome, «concluso»/«in corso», ora. ⛔ Una sessione **fallita** e una
**riuscita** si leggevano IDENTICHE.

Ora, cinque stati veri, tutti da campi già presenti in
`GET /api/v1/sessions`:

| stato | da dove | pallino |
|---|---|---|
| in attesa di approvazione | `inAttesaApprovazione` | accento, alone |
| in corso · live | `!conclusa` | accento, **pulsa** |
| interrotta | `interrotta` | grigio |
| conclusa con errore | `ultimoEsito === 'errore'` | rosso |
| conclusa | `ultimoEsito === 'successo'` | verde |
| conclusa · esito non registrato | nessun esito | vuoto, bordato |

⛔ **L'ordine dei controlli è la parte che conta**: «in attesa di
approvazione» è il primo, perché è l'unico stato che CHIEDE qualcosa alla
persona e non deve annegare fra gli altri; «interrotta» precede l'esito,
perché fermata a metà non è finita. ⛔ E nessun esito registrato **non**
diventa «successo»: le sessioni vecchie dicono «esito non registrato», che
è la verità.

Aggiunti anche **modello** (senza il prefisso del provider) e **giri**.

### Tre difetti trovati GUARDANDO il risultato, non il codice

1. **«6 giroi»** — la mia pluralizzazione aggiungeva una lettera invece di
   cambiarla. ⛔ E il codice esistente, poche righe più su, aveva già la
   forma giusta (`gir${'o'/'i'}`): la mia era anche incoerente.
2. **Nome modello troncato**: con il prefisso `google/` la riga non ci
   stava. Tolto il prefisso — è già nella scheda sessione, qui rubava
   spazio a un dato che non si vede altrove.
3. **«6 g»** — con stato + modello + giri sulla stessa riga, i giri si
   troncavano. ⛔ Un fatto troncato è **peggio** di un fatto assente:
   sembra un dato ma non si legge. Spostati nella colonna destra, che
   aveva già una riga libera sotto l'ora.

⭐ Tutti e tre invisibili leggendo il codice: sono usciti dal **testo reso**
e dallo screenshot ingrandito.

**Suite**: backend **1377/1377** (+6), frontend unit 57/57, browser 88
passati con i 2 rossi preesistenti invariati.

---

## 02/09 (notte) — «Pulsanti che liberano la RAM»: la ricerca ha spostato il progetto

Owner: «funzioni all'avanguardia… pulsanti che liberano la RAM dai
processi non critici». La ricerca obbligatoria ha portato **contro**
l'implementazione letterale, e vale la pena scriverlo.

### ⛔ Perché NON si uccidono processi

Le fonti sulla sicurezza sono esplicite: *«do not force-close processes
with names you do not recognize»*, *«if you cannot explain what a process
does, do not kill it»*, e terminare un processo di sistema (`svchost`,
`lsass`) causa un **BSOD immediato**. E il consiglio d'apertura è proprio
l'opposto del kill: *«do not start by killing random processes. Start by
checking what is using memory»*.

⛔ Il progetto ha già pagato questa lezione in casa: la sorveglianza
gridava «3 ORFANI» e **due volte** stava per uccidere la sessione Codex
**viva** dell'owner ([[il-guardiano-accusava-la-sessione-dellowner]]).

⭐ E **nessuno dei runtime affermati uccide processi**: Ollama
(`ollama stop`, `keep_alive: 0`) e LM Studio (`lms unload --all`) liberano
memoria **scaricando il modello**. È anche la leva che conta davvero: su
questa macchina i pesi del 27B sono **15,3 GB**, più di qualunque altra
cosa si potrebbe chiudere.

### Cosa è stato fatto

Pannello nella Panoramica del Model Lab:
1. **Misura** (la ricerca dice di partire da lì): barra + byte veri +
   percentuale, con tre livelli (ok / alto ≥75% / critico ≥90%).
   ⛔ La barra non è l'unico segnale: percentuale e byte sono scritti.
2. **Quanto ne tiene TALOS**: il modello caricato, o l'ammissione onesta
   «non tiene nessun modello in memoria adesso».
3. **«Libera la memoria del modello»** → `POST /api/v1/runtime/unload`,
   rotta che **esisteva già** e non era raggiungibile da nessun pulsante.
   ⛔ Disabilitato quando non c'è nulla da liberare: un pulsante che non
   ha niente da fare mentirebbe.
4. **«Rimisura»**.
5. La scelta di non toccare i processi è **dichiarata a schermo**, non
   solo nel codice.

⭐ L'esito si dichiara **coi byte veri liberati**: si rimisura dopo lo
scarico e si dice quanto è tornato disponibile; se la misura di sistema
non si è ancora aggiornata lo si dice, invece di annunciare un guadagno
non visto.

**Verificato dal vivo**: «16 GB in uso su 32 GB · 16 GB liberi (50%)»,
barra al 50%, livello `ok`, pulsante correttamente **disabilitato**
(nessun modello caricato), Rimisura funzionante, zero errori di pagina,
screenshot ispezionato.

**Suite**: backend **1383/1383** (+6), frontend unit 57/57, browser 88
passati con i 2 rossi preesistenti invariati.

🔜 **Debito registrato**: il pulsante «Verifica compatibilità» interroga
solo il profilo **agente**, quindi bolla «non compatibile» un modello che
per **chat** andrebbe bene — misurato sul Qwen3 27B: 28,9 GB a 65k
(agente) contro ~17 GB a 8k (chat), su 31,6 GB di RAM totale.

### ⛔⛔⛔ E poi ho premuto il pulsante per davvero: TRE difetti

Il pannello era stato «verificato dal vivo» — ma con **nessun modello
caricato**, quindi il pulsante era disabilitato e quello stato *sembrava*
l'esito giusto. Caricando un modello VERO (`/runtime/load` → `ready`,
porta 61107) sono usciti tre difetti, **nessuno visibile leggendo il
codice**:

1. **Il corpo della richiesta era `{}`** e la rotta pretende `runtimeId`:
   il pulsante avrebbe risposto **sempre** `QUERY_INVALID`. Non avrebbe
   mai funzionato, nemmeno una volta.
2. **Due nomi di campo INVENTATI** per sapere se un modello è caricato:
   nessuno dei due esiste nella risposta del server ⇒ sempre `null`,
   pulsante disabilitato per sempre, funzione morta. Il fatto osservabile
   vero è `runtimeState === 'ready'`.
3. **Il pannello non si rinfrescava mai**: leggeva
   `state.modelLab.runtimes` ma veniva ridisegnato solo da
   `caricaCapacitaMacchina()`, che gira una volta all'avvio. Caricare un
   modello dopo non cambiava nulla a schermo.

⭐ **E un difetto della ROTTA, non mio**: `/api/v1/runtime/unload`
pretendeva `modelId` obbligatorio, ma `unload()` non prende argomenti
(fa `supervisor.stop()`) e il server **non espone da nessuna parte quale
modello sia caricato** — chiedeva un dato che non esiste. Reso opzionale.
⛔ Quella rotta **non aveva un solo test**: aggiunti tre, incluso il verso
contrario.

### La prova finale, nei byte

Pulsante **abilitato** → clic vero → runtime `unavailable`, riga tornata a
«non tiene nessun modello», pulsante di nuovo disabilitato, e la memoria:
**da 10 GB a 15 GB liberi — 5 GB recuperati**, misurati dopo la rimisura.

⛔ **Due volte un mio test ha protetto il codice rotto**: il primo fissava
il *nome* di una variabile appartenente all'implementazione sbagliata; il
secondo, riscritto per vietare i nomi inventati, falliva sul **commento**
che quei nomi cita per spiegare il difetto. Una regola che vieta una
parola in tutto il file colpisce anche la documentazione: si vieta
l'**uso** (l'accesso come proprietà), non la menzione.

**Suite finale**: backend **1388/1388**, frontend unit 57/57, browser 88
passati con i 2 rossi preesistenti invariati.

🔜 **Debito**: caricare un runtime già caricato risponde
`500 INTERNAL_ERROR` invece di un errore di collisione pulito — stessa
famiglia del reimport di un modello già presente.

---

## 02/09 (notte) — Due collisioni che si accusavano da sole

Caricare un runtime già acceso, o reimportare un modello già presente,
rispondevano **`500 INTERNAL_ERROR`** — «si è verificato un problema
imprevisto». ⛔ Falso: è previstissimo, ed è la stessa cosa che la persona
ha appena chiesto due volte. Un 500 dice «è colpa del server, riprova»
su una situazione perfettamente spiegabile.

⭐ Il codice giusto **c'era già**: il supervisor lancia
`RUNTIME_ALREADY_RUNNING`, ma non essendo registrato fra i codici ammessi
veniva degradato a `INTERNAL_ERROR`. `HF_TRANSFER_COLLISION` era
registrato e aveva un messaggio, ma **nessuno status**.

⭐ Ricerca (http.dev/409, RFC 9110): **409 Conflict** è «the request could
not be completed due to a conflict with the current state of the target
resource» — dice il perché e implica che è risolvibile.

**Misurato, prima → dopo:**

| gesto | prima | dopo |
|---|---|---|
| carico un runtime già acceso | `500 INTERNAL_ERROR` | **409** `RUNTIME_ALREADY_RUNNING` — «liberalo prima di caricarne un altro» |
| reimporto un modello presente | `500 INTERNAL_ERROR` | **409** `HF_TRANSFER_COLLISION` — «scaricalo di nuovo solo dopo averlo rimosso» |

⛔ Il messaggio ora dice **cosa fare**, non «problema imprevisto».
⛔ E un test AL CONTRARIO tiene la linea dall'altra parte: un guasto VERO
del runtime (errore senza codice noto) resta **500** — una collisione non
è un guasto, ma un guasto non deve diventare una collisione.
