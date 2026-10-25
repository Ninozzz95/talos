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
        /*
         * ⛔⛔ Owner 2026-10-23, «Sì, solo per i locali»: il motore sul dispositivo NON mette l'HTML negli argomenti. Un 4B
         * sbaglia gli escape di un documento intero in una stringa, o si ferma al tetto a metà (D-LOC-1, Spark-X2.5-4B):
         * qui passa titolo e tipo, e il documento arriva come blocco ```html nella risposta dopo, che il ciclo cattura
         * (`agentLoop.ts`, `bloccoHtml.ts`). Forma vista dal Desktop prima di essere scritta; in r4 resterà identica.
         * `kind` è un enum di un valore solo, additivo: domani `svg` senza cambiare contratto (come Jan,
         * `web-app/src/lib/utils.ts:86-121`).
         */
        perIlMotoreLocale: {
            // ⛔ `looseObject`: se il modello mette lo stesso l'HTML negli argomenti, non si butta — si usa. E `kind` ha un
            // valore predefinito: un modello piccolo che lo dimentica non deve vedersi rifiutare la chiamata.
            input: z.looseObject({
                title: z.string().min(1).max(120)
                    .describe('Short label shown on the card in chat, e.g. "Spirograph".'),
                kind: z.enum(['html']).default('html').describe('What the visual is made of. Only "html" for now.'),
            }),
            description: [
                'Start an interactive visual in the chat — a diagram, a chart, a small simulation, a page the user can touch.',
                'Call it with only a title. Then, in your NEXT reply, write the complete self-contained HTML document as ONE fenced block that starts with ```html and ends with ```, with CSS and JS inline and no external resources. Do not put the HTML in the call.',
                'The document runs isolated: no network, no access to TALOS data. Not for plain pictures or plain documents.',
            ].join(' '),
        },
        async run(input) {
            const html = (input as { html?: string }).html
            if (html === undefined) {
                // Solo dal motore locale (`perIlMotoreLocale`): l'API valida `html` come obbligatorio e qui non arriva.
                return {
                    ok: true,
                    content: `Ready for "${input.title}". Now reply with ONLY one fenced block: \`\`\`html … \`\`\` containing `
                        + 'the complete self-contained document (inline CSS/JS, no external resources). Nothing before or after the block.',
                    attesaBlocco: { titolo: input.title, tipo: 'html' as const },
                    // ⛔ ART-L-10 (Pad, vc151): questo passo non crea niente. Senza, la vista diceva «Fatto».
                    senzaEffetto: true,
                }
            }
            let result: { id: string }
            try {
                result = await sources.create(input.title, html)
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
