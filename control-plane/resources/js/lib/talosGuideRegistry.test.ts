import { describe, expect, it } from 'vitest'
import { TALOS_WINDOW_REGISTRY } from './talosWindowRegistry'
import {
    TALOS_GUIDE_REGISTRY,
    resolveTalosGuideEntry,
} from './talosGuideRegistry'

const EXPECTED_GUIDE_IDS = [
    'rail.runtime',
    'rail.calendar',
    'rail.compare',
    'rail.model_lab',
    'rail.research',
    'rail.gallery',
    'rail.library',
    'rail.browse',
    'rail.advanced',
    'rail.tasks',
    'rail.notes',
    'rail.search',
    'rail.brain',
    'rail.tools',
    'rail.doctor',
    'rail.settings',
    'rail.theme',
    'runtime.timeline',
    'runtime.dag',
    'runtime.replay',
    'runtime.recovery',
    'runtime.artifacts',
    'search.context',
    'search.documents',
    'library.context',
    'library.documents',
    'brain.memory',
    'brain.skills',
    'brain.skill_audit',
    'model_lab.cookbook',
    'model_lab.models',
    'model_lab.catalog',
    'tasks.tasks',
    'tasks.email',
    'doctor.doctor',
    'doctor.policy',
    'doctor.shell',
    'doctor.backup',
    'doctor.audit',
    'theme.presets',
    'theme.customize',
    'theme.library',
    'theme.motion',
    'theme.advanced',
    'settings.models',
    'settings.ai_defaults',
    'settings.search',
    'settings.browser',
    'settings.integrations',
    'settings.email',
    'settings.reminders',
    'settings.appearance',
    'settings.shortcuts',
    'settings.account',
    'settings.agent_tools',
    'settings.system',
    'settings.appearance.chat_area',
    'settings.appearance.chat_bar',
    'settings.appearance.sidebar',
    'cookbook.launch',
    'cookbook.download',
    'cookbook.dependencies',
    'cookbook.settings',
] as const

describe('TALOS canonical guide registry', () => {
    it('owns the exhaustive rail, window, settings, theme and Cookbook inventory', () => {
        expect(Object.keys(TALOS_GUIDE_REGISTRY)).toEqual(EXPECTED_GUIDE_IDS)

        for (const id of EXPECTED_GUIDE_IDS) {
            const entry = TALOS_GUIDE_REGISTRY[id]
            expect(entry.id).toBe(id)
            expect(entry.title.trim()).not.toBe('')
            expect(entry.summary.trim()).not.toBe('')
            expect(entry.details.trim()).not.toBe('')
            expect(entry.available).toBe(true)
        }
    })

    it('covers every section declared by the window registry', () => {
        for (const descriptor of Object.values(TALOS_WINDOW_REGISTRY)) {
            for (const section of descriptor.sections) {
                expect(TALOS_GUIDE_REGISTRY[`${descriptor.id}.${section.id}` as keyof typeof TALOS_GUIDE_REGISTRY]).toBeDefined()
            }
        }
    })

    it('fails closed for an unknown guide id', () => {
        expect(resolveTalosGuideEntry('unregistered.surface')).toEqual({
            id: 'unregistered.surface',
            title: 'Information unavailable',
            summary: 'No canonical guide entry is registered for this control.',
            details: 'The control remains usable, but contextual guidance is disabled until its documentation is added.',
            available: false,
        })
    })
})
