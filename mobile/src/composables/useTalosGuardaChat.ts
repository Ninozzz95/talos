/**
 * ⭐ A3-84 seconda parte (owner 25/09/2026, «nuova risposta finché non la apri») — la schermata della chat dice quale
 * chat stai guardando. Aprirla la segna vista; ogni risposta che arriva sotto i tuoi occhi la segna di nuovo; lasciare
 * la schermata smette di guardarla. Così l'elenco e la barra laterale chiamano «nuova» solo ciò che è arrivato
 * mentre eri altrove.
 *
 * ⛔ GUARDA-REG-01 (Pad, 25/09/2026 10:46): la schermata della chat resta MONTATA sotto le altre pagine (`App.vue` la
 * tiene sempre). «Guardare» è che la chat sia la pagina aperta (`visibile`), non che il componente esista: altrimenti
 * una risposta arrivata mentre sei nell'elenco non diceva mai «nuova».
 *
 * ⛔ Non si pota con l'elenco ancora vuoto (l'avvio, prima che le chat siano lette): si perderebbero tutte le chat
 * viste, e al passo dopo si accenderebbero come nuove.
 */
import { computed, onBeforeUnmount, watch, type Ref } from 'vue'
import { talosGuardaChat } from '@/stores/chatNovita'

export interface TalosFontiGuardaChat {
    readonly chat: {
        readonly activeSession: Readonly<Ref<{ readonly id: string } | null>>
        readonly messages: ReadonlyArray<{ readonly state: string }>
        readonly history: ReadonlyArray<{ readonly id: string }>
    }
}

export function useTalosGuardaChat(fonti: TalosFontiGuardaChat, visibile: Readonly<Ref<boolean>>): void {
    const chiave = computed(() => {
        const id = visibile.value ? fonti.chat.activeSession.value?.id : undefined
        if (!id) return ''
        const messaggi = fonti.chat.messages
        return `${id}|${messaggi.length}|${messaggi[messaggi.length - 1]?.state ?? ''}`
    })
    function vive(): ReadonlySet<string> | undefined {
        return fonti.chat.history.length > 0 ? new Set(fonti.chat.history.map((sessione) => sessione.id)) : undefined
    }
    watch(chiave, () => {
        void talosGuardaChat(visibile.value ? fonti.chat.activeSession.value?.id ?? null : null, vive())
    }, { immediate: true })
    onBeforeUnmount(() => { void talosGuardaChat(null) })
}
