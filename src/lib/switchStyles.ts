/**
 * Come si disegna un interruttore, in un posto solo.
 *
 * `TalosThemedSwitch` esiste ed e' la strada normale — ma non ovunque: nel
 * cassetto del compositore l'interruttore E' la riga, con la sua icona e la sua
 * etichetta, e infilare la primitiva li' dentro vorrebbe dire un `<button>`
 * dentro un `<button>` (HTML non valido) oppure perdere il bersaglio grande,
 * che su un telefono e' la cosa che si tocca davvero.
 *
 * Quindi la riga resta un `SwitchRoot` suo, e cio' che si condivide e' il
 * DISEGNO. E' l'unica cosa che serviva condividere: il difetto censito il
 * 2026-08-03 non era «ci sono sei bottoni», era «ci sono sei copie dello stesso
 * binario che possono divergere» — e una era gia' divergente, col pomello
 * `absolute` senza `left` che finiva fuori dal binario.
 *
 * Chi ha bisogno di un interruttore normale usa `TalosThemedSwitch`. Chi ha
 * bisogno che l'interruttore sia una riga usa `SwitchRoot` e queste due
 * stringhe. Nessuno riscrive il binario a mano.
 */

/**
 * Il binario. Va su un `SwitchRoot` (o sull'elemento che lo rappresenta).
 *
 * ## Il disegno e' 24×44, il BERSAGLIO e' 48×48
 *
 * MISURATO sul tablet il 2026-08-05: tre interruttori nelle Impostazioni erano
 * 44×24 reali, sotto il minimo Android di 48dp — e a differenza delle caselle,
 * che stanno dentro una `label` da 408×48 e quindi erano gia' a norma, questi
 * non avevano niente attorno.
 *
 * Ingrandire il binario era la correzione sbagliata: 24×44 **e'** l'aspetto
 * giusto di un interruttore, e un interruttore quadrato da 48 sembrerebbe
 * rotto. Quello che deve crescere e' l'area che raccoglie il dito.
 *
 * Percio' un pseudo-elemento centrato: invisibile, fuori dal flusso — quindi
 * non sposta nulla — e grande quanto il token. E' la tecnica che Material
 * indica proprio per i controlli il cui disegno e' piu' piccolo del bersaglio.
 *
 * ⚠️ **Non si misura con `getBoundingClientRect()`**: quello ignora gli
 * pseudo-elementi e continuerebbe a riportare 44×24. Si misura con
 * `elementFromPoint()` sugli angoli del quadrato da 48 — cioe' chiedendo al
 * browser cosa colpirebbe davvero un dito.
 */
export const TALOS_SWITCH_TRACK_CLASS = 'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-[var(--talos-border)] bg-[var(--talos-input)] transition-colors outline-none before:absolute before:left-1/2 before:top-1/2 before:h-touch before:w-touch before:-translate-x-1/2 before:-translate-y-1/2 before:content-[""] data-[state=checked]:border-[var(--talos-accent)] data-[state=checked]:bg-[var(--talos-accent)] focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--talos-panel)] disabled:cursor-not-allowed disabled:opacity-50 forced-colors:border-[ButtonBorder]'

/**
 * Il pomello.
 *
 * Si muove con `translate-x`, non con `left`: era `left` la causa della copia
 * rotta, perche' partiva dalla posizione statica del contenuto centrato e
 * usciva dal binario. E porta un bordo suo perche' con i colori forzati il
 * riempimento del binario sparisce e l'interruttore deve restare leggibile.
 */
export const TALOS_SWITCH_THUMB_CLASS = 'pointer-events-none block size-5 translate-x-0.5 rounded-full border border-transparent bg-[var(--talos-card)] shadow-sm transition-transform data-[state=checked]:translate-x-5 forced-colors:border-[ButtonText] forced-colors:bg-[ButtonText] forced-colors:data-[state=checked]:bg-[Highlight]'
