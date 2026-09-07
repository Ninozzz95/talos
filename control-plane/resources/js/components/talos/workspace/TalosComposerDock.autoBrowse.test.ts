import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./TalosComposerDock.vue', import.meta.url), 'utf8')

describe('TalosComposerDock auto-browse prompt', () => {
    it('renders a dismissable "browse this link?" banner gated on autoBrowseUrl', () => {
        expect(source).toContain('data-testid="talos-auto-browse-prompt"')
        expect(source).toMatch(/v-if="autoBrowseUrl"/)
        // shows the detected host, not the raw URL
        expect(source).toContain('{{ autoBrowseHost }}')
    })

    it('accept and dismiss are wired to their own emits', () => {
        expect(source).toContain("emit('acceptAutoBrowse')")
        expect(source).toContain("emit('dismissAutoBrowse')")
        expect(source).toMatch(/acceptAutoBrowse: \[\]/)
        expect(source).toMatch(/dismissAutoBrowse: \[\]/)
    })
})
