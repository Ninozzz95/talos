/**
 * ⛔ K3-TERM T3 (ledger `LEDGER-K3-TERMINALE-2026-10-16.md`): le schede del Terminale di una sessione su r4 e il loro collegamento al
 * ponte nativo (`TalosR4Cliente.apriTerminale`, T2). Come il desktop (`legacy/app.js` `caricaSchedeTerminale`, `nuovaSchedaTerminale`,
 * `chiudiSchedaTerminale` @ `2161afb32`): l'id lo sceglie r4 (`POST /:id/terminals` con corpo vuoto), la chiusura chiude anche la
 * shell (`POST …/close`), e all'aggancio r4 rigioca il backlog — per questo `agganciato` azzera lo schermo prima dei dati.
 * Staccarsi (cambiare sessione, chiudere la schermata) NON chiude le shell: r4 le tiene per chi torna.
 */
import { ref } from 'vue'
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'
import { SCHEDE_MASSIME_R4, controlloTerminaleR4, vociTerminaliR4, type ControlloTerminaleR4, type VoceTerminaleR4 } from '@/lib/harness/r4/terminaleR4'

export type ClienteTerminaleR4 = Pick<TalosR4ClientePonte,
    'richiesta' | 'apriTerminale' | 'scriviTerminale' | 'ridimensionaTerminale' | 'chiudiTerminale' | 'addListener'>

export type StatoSchedaR4 = 'attesa' | 'connessione' | 'connesso' | 'terminato' | 'disconnesso'

export interface SchedaTerminaleR4 extends VoceTerminaleR4 {
    stato: StatoSchedaR4
    ripreso: boolean
    shell: string | null
    comando: string | null
    codiceUscita: number | null
    erroreAvvio: Extract<ControlloTerminaleR4, { tipo: 'errore' }> | null
}

export interface SchermoTerminaleR4 {
    scrivi(testo: string): void
    azzera(): void
}

/** `troppe` = al tetto di r4; altrimenti il codice dell'errore di r4 o del ponte. */
export type ErroreTerminaleR4 = 'troppe' | string

const idPonte = (terminalId: string) => `term-${terminalId}`

export function useTerminaleR4({ sessioneId, cliente }: { sessioneId: () => string | null; cliente: ClienteTerminaleR4 }) {
    const schede = ref<SchedaTerminaleR4[]>([])
    const attiva = ref<string | null>(null)
    const errore = ref<ErroreTerminaleR4 | null>(null)
    const schermi = new Map<string, SchermoTerminaleR4>()
    const collegate = new Set<string>()
    let ascolti: Array<{ remove(): Promise<void> }> | null = null

    const rotta = () => {
        const id = sessioneId()
        return id ? `/api/v1/sessions/${encodeURIComponent(id)}/terminals` : null
    }
    const scheda = (terminalId: string) => schede.value.find((s) => s.terminalId === terminalId)
    const daIdPonte = (id: unknown) => (typeof id === 'string' && id.startsWith('term-') ? id.slice(5) : null)

    function aggiorna(terminalId: string, cambi: Partial<SchedaTerminaleR4>) {
        schede.value = schede.value.map((s) => (s.terminalId === terminalId ? { ...s, ...cambi } : s))
    }

    async function ascolta() {
        if (ascolti) return
        ascolti = [
            await cliente.addListener('r4TermDati', (e) => {
                const id = daIdPonte(e.id)
                if (id && typeof e.testo === 'string') schermi.get(id)?.scrivi(e.testo)
            }),
            await cliente.addListener('r4TermControllo', (e) => {
                const id = daIdPonte(e.id)
                const c = id && typeof e.json === 'string' ? controlloTerminaleR4(e.json) : null
                if (!id || !c) return
                if (c.tipo === 'agganciato') {
                    schermi.get(id)?.azzera()
                    aggiorna(id, { stato: 'connesso', ripreso: c.ripreso, shell: c.shell, comando: c.comando, codiceUscita: null, erroreAvvio: null })
                } else if (c.tipo === 'uscita') aggiorna(id, { stato: 'terminato', codiceUscita: c.codice })
                else aggiorna(id, { stato: 'terminato', erroreAvvio: c })
            }),
            await cliente.addListener('r4TermChiuso', (e) => staccata(daIdPonte(e.id))),
            await cliente.addListener('r4TermErrore', (e) => staccata(daIdPonte(e.id))),
        ]
    }

    /** Il ponte ha chiuso: una shell uscita o mai partita resta «terminata»; il resto è «disconnessa» (si può ricollegare). */
    function staccata(id: string | null) {
        if (!id) return
        collegate.delete(id)
        const s = scheda(id)
        if (s && s.stato !== 'terminato') aggiorna(id, { stato: 'disconnesso' })
    }

    function daVoci(voci: VoceTerminaleR4[]): SchedaTerminaleR4[] {
        return voci.map((v) => {
            const prima = scheda(v.terminalId)
            return prima ? { ...prima, ...v } : { ...v, stato: 'attesa', ripreso: false, shell: null, comando: null, codiceUscita: null, erroreAvvio: null }
        })
    }

    async function carica(): Promise<void> {
        const percorso = rotta()
        if (!percorso) { schede.value = []; attiva.value = null; return }
        const r = await cliente.richiesta({ metodo: 'GET', percorso })
        let corpo: unknown = null
        try { corpo = JSON.parse(r.corpo) } catch { /* risposta storta: elenco vuoto */ }
        schede.value = daVoci(vociTerminaliR4(corpo))
        if (!attiva.value || !scheda(attiva.value)) attiva.value = schede.value[0]?.terminalId ?? null
    }

    async function nuova(): Promise<string | null> {
        const percorso = rotta()
        if (!percorso) return null
        if (schede.value.length >= SCHEDE_MASSIME_R4) { errore.value = 'troppe'; return null }
        errore.value = null
        const r = await cliente.richiesta({ metodo: 'POST', percorso, corpo: '{}' })
        let corpo: { ok?: boolean; data?: { terminalId?: unknown }; error?: { code?: unknown } } | null = null
        try { corpo = JSON.parse(r.corpo) } catch { /* sotto */ }
        const id = corpo?.ok && typeof corpo.data?.terminalId === 'string' ? corpo.data.terminalId : null
        if (!id) { errore.value = typeof corpo?.error?.code === 'string' ? corpo.error.code : 'TERMINAL_TAB_NOT_OPENED'; return null }
        await carica()
        attiva.value = id
        return id
    }

    async function collega(terminalId: string, schermo: SchermoTerminaleR4): Promise<void> {
        await ascolta()
        schermi.set(terminalId, schermo)
        aggiorna(terminalId, { stato: 'connessione' })
        collegate.add(terminalId)
        try {
            await cliente.apriTerminale({ id: idPonte(terminalId), terminalId })
        } catch (e) {
            collegate.delete(terminalId)
            aggiorna(terminalId, { stato: 'disconnesso' })
            errore.value = (e as { code?: string })?.code ?? 'TALOS_R4_IRRAGGIUNGIBILE'
        }
    }

    async function scrivi(testo: string): Promise<void> {
        if (!attiva.value || !collegate.has(attiva.value)) return
        await cliente.scriviTerminale({ id: idPonte(attiva.value), testo }).catch(() => staccata(attiva.value))
    }

    async function ridimensiona(cols: number, rows: number): Promise<void> {
        if (!attiva.value || !collegate.has(attiva.value)) return
        await cliente.ridimensionaTerminale({ id: idPonte(attiva.value), cols, rows }).catch(() => {})
    }

    /** Chiude la scheda (il ponte e la shell su r4) e passa a quella a destra, altrimenti a sinistra (come il desktop). */
    async function chiudi(terminalId: string): Promise<boolean> {
        const percorso = rotta()
        if (!percorso) return false
        const posizione = schede.value.findIndex((s) => s.terminalId === terminalId)
        await cliente.chiudiTerminale({ id: idPonte(terminalId) }).catch(() => {})
        collegate.delete(terminalId)
        schermi.delete(terminalId)
        const r = await cliente.richiesta({ metodo: 'POST', percorso: `${percorso}/${encodeURIComponent(terminalId)}/close`, corpo: '{}' })
        if (r.stato !== 200 && r.stato !== 404) { errore.value = 'TERMINAL_CLOSE_FAILED'; return false }
        schede.value = schede.value.filter((s) => s.terminalId !== terminalId)
        if (attiva.value === terminalId) attiva.value = (schede.value[posizione] ?? schede.value[posizione - 1])?.terminalId ?? null
        return true
    }

    /** Si stacca da tutto (ponte e ascoltatori) senza chiudere le shell: r4 le tiene per chi torna. */
    async function distruggi(): Promise<void> {
        for (const id of [...collegate]) await cliente.chiudiTerminale({ id: idPonte(id) }).catch(() => {})
        collegate.clear()
        schermi.clear()
        const da = ascolti ?? []
        ascolti = null
        for (const a of da) await a.remove()
    }

    return { schede, attiva, errore, carica, nuova, collega, scrivi, ridimensiona, chiudi, distruggi }
}
