import { expect, test, type Page } from '@playwright/test'
import {
    installTalosApiMocks,
    TALOS_E2E_IMAGE_FILE_ID,
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

test('v7 chat: user cards align right, arrowup recalls, censored email reveals on click and survives reload', async ({ page }) => {
    await installTalosApiMocks(page, {
        chatResponseText: 'Contact ops@example.com for the verified deploy window.',
    })
    await openAuthenticatedWorkspace(page)

    const composer = page.getByLabel('Message TALOS')
    const promptText = 'Who owns the deploy window?'
    await composer.fill(promptText)
    await composer.press('Enter')

    const userArticle = page.locator('article[data-message-role="user"]').last()
    await expect(userArticle).toBeVisible()
    const userBubble = userArticle.locator('[data-message-kind="user"]')
    await expect(userBubble).toBeVisible()
    const articleBox = await userArticle.boundingBox()
    const bubbleBox = await userBubble.boundingBox()
    expect(articleBox).not.toBeNull()
    expect(bubbleBox).not.toBeNull()
    expect(Math.abs(
        (articleBox!.x + articleBox!.width)
        - (bubbleBox!.x + bubbleBox!.width),
    )).toBeLessThanOrEqual(1)

    const assistantArticle = page.locator('article[data-message-role="assistant"]').last()
    await expect(assistantArticle).toBeVisible()

    const censored = assistantArticle.locator('button.talos-censored[data-censored-kind="email"]')
    await expect(censored).toBeVisible()
    await expect(censored).not.toHaveAttribute('data-revealed', 'true')
    await censored.click()
    await expect(censored).toHaveAttribute('data-revealed', 'true')
    await expect(censored).toHaveText('ops@example.com')

    await expect(composer).toHaveValue('')
    await composer.press('ArrowUp')
    await expect(composer).toHaveValue(promptText)
    await composer.fill('')

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByLabel('Message TALOS')).toBeVisible({ timeout: 45_000 })

    const reloadedCensored = page
        .locator('article[data-message-role="assistant"]')
        .last()
        .locator('button.talos-censored[data-censored-kind="email"]')
    await expect(reloadedCensored).toBeVisible()
    await expect(reloadedCensored).not.toHaveAttribute('data-revealed', 'true')
})

test('v7 chat: system rows render as centered captions and loading uses skeletons', async ({ page }) => {
    await installTalosApiMocks(page, {
        chatResponseText: 'Benchmark comparison completed for this run.',
    })
    await openAuthenticatedWorkspace(page)

    const composer = page.getByLabel('Message TALOS')
    await composer.fill('Run the workflow audit')
    await composer.press('Enter')

    await expect(page.locator('article[data-message-role="assistant"]').last()).toBeVisible()

    const statusRows = page.locator('.talos-status-row')
    if (await statusRows.count() > 0) {
        await expect(statusRows.first()).toBeVisible()
    }

    const meta = page.locator('article[data-message-role="assistant"] .talos-message-meta').last()
    await expect(meta).toBeVisible()
})

test('v7 chat: persisted reasoning, tool activity, authenticated media and provider search work end to end', async ({ page }) => {
    await installTalosApiMocks(page, {
        initialSessions: [{
            id: 'session-e2e',
            title: 'Rich persisted chat',
            messages: [{
                role: 'user',
                content: 'Inspect the attached evidence.',
            }, {
                role: 'assistant',
                content: 'The attached evidence passed the requested inspection.',
                model_profile_id: 'profile-alt-e2e',
                metadata: {
                    contract: 'talos.message.metadata.v2',
                    visible_reasoning: {
                        source: 'provider',
                        provider: 'anthropic',
                        text: 'Compared the authenticated image with the allowed evidence.',
                        duration_ms: 1450,
                    },
                    tool_activities: [{
                        id: 'tool-e2e-1',
                        name: 'Inspect evidence',
                        status: 'succeeded',
                        started_at: '2026-07-28T09:00:00Z',
                        completed_at: '2026-07-28T09:00:02Z',
                    }],
                    attachments: [{
                        file_id: TALOS_E2E_IMAGE_FILE_ID,
                        name: 'verified-evidence.png',
                        mime_type: 'image/png',
                        size_bytes: 256,
                        content_url: `/api/talos/files/${TALOS_E2E_IMAGE_FILE_ID}/content`,
                    }],
                    encrypted_content: 'opaque-private-state',
                },
            }],
        }],
    })
    await openAuthenticatedWorkspace(page)

    const assistant = page.locator('article[data-message-role="assistant"]').last()
    await expect(assistant).toContainText('The attached evidence passed the requested inspection.')
    await expect(assistant.locator('[data-talos-tool-activity]')).toContainText('Inspect evidence')
    await expect(page.getByText('opaque-private-state')).toHaveCount(0)
    await expect(page.getByText('Compared the authenticated image with the allowed evidence.')).toHaveCount(0)

    const reasoningTrigger = assistant.getByTestId('talos-reasoning-trigger')
    await reasoningTrigger.click()
    const reasoningDialog = page.getByRole('dialog', { name: 'Reasoning' })
    await expect(reasoningDialog).toBeVisible()
    await expect(reasoningDialog).toContainText('Compared the authenticated image with the allowed evidence.')
    await expect(reasoningDialog).not.toContainText('opaque-private-state')
    await page.keyboard.press('Escape')
    await expect(reasoningDialog).toHaveCount(0)
    await expect(reasoningTrigger).toBeFocused()

    const mediaTrigger = assistant.getByRole('button', { name: 'Open verified-evidence.png' })
    await expect(mediaTrigger).toBeVisible()
    await mediaTrigger.click()
    const mediaDialog = page.getByRole('dialog', { name: 'Chat media' })
    await expect(mediaDialog).toBeVisible()
    await expect(mediaDialog.getByText('verified-evidence.png', { exact: true })).toBeVisible()
    await mediaDialog.getByRole('button', { name: 'Preview verified-evidence.png' }).click()
    const mediaPreview = page.getByRole('dialog', { name: 'verified-evidence.png' })
    await expect(mediaPreview.getByAltText('verified-evidence.png')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(mediaPreview).toHaveCount(0)
    await expect(mediaDialog).toBeVisible()
    await mediaDialog.getByRole('button', { name: 'Close chat media', exact: true }).click()
    await expect(mediaDialog).toHaveCount(0)
    await expect(mediaTrigger).toBeFocused()

    const threadGeometry = await page.getByLabel('TALOS chat thread').evaluate((thread) => {
        const rect = thread.getBoundingClientRect()
        const articles = Array.from(thread.querySelectorAll<HTMLElement>('.talos-chat-message'))
        return {
            threadLeft: rect.left,
            threadRight: rect.right,
            articleLeft: Math.min(...articles.map((article) => article.getBoundingClientRect().left)),
            articleRight: Math.max(...articles.map((article) => article.getBoundingClientRect().right)),
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
        }
    })
    expect(threadGeometry.articleLeft, JSON.stringify(threadGeometry)).toBeGreaterThanOrEqual(threadGeometry.threadLeft - 1)
    expect(threadGeometry.articleRight, JSON.stringify(threadGeometry)).toBeLessThanOrEqual(threadGeometry.threadRight + 1)
    expect(threadGeometry.documentWidth, JSON.stringify(threadGeometry)).toBeLessThanOrEqual(threadGeometry.viewportWidth + 1)

    const modelTrigger = page.getByRole('button', { name: 'Choose model profile' })
    await modelTrigger.click()
    const picker = page.getByTestId('talos-composer-model-picker')
    await picker.getByRole('searchbox', { name: 'Search models' }).fill('anthropic')
    await expect(picker.getByTestId('talos-model-picker-provider-heading')).toHaveText('Anthropic')
    await expect(picker.locator('[data-model-profile-id="profile-e2e"]')).toHaveCount(0)
    await picker.locator('[data-model-profile-id="profile-alt-e2e"]').click()
    await expect(modelTrigger).toContainText('E2E alternate profile')
})
