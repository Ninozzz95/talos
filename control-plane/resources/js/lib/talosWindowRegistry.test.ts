import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
    TALOS_WINDOW_IDS,
    TALOS_WINDOW_REGISTRY,
    type TalosWindowId,
} from './talosWindowRegistry'

const EXPECTED_IDS: TalosWindowId[] = [
    'runtime',
    'search',
    'brain',
    'calendar',
    'compare',
    'model_lab',
    'research',
    'gallery',
    'library',
    'notes',
    'tasks',
    'settings',
    'theme',
    'doctor',
    'tools',
]

describe('TALOS window registry', () => {
    it('owns one complete descriptor for every supported window', () => {
        expect(TALOS_WINDOW_IDS).toEqual(EXPECTED_IDS)
        expect(Object.keys(TALOS_WINDOW_REGISTRY)).toEqual(EXPECTED_IDS)

        for (const id of EXPECTED_IDS) {
            const descriptor = TALOS_WINDOW_REGISTRY[id]
            expect(descriptor.id).toBe(id)
            expect(descriptor.title.trim()).not.toBe('')
            expect(descriptor.description.trim()).not.toBe('')
            expect(descriptor.minDesktopSize.width).toBeGreaterThan(0)
            expect(descriptor.minDesktopSize.height).toBeGreaterThan(0)
            expect(descriptor.defaultDesktopSize.width).toBeGreaterThanOrEqual(descriptor.minDesktopSize.width)
            expect(descriptor.defaultDesktopSize.height).toBeGreaterThanOrEqual(descriptor.minDesktopSize.height)
            expect(descriptor.capabilities).toEqual(expect.arrayContaining(['close', 'minimize']))
            expect(descriptor.mobile).toEqual({
                presentation: 'sheet',
                draggable: false,
                resizable: false,
                internalScroll: true,
            })
            expect(typeof descriptor.loader).toBe('function')
        }
    })

    it('keeps section defaults inside their declared registry sections', () => {
        for (const descriptor of Object.values(TALOS_WINDOW_REGISTRY)) {
            const sectionIds = descriptor.sections.map((section) => section.id)
            expect(new Set(sectionIds).size).toBe(sectionIds.length)
            if (descriptor.defaultSection) {
                expect(sectionIds).toContain(descriptor.defaultSection)
            }
        }
    })

    it('uses one dynamic module boundary per registered window', () => {
        const source = readFileSync(new URL('./talosWindowRegistry.ts', import.meta.url), 'utf8')
        for (const id of EXPECTED_IDS) {
            expect(source).toMatch(new RegExp(`${id}:\\s*descriptor\\([\\s\\S]*?loader:\\s*\\(\\)\\s*=>\\s*import\\(`))
        }
    })

    it('keeps business panels out of the eager window renderer', () => {
        const source = readFileSync(new URL('../components/talos/workspace/TalosWindowLayer.vue', import.meta.url), 'utf8')
        const eagerBusinessImports = [
            'TalosBenchmarkWorkbench',
            'TalosCookbook',
            'TalosModelCenter',
            'TalosContextVault',
            'TalosRunTimeline',
            'TalosToolRegistry',
            'TalosMemoryManager',
            'TalosResearchWorkbench',
            'TalosDocuments',
            'TalosArtifactGallery',
            'TalosNotes',
            'TalosTasks',
            'TalosCalendar',
            'TalosEmailTriage',
            'TalosDoctorPanel',
            'TalosSettingsCenter',
            'TalosThemeEngine',
        ]

        for (const component of eagerBusinessImports) {
            expect(source).not.toMatch(new RegExp(`^import ${component} `, 'm'))
        }
    })

    it('every window carries the frozen v7 station identity (title + 3-letter code)', () => {
        const expected: Record<string, { title: string; code: string }> = {
            runtime: { title: 'Cockpit', code: 'RUN' },
            calendar: { title: 'Calendar', code: 'CAL' },
            compare: { title: 'Benchmarks', code: 'BNC' },
            model_lab: { title: 'Model Lab', code: 'LAB' },
            research: { title: 'Research', code: 'RES' },
            gallery: { title: 'Artifacts', code: 'ART' },
            library: { title: 'Library', code: 'LIB' },
            search: { title: 'Vault', code: 'VLT' },
            brain: { title: 'Memory', code: 'MEM' },
            notes: { title: 'Notes', code: 'NTS' },
            tasks: { title: 'Tasks', code: 'TSK' },
            tools: { title: 'Tools', code: 'TLS' },
            doctor: { title: 'Doctor', code: 'DOC' },
            settings: { title: 'Settings', code: 'SET' },
            theme: { title: 'Theme', code: 'THM' },
        }

        for (const [id, identity] of Object.entries(expected)) {
            const descriptor = TALOS_WINDOW_REGISTRY[id as keyof typeof TALOS_WINDOW_REGISTRY]
            expect(descriptor, `descriptor ${id} must exist`).toBeTruthy()
            expect(descriptor.title, `title for ${id}`).toBe(identity.title)
            expect(descriptor.stationCode, `stationCode for ${id}`).toBe(identity.code)
        }

        for (const descriptor of Object.values(TALOS_WINDOW_REGISTRY)) {
            expect(descriptor.stationCode).toMatch(/^[A-Z]{3}$/)
        }
    })
})
