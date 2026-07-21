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
            'description', 'extraction_rule', 'file_count', 'files',
            'generator', 'schema_version', 'source_evidence',
        ])
        expect(manifest.schema_version).toBe(1)
        expect(manifest.generator.name).toBe('shadcn-vue')
        expect(manifest.generator.version).toBe('2.8.0')
        expect(typeof manifest.generator.integrity).toBe('string')
        expect(manifest.file_count).toBe(24)
        expect(manifest.files).toHaveLength(24)

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
            expect(sha256(realPath), `${row.destination} hash`).toBe(row.sha256)
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
