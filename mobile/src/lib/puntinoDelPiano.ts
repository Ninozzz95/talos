/**
 * ⛔ Revisione del blocco 9, I-R1 (Desktop, 27/10/2026): il puntino «chi paga» del piano ChatGPT (D-0147-UI-2) quasi non si vedeva. Nello
 * scuro il verde di stato è quasi bianco; nel chiaro lo stato «al limite» (l'accento) stava sotto 3:1 in 11 temi su 14. Il contrasto non
 * testuale (WCAG 2.2, 1.4.11) chiede 3:1 contro i colori accanto: la pillola del modello nel compositore e la riga del piano nel selettore.
 *
 * Modulo del mobile, non dentro `talosThemes.ts`: quello è portato dal desktop e sorvegliato dal suo hash (R3-13). Si aggiunge alle
 * variabili del tema dove il tema le scrive (`applyTalosTheme`).
 */
import type { TalosResolvedThemeMode } from './talosThemes'
import { talosContrastRatio } from './talosContrast'

const mescola = (colore: string, quanto: number, verso: string) => `color-mix(in srgb, ${colore} ${quanto}%, ${verso})`

/** Il colore parte dal suo (verde, accento) e si scurisce o schiarisce a passi del 5% finché regge 3:1 su ogni superficie. */
function coloreCheSiVede(base: string, superfici: readonly string[], verso: string): string {
    for (let quanto = 0; quanto <= 100; quanto += 5) {
        const colore = quanto ? mescola(verso, quanto, base) : base
        if (superfici.every((s) => talosContrastRatio(colore, s) >= 3)) return colore
    }
    return verso
}

/** Le variabili del tema con i due colori del puntino: `--talos-plan-dot` (piano in uso) e `--talos-plan-dot-limit` (al limite). */
export function conPuntinoDelPiano(variabili: Record<string, string>, modo: TalosResolvedThemeMode): Record<string, string> {
    const superfici = ['--talos-composer-bg', '--talos-composer-surface', '--talos-panel'].map((k) => variabili[k]).filter(Boolean)
    const verso = modo === 'light' ? '#000000' : '#ffffff'
    return {
        ...variabili,
        '--talos-plan-dot': coloreCheSiVede(modo === 'light' ? '#16a34a' : '#22c55e', superfici, verso),
        '--talos-plan-dot-limit': coloreCheSiVede(variabili['--talos-accent'] ?? verso, superfici, verso),
    }
}
