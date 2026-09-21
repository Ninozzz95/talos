/**
 * Quanto riscrivere un prompt: tre livelli, non una manopola.
 *
 * Owner 2026-08-04: «il tono e tipo di prompt — conciso, equilibrato, esteso».
 *
 * ## Perche' tre e non un cursore
 *
 * Un cursore da 1 a 10 chiede di indovinare cosa faranno il 4 e il 6. Tre nomi
 * dicono cosa esce, e sono i tre casi che esistono davvero: «lascialo com'e' ma
 * piu' chiaro», «riscrivilo bene», «costruiscimi un briefing».
 *
 * ## Perche' e' un'istruzione e non un parametro
 *
 * Il livello non tocca `max_tokens` ne' la temperatura: dice al modello COSA
 * consegnare. Un limite di token che tronca a meta' frase produce un prompt
 * rotto, non un prompt conciso — e chi legge non ha modo di distinguere le due
 * cose.
 */

export const TALOS_PROMPT_ENHANCER_DEPTHS = ['concise', 'balanced', 'extended'] as const
export type TalosPromptEnhancerDepth = (typeof TALOS_PROMPT_ENHANCER_DEPTHS)[number]

/** Equilibrato: il caso normale, quello che si sceglie non scegliendo. */
export const TALOS_PROMPT_ENHANCER_DEFAULT_DEPTH: TalosPromptEnhancerDepth = 'balanced'

export function isTalosPromptEnhancerDepth(value: unknown): value is TalosPromptEnhancerDepth {
    return typeof value === 'string'
        && (TALOS_PROMPT_ENHANCER_DEPTHS as readonly string[]).includes(value)
}

/**
 * L'istruzione che si aggiunge al prompt di sistema.
 *
 * In inglese come il resto del prompt di sistema — non e' testo per l'utente,
 * e' testo per il modello, e mescolare le due lingue in un'istruzione e' il
 * modo piu' semplice per farla ignorare. La lingua della RISPOSTA resta quella
 * del prompt originale: se ne occupa gia' `language_policy`.
 */
const INSTRUCTIONS: Record<TalosPromptEnhancerDepth, string> = {
    concise:
        'Depth: CONCISE. Keep the rewrite close to the original length. '
        + 'Sharpen the objective and the expected output, drop nothing the user wrote, and add at most one acceptance check. '
        + 'Do not add sections, headings, or role framing the user did not ask for.',
    balanced:
        'Depth: BALANCED. Rewrite it as a clear brief: explicit objective, expected output, the constraints already present, '
        + 'and two or three acceptance checks. Stay under roughly twice the original length.',
    extended:
        'Depth: EXTENDED. Build a full execution brief: objective, scope and non-scope, expected output and its format, '
        + 'every constraint already present, edge cases the user implied, and a checklist of acceptance criteria. '
        + 'Length is free, but every line must come from what the user wrote — an EXTENDED rewrite is more thorough, never more inventive.',
}

/**
 * Il prompt di sistema con il livello attaccato in fondo.
 *
 * In fondo e non in cima: l'ultima istruzione e' quella che i modelli seguono
 * piu' spesso quando due si sovrappongono, e questa deve vincere sul «keep the
 * result concise» generico che il prompt base dice a tutti.
 */
export function talosPromptEnhancerSystemPrompt(base: string, depth: TalosPromptEnhancerDepth): string {
    return `${base}\n\n${INSTRUCTIONS[depth]}`
}
