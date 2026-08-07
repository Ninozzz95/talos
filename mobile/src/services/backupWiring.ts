import type { TalosChatRepository } from '@/repositories/chatRepository'
import type { TalosBackupSection } from '@/lib/backup/bundle'
import type { TalosBackupSources } from '@/services/backupExport'
import type { TalosBackupSinks } from '@/services/backupImport'

/**
 * Dove il backup incontra l'app vera.
 *
 * ## Perché è un file a parte
 *
 * Perché `backupExport` e `backupImport` non devono conoscere né il repository
 * né il vault né il magazzino delle chiavi: sono le loro **prove** a dimostrarlo,
 * e girano senza un dispositivo. Qui invece si sa tutto, e non si prova niente
 * che non sia già provato altrove — questo file è un cablaggio, non una
 * decisione.
 *
 * ## ⛔ Cosa NON entra nel backup
 *
 * La **bozza del compositore** e la **sessione attiva**: sono stato di un
 * momento, non dati. Ripristinarli su un altro dispositivo significherebbe
 * riaprire una chat a metà con dentro un testo che nessuno stava più scrivendo.
 *
 * E le **attività dei tool** (`talos_chat_tool_activities`): contengono i
 * checkpoint di autorizzazione, cioè decisioni legate a **quel** dispositivo e a
 * **quella** installazione. Ripristinarle vorrebbe dire riportare in vita
 * un'autorizzazione data altrove — che è esattamente ciò che la regola «una
 * capacità aggiunta invalida la copertura» esiste per impedire.
 */

/** I provider di cui si esportano le chiavi, se richiesto. */
const PROVIDER_IDS = ['openai', 'anthropic', 'gemini', 'deepseek', 'openrouter', 'ollama'] as const

export interface TalosBackupWiringDeps {
    repository: TalosChatRepository
    readVaultBytes(fileId: string): Promise<Uint8Array | null>
    readSettings(): Promise<Record<string, unknown>>
    deviceModel(): Promise<string | null>
    appBuild: string
}

export function talosBackupSourcesFrom(deps: TalosBackupWiringDeps): TalosBackupSources {
    return {
        repository: deps.repository,
        readVaultBytes: deps.readVaultBytes,
        readSettings: deps.readSettings,
        deviceModel: deps.deviceModel,
        appBuild: deps.appBuild,
        now: () => new Date().toISOString(),
        async readProviderKeys() {
            const { getProviderKey } = await import('@/services/secureKeyStore')
            const chiavi: Record<string, string> = {}
            for (const provider of PROVIDER_IDS) {
                const chiave = await getProviderKey(provider).catch(() => null)
                if (chiave !== null) chiavi[provider] = chiave
            }
            return chiavi
        },
    }
}

/** Gli id già presenti, per sezione. Serve a contare le collisioni. */
async function idsEsistenti(
    repository: TalosChatRepository,
    section: TalosBackupSection,
): Promise<Set<string>> {
    switch (section) {
        case 'sessions':
            return new Set((await repository.listSessions()).map((riga) => riga.id))
        case 'messages': {
            const ids = new Set<string>()
            for (const sessione of await repository.listSessions()) {
                for (const messaggio of await repository.listMessages(sessione.id)) ids.add(messaggio.id)
            }
            return ids
        }
        case 'vaultFiles':
            return new Set((await repository.listVaultFiles()).map((riga) => riga.id))
        case 'notes':
            return new Set((await repository.listNotes()).map((riga) => riga.id))
        case 'tasks':
            return new Set((await repository.listTasks()).map((riga) => riga.id))
        case 'memories':
            return new Set((await repository.listMemories()).map((riga) => riga.id))
        case 'researchRuns':
            return new Set((await repository.listResearchRuns()).map((riga) => riga.id))
        default:
            // `attachments`, `settings` e `providerKeys` non hanno id di riga:
            // non collidono, e la strategia li tratta come sempre nuovi.
            return new Set()
    }
}

export function talosBackupSinksFrom(deps: TalosBackupWiringDeps): TalosBackupSinks {
    const repository = deps.repository
    return {
        async countExisting(section) {
            return (await idsEsistenti(repository, section)).size
        },
        async findCollisions(section, ids) {
            const presenti = await idsEsistenti(repository, section)
            return ids.filter((id) => presenti.has(id))
        },
        async write(section, rows) {
            switch (section) {
                case 'sessions':
                    for (const riga of rows) await repository.createSession(riga as never)
                    return
                case 'messages':
                    for (const riga of rows) await repository.appendMessage(riga as never)
                    return
                case 'vaultFiles':
                    for (const riga of rows) {
                        const file = riga as Record<string, unknown>
                        /*
                         * ⛔ Un file esportato senza byte non si ricrea a vuoto.
                         *
                         * Una riga di Libreria che punta a un contenuto che non
                         * c'è è peggio della sua assenza: compare nell'elenco,
                         * si tocca, e non si apre. Meglio che manchi e si veda.
                         */
                        if (file.bytesBase64 === null) continue
                        await repository.createVaultFile(riga as never)
                    }
                    return
                case 'notes':
                    for (const riga of rows) await repository.createNote(riga as never)
                    return
                case 'tasks':
                    for (const riga of rows) await repository.createTask(riga as never)
                    return
                case 'memories':
                    for (const riga of rows) await repository.upsertMemory(riga as never)
                    return
                case 'researchRuns':
                    for (const riga of rows) await repository.upsertResearchRun(riga as never)
                    return
                case 'providerKeys': {
                    const { setProviderKey } = await import('@/services/secureKeyStore')
                    for (const riga of rows) {
                        const voce = riga as { provider?: unknown, key?: unknown }
                        if (typeof voce.provider === 'string' && typeof voce.key === 'string') {
                            await setProviderKey(voce.provider, voce.key)
                        }
                    }
                    return
                }
                case 'attachments':
                case 'settings':
                    /*
                     * Non si scrivono da qui.
                     *
                     * Gli allegati sono un legame fra una sessione e file che
                     * sono già stati scritti dalla loro sezione; le impostazioni
                     * le possiede lo store, non il repository. Entrambe hanno il
                     * loro posto e lo avranno — ma **dichiarare che non si
                     * scrivono è meglio che scriverle a metà**, e il piano lo
                     * mostra all'utente prima che tocchi qualcosa.
                     */
                    return
            }
        },
    }
}
