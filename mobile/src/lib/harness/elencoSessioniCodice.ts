/**
 * ⛔ PEZZO VERO (metodo «plug and play», owner 29/10 sera): la logica dell'elenco delle sessioni del Codice nella grammatica delle Chat.
 * Destinazione nell'app: `src/lib/harness/elencoSessioniCodice.ts` (SCHEDA-DI-CONSEGNA.md, voce 1). Pura, senza Vue: la usano il mockup e,
 * dopo il sì, `HarnessScreen.vue`. Le prove (`elencoSessioniCodice.test.ts`) vanno in `tests/unit/harness/` così come sono.
 *
 * Le schede sono gli STATI VERI del Codice (owner 29/10 sera, consiglio del Desktop accettato), nell'ordine e con la precedenza di
 * `statusBadge()` di `HarnessScreen.vue:292-305`: chi aspetta te viene prima di tutto; una sessione r4 interrotta da un riavvio è
 * «interrotta» anche se non è conclusa; poi in corso, interrotta, da riprendere (ultimo turno in errore: mai «fallita», owner 23/10),
 * conclusa.
 */
import type { TalosHarnessSessionStatus } from '@/lib/harness/harnessUiSessionStatus'

export const SCHEDE_CODICE = ['tutte', 'in-corso', 'aspettano-te', 'concluse', 'da-riprendere', 'interrotte'] as const
export type SchedaCodice = typeof SCHEDE_CODICE[number]
export type StatoDellaSessione = Exclude<SchedaCodice, 'tutte'>

/** Le chiavi dei testi (italiano e inglese) di ogni scheda: le prime tre ci sono già, le altre sono nuove e approvate il 29/10 sera. */
export const CHIAVI_SCHEDE: Record<SchedaCodice, string> = {
    'tutte': 'chats.filter.all',
    'in-corso': 'chats.filter.running',
    'aspettano-te': 'harness.filter.waitingForYou',
    'concluse': 'chats.filter.finished',
    'da-riprendere': 'harness.filter.toResume',
    'interrotte': 'harness.filter.interrupted',
}

/** Lo stato di una sessione, uguale a `statusBadge()` (senza il ramo «idle», che qui è «conclusa»). */
export function statoDellaSessione(stato: TalosHarnessSessionStatus | null | undefined, r4: boolean): StatoDellaSessione {
    if (stato?.inAttesaApprovazione) return 'aspettano-te'
    if (r4 && stato?.interrotta) return 'interrotte'
    if (stato && !stato.conclusa) return 'in-corso'
    if (stato?.interrotta) return 'interrotte'
    if (stato?.ultimoEsito === 'errore') return 'da-riprendere'
    return 'concluse'
}

/** Dove sta una sessione: sul dispositivo («qui») o su un PC (il suo `pcId`). Il filtro «Dove» vive nel foglio «Opzioni». */
export type Dove = 'tutte' | 'qui' | string

export interface RigaPerElenco {
    readonly id: string
    readonly title: string
    readonly pcId?: string | null
    readonly progetto?: string | null
}

export interface FiltroElenco { readonly scheda: SchedaCodice; readonly testo: string; readonly dove: Dove }

const piega = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

function nelPosto(riga: RigaPerElenco, dove: Dove): boolean {
    if (dove === 'tutte') return true
    if (dove === 'qui') return !riga.pcId
    return riga.pcId === dove
}

/** Cerca nel titolo e nella cartella, senza badare a maiuscole e accenti (come la ricerca delle Chat). Più parole: tutte devono esserci. */
export function corrisponde(riga: RigaPerElenco, testo: string): boolean {
    const parole = piega(testo).split(/\s+/u).filter(Boolean)
    if (!parole.length) return true
    const dove = piega(`${riga.title} ${riga.progetto ?? ''}`)
    return parole.every((p) => dove.includes(p))
}

/**
 * I numeri sulle schede. Contano le righe del posto scelto nel foglio «Opzioni» («Dove»), NON la ricerca: mentre si scrive «Tutte 40»
 * resta, e si accorcia solo l'elenco sotto (owner 29/10 notte, come le Chat: `ChatsScreen.vue:175-181` conta il foglio, non la ricerca).
 * `statoDi` dà lo stato di una riga (in `HarnessScreen` è `statoServer` + `suR4`).
 */
export function contaSchede<T extends RigaPerElenco>(righe: readonly T[], filtro: Pick<FiltroElenco, 'dove'>, statoDi: (r: T) => StatoDellaSessione): Record<SchedaCodice, number> {
    const conti = Object.fromEntries(SCHEDE_CODICE.map((s) => [s, 0])) as Record<SchedaCodice, number>
    for (const r of righe) {
        if (!nelPosto(r, filtro.dove)) continue
        conti.tutte += 1
        conti[statoDi(r)] += 1
    }
    return conti
}

/** Le righe da mostrare, nell'ordine in cui arrivano (le fasce del giorno le fa chi mostra). */
export function filtraSessioni<T extends RigaPerElenco>(righe: readonly T[], filtro: FiltroElenco, statoDi: (r: T) => StatoDellaSessione): T[] {
    return righe.filter((r) => nelPosto(r, filtro.dove) && corrisponde(r, filtro.testo) && (filtro.scheda === 'tutte' || statoDi(r) === filtro.scheda))
}

/** Le voci del filtro «Dove» per il foglio «Opzioni», coi numeri: Tutte, Qui, poi un PC per riga (nome dal chiamante). */
export function vociDove<T extends RigaPerElenco>(righe: readonly T[], nomeDelPc: (pcId: string) => string, testi: { tutte: string; qui: string }) {
    const pc = [...new Set(righe.map((r) => r.pcId).filter((x): x is string => Boolean(x)))]
    return [
        { value: 'tutte', label: testi.tutte, count: righe.length },
        { value: 'qui', label: testi.qui, count: righe.filter((r) => !r.pcId).length },
        ...pc.map((id) => ({ value: id, label: nomeDelPc(id), count: righe.filter((r) => r.pcId === id).length })),
    ]
}
