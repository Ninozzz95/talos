import type { ForgeCapabilityDescriptor, ForgeRisk } from './contracts'

/**
 * ⛔⛔ Owner 2026-08-27 — due difetti confermati leggendo questo file
 * prima del fix, entrambi finding della revisione ingegneristica:
 *
 * 1. NESSUNA voce dichiarava `maxInputBytes` — vedi `limits.ts`. Ogni
 *    voce ora ha un tetto reale, proporzionato a cosa scrive davvero: le
 *    letture (`*.list`, `*.search`) restano piccole (una query, non un
 *    payload), le scritture hanno spazio per titolo+contenuto ma non per
 *    dati arbitrari.
 * 2. Il rischio "compensable" (finding critico #4, `talosIntegration.ts`)
 *    era dichiarato per QUALSIASI capability di scrittura, ma nel
 *    catalogo non esisteva NESSUNA capability che compensasse
 *    davvero un'altra — "compensable" era una promessa vuota. `compensatesFor`
 *    collega esplicitamente una compensazione alla SUA azione primaria, e
 *    `validator.ts` verifica che coincida — non basta più che la
 *    capability di compensazione esista, deve essere QUELLA giusta.
 *    v1 non ha ancora capability di undo reali (nessun `tasks.delete`
 *    ecc. implementato in `talosIntegration.ts`): finché non ci sono,
 *    nessuna compensazione valida, onestamente, invece di una che sembra
 *    valida e non fa niente.
 */
const CATALOG: ForgeCapabilityDescriptor[] = [
    { id: 'tasks.list', actions: ['read'], risk: 'R1', network: 'none', reversible: true, maxInputBytes: 1_024, description: 'Read local TALOS tasks.' },
    { id: 'tasks.create', actions: ['write'], risk: 'R2', network: 'none', reversible: true, maxInputBytes: 16_384, description: 'Create a local TALOS task.', recordKind: 'task' },
    { id: 'tasks.setStatus', actions: ['write'], risk: 'R2', network: 'none', reversible: true, maxInputBytes: 1_024, description: 'Change local task status.' },
    { id: 'notes.list', actions: ['read'], risk: 'R1', network: 'none', reversible: true, maxInputBytes: 1_024, description: 'Read local TALOS notes.' },
    { id: 'notes.create', actions: ['write'], risk: 'R2', network: 'none', reversible: true, maxInputBytes: 32_768, description: 'Create a local TALOS note.', recordKind: 'note' },
    { id: 'notes.update', actions: ['write'], risk: 'R2', network: 'none', reversible: true, maxInputBytes: 32_768, description: 'Update a local TALOS note.' },
    { id: 'memory.search', actions: ['read'], risk: 'R2', network: 'none', reversible: true, maxInputBytes: 1_024, description: 'Search active local TALOS memories.' },
    { id: 'memory.create', actions: ['write'], risk: 'R3', network: 'none', reversible: true, maxInputBytes: 32_768, description: 'Create durable TALOS memory.', recordKind: 'memory' },
    // ⛔⛔⛔ Owner 2026-08-27, Fase 7 — trovato leggendo `talosIntegration.ts`
    // insieme al piano: `web.search` stava dichiarata qui ma
    // `createLocalCapabilities()` non le ha MAI dato un handler — a
    // runtime `describe('web.search')` torna `null` e ogni chiamata
    // fallirebbe con `FORGE_CAPABILITY_UNAVAILABLE`. Esattamente la
    // "promessa rotta" che il piano vieta esplicitamente ("Scope tenuto
    // fermo": *"web.search dichiarata nel catalogo ma non implementata
    // resta rimossa dal catalogo finché non è vera, non lasciata come
    // promessa rotta"*) — mai fatto in Fase 0-6. Rimossa: un manifest che
    // la nomina ora si rifiuta all'installazione (`FORGE_CAPABILITY_UNKNOWN`),
    // non al primo uso.
]

const MAP = new Map(CATALOG.map((entry) => [entry.id, Object.freeze({ ...entry, actions: Object.freeze([...entry.actions]) })]))

export function defaultForgeCapabilities(): readonly ForgeCapabilityDescriptor[] {
    return [...MAP.values()]
}

export function defaultForgeCapability(id: string): ForgeCapabilityDescriptor | null {
    return MAP.get(id) ?? null
}

export const riskRank = (risk: ForgeRisk): number => ({ R1: 1, R2: 2, R3: 3, R4: 4 })[risk]
export const maxRisk = (a: ForgeRisk, b: ForgeRisk): ForgeRisk => riskRank(a) >= riskRank(b) ? a : b
