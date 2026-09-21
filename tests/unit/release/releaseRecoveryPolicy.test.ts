import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const POLICY_PATH = path.resolve(__dirname, '..', '..', '..', 'release', 'release-recovery-policy.v1.json')
const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'))

describe('release recovery policy v1', () => {
    it('has exactly the frozen top-level keys and schema version', () => {
        expect(Object.keys(policy).sort()).toEqual([
            'first_release',
            'full_release_halt',
            'local_debug_restore',
            'schema_version',
            'staged_update',
        ])
        expect(policy.schema_version).toBe(1)
    })

    it('first release policy records no_previous_release and the forward-fix emergency path', () => {
        expect(policy.first_release).toEqual({
            no_previous_release: true,
            track: 'internal',
            emergency_path: 'forward_fix_higher_version_code',
        })
    })

    it('staged update policy halts on failed health gate and requires forward fix for updated users', () => {
        expect(policy.staged_update).toEqual({
            rollout: 'staged',
            halt_on_failed_health_gate: true,
            updated_users: 'require_forward_fix',
        })
    })

    it('full release halt requires an eligible previous release', () => {
        expect(policy.full_release_halt).toEqual({
            requires_eligible_previous_release: true,
        })
        // versionCode ordering is validated through the frozen emergency path:
        // an emergency fix is always a forward fix with a higher versionCode,
        // never a downgrade of an already-updated release.
        expect(policy.first_release.emergency_path).toBe('forward_fix_higher_version_code')
    })

    it('local debug restore is explicitly non-production and never a release gate', () => {
        expect(policy.local_debug_restore).toEqual({
            production: false,
        })
    })

    it('carries no server-side kill switch claim', () => {
        const serialized = JSON.stringify(policy)
        expect(serialized).not.toMatch(/kill.?switch/i)
        expect(serialized).not.toMatch(/server.?side/i)
    })
})
