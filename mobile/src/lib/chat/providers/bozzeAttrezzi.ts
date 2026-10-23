/**
 * ⛔ Le chiamate che il modello sta ancora scrivendo (owner 20/10/2026, difetto 1 delle righe degli attrezzi).
 *
 * Sul Pad, col piano ChatGPT: «documento interattivo HTML di come funziona un caffè in 3D» → per 52 s la riga «Cerco come si
 * fa…» (il giro di `tool_details`) con lo spinner, mentre il modello scriveva già il documento come argomenti della chiamata.
 * Sembrava bloccato. Il nome arriva nei primi pezzi (`response.output_item.added`, `delta.tool_calls[].function.name`,
 * `content_block_start` tool_use: documentazione ufficiale di OpenAI e Anthropic), gli argomenti dopo, a frammenti.
 *
 * Come Hermes (`hermes_cli/cli_stream_mixin.py:646`, `apps/desktop/src/store/tool-drafting.ts`): l'attrezzo si annuncia appena
 * ha un nome. In più diciamo quanto è cresciuto. Gli aggiornamenti della crescita si diradano (uno ogni `intervalloMs`): gli
 * argomenti arrivano a token, e ridisegnare la riga a ogni token non dice niente di più.
 *
 * Sta nel grafo pigro degli adattatori, non all'avvio. Ledger: `LEDGER-RIGHE-ATTREZZI-2026-10-20.md`.
 */
import type { TalosBozzaAttrezzo } from '@/lib/chat/providerContracts'

export const TALOS_BOZZE_INTERVALLO_MS = 250

export interface TalosBozzeAttrezzi {
    /** Un pezzo della chiamata `indice`: il nome se è arrivato adesso, e quanti caratteri di argomenti ha portato. */
    annota(indice: number, nome: string | undefined, aggiunti: number): void
}

export function talosCreaBozzeAttrezzi(
    emetti: ((bozze: readonly TalosBozzaAttrezzo[]) => void) | undefined,
    opzioni: { ora?: () => number, intervalloMs?: number } = {},
): TalosBozzeAttrezzi {
    const ora = opzioni.ora ?? Date.now
    const intervallo = opzioni.intervalloMs ?? TALOS_BOZZE_INTERVALLO_MS
    const chiamate = new Map<number, TalosBozzaAttrezzo>()
    let ultima = -Infinity
    return {
        annota(indice, nome, aggiunti) {
            if (!emetti) return
            const prima = chiamate.get(indice)
            const nuovoNome = typeof nome === 'string' && /\S/.test(nome) && nome !== prima?.name
            const corrente = {
                name: nuovoNome ? nome! : prima?.name ?? '',
                caratteri: (prima?.caratteri ?? 0) + Math.max(0, aggiunti),
            }
            chiamate.set(indice, corrente)
            // Un pezzo di una chiamata senza nome non disegna una riga vuota (SEQ-REG-PAD-01, lo stesso principio).
            if (!corrente.name) return
            const adesso = ora()
            if (!nuovoNome && adesso - ultima < intervallo) return
            ultima = adesso
            emetti([...chiamate.entries()]
                .sort(([a], [b]) => a - b)
                .map(([, chiamata]) => chiamata)
                .filter((chiamata) => chiamata.name !== '')
                .map((chiamata) => ({ ...chiamata })))
        },
    }
}
