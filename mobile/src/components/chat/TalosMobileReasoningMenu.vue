<script setup lang="ts">
/**
 * ⭐ J3 / J3-bis (24-25/10/2026) — il MENU della pillola del ragionamento (`TalosMobileReasoningPill`). Sta in un file suo e si carica
 * solo quando la pillola si apre: il pacchetto d'avvio porta la pillola chiusa, non il menu col suo stile (build vc188: i tetti del
 * blocco iniziale, JS e CSS, erano superati).
 *   · «Ragionamento» + il modello; una riga intera ≥ 44 px per livello (`menuitemradio`, ✓ su quello inviato); la riga A9.
 *   · «Mostra ragionamento» (owner «Come il desktop», A14): SOLO VISTA, preferenza dell'app (`shell.show_reasoning`); riga-interruttore
 *     che non chiude il menu. Quanto ragiona il modello lo dicono i livelli: «Ragionamento esteso» qui non c'è più.
 *   · W3C APG «Menu Button» come il desktop (`pillola-ragionamento.js`): ↑/↓/Home/Fine, Esc e Tab chiudono e tornano alla pillola.
 *   · Ogni scelta dice COME è arrivata (dito o no): col dito il fuoco non va al campo, che aprirebbe la tastiera (J3-bis, Desktop).
 * ⛔ REV5-P1: se i livelli si ridisegnano col menu aperto, il fuoco resta nel menu, sulla stessa posizione, ed Esc chiude ancora.
 */
import { onMounted, ref, watch } from 'vue'
import { Check } from '@lucide/vue'
import { useSettingsStore } from '@/stores/settings'

export interface VoceDelMenu { valore: string; etichetta: string; scelta: boolean }

const props = defineProps<{
    voci: readonly VoceDelMenu[]
    modelName: string
    nota: string
    /** Dove va il fuoco all'apertura: la voce scelta (o la prima), o l'ultima (↑ sulla pillola). */
    daDove: 'scelta' | 'ultima'
}>()
const emit = defineEmits<{
    scegli: [valore: string, conIlDito: boolean]
    chiudi: [alPulsante: boolean]
}>()

const settings = useSettingsStore()
const menu = ref<HTMLElement | null>(null)
/**
 * Il puntatore dell'ultimo `pointerdown` su una riga; la tastiera lo azzera (Invio o Spazio non sono un dito). REV6-J1: la PENNA
 * conta come il dito, perché su Android un `focus()` al campo dentro il suo gesto apre la tastiera allo stesso modo.
 */
let conIlDito = false
function segnaPuntatore(e: PointerEvent): void { conIlDito = e.pointerType === 'touch' || e.pointerType === 'pen' }

function righe(): HTMLElement[] {
    return menu.value ? [...menu.value.querySelectorAll<HTMLElement>('[role="menuitemradio"], [role="menuitemcheckbox"]')] : []
}

onMounted(() => {
    const tutte = righe()
    const scelta = tutte.findIndex((b) => b.getAttribute('role') === 'menuitemradio' && b.getAttribute('aria-checked') === 'true')
    tutte[props.daDove === 'ultima' ? tutte.length - 1 : Math.max(0, scelta)]?.focus()
})

function scegli(valore: string): void {
    emit('scegli', valore, conIlDito)
    conIlDito = false
}

function alternaMostra(): void {
    void settings.setShell({ show_reasoning: settings.state.shell.show_reasoning === false })
}

function tastiMenu(e: KeyboardEvent): void {
    const tutte = righe()
    const i = tutte.indexOf(document.activeElement as HTMLElement)
    const vai = (n: number) => { e.preventDefault(); tutte[(n + tutte.length) % tutte.length]?.focus() }
    if (e.key === 'ArrowDown') vai(i + 1)
    else if (e.key === 'ArrowUp') vai(i - 1)
    else if (e.key === 'Home') vai(0)
    else if (e.key === 'End') vai(tutte.length - 1)
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); emit('chiudi', true) }
    else if (e.key === 'Tab') emit('chiudi', true)
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); conIlDito = false; (document.activeElement as HTMLElement | null)?.click() }
}

/* REV5-P1: prima del ridisegno si ricorda la posizione della voce col fuoco; dopo, se quella voce non c'è più, il fuoco va alla
   stessa posizione (o all'ultima) — mai fuori dal menu, così Esc lo chiude ancora */
const firma = () => props.voci.map((v) => `${v.valore}:${v.scelta}`).join(',')
let posizione = -1
watch(firma, () => { posizione = righe().indexOf(document.activeElement as HTMLElement) }, { flush: 'pre' })
watch(firma, () => {
    if (posizione < 0) return
    const tutte = righe()
    if (!tutte.includes(document.activeElement as HTMLElement)) tutte[Math.min(posizione, tutte.length - 1)]?.focus()
}, { flush: 'post' })
</script>

<template>
    <div
        ref="menu"
        role="menu"
        :aria-label="$t('chat.reasoningPillTitle')"
        data-testid="talos-reasoning-menu"
        class="talos-reasoning-menu bg-[var(--talos-card,var(--popover))] shadow-xl"
        @keydown="tastiMenu"
    >
        <div class="talos-reasoning-menu__testa">
            <span>{{ $t('chat.reasoningPillTitle') }}</span>
            <span data-testid="talos-reasoning-menu-model" class="talos-reasoning-menu__modello">{{ modelName }}</span>
        </div>
        <button
            v-for="v in voci"
            :key="v.valore"
            type="button"
            role="menuitemradio"
            tabindex="-1"
            data-testid="talos-reasoning-level"
            :data-livello="v.valore"
            :aria-checked="v.scelta ? 'true' : 'false'"
            class="talos-reasoning-menu__voce"
            @pointerdown="segnaPuntatore"
            @click="scegli(v.valore)"
        >
            <span>{{ v.etichetta }}</span>
            <Check v-if="v.scelta" class="size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
        </button>
        <p v-if="nota" data-testid="talos-reasoning-note" class="talos-reasoning-menu__nota">{{ nota }}</p>
        <button
            type="button"
            role="menuitemcheckbox"
            tabindex="-1"
            data-testid="talos-reasoning-show"
            :aria-checked="settings.state.shell.show_reasoning !== false ? 'true' : 'false'"
            class="talos-reasoning-menu__voce talos-reasoning-menu__interruttore"
            @click="alternaMostra"
        >
            <span>{{ $t('chat.showReasoning') }}</span>
            <span class="talos-reasoning-menu__levetta" :data-acceso="settings.state.shell.show_reasoning !== false ? 'true' : 'false'" aria-hidden="true" />
        </button>
    </div>
</template>

<style>
/* Il menu sopra il compositore, come il menu dei comandi «/» (`bottom-full`, stesso fondo e stessa ombra): il compositore è il
   riferimento (`position: relative`). Lo stile viaggia col menu, fuori dal foglio d'avvio. */
.talos-reasoning-menu {
    position: absolute;
    bottom: calc(100% + var(--talos-space-inline));
    left: 0;
    z-index: 50;
    width: min(100%, 22rem);
    max-height: min(70dvh, 32rem);
    overflow-y: auto;
    overscroll-behavior: contain;
    border: 1px solid var(--talos-border);
    border-radius: var(--talos-radius-card);
    color: var(--talos-text);
}
.talos-reasoning-menu__testa {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--talos-space-inline);
    padding: 0.75rem 0.875rem;
    border-bottom: 1px solid var(--talos-border);
    font-weight: 600;
}
.talos-reasoning-menu__modello { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--talos-muted); font-weight: 400; font-size: var(--text-xs); }
.talos-reasoning-menu__voce {
    display: flex;
    width: 100%;
    min-height: 44px;
    align-items: center;
    justify-content: space-between;
    gap: var(--talos-space-inline);
    padding: 0 0.875rem;
    border-bottom: 1px solid var(--talos-border);
    text-align: left;
    font-size: var(--text-sm);
}
.talos-reasoning-menu__voce[aria-checked="true"][role="menuitemradio"] { background: var(--talos-accent-soft); font-weight: 600; }
.talos-reasoning-menu__voce:focus-visible { outline: 2px solid var(--talos-ring); outline-offset: -2px; }
.talos-reasoning-menu__nota { margin: 0; padding: 0.625rem 0.875rem; font-size: var(--text-xs); color: var(--talos-muted); border-bottom: 1px solid var(--talos-border); }
.talos-reasoning-menu__interruttore { min-height: 48px; border-bottom: 0; }
.talos-reasoning-menu__levetta {
    position: relative;
    flex: none;
    width: 2.5rem;
    height: 1.5rem;
    border-radius: 999px;
    background: var(--talos-border-strong, var(--talos-border));
    transition: background-color 150ms;
}
.talos-reasoning-menu__levetta::after {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--talos-panel);
    transition: transform 150ms;
}
.talos-reasoning-menu__levetta[data-acceso="true"] { background: var(--talos-accent); }
.talos-reasoning-menu__levetta[data-acceso="true"]::after { transform: translateX(1rem); background: var(--talos-accent-text); }
@media (prefers-reduced-motion: reduce) {
    .talos-reasoning-menu__levetta, .talos-reasoning-menu__levetta::after { transition: none; }
}
</style>
