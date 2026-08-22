// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MAX_TALOS_MARKDOWN_SOURCE_LENGTH, renderTalosMarkdown } from '@/lib/talosMessageMarkdown'

describe('renderTalosMarkdown', () => {
    it('pins the patched sanitizer release in both package boundaries', () => {
        const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
            dependencies?: Record<string, string>
        }
        const packageLock = JSON.parse(readFileSync(resolve(process.cwd(), 'package-lock.json'), 'utf8')) as {
            packages?: Record<string, { version?: string; integrity?: string; dependencies?: Record<string, string> }>
        }

        expect(packageJson.dependencies?.dompurify).toBe('3.4.12')
        expect(packageLock.packages?.['']?.dependencies?.dompurify).toBe('3.4.12')
        expect(packageLock.packages?.['node_modules/dompurify']).toEqual(expect.objectContaining({
            version: '3.4.12',
            integrity: 'sha512-zQvGet8Z2sWbQhCmfFz/T5QWH2oBmjnqK3qvOjaqaNLrLEF912WamU+ohnTp0TCep/MFVHpdJuCZEdFOdTnEFg==',
        }))
    })

    it('renders the frozen desktop document hierarchy with bounded code and tables', () => {
        const result = renderTalosMarkdown(`## Result

Use **verified evidence** and *inspect it*.

- first
- [x] reviewed

> Untrusted source

| State | Count |
| --- | ---: |
| Success | 2 |

\`inline\`

\`\`\`php
echo "<safe>";
\`\`\`
`, { origin: 'https://talos.example' })

        expect(result.truncated).toBe(false)
        expect(result.html).toContain('<h2>Result</h2>')
        expect(result.html).toContain('<strong>verified evidence</strong>')
        expect(result.html).toContain('<em>inspect it</em>')
        expect(result.html).toContain('aria-label="Completed task"')
        expect(result.html).toContain('talos-message-table-scroll')
        expect(result.html).toContain('<table>')
        expect(result.html).toContain('<code>inline</code>')
        expect(result.html).toContain('data-talos-copy-code')
        expect(result.html).toContain('language-php')
        expect(result.html).toContain('&lt;safe&gt;')
    })

    it('rejects executable HTML, unsafe protocols and model-authored remote images', () => {
        const result = renderTalosMarkdown(`
<img src=x onerror=alert(1)>

[script](javascript:alert(1))
[data](data:text/html;base64,PHNjcmlwdD4=)
![Screenshot](https://fabricated.example/private.png)
<form><input autofocus onfocus=alert(1)></form>
`, { origin: 'https://talos.example' })

        const container = document.createElement('div')
        container.innerHTML = result.html
        expect(container.querySelector('img, form, input, script')).toBeNull()
        expect(container.querySelector('a[href^="javascript:"], a[href^="data:"]')).toBeNull()
        expect(result.html).not.toContain('fabricated.example')
        expect(result.html).toContain('External image omitted: Screenshot')
    })

    it('marks external links safely and keeps same-origin links in place', () => {
        const result = renderTalosMarkdown(
            '[internal](/settings) [same](https://talos.example/runs) [external](https://example.com)',
            { origin: 'https://talos.example' },
        )

        expect(result.html).toContain('<a href="/settings">internal</a>')
        expect(result.html).toContain('<a href="https://talos.example/runs">same</a>')
        expect(result.html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">external</a>')
    })

    it('bounds pathological source and removes bidi and control characters', () => {
        const source = `safe\u202Ename\u0000${'x'.repeat(MAX_TALOS_MARKDOWN_SOURCE_LENGTH + 128)}`
        const result = renderTalosMarkdown(source)

        expect(result.truncated).toBe(true)
        expect(result.sourceLength).toBe(source.length)
        expect(result.html).not.toContain('\u202E')
        expect(result.html).not.toContain('\u0000')
        expect(result.html.length).toBeLessThan(MAX_TALOS_MARKDOWN_SOURCE_LENGTH + 1000)
        expect(result.html).toContain('Message truncated for safe rendering.')
    })

    it('keeps nested lists semantic and task markers read-only', () => {
        const result = renderTalosMarkdown(`- parent
  - [ ] child
    - grandchild
  - [x] complete`)
        const container = document.createElement('div')
        container.innerHTML = result.html

        expect(container.querySelectorAll(':scope > ul > li')).toHaveLength(1)
        expect(container.querySelector('ul ul li')).not.toBeNull()
        expect(container.querySelectorAll('input, button:not([data-talos-copy-code])')).toHaveLength(0)
        expect(container.querySelectorAll('.talos-task-marker')).toHaveLength(2)
    })

    it('I18N-06 renders generated semantics with the supplied locale contract', () => {
        const result = renderTalosMarkdown(`- [x] fatto

| Stato |
| --- |
| ok |

![Schermata](https://example.com/image.png)

\`\`\`
echo ok
\`\`\``, {
            labels: {
                completedTask: 'Attività completata',
                openTask: 'Attività aperta',
                scrollableTable: 'Tabella del messaggio scorrevole',
                image: 'Immagine',
                externalImageOmitted: 'Immagine esterna omessa:',
                code: 'codice',
                copyCode: 'Copia codice',
                copy: 'Copia',
                truncatedMessage: 'Messaggio troncato per una visualizzazione sicura.',
            },
        })

        expect(result.html).toContain('aria-label="Attività completata"')
        expect(result.html).toContain('aria-label="Tabella del messaggio scorrevole"')
        expect(result.html).toContain('Immagine esterna omessa: Schermata')
        expect(result.html).toContain('aria-label="Copia codice"')
        expect(result.html).toContain('>Copia</button>')
    })

    /**
     * ⛔⛔ `<br>` DENTRO UNA CELLA, e nient'altro.
     *
     * Owner 2026-08-15, su un confronto a quattro colonne: le celle
     * mostravano il tag scritto in chiaro — «Autonomous agentic
     * workflows<br>· Large-repo multi-file edits». Markdown non ha un modo
     * di andare a capo dentro una cella, e `<br>` e' l'idioma che tutti
     * usano (GitHub compreso): il modello scriveva la cosa giusta ed
     * eravamo noi a stamparla cruda.
     */
    it('⛔ va a capo dentro una cella, invece di stampare <br>', () => {
        const html = renderTalosMarkdown([
            '| a | b |',
            '| - | - |',
            '| uno<br>due | tre |',
        ].join('\n')).html
        expect(html).toContain('<br>')
        expect(html).not.toContain('&lt;br&gt;')
        expect(html).toContain('uno')
        expect(html).toContain('due')
    })

    it('e regge le tre forme che i modelli scrivono', () => {
        for (const forma of ['<br>', '<br/>', '<br />', '<BR>']) {
            const html = renderTalosMarkdown(`riga uno${forma}riga due`).html
            expect(html, forma).toContain('<br>')
            expect(html, forma).not.toContain('&lt;br')
        }
    })

    it('⛔⛔ e NESSUN altro tag passa — la superficie di rischio non cresce', () => {
        /*
         * La cura riconosce UN tag. Se qualcuno la generalizzasse ad «HTML
         * consentito», questo test cadrebbe — ed e' esattamente il momento
         * in cui deve cadere.
         */
        for (const pericoloso of [
            '<script>alert(1)</script>',
            '<img src=x onerror=alert(1)>',
            '<iframe src="https://example.com"></iframe>',
            '<style>body{display:none}</style>',
            '<brx>non e un a capo</brx>',
        ]) {
            const html = renderTalosMarkdown(pericoloso).html
            /*
             * ⛔ Si controlla il TAG, non la parola. `onerror` compare
             * nell'uscita — come testo escapato, che è precisamente ciò che
             * deve succedere. Cercare la parola darebbe un allarme dove il
             * comportamento è corretto, e un test che grida a vuoto viene
             * disattivato al primo fastidio.
             */
            expect(html, pericoloso).not.toMatch(/<(script|iframe|style|img|object|embed)\b/i)
            // Nessun gestore d'evento DENTRO un tag: `onerror=` come testo
            // escapato è innocuo, dentro `<img …>` no.
            expect(html, pericoloso).not.toMatch(/<[a-z][^>]*\son[a-z]+\s*=/i)
            expect(html, pericoloso).toContain('&lt;')
        }
    })
})
