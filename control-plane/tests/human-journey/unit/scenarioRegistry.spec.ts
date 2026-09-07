import { expect, test } from '@playwright/test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { ScenarioRegistry } from '../scenarioRegistry'
import type { HumanJourneyScenario } from '../contracts'

function scenario(id = 'BROWSER-NATURAL-001'): HumanJourneyScenario {
    return {
        contract: 'talos.human_journey.scenario',
        schema_version: 1,
        id,
        title: 'Registry fixture',
        goal: 'Load one strict human journey scenario.',
        user_facts: ['Only visible state is available.'],
        persona: { id: 'novice_it', language: 'it-IT', traits: ['novice'] },
        initial_state: { route: '/chat', authenticated: true, browse_enabled: false, conversation: [], fixture_ids: [] },
        allowed_actions: ['send_message', 'end_trial'],
        checkpoints: [{
            id: 'checkpoint-001',
            description: 'The visible goal is complete.',
            required_visible_outcomes: ['A reply is visible.'],
            acceptable_alternatives: [],
            timeout_ms: 10_000,
        }],
        forbidden_outcomes: [{ id: 'no-raw-error', description: 'No raw internal error is visible.' }],
        budgets: { max_turns: 4, max_tool_calls: 2, max_duration_ms: 30_000, max_provider_tokens: 2_000, max_cost_usd: 1 },
        perturbations: [],
        graders: [{ id: 'terminal-state', kind: 'terminal_state', expected_outcome: 'The trial ends visibly.', required: true }],
        semantic_rubric: null,
        cleanup: { strategy: 'isolated_run', preserve_failure_evidence: true, max_retention_days: 7 },
    }
}

async function withTempDirectory(run: (directory: string) => Promise<void>) {
    const directory = await mkdtemp(resolve(tmpdir(), 'talos-hj-registry-'))
    try {
        await run(directory)
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
}

test('loads canonical scenario files and resolves BROWSER-NATURAL-001', async () => {
    const repositoryScenarios = resolve('tests/human-journey/scenarios')
    const registry = await ScenarioRegistry.load(repositoryScenarios)

    expect(registry.get('BROWSER-NATURAL-001').id).toBe('BROWSER-NATURAL-001')
})

test('returns deeply immutable canonical scenarios', async () => {
    const registry = await ScenarioRegistry.load(resolve('tests/human-journey/scenarios'))
    const loaded = registry.get('BROWSER-NATURAL-001')

    expect(Object.isFrozen(loaded)).toBe(true)
    expect(Object.isFrozen(loaded.checkpoints)).toBe(true)
    expect(Object.isFrozen(loaded.checkpoints[0])).toBe(true)
    expect(() => loaded.checkpoints.push(loaded.checkpoints[0])).toThrow(TypeError)
    expect(registry.get('BROWSER-NATURAL-001').checkpoints).toHaveLength(3)
})

test('rejects duplicate scenario IDs across files', async () => {
    await withTempDirectory(async (directory) => {
        await writeFile(resolve(directory, 'one.json'), JSON.stringify(scenario()), 'utf8')
        await writeFile(resolve(directory, 'two.json'), JSON.stringify(scenario()), 'utf8')

        await expect(ScenarioRegistry.load(directory)).rejects.toThrow(/duplicate scenario id/i)
    })
})

test('rejects list-shaped JSON and unknown schema versions', async () => {
    await withTempDirectory(async (directory) => {
        await writeFile(resolve(directory, 'list.json'), JSON.stringify([scenario()]), 'utf8')
        await expect(ScenarioRegistry.load(resolve(directory, 'list.json'))).rejects.toThrow(/scenario contract/i)

        await writeFile(resolve(directory, 'version.json'), JSON.stringify({ ...scenario(), schema_version: 2 }), 'utf8')
        await expect(ScenarioRegistry.load(resolve(directory, 'version.json'))).rejects.toThrow(/scenario contract/i)
    })
})

test('rejects a directly selected scenario file without a json extension', async () => {
    await withTempDirectory(async (directory) => {
        const file = resolve(directory, 'scenario.txt')
        await writeFile(file, JSON.stringify(scenario()), 'utf8')

        await expect(ScenarioRegistry.load(file)).rejects.toThrow(/\.json/i)
    })
})

test('rejects empty, oversized and overpopulated scenario collections', async () => {
    await withTempDirectory(async (directory) => {
        await expect(ScenarioRegistry.load(directory)).rejects.toThrow(/no scenario json/i)

        await writeFile(resolve(directory, 'oversized.json'), ' '.repeat(1_048_577), 'utf8')
        await expect(ScenarioRegistry.load(resolve(directory, 'oversized.json'))).rejects.toThrow(/1 mib/i)
    })

    await withTempDirectory(async (directory) => {
        await mkdir(resolve(directory, 'ignored'))
        await Promise.all(Array.from({ length: 257 }, (_, index) => writeFile(
            resolve(directory, `${String(index).padStart(3, '0')}.json`),
            JSON.stringify(scenario(`BROWSER-LIMIT-${String(index).padStart(3, '0')}`)),
            'utf8',
        )))
        await expect(ScenarioRegistry.load(directory)).rejects.toThrow(/256 scenario files/i)
    })
})

test('fails closed for an unknown scenario lookup', async () => {
    await withTempDirectory(async (directory) => {
        await writeFile(resolve(directory, 'known.json'), JSON.stringify(scenario()), 'utf8')
        const registry = await ScenarioRegistry.load(directory)

        expect(() => registry.get('BROWSER-UNKNOWN-001')).toThrow(/unknown human journey scenario/i)
    })
})
