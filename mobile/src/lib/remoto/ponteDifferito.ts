/**
 * ⛔ D-MOCK-16 (dal vivo, foto 202-206, 24/10/2026): il Codice di una sessione NUOVA sul PC aspettava la prima apertura del canale
 * (`apriPonteRemoto`, fino a 2 × 30 s nel nativo) prima di mostrare il compositore, e a un guasto tornava alla scheda del PC. Il
 * contratto R5.12 (parte 1, punto 2) vuole il compositore subito: è il primo invio a fare `session.start`.
 *
 * Qui un `TalosR4ClientePonte` che esiste da subito e inoltra al ponte vero appena il canale è aperto. Ogni richiesta aspetta
 * l'apertura; se l'apertura fallisce, risponde con la busta di r4 e il codice del canale (`CONNECT_FAILED`, `NOT_PAIRED`…), così la
 * riga d'errore del Codice dice perché. ⛔ Mai il r4 del telefono al suo posto (REM-01): niente ripiego.
 */
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'

const codiceDi = (e: unknown) => (typeof (e as { code?: unknown })?.code === 'string' ? (e as { code: string }).code : 'CONNECT_FAILED')

export function ponteDifferito(apertura: Promise<TalosR4ClientePonte>): TalosR4ClientePonte {
    // l'apertura fallita non resta una promessa rifiutata senza ascolto: ogni uso la legge da qui
    const pronto: Promise<{ ponte: TalosR4ClientePonte } | { guasto: unknown }> = apertura.then((ponte) => ({ ponte }), (guasto) => ({ guasto }))
    /** Il ponte vero, o null se il canale non si è aperto (le azioni senza risposta si lasciano cadere). */
    const vero = async () => {
        const p = await pronto
        return 'ponte' in p ? p.ponte : null
    }
    /**
     * Nota del Desktop (Fase 3, J1-ter): aprire o scrivere su un terminale senza canale si perdeva in silenzio, e la scheda restava
     * «Connessione…». Il ponte vero, o un rifiuto col codice del canale (`useTerminaleR4.collega` lo registra e stacca la scheda).
     */
    const veroOppureRifiuta = async () => {
        const p = await pronto
        if ('ponte' in p) return p.ponte
        const code = codiceDi(p.guasto)
        throw Object.assign(new Error(code), { code })
    }
    /* gli ascoltatori di `r4Errore` quando il canale non si è aperto: un flusso chiesto lo stesso cade con il codice del canale */
    const erroriInAttesa = new Set<(dati: Record<string, unknown>) => void>()
    return {
        async richiesta(opzioni) {
            const p = await pronto
            if ('ponte' in p) return p.ponte.richiesta(opzioni)
            const code = codiceDi(p.guasto)
            return { stato: 503, corpo: JSON.stringify({ ok: false, error: { code, message: code } }) }
        },
        async apriFlusso(opzioni) {
            const ponte = await vero()
            // senza canale il flusso cade come cade sul ponte vero, col nome del guasto (il Codice riprova da sé)
            if (ponte) await ponte.apriFlusso(opzioni)
            else for (const cb of erroriInAttesa) cb({ id: opzioni.id, motivo: codiceDi(((await pronto) as { guasto: unknown }).guasto) })
        },
        async chiudiFlusso(opzioni) { await (await vero())?.chiudiFlusso(opzioni) },
        async apriTerminale(opzioni) { await (await veroOppureRifiuta()).apriTerminale(opzioni) },
        async scriviTerminale(opzioni) { await (await veroOppureRifiuta()).scriviTerminale(opzioni) },
        async ridimensionaTerminale(opzioni) { await (await vero())?.ridimensionaTerminale(opzioni) },
        async chiudiTerminale(opzioni) { await (await vero())?.chiudiTerminale(opzioni) },
        // R5.13 F3: allegare in una sessione nuova (i file aspettano che sia partita; le immagini no, come la finestra)
        async allegaFile(opzioni) {
            const ponte = await veroOppureRifiuta()
            if (!ponte.allegaFile) throw Object.assign(new Error('NOT_AVAILABLE_REMOTELY'), { code: 'NOT_AVAILABLE_REMOTELY' })
            return ponte.allegaFile(opzioni)
        },
        async immagineScelta(opzioni) {
            const ponte = await veroOppureRifiuta()
            if (!ponte.immagineScelta) throw Object.assign(new Error('NOT_AVAILABLE_REMOTELY'), { code: 'NOT_AVAILABLE_REMOTELY' })
            return ponte.immagineScelta(opzioni)
        },
        async addListener(evento, ascoltatore) {
            const ponte = await vero()
            if (ponte) return ponte.addListener(evento, ascoltatore)
            if (evento !== 'r4Errore') return { remove: async () => {} }
            erroriInAttesa.add(ascoltatore)
            return { remove: async () => { erroriInAttesa.delete(ascoltatore) } }
        },
    }
}
