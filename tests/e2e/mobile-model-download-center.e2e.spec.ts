import { expect, test, type Page } from '@playwright/test'

async function installTransferBridge(page: Page): Promise<void> {
    await page.addInitScript(() => {
        type TransferItem = {
            id: string
            jobId: number
            createdAtMs: number
            phase: 'waiting' | 'queued' | 'running' | 'paused'
            active: boolean
            repo: string
            revision: string
            paths: string[]
            modelName: string
            haveBytes: number
            totalBytes: number
            runner: 'USER_INITIATED_JOB'
            networkBound: boolean
            failure: string | null
            resumable: boolean
        }
        type TransferState = { items: TransferItem[] }
        type CapacitorHost = Window & {
            Capacitor?: {
                PluginHeaders: Array<{
                    name: string
                    methods: Array<{ name: string, rtype: 'promise' }>
                }>
                nativePromise: (
                    plugin: string,
                    method: string,
                    options?: Record<string, unknown>,
                ) => Promise<unknown>
            }
        }

        const storageKey = 'talos.e2e.model-transfer'
        const initialItem: TransferItem = {
            id: 'transfer-smol',
            jobId: 100_101,
            createdAtMs: 1,
            phase: 'running',
            active: true,
            repo: 'unsloth/SmolLM2-360M-Instruct-GGUF',
            revision: '391ed11137586e383b1be0fab9acf01d282c2e11',
            paths: ['SmolLM2-360M-Instruct-Q5_K_M.gguf'],
            modelName: 'SmolLM2 360M Q5_K_M',
            haveBytes: 72_486_040,
            totalBytes: 289_944_160,
            runner: 'USER_INITIATED_JOB',
            networkBound: true,
            failure: null,
            resumable: true,
        }
        const initial: TransferState = { items: [initialItem] }
        let state: TransferState
        try {
            state = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as TransferState ?? initial
        } catch {
            state = initial
        }
        const save = () => localStorage.setItem(storageKey, JSON.stringify(state))
        save()

        const methods = ['start', 'pause', 'resume', 'cancel', 'stop', 'status', 'leftovers', 'discard']
        const host = window as CapacitorHost
        host.Capacitor = {
            PluginHeaders: [{
                name: 'TalosModelTransfer',
                methods: methods.map((name) => ({ name, rtype: 'promise' as const })),
            }],
            nativePromise: async (plugin, method, options = {}) => {
                if (plugin !== 'TalosModelTransfer') return {}
                if (method === 'status') return {
                    items: state.items.map((item) => ({ ...item, paths: [...item.paths] })),
                }
                if (method === 'pause' || method === 'stop') {
                    const id = typeof options.id === 'string' ? options.id : state.items[0]?.id
                    state = {
                        items: state.items.map((item) => item.id === id
                            ? { ...item, phase: 'paused', active: false, resumable: true }
                            : item),
                    }
                    save()
                    return {}
                }
                if (method === 'resume') {
                    const id = typeof options.id === 'string' ? options.id : state.items[0]?.id
                    state = {
                        items: state.items.map((item) => item.id === id
                            ? { ...item, phase: 'running', active: true, failure: null, resumable: true }
                            : item),
                    }
                    save()
                    return { id, phase: 'queued', runner: 'USER_INITIATED_JOB', networkBound: true }
                }
                if (method === 'cancel') {
                    const id = typeof options.id === 'string' ? options.id : state.items[0]?.id
                    state = { items: state.items.filter((item) => item.id !== id) }
                    save()
                    return {}
                }
                if (method === 'start') {
                    const files = Array.isArray(options.files)
                        ? options.files as Array<{ path: string, bytes: number }>
                        : []
                    const id = `transfer-${state.items.length + 1}`
                    const item: TransferItem = {
                        ...initialItem,
                        id,
                        jobId: 100_101 + state.items.length,
                        createdAtMs: Date.now(),
                        repo: typeof options.repo === 'string' ? options.repo : initialItem.repo,
                        revision: typeof options.revision === 'string' ? options.revision : initialItem.revision,
                        paths: files.map((file) => file.path),
                        modelName: typeof options.modelName === 'string' ? options.modelName : initialItem.modelName,
                        totalBytes: files.reduce((total, file) => total + file.bytes, 0),
                        haveBytes: 0,
                    }
                    state = { items: [...state.items, item] }
                    save()
                    return { id, phase: 'queued', runner: 'USER_INITIATED_JOB', networkBound: true }
                }
                if (method === 'leftovers') return { items: [], totalBytes: 0 }
                return {}
            },
        }
    })
}

test.beforeEach(async ({ page }) => {
    await installTransferBridge(page)
})

test('two rows keep their actions isolated and never create a third active worker', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.evaluate(() => {
        const first = {
            id: 'transfer-a', jobId: 100_201, createdAtMs: 1,
            phase: 'running', active: true, repo: 'owner/a', revision: 'pin-a',
            paths: ['a.gguf'], modelName: 'Model A', haveBytes: 25, totalBytes: 100,
            runner: 'USER_INITIATED_JOB', networkBound: true,
            failure: null, resumable: true,
        }
        const second = {
            id: 'transfer-b', jobId: 100_202, createdAtMs: 2,
            phase: 'running', active: true, repo: 'owner/b', revision: 'pin-b',
            paths: ['b.gguf'], modelName: 'Model B', haveBytes: 50, totalBytes: 200,
            runner: 'USER_INITIATED_JOB', networkBound: true,
            failure: null, resumable: true,
        }
        localStorage.setItem('talos.e2e.model-transfer', JSON.stringify({ items: [first, second] }))
    })
    await page.reload()
    await page.getByTestId('talos-download-center-trigger').click()

    const rows = page.getByTestId('talos-download-center-item')
    await expect(rows).toHaveCount(2)
    const first = rows.filter({ hasText: 'Model A' })
    const second = rows.filter({ hasText: 'Model B' })
    await first.getByTestId('talos-download-center-pause').click()
    await expect(first.getByTestId('talos-download-center-resume')).toBeVisible()
    await expect(second.getByTestId('talos-download-center-pause')).toBeVisible()

    await second.getByTestId('talos-download-center-cancel').click()
    await expect(first.getByTestId('talos-download-center-cancel-confirm')).toHaveCount(0)
    await second.getByTestId('talos-download-center-cancel-confirm').click()
    await expect(rows).toHaveCount(1)
    await expect(rows.filter({ hasText: 'Model A' })).toBeVisible()
})

test('C45-RED-08G a durable transfer pauses, survives reload, resumes and cancels from the global center', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')

    const trigger = page.getByTestId('talos-download-center-trigger')
    await expect(trigger).toBeVisible()
    await expect(trigger).toHaveAttribute('aria-label', /SmolLM2 360M Q5_K_M, 25%/)
    await trigger.click()
    await expect(page.getByTestId('talos-download-center-progress')).toHaveAttribute('aria-valuenow', '25')

    await page.getByTestId('talos-download-center-pause').click()
    await expect(page.getByTestId('talos-download-center-resume')).toBeVisible()

    await page.reload()
    await expect(trigger).toBeVisible()
    await trigger.click()
    await expect(page.getByTestId('talos-download-center-resume')).toBeVisible()
    await page.getByTestId('talos-download-center-resume').click()
    await expect(page.getByTestId('talos-download-center-pause')).toBeVisible()

    await page.getByTestId('talos-download-center-cancel').click()
    const confirmCancel = page.getByTestId('talos-download-center-cancel-confirm')
    await expect(confirmCancel).toBeVisible()
    await confirmCancel.click()
    await expect(trigger).toHaveCount(0)

    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
        .toBeLessThanOrEqual(0)
})

test('the same center is reachable from drawer, Model Lab and the tablet rail without page cards', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.getByLabel('Open menu').click()

    const drawer = page.getByTestId('talos-mobile-sidebar')
    await expect(drawer.getByTestId('talos-download-center-trigger')).toBeVisible()
    await drawer.getByRole('button', { name: 'Open Settings' }).click()
    const sheet = page.getByTestId('talos-mobile-tool-sheet')
    await expect(sheet.getByTestId('talos-download-center-trigger')).toBeVisible()
    await page.getByTestId('settings-model-lab-link').click()
    await page.getByTestId('talos-model-lab-destination').filter({ hasText: 'Local models' }).click()
    await expect(page.getByTestId('settings-models-local-screen')).toBeVisible()
    await expect(page.getByTestId('talos-models-transfer')).toHaveCount(0)

    await page.setViewportSize({ width: 1024, height: 900 })
    await page.goto('/')
    // The neutral launcher address intentionally restores the last station.
    // Leave Model Lab through its real close affordance before asserting the
    // chat rail, which Settings deliberately replaces on tablets.
    const restoredSheet = page.getByTestId('talos-mobile-tool-sheet')
    await expect(restoredSheet).toBeVisible()
    await restoredSheet.getByRole('button', { name: 'Close Settings Center' }).click()
    await expect(restoredSheet).toHaveCount(0)
    const tablet = page.getByTestId('talos-tablet-sidebar')
    await expect(tablet).toBeVisible()
    await expect(tablet.getByTestId('talos-download-center-trigger')).toBeVisible()
    await expect(page.getByTestId('talos-download-center-trigger')).toHaveCount(1)
})
