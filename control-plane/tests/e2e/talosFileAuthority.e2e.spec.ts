import { expect, test, type Page } from '@playwright/test'
import { resolve } from 'node:path'
import { installTalosApiMocks, TALOS_E2E_FILE_ID } from './helpers/talosApiMocks'

const e2eLoginEmail = process.env.TALOS_E2E_EMAIL ?? 'test@example.com'
const e2eLoginPassword = process.env.TALOS_E2E_PASSWORD ?? 'password'
const viteOrigin = process.env.TALOS_E2E_VITE_ORIGIN ?? 'http://127.0.0.1:5173'
const realBrowserStorageGateEnabled = process.env.TALOS_E2E_USE_VITE === '1'

async function openAuthenticatedWorkspace(page: Page) {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    if (await page.locator('#talos-workspace-root[data-authenticated="true"]').count() === 0) {
        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        const form = page.locator('#talos-login-form')
        await expect(form).toBeVisible()
        await form.getByLabel('Email').fill(e2eLoginEmail)
        await form.getByLabel('Password').fill(e2eLoginPassword)
        await Promise.all([
            page.waitForURL(/\/$/, { waitUntil: 'domcontentloaded' }),
            form.getByRole('button', { name: 'Sign in' }).click(),
        ])
    }

    await expect(page.locator('#talos-workspace-root[data-authenticated="true"]')).toHaveCount(1)
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
}

async function expectNoHorizontalOverflow(page: Page) {
    await expect.poll(() => page.evaluate(() => (
        Math.ceil(document.documentElement.scrollWidth) - Math.ceil(document.documentElement.clientWidth)
    ))).toBeLessThanOrEqual(1)
}

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(globalThis, 'showDirectoryPicker', {
            configurable: true,
            writable: true,
            value: undefined,
        })
    })
    await installTalosApiMocks(page, {
        initialSessions: [{
            id: 'session-e2e',
            title: 'File authority session',
            persistence_mode: 'persistent',
        }],
    })
    await openAuthenticatedWorkspace(page)
})

test('file authority is operable end to end from chat through Settings on desktop and mobile', async ({ page }) => {
    await page.getByTestId('talos-attachment-button').click()
    await page.getByTestId('talos-attachment-input').setInputFiles({
        name: 'workflow.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from('# Authorized workflow\nBrowser uploads require an explicit grant.'),
    })
    const attachment = page.getByTestId('talos-attachment-chip')
    await expect(attachment).toHaveAttribute('data-attachment-status', 'available')
    await expect(attachment).toHaveAttribute('data-authorized', 'true')

    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(page.getByText('Settings Center', { exact: true })).toBeVisible()
    await page.getByRole('tab', { name: 'Browser', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'File authority', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Revoke workflow.md', exact: true })).toBeVisible()

    await page.getByTestId('file-authority-scope-session').click()
    await page.getByTestId(`file-authority-file-${TALOS_E2E_FILE_ID}`).check()
    await page.getByTestId('file-authority-create').click()
    await expect(page.getByText('Session authority created.', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Revoke Current chat files', exact: true })).toBeVisible()

    await expect(page.getByTestId('file-authority-pick-folder')).toContainText('Import folder files')
    await page.getByTestId('file-authority-folder-fallback').setInputFiles(
        resolve('tests/e2e/fixtures/file-authority'),
    )
    await expect(page.getByText('Folder files imported. Reusable folder access is unavailable in this browser.', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Revoke Imported folder', exact: true })).toBeVisible()

    await page.getByTestId('file-authority-enable-global').click()
    await expect(page.getByRole('alertdialog')).toContainText('all present and future Vault files')
    await page.getByTestId('file-authority-confirm-global').click()
    await expect(page.getByText('Global Vault authority enabled.', { exact: true })).toBeVisible()
    await expect(page.getByTestId('file-authority-disable-global')).toBeVisible()

    await page.getByTestId('file-authority-disable-global').click()
    await expect(page.getByRole('alertdialog')).toContainText('Future model reads and Browser uploads')
    await page.getByRole('button', { name: 'Revoke global access', exact: true }).click()
    await expect(page.getByText('Global Vault authority revoked.', { exact: true })).toBeVisible()
    await expect(page.getByTestId('file-authority-enable-global')).toBeVisible()

    await expect(page.getByText(/C:\\|\/home\/|\/Users\//)).toHaveCount(0)
    await expectNoHorizontalOverflow(page)
})

test('a real OPFS directory handle survives IndexedDB structured clone and reload', async ({ page }) => {
    test.skip(!realBrowserStorageGateEnabled, 'Set TALOS_E2E_USE_VITE=1 to run the real IndexedDB + OPFS gate.')

    const moduleUrl = new URL('/resources/js/lib/talosFileSystemHandleStore.ts', viteOrigin).toString()
    const grantId = '018f47a2-7f42-7d10-9b37-000000000301'
    const directoryName = 'talos-b72-real-opfs-gate'

    const initial = await page.evaluate(async ({ moduleUrl, grantId, directoryName }) => {
        const store = await import(moduleUrl) as typeof import('../../resources/js/lib/talosFileSystemHandleStore')
        const root = await navigator.storage.getDirectory()
        const handle = await root.getDirectoryHandle(directoryName, { create: true })

        await store.deleteDirectoryHandle(grantId)
        await store.putDirectoryHandle(grantId, handle)

        const restored = await store.getDirectoryHandle(grantId)
        return {
            kind: restored?.kind ?? null,
            name: restored?.name ?? null,
            listed: (await store.listDirectoryHandleGrantIds()).includes(grantId),
        }
    }, { moduleUrl, grantId, directoryName })

    expect(initial).toEqual({
        kind: 'directory',
        name: directoryName,
        listed: true,
    })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })

    const afterReload = await page.evaluate(async ({ moduleUrl, grantId, directoryName }) => {
        const store = await import(moduleUrl) as typeof import('../../resources/js/lib/talosFileSystemHandleStore')
        const restored = await store.getDirectoryHandle(grantId)
        const beforeDelete = await store.listDirectoryHandleGrantIds()

        await store.deleteDirectoryHandle(grantId)
        const afterDelete = await store.listDirectoryHandleGrantIds()

        const root = await navigator.storage.getDirectory()
        await root.removeEntry(directoryName, { recursive: true }).catch(() => undefined)

        return {
            kind: restored?.kind ?? null,
            name: restored?.name ?? null,
            listedBeforeDelete: beforeDelete.includes(grantId),
            listedAfterDelete: afterDelete.includes(grantId),
        }
    }, { moduleUrl, grantId, directoryName })

    expect(afterReload).toEqual({
        kind: 'directory',
        name: directoryName,
        listedBeforeDelete: true,
        listedAfterDelete: false,
    })
})
