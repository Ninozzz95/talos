<script setup lang="ts">
import type { ToasterProps } from 'vue-sonner'
import { reactiveOmit } from '@vueuse/core'
import { CircleCheck, Info, LoaderCircle, OctagonX, TriangleAlert, X } from '@lucide/vue'
import { Toaster as Sonner } from 'vue-sonner'

const props = defineProps<ToasterProps>()
const delegatedProps = reactiveOmit(props, 'toastOptions')
</script>

<template>
    <Sonner
        class="toaster group talos-sonner pointer-events-auto"
        :close-button="true"
        :toast-options="{
            classes: {
                toast: 'talos-motion-feedback pointer-events-auto flex min-h-11 items-start gap-3 rounded-md border px-3 py-2 text-xs leading-5 shadow-lg bg-[var(--talos-card)] text-[var(--talos-text)] border-[var(--talos-border)]',
                title: 'min-w-0 flex-1',
                description: 'text-[var(--talos-muted)]',
                actionButton: 'rounded-md bg-[var(--talos-accent)] px-2 py-1 text-[var(--talos-accent-text)]',
                cancelButton: 'rounded-md bg-[var(--talos-panel-soft)] px-2 py-1 text-[var(--talos-muted)]',
                closeButton: 'text-[var(--talos-muted)] hover:text-[var(--talos-text)]',
                error: 'bg-[var(--talos-danger-soft)] border-[var(--talos-danger-border)]',
                success: 'bg-[var(--talos-success-soft)] border-[var(--talos-success-border)]',
                warning: 'bg-[var(--talos-warning-soft)] border-[var(--talos-warning-border)]',
                info: 'bg-[var(--talos-card)] border-[var(--talos-border)]',
            },
        }"
        v-bind="delegatedProps"
    >
        <template #success-icon><CircleCheck class="size-4" /></template>
        <template #info-icon><Info class="size-4" /></template>
        <template #warning-icon><TriangleAlert class="size-4" /></template>
        <template #error-icon><OctagonX class="size-4" /></template>
        <template #loading-icon><LoaderCircle class="size-4 animate-spin" /></template>
        <template #close-icon><X class="size-4" /></template>
    </Sonner>
</template>
