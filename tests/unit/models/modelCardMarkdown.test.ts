// @vitest-environment jsdom
// DOMPurify sanifica dentro un DOM vero: senza, la barriera non è provabile.

import { describe, expect, it } from 'vitest'
import { talosModelCardMarkdown, talosStripReadmeFrontmatter } from '@/lib/models/modelCardMarkdown'
import { renderTalosMarkdown } from '@/lib/talosMessageMarkdown'

/**
 * La scheda di un modello, preparata per essere letta.
 *
 * Owner 2026-08-06, provando sul dispositivo: «scheda modello in Markdown
 * grezzo». La cura è mandarla nella pipeline della chat — ma un README del Hub
 * porta tre cose che un messaggio non ha, e queste prove guardano esattamente
 * quelle tre, più la sola che se sbagliata farebbe danno vero: i template di
 * chat dentro i blocchi di codice.
 */
describe('la sorgente della scheda modello', () => {
    it('toglie il frontmatter YAML, che è indicizzazione e non testo', () => {
        const readme = '---\nlicense: apache-2.0\npipeline_tag: text-generation\ntags:\n- gguf\n---\n\n# Qwen3\n\nUn modello.'
        const preparato = talosModelCardMarkdown(readme)
        expect(preparato).not.toContain('license:')
        expect(preparato).not.toContain('pipeline_tag')
        expect(preparato.startsWith('# Qwen3')).toBe(true)
    })

    it('un README senza frontmatter resta intero', () => {
        expect(talosStripReadmeFrontmatter('# Titolo\n\n---\n\nAltro')).toBe('# Titolo\n\n---\n\nAltro')
    })

    /**
     * ⛔ La prova che conta. Le schede dei modelli sono piene di template di
     * chat, ed è la parte che si copia davvero. Se il taglio dell'HTML entrasse
     * nei blocchi di codice, `<|im_start|>` e `<s>[INST]` sparirebbero e la
     * scheda diventerebbe inutile proprio dove serve.
     */
    it('NON tocca niente dentro un blocco di codice', () => {
        const readme = [
            '<div align="center">Titolo</div>',
            '',
            '```text',
            '<|im_start|>system',
            'Sei un assistente.<|im_end|>',
            '<s>[INST] ciao [/INST]',
            '```',
        ].join('\n')
        const preparato = talosModelCardMarkdown(readme)
        expect(preparato).toContain('<|im_start|>system')
        expect(preparato).toContain('<|im_end|>')
        expect(preparato).toContain('<s>[INST] ciao [/INST]')
        // Fuori dal blocco, invece, il div se ne va e resta la parola.
        expect(preparato).not.toContain('<div')
        expect(preparato).toContain('Titolo')
    })

    it('non tocca nemmeno quello che sta fra apici, sulla stessa riga', () => {
        const preparato = talosModelCardMarkdown('Usa `<think>` per ragionare, non <b>questo</b>.')
        expect(preparato).toContain('`<think>`')
        expect(preparato).not.toContain('<b>')
        expect(preparato).toContain('questo')
    })

    it('un fence più lungo non si chiude con uno più corto', () => {
        const readme = '````md\n```\n<div>dentro</div>\n```\n````\n\n<div>fuori</div>'
        const preparato = talosModelCardMarkdown(readme)
        expect(preparato).toContain('<div>dentro</div>')
        expect(preparato).not.toContain('<div>fuori</div>')
    })

    it('toglie i badge e il link vuoto che li avvolge', () => {
        const readme = '[![Licenza](https://img.shields.io/badge/x.svg)](https://x)\n\nUn modello serio.'
        const preparato = talosModelCardMarkdown(readme)
        expect(preparato).not.toContain('shields.io')
        expect(preparato).not.toContain('![')
        expect(preparato).not.toContain('](https://x)')
        expect(preparato).toContain('Un modello serio.')
    })

    it('i commenti HTML se ne vanno, anche quando occupano più righe', () => {
        const readme = '# Titolo\n\n<!-- nota\nper chi mantiene\nil repository -->\n\nTesto vero.'
        const preparato = talosModelCardMarkdown(readme)
        expect(preparato).not.toContain('per chi mantiene')
        expect(preparato).toContain('Testo vero.')
    })

    it('`<br>` resta una interruzione di riga, non diventa uno spazio', () => {
        const preparato = talosModelCardMarkdown('Prima<br>Dopo')
        expect(preparato).toBe('Prima  \nDopo')
        expect(renderTalosMarkdown(preparato).html).toContain('<br>')
    })

    it('DEBT-MOBILE-010 RED: renders a trusted Hugging Face model-card image', () => {
        const src = 'https://cdn-uploads.huggingface.co/production/uploads/liquid.png'
        const prepared = talosModelCardMarkdown(`<img src="${src}" alt="Liquid AI" style="width:100%" />`)
        expect(renderTalosMarkdown(prepared, { allowExternalImages: true }).html).toContain(`<img src="${src}"`)
        expect(renderTalosMarkdown('![bad](https://evil.example/image.png)', { allowExternalImages: true }).html).not.toContain('<img')
    })

    it('DEBT-MOBILE-010 RED: renders a multiline Hugging Face image tag', () => {
        const src = 'https://cdn-uploads.huggingface.co/production/uploads/liquid.png'
        const prepared = talosModelCardMarkdown(`<div align="center">\n  <img\n    src="${src}"\n    alt="Liquid AI"\n  />\n</div>`)
        expect(renderTalosMarkdown(prepared, { allowExternalImages: true }).html).toContain(`<img src="${src}"`)
    })

    /**
     * ⛔ MISURATO sul Pad, sulla scheda di `unsloth/Qwen3-4B-GGUF`: due
     * paragrafi comparivano in monospaziato dentro un riquadro. Nel README
     * stanno dentro un `<div>` e sono rientrati di quattro spazi perché così si
     * impagina l'HTML — e quattro spazi in Markdown vogliono dire codice.
     */
    it('il rientro dell\'HTML non diventa un blocco di codice', () => {
        const readme = '<div align="center">\n    <p>Una frase normale.</p>\n</div>'
        const preparato = talosModelCardMarkdown(readme)
        expect(preparato).toBe('Una frase normale.')
        expect(renderTalosMarkdown(preparato).html).not.toContain('<pre')
    })

    it('ma un rientro che regge un elenco resta dov\'è', () => {
        const readme = '- Primo\n    - Annidato\n\n    codice indentato vero'
        const preparato = talosModelCardMarkdown(readme)
        expect(preparato).toContain('    - Annidato')
        expect(preparato).toContain('    codice indentato vero')
    })

    it('su un README vuoto non inventa niente', () => {
        expect(talosModelCardMarkdown('')).toBe('')
        expect(talosModelCardMarkdown('   \n  ')).toBe('')
    })
})

/**
 * La barriera sta a valle, non qui: questo modulo migliora la lettura, la
 * sicurezza è la lista di tag di DOMPurify. Queste due prove lo dimostrano
 * facendo passare una scheda ostile per tutta la catena.
 */
describe('una scheda ostile, dalla sorgente allo schermo', () => {
    it('non porta script né gestori di eventi fino al DOM', () => {
        const readme = '---\nlicense: mit\n---\n\n<script>fetch("https://evil")</script>\n\n<img src=x onerror="alert(1)">\n\nTesto.'
        const html = renderTalosMarkdown(talosModelCardMarkdown(readme)).html
        expect(html).not.toContain('<script')
        expect(html).not.toContain('<img')
        expect(html).not.toContain('onerror')
        expect(html).toContain('Testo.')
    })

    /**
     * L'esito che conta è che non nasca un elemento cliccabile, non che la
     * parola sparisca: markdown-it rifiuta l'indirizzo e il testo resta lì,
     * inerte, come qualunque altra parentesi quadra.
     */
    it('un link `javascript:` non diventa un link', () => {
        const html = renderTalosMarkdown(talosModelCardMarkdown('[prova](javascript:alert(1))')).html
        expect(html).not.toContain('<a ')
        expect(html).not.toContain('href')
    })
})
