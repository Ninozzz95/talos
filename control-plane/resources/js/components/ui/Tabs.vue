<script setup lang="ts">
import { computed, nextTick } from 'vue'

export type TalosTabItem = {
    id: string
    label: string
    description?: string
    disabled?: boolean
    group?: string
    icon?: unknown
}

const props = withDefaults(defineProps<{
    modelValue: string
    items: readonly TalosTabItem[]
    label: string
    tabIdPrefix: string
    panelIdPrefix: string
    variant?: 'segmented' | 'window' | 'settings'
    orientation?: 'horizontal' | 'vertical'
}>(), {
    variant: 'segmented',
    orientation: 'horizontal',
})

const emit = defineEmits<{
    'update:modelValue': [tabId: string]
}>()

const rootClass = computed(() => {
    if (props.variant === 'window') {
        return 'talos-tabs talos-tabs-window mb-3 flex w-full items-center gap-1 overflow-x-auto rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-1'
    }

    if (props.variant === 'settings') {
        return 'talos-tabs talos-tabs-settings flex w-full flex-col gap-1'
    }

    return 'talos-tabs talos-tabs-segmented flex w-full items-center gap-1 overflow-x-auto rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-1'
})

const tabClass = computed(() => props.variant === 'settings'
    ? 'talos-tab flex min-h-11 w-full cursor-pointer items-center justify-start rounded-md border px-2 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] lg:min-h-9'
    : 'talos-tab inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center rounded-md border px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] lg:min-h-8')

const itemClass = computed(() => props.variant === 'settings'
    ? 'flex w-full min-w-0 items-center gap-1'
    : 'inline-flex shrink-0 items-center gap-0.5')

const ownedTabIds = computed(() => props.items.map((item) => tabId(item.id)).join(' '))

function tabId(id: string) {
    return `${props.tabIdPrefix}-${id}`
}

function panelId(id: string) {
    return `${props.panelIdPrefix}-${id}`
}

function selectTab(id: string) {
    const tab = props.items.find((item) => item.id === id)

    if (!tab || tab.disabled) {
        return
    }

    emit('update:modelValue', id)
}

async function focusTab(id: string) {
    selectTab(id)
    await nextTick()

    const target = document.getElementById(tabId(id))
    target?.focus()

    if (typeof target?.scrollIntoView === 'function') {
        target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
}

function enabledItems() {
    return props.items.filter((item) => !item.disabled)
}

function startsGroup(item: TalosTabItem, index: number) {
    return Boolean(item.group) && (index === 0 || props.items[index - 1]?.group !== item.group)
}

function onKeydown(event: KeyboardEvent, currentId: string) {
    const items = enabledItems()
    const currentIndex = items.findIndex((item) => item.id === currentId)

    if (currentIndex < 0 || items.length === 0) {
        return
    }

    let targetIndex: number | null = null

    if ((props.orientation === 'horizontal' && event.key === 'ArrowRight')
        || (props.orientation === 'vertical' && event.key === 'ArrowDown')) {
        targetIndex = (currentIndex + 1) % items.length
    } else if ((props.orientation === 'horizontal' && event.key === 'ArrowLeft')
        || (props.orientation === 'vertical' && event.key === 'ArrowUp')) {
        targetIndex = (currentIndex - 1 + items.length) % items.length
    } else if (event.key === 'Home') {
        targetIndex = 0
    } else if (event.key === 'End') {
        targetIndex = items.length - 1
    } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        selectTab(currentId)
        return
    }

    if (targetIndex === null) {
        return
    }

    event.preventDefault()
    void focusTab(items[targetIndex].id)
}
</script>

<template>
    <div :class="rootClass">
        <div
            class="sr-only"
            role="tablist"
            :aria-label="label"
            :aria-orientation="orientation"
            :aria-owns="ownedTabIds"
        ></div>
        <template v-for="(item, index) in items" :key="item.id">
            <div
                v-if="startsGroup(item, index)"
                data-talos-tab-group
                role="presentation"
                class="px-2 pt-3 text-[10px] font-semibold uppercase text-[var(--talos-muted)]"
            >
                {{ item.group }}
            </div>
            <div :class="itemClass" role="presentation">
                <button
                    :id="tabId(item.id)"
                    type="button"
                    role="tab"
                    :class="[
                        tabClass,
                        modelValue === item.id
                            ? 'border-[var(--talos-accent-border)] bg-[var(--talos-panel)] text-[var(--talos-text)] shadow-sm'
                            : 'border-transparent text-[var(--talos-muted)] hover:border-[var(--talos-accent-border)] hover:bg-[var(--talos-active)] hover:text-[var(--talos-text)]',
                    ]"
                    :aria-selected="modelValue === item.id"
                    :aria-controls="panelId(item.id)"
                    :aria-disabled="item.disabled || undefined"
                    :disabled="item.disabled"
                    :tabindex="modelValue === item.id ? 0 : -1"
                    :title="item.description ?? item.label"
                    @click="selectTab(item.id)"
                    @keydown="onKeydown($event, item.id)"
                >
                    <slot name="tab" :item="item" :active="modelValue === item.id">
                        {{ item.label }}
                    </slot>
                </button>
                <slot name="item-action" :item="item" :active="modelValue === item.id" />
            </div>
        </template>
    </div>
</template>
