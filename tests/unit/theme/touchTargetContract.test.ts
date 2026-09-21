/**
 * Una grammatica sola per il bersaglio tattile.
 *
 * ## Il difetto che questo test impedisce di ricreare
 *
 * Trovato il 2026-08-05 chiudendo il caso C4 della matrice di compatibilita':
 * misurando il DOM sul tablet, **11 controlli della chat erano 44×44 CSS px**.
 * Non era una svista isolata — erano 143 `min-h-11` e 48 `min-w-11` in 49 file,
 * mentre il Model Lab (16 file) usava gia' `min-h-[48px]`.
 *
 * Due grammatiche per la stessa promessa, e nessuno se n'era accorto perche'
 * `min-h-11` **non dice cosa sta promettendo**. Chi legge `min-h-11` legge un
 * numero; chi legge `min-h-touch` legge un'intenzione, e nota se e' sbagliata.
 *
 * ## Perche' 48 e non 44
 *
 * RICERCATO 2026-08-05 su fonte primaria: Android e Material 3 raccomandano
 * **48×48 dp** con 8dp di spaziatura. WCAG 2.2 chiede 24×24 px per il livello
 * AA (SC 2.5.8) e 44×44 per il AAA (SC 2.5.5) — quindi 44 **passava** WCAG.
 * Non era un difetto di accessibilita': era un difetto di piattaforma, su
 * un'app che gira solo su Android.
 *
 * ## Cosa NON prova questo test
 *
 * Che i controlli **rendano** davvero a 48. Questo e' un guardiano contro la
 * deriva del sorgente; la misura vera si fa sul dispositivo col DOM, ed e'
 * quella che ha trovato il difetto in primo luogo. I due servono a cose
 * diverse e servono entrambi.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { globSync } from 'node:fs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/**
 * Le classi bandite, con il loro sostituto.
 *
 * `11` in Tailwind vale 2.75rem = 44px. Non si vieta il numero in se': si
 * vieta di usarlo dove si sta dichiarando un bersaglio da toccare col dito.
 */
const BANNED = /\b(min-)?([hw])-11\b/g

/**
 * La forma verbosa della STESSA cosa.
 *
 * `--talos-touch-target` esisteva gia' e valeva gia' 48px, scritta come
 * `min-h-[var(--talos-touch-target)]` in 47 punti. Non era sbagliata nel
 * valore — era una **seconda grammatica** per la stessa promessa, ed e' cosi'
 * che nascono le divergenze: due modi di dirlo, e solo uno viene aggiornato.
 *
 * Ora `--spacing-touch` **punta** a quella variabile, quindi il valore ha una
 * casa sola e `min-h-touch` e' il solo modo di chiederlo.
 */
const BANNED_VERBOSE = /min-[hw]-\[var\(--talos-touch-target\)\]/g

function vueSources(): string[] {
    return globSync('src/**/*.vue', { cwd: ROOT })
}

describe('il bersaglio tattile ha una grammatica sola', () => {
    it('nessun sorgente usa piu` il 44px al posto del token', () => {
        const violations: string[] = []

        for (const file of vueSources()) {
            const source = readFileSync(join(ROOT, file), 'utf8')
            const found = [...(source.match(BANNED) ?? []), ...(source.match(BANNED_VERBOSE) ?? [])]
            if (found.length) violations.push(`${relative('.', file)} → ${[...new Set(found)].join(', ')}`)
        }

        expect(
            violations,
            `Bersagli tattili a 44px invece del token da 48dp.\n`
            + `Sostituire con min-h-touch / min-w-touch (--spacing-touch in src/style.css).\n`
            + violations.join('\n'),
        ).toEqual([])
    })

    it('il token esiste e vale 48px', () => {
        /*
         * Senza questo, rinominare o cancellare il token farebbe passare il
         * test qui sopra su un `min-h-touch` che non genera piu' nulla — cioe'
         * su controlli senza alcuna altezza minima. Il caso peggiore: verde e
         * rotto.
         */
        const style = readFileSync(join(ROOT, 'src/style.css'), 'utf8')
        // Punta alla variabile che esisteva gia', non a un secondo `48px`.
        expect(style).toMatch(/--spacing-touch:\s*var\(--talos-touch-target\)/)
        expect(style).toMatch(/--talos-touch-target:\s*3rem/)
    })
})
