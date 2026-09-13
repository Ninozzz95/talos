<script setup lang="ts">
/**
 * Una memoria, per intero, nella forma del mockup «Talos Calm Finale».
 *
 * Mockup: `personalityDetail('memories')` (`src/app.js:234`) e `.p-memory-*`
 * (`section-personalities.css:168-177`). La pagina si legge in quattro gesti:
 *
 *   1. **che cos'è** — l'emblema del tipo, il suo nome sopra il titolo;
 *   2. **cosa dice** — la frase citata, grande, con il filo in accento;
 *   3. **dove vale, in che stato è, da dove viene** — tre fatti, non una prosa;
 *   4. **se il modello la legge** — un interruttore, che è la sola cosa che si
 *      cambia senza aprire un modulo.
 *
 * ## ⛔ L'interruttore dice cosa fa DAVVERO
 *
 * Nel mockup la riga si chiama «Attiva nel mockup» e la descrizione finisce con
 * «Nessun modello è collegato»: è una demo, e lo dichiara. Da noi il modello c'è
 * per davvero, quindi la frase dice la cosa vera — accesa, TALOS la rilegge in
 * ogni nuova conversazione; spenta, no. Copiare la frase del mockup sarebbe
 * l'unico modo di sbagliare questa pagina.
 *
 * ## ⛔ L'ETICHETTA DELL'INTERRUTTORE NON CAMBIA CON LO STATO
 *
 * WAI-ARIA APG, «Switch Pattern» (letto il 12/09/2026,
 * https://www.w3.org/WAI/ARIA/apg/patterns/switch/): *«It is critical the label
 * on a switch does not change when its state changes»* — lo stato lo porta già
 * `aria-checked`, e un nome che si capovolge si legge come un controllo diverso
 * ogni volta che lo si tocca. Quindi il titolo della riga è FISSO e nomina ciò
 * che si accende; a cambiare è solo la frase esplicativa sotto, che è
 * descrizione e non nome.
 *
 * ⇒ Per questo l'interruttore è `TalosThemedSwitch` e non uno disegnato qui:
 * quella regola è già cablata dentro (ricerca del 2026-08-02), insieme al fatto
 * che resta CONTROLLATO — il salvataggio può fallire, e un interruttore che si
 * capovolge da solo direbbe di aver fatto una cosa che non è successa.
 *
 * ## ⛔ U-12 — qui, e solo qui, si dice da dove viene il testo
 *
 * Nell'elenco non c'è più nessuna etichetta di attendibilità. Qui c'è, ed è un
 * fatto misurato invece che una formula: `content_origin` sa se la riga l'ha
 * scritta la persona o se l'ha annotata il modello dopo aver letto qualcosa di
 * esterno. **La disciplina non cambia** — `trust_level` resta `untrusted` e il
 * prompt continua a trattarle come contesto dichiarato che non può impartire
 * istruzioni.
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BookMarked, Download, Globe, SquarePen, Trash2 } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { useChatController } from '@/stores/chatController'
import { Button } from '@/components/ui/button'
import { TALOS_DANGER_ACTION_CLASS } from '@/lib/dangerAction'
import { talosNotify } from '@/stores/notificationCentre'
import TalosThemedSwitch from '@/components/talos/ui/TalosThemedSwitch.vue'
import TalosMobileMemoryState from '@/components/talos/memory/TalosMobileMemoryState.vue'
import {
    talosMemoryDate,
    talosMemoryKindHintKey,
    talosMemoryKindIcon,
    talosMemoryKindLabelKey,
    talosMemoryScope,
    talosMemoryStateOf,
} from '@/components/talos/memory/memoryShape'
import { exportTalosMemoryText } from '@/components/talos/memory/memoryExport'
import { useTalosTouchWave } from '@/composables/useTalosTouchWave'
import type { TalosLocalMemory } from '@/repositories/chatRepository'

const route = useRoute()
const router = useRouter()
const { t, locale } = useTalosI18n()
const controller = useChatController()

const item = ref<TalosLocalMemory | null>(null)
const loading = ref(true)
const confirming = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)

const id = computed(() => String(route.params.id ?? ''))

const kindIcon = computed(() => talosMemoryKindIcon(item.value?.kind))
const kindLabel = computed(() => t(talosMemoryKindLabelKey(item.value?.kind)))
const kindHint = computed(() => t(talosMemoryKindHintKey(item.value?.kind)))
const stato = computed(() => (item.value ? talosMemoryStateOf(item.value) : 'active'))
const attiva = computed(() => stato.value === 'active')
const scopeLabel = computed(() => {
    const ambito = talosMemoryScope(item.value ?? {})
    return t(ambito.key, ambito.params)
})
const modified = computed(() => talosMemoryDate(item.value?.updated_at, locale.value, true))

/**
 * Da dove viene il testo, detto per come sta scritto nella riga.
 *
 * `user-direct` è l'unica provenienza che si può chiamare «fornito
 * dall'utente». `derived` ed `external` vogliono dire che il testo viene da
 * fuori — una pagina, un documento, un'altra app — anche quando è stato il
 * modello a riscriverlo, ed è esattamente il caso in cui dirlo serve.
 */
const originLabel = computed(() => t(
    item.value?.content_origin === 'user-direct' ? 'memory.originUser' : 'memory.originExternal',
))

/** La frase sotto l'interruttore: descrive, non nomina. Può cambiare. */
const toggleBody = computed(() => {
    if (stato.value === 'review') return t('memory.toggleReview')
    return t(attiva.value ? 'memory.toggleOn' : 'memory.toggleOff')
})

function describeError(cause: unknown): string {
    return cause instanceof Error && cause.message ? cause.message : String(cause)
}

async function load(): Promise<void> {
    try {
        const all = await controller.memories.list()
        item.value = all.find((entry) => entry.id === id.value) ?? null
    } catch (cause) {
        error.value = describeError(cause)
    } finally {
        loading.value = false
    }
}

onMounted(load)

/**
 * Accendere e spegnere.
 *
 * Si riscrive con la riga TORNATA dal deposito, non con una copia modificata a
 * mano: è l'unica che sa davvero cos'è successo. Se la scrittura fallisce,
 * l'interruttore resta dov'era e l'errore lo dice — un controllo che si
 * capovolge comunque avrebbe dichiarato una cosa che non è avvenuta.
 */
async function toggle(): Promise<void> {
    const current = item.value
    if (!current || busy.value) return
    busy.value = true
    error.value = null
    try {
        item.value = await controller.memories.setStatus(current.id, attiva.value ? 'disabled' : 'active')
    } catch (cause) {
        error.value = describeError(cause)
    } finally {
        busy.value = false
    }
}

function edit(): void {
    void router.push({ name: 'memory-edit', params: { id: id.value } })
}

async function exportText(): Promise<void> {
    const current = item.value
    if (!current) return
    try {
        const outcome = await exportTalosMemoryText(current, t('memory.exportText'))
        // Il foglio di Android l'ha già visto: ridirglielo sarebbe rumore. Il
        // ripiego invece va detto, perché è successo qualcosa di diverso da
        // quello che il pulsante prometteva.
        if (outcome !== 'copied') return
        talosNotify({
            key: `memory:exported:${current.id}`,
            channel: 'jobs',
            weight: 'notable',
            title: t('memory.exportCopied'),
            body: current.title,
            at: Date.now(),
        })
    } catch {
        error.value = t('memory.exportFailed')
    }
}

/**
 * Dopo aver cancellato si torna all'elenco, non si resta su una pagina vuota.
 *
 * `replace` e non `push`: la memoria non c'è più, e lasciarla nella cronologia
 * vuol dire che Indietro riporta a una pagina che non può esistere.
 */
async function remove(): Promise<void> {
    const current = item.value
    if (!current) return
    try {
        await controller.memories.remove(current.id)
        await router.replace({ name: 'memory' })
    } catch (cause) {
        error.value = describeError(cause)
    }
}

/** U-14 — l'onda che parte dal dito, sulle azioni di questa pagina. */
const onda = useTalosTouchWave()
</script>

<template>
    <div
        data-testid="talos-memory-item"
        class="mx-auto flex w-full max-w-[46rem] flex-col px-[var(--talos-space-page)] pb-[max(var(--talos-space-page),env(safe-area-inset-bottom))] pt-[var(--talos-space-section)]"
    >
        <p v-if="loading" class="py-6 text-center text-sm text-[var(--talos-muted)]">
            {{ t('common.loading') }}
        </p>

        <!-- La memoria può essere stata cancellata da un'altra parte, o
             l'indirizzo copiato a mano. Si dice, invece di mostrare una pagina
             vuota che sembra un guasto. -->
        <p
            v-else-if="!item"
            data-testid="talos-memory-item-missing"
            class="py-6 text-center text-sm text-[var(--talos-muted)]"
        >
            {{ t('memory.itemMissing') }}
        </p>

        <template v-else>
            <!-- Dove sono e quando l'ho toccata. Il nome della stazione è un
                 bottone vero: è la via di ritorno che si vede, oltre a
                 Indietro. -->
            <div class="mb-[var(--talos-space-section)] flex min-h-touch flex-wrap items-center gap-[var(--talos-space-inline)] text-xs text-[var(--talos-muted)]">
                <BookMarked class="size-4 shrink-0" aria-hidden="true" />
                <button
                    type="button"
                    data-testid="talos-memory-item-back"
                    class="talos-pressable talos-wave-host min-h-touch max-w-[80%] rounded-[var(--talos-radius-control)] text-left leading-[1.5] text-[var(--talos-text)]"
                    @click="router.push({ name: 'memory' })"
                    @pointerdown="onda.onPointerDown"
                >
                    {{ t('navigation.memory') }}
                </button>
                <span class="ml-auto text-2xs">{{ modified }}</span>
            </div>

            <article
                :data-memory-state="stato"
                class="overflow-hidden rounded-[var(--talos-radius-card)] border bg-[var(--talos-card,var(--talos-panel))]"
                :class="stato === 'active'
                    ? 'border-solid border-[var(--talos-border)]'
                    : 'border-dashed border-[var(--talos-border-strong)]'"
            >
                <header class="flex items-center gap-[var(--talos-space-section)] p-[calc(var(--talos-space-page)*2)]">
                    <!-- L'emblema: 4 rem, bordo in accento, l'icona del tipo.
                         È il pezzo che dice «che cos'è questa cosa» prima di
                         qualunque parola. -->
                    <span
                        aria-hidden="true"
                        data-testid="talos-memory-item-emblem"
                        class="grid size-16 shrink-0 place-items-center rounded-[var(--talos-radius-card)] border border-[var(--talos-accent-border)] bg-[var(--talos-active)] text-[var(--talos-accent)]"
                    >
                        <component :is="kindIcon" class="size-[26px]" aria-hidden="true" />
                    </span>
                    <div class="min-w-0">
                        <span class="mb-[var(--talos-space-card)] block text-xs text-[var(--talos-muted)]">
                            {{ kindLabel }}
                        </span>
                        <h1 class="text-2xl font-semibold leading-[1.35] tracking-[-0.025em] text-[var(--talos-text)] [overflow-wrap:anywhere]">
                            {{ item.title }}
                        </h1>
                    </div>
                </header>

                <!-- La frase, citata per intero. Il filo in accento è ciò che
                     dice «queste sono parole di qualcuno»: qui non si taglia,
                     perché questa è la pagina che CONTIENE. -->
                <p
                    data-testid="talos-memory-item-quote"
                    class="mx-[calc(var(--talos-space-page)*2)] mb-[calc(var(--talos-space-page)*2)] mt-[var(--talos-space-inline)] whitespace-pre-line border-l-2 border-[var(--talos-accent)] pl-[var(--talos-space-section)] text-xl leading-[1.75] text-[var(--talos-text)] [overflow-wrap:anywhere]"
                >{{ item.content }}</p>

                <!-- Tre fatti, non una prosa: dove vale, in che stato è, da
                     dove viene il testo. -->
                <div class="grid grid-cols-2 gap-[var(--talos-space-section)] border-t border-[var(--talos-border)] bg-[var(--talos-panel)] px-[calc(var(--talos-space-page)*2)] py-[var(--talos-space-section)]">
                    <div class="flex flex-col items-start gap-[var(--talos-space-inline)]">
                        <span class="text-xs text-[var(--talos-muted)]">{{ t('memory.scopeLabel') }}</span>
                        <strong class="flex items-center gap-[var(--talos-space-inline)] text-sm font-medium text-[var(--talos-text)]">
                            <Globe class="size-4 shrink-0" aria-hidden="true" />
                            {{ scopeLabel }}
                        </strong>
                    </div>
                    <div class="flex flex-col items-start gap-[var(--talos-space-inline)]">
                        <span class="text-xs text-[var(--talos-muted)]">{{ t('memory.stateLabel') }}</span>
                        <TalosMobileMemoryState :state="stato" test-id="talos-memory-item-state" />
                    </div>
                    <!-- U-12: una volta sola, e qui. La frase lunga che spiega
                         cosa vuol dire resta come descrizione estesa, per chi la
                         cerca. -->
                    <div class="flex flex-col items-start gap-[var(--talos-space-inline)]">
                        <span class="text-xs text-[var(--talos-muted)]">{{ t('memory.originLabel') }}</span>
                        <strong
                            data-testid="talos-memory-item-origin"
                            class="text-sm font-medium text-[var(--talos-text)]"
                            :title="t('memory.explanation')"
                        >{{ originLabel }}</strong>
                    </div>
                </div>

                <!-- L'unica cosa che si cambia senza aprire un modulo. -->
                <div class="flex items-center justify-between gap-[var(--talos-space-section)] px-[calc(var(--talos-space-page)*2)] py-[calc(var(--talos-space-page)*1.5)]">
                    <div class="min-w-0">
                        <strong class="text-sm font-medium text-[var(--talos-text)]">{{ t('memory.toggleTitle') }}</strong>
                        <p class="mt-[6px] text-xs leading-[1.7] text-[var(--talos-muted)]">{{ toggleBody }}</p>
                    </div>
                    <TalosThemedSwitch
                        :model-value="attiva"
                        :disabled="busy"
                        :aria-label="t('memory.toggleNamed', { title: item.title })"
                        test-id="talos-memory-item-toggle"
                        @update:model-value="toggle"
                    />
                </div>

                <!-- Il piede dice a cosa serve questo tipo di memoria, e offre
                     l'unica azione che ne cambia il testo. -->
                <div class="flex flex-wrap items-center justify-between gap-[var(--talos-space-inline)] border-t border-[var(--talos-border)] px-[calc(var(--talos-space-page)*2)] py-[var(--talos-space-control)] text-2xs text-[var(--talos-muted)]">
                    <span>{{ kindHint }}</span>
                    <Button
                        type="button"
                        variant="outline"
                        data-testid="talos-memory-item-edit"
                        class="talos-pressable talos-wave-host min-h-touch rounded-[var(--talos-radius-control)] text-xs"
                        @click="edit"
                        @pointerdown="onda.onPointerDown"
                    >
                        <SquarePen class="size-4" aria-hidden="true" />
                        {{ t('memory.edit') }}
                    </Button>
                </div>
            </article>

            <p v-if="error" role="alert" data-testid="talos-memory-item-error" class="mt-[var(--talos-space-card)] text-xs text-[var(--talos-danger)]">
                {{ error }}
            </p>

            <!-- Due azioni, mai di più affiancate: quella che porta la memoria
                 fuori e quella che la toglie di mezzo, agli estremi opposti
                 della riga perché non si tocchi l'una per l'altra. -->
            <div v-if="!confirming" class="mt-[var(--talos-space-section)] flex flex-wrap items-center justify-between gap-[var(--talos-space-inline)]">
                <Button
                    type="button"
                    variant="outline"
                    data-testid="talos-memory-item-export"
                    class="talos-pressable talos-wave-host min-h-touch rounded-[var(--talos-radius-control)] text-xs"
                    @click="exportText"
                    @pointerdown="onda.onPointerDown"
                >
                    <Download class="size-4" aria-hidden="true" />
                    {{ t('memory.exportText') }}
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    data-testid="talos-memory-item-delete"
                    class="talos-pressable talos-wave-host min-h-touch text-xs text-[var(--talos-muted)]"
                    @click="confirming = true"
                    @pointerdown="onda.onPointerDown"
                >
                    <Trash2 class="size-4" aria-hidden="true" />
                    {{ t('common.delete') }}
                </Button>
            </div>
            <!-- La conferma sta qui accanto, non in una finestra sopra: la
                 memoria resta visibile mentre si decide di cancellarla. (Dall'
                 ELENCO, dove non si vede tutta, la conferma è una finestra
                 vera — vedi `MemoryScreen.vue`.) -->
            <div v-else class="mt-[var(--talos-space-section)] flex flex-wrap items-center justify-between gap-[var(--talos-space-inline)]">
                <p class="min-w-0 text-xs text-[var(--talos-text)]">{{ t('memory.deleteTitle') }}</p>
                <div class="flex items-center gap-[var(--talos-space-inline)]">
                    <Button type="button" variant="ghost" class="min-h-touch text-xs" @click="confirming = false">
                        {{ t('common.cancel') }}
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        data-testid="talos-memory-item-delete-confirm"
                        :class="['min-h-touch text-xs', TALOS_DANGER_ACTION_CLASS]"
                        @click="remove"
                    >
                        {{ t('common.delete') }}
                    </Button>
                </div>
            </div>
        </template>
    </div>
</template>
