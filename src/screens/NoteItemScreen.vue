<script setup lang="ts">
/**
 * Una nota, per intero, con il suo indirizzo.
 *
 * Owner 2026-08-04, con quattro schermate di riferimento: «ogni scheda apre una
 * pagina dedicata, il pulsante indietro va alla precedente, dev'essere
 * lineare». La Ricerca aveva gia' questa catena; le Note no — la scheda non si
 * apriva affatto.
 *
 * E la pagina non e' solo coerenza: la riga dell'elenco mostrava il contenuto
 * INTERO, senza taglio, quindi una nota lunga rendeva la lista impossibile da
 * scorrere. Ora la riga anticipa e la pagina contiene, che e' il lavoro che
 * ognuna delle due sa fare bene.
 *
 * L'eliminazione vive QUI e non nella riga: cancellare dalla lista costringeva
 * a decidere su un testo tagliato, e su una nota lunga voleva dire scegliere
 * senza aver letto.
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Trash2 } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { useChatController } from '@/stores/chatController'
import { Button } from '@/components/ui/button'
import { TALOS_DANGER_ACTION_CLASS } from '@/lib/dangerAction'
import type { TalosLocalNote } from '@/repositories/chatRepository'

const route = useRoute()
const router = useRouter()
const { t } = useTalosI18n()
const controller = useChatController()

const note = ref<TalosLocalNote | null>(null)
const loading = ref(true)
const confirming = ref(false)

const id = computed(() => String(route.params.id ?? ''))

onMounted(async () => {
    try {
        const all = await controller.notes.list()
        note.value = all.find((entry) => entry.id === id.value) ?? null
    } finally {
        loading.value = false
    }
})

/**
 * Dopo aver cancellato si torna all'elenco, non si resta su una pagina vuota.
 *
 * `replace` e non `push`: la nota non c'e' piu', e lasciarla nella cronologia
 * vuol dire che Indietro riporta a una pagina che non puo' esistere.
 */
async function remove(): Promise<void> {
    if (!note.value) return
    await controller.notes.remove(note.value.id)
    await router.replace({ name: 'notes' })
}

function updatedAt(value: string | null | undefined): string {
    if (!value) return ''
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString()
}
</script>

<template>
    <div data-testid="talos-note-item" class="flex flex-col gap-3 p-3">
        <p v-if="loading" class="py-6 text-center text-sm text-[var(--talos-muted)]">
            {{ t('common.loading') }}
        </p>

        <!-- La nota puo' essere stata cancellata da un'altra parte, o
             l'indirizzo copiato a mano. Si dice, invece di mostrare una pagina
             vuota che sembra un guasto. -->
        <p
            v-else-if="!note"
            data-testid="talos-note-item-missing"
            class="py-6 text-center text-sm text-[var(--talos-muted)]"
        >
            {{ t('notes.itemMissing') }}
        </p>

        <template v-else>
            <header class="flex flex-col gap-1">
                <h1 class="text-lg font-semibold leading-tight text-[var(--talos-text)]">
                    {{ note.title }}
                </h1>
                <div class="flex flex-wrap items-center gap-1.5">
                    <span class="rounded-full bg-[var(--talos-active)] px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">
                        {{ t('notes.untrusted') }}
                    </span>
                    <span class="text-2xs text-[var(--talos-muted)]">{{ updatedAt(note.updated_at) }}</span>
                </div>
            </header>

            <p class="whitespace-pre-wrap text-sm leading-6 text-[var(--talos-text)]">{{ note.content }}</p>

            <div class="mt-2 flex justify-end">
                <Button
                    v-if="!confirming"
                    type="button"
                    variant="ghost"
                    data-testid="talos-note-item-delete"
                    class="text-[var(--talos-muted)]"
                    @click="confirming = true"
                >
                    <Trash2 class="size-4" aria-hidden="true" />
                    {{ t('common.delete') }}
                </Button>
                <!-- La conferma sta qui accanto, non in una finestra sopra: la
                     nota resta visibile mentre si decide di cancellarla. -->
                <div v-else class="flex items-center gap-2">
                    <Button type="button" variant="ghost" @click="confirming = false">
                        {{ t('common.cancel') }}
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        data-testid="talos-note-item-delete-confirm"
                        :class="TALOS_DANGER_ACTION_CLASS"
                        @click="remove"
                    >
                        {{ t('common.delete') }}
                    </Button>
                </div>
            </div>
        </template>
    </div>
</template>
