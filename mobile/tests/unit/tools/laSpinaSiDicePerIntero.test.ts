/**
 * ⛔⛔ «NON IN CARICA» COL CAVO ATTACCATO — e perché la frase era peggio del dato.
 *
 * ## Il difetto, dall'owner il 2026-08-15
 *
 * Chiesto «quanta batteria mi resta». TALOS: **«Ti resta l'89% (dispositivo non
 * in carica)»**. L'owner, che aveva il cavo in mano: «il dispositivo È IN CARICA
 * quindi ha sbagliato».
 *
 * Il telefono, nello stesso istante:
 *
 * ```
 *   USB powered: true      ← il cavo C'È
 *   status: 4              ← BATTERY_STATUS_NOT_CHARGING
 *   level: 89
 * ```
 *
 * ⇒ `BatteryManager.isCharging` diceva **il vero**: ColorOS a 89% su un porto da
 * 500 mA smette di caricare apposta. Ma la frase che ne usciva si legge come
 * «non sei collegato», che è falso. **Un fatto vero detto in modo che si legge
 * come un altro fatto è una bugia con l'alibi** — e la persona che vede il cavo
 * conclude che l'assistente non sa guardare.
 *
 * ## Ciò che questo file difende
 *
 * Tre stati, non due: `unplugged`, `charging`, e **`plugged-not-charging`** —
 * l'unico che spiega anche perché la percentuale non sale. E la frase viaggia
 * col dato, invece di lasciare al modello il compito di comporla da tre chiavi.
 */
import { describe, expect, it, vi } from 'vitest'
import { createTalosDeviceTools } from '@/lib/tools/deviceTools'

type Esito = { ok: boolean, content: string }

async function stato(power: string, extra: Record<string, unknown> = {}): Promise<Esito> {
    const tools = createTalosDeviceTools({
        status: vi.fn(async () => ({ batteryPercent: 89, power, ...extra })),
    } as never)
    const strumento = tools.find((t) => t.name === 'device_status')
    expect(strumento, 'device_status deve esistere').toBeDefined()
    return await (strumento!.run as (i: unknown) => Promise<Esito>)({})
}

describe('la spina si dice per intero', () => {
    it('⛔ collegato ma FERMO: si dice che è collegato, non solo che non carica', async () => {
        const esito = await stato('plugged-not-charging', { charging: false, plugged: true })
        expect(esito.content).toContain('IS plugged in')
        // ⛔ E la frase si CHIEDE, non si vieta soltanto: col primo divieto il
        // modello taceva del tutto, e il fatto utile spariva.
        expect(esito.content).toContain('SAY BOTH')
        expect(esito.content).toContain('Never say it is unplugged')
        // E il dato grezzo resta, perché il modello possa citarlo.
        expect(esito.content).toContain('"plugged":true')
    })

    it('scollegato lo dice chiaro', async () => {
        const esito = await stato('unplugged', { charging: false, plugged: false })
        expect(esito.content).toContain('NOT plugged in')
    })

    it('in carica lo dice chiaro', async () => {
        const esito = await stato('charging', { charging: true, plugged: true })
        expect(esito.content).toContain('plugged in and charging')
    })

    it('batteria piena col cavo: è un terzo caso, non «non in carica»', async () => {
        const esito = await stato('plugged-full', { charging: false, plugged: true })
        expect(esito.content).toContain('battery is full')
        expect(esito.content).not.toContain('NOT plugged in')
    })

    /*
     * ⛔⛔ E LA STRADA PRIVILEGIATA — lo stesso difetto, trovato lo stesso giorno.
     *
     * Misurato sul Pad col debug wireless spento (`adb_wifi_enabled = 0`),
     * chiesto «controlla il mio telefono». La risposta era ottima: batteria,
     * memoria, spazio, suoneria, e perfino «due cose che non ho potuto
     * controllare» — notifiche e Gmail. Del **ponte giù, niente**.
     *
     * Ma senza ponte non funzionano leggere lo schermo, pilotarlo, Wi-Fi,
     * Bluetooth, aereo, risparmio, non disturbare, l'elenco delle app. ⇒ Chi ha
     * letto «Ecco la situazione» ha creduto di aver visto tutto.
     */
    it('⛔ ponte GIÙ: si dice, e si dice cosa non funziona', async () => {
        const esito = await stato('charging', { charging: true, plugged: true, bridge: false })
        expect(esito.content).toContain('is NOT connected')
        // ⛔ Non basta dirlo: deve dire COSA cade, se no «ponte» è una parola
        // che non significa niente per chi legge.
        expect(esito.content).toContain('reading the screen')
        /*
         * ⛔ E deve NOMINARE la porta. Qui prima si cercava «privileges page»,
         * e provato sul Pad quella frase ha prodotto l'apertura di
         * **«Informazioni app» di TALOS** — il modello non ha un attrezzo per
         * aprire una pagina dentro TALOS, quindi ha preso la più vicina che
         * conosceva. Un'offerta che non nomina la porta è un'offerta che il
         * modello completa a modo suo.
         */
        expect(esito.content).toContain('android.settings.APPLICATION_DEVELOPMENT_SETTINGS')
        // E la spina resta: le due frasi convivono, non si scacciano.
        expect(esito.content).toContain('plugged in and charging')
    })

    it('ponte SU: nessuna FRASE — un «tutto a posto» a ogni domanda è rumore', async () => {
        const esito = await stato('charging', { charging: true, plugged: true, bridge: true })
        // ⛔ Il DATO resta e si legge, come `plugged` per la spina: è la frase
        // che non ci va. Cercare la parola «bridge» prenderebbe il JSON e
        // farebbe fallire il test per il motivo sbagliato.
        expect(esito.content).toContain('"bridge":true')
        expect(esito.content).not.toContain('NOT connected')
        expect(esito.content).toContain('plugged in and charging')
    })

    it('⛔ ponte NON CHIESTO: silenzio, non «è giù»', async () => {
        const esito = await stato('charging', { charging: true, plugged: true })
        expect(esito.content).not.toContain('NOT connected')
    })

    it('⛔ se il telefono non dice niente sulla spina, non si inventa una frase', async () => {
        /*
         * Un ponte vecchio, o un sistema che non risponde: nessun `power`. La
         * risposta resta il dato grezzo — dire «non è collegato» perché non
         * l'abbiamo saputo sarebbe la bugia opposta.
         */
        const esito = await stato('', { batteryPercent: 42 })
        expect(esito.content).toContain('"batteryPercent":42')
        expect(esito.content).not.toContain('plugged')
    })
})
