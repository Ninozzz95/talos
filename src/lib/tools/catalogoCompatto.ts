import { z } from 'zod'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'

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

/** Gli strumenti gia' svelati in questa conversazione. Vivo, non copiato. */
export function talosSvelatiIn(sessione: string | null): Set<string> {
    const chiave = sessione ?? '(nessuna)'
    const esistente = SVELATI.get(chiave)
    if (esistente) return esistente
    const nuovo = new Set<string>()
    SVELATI.set(chiave, nuovo)
    return nuovo
}

/** Per i test, e per quando una conversazione viene cancellata. */
export function talosDimenticaSvelati(sessione: string | null): void {
    SVELATI.delete(sessione ?? '(nessuna)')
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

export function talosIndiceCompatto(
    tools: ReadonlyArray<TalosToolDefinition<never>>,
): string {
    const nomi = tools.map((tool) => tool.name)
    return tools.map((tool) => {
        const frasi = tool.description.split(/(?<=\.)\s+/)
        const prima = frasi[0] ?? tool.description
        /*
         * Una frase entra se rimanda a un altro strumento OFFERTO in questo
         * turno — un rimando a qualcosa che il modello non ha davanti sarebbe
         * peggio del silenzio — oppure se dice quanto costa chiamarlo.
         */
        const utili = frasi.slice(1).filter((frase) => (
            nomi.some((nome) => nome !== tool.name && frase.includes(nome))
            || SEGNALE_DI_COSTO.test(frase)
        ))
        const testo = [prima, ...utili].join(' ')
        // Il tetto resta, ma su una riga che ora puo portare la distinzione.
        return `${tool.name}: ${testo.slice(0, 260)}`
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
        `So for ${tools[0]!.name}: call ${TALOS_DETTAGLI_STRUMENTO} for it, read the`,
        `schema that comes back, then call ${tools[0]!.name} itself.`,
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
        talosIndiceCompatto(tools),
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
