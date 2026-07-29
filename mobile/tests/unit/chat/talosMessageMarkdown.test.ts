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
})
