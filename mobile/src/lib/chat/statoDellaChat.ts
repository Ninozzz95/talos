/*
 * ⭐ B3 / F4-B — spostato qui dal componente `TalosMobileStatoChat.vue` (24/09): `App.vue` monta la barra laterale
 * a richiesta e deve poter passare lo stato senza tirare il componente nel pacchetto d'avvio.
 */
import { statoChat, type TalosStatoChat, type TalosStatoChatUltimoMessaggio } from '@/lib/chat/statoChat'
import type { TalosLocalChatSession } from '@/repositories/chatRepository'

/**
 * ⭐ B3 / F4-B — da dove viene lo stato di una riga, in UN posto solo.
 *
 * Le fonti sono quelle che il telefono ha già (ricognizione B3, sezione D):
 *   - «aspetta te»: un permesso d'attrezzo in attesa O un recupero da decidere di
 *     QUELLA chat (`pendingToolAuthorizations` / `toolAuthorizationRecoveries`,
 *     ognuno col suo `session_id`) — due domande aperte alla persona;
 *   - «in corso»: `chat.state.sending` e `sendingSessionId` (una sola chat per volta);
 *   - «in coda»: le voci della coda di quella chat (`chat.state.queues`);
 *   - «in pausa»: le stesse voci con la coda ferma dallo Stop (`inPausa`) — CODA-PAUSA (25/09/2026, owner «in pausa»);
 *   - il resto dall'ultimo messaggio: per la chat APERTA dalla memoria (l'elenco si
 *     rilegge dal disco solo quando si cambia chat, non a ogni messaggio — senza
 *     questo una chat ripresa e conclusa direbbe ancora «interrotta»), per le altre
 *     da `last_message` di `listSessions`.
 *
 * Il tipo è STRUTTURALE (un sottoinsieme del `ChatController`): così la stessa
 * funzione serve all'elenco Chat e a chi monta la barra laterale, e le prove non
 * devono costruire un controller intero.
 */
export interface TalosFontiStatoChat {
    readonly chat: {
        readonly state: {
            readonly sending: boolean
            readonly sendingSessionId: string | null
            readonly queues: Readonly<Record<string, { readonly voci: readonly unknown[], readonly inPausa?: boolean }>>
        }
        readonly activeSession: { readonly value: { readonly id: string } | null }
        readonly messages: ReadonlyArray<{ readonly role: string, readonly state: string, readonly metadata: Record<string, unknown> }>
    }
    readonly pendingToolAuthorizations: { readonly value: ReadonlyArray<{ readonly session_id: string }> }
    readonly toolAuthorizationRecoveries: { readonly value: ReadonlyArray<{ readonly session_id: string }> }
}

/*
 * ⛔ Ogni lettura qui sotto tollera una fonte mancante (`?.`, `?? []`): un'etichetta di
 * stato non deve MAI far cadere l'elenco delle chat. Con il controller vero le fonti ci
 * sono tutte; senza una di esse lo stato dice meno, non rompe.
 */
function ultimoDallaMemoria(fonti: TalosFontiStatoChat, sessionId: string): TalosStatoChatUltimoMessaggio | null | undefined {
    if (fonti.chat.activeSession?.value?.id !== sessionId) return undefined
    const messaggi = fonti.chat.messages ?? []
    // Chat aperta ma pagina non ancora caricata: si tiene il disco, non «vuota».
    if (messaggi.length === 0) return undefined
    const ultimo = messaggi[messaggi.length - 1]!
    return {
        ruolo: ultimo.role as TalosStatoChatUltimoMessaggio['ruolo'],
        stato: ultimo.state,
        interrotto: ultimo.metadata?.interrupted === true,
    }
}

function ultimoDalDisco(sessione: TalosLocalChatSession): TalosStatoChatUltimoMessaggio | null {
    const ultimo = sessione.last_message
    if (!ultimo) return null
    return { ruolo: ultimo.role, stato: ultimo.state, interrotto: ultimo.interrupted }
}

export function talosStatoDellaChat(fonti: TalosFontiStatoChat, sessione: TalosLocalChatSession): TalosStatoChat {
    const id = sessione.id
    const inMemoria = ultimoDallaMemoria(fonti, id)
    return statoChat({
        permessoInAttesa: (fonti.pendingToolAuthorizations?.value ?? []).some((voce) => voce.session_id === id)
            || (fonti.toolAuthorizationRecoveries?.value ?? []).some((voce) => voce.session_id === id),
        inCorso: fonti.chat.state?.sending === true && fonti.chat.state.sendingSessionId === id,
        vociInCoda: fonti.chat.state?.queues?.[id]?.voci?.length ?? 0,
        codaInPausa: fonti.chat.state?.queues?.[id]?.inPausa === true,
        ultimoMessaggio: inMemoria === undefined ? ultimoDalDisco(sessione) : inMemoria,
    })
}

/** Gli stati che PARLANO nella riga; «conclusa» e «vuota» tacciono (silenzio = normale). */
export function talosStatoChatParla(stato: TalosStatoChat): boolean {
    return stato !== 'conclusa' && stato !== 'vuota'
}

/** La chiave di lingua di ogni stato che parla (`chats.status.*`). */
export const TALOS_STATO_CHAT_CHIAVE: Readonly<Partial<Record<TalosStatoChat, string>>> = Object.freeze({
    'aspetta-te': 'chats.status.waiting',
    'in-corso': 'chats.status.running',
    'in-coda': 'chats.status.queued',
    'in-pausa': 'chats.status.paused',
    fallita: 'chats.status.failed',
    interrotta: 'chats.status.interrupted',
})
