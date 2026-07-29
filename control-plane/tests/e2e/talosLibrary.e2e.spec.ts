import { expect, test, type Page } from '@playwright/test'
import {
    installTalosApiMocks,
    TALOS_E2E_IMAGE_FILE_ID,
    TALOS_E2E_LIBRARY_BROWSER_ITEM_ID,
    TALOS_E2E_LIBRARY_FILE_ITEM_ID,
    TALOS_E2E_LIBRARY_IMAGE_ITEM_ID,
    TALOS_E2E_LIBRARY_SOURCE_ITEM_ID,
} from './helpers/talosApiMocks'

const e2eLoginEmail = process.env.TALOS_E2E_EMAIL ?? 'test@example.com'
const e2eLoginPassword = process.env.TALOS_E2E_PASSWORD ?? 'password'

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

async function openUnifiedLibrary(page: Page) {
    await page.getByRole('button', { name: 'Library', exact: true }).click()
    const libraryWindow = page.locator('[data-window-id="library"]')
    await expect(libraryWindow).toBeVisible()

    const sectionTabs = libraryWindow.getByTestId('talos-window-section-tabs-library')
    const unifiedTab = sectionTabs.getByRole('tab', { name: 'Unified', exact: true })
    if (await unifiedTab.getAttribute('aria-selected') !== 'true') {
        await unifiedTab.click()
    }

    const unifiedPanel = libraryWindow.getByTestId('talos-window-section-library-unified')
    await expect(unifiedPanel.getByText('Unified Library', { exact: true })).toBeVisible()

    return { libraryWindow, unifiedPanel }
}

async function closeLibrary(libraryWindow: ReturnType<Page['locator']>) {
    await libraryWindow.getByRole('button', { name: 'Close Library', exact: true }).click()
    await expect(libraryWindow).toBeHidden()
}

test('Unified Library supports authenticated preview, chat-scoped media, cross-chat reuse and persistent removal', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'The desktop Library journey runs once in Chromium.')

    await installTalosApiMocks(page, {
        initialSessions: [{
            id: 'session-e2e',
            title: 'Library evidence chat',
            messages: [{
                role: 'user',
                content: 'Show the verified image evidence.',
            }, {
                role: 'assistant',
                content: 'The verified image evidence is available.',
                metadata: {
                    contract: 'talos.message.metadata.v2',
                    attachments: [{
                        file_id: TALOS_E2E_IMAGE_FILE_ID,
                        name: 'verified-evidence.png',
                        mime_type: 'image/png',
                        size_bytes: 256,
                        content_url: `/api/talos/files/${TALOS_E2E_IMAGE_FILE_ID}/content`,
                    }],
                },
            }],
        }],
        chatResponseText: 'The Library attachment is available to this chat.',
    })
    await openAuthenticatedWorkspace(page)

    await page.getByTestId('talos-attachment-button').click()
    await page.getByTestId('talos-attachment-input').setInputFiles({
        name: 'workflow.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from('# Deploy workflow\nThe production gate is Friday at 09:00 UTC.'),
    })
    const uploadedChip = page.getByTestId('talos-attachment-chip')
    await expect(uploadedChip).toHaveAttribute('data-attachment-status', 'available')
    await expect(uploadedChip).toHaveAttribute('data-authorized', 'true')
    await uploadedChip.getByRole('button', { name: /Remove attachment/ }).click()
    await expect(page.getByTestId('talos-attachment-tray')).toHaveCount(0)

    let { libraryWindow, unifiedPanel } = await openUnifiedLibrary(page)
    await expect(unifiedPanel.locator('[data-library-item-id]')).toHaveCount(4)
    await expect(unifiedPanel.locator(`[data-library-item-id="${TALOS_E2E_LIBRARY_IMAGE_ITEM_ID}"]`)).toContainText('verified-evidence.png')
    await expect(unifiedPanel.locator(`[data-library-item-id="${TALOS_E2E_LIBRARY_BROWSER_ITEM_ID}"]`)).toContainText('Browser screenshot evidence')
    await expect(unifiedPanel.locator(`[data-library-item-id="${TALOS_E2E_LIBRARY_SOURCE_ITEM_ID}"]`)).toContainText('Verified deployment source')
    await expect(unifiedPanel.locator(`[data-library-item-id="${TALOS_E2E_LIBRARY_FILE_ITEM_ID}"]`)).toContainText('workflow.md')
    await expect(unifiedPanel.getByText('Browser snapshot', { exact: true })).toHaveCount(0)

    await unifiedPanel.getByTestId('talos-library-kind-image').click()
    await expect(unifiedPanel.locator('[data-library-item-id]')).toHaveCount(2)
    await expect(unifiedPanel.locator(`[data-library-item-id="${TALOS_E2E_LIBRARY_FILE_ITEM_ID}"]`)).toHaveCount(0)

    await unifiedPanel.getByLabel('Search Library').fill('browser')
    await unifiedPanel.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(unifiedPanel.locator('[data-library-item-id]')).toHaveCount(1)
    await expect(unifiedPanel.locator(`[data-library-item-id="${TALOS_E2E_LIBRARY_BROWSER_ITEM_ID}"]`)).toBeVisible()

    await unifiedPanel.getByTestId('talos-library-reset').click()
    await expect(unifiedPanel.locator('[data-library-item-id]')).toHaveCount(4)

    const browserPreviewTrigger = unifiedPanel.getByRole('button', { name: 'Preview Browser screenshot evidence' })
    await browserPreviewTrigger.click()
    const browserPreview = page.getByRole('dialog', { name: 'Browser screenshot evidence' })
    await expect(browserPreview.getByTestId('talos-library-lightbox-image')).toBeVisible()
    await browserPreview.getByRole('button', { name: 'Close media preview' }).click()
    await expect(browserPreview).toHaveCount(0)
    await expect(browserPreviewTrigger).toBeFocused()

    await unifiedPanel.getByRole('button', { name: 'Use workflow.md in chat' }).click()
    await expect(page.getByTestId('talos-attachment-chip')).toContainText('workflow.md')
    await closeLibrary(libraryWindow)

    await page.getByLabel('Message TALOS').fill('Use the saved workflow in this chat.')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.locator('article[data-message-role="user"]').last().getByTestId('talos-message-attachment')).toContainText('workflow.md')

    const imageMessage = page.locator('article[data-message-role="assistant"]').filter({
        hasText: 'The verified image evidence is available.',
    })
    const mediaTrigger = imageMessage.getByRole('button', { name: 'Open verified-evidence.png' })
    await mediaTrigger.click()
    const mediaDialog = page.getByRole('dialog', { name: 'Chat media' })
    await expect(mediaDialog.getByText('verified-evidence.png', { exact: true })).toBeVisible()
    await expect(mediaDialog.getByText('Browser screenshot evidence', { exact: true })).toBeVisible()
    await expect(mediaDialog.getByText('Verified deployment source', { exact: true })).toBeVisible()
    await expect(mediaDialog.getByText('workflow.md', { exact: true })).toBeVisible()

    await mediaDialog.getByRole('tab', { name: 'Images', exact: true }).click()
    await expect(mediaDialog.getByText('verified-evidence.png', { exact: true })).toBeVisible()
    await expect(mediaDialog.getByText('Browser screenshot evidence', { exact: true })).toBeVisible()
    await expect(mediaDialog.getByText('workflow.md', { exact: true })).toHaveCount(0)

    await mediaDialog.getByRole('tab', { name: 'Files', exact: true }).click()
    await expect(mediaDialog.getByText('workflow.md', { exact: true })).toBeVisible()
    await expect(mediaDialog.getByText('verified-evidence.png', { exact: true })).toHaveCount(0)

    await mediaDialog.getByRole('tab', { name: 'Sources', exact: true }).click()
    await expect(mediaDialog.getByText('Verified deployment source', { exact: true })).toBeVisible()
    await expect(mediaDialog.getByText('workflow.md', { exact: true })).toHaveCount(0)

    await mediaDialog.getByRole('button', { name: 'Close chat media', exact: true }).click()
    await expect(mediaDialog).toHaveCount(0)

    await page.getByRole('button', { name: 'New Chat', exact: true }).click()
    ;({ libraryWindow, unifiedPanel } = await openUnifiedLibrary(page))
    await unifiedPanel.getByRole('button', { name: 'Use workflow.md in chat' }).click()
    await expect(page.getByTestId('talos-attachment-chip')).toContainText('workflow.md')
    await closeLibrary(libraryWindow)

    await page.getByLabel('Message TALOS').fill('Reuse the same workflow in a second chat.')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.locator('article[data-message-role="user"]').last().getByTestId('talos-message-attachment')).toContainText('workflow.md')

    ;({ libraryWindow, unifiedPanel } = await openUnifiedLibrary(page))
    await unifiedPanel.getByRole('button', { name: 'Refresh Library' }).click()
    const workflowItem = unifiedPanel.locator(`[data-library-item-id="${TALOS_E2E_LIBRARY_FILE_ITEM_ID}"]`)
    await expect(workflowItem).toContainText('2 chats')

    await workflowItem.getByRole('button', { name: 'Remove workflow.md from Library' }).click()
    const removeDialog = page.getByRole('alertdialog', { name: 'Remove from Library?' })
    await expect(removeDialog).toBeVisible()
    await removeDialog.getByTestId('talos-library-confirm-remove').click()
    await expect(workflowItem).toHaveCount(0)

    await closeLibrary(libraryWindow)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })
    ;({ libraryWindow, unifiedPanel } = await openUnifiedLibrary(page))
    await expect(unifiedPanel.locator(`[data-library-item-id="${TALOS_E2E_LIBRARY_FILE_ITEM_ID}"]`)).toHaveCount(0)
    await expect(unifiedPanel.getByText('workflow.md', { exact: true })).toHaveCount(0)
})
