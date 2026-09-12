import { describe, expect, it } from 'vitest'
import {
    talosNoteAsPlainText,
    talosNoteBlocks,
    talosNoteChecklist,
    talosNoteDate,
    talosNoteKind,
    talosNotePlainPreview,
} from '@/components/talos/notes/noteShape'

/**
 * La forma di una nota si deduce dal testo, e la deduzione è l'unico posto in
 * cui scheda, riga e pagina possono mettersi d'accordo. Queste prove esistono
 * perché un errore qui non si vede come un errore: si vede come una nota che
 * «non è una checklist», e nessuno sospetta di una regex.
 */
describe('the kind of a note, read from its text', () => {
    it('is a checklist when a line carries a box', () => {
        expect(talosNoteKind('- [ ] Provare i gesti')).toBe('checklist')
        expect(talosNoteKind('* [x] Fatto')).toBe('checklist')
    })

    it('is a thought when a line begins with a quote mark', () => {
        expect(talosNoteKind('Dalla riunione\n> Meno, ma meglio')).toBe('thought')
    })

    it('is a plain note otherwise', () => {
        expect(talosNoteKind('Rivedere il percorso della chat.')).toBe('note')
        expect(talosNoteKind('')).toBe('note')
        expect(talosNoteKind(null)).toBe('note')
    })

    /**
     * ⛔ Il verso contrario, e non è teorico: una checklist con un cappello in
     * citazione resta una CHECKLIST. È la cosa che si va a fare; la citazione
     * è il suo titolo.
     */
    it('stays a checklist even when a quote opens it', () => {
        expect(talosNoteKind('> Prima di pubblicare\n- [ ] Rileggere')).toBe('checklist')
    })

    /** Un trattino non è una spunta: un elenco semplice non è una checklist. */
    it('does not mistake a bullet list for a checklist', () => {
        expect(talosNoteKind('- Il valore dei piccoli feedback\n- Un solo gesto')).toBe('note')
    })
})

describe('the ticks of a note', () => {
    it('reads box, text and the line it came from', () => {
        const items = talosNoteChecklist('Intro\n- [x] Rileggere i testi\n- [ ] Provare i gesti')
        expect(items).toEqual([
            { index: 1, done: true, text: 'Rileggere i testi' },
            { index: 2, done: false, text: 'Provare i gesti' },
        ])
    })

    /** Chi scrive a mano usa la X che gli capita. */
    it('accepts an uppercase tick', () => {
        expect(talosNoteChecklist('- [X] Fatto')[0]?.done).toBe(true)
    })

    it('ignores a box with nothing after it', () => {
        expect(talosNoteChecklist('- [ ]')).toEqual([])
    })
})

describe('a note read as prose', () => {
    it('tells headings, quotes, bullets, paragraphs and gaps apart', () => {
        expect(talosNoteBlocks('## Cosa tenere\n> Una frase\n- Un punto\nUn paragrafo\n'))
            .toEqual([
                { kind: 'heading', text: 'Cosa tenere' },
                { kind: 'quote', text: 'Una frase' },
                { kind: 'bullet', text: 'Un punto' },
                { kind: 'paragraph', text: 'Un paragrafo' },
                { kind: 'gap' },
            ])
    })

    it('cuts the preview on whole lines, never mid-word', () => {
        const blocks = talosNoteBlocks('uno\ndue\ntre\nquattro', 2)
        expect(blocks).toHaveLength(2)
        expect(blocks[1]).toEqual({ kind: 'paragraph', text: 'due' })
    })
})

describe('the one-line preview of the listing', () => {
    it('flattens the newlines and keeps the marks that tell the kinds apart', () => {
        expect(talosNotePlainPreview('> Una buona interfaccia\nnon ti chiede di capirla'))
            .toBe('> Una buona interfaccia non ti chiede di capirla')
    })

    it('cuts on a space and marks the cut', () => {
        const cut = talosNotePlainPreview('parola '.repeat(40), 40)
        expect(cut.endsWith('…')).toBe(true)
        expect(cut.length).toBeLessThanOrEqual(40)
    })

    /** Il verso contrario: una parola sola lunghissima non fa sparire tutto. */
    it('cuts inside a single very long word rather than returning nothing', () => {
        const cut = talosNotePlainPreview('a'.repeat(300), 40)
        expect(cut.endsWith('…')).toBe(true)
        expect(cut.length).toBe(40)
    })
})

describe('the date of a note', () => {
    it('is short in the listing and long in the page', () => {
        expect(talosNoteDate('2026-09-10T08:00:00.000Z', 'it')).toContain('10')
        expect(talosNoteDate('2026-09-10T08:00:00.000Z', 'it', true)).toContain('2026')
    })

    /** ⛔ Una riga senza data è meglio di una riga che dichiara un guasto. */
    it('is empty rather than "Invalid Date" when the value will not parse', () => {
        expect(talosNoteDate('non una data', 'it')).toBe('')
        expect(talosNoteDate(null, 'it')).toBe('')
    })
})

describe('a note as plain text, for the export', () => {
    it('is the title, a blank line, and the body — nothing of ours', () => {
        expect(talosNoteAsPlainText({ title: 'Idee', content: 'Rivedere il percorso.' }))
            .toBe('Idee\n\nRivedere il percorso.')
    })

    it('is just the title when there is no body to follow it', () => {
        expect(talosNoteAsPlainText({ title: 'Idee', content: '   ' })).toBe('Idee')
    })
})
