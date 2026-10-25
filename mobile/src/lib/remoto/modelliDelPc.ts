/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO, fetta R-M4c — Q1 (owner 20/10/2026 «Quelli del PC», dossier
 * `.claude/ricerche/2026-10-20-remoto-modello-e-cartella-10x4.md`): quando il telefono usa una sessione del PC, il selettore mostra i
 * modelli che il PC sa usare, mai i profili del telefono (le chiavi del telefono non vanno al PC, REM-02). Come Hermes, che offre solo
 * i fornitori con credenziali (`gateway/slash_commands_model.py:454-492`), e come il selettore del PC (`app.js:7872-7905` @ r4
 * `4fae991a6`): i fornitori, poi i modelli di ognuno.
 * Forme di r4 `2297237fd` (`operazioni.mjs`): `provider.models` ⇒ `{provider, modelli:[{id, nome|name, reasoning…}]}` con l'id GIÀ
 * nella forma di r4 (`fornitore:modello`); `local-models.list` ⇒ `{items:[{id, nome, modello:'local:<id>'}]}`; OpenRouter dal
 * catalogo del PC (`models.list`, id `vendor/modello`). Il piano ChatGPT del PC: un elenco solo se è collegato.
 */
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'
import type { TalosMobileModelProfileView, TalosMobileProviderId } from '@/components/chat/mobileChatTypes'

export interface ModelliDelPc {
    profili: TalosMobileModelProfileView[]
    /** Come `discoveryProblems` della chat: il selettore lo dice invece di restare vuoto. */
    problemi: Array<{ message: string, detail?: string | null }>
}

type Voce = Record<string, unknown>
const comeVoci = (x: unknown): Voce[] => (Array.isArray(x) ? x.filter((v): v is Voce => Boolean(v) && typeof v === 'object') : [])

/**
 * ⛔ D-REM-4 (Pad e telefono, 23/10/2026, PC 0.1.36): `GET /api/v1/providers/<id>/models` risponde 404 NOT_FOUND PER PROGETTO ai
 * fornitori senza catalogo nella UI (r4 `provider-registry.mjs:1896` `ID_CATALOGO_IN_UI`, `http-app.mjs:1832`: Ollama, i cui
 * modelli arrivano da `/api/v1/local-models`). Non è un guasto: quel fornitore non ha un catalogo, e si salta come Hermes salta
 * le righe senza modelli (`model_switch_providers.py:1369`, `:1398-1399`).
 */
const NESSUN_CATALOGO = Symbol('nessun-catalogo')

/**
 * UNA richiesta (il PC serve una richiesta alla volta): i dati, `NESSUN_CATALOGO` su un 404, o `null` per ogni altro guasto.
 * Il 404 conta solo per i cataloghi dei fornitori; chi legge altro passa da `comeDati`, per cui è un guasto come gli altri.
 */
async function leggi(ponte: Pick<TalosR4ClientePonte, 'richiesta'>, percorso: string): Promise<Voce | null | typeof NESSUN_CATALOGO> {
    try {
        const r = await ponte.richiesta({ metodo: 'GET', percorso })
        if (r.stato === 404) return NESSUN_CATALOGO
        if (r.stato < 200 || r.stato >= 300) return null
        const busta = JSON.parse(r.corpo) as { ok?: boolean, data?: unknown }
        return busta.ok && busta.data && typeof busta.data === 'object' ? busta.data as Voce : null
    } catch {
        return null
    }
}
const comeDati = (x: Voce | null | typeof NESSUN_CATALOGO): Voce | null => (x === NESSUN_CATALOGO ? null : x)

/**
 * I livelli che il PC inoltra al piano ChatGPT (r4 `chatgpt-rotte.mjs:174` `LIVELLI_INOLTRATI_DAL_PIANO`): per «none» e «minimal» non
 * manda niente e decide il modello, quindi il dispositivo non li offre, come la pillola del desktop.
 */
const LIVELLI_INOLTRATI_DAL_PIANO = ['low', 'medium', 'high', 'xhigh', 'max']

/**
 * I livelli del modello nel lessico del selettore: «none» è il nostro «off» (`ragionamentoR4`).
 * ⛔ D-REM-9 (dal Pad, 23/10/2026): il catalogo OpenRouter li dà in `reasoning.supportedEfforts` (r4 `model-catalog.mjs:49`), il
 * piano ChatGPT e i fornitori diretti in `livelliRagionamento` (r4 `chatgpt-rotte.mjs:58`, `provider-registry.mjs:340-387`): col
 * solo primo campo luna 6 dal dispositivo non aveva il selettore del ragionamento.
 */
function livelli(v: Voce, modello: string): string[] {
    const r = v.reasoning as { supportedEfforts?: unknown } | null | undefined
    // `supportedEfforts` solo se non è vuoto: r4 dà [] anche per un campo assente (`model-catalog.mjs:49`), e un [] non deve
    // nascondere i livelli veri di `livelliRagionamento` (revisione del Desktop, MDP-12)
    const dichiarati: unknown[] = Array.isArray(r?.supportedEfforts) && r.supportedEfforts.length > 0 ? r.supportedEfforts
        : Array.isArray(v.livelliRagionamento) ? v.livelliRagionamento : []
    const grezzi = dichiarati.filter((x): x is string => typeof x === 'string')
    const offerti = modello.startsWith('chatgpt:') ? grezzi.filter((x) => LIVELLI_INOLTRATI_DAL_PIANO.includes(x)) : grezzi
    return [...new Set(offerti.map((x) => (x === 'none' ? 'off' : x)))]
}

function profilo(v: Voce, fornitore: string, modello: string): TalosMobileModelProfileView {
    const nome = typeof v.nome === 'string' && v.nome ? v.nome : typeof v.name === 'string' && v.name ? v.name : modello
    const effort = livelli(v, modello)
    return {
        // `pc:` perché un id del PC non si confonda mai con un profilo del telefono (stesso foglio, stesse chiavi di Vue)
        id: `pc:${modello}`, provider: fornitore as TalosMobileProviderId, model: modello, display_name: nome, status: 'untested',
        has_secret: true, effort_levels: effort, supports_thinking: effort.length > 0, show_in_composer: true, capabilities: null, probe_ok: null,
    }
}

const modelloDi = (v: Voce): string | null => (typeof v.id === 'string' && v.id ? v.id : null)

export async function leggiModelliDelPc(ponte: Pick<TalosR4ClientePonte, 'richiesta'>, {
    nessunFornitore = 'No provider is connected on the computer: connect one on the PC.',
    modelliIlleggibili = 'The computer’s models couldn’t be read. Try again with Refresh.',
}: { nessunFornitore?: string, modelliIlleggibili?: string } = {}): Promise<ModelliDelPc> {
    const elenco = comeDati(await leggi(ponte, '/api/v1/providers'))
    const vociUsabili = comeVoci(elenco?.items).filter((f) => typeof f.id === 'string' && f.id !== 'esterno'
        && (f.keyConfigured === true || f.requiresKey === false))
    const usabili = vociUsabili.map((f) => f.id as string)

    // D-REM-4: quando il PC dirà se un fornitore ha un catalogo (`catalogo`, campo additivo promesso dal Desktop), si chiede
    // solo a quelli; finché il campo manca vale il 404 (`NESSUN_CATALOGO`), che funziona con ogni PC già spedito.
    const diretti = vociUsabili.filter((f) => f.id !== 'openrouter' && f.catalogo !== false).map((f) => f.id as string)
    const [perFornitore, catalogo, piano, locali] = await Promise.all([
        Promise.all(diretti.map(async (id): Promise<{ id: string, dati: Voce | null | typeof NESSUN_CATALOGO }> => ({
            id, dati: await leggi(ponte, `/api/v1/providers/${encodeURIComponent(id)}/models`),
        }))),
        usabili.includes('openrouter') ? leggi(ponte, '/api/v1/models').then(comeDati) : Promise.resolve(null),
        diretti.includes('chatgpt') ? Promise.resolve(null) : leggi(ponte, '/api/v1/providers/chatgpt/models').then(comeDati),
        leggi(ponte, '/api/v1/local-models').then(comeDati),
    ])

    const profili: TalosMobileModelProfileView[] = []
    const aggiungi = (v: Voce, fornitore: string, modello: string | null) => {
        if (modello && !profili.some((p) => p.model === modello)) profili.push(profilo(v, fornitore, modello))
    }
    const conModelli: Array<{ id: string, dati: Voce | null }> = [
        ...perFornitore.map((f) => ({ id: f.id, dati: comeDati(f.dati) })), ...(piano ? [{ id: 'chatgpt', dati: piano }] : []),
    ]
    for (const { id, dati } of conModelli) {
        for (const v of comeVoci(dati?.modelli)) aggiungi(v, id, modelloDi(v))
    }
    for (const v of comeVoci(catalogo?.modelli)) aggiungi(v, 'openrouter', modelloDi(v))
    // ⛔ non «local»: nel selettore «local» è il motore del TELEFONO e la seconda riga dice «Sul dispositivo»
    // (`TalosMobileComposerModelPicker.vue:179`). Questi girano sul PC: gruppo «computer», sotto l'id vero (`local:<id>`).
    for (const v of comeVoci(locali?.items)) aggiungi(v, 'computer', typeof v.modello === 'string' && v.modello ? v.modello : null)

    // ⛔ D-RM5-1 (dal Pad, 21/10/2026): «nessun fornitore» solo se davvero non ce n'è uno usabile; un elenco illeggibile o un
    // fornitore usabile che non risponde è un'altra cosa, e la frase lo dice (prima: «non c'è un fornitore» con LM Studio presente)
    const illeggibile = !elenco || perFornitore.some((f) => f.dati === null) || (usabili.includes('openrouter') && catalogo === null)
    return { profili, problemi: profili.length ? [] : [{ message: illeggibile ? modelliIlleggibili : nessunFornitore }] }
}
