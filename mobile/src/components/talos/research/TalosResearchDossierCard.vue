<script setup lang="ts">
/**
 * Una ricerca come DOSSIER, nella forma del mockup «Talos Calm Finale».
 *
 * Il mockup (`pResearchCard`, app.js:194-199) disegna un fascicolo: una
 * linguetta di cartellina che sporge in alto, la parola «Dossier» con lo stato
 * accanto, la domanda, un estratto di cio' che c'e' dentro, le prime fonti, e
 * un piede coi conti. Questa e' quella forma portata sul modello dati vero —
 * dove le fonti sono quelle raccolte davvero, i riscontri sono affermazioni
 * verificate, e uno stato puo' essere una cosa che nel mockup non esiste.
 *
 * ## Cio' che il mockup NON poteva sapere
 *
 * ⛔ MB-1: una ricerca puo' essere finita e non avere un rapporto che si
 * rilegge. In quel caso il riquadro dell'estratto non mostra l'estratto — non
 * ce n'e' uno — ma dice CHE COSA E' SUCCESSO e CHE COSA FARE. E' lo stesso
 * posto, perche' e' li' che l'occhio va dopo il titolo, ed e' l'unica cosa che
 * quella scheda ha da dire.
 *
 * ## Chi apre, chi agisce
 *
 * Il corpo APRE (regola dell'owner: la scheda apre). Le fonti sono scorciatoie
 * verso la pagina della fonte. Tutto il resto sta nel menu ⋯ — uno solo per
 * riga, mai due azioni affiancate — che si apre anche col tasto destro.
 */
import { computed, ref } from 'vue'
import { FileText, Folder, FolderCheck, Globe, Loader2, Search, TriangleAlert, Check } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import TalosRowActions, { type TalosRowAction } from '@/components/talos/ui/TalosRowActions.vue'
import TalosResearchStatusPill from '@/components/talos/research/TalosResearchStatusPill.vue'
import {
    talosResearchBucketOneKey,
    talosResearchFootOf,
} from '@/components/talos/research/researchPresentation'
import {
    talosResearchCardVoice,
    talosResearchNeedsAttention,
    talosResearchSolidity,
    type TalosResearchCard,
} from '@/lib/research/researchCard'
import { useTalosTouchWave } from '@/composables/useTalosTouchWave'

const props = defineProps<{
    card: TalosResearchCard
    /** Gia' formattata: la scheda non sa che giorno e'. */
    dateLabel: string
    actions: readonly TalosRowAction[]
    selectionMode: boolean
    selected: boolean
    selectable: boolean
    busy: boolean
}>()

const emit = defineEmits<{ open: []; action: [string]; source: [number] }>()

const { t } = useTalosI18n()
const onda = useTalosTouchWave()

const voice = computed(() => talosResearchCardVoice(props.card))
const foot = computed(() => talosResearchFootOf(props.card))
/** Al SINGOLARE: sotto questa pastiglia c'e' una ricerca, non un filtro. */
const bucketLabel = computed(() => t(talosResearchBucketOneKey(props.card.bucket)))

/** Le prime due, come il mockup: una scheda che elenca dodici fonti e' un indice. */
const shownSources = computed(() => props.card.report?.sources.slice(0, 2) ?? [])

/**
 * Che cosa dire quando non c'e' un elenco di fonti da mostrare.
 *
 * ⛔ Le situazioni sono DUE e la scheda ne diceva una sola (Pad, 12/09/2026,
 * foto RC12): «ancora da raccogliere» e' vero solo se nessuna linea di ricerca
 * ha prodotto. Quando le fonti sono gia' sul disco e manca il rapporto che le
 * elenca, quella frase e' lo stato vuoto che dichiara «niente» mentre il dato
 * esiste — e la pagina del rapporto, nello stesso minuto, diceva «Fonti
 * raccolte» sulle stesse linee. La verita' la decide `sourcesGathered`, che la
 * legge dal giornale della corsa.
 */
const sourcesNote = computed<'gathered' | 'pending' | null>(() => {
    if (shownSources.value.length > 0) return null
    return props.card.sourcesGathered ? 'gathered' : 'pending'
})

const solidity = computed(() => {
    const value = talosResearchSolidity(props.card.standing)
    return value === null ? null : Math.round(value * 100)
})

/**
 * L'estratto: la prima affermazione del rapporto, o la prima linea del piano.
 *
 * «Dal rapporto» e «Dal piano» non sono etichette decorative: dicono se quello
 * che si sta leggendo e' un RISULTATO o un'INTENZIONE, e sono due cose che su
 * una scheda si confondono in un istante.
 */
const excerpt = computed(() => {
    const claim = props.card.report?.firstClaim
    if (claim) return { source: t('research.fromReport'), text: claim }
    if (props.card.firstBranch) return { source: t('research.fromPlan'), text: props.card.firstBranch }
    return { source: t('research.fromPlan'), text: t('research.planPending') }
})

/** Il tasto destro apre lo stesso menu dei tre puntini, senza esserne l'unica via. */
const menuHost = ref<HTMLElement | null>(null)
function onContextMenu(event: Event): void {
    event.preventDefault()
    if (props.selectionMode) return
    menuHost.value?.querySelector('button')?.click()
}

function openSource(index: number): void {
    if (props.selectionMode) return
    emit('source', index)
}
</script>

<template>
    <article
        role="listitem"
        data-testid="talos-research-card"
        :data-research-id="props.card.id"
        :data-bucket="props.card.bucket"
        class="talos-calm-marker relative isolate mt-[var(--talos-space-inline)] flex min-w-0 flex-col rounded-[var(--talos-radius-card)] border bg-[var(--talos-panel)] text-left [overflow-wrap:anywhere]"
        :class="[
            props.busy ? 'opacity-60' : '',
            props.selected ? 'border-[var(--talos-accent)]' : 'border-[var(--talos-border)]',
        ]"
        @contextmenu="onContextMenu"
    >
        <!-- La linguetta della cartellina. Sporge sopra il bordo e sta DIETRO
             la scheda (`isolation:isolate` + z negativo, come nel mockup): e'
             cio' che fa leggere il riquadro come un fascicolo invece che come
             un altro riquadro qualunque. -->
        <span
            aria-hidden="true"
            data-testid="talos-research-card-tab"
            class="absolute -top-[9px] left-[var(--talos-space-card)] -z-10 h-[10px] w-16 rounded-t-[6px] border border-b-0 border-[var(--talos-border)] bg-[var(--talos-panel)]"
        />

        <div class="flex min-h-touch items-center justify-between gap-[var(--talos-space-inline)] px-[calc(var(--talos-space-card)*1.5)] pt-[var(--talos-space-card)]">
            <span class="inline-flex min-w-0 items-center gap-[var(--talos-space-inline)] text-xs text-[var(--talos-muted)]">
                <!-- Nel modo selezione la spunta prende il posto della parola
                     «Dossier»: mentre si sceglie, l'unica cosa che conta di una
                     riga e' se e' scelta. Una in corso non si elimina — quindi
                     non si spunta — e lo DICE, invece di lasciare un cerchio
                     che non risponde al dito. -->
                <template v-if="props.selectionMode">
                    <span
                        v-if="props.selectable"
                        data-testid="talos-research-card-tick"
                        class="flex size-5 shrink-0 items-center justify-center rounded-full border-2"
                        :class="props.selected
                            ? 'border-[var(--talos-accent)] bg-[var(--talos-accent)] text-[var(--talos-accent-text)]'
                            : 'border-[var(--talos-border)]'"
                        aria-hidden="true"
                    >
                        <Check v-if="props.selected" class="size-3.5" />
                    </span>
                    <template v-else>
                        <Loader2 class="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
                        <span class="truncate">{{ t('research.runningNotSelectable') }}</span>
                    </template>
                </template>
                <template v-else>
                    <Search class="size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                    <span class="truncate">{{ t('research.dossierType') }}</span>
                </template>
            </span>
            <TalosResearchStatusPill
                :bucket="props.card.bucket"
                :label="bucketLabel"
                :test-id="`talos-research-card-status-${props.card.id}`"
            />
        </div>

        <button
            type="button"
            data-testid="talos-research-open"
            class="talos-pressable talos-wave-host flex min-w-0 flex-1 flex-col items-stretch gap-[var(--talos-space-control)] rounded-[var(--talos-radius-control)] px-[calc(var(--talos-space-card)*1.5)] pb-[var(--talos-space-control)] pt-[var(--talos-space-section)] text-left focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
            :disabled="props.busy"
            :aria-label="props.card.question"
            :aria-pressed="props.selectionMode && props.selectable ? props.selected : undefined"
            @click="emit('open')"
            @pointerdown="onda.onPointerDown"
        >
            <span class="flex items-start gap-[var(--talos-space-inline)]">
                <h2 class="line-clamp-3 min-w-0 flex-1 text-2xl font-semibold leading-[1.25] tracking-[-0.025em] text-[var(--talos-text)]">
                    {{ props.card.question }}
                </h2>
                <TriangleAlert
                    v-if="talosResearchNeedsAttention(props.card)"
                    data-testid="talos-research-attention"
                    class="mt-1 size-4 shrink-0 text-[var(--talos-warning)]"
                    :aria-label="t('research.needsAttention')"
                />
            </span>

            <!-- La domanda come e' stata posta, e SOLO se qualcuno ha dato un
                 nome diverso alla ricerca: senza rinomina il titolo e' gia' la
                 domanda, e stamparla due volte riempirebbe la scheda di se'
                 stessa. -->
            <p
                v-if="props.card.renamed"
                data-testid="talos-research-card-question"
                class="line-clamp-2 text-sm leading-6 text-[var(--talos-muted)]"
            >
                {{ props.card.originalQuestion }}
            </p>

            <!-- ⛔ MB-1 — lo stesso riquadro, due contenuti diversi.
                 Quando la ricerca e' finita senza un rapporto che si rilegge,
                 qui non c'e' niente da citare: c'e' da dire cosa e' successo e
                 cosa si puo' fare. -->
            <span
                v-if="voice.kind === 'incomplete'"
                data-testid="talos-research-card-incomplete"
                :data-completion="props.card.bucket"
                class="flex flex-col gap-[6px] rounded-[var(--talos-radius-control)] border border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] p-[var(--talos-space-control)]"
            >
                <span class="text-xs leading-[1.6] text-[var(--talos-text)]">
                    {{ t(`research.completion.${props.card.bucket}.what`) }}
                </span>
                <!-- L'invito compare solo se la ricerca si puo' davvero
                     riprendere. Un «Riprendi» accanto a una che il motore non
                     riapre sarebbe un pulsante che mente. -->
                <span
                    v-if="props.actions.some((action) => action.id === 'resume')"
                    data-testid="talos-research-card-todo"
                    class="text-xs font-medium leading-[1.6] text-[var(--talos-warning)]"
                >
                    {{ t(`research.completion.${props.card.bucket}.do`) }}
                </span>
            </span>
            <span
                v-else
                data-testid="talos-research-card-excerpt"
                class="flex flex-col gap-[6px] rounded-[var(--talos-radius-control)] bg-[var(--talos-panel-soft)] p-[var(--talos-space-control)]"
            >
                <span class="text-2xs text-[var(--talos-muted)]">{{ excerpt.source }}</span>
                <span class="line-clamp-3 text-xs leading-[1.7] text-[var(--talos-text)]">{{ excerpt.text }}</span>
            </span>

            <!-- Il BILANCIO, che e' il differenziatore: quanto regge, non
                 quante pagine sono state aperte. -->
            <span
                v-if="voice.kind === 'pausing'"
                data-testid="talos-research-card-pausing"
                class="font-mono text-2xs tabular-nums text-[var(--talos-warning)]"
            >
                {{ t('research.pausing', { done: props.card.done, total: props.card.total }) }}
            </span>
            <span
                v-else-if="voice.kind === 'running'"
                data-testid="talos-research-card-progress"
                class="font-mono text-2xs tabular-nums text-[var(--talos-accent)]"
            >
                {{ t('research.cardRunning', { done: props.card.done, total: props.card.total }) }}
            </span>
            <span
                v-else-if="voice.kind === 'standing' && props.card.standing"
                data-testid="talos-research-card-standing"
                class="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-2xs tabular-nums text-[var(--talos-muted)]"
            >
                <span class="text-[var(--talos-text)]">{{ solidity }}%</span>
                <span>{{ t('research.cardStanding', {
                    supported: props.card.standing.supported,
                    partial: props.card.standing.partial,
                    contested: props.card.standing.contested ?? 0,
                    unsupported: props.card.standing.unsupported,
                    unchecked: props.card.standing.unchecked,
                }) }}</span>
            </span>
        </button>

        <!-- Le prime fonti, raggiungibili da qui. Quando non ce ne sono lo si
             dice: una scheda che tace sulle fonti si legge come una ricerca
             senza fonti, ed e' un'altra cosa. -->
        <div class="flex flex-col px-[calc(var(--talos-space-card)*1.5)]">
            <button
                v-for="(source, index) in shownSources"
                :key="`${source.title}-${index}`"
                type="button"
                :data-testid="`talos-research-card-source-${index}`"
                :aria-label="t('research.openSource', { title: source.title })"
                :disabled="props.selectionMode"
                class="talos-pressable flex min-h-touch items-center gap-[var(--talos-space-inline)] rounded-[var(--talos-radius-control)] text-left text-xs text-[var(--talos-muted)]"
                @click.stop="openSource(index)"
            >
                <component :is="source.web ? Globe : FileText" class="size-4 shrink-0" aria-hidden="true" />
                <span class="truncate">{{ source.title }}</span>
            </button>
            <!-- ⛔ Senza elenco ci sono DUE situazioni, e la scheda ne diceva una
                 sola. Vedi `talosResearchSourcesGathered`: le fonti possono
                 essere gia' sul disco anche quando nessun rapporto le elenca. -->
            <span
                v-if="sourcesNote === 'gathered'"
                data-testid="talos-research-card-sources-gathered"
                class="flex min-h-touch items-center gap-[var(--talos-space-inline)] text-2xs text-[var(--talos-muted)]"
            >
                <FolderCheck class="size-4 shrink-0" aria-hidden="true" />
                {{ t('research.sourcesGathered') }}
            </span>
            <span
                v-else-if="sourcesNote === 'pending'"
                data-testid="talos-research-card-sources-pending"
                class="flex min-h-touch items-center gap-[var(--talos-space-inline)] text-2xs text-[var(--talos-muted)]"
            >
                <Folder class="size-4 shrink-0" aria-hidden="true" />
                {{ t('research.sourcesPending') }}
            </span>
        </div>

        <div class="mt-[var(--talos-space-card)] flex min-h-touch items-center justify-between gap-[var(--talos-space-inline)] border-t border-[var(--talos-border)] pl-[calc(var(--talos-space-card)*1.5)] pr-[var(--talos-space-control)] text-2xs text-[var(--talos-muted)]">
            <span class="flex min-w-0 flex-wrap items-center gap-x-[6px] truncate">
                <template v-if="foot.sources">
                    <span>{{ t(foot.sources.key, { count: foot.sources.count }) }}</span>
                    <span aria-hidden="true">·</span>
                </template>
                <span>{{ t(foot.second.key, { count: foot.second.count }) }}</span>
                <span aria-hidden="true">·</span>
                <span>{{ props.dateLabel }}</span>
                <span v-if="props.busy" class="inline-flex items-center gap-1 text-[var(--talos-accent)]">
                    <Loader2 class="size-3 animate-spin" aria-hidden="true" />
                    {{ t('research.working') }}
                </span>
            </span>
            <span v-if="!props.selectionMode" ref="menuHost" class="shrink-0">
                <TalosRowActions
                    :label="t('research.actionsFor', { title: props.card.question })"
                    :items="props.actions"
                    :test-id="`talos-research-menu-${props.card.id}`"
                    @select="(id) => emit('action', id)"
                />
            </span>
        </div>
    </article>
</template>
