/**
 * Mockup remoto approvato dall'owner il 23/10 (tavola 1) e risposte del Desktop (3) del 24/10: ciò che il dispositivo ricorda di
 * un PC per mostrarlo quando il PC è spento. L'ultima volta che ha risposto («visto alle») e gli ultimi numeri delle sessioni, CON
 * l'ora della lettura (un numero vecchio senza data sembra vivo). Il PC non manda né l'uno né l'altro: si scrivono qui all'ultimo
 * contatto riuscito, per `pcId`, e non escono mai dal dispositivo.
 * Un archivio che non si legge (WebView senza memoria, testo guasto) vale «niente ricordato»: la schermata non si rompe per questo.
 */
import type { TalosRigaSessioneR4 } from '@/lib/harness/r4/elencoSessioniR4'

export interface ConteggiSessioni { totale: number, inCorso: number, aspettaTe: number }
export interface RicordoDelPc {
    vistoAlle: number | null
    sessioni: (ConteggiSessioni & { letteAlle: number }) | null
    /** `pc.programma` di `pair.ok` («TALOS desktop», o il valore della CLI): distingue il desktop dalla CLI sullo stesso PC. */
    programma: string | null
    /** `pc.effimero` di `pair.ok` (desktop f1199ace0): il PC girava col portachiavi di PROVA, la sua identità rinasce a ogni avvio. */
    effimero: boolean
}

const CHIAVE = 'talos.remoto.ricordi.v1'

const numero = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0

function leggiTutti(): Record<string, unknown> {
    try {
        const grezzo = JSON.parse(localStorage.getItem(CHIAVE) ?? '{}') as unknown
        return grezzo && typeof grezzo === 'object' && !Array.isArray(grezzo) ? grezzo as Record<string, unknown> : {}
    } catch {
        return {}
    }
}

function scriviTutti(tutti: Record<string, unknown>): void {
    try {
        localStorage.setItem(CHIAVE, JSON.stringify(tutti))
    } catch {
        // senza memoria il riquadro mostra solo lo stato di adesso
    }
}

export function leggiRicordo(pcId: string): RicordoDelPc {
    const voce = leggiTutti()[pcId] as { vistoAlle?: unknown, sessioni?: Record<string, unknown>, programma?: unknown, effimero?: unknown } | undefined
    const s = voce?.sessioni
    const sessioni = s && numero(s.totale) && numero(s.inCorso) && numero(s.aspettaTe) && numero(s.letteAlle)
        ? { totale: s.totale, inCorso: s.inCorso, aspettaTe: s.aspettaTe, letteAlle: s.letteAlle }
        : null
    const programma = typeof voce?.programma === 'string' && voce.programma.trim() ? voce.programma.trim().slice(0, 40) : null
    return { vistoAlle: numero(voce?.vistoAlle) ? voce.vistoAlle : null, sessioni, programma, effimero: voce?.effimero === true }
}

function aggiorna(pcId: string, cambia: (r: RicordoDelPc) => RicordoDelPc): void {
    const tutti = leggiTutti()
    tutti[pcId] = cambia(leggiRicordo(pcId))
    scriviTutti(tutti)
}

/** Il PC ha risposto adesso (un ping, un elenco). */
export function ricordaVisto(pcId: string, ora: number): void {
    aggiorna(pcId, (r) => ({ ...r, vistoAlle: ora }))
}

/** I numeri appena letti; un elenco letto è anche un contatto riuscito. */
export function ricordaSessioni(pcId: string, conteggi: ConteggiSessioni, ora: number): void {
    aggiorna(pcId, (r) => ({ ...r, vistoAlle: ora, sessioni: { ...conteggi, letteAlle: ora } }))
}

/**
 * Fetta C, Desktop (3) 24/10: il programma del PC arriva con `pair.ok` (`servizio.mjs:125`) ma il nativo non lo salva; lo ricorda il
 * dispositivo quando accoppia. Corto (40 caratteri) e solo testo: viene dal PC, si mostra e basta.
 */
export function ricordaProgramma(pcId: string, programma: string | null): void {
    const pulito = typeof programma === 'string' && programma.trim() ? programma.trim().slice(0, 40) : null
    aggiorna(pcId, (r) => ({ ...r, programma: pulito }))
}

/** Owner 24/10/2026 «Sì, adesso»: «di prova» si ricorda all'accoppiamento, come il programma; solo un `true` vero lo è. */
export function ricordaEffimero(pcId: string, effimero: boolean): void {
    aggiorna(pcId, (r) => ({ ...r, effimero: effimero === true }))
}

/** «Dimentica»: col PC se ne vanno anche i suoi ricordi, e la sua domanda dei doppi (revisione del blocco 4, S4). */
export function dimenticaRicordo(pcId: string): void {
    dimenticaDomandaDoppi(pcId)
    const tutti = leggiTutti()
    if (!(pcId in tutti)) return
    delete tutti[pcId]
    scriviTutti(tutti)
}

/**
 * Le stesse regole della lista del Codice (`statusBadge` in `HarnessScreen.vue`): un'attesa è «aspetta te» e non anche «in corso»;
 * un'interrotta non è in corso.
 */
export function conteggiDelleSessioni(righe: readonly TalosRigaSessioneR4[]): ConteggiSessioni {
    let inCorso = 0
    let aspettaTe = 0
    for (const { stato } of righe) {
        if (stato.inAttesaApprovazione) aspettaTe++
        else if (!stato.conclusa && !stato.interrotta) inCorso++
    }
    return { totale: righe.length, inCorso, aspettaTe }
}

/** Le prime 4 cifre di `pcId` in minuscolo: la regola che il PC userà in Dispositivi collegati (Desktop (3), 24/10). */
export const codiceBreve = (pcId: string): string => pcId.slice(0, 4).toLowerCase()

/** «UFFICIO · 31ab» solo se un altro PC dell'elenco ha lo stesso nome; altrimenti il nome e basta. */
export function nomeConCodice(
    pc: { pcId: string, nome: string | null },
    elenco: ReadonlyArray<{ pcId: string, nome: string | null }>,
    senzaNome: string,
): string {
    const nome = pc.nome || senzaNome
    const doppio = elenco.some((altro) => altro.pcId !== pc.pcId && (altro.nome || senzaNome) === nome)
    return doppio ? `${nome} · ${codiceBreve(pc.pcId)}` : nome
}

/**
 * «UFFICIO · 31ab» sempre: per ciò che resta dopo che l'elenco è cambiato (la notifica di «Dimentica», D-MOCK-8) e per i titoli che
 * nominano UN PC preciso (D-MOCK-9, D-MOCK-14), dove «quale» non deve dipendere da chi altro c'è adesso.
 */
export const nomeECodice = (pc: { pcId: string, nome: string | null }, senzaNome: string): string =>
    `${pc.nome || senzaNome} · ${codiceBreve(pc.pcId)}`

/**
 * Fetta C del mockup remoto, D-REM-2 (owner via Desktop (3), 24/10/2026: «Proponi di dimenticare»): le voci vecchie di un PC appena
 * accoppiato. Stesso nome e stesso ponte, `pcId` diverso, e spente adesso; stesso programma quando tutte e due lo sanno. Propone solo un
 * PC vero: uno «di prova» non propone niente (D-MOCK-13), e una voce di prova si propone solo spenta. Una voce che risponde non è mai «vecchia»: è un altro PC
 * col nome uguale (Happy `sync/machineChoices.ts:88-92` non unisce mai per nome: «merging them would start work in the wrong one»).
 */
export function vociVecchieDi<T extends { pcId: string, nome: string | null, relay: string | null }>(
    nuovo: { pcId: string, nome: string | null, relay: string | null },
    elenco: readonly T[],
    inLinea: (pcId: string) => boolean,
): T[] {
    // ⛔ D-MOCK-13, owner 24/10/2026 «No, solo un PC vero propone»: un PC «di prova» rinasce a ogni avvio, non decide che cosa è vecchio
    if (!nuovo.nome || leggiRicordo(nuovo.pcId).effimero) return []
    const programmaNuovo = leggiRicordo(nuovo.pcId).programma
    const vecchie = elenco.filter((v) => {
        if (v.pcId === nuovo.pcId || v.nome !== nuovo.nome || v.relay !== nuovo.relay || inLinea(v.pcId)) return false
        // revisione del blocco 3 (S3), owner 24/10 «Sì, anche il programma»: il desktop e la CLI sullo stesso PC sono due PC
        const programma = leggiRicordo(v.pcId).programma
        return !programmaNuovo || !programma || programma === programmaNuovo
    })
    // owner 24/10 «Sì, adesso»: le voci «di prova» per prime; `filter` + ordinamento stabile tiene le altre nel loro ordine
    return vecchie.sort((a, b) => Number(leggiRicordo(b.pcId).effimero) - Number(leggiRicordo(a.pcId).effimero))
}

const CHIAVE_DOPPI = 'talos.remoto.doppi.v1'

function domandeFatte(): string[] {
    try {
        const grezzo = JSON.parse(localStorage.getItem(CHIAVE_DOPPI) ?? '[]') as unknown
        return Array.isArray(grezzo) ? grezzo.filter((x): x is string => typeof x === 'string') : []
    } catch {
        return []
    }
}

/** La domanda si fa UNA volta per PC nuovo: dopo il sì o il no non torna. */
export const domandaDoppiGiaFatta = (pcId: string): boolean => domandeFatte().includes(pcId)

export function segnaDomandaDoppi(pcId: string): void {
    try {
        localStorage.setItem(CHIAVE_DOPPI, JSON.stringify([...new Set([...domandeFatte(), pcId])]))
    } catch {
        // senza memoria la domanda potrebbe tornare: meglio che dimenticare qualcosa senza chiedere
    }
}

/**
 * Revisione del blocco 4 (Desktop), S4: l'elenco cresceva di un `pcId` per accoppiamento (un PC «di prova» cambia identità a ogni
 * avvio) e «Dimentica» non lo puliva. Un PC dimenticato non ha più domande da ricordare.
 */
function dimenticaDomandaDoppi(pcId: string): void {
    const fatte = domandeFatte()
    if (!fatte.includes(pcId)) return
    try {
        localStorage.setItem(CHIAVE_DOPPI, JSON.stringify(fatte.filter((id) => id !== pcId)))
    } catch {
        // senza memoria resta un id in più, innocuo
    }
}
