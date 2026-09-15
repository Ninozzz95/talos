import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const mobileRoot = process.cwd()

function read(relativePath: string): string {
    return readFileSync(resolve(mobileRoot, relativePath), 'utf8')
}

describe('Android InAppBrowser native contract', () => {
    it('pins the reviewed upstream plugin and satisfies its minimum SDK', () => {
        const packageJson = JSON.parse(read('package.json')) as {
            dependencies?: Record<string, string>
        }
        const variables = read('android/variables.gradle')

        expect(packageJson.dependencies?.['@capacitor/inappbrowser']).toBe('4.0.1')
        expect(variables).toMatch(/minSdkVersion\s*=\s*26\b/)
    })

    it('registers InAppBrowser in the generated Capacitor Gradle graph', () => {
        const settings = read('android/capacitor.settings.gradle')
        const appDependencies = read('android/app/capacitor.build.gradle')

        expect(settings).toContain("include ':capacitor-inappbrowser'")
        expect(settings).toContain("node_modules/@capacitor/inappbrowser/android")
        expect(appDependencies).toContain("implementation project(':capacitor-inappbrowser')")
    })
})
