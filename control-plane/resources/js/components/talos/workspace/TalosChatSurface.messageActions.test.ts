import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./TalosChatSurface.vue', import.meta.url), 'utf8')

describe('TalosChatSurface message actions placement and reveal', () => {
    it('stacks each message as a column so actions sit below the bubble', () => {
        expect(source).toContain('talos-chat-message flex flex-col')
        expect(source).toMatch(/message\.role === 'user' \? 'items-end' : 'items-start'/)
    })

    it('renders the actions outside the bubble as a sibling below it', () => {
        expect(source).toMatch(/class="talos-message-actions/)
        // The actions component is closed and followed by the article close,
        // i.e. it is a sibling of the bubble, not nested inside it.
        const actionsIndex = source.indexOf('class="talos-message-actions')
        const bubbleIndex = source.indexOf('class="talos-message-bubble')
        const articleCloseAfterActions = source.indexOf('</article>', actionsIndex)
        expect(actionsIndex).toBeGreaterThan(bubbleIndex)
        expect(articleCloseAfterActions).toBeGreaterThan(actionsIndex)
        // No bubble is opened between the actions and the article close.
        expect(source.slice(actionsIndex, articleCloseAfterActions)).not.toContain('talos-message-bubble')
    })

    it('renders message metadata and actions only at the end of a same-role group', () => {
        expect(source).toContain('function messageIsGrouped(index: number)')
        expect(source).toContain('function messageIsGroupEnd(index: number)')
        expect(source).toMatch(/v-if="message\.role !== 'system' && messageIsGroupEnd\(index\)" class="talos-message-meta/)
        expect(source).toMatch(/v-if="message\.role !== 'system' && messageIsGroupEnd\(index\)"[\s\S]*?class="talos-message-actions/)
    })

    it('keeps conditional rich-message renderers behind async chunk boundaries', () => {
        for (const component of ['TalosEvidenceDrawer', 'TalosMessageImage', 'TalosReasoningRow', 'TalosToolActivityRow']) {
            expect(source).toContain(`const ${component} = defineAsyncComponent(`)
            expect(source).toContain(`() => import('../chat/${component}.vue')`)
            expect(source).not.toMatch(new RegExp(`import ${component} from`))
        }
    })

    it('reveals actions on hover, on keyboard focus-within, and always on touch', () => {
        expect(source).toMatch(/\.talos-message-actions\s*\{[^}]*opacity:\s*0/)
        expect(source).toMatch(/\.talos-chat-message:hover\s*>\s*\.talos-message-actions/)
        expect(source).toMatch(/\.talos-chat-message:focus-within\s*>\s*\.talos-message-actions/)
        expect(source).toMatch(/@media \(hover: none\)\s*\{[\s\S]*?\.talos-message-actions\s*\{[^}]*opacity:\s*1/)
    })

    it('drops the reveal transition under reduced motion', () => {
        expect(source).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.talos-message-actions\s*\{[^}]*transition:\s*none/)
    })
})
