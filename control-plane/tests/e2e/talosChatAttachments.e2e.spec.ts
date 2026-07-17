import { expect, test, type Page } from '@playwright/test'
import {
    installTalosApiMocks,
    TALOS_E2E_FILE_ID,
    TALOS_E2E_FIRST_FILE_AUTHORITY_GRANT_ID,
} from './helpers/talosApiMocks'

const e2eLoginEmail = process.env.TALOS_E2E_EMAIL ?? 'test@example.com'
const e2eLoginPassword = process.env.TALOS_E2E_PASSWORD ?? 'password'
const canonicalUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

test('chat attachment uploads through the Vault pipeline, grounds the send and survives reload', async ({ page }) => {
    const chatRequests: Record<string, unknown>[] = []
    page.on('request', (request) => {
        if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/talos/chat') {
            chatRequests.push(request.postDataJSON() as Record<string, unknown>)
        }
    })
    await installTalosApiMocks(page, {
        chatResponseText: 'The attached workflow file says the deploy window is Friday.',
    })
    await openAuthenticatedWorkspace(page)

    await page.getByTestId('talos-attachment-button').click()
    const attachmentMenu = page.getByTestId('talos-attachment-menu')
    await expect(attachmentMenu).toBeVisible()
    await expect(attachmentMenu.getByRole('menuitem', { name: 'Upload a file' })).toBeVisible()
    await expect(attachmentMenu.getByText('From Vault')).toBeVisible()

    await page.getByTestId('talos-attachment-input').setInputFiles({
        name: 'workflow.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from('# Deploy workflow\nThe deploy window is Friday 09:00 UTC.'),
    })

    const chip = page.getByTestId('talos-attachment-chip')
    await expect(chip).toHaveCount(1)
    await expect(chip).toHaveAttribute('data-attachment-status', 'available')
    await expect(chip).toHaveAttribute('data-authorized', 'true')
    await expect(chip.getByLabel('Authorized file grant')).toBeVisible()
    await expect(chip).toContainText('workflow.md')

    await page.getByLabel('Message TALOS').fill('When is the deploy window?')
    await page.getByRole('button', { name: 'Send', exact: true }).click()

    const userBubble = page.locator('.talos-chat-message[data-message-role="user"]').last()
    await expect(userBubble.getByTestId('talos-message-attachment')).toContainText('workflow.md')
    await expect(page.locator('.talos-chat-message[data-message-role="assistant"]').last())
        .toContainText('The attached workflow file says the deploy window is Friday.')
    await expect(page.getByTestId('talos-attachment-tray')).toHaveCount(0)
    expect(chatRequests).toHaveLength(1)
    expect(chatRequests[0].attachment_file_ids).toEqual([
        TALOS_E2E_FILE_ID,
    ])
    expect(chatRequests[0].attachment_grant_ids).toEqual([
        TALOS_E2E_FIRST_FILE_AUTHORITY_GRANT_ID,
    ])
    expect(TALOS_E2E_FILE_ID).toMatch(canonicalUuidPattern)
    expect(TALOS_E2E_FIRST_FILE_AUTHORITY_GRANT_ID).toMatch(canonicalUuidPattern)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
    const restoredUserBubble = page.locator('.talos-chat-message[data-message-role="user"]').last()
    await expect(restoredUserBubble.getByTestId('talos-message-attachment')).toContainText('workflow.md')
})

test('an attachable Vault reference is available from the tray without re-uploading', async ({ page }) => {
    await installTalosApiMocks(page)
    await openAuthenticatedWorkspace(page)

    await page.getByTestId('talos-attachment-button').click()
    await page.getByTestId('talos-attachment-input').setInputFiles({
        name: 'workflow.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from('seed the vault'),
    })
    await expect(page.getByTestId('talos-attachment-chip')).toHaveCount(1)
    await page.getByTestId('talos-attachment-chip').getByRole('button', { name: /Remove attachment/ }).click()
    await expect(page.getByTestId('talos-attachment-tray')).toHaveCount(0)

    await page.getByTestId('talos-attachment-button').click()
    await expect(page.getByTestId('talos-attachment-menu')).toBeVisible()
    const vaultEntry = page.getByTestId('talos-attachment-vault-file').first()
    await expect(vaultEntry).toContainText('workflow.md')
    await vaultEntry.click()

    const chip = page.getByTestId('talos-attachment-chip')
    await expect(chip).toHaveCount(1)
    await expect(chip).toHaveAttribute('data-attachment-status', 'available')
    await expect(chip).toHaveAttribute('data-authorized', 'true')
})
