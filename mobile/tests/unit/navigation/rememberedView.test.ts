import { describe, expect, it } from 'vitest'
import { talosRememberView, talosRememberedView, type TalosViewStorage } from '@/lib/navigation/rememberedView'
import { talosViewStorageKey } from '@/lib/navigation/viewRegistry'

function fakeStorage(seed: Record<string, string> = {}): TalosViewStorage & { data: Record<string, string> } {
    const data = { ...seed }
    return {
        data,
        getItem: (key: string) => data[key] ?? null,
        setItem: (key: string, value: string) => { data[key] = value },
    }
}

function throwingStorage(): TalosViewStorage {
    return {
        getItem: () => { throw new Error('storage disabled') },
        setItem: () => { throw new Error('quota exceeded') },
    }
}

describe('the remembered view', () => {
    it('comes back where you left it', () => {
        const storage = fakeStorage()
        expect(talosRememberView('appearance', 'motion', storage)).toBe(true)
        expect(talosRememberedView('appearance', storage)).toBe('motion')
    })

    it('opens on the default when nothing was ever stored', () => {
        expect(talosRememberedView('appearance', fakeStorage())).toBe('design')
    })

    it('refuses to store a view the surface does not offer', () => {
        // Otherwise the bad id outlives the release that removed the view, and
        // has to be validated back out on every single read.
        const storage = fakeStorage()
        expect(talosRememberView('appearance', 'catalog', storage)).toBe(false)
        expect(storage.data).toEqual({})
    })

    it('falls back to the default when a stored view was removed by a release', () => {
        const storage = fakeStorage({ [talosViewStorageKey('doctor')]: 'a-view-we-deleted' })
        expect(talosRememberedView('doctor', storage)).toBe('status')
    })

    it('keeps each surface in its own slot', () => {
        const storage = fakeStorage()
        talosRememberView('appearance', 'motion', storage)
        talosRememberView('doctor', 'advanced', storage)

        expect(talosRememberedView('appearance', storage)).toBe('motion')
        expect(talosRememberedView('doctor', storage)).toBe('advanced')
    })

    it('survives storage being unavailable instead of taking the screen down', () => {
        // A mobile webview can refuse localStorage outright: private mode, a
        // wiped profile, a quota. A preference that throws on read would be a
        // blank screen, which is much worse than a forgotten tab.
        expect(talosRememberedView('appearance', null)).toBe('design')
        expect(talosRememberView('appearance', 'motion', null)).toBe(false)

        expect(talosRememberedView('appearance', throwingStorage())).toBe('design')
        expect(talosRememberView('appearance', 'motion', throwingStorage())).toBe(false)
    })

    it('has nothing to offer for a surface that is not registered', () => {
        expect(talosRememberedView('nowhere', fakeStorage())).toBeUndefined()
        expect(talosRememberView('nowhere', 'design', fakeStorage())).toBe(false)
    })
})
