<script setup lang="ts">
import type { Component } from 'vue'
import { Check, EllipsisVertical } from '@lucide/vue'
import {
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuItemIndicator,
    DropdownMenuPortal,
    DropdownMenuRoot,
    DropdownMenuTrigger,
} from 'reka-ui'

interface TalosMobileLibraryActionItem {
    id: string
    label: string
    ariaLabel?: string
    icon?: Component
    disabled?: boolean
    tone?: 'default' | 'danger'
    kind?: 'action' | 'checkbox'
    checked?: boolean
    testId?: string
}

const props = defineProps<{
    label: string
    testId?: string
    items: readonly TalosMobileLibraryActionItem[]
}>()

const emit = defineEmits<{
    select: [id: string, checked?: boolean]
}>()
</script>

<template>
    <!-- Reka owns the WAI-ARIA menu contract, focus restoration, keyboard
         navigation and viewport collision. TALOS owns its action schema and
         mobile visual/touch contract. -->
    <DropdownMenuRoot :modal="false">
        <DropdownMenuTrigger as-child>
            <button
                type="button"
                data-talos-library-actions-trigger
                :data-testid="testId"
                :aria-label="label"
                class="talos-pressable flex size-12 shrink-0 items-center justify-center rounded-full text-[var(--talos-muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-accent)]"
                @click.stop
            >
                <EllipsisVertical class="size-5" aria-hidden="true" />
            </button>
        </DropdownMenuTrigger>

        <DropdownMenuPortal>
            <DropdownMenuContent
                align="end"
                :side-offset="4"
                :collision-padding="8"
                position-strategy="fixed"
                :aria-label="label"
                :data-testid="testId ? `${testId}-content` : undefined"
                class="z-[120] max-h-[min(22rem,var(--reka-dropdown-menu-content-available-height))] w-max min-w-52 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-[var(--talos-border)] bg-[var(--talos-window-bg,var(--talos-card,var(--talos-panel)))] p-1 text-[var(--talos-text)] shadow-xl outline-none"
                @click.stop
            >
                <template v-for="item in items" :key="item.id">
                    <DropdownMenuCheckboxItem
                        v-if="item.kind === 'checkbox'"
                        :model-value="item.checked === true"
                        :disabled="item.disabled"
                        :aria-label="item.ariaLabel ?? item.label"
                        :data-testid="item.testId"
                        class="talos-pressable relative flex min-h-12 cursor-default select-none items-center gap-3 rounded-lg px-3 pr-10 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-[var(--talos-panel-soft)]"
                        :class="item.tone === 'danger' ? 'text-[var(--talos-danger)]' : ''"
                        @update:model-value="emit('select', item.id, $event)"
                    >
                        <component
                            :is="item.icon"
                            v-if="item.icon"
                            class="size-4 shrink-0 text-[var(--talos-accent)]"
                            aria-hidden="true"
                        />
                        <span class="min-w-0 flex-1">{{ item.label }}</span>
                        <DropdownMenuItemIndicator class="absolute right-3 flex size-5 items-center justify-center text-[var(--talos-accent)]">
                            <Check class="size-4" aria-hidden="true" />
                        </DropdownMenuItemIndicator>
                    </DropdownMenuCheckboxItem>

                    <DropdownMenuItem
                        v-else
                        :disabled="item.disabled"
                        :aria-label="item.ariaLabel ?? item.label"
                        :data-testid="item.testId"
                        class="talos-pressable flex min-h-12 cursor-default select-none items-center gap-3 rounded-lg px-3 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-[var(--talos-panel-soft)]"
                        :class="item.tone === 'danger' ? 'text-[var(--talos-danger)]' : ''"
                        @select="emit('select', item.id, undefined)"
                    >
                        <component
                            :is="item.icon"
                            v-if="item.icon"
                            class="size-4 shrink-0"
                            :class="item.tone === 'danger' ? '' : 'text-[var(--talos-accent)]'"
                            aria-hidden="true"
                        />
                        <span class="min-w-0 flex-1">{{ item.label }}</span>
                    </DropdownMenuItem>
                </template>
            </DropdownMenuContent>
        </DropdownMenuPortal>
    </DropdownMenuRoot>
</template>
