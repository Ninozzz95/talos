import { describe, expect, it } from 'vitest'

describe('TalosResearchWorkbench research actions', () => {
    it('uses the research job endpoint for Start research and the report endpoint only for Queue report', async () => {
        const source = await import('./TalosResearchWorkbench.vue?raw')

        expect(source.default).toContain("startResearchJob")
        expect(source.default).toContain("createResearchReport")
        expect(source.default).toContain("@click=\"submitResearchReport('queued')\"")
        expect(source.default).toContain('@click="startResearch"')
        expect(source.default).toContain("Start research")
        expect(source.default).toContain("Queue report")
        expect(source.default).toContain("Research failed")
        expect(source.default).toContain("Research completed")
        expect(source.default).toContain("terminal state")
        expect(source.default).toContain("loadResearchCapability")
        expect(source.default).toContain("TALOS_RESEARCH_EXECUTOR_UNAVAILABLE")
        expect(source.default).toContain("Cancel research")
        expect(source.default).not.toContain("mode: 'deterministic_fixture'")
        expect(source.default).not.toContain("createFollowUpSession")
        expect(source.default).toContain("Chat with report unavailable")
        expect(source.default).toContain("ref {{ shortHash(selectedArtifact.id) }}")
        expect(source.default).not.toContain("{{ selectedArtifact.uri }}")
    })
})
