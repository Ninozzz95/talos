import { z } from 'zod'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'
import {
    talosResearchCardOf,
    type TalosResearchBucket,
} from '@/lib/research/researchCard'
import type { TalosResearchRun } from '@/lib/research/researchRun'

/**
 * «Che ricerche ho fatto?» — la domanda che la chat non sapeva rispondere.
 *
 * Owner 2026-08-03: «per concludere il blocco research dobbiamo fare la stessa
 * cosa che abbiamo fatto per la libreria … chiedendo alla chat quali sono le
 * mie ricerche. **Non dobbiamo inventarci nulla**, mi raccomando.»
 *
 * E infatti non si inventa: la forma e' quella di `library_list` — filtri
 * dichiarati, pagina piccola, un `next_page_token` opaco — perche' un modello
 * che ha imparato a sfogliare la Libreria deve poter sfogliare le ricerche
 * senza imparare una seconda grammatica.
 *
 * ## I due metodi che NON vanno confusi
 *
 * Owner, subito dopo: «mi raccomando **non mi schiamo i due metodi**. La
 * Libreria deve rispondere ai prompt riguardo alla libreria, e quelli della
 * ricerca… quelli della ricerca. Sembra una cosa scontata, ma non lo e'.»
 *
 * Non lo e' davvero, perche' **i rapporti di ricerca SONO file di Libreria**:
 * `library_list` li elenca, e li elenca come documenti. Quindi le descrizioni
 * qui sotto dicono per differenza quando usare l'uno e quando l'altro — e' la
 * sola cosa che impedisce al modello di rispondere «che ricerche ho fatto»
 * sfogliando la Libreria e trovando anche le ricette della spesa.
 */

export interface TalosResearchToolSources {
    /** Le esecuzioni, dalla stessa fonte che alimenta la stazione. */
    list(): Promise<readonly TalosResearchRun[]>
    /** Se una sta girando adesso: il giornale non lo sa, il registro si'. */
    isRunning(id: string): boolean
}

/** Il vocabolario della stazione, non uno nuovo: sono le stesse linguette. */
const BUCKETS = ['all', 'running', 'paused', 'unfinished', 'done', 'cancelled', 'failed'] as const

function riga(card: {
    id: string
    question: string
    bucket: TalosResearchBucket
    startedAt: string
    done: number
    total: number
}): string {
    const avanzamento = card.total > 0 ? ` ${card.done}/${card.total}` : ''
    return `${card.question} — ${card.bucket}${avanzamento} — ${card.startedAt.slice(0, 10)} — id ${card.id}`
}

export function createTalosResearchTools(
    sources: TalosResearchToolSources,
): TalosToolDefinition<never>[] {
    return [
        defineTalosTool({
            name: 'research_list',
            title: 'Browse deep researches',
            /**
             * La descrizione fa un lavoro solo, ed e' distinguersi da
             * `library_list`: i rapporti stanno in Libreria, quindi senza
             * questa riga il modello risponderebbe alla domanda sbagliata con
             * lo strumento sbagliato — e sembrerebbe pure che funzioni.
             */
            description: 'List the deep researches the user has run, with how each one ended and how far it got. Use this whenever the user asks about their researches — what they investigated, which ones are still running, which failed. Do NOT use library_list for that: research reports are saved as Library files, so library_list finds them mixed in with every other document and cannot say whether a research finished, was paused, or failed.',
            action: 'read',
            input: z.object({
                status: z.enum(BUCKETS).default('all')
                    .describe('Filter by how it ended. `running` and `paused` are the ones still worth acting on.'),
                page_size: z.number().int().min(1).max(20).default(10)
                    .describe('Maximum entries in this page.'),
                offset: z.number().int().min(0).default(0)
                    .describe('How many to skip. Newest first, so 0 is the most recent.'),
            }),
            async run(input) {
                let runs: readonly TalosResearchRun[]
                try {
                    runs = await sources.list()
                } catch {
                    return {
                        ok: false,
                        content: 'The research journal could not be read on this device.',
                        evidence: { error_code: 'TALOS_RESEARCH_LIST_UNAVAILABLE' },
                    }
                }

                const cards = runs.map((run) => talosResearchCardOf(run, {
                    isRunning: sources.isRunning(run.id),
                    standing: null,
                }))
                const filtrate = input.status === 'all'
                    ? cards
                    : cards.filter((card) => card.bucket === input.status)
                // Le piu' recenti per prime: «che ricerche ho fatto» quasi
                // sempre vuol dire «le ultime», e chi cerca una vecchia scorre.
                const ordinate = [...filtrate].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
                const pagina = ordinate.slice(input.offset, input.offset + input.page_size)

                if (ordinate.length === 0) {
                    // «Nessuna» e «nessuna di quel tipo» sono frasi diverse, e
                    // dire la prima quando vale la seconda manda a rifare una
                    // ricerca che esiste gia'.
                    return {
                        ok: true,
                        content: input.status === 'all'
                            ? 'No deep research has been run on this device yet.'
                            : `No research matches the status "${input.status}", though others exist.`,
                        evidence: { listed: [], returned: 0, total: cards.length },
                    }
                }

                return {
                    ok: true,
                    content: pagina.map(riga).join('\n'),
                    evidence: {
                        listed: pagina.map((card) => card.id),
                        returned: pagina.length,
                        total: ordinate.length,
                        next_offset: input.offset + pagina.length < ordinate.length
                            ? input.offset + pagina.length
                            : null,
                    },
                }
            },
        }) as TalosToolDefinition<never>,
    ]
}
