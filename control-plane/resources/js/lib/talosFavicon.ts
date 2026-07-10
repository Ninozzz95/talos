const FALLBACK_ACCENT = '#ff8a3d'

function escapeSvgAttribute(value: string) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
}

function normalizedAccent(value: string) {
    const accent = value.trim()

    if (!accent || (typeof CSS !== 'undefined' && !CSS.supports('color', accent))) {
        return FALLBACK_ACCENT
    }

    return accent
}

export function talosFaviconDataUrl(accentValue: string) {
    const accent = normalizedAccent(accentValue)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500"><g stroke="${escapeSvgAttribute(accent)}" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke-width="18" d="M218 123.5 121.9 179A21 21 0 0 0 111.5 197v136a21 21 0 0 0 10.4 18l117.7 68a21 21 0 0 0 20.8 0l117.7-68a21 21 0 0 0 10.4-18V197a21 21 0 0 0-10.4-18L282 123.5"/><g stroke-width="14"><circle cx="250" cy="105" r="22"/><circle cx="250" cy="225" r="18"/><circle cx="250" cy="338" r="14"/><path d="M250 140v55M250 255v60"/><g transform="translate(250 225) rotate(45)"><path d="M0 32v63"/><circle cy="118" r="14"/></g><g transform="translate(250 225) rotate(-45)"><path d="M0 32v63"/><circle cy="118" r="14"/></g></g></g></svg>`

    return {
        accent,
        href: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    }
}

export function syncTalosFavicon(themeRoot: HTMLElement) {
    const accentValue = window.getComputedStyle(themeRoot).getPropertyValue('--talos-accent')
    const favicon = talosFaviconDataUrl(accentValue)
    let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')

    if (!link) {
        link = document.createElement('link')
        link.rel = 'icon'
        link.type = 'image/svg+xml'
        document.head.append(link)
    }

    link.href = favicon.href
    link.dataset.talosDynamicFavicon = 'true'
    link.dataset.talosFaviconColor = favicon.accent
}
