import type { TalosResearchBucket, TalosResearchCard } from '@/lib/research/researchCard'

/**
 * Come si VEDE uno stato di ricerca, deciso una volta sola.
 *
 * La scheda e la riga dell'elenco mostrano la stessa pastiglia, e la pagina del
 * rapporto la mostra una terza volta. Tre copie di «quale colore per quale
 * stato» sono il modo in cui la griglia dice verde e l'elenco dice grigio per
 * la stessa ricerca — ed e' successo davvero altrove in questa app.
 *
 * ⛔ Il tono non e' il colore: e' il RUOLO. Il colore lo decidono i token del
 * tema, che sono due (chiaro e scuro) e non si scrivono qui.
 */
export type TalosResearchTone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral'

/**
 * Il nome dell'icona, non l'icona.
 *
 * Questo file resta senza dipendenze da Vue e da lucide apposta: e' una tabella
 * di decisioni, e una tabella si prova senza montare niente.
 */
export type TalosResearchStatusIcon =
    | 'running' | 'paused' | 'interrupted' | 'done' | 'cancelled' | 'failed'
    | 'no-report' | 'permission' | 'unfinished-turns'

export interface TalosResearchStatusLook {
    readonly tone: TalosResearchTone
    readonly icon: TalosResearchStatusIcon
}

const LOOK: Readonly<Record<TalosResearchBucket, TalosResearchStatusLook>> = Object.freeze({
    running: { tone: 'accent', icon: 'running' },
    paused: { tone: 'warning', icon: 'paused' },
    unfinished: { tone: 'neutral', icon: 'interrupted' },
    done: { tone: 'success', icon: 'done' },
    cancelled: { tone: 'neutral', icon: 'cancelled' },
    failed: { tone: 'danger', icon: 'failed' },
    /*
     * ⛔ I tre nuovi NON sono rossi come `failed`, e la distinzione e' il punto
     * di MB-1: una ricerca fallita non ha prodotto niente: queste hanno
     * raccolto, hanno speso, e quello che hanno prodotto non tiene. Dipingerle
     * come un guasto direbbe a chi guarda di buttarle, quando invece c'e' del
     * lavoro pagato da riprendere. Restano gialle — un ostacolo, non una
     * rovina — e a distinguerle e' l'icona, che dice la CAUSA.
     */
    'senza-rapporto': { tone: 'warning', icon: 'no-report' },
    'bloccata-dal-permesso': { tone: 'warning', icon: 'permission' },
    'giri-esauriti': { tone: 'warning', icon: 'unfinished-turns' },
})

export function talosResearchStatusLook(bucket: TalosResearchBucket): TalosResearchStatusLook {
    return LOOK[bucket] ?? { tone: 'neutral', icon: 'interrupted' }
}

/**
 * Come si CHIAMA uno stato quando si parla di UNA ricerca sola.
 *
 * ⛔ Misurato sul Pad il 12/09/2026 (foto RC11): la pastiglia di un dossier
 * diceva «Interrotte». Prendeva la parola dal filtro — dove quel plurale e'
 * giusto, perche' li' conta un insieme — e la incollava sopra un oggetto solo.
 *
 * Sono due frasi diverse per due lavori diversi, quindi due chiavi:
 * `research.buckets.*` conta, `research.bucketOne.*` descrive. Il plurale e' il
 * ripiego di quando il numero non si sa (Emplifi Soul Design System,
 * «Singular versus plural», letto 12/09/2026), e qui il numero si sa.
 *
 * Una funzione invece di tre interpolazioni sparse: la scheda, la riga e la
 * pagina del rapporto devono pescare dallo STESSO blocco, e tre copie della
 * stessa stringa sono il modo in cui una torna al plurale senza che si veda.
 */
export function talosResearchBucketOneKey(bucket: TalosResearchBucket): string {
    return `research.bucketOne.${bucket}`
}

/**
 * Le classi della pastiglia, una riga per tono.
 *
 * Scritte per esteso e non composte a pezzi perche' Tailwind legge le classi
 * nel sorgente: un nome costruito con un'interpolazione non finisce nel CSS
 * prodotto, e la pastiglia arriva sul telefono senza colore.
 */
export const TALOS_RESEARCH_TONE_CLASS: Readonly<Record<TalosResearchTone, string>> = Object.freeze({
    accent: 'border-[var(--talos-accent-border)] bg-[var(--talos-accent-soft)] text-[var(--talos-accent)]',
    success: 'border-[var(--talos-success-border)] bg-[var(--talos-success-soft)] text-[var(--talos-success)]',
    warning: 'border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] text-[var(--talos-warning)]',
    danger: 'border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] text-[var(--talos-danger)]',
    neutral: 'border-[var(--talos-border)] bg-[var(--talos-panel-soft)] text-[var(--talos-muted)]',
})

/**
 * Che cosa scrivere nel piede della scheda.
 *
 * Il mockup dice «N fonti · N riscontri» su un dossier finito e «N linee di
 * ricerca» su uno che non lo e'. Non e' una scelta grafica: prima del rapporto
 * i riscontri non esistono, e stamparne zero direbbe «cercato e non trovato»
 * dove la verita' e' «non ancora cercato».
 */
export interface TalosResearchFootKeys {
    readonly sources: { readonly key: string, readonly count: number } | null
    readonly second: { readonly key: string, readonly count: number }
}

export function talosResearchFootOf(card: TalosResearchCard): TalosResearchFootKeys {
    const report = card.report
    if (report) {
        return {
            sources: {
                key: report.sources.length === 1 ? 'research.sourcesOne' : 'research.sourcesMany',
                count: report.sources.length,
            },
            second: {
                key: report.claims === 1 ? 'research.claimsOne' : 'research.claimsMany',
                count: report.claims,
            },
        }
    }
    return {
        sources: null,
        second: {
            key: card.branches === 1 ? 'research.branchesOne' : 'research.branchesMany',
            count: card.branches,
        },
    }
}
