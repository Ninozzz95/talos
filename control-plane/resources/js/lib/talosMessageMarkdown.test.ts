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

    it('keeps nested lists semantic and task markers read-only', () => {
        const result = renderTalosMarkdown(`- parent
  - [ ] child
    - grandchild
  - [x] complete`)
        const container = document.createElement('div')
        container.innerHTML = result.html

        expect(container.querySelectorAll(':scope > ul > li')).toHaveLength(1)
        expect(container.querySelector('ul ul li')).not.toBeNull()
        expect(container.querySelectorAll('input, button')).toHaveLength(0)
        expect(container.querySelectorAll('.talos-task-marker')).toHaveLength(2)
        expect(container.querySelector('[aria-label="Open task"]')).not.toBeNull()
        expect(container.querySelector('[aria-label="Completed task"]')).not.toBeNull()
    })

    it('keeps long URLs and hashes in the bounded message output', () => {
        const value = `https://example.com/${'a'.repeat(4096)}#${'b'.repeat(4096)}`
        const result = renderTalosMarkdown(value)

        expect(result.html).toContain('href="https://example.com/')
        expect(result.html).toContain('#' + 'b'.repeat(4096))
        expect(result.html).not.toContain('style=')
    })

    it('removes bidi formatting and additional control characters', () => {
        const result = renderTalosMarkdown('safe\u061c\u200e\u200f\u200b\u0000name')

        expect(result.html).toContain('safename')
        expect(result.html.replace(/\n/g, '')).not.toMatch(/[\u0000-\u001f\u007f\u061c\u200e\u200f\u200b]/u)
    })

    it('rejects every executable HTML surface without a new HTML boundary', () => {
        const result = renderTalosMarkdown(`
<iframe src="https://evil.example"></iframe>
<object data="https://evil.example"></object>
<form action="https://evil.example"><input></form>
<style>body { background: url(https://evil.example) }</style>
<div onclick="alert(1)" onmouseover="alert(2)">unsafe</div>
<a href="javascript:alert(1)">bad</a>
<a href="data:text/html,alert(1)">data</a>
`)

        const container = document.createElement('div')
        container.innerHTML = result.html
        expect(container.querySelector('iframe, object, form, input, style')).toBeNull()
        expect(container.querySelector('[onclick], [onmouseover]')).toBeNull()
        expect(container.querySelector('a[href^="javascript:"], a[href^="data:"]')).toBeNull()
    })

    it('bounds an unbroken 100k-plus input before markdown rendering', () => {
        const source = 'x'.repeat(MAX_TALOS_MARKDOWN_SOURCE_LENGTH + 1)
        const result = renderTalosMarkdown(source)

        expect(result.sourceLength).toBe(MAX_TALOS_MARKDOWN_SOURCE_LENGTH + 1)
        expect(result.truncated).toBe(true)
        expect(result.html.length).toBeLessThan(MAX_TALOS_MARKDOWN_SOURCE_LENGTH + 1000)
        expect(result.html).toContain('Message truncated for safe rendering.')
    })
})
