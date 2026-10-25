/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO, fetta R-M4: il ponte r4 verso un PC accoppiato, aperto e chiuso. Canale di lavoro (`collega`, con un
 * ritentativo per i guasti di rete), cliente del filo (`clienteRemoto.ts`), ponte (`ponteRemotoR4.ts`) che la schermata del Codice usa
 * al posto del client del suo r4. «chiudi» toglie gli ascolti e chiude il canale.
 */
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'
import type { PluginRemoto } from './accoppiamentoRemoto'
import { creaClienteRemoto } from './clienteRemoto'
import { creaPonteRemotoR4, type OpzioniFileDelPonte } from './ponteRemotoR4'
import { trasportoNativo } from './trasportoNativo'

const codiceDi = (e: unknown) => (typeof (e as { code?: unknown })?.code === 'string' ? (e as { code: string }).code : 'CONNECT_FAILED')

/**
 * R5.13 F3: l'attesa di un invio in pausa. Il canale si riapre da sé alla prima richiesta (`assicura`); qui si prova a riaprirlo
 * con un'attesa che cresce da 1 a 15 s (come il «riprende» del mockup approvato il 25/10), finché si apre o il Codice si chiude.
 */
export const ATTESE_DELLA_RIPRESA_MS = Object.freeze([1000, 2000, 4000, 8000, 15000])
export async function attendiConnessione(
    assicura: () => Promise<unknown>,
    chiuso: () => boolean,
    dormi: (ms: number) => Promise<void> = (ms) => new Promise((ok) => { setTimeout(ok, ms) }),
): Promise<void> {
    for (let giro = 0; ; giro++) {
        try {
            await assicura()
            return
        } catch (e) {
            // ⛔ B9-8 (revisione del blocco 9): revocato o non più accoppiato non torna da solo; la pausa finisce col suo motivo
            const code = (e as { code?: unknown })?.code
            if (chiuso() || code === 'NOT_PAIRED' || code === 'REVOKED') throw e
        }
        await dormi(ATTESE_DELLA_RIPRESA_MS[Math.min(giro, ATTESE_DELLA_RIPRESA_MS.length - 1)]!)
    }
}

/** Dal Pad, 20/10/2026 (RCM-08): un guasto di rete intermittente (relay n0) si ritenta UNA volta; un rifiuto del PC no. */
export async function collegaConRitentativo(plugin: PluginRemoto, pcId: string): Promise<{ canale: string }> {
    try {
        return await plugin.collega({ pcId })
    } catch (e) {
        if (codiceDi(e) !== 'CONNECT_FAILED') throw e
        return plugin.collega({ pcId })
    }
}

export async function apriPonteRemoto(
    plugin: PluginRemoto,
    pcId: string,
    opzioni: { soloDalPc?: () => string, file?: Omit<OpzioniFileDelPonte, 'attendi'> } = {},
): Promise<{ ponte: TalosR4ClientePonte, chiudi(): Promise<void>, segnaVista(sessionId: string): Promise<void> }> {
    /*
     * ⛔ RA-01 (revisione avversaria 21/10/2026): il canale cade (rete cambiata, telefono in sospensione, PC riavviato) e prima nessuno lo
     * riapriva: ogni richiesta e ogni iscrizione tornavano DISCONNECTED per sempre, schermata morta. Ora il canale è PIGRO: si riapre
     * alla prima richiesta o iscrizione dopo la caduta (il Codice riprova i flussi da sé, dal loro `after`). Un'apertura sola alla volta;
     * dopo «chiudi» niente si riapre.
     */
    type Aperto = { canale: string, trasporto: Awaited<ReturnType<typeof trasportoNativo>>, cliente: ReturnType<typeof creaClienteRemoto> }
    let aperto: Aperto | null = null
    let inApertura: Promise<Aperto> | null = null
    let finito = false
    let smontaggio: Promise<void> = Promise.resolve() // lo smontaggio di un canale caduto: «chiudi» lo aspetta
    const chiusure = new Set<(motivo: string) => void>()

    async function apri(): Promise<Aperto> {
        const { canale } = await collegaConRitentativo(plugin, pcId)
        let trasporto: Aperto['trasporto']
        try {
            trasporto = await trasportoNativo(plugin, canale)
        } catch (e) {
            // RA-05: il canale era aperto, il trasporto no: si chiude, mai lasciato acceso
            await plugin.chiudi({ canale }).catch(() => undefined)
            throw e
        }
        if (finito) { // chiuso mentre si apriva
            // revisione del blocco 4 (J2): uno `smonta` che rifiuta non deve saltare la chiusura del canale appena aperto
            await trasporto.smonta().catch(() => undefined)
            await plugin.chiudi({ canale }).catch(() => undefined)
            throw Object.assign(new Error('DISCONNECTED'), { code: 'DISCONNECTED' })
        }
        const questo: Aperto = { canale, trasporto, cliente: creaClienteRemoto(trasporto) }
        trasporto.onChiuso((motivo) => {
            if (aperto !== questo) return
            aperto = null
            // revisione del blocco 4, condizione del Desktop: «chiudi» aspetta questo smontaggio e non deve mai lanciare
            smontaggio = trasporto.smonta().catch(() => undefined)
            void plugin.chiudi({ canale }).catch(() => undefined) // il nativo libera il canale caduto (e azzera ciò che teneva)
            for (const cb of chiusure) cb(motivo)
        })
        aperto = questo
        return questo
    }
    function assicura(): Promise<Aperto> {
        if (finito) return Promise.reject(Object.assign(new Error('DISCONNECTED'), { code: 'DISCONNECTED' }))
        if (aperto) return Promise.resolve(aperto)
        inApertura ??= apri().finally(() => { inApertura = null })
        return inApertura
    }

    await assicura() // la prima apertura decide se il PC si raggiunge (la schermata torna al dettaglio, col perché)
    const ponte = creaPonteRemotoR4({
        richiesta: async (op, args) => (await assicura()).cliente.richiesta(op, args),
        iscrivi: async (sessionId, after, onEvento) => (await assicura()).cliente.iscrivi(sessionId, after, onEvento),
        onChiuso: (cb) => { chiusure.add(cb) },
    }, {
        ...(opzioni.soloDalPc ? { soloDalPc: opzioni.soloDalPc } : {}),
        ...(opzioni.file ? { file: { ...opzioni.file, attendi: () => attendiConnessione(assicura, () => finito) } } : {}),
    })
    return {
        ponte,
        /** R-M5a, `device.seen` (`cartaVista.ts`): la carta di quella sessione è sullo schermo; il PC non sveglia per lei. */
        async segnaVista(sessionId: string) {
            await (await assicura()).cliente.richiesta('device.seen', { sessionId })
        },
        async chiudi() {
            finito = true
            await smontaggio
            const ora = aperto
            aperto = null
            if (ora) {
                // ⛔ revisione del blocco 4, condizione del Desktop: «chiudi» non lancia mai. Sta nel `finally` di chi legge
                // (`leggiSessioniDelPc`, `conIlPonte`): un guasto qui faceva rifiutare `riepilogo`, e il «Sì» dei PC doppi si fermava
                // senza dimenticare né dire niente. E il canale si chiude lo stesso.
                await ora.trasporto.smonta().catch(() => undefined)
                await plugin.chiudi({ canale: ora.canale }).catch(() => undefined)
            }
        },
    }
}
