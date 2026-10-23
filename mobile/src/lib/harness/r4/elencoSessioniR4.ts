/**
 * ⛔ Owner 18/10 «non riesco andare alla lista delle sessioni … esattamente come sulla chat Legacy» (ledger
 * `LEDGER-ELENCO-SESSIONI-R4-2026-10-18.md`): la pagina elenco del Codice (`HarnessScreen.vue`) mostra le sessioni di r4 quando l'APK
 * lo porta. Qui le voci di `GET /api/v1/sessions` diventano le righe di quella pagina, nella forma che il Codice classico già usava
 * (`id`, `title`, `updated_at`, stato `TalosHarnessSessionStatus`): la pagina resta la stessa.
 * Solo le sessioni principali, come la barra del desktop (`!padreId && !(profonditaDelega > 0)`, harness-ui `app.js`); ogni attesa
 * di una persona (approvazione, domanda, piano, richiesta MCP, figlia in attesa) è un'attesa, come `statoSessione()` del desktop.
 */
import type { TalosHarnessSessionStatus } from '@/lib/harness/harnessUiSessionStatus'
import { suUnaRigaR4 } from '@/lib/harness/r4/agentiR4'
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'
import erroriSessioni from '@/lib/harness/r4/testi/errori-sessioni-r4.json'

export interface TalosRigaSessioneR4 {
    id: string; title: string; updated_at: string; stato: TalosHarnessSessionStatus
    /** R-M4 Q2: il NOME della cartella della sessione (`progetto` di r4, mai un percorso), per proporre la stessa a una sessione nuova. */
    progetto?: string
}

type ClienteElencoR4 = Pick<TalosR4ClientePonte, 'richiesta'>

const ATTESE = ['inAttesaApprovazione', 'inAttesaDomanda', 'inAttesaPiano', 'inAttesaRichiestaMcp', 'inAttesaDiscendente'] as const

export function righeElencoSessioniR4(voci: unknown[]): TalosRigaSessioneR4[] {
    const righe: TalosRigaSessioneR4[] = []
    for (const v of voci) {
        if (!v || typeof v !== 'object') continue
        const s = v as Record<string, unknown>
        if (typeof s.sessionId !== 'string' || !s.sessionId) continue
        if (s.padreId || Number(s.profonditaDelega) > 0) continue
        const quando = typeof s.ultimaRispostaAlle === 'string' && s.ultimaRispostaAlle ? s.ultimaRispostaAlle
            : typeof s.avviataAlle === 'string' ? s.avviataAlle : ''
        righe.push({
            id: s.sessionId,
            title: suUnaRigaR4(s.nome) || suUnaRigaR4(s.taskDelega),
            updated_at: quando,
            stato: {
                conclusa: s.conclusa === true,
                interrotta: s.interrotta === true,
                ultimoMessaggio: null,
                inAttesaApprovazione: ATTESE.some((campo) => s[campo] === true),
                ultimoEsito: s.ultimoEsito === 'errore' || s.ultimoEsito === 'successo' ? s.ultimoEsito : null,
            },
            ...(typeof s.progetto === 'string' && s.progetto ? { progetto: s.progetto } : {}),
        })
    }
    return righe.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

/** Un rifiuto di r4 col suo codice e il suo motivo (`{ error: { code, message, reason } }`), per dirne il perché (`fraseRifiutoSessioneR4`). */
export class RifiutoSessioneR4 extends Error {
    readonly code: string
    readonly reason: string
    constructor(message: string, code: string, reason: string) {
        super(message)
        this.name = 'RifiutoSessioneR4'
        this.code = code
        this.reason = reason
    }
}

function rifiuto(stato: number, corpo: string): Error {
    try {
        const errore = (JSON.parse(corpo) as { error?: { code?: unknown; message?: unknown; reason?: unknown } }).error
        const code = typeof errore?.code === 'string' ? errore.code : ''
        const testo = typeof errore?.message === 'string' && errore.message ? errore.message : code
        if (testo) return new RifiutoSessioneR4(testo, code, typeof errore?.reason === 'string' ? errore.reason : '')
    } catch { /* corpo non JSON: resta lo stato */ }
    return new Error(`HTTP ${stato}`)
}

const italiano = (lingua: string) => /^it(?:-|$)/iu.test(lingua)
const propria = (tabella: Record<string, string>, chiave: string) => (Object.hasOwn(tabella, chiave) ? tabella[chiave] : undefined)

/**
 * ⛔ ELENCO-R4-08 (review avversariale, 18/10): il perché di un rifiuto nella lingua dell'app. La busta di r4 porta un `message`
 * generico (misurato sul Pad: «Invalid query», «Resource not found»), quindi conta il MOTIVO: prima la frase del desktop per
 * `<CODICE>.<motivo>`, poi quella del codice (`errori.js` @ 701c6c0d2, `testi/errori-sessioni-r4.json`). '' se r4 non ne ha una.
 */
export function fraseRifiutoSessioneR4(errore: unknown, lingua: string): string {
    if (!(errore instanceof RifiutoSessioneR4) || !errore.code) return ''
    const tabella = italiano(lingua) ? erroriSessioni.it as Record<string, string> : erroriSessioni.en as Record<string, string>
    const delMotivo = errore.reason ? propria(tabella, `${errore.code}.${errore.reason.replace(/-/g, '_')}`) : undefined
    return delMotivo ?? propria(tabella, `${errore.code}.message`) ?? ''
}

async function chiedi(cliente: ClienteElencoR4, opzioni: Parameters<ClienteElencoR4['richiesta']>[0]): Promise<string> {
    const risposta = await cliente.richiesta(opzioni)
    if (risposta.stato < 200 || risposta.stato >= 300) throw rifiuto(risposta.stato, risposta.corpo)
    return risposta.corpo
}

/** Il rifiuto del client nativo quando la porta di r4 non risponde (`TalosR4ClientePlugin.kt`: è il messaggio, non il codice). */
function nonInAscolto(guasto: unknown): boolean {
    return guasto instanceof Error && guasto.message === 'TALOS_R4_IRRAGGIUNGIBILE'
}

/**
 * ⛔ ELENCO-R4-07 (Pad, 18/10): per il nativo r4 è «acceso» appena il processo vive (`TalosR4Avvio.acceso`), prima che la porta
 * ascolti: ad app appena aperta la prima lettura falliva. Si riprova solo quel rifiuto, ogni mezzo secondo per al più ~20 s
 * (`tentativi`); un rifiuto di r4 (stato HTTP) arriva subito.
 */
export async function leggiSessioniR4(cliente: ClienteElencoR4, {
    dorme = (ms: number) => new Promise<void>((fatto) => { setTimeout(fatto, ms) }),
    tentativi = 40,
}: { dorme?: (ms: number) => Promise<void>; tentativi?: number } = {}): Promise<TalosRigaSessioneR4[]> {
    for (let tentativo = 1; ; tentativo += 1) {
        let corpo: string
        try {
            corpo = await chiedi(cliente, { metodo: 'GET', percorso: '/api/v1/sessions' })
        } catch (guasto) {
            if (!nonInAscolto(guasto) || tentativo >= tentativi) throw guasto
            await dorme(500)
            continue
        }
        const items = (JSON.parse(corpo) as { data?: { items?: unknown } }).data?.items
        return righeElencoSessioniR4(Array.isArray(items) ? items : [])
    }
}

/** `POST /api/v1/sessions/:id/rename {nome}` (r4 taglia gli spazi e accetta 1-80 caratteri). */
export async function rinominaSessioneR4(cliente: ClienteElencoR4, id: string, nome: string): Promise<void> {
    await chiedi(cliente, { metodo: 'POST', percorso: `/api/v1/sessions/${encodeURIComponent(id)}/rename`, corpo: JSON.stringify({ nome }) })
}

/** `POST /api/v1/sessions/:id/delete`; r4 rifiuta con `WORKFLOW_RUN_NOT_FINISHED` se un Workflow della sessione è ancora in corso. */
export async function eliminaSessioneR4(cliente: ClienteElencoR4, id: string): Promise<void> {
    await chiedi(cliente, { metodo: 'POST', percorso: `/api/v1/sessions/${encodeURIComponent(id)}/delete`, corpo: '{}' })
}
