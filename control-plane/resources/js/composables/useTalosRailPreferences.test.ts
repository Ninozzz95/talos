import { describe, expect, it, vi } from 'vitest'
import { useTalosRailPreferences } from './useTalosRailPreferences'

const KNOWN = ['runtime', 'calendar', 'compare', 'model_lab', 'research'] as const

function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((r) => { resolve = r })
    return { promise, resolve }
}

describe('useTalosRailPreferences', () => {
    it('hydrates order and collapse state, clamps unknown ids and persists moves', async () => {
        const persist = vi.fn().mockResolvedValue(undefined)
        const prefs = useTalosRailPreferences({
            load: async () => ({
                order: ['compare', 'ghost_item', 'runtime'],
                collapsedGroups: ['workbench'],
                collapsed: true,
            }),
            persist,
            knownItemIds: KNOWN,
        })

        await prefs.hydrate()

        expect(prefs.order.value).toEqual(['compare', 'runtime', 'calendar', 'model_lab', 'research'])
        expect(prefs.collapsedGroups.value).toEqual(['workbench'])
        expect(prefs.collapsed.value).toBe(true)
        expect(persist).not.toHaveBeenCalled()

        prefs.moveItem('calendar', -1)
        expect(prefs.order.value).toEqual(['compare', 'calendar', 'runtime', 'model_lab', 'research'])
        expect(persist).toHaveBeenCalledTimes(1)
        expect(persist).toHaveBeenLastCalledWith({
            order: ['compare', 'calendar', 'runtime', 'model_lab', 'research'],
            collapsedGroups: ['workbench'],
            collapsed: true,
        })

        prefs.moveItem('compare', -1)
        expect(prefs.order.value[0]).toBe('compare')

        prefs.toggleGroup('workbench')
        expect(prefs.collapsedGroups.value).toEqual([])
        expect(persist).toHaveBeenCalledTimes(2)
    })

    it('a late hydrate response cannot overwrite a newer user move', async () => {
        const slow = deferred<{ order: string[] }>()
        const persist = vi.fn().mockResolvedValue(undefined)
        const prefs = useTalosRailPreferences({
            load: () => slow.promise,
            persist,
            knownItemIds: KNOWN,
        })

        const hydration = prefs.hydrate()
        prefs.moveItem('research', -1)
        const orderAfterMove = [...prefs.order.value]
        expect(orderAfterMove).toEqual(['runtime', 'calendar', 'compare', 'research', 'model_lab'])

        slow.resolve({ order: ['model_lab', 'runtime', 'calendar', 'compare', 'research'] })
        await hydration

        expect(prefs.order.value).toEqual(orderAfterMove)
    })

    it('setOrder drops unknown ids, appends missing known ids and persists once', async () => {
        const persist = vi.fn().mockResolvedValue(undefined)
        const prefs = useTalosRailPreferences({
            load: async () => null,
            persist,
            knownItemIds: KNOWN,
        })
        await prefs.hydrate()

        prefs.setOrder(['research', 'nope', 'runtime'])

        expect(prefs.order.value).toEqual(['research', 'runtime', 'calendar', 'compare', 'model_lab'])
        expect(persist).toHaveBeenCalledTimes(1)
    })

    it('null load keeps canonical order without persisting', async () => {
        const persist = vi.fn().mockResolvedValue(undefined)
        const prefs = useTalosRailPreferences({
            load: async () => null,
            persist,
            knownItemIds: KNOWN,
        })
        await prefs.hydrate()

        expect(prefs.order.value).toEqual([...KNOWN])
        expect(prefs.collapsed.value).toBe(false)
        expect(prefs.collapsedGroups.value).toEqual([])
        expect(persist).not.toHaveBeenCalled()
    })
})
