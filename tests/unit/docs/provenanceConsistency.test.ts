import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '..', '..', '..')
const DOC = fs.readFileSync(path.join(ROOT, 'docs', 'upstream-provenance.md'), 'utf8')
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const GRADLE = path.join(ROOT, 'android', 'app', 'capacitor.build.gradle')

describe('upstream provenance consistency', () => {
    it('upstream provenance doc matches package.json and generated gradle contracts', () => {
        // No stale runtime/toolchain claims may survive.
        expect(DOC).not.toMatch(/Node 20\+/)
        expect(DOC).not.toMatch(/JDK 17/)

        // Runtime: doc reflects the pinned M1 range and Capacitor's Node 22+ floor.
        expect(pkg.engines.node).toBe('>=24.18.0 <25')
        expect(DOC).toContain('>=24.18.0 <25')
        expect(DOC).toMatch(/Node 22\+/)

        // Toolchain: doc states JDK 21 (the value the generated Gradle pins).
        expect(DOC).toMatch(/JDK 21/)
        expect(DOC).toMatch(/JavaVersion\.VERSION_21/)
        expect(DOC).toContain('21.0.11+10')
        expect(DOC).toContain('d3625e7cadf23787ea540229544b6e2ab494b3b54da1801879e583e1dfee0a64')
        expect(DOC).toContain('fbba81cae06b2bdaa145ab73d4ed3177e8843311c5fb47d38cd1457e2708d3bd')
        expect(DOC).toContain('0xC0000135')

        // Cross-check against the real generated Gradle when it exists; when the
        // android project has not been materialized yet, the doc's JDK-21 claim
        // stands on the recorded Capacitor 8.4.2 probe evidence.
        if (fs.existsSync(GRADLE)) {
            const gradle = fs.readFileSync(GRADLE, 'utf8')
            expect(gradle).toContain('JavaVersion.VERSION_21')
        }
    })

    it('the pinned build toolchain matches the amendment (typescript 5.9.3, vite 7.3.6)', () => {
        expect(pkg.devDependencies.typescript).toBe('5.9.3')
        expect(pkg.devDependencies.vite).toBe('7.3.6')
        expect(DOC).toMatch(/typescript@5\.9\.3/)
        expect(DOC).toMatch(/vite@7\.3\.6/)
    })
})
