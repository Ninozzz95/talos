/**
 * The gate the navigation research asked for: "no section reachable only by
 * hand".
 *
 * Most of these are not tests of the register's own arithmetic — that part is
 * six lines and hard to get wrong. They are tests of the promise the register
 * exists to make: that a view declared once is reachable by the tab strip, by
 * the remembered choice and by name, or by none of the three. The failure they
 * prevent is the one already in the codebase — a route query that knows about
 * categories the tab component never heard of.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
    TALOS_VIEW_SURFACES,
    talosDefaultViewOf,
    talosResolveView,
    talosViewExists,
    talosViewStorageKey,
} from '@/lib/navigation/viewRegistry'
import { TALOS_EN_MESSAGES } from '@/i18n/locales/en'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'

/** Walks a dotted message key into a catalogue, returning '' rather than throwing. */
function readMessage(messages: unknown, key: string): string {
    let node: unknown = messages
    for (const step of key.split('.')) {
        if (typeof node !== 'object' || node === null) return ''
        node = (node as Record<string, unknown>)[step]
    }
    return typeof node === 'string' ? node : ''
}

describe('the view register', () => {
    it('gives every surface at least two views and no duplicate ids', () => {
        expect(TALOS_VIEW_SURFACES.length).toBeGreaterThan(0)

        for (const surface of TALOS_VIEW_SURFACES) {
            // A one-view surface is a control that cannot be used: it would
            // render a tab strip with nothing to choose between.
            expect(surface.views.length, `${surface.id} needs a choice to offer`).toBeGreaterThan(1)

            const ids = surface.views.map((view) => view.id)
            expect(new Set(ids).size, `${surface.id} repeats a view id`).toBe(ids.length)
        }

        const surfaceIds = TALOS_VIEW_SURFACES.map((surface) => surface.id)
        expect(new Set(surfaceIds).size).toBe(surfaceIds.length)
    })

    /**
     * These two moved here from `doctorSections.test.ts` when the register
     * absorbed `TALOS_DOCTOR_SECTIONS`. They carry the owner's ask and the
     * research that answered it, so they move rather than disappear.
     *
     * Owner 2026-07-26: "organizza bene anche le sezioni nel Doctor, non voglio
     * che sia troppo affollata dal punto di vista dell'interfaccia … Insomma
     * strutturalo in modo coerente."
     *
     * They also got stricter on the way. They used to read an English `label`
     * field that nothing rendered — so they could pass while the shipped
     * Italian name was four words long. Now they read the catalogues the app
     * actually ships.
     */
    it('keeps the Doctor at three segments, so its row can never scroll', () => {
        // Apple caps segments at about five on a phone, and NN/g find that once
        // a tab row scrolls "the hidden tabs become less discoverable" — an
        // overflow carousel in a diagnostics screen hides exactly the thing
        // someone came to find.
        const doctor = TALOS_VIEW_SURFACES.find((surface) => surface.id === 'doctor')
        expect(doctor?.views.map((view) => view.id)).toEqual(['status', 'data', 'advanced'])
    })

    it('names every view in one or two plain words, in every language it ships', () => {
        for (const [language, messages] of [['it', TALOS_IT_MESSAGES], ['en', TALOS_EN_MESSAGES]] as const) {
            for (const surface of TALOS_VIEW_SURFACES) {
                for (const view of surface.views) {
                    const label = readMessage(messages, view.labelKey)
                    expect(label, `${language} → ${view.labelKey} is missing`).toBeTruthy()
                    expect(label.split(' ').length, `${language} → ${view.labelKey} is a sentence`)
                        .toBeLessThanOrEqual(2)
                    // NN/g: ALL CAPS reduces legibility, and a label must
                    // predict its content rather than brand it.
                    expect(label, `${language} → ${view.labelKey} shouts`).not.toBe(label.toUpperCase())
                }
            }
        }
    })

    it('names every view through the message catalogues, never with a literal', () => {
        // A register holding English would have to be edited to add a language,
        // and the mobile app already ships two.
        const italian = readFileSync(join(process.cwd(), 'src/i18n/locales/it.ts'), 'utf8')
        const english = readFileSync(join(process.cwd(), 'src/i18n/locales/en.ts'), 'utf8')

        const missing: string[] = []
        for (const surface of TALOS_VIEW_SURFACES) {
            for (const view of surface.views) {
                const leaf = view.labelKey.split('.').pop() ?? ''
                expect(view.labelKey, `${surface.id}/${view.id} must use a message key`).toContain('.')
                if (!italian.includes(`${leaf}:`)) missing.push(`it → ${view.labelKey}`)
                if (!english.includes(`${leaf}:`)) missing.push(`en → ${view.labelKey}`)
            }
        }
        expect(missing).toEqual([])
    })

    it('only lets a surface open a view it declared', () => {
        expect(talosViewExists('doctor', 'advanced')).toBe(true)
        expect(talosViewExists('doctor', 'catalog')).toBe(false)
        expect(talosViewExists('nowhere', 'advanced')).toBe(false)
    })

    it('falls back to the default when the remembered view no longer exists', () => {
        // The real case: a release removes a view while a device still holds
        // its name. A strip pointed at a view that is gone renders nothing.
        expect(talosResolveView('appearance', 'motion')).toBe('motion')
        expect(talosResolveView('appearance', 'a-view-we-deleted')).toBe('design')
        expect(talosResolveView('appearance', null)).toBe('design')
        expect(talosResolveView('appearance', undefined)).toBe(talosDefaultViewOf('appearance'))
        expect(talosResolveView('nowhere', 'design')).toBeUndefined()
    })

    it('gives each surface its own storage key, and the same one every time', () => {
        const keys = TALOS_VIEW_SURFACES.map((surface) => talosViewStorageKey(surface.id))
        expect(new Set(keys).size).toBe(keys.length)
        expect(talosViewStorageKey('doctor')).toBe('talos.view.doctor')
    })

    it('does not register route-backed Model Lab pages as an inline tab surface', () => {
        expect(TALOS_VIEW_SURFACES.find((surface) => surface.id === 'models')).toBeUndefined()
    })

    it('matches the views the screens actually render, so the register cannot drift', () => {
        // The whole point. If a screen adds a tab and forgets the register, the
        // view is reachable by finger and by nothing else — which is the state
        // this work exists to end.
        // Two shapes, because the screens are written two ways. Appearance and
        // Model Lab spell each tab out, so the markup is the source. Doctor
        // loops over TALOS_DOCTOR_SECTIONS — the register this file generalises
        // — so its list lives in that module instead. When Doctor is migrated,
        // this second case disappears rather than growing.
        const sources: Array<[string, string, RegExp]> = [
            // The charset is "anything but a quote" on purpose. It used to be
            // [a-z-]+, and that is not a detail: Model Lab's third tab is
            // value="onDevice", so the capital D put it outside the class and
            // the gate reported agreement while the register was missing a
            // whole view. A gate that only sees the ids it expects is not a
            // gate. The \s keeps :value="section.id" from matching as if it
            // were a literal.
            // Appearance no longer writes its own triggers — the shared strip
            // renders them straight from the register, so a trigger cannot
            // disagree with it. Its panels still can, and that is the failure
            // worth catching now: a registered view with no panel is a tab that
            // opens onto nothing, and a panel nobody registered is dead markup.
            [
                'appearance',
                'src/components/talos/settings/TalosMobileSettingsAppearancePanel.vue',
                /<TabsContent[^>]*?\svalue="([^"]+)"/g,
            ],
            // Doctor used to be read from `doctorSections.ts`, because it was the
            // one screen that already declared its sections once. That list is
            // gone: the register absorbed it, which is what "when Doctor is
            // migrated, this case disappears rather than growing" meant.
            ['doctor', 'src/screens/DoctorScreen.vue', /<TabsContent[^>]*?\svalue="([^"]+)"/g],
            ['research-report', 'src/screens/ResearchReportScreen.vue', /<TabsContent[^>]*?\svalue="([^"]+)"/g],
        ]

        for (const [surfaceId, file, pattern] of sources) {
            const source = readFileSync(join(process.cwd(), file), 'utf8')
            const rendered = new Set([...source.matchAll(pattern)].map((match) => match[1]))
            const registered = new Set(
                TALOS_VIEW_SURFACES.find((surface) => surface.id === surfaceId)?.views.map((view) => view.id),
            )
            expect(rendered.size, `${surfaceId}: found no views in ${file}`).toBeGreaterThan(0)
            expect([...rendered].sort(), `${surfaceId} renders views the register does not know`)
                .toEqual([...registered].sort())
        }
    })
})
