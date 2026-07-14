import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const packageJson = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as {
    dependencies?: Record<string, string>
}
const packageLock = JSON.parse(readFileSync(new URL('../../../package-lock.json', import.meta.url), 'utf8')) as {
    packages?: Record<string, { version?: string; resolved?: string; integrity?: string; license?: string }>
}
const interactionSource = readFileSync(new URL('../composables/useTalosWindowInteractions.ts', import.meta.url), 'utf8')
const noticesUrl = new URL('../../../../THIRD_PARTY_NOTICES.md', import.meta.url)
const architectureUrl = new URL('../../../../docs/architecture/talos-window-interaction-engine.md', import.meta.url)

describe('TALOS window interaction upstream contract', () => {
    it('pins and directly imports the maintained interaction engine', () => {
        expect(packageJson.dependencies?.interactjs).toBe('1.10.27')
        expect(packageLock.packages?.['node_modules/interactjs']).toMatchObject({
            version: '1.10.27',
            resolved: 'https://registry.npmjs.org/interactjs/-/interactjs-1.10.27.tgz',
            integrity: 'sha512-y/8RcCftGAF24gSp76X2JS3XpHiUvDQyhF8i7ujemBz77hwiHDuJzftHx7thY8cxGogwGiPJ+o97kWB6eAXnsA==',
            license: 'MIT',
        })
        expect(interactionSource).toMatch(/from ['"]interactjs['"]/)
        expect(interactionSource).not.toContain('bindTalosPointerSession')
    })

    it('ships license notice, provenance, adapter ownership, and upgrade/rollback gates', () => {
        expect(existsSync(noticesUrl)).toBe(true)
        expect(existsSync(architectureUrl)).toBe(true)
        const notices = readFileSync(noticesUrl, 'utf8')
        const architecture = readFileSync(architectureUrl, 'utf8')

        expect(notices).toContain('interactjs 1.10.27')
        expect(notices).toContain('Copyright (c) 2012-present Taye Adeyemi')
        expect(notices).toContain('MIT License')
        expect(architecture).toContain('useTalosWindowInteractions.ts')
        expect(architecture).toContain('Health gate')
        expect(architecture).toContain('Upgrade gate')
        expect(architecture).toContain('Rollback gate')
        expect(architecture).toContain('No Odysseus AGPL source code')
    })
})
