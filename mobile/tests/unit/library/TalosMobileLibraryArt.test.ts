// @vitest-environment jsdom

/**
 * U-20 — IL RIQUADRO D'ANTEPRIMA: quattro cose, e mai due insieme.
 *
 * ⛔ Lo stato «in caricamento» è la ragione principale per cui questo
 * componente esiste come pezzo a sé. Fra «sto generando» e «un'anteprima non ce
 * ne sarà» passa la differenza fra aspettare e non aspettare, e finché erano lo
 * stesso disegno la scheda mostrava il glifo durante l'attesa per poi
 * sostituirlo — uno sfarfallio su ogni file, a ogni apertura.
 *
 * `data-talos-art` porta a schermo quale dei quattro rami ha vinto: è quello
 * che rende provabile una decisione che altrimenti vivrebbe in una catena di
 * `v-if`.
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileLibraryArt from '@/components/talos/library/TalosMobileLibraryArt.vue'
import type { TalosLocalVaultFile } from '@/repositories/chatRepository'

function file(patch: Partial<TalosLocalVaultFile> = {}): TalosLocalVaultFile {
    return {
        id: 'vault-1',
        display_name: 'appunti.md',
        media_type: 'text/markdown',
        size_bytes: 2048,
        private_uri: 'talos-vault/files/vault-1.md',
        status: 'available',
        trust: 'untrusted',
        sha256: 'a'.repeat(64),
        extracted_text: null,
        failure_code: null,
        metadata: {},
        created_at: '2026-09-01T10:00:00.000Z',
        updated_at: '2026-09-01T10:00:00.000Z',
        ...patch,
    }
}

const i18n = {
    global: { mocks: { $t: (key: string) => key } },
}

describe('TalosMobileLibraryArt', () => {
    it('mostra l\'anteprima vera quando c\'è, e vince su tutto il resto', () => {
        const wrapper = mount(TalosMobileLibraryArt, {
            props: {
                file: file({ media_type: 'image/png', display_name: 'foto.png' }),
                thumbnailUrl: 'https://localhost/_capacitor_file_/thumb.webp',
                state: 'ready' as const,
                previewText: 'del testo che NON deve comparire',
            },
            ...i18n,
        })
        expect(wrapper.attributes('data-talos-art')).toBe('image')
        expect(wrapper.get('img').attributes('src')).toContain('thumb.webp')
    })

    /**
     * ⛔ IL TERZO STATO. Senza, questo caso mostrerebbe il glifo e poi lo
     * sostituirebbe con l'immagine: e nessuno potrebbe sapere quali file
     * un'anteprima non l'avranno mai.
     */
    it('in caricamento disegna un posto che si riempirà, non il glifo', () => {
        const wrapper = mount(TalosMobileLibraryArt, {
            props: {
                file: file({ media_type: 'image/png', display_name: 'foto.png' }),
                thumbnailUrl: null,
                state: 'loading' as const,
            },
            ...i18n,
        })
        expect(wrapper.attributes('data-talos-art')).toBe('loading')
        expect(wrapper.get('[role="status"]').exists()).toBe(true)
        expect(wrapper.find('[data-talos-library-file-glyph]').exists()).toBe(false)
    })

    it('per testo e Markdown disegna il documentino col TITOLO vero, non col nome del file', () => {
        const wrapper = mount(TalosMobileLibraryArt, {
            props: {
                file: file({ display_name: 'appunti-2026-09-01-finale.md' }),
                thumbnailUrl: null,
                state: 'none' as const,
                previewText: '# Prospetto dei costi\nprima riga\nseconda riga',
            },
            ...i18n,
        })
        expect(wrapper.attributes('data-talos-art')).toBe('typographic')
        expect(wrapper.text()).toContain('Prospetto dei costi')
        expect(wrapper.text()).not.toContain('appunti-2026-09-01-finale.md')
    })

    /**
     * ⛔ IL VERSO CONTRARIO, ed è il difetto che un test ha trovato davvero: un
     * PDF con del testo estratto finiva disegnato come un foglio di testo,
     * perché il ramo tipografico veniva prima del glifo. Un PDF non è un foglio
     * di testo, e chi guardava avrebbe creduto che TALOS l'avesse letto così.
     */
    it('un PDF senza anteprima cade sul GLIFO, non sul documentino', () => {
        const wrapper = mount(TalosMobileLibraryArt, {
            props: {
                file: file({ display_name: 'piano.pdf', media_type: 'application/pdf' }),
                thumbnailUrl: null,
                state: 'none' as const,
                previewText: 'del testo estratto dal PDF',
            },
            ...i18n,
        })
        expect(wrapper.attributes('data-talos-art')).toBe('glyph')
        expect(wrapper.get('[data-talos-library-extension]').text()).toBe('PDF')
    })

    it('un file senza testo estratto cade sul glifo del suo formato', () => {
        const wrapper = mount(TalosMobileLibraryArt, {
            props: {
                file: file({ display_name: 'note.txt', media_type: 'text/plain' }),
                thumbnailUrl: null,
                state: 'none' as const,
                previewText: null,
            },
            ...i18n,
        })
        expect(wrapper.attributes('data-talos-art')).toBe('glyph')
        expect(wrapper.get('[data-talos-library-extension]').text()).toBe('TXT')
    })

    it('per un link l\'anteprima è la favicon e il titolo della pagina', () => {
        const wrapper = mount(TalosMobileLibraryArt, {
            props: {
                linkTitle: 'Il prezzo del gas',
                faviconUrl: 'https://localhost/_capacitor_file_/favicon.png',
            },
            ...i18n,
        })
        expect(wrapper.attributes('data-talos-art')).toBe('link')
        expect(wrapper.text()).toContain('Il prezzo del gas')
        expect(wrapper.get('img').attributes('src')).toContain('favicon.png')
    })

    /** Un sito senza favicon non è un fallimento: è un sito senza favicon. */
    it('un link senza favicon tiene il mappamondo e il titolo', () => {
        const wrapper = mount(TalosMobileLibraryArt, {
            props: { linkTitle: 'Una pagina', faviconUrl: null },
            ...i18n,
        })
        expect(wrapper.attributes('data-talos-art')).toBe('link')
        expect(wrapper.find('img').exists()).toBe(false)
        expect(wrapper.find('svg').exists()).toBe(true)
        expect(wrapper.text()).toContain('Una pagina')
    })
})
