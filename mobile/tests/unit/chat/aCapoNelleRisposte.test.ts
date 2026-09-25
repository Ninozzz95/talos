// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { renderTalosMarkdown, renderTalosMarkdownBlock } from '@/lib/talosMessageMarkdown'
import TalosMobileMessageContent from '@/components/chat/TalosMobileMessageContent.vue'
import TalosMobileMessageList from '@/components/chat/TalosMobileMessageList.vue'

/*
 * ACAPO (25/09/2026, owner «sì certo, sistemali»). Sul Pad GLM 5.3 ha risposto «Roma\nMilano\nNapoli» (18 caratteri,
 * catturati) e la chat mostrava «Roma Milano Napoli»: markdown-it con `breaks: false` (CommonMark) fa di un a capo
 * singolo uno spazio. I modelli scrivono elenchi, indirizzi e versi una riga alla volta.
 * Pratica adottata: a capo singolo = a capo SOLO nel testo scritto dal modello (Zed PR #57376, merged 16/06/2026,
 * `MarkdownFont::Agent`, «README rendering […] untouched»; claudecodeui #1397). File, allegati e Libreria restano
 * CommonMark: lì l'a capo singolo è spesso solo il testo spezzato da chi l'ha scritto.
 */
const brDi = (html: string) => (html.match(/<br>/g) ?? []).length

describe('ACAPO — gli a capo del modello restano a capo', () => {
    it('ACAPO-01 con lineBreaks un a capo singolo è un a capo; senza, resta CommonMark', () => {
        expect(brDi(renderTalosMarkdown('Roma\nMilano\nNapoli', { lineBreaks: true }).html)).toBe(2)
        expect(brDi(renderTalosMarkdown('Roma\nMilano\nNapoli').html)).toBe(0)
    })

    it('ACAPO-02 titoli, elenchi, tabelle, codice e paragrafi non cambiano', () => {
        const sorgente = [
            '## Città',
            '',
            '- Roma',
            '- Milano',
            '',
            '| A | B |',
            '|---|---|',
            '| 1 | 2 |',
            '',
            '```',
            'riga uno',
            'riga due',
            '```',
            '',
            'Primo paragrafo.',
            '',
            'Secondo paragrafo.',
        ].join('\n')
        const con = renderTalosMarkdown(sorgente, { lineBreaks: true }).html
        const senza = renderTalosMarkdown(sorgente).html
        expect(con).toBe(senza)
        expect(con).toContain('riga uno\nriga due')
    })

    it('ACAPO-03 la cache dei blocchi non confonde le due forme', () => {
        const blocco = 'Torino\nFirenze\nBologna'
        expect(brDi(renderTalosMarkdownBlock(blocco))).toBe(0)
        expect(brDi(renderTalosMarkdownBlock(blocco, { lineBreaks: true }))).toBe(2)
        expect(brDi(renderTalosMarkdownBlock(blocco))).toBe(0)
    })

    it('ACAPO-04 il componente passa l’opzione solo quando gliela si chiede', async () => {
        const con = mount(TalosMobileMessageContent, { props: { content: 'Roma\nMilano', lineBreaks: true } })
        const senza = mount(TalosMobileMessageContent, { props: { content: 'Roma\nMilano' } })
        await flushPromises()
        expect(con.findAll('br')).toHaveLength(1)
        expect(senza.findAll('br')).toHaveLength(0)
    })

    it('ACAPO-05 nella lista, la risposta del modello va a capo come l’ha scritta', async () => {
        const w = mount(TalosMobileMessageList, {
            props: {
                messages: [{
                    id: 'a1', role: 'assistant', content: 'Roma\nMilano\nNapoli',
                    createdAt: new Date('2026-09-25T08:00:00Z').toISOString(), status: 'complete', metadata: {},
                }] as never,
                sending: false,
            },
            global: { stubs: { teleport: true } },
        })
        await vi.dynamicImportSettled()
        await flushPromises()
        expect(w.findAll('.talos-message-markdown br, br').length).toBeGreaterThanOrEqual(2)
    })

    it('ACAPO-06 le altre strade del modello lo chiedono; file e Libreria no', () => {
        const src = (percorso: string) => readFileSync(resolve(__dirname, '../../../src', percorso), 'utf8')
        const chiede = (testo: string) => /<TalosMobileMessageContent[^>]*\bline-breaks\b/.test(testo)
        expect(chiede(src('components/chat/TalosMobileStreamingReply.vue'))).toBe(true)
        expect(chiede(src('components/barra/TalosBarraRoot.vue'))).toBe(true)
        expect(chiede(src('components/chat/TalosMobileMessageFile.vue'))).toBe(false)
        expect(chiede(src('components/chat/TalosMobileChatMediaPanel.vue'))).toBe(false)
    })
})
