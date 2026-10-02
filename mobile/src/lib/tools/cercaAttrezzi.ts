import MiniSearch from 'minisearch'
import { z } from 'zod'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'
import { talosTracciaFuori } from '@/lib/device/traccia'

/**
 * ⭐⭐ IL «CERCA ATTREZZI» DEI MODELLI LOCALI — punto 4, owner 01/10/2026.
 *
 * ## Il numero che lo impone
 *
 * Al modello locale arrivava un indice di 65 righe: ~2.008 token di istruzione e indice più ~456 di schemi sempre
 * visibili, cioè l'**88%** dei 2.805 token del prompt di Qwen3-4B. Sul Pad, quando il prefisso non si riusa, sono
 * 19 s di sola lettura sulla GPU; e con un tokenizzatore più largo (Spark-X2.5-4B, foto dell'owner del 01/10) il
 * prompt sfonda il tetto del dispositivo prima che la persona scriva.
 *
 * ## La forma, scelta dall'owner («Pochi + cerca», «Parole + mappa»)
 *
 * Pochi attrezzi sempre in vista, e al posto dell'indice uno solo che cerca: il modello scrive in inglese cosa gli
 * serve e riceve i 5 più adatti con lo schema. È la forma di Hermes (`tools/tool_search.py`: core in vista, il resto
 * dietro un ponte), di Gallery (`AgentTools.kt:80`: 4 attrezzi fissi e un elenco di nomi) e della ricerca di Anthropic
 * (`defer_loading`, variante BM25). Scegliere fra ~70 azioni sul telefono con BM25 basta (arXiv 2609.18672,
 * 16/09/2026: 162/164 richieste letterali, parafrasi a 0,825 fra i primi 7).
 *
 * ⛔ Nessun attrezzo sparisce: chi non è fra i pochi resta raggiungibile, e chiamarlo per nome resta valido
 * (`talosToolDelCatalogoEseguibile`, SALTO-DIRETTO-PUNITO-01).
 *
 * ## Perché MiniSearch e non il nostro BM25-lite
 *
 * `librarySearchText.ts:52` non pesa la rarità delle parole (IDF) e non tollera errori di battitura: «the», «list» e
 * «create» stanno in decine di descrizioni, e un modello piccolo scrive «batery». MiniSearch 7.2.0 (MIT, zero
 * dipendenze, decisione dell'owner 01/10) fa BM25 vero, prefissi e ricerca approssimata.
 */
export const TALOS_CERCA_ATTREZZI = 'tool_search'

/** Quanti attrezzi trova una ricerca: i 3-5 della documentazione Anthropic, il tetto alto. */
export const TALOS_CERCA_MASSIMO = 5

/**
 * ⛔ CA-11 (Pad, 01/10 sera, Spark-X2.5-4B): cinque schemi interi, fra cui attrezzi da 5-7 KB, hanno portato il prompt a
 * 10.714 token contro un tetto di 4.608. Owner: «3 schemi e tetto di peso». Gli schemi interi sono al massimo
 * {@link TALOS_CERCA_SCHEMI_MASSIMI} entro {@link TALOS_CERCA_MAX_CARATTERI}; il primo passa sempre (senza schema non si
 * chiama), gli altri trovati sono nominati e si cercano per nome — come Hermes degrada l'elenco a soli nomi.
 */
export const TALOS_CERCA_SCHEMI_MASSIMI = 3
export const TALOS_CERCA_MAX_CARATTERI = 3_000

/**
 * La famiglia di un attrezzo, dal suo nome. Serve alla mappa (una riga che orienta la domanda del modello) e come
 * campo di ricerca. Le notifiche stanno sotto `device_` ma per chi parla sono un'altra cosa: vengono prima.
 */
const FAMIGLIE: ReadonlyArray<readonly [RegExp, string]> = [
    [/^time_/, 'time'],
    [/^notes_/, 'notes'],
    [/^tasks_/, 'tasks'],
    [/^calendar_/, 'calendar'],
    [/^memory_/, 'memory'],
    [/^(library_|invia_file$)/, 'library'],
    [/^research_/, 'research'],
    [/^web_/, 'web'],
    [/^device_notification/, 'notifications'],
    [/^device_/, 'phone'],
    [/^app_/, 'apps'],
    [/^document_/, 'documents'],
    [/^generate_image$/, 'images'],
    [/^local_model/, 'models'],
    [/^tool_create$/, 'tools'],
]

export function talosFamigliaDi(nome: string): string {
    for (const [forma, famiglia] of FAMIGLIE) if (forma.test(nome)) return famiglia
    return 'other'
}

/** La mappa delle famiglie offerte, in una riga, nell'ordine fisso qui sopra (le sconosciute in fondo). */
export function talosMappaFamiglie(tools: ReadonlyArray<TalosToolDefinition<never>>): string {
    const presenti = new Set(tools.map((tool) => talosFamigliaDi(tool.name)))
    const ordine = [...FAMIGLIE.map(([, famiglia]) => famiglia), 'other']
    const famiglie = [...new Set(ordine)].filter((famiglia) => presenti.has(famiglia))
    return `Tool families: ${famiglie.join(', ')}.`
}

/**
 * Parole che non scelgono niente: stanno in quasi ogni descrizione o in quasi ogni domanda. L'IDF le abbassa già;
 * toglierle evita che una domanda di sole parole vuote («can you do it») restituisca cinque attrezzi a caso.
 */
const VUOTE = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'do', 'does', 'for', 'from', 'i', 'in', 'is', 'it',
    'me', 'my', 'of', 'on', 'or', 'please', 'the', 'this', 'to', 'tool', 'tools', 'use', 'what', 'with', 'you',
    // CA-12 (02/10): i modelli piccoli cercano anche in italiano.
    'il', 'lo', 'la', 'le', 'gli', 'un', 'uno', 'una', 'di', 'da', 'del', 'della', 'delle', 'nel', 'nella', 'nelle',
    'sul', 'sulla', 'che', 'mi', 'mio', 'mia', 'miei', 'mie', 'e', 'per', 'con', 'su', 'cosa', 'ho', 'sono',
])

/**
 * La radice di una parola: le prime {@link RADICE} lettere. Non è uno stemmer vero, ed è voluto: unisce le forme della
 * stessa parola («ricordati»/«ricorda»/«ricordare», «appuntamenti»/«appuntamento») e spesso le due lingue
 * («notifiche»/«notifications», «batteria»/«battery») senza portare un dizionario per lingua nel telefono. Le
 * collisioni costano poco: si sceglie fra ~70 attrezzi, non fra un milione di documenti.
 */
const RADICE = 6

function parole(testo: string): string[] {
    return testo.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
}

function termine(parola: string): string | null {
    const minuscola = parola.toLowerCase()
    return VUOTE.has(minuscola) ? null : minuscola.slice(0, RADICE)
}

/**
 * CA-13 (Pad, 02/10, Qwen3-4B): «find pdf on taxes in library» non trovava library_search, che si descrive con
 * «search». Nella DOMANDA i verbi del cercare — e il chiedere se una cosa esiste («check if there is…», «esiste…») —
 * valgono anche come «search»/«cerca»: pochi, chiusi, e nient'altro. ⛔ «check» da solo NO: «check battery level»
 * finiva su una ricerca invece che su device_status (provato e tolto, guardia in CA-09).
 */
const CERCARE: Readonly<Record<string, readonly string[]>> = {
    find: ['search'], look: ['search'], locate: ['search'], there: ['search'], exists: ['search'], exist: ['search'],
    trova: ['cerca'], trovi: ['cerca'], trovare: ['cerca'], cercare: ['cerca'], esiste: ['cerca'], esistono: ['cerca'],
}

function termineDellaDomanda(parola: string): string | string[] | null {
    const base = termine(parola)
    if (base === null) return null
    const sinonimi = CERCARE[parola.toLowerCase()]
    return sinonimi ? [base, ...sinonimi] : base
}

/** Titolo e descrizione nella lingua della persona (le stesse della scheda di permesso), per nome dell'attrezzo. */
export type TalosEtichetteAttrezzo = (nome: string) => string

function indiceDi(tools: ReadonlyArray<TalosToolDefinition<never>>, etichette?: TalosEtichetteAttrezzo): MiniSearch {
    const indice = new MiniSearch({
        fields: ['name', 'family', 'label', 'description'],
        tokenize: parole,
        processTerm: termine,
    })
    /*
     * CA-13 (Pad, 02/10): «Get the id from library_list or library_search first» nella descrizione di library_delete
     * faceva contare «search» per l'attrezzo che cancella. I nomi degli ALTRI attrezzi citati in una descrizione sono
     * rimandi, non ciò che l'attrezzo fa: nell'indice non contano.
     */
    const altriNomi = new RegExp(`\\b(?:${tools.map((tool) => tool.name).join('|')})\\b`, 'g')
    indice.addAll(tools.map((tool) => ({
        id: tool.name,
        name: tool.name.replace(/_/g, ' '),
        family: talosFamigliaDi(tool.name),
        label: etichette?.(tool.name) ?? '',
        description: tool.description.replace(altriNomi, ' '),
    })))
    return indice
}

/**
 * I nomi degli attrezzi più adatti alla domanda, al massimo {@link TALOS_CERCA_MASSIMO}.
 *
 * Il nome pesa tre volte e la famiglia due: «torch» nel nome di `device_torch` dice di più di «torch» citato nella
 * descrizione di un altro. Prefisso dalle 4 lettere («note» → «notes»). Tolleranza agli errori sulla radice: una
 * modifica dalle 5 lettere, due sulla radice piena di {@link RADICE} («batery» → «batter» di «battery»: due modifiche).
 */
export function talosCercaNelCatalogo(
    tools: ReadonlyArray<TalosToolDefinition<never>>,
    domanda: string,
    massimo: number = TALOS_CERCA_MASSIMO,
    etichette?: TalosEtichetteAttrezzo,
): string[] {
    if (!tools.length || !domanda.trim()) return []
    // CA-13 (Pad, 02/10): a parità di parole, chi LEGGE passa davanti a chi cambia o cancella — su una domanda
    // ambigua («check if there is a PDF…») library_delete non deve mai venire prima di library_search.
    const legge = new Set(tools.filter((tool) => tool.action === 'read').map((tool) => tool.name))
    return indiceDi(tools, etichette).search(domanda, {
        boost: { name: 3, family: 2, label: 2 },
        boostDocument: (id) => (legge.has(String(id)) ? 1.3 : 1),
        processTerm: termineDellaDomanda,
        prefix: (parola) => parola.length >= 4,
        fuzzy: (parola) => (parola.length >= RADICE ? 2 : parola.length >= 5 ? 1 : false),
        // Le corrispondenze approssimate pesano poco: servono a salvare un errore di battitura, non a scegliere.
        weights: { fuzzy: 0.15, prefix: 0.375 },
    }).slice(0, massimo).map((risultato) => String(risultato.id))
}

/**
 * L'attrezzo che il modello vede al posto dell'indice.
 *
 * ⛔ Restituisce SCHEMI, e lo dice in fondo: è la lezione di SCHEMA-SCAMBIATO-PER-RISULTATO-01
 * (`catalogoCompatto.ts`, Qwen3-1.7B sul Pad il 2026-08-19: letto lo schema, ha inventato la posizione invece di
 * chiamare l'attrezzo). Le righe stanno dopo lo schema perché sono l'ultima cosa che legge prima di decidere.
 *
 * ⛔ Nessun risultato non è un errore: si consegna l'elenco dei soli nomi (il ripiego di Hermes quando l'elenco non
 * ci sta), così il giro non si perde e il modello può riprovare con un nome vero.
 */
export function talosStrumentoCercaAttrezzi(
    tools: ReadonlyArray<TalosToolDefinition<never>>,
    schemaDi: (tool: TalosToolDefinition<never>) => unknown | Promise<unknown>,
    svela: (nomi: readonly string[]) => void,
    etichette?: TalosEtichetteAttrezzo,
): TalosToolDefinition<{ query: string }> {
    const perNome = new Map(tools.map((tool) => [tool.name, tool]))
    return defineTalosTool<{ query: string }>({
        name: TALOS_CERCA_ATTREZZI,
        title: 'Find a tool',
        description: 'Find the tools you need on this device. Write in English what you want to do, for example '
            + '"turn on the torch" or "save a note" (the language of the user works too). You get back up to five matching tools with their input '
            + 'schemas, and they become callable. ' + talosMappaFamiglie(tools),
        action: 'read',
        input: z.object({
            query: z.string().min(1).max(200)
                .describe('What you want to do, in English, in a few words.'),
        }),
        async run(input) {
            const nomi = talosCercaNelCatalogo(tools, input.query, TALOS_CERCA_MASSIMO, etichette)
            // Diagnosi (02/10): la domanda che il modello ha fatto e cosa ha avuto. Il banco ne aveva bisogno per
            // capire un ordinamento sbagliato; nel registro accanto a «giro tool», mai mostrata a schermo.
            talosTracciaFuori(`tool_search: «${input.query}» → ${nomi.join(', ') || '∅'}`)
            if (nomi.length === 0) {
                return {
                    ok: true,
                    content: `No tool matched "${input.query}". These are all the tools on this device: `
                        + `${tools.map((tool) => tool.name).join(', ')}. `
                        + `Call ${TALOS_CERCA_ATTREZZI} again with the name of the one you need.`,
                }
            }
            const schemi: unknown[] = []
            const consegnati: string[] = []
            let peso = 0
            for (const nome of nomi) {
                if (consegnati.length >= TALOS_CERCA_SCHEMI_MASSIMI) break
                const schema = await schemaDi(perNome.get(nome)!)
                const byte = JSON.stringify(schema).length
                if (consegnati.length > 0 && peso + byte > TALOS_CERCA_MAX_CARATTERI) continue
                schemi.push(schema)
                consegnati.push(nome)
                peso += byte
            }
            svela(consegnati)
            const altri = nomi.filter((nome) => !consegnati.includes(nome))
            const ancora = altri.length ? `\n\nAlso matching, ask for them by name: ${altri.join(', ')}.` : ''
            const ORDINE = [
                'These are SCHEMAS ONLY. Nothing has been executed and you have no results yet.',
                'Your next message must be the call to the tool that fits — not an answer.',
                'Do not state any fact these tools would provide until you have called them:',
                'a made-up value is worse than saying you do not know.',
            ].join(' ')
            return {
                ok: true,
                content: JSON.stringify(schemi) + ancora + `\n\n${ORDINE}`,
            }
        },
    })
}
