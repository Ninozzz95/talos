<script setup lang="ts">
import { BarChart3, EllipsisVertical, Loader2, Pencil, ShieldCheck } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '../../ui/dropdown-menu'
import type { TalosMessage } from '../../../lib/talosTypes'

defineProps<{
    message: TalosMessage
    hasEvidence: boolean
    evidenceOpen: boolean
    hasBenchmark: boolean
    benchmarking: boolean
}>()

const emit = defineEmits<{
    edit: [message: TalosMessage]
    toggleEvidence: [message: TalosMessage]
    benchmark: [message: TalosMessage]
}>()
</script>

<template>
    <DropdownMenu :modal="false">
        <DropdownMenuTrigger as-child>
            <Button
                data-primary-action
                class="lg:hidden"
                type="button"
                variant="ghost"
                size="icon"
                aria-label="More message actions"
            >
                <EllipsisVertical class="h-4 w-4" aria-hidden="true" />
            </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" aria-label="More message actions" class="min-w-52">
            <DropdownMenuItem
                v-if="message.role === 'user'"
                aria-label="Reuse prompt"
                class="min-h-11"
                @select="emit('edit', message)"
            >
                <Pencil class="h-4 w-4" aria-hidden="true" />
                Reuse prompt
            </DropdownMenuItem>
            <DropdownMenuItem
                v-if="message.role === 'assistant' && hasEvidence"
                :aria-label="evidenceOpen ? 'Close evidence' : 'Open evidence'"
                class="min-h-11"
                @select="emit('toggleEvidence', message)"
            >
                <ShieldCheck class="h-4 w-4" aria-hidden="true" />
                {{ evidenceOpen ? 'Close evidence' : 'Open evidence' }}
            </DropdownMenuItem>
            <DropdownMenuItem
                v-if="message.role === 'assistant' && hasBenchmark"
                aria-label="Compare AVM ON/OFF"
                class="min-h-11"
                :disabled="benchmarking"
                @select="emit('benchmark', message)"
            >
                <Loader2 v-if="benchmarking" class="h-4 w-4 animate-spin" aria-hidden="true" />
                <BarChart3 v-else class="h-4 w-4" aria-hidden="true" />
                Compare AVM ON/OFF
            </DropdownMenuItem>
        </DropdownMenuContent>
    </DropdownMenu>
</template>
