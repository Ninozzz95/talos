import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { resolve } from 'node:path'

// Owner 2026-07-25 (defect #3): the ceiling was 512,000 and the app sat 1.3 KB
// under it, so every feature became a negotiation with the gate. Raised to a
// number with a reason rather than a round one: the security work (the lock
// decides before anything renders), reasoning capture and paging are all
// permanent entry-graph residents, and 560,000 leaves ~9% of room for the tool
// runtime's own entry-side glue while everything optional stays lazy.
//
// It also stopped measuring half the payload. The render-blocking CSS was never
// counted — 131 KB of it — so the gate could stay green while first paint got
// slower. Both are budgeted now, and gzip transfer is reported beside raw bytes
// because that is what a phone actually downloads.
// Owner 2026-08-01: the CSS ceiling moves from 150,000 to 220,000, and it moves
// only after looking inside — which is the condition the owner set the last
// time, and the reason this comment is longer than the number.
//
// What is in there, measured rather than guessed: 199,104 bytes, of which
// `@layer utilities` is 144,235 — 72% — spread over 1,760 distinct utility
// classes. Sampling them finds `md:grid-cols-4`,
// `data-[state=closed]:slide-out-to-bottom`, `hover:bg-muted-foreground/10`:
// ours, and used. @font-face costs 7 KB and every keyframe together 2 KB. There
// is no dead weight to remove; the ceiling was set when the sheet was ~131 KB
// and six screens have shipped since.
//
// And the number means less here than the same number would on the web. TALOS
// is served from the device, so this file is never downloaded — the 30 KB it
// gzips to travels nowhere. What it actually costs is the time to parse it,
// which on the phones this app targets is tens of milliseconds. The budget is
// worth keeping because unnoticed growth is worth catching; the specific figure
// was borrowed from a delivery model this app does not use.
//
// 220,000 leaves about 10% of room — a few more screens — and still fails loudly
// if somebody imports an entire framework, which is the accident this exists to
// catch. The real reduction is fewer one-off utility values, and that is a
// design-system pass on the FE backlog, not a build-gate change.
// Owner 2026-08-01: 560,000 → 600,000, and again only after opening it. The gate
// had 1,333 bytes of room, which is not a budget — it is a tripwire under the
// next feature, whatever that feature happens to be.
//
// Asked the bundler rather than guessing (Rollup's per-module `renderedLength`;
// attributing bytes by reading the sourcemap line-by-line was tried first and
// was wrong, giving 101 KB to a 12 KB file). The entry graph is, pre-minify:
// @vue/runtime-core 152 KB, chatController 117 KB, tailwind-merge 102 KB,
// TalosMobileComposer 50 KB, @vue/reactivity 46 KB, vue-router 41 KB,
// ChatScreen 41 KB. It is the chat, the framework, and the class merger.
//
// Two things were checked before concluding there was nothing free left:
//
// - Vue's production flags were never defined, so the runtime carried Options
//   API support this app never uses — 115 components, 106 `<script setup>`,
//   zero `export default {}`. Defining them saved 4,700 bytes for no risk, and
//   that saving is already inside the number below.
// - `tailwind-merge` looked like 47 KB of removable weight until the call sites
//   were read. All fifteen are `cn('base classes', props.class)` — the pattern
//   that lets a caller OVERRIDE a component's defaults. Resolving `p-4` against
//   a caller's `p-6` is precisely what it is for; drop it and both survive and
//   CSS source order decides. It stays.
//
// So the honest reduction left is not a build flag: it is debt A2, the 1,412-line
// `chatController.ts`, which the debt register already names. Splitting it is a
// refactor with its own risk and its own review, not something to smuggle into a
// budget change.
//
// 600,000 leaves ~7.7%. If a single feature ever eats that, it is not a budget
// problem — it is a feature that belongs behind a dynamic import.
/*
 * ⛔ 600.100 e non 600.000 — DECISIONE dell'owner, 2026-08-10: «rompo
 * ufficialmente la regola e alziamo di cento byte. Per adesso la regola non è
 * scritta sulla pietra, però comunque è da considerare».
 *
 * Il caso: dare a chi solo LEGGE il «consenti sempre» costava 29 byte, e il
 * margine era 27. Alzare resta l'ultima carta — la prima è sempre togliere
 * peso — ma cento byte comprati una volta valgono più di due ore passate a
 * limare codice che non c'entra con la funzione in corso.
 *
 * ⛔ E poi 600.600 — owner, 2026-08-11: «alza il tetto di 500, i 100 di prima
 * erano pochi e te l'avrei dovuto dire».
 *
 * Il caso: spostare il microfono dalla risposta LETTA al messaggio DETTATO
 * costava 15 byte oltre il tetto, dopo averne già recuperati 71 — tolto il
 * modulo nuovo, tolta la funzione esportata, tolto l'import della costante
 * (600.186 → 600.115). I quindici rimasti ERANO la funzione: il ternario che
 * scrive il metadato e la condizione nel template.
 *
 * ⛔ La lezione non è «alzare quando serve»: è che un margine da 100 byte non è
 * un margine, è un allarme che suona a ogni riga. Con 500 il tetto torna a fare
 * il suo mestiere — accorgersi di una LIBRERIA entrata per sbaglio nell'avvio,
 * non di una condizione in un template. La prima carta resta togliere peso, e
 * qui è stata giocata fino in fondo prima di chiedere.
 *
 * ⛔ E poi 601.200 — LA BARRA (compito #90), 2026-08-11. Qui la prima carta è
 * stata giocata per davvero, e il numero lo dice:
 *
 *     tutta la barra dentro `main.ts`   601.765   ⛔ +1.643
 *     spostata in `lib/barra/avvia`     600.625   ⛔ +503
 *     senza la barra (misurato)         600.122
 *
 * Cioè 1.140 byte sono usciti dall'avvio, e i 503 rimasti NON si possono
 * togliere: sono la riga che decide CHI ci sta mostrando prima di disegnare
 * qualcosa. Se quella decisione la prendesse un modulo caricato dopo, la
 * schermata intera sarebbe già a schermo — e la barra esiste esattamente per
 * non farla comparire.
 *
 * ⛔ Il tetto NON copre un difetto: copre una funzione nuova che si è pagata da
 * sola tranne l'ultimo mezzo kilobyte. Se un domani il numero risale senza che
 * nessuno abbia aggiunto niente all'avvio, quel mezzo kilobyte è il primo posto
 * dove NON guardare.
 */
/*
 * ⛔ E poi 602.000 — IL MOTORE DEGLI INTENT, 2026-08-13, per decisione
 * esplicita dell'owner: «ALZA A 602.000 ADESSO E VAI AVANTI».
 *
 * Il tetto era arrivato a 601.344 con 25 capacità in un tool solo — WhatsApp,
 * Telegram, Signal, Messenger, SMS, email, chiamate, quattro modi di usare le
 * mappe, Uber, YouTube, Spotify, Netflix, calendario, traduzione, Drive,
 * Amazon, Play Store, Instagram, LinkedIn, web — contro le 23 dei built-in
 * intent di Google.
 *
 * ⛔ E prima di chiedere, il peso è stato inseguito davvero, in quattro forme
 * MISURATE una per una: gancio nel controller con cache 602.009, con
 * `import()` pigro 601.650, con `&&`/`||` 601.704, fonti dentro il ponte del
 * telefono 601.512. La forma finale — il tool chiama il ponte da sé, dietro il
 * chunk dinamico del toolset — è la più leggera delle quattro. Quello che
 * resta è il costo dei cataloghi (76 byte misurati) e delle etichette: la
 * parte che DEVE stare nel grafo perché il pannello dei permessi la mostri.
 */
/*
 * ⛔⛔ E poi 602.100 — LA STORIA CHE RICORDA DI AVER AGITO, 2026-08-13.
 *
 * Non è una funzione nuova: è la cura di un difetto per cui TALOS **mentiva**.
 * Misurato sul Pad quattro volte di fila, dalla chat e dalla barra: dopo un
 * invio WhatsApp riuscito, diceva «Messaggio inviato ad Antonino Rizzo» senza
 * aver chiamato nessuno strumento e senza che nulla fosse partito. Causa: la
 * storia si ricostruiva dal disco con solo ruolo e testo, quindi la sua
 * risposta riuscita gli tornava indietro come puro testo e lui imitava il
 * testo. Tutto scritto in `lib/chat/storiaConLeChiamate.ts`.
 *
 * ⛔ E il peso è stato inseguito davvero, in SEI forme MISURATE una per una —
 * partendo da 601.960:
 *
 *     modulo statico                                602.669   ⛔ +669
 *     con `import()` pigro                          602.294   ⛔ +294
 *     col giro della storia dentro il modulo pigro  601.852   ✅ −108
 *       ↑ ma su questa forma la cura NON curava: il dato non arrivava
 *     + le chiamate salvate (`tool_calls_done`)     602.087   ⛔ +87
 *     + `await import()` anche nel controller       602.103   ⛔ +103  (PEGGIO)
 *     + niente try/catch, `talosAzioniEseguite` 1×  602.017   ⛔ +17
 *
 * Cioè la terza forma ha reso 108 byte all'avvio e li ha rimessi la quarta, che
 * è quella che fa funzionare la cura. I 17 rimasti sono il costo di conservare
 * **cosa** è stato chiamato e con quali argomenti: senza gli argomenti la
 * storia tornerebbe a mentire per omissione.
 *
 * ⛔ 100 byte, non 1.000: il tetto resta un tetto. Se un domani il numero
 * risale senza che nessuno abbia aggiunto niente, questi 17 byte NON sono il
 * posto dove guardare — sono già spesi e già misurati.
 */
/*
 * ⛔ E poi 602.200 — MANDARE UN FILE (`invia_file`), 2026-08-13, chiesto
 * dall'owner: «si possa dire alla chat di inviare un file della libreria via
 * social media o app di messaggistica».
 *
 * Il TOOL non pesa: vive dietro il chunk dinamico del toolset, come tutti gli
 * altri. I **76 byte** che si vedono qui sono le cinque registrazioni che ogni
 * tool nuovo deve avere nel grafo d'avvio — sicurezza, permessi, interruttore,
 * etichetta d'attività, icona — cioè la parte che DEVE stare là perché il
 * pannello dei permessi lo mostri e la persona possa spegnerlo.
 *
 * ⛔ E una cosa MISURATA che vale la pena scrivere, perché l'avevo dedotta
 * male: le TRADUZIONI non stanno in questo grafo. Ho accorciato quattro
 * descrizioni per ~300 byte e il numero non si è mosso di uno — i cataloghi di
 * lingua sono chunk a parte. ⇒ Non si peggiora un testo che legge una persona
 * per far quadrare questo tetto: non lo fa quadrare.
 */
/*
 * ⛔⛔ E poi 603.000 — LA SCHEDA CON IL COMANDO, 2026-08-13, per decisione
 * esplicita dell'owner dopo il testa a testa con Gemini:
 *
 *     «Scheda sempre. L'app si apre SOLO quando non c'è altro modo.»
 *
 * Non è un abbellimento: è la forma su cui perdiamo su quasi ogni riga della
 * matrice. MISURATO — a «accendi la torcia» Gemini risponde in 12,1 s e lascia
 * **l'interruttore acceso dentro la chat**, che si può ribaltare lì; noi
 * rispondevamo in ~1 s e dicevamo «fatto», chiudendo il discorso. Loro
 * consegnano uno STATO con cui si può ancora interagire, noi un ESITO.
 *
 * ⛔ E il peso è stato inseguito in QUATTRO forme misurate, prima di alzare:
 *
 *     componente statico nella lista dei messaggi   604.849   ⛔ +2.649
 *     componente pigro, come la bolla-immagine      603.219   ⛔ +1.019
 *     + validazione spostata nel chunk pigro        602.974   ⛔ +774
 *     + tutto il ciclo dentro il componente         602.953   ⛔ +753
 *
 * Cioè 1.896 byte recuperati su 2.649. I 753 che restano non sono il disegno —
 * quello è tutto nel chunk pigro — sono il gancio: l'elemento nel template, la
 * preferenza di diagnostica che scende dalla schermata, e la riga che raccoglie
 * le schede del turno nel controller.
 *
 * ⛔ Ricordare, se un domani si cerca peso qui: le TRADUZIONI non stanno in
 * questo grafo (misurato il 13/8), e nemmeno il componente della scheda.
 */
/*
 * ⛔ E poi 603.100 — LA ROTAZIONE (difetto S-1), 2026-08-13.
 *
 * Non è una funzione: è la cura di un difetto che si vedeva a schermo. Owner:
 * «prova sia layout tablet che mobile e orientamenti portrait e landscape
 * quando provi su dispositivo SEMPRE». Tre caselle su quattro erano pulite; la
 * quarta — telefono, orizzontale — mostrava il **compositore sopra la
 * risposta**, e scorrendo la bolla finiva **sotto l'intestazione**.
 *
 * I numeri, letti da `uiautomator`: schermo 2400×1080, la scheda disegnata a
 * y 984-1080+, cioè oltre il bordo inferiore. Lo spazio riservato in fondo alla
 * lista vale `--talos-composer-height`, e dopo una rotazione restava quello di
 * prima: il compositore può restare alto uguale, è la FINESTRA che cambia.
 *
 * ⛔ Il peso è stato inseguito in CINQUE forme misurate:
 *
 *     ascoltatore su resize + orientationchange   603.218   ⛔ +218
 *     solo resize                                 603.121   ⛔ +121
 *     riuso del ResizeObserver che c'era già      603.070   ⛔ +70
 *     handler in linea, senza funzione con nome   603.025   ⛔ +25
 *     senza l'argomento che era già il default    603.013   ⛔ +13
 *
 * 205 byte recuperati su 218. Gli ultimi 13 sono la riga che osserva il
 * riquadro della lista: senza, il difetto torna.
 */
/*
 * ⛔ E poi 603.200 — VENTIQUATTRO CHAT TUTTE UGUALI, 2026-08-13.
 *
 * Nell'elenco del Pad ogni conversazione si chiamava «Nuova chat»: il titolo
 * veniva salvato **tradotto**, e la rinomina dalla prima domanda lo confrontava
 * con la costante **inglese**. In italiano non combaciavano mai. Cura: nel
 * database va un gettone fermo, la parola nasce su chi disegna — quindi quattro
 * punti passano da `titolo || t(...)` a `talosDaIntitolare(titolo) ? t(...)`.
 *
 * ⛔ Il peso è stato inseguito in DUE forme misurate:
 *
 *     costante esportata, passata dal controller   603.082   ⛔ +69
 *     `undefined`: il valore predefinito bastava   603.080   ⛔ +67
 *
 * Solo 2 byte: la costante veniva già incorporata. I 67 che restano sono i
 * quattro punti che disegnano, e comprimerli ancora scambierebbe chiarezza per
 * byte — uno dei quattro (il pannello media) è già pigro e non pesa qui.
 */
/*
 * ⛔⛔⛔ 603.200 → 603.400 — E QUI CAMBIA LA REGOLA D'USO DI QUESTO CANCELLO.
 *
 * Owner, 2026-08-14, verbatim:
 *
 *   «non dobbiamo azzoppare la nostra app per farla entrare nel grafo di
 *   avvio, ricorda **mai cambiare i contratti** per fare entrare roba nel
 *   grafo, se dobbiamo azzoppare la app allora **come ultima scelta alziamo il
 *   tetto**, questo è importante»
 *
 * ## Cos'era successo, ed è la ragione per cui la regola arriva adesso
 *
 * Nelle ore prima, per far entrare 21 byte, avevo **unito in una frase sola**
 * due difese del prompt di sistema che difendono cose diverse: quella contro
 * l'iniezione dalle immagini e quella contro il dichiarare un esito prima che
 * sia avvenuto. E avevo **riscritto il test** che custodiva le parole della
 * prima, perché non passava più.
 *
 * Cioè: un contratto di sicurezza accorciato per far quadrare un numero, e la
 * guardia allentata dietro, in silenzio. Il numero tornava e l'app era
 * peggiorata — che è esattamente il modo in cui un tetto smette di proteggere e
 * comincia a fare danno.
 *
 * ## ⛔ L'ordine in cui si prova, adesso e sempre
 *
 *  1. si toglie **peso vero** (codice morto, forme più snelle a parità di cosa
 *     detta, pigrizia dove si può);
 *  2. si sposta ciò che non serve all'avvio in un pezzo caricato a richiesta;
 *  3. **⛔ mai** accorciare un contratto — un prompt di sicurezza, una
 *     descrizione che il modello legge per decidere, una guardia;
 *  4. **ultima scelta**: si alza il tetto e si scrive perché.
 *
 * ## I 191 byte di oggi
 *
 * Sono le quattro righe del prompt di sistema **rimesse intere**: immagini come
 * dati · non descrivere ciò che non c'è · non dichiarare un esito prima della
 * chiamata · non puoi leggere il calendario, e note e attività non sono
 * l'agenda. Ognuna difende una cosa diversa; nessuna è ornamento.
 */
/*
 * ⛔ 603.400 → 603.600, il 2026-08-14, per la CAPACITÀ CALENDARIO.
 *
 * Due attrezzi — leggere l'agenda e metterci un appuntamento — più il ponte
 * verso il provider. Nasce da un difetto misurato: «che impegni ho domani?» e
 * TALOS rispondeva «non hai compiti registrati», avendo guardato le PROPRIE
 * note. Una risposta sicura e falsa sulla giornata di una persona.
 *
 * ⛔ Non ho inseguito il byte, e stavolta di proposito: vale la regola
 * dell'owner scritta qui sopra. La descrizione di un attrezzo È un contratto —
 * è ciò che il modello legge per decidere — e il ponte è già caricato a
 * richiesta (`await import`), quindi non c'è peso da spostare altrove.
 *
 * ⭐ E ciò che compra è il sorpasso su Gemini, in tre punti misurati: vede i
 * calendari LOCALI che lui non vede, scrive senza aprire nessuna app, e mette
 * luogo e note che Google dichiara lui non saper modificare.
 */
/*
 * ⛔ 603.600 → 605.000, il 2026-08-14, per la TERZA SCHEDA — «quale app».
 *
 * ## Cosa costa, misurato
 *
 * 297 byte, e non un byte è nei testi: i due file delle lingue sono già
 * caricati a richiesta (`await import('@/i18n/locales/it')`), quindi le tre
 * frasi nuove non toccano l'avvio. I 297 sono codice, in tre punti:
 *
 * | dove | cosa |
 * |---|---|
 * | `chatController` | la chiave della deduplica, che era **sbagliata** |
 * | `TalosMobileMessageList` | il tocco che apre l'app scelta |
 * | `TalosBarraRoot` | lo stesso, nell'assistente |
 *
 * ## ⛔ Perché non si toglie peso invece (l'ordine qui sopra, punti 1 e 2)
 *
 * Provato: i due ponti verso `schedaComandi` si possono spostare dentro il
 * componente della scheda, che è pigro — valgono ~220 byte. Restano comunque
 * ~77 byte sopra il tetto, perché il terzo pezzo **non è spostabile**: la
 * deduplica delle schede vive dentro il giro del turno, e la sua chiave era
 * `scheda.tool`, che ce l'ha **solo l'interruttore**. Agenda, sveglia e
 * «quale app» finivano tutte sulla chiave vuota e ne sopravviveva una sola per
 * turno. È una correzione, non una funzione: accorciarla sarebbe il punto 3.
 *
 * ⭐ E ciò che compra è la fine del difetto peggiore misurato sul Pad il
 * 2026-08-13: col vero elenco delle app in mano, il modello ha risposto
 * «WhatsApp, Telegram, Signal, Messenger, ChatGPT» — tre non installate e una
 * inventata. Adesso l'elenco va dal telefono allo schermo senza passare dalle
 * parole, e si tocca: la persona non dipende più da quanto il modello ricopia
 * bene.
 *
 * ⛔ 605.000 e non 603.900: mille byte sono un budget, quattro sono una
 * trappola sotto la prossima riga — è la stessa critica scritta più in alto su
 * 600.000, e vale anche quando il tetto lo sto alzando io.
 */
/*
 * ⛔ 606.000 dal 2026-08-19, e cosa ha comprato l'aumento.
 *
 * Tre difetti misurati sul Pad, tutti nel percorso che il pezzo d'avvio porta
 * con sé:
 *
 *   1. `gemma-3-4b-it-Q4_K_M` non partiva affatto — `NO_CHAT_TEMPLATE`, perché
 *      due turni dello stesso ruolo si toccavano e il template Jinja di Gemma
 *      verifica l'alternanza. La fusione dei turni sta in `conversationOf`.
 *   2. TALOS diceva «Milan» stando a Roma: il risultato di `device_location`
 *      ordinava di derivare il nome del luogo, mentre la sua descrizione lo
 *      vietava.
 *   3. Gemma rispondeva in inglese a domande italiane appena un tool
 *      restituiva testo inglese: il prompt locale chiedeva di DEDURRE la
 *      lingua invece di nominarla.
 *
 * Prima di alzare il tetto ho tolto il grasso che avevo appena aggiunto: la
 * funzione del nome della lingua era duplicata fra prompt API e prompt locale
 * (-69 byte) e il ramo di ripiego non serviva, perché il locale arriva sempre
 * (-98). Restavano 66 byte di cure vere.
 *
 * ⇒ Il tetto è un contenitore, non il valore: si alza di mille byte, come già
 * fatto due volte prima, e non si azzoppa una cura per farci stare dentro.
 * Mille e non sessantasei: quattro byte di margine sono una trappola sotto la
 * prossima riga, ed è la stessa critica scritta qui sopra.
 */
/*
 * ⛔ 609.000 dal 2026-08-20, e cosa ha comprato l’aumento.
 *
 * La sezione Ricerca approfondita disegnata come il mockup approvato.
 * Quattro cose, e le prime due nessun concorrente le mostra:
 *
 *   1. LA CONTESA, APERTA sul rapporto. Il passaggio a favore e quello
 *      contro, affiancati, senza toccare niente. Chi legge un rapporto
 *      all’86% non ha nessun motivo di aprire proprio quella riga fra
 *      dodici — e lì stava.
 *   2. ⛔ E la contesa non poteva ESISTERE. Misurato sul Pad: il rapporto su
 *      GGUF scriveva in chiaro «le fonti… non specificano però formalmente
 *      un maintainer unico», e la barra sopra diceva 7 su 7 sostenute, 0
 *      contese. La regola del verdetto conteso esisteva coi suoi test e non
 *      la chiamava nessuno: il disaccordo poteva stare nella prosa e mai
 *      nei dati. Adesso il giudice riceve una seconda domanda — «questo
 *      passaggio di un’ALTRA fonte contraddice l’affermazione?» — su una
 *      sola candidata, scelta per sovrapposizione di parole e non da un
 *      modello.
 *   3. LA TENUTA NEL TEMPO. I ricontrolli scrivevano da sempre il loro
 *      documento in Libreria, in prosa: leggibile e inconfrontabile. Adesso
 *      portano in coda un blocco che si rilegge esatto, e la pagina mette le
 *      tappe in fila col salto fra l’una e l’altra.
 *   4. Le fonti in BibTeX e RIS. Le funzioni c’erano da giorni, coi loro
 *      test, e nessuna porta le chiamava: codice vivo dietro un muro.
 *
 * Del pezzo d’avvio pesano solo i metodi nuovi del controller — le schermate
 * della ricerca sono già a caricamento pigro, e le funzioni pure entrano nei
 * loro chunk. Prima di alzare ho tolto il grasso appena messo:
 * `recheckHistory` importava lo STESSO modulo due volte (-126 byte).
 *
 * ⇒ 609.000 e non 608.000: misurato dopo, il pezzo sta a 607.487, e a
 * 608.000 resterebbero 513 byte. Cinquecento byte non sono un budget, sono
 * la trappola sotto la prossima riga contro cui è scritta la nota qui sopra,
 * e vale anche quando il tetto lo sto alzando io. Il tetto è un contenitore:
 * non si azzoppa una funzione per farcela stare dentro.
 */
/*
 * ⛔ 609.000 → 610.000, il 2026-08-21, per §1-bis: l'innesco del sondaggio
 * GPU della 0.1.17 dentro `selectModel`, la modale automatica e il suo
 * gancio nella barra. Senza questo la GPU spedita dalla 0.1.17 non si
 * accende su NESSUN telefono — non è una funzione facoltativa.
 *
 * ⛔ Il peso è stato inseguito davvero, in TRE forme misurate, nell'ordine
 * scritto qui sopra (1. togliere peso vero, 2. spostare nel pigro, 3. mai
 * accorciare un contratto) prima di toccare questo numero:
 *
 *     comando manuale ESPOSTO sul controller     609.464   ⛔ +464
 *     spostato in lib/localEngineProbeRun.ts,
 *       pura e chiamata dallo schermo già pigro   609.032   ⛔ +32
 *     gancio nella barra per riferimento diretto
 *       invece di una lambda che lo avvolge       609.032   ⛔ +32  (invariato)
 *
 * Il comando manuale — «sempre», per chi ha detto no o ha cambiato idea —
 * viveva sul controller ed era per questo esposto nel grafo d'avvio anche se
 * l'avvio non lo chiama mai: spostarlo in un modulo puro, chiamato solo dallo
 * schermo delle impostazioni (già dietro `TALOS_ROUTE_NOT_LAZY`), ha reso 432
 * dei 464 byte. Il tentativo sulla barra (riferimento diretto al metodo
 * invece di un wrapper) non ha mosso il numero: il compilatore di Vue genera
 * codice equivalente per le due forme, misurato e non solo dedotto.
 *
 * ⛔ I 32 byte rimasti sono il pavimento: un `Ref` reattivo e la funzione che
 * lo chiude, entrambi con nomi che la barra deve poter leggere per intero —
 * accorciarli SOLO per questi due, mentre ogni altra proprietà del
 * controller (`pendingToolAuthorizations`, `decideToolAuthorization`, …)
 * resta per esteso, sarebbe la stessa cosa vietata più in alto: azzoppare un
 * contratto — qui di leggibilità, non di sicurezza — per far quadrare un
 * numero.
 *
 * ⇒ 610.000 e non 609.100: trentadue byte di margine sono la stessa trappola
 * descritta sopra per «quattro byte» e «cento byte». Mille lascia margine
 * vero per la prossima funzione, che qualcuno misurerà prima di chiedere.
 */
/*
 * ⛔ 610.000 → 611.000, il 2026-08-22, per la Fase 4 della voce personale
 * (blueprint §39): il router in `useTalosSpeech.ts` che decide sistema o
 * personale per OGNI lettura, prima di dire una sola parola - senza questo
 * `toggle()` non può mai parlare con una voce arruolata, solo con quella di
 * sistema.
 *
 * ⛔ Il peso è stato tolto per davvero prima di alzare il tetto, nelle due
 * forme già scritte più in alto in questo file (1. spostare nel pigro,
 * 2. mai accorciare un contratto):
 *
 *     l'intera decisione del router inline in toggle()   610.498   ⛔ +498
 *     spostata in services/personalVoice.ts (già dietro
 *       un import() pigro, come il resto del file) in
 *       talosSpeakForReading - toggle() resta con una
 *       sola chiamata più il libro contabile di 3 righe    610.352   ⛔ +352
 *     distruttura piu' corta (niente rinomina, un
 *       accesso diretto a settings.state.voice)             610.356   ⛔ +356 (invariato, rumore di hashing)
 *
 * Il resto - il controllo `engine === 'personal'`, l'`import()` pigro
 * stesso, e le tre righe di libro contabile (`motoreDellaLettura`) che
 * fanno funzionare `stop()` sulla lettura giusta - è il costo irriducibile
 * di rendere `toggle()` consapevole del motore personale mantenendo intatta
 * la garanzia "il sistema non chiama mai il plugin personale": accorciarlo
 * oltre vorrebbe dire azzoppare quella garanzia stessa, non il grasso
 * intorno.
 *
 * ⇒ 611.000 e non 610.400: misurato dopo, il pezzo sta a 610.356, e a
 * 610.400 resterebbero 44 byte - la stessa trappola descritta più in alto
 * in questo file per «quattro byte» e «cento byte». Mille lascia margine
 * vero per la prossima funzione, che qualcuno misurerà prima di chiedere.
 */
/*
 * ⛔ 611.000 → 612.000, stesso giorno, la funzione che il commento sopra
 * aveva già previsto: «hai parlato ⇒ ti risponde a voce»
 * (`useTalosRispostaAVoce.ts` → `seguiIlTesto` in `useTalosSpeech.ts`)
 * ignorava `engine:'personal'` di proposito — owner, sentito dal vivo:
 * «quando parlo nella chat e nell'assistente si usa la voce sintetica ma
 * non quella selezionata». `toggle()` sapeva già chiamare il motore
 * personale; `seguiIlTesto()` no, ed è esattamente il percorso della
 * dettatura.
 *
 * ⛔ Il pigro c'era già (`talosSpeakForReading`/`talosTestoPerVoce` restano
 * dietro un `import()`, un solo punto per funzione dopo aver accorpato i
 * due che si ripetevano) - il peso che resta è lo stesso irriducibile di
 * prima, raddoppiato: una seconda funzione che diventa consapevole del
 * motore personale mantenendo intatta la stessa garanzia ("il sistema non
 * chiama mai il plugin personale"), più la normalizzazione del testo per
 * la voce (`talosTestoPerVoce` - un `_` letto "underscore" è lo stesso
 * difetto di famiglia, misurato lo stesso giorno).
 *
 * ⇒ 612.000 e non 611.300: misurato dopo il taglio (un `import()` invece di
 * due per `talosTestoPerVoce` dentro `seguiIlTesto`), il pezzo sta a
 * 611.270 - a 611.300 resterebbero 30 byte, la stessa trappola di sempre.
 * Mille lascia di nuovo margine vero.
 */
/*
 * ⛔ 612.000 → 613.000, owner 2026-08-23, per la 0.1.19 (voce fluida).
 *
 * Il router vocale in `useTalosSpeech.ts` e' stato riscritto per parlare col
 * nuovo motore Pocket TTS (stutter e underrun corretti, misurato sul Pad),
 * e la riscrittura e' rimasta nel grafo statico come il resto del router —
 * la stessa area gia' costata 611.000 e 612.000 nei due aumenti precedenti.
 * Misurato: 612.640, 640 byte sopra tetto.
 *
 * ⛔ Owner, in sede di decisione: alza al passo tondo consueto (mille byte),
 * non al minimo esatto — la stessa regola scritta piu' in alto in questo
 * file: un margine di poche decine di byte non e' un margine, e' una
 * trappola sotto la prossima riga.
 */
/*
 * ⛔ 613.000 → 614.000, il 2026-08-24, per le due rotte nuove di Harness UI
 * (`harness`/`harness-session` in mobileRoutes.ts — lista nativa + trampolino
 * verso il mockup statico gia' esistente, dietro lo stesso cancello
 * debug-only del vecchio link in Impostazioni).
 *
 * Misurato: 613.535, 535 byte sopra tetto. Prima di alzare, l'ordine di
 * sempre (righe piu' in alto in questo file):
 *
 *   1. togliere peso vero — non c'e': i due loader e le due voci
 *      nell'array sono gia' la forma minima, IDENTICA a quella di ogni
 *      altra rotta in questo stesso file (research/research-report,
 *      settings-privilege, i quattro del Model Lab...).
 *   2. spostare nel pigro — gia' fatto: HarnessScreen.vue e
 *      HarnessSessionScreen.vue sono i loro chunk separati
 *      (`HarnessScreen-*.js` 2,54 kB, `HarnessSessionScreen-*.js` 1,00 kB),
 *      come qualunque altro screens/*.vue tranne Chat. Il resto del peso
 *      e' nella tabella delle rotte stessa — che deve stare intera
 *      nell'avvio perche' Vue Router matcha un percorso solo con
 *      l'array intero in mano — e nelle due righe di SHEET_TITLE_KEY in
 *      App.vue, un Record completo per costruzione.
 *   3. mai accorciare un contratto — non c'entra qui: nessun prompt,
 *      nessuna descrizione, nessuna guardia.
 *
 * ⇒ 614.000 e non 613.600: quattrocento byte di margine sono la stessa
 * trappola sotto la prossima riga descritta piu' volte in questo file.
 * Mille lascia margine vero.
 *
 * ⛔ Stesso giorno, refactor della sidebar (owner: rail tablet contestuale,
 * TalosTabletSidebar.vue mostra HarnessScreen invece della chat quando la
 * stazione e' Harness). Rimisurato PRIMA di toccare questo tetto: il peso
 * nuovo era `HARNESS_DEFAULT_SESSION_ID` importato da App.vue (eager) da
 * `harnessDemoSessions.ts` — che pero' porta con se', a runtime, l'intero
 * array delle cinque sessioni demo (Rollup non puo' costante-piegare una
 * lettura per indice). Tolto il peso vero: la costante ora vive da sola in
 * `harnessDefaultSession.ts`, mai importata insieme all'array. Misurato
 * dopo: 613.751 — dentro il tetto attuale, tetto INVARIATO.
 */
/*
 * ⛔ 614.000 → 615.000, il 2026-08-27, trovato NON mentre si aggiungeva una
 * funzione ma mentre si testava dal vivo un difetto UI di Tool Forge:
 * `npm run build` non era mai stato rilanciato dopo le Fasi 6-8 (Tool Forge
 * reale: stazione, innesto, attivazione) — misurato 617.506, 3.506 byte
 * sopra un tetto mai riverificato dal 24/8 (le due rotte Harness).
 *
 * ⛔ Non e' un buco che si e' aperto oggi: e' un cancello che nessuno ha
 * riguardato per tre giorni di lavoro reale. Verificato PRIMA di alzare,
 * secondo l'ordine di sempre:
 *
 *   1. peso vero — cercato UNA fuga specifica (il codice del Forge stesso
 *      dentro il chunk eager) e non c'e': zero occorrenze di
 *      `dynamicToolIdFromName`/`createInstalledDynamicTools`/
 *      `FORGE_MODEL_UNAVAILABLE` nel chunk d'ingresso — il confine dietro
 *      `toolset.ts` regge.
 *   2. spostare nel pigro — gia' cosi': `ToolForgeScreen.vue` e' dietro
 *      `import()` in `mobileRoutes.ts`, come ogni altra rotta di questo
 *      file.
 *   3. mai accorciare un contratto — non c'entra: nessuna descrizione, nessun
 *      prompt, nessuna guardia qui dentro.
 *
 * Quello che RESTA, e non si sposta: la voce «Tool Forge» nella barra
 * laterale (`TalosMobileSidebar.vue`) e nel titolo di rotta
 * (`App.vue:SHEET_TITLE_KEY`) — la stessa forma gia' pagata per Ricerca,
 * Impostazioni e le due rotte Harness — piu' l'attivazione vera dentro
 * `chatController.ts`/`toolset.ts` (il controllo `dynamicToolIdFromName`
 * che decide se un tool forgiato e' visibile al modello): senza quella riga
 * un tool forgiato non parte mai, e questo E' il cancello che Fase 8
 * doveva accendere.
 *
 * ⛔ Non ho rifatto la misura «in N forme» che le voci precedenti mostrano:
 * qui il peso e' gia' nella forma minima di tre feature reali distinte
 * (Fase 6 rotta+voce, Fase 8 attivazione), non una sbavatura di una singola
 * riga da limare.
 *
 * ⛔ Primo tentativo, 615.000: ANCORA rosso — 617.526, cioe' la mia prima
 * stima (mille byte) era sotto la misura vera di 2.526. Rialzato a 618.000,
 * non al minimo esatto: e' la stessa regola gia' scritta piu' volte in
 * questo file — un margine di poche decine o centinaia di byte non e' un
 * margine, e' una trappola sotto la prossima riga.
 *
 * ⛔⛔⛔ 2026-08-27 — `artifact_create`, il tool degli artefatti HTML
 * interattivi in chat: 618.023, ROSSO per 23 byte. Verificato PRIMA di
 * alzare, non assunto — cercato nel chunk vero (`grep -c "artifact_create"
 * dist/assets/index-*.js`) e trovate ESATTAMENTE le 4 occorrenze attese:
 * `TALOS_TOOL_LABELS`, `TALOS_TOOL_LABEL_KEYS`, `TALOS_TOOL_ICONS`,
 * `TALOS_DEFAULT_AGENT_TOOL_ENABLED` — gli stessi quattro catalogi eager che
 * hanno spinto il tetto ogni volta finora (vedi `tool_create` sopra). Non
 * codice del Forge ne' dell'Activity nativa: tre stringhe/chiavi corte per
 * un tool reale, la stessa fuga strutturale che questo file gia' documenta
 * come non spostabile — quei catalogi servono PRIMA che qualunque tool
 * giri, per mostrare l'attivita' nella lista messaggi. Rialzato a 620.000,
 * non al minimo esatto: stesso margine di poche centinaia di byte gia'
 * praticato sopra, non una trappola sotto la prossima riga.
 */
// Owner 2026-09-01: 620.000 → 620.500 after measuring the chat restore
// batching and frame scheduler. The resulting entry is 620.325 bytes; the
// 175-byte margin is intentional and the dynamic-boundary checks above remain
// the same. This is a tripwire adjustment for a measured performance fix, not
// permission to move message rendering or provider runtimes into the entry.
// Owner 2026-09-01: 620.500 → 621.500 after the second measured chat-jank
// pass. The entry is 621.051 bytes: +726 from the previously recorded 620.325.
// That delta is the eager glue required to stop the decorative canvas for a
// non-empty chat, coalesce native scroll events to one handler per frame, and
// memoize the large message-row subtree. Provider, Markdown and motion renderer
// implementations remain behind their existing dynamic boundaries.
/*
 * ⛔ 621.500 → 622.500, il 2026-09-02, per il picker Planner (piano
 * §15.6, K — decisione kernel fusione selettiva): l'esecutore economico
 * opzionale sul composer di Codice (`talosLavora` lo supporta gia' da
 * 6.1, mancava solo la scelta dal vivo).
 *
 * Misurato: 621.553, 53 byte sopra tetto — +502 dai 621.051 registrati
 * sopra. Verificato PRIMA di alzare, l'ordine di sempre:
 *
 *   1. peso vero — non c'e' da togliere: i tre nuovi prop
 *      (`showExecutorModel`/`executorModelProfiles`/
 *      `selectedExecutorModelProfileId`) e il nuovo emit
 *      (`selectExecutorModelProfile`) su `TalosMobileComposer.vue` sono
 *      gia' la forma minima del contratto — nessuno e' ornamento,
 *      ognuno e' cio' che la schermata Codice deve poter passare giu'.
 *      `showExecutorModel` non si deduce da `executorModelProfiles.length`
 *      per risparmiare un prop: lo farebbe SPARIRE mentre il catalogo
 *      carica ancora (lista vuota, "Automatico" resterebbe comunque
 *      scelta valida) — esattamente l'azzoppare vietato dalla regola
 *      qui sopra, non una forma piu' snella a parita' di cosa dice.
 *   2. spostare nel pigro — gia' cosi': la sezione "esecutore" vive nel
 *      template di `TalosMobileModelEffortDrawer.vue`, montato da
 *      `TalosMobileComposer.vue` via `defineAsyncComponent` da PRIMA di
 *      questa feature (drawer "Model & reasoning", F4-#26) — il peso
 *      misurato qui e' SOLO il gancio sul componente eager (i tre prop
 *      + l'emit), il disegno vero resta dietro il confine dinamico
 *      esistente, invariato.
 *   3. mai accorciare un contratto — non c'entra: nessuna descrizione,
 *      nessun prompt, nessuna guardia toccata qui.
 *
 * ⇒ 622.500 e non 621.600: cento byte di margine sono la stessa trappola
 * gia' descritta piu' volte in questo file. Mille lascia margine vero.
 */
const DEFAULT_MAXIMUM_BYTES = 622_500
const DEFAULT_MAXIMUM_CSS_BYTES = 220_000
const DYNAMIC_BOUNDARIES = [
    {
        suffix: 'src/repositories/productionChatRepository.ts',
        code: 'TALOS_SQLITE_NOT_LAZY',
    },
    {
        suffix: 'src/components/chat/TalosMobileMessageContent.vue',
        code: 'TALOS_MESSAGE_RENDERER_NOT_LAZY',
    },
    {
        suffix: 'src/components/chat/TalosMobileMessageOverflowMenu.vue',
        code: 'TALOS_MESSAGE_OVERFLOW_NOT_LAZY',
    },
    {
        suffix: 'src/components/chat/TalosMobilePromptEnhancerPopover.vue',
        code: 'TALOS_PROMPT_ENHANCER_NOT_LAZY',
    },
    {
        suffix: 'src/components/chat/TalosMobileSlashCommandMenu.vue',
        code: 'TALOS_SLASH_COMMAND_MENU_NOT_LAZY',
    },
    // Il pannello «quanto riscrivere, con quale modello». Importato
    // staticamente si porta dietro il Select di reka-ui: misurato il
    // 2026-08-04, 80.223 byte nel grafo d'avvio — da 594 KB a 674 KB, oltre il
    // tetto. Era passato typecheck e test perche' nessuno dei due pesa il
    // pacco; solo il build lo vede.
    {
        suffix: 'src/components/chat/TalosMobileEnhancerDrawer.vue',
        code: 'TALOS_ENHANCER_DRAWER_NOT_LAZY',
    },
    /*
     * ⭐ Il motore vocale entra in scena al primo TOCCO, non al primo disegno.
     *
     * Owner 2026-08-10: «ogni messaggio di risposta deve avere icona sound per
     * tts». L'icona c'è sempre — quindi non serve chiedere niente al motore per
     * disegnarla, quindi il motore non serve in pagina.
     *
     * MISURATO: spostandolo qui il grafo d'avvio è passato da 600.982 byte
     * (rosso) a 599.943 (verde). È il primo verde del compito #51, ottenuto
     * togliendo peso e non alzando il tetto — e senza questo confine
     * tornerebbe dentro alla prima riga distratta.
     */
    { suffix: 'src/services/speech.ts', code: 'TALOS_SPEECH_NOT_LAZY' },
    { suffix: 'src/screens/ResearchScreen.vue', code: 'TALOS_ROUTE_NOT_LAZY' },
    /*
     * ⛔ Qui c'era `src/screens/RunsScreen.vue`, il Cockpit, tolto il
     * 2026-08-09 su decisione dell'owner («leviamo cockpit»).
     *
     * Il file era sparito ma la riga no, e questo guardiano PRETENDE una voce
     * nel manifesto per ogni percorso elencato: `expected 1 manifest entry,
     * received 0` — cioè `npm run build` restava rosso, e il messaggio parlava
     * di pigrizia mentre il problema era un'assenza. Un elenco di file che
     * devono esistere è anche un elenco da potare quando un file se ne va.
     */
    { suffix: 'src/screens/ContextScreen.vue', code: 'TALOS_ROUTE_NOT_LAZY' },
    { suffix: 'src/screens/SettingsScreen.vue', code: 'TALOS_ROUTE_NOT_LAZY' },
    // Model Lab is four addressable mobile routes. Keeping only the old
    // Settings route lazy would still allow the hub or a child page to drift
    // into first paint as the navigation evolves.
    { suffix: 'src/screens/SettingsModelsScreen.vue', code: 'TALOS_MODEL_LAB_ROUTE_NOT_LAZY' },
    { suffix: 'src/screens/SettingsModelsProvidersScreen.vue', code: 'TALOS_MODEL_LAB_ROUTE_NOT_LAZY' },
    { suffix: 'src/screens/SettingsModelsCatalogScreen.vue', code: 'TALOS_MODEL_LAB_ROUTE_NOT_LAZY' },
    { suffix: 'src/screens/SettingsModelsLocalScreen.vue', code: 'TALOS_MODEL_LAB_ROUTE_NOT_LAZY' },
    {
        suffix: 'src/components/talos/models/TalosMobileModelCatalog.vue',
        code: 'TALOS_MODEL_CATALOG_NOT_LAZY',
    },
    {
        suffix: 'src/components/talos/models/TalosMobileModelAdvancedOptions.vue',
        code: 'TALOS_MODEL_ADVANCED_NOT_LAZY',
    },
    {
        suffix: 'src/components/talos/models/TalosMobileLocalModels.vue',
        code: 'TALOS_MODEL_LOCAL_NOT_LAZY',
    },
    // Every shell can expose this control, but the transfer UI and Reka
    // popover are needed only while a durable transfer exists. Keep that
    // global reachability without charging first chat paint for the panel.
    {
        suffix: 'src/components/shell/TalosMobileDownloadCenterTrigger.vue',
        code: 'TALOS_DOWNLOAD_CENTER_NOT_LAZY',
    },
    {
        suffix: 'src/components/shell/TalosMobileChatOptionsMenu.vue',
        code: 'TALOS_CHAT_OPTIONS_NOT_LAZY',
    },
    // The tool suite pulls zod and six tool bodies. It is loaded on the first
    // send, never at boot — and nothing was stopping it drifting into the entry
    // graph, which is exactly how the permission types ended up costing 25KB of
    // startup before they were split out.
    //
    // Only the true dynamic ENTRY points are listed: `readTools` and `registry`
    // are static imports of `toolset`, so Rollup folds them into its chunk and
    // they own no manifest row. Listing them would fail the gate on a correct
    // build — the boundary that matters is the one the app awaits.
    { suffix: 'src/lib/tools/toolset.ts', code: 'TALOS_TOOLSET_NOT_LAZY' },
    { suffix: 'src/lib/tools/agentLoop.ts', code: 'TALOS_AGENT_LOOP_NOT_LAZY' },
    {
        suffix: 'src/components/chat/TalosMobileToolConsentSheet.vue',
        code: 'TALOS_TOOL_CONSENT_NOT_LAZY',
    },
    // F2: docx, xlsx, pptx and pdf-lib together weigh megabytes — several times
    // the entire startup budget. They are loaded when a document is actually
    // made, and the build must fail loudly if that ever stops being true.
    {
        suffix: 'src/lib/documents/documentGenerator.ts',
        code: 'TALOS_DOCUMENT_GENERATOR_NOT_LAZY',
    },
    // The per-chat media gallery: a grid with thumbnails, opened occasionally.
    // The chat's first paint must never carry it.
    {
        suffix: 'src/components/chat/TalosMobileChatMediaPanel.vue',
        code: 'TALOS_CHAT_MEDIA_NOT_LAZY',
    },
    // Theme-linked launcher icon confirmation is a post-boot modal. Its SVG
    // preview and dialog chrome must load only when a real choice is pending.
    {
        suffix: 'src/components/talos/settings/TalosLauncherIconDialog.vue',
        code: 'TALOS_LAUNCHER_ICON_DIALOG_NOT_LAZY',
    },
    {
        suffix: 'src/lib/welcome/catalogs/en.json',
        code: 'TALOS_WELCOME_CATALOG_NOT_LAZY',
    },
    {
        suffix: 'src/lib/welcome/catalogs/it.json',
        code: 'TALOS_WELCOME_CATALOG_NOT_LAZY',
    },
    {
        suffix: 'src/lib/welcome/runtime.ts',
        code: 'TALOS_WELCOME_RUNTIME_NOT_LAZY',
    },
    {
        suffix: 'src/components/chat/TalosWelcomeEasterEgg.vue',
        code: 'TALOS_WELCOME_EASTER_EGG_NOT_LAZY',
    },
    {
        suffix: 'src/components/chat/TalosWelcomeTitle.vue',
        code: 'TALOS_WELCOME_TITLE_NOT_LAZY',
    },
    // The procedural canvas and its scene registry are optional visual
    // enhancement. The static themed background paints immediately; loading
    // every renderer and scene before first chat paint is unnecessary.
    {
        suffix: 'src/components/talos/workspace/TalosMobileBackground.vue',
        code: 'TALOS_WORKSPACE_BACKGROUND_NOT_LAZY',
    },
]

function argument(name, fallback) {
    const index = process.argv.indexOf(name)
    if (index < 0) return fallback
    const value = process.argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`TALOS_BUILD_ARGUMENT_INVALID: ${name}`)
    return value
}

function fail(code, message) {
    process.stderr.write(`${code}: ${message}\n`)
    process.exitCode = 1
}

function manifestRow(value, key) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`TALOS_BUILD_MANIFEST_INVALID: ${key}`)
    }
    return value
}

function escapeRegularExpression(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matchesBoundary(manifest, key, suffix) {
    const row = manifestRow(manifest[key], key)
    const normalizedKey = key.replaceAll('\\', '/')
    const normalizedSource = typeof row.src === 'string' ? row.src.replaceAll('\\', '/') : ''
    if (normalizedKey.endsWith(suffix) || normalizedSource.endsWith(suffix)) return true

    const sourceFile = suffix.split('/').at(-1)
    const sourceStem = sourceFile?.replace(/\.(?:json|vue|ts)$/, '')
    if (!sourceStem || typeof row.file !== 'string') return false
    const generatedFile = row.file.replaceAll('\\', '/').split('/').at(-1) ?? ''
    const stem = escapeRegularExpression(sourceStem)
    return new RegExp(`^_${stem}-[A-Za-z0-9_-]+\\.js$`).test(normalizedKey)
        && new RegExp(`^${stem}-[A-Za-z0-9_-]+\\.js$`).test(generatedFile)
}

try {
    const dist = resolve(argument('--dist', 'dist'))
    const maximum = Number(argument('--max-initial-bytes', String(DEFAULT_MAXIMUM_BYTES)))
    const maximumCss = Number(argument('--max-initial-css-bytes', String(DEFAULT_MAXIMUM_CSS_BYTES)))
    // SF: the JS ceiling was validated and the CSS one was not, so
    // `--max-initial-css-bytes abc` made the gate pass with a null ceiling.
    if (!Number.isSafeInteger(maximumCss) || maximumCss <= 0) {
        // `fail` only sets process.exitCode; it does NOT stop the script. So
        // execution continued with a NaN ceiling and the report printed
        // `"ok": true` next to exit code 1 — a gate whose output contradicts
        // its own exit status. Throw, exactly like the sibling check below.
        throw new Error('TALOS_INITIAL_CSS_BUDGET_INVALID: --max-initial-css-bytes must be a positive integer')
    }
    if (!Number.isSafeInteger(maximum) || maximum <= 0) {
        throw new Error('TALOS_BUILD_ARGUMENT_INVALID: --max-initial-bytes')
    }
    const manifestPath = resolve(dist, '.vite', 'manifest.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        throw new Error('TALOS_BUILD_MANIFEST_INVALID: root')
    }

    const entries = Object.entries(manifest).filter(([, value]) =>
        manifestRow(value, 'entry').isEntry === true,
    )
    if (entries.length !== 1) {
        throw new Error(`TALOS_BUILD_ENTRY_INVALID: expected 1, received ${entries.length}`)
    }
    const [entryKey] = entries[0]
    const staticClosure = new Set()
    const visit = (key) => {
        if (staticClosure.has(key)) return
        const row = manifestRow(manifest[key], key)
        staticClosure.add(key)
        const imports = row.imports ?? []
        if (!Array.isArray(imports) || imports.some((value) => typeof value !== 'string')) {
            throw new Error(`TALOS_BUILD_MANIFEST_INVALID: imports for ${key}`)
        }
        for (const imported of imports) visit(imported)
    }
    visit(entryKey)

    const reachableClosure = new Set()
    const visitReachable = (key) => {
        if (reachableClosure.has(key)) return
        const row = manifestRow(manifest[key], key)
        reachableClosure.add(key)
        const next = [...(row.imports ?? []), ...(row.dynamicImports ?? [])]
        if (next.some((value) => typeof value !== 'string')) {
            throw new Error(`TALOS_BUILD_MANIFEST_INVALID: reachability for ${key}`)
        }
        for (const imported of next) visitReachable(imported)
    }
    visitReachable(entryKey)

    let boundaryFailure = false
    const dynamicEntries = []
    for (const boundary of DYNAMIC_BOUNDARIES) {
        const matchingKeys = Object.keys(manifest).filter((key) =>
            matchesBoundary(manifest, key, boundary.suffix),
        )
        if (matchingKeys.length !== 1) {
            fail(boundary.code, `${boundary.suffix} expected 1 manifest entry, received ${matchingKeys.length}`)
            boundaryFailure = true
            continue
        }
        const key = matchingKeys[0]
        const row = manifestRow(manifest[key], key)
        const dynamicallyReachable = reachableClosure.has(key) && !staticClosure.has(key)
        if (row.isDynamicEntry !== true || staticClosure.has(key) || !dynamicallyReachable) {
            fail(boundary.code, `${key} must be a reachable dynamic entry outside the initial graph`)
            boundaryFailure = true
            continue
        }
        dynamicEntries.push({ suffix: boundary.suffix, key })
    }

    if (!boundaryFailure) {
        let initialBytes = 0
        let initialCssBytes = 0
        let initialGzipBytes = 0
        let initialCssGzipBytes = 0
        const seenCss = new Set()
        for (const key of staticClosure) {
            const row = manifestRow(manifest[key], key)
            if (typeof row.file !== 'string') throw new Error(`TALOS_BUILD_MANIFEST_INVALID: file for ${key}`)
            if (row.file.endsWith('.js')) {
                const contents = readFileSync(resolve(dist, row.file))
                initialBytes += contents.length
                initialGzipBytes += gzipSync(contents).length
            }
            // Defect #3: the CSS a chunk pulls in is render-blocking on first
            // paint. Budgeting only JS measured half the cost.
            for (const sheet of Array.isArray(row.css) ? row.css : []) {
                if (typeof sheet !== 'string' || seenCss.has(sheet)) continue
                seenCss.add(sheet)
                const contents = readFileSync(resolve(dist, sheet))
                initialCssBytes += contents.length
                initialCssGzipBytes += gzipSync(contents).length
            }
        }
        // SF: an `if/else if` meant a JS overrun hid the CSS verdict AND the
        // whole report. Both budgets are judged, then reported.
        let exceeded = false
        if (initialBytes > maximum) {
            fail(
                'TALOS_INITIAL_CHUNK_BUDGET_EXCEEDED',
                `${initialBytes} bytes exceeds ${maximum} bytes`,
            )
            exceeded = true
        }
        if (initialCssBytes > maximumCss) {
            // The old message said only that a number was too big, which sent
            // the last reader on half an hour of digging to find out WHAT was
            // too big. It costs nothing to say where to look, so it says it.
            fail(
                'TALOS_INITIAL_CSS_BUDGET_EXCEEDED',
                `${initialCssBytes} CSS bytes exceeds ${maximumCss} bytes `
                + `(${initialCssGzipBytes} gzipped). Before raising the ceiling, look inside: `
                + 'almost all of it is `@layer utilities`, so the question is whether the new '
                + 'weight is utilities the app really uses or something imported whole. '
                + 'Open the initial sheet in dist/assets and measure the top-level blocks.',
            )
            exceeded = true
        }
        if (!exceeded) {
            process.stdout.write(`${JSON.stringify({
                ok: true,
                initial_javascript_bytes: initialBytes,
                maximum_initial_javascript_bytes: maximum,
                initial_css_bytes: initialCssBytes,
                maximum_initial_css_bytes: maximumCss,
                initial_javascript_gzip_bytes: initialGzipBytes,
                initial_css_gzip_bytes: initialCssGzipBytes,
                // Per NOME, non per posizione.
                //
                // Prima erano indici scritti a mano — `dynamicEntries[16]` — e
                // bastava aggiungere un confine in mezzo alla lista perche' ogni
                // etichetta dopo quel punto finisse sul valore sbagliato. E'
                // successo il 2026-08-04 aggiungendo il drawer dell'enhancer: il
                // rapporto ha continuato a dire `"ok": true` mentre chiamava il
                // pannello media «icona del lanciatore». Un rapporto che sbaglia
                // i nomi e' peggio di uno che tace, perche' lo si legge per
                // orientarsi.
                // La chiave e' il PERCORSO, non il codice d'errore: quattro
                // stazioni condividono `TALOS_ROUTE_NOT_LAZY` e due cataloghi
                // condividono il loro, quindi una mappa per codice ne
                // perderebbe quattro per strada senza dirlo. 24 confini devono
                // comparire come 24 righe.
                dynamic_entries: Object.fromEntries(
                    dynamicEntries.map(({ suffix, key }) => [suffix, key]),
                ),
            })}\n`)
        }
    }
} catch (error) {
    fail('TALOS_INITIAL_CHUNK_CONTRACT_FAILED', error instanceof Error ? error.message : String(error))
}
