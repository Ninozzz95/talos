import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '..', '..', '..')
const MANIFEST_PATH = path.join(ROOT, 'upstream', 'shadcn-vue-2.8.0-manifest.json')

function sha256(file: string): string {
    return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

describe('shadcn upstream conformance', () => {
    it('the 24 upstream files match the accepted manifest and all direct dependencies are exact', () => {
        const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
        expect(Object.keys(manifest).sort()).toEqual([
            'adaptations', 'description', 'extraction_rule', 'file_count', 'files',
            'generator', 'schema_version', 'source_evidence',
        ])
        expect(manifest.schema_version).toBe(2)
        expect(manifest.generator.name).toBe('shadcn-vue')
        expect(manifest.generator.version).toBe('2.8.0')
        expect(typeof manifest.generator.integrity).toBe('string')
        expect(manifest.file_count).toBe(24)
        expect(manifest.files).toHaveLength(24)

        const adaptations = new Map<string, { accepted_sha256: string }>(
            manifest.adaptations.map((row: { destination: string; accepted_sha256: string }) => [
                row.destination,
                row,
            ]),
        )
        const destinations = new Set<string>()
        for (const row of manifest.files) {
            expect(Object.keys(row).sort()).toEqual(['destination', 'sha256', 'source_probe_path'])
            expect(row.sha256).toMatch(/^[0-9a-f]{64}$/)
            expect(
                row.destination === 'mobile/src/lib/utils.ts'
                || /^mobile\/src\/components\/ui\/(button|dialog|drawer)\//.test(row.destination),
            ).toBe(true)
            expect(destinations.has(row.destination)).toBe(false)
            destinations.add(row.destination)

            const realPath = path.join(ROOT, row.destination.replace(/^mobile\//, ''))
            expect(fs.existsSync(realPath), `${row.destination} must exist`).toBe(true)
            expect(sha256(realPath), `${row.destination} hash`).toBe(
                adaptations.get(row.destination)?.accepted_sha256 ?? row.sha256,
            )
        }
    })

    it('keeps every local adaptation closed, unique, and anchored to its upstream hash', () => {
        const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
        const upstream = new Map<string, string>(
            manifest.files.map((row: { destination: string; sha256: string }) => [
                row.destination,
                row.sha256,
            ]),
        )
        const expectedDestinations = [
            'mobile/src/components/ui/dialog/DialogContent.vue',
            'mobile/src/components/ui/dialog/DialogFooter.vue',
            'mobile/src/components/ui/dialog/DialogScrollContent.vue',
        ]
        expect(manifest.adaptations.map((row: { destination: string }) => row.destination).sort())
            .toEqual(expectedDestinations)

        const seen = new Set<string>()
        for (const row of manifest.adaptations) {
            expect(Object.keys(row).sort()).toEqual([
                'accepted_sha256',
                'destination',
                'reason',
                'research',
                'upstream_sha256',
            ])
            expect(seen.has(row.destination), `${row.destination} adaptation duplicated`).toBe(false)
            seen.add(row.destination)
            expect(upstream.has(row.destination), `${row.destination} adaptation is orphaned`).toBe(true)
            expect(row.upstream_sha256).toBe(upstream.get(row.destination))
            expect(row.accepted_sha256).toMatch(/^[0-9a-f]{64}$/)
            expect(row.accepted_sha256).not.toBe(row.upstream_sha256)
            expect(row.reason.trim().length).toBeGreaterThan(20)
            expect(row.research).toBe('mobile/docs/superpowers/research/2026-07-29-p0-localization-conformance-closure-research.md')
            const researchPath = path.join(ROOT, row.research.replace(/^mobile\//, ''))
            expect(fs.existsSync(researchPath), `${row.research} must exist`).toBe(true)
        }
    })

    it('package.json direct dependencies contain no range or latest specifiers', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
        for (const section of ['dependencies', 'devDependencies']) {
            for (const [name, spec] of Object.entries<string>(pkg[section] ?? {})) {
                const exact = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(spec) || spec.startsWith('file:')
                expect(exact, `${section}.${name} = ${spec}`).toBe(true)
            }
        }
    })
})
