import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/*
 * ⛔ Owner 15/10/2026, dalla foto del Codice su r4 sul Pad: «quel color band deve andare via, deve essere trasparente, la chat si
 * deve vedere passare dietro la banda» e poi «magari con una sfumatura leggera, la stessa cosa sia nella chat». Supera la regola
 * del 12/09 (sfondo pieno dietro il compositore, dello stesso colore della chat).
 *
 * Una regola sola in style.css per i due compositori: il contenitore non dipinge niente, la sfumatura parte dallo sfondo della
 * superficie che lo ospita (`--talos-sfumatura-compositore`: la chat sta sul suo sfondo, il Codice sul foglio della stazione).
 */
const radice = resolve(__dirname, '..', '..', '..', 'src')
const css = readFileSync(resolve(radice, 'style.css'), 'utf8')
const regola = (selettore: string): string => {
    const inizio = css.indexOf(`${selettore} {`)
    expect(inizio, `${selettore} non trovato`).toBeGreaterThanOrEqual(0)
    return css.slice(inizio, css.indexOf('}', inizio))
}

describe('dietro il compositore una sfumatura leggera, mai una fascia (owner 15/10)', () => {
    it('SFU-01 il contenitore della chat è trasparente', () => {
        expect(regola('.talos-composer-dock')).toMatch(/background:\s*transparent/u)
    })

    it('SFU-02 il compositore agganciato ha una sfumatura dal basso verso il trasparente, sulla base della superficie', () => {
        const r = regola('.talos-docked-composer')
        expect(r).toMatch(/background:\s*linear-gradient\(\s*to top,/u)
        expect(r).toContain('var(--talos-sfumatura-compositore, var(--talos-background))')
        expect(r).toMatch(/transparent\s*100%\)/u)
        expect(r).not.toMatch(/background:\s*var\(--talos-background\)\s*;/u)
    })

    /*
     * Owner 15/10 (confronto del bordo basso): «vorrei che rimettessi il composer 16 pixel più in alto», scelta «Chat e Codice,
     * identici». I 16 px erano il margine del foglio della stazione (`max(0.75rem, area sicura)`): ora un rialzo solo, nella regola
     * comune, per tutti e due.
     */
    it('SFU-04 il compositore agganciato sta 16 px più su, con lo stesso rialzo in chat e Codice', () => {
        expect(css).toMatch(/--talos-compositore-rialzo:\s*max\(0\.75rem,\s*env\(safe-area-inset-bottom\)\)/u)
        const blocchi = css.match(/\.talos-docked-composer\s*\{[^}]*\}/gu) ?? []
        expect(blocchi.length).toBeGreaterThanOrEqual(2)
        for (const b of blocchi.filter((x) => x.includes('padding'))) expect(b).toContain('var(--talos-compositore-rialzo)')
    })

    it('SFU-03 il Codice su r4 usa la stessa regola, sulla base del foglio della stazione', () => {
        const codice = readFileSync(resolve(radice, 'screens', 'CodiceR4Screen.vue'), 'utf8')
        expect(codice).toContain('class="talos-docked-composer"')
        expect(codice).toMatch(/--talos-sfumatura-compositore:\s*var\(--talos-window-bg\)/u)
        expect(codice).not.toMatch(/\.talos-docked-composer\s*\{[^}]*background:\s*transparent/u)
    })
})
