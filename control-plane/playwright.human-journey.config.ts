import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'node:path'

const fallbackRunId = `adhoc-${process.pid}-${Date.now()}`
const artifactRoot = resolve(process.env.TALOS_HJ_ARTIFACT_ROOT ?? `storage/human-journey/${fallbackRunId}`)
const baseURL = parseReadyBaseUrl(process.env.TALOS_HJ_BASE_URL)

function parseReadyBaseUrl(value: string | undefined): string | undefined {
    if (value === undefined) {
        return undefined
    }

    const parsed = new URL(value)
    if (
        parsed.protocol !== 'http:'
        || parsed.hostname !== '127.0.0.1'
        || !/^\d{1,5}$/.test(parsed.port)
        || Number(parsed.port) < 1
        || Number(parsed.port) > 65_535
        || parsed.username !== ''
        || parsed.password !== ''
        || parsed.pathname !== '/'
        || parsed.search !== ''
        || parsed.hash !== ''
    ) {
        throw new Error('TALOS_HJ_BASE_URL must be an exact loopback HTTP origin.')
    }

    return parsed.origin
}

export default defineConfig({
    testDir: './tests/human-journey',
    timeout: 15_000,
    fullyParallel: false,
    forbidOnly: true,
    retries: 0,
    workers: 1,
    use: baseURL === undefined ? {} : { baseURL: baseURL },
    outputDir: resolve(artifactRoot, 'test-results'),
    reporter: [
        ['list'],
        ['json', { outputFile: resolve(artifactRoot, 'results.json') }],
        ['html', { open: 'never', outputFolder: resolve(artifactRoot, 'report') }],
    ],
    projects: [
        {
            name: 'contracts',
            testMatch: /unit\/.*\.spec\.ts/,
        },
        {
            name: 'chromium',
            testMatch: /specs\/.*\.spec\.ts/,
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'mobile-chrome',
            testMatch: /specs\/.*\.spec\.ts/,
            use: { ...devices['Pixel 7'] },
        },
    ],
})
