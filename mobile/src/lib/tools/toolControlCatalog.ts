import type { TalosToolAction } from '@/lib/tools/permissionTypes'
import type { TalosAgentToolId } from '@/lib/tools/toolControls'

export type TalosAgentToolGroup = 'library' | 'personal' | 'web' | 'create' | 'models'

export interface TalosAgentToolControl {
    id: TalosAgentToolId
    group: TalosAgentToolGroup
    actions: readonly TalosToolAction[]
}

/** Settings-only metadata; executable-factory conformance is test-guarded. */
export const TALOS_AGENT_TOOL_CONTROLS = Object.freeze([
    // I nomi dei file sono scritti da chi li ha portati: possono contenere istruzioni.
    { id: 'library_list', group: 'library', actions: ['read'] },
    { id: 'library_search', group: 'library', actions: ['read'] },
    // Il contenuto di un documento è il vettore classico dell'iniezione indiretta.
    { id: 'library_read', group: 'library', actions: ['read'] },
    // Metadati nostri, non testo di qualcun altro.
    { id: 'library_file_origin', group: 'library', actions: ['read'] },
    // Le note sono già marcate «non attendibili» in tutta l'app.
    { id: 'notes_list', group: 'personal', actions: ['read'] },
    { id: 'tasks_list', group: 'personal', actions: ['read'] },
    { id: 'memory_search', group: 'personal', actions: ['read'] },
    // L'unico tool che non tocca niente di nessuno.
    { id: 'time_now', group: 'personal', actions: ['read'] },
    // Stessa storia di `memory_write`: esisteva e il catalogo non lo sapeva.
    { id: 'research_list', group: 'personal', actions: ['read'] },
    { id: 'research_start', group: 'personal', actions: ['write', 'outbound'] },
    { id: 'research_read', group: 'personal', actions: ['read'] },
    { id: 'research_rename', group: 'personal', actions: ['write'] },
    { id: 'research_pause', group: 'personal', actions: ['write'] },
    { id: 'research_resume', group: 'personal', actions: ['write', 'outbound'] },
    { id: 'research_cancel', group: 'personal', actions: ['write'] },
    { id: 'research_delete', group: 'personal', actions: ['write'] },
    // Scovato dal test di copertura il 2026-08-06: esisteva come tool ma NON
    // era nel catalogo, quindi non compariva né fra gli interruttori né
    // nell'elenco «Riguarda:» della pagina dei permessi. Un tool invisibile ai
    // permessi è un tool che nessuno ha autorizzato consapevolmente.
    { id: 'memory_write', group: 'personal', actions: ['write'] },
    // Correggere una memoria e' una scrittura come un'altra; toglierla no —
    // sta nello stesso gruppo ma la sua scheda di consenso lo dice.
    { id: 'memory_update', group: 'personal', actions: ['write'] },
    { id: 'memory_delete', group: 'personal', actions: ['write'] },
    { id: 'notes_create', group: 'personal', actions: ['write'] },
    { id: 'notes_update', group: 'personal', actions: ['write'] },
    // Cancellare una nota non si annulla: non esiste un cestino.
    { id: 'notes_delete', group: 'personal', actions: ['write'] },
    { id: 'tasks_create', group: 'personal', actions: ['write'] },
    { id: 'tasks_complete', group: 'personal', actions: ['write'] },
    { id: 'tasks_update', group: 'personal', actions: ['write'] },
    { id: 'tasks_delete', group: 'personal', actions: ['write'] },
    // Esce dal dispositivo E porta dentro testo di altri: due terzi della trifecta in un tool solo.
    { id: 'web_search', group: 'web', actions: ['outbound','write'] },
    { id: 'web_read', group: 'web', actions: ['outbound','write'] },
    { id: 'document_create', group: 'create', actions: ['write'] },
    // Il prompt esce verso il provider: è trasmissione, anche se sembra creazione.
    { id: 'generate_image', group: 'create', actions: ['write','outbound'] },
    // Esce dalla sandbox ma resta sul dispositivo. Canale obliquo noto: un file esportato può finire in una cartella sincronizzata — da rivedere se nasce la sincronizzazione.
    { id: 'library_export', group: 'library', actions: ['write','read'] },
    // Nel gruppo `library` e non in `personal`: chi toglie l'accesso alla
    // Libreria toglie ANCHE il permesso di svuotarla, in un colpo solo.
    { id: 'library_rename', group: 'library', actions: ['write'] },
    { id: 'library_delete', group: 'library', actions: ['write'] },
    // Cambia CHI può vedere cosa: è una modifica di sicurezza, non di contenuto.
    { id: 'library_context_policy_update', group: 'library', actions: ['write'] },
    // Le schede dei modelli su Hugging Face sono testo scritto da estranei.
    { id: 'local_models_search', group: 'models', actions: ['outbound'] },
    { id: 'local_model_inspect', group: 'models', actions: ['outbound'] },
    { id: 'local_model_download', group: 'models', actions: ['write','outbound'] },
    { id: 'local_models_status', group: 'models', actions: ['read'] },
] as const satisfies readonly TalosAgentToolControl[])
