/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO, fetta R-M3: il collegamento `talos-remote:` aperto sul telefono (mockup v5, «Senza fotocamera: il
 * collegamento copiato» — vale come il QR: una volta, 5 minuti). Stesso schema della consegna della barra (`lib/barra/consegna.ts`):
 * a freddo `getLaunchUrl`, a caldo `appUrlOpen`; la stessa consegna due volte (Capacitor #971) apre UN accoppiamento.
 * ⛔ Il collegamento porta il gettone: resta in memoria finché la sezione «Computer» lo prende, mai in un diario né nella rotta.
 */
import { ref } from 'vue'

const PREFISSO = 'talos-remote:1?'
/** Il QR in attesa che la sezione «Computer» lo prenda (reattivo: la sezione già aperta lo vede arrivare). */
export const qrRemotoInAttesa = ref<string | null>(null)
let ultimo: string | null = null

export function prendiQrInAttesa(): string | null {
    const qr = qrRemotoInAttesa.value
    qrRemotoInAttesa.value = null
    return qr
}

/** `vai` porta alla sezione «Computer». */
export async function ascoltaLinkRemoti(vai: () => void): Promise<void> {
    const arriva = (url: string | undefined | null) => {
        if (typeof url !== 'string' || !url.startsWith(PREFISSO) || url === ultimo) return
        ultimo = url
        qrRemotoInAttesa.value = url
        vai()
    }
    try {
        const { App } = await import('@capacitor/app')
        arriva((await App.getLaunchUrl())?.url)
        await App.addListener('appUrlOpen', (evento) => arriva(evento.url))
    } catch {
        // fuori dall'app (anteprima nel browser) non ci sono collegamenti da ricevere
    }
}
