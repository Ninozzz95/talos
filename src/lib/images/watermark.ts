/**
 * Il marchio che si vede, per quando l'immagine esce da TALOS.
 *
 * Owner 2026-08-04: «mettiamo un watermark semitrasparente esattamente come fa
 * ChatGPT, in modo da riconoscere che quella e' un'immagine generata
 * dall'intelligenza artificiale».
 *
 * ## Il vincolo che decide tutto, e che va detto
 *
 * Disegnare un marchio sopra i pixel vuol dire RICODIFICARE il file. E la
 * ricodifica butta via il chunk `caBX`, cioe' il manifesto C2PA firmato che il
 * provider ci aveva messo dentro — misurato il 2026-08-04: ~29 KB di
 * provenienza, con la catena dei certificati.
 *
 * Quindi marchio visibile e credenziali NON possono stare nello stesso file
 * senza una firma nuova, e una firma nuova TALOS non puo' farla: un'app
 * distribuita non custodisce una chiave privata, chiunque la estrarrebbe
 * dall'APK.
 *
 * E copiare il vecchio manifesto sull'immagine modificata sarebbe la scelta
 * peggiore delle tre: l'impronta non corrisponderebbe piu' ai pixel, ogni
 * verificatore direbbe «manomessa», e un file che sembra falsificato e' peggio
 * di uno che non dichiara niente.
 *
 * ## La divisione che ne esce
 *
 *   l'ORIGINALE, quello salvato   →  credenziali intatte, nessun marchio
 *   la COPIA che esce da TALOS    →  marchio visibile, niente manifesto
 *
 * E non e' un compromesso zoppo: **SynthID vive nei pixel, non nel
 * contenitore**, e sopravvive alla ricompressione. Dal maggio 2026 OpenAI lo
 * incorpora accanto al C2PA. Quindi anche la copia marchiata resta
 * riconoscibile da una macchina — perde la firma, non la tracciabilita'.
 */

/** Quanto in grande, rispetto al lato corto. Una misura sola, per non litigare. */
const ALTEZZA_RELATIVA = 0.042
const MARGINE_RELATIVO = 0.028

export interface TalosWatermarkOptions {
    /** Cosa c'e' scritto. Chi ha generato, se lo sappiamo. */
    testo: string
    /** Dove: in basso a destra, come fa ChatGPT. */
    angolo?: 'bottom-right' | 'bottom-left'
}

/**
 * Disegna il marchio e restituisce un file NUOVO.
 *
 * PNG e non JPEG: una foto ricompressa in JPEG perde qualita' ogni volta, e
 * questa e' la copia che la persona manderà a qualcuno. Il peso in piu' e'
 * il prezzo di non degradare cio' che si condivide.
 *
 * Torna `null` se l'immagine non si riesce a leggere. Chi chiama deve poter
 * decidere — mandare l'originale senza marchio e' una scelta legittima, che
 * un'eccezione qui toglierebbe.
 */
export async function drawTalosWatermark(
    bytes: Uint8Array,
    mediaType: string,
    options: TalosWatermarkOptions,
): Promise<Uint8Array | null> {
    const blob = new Blob([bytes as unknown as BlobPart], { type: mediaType })
    const url = URL.createObjectURL(blob)
    try {
        const immagine = await caricaImmagine(url)
        if (!immagine) return null

        const tela = document.createElement('canvas')
        tela.width = immagine.width
        tela.height = immagine.height
        const pennello = tela.getContext('2d')
        if (!pennello) return null
        pennello.drawImage(immagine, 0, 0)

        const lato = Math.min(tela.width, tela.height)
        const altezza = Math.max(14, Math.round(lato * ALTEZZA_RELATIVA))
        const margine = Math.round(lato * MARGINE_RELATIVO)
        pennello.font = `600 ${altezza}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
        pennello.textBaseline = 'alphabetic'

        const larghezzaTesto = pennello.measureText(options.testo).width
        const imbottitura = Math.round(altezza * 0.55)
        const larghezza = larghezzaTesto + imbottitura * 2
        const alto = altezza + imbottitura * 1.5
        const x = options.angolo === 'bottom-left'
            ? margine
            : tela.width - margine - larghezza
        const y = tela.height - margine - alto

        /*
         * Una targhetta scura sotto al testo, non il testo nudo.
         *
         * Il testo nudo sparisce su uno sfondo chiaro e abbaglia su uno scuro:
         * su un'immagine qualsiasi non c'e' un colore che vada sempre bene. La
         * targhetta porta il proprio sfondo, quindi si legge su qualunque cosa
         * le capiti sotto — ed e' il motivo per cui ogni marchio serio ne ha
         * una.
         */
        pennello.fillStyle = 'rgba(0, 0, 0, 0.42)'
        arrotondato(pennello, x, y, larghezza, alto, altezza * 0.42)
        pennello.fill()
        pennello.fillStyle = 'rgba(255, 255, 255, 0.92)'
        pennello.fillText(options.testo, x + imbottitura, y + alto - imbottitura * 0.85)

        const risultato = await new Promise<Blob | null>((r) => tela.toBlob(r, 'image/png'))
        if (!risultato) return null
        return new Uint8Array(await risultato.arrayBuffer())
    } catch {
        return null
    } finally {
        URL.revokeObjectURL(url)
    }
}

function arrotondato(
    pennello: CanvasRenderingContext2D,
    x: number, y: number, larghezza: number, altezza: number, raggio: number,
): void {
    const r = Math.min(raggio, larghezza / 2, altezza / 2)
    pennello.beginPath()
    pennello.moveTo(x + r, y)
    pennello.arcTo(x + larghezza, y, x + larghezza, y + altezza, r)
    pennello.arcTo(x + larghezza, y + altezza, x, y + altezza, r)
    pennello.arcTo(x, y + altezza, x, y, r)
    pennello.arcTo(x, y, x + larghezza, y, r)
    pennello.closePath()
}

function caricaImmagine(url: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
        const immagine = new Image()
        immagine.onload = () => resolve(immagine)
        immagine.onerror = () => resolve(null)
        immagine.src = url
    })
}
