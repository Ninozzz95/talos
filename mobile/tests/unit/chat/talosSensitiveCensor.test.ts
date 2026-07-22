// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { censorSensitiveText } from '@/lib/talosSensitiveCensor'

function mountHtml(html: string): HTMLElement {
    const root = document.createElement('div')
    root.innerHTML = html
    document.body.append(root)
    return root
}

afterEach(() => { document.body.innerHTML = '' })

describe('censorSensitiveText', () => {
    it('detects sensitive values and wraps each in an accessible reveal control', () => {
        const root = mountHtml([
            '<p>Contact ops@example.com and use sk-abcdefghijklmnopqrstuvwx.</p>',
            '<p>Header: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload</p>',
            '<p>password: hunter2-super-secret</p>',
        ].join(''))

        const count = censorSensitiveText(root)
        const items = root.querySelectorAll<HTMLButtonElement>('button.talos-censored')
        expect(count).toBeGreaterThanOrEqual(4)
        expect(items.length).toBe(count)
        expect(Array.from(items).every((item) => item.type === 'button')).toBe(true)
        expect(Array.from(items).every((item) => item.getAttribute('aria-pressed') === 'false')).toBe(true)
    })

    it('reveals only the selected sensitive item and preserves copyable text', () => {
        const root = mountHtml('<p>Mail a@b.io then mail c@d.io today.</p>')
        const textBefore = root.textContent
        censorSensitiveText(root)
        const [first, second] = Array.from(root.querySelectorAll<HTMLButtonElement>('button.talos-censored'))

        first!.click()
        expect(first!.dataset.revealed).toBe('true')
        expect(first!.getAttribute('aria-pressed')).toBe('true')
        expect(second!.dataset.revealed).toBeUndefined()
        expect(root.textContent).toBe(textBefore)
    })

    it('is idempotent and leaves ordinary prose untouched', () => {
        const root = mountHtml('<p>Commit ebf7ec3 fixed the run.</p><code>const total = 4</code>')
        const before = root.innerHTML
        expect(censorSensitiveText(root)).toBe(0)
        expect(censorSensitiveText(root)).toBe(0)
        expect(root.innerHTML).toBe(before)
    })
})
