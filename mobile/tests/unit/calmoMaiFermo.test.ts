/**
 * CALMO-01 — «calmo, mai fermo» (owner 27/10/2026: nulla deve far sembrare la UI bloccata; lezione del 24/09: la macchina dell'owner ha
 * il movimento ridotto acceso). Col movimento ridotto la regola globale tronca ogni animazione a 0,001 ms: una rotella `animate-spin`
 * restava FERMA, e una rotella ferma dice «bloccato» (revisione del Desktop sul blocco icone, 28/10: la riga «in corso» dei Processi).
 * Cura unica per le 24 rotelle dell'app: sotto riduzione ogni `animate-spin` pulsa piano d'opacità, senza ruotare né cambiare misura.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, '../../src/style.css'), 'utf8')

describe('CALMO col movimento ridotto niente «in corso» resta fermo', () => {
    it('CALMO-01 sotto riduzione la rotella pulsa (più specifica della regola globale, infinita), senza ruotare', () => {
        const i = css.indexOf('@media (prefers-reduced-motion: reduce) {\n    *,')
        expect(i).toBeGreaterThan(-1)
        const blocco = css.slice(i, css.indexOf('\n}\n', i))
        expect(blocco).toContain('.animate-spin { animation: talosCalmo 2s ease-in-out infinite !important; }')
        const k = css.indexOf('@keyframes talosCalmo')
        expect(k).toBeGreaterThan(-1)
        const fotogrammi = css.slice(k, css.indexOf('}', css.indexOf('{', k) + 1) + 1)
        expect(fotogrammi).toMatch(/opacity: \.45/u)
        expect(fotogrammi).not.toMatch(/transform|rotate|scale/u)
    })

    // Tutti i sorgenti dell'app, per le due prove qui sotto
    const radice = resolve(__dirname, '../../src')
    const sorgenti = readdirSync(radice, { recursive: true, encoding: 'utf8' })
        .filter((f) => /\.(vue|ts)$/u.test(f))
        .map((f) => ({ file: f.replaceAll('\\', '/'), testo: readFileSync(join(radice, f), 'utf8') }))

    it('CALMO-02 nessun indicatore «in corso» è solo `motion-safe`: col movimento ridotto la classe non c\'è e CALMO non la prende', () => {
        // Tailwind 4.3.3 (docs animation.mdx): `motion-safe:` vale solo sotto `prefers-reduced-motion: no-preference`. Si scrive
        // `animate-spin`/`animate-pulse`: senza riduzione gira o pulsa come prima, con la riduzione pulsa piano (censimento, 29/10)
        const colpevoli = sorgenti
            .filter((s) => /motion-safe:animate-(spin|pulse)/u.test(s.testo))
            .map((s) => s.file)
        expect(colpevoli).toEqual([])
    })

    it('CALMO-03 le pulsazioni pulsano piano anche loro, e nessun indicatore si spegne con `motion-reduce:animate-none`', () => {
        const i = css.indexOf('@media (prefers-reduced-motion: reduce) {\n    *,')
        const blocco = css.slice(i, css.indexOf('\n}\n', i))
        expect(blocco).toContain('.animate-pulse { animation: talosCalmo 2s ease-in-out infinite !important; }')
        // La forma esplicita dello stesso spegnimento (Desktop, 29/10). Un'animazione DECORATIVA che va davvero spenta si aggiunge qui,
        // `file: ragione`; un «in corso» mai. Oggi nessuna.
        const eccezioni: Record<string, string> = {}
        const colpevoli = sorgenti
            .filter((s) => !(s.file in eccezioni))
            .filter((s) => /\banimate-(spin|pulse)\b[^"'`]*motion-reduce:animate-none|motion-reduce:animate-none[^"'`]*\banimate-(spin|pulse)\b/u.test(s.testo))
            .map((s) => s.file)
        expect(colpevoli).toEqual([])
    })
})
