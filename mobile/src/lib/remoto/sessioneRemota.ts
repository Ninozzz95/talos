/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO, fetta R-M4: il ponte r4 verso un PC accoppiato, aperto e chiuso. Canale di lavoro (`collega`, con un
 * ritentativo per i guasti di rete), cliente del filo (`clienteRemoto.ts`), ponte (`ponteRemotoR4.ts`) che la schermata del Codice usa
 * al posto del client del suo r4. «chiudi» toglie gli ascolti e chiude il canale.
 */
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'
import type { PluginRemoto } from './accoppiamentoRemoto'
import { creaClienteRemoto } from './clienteRemoto'
import { creaPonteRemotoR4 } from './ponteRemotoR4'
import { trasportoNativo } from './trasportoNativo'

const codiceDi = (e: unknown) => (typeof (e as { code?: unknown })?.code === 'string' ? (e as { code: string }).code : 'CONNECT_FAILED')

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
    opzioni: { soloDalPc?: () => string } = {},
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
            await trasporto.smonta()
            await plugin.chiudi({ canale }).catch(() => undefined)
            throw Object.assign(new Error('DISCONNECTED'), { code: 'DISCONNECTED' })
        }
        const questo: Aperto = { canale, trasporto, cliente: creaClienteRemoto(trasporto) }
        trasporto.onChiuso((motivo) => {
            if (aperto !== questo) return
            aperto = null
            smontaggio = trasporto.smonta()
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
    }, opzioni)
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
                await ora.trasporto.smonta()
                await plugin.chiudi({ canale: ora.canale }).catch(() => undefined)
            }
        },
    }
}
