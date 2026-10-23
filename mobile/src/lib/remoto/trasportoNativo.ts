/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO: il `TrasportoRemoto` di `clienteRemoto.ts` sopra un canale del plugin nativo `TalosRemoto`.
 * Il nativo consegna messaggi interi (il taglio a 4 byte è suo); qui il JSON di QUEL canale e la sua chiusura, nient'altro.
 */
import type { TrasportoRemoto } from './clienteRemoto'
import type { PluginRemoto } from './accoppiamentoRemoto'

export async function trasportoNativo(plugin: PluginRemoto, canale: string): Promise<TrasportoRemoto & { smonta(): Promise<void> }> {
    const messaggi = new Set<(m: unknown) => void>()
    const chiusure = new Set<(motivo: string) => void>()
    const ascolti = [
        await plugin.addListener('remoto-messaggio', (e) => {
            if (e.canale !== canale) return
            let m: unknown
            try { m = JSON.parse(e.json) } catch { return }
            for (const cb of messaggi) cb(m)
        }),
        await plugin.addListener('remoto-chiuso', (e) => {
            if (e.canale !== canale) return
            for (const cb of chiusure) cb(e.motivo)
        }),
    ]
    return {
        invia: (m) => plugin.invia({ canale, json: JSON.stringify(m) }),
        onMessaggio(cb) { messaggi.add(cb); return () => { messaggi.delete(cb) } },
        onChiuso(cb) { chiusure.add(cb); return () => { chiusure.delete(cb) } },
        async smonta() { for (const a of ascolti.splice(0)) await a.remove().catch(() => undefined) },
    }
}
