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

/** Il binario. Va su un `SwitchRoot` (o sull'elemento che lo rappresenta). */
export const TALOS_SWITCH_TRACK_CLASS = 'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-[var(--talos-border)] bg-[var(--talos-input)] transition-colors outline-none data-[state=checked]:border-[var(--talos-accent)] data-[state=checked]:bg-[var(--talos-accent)] focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--talos-panel)] disabled:cursor-not-allowed disabled:opacity-50 forced-colors:border-[ButtonBorder]'

/**
 * Il pomello.
 *
 * Si muove con `translate-x`, non con `left`: era `left` la causa della copia
 * rotta, perche' partiva dalla posizione statica del contenuto centrato e
 * usciva dal binario. E porta un bordo suo perche' con i colori forzati il
 * riempimento del binario sparisce e l'interruttore deve restare leggibile.
 */
export const TALOS_SWITCH_THUMB_CLASS = 'pointer-events-none block size-5 translate-x-0.5 rounded-full border border-transparent bg-[var(--talos-card)] shadow-sm transition-transform data-[state=checked]:translate-x-5 forced-colors:border-[ButtonText] forced-colors:bg-[ButtonText] forced-colors:data-[state=checked]:bg-[Highlight]'
