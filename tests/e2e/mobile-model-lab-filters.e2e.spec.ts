import { expect, test, type Page } from '@playwright/test'

const REVISION = 'c'.repeat(40)
const MODELS = [
    {
        id: 'unsloth/Qwen-Coder-3B-GGUF',
        sha: REVISION,
        downloads: 91_000,
        downloadsAllTime: 410_000,
        likes: 210,
        pipeline_tag: 'text-generation',
        tags: ['gguf', 'conversational', 'code-generation', 'license:apache-2.0'],
        cardData: { license: 'apache-2.0' },
        gguf: { total: 3_000_000_000, chat_template: '{{ messages }}' },
        siblings: [{
            rfilename: 'Qwen-Coder-3B-Q4_K_M.gguf',
            lfs: { size: 1_800_000_000, oid: 'a'.repeat(64) },
        }],
    },
    {
        id: 'bartowski/Plain-Chat-3B-GGUF',
        sha: REVISION,
        downloads: 50_000,
        downloadsAllTime: 200_000,
        likes: 100,
        pipeline_tag: 'text-generation',
        tags: ['gguf', 'conversational', 'license:llama3.1'],
        cardData: { license: 'llama3.1' },
        gguf: { total: 3_000_000_000 },
        siblings: [{
            rfilename: 'Plain-Chat-3B-Q4_K_M.gguf',
            lfs: { size: 1_800_000_000, oid: 'b'.repeat(64) },
        }],
    },
    {
        id: 'newpublisher/Code-3B-GGUF',
        sha: REVISION,
        downloads: 30_000,
        downloadsAllTime: 120_000,
        likes: 70,
        pipeline_tag: 'text-generation',
        tags: ['gguf', 'code-generation', 'license:mit'],
        cardData: { license: 'mit' },
        gguf: { total: 3_000_000_000 },
        siblings: [{
            rfilename: 'Code-3B-Q4_K_M.gguf',
            lfs: { size: 1_800_000_000, oid: 'd'.repeat(64) },
        }],
    },
    {
        id: 'another/Chat-Coder-3B-GGUF',
        sha: REVISION,
        downloads: 20_000,
        downloadsAllTime: 80_000,
        likes: 40,
        pipeline_tag: 'text-generation',
        tags: ['gguf', 'conversational', 'code-generation', 'license:mit'],
        cardData: { license: 'mit' },
        gguf: { total: 3_000_000_000, chat_template: '{{ messages }}' },
        siblings: [{
            rfilename: 'Chat-Coder-3B-Q8_0.gguf',
            lfs: { size: 3_200_000_000, oid: 'e'.repeat(64) },
        }],
    },
] as const

async function mockHub(page: Page): Promise<void> {
    await page.route('https://huggingface.co/api/models?*', async (route) => {
        await route.fulfill({ status: 200, json: MODELS })
    })
}

async function openModelLab(page: Page, destination: 'Local models' | 'Providers and access'): Promise<void> {
    await page.goto('/')
    await page.getByLabel('Open menu').click()
    await page.getByTestId('talos-mobile-sidebar').getByRole('button', { name: 'Open Settings' }).click()
    await page.getByTestId('settings-model-lab-link').click()
    await page.getByTestId('talos-model-lab-destination').filter({ hasText: destination }).click()
}

test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 792 })
    await mockHub(page)
})

test('combined Hugging Face facets are ANDed on one horizontally scrollable phone rail', async ({ page }) => {
    await openModelLab(page, 'Local models')
    await expect(page.getByTestId('talos-models-result')).toHaveCount(MODELS.length)

    const filters = page.getByTestId('talos-models-filters')
    await expect(filters).toContainText('Code-oriented')
    await expect(filters).toContainText('Declared permissive licence')
    for (const id of ['chat', 'code', 'q4', 'open-licence']) {
        await page.getByTestId(`talos-models-filter-${id}`).click()
    }

    await expect(page.getByTestId('talos-models-result')).toHaveCount(1)
    await expect(page.getByTestId('talos-models-result')).toContainText('unsloth/Qwen-Coder-3B-GGUF')
    await expect(page.getByTestId('talos-models-result')).toContainText('last 30 days')
    await expect(page.getByText('1 result')).toBeVisible()

    const rail = await filters.evaluate((node) => ({
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
        clientHeight: node.clientHeight,
        scrollHeight: node.scrollHeight,
        buttonTops: [...node.querySelectorAll('button')]
            .map((button) => Math.round(button.getBoundingClientRect().top)),
    }))
    expect(rail.scrollWidth).toBeGreaterThan(rail.clientWidth)
    expect(rail.scrollHeight).toBeLessThanOrEqual(rail.clientHeight + 1)
    expect(new Set(rail.buttonTops).size).toBe(1)
    for (const chip of await filters.getByRole('button').all()) {
        expect(await chip.evaluate((node) => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(48)
    }
    await filters.evaluate((node) => node.scrollTo({ left: node.scrollWidth }))
    expect(await filters.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
        .toBe(true)
})

test('an empty publisher intersection keeps its controls and reset recovers', async ({ page }) => {
    await openModelLab(page, 'Local models')
    await expect(page.getByTestId('talos-models-result')).toHaveCount(MODELS.length)

    const publisher = page.getByTestId('talos-models-provider-filter')
    await publisher.getByRole('combobox').click()
    await page.locator('[data-testid="talos-themed-select-item"][data-value="bartowski"]').click()
    await expect(publisher.getByRole('combobox')).toContainText('bartowski (1)')

    await page.getByTestId('talos-models-filter-code').click()
    await expect(page.getByTestId('talos-models-filter-empty')).toContainText('0 results')
    await expect(publisher).toBeVisible()
    await expect(publisher.getByRole('combobox')).toContainText('bartowski (1)')

    await page.getByTestId('talos-models-filter-reset').click()
    await expect(page.getByTestId('talos-models-result')).toHaveCount(MODELS.length)
    await expect(publisher.getByRole('combobox')).toContainText('Every publisher')
})

test('Hugging Face has one empty secret control only on Providers and access', async ({ page }) => {
    await openModelLab(page, 'Providers and access')
    const card = page.getByTestId('talos-hf-access-card')
    await expect(card).toHaveCount(1)
    const input = page.getByTestId('talos-hf-access-input')
    await expect(input).toHaveAttribute('type', 'password')
    await expect(input).toHaveValue('')
    await expect(page.getByTestId('settings-models-providers-screen').getByTestId('talos-hf-access-input'))
        .toHaveCount(1)

    await page.getByTestId('talos-sheet-back').click()
    await page.getByTestId('talos-model-lab-destination').filter({ hasText: 'Local models' }).click()
    await expect(page.getByTestId('settings-models-local-screen').getByTestId('talos-hf-access-input'))
        .toHaveCount(0)
    await expect(page.getByTestId('settings-models-local-screen').getByTestId('talos-models-token-input'))
        .toHaveCount(0)
})

test('Hugging Face access header keeps readable copy at phone width', async ({ page }) => {
    await openModelLab(page, 'Providers and access')
    const card = page.getByTestId('talos-hf-access-card')
    const copy = page.getByTestId('talos-hf-access-copy')
    const status = page.getByTestId('talos-hf-access-status')

    const copyBox = await copy.boundingBox()
    const statusBox = await status.boundingBox()
    expect(copyBox).not.toBeNull()
    expect(statusBox).not.toBeNull()
    expect(copyBox!.width).toBeGreaterThanOrEqual(200)
    expect(statusBox!.x).toBeGreaterThanOrEqual(copyBox!.x - 1)
    expect(statusBox!.y).toBeGreaterThan(copyBox!.y)
    expect(statusBox!.y + statusBox!.height).toBeLessThanOrEqual(copyBox!.y + copyBox!.height + 1)
    expect(await card.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
})
