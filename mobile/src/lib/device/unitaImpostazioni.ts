/**
 * Le unità vere delle impostazioni del telefono (ASS-145, ASS-146; owner 28/10: secondi «Da 15 s a 30 minuti», luminosità in percentuale
 * come il cursore). Un modulo a parte perché le usano sia il controllo (`privilegedSources.ts`) sia il testo per il modello
 * (`privilegedTools.ts`), e così i due non possono più dire unità diverse.
 */
export const SCREEN_TIMEOUT = { minS: 15, maxS: 1800, msPerS: 1000 }
export const BRIGHTNESS = { minP: 0, maxP: 100 }
