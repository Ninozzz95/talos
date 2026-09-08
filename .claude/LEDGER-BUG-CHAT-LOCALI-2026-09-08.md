# Chat e modelli locali — segnalazioni owner 08/09/2026

## Perimetro e responsabilità

Base `dbb062b3`, worktree AVM-harness-desktop, branch lane/harness-desktop. Priorità ai tre difetti nuovi; il pannello destro e la coda restano aperti. 4174 solo lettura/prove visive; scritture e run di prova su 4314 isolata. Nessuna riparazione dello storico dell'owner senza decisione esplicita. Nessun push o modifica AGENTS.

Owner informato prima della ricerca complessa: Astra xhigh consigliato, Fast spento. Agente `ricerca_motore_locale`, Astra xhigh, incaricato esplicitamente della ricerca approfondita e letture del motore; nessun edit, piano o avvio di modello delegato. Principale responsabile delle diagnosi, codice, prove e decisioni da sottoporre all'owner.

## Scenari permanenti

Decisione owner 08/09/2026, risposta «scusa ho sbagliato, stessa conversazione»: LOCAL-RESUME-01 deve recuperare nella **stessa sessione**, preservando gli eventi originali e registrando esplicitamente ogni correzione. Supera l'opzione proposta di copia recuperata. Non chiedere di nuovo questa scelta; nessuna cancellazione o riscrittura silenziosa dello storico. Prove di scrittura restano isolate, prima della consegna sul prodotto.

- CHAT-ATTESA-01: avvio messaggio → attesa/ragionamento → cambio sessione → ritorno. Indicatore deve riflettere la run ancora attiva anche prima del primo token; nessun residuo nella sessione conclusa.
- CHAT-ATTESA-02: replay di testo precedente con render differito → nuova fase di ragionamento. Un frame del messaggio storico non deve eliminare l'indicatore della fase nuova.
- CHAT-FONDO-01: scorrendo verso l'alto, anche in una conversazione conclusa, compare il pulsante rotondo per tornare in fondo; sparisce quando il contenuto finale è visibile, funziona da tastiera e con movimento ridotto.
- LOCAL-RESUME-01: follow-up naturale su storico locale fallisce con parsing degli argomenti tool. Screenshot owner `C:/Users/Antonino/Downloads/ScreenShot Tool -20260908145729.png`, dettaglio reale aperto in app: HTTP500 dopo quattro tentativi, `Failed to parse tool call arguments as JSON`, oggetto JSON incompleto alla colonna 2. Causa ancora da provare sui dati inviati. Non dedurre che la conversazione sia irrecuperabile né che tutti i modelli abbiano lo stesso difetto.
- LOCAL-CAP-01: ricerca/benchmark locali vs API con stesso insieme di compiti e strumenti. Distinguere capacità offerte dal motore, supporto del modello e riuscita misurata. Nessuna promessa di superiorità universale.

PO-08 registrato separatamente in CODA-PROPOSTE-OWNER-2026-09-08.md: conversazione diretta del sotto-agente dentro il pannello, Indietro all'elenco. Solo ACK e registrazione, nessuna implementazione in questa fase.

## Ricerca prima dell'edit UI — 08/09/2026

- https://docs.ag-ui.com/concepts/reasoning — ciclo distinto Start/Content/End per ragionamento e risposta. Adottare la distinzione già presente nel contratto TALOS, senza nuovo protocollo.
- https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat e https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams — ricerca ufficiale individua separazione submitted/streaming e ripresa della run al mount. La seconda apertura del documento resume ha restituito errore dal motore web: non è usata per dedurre dettagli oltre quelli restituiti nella ricerca.
- https://www.shadcn.io/ai/conversation — controllo per tornare al fondo quando si legge sopra, basato sullo stato di scroll. Adattare il comportamento agli helper di scroll TALOS esistenti; non introdurre React/useChat per due correzioni in vanilla JS.

Consultazione odierna, non date di pubblicazione inventate. Riferimenti già maturi ancora attuali; ricerca competitor del motore demandata al dossier dell'agente e da verificare prima delle decisioni. Pin locale dei test `@playwright/test` 1.62.1. Nessuna dipendenza/protocollo nuovo per il fix UI.

## Piano esecutivo UI, prima del test e del codice

File da modificare:

1. `harness-ui/frontend/src/legacy/app.js`: `handleRealEvent`, `mostraAttesaRisposta`, `renderizzaMessaggioStreamingOra`, `ensureAssistantMessageElement` se necessario, stato `realSession` per associare l'attesa alla fase e il testo alla fase che può sostituirla. `RunStarted` ricostruisce l'attesa anche entrando in una sessione attiva; il dato canonico `chiusaDalServer` resta prioritario. Gestori e canale SSE esistenti, nessun secondo stream.
2. `harness-ui/frontend/src/components/chat-foot.js`: `aggiornaPiedeChat` aggiorna visibilità del pulsante usando `inFondo` e rilancia `talos-vai-in-fondo`; riutilizzo di `fondoInVista` e `scorriInFondoConversazione`, niente secondo algoritmo di scorrimento.
3. `harness-ui/frontend/mockup/talos-mockup.html`: `#chatTornaInFondo`, bottone nativo rotondo con icona esistente, etichetta e tooltip; posizionato sopra il composer senza coprire contenuto o striscia. Stesso CSS e sprite, nessun token nuovo.
4. `harness-ui/frontend/index.template.html`: rigenerato.
5. `harness-ui/frontend/src/styles/index.css`: rigenerato.
6. `harness-ui/frontend/tests/unit/chat-foot.test.mjs`: sola esecuzione, nessun edit necessario. L'helper di calcolo è già caratterizzato e non cambia; gesto/visibilità sono verificati sul DOM reale dal nuovo test browser, senza test unitario che duplichi l'implementazione.
7. `harness-ui/public/app.js`: generato.
8. `harness-ui/public/index.html`: generato.
9. `harness-ui/public/styles.css`: generato.
10. `harness-ui/public/build-manifest.json`: generato.
11. `.claude/LEDGER-BUG-CHAT-LOCALI-2026-09-08.md`: piano, scoperte e consegna.
12. `.claude/CODA-PROPOSTE-OWNER-2026-09-08.md`: PO-08.

File da creare:

13. `harness-ui/frontend/tests/browser/chat-attesa-fondo.spec.mjs`: test permanenti nominati sopra, dati SSE controllati sul frontend vero, prove al contrario/stati terminali, geometria, hit-test e tastiera. Helper di test locali, nessun export pubblico.
14. `.claude/taccuini/astra-chat-locali-2026-09-08.md`: registro delle immagini effettivamente aperte; evidenze in scratchpad/prove/foto/astra-chat-locali-20260908.

RED: CHAT-ATTESA-01 senza ReasoningStart deve perdere la bolla al ritorno; CHAT-ATTESA-02 deve perdere la nuova bolla su render storico; CHAT-FONDO-01 deve fallire perché il bottone non esiste. GREEN: build produzione, copia dei generati tramite pipeline; `npm run test:unit`, Playwright `chat-attesa-fondo.spec.mjs` con configurazione esistente e porta test4314/store fresco, regressioni esistenti su replay e resume pertinenti; parità Conversazione/ChatFooter. Prima della consegna applicare i controlli inversi; prove reali isolate in linguaggio naturale distinte dalle fixture.

Compatibilità: `passaASessione`, `nuovaGenerazioneSessione`, `collegaEventiSessione`, `nascondiAttesaRisposta`, `runRealeAttivo`, `fondoInVista`, `scorriInFondoConversazione`, `data-vai-in-fondo` se già presente, `talos-vai-in-fondo` e tutti gli id composer esistenti restano compatibili. Aggiornare il piano prima di modificare altri file/simboli. Il fix backend locale richiede diagnosi/ricerca e piano separati.

Rollback UI: solo modifiche di questo commit alla fonte e ai componenti, rigenerazione, build e riconsegna; nessuna migrazione. Verificare cambio sessione, ricarica, arresto/fine, errore/connessione caduta e preferenza movimento ridotto. Non scambiare evento simulato per prova di un modello locale reale.

## Consegna provvisoria

Aggiornamento prima della prova: 4314 è già occupata dall'istanza del banco. Non interromperla. I test Playwright automatici usano 4316, stesso server e store temporaneo nuovo previsto dalla configurazione; le prove manuali restano sul banco 4314. Aggiunto CHAT-ATTESA-03: replay di ragionamento su sessione chiusa non crea indicatore attivo, anche senza evento terminale persistito.

RED confermato: tutti i sei casi falliscono sulla versione precedente per gli assert attesi (bolla assente, bolla storica indebita, pulsante assente). La prima esecuzione aveva due difetti nelle fixture: selettore assistant-copy includeva il corpo reasoning e primo avvio intercettava il mouse. Corretti prima della seconda RED valida. GREEN iniziale 6/6; unità 463/463. Nessun helper scroll modificato. Fase di attesa monotona e associazione sul messaggio impediscono al render precedente di chiudere una nuova fase. Conservato il vincolo owner: l'attesa termina quando il testo compare realmente, non al delta in rete.

Regressione intercettata prima della consegna: LAG-REPLAY-PACED-35 passa da massimo 12 a 51 mutazioni DOM perché l'associazione della fase riscriveva l'attributo ad ogni delta, anche invariato. Il test esistente resta il caso permanente; correggere solo quando la fase cambia, senza aumentare la soglia. Le altre due regressioni reasoning e resume passano. Nell'estensione CHAT-FONDO-01 la fixture deve aspettare il completamento dello scroll di invio prima di simulare la rotella; altrimenti gareggia col timer da 40 ms esistente. Corretto il test, nessun cambiamento alla politica di scroll.

Consegna UI: GREEN finale 9/9 (sei casi nuovi + tre regressioni replay/reasoning/resume), parità Conversazione/ChatFooter 6/6, unità 463/463, build 31 asset, diff-check verde. La regressione di 51 mutazioni è corretta senza allentare il test. Nuovo blocco wrapper del pulsante, riuso Button/sprite i-chevron e canale scroll; zero token CSS aggiunti. Immagini aperte e giudicate nel taccuino. Il clic sullo storico reale 4174 raggiunge il fondo e nasconde il controllo. L'attesa al cambio sessione è provata con eventi controllati: la prova con inferenza locale reale resta parte del gate motore, non è dichiarata svolta.

Diagnosi locale in sola lettura: sessione `8407d564-f7a0-4e4c-b737-ca5851046a50`, snapshot 2–5, messaggio indice 4, tool `elenca`, id `mIgrhDLAG26vqpiWzuk0OmPvg2BaTKmB`, argomenti `{`. Snapshot iniziale sano, 398 chiamate nel secondo, argomento incompleto conservato nei tre follow-up falliti. Il kernel attuale normalizza le nuove risposte ma `resume()` riusa gli snapshot precedenti senza quella normalizzazione. Occorre recupero tracciato e prevenzione verificati separatamente; nessun file di sessione originale modificato.

**Cosa deve fare l'owner:** scelta ricevuta, stessa conversazione; nessun'altra azione per questa fase. **Cosa faccio io:** consegna UI e piano dettagliato del recupero locale, usando la ricerca delegata conclusa. **Cosa rimane:** recupero, prevenzione, prove reali/benchmark e coda, incluso PO-08.
