<script setup lang="ts">
/**
 * The actions of one row, behind a visible button.
 *
 * The research of 2026-08-03 settled a question this app had answered the other
 * way round. Android Design shows an overflow control INSIDE the list item for
 * an item's extra actions, and every Google app it checked — Gmail, Photos,
 * Keep, Drive, Files — spends tap-and-hold on entering multi-selection. A menu
 * reachable only by holding is a menu with no sign that it exists: GhostUI
 * (CHI 2026) files long-press among the "hidden" interactions precisely because
 * nothing on screen hints at it.
 *
 * The accessibility argument is the one that made it non-negotiable. Holding is
 * a single-pointer gesture, so it does not break WCAG 2.5.1 by itself — the
 * failures are 2.1.1 (keyboard) and 4.1.2 (name, role, state). And inside a
 * WebView there is no public way to attach an Android accessibility action to
 * one DOM row: those APIs act on native Views, and a JavaScript timer is not
 * ACTION_LONG_CLICK to TalkBack. A real `<button>` is not the tidier option
 * here, it is the only one that can be reached.
 *
 * So: this is the visible path, and holding stays free for selection.
 *
 * Items are given per row rather than filtered inside, because which actions
 * exist is a fact about the thing — a paused research offers Resume, a running
 * one offers Pause — and a menu of disabled entries makes the reader work out
 * why. Structure encoding truth, not decoration.
 */
import { computed, nextTick, ref } from 'vue'
import { useTalosOverlayBack } from '@/composables/useTalosOverlayBack'
import { Check, MoreVertical } from '@lucide/vue'

export interface TalosRowAction {
    readonly id: string
    readonly label: string
    /** Renders apart, below a rule. Still a menuitem — colour is never the only signal. */
    readonly danger?: boolean
    readonly testId?: string
    /**
     * Una voce che sta ACCESA o SPENTA, non una che si esegue.
     *
     * Serviva alla Libreria — «tieni sempre questo file nel contesto», «non
     * usarlo mai» — che per questo aveva un menu tutto suo. Due menu di riga
     * nella stessa app e' la cosa che la coerenza deve togliere, quindi la
     * spunta viene qui invece che restare laggiu'.
     *
     * `undefined` vuol dire «non e' una voce a due stati»: chi non la usa non
     * si accorge che esiste.
     */
    readonly checked?: boolean
    readonly disabled?: boolean
    /**
     * L'icona della voce, e il nome che la voce ha per chi non la vede.
     *
     * Vengono dalla Libreria, che aveva un menu suo e lo faceva meglio: con
     * l'icona un elenco si scorre a colpo d'occhio, e `ariaLabel` porta il NOME
     * della riga dentro la voce — «Elimina» da solo, letto ad alta voce fuori
     * contesto, non dice cosa si sta per eliminare.
     *
     * Unificare voleva dire scegliere fra i due menu: ha vinto quello che dava
     * di piu', non quello che c'era in piu' posti.
     */
    readonly icon?: unknown
    readonly ariaLabel?: string
}

const props = defineProps<{
    /**
     * The trigger's accessible name, and it must name the ROW.
     *
     * Twenty buttons all called "More" are twenty identical stops for anyone
     * moving by voice or by swipe. "More actions for <the thing>" is what makes
     * them distinguishable.
     */
    label: string
    items: readonly TalosRowAction[]
    testId?: string
}>()

const emit = defineEmits<{ (event: 'select', id: string, checked?: boolean): void }>()

const open = ref(false)
const trigger = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const active = ref(0)
/** Fixed coordinates, measured at open time. */
const at = ref({ top: 0, right: 0, flipped: false })

const menuId = computed(() => `talos-row-actions-${Math.abs(hash(props.label))}`)

/** A stable id from the label — unique per row without a global counter. */
function hash(text: string): number {
    let value = 0
    for (let index = 0; index < text.length; index += 1) {
        value = (value * 31 + text.charCodeAt(index)) | 0
    }
    return value
}

const GAP = 6
/** Enough room for the panel, or it opens upwards instead of off the screen. */
const ESTIMATED_ROW = 44

function place(): void {
    const box = trigger.value?.getBoundingClientRect()
    if (!box) return
    const needed = props.items.length * ESTIMATED_ROW + 16
    const below = window.innerHeight - box.bottom - GAP
    const flipped = below < needed && box.top > below
    at.value = {
        top: flipped ? Math.max(GAP, box.top - needed - GAP) : box.bottom + GAP,
        right: Math.max(GAP, window.innerWidth - box.right),
        flipped,
    }
}

async function show(index = 0): Promise<void> {
    place()
    open.value = true
    active.value = index
    // APG: opening moves the focus INTO the menu. Leaving it on the trigger
    // behind an open panel is how a screen reader user ends up driving a menu
    // they were never told had opened.
    await nextTick()
    focusActive()
}

function focusActive(): void {
    const entries = panel.value?.querySelectorAll<HTMLElement>('[role="menuitem"]')
    entries?.[active.value]?.focus()
}

function close(restoreFocus = true): void {
    if (!open.value) return
    open.value = false
    // Back to where it was opened from — unless the caller is about to remove
    // the row, in which case there is nothing to return to.
    if (restoreFocus) trigger.value?.focus()
}

function choose(item: TalosRowAction): void {
    // Closed BEFORE the action runs: a menu left hanging over a confirmation
    // dialog steals the focus the dialog is trying to take, and progress for a
    // row belongs on the row, never inside a menu that should have gone.
    close(!item.danger)
    // Per una voce a due stati si manda quello NUOVO: chi ascolta non deve
    // ricalcolare da se' cosa ha appena visto sullo schermo. Per una voce
    // normale NON si manda niente: aggiungere un secondo argomento sempre
    // presente cambierebbe la firma per tutti quelli che non ne hanno bisogno.
    if (item.checked === undefined) emit('select', item.id)
    else emit('select', item.id, !item.checked)
}

function step(delta: number): void {
    const total = props.items.length
    if (total === 0) return
    active.value = (active.value + delta + total) % total
    focusActive()
}

function jump(index: number): void {
    active.value = index
    focusActive()
}

/** APG typeahead: a letter moves to the next item starting with it. */
function seek(key: string): void {
    const lowered = key.toLowerCase()
    const total = props.items.length
    for (let offset = 1; offset <= total; offset += 1) {
        const index = (active.value + offset) % total
        if (props.items[index]!.label.toLowerCase().startsWith(lowered)) {
            jump(index)
            return
        }
    }
}

function onTriggerKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') { event.preventDefault(); void show(0) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); void show(props.items.length - 1) }
}

function onMenuKey(event: KeyboardEvent): void {
    switch (event.key) {
        case 'ArrowDown': event.preventDefault(); step(1); break
        case 'ArrowUp': event.preventDefault(); step(-1); break
        case 'Home': event.preventDefault(); jump(0); break
        case 'End': event.preventDefault(); jump(props.items.length - 1); break
        case 'Escape': event.preventDefault(); close(); break
        case 'Tab': close(); break
        default:
            if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
                event.preventDefault()
                seek(event.key)
            }
    }
}

/**
 * Back closes the menu first, and only then does anything else.
 *
 * `isActive` is required here, unlike the dialog: one of these is mounted per
 * ROW, so a list of ten would put ten always-open entries on the stack and the
 * first Back anywhere would "close" a menu nobody had opened.
 */
useTalosOverlayBack(() => close(), () => open.value)

defineExpose({ close })
</script>

<template>
    <button
        ref="trigger"
        type="button"
        :data-testid="props.testId ?? 'talos-row-actions'"
        :aria-label="props.label"
        aria-haspopup="menu"
        :aria-expanded="open"
        :aria-controls="open ? menuId : undefined"
                class="talos-pressable inline-flex size-12 shrink-0 items-center justify-center rounded-full text-[var(--talos-muted)] focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)]"
        @click.stop.prevent="open ? close() : show()"
        @keydown="onTriggerKey"
    >
        <MoreVertical class="size-5" aria-hidden="true" />
    </button>

    <!-- Teleported so no ancestor's `overflow: hidden` can clip it — a card is
         a clipping box by definition, and the menu belongs to the screen. -->
    <Teleport to="body">
        <div
            v-if="open"
            class="fixed inset-0 z-[110]"
            data-testid="talos-row-actions-scrim"
            @click="close()"
            @contextmenu.prevent
        >
            <!-- .stop on every pointer event: a tap that closed the menu and
                 then landed on the row underneath would open the very thing the
                 person was trying to act on. -->
            <div
                :id="menuId"
                ref="panel"
                role="menu"
                :aria-label="props.label"
                data-testid="talos-row-actions-menu"
                class="talos-holdable absolute min-w-44 max-w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border border-[var(--talos-border)] bg-[var(--talos-card)] p-1 shadow-[0_8px_30px_rgba(0,0,0,0.28)]"
                :style="{ top: `${at.top}px`, right: `${at.right}px` }"
                @click.stop
                @keydown="onMenuKey"
            >
                <template v-for="(item, index) in props.items" :key="item.id">
                    <div
                        v-if="item.danger && index > 0"
                        class="my-1 h-px bg-[var(--talos-border)]"
                        aria-hidden="true"
                    />
                    <!-- The danger pair, not the danger colour alone.
                         `talosContrast.ts` states the contract:
                         `--talos-danger` is only guaranteed legible ON
                         `--talos-danger-soft`. Used as text over a neutral
                         menu it resolved to #fee2e2 on the device — near
                         white, no signal at all. The rule above still does
                         the separating; this makes the colour say
                     something too. -->
                    <button
                        type="button"
                        :tabindex="index === active ? 0 : -1"
                        :data-testid="item.testId"
                        :aria-label="item.ariaLabel"
                        :disabled="item.disabled === true"
                        :role="item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'"
                        :aria-checked="item.checked === undefined ? undefined : item.checked"
                        class="talos-pressable flex min-h-12 w-full items-center gap-2 rounded-lg px-3 text-left text-sm focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] disabled:opacity-50"
                        :class="item.danger
                            ? 'bg-[var(--talos-danger-soft)] text-[var(--talos-danger)]'
                            : 'text-[var(--talos-text)] hover:bg-[var(--talos-active)]'"
                        @click="choose(item)"
                        @focus="active = index"
                    >
                        <component :is="item.icon" v-if="item.icon" class="size-4 shrink-0" :class="item.danger ? '' : 'text-[var(--talos-accent)]'" aria-hidden="true" />
                        <span class="min-w-0 flex-1">{{ item.label }}</span>
                        <!-- La spunta e' un segno, non un colore: resta leggibile
                             anche dove il colore non arriva. -->
                        <Check v-if="item.checked === true" class="size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                    </button>
                </template>
            </div>
        </div>
    </Teleport>
</template>
