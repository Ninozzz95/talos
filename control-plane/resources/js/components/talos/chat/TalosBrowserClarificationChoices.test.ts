// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, nextTick } from 'vue'
import TalosBrowserClarificationChoices from './TalosBrowserClarificationChoices.vue'

let app: ReturnType<typeof createApp> | null = null

afterEach(() => {
    app?.unmount()
    app = null
    document.body.innerHTML = ''
})

describe('TalosBrowserClarificationChoices', () => {
    it('renders persisted ordered URL choices without auto-submitting', async () => {
        const selected: string[] = []
        const root = document.createElement('div')
        document.body.append(root)
        app = createApp(TalosBrowserClarificationChoices, {
            choices: [
                { index: 1, url: 'https://one.example/path', host: 'one.example', label: 'one.example/path' },
                { index: 2, url: 'https://two.example/item', host: 'two.example', label: 'two.example/item' },
            ],
            onSelect: (prompt: string) => selected.push(prompt),
        })
        app.mount(root)

        const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-testid="talos-browser-clarification-choices"] button'))
        expect(buttons).toHaveLength(2)
        expect(buttons[0].textContent).toContain('one.example/path')
        expect(buttons[1].textContent).toContain('two.example/item')
        expect(selected).toEqual([])

        buttons[1].click()
        await nextTick()

        expect(selected).toEqual(['Open and inspect https://two.example/item'])
    })
})
