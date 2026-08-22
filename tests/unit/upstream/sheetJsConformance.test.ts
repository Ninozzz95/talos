import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '..', '..', '..')
const MANIFEST_PATH = path.join(ROOT, 'upstream', 'sheetjs', 'xlsx-0.20.3-manifest.json')
const TARBALL_PATH = path.join(ROOT, 'upstream', 'sheetjs', 'xlsx-0.20.3.tgz')
const DEPENDENCY_SPEC = 'file:upstream/sheetjs/xlsx-0.20.3.tgz'
const INTEGRITY = 'sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA=='

function digest(algorithm: 'sha256' | 'sha512', file: string, encoding: 'hex' | 'base64'): string {
    return createHash(algorithm).update(fs.readFileSync(file)).digest(encoding)
}

describe('SheetJS upstream conformance', () => {
    it('pins the official 0.20.3 tarball instead of the stale npm registry package', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
        const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'))
        const installed = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'xlsx', 'package.json'), 'utf8'))

        expect(pkg.dependencies.xlsx).toBe(DEPENDENCY_SPEC)
        expect(lock.packages[''].dependencies.xlsx).toBe(DEPENDENCY_SPEC)
        expect(lock.packages['node_modules/xlsx']).toMatchObject({
            version: '0.20.3',
            resolved: DEPENDENCY_SPEC,
            integrity: INTEGRITY,
        })
        expect(installed).toMatchObject({
            name: 'xlsx',
            version: '0.20.3',
            license: 'Apache-2.0',
        })
    })

    it('fails closed when the vendored tarball or its provenance drifts', () => {
        const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))

        expect(Object.keys(manifest).sort()).toEqual(['artifact', 'package', 'schema_version'])
        expect(manifest.schema_version).toBe(1)
        expect(manifest.package).toEqual({
            name: 'xlsx',
            version: '0.20.3',
            license: 'Apache-2.0',
            repository: 'https://git.sheetjs.com/SheetJS/sheetjs',
            source_url: 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz',
        })
        expect(manifest.artifact).toEqual({
            path: 'mobile/upstream/sheetjs/xlsx-0.20.3.tgz',
            size: 2409319,
            sha256: '8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8',
            integrity: INTEGRITY,
        })

        expect(fs.statSync(TARBALL_PATH).size).toBe(manifest.artifact.size)
        expect(digest('sha256', TARBALL_PATH, 'hex')).toBe(manifest.artifact.sha256)
        expect(`sha512-${digest('sha512', TARBALL_PATH, 'base64')}`).toBe(manifest.artifact.integrity)
    })
})
