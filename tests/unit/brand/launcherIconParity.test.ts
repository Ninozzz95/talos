import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import finalFrame from '@/assets/talosBootFinalFrame.json'

const PRESETS = [
    'forge',
    'paper',
    'terminal',
    'aurora',
    'glacier',
    'ember',
    'atlas',
    'noir',
    'signal',
    'violet',
    'claudius',
    'basicus',
    'telemetry',
    'calm',
] as const

const RES = resolve(process.cwd(), 'android/app/src/main/res')
const TOOLS = resolve(process.cwd(), 'tools/android-assets')
const BOOT_SOURCE = readFileSync(
    resolve(process.cwd(), 'src/components/brand/TalosBootLogo.vue'),
    'utf8',
)

function foreground(theme: string) {
    return readFileSync(resolve(RES, `drawable/ic_talos_fg_${theme}.xml`), 'utf8')
}

function adaptive(name: string) {
    return readFileSync(resolve(RES, `mipmap-anydpi-v26/${name}.xml`), 'utf8')
}

describe('Android launcher mirrors the completed boot symbol', () => {
    it('LAUNCHER-SYMBOL-01 encodes only the rested hex and lit DAG in every theme', () => {
        for (const theme of PRESETS) {
            const xml = foreground(theme)

            expect(xml).toContain('android:viewportWidth="600"')
            expect(xml).toContain('android:viewportHeight="600"')
            expect(xml).toContain('android:strokeAlpha="0.18"')
            expect(xml.match(
                /android:fillColor="#(?!00000000)(?:[0-9a-f]{6}|[0-9a-f]{8})"/gi,
            )).toHaveLength(5)
            expect(xml).not.toContain(finalFrame.wordmark.path)
        }
    })

    it('LAUNCHER-SYMBOL-02 uses the centered symbol transform proven to fit the 48-66dp guidance', () => {
        const bounds = finalFrame.adaptive.visualBounds
        const viewport = Number(finalFrame.viewBox.split(' ')[2])
        const widthDp = (
            (bounds.right - bounds.left)
            * finalFrame.adaptive.scale
            * finalFrame.canvasDp
            / viewport
        )
        const heightDp = (
            (bounds.bottom - bounds.top)
            * finalFrame.adaptive.scale
            * finalFrame.canvasDp
            / viewport
        )
        expect(finalFrame.adaptive).toMatchObject({ content: 'mark-only' })
        expect(widthDp).toBeGreaterThanOrEqual(48)
        expect(heightDp).toBeGreaterThanOrEqual(48)
        expect(widthDp).toBeLessThanOrEqual(finalFrame.safeZoneDp)
        expect(heightDp).toBeLessThanOrEqual(finalFrame.safeZoneDp)

        for (const theme of PRESETS) {
            const xml = foreground(theme)

            expect(xml).toContain('android:scaleX="1"')
            expect(xml).toContain('android:scaleY="1"')
            expect(xml).toContain('android:pivotX="300"')
            expect(xml).toContain('android:pivotY="300"')
            expect(xml).toContain('android:translateX="50"')
            expect(xml).toContain('android:translateY="50"')
        }
    })

    it('LAUNCHER-SYMBOL-03 exposes the matching foreground as monochrome for every adaptive alias', () => {
        for (const theme of PRESETS) {
            for (const suffix of ['', '_round']) {
                const xml = adaptive(`ic_launcher_${theme}${suffix}`)
                expect(xml).toContain(
                    `<monochrome android:drawable="@drawable/ic_talos_fg_${theme}" />`,
                )
            }
        }

        for (const suffix of ['', '_round']) {
            const xml = adaptive(`ic_launcher${suffix}`)
            expect(xml).toContain(
                '<monochrome android:drawable="@drawable/ic_talos_fg_calm" />',
            )
        }
    })

    it('LAUNCHER-SYMBOL-05 generator check proves tracked outputs match the canonical source', () => {
        const python = process.platform === 'win32' ? 'python' : 'python3'
        const result = spawnSync(
            python,
            [resolve(TOOLS, 'gen_theme_icons.py'), '--check'],
            { cwd: process.cwd(), encoding: 'utf8' },
        )

        expect(result.status, result.stderr || result.stdout).toBe(0)
        expect(result.stdout).toContain('CHECK OK')
    })

    it('LAUNCHER-SYMBOL-06 retains the boot mark and keeps the boot-only wordmark contract', () => {
        const bootHex = BOOT_SOURCE.match(
            /class="hex"[\s\S]*?\sd="([^"]+)"/,
        )?.[1]

        expect(finalFrame.schema).toBe('talos.boot-final-frame/1')
        expect(finalFrame.mark.hex.path).toBe(bootHex)
        expect(finalFrame.mark.hex.strokeOpacity).toBe(0.18)
        expect(finalFrame.mark.nodes).toHaveLength(3)
        expect(finalFrame.mark.branches).toHaveLength(2)
        expect(finalFrame.wordmark).toMatchObject({
            text: 'TALOS',
            fontPackage: '@fontsource/orbitron',
            fontVersion: '5.3.0',
            fontWeight: 600,
            letterSpacingEm: 0.35,
            license: 'OFL-1.1',
        })
        expect(BOOT_SOURCE).toContain('font-weight: 600')
        expect(BOOT_SOURCE).toContain('letter-spacing: 0.35em')
    })

    it('LAUNCHER-SYMBOL-07 emits LF-only generated resources on every host OS', () => {
        const generated = [
            ...PRESETS.map(theme => resolve(RES, `drawable/ic_talos_fg_${theme}.xml`)),
            ...PRESETS.flatMap(theme => ['', '_round'].map(
                suffix => resolve(RES, `mipmap-anydpi-v26/ic_launcher_${theme}${suffix}.xml`),
            )),
            resolve(RES, 'mipmap-anydpi-v26/ic_launcher.xml'),
            resolve(RES, 'mipmap-anydpi-v26/ic_launcher_round.xml'),
        ]

        for (const path of generated) {
            expect(readFileSync(path).includes(0x0d), path).toBe(false)
        }
    })
})
