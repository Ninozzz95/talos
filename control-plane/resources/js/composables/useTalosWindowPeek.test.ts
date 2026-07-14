import { nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import type { TalosWindowId } from '../lib/talosWindowRegistry'
import { useTalosWindowPeek } from './useTalosWindowPeek'

describe('useTalosWindowPeek', () => {
    it('allows only appearance windows and clears transient state when a window closes', async () => {
        const visible = ref<TalosWindowId[]>(['theme', 'runtime', 'settings'])
        const peek = useTalosWindowPeek(visible)

        expect(peek.canPeek('theme')).toBe(true)
        expect(peek.canPeek('settings')).toBe(true)
        expect(peek.canPeek('runtime')).toBe(false)
        expect(peek.togglePeek('runtime')).toBe(false)

        expect(peek.togglePeek('theme')).toBe(true)
        expect(peek.isPeeked('theme')).toBe(true)
        expect(peek.togglePeek('theme')).toBe(false)
        expect(peek.isPeeked('theme')).toBe(false)

        peek.togglePeek('settings')
        visible.value = ['theme', 'runtime']
        await nextTick()
        expect(peek.isPeeked('settings')).toBe(false)

        visible.value = ['theme', 'runtime', 'settings']
        await nextTick()
        expect(peek.isPeeked('settings')).toBe(false)
    })
})
