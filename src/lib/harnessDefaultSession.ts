/**
 * The id the bare `/harness` list route redirects to on tablet (App.vue,
 * mirroring `chats` → `chat`) — kept in its OWN tiny module, not read off
 * `HARNESS_DEMO_SESSIONS[0].id` at import time.
 *
 * App.vue's import graph is EAGER (the initial chunk `verify-initial-chunk.mjs`
 * budgets), and that array — title/meta/time strings for all five demo
 * sessions — has no business being pulled into it just for one id: Rollup
 * cannot constant-fold an array-index read, so importing anything from
 * harnessDemoSessions.ts would drag the whole runtime array along with it.
 * `harnessDemoSessions.test.ts` asserts this still equals that array's own
 * first entry, so the two can't silently drift apart.
 */
export const HARNESS_DEFAULT_SESSION_ID = 'refactor-auth-flow'
