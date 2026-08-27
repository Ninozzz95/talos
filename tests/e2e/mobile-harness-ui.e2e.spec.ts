import { expect, test } from '@playwright/test'

type ThemeSnapshot = {
    background: string
    panel: string
    text: string
    accent: string
    font: string
    marker: string | undefined
}

async function codeThemeSnapshot(page: import('@playwright/test').Page): Promise<ThemeSnapshot> {
    return page.evaluate(() => {
        const host = document.querySelector<HTMLElement>('[data-e2e-code-theme-host]')
        const shell = host?.shadowRoot?.querySelector<HTMLElement>('.app-shell')
        const panel = host?.shadowRoot?.querySelector<HTMLElement>('.sessions-panel')
        const button = host?.shadowRoot?.querySelector<HTMLElement>('.primary-btn')
        if (!host || !shell || !panel || !button) throw new Error('Code theme fixture unavailable')

        return {
            background: getComputedStyle(host).backgroundColor,
            panel: getComputedStyle(panel).backgroundColor,
            text: getComputedStyle(host).color,
            accent: getComputedStyle(button).backgroundColor,
            font: getComputedStyle(host).fontFamily,
            marker: host.dataset.mountMarker,
        }
    })
}

async function mountEmbeddedCodeFixture(page: import('@playwright/test').Page): Promise<void> {
    await page.evaluate(async () => {
        const response = await fetch('/harness-ui/index.html')
        if (!response.ok) throw new Error(`Code fixture failed: ${response.status}`)
        const parsed = new DOMParser().parseFromString(await response.text(), 'text/html')
        parsed.querySelectorAll('script').forEach((script) => script.remove())

        const scene = document.createElement('div')
        scene.dataset.e2eCodeScene = ''
        scene.style.cssText = 'position:fixed;inset:0;background:linear-gradient(135deg,rgb(11,31,53),rgb(77,38,64));z-index:1000'
        const host = document.createElement('div')
        host.className = window.innerHeight <= 500
            ? 'talos-embedded talos-embedded-wide-short'
            : 'talos-embedded'
        host.dataset.e2eCodeEmbeddedHost = ''
        host.style.cssText = 'position:absolute;inset:0;--talos-code-composer-clearance:231px;--talos-motion-duration-disclosure:777ms'
        scene.appendChild(host)
        document.body.appendChild(scene)

        const shadow = host.attachShadow({ mode: 'open' })
        const loaded = new Promise<void>((resolve, reject) => {
            const link = document.createElement('link')
            link.rel = 'stylesheet'
            link.href = '/harness-ui/styles.css'
            link.addEventListener('load', () => resolve(), { once: true })
            link.addEventListener('error', () => reject(new Error('Code stylesheet failed')), { once: true })
            shadow.appendChild(link)
        })
        shadow.append(...Array.from(parsed.body.childNodes))
        await loaded
        window.__talosHarnessRoot = shadow
        window.__talosHarnessHost = host
        const runtimeLoaded = new Promise<void>((resolve, reject) => {
            const script = document.createElement('script')
            script.src = '/harness-ui/app.js'
            script.addEventListener('load', () => resolve(), { once: true })
            script.addEventListener('error', () => reject(new Error('Code runtime failed')), { once: true })
            shadow.appendChild(script)
        })
        await runtimeLoaded
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    })
}

test('HARNESS-THEME-LIVE-01 inherits live TALOS tokens through Shadow DOM without remount', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(async () => {
        const host = document.createElement('div')
        host.dataset.e2eCodeThemeHost = ''
        host.dataset.mountMarker = crypto.randomUUID()
        host.style.cssText = 'position:fixed;inset:0;width:640px;height:480px;z-index:-1'
        document.body.appendChild(host)

        const shadow = host.attachShadow({ mode: 'open' })
        const loaded = new Promise<void>((resolve, reject) => {
            const link = document.createElement('link')
            link.rel = 'stylesheet'
            link.href = '/harness-ui/styles.css'
            link.addEventListener('load', () => resolve(), { once: true })
            link.addEventListener('error', () => reject(new Error('Code stylesheet failed')), { once: true })
            shadow.appendChild(link)
        })
        const fixture = document.createElement('div')
        fixture.innerHTML = '<div class="app-shell"><aside class="sessions-panel"></aside>'
            + '<main class="workspace-shell"><button class="primary-btn">Action</button></main>'
            + '<aside class="inspector-panel"></aside></div>'
        shadow.append(...fixture.childNodes)
        await loaded
    })

    const calm = await codeThemeSnapshot(page)
    expect(calm.marker).toBeTruthy()

    await page.evaluate(() => {
        const root = document.documentElement.style
        root.setProperty('--talos-background', '#f8fafc')
        root.setProperty('--talos-code-bg', '#eef2f7')
        root.setProperty('--talos-panel', '#ffffff')
        root.setProperty('--talos-panel-soft', '#f3f5f8')
        root.setProperty('--talos-card', '#ffffff')
        root.setProperty('--talos-window-bg', '#ffffff')
        root.setProperty('--talos-text', '#111827')
        root.setProperty('--talos-assistant-text', '#111827')
        root.setProperty('--talos-muted', '#596579')
        root.setProperty('--talos-border', '#d7dee8')
        root.setProperty('--talos-border-strong', '#9aa7b8')
        root.setProperty('--talos-accent', '#a96617')
        root.setProperty('--talos-accent-hover', '#8c5310')
        root.setProperty('--talos-accent-text', '#ffffff')
        root.setProperty('--talos-font-ui', '"Source Serif 4", serif')
    })

    await expect.poll(async () => (await codeThemeSnapshot(page)).background)
        .toBe('rgb(248, 250, 252)')
    const paper = await codeThemeSnapshot(page)
    expect(paper.marker).toBe(calm.marker)
    expect(paper.background).toBe('rgb(248, 250, 252)')
    expect(paper.panel).toMatch(/color\(srgb 1 1 1 \/ 0\.92\)|rgba?\(255, 255, 255/)
    expect(paper.text).toBe('rgb(17, 24, 39)')
    expect(paper.accent).toBe('rgb(169, 102, 23)')
    expect(paper.font).toContain('Source Serif 4')
    expect(paper).not.toEqual(calm)
})

test('CODE-THEME-INVERSE-STANDALONE-01 preserves the Calm fallback without a TALOS host', async ({ page }) => {
    await page.goto('/harness-ui/index.html')

    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor))
        .toBe('rgb(30, 31, 34)')
    await expect(page.locator('.app-shell')).toBeVisible()
    await expect(page.getByText('Tema TALOS', { exact: true })).toHaveCount(1)
})

for (const viewport of [
    { name: 'phone portrait', width: 392, height: 872 },
    { name: 'phone landscape', width: 872, height: 392 },
] as const) {
    test(`CODE-EMBEDDED-GEOMETRY-01 ${viewport.name} keeps scroll without scrollbar, one composer and the shared scene`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await page.goto('/')
        await mountEmbeddedCodeFixture(page)

        const snapshot = await page.evaluate(() => {
            const host = document.querySelector<HTMLElement>('[data-e2e-code-embedded-host]')
            const shell = host?.shadowRoot?.querySelector<HTMLElement>('.app-shell')
            const conversation = host?.shadowRoot?.querySelector<HTMLElement>('.conversation')
            const mission = host?.shadowRoot?.querySelector<HTMLElement>('.mission-card')
            const staticComposer = host?.shadowRoot?.querySelector<HTMLElement>('.composer-wrap')
            const panel = host?.shadowRoot?.querySelector<HTMLElement>('.sessions-panel')
            if (!host || !shell || !conversation || !mission || !staticComposer || !panel) {
                throw new Error('Embedded Code geometry fixture unavailable')
            }
            const hostRect = host.getBoundingClientRect()
            const conversationRect = conversation.getBoundingClientRect()
            const missionRect = mission.getBoundingClientRect()
            const conversationStyle = getComputedStyle(conversation)
            const scrollTarget = Math.min(120, conversation.scrollHeight - conversation.clientHeight)
            conversation.scrollTop = scrollTarget
            return {
                hostBackground: getComputedStyle(host).backgroundColor,
                shellBackground: getComputedStyle(shell).backgroundColor,
                staticComposerDisplay: getComputedStyle(staticComposer).display,
                conversationRightGap: hostRect.right - conversationRect.right,
                missionRightGap: hostRect.right - missionRect.right,
                scrollbarWidth: conversationStyle.scrollbarWidth,
                scrollbarGutter: conversationStyle.scrollbarGutter,
                scrollRange: conversation.scrollHeight - conversation.clientHeight,
                scrollTop: conversation.scrollTop,
                transcriptClearance: conversationStyle.paddingBottom,
                panelTransition: getComputedStyle(panel).transitionDuration,
            }
        })

        expect(snapshot.hostBackground).toBe('rgba(0, 0, 0, 0)')
        expect(snapshot.shellBackground).toBe('rgba(0, 0, 0, 0)')
        expect(snapshot.staticComposerDisplay).toBe('none')
        expect(snapshot.scrollbarWidth).toBe('none')
        expect(snapshot.scrollbarGutter).toBe('auto')
        expect(snapshot.scrollRange).toBeGreaterThan(0)
        expect(snapshot.scrollTop).toBeGreaterThan(0)
        expect(snapshot.conversationRightGap).toBeGreaterThanOrEqual(11)
        expect(snapshot.conversationRightGap).toBeLessThanOrEqual(13)
        expect(snapshot.missionRightGap).toBeGreaterThanOrEqual(11)
        expect(snapshot.missionRightGap).toBeLessThanOrEqual(13)
        expect(snapshot.transcriptClearance).toBe('231px')
        expect(snapshot.panelTransition).toContain('0.777s')
    })

    test(`CODE-TOPBAR-ENTER-ALWAYS-01 ${viewport.name} frees height downward and returns upward`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await page.goto('/')
        await mountEmbeddedCodeFixture(page)

        const shown = await page.evaluate(() => {
            const host = document.querySelector<HTMLElement>('[data-e2e-code-embedded-host]')
            const root = host?.shadowRoot
            const topbar = root?.querySelector<HTMLElement>('.topbar')
            const runStrip = root?.querySelector<HTMLElement>('.run-strip')
            if (!topbar || !runStrip) throw new Error('Embedded Code topbar fixture unavailable')
            return {
                height: topbar.getBoundingClientRect().height,
                runTop: runStrip.getBoundingClientRect().top,
            }
        })
        await page.evaluate(() => {
            const root = document.querySelector<HTMLElement>('[data-e2e-code-embedded-host]')?.shadowRoot
            const conversation = root?.querySelector<HTMLElement>('.conversation')
            if (!conversation) throw new Error('Embedded Code conversation unavailable')
            conversation.scrollTop = 64
            conversation.dispatchEvent(new Event('scroll'))
        })
        await expect.poll(() => page.evaluate(() => document
            .querySelector<HTMLElement>('[data-e2e-code-embedded-host]')
            ?.shadowRoot?.querySelector('.topbar')?.classList.contains('is-scroll-hidden')))
            .toBe(true)
        await page.waitForTimeout(850)
        const hidden = await page.evaluate(() => {
            const root = document.querySelector<HTMLElement>('[data-e2e-code-embedded-host]')?.shadowRoot
            const topbar = root?.querySelector<HTMLElement>('.topbar')
            const runStrip = root?.querySelector<HTMLElement>('.run-strip')
            if (!topbar || !runStrip) throw new Error('Embedded Code hidden topbar unavailable')
            return {
                className: topbar.className,
                maxHeight: getComputedStyle(topbar).maxHeight,
                runTop: runStrip.getBoundingClientRect().top,
            }
        })
        await page.evaluate(() => {
            const root = document.querySelector<HTMLElement>('[data-e2e-code-embedded-host]')?.shadowRoot
            const conversation = root?.querySelector<HTMLElement>('.conversation')
            if (!conversation) throw new Error('Embedded Code conversation unavailable')
            conversation.scrollTop = 40
            conversation.dispatchEvent(new Event('scroll'))
        })
        await expect.poll(() => page.evaluate(() => document
            .querySelector<HTMLElement>('[data-e2e-code-embedded-host]')
            ?.shadowRoot?.querySelector('.topbar')?.classList.contains('is-scroll-hidden')))
            .toBe(false)

        expect(shown.height).toBeGreaterThan(0)
        expect(hidden.className).toContain('is-scroll-hidden')
        expect(hidden.maxHeight).toBe('0px')
        expect(hidden.runTop).toBeLessThan(shown.runTop)
    })
}
