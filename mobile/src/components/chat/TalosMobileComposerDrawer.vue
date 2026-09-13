<script setup lang="ts">
/**
 * Il foglio «+» del compositore, sul pannello «Cosa vuoi fare?» del mockup
 * «Talos Calm Finale» (`quick()`, r. 2942): una ricerca, quattro categorie
 * (Allega · Crea · Strumenti · Agente) e le voci della categoria scelta.
 *
 * Owner 12/09 19:22, dal Pad: «il drawer + non e' quello del mockup, perche'?».
 * Era il foglio precedente (una griglia di sei riquadri): la forma del mockup
 * era stata rimandata. Ora e' questa — con SOLE funzioni vere: le voci demo del
 * mockup (crea immagine/audio/video, skill) non ci sono, perche' non c'e' un
 * generatore dietro e una voce che promette e non mantiene e' una bugia.
 *
 * ⛔ Niente sparisce rispetto al foglio precedente: allega, foto, fotocamera,
 * Libreria, Laboratorio modelli e Migliora prompt restano (stessi
 * `data-testid`), ognuno nella sua categoria. «Naviga sul web» NON c'e' qui,
 * per decisione dell'owner (6/9 e 12/09): resta il comando slash.
 *
 * Le categorie seguono il pattern Tabs dell'APG WAI-ARIA
 * (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/, letto il 2026-09-12):
 * `role=tablist` con orientamento orizzontale, `aria-selected` sulla scheda
 * attiva, `aria-controls` verso il pannello, `tabindex` rotante e frecce
 * sinistra/destra che spostano il fuoco e attivano la scheda.
 */
import { computed, nextTick, ref, watch } from 'vue'
import {
    BookMarked, Camera as CameraIcon, CheckSquare, Code2, Database, FileText, FlaskConical, Images,
    Paperclip, Presentation, Search, Smartphone, Sparkles, Wrench, Zap,
} from '@lucide/vue'
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import { talosCurva, talosDurataMs, talosMotionConsentito } from '@/composables/useTalosCalmMotion'
import { useTalosSlidingIndicator } from '@/composables/useTalosSlidingIndicator'
import { useTalosI18n } from '@/i18n'
import type { TalosMobileEffortLevel } from '@/lib/mobileEffort'
import type { TalosMobileRouteName } from '@/lib/mobileRoutes'

type Categoria = 'attach' | 'create' | 'tools' | 'agent'
export type TalosComposerPreset = 'slides' | 'document' | 'analyze'

const props = defineProps<{
    canEnhance: boolean
    enhanceReason?: string | null
    thinking: boolean
    supportsThinking: boolean
    effortLevels: readonly string[]
    selectedEffort: string
    attachmentsAvailable: boolean
    contextAvailable: boolean
    attachmentDisabledReason?: string
    contextDisabledReason?: string
    enhancing?: boolean
    /** Gli attrezzi del modello per questa chat (owner 15:45): qui, sotto «Agente». */
    agentToolsEnabled?: boolean
    /** Codice c'e' solo dove il ponte nativo esiste (build di sviluppo). */
    harnessAvailable?: boolean
}>()
const emit = defineEmits<{
    close: []
    attach: []
    takePhoto: []
    pickPhotos: []
    openContext: []
    openModelLab: []
    selectThinking: [enabled: boolean]
    selectEffort: [level: TalosMobileEffortLevel]
    enhancePrompt: []
    /** Le voci «Crea …» precompilano il compositore (owner 15:45): la schermata decide il testo. */
    preset: [id: TalosComposerPreset]
    /** Le voci che aprono un'altra stazione: la schermata naviga. */
    navigate: [route: TalosMobileRouteName]
    setAgentToolsEnabled: [enabled: boolean]
}>()
const { t } = useTalosI18n()

interface Voce {
    readonly id: string
    readonly categoria: Categoria
    readonly testId: string
    readonly icon: unknown
    readonly title: string
    /** Il nome per chi ascolta lo schermo, quando il titolo visibile non basta. */
    readonly label?: string
    readonly subtitle: string
    readonly disabled?: boolean
    readonly reason?: string
    readonly run: () => void
    /** Una voce a due stati (interruttore) invece di un'azione che chiude il foglio. */
    readonly checked?: boolean
}

const ORDINE: readonly Categoria[] = ['attach', 'create', 'tools', 'agent']
const categoria = ref<Categoria>('attach')
const ricerca = ref('')
const schede = ref<HTMLButtonElement[]>([])
const gruppoSchede = ref<HTMLElement | null>(null)
const pannello = ref<HTMLElement | null>(null)

/**
 * U-14, owner 12/09 («il mockup aveva lo slide nel drawer +»). Due movimenti,
 * entrambi dal mockup:
 * 1. il riquadro acceso SCIVOLA da una categoria all'altra (`animateIndicators`
 *    sulle `.action-categories`, pillola, 300 ms) — lo stesso filo delle
 *    stazioni, `useTalosSlidingIndicator`;
 * 2. le voci della categoria nuova ENTRANO da destra: opacità .25→1 e
 *    translateX 8px→0 in 180 ms (r. 3577). Durata dal motore
 *    (`--talos-motion-calm-panel`), curva di `tab-change`, niente se la persona
 *    ha chiesto meno movimento.
 */
useTalosSlidingIndicator(gruppoSchede, categoria)
const PANNELLO_TOKEN = '--talos-motion-calm-panel'
const PANNELLO_SERIE_MS = 180
let entrata: Animation | null = null
watch(categoria, async () => {
    // Il mockup non lascia RESTRINGERE il foglio al cambio di categoria (r. 3579):
    // il pannello tiene l'altezza più grande vista, così le schede non saltano.
    const prima = pannello.value?.offsetHeight ?? 0
    await nextTick()
    const el = pannello.value
    if (!el) return
    const tenuta = Number.parseFloat(el.style.minHeight || '0') || 0
    if (prima > tenuta) el.style.minHeight = `${prima}px`
    if (typeof el.animate !== 'function' || !talosMotionConsentito(el, PANNELLO_TOKEN)) return
    if (entrata && entrata.playState !== 'finished') entrata.cancel()
    entrata = el.animate(
        [{ opacity: 0.25, transform: 'translateX(8px)' }, { opacity: 1, transform: 'translateX(0)' }],
        { duration: talosDurataMs(el, PANNELLO_TOKEN, PANNELLO_SERIE_MS), easing: talosCurva(el, '--talos-motion-ease-tab-change'), fill: 'none' },
    )
    entrata.finished.then(() => { entrata = null }, () => { entrata = null })
})

const categorie = computed<Array<{ id: Categoria, icon: unknown, title: string, subtitle: string }>>(() => [
    { id: 'attach', icon: Paperclip, title: t('chat.drawerAttach'), subtitle: t('chat.drawerAttachHint') },
    { id: 'create', icon: FileText, title: t('chat.drawerCreate'), subtitle: t('chat.drawerCreateHint') },
    { id: 'tools', icon: Wrench, title: t('chat.drawerTools'), subtitle: t('chat.drawerToolsHint') },
    { id: 'agent', icon: Zap, title: t('chat.drawerAgent'), subtitle: t('chat.drawerAgentHint') },
])

/** Frecce sinistra/destra: fuoco E attivazione, come nell'APG (scheda attivata al fuoco). */
function onTabKeydown(event: KeyboardEvent): void {
    const passo = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!passo) return
    event.preventDefault()
    const indice = (ORDINE.indexOf(categoria.value) + passo + ORDINE.length) % ORDINE.length
    categoria.value = ORDINE[indice]!
    schede.value[indice]?.focus()
}

function chiudi(action: () => void): () => void {
    return () => { action(); emit('close') }
}

const voci = computed<Voce[]>(() => {
    const elenco: Voce[] = [
        { id: 'attach', categoria: 'attach', testId: 'talos-drawer-attach', icon: Paperclip, title: t('chat.attachFile'), subtitle: t('chat.drawerAttachFileHint'), disabled: !props.attachmentsAvailable, reason: props.attachmentDisabledReason, run: chiudi(() => emit('attach')) },
        { id: 'pick-photos', categoria: 'attach', testId: 'talos-drawer-pick-photos', icon: Images, title: t('chat.drawerPickImage'), subtitle: t('chat.drawerPickImageHint'), disabled: !props.attachmentsAvailable, reason: props.attachmentDisabledReason, run: chiudi(() => emit('pickPhotos')) },
        { id: 'take-photo', categoria: 'attach', testId: 'talos-drawer-take-photo', icon: CameraIcon, title: t('chat.takePhoto'), subtitle: t('chat.drawerTakePhotoHint'), disabled: !props.attachmentsAvailable, reason: props.attachmentDisabledReason, run: chiudi(() => emit('takePhoto')) },
        { id: 'context', categoria: 'attach', testId: 'talos-drawer-context', icon: Database, title: t('chat.drawerFromLibrary'), label: t('chat.chooseGroundingContext'), subtitle: t('chat.drawerFromLibraryHint'), disabled: !props.contextAvailable, reason: props.contextDisabledReason, run: chiudi(() => emit('openContext')) },
        { id: 'enhance', categoria: 'create', testId: 'talos-drawer-enhance', icon: Sparkles, title: t('chat.improvePrompt'), subtitle: props.canEnhance ? t('chat.drawerEnhanceHint') : (props.enhanceReason ?? t('chat.drawerEnhanceHint')), disabled: props.enhancing === true, reason: props.enhanceReason ?? undefined, run: chiudi(() => emit('enhancePrompt')) },
        { id: 'slides', categoria: 'create', testId: 'talos-drawer-preset-slides', icon: Presentation, title: t('chat.drawerPresetSlides'), subtitle: t('chat.drawerPresetHint'), run: chiudi(() => emit('preset', 'slides')) },
        { id: 'document', categoria: 'create', testId: 'talos-drawer-preset-document', icon: FileText, title: t('chat.promptDocument'), subtitle: t('chat.drawerPresetHint'), run: chiudi(() => emit('preset', 'document')) },
        { id: 'analyze', categoria: 'create', testId: 'talos-drawer-preset-analyze', icon: Search, title: t('chat.promptAnalyze'), subtitle: t('chat.drawerAnalyzeHint'), run: chiudi(() => emit('preset', 'analyze')) },
        { id: 'note-new', categoria: 'tools', testId: 'talos-drawer-note-new', icon: FileText, title: t('notes.add'), subtitle: t('chat.drawerNoteHint'), run: chiudi(() => emit('navigate', 'note-new')) },
        { id: 'memory-new', categoria: 'tools', testId: 'talos-drawer-memory-new', icon: BookMarked, title: t('memory.newMemory'), subtitle: t('chat.drawerMemoryHint'), run: chiudi(() => emit('navigate', 'memory-new')) },
        { id: 'privilege', categoria: 'tools', testId: 'talos-drawer-privilege', icon: Smartphone, title: t('chat.drawerPhoneControl'), subtitle: t('chat.drawerPhoneControlHint'), run: chiudi(() => emit('navigate', 'settings-privilege')) },
        { id: 'toolforge', categoria: 'tools', testId: 'talos-drawer-toolforge', icon: Wrench, title: t('navigation.toolForge'), subtitle: t('chat.drawerToolForgeHint'), run: chiudi(() => emit('navigate', 'toolforge')) },
        { id: 'model-lab', categoria: 'tools', testId: 'talos-drawer-model-lab', icon: FlaskConical, title: t('navigation.models'), subtitle: t('chat.drawerModelLabHint'), run: chiudi(() => emit('openModelLab')) },
        { id: 'agent-tools', categoria: 'agent', testId: 'talos-drawer-agent-tools', icon: Zap, title: t('chat.drawerAgentTools'), subtitle: props.agentToolsEnabled === false ? t('chat.agentToolsOff') : t('chat.agentToolsOn'), checked: props.agentToolsEnabled !== false, run: () => emit('setAgentToolsEnabled', props.agentToolsEnabled === false) },
        { id: 'task-new', categoria: 'agent', testId: 'talos-drawer-task-new', icon: CheckSquare, title: t('chat.drawerPlanTask'), subtitle: t('chat.drawerPlanTaskHint'), run: chiudi(() => emit('navigate', 'task-new')) },
        { id: 'research-new', categoria: 'agent', testId: 'talos-drawer-research-new', icon: Search, title: t('navigation.research'), subtitle: t('chat.drawerResearchHint'), run: chiudi(() => emit('navigate', 'research-new')) },
    ]
    if (props.harnessAvailable) {
        elenco.push({ id: 'harness', categoria: 'agent', testId: 'talos-drawer-harness', icon: Code2, title: t('chat.drawerCode'), subtitle: t('chat.drawerCodeHint'), run: chiudi(() => emit('navigate', 'harness')) })
    }
    return elenco
})

/** Con una ricerca si guardano TUTTE le categorie; senza, quella scelta. */
const vociVisibili = computed(() => {
    const q = ricerca.value.trim().toLowerCase()
    if (q) return voci.value.filter(v => `${v.title} ${v.subtitle}`.toLowerCase().includes(q))
    return voci.value.filter(v => v.categoria === categoria.value)
})
</script>

<template>
    <TalosMobileComposerSheet :title="$t('chat.drawerTitle')" testid="talos-composer-drawer" @close="emit('close')">
        <label class="talos-action-search">
            <Search class="size-4 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
            <input
                v-model="ricerca"
                type="search"
                data-testid="talos-drawer-search"
                :placeholder="$t('chat.drawerSearch')"
                :aria-label="$t('chat.drawerSearch')"
                class="min-w-0 flex-1 bg-transparent text-sm text-[var(--talos-text)] outline-none placeholder:text-[var(--talos-muted)]"
            >
        </label>
        <div
            v-if="!ricerca.trim()"
            ref="gruppoSchede"
            class="talos-action-categories"
            role="tablist"
            aria-orientation="horizontal"
            :aria-label="$t('chat.drawerCategories')"
        >
            <button
                v-for="c in categorie"
                :key="c.id"
                ref="schede"
                type="button"
                role="tab"
                :id="`talos-drawer-tab-${c.id}`"
                aria-controls="talos-drawer-options"
                :data-testid="`talos-drawer-tab-${c.id}`"
                :aria-selected="categoria === c.id"
                :tabindex="categoria === c.id ? 0 : -1"
                class="talos-pressable talos-action-category"
                @click="categoria = c.id"
                @keydown="onTabKeydown"
            >
                <span v-if="categoria === c.id" data-talos-indicator class="talos-action-category-indicator" aria-hidden="true" />
                <component :is="c.icon" class="size-5 shrink-0" aria-hidden="true" />
                <span class="min-w-0">
                    <strong>{{ c.title }}</strong>
                    <small>{{ c.subtitle }}</small>
                </span>
            </button>
        </div>
        <div
            id="talos-drawer-options"
            ref="pannello"
            class="talos-action-options"
            role="tabpanel"
            :aria-labelledby="ricerca.trim() ? undefined : `talos-drawer-tab-${categoria}`"
            data-testid="talos-drawer-options"
        >
            <button
                v-for="v in vociVisibili"
                :key="v.id"
                type="button"
                :data-testid="v.testId"
                :aria-label="v.label ?? v.title"
                :role="v.checked === undefined ? undefined : 'switch'"
                :aria-checked="v.checked === undefined ? undefined : v.checked"
                :disabled="v.disabled === true"
                :title="v.disabled && v.reason ? v.reason : undefined"
                class="talos-pressable talos-action-row min-h-13 w-full"
                @click="v.run()"
            >
                <span class="talos-action-row-icon" aria-hidden="true"><component :is="v.icon" class="size-5" /></span>
                <span class="min-w-0 flex-1">
                    <strong>{{ v.title }}</strong>
                    <small>{{ v.disabled && v.reason ? v.reason : v.subtitle }}</small>
                </span>
                <span v-if="v.checked !== undefined" class="talos-action-switch" :data-on="v.checked" aria-hidden="true"><span /></span>
            </button>
            <p v-if="!vociVisibili.length" class="px-2 py-4 text-sm text-[var(--talos-muted)]">{{ $t('chat.drawerNoResults') }}</p>
        </div>
    </TalosMobileComposerSheet>
</template>
