import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// R3-13 — desktop-ported libs are pinned by content hash so a silent edit to a
// forked-from-desktop file becomes a RED build (checksum-in-versioned-manifest,
// monorepo drift best practice). When you intentionally change one of these,
// update the manifest AND re-check the port against the recorded desktop source
// — the point is that it can never happen by accident.
const ROOT = path.resolve(__dirname, '..', '..', '..')
const MANIFEST_PATH = path.join(ROOT, 'upstream', 'desktop-ported-libs-manifest.json')

function sha256(file: string): string {
    return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

describe('desktop-ported libs conformance (R3-13)', () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))

    it('the manifest is well-formed and records a reconciled desktop revision', () => {
        expect(manifest.schema_version).toBe(1)
        expect(typeof manifest.desktop_reconciled_revision).toBe('string')
        expect(manifest.desktop_reconciled_revision.length).toBeGreaterThan(0)
        expect(Array.isArray(manifest.files)).toBe(true)
        expect(manifest.files.length).toBeGreaterThan(0)
    })

    it('every pinned ported lib matches its recorded hash (drift is a red build)', () => {
        for (const row of manifest.files) {
            expect(Object.keys(row).sort()).toEqual(['desktop_source', 'mobile_path', 'reconciliation', 'sha256'])
            expect(row.sha256).toMatch(/^[0-9a-f]{64}$/)
            expect(row.mobile_path.startsWith('mobile/src/lib/')).toBe(true)
            const realPath = path.join(ROOT, row.mobile_path.replace(/^mobile\//, ''))
            expect(fs.existsSync(realPath), `${row.mobile_path} must exist`).toBe(true)
            expect(sha256(realPath), `${row.mobile_path} diverged — update the manifest AND re-check the desktop port`).toBe(row.sha256)
        }
    })
})
