import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseTalosMobileDesignTokens } from '@talos-mobile/design-tokens'
import bundled from '@/theme/telemetry.identity.json'

/**
 * ⛔⛔ QUESTO CONTROLLO GUARDA FUORI DALLA CARTELLA, e va saputo.
 *
 * Confronta il tema impacchettato qui con quello ESPORTATO DAL DESKTOP, che
 * vive in `control-plane/` — cioè in un progetto vicino, non in questo. È il
 * suo senso: la deriva fra le due superfici si vede solo mettendole accanto.
 *
 * ## Perché adesso può saltare
 *
 * MISURATO il 2026-08-15, provando la cartella pubblicabile da zero: TALOS si
 * pubblica da solo, senza `control-plane`. Lì questo file non esiste, e il test
 * falliva con «Cannot find module» — cioè chi clona la repo pubblica trovava
 * 40 test rossi al primo `npx vitest run`.
 *
 * ⇒ Un confronto fra DUE cose non è «fallito» quando una delle due non c'è: non
 * è eseguibile. Sono due esiti diversi, e confonderli fa sembrare rotto un
 * progetto sano — la prima cosa che vede chi arriva.
 *
 * ⛔ E il salto è CONDIZIONATO al file, non a una variabile d'ambiente: dove il
 * desktop c'è il controllo gira sempre, e nessuno può zittirlo per comodità.
 */
const DESKTOP = resolve(__dirname, '../../../../control-plane/resources/js/motion-v6/themeIdentity.ts')
const conDesktop = existsSync(DESKTOP)

describe.skipIf(!conDesktop)('telemetry identity drift', () => {
    it('bundled identity equals the exported desktop telemetry identity', async () => {
        /*
         * ⛔ Import DINAMICO: uno statico in cima al file viene risolto anche
         * quando il `describe` è saltato — il modulo si carica prima che vitest
         * decida di non eseguire niente, e l'errore arriva lo stesso.
         */
        const { TALOS_THEME_IDENTITIES_V6, exportTalosThemeIdentity } =
            await import('../../../../control-plane/resources/js/motion-v6/themeIdentity')
        const desktop = TALOS_THEME_IDENTITIES_V6.find((identity: { id: string }) => identity.id === 'telemetry')
        expect(desktop, 'desktop telemetry identity present').toBeTruthy()
        const exported = exportTalosThemeIdentity(desktop!)
        expect(bundled).toEqual(exported)
    })

    it('bundled identity is canonical for the mobile contract', () => {
        const parsed = parseTalosMobileDesignTokens(bundled)
        expect(parsed.id).toBe('telemetry')
        expect(parsed.assets.poster.path).toBe('/talos/backgrounds/telemetry-poster.webp')
        expect(parsed.schema_version).toBe(1)
    })
})
