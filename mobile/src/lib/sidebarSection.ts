import type { TalosMobileRouteName } from '@/lib/mobileRoutes'

/**
 * La riga della sezione in cui ci si trova e' evidenziata, come nel mockup
 * (`.nav-row.active`: fondo `--talos-active`, icona in accento). Le pagine di
 * dettaglio contano per la loro sezione.
 */
export function talosSidebarSezioneAttiva(nome: string): TalosMobileRouteName | null {
    if (nome === 'chat' || nome === 'chats') return 'chats'
    if (nome.startsWith('settings-models')) return 'settings-models'
    if (nome.startsWith('task')) return 'tasks'
    if (nome.startsWith('memory')) return 'memory'
    if (nome.startsWith('note')) return 'notes'
    if (nome.startsWith('research')) return 'research'
    // ⛔ K4-E (owner 17/10 «r4 al posto, il vecchio come ripiego»): il Codice r4 È il Codice. Visto sul Pad: in r4 nessuna voce era accesa.
    if (nome.startsWith('harness') || nome === 'codice-r4') return 'harness'
    if (nome === 'context' || nome === 'doctor') return nome
    return null
}
