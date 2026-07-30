import { beforeEach, describe, expect, it } from 'vitest'
import {
    talosDeviceIssues,
    talosLogDeviceIssue,
    __resetTalosDeviceLogForTests,
} from '@/lib/talosDeviceLog'

/**
 * Two limits found while building the failure instrument the owner asked for
 * on 2026-07-30. Both would have quietly ruined the evidence it exists to
 * carry, so they are fixed before anything is wired into it.
 */
describe('the device issue ring', () => {
    beforeEach(() => { __resetTalosDeviceLogForTests() })

    /**
     * The detail was capped at 300 characters — a size chosen when entries were
     * one-line notes. A real diagnosis carries the shape of what arrived AND
     * what the schema wanted, and at 300 it arrives cut in half, which is the
     * half that would have said why.
     */
    it('carries a full diagnosis instead of the first third of one', () => {
        const diagnosis = `shape=${'{a:string, '.repeat(40)}} wanted=content.0.text:invalid_type`
        talosLogDeviceIssue('TALOS_PROVIDER_MALFORMED', diagnosis)

        const [entry] = talosDeviceIssues()
        expect(entry?.detail).toContain('wanted=content.0.text:invalid_type')
        expect(entry?.detail.length).toBeGreaterThan(300)
    })

    /**
     * The ring holds 50. A failure inside a retry loop used to fill all 50 with
     * copies of itself and evict everything that came before — including the
     * entry that explained how the loop started. The repeat is counted instead
     * of stored again.
     */
    it('counts a repeated failure rather than flushing the ring with it', () => {
        talosLogDeviceIssue('TALOS_EARLIER', 'the entry that explains the cause')
        for (let attempt = 0; attempt < 80; attempt += 1) {
            talosLogDeviceIssue('TALOS_RETRY', 'connection reset')
        }

        const issues = talosDeviceIssues()
        expect(issues).toHaveLength(2)
        expect(issues[0]?.detail).toContain('connection reset')
        expect(issues[0]?.count).toBe(80)
        // The one that mattered is still there.
        expect(issues[1]?.detail).toBe('the entry that explains the cause')
    })

    it('does not merge two different failures that happen to alternate', () => {
        talosLogDeviceIssue('TALOS_A', 'first')
        talosLogDeviceIssue('TALOS_B', 'second')
        talosLogDeviceIssue('TALOS_A', 'first')

        expect(talosDeviceIssues()).toHaveLength(3)
    })

    it('still evicts the oldest once genuinely distinct failures overflow it', () => {
        for (let index = 0; index < 60; index += 1) {
            talosLogDeviceIssue('TALOS_DISTINCT', `failure number ${index}`)
        }

        const issues = talosDeviceIssues()
        expect(issues.length).toBeLessThanOrEqual(50)
        expect(issues[0]?.detail).toContain('59')
    })
})
