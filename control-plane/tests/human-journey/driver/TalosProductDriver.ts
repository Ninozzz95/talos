import { expect, type Locator, type Page, type Response as PlaywrightResponse } from '@playwright/test'
import { browserFramePoint } from '../../../resources/js/lib/talosBrowserHmiCoordinates'

const POINTER_ENDPOINT = /\/api\/talos\/browser\/sessions\/[^/]+\/interactions\/pointer$/
const CONFIRM_ENDPOINT = /\/api\/talos\/browser\/interactions\/[^/]+\/confirm$/

export interface TalosProductDriverEnvironment {
    loginEmail: string
    loginPassword: string
    browserSiteOrigin: string
    assistantTimeoutMs: number
}

export interface OwnedBrowserCapture {
    artifactId: string
    previewUrl: string
    talosSessionId: string
    naturalWidth: number
    naturalHeight: number
}

export interface BrowserFrameInteractionResult {
    beforeArtifactId: string
    afterArtifactId: string
    pointerRequestCount: number
}

interface ResolvedOwnedBrowserCapture {
    capture: OwnedBrowserCapture
    trigger: Locator
    image: Locator
}

export class TalosProductDriver {
    readonly browserSiteOrigin: string

    private readonly page: Page
    private readonly environment: TalosProductDriverEnvironment
    private pointerRequestCount = 0

    constructor(page: Page, environment: TalosProductDriverEnvironment) {
        this.page = page
        this.environment = validateEnvironment(environment)
        this.browserSiteOrigin = this.environment.browserSiteOrigin
        this.page.on('request', (request) => {
            if (request.method() === 'POST' && POINTER_ENDPOINT.test(new URL(request.url()).pathname)) {
                this.pointerRequestCount += 1
            }
        })
    }

    async login(): Promise<void> {
        await this.page.goto('/login', { waitUntil: 'domcontentloaded' })
        const form = this.page.locator('#talos-login-form')
        await expect(form).toBeVisible()
        await form.getByLabel('Email').fill(this.environment.loginEmail)
        await form.getByLabel('Password').fill(this.environment.loginPassword)
        await form.getByRole('button', { name: 'Sign in', exact: true }).click()

        await expect(this.authenticatedWorkspace).toHaveCount(1, { timeout: this.environment.assistantTimeoutMs })
        await expect(this.authenticatedWorkspace).toHaveAttribute('data-talos-app-ready', 'true', {
            timeout: this.environment.assistantTimeoutMs,
        })
        await expect(this.composer).toBeVisible({ timeout: this.environment.assistantTimeoutMs })
    }

    async startNewChat(): Promise<void> {
        const newChat = this.page.getByRole('button', { name: 'New Chat', exact: true }).first()
        await expect(newChat).toBeVisible()
        await newChat.click()

        await expect(this.thread).toBeVisible()
        await expect(this.thread.locator('.talos-chat-message[data-message-role="user"]')).toHaveCount(0)
        await expect(this.thread.locator('.talos-chat-message[data-message-role="assistant"]')).toHaveCount(0)
        await expect(this.composer).toBeVisible()
        await expect(this.composer).toHaveValue('')
    }

    async sendMessage(prompt: string): Promise<Locator> {
        const normalizedPrompt = validatePrompt(prompt)
        const userMessages = this.thread.locator('.talos-chat-message[data-message-role="user"]')
        const assistantMessages = this.thread.locator('.talos-chat-message[data-message-role="assistant"]')
        const systemMessages = this.thread.locator('.talos-chat-message[data-message-role="system"]')
        const beforeUserCount = await userMessages.count()
        const beforeAssistantCount = await assistantMessages.count()
        const beforeSystemCount = await systemMessages.count()

        await expect(this.composer).toBeVisible()
        await expect(this.composer).toBeEditable()
        await this.composer.fill(normalizedPrompt)
        const send = this.page.getByRole('button', { name: 'Send', exact: true })
        await expect(send).toBeEnabled()
        await send.click()

        await expect(userMessages).toHaveCount(beforeUserCount + 1, { timeout: this.environment.assistantTimeoutMs })
        await expect(userMessages.last()).toContainText(normalizedPrompt)
        await expect.poll(async () => {
            if (await assistantMessages.count() > beforeAssistantCount) return 'assistant'
            if (await systemMessages.count() > beforeSystemCount) return 'system'
            return 'pending'
        }, {
            timeout: this.environment.assistantTimeoutMs,
            message: 'TALOS did not produce an assistant or controlled system outcome.',
        }).not.toBe('pending')
        await expect(this.page.getByText('Processing', { exact: true })).toHaveCount(0, {
            timeout: this.environment.assistantTimeoutMs,
        })

        if (await systemMessages.count() > beforeSystemCount) {
            const fault = (await systemMessages.last().innerText()).trim().slice(0, 1_000)
            throw new Error(`TALOS returned a controlled system outcome instead of an assistant reply: ${fault}`)
        }

        const assistant = assistantMessages.last()
        await expect(assistant).toBeVisible()
        return assistant
    }

    async enableBrowse(): Promise<void> {
        const enable = this.page.getByRole('button', { name: 'Enable Browse', exact: true })
        await expect(enable).toBeVisible()
        await enable.click()
        await expect(this.browseMode).toHaveAttribute('data-enabled', 'true', {
            timeout: this.environment.assistantTimeoutMs,
        })
        await expect(this.browseMode).toContainText(/Ready|Active/, { timeout: this.environment.assistantTimeoutMs })
    }

    async disableBrowse(): Promise<void> {
        await this.page.getByRole('button', { name: 'Browse actions', exact: true }).click()
        const disable = this.page.getByRole('menuitem', { name: 'Disable Browse', exact: true })
        await expect(disable).toBeVisible()
        await disable.click()
        await this.assertBrowseInactive()
    }

    async assertBrowseActive(): Promise<void> {
        await expect(this.browseMode).toHaveAttribute('data-enabled', 'true')
        await expect(this.browseMode).toContainText(/Ready|Active/)
        await expect(this.page.getByRole('button', { name: 'Enable Browse', exact: true })).toHaveCount(0)
    }

    async assertBrowseInactive(): Promise<void> {
        await expect(this.page.getByRole('button', { name: 'Enable Browse', exact: true })).toBeVisible()
        await expect(this.browseMode).toHaveCount(0)
    }

    async expectOwnedScreenshot(artifactId?: string): Promise<OwnedBrowserCapture> {
        return (await this.resolveOwnedScreenshot(artifactId)).capture
    }

    async reloadWorkspace(): Promise<void> {
        await this.page.reload({ waitUntil: 'domcontentloaded' })
        await expect(this.authenticatedWorkspace).toHaveCount(1, { timeout: this.environment.assistantTimeoutMs })
        await expect(this.authenticatedWorkspace).toHaveAttribute('data-talos-app-ready', 'true', {
            timeout: this.environment.assistantTimeoutMs,
        })
        await expect(this.composer).toBeVisible({ timeout: this.environment.assistantTimeoutMs })
    }

    async openLatestBrowserCapture(): Promise<void> {
        const { trigger } = await this.resolveOwnedScreenshot()
        await trigger.click()
        await expect(this.browserFrame).toBeVisible()
        await expect(this.page.getByTestId('talos-browser-interactive-frame-title')).toBeFocused()
        await expect(this.page.getByText('Click the current frame to interact', { exact: true })).toBeVisible()
    }

    async clickCurrentBrowserFrame(normalizedX: number, normalizedY: number): Promise<BrowserFrameInteractionResult> {
        validateNormalizedCoordinate(normalizedX, 'x')
        validateNormalizedCoordinate(normalizedY, 'y')

        const stage = this.page.getByTestId('browser-evidence-stage')
        const image = stage.locator('img[data-browser-artifact-id]').last()
        await expect(stage).toBeVisible()
        await expect(image).toBeVisible()
        const beforeArtifactId = await requiredAttribute(image, 'data-browser-artifact-id')
        const box = await stage.boundingBox()
        if (box === null) throw new Error('Browser evidence stage has no painted surface.')
        const naturalSize = await image.evaluate((element) => ({
            width: (element as HTMLImageElement).naturalWidth,
            height: (element as HTMLImageElement).naturalHeight,
        }))
        if (naturalSize.width < 1 || naturalSize.height < 1) {
            throw new Error('Browser evidence frame is not decoded.')
        }
        const position = browserFramePoint(
            { left: box.x, top: box.y, width: box.width, height: box.height },
            naturalSize,
            normalizedX,
            normalizedY,
        )
        const pointerCountBefore = this.pointerRequestCount
        const initialResponse = this.page.waitForResponse(isPointerResponse, {
            timeout: this.environment.assistantTimeoutMs,
        })
        await stage.click({ position })

        let response = await initialResponse
        let responseBody = await response.text()
        if (response.status() === 428) {
            const confirmation = this.page.getByRole('alertdialog')
            await expect(confirmation).toBeVisible()
            const confirmationResponse = this.page.waitForResponse(isConfirmationResponse, {
                timeout: this.environment.assistantTimeoutMs,
            })
            await this.page.getByTestId('browser-hmi-confirm').click()
            response = await confirmationResponse
            responseBody = await response.text()
            await expect(confirmation).toBeHidden()
        }
        if (response.status() !== 201) {
            throw new Error(`Browser frame interaction failed with HTTP ${response.status()}: ${responseBody.slice(0, 1_000)}`)
        }

        await expect.poll(() => image.getAttribute('data-browser-artifact-id'), {
            timeout: this.environment.assistantTimeoutMs,
            message: 'Browser interaction did not commit a new current evidence frame.',
        }).not.toBe(beforeArtifactId)
        const afterArtifactId = await requiredAttribute(image, 'data-browser-artifact-id')
        await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth), {
            timeout: this.environment.assistantTimeoutMs,
        }).toBeGreaterThan(0)

        const pointerRequestCount = this.pointerRequestCount - pointerCountBefore
        await this.page.getByRole('button', { name: 'Close browser capture', exact: true }).click()
        await expect(this.browserFrame).toBeHidden()

        return { beforeArtifactId, afterArtifactId, pointerRequestCount }
    }

    async assertConversationContains(messages: readonly string[]): Promise<void> {
        await expect(this.thread).toBeVisible()
        const userMessages = this.thread.locator('.talos-chat-message[data-message-role="user"]')
        for (const message of messages) {
            const persistedMessage = userMessages.getByText(message, { exact: true })
            await expect(persistedMessage).toHaveCount(1)
            await expect(persistedMessage).toBeVisible()
        }
    }

    async assertTerminalState(): Promise<void> {
        await expect(this.authenticatedWorkspace).toHaveAttribute('data-talos-app-ready', 'true')
        await expect(this.page.getByText('Processing', { exact: true })).toHaveCount(0)
        await expect(this.page.getByRole('alertdialog')).toHaveCount(0)
        await expect(this.page.getByTestId('tool-approval-card')).toHaveCount(0)
        await expect(this.composer).toBeVisible()
        await expect(this.composer).toBeEditable()
        await expect(this.composer).toHaveValue('')
    }

    async assertForbiddenOutcomesAbsent(): Promise<void> {
        const forbiddenText = [
            'TALOS_BROWSER_COMMAND_MALFORMED',
            'TALOS_BROWSER_REPEATED_COMMAND',
            'TALOS_BROWSER_WORKER_FAILURE',
            'PROVIDER_CHAT_FAILED',
            'SQLSTATE[',
            'Browser worker is not configured',
            'Browser worker request failed',
            'The browser interaction may have occurred, but TALOS could not commit current evidence.',
            'The page changed before the action. Review the refreshed frame and try again.',
            'The validator rejected the chat payload.',
            'https://i.ibb.co/',
            'https://talo.sh/artifact/',
        ] as const

        for (const text of forbiddenText) {
            await expect(this.thread.getByText(text, { exact: false })).toHaveCount(0)
        }
        await expect(this.thread.getByTestId('talos-controlled-fault')).toHaveCount(0)
        await expect(this.thread.locator('.talos-chat-message[data-message-role="assistant"] img:not([data-browser-artifact-id])')).toHaveCount(0)

        const ownedImages = this.thread.locator('.talos-chat-message[data-message-role="assistant"] img[data-browser-artifact-id]')
        for (let index = 0; index < await ownedImages.count(); index += 1) {
            await this.assertOwnedPreviewUrl(ownedImages.nth(index))
        }
    }

    private get authenticatedWorkspace(): Locator {
        return this.page.locator('#talos-workspace-root[data-authenticated="true"]')
    }

    private get thread(): Locator {
        return this.page.getByLabel('TALOS chat thread')
    }

    private get composer(): Locator {
        return this.page.getByLabel('Message TALOS')
    }

    private get browseMode(): Locator {
        return this.page.getByTestId('talos-browse-mode')
    }

    private get browserFrame(): Locator {
        return this.page.getByTestId('talos-browser-interactive-frame')
    }

    private async resolveOwnedScreenshot(artifactId?: string): Promise<ResolvedOwnedBrowserCapture> {
        const trigger = artifactId === undefined
            ? this.page.locator('[data-testid^="browser-evidence-open-"]').last()
            : this.page.getByTestId(`browser-evidence-open-${artifactId}`)
        await expect(trigger).toBeVisible({ timeout: this.environment.assistantTimeoutMs })
        const testId = await requiredAttribute(trigger, 'data-testid')
        const resolvedArtifactId = testId.slice('browser-evidence-open-'.length)
        if (!resolvedArtifactId || (artifactId !== undefined && artifactId !== resolvedArtifactId)) {
            throw new Error('Browser evidence launcher did not resolve the requested artifact.')
        }

        const image = trigger.locator(`img[data-browser-artifact-id="${cssAttributeValue(resolvedArtifactId)}"]`)
        await expect(image).toBeVisible()
        const { previewUrl, talosSessionId } = await this.assertOwnedPreviewUrl(image, resolvedArtifactId)
        await expect.poll(() => image.evaluate((element) => (
            (element as HTMLImageElement).naturalWidth > 0
            && (element as HTMLImageElement).naturalHeight > 0
        )), {
            timeout: this.environment.assistantTimeoutMs,
            message: 'Owned browser screenshot did not decode.',
        }).toBe(true)
        const decoded = await image.evaluate((element) => ({
            width: (element as HTMLImageElement).naturalWidth,
            height: (element as HTMLImageElement).naturalHeight,
        }))
        if (decoded.width < 1 || decoded.height < 1) {
            throw new Error('Owned browser screenshot decoded to an empty image.')
        }

        return {
            capture: {
                artifactId: resolvedArtifactId,
                previewUrl,
                talosSessionId,
                naturalWidth: decoded.width,
                naturalHeight: decoded.height,
            },
            trigger,
            image,
        }
    }

    private async assertOwnedPreviewUrl(image: Locator, artifactId?: string): Promise<{ previewUrl: string, talosSessionId: string }> {
        const source = await requiredAttribute(image, 'src')
        const preview = new URL(source, this.page.url())
        const workspace = new URL(this.page.url())
        const resolvedArtifactId = artifactId ?? await requiredAttribute(image, 'data-browser-artifact-id')
        const expectedPath = `/api/talos/browser/artifacts/${encodeURIComponent(resolvedArtifactId)}/preview`
        const queryKeys = [...preview.searchParams.keys()]
        const talosSessionId = preview.searchParams.get('talos_session_id')?.trim() ?? ''
        if (
            preview.origin !== workspace.origin
            || preview.pathname !== expectedPath
            || queryKeys.length !== 1
            || queryKeys[0] !== 'talos_session_id'
            || talosSessionId === ''
        ) {
            throw new Error('Browser screenshot is not served by the owner-scoped TALOS artifact preview route.')
        }

        return { previewUrl: preview.toString(), talosSessionId }
    }
}

function validateEnvironment(environment: TalosProductDriverEnvironment): TalosProductDriverEnvironment {
    const loginEmail = validateBoundedSecret(environment.loginEmail, 'login email', 254)
    const loginPassword = validateBoundedSecret(environment.loginPassword, 'login password', 1_024)
    const browserSiteOrigin = parseExactLoopbackOrigin(environment.browserSiteOrigin)
    if (
        !Number.isSafeInteger(environment.assistantTimeoutMs)
        || environment.assistantTimeoutMs < 1_000
        || environment.assistantTimeoutMs > 120_000
    ) {
        throw new Error('TALOS product driver assistant timeout must be between 1000 and 120000 milliseconds.')
    }

    return { loginEmail, loginPassword, browserSiteOrigin, assistantTimeoutMs: environment.assistantTimeoutMs }
}

function validateBoundedSecret(value: string, label: string, maximumLength: number): string {
    const normalized = value.trim()
    if (normalized.length < 1 || normalized.length > maximumLength || /[\u0000-\u001f\u007f]/.test(normalized)) {
        throw new Error(`TALOS product driver ${label} is invalid.`)
    }
    return normalized
}

function parseExactLoopbackOrigin(value: string): string {
    let parsed: URL
    try {
        parsed = new URL(value)
    } catch (cause) {
        throw new Error('TALOS browser fixture URL must be an exact loopback HTTP origin.', { cause })
    }
    const port = Number(parsed.port)
    if (
        parsed.protocol !== 'http:'
        || parsed.hostname !== '127.0.0.1'
        || !/^\d{1,5}$/.test(parsed.port)
        || !Number.isSafeInteger(port)
        || port < 1
        || port > 65_535
        || parsed.username !== ''
        || parsed.password !== ''
        || parsed.pathname !== '/'
        || parsed.search !== ''
        || parsed.hash !== ''
    ) {
        throw new Error('TALOS browser fixture URL must be an exact loopback HTTP origin.')
    }
    return parsed.origin
}

function validatePrompt(value: string): string {
    const normalized = value.trim()
    if (normalized.length < 1 || normalized.length > 20_000 || normalized.includes('\u0000')) {
        throw new Error('Human Journey prompt is invalid.')
    }
    return normalized
}

function validateNormalizedCoordinate(value: number, axis: 'x' | 'y'): void {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error(`Browser frame ${axis} coordinate must be normalized.`)
    }
}

function isPointerResponse(response: PlaywrightResponse): boolean {
    return response.request().method() === 'POST' && POINTER_ENDPOINT.test(new URL(response.url()).pathname)
}

function isConfirmationResponse(response: PlaywrightResponse): boolean {
    return response.request().method() === 'POST' && CONFIRM_ENDPOINT.test(new URL(response.url()).pathname)
}

async function requiredAttribute(locator: Locator, name: string): Promise<string> {
    const value = await locator.getAttribute(name)
    if (value === null || value === '') throw new Error(`Required ${name} attribute is missing.`)
    return value
}

function cssAttributeValue(value: string): string {
    return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}
