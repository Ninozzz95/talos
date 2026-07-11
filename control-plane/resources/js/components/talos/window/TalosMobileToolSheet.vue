<script setup lang="ts">
import { ArrowLeft, X } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import Button from '../../ui/Button.vue'

const props = defineProps<{
    id: string
    title: string
    description?: string
}>()

const emit = defineEmits<{
    close: [id: string]
}>()

const sheet = ref<HTMLElement | null>(null)
const titleId = computed(() => `talos-mobile-sheet-${props.id}-title`)
const descriptionId = computed(() => `talos-mobile-sheet-${props.id}-description`)
let returnFocusTarget: HTMLElement | null = null

function focusableElements() {
    if (!sheet.value) return []

    return Array.from(sheet.value.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true')
}

function closeSheet() {
    emit('close', props.id)
}

function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
        event.preventDefault()
        closeSheet()
        return
    }

    if (event.key !== 'Tab') return

    const focusable = focusableElements()
    if (!focusable.length) {
        event.preventDefault()
        sheet.value?.focus()
        return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
    }
}

onMounted(() => {
    returnFocusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.addEventListener('keydown', handleKeydown, true)
    void nextTick(() => {
        focusableElements()[0]?.focus()
    })
})

onBeforeUnmount(() => {
    document.removeEventListener('keydown', handleKeydown, true)
    if (returnFocusTarget?.isConnected) returnFocusTarget.focus()
})
</script>

<template>
    <section
        ref="sheet"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="description ? descriptionId : undefined"
        tabindex="-1"
        data-testid="talos-mobile-tool-sheet"
        :data-window-id="id"
        class="pointer-events-auto absolute inset-x-2 top-[7.5rem] z-50 flex min-h-0 flex-col overflow-hidden rounded-md border border-[var(--talos-border)] bg-[var(--talos-window-bg)] shadow-[0_20px_70px_rgba(0,0,0,0.38)] lg:left-[calc(var(--talos-rail-width)+0.5rem)] lg:top-16 xl:hidden"
        style="bottom: calc(var(--talos-composer-height, 168px) + max(0.75rem, env(safe-area-inset-bottom)) + 0.5rem)"
    >
        <header class="flex shrink-0 items-center gap-2 border-b border-[var(--talos-border)] bg-[var(--talos-header)] px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <Button type="button" variant="ghost" size="icon" aria-label="Back to chat" @click="closeSheet">
                <ArrowLeft class="h-4 w-4" aria-hidden="true" />
            </Button>
            <div class="min-w-0 flex-1">
                <h2 :id="titleId" class="truncate text-sm font-semibold text-[var(--talos-text)]">{{ title }}</h2>
                <p v-if="description" :id="descriptionId" class="truncate text-[11px] text-[var(--talos-muted)]">{{ description }}</p>
            </div>
            <Button type="button" variant="ghost" size="icon" :aria-label="`Close ${title}`" @click="closeSheet">
                <X class="h-4 w-4" aria-hidden="true" />
            </Button>
        </header>
        <div
            data-testid="talos-mobile-sheet-body"
            class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
            <slot />
        </div>
    </section>
</template>
