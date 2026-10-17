/**
 * ⛔ K3 piano (ledger `LEDGER-K3-PIANO-2026-10-17.md`; owner 17/10 «Nel piede del compositore»): la pillola del permesso e le righe
 * del foglio «Quanto può fare TALOS qui», come il desktop r4 @ 701c6c0d2. Trascrizione di `components/chat-foot.js`:
 *   · `LIVELLO_DELLA_POLITICA` (:102), `CONCESSI_DAL_LIVELLO` (:108, copia di `CONCESSI_DA_SOLO` del server), `GRUPPI_SENZA_CHIEDERE`
 *     (:87), `attrezzoPassaSenzaChiedere` (:116), `riassuntoSenzaChiedere` (:134), `tonoPermesso` (:271);
 *   · le quattro scelte del foglio dal template (`index.template.html:1504`, `#veloPermessi`): ordine, rischio, descrizione,
 *     «Consigliato» su «Scrive nel progetto».
 * Il nome della politica è `etichettaPermessoR4` (`approvazioniR4.ts`): una mappa sola, come la vista unica del desktop.
 */
import { etichettaPermessoR4, testoApprovazioneR4 } from './approvazioniR4'
import { testoPianoR4 } from './pianoR4'

export const LIVELLO_DELLA_POLITICA_R4: Readonly<Record<string, string>> = Object.freeze({
    'Read only': 'lettura', 'Workspace write': 'scrittura-progetto', 'On request': 'su-richiesta', 'Full access': 'accesso-pieno', Research: 'ricerca',
})
const TUTTI = 'tutti'
export const CONCESSI_DAL_LIVELLO_R4: Readonly<Record<string, typeof TUTTI | ReadonlySet<string>>> = Object.freeze({
    'accesso-pieno': TUTTI,
    'scrittura-progetto': TUTTI,
    'scrittura-area': Object.freeze(new Set(['scrivi', 'file_edit'])),
    ricerca: Object.freeze(new Set(['research_deposit'])),
})
export const GRUPPI_SENZA_CHIEDERE_R4: readonly { chiave: string; attrezzi: readonly string[] }[] = Object.freeze([
    Object.freeze({ chiave: 'files', attrezzi: Object.freeze(['scrivi', 'file_edit']) }),
    Object.freeze({ chiave: 'commands', attrezzi: Object.freeze(['shell', 'prova']) }),
    Object.freeze({ chiave: 'documents', attrezzi: Object.freeze(['document_create', 'generate_image']) }),
])

/** Se `attrezzo` passa senza chiedere, con questo livello e questa scelta per attrezzo. */
export function attrezzoPassaSenzaChiedereR4(livello: string | undefined, scelta: unknown, attrezzo: string): boolean {
    if (scelta === 'sempre') return true
    if (scelta === 'chiedi' || scelta === 'nega') return false
    const concessi = Object.hasOwn(CONCESSI_DAL_LIVELLO_R4, livello ?? '') ? CONCESSI_DAL_LIVELLO_R4[livello as string] : null
    return concessi === TUTTI || Boolean(concessi && typeof concessi !== 'string' && concessi.has(attrezzo))
}

export interface RiassuntoPermessoR4 {
    testo: string
    suggerimento: string
    gruppi: string[]
    parziali: string[]
    spenti: string[]
}

/**
 * Il testo della pillola e il suo suggerimento: ciò che passa senza chiedere (C1 del desktop, come Cline). In Piano il cancello nega
 * tutto tranne leggere ed elencare, prima di ogni permesso: «Piano: solo lettura», e il suggerimento nomina il permesso che torna.
 */
export function riassuntoSenzaChiedereR4(permesso: unknown, permessiPerAttrezzo: unknown, { modalitaOperativa = 'normale' }: { modalitaOperativa?: string } = {}, lingua = 'it'): RiassuntoPermessoR4 {
    const t = (k: string, v?: Record<string, unknown>) => testoApprovazioneR4(k, lingua, v)
    const etichetta = (p: unknown) => etichettaPermessoR4(p, lingua)
    const livello = typeof permesso === 'string' && Object.hasOwn(LIVELLO_DELLA_POLITICA_R4, permesso) ? LIVELLO_DELLA_POLITICA_R4[permesso] : undefined
    const scelte = (permessiPerAttrezzo && typeof permessiPerAttrezzo === 'object' ? permessiPerAttrezzo : {}) as Record<string, unknown>
    if (modalitaOperativa === 'piano') {
        return {
            testo: t('chat.foot.permission.planReadOnly'),
            suggerimento: [t('chat.foot.permission.policyLine', { politica: etichetta(permesso) }), t('chat.foot.permission.planPaused'), t('chat.foot.permission.change')].join('\n'),
            gruppi: [], parziali: [], spenti: [],
        }
    }
    const passa = (a: string) => attrezzoPassaSenzaChiedereR4(livello, scelte[a], a)
    const nome = (g: { chiave: string; attrezzi: readonly string[] }) => {
        const base = t(`chat.foot.permission.group.${g.chiave}`)
        if (g.attrezzi.every(passa) || !g.attrezzi.some(passa)) return base
        return t('chat.foot.permission.groupPart', { gruppo: base, parte: g.attrezzi.filter(passa).map((a) => t(`chat.foot.permission.part.${a}`)).join(', ') })
    }
    const gruppi = livello ? GRUPPI_SENZA_CHIEDERE_R4.filter((g) => g.attrezzi.some(passa)) : []
    const parziali = gruppi.filter((g) => !g.attrezzi.every(passa))
    const spenti = GRUPPI_SENZA_CHIEDERE_R4.filter((g) => g.attrezzi.every((a) => scelte[a] === 'nega'))
    const tuttoPassa = GRUPPI_SENZA_CHIEDERE_R4.every((g) => g.attrezzi.every(passa))
    let testo: string
    if (!livello) testo = etichetta(permesso) // un valore che non conosciamo: il suo nome, non un'invenzione
    else if (gruppi.length === 0) testo = livello === 'lettura' || livello === 'ricerca' ? etichetta(permesso) : t('chat.foot.permission.asksEverything')
    else if (tuttoPassa && livello === 'accesso-pieno') testo = t('chat.foot.permission.withoutAskingAll')
    else testo = t('chat.foot.permission.withoutAsking', { cosa: gruppi.map(nome).join(', ') })
    // ciò che chiede comunque, anche con un `sempre` (la trifecta solo con un `sempre`, mai con Accesso pieno)
    const conUnSempre = GRUPPI_SENZA_CHIEDERE_R4.some((g) => g.attrezzi.some((a) => scelte[a] === 'sempre'))
    const chiedeSempre = [
        ...(livello === 'scrittura-progetto' ? ['outside'] : []),
        ...(livello === 'scrittura-progetto' || livello === 'accesso-pieno' || conUnSempre ? ['secrets', 'suspicious'] : []),
        ...(conUnSempre && livello !== 'accesso-pieno' ? ['trifecta'] : []),
    ]
    const righe = [t('chat.foot.permission.policyLine', { politica: etichetta(permesso) })]
    if (chiedeSempre.length && gruppi.length) righe.push(t('chat.foot.permission.alwaysAsks', { cosa: chiedeSempre.map((c) => t(`chat.foot.permission.always.${c}`)).join(', ') }))
    if (spenti.length) righe.push(t('chat.foot.permission.turnedOff', { cosa: spenti.map(nome).join(', ') }))
    righe.push(t('chat.foot.permission.change'))
    return { testo, suggerimento: righe.join('\n'), gruppi: gruppi.map((g) => g.chiave), parziali: parziali.map((g) => g.chiave), spenti: spenti.map((g) => g.chiave) }
}

/** Il colore del rischio della pillola (decisione B11 del desktop). */
export function tonoPermessoR4(permesso: unknown): 'danger' | 'warning' | null {
    if (permesso === 'Full access') return 'danger'
    if (permesso === 'Workspace write') return 'warning'
    return null
}

export interface LivelloPermessoR4 {
    valore: 'Read only' | 'Workspace write' | 'On request' | 'Full access'
    titolo: string
    rischio: string
    tono: 'success' | 'warning' | 'danger'
    descrizione: string
    consigliato: boolean
}
const LIVELLI: readonly { valore: LivelloPermessoR4['valore']; titolo: string; rischio: string; tono: LivelloPermessoR4['tono']; descrizione: string }[] = [
    { valore: 'Read only', titolo: 'readOnly', rischio: 'lowRisk', tono: 'success', descrizione: 'readsTheProjectAnd' },
    { valore: 'Workspace write', titolo: 'writesToTheProject', rischio: 'mediumRisk', tono: 'warning', descrizione: 'writesOnItsOwn' },
    { valore: 'On request', titolo: 'asksFirst', rischio: 'mediumRisk', tono: 'warning', descrizione: 'asksYouToConfirm' },
    { valore: 'Full access', titolo: 'fullAccess', rischio: 'veryHighRisk', tono: 'danger', descrizione: 'filesAndNetworkWithout' },
]
/** Le quattro scelte del foglio, nell'ordine e coi testi del desktop. */
export function livelliPermessoR4(lingua: string): LivelloPermessoR4[] {
    const t = (k: string) => testoPianoR4(`modello.permissions.${k}`, lingua)
    return LIVELLI.map((l) => ({ valore: l.valore, titolo: t(l.titolo), rischio: t(l.rischio), tono: l.tono, descrizione: t(l.descrizione), consigliato: l.valore === 'Workspace write' }))
}
export const LIVELLI_PERMESSO_R4 = LIVELLI.map((l) => ({ valore: l.valore, consigliato: l.valore === 'Workspace write' }))
