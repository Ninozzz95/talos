import { expect, type Locator } from '@playwright/test'

export async function expectResponsivePanelContract(
    root: Locator,
    body: Locator,
    contractLabel: string,
) {
    await expect(body, contractLabel).toBeVisible()
    await body.evaluate((element) => element.setAttribute('data-talos-responsive-audit-body', 'true'))

    const surface = await body.evaluate((element) => {
        const body = element as HTMLElement
        const bodyRect = body.getBoundingClientRect()
        const visible = (candidate: HTMLElement) => {
            const style = window.getComputedStyle(candidate)
            const rect = candidate.getBoundingClientRect()
            return style.display !== 'none'
                && style.visibility !== 'hidden'
                && Number.parseFloat(style.opacity || '1') > 0
                && rect.width > 0
                && rect.height > 0
        }
        const horizontalScrollers = Array.from(body.querySelectorAll<HTMLElement>('*'))
            .filter((candidate) => {
                if (!visible(candidate)) return false
                const overflow = window.getComputedStyle(candidate).overflowX
                return (overflow === 'auto' || overflow === 'scroll')
                    && candidate.scrollWidth > candidate.clientWidth + 1
            })
            .map((candidate) => {
                const rect = candidate.getBoundingClientRect()
                return {
                    name: candidate.getAttribute('aria-label')
                        || candidate.getAttribute('data-testid')
                        || candidate.className
                        || candidate.tagName.toLowerCase(),
                    left: rect.left,
                    right: rect.right,
                    clientWidth: candidate.clientWidth,
                    scrollWidth: candidate.scrollWidth,
                }
            })
        const uncontainedElements = Array.from(body.querySelectorAll<HTMLElement>('section, article, form, fieldset, [role="tabpanel"]'))
            .filter(visible)
            .filter((candidate) => {
                const rect = candidate.getBoundingClientRect()
                const ownsHorizontalScroll = Array.from(candidate.querySelectorAll<HTMLElement>('*')).some((descendant) => {
                    const overflow = window.getComputedStyle(descendant).overflowX
                    return (overflow === 'auto' || overflow === 'scroll')
                        && descendant.scrollWidth > descendant.clientWidth + 1
                })
                return !ownsHorizontalScroll
                    && (rect.left < bodyRect.left - 1 || rect.right > bodyRect.right + 1)
            })
            .map((candidate) => candidate.getAttribute('aria-label')
                || candidate.getAttribute('data-testid')
                || candidate.id
                || candidate.tagName.toLowerCase())
        const overflowCandidates = Array.from(body.querySelectorAll<HTMLElement>('*'))
            .filter(visible)
            .filter((candidate) => {
                const rect = candidate.getBoundingClientRect()
                return rect.left < bodyRect.left - 1 || rect.right > bodyRect.right + 1
            })
            .slice(0, 20)
            .map((candidate) => {
                const rect = candidate.getBoundingClientRect()
                return {
                    tag: candidate.tagName.toLowerCase(),
                    id: candidate.id,
                    testId: candidate.getAttribute('data-testid'),
                    className: typeof candidate.className === 'string' ? candidate.className : '',
                    left: Math.round(rect.left),
                    right: Math.round(rect.right),
                    width: Math.round(rect.width),
                }
            })
        const intrinsicOverflowCandidates = Array.from(body.querySelectorAll<HTMLElement>('*'))
            .filter(visible)
            .filter((candidate) => candidate.scrollWidth > candidate.clientWidth + 1)
            .slice(0, 20)
            .map((candidate) => {
                const style = window.getComputedStyle(candidate)
                return {
                    tag: candidate.tagName.toLowerCase(),
                    id: candidate.id,
                    testId: candidate.getAttribute('data-testid'),
                    className: typeof candidate.className === 'string' ? candidate.className : '',
                    overflowX: style.overflowX,
                    minWidth: style.minWidth,
                    clientWidth: candidate.clientWidth,
                    scrollWidth: candidate.scrollWidth,
                }
            })

        return {
            bodyLeft: bodyRect.left,
            bodyRight: bodyRect.right,
            bodyClientWidth: body.clientWidth,
            bodyScrollWidth: body.scrollWidth,
            horizontalScrollers,
            uncontainedElements,
            overflowCandidates,
            intrinsicOverflowCandidates,
            documentScrollWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
        }
    })

    expect(
        surface.bodyScrollWidth,
        `${contractLabel}: ${JSON.stringify({
            visible: surface.overflowCandidates,
            intrinsic: surface.intrinsicOverflowCandidates,
        })}`,
    ).toBeLessThanOrEqual(surface.bodyClientWidth + 1)
    expect(surface.documentScrollWidth, contractLabel).toBeLessThanOrEqual(surface.viewportWidth + 1)
    expect(surface.uncontainedElements, contractLabel).toEqual([])
    for (const scroller of surface.horizontalScrollers) {
        expect(scroller.clientWidth, `${contractLabel}: ${scroller.name}`).toBeGreaterThan(0)
        expect(scroller.left, `${contractLabel}: ${scroller.name}`).toBeGreaterThanOrEqual(surface.bodyLeft - 1)
        expect(scroller.right, `${contractLabel}: ${scroller.name}`).toBeLessThanOrEqual(surface.bodyRight + 1)
    }

    const controls = body.locator([
        'button:not([disabled])',
        'a[href]',
        'input:not([type="hidden"]):not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[role="checkbox"]:not([aria-disabled="true"])',
        '[role="switch"]:not([aria-disabled="true"])',
        '[role="slider"]:not([aria-disabled="true"])',
    ].join(','))
    const controlCount = await controls.count()

    for (let index = 0; index < controlCount; index += 1) {
        const control = controls.nth(index)
        if (!await control.isVisible()) continue

        await control.scrollIntoViewIfNeeded()
        const geometry = await control.evaluate((element) => {
            const target = element as HTMLElement
            const body = target.closest<HTMLElement>('[data-talos-responsive-audit-body="true"]')
            if (!body) return null

            const targetRect = target.getBoundingClientRect()
            const bodyRect = body.getBoundingClientRect()
            let clipLeft = bodyRect.left
            let clipRight = bodyRect.right
            let ancestor = target.parentElement

            while (ancestor && ancestor !== body) {
                const style = window.getComputedStyle(ancestor)
                if (['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX)) {
                    const rect = ancestor.getBoundingClientRect()
                    clipLeft = Math.max(clipLeft, rect.left)
                    clipRight = Math.min(clipRight, rect.right)
                }
                ancestor = ancestor.parentElement
            }

            return {
                label: target.getAttribute('aria-label')
                    || target.getAttribute('title')
                    || target.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80)
                    || target.id
                    || target.tagName.toLowerCase(),
                left: targetRect.left,
                right: targetRect.right,
                width: targetRect.width,
                clipLeft,
                clipRight,
            }
        })

        expect(geometry, contractLabel).not.toBeNull()
        expect(geometry?.width ?? 0, `${contractLabel}: ${geometry?.label}`).toBeGreaterThan(0)
        expect(geometry?.left ?? 0, `${contractLabel}: ${geometry?.label}`).toBeGreaterThanOrEqual((geometry?.clipLeft ?? 0) - 1)
        expect(geometry?.right ?? 0, `${contractLabel}: ${geometry?.label}`).toBeLessThanOrEqual((geometry?.clipRight ?? 0) + 1)
    }
}

export async function exerciseResponsiveSubsections(
    root: Locator,
    body: Locator,
    contractLabel: string,
) {
    const visitedTabs = new Set<string>()
    const activeTabLists = new Set<string>()
    let tabListSequence = 0

    const visitVisibleTabLists = async (): Promise<void> => {
        const tabLists = root.locator('[role="tablist"]')
        const tabListCount = await tabLists.count()

        for (let tabListIndex = 0; tabListIndex < tabListCount; tabListIndex += 1) {
            const tabList = tabLists.nth(tabListIndex)
            let tabListKey = await tabList.getAttribute('data-talos-e2e-tablist')
            if (!tabListKey) {
                tabListSequence += 1
                tabListKey = `tablist-${tabListSequence}`
                await tabList.evaluate((element, key) => element.setAttribute('data-talos-e2e-tablist', key), tabListKey)
            }
            if (activeTabLists.has(tabListKey)) continue

            const ownedIds = (await tabList.getAttribute('aria-owns'))?.trim().split(/\s+/).filter(Boolean) ?? []
            const tabs = ownedIds.length > 0
                ? root.locator(ownedIds.map((id) => `#${id}`).join(','))
                : tabList.getByRole('tab')
            const tabCount = await tabs.count()
            const hasVisibleTab = await Promise.all(
                Array.from({ length: tabCount }, (_, index) => tabs.nth(index).isVisible()),
            ).then((visibility) => visibility.some(Boolean))
            if (!hasVisibleTab) continue

            activeTabLists.add(tabListKey)
            try {
                for (let tabIndex = 0; tabIndex < tabCount; tabIndex += 1) {
                    const tab = tabs.nth(tabIndex)
                    if (!await tab.isVisible() || await tab.isDisabled()) continue

                    const tabKey = await tab.getAttribute('id')
                        || `${tabListKey}:${await tab.getAttribute('aria-controls') ?? tabIndex}`
                    if (visitedTabs.has(tabKey)) continue
                    visitedTabs.add(tabKey)

                    await tab.scrollIntoViewIfNeeded()
                    await tab.click()
                    await expect(tab, `${contractLabel}: ${tabKey}`).toHaveAttribute('aria-selected', 'true')
                    await expectResponsivePanelContract(root, body, `${contractLabel} / ${await tab.innerText()}`)
                    await visitVisibleTabLists()
                }
            } finally {
                activeTabLists.delete(tabListKey)
            }
        }
    }

    await expectResponsivePanelContract(root, body, contractLabel)
    await visitVisibleTabLists()
}
