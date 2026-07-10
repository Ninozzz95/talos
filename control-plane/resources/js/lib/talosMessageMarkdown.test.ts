// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { MAX_TALOS_MARKDOWN_SOURCE_LENGTH, renderTalosMarkdown } from './talosMessageMarkdown'

describe('renderTalosMarkdown', () => {
    it('renders the supported document hierarchy with bounded code and tables', () => {
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
        expect(result.html).toContain('\u2611</span> reviewed')
        expect(result.html).toContain('<blockquote>')
        expect(result.html).toContain('talos-message-table-scroll')
        expect(result.html).toContain('<table>')
        expect(result.html).toContain('<code>inline</code>')
        expect(result.html).toContain('data-talos-copy-code')
        expect(result.html).toContain('language-php')
        expect(result.html).toContain('&lt;safe&gt;')
    })

    it('rejects executable HTML and unsafe URL protocols', () => {
        const result = renderTalosMarkdown(`
<img src=x onerror=alert(1)>

[script](javascript:alert(1))
[data](data:text/html;base64,PHNjcmlwdD4=)
<form><input autofocus onfocus=alert(1)></form>
`, { origin: 'https://talos.example' })

        const container = document.createElement('div')
        container.innerHTML = result.html
        expect(container.querySelector('img, form, input, script')).toBeNull()
        expect(container.querySelector('a[href^="javascript:"], a[href^="data:"]')).toBeNull()
        expect(result.html).not.toMatch(/<(?:img|form|input|script)(?:\s|>)/i)
        expect(result.html).toContain('&lt;img')
    })

    it('marks external links safely and keeps same-origin links in place', () => {
        const result = renderTalosMarkdown('[internal](/settings) [same](https://talos.example/runs) [external](https://example.com)', { origin: 'https://talos.example' })

        expect(result.html).toContain('<a href="/settings">internal</a>')
        expect(result.html).toContain('<a href="https://talos.example/runs">same</a>')
        expect(result.html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">external</a>')
    })

    it('renders model-authored remote image markdown as inert text instead of a clickable artifact URL', () => {
        const result = renderTalosMarkdown('![Screenshot Caradero](https://fabricated.example/private.png)', { origin: 'https://talos.example' })

        const container = document.createElement('div')
        container.innerHTML = result.html
        expect(container.querySelector('img, a')).toBeNull()
        expect(result.html).not.toContain('fabricated.example')
        expect(result.html).toContain('External image omitted: Screenshot Caradero')
    })

    it('bounds pathological input and removes bidi and control characters', () => {
        const source = `safe\u202Ename\u0000${'x'.repeat(MAX_TALOS_MARKDOWN_SOURCE_LENGTH + 128)}`
        const result = renderTalosMarkdown(source)

        expect(result.truncated).toBe(true)
        expect(result.sourceLength).toBe(source.length)
        expect(result.html).not.toContain('\u202E')
        expect(result.html).not.toContain('\u0000')
        expect(result.html).toContain('Message truncated for safe rendering.')
    })

    it('renders malformed fences as inert escaped content', () => {
        const result = renderTalosMarkdown('```html\n<script>alert(1)</script>')

        expect(result.html).not.toContain('<script>')
        expect(result.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    })
})
