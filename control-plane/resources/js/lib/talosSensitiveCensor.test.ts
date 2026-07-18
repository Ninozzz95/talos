// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { censorSensitiveText } from './talosSensitiveCensor'

function mount(html: string): HTMLElement {
    const root = document.createElement('div')
    root.innerHTML = html
    document.body.append(root)
    return root
}

describe('talosSensitiveCensor', () => {
    it('detects emails, key shapes, bearer tokens and long secrets in text nodes and wraps each in a reveal control', () => {
        const root = mount([
            '<p>Contact ops@example.com and use sk-abcdefghijklmnopqrstuvwx to authenticate.</p>',
            '<p>Header: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload</p>',
            '<p>Digest 9f2ac41d8be07a35e2f0d1c96b84a75310fedcba9f2ac41d matches.</p>',
            '<p>password: hunter2-super-secret</p>',
        ].join(''))

        const count = censorSensitiveText(root)
        expect(count).toBeGreaterThanOrEqual(5)

        const items = root.querySelectorAll<HTMLButtonElement>('button.talos-censored')
        expect(items.length).toBe(count)

        const kinds = new Set(Array.from(items).map((item) => item.getAttribute('data-censored-kind')))
        expect(kinds.has('email')).toBe(true)
        expect(kinds.has('api_key')).toBe(true)
        expect(kinds.has('bearer')).toBe(true)
        expect(kinds.has('secret')).toBe(true)
        expect(kinds.has('password')).toBe(true)

        for (const item of items) {
            expect(item.getAttribute('type')).toBe('button')
            expect(item.hasAttribute('data-revealed')).toBe(false)
        }
    })

    it('reveal toggles one item only, is keyboard operable and never mutates copyable text', () => {
        const root = mount('<p>Mail a@b.io then mail c@d.io today.</p>')
        const textBefore = root.textContent

        censorSensitiveText(root)
        expect(root.textContent).toBe(textBefore)

        const [first, second] = Array.from(root.querySelectorAll<HTMLButtonElement>('button.talos-censored'))
        expect(first).toBeTruthy()
        expect(second).toBeTruthy()

        first.click()
        expect(first.getAttribute('data-revealed')).toBe('true')
        expect(second.hasAttribute('data-revealed')).toBe(false)

        first.click()
        expect(first.hasAttribute('data-revealed')).toBe(false)
    })

    it('ordinary prose, short hex and markdown structure stay untouched', () => {
        const root = mount([
            '<p>Commit ebf7ec3 fixed the run at 14:32 with 12 retries.</p>',
            '<pre><code>const total = items.length * 4</code></pre>',
            '<ul><li>plain point</li></ul>',
        ].join(''))
        const htmlBefore = root.innerHTML

        const count = censorSensitiveText(root)
        expect(count).toBe(0)
        expect(root.innerHTML).toBe(htmlBefore)
    })

    it('is idempotent and keeps code content copyable through textContent', () => {
        const root = mount('<pre><code>export TOKEN=sk-abcdefghijklmnopqrstuvwx</code></pre>')
        const codeTextBefore = root.querySelector('code')?.textContent

        const first = censorSensitiveText(root)
        expect(first).toBe(1)
        expect(root.querySelector('code')?.textContent).toBe(codeTextBefore)

        const second = censorSensitiveText(root)
        expect(second).toBe(0)
        expect(root.querySelectorAll('button.talos-censored').length).toBe(1)
    })
})
