<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { Check, Download, EllipsisVertical, Eye, EyeOff, Images, MessageSquarePlus, Pencil, Trash2, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMobileConfirmDialog from '@/components/shell/TalosMobileConfirmDialog.vue'
import TalosMobileDeleteChatDialog from '@/components/shell/TalosMobileDeleteChatDialog.vue'
import type { TalosSessionCleanupPlan } from '@/lib/chat/sessionCleanup'

/**
 * The 3-dot chat-options menu (New / Rename / Export / Delete on the ACTIVE
 * chat) + its device-proven confirm dialogs. Extracted so the immersive chrome
 * AND the classic header (owner 2026-07-24: "i 3 puntini anche nell'header
 * versione non immersive") share ONE implementation.
 */
const props = withDefaults(defineProps<{
    activeTitle: string
    busy: boolean
    /** Pill styling on the immersive chrome; plain ghost in the solid header. */
    pill?: boolean
    /** The chat being shown is incognito, so the switch reads the other way. */
    incognito?: boolean
    /**
     * This chat has nothing in it yet, so incognito may be offered.
     *
     * Owner 2026-07-31: «la possibilità di aprire una nuova chat in incognito
     * quando sei in una normale, dai puntini in alto a destra, deve sparire. La
     * lasciamo esclusivamente quando si inizia una nuova chat». The entry always
     * opened a NEW chat, so it was never destructive — but it read as an offer
     * to make THIS conversation anonymous, and sat one tap away in every chat.
     *
     * Required, with no default, so the compiler makes every shell answer the
     * question. A default would let a shell forget and silently keep offering
     * it, which is the exact defect being removed.
     */
    canGoIncognito: boolean
    /**
     * False before a chat exists — sessions are created lazily, so this is the
     * state of a fresh install and of "deleted the last chat". The entry used to
     * render anyway and do nothing at all when tapped.
     */
    canOpenMedia?: boolean
    /** What this chat would take from the Library (owner 2026-07-26). */
    cleanupPlan?: TalosSessionCleanupPlan
}>(), {
    incognito: false,
    pill: false,
    canOpenMedia: true,
    // Empty means "nothing to offer": the checkbox stays hidden, which is the
    // right behaviour for a surface that has not wired the plan yet.
    cleanupPlan: () => ({ documents: [], sources: [] }),
})

const emit = defineEmits<{
    newChat: []
    temporaryChat: []
    normalMode: []
    rename: [title: string]
    delete: [{ deleteMedia: boolean }]
    export: []
    /** Owner 2026-07-26: this chat's media gallery. */
    media: []
}>()

const optionsOpen = ref(false)
const renameOpen = ref(false)
const deleteOpen = ref(false)
/**
 * WHICH exit is waiting on the question — because more than one destroys the
 * conversation. Found by an adversarial review 2026-07-31: the guard covered
 * «Modalità normale» while «Nuova chat», one row above in the same menu, threw
 * the incognito conversation away just as permanently and said nothing.
 */
const pendingExit = ref<'normalMode' | 'newChat' | null>(null)

/**
 * Leaving incognito destroys the conversation, and that is the promise it was
 * opened on — «non scritta, non ricordata, sparisce quando esci».
 *
 * Owner 2026-07-31 saw it happen and reported it as a defect. It is not, but
 * being right is not the same as being kind: it is irreversible, it is one tap
 * away, and nothing warned him. So it asks first — but only when there is
 * something to lose. `canGoIncognito` is false exactly when the chat has
 * something in it, so an empty incognito chat still leaves in one tap.
 */
function leavesSomethingBehind(): boolean {
    // `canGoIncognito` is false exactly when the chat has something in it.
    return props.incognito && !props.canGoIncognito
}

function pressSwitch(): void {
    optionsOpen.value = false
    if (leavesSomethingBehind()) {
        pendingExit.value = 'normalMode'
        return
    }
    if (props.incognito) emit('normalMode')
    else emit('temporaryChat')
}

/** The other exit, and it costs the same. */
function pressNewChat(): void {
    optionsOpen.value = false
    if (leavesSomethingBehind()) {
        pendingExit.value = 'newChat'
        return
    }
    emit('newChat')
}

function confirmExit(): void {
    const exit = pendingExit.value
    pendingExit.value = null
    if (exit === 'newChat') emit('newChat')
    else if (exit === 'normalMode') emit('normalMode')
}
const renameValue = ref('')
const renameInput = ref<HTMLInputElement | null>(null)
const optionsMenu = ref<HTMLElement | null>(null)

async function toggleOptions(): Promise<void> {
    optionsOpen.value = !optionsOpen.value
    if (optionsOpen.value) {
        await nextTick()
        // The first entry is the one that gets disabled while a session action
        // runs, and `.focus()` on a disabled button is a silent no-op — so the
        // menu opened with focus nowhere. Focus what can actually take it.
        optionsMenu.value
            ?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')
            ?.focus()
    }
}

async function openRename(): Promise<void> {
    optionsOpen.value = false
    renameValue.value = props.activeTitle
    renameOpen.value = true
    await nextTick()
    renameInput.value?.select()
}

function submitRename(): void {
    const title = renameValue.value.trim()
    if (!title || props.busy) return
    emit('rename', title)
    renameOpen.value = false
}

function confirmDelete(choice: { deleteMedia: boolean }): void {
    // The dialog stays up and spins; it emits `close` once `busy` falls back,
    // so the user sees the deletion happen instead of a list that has not
    // changed yet.
    emit('delete', choice)
}
</script>

<template>
    <div class="relative pointer-events-auto" @keydown.escape="optionsOpen = false">
        <Button
            type="button"
            size="icon-lg"
            variant="ghost"
            :aria-label="$t('chat.chatOptions')"
            aria-haspopup="menu"
            :aria-expanded="optionsOpen"
            class="talos-pressable min-h-touch min-w-touch"
            :class="pill ? 'rounded-full border border-[var(--talos-border)]/60 bg-[var(--talos-card)]/85 backdrop-blur' : ''"
            @click="toggleOptions"
        >
            <EllipsisVertical aria-hidden="true" />
        </Button>
        <div
            v-if="optionsOpen"
            class="fixed inset-0 z-20"
            aria-hidden="true"
            @click="optionsOpen = false"
        />
        <Transition
            enter-active-class="transition duration-150 ease-out"
            enter-from-class="opacity-0 scale-95"
            enter-to-class="opacity-100 scale-100"
            leave-active-class="transition duration-100 ease-in"
            leave-from-class="opacity-100 scale-100"
            leave-to-class="opacity-0 scale-95"
        >
            <div
                v-if="optionsOpen"
                ref="optionsMenu"
                data-testid="talos-chat-options-menu"
                role="menu"
                :aria-label="$t('chat.chatOptions')"
                class="absolute right-0 top-full z-30 mt-2 w-48 origin-top-right rounded-xl border border-[var(--talos-border)] bg-[var(--talos-card)] p-1 shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
            >
                <!--
                    Owner 2026-07-31: a press that lands while another session
                    action is still running is DROPPED, silently, by the shell
                    guard — no toast, no spinner, nothing. That reads exactly
                    like "premo e non succede niente". It says so now instead.
                -->
                <button type="button" role="menuitem" data-testid="talos-chat-options-new" :disabled="props.busy" class="talos-pressable flex min-h-touch w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-[var(--talos-text)] hover:bg-[var(--talos-active)] disabled:opacity-50" @click="pressNewChat">
                    <MessageSquarePlus class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> {{ $t('chat.newChat') }}
                </button>
                <!--
                    F-14. Beside New chat, because it is the same act with one
                    thing taken away — not a mode hidden in settings that you
                    have to remember to turn off again.
                -->
                <!--
                    Owner 2026-07-31: one switch that reflects the state, not
                    two buttons that ignore each other. In an ordinary chat it
                    opens incognito; inside incognito it reads "Modalità
                    normale" and takes you out. Pressing it always changes what
                    it says, which is the whole of what a switch owes you.
                -->
                <button v-if="incognito || props.canGoIncognito" type="button" role="menuitem" data-testid="talos-chat-options-temporary" :disabled="props.busy" class="talos-pressable flex min-h-touch w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-[var(--talos-text)] hover:bg-[var(--talos-active)] disabled:opacity-50" @click="pressSwitch">
                    <component :is="incognito ? Eye : EyeOff" class="size-4 text-[var(--talos-accent)]" aria-hidden="true" />
                    {{ incognito ? $t('chat.normalMode') : $t('chat.temporaryChat') }}
                </button>
                <button type="button" role="menuitem" class="talos-pressable flex min-h-touch w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-[var(--talos-text)] hover:bg-[var(--talos-active)]" @click="openRename">
                    <Pencil class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> {{ $t('chat.renameChat') }}
                </button>
                <!-- Owner 2026-07-26: reachable from the menu in BOTH header
                     modes. Tapping the title only works in the solid header —
                     the immersive chrome renders no title at all, and it is the
                     default, so the menu is the entry that always exists. -->
                <button v-if="props.canOpenMedia" type="button" role="menuitem" data-testid="talos-chat-options-media" class="talos-pressable flex min-h-touch w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-[var(--talos-text)] hover:bg-[var(--talos-active)]" @click="optionsOpen = false; emit('media')">
                    <Images class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> {{ $t('library.thisChat') }}
                </button>
                <button type="button" role="menuitem" class="talos-pressable flex min-h-touch w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-[var(--talos-text)] hover:bg-[var(--talos-active)]" @click="optionsOpen = false; emit('export')">
                    <Download class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> {{ $t('chat.exportChat') }}
                </button>
                <button type="button" role="menuitem" class="talos-pressable flex min-h-touch w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-[var(--talos-danger,#dc5b5b)] hover:bg-[var(--talos-active)]" @click="optionsOpen = false; deleteOpen = true">
                    <Trash2 class="size-4" aria-hidden="true" /> {{ $t('chat.deleteChat') }}
                </button>
            </div>
        </Transition>

        <TalosMobileConfirmDialog
            v-if="renameOpen"
            :title="$t('chat.renameChat')"
            :description="$t('chat.renameDescription')"
            @close="renameOpen = false"
        >
            <input
                ref="renameInput"
                v-model="renameValue"
                :aria-label="$t('chat.chatName')"
                class="min-h-touch w-full rounded-md border border-[var(--talos-border)] bg-[var(--talos-input,var(--talos-background))] px-3 text-sm text-[var(--talos-text)] outline-none focus:border-[var(--talos-accent)]"
                @keydown.enter.prevent="submitRename"
            >
            <template #footer>
                <Button type="button" variant="ghost" @click="renameOpen = false"><X class="size-4" aria-hidden="true" /> {{ $t('common.cancel') }}</Button>
                <Button type="button" :disabled="!renameValue.trim() || props.busy" @click="submitRename">
                    <Check class="size-4" aria-hidden="true" /> {{ $t('common.save') }}
                </Button>
            </template>
        </TalosMobileConfirmDialog>

        <TalosMobileConfirmDialog
            v-if="pendingExit"
            :title="$t('chat.leaveIncognitoTitle')"
            :description="$t('chat.leaveIncognitoBody')"
            @close="pendingExit = null"
        >
            <template #footer>
                <!-- 44px, on the one gate protecting an unrecoverable
                     conversation: the shared Button defaults to 32. -->
                <Button type="button" variant="ghost" class="min-h-12" @click="pendingExit = null">
                    <X class="size-4" aria-hidden="true" /> {{ $t('common.cancel') }}
                </Button>
                <Button
                    type="button"
                    data-testid="talos-leave-incognito-confirm"
                    class="min-h-12"
                    :disabled="props.busy"
                    @click="confirmExit"
                >
                    <Eye class="size-4" aria-hidden="true" /> {{ $t('chat.leaveIncognitoConfirm') }}
                </Button>
            </template>
        </TalosMobileConfirmDialog>

        <TalosMobileDeleteChatDialog
            v-if="deleteOpen"
            :title="props.activeTitle"
            :plan="props.cleanupPlan"
            :busy="props.busy"
            @close="deleteOpen = false"
            @confirm="confirmDelete"
        />
    </div>
</template>
