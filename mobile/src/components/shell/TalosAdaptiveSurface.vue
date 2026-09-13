<script setup lang="ts">
import { computed } from 'vue'
import { X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import type { TalosMobilePresentation } from '@/lib/mobilePresentation'

const props = defineProps<{ presentation: TalosMobilePresentation; title: string }>()
const emit = defineEmits<{
    dismiss: []
}>()

const surfaceClass = computed(() =>
    props.presentation === 'drawer'
        ? 'fixed inset-x-0 bottom-0 max-h-[85dvh] rounded-t-[var(--radius-lg)]'
        : 'fixed inset-0',
)
</script>

<template>
    <section
        role="dialog"
        aria-modal="true"
        :aria-label="props.title"
        :data-presentation="props.presentation"
        data-testid="adaptive-surface"
        class="z-40 flex flex-col overflow-hidden border-border bg-background text-foreground"
        :class="surfaceClass"
    >
        <header class="flex items-center justify-between border-b border-border p-3">
            <h2 class="text-base font-display" data-testid="surface-title">{{ props.title }}</h2>
            <Button
                variant="ghost"
                size="icon"
                type="button"
                :aria-label="$t('common.dismiss')"
                data-testid="surface-dismiss"
                class="min-h-touch min-w-touch"
                @click="emit('dismiss')"
            >
                <X class="size-5" aria-hidden="true" />
            </Button>
        </header>
        <div class="flex-1 overflow-y-auto overscroll-contain p-3">
            <slot />
        </div>
    </section>
</template>
