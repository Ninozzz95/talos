import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('C45-RED-18J Capacitor bridge logging policy', () => {
    it('disables payload logging in both the source config and synced Android asset', () => {
        const config = readFileSync(resolve(process.cwd(), 'capacitor.config.ts'), 'utf8')
        const generated = JSON.parse(readFileSync(resolve(
            process.cwd(),
            'android/app/src/main/assets/capacitor.config.json',
        ), 'utf8')) as { loggingBehavior?: string }
        const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
            dependencies: Record<string, string>
        }

        expect(packageJson.dependencies['@capacitor/android']).toBe('8.4.2')
        expect(config).toContain("loggingBehavior: 'none'")
        expect(generated.loggingBehavior).toBe('none')
    })
})
