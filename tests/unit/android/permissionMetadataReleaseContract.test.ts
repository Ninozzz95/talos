import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const mobileRoot = process.cwd()

function read(relativePath: string): string {
    return readFileSync(resolve(mobileRoot, relativePath), 'utf8')
}

const proguard = read('android/app/proguard-rules.pro')

const permissionBearingPlugins = [
    'android/app/src/main/java/ai/talos/parola/TalosParolaPlugin.kt',
    'android/app/src/main/java/ai/talos/TalosDevicePermissionsPlugin.java',
    'android/app/src/main/java/ai/talos/agent/TalosCalendarioPlugin.kt',
    'android/app/src/main/java/ai/talos/agent/TalosDictationPlugin.kt',
    'android/app/src/main/java/ai/talos/agent/TalosDevicePlugin.kt',
    'android/app/src/main/java/ai/talos/agent/TalosRubricaPlugin.kt',
    'android/app/src/main/java/ai/talos/agent/TalosSpeechSicuro.java',
].map(read)

/**
 * PERM-RED-01/02 — R8 full-mode must not erase the annotation contract that
 * Capacitor reads reflectively. This is intentionally RED against the
 * pre-fix checkout: the consumer rules keep plugin methods but not the
 * annotation interfaces/members or their runtime attributes.
 */
describe('release permission metadata contract', () => {
    it('keeps the runtime annotation payload and defaults', () => {
        expect(proguard).toMatch(
            /-keepattributes[^\n]*RuntimeVisibleAnnotations[^\n]*RuntimeVisibleParameterAnnotations[^\n]*AnnotationDefault/,
        )
    })

    it('keeps every Capacitor annotation interface with its members', () => {
        for (const type of [
            'com.getcapacitor.annotation.CapacitorPlugin',
            'com.getcapacitor.annotation.Permission',
            'com.getcapacitor.annotation.PermissionCallback',
            'com.getcapacitor.annotation.ActivityCallback',
            'com.getcapacitor.PluginMethod',
        ]) {
            const escaped = type.replaceAll('.', '\\.')
            const pattern =
                '-keep(?:,[^\\n]+)?\\s+@interface\\s+'
                + escaped
                + '\\s*\\{[\\s\\S]*?\\*;'
            expect(proguard).toMatch(new RegExp(pattern))
        }
    })

    it('keeps the permission-bearing plugin inventory on the framework path', () => {
        for (const source of permissionBearingPlugins) {
            expect(source).toContain('permissions =')
            // Java writes `@Permission`, Kotlin writes `Permission(` inside the
            // annotation array; both are the same Capacitor contract.
            expect(source).toContain('Permission(')
        }
    })

    it('does not replace the public plugin identities while fixing release metadata', () => {
        const speech = read(
            'android/app/src/main/java/ai/talos/agent/TalosSpeechSicuro.java',
        )
        const dictation = read(
            'android/app/src/main/java/ai/talos/agent/TalosDictationPlugin.kt',
        )

        expect(speech).toContain('name = "SpeechRecognition"')
        expect(speech).toContain('alias = "speechRecognition"')
        expect(dictation).toContain('name = "TalosDictation"')
        expect(dictation).toContain('alias = "microfono"')
    })
})
