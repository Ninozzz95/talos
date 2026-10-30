import { talosCanonicalOpaqueColor, talosRelativeLuminance } from '@/lib/talosContrast'

/**
 * ⭐ UI-108 (owner 28/10: «non c'è un header, una testata»; mockup https://claude.ai/artifact/S3mAxFoTAkEAAjPdAJhyg6; scelte dell'owner
 * del 29/10: sfondo del visual BIANCO come oggi, filo da 1 px sotto la testata; OK del Desktop). Il visual interattivo si apre con una
 * testata nativa (X e titolo). Il titolo e i colori del tema attivo viaggiano in `open`: li valida e li ripulisce il nativo
 * (`TalosArtifactChrome.kt`), qui si leggono soltanto.
 */
export type TalosTestataArtefatto = Readonly<{
    scheme: 'dark' | 'light'
    header: string
    background?: string
    text?: string
    border?: string
    ring?: string
}>

/** I `--talos-*` vivi (li scrive `applyTalosTheme` sulla radice) in `#rrggbb`. `null` senza una testata leggibile: decide il nativo. */
export function coloriDellaTestataArtefatto(radice: HTMLElement = document.documentElement): TalosTestataArtefatto | null {
    const stile: Record<string, string> = {}
    for (let i = 0; i < radice.style.length; i += 1) {
        const nome = radice.style.item(i)
        if (nome.startsWith('--')) stile[nome] = radice.style.getPropertyValue(nome).trim()
    }
    const risolvi = (chiave: string): string | undefined => {
        const valore = stile[chiave]
        if (!valore) return undefined
        try {
            const hex = talosCanonicalOpaqueColor(valore, stile)
            return /^#[0-9a-f]{6}$/iu.test(hex) ? hex.toLowerCase() : undefined
        } catch {
            return undefined
        }
    }
    const header = risolvi('--talos-header')
    if (!header) return null
    const colori = {
        background: risolvi('--talos-background'),
        text: risolvi('--talos-text'),
        border: risolvi('--talos-border'),
        ring: risolvi('--talos-ring'),
    }
    return Object.freeze({
        // 0,179: il punto in cui nero e bianco hanno lo stesso contrasto (lo stesso del nativo per le icone di sistema)
        scheme: talosRelativeLuminance(header) > 0.179 ? 'light' : 'dark',
        header,
        ...Object.fromEntries(Object.entries(colori).filter(([, v]) => v !== undefined)),
    } as TalosTestataArtefatto)
}

/** Apre il visual con la sua testata. `false` se il nativo rifiuta (dispositivo che non isola: fail-closed). */
export async function talosApriArtefatto(id: string, titolo: string): Promise<boolean> {
    const { TalosArtifactBridge } = await import('@/lib/device/artifactPlugin')
    const chrome = coloriDellaTestataArtefatto()
    const esito = await TalosArtifactBridge.open({ id, title: titolo, ...(chrome ? { chrome } : {}) })
    return esito.opened === true
}
