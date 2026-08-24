import { describe, expect, it } from 'vitest'
import { HARNESS_DEMO_GROUPS, HARNESS_DEMO_SESSIONS, harnessDemoSessionsIn } from '@/lib/harnessDemoSessions'
import { HARNESS_DEFAULT_SESSION_ID } from '@/lib/harnessDefaultSession'

describe('harnessDemoSessions', () => {
    it('groups every demo session into exactly one of the three groups', () => {
        const grouped = HARNESS_DEMO_GROUPS.flatMap((group) => harnessDemoSessionsIn(group))
        expect(grouped).toHaveLength(HARNESS_DEMO_SESSIONS.length)
        expect(new Set(grouped.map((session) => session.id)).size).toBe(HARNESS_DEMO_SESSIONS.length)
    })

    // F6 sidebar refactor (24/8): HARNESS_DEFAULT_SESSION_ID lives in its own
    // tiny module (initial-chunk budget — see harnessDefaultSession.ts), kept
    // a literal rather than derived from this array at import time. This is
    // the guard that catches the two drifting apart, since nothing else will.
    it('the tablet redirect default still matches this list\'s first entry', () => {
        expect(HARNESS_DEFAULT_SESSION_ID).toBe(HARNESS_DEMO_SESSIONS[0].id)
    })
})
