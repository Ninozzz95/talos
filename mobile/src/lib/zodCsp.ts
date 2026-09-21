import { config } from 'zod/v4'

// La configurazione gira quando l'adapter viene valutato, prima che i moduli
// importatori costruiscano gli schemi. Anche il probe di `eval` viola la CSP.
config({ jitless: true })

export * from 'zod/v4'
export { default } from 'zod/v4'
