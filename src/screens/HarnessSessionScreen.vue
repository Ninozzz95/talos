<script setup lang="ts">
/**
 * Harness UI (24/8) — the "detail". Era un trampolino: `window.location.assign()`
 * verso il mockup statico, una navigazione top-level VERA che usciva dalla SPA.
 * L'owner l'ha bocciato guardandolo girare: «l'harness deve essere collegato al
 * resto delle schermate esattamente come il resto delle funzioni» — e aveva
 * ragione, l'ho verificato io stesso lo stesso giorno: il tasto Indietro dentro
 * il mockup non tornava alla SPA e non usciva dall'app (la SPA registra un suo
 * `backButton` col plugin App di Capacitor per la propria navigazione interna;
 * il trampolino distruggeva quel contesto JS uscendo dalla pagina, e Capacitor
 * dice esplicitamente che senza un listener attivo il comportamento nativo di
 * serie resta disattivo — provato con adb keyevent 4, non ipotizzato).
 *
 * Owner approvato 24/8 dopo ricerca web (≥5 fonti, docs+repo): il mockup ora
 * vive in uno SHADOW ROOT dentro QUESTA schermata — nessuna navigazione fuori
 * dalla SPA, quindi la STESSA cronologia Vue Router già verificata su
 * `/memoria` (Indietro → `/`) funziona qui senza bisogno di codice apposta.
 * Lo shadow DOM isola lo stile del mockup dal resto dell'app (e viceversa) —
 * la ragione per cui esiste, non un iframe (la CSP ha `frame-src 'none'`,
 * intatta: lo shadow DOM non ne ha bisogno).
 *   - Vue, Web Components: https://vuejs.org/guide/extras/web-components.html
 *   - Vue, Custom Elements API: https://vuejs.org/api/custom-elements
 *   - "Capacitor doesn't support Shadow DOM?" (letto per intero: era un import
 *     CSS ES2023 non supportato, non lo shadow DOM in sé — Ionic lo usa
 *     ovunque nella stessa WebView): https://forum.ionicframework.com/t/capacitor-doesnt-support-shadow-dom/245510
 *   - Martin Fowler, Micro Frontends (confine di mount/unmount netto, pulizia
 *     dei listener): https://martinfowler.com/articles/micro-frontends.html
 *   - PagerDuty, embedded apps — il pattern "funzione distruttore" che
 *     app.js espone qui come `window.__talosHarnessDestroy`:
 *     https://www.pagerduty.com/eng/react-embedded-apps/
 *   - bryanvaz/vue-custom-element-shadow-examples,
 *     EranGrin/vue-web-component-wrapper (quest'ultimo integra Vue Router):
 *     esempi reali dello stesso schema Vue + shadow DOM.
 *
 * `<link rel="stylesheet">` dentro lo shadow root, non CSS inline: i 10
 * `@font-face` del mockup usano percorsi RELATIVI (`./fonts/*.woff2`) — il
 * link a `/harness-ui/styles.css?build=...` li risolve rispetto al file vero;
 * del testo CSS iniettato a mano risolverebbe rispetto al documento
 * sbagliato. La query usa il build id AVM: un aggiornamento APK non può
 * riaccoppiare HTML nuovo e CSS/JS rimasti nella cache WebView. `app.js` resta
 * un file vero caricato con `<script src>` (mai inline/eval: `script-src
 * 'self'` nella CSP non ha `'unsafe-inline'`).
 *
 * `talosHarnessUiAvailable()` verificato qui, non solo alla sidebar: la
 * rotta resta raggiungibile da un URL diretto anche quando la voce di
 * navigazione è nascosta.
 *
 * L'`:id` seleziona una delle cinque sessioni demo canoniche nel documento
 * statico tramite il ponte AVM tipizzato. Non è wiring di backend: cambia solo
 * lo stato locale dichiaratamente demo già presente nel mockup.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { PluginListenerHandle } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'
import { CircleAlert, ShieldCheck } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import TalosMobileScreen from '@/components/shell/TalosMobileScreen.vue'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'
import { TALOS_APP_BUILD } from '@/lib/appBuild'
import { talosComposerFlags } from '@/lib/composerStyle'
import { findHarnessDemoSession } from '@/lib/harnessDemoSessions'
import {
    announceTalosHarnessUiComposerAction,
    dismissTalosHarnessUiTransientLayers,
    selectTalosHarnessUiSession,
    setTalosHarnessUiKeyboardOpen,
    submitTalosHarnessUiPrompt,
    talosHarnessUiTransientLayersActive,
} from '@/lib/harnessUiBridge'
import { useTalosOverlayBack } from '@/composables/useTalosOverlayBack'
import { talosHarnessUiAvailable } from '@/services/harnessUi'
import { useSettingsStore } from '@/stores/settings'
import type { TalosMobileEffortLevel } from '@/lib/mobileEffort'
import type { TalosMobileCommandId } from '@/lib/mobileCommandRegistry'

const TALOS_HARNESS_UI_BASE = '/harness-ui'
const TALOS_HARNESS_UI_BUILD_QUERY = `?build=${encodeURIComponent(TALOS_APP_BUILD)}`

function harnessUiAssetUrl(fileName: 'index.html' | 'styles.css' | 'app.js'): string {
    return `${TALOS_HARNESS_UI_BASE}/${fileName}${TALOS_HARNESS_UI_BUILD_QUERY}`
}

const route = useRoute()
const router = useRouter()
const { t } = useTalosI18n()
const settings = useSettingsStore()

const available = talosHarnessUiAvailable()
useTalosOverlayBack(
    () => { dismissTalosHarnessUiTransientLayers() },
    talosHarnessUiTransientLayersActive,
)
const sessionId = computed(() => String(route.params.id ?? ''))
const selectedSession = computed(() => findHarnessDemoSession(sessionId.value))
const hostEl = ref<HTMLDivElement | null>(null)
const composerDockEl = ref<HTMLDivElement | null>(null)
const loading = ref(true)
const loadError = ref(false)
const codePrompt = ref('')
const codeModelProfileId = ref('code-gpt-5-6-sol')
const codeEffort = ref<TalosMobileEffortLevel>('high')
const codeThinking = ref(false)
const codeBrowseMode = ref(false)
const codeView = ref('chat')
const codePermission = ref('Workspace write')

const CODE_MODEL_PROFILES: TalosMobileModelProfileView[] = [{
    id: 'code-gpt-5-6-sol',
    provider: 'openai',
    model: 'gpt-5.6-sol',
    display_name: 'gpt-5.6-sol',
    status: 'healthy',
    has_secret: true,
    effort_levels: ['low', 'medium', 'high', 'xhigh', 'max'],
    supports_thinking: true,
    show_in_composer: true,
    capabilities: null,
    probe_ok: true,
}]
const codeComposerShape = computed(() => talosComposerFlags(
    settings.state.shell.composer_shape,
    settings.state.shell.composer_plus,
))
const codeCanSend = computed(() => codePrompt.value.trim().length > 0)

let scriptEl: HTMLScriptElement | null = null
let mounted = false
const keyboardListeners: PluginListenerHandle[] = []
let composerLayoutObserver: ResizeObserver | null = null

async function retainKeyboardListener(registration: Promise<PluginListenerHandle>): Promise<void> {
    try {
        const handle = await registration
        if (!mounted) {
            await handle.remove()
            return
        }
        keyboardListeners.push(handle)
    } catch {
        // Harness remains usable without the enhancement; visualViewport is
        // retained by the static runtime as the browser fallback.
    }
}

async function attachKeyboardBridge(): Promise<void> {
    await Promise.all([
        retainKeyboardListener(Keyboard.addListener(
            'keyboardWillShow',
            () => {
                setTalosHarnessUiKeyboardOpen(true)
                void nextTick(syncComposerLayout)
            },
        )),
        retainKeyboardListener(Keyboard.addListener(
            'keyboardWillHide',
            () => {
                setTalosHarnessUiKeyboardOpen(false)
                void nextTick(syncComposerLayout)
            },
        )),
    ])
}

async function detachKeyboardBridge(): Promise<void> {
    setTalosHarnessUiKeyboardOpen(false)
    const listeners = keyboardListeners.splice(0)
    await Promise.allSettled(listeners.map((listener) => listener.remove()))
}

function syncComposerClearance(): void {
    const host = hostEl.value
    const dock = composerDockEl.value
    if (!host || !dock) return
    const navVisible = !document.body.classList.contains('keyboard-open')
        && (window.innerWidth <= 780 || window.innerHeight <= 500)
    const navClearance = navVisible ? 68 : 0
    host.style.setProperty(
        '--talos-code-composer-clearance',
        `${Math.ceil(dock.getBoundingClientRect().height + navClearance + 12)}px`,
    )
}

function syncComposerWorkspaceBounds(): void {
    const host = hostEl.value
    const dock = composerDockEl.value
    if (!host || !dock) return
    const workspace = host.shadowRoot?.querySelector<HTMLElement>('.workspace-shell')
    if (!workspace) {
        dock.style.left = '0px'
        dock.style.right = '0px'
        return
    }
    const hostRect = host.getBoundingClientRect()
    const workspaceRect = workspace.getBoundingClientRect()
    dock.style.left = `${Math.max(0, workspaceRect.left - hostRect.left)}px`
    dock.style.right = `${Math.max(0, hostRect.right - workspaceRect.right)}px`
}

function syncComposerLayout(): void {
    syncComposerWorkspaceBounds()
    syncComposerClearance()
}

function observeComposerLayout(): void {
    composerLayoutObserver?.disconnect()
    composerLayoutObserver = null
    const host = hostEl.value
    const dock = composerDockEl.value
    const workspace = host?.shadowRoot?.querySelector<HTMLElement>('.workspace-shell')
    if (!host || !dock || typeof ResizeObserver !== 'function') {
        syncComposerLayout()
        return
    }
    composerLayoutObserver = new ResizeObserver(syncComposerLayout)
    composerLayoutObserver.observe(host)
    composerLayoutObserver.observe(dock)
    if (workspace) composerLayoutObserver.observe(workspace)
    syncComposerLayout()
}

function updateCodePrompt(value: string): void {
    codePrompt.value = value
    if (/@$/.test(value)) announceTalosHarnessUiComposerAction('references')
}

function submitCodePrompt(): void {
    const text = codePrompt.value.trim()
    if (!text || !submitTalosHarnessUiPrompt(text)) return
    codePrompt.value = ''
}

function announceCodeComposerAction(action: string): void {
    announceTalosHarnessUiComposerAction(action)
}

function selectCodeCommand(command: TalosMobileCommandId): void {
    if (command === 'send_message') { submitCodePrompt(); return }
    if (command === 'open_browse') {
        codeBrowseMode.value = true
        announceCodeComposerAction('browse')
        return
    }
    if (command === 'open_context_vault') { void router.push({ name: 'context' }); return }
    if (command === 'open_model_center') { void router.push({ name: 'settings-models' }); return }
    if (command === 'open_doctor') { void router.push({ name: 'doctor' }); return }
    if (command === 'open_notes') { void router.push({ name: 'notes' }); return }
    if (command === 'open_tasks') { void router.push({ name: 'tasks' }); return }
    if (command === 'new_session') codePrompt.value = ''
    announceCodeComposerAction(command)
}

function returnToHarnessList(): void {
    void router.push({ name: 'harness' })
}

/** Vedi la nota d'apertura: pulisce solo ciò che sopravvive al componente
 * (i due ascoltatori su `window`/`visualViewport` — lo shadow root e i suoi
 * due ascoltatori interni muoiono da soli con l'host). */
function teardown(): void {
    ;(window as unknown as { __talosHarnessDestroy?: () => void }).__talosHarnessDestroy?.()
    delete (window as unknown as { __talosHarnessRoot?: unknown }).__talosHarnessRoot
    delete (window as unknown as { __talosHarnessHost?: unknown }).__talosHarnessHost
    delete (window as unknown as { __talosHarnessHostBack?: unknown }).__talosHarnessHostBack
    delete (window as unknown as { __talosHarnessHostViewChange?: unknown }).__talosHarnessHostViewChange
    delete (window as unknown as { __talosHarnessHostPermissionChange?: unknown }).__talosHarnessHostPermissionChange
    scriptEl?.remove()
    scriptEl = null
}

async function mountMockup(): Promise<void> {
    const host = hostEl.value
    if (!host) return
    loading.value = true
    loadError.value = false
    teardown()
    try {
        const html = await fetch(harnessUiAssetUrl('index.html'), { cache: 'no-cache' }).then((response) => {
            if (!response.ok) throw new Error(`harness-ui index.html: ${response.status}`)
            return response.text()
        })
        // Un secondo giro sulla STESSA schermata (id diverso, istanza Vue
        // riusata) non può richiamare attachShadow — è permesso una volta
        // sola per elemento. Riusa quello che c'è, ripulito, invece di
        // presumere che sia sempre il primo giro.
        const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
        shadowRoot.replaceChildren()
        // Owner 24/8, dopo aver VISTO il mockup incorporato: due sidebar allo
        // stesso tempo ("un casino") — quella vera di TALOS (chat, sempre
        // presente su tablet: TalosTabletSidebar.vue, F6, "Claude split-view
        // pattern") e quella propria del mockup (sessioni), con
        // branding/campanella duplicati. Cercato lo stato dell'arte: l'App
        // Shell possiede layout E navigazione, il "remote" incorporato non
        // porta la sua — "critical for avoiding multiple navigation
        // components rendering simultaneously" (micro-frontends.tech). Fuse
        // in una sola: questa classe fa scomparire SOLO il pannello sessioni
        // del mockup quando è incorporato — `:host(.talos-embedded)` in
        // styles.css, lo stesso schema `:host()` condizionale citato da MDN
        // per "la stessa web component, comportamento diverso dato dal
        // genitore". Sfogliare le sessioni resta un tocco via
        // `HarnessScreen.vue` (nativo, già costruito), non un secondo
        // pannello persistente in competizione col vero. L'apertura diretta
        // del file (`harness-ui/index.html` da solo, per la revisione
        // design) non porta MAI questa classe: resta il mockup completo di
        // Codex, invariato.
        host.classList.add('talos-embedded')

        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = harnessUiAssetUrl('styles.css')
        shadowRoot.appendChild(link)

        // `index.html` finisce con <script src="app.js"> — saltato qui,
        // aggiunto sotto come elemento tracciato a parte (per poterlo
        // rimuovere allo smontaggio). Uno script arrivato via DOMParser è
        // comunque marcato "già eseguito" dallo spec e non partirebbe
        // spostandolo: escluderlo evita solo una fetch ridondante e inerte.
        const parsed = new DOMParser().parseFromString(html, 'text/html')
        while (parsed.body.firstChild) {
            const node = parsed.body.firstChild
            if (node.nodeName === 'SCRIPT') { node.remove(); continue }
            shadowRoot.appendChild(node)
        }

        // Pianta i puntatori PRIMA di eseguire app.js: le sue $/$$/ROOT()/HOST()
        // di primo livello li leggono appena lo script parte.
        ;(window as unknown as { __talosHarnessRoot?: unknown }).__talosHarnessRoot = shadowRoot
        ;(window as unknown as { __talosHarnessHost?: unknown }).__talosHarnessHost = host
        ;(window as unknown as { __talosHarnessHostBack?: () => void }).__talosHarnessHostBack = returnToHarnessList
        ;(window as unknown as { __talosHarnessHostViewChange?: (view: string) => void })
            .__talosHarnessHostViewChange = (view) => { codeView.value = view }
        ;(window as unknown as { __talosHarnessHostPermissionChange?: (permission: string) => void })
            .__talosHarnessHostPermissionChange = (permission) => { codePermission.value = permission }

        await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script')
            script.src = harnessUiAssetUrl('app.js')
            script.addEventListener('load', () => resolve())
            script.addEventListener('error', () => reject(new Error('harness-ui app.js: load error')))
            scriptEl = script
            shadowRoot.appendChild(script)
        })
        const selection = selectedSession.value
        if (!selection || !selectTalosHarnessUiSession({ id: selection.id, title: selection.title })) {
            throw new Error('harness-ui session selection unavailable')
        }
    } catch {
        loadError.value = true
    } finally {
        loading.value = false
        await nextTick()
        observeComposerLayout()
    }
}

onMounted(() => {
    mounted = true
    if (available) {
        void attachKeyboardBridge()
        if (selectedSession.value) void mountMockup()
        else loading.value = false
    }
    else loading.value = false
})

watch(selectedSession, (selection) => {
    if (!mounted || !available) return
    if (!selection) {
        teardown()
        loading.value = false
        loadError.value = false
        return
    }
    if (!selectTalosHarnessUiSession({ id: selection.id, title: selection.title })) {
        void mountMockup()
    }
}, { flush: 'post' })

watch(composerDockEl, observeComposerLayout, { flush: 'post' })
watch(codeView, () => { void nextTick(syncComposerLayout) })

onBeforeUnmount(() => {
    mounted = false
    void detachKeyboardBridge()
    composerLayoutObserver?.disconnect()
    composerLayoutObserver = null
    teardown()
})
</script>

<template>
    <TalosMobileScreen
        :title="t('navigation.harness')"
        data-testid="talos-harness-session-screen"
        :data-harness-session-id="sessionId"
        tablet-edge-to-edge
        edge-to-edge
        embedded
    >
        <p v-if="!available" data-testid="talos-harness-session-unavailable" class="text-sm text-[var(--talos-muted)]">
            {{ t('harness.unavailable') }}
        </p>
        <div
            v-else-if="!selectedSession"
            data-testid="talos-harness-session-unknown"
            class="flex h-full items-center justify-center p-6"
        >
            <div class="flex w-full max-w-md flex-col items-center gap-3 rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)] p-[var(--talos-space-card)] text-center">
                <span class="flex size-10 items-center justify-center rounded-full bg-[var(--talos-warning-soft)] text-[var(--talos-warning)]">
                    <CircleAlert class="size-5" aria-hidden="true" />
                </span>
                <p data-testid="talos-harness-session-unknown-title" class="text-sm font-semibold text-[var(--talos-text)]">
                    {{ t('harness.unknownTitle') }}
                </p>
                <p class="max-w-sm text-xs leading-5 text-[var(--talos-muted)]">
                    {{ t('harness.unknownSession') }}
                </p>
                <button
                    type="button"
                    data-testid="talos-harness-session-unknown-back"
                    class="talos-pressable min-h-touch rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-[var(--talos-space-control)] text-sm font-semibold text-[var(--talos-text)]"
                    @click="returnToHarnessList"
                >
                    {{ t('harness.unknownBack') }}
                </button>
            </div>
        </div>
        <template v-else>
            <p v-if="loading" data-testid="talos-harness-session-opening" class="text-sm text-[var(--talos-muted)]">
                {{ t('harness.openingMockup') }}
            </p>
            <p v-else-if="loadError" data-testid="talos-harness-session-error" class="text-sm text-[var(--talos-muted)]">
                {{ t('harness.loadFailed') }}
            </p>
            <div
                v-show="!loading && !loadError"
                ref="hostEl"
                data-testid="talos-harness-session-host"
                class="h-full w-full"
            />
            <div
                v-show="!loading && !loadError && codeView === 'chat'"
                ref="composerDockEl"
                data-testid="talos-code-composer-dock"
                class="talos-code-composer-dock"
            >
                <TalosMobileComposer
                    :prompt="codePrompt"
                    :model-profiles="CODE_MODEL_PROFILES"
                    :selected-model-profile-id="codeModelProfileId"
                    :selected-effort="codeEffort"
                    :thinking="codeThinking"
                    :can-send="codeCanSend"
                    :sending="false"
                    :drawer-mode="codeComposerShape.drawerMode"
                    :immersive-composer="codeComposerShape.immersiveComposer"
                    :plus-dropdown="codeComposerShape.plusDropdown"
                    :browse-mode="codeBrowseMode"
                    :attachments-available="true"
                    :context-available="true"
                    @update:prompt="updateCodePrompt"
                    @send="submitCodePrompt"
                    @select-model-profile="codeModelProfileId = $event"
                    @select-effort="codeEffort = $event"
                    @select-thinking="codeThinking = $event"
                    @toggle-browse="codeBrowseMode = $event"
                    @select-slash-command="selectCodeCommand"
                    @attach="announceCodeComposerAction('attach')"
                    @take-photo="announceCodeComposerAction('photo')"
                    @pick-photos="announceCodeComposerAction('photos')"
                    @open-context="void router.push({ name: 'context' })"
                    @open-model-lab="void router.push({ name: 'settings-models' })"
                    @refresh-models="announceCodeComposerAction('refresh-models')"
                    @enhance-prompt="announceCodeComposerAction('enhance')"
                    @enhance-blocked="announceCodeComposerAction('enhance-blocked')"
                    @open-browser-url="announceCodeComposerAction('browser-url')"
                >
                    <button
                        type="button"
                        data-testid="talos-code-autonomy-chip"
                        :aria-label="`${t('autonomia.titolo')}: ${codePermission}`"
                        :title="codePermission"
                        aria-haspopup="dialog"
                        class="talos-pressable flex min-h-touch max-w-40 shrink-0 items-center gap-1.5 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2.5 text-xs text-[var(--talos-muted)]"
                        @click="announceCodeComposerAction('permissions')"
                    >
                        <ShieldCheck class="size-3.5 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                        <span class="hidden min-w-0 truncate md:inline">{{ codePermission }}</span>
                    </button>
                </TalosMobileComposer>
            </div>
        </template>
    </TalosMobileScreen>
</template>

<style scoped>
.talos-code-composer-dock {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 40;
    pointer-events: none;
    transition:
        opacity var(--talos-motion-duration-composer-expand, 180ms) var(--talos-motion-ease-composer-expand, ease-out),
        transform var(--talos-motion-duration-composer-expand, 180ms) var(--talos-motion-ease-composer-expand, ease-out);
}

.talos-code-composer-dock :deep([data-testid="talos-mobile-composer"]) {
    pointer-events: auto;
    box-sizing: border-box;
    width: calc(100% - 1.5rem);
    max-width: 920px;
    margin-inline: auto;
}

@media (max-width: 780px), (max-height: 500px) {
    .talos-code-composer-dock {
        bottom: 68px;
    }
}

:global(body.keyboard-open .talos-code-composer-dock) {
    bottom: 0;
}

@media (prefers-reduced-motion: reduce) {
    .talos-code-composer-dock {
        transition-duration: 0ms;
    }
}
</style>
