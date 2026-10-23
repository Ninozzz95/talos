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

async function leggi(ponte: Pick<TalosR4ClientePonte, 'richiesta'>, percorso: string): Promise<Voce | null> {
    try {
        const r = await ponte.richiesta({ metodo: 'GET', percorso })
        if (r.stato < 200 || r.stato >= 300) return null
        const busta = JSON.parse(r.corpo) as { ok?: boolean, data?: unknown }
        return busta.ok && busta.data && typeof busta.data === 'object' ? busta.data as Voce : null
    } catch {
        return null
    }
}

/** I livelli del catalogo del PC (`reasoning.supportedEfforts`) nel lessico del selettore: «none» è il nostro «off» (`ragionamentoR4`). */
function livelli(v: Voce): string[] {
    const r = v.reasoning as { supportedEfforts?: unknown } | null | undefined
    const grezzi = Array.isArray(r?.supportedEfforts) ? r.supportedEfforts.filter((x): x is string => typeof x === 'string') : []
    return [...new Set(grezzi.map((x) => (x === 'none' ? 'off' : x)))]
}

function profilo(v: Voce, fornitore: string, modello: string): TalosMobileModelProfileView {
    const nome = typeof v.nome === 'string' && v.nome ? v.nome : typeof v.name === 'string' && v.name ? v.name : modello
    const effort = livelli(v)
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
    const elenco = await leggi(ponte, '/api/v1/providers')
    const usabili = comeVoci(elenco?.items).filter((f) => typeof f.id === 'string' && f.id !== 'esterno'
        && (f.keyConfigured === true || f.requiresKey === false)).map((f) => f.id as string)

    const diretti = usabili.filter((id) => id !== 'openrouter')
    const [perFornitore, catalogo, piano, locali] = await Promise.all([
        Promise.all(diretti.map(async (id) => ({ id, dati: await leggi(ponte, `/api/v1/providers/${encodeURIComponent(id)}/models`) }))),
        usabili.includes('openrouter') ? leggi(ponte, '/api/v1/models') : Promise.resolve(null),
        diretti.includes('chatgpt') ? Promise.resolve(null) : leggi(ponte, '/api/v1/providers/chatgpt/models'),
        leggi(ponte, '/api/v1/local-models'),
    ])

    const profili: TalosMobileModelProfileView[] = []
    const aggiungi = (v: Voce, fornitore: string, modello: string | null) => {
        if (modello && !profili.some((p) => p.model === modello)) profili.push(profilo(v, fornitore, modello))
    }
    for (const { id, dati } of [...perFornitore, ...(piano ? [{ id: 'chatgpt', dati: piano }] : [])]) {
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
