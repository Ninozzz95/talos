import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

describe('TALOS canonical guide surface contract', () => {
    it.each([
        ['desktop rail', '../workspace/TalosLeftRail.vue'],
        ['advanced rail group', '../workspace/TalosAdvancedRailGroup.vue'],
        ['mobile rail', '../workspace/TalosMobileRail.vue'],
        ['window section tabs', '../window/TalosWindowSectionTabs.vue'],
    ])('%s does not render contextual information inside navigation', (_name, path) => {
        const contents = source(path)

        expect(contents).not.toContain('TalosGuideInfoButton')
        expect(contents).not.toContain('#item-action')
    })

    it.each([
        ['Runtime', '../runs/TalosRunTimeline.vue', 'Runtime cockpit', 'rail.runtime'],
        ['Calendar', '../productivity/TalosCalendar.vue', 'Calendar V3', 'rail.calendar'],
        ['Compare', '../benchmarks/TalosBenchmarkWorkbench.vue', 'AVM ON/OFF evidence', 'rail.compare'],
        ['Deep Research', '../research/TalosResearchWorkbench.vue', 'Deep Research V3', 'rail.research'],
        ['Artifacts', '../documents/TalosArtifactGallery.vue', 'Evidence artifacts', 'rail.gallery'],
        ['Notes', '../productivity/TalosNotes.vue', 'Untrusted workspace notes', 'rail.notes'],
        ['Tools', '../tools/TalosToolRegistry.vue', 'Tool Registry', 'rail.tools'],
        ['Settings', '../settings/TalosSettingsCenter.vue', 'Settings Center', 'rail.settings'],
        ['Theme', '../settings/TalosThemeEngine.vue', 'Theme Engine', 'rail.theme'],
        ['Cookbook', '../cookbook/TalosCookbook.vue', 'Local model lab', 'model_lab.cookbook'],
        ['Models', '../models/TalosModelCenter.vue', 'Server-side provider profiles', 'model_lab.models'],
        ['Memory', '../memory/TalosMemoryManager.vue', 'Memory & Skills', 'brain.memory'],
        ['Skills', '../memory/TalosSkillRegistry.vue', 'Skill Registry', 'brain.skills'],
        ['Skill Audit', '../memory/TalosSkillAudit.vue', 'Skill audit', 'brain.skill_audit'],
        ['Tasks', '../productivity/TalosTasks.vue', 'Run-linked tasks', 'tasks.tasks'],
        ['Email', '../email/TalosEmailTriage.vue', 'Read-only and draft-only', 'tasks.email'],
        ['Doctor', '../admin/TalosDoctorPanel.vue', 'Runtime readiness', 'doctor.doctor'],
        ['Policy', '../admin/TalosPolicyPanel.vue', 'Capability boundary', 'doctor.policy'],
        ['Shell', '../admin/TalosShellPolicyPanel.vue', 'Audited host boundary', 'doctor.shell'],
        ['Backup', '../admin/TalosBackupPanel.vue', 'Dry-run restore policy', 'doctor.backup'],
        ['Audit', '../admin/TalosAuditLog.vue', 'Redacted security events', 'doctor.audit'],
    ])('%s places canonical information in its content heading', (_name, path, heading, guideId) => {
        const contents = source(path)
        const headingIndex = contents.indexOf(heading)
        const guideIndex = contents.indexOf(`guide-id="${guideId}"`)

        expect(contents).toContain('TalosGuideInfoButton')
        expect(headingIndex).toBeGreaterThanOrEqual(0)
        expect(guideIndex).toBeGreaterThanOrEqual(0)
        expect(Math.abs(headingIndex - guideIndex)).toBeLessThan(500)
    })

    it.each([
        ['DAG', '../runs/TalosNodeGraph.vue', 'runtime.dag'],
        ['Trace replay', '../runs/TalosTraceReplay.vue', 'runtime.replay'],
        ['Recovery', '../runs/TalosRecoveryPanel.vue', 'runtime.recovery'],
        ['Theme presets', '../settings/theme-engine/TalosThemePresets.vue', 'theme.presets'],
        ['Theme customization', '../settings/theme-engine/TalosThemeCustomize.vue', 'theme.customize'],
        ['Theme library', '../settings/theme-engine/TalosThemeLibrary.vue', 'theme.library'],
        ['Theme motion', '../settings/theme-engine/TalosThemeMotion.vue', 'theme.motion'],
        ['Advanced theme', '../settings/theme-engine/TalosThemeAdvanced.vue', 'theme.advanced'],
        ['Cookbook launch', '../cookbook/TalosCookbookLaunch.vue', 'cookbook.launch'],
        ['Cookbook download', '../cookbook/TalosCookbookDownload.vue', 'cookbook.download'],
        ['Cookbook dependencies', '../cookbook/TalosCookbookDependencies.vue', 'cookbook.dependencies'],
        ['Cookbook settings', '../cookbook/TalosCookbookSettings.vue', 'cookbook.settings'],
    ])('%s moves information from its tab into the active section heading', (_name, path, guideId) => {
        const contents = source(path)

        expect(contents).toContain('TalosGuideInfoButton')
        expect(contents).toContain(`guide-id="${guideId}"`)
    })

    it('wires shared Knowledge headings to the active window namespace', () => {
        const contents = source('../window/modules/TalosKnowledgeWindow.vue')

        expect(contents).toContain(':guide-id="`${context.id}.context`"')
        expect(contents).toContain(':guide-id="`${context.id}.documents`"')
    })

    it('keeps internal tab lists free of contextual actions', () => {
        for (const path of [
            '../runs/TalosRunTimeline.vue',
            '../cookbook/TalosCookbook.vue',
            '../settings/TalosThemeEngine.vue',
            '../settings/TalosSettingsCenter.vue',
        ]) {
            expect(source(path)).not.toContain('#item-action')
        }
    })

    it('binds every Appearance group to its canonical guide id', () => {
        const contents = source('../settings/TalosSettingsAppearancePanel.vue')

        expect(contents).toContain('TalosGuideInfoButton')
        expect(contents).toContain('settings.appearance.${group.id}')
    })
})
