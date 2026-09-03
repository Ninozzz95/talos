import { z } from 'zod'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'

/**
 * ⛔⛔⛔ Owner 2026-08-27 — «creare artefatti HTML con schemi avanzati e
 * interagibili in chat, come fa ChatGPT: spirografi, simulazioni,
 * interazioni in tempo reale». Ricerca commissionata e verificata riga per
 * riga contro il codice vero (vedi `TalosArtifactActivity.kt`) prima di
 * costruire questa metà: l'HTML scritto dal modello gira in una WebView e
 * un profilo Android SEPARATI, mai raggiungibile dal ponte Capacitor.
 *
 * ⛔ `create` non fa altro che scrivere e tornare un id — `TalosArtifactBridge`
 * è iniettato da fuori (vedi `TalosArtifactToolSources`) per lo stesso motivo
 * di `TalosDocumentToolSources`/`TalosImageToolSources`: un tool testabile
 * senza un vero dispositivo Android sotto.
 */
export interface TalosArtifactToolSources {
    create(title: string, html: string): Promise<{ id: string }>
}

export function createTalosVisualArtifactTools(
    sources: TalosArtifactToolSources,
): TalosToolDefinition<never>[] {
    const create = defineTalosTool({
        name: 'artifact_create',
        title: 'Create an interactive visual',
        description: [
            'Write a complete, self-contained HTML document (inline <style> and <script>, no external resources) and show it as an interactive visual in the chat — a diagram, a chart, a small simulation, a parametric drawing the user can manipulate with sliders or drag.',
            'Use this when a static image or the built-in cards (switches, lists, agenda) cannot show what changes over time or in response to a touch — the classic example is an interactive spirograph, a labeled physics diagram, or a live formula.',
            'The document runs isolated: no network access, no access to TALOS data, no way to call back into this conversation. Everything the visual needs must be embedded in the HTML itself.',
            'Not for plain pictures — use generate_image for those. Not for a list of items to choose from or a plain document — use the existing tools for those.',
        ].join(' '),
        action: 'write',
        input: z.object({
            title: z.string().min(1).max(120)
                .describe('Short label shown on the card in chat, e.g. "Spirograph".'),
            html: z.string().min(1).max(400_000)
                .describe('A complete HTML document: <!doctype html><html>...</html>, with any CSS/JS inline. No external scripts, stylesheets, fonts or network calls — they will not load.'),
        }),
        async run(input) {
            let result: { id: string }
            try {
                result = await sources.create(input.title, input.html)
            } catch (error) {
                const detail = error instanceof Error ? error.message : String(error)
                return {
                    ok: false,
                    content: /^TALOS_[A-Z0-9_]+$/.test(detail)
                        ? `The visual could not be created (${detail}).`
                        : 'The visual could not be created on this device.',
                    code: /^TALOS_[A-Z0-9_]+$/.test(detail) ? detail : 'TALOS_ARTIFACT_CREATE_FAILED',
                }
            }
            return {
                ok: true,
                content: `Created the visual "${input.title}".`,
                evidence: { id: result.id, title: input.title },
                /*
                 * ⛔ Stessa famiglia di `creato` — vedi `tracciaAzione.ts` per
                 * il perché di questa variante specifica (`artefatto`): il
                 * tocco non naviga una rotta interna, apre una Activity
                 * nativa separata, e serve un tap esplicito perché la
                 * WebView isolata è cara da costruire — non si monta finché
                 * nessuno la chiede.
                 */
                scheda: {
                    tipo: 'artefatto' as const,
                    titolo: input.title,
                    id: result.id,
                },
            }
        },
    }) as TalosToolDefinition<never>

    return [create]
}
