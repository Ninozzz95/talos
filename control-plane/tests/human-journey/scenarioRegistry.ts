import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { HumanJourneyScenarioSchema, type HumanJourneyScenario } from './contracts'

const MAX_SCENARIO_FILES = 256
const MAX_SCENARIO_FILE_BYTES = 1_048_576

function deepFreezeScenario<T>(value: T, visited = new WeakSet<object>()): T {
    if (value === null || typeof value !== 'object' || visited.has(value)) return value

    visited.add(value)
    for (const nested of Object.values(value)) deepFreezeScenario(nested, visited)
    Object.freeze(value)

    return value
}

export class ScenarioRegistry {
    private constructor(private readonly scenarios: ReadonlyMap<string, HumanJourneyScenario>) {}

    static async load(inputPath: string): Promise<ScenarioRegistry> {
        const absolutePath = resolve(inputPath)
        const input = await stat(absolutePath)
        let files: string[]

        if (input.isFile()) {
            if (extname(absolutePath).toLowerCase() !== '.json') {
                throw new Error(`Human journey scenario file must use the .json extension: ${absolutePath}`)
            }
            files = [absolutePath]
        } else if (input.isDirectory()) {
            const entries = await readdir(absolutePath, { withFileTypes: true })
            files = entries
                .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.json')
                .map((entry) => resolve(absolutePath, entry.name))
                .sort((left, right) => left.localeCompare(right))
        } else {
            throw new Error(`Human journey scenario path is neither a file nor a directory: ${absolutePath}`)
        }

        if (files.length === 0) throw new Error(`No scenario JSON files found at ${absolutePath}.`)
        if (files.length > MAX_SCENARIO_FILES) throw new Error(`Human journey registry accepts at most ${MAX_SCENARIO_FILES} scenario files.`)

        const scenarios = new Map<string, HumanJourneyScenario>()
        for (const file of files) {
            const metadata = await stat(file)
            if (metadata.size > MAX_SCENARIO_FILE_BYTES) {
                throw new Error(`Human journey scenario file exceeds 1 MiB: ${file}`)
            }

            let decoded: unknown
            try {
                decoded = JSON.parse(await readFile(file, 'utf8'))
            } catch (error) {
                throw new Error(`Human journey scenario JSON is invalid: ${file}`, { cause: error })
            }

            const parsed = HumanJourneyScenarioSchema.safeParse(decoded)
            if (!parsed.success) {
                throw new Error(`Human journey scenario contract is invalid: ${file}: ${parsed.error.issues[0]?.message ?? 'unknown issue'}`)
            }
            if (scenarios.has(parsed.data.id)) {
                throw new Error(`Duplicate scenario ID: ${parsed.data.id}`)
            }
            scenarios.set(parsed.data.id, deepFreezeScenario(parsed.data))
        }

        return new ScenarioRegistry(scenarios)
    }

    get(id: string): HumanJourneyScenario {
        const scenario = this.scenarios.get(id)
        if (!scenario) throw new Error(`Unknown human journey scenario: ${id}`)
        return scenario
    }
}
