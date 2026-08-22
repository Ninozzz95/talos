import { describe, expect, it } from 'vitest'
import { createTalosDeviceTools } from '@/lib/tools/deviceTools'

/**
 * ⛔⛔ POSIZIONE-CITTA-INVENTATA-01 — TALOS ha detto «Milan» stando a Roma.
 *
 * ## Cosa ha visto l'owner, e cosa ho misurato
 *
 * Sul Pad il 2026-08-19, Qwen3-1.7B, domanda «Dove mi trovo adesso?»:
 *
 * ```
 *   The phone is currently located at:
 *   Latitude: 41.899925 · Longitude: 12.478631 · Location: Milan, Italy
 * ```
 *
 * Quelle coordinate sono **Roma**, in centro. La città è falsa, ed è detta con
 * la stessa sicurezza dei due numeri che la precedono.
 *
 * ## ⛔⛔ CORRETTO il 2026-08-19 sera: nemmeno i NUMERI erano veri
 *
 * Owner, quella sera: «io mi trovo a **Catania** comunque». Il telefono lo
 * confermava — `dumpsys location`, fused e network: 37,55 / 15,08.
 *
 * E c'è un indizio che chiude la questione senza doverla discutere:
 * **41.899925 ha sei decimali**, mentre `posizione.ts` arrotonda a **quattro**
 * (`PRECISIONE = 4`). Un numero che il nostro codice non può produrre non è
 * uscito dal nostro codice: era inventato anche quello.
 *
 * ⇒ Avevo scritto «coordinate giuste» leggendole dalla RISPOSTA invece che dal
 * tool. È lo stesso errore contro cui esiste questa lezione, fatto mentre la
 * scrivevo. Il fixture qui sotto resta com'era — vale come caso di prova — ma
 * non è più spacciato per una misura.
 *
 * ## ⛔ E non è un'allucinazione libera: gliel'avevamo ORDINATO noi
 *
 * Il risultato del tool diceva, testualmente:
 *
 * > «Use these coordinates to work out the area, and **say the place name you
 * > derived** so the user can correct you if it is wrong.»
 *
 * Mentre la descrizione dello STESSO tool dice l'opposto:
 *
 * > «Naming places from a city the user is not in is worse than saying you do
 * > not know.»
 *
 * Due istruzioni contrarie dentro un solo strumento, e ha vinto quella più
 * vicina al momento della risposta. Un modello da 1,7 miliardi di parametri non
 * ha una tavola di coordinate in testa: gli abbiamo chiesto un nome, e ha dato
 * il nome plausibile che sapeva.
 *
 * ## Perché la cura non è aggiungere il geocoding
 *
 * Ricerca del 2026-08-19: il `Geocoder` di Android **fa richieste HTTP ai
 * server di Google** — non è offline, e il metodo sincrono è deprecato da API
 * 33 perché blocca il thread. Aggiungerlo qui vorrebbe dire mandare fuori dal
 * telefono la posizione della persona da uno strumento che oggi è `read` e non
 * chiede nessun consenso di rete. È una decisione di privacy, non una rifinitura.
 *
 * ⇒ Finché quella decisione non è presa, il tool dice quello che SA — due
 * coordinate e la loro età — e vieta esplicitamente di derivarne un nome.
 */

const POSIZIONE_VERA = {
    stato: 'letta' as const,
    latitudine: 41.899925,
    longitudine: 12.478631,
    precisioneMetri: 18,
    etaSecondi: 12,
}

function fonti() {
    return {
        location: async () => POSIZIONE_VERA,
        torch: async () => ({ done: true }),
        vibrate: async () => ({ done: true, appliedMs: 0 }),
        volume: async () => ({ done: true, percent: 0 }),
        alarm: async () => ({ done: true }),
        openApp: async () => ({ done: true }),
        openSettingsScreen: async () => ({ done: true }),
        compose: async () => ({ done: true }),
        status: async () => ({}),
        wallpaper: async () => ({ done: true, appliedTo: 'home' }),
        keepAwake: async () => ({ done: true, on: true }),
        media: async () => ({ done: true, playing: false }),
        speak: async () => ({ done: true }),
        stopSpeaking: async () => ({ done: true }),
    } as never
}

const posizione = () =>
    createTalosDeviceTools(fonti()).find((tool) => tool.name === 'device_location')!

describe('POSIZIONE-CITTA-INVENTATA-01 le coordinate non diventano una città', () => {
    it('dice le coordinate e la loro età', async () => {
        const esito = await posizione().run({} as never, {} as never)
        expect(esito.content).toContain('41.899925')
        expect(esito.content).toContain('12.478631')
        expect(esito.content).toMatch(/18\s*m/)
    })

    it('⛔ NON chiede al modello di dedurre e dire il nome del luogo', async () => {
        const esito = await posizione().run({} as never, {} as never)
        // La riga che ha prodotto «Milan» stando a Roma.
        expect(esito.content).not.toMatch(/say the place name/i)
        expect(esito.content).not.toMatch(/work out the area/i)
    })

    it('vieta esplicitamente di nominare un luogo non conosciuto', async () => {
        const esito = await posizione().run({} as never, {} as never)
        expect(esito.content).toMatch(/do not name|non nominare/i)
    })
})
