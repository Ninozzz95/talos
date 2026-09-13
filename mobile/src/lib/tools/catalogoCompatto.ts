import { z } from 'zod'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'
import { TALOS_ATTREZZI_SEMPRE_IN_VISTA } from '@/lib/tools/aperturaProgressiva'

/**
 * ⭐⭐ IL CATALOGO COMPATTO: tutti i tool nominati, gli schemi a richiesta.
 *
 * ## Il numero che ha deciso questa forma
 *
 * MISURATO il 2026-08-09, con ogni sorgente presente:
 *
 * | | byte | ~token |
 * |---|---|---|
 * | i 61 schemi interi | 38.386 | 10.375 |
 * | l'indice qui sotto |  5.087 |  1.375 |
 *
 * **L'87% in meno**, e nessuno dei 61 strumenti sparisce: restano tutti
 * nominati, e chi ne vuole la forma esatta la chiede.
 *
 * ## Perché non è un'ottimizzazione, ma il vincolo
 *
 * Gemma 2 2B IT ha una finestra di **8.192 token**: i soli schemi la sfondano
 * del 26%, prima del prompt di sistema e prima che la persona scriva. Con
 * l'indice ci si sta con quattro quinti liberi.
 *
 * E c'è la seconda metà, misurata prima di questa: la generazione è legata alla
 * banda, e il contesto la strangola —
 *
 *     512 token → 19-37 tok/s · 2.048 → 18,7 · 8.414 → **1,9**
 *
 * ⇒ Due giri piccoli battono un giro enorme di circa dieci volte. L'obiezione
 * ovvia («un giro in più costa») è, sui numeri di questo telefono, rovesciata.
 *
 * ## ⛔ E la parità resta intatta
 *
 * Owner: «i locali devono avere le stesse possibilità dei key». Parità vuol
 * dire che il modello **può chiamare** ogni strumento, non che deve averne lo
 * schema sotto gli occhi a ogni turno. L'indice li nomina tutti; nessuna
 * capacità sparisce.
 *
 * ## ⛔ Il rischio, dichiarato prima di costruirci sopra
 *
 * Chiede al modello una disciplina in due passi — chiedi la forma, poi chiama.
 * Su quel tipo di disciplina il 1.7B si è già dimostrato inaffidabile: il
 * 2026-08-09 ha richiesto **cinque volte** la stessa identica chiamata. Se non
 * regge, questa strada muore qui e si sceglie una finestra più grande sapendo
 * perché — che è il motivo per cui questo file nasce come sonda e non come
 * architettura.
 */

/**
 * ⛔⛔ CIO' CHE E' STATO SVELATO RESTA SVELATO, per tutta la conversazione.
 *
 * ## Il difetto, misurato sul Pad il 2026-08-09
 *
 * Prima versione: l'insieme degli strumenti svelati nasceva e moriva **dentro
 * un singolo invio**. Conseguenza: a ogni messaggio il modello ripartiva da
 * zero e doveva rifare i due passi anche per uno strumento che aveva appena
 * usato.
 *
 * Con Qwen3-1.7B: «accendi la torcia» → due passi corretti, scheda di
 * consenso, torcia accesa DAVVERO (registro della fotocamera, 06:30:44).
 * Subito dopo, «spegni la torcia» → **nessuna scheda**, **nessun evento**, e
 * la risposta «La torcia è stata spegna». Il modello vedeva nella
 * conversazione uno strumento che aveva appena chiamato e che ora non gli era
 * piu' offerto: invece di richiederne la forma, ha raccontato l'azione.
 *
 * ⇒ La tassa dei due passi ad ogni messaggio non e' solo lenta: e' un invito a
 * saltare il passo. E un modello che salta il passo **afferma il falso**, che
 * e' il difetto peggiore del catalogo.
 *
 * ## Perche' per conversazione e non per sempre
 *
 * Perche' e' la stessa vita della catena e del piano: quello che il modello ha
 * imparato in questo discorso serve in questo discorso. Un deposito globale
 * porterebbe schemi di strumenti che in un'altra chat potrebbero non essere
 * nemmeno offerti — i permessi cambiano, gli interruttori cambiano — e
 * offrire cio' che non c'e' piu' e' esattamente il difetto opposto.
 */
const SVELATI = new Map<string, Set<string>>()

/**
 * ⛔⛔ QUANTE CONVERSAZIONI SI RICORDANO — e perché un tetto ci vuole.
 *
 * MISURATO il 2026-09-10: `SVELATI` non rilasciava **mai**. Una chiave per
 * ogni `sessionId` che è passato di qui, e nessuna che uscisse: non è solo
 * memoria che cresce per tutta la vita del processo, è memoria che cresce **su
 * una chat cancellata**, perché `talosDimenticaSvelati` lo chiama solo chi
 * cancella davvero — e nessuno lo fa quando l'app si limita a cambiare chat.
 *
 * ⇒ Il tetto è una **finestra sulle conversazioni recenti**, non un limite di
 * funzione: l'ordine di una `Map` in JavaScript è quello di inserimento (è
 * nella specifica, non un dettaglio di implementazione), quindi rileggere una
 * chiave e reinserirla la porta in fondo, e chi cade fuori è la conversazione
 * toccata **meno di recente**.
 *
 * ⛔ Cosa costa cadere fuori, detto per intero: una chat vecchissima ripresa
 * dopo altre 32 ripaga **un giro di `tool_details`** per il primo strumento
 * che rivuole. Non perde nessuna capacità e non dice il falso — è esattamente
 * lo stato di una chat nuova, che è lo stato normale del catalogo. Il difetto
 * del 2026-08-09 («la torcia è stata spegna») nasceva dal dimenticare **dentro
 * la stessa conversazione**, cioè fra un messaggio e il successivo: qui la
 * conversazione attiva è sempre l'ultima toccata, e non cade mai.
 *
 * Fonte, letta il 2026-09-10: la `Map` itera in ordine di inserimento
 * (developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map),
 * ed è il pattern LRU standard — si cancella e si reinserisce per «rinfrescare».
 */
const TALOS_SVELATI_MAX_CONVERSAZIONI = 32

/** Gli strumenti gia' svelati in questa conversazione. Vivo, non copiato. */
export function talosSvelatiIn(sessione: string | null): Set<string> {
    const chiave = sessione ?? '(nessuna)'
    const esistente = SVELATI.get(chiave)
    if (esistente) {
        // Rinfresca: questa conversazione torna in fondo, cioè lontana dallo sfratto.
        SVELATI.delete(chiave)
        SVELATI.set(chiave, esistente)
        return esistente
    }
    const nuovo = new Set<string>()
    SVELATI.set(chiave, nuovo)
    /*
     * ⛔ `while`, non `if`: se un giorno il tetto scendesse, un solo sfratto
     * lascerebbe la mappa sopra il tetto per sempre senza che nessuno protesti.
     */
    while (SVELATI.size > TALOS_SVELATI_MAX_CONVERSAZIONI) {
        const piuVecchia = SVELATI.keys().next()
        if (piuVecchia.done) break
        SVELATI.delete(piuVecchia.value)
    }
    return nuovo
}

/** Per i test, e per quando una conversazione viene cancellata. */
export function talosDimenticaSvelati(sessione: string | null): void {
    SVELATI.delete(sessione ?? '(nessuna)')
}

/**
 * ⛔⛔ IL GAP TROVATO IL 24/8: `aperturaProgressiva.ts` (il ramo Anthropic)
 * ha `TALOS_ATTREZZI_SEMPRE_IN_VISTA` — quattro nomi che non pagano MAI il
 * giro `tool_details`, perché "rispondono, non agiscono". Questo catalogo
 * non aveva un equivalente: `svelati` parte sempre vuoto per ogni
 * conversazione nuova (vedi sopra), quindi anche «che ore sono» pagava un
 * giro intero sul primo messaggio di ogni chat.
 *
 * ⛔ Riusa la STESSA lista, non una copia: stesso registro
 * (`readTools.ts`: `time_now`/`memory_search`/`library_search` vivono in
 * `all = createTalosReadTools(sources)`, sempre presenti quando abilitati,
 * indipendenti dal provider — verificato), e la stessa ragione vale
 * identica per il locale. Due liste separate sullo stesso concetto
 * sarebbero due verità che un giorno divergono — la lezione già scritta
 * sopra per `talosIndiceCompatto` sulla descrizione, qui per l'elenco.
 *
 * ⛔ Filtra su ciò che è REALMENTE offerto in QUESTO turno: `web_search`
 * sparisce dall'elenco offerto quando nessun motore è configurato
 * (`toolset.ts`, WEB-SENZA-MOTORE-01) — un nome assente non fa danno se
 * pre-svelato, ma è rumore inutile, e il filtro lo tiene fuori.
 */
export function talosPreVelatiSempreVisibili(
    tools: ReadonlyArray<TalosToolDefinition<never>>,
): readonly string[] {
    const offerti = new Set(tools.map((tool) => tool.name))
    return TALOS_ATTREZZI_SEMPRE_IN_VISTA.filter((nome) => offerti.has(nome))
}

/**
 * `talosSvelatiIn` più la seed dei sempre-in-vista, in una chiamata sola —
 * il chiamante (`chatController.ts`) è nel grafo statico d'avvio (compito
 * #51: meno di cento byte di margine), quindi la logica vive TUTTA qui,
 * nel pezzo già caricato a richiesta, non nel controller.
 */
export function talosSvelatiInConSempreVisibili(
    sessione: string | null,
    tools: ReadonlyArray<TalosToolDefinition<never>>,
): Set<string> {
    const svelati = talosSvelatiIn(sessione)
    for (const nome of talosPreVelatiSempreVisibili(tools)) svelati.add(nome)
    return svelati
}

/** Il nome che il modello usa per chiedere la forma di uno strumento. */
export const TALOS_DETTAGLI_STRUMENTO = 'tool_details'

/**
 * The compact index is descriptive, not an execution grant. A model may name
 * every capability in the index, but the exact schema must have been requested
 * before that capability can cross the executor boundary. `tool_details` is the
 * one read-only exception because it is the operation that reveals schemas.
 */
/**
 * ⛔⛔⛔ SALTO-DIRETTO-PUNITO-01 — chiamava lo strumento GIUSTO, e lo buttavamo.
 *
 * MISURATO sul Pad il 2026-08-19, `gemma-3-4b-it-Q4_K_M`. In chat, come se
 * fosse la risposta:
 *
 * ```
 *   Ecco le coordinate del telefono:
 *   {"name":"device_location","arguments":{…}}
 * ```
 *
 * Nome vero, forma giusta, strumento esistente e già passato da
 * `toolset.offer` — cioè dai permessi e dagli interruttori della persona.
 * Rifiutato per un motivo solo: non era passato prima da `tool_details`.
 *
 * ⛔ Ma il catalogo a due passi è un RISPARMIO, non un cancello di sicurezza:
 * esiste per non mettere 61 schemi da 38.386 byte nel prompt di un modello
 * piccolo. Chi salta il primo passo e indovina il nome giusto sta facendo
 * meglio di quanto il protocollo si aspetti.
 *
 * ⇒ Chi è NEL CATALOGO è eseguibile, e chiamarlo lo svela. Il cancello vero
 * resta dov'era: i permessi a monte, la scheda di consenso, e lo schema dello
 * strumento che convalida gli argomenti.
 *
 * ⛔ Ciò che il cancello proteggeva DAVVERO continua a non passare: un nome
 * che non esiste — il marcatore di testo che Qwen scambiò per `memory_search`
 * — non è nel catalogo, quindi resta rifiutato.
 */
export function talosToolDelCatalogoEseguibile(
    nome: string,
    svelati: ReadonlySet<string>,
    nelCatalogo?: ReadonlySet<string>,
): boolean {
    return nome === TALOS_DETTAGLI_STRUMENTO
        || svelati.has(nome)
        || nelCatalogo?.has(nome) === true
}

/**
 * A turn that explicitly asks for text only must not receive a function list.
 *
 * This is deliberately not a generic intent classifier. It recognizes only a
 * closed user contract (an exact/direct answer, or an explicit request not to
 * use tools). An ordinary question remains false, as does an operational ask
 * that merely says to answer after the action.
 */
export function talosRichiestaDirettaSenzaTool(testo: string): boolean {
    const pulito = testo.trim()
    if (!pulito) return false
    if (/\b(?:senza\s+(?:usare\s+)?(?:alcun[oi]?\s+)?strument[io]|without\s+(?:using\s+)?(?:any\s+)?tools?)\b/i.test(pulito)) {
        return true
    }
    const compito = pulito.replace(/^(?:adesso|ora|now|then)\s+/i, '')
    if (/^(?:rispondi|ripeti)\s+esattamente\s+(?:con\s+)?/i.test(compito)) return true
    if (/^(?:answer|reply|respond|repeat)\s+exactly\s+(?:with\s+)?/i.test(compito)) return true
    if (/^(?:rispondi|ripeti)\s+solo\s+(?!(?:dopo|quando|se)\b)/i.test(compito)) return true
    return /^(?:answer|reply|respond|repeat)\s+only\s+(?!(?:after|when|if)\b)/i.test(compito)
}

/** Kept with the direct-turn gate so this text stays out of the boot chunk. */
export function talosIstruzioneRispostaDiretta(): string {
    return '\nNo tools this turn. Output only what the user requested. Do not add '
        + 'labels, quotes, explanations, or lead-ins.'
}

/**
 * Executes only closed text transformations whose answer is already present
 * in the conversation. Everything else remains model work.
 */
export function talosRispostaDirettaDeterministica(
    richiesta: string,
    rispostaPrecedente: string | null,
): string | null {
    const letterale = /^(?:rispondi|ripeti)\s+esattamente\s+con\s+(.+?)\s+e\s+basta[.!]?\s*$/i
        .exec(richiesta.trim())
    if (letterale?.[1]) return letterale[1]

    const ultimaIt = /^(?:(?:adesso|ora)\s+)?ripeti\s+solo\s+l(?:['’]\s*|\s+)ultima\s+parola\s+della\s+tua\s+risposta\s+precedente[.!]?\s*$/i
    const ultimaEn = /^(?:now\s+)?repeat\s+only\s+the\s+last\s+word\s+(?:of|from)\s+your\s+previous\s+(?:answer|response)[.!]?\s*$/i
    if ((!ultimaIt.test(richiesta.trim()) && !ultimaEn.test(richiesta.trim()))
        || !rispostaPrecedente) return null
    const parole = rispostaPrecedente.match(/[\p{L}\p{N}_-]+(?:['’][\p{L}\p{N}_-]+)*/gu)
    return parole?.[parole.length - 1] ?? null
}

export function talosTurnoDiretto(
    turni: ReadonlyArray<{ role: string, content: string }>,
): { senzaTool: boolean, istruzione: string, risposta: string | null } {
    const userIndex = turni.map((turno) => turno.role).lastIndexOf('user')
    const richiesta = turni[userIndex]?.content ?? ''
    const precedente = turni.slice(0, userIndex).reverse()
        .find((turno) => turno.role === 'assistant')?.content ?? null
    const senzaTool = talosRichiestaDirettaSenzaTool(richiesta)
    return {
        senzaTool,
        istruzione: senzaTool ? talosIstruzioneRispostaDiretta() : '',
        risposta: talosRispostaDirettaDeterministica(richiesta, precedente),
    }
}

/**
 * Una riga per strumento: nome e **prima frase** della descrizione.
 *
 * ⛔ La prima frase e non un riassunto nostro: la descrizione è già scritta per
 * il modello, e riscriverla qui creerebbe due verità sullo stesso strumento —
 * quella dell'indice e quella dello schema — che un giorno divergono.
 */
/**
 * ⛔⛔ LOCAL-CATALOGO-DISAMBIGUA-01 — perche non basta la prima frase.
 *
 * MISURATO sul Pad il 2026-08-19, Qwen3-1.7B: «fai una ricerca web sulle
 * novita di Android 16» non ha chiamato NESSUNO strumento, e la risposta era
 * inventata a memoria. L owner ha visto il caso gemello: chiede una ricerca
 * web e parte la Deep Research, che costa minuti e credito vero.
 *
 * La causa stava qui. `research_start` e `web_search` promettono la stessa
 * cosa nella loro PRIMA frase; la riga che li separa — «For a single fact or a
 * quick check, use web_search instead» — e la TERZA, e veniva tagliata. Un
 * modello che vede due nomi indistinguibili non sceglie: risponde a memoria.
 *
 * ⇒ Si tiene la prima frase, e in piu le frasi che DISAMBIGUANO:
 *   - quelle che nominano un ALTRO strumento offerto in questo turno;
 *   - quelle che dichiarano un COSTO o un limite (minuti, credito, secondi).
 *
 * Non e un allentamento del tetto: quasi tutti gli strumenti hanno una
 * descrizione di una frase sola e restano identici. Si allungano soltanto i
 * pochi che hanno un gemello con cui si possono confondere — cioe quelli che
 * senza questa riga costano una scelta sbagliata.
 */
const SEGNALE_DI_COSTO = /\b(MINUTES?|minuti|credit|credito|seconds?|secondi|costs?|costa|slow|lento)\b/i

/**
 * ⛔⛔⛔ IL SETACCIO DEL 2026-09-10 — nominare un altro strumento NON basta.
 *
 * ## Cosa ha trovato la misura (tokenizer ufficiale Gemma 3, codice vero)
 *
 * L'indice pesava **2.036 token su 68 righe**, mediana **23 token a riga**, e
 * **otto righe da sole ne pesavano 472**. Guardate una per una, le frasi in
 * eccesso erano di **due specie diverse**, e solo una delle due serve qui:
 *
 * | specie | esempio | quando serve al modello |
 * |---|---|---|
 * | **SCELTA** | «For a single fact, use `web_search` instead» | **leggendo l'indice**, prima di avere qualunque schema |
 * | **SEQUENZA** | «Call `tasks_list` first to get the task id» | **dopo** aver scelto, cioè quando lo schema è già arrivato |
 *
 * ⇒ Il vecchio filtro teneva **entrambe**, perché guardava una cosa sola: se
 * la frase conteneva il nome di un altro strumento. Ma una frase di SEQUENZA
 * nell'indice è pagata due volte e usata una: `talosToolsForLocalEngine`
 * spedisce la `description` **intera** (`registry.ts:541`), quindi quella riga
 * il modello la rilegge comunque dentro lo schema che `tool_details` gli
 * consegna — **prima** di poter chiamare lo strumento. Nell'indice non decide
 * niente.
 *
 * ⇒ Una frase in più entra solo se **fa scegliere**: nomina un altro strumento
 * *e* porta un marcatore di contrasto. Il costo resta com'era — «costa minuti
 * e credito vero» decide *se* chiamare, ed è una scelta anche quando non
 * nomina nessuno.
 *
 * ⛔ NON è un allentamento di LOCAL-CATALOGO-DISAMBIGUA-01: quella lezione
 * chiedeva le frasi che **distinguono due gemelli**, ed è esattamente ciò che
 * questo setaccio tiene. Restano tutte, e i test che le pretendono mordono.
 *
 * ## ⛔ E il tetto vecchio TAGLIAVA PROPRIO QUELLE FRASI
 *
 * `slice(0, 260)` era cieco alle parole: misurato lo stesso giorno, **cinque
 * righe su 68 finivano a metà di una parola** —
 *
 * ```
 *   research_list    → «…cannot say whether a researc»
 *   device_list_apps → «…(Telegram X is org.th»
 *   research_start   → «…use web_search instead: it answers in seconds»
 * ```
 *
 * Cioè la frase nata per curare LOCAL-CATALOGO-DISAMBIGUA-01 (`research_start`
 * → `web_search`) **arrivava mozza**, e nessuno se n'era accorto perché il
 * test chiedeva solo che il nome `web_search` comparisse. Un'istruzione
 * troncata è peggio di una assente: «so never decline» (`web_read`) restava lì
 * appesa senza il suo complemento.
 *
 * ⇒ Il taglio ora è **per frasi intere**, mai in mezzo a una parola, e il
 * tetto sale a {@link TALOS_INDICE_MAX_CARATTERI}: con il setaccio a fare il
 * lavoro vero, il tetto torna a essere ciò che doveva essere — una guardia
 * contro una descrizione impazzita, non un budget che decapita le frasi utili.
 *
 * ## Ricerca web fatta PRIMA di scrivere (2026-09-10)
 *
 * - platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool —
 *   «Write clear, descriptive tool names and descriptions», «Use keywords in
 *   descriptions that match how users describe tasks».
 * - apxml.com/courses/agentic-llm-memory-architectures — «Descriptions should
 *   be unambiguous but avoid excessive verbosity that consumes valuable
 *   context window space»: è esattamente il compromesso che questo setaccio
 *   sposta, e lo sposta togliendo ciò che NON disambigua.
 * - arXiv 2602.20426, «Learning to Rewrite Tool Descriptions for Reliable
 *   LLM-Agent Tool Use» — riscrivere la descrizione migliora la scelta. ⛔ Qui
 *   NON si riscrive: si SCEGLIE quale frase già scritta entra, perché due
 *   verità sullo stesso strumento un giorno divergono (la ragione sta sopra).
 */
const SEGNALE_DI_SCELTA = /\b(?:instead|rather than|prefers?|only for|only when|only to|do not use|don't use|never use)\b/i

/**
 * Il tetto per riga, in caratteri. ⛔ Si applica solo a **frasi intere**: la
 * prima frase entra sempre (misurata il 2026-09-10: la più lunga dei 69
 * strumenti è 166 caratteri, `device_status`), le altre entrano finché ci
 * stanno. Misurato dopo il setaccio: la riga più lunga è ~290 caratteri, cioè
 * il tetto **oggi non morde su nessuno** — è la guardia per lo strumento che
 * qualcuno aggiungerà domani con mezzo kilobyte di descrizione.
 */
export const TALOS_INDICE_MAX_CARATTERI = 400

/**
 * ⛔⛔⛔ I SEMPRE-IN-VISTA NON VANNO NELL'INDICE — erano scritti DUE VOLTE.
 *
 * MISURATO il 2026-09-10: `time_now`, `memory_search`, `library_search` e
 * `web_search` avevano una riga d'indice **e** lo schema intero fra le
 * `Available functions`, a ogni messaggio di ogni chat: **108 token buttati**,
 * per sempre.
 *
 * ⛔ Non è un taglio di informazione, ed è per questo che è sicuro: quei
 * quattro sono pre-svelati dal **primo** messaggio da
 * `talosSvelatiInConSempreVisibili`, quindi il modello ne ha già la
 * descrizione INTERA sotto gli occhi — che è più di quanto la riga dell'indice
 * gli dicesse.
 *
 * ⇒ E toglie anche una **bugia**: il cappello dell'indice dice «You do not
 * have their input schemas yet, so you cannot call them directly», che per
 * quei quattro era falso. Un modello piccolo che legge una regola smentita
 * dalla pagina stessa impara che le regole si possono ignorare.
 *
 * ⛔ L'omissione e la pre-svelatura devono restare **la stessa lista**, o si
 * apre un buco: un nome fuori dall'indice e non pre-svelato sparirebbe del
 * tutto. Per questo si chiama `talosPreVelatiSempreVisibili`, la funzione che
 * usa anche `talosSvelatiInConSempreVisibili`, e non una copia. Il test
 * «indice ∪ pre-svelati == offerti» è il cancello che tiene ferma l'unione.
 */
export function talosIndiceCompatto(
    tools: ReadonlyArray<TalosToolDefinition<never>>,
): string {
    /*
     * ⛔ I nomi restano quelli di TUTTI gli offerti, non solo di chi finisce
     * in elenco: un rimando a `web_search` vale anche — anzi, soprattutto —
     * quando `web_search` è fuori dall'indice perché il modello ne ha già lo
     * schema. Filtrare anche questi rimetterebbe due gemelli indistinguibili.
     */
    const nomi = tools.map((tool) => tool.name)
    const giaInVista = new Set(talosPreVelatiSempreVisibili(tools))
    return tools.filter((tool) => !giaInVista.has(tool.name)).map((tool) => {
        const frasi = tool.description.split(/(?<=\.)\s+/)
        const prima = frasi[0] ?? tool.description
        /*
         * Una frase entra se fa SCEGLIERE — nomina un altro strumento offerto
         * in questo turno e lo contrappone a questo — oppure se dice quanto
         * costa chiamarlo. Una frase che spiega COME usarlo, una volta scelto,
         * arriva già con lo schema: qui sarebbe pagata e non deciderebbe nulla.
         */
        const utili = frasi.slice(1).filter((frase) => (
            (SEGNALE_DI_SCELTA.test(frase)
                && nomi.some((nome) => nome !== tool.name && frase.includes(nome)))
            || SEGNALE_DI_COSTO.test(frase)
        ))
        /*
         * ⛔ Si aggiunge una frase INTERA o non la si aggiunge: mai mezza. Una
         * frase che non ci sta viene saltata e si prova la successiva, perché
         * la frase che distingue due gemelli può essere l'ultima dell'elenco.
         */
        let testo = prima
        for (const frase of utili) {
            if (testo.length + 1 + frase.length > TALOS_INDICE_MAX_CARATTERI) continue
            testo += ` ${frase}`
        }
        return `${tool.name}: ${testo}`
    }).join('\n')
}
/**
 * ⛔⛔ L'ISTRUZIONE CHE FA FARE IL PRIMO PASSO, e prima non lo faceva fare.
 *
 * MISURATO sul Pad il 2026-08-10 con Qwen3-1.7B.Q4_K_M appena installato:
 *
 * ```
 *   «Accendi la torcia»      → «There is no tool available to turn on the torch»
 *   «Che strumenti hai?»     → elenca device_notifications_list, device_torch, …
 *   logcat                   → tool: 2, grammatica: pigra
 * ```
 *
 * Le tre righe insieme dicono una cosa sola: **l'indice arriva e il modello lo
 * legge**, ma davanti a una richiesta non chiama `tool_details` — dichiara di
 * non avere lo strumento che ha appena saputo elencare. Con la chiave la stessa
 * frase accende la torcia; è la violazione di «locali e api allineati al 100%».
 *
 * ## Perché il testo di prima non bastava
 *
 * Diceva: «These tools exist. You do NOT have their input schemas yet: call
 * tool_details with the names you need, then call them». È **descrittivo**: dice
 * come stanno le cose e lascia al modello di dedurne la mossa. Un modello grande
 * la deduce; uno da 1,7 miliardi di parametri prende la strada più corta, che è
 * rispondere.
 *
 * ⇒ Tre cambi, tutti nella stessa direzione:
 *
 *  1. **imperativo**, non descrittivo: «FIRST call … THEN call …»;
 *  2. il **rifiuto è vietato per nome**: «never answer that a tool is not
 *     available when its name is in this list» — è esattamente la frase
 *     sbagliata che il modello produceva, e vietarla alla lettera costa 20
 *     token;
 *  3. ⛔ **NESSUN esempio in forma di JSON.** Ce l'avevo messo — «call
 *     tool_details with {"names": ["device_torch"]}» — ed è stato un difetto
 *     mio, misurato subito dopo sullo stesso telefono:
 *
 *     ```
 *       «Accendi la torcia» → «…the tool device_torch is available. Calling the
 *        tool to turn the torch on:» + un BLOCCO DI CODICE che ripete
 *        «tool_details with {"names": ["device_torch"]}, read the schema it
 *        returns, then call device_torch»
 *     ```
 *
 *     Cioè: ha smesso di rifiutare — il divieto funziona — e ha cominciato a
 *     **scrivere la chiamata a parole** invece di emetterla. Un modello piccolo
 *     imita ciò che gli sta davanti, e un esempio in forma di chiamata è una
 *     chiamata da copiare. Stessa forma del difetto in
 *     `chiamata-scritta-a-parole`.
 *
 *     ⇒ L'istruzione dice COSA fare, mai COME SI SCRIVE. La forma la conosce
 *     già il template del GGUF, ed è il solo posto dove deve stare.
 */
export function talosIstruzioneCatalogo(
    tools: ReadonlyArray<TalosToolDefinition<never>>,
): string {
    if (!tools.length) return ''
    const indice = talosIndiceCompatto(tools)
    /*
     * ⛔ Indice vuoto = ogni strumento offerto è già in vista con il suo schema
     * (succede quando restano solo i sempre-in-vista). Il cappello direbbe
     * «below» puntando al nulla, e insegnerebbe a chiamare `tool_details` per
     * strumenti che il modello può già chiamare: costa token e induce un giro
     * inutile. Si tace, e restano gli schemi — che bastano.
     */
    if (!indice) return ''
    /*
     * ⛔ L'esempio deve nominare uno strumento CHE STA NELL'ELENCO: dopo che i
     * sempre-in-vista ne sono usciti, `tools[0]` può essere uno di quelli, e
     * l'esempio direbbe di chiedere lo schema di uno strumento che il modello
     * ha già — cioè insegnerebbe con un caso sbagliato. Si prende il primo
     * nome dell'indice vero, non il primo degli offerti.
     */
    const esempio = indice.slice(0, indice.indexOf(':'))
    return [
        '',
        '',
        '# Tools available',
        '',
        'The tools listed below EXIST on this device and work. You do not have',
        'their input schemas yet, so you cannot call them directly.',
        'Do not call any tool for plain conversation, exact text, greetings, or',
        'explanations. Use a tool only when the user explicitly asks you to',
        'retrieve data, change something, or perform an action.',
        '',
        `To use any of them: FIRST call ${TALOS_DETTAGLI_STRUMENTO}, naming every`,
        'tool you intend to use in this message. THEN call those tools.',
        '',
        `So for ${esempio}: call ${TALOS_DETTAGLI_STRUMENTO} for it, read the`,
        `schema that comes back, then call ${esempio} itself.`,
        '',
        '⛔ Never reply that a tool "is not available", or that you "cannot do',
        'this", when the name is in the list below. That is always wrong: call',
        `${TALOS_DETTAGLI_STRUMENTO} for it instead.`,
        '',
        '⛔ Never write a tool call as text, in prose or in a code block. Make',
        'the call. Text that describes a call does nothing at all.',
        '',
        'Once a tool has returned, reply to the user in ONE short sentence, in',
        'the language they wrote in, saying what happened. Do not restate the',
        'call, do not show code, do not explain which tools you considered.',
        '',
        indice,
        '',
        '',
    ].join('\n')
}

/**
 * Lo strumento che svela la forma degli altri.
 *
 * ⛔ Legge e basta: non tocca niente, non esce dal telefono, non costa. Per
 * questo la sua azione è `read` e non richiede consenso — chiedere «posso
 * dirti com'è fatto un modulo?» sarebbe una domanda senza contenuto, e ogni
 * domanda senza contenuto insegna a rispondere di sì senza leggere.
 */
export function talosStrumentoDettagli(
    tools: ReadonlyArray<TalosToolDefinition<never>>,
    schemaDi: (tool: TalosToolDefinition<never>) => unknown | Promise<unknown>,
    svela: (nomi: readonly string[]) => void,
): TalosToolDefinition<{ names: string[] }> {
    const perNome = new Map(tools.map((tool) => [tool.name, tool]))
    return defineTalosTool<{ names: string[] }>({
        name: TALOS_DETTAGLI_STRUMENTO,
        title: 'Look up a tool',
        description: 'Get the exact input schema of one or more tools from the catalogue '
            + 'above, so you can call them. Ask for every tool you intend to use in this '
            + 'message, in one go. After this returns, those tools become callable.',
        action: 'read',
        input: z.object({
            names: z.array(z.string().max(64)).min(1).max(8)
                .describe('Tool names exactly as they appear in the catalogue.'),
        }),
        async run(input) {
            const trovati = input.names
                .map((nome) => perNome.get(nome))
                .filter((tool): tool is TalosToolDefinition<never> => tool !== undefined)
            /*
             * ⛔ Un nome sbagliato non e' un errore da far fallire: e' il caso
             * piu' probabile con un modello piccolo. Si dice QUALI non esistono
             * e si consegna comunque quelli buoni, cosi' il giro non si perde.
             */
            const mancanti = input.names.filter((nome) => !perNome.has(nome))
            if (trovati.length === 0) {
                return {
                    ok: false,
                    content: `No tool is called ${mancanti.join(', ')}. `
                        + 'Use a name exactly as written in the catalogue.',
                }
            }
            svela(trovati.map((tool) => tool.name))
            const avviso = mancanti.length
                ? `\n\nThese do not exist: ${mancanti.join(', ')}.`
                : ''
            /*
             * ⛔⛔⛔ SCHEMA-SCAMBIATO-PER-RISULTATO-01 — svelava, e poi INVENTAVA.
             *
             * MISURATO sul Pad il 2026-08-19, Qwen3-1.7B. Nel registro del motore
             * gli strumenti esposti passano da 1 a 2 fra i due giri — cioè
             * `tool_details` è stato chiamato DAVVERO e `device_location` era
             * chiamabile. Al secondo giro il modello ha scritto «La posizione del
             * telefono è: 41.8996° N, 12.4347° E» senza chiamarlo. Il Pad era a
             * Catania, e quel numero ha sei decimali dove il codice ne fa quattro.
             *
             * ⇒ Il primo salto lo fa. È DOPO il primo salto che crede di aver
             * finito: gli restituivamo `JSON.stringify([...schemi])` e basta — un
             * blob col nome dello strumento, la sua descrizione e i suoi campi.
             * Per un modello da 1,7 miliardi è indistinguibile da un esito: ha
             * letto qualcosa di pertinente e ha risposto.
             *
             * ⛔ Le righe stanno in FONDO, dopo lo schema, per la stessa ragione
             * della lingua in `localToolPromptProtocol.ts`: è l'ultima cosa che
             * legge prima di decidere. Se stessero prima, l'ultima cosa letta
             * tornerebbe a essere il blob che ha già scambiato per una risposta.
             */
            const nomi = trovati.map((tool) => tool.name)
            const ORDINE = [
                'These are SCHEMAS ONLY. Nothing has been executed and you have no results yet.',
                `Your next message must be the call to ${nomi.join(', ')} — not an answer.`,
                'Do not state any fact these tools would provide until you have called them:',
                'a made-up value is worse than saying you do not know.',
            ].join(' ')
            return {
                ok: true,
                content: JSON.stringify(await Promise.all(trovati.map(schemaDi)))
                    + avviso + `\n\n${ORDINE}`,
            }
        },
    })
}
