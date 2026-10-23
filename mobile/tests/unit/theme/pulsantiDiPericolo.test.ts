import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ⛔ Dal Pad, 20/10/2026: il pulsante «Dimentica» del controllo remoto era rosa chiaro con testo bianco, quasi illeggibile. Era
 * la stessa formula dei dialoghi di eliminazione di Memoria, Note, Attività, Libreria e altri: `bg-[var(--talos-danger)]
 * text-white`. Ma `--talos-danger` è il colore del TESTO di pericolo, scelto per leggersi SOPRA `--talos-danger-soft`
 * (`lib/talosThemes.ts`, `talosReadableForeground`; la coppia la misura `lib/talosContrast.ts`): nel tema scuro è un rosa chiaro.
 * Un pulsante di pericolo usa la coppia del tema: sfondo `--talos-danger-soft`, testo `--talos-danger`, bordo `--talos-danger-border`.
 */
function file(cartella: string): string[] {
    return readdirSync(cartella).flatMap((nome) => {
        const p = join(cartella, nome)
        return statSync(p).isDirectory() ? file(p) : /\.(vue|ts)$/u.test(nome) ? [p] : []
    })
}

describe('i pulsanti di pericolo', () => {
    it('PER-01 nessuno usa il colore del testo di pericolo come sfondo con testo bianco', () => {
        const colpevoli = file(resolve(__dirname, '../../../src'))
            .filter((p) => /bg-\[var\(--talos-danger\)\][^"'`]*text-white|text-white[^"'`]*bg-\[var\(--talos-danger\)\]/u.test(readFileSync(p, 'utf8')))
        expect(colpevoli).toEqual([])
    })

    /*
     * ⛔ D-RM4-9 (revisione avversariale R-M4, 21/10/2026): la forma «a contorno» dello stesso errore. «Dimentica questo computer» era
     * `variant="outline"` con `border-[var(--talos-danger)] text-[var(--talos-danger)]`: il colore del testo di pericolo come bordo
     * pieno, e sotto lo sfondo della variante (`dark:bg-input/30`, che nel tema scuro vince), così sul tablet era un pulsante grigio.
     * Un bordo velato (`border-[var(--talos-danger)]/40`, i riquadri d'avviso) resta ammesso: è un'altra cosa.
     */
    it('PER-02 nessuno usa il colore del testo di pericolo come bordo pieno (la forma a contorno)', () => {
        const colpevoli = file(resolve(__dirname, '../../../src'))
            .filter((p) => /border-\[var\(--talos-danger\)\](?!\/)/u.test(readFileSync(p, 'utf8')))
        expect(colpevoli).toEqual([])
    })
})
