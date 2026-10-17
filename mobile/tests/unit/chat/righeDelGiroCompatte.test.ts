// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import TalosMobileTraceRow from '@/components/chat/TalosMobileTraceRow.vue'

/*
 * ⛔ Owner 15/10/2026, dalle foto del Codice su r4: «le righe di tool call tipo ragionamento, leggi, nota.md sono troppo distanti
 * verticalmente … direi di compattarle»; scelta «Compatte, tocco intatto». Misurato sul Pad: «Ragionamento» 48 px + 12 px sotto,
 * la riga dell'attrezzo 44 px (bersaglio tattile) anche se nel giro non si tocca. Valgono per chat e Codice (stesso componente).
 * - la riga dell'attrezzo che NON si tocca scende a 28 px (`min-h-7`); quella che si tocca tiene i 44 px;
 * - «Ragionamento» dentro il giro perde il margine di 12 px; il suo bersaglio di tocco (`min-h-touch`) resta.
 */
const radice = resolve(__dirname, '..', '..', '..', 'src')

describe('le righe del giro compatte, tocco intatto (owner 15/10)', () => {
    it('RGC-01 la riga che non si tocca è alta 28 px; quella che si tocca tiene il bersaglio di 44', () => {
        const ferma = mount(TalosMobileTraceRow, { props: { label: 'leggi: NOTA.md', interactive: false } })
        expect(ferma.classes()).toContain('min-h-7')
        expect(ferma.classes()).not.toContain('min-h-touch')
        const tocca = mount(TalosMobileTraceRow, { props: { label: 'Dettagli', interactive: true } })
        expect(tocca.classes()).toContain('min-h-touch')
    })

    it('RGC-02 «Ragionamento» dentro il giro senza il margine di 12 px; il bersaglio di tocco resta', () => {
        const css = readFileSync(resolve(radice, 'components', 'chat', 'talosCalmMessages.css'), 'utf8')
        expect(css).toMatch(/\[data-segmento="ragionamento"\]\.advanced\.reasoning\s*\{\s*margin-bottom:\s*\.125rem;\s*\}/u)
        expect(css).toMatch(/\.advanced\.reasoning\s*\{[^}]*margin-bottom:\s*\.75rem/u)
        const blocco = readFileSync(resolve(radice, 'components', 'chat', 'TalosMobileReasoningBlock.vue'), 'utf8')
        expect(blocco).toMatch(/<summary[^>]*class="min-h-touch"/u)
        const giro = readFileSync(resolve(radice, 'components', 'chat', 'TalosMobileAttivitaDelTurno.vue'), 'utf8')
        expect(giro).toContain('data-segmento="ragionamento"')
    })
})
