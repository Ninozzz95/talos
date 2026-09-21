/**
 * Harness UI demo data — session names/status/timestamps copied verbatim from
 * the static mockup (`public/harness-ui/index.html`, `#sessionList`).
 *
 * Owner 24/8: "sidebar dinamica, relativa all'harness E a quella globale" —
 * the tablet rail now shows this SAME list embedded (TalosTabletSidebar.vue)
 * instead of the persistent chat list when the station is Harness. Extracted
 * out of HarnessScreen.vue so both consumers read the identical, single
 * source of truth.
 *
 * ⛔ The tablet redirect's default id lives in a SEPARATE tiny module
 * (`@/lib/harnessDefaultSession`), not here: App.vue's import of it is EAGER
 * (initial-chunk budget), and this array has no business riding along just
 * for one string — see that file's own comment.
 */
export interface HarnessDemoSession {
    id: string
    title: string
    meta: string
    time: string
    group: 'today' | 'yesterday' | 'week'
}

export const HARNESS_DEMO_SESSIONS: readonly HarnessDemoSession[] = [
    { id: 'refactor-auth-flow', title: 'Refactor auth flow', meta: '3 tool attivi · 1 min fa', time: '09:12', group: 'today' },
    { id: 'audit-api-permissions', title: 'Audit API permissions', meta: 'review · 8 min fa', time: '08:42', group: 'today' },
    { id: 'fix-mobile-composer', title: 'Fix mobile composer', meta: 'workspace · 9 h fa', time: '08:30', group: 'today' },
    { id: 'prepare-release-notes', title: 'Prepare release notes', meta: 'archiviata · 15 h fa', time: '15:25', group: 'yesterday' },
    { id: 'investigate-flaky-tests', title: 'Investigate flaky tests', meta: 'branch: fix/tests', time: 'Mar', group: 'week' },
]

export const HARNESS_DEMO_GROUPS = ['today', 'yesterday', 'week'] as const

export function harnessDemoSessionsIn(group: typeof HARNESS_DEMO_GROUPS[number]): readonly HarnessDemoSession[] {
    return HARNESS_DEMO_SESSIONS.filter((session) => session.group === group)
}

export function findHarnessDemoSession(id: string): HarnessDemoSession | null {
    return HARNESS_DEMO_SESSIONS.find((session) => session.id === id) ?? null
}
