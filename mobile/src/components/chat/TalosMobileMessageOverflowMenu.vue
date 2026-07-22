<script setup lang="ts">
import { EllipsisVertical, Pencil } from '@lucide/vue'
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui'
import { Button } from '@/components/ui/button'
import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'

defineProps<{ message: TalosMobileMessageView }>()
const emit = defineEmits<{ reuse: [message: TalosMobileMessageView] }>()
</script>

<template>
    <DropdownMenuRoot :modal="false">
        <DropdownMenuTrigger as-child>
            <Button type="button" variant="ghost" size="icon" class="min-h-11 min-w-11" aria-label="More message actions" title="More message actions">
                <EllipsisVertical class="size-4" aria-hidden="true" />
            </Button>
        </DropdownMenuTrigger>
        <DropdownMenuPortal>
            <DropdownMenuContent align="end" :side-offset="6" aria-label="More message actions" class="z-[120] min-w-48 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-1 text-[var(--talos-text)] shadow-lg outline-none">
                <DropdownMenuItem aria-label="Reuse prompt" class="flex min-h-11 cursor-default select-none items-center gap-2 rounded px-3 text-sm outline-none data-[highlighted]:bg-[var(--talos-panel-soft)]" @select="emit('reuse', message)">
                    <Pencil class="size-4" aria-hidden="true" />
                    Reuse prompt
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenuPortal>
    </DropdownMenuRoot>
</template>
