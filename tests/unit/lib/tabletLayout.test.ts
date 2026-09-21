import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    TALOS_TABLET_HARNESS_RAIL_COLLAPSED,
    TALOS_TABLET_SIDEBAR_DEFAULT,
    TALOS_TABLET_SIDEBAR_MAX,
    TALOS_TABLET_SIDEBAR_MIN,
    clampTalosTabletSidebarWidth,
    talosTabletSidebarEffectiveWidth,
    talosTabletLeavesHarnessListRoute,
} from '@/lib/tabletLayout'
import {
    parseTalosMobileSettings,
    useSettingsStore,
    __resetSettingsStoreForTests,
} from '@/stores/settings'
import { Preferences } from '@capacitor/preferences'

vi.mock('@capacitor/preferences', () => {
    const memory = new Map<string, string>()
    return {
        Preferences: {
            get: vi.fn(async ({ key }: { key: string }) => ({ value: memory.get(key) ?? null })),
            set: vi.fn(async ({ key, value }: { key: string; value: string }) => { memory.set(key, value) }),
            __memory: memory,
        },
    }
})

beforeEach(() => {
    __resetSettingsStoreForTests()
    ;(Preferences as unknown as { __memory: Map<string, string> }).__memory.clear()
})

// F6 — tablet resizable sidebar: the width contract lives in ONE place so the
// settings parser, the divider and the App shell can never disagree on bounds.
describe('clampTalosTabletSidebarWidth (F6)', () => {
    it('exposes the design contract: default 320 inside 260–480', () => {
        expect(TALOS_TABLET_SIDEBAR_DEFAULT).toBe(320)
        expect(TALOS_TABLET_SIDEBAR_MIN).toBe(260)
        expect(TALOS_TABLET_SIDEBAR_MAX).toBe(480)
    })

    it('passes valid widths through and rounds fractions', () => {
        expect(clampTalosTabletSidebarWidth(320)).toBe(320)
        expect(clampTalosTabletSidebarWidth(301.6)).toBe(302)
    })

    it('clamps out-of-range widths to the bounds', () => {
        expect(clampTalosTabletSidebarWidth(100)).toBe(TALOS_TABLET_SIDEBAR_MIN)
        expect(clampTalosTabletSidebarWidth(9000)).toBe(TALOS_TABLET_SIDEBAR_MAX)
    })

    it('falls back to the default on garbage (non-number, NaN, Infinity)', () => {
        expect(clampTalosTabletSidebarWidth('wide')).toBe(TALOS_TABLET_SIDEBAR_DEFAULT)
        expect(clampTalosTabletSidebarWidth(Number.NaN)).toBe(TALOS_TABLET_SIDEBAR_DEFAULT)
        expect(clampTalosTabletSidebarWidth(Number.POSITIVE_INFINITY)).toBe(TALOS_TABLET_SIDEBAR_DEFAULT)
        expect(clampTalosTabletSidebarWidth(null)).toBe(TALOS_TABLET_SIDEBAR_DEFAULT)
    })
})

describe('Harness tablet rail collapse', () => {
    it('HARNESS-TABLET-RAIL-COLLAPSE-01 only collapses the Harness variant', () => {
        expect(TALOS_TABLET_HARNESS_RAIL_COLLAPSED).toBe(72)
        expect(talosTabletSidebarEffectiveWidth(372, 'harness', true)).toBe(72)
        expect(talosTabletSidebarEffectiveWidth(372, 'harness', false)).toBe(372)
        expect(talosTabletSidebarEffectiveWidth(372, 'chat', true)).toBe(372)
    })
})

// F6 sidebar refactor (24/8): mirrors talosTabletLeavesChatsRoute's own tests
// below (same shape, same reason — the rail is now contextual and already
// shows this list, so the bare route in the main pane would duplicate it).
describe('talosTabletLeavesHarnessListRoute (F6 sidebar refactor)', () => {
    it('leaves the bare harness list route on tablet', () => {
        expect(talosTabletLeavesHarnessListRoute(true, 'harness')).toBe(true)
    })

    it('stays on harness-session (the detail route) even on tablet', () => {
        expect(talosTabletLeavesHarnessListRoute(true, 'harness-session')).toBe(false)
    })

    it('never redirects on phone', () => {
        expect(talosTabletLeavesHarnessListRoute(false, 'harness')).toBe(false)
    })

    it('never redirects other stations', () => {
        expect(talosTabletLeavesHarnessListRoute(true, 'chats')).toBe(false)
        expect(talosTabletLeavesHarnessListRoute(true, 'memory')).toBe(false)
    })

    it('a route name not yet resolved does not decide (first router tick)', () => {
        expect(talosTabletLeavesHarnessListRoute(true, null)).toBe(false)
        expect(talosTabletLeavesHarnessListRoute(true, undefined)).toBe(false)
    })
})

describe('shell.tablet_sidebar_width persistence (F6)', () => {
    it('defaults to the design width when absent', () => {
        expect(parseTalosMobileSettings(null).shell.tablet_sidebar_width).toBe(TALOS_TABLET_SIDEBAR_DEFAULT)
    })

    it('accepts a persisted width and clamps hostile values', () => {
        const parsed = parseTalosMobileSettings(JSON.stringify({ shell: { tablet_sidebar_width: 400 } }))
        expect(parsed.shell.tablet_sidebar_width).toBe(400)
        const hostile = parseTalosMobileSettings(JSON.stringify({ shell: { tablet_sidebar_width: 99999 } }))
        expect(hostile.shell.tablet_sidebar_width).toBe(TALOS_TABLET_SIDEBAR_MAX)
    })

    it('setShell persists the width and survives hydrate', async () => {
        const store = useSettingsStore()
        await store.setShell({ tablet_sidebar_width: 372 })
        __resetSettingsStoreForTests()
        const fresh = useSettingsStore()
        await fresh.hydrate()
        expect(fresh.state.shell.tablet_sidebar_width).toBe(372)
        // The sibling shell flags stay untouched by the patch.
        expect(fresh.state.shell.immersive_header).toBe(true)
        // ⛔ 2026-08-17: questo magazzino nasce senza niente di salvato, quindi
        // e un'installazione NUOVA e prende il predefinito nuovo.
        expect(fresh.state.shell.composer_shape).toBe('compact')
    })
})

describe('shell.tablet_harness_sidebar_collapsed persistence', () => {
    it('HARNESS-TABLET-RAIL-LOCAL-FIRST-01 defaults closed safely and rejects corrupt values', () => {
        expect(parseTalosMobileSettings(null).shell.tablet_harness_sidebar_collapsed).toBe(false)
        const corrupt = parseTalosMobileSettings(JSON.stringify({
            shell: { tablet_harness_sidebar_collapsed: 'yes' },
        }))
        expect(corrupt.shell.tablet_harness_sidebar_collapsed).toBe(false)
    })

    it('HARNESS-TABLET-RAIL-LOCAL-FIRST-01 survives a store reset and native hydrate', async () => {
        const store = useSettingsStore()
        await store.setShell({ tablet_harness_sidebar_collapsed: true })
        __resetSettingsStoreForTests()

        const fresh = useSettingsStore()
        await fresh.hydrate()

        expect(fresh.state.shell.tablet_harness_sidebar_collapsed).toBe(true)
        expect(fresh.state.shell.tablet_sidebar_width).toBe(TALOS_TABLET_SIDEBAR_DEFAULT)
    })
})

// R1-6 — fenced bridge gateway characterization: a HUNG native bridge call
// (Preferences.get that never settles) must reject with a ring-logged timeout
// instead of freezing settings hydration (and with it composer boot) forever.
describe('settings hydrate bridge fence (R1-6)', () => {
    it('a never-settling Preferences.get rejects hydrate within the fence', async () => {
        vi.useFakeTimers()
        try {
            const preferences = Preferences as unknown as {
                get: ReturnType<typeof vi.fn>
            }
            preferences.get.mockImplementationOnce(() => new Promise(() => {}))
            const store = useSettingsStore()
            const outcome = store.hydrate().then(() => 'resolved', (error: Error) => error.message)
            await vi.advanceTimersByTimeAsync(11_000)
            expect(await outcome).toMatch(/TIMEOUT/i)
        } finally {
            vi.useRealTimers()
        }
    })
})
