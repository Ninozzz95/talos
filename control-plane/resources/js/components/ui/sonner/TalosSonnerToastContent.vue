<script setup lang="ts">
import { computed } from 'vue'
import type { TalosToastTone } from '../../../composables/useTalosToast'

const props = defineProps<{ message: string; tone: TalosToastTone }>()

const role = computed(() => (props.tone === 'error' ? 'alert' : 'status'))
const motionIntent = computed(() =>
    props.tone === 'error'
        ? 'error-attention'
        : props.tone === 'success'
            ? 'success-confirm'
            : 'surface-enter',
)
</script>

<template>
    <div
        :role="role"
        aria-atomic="true"
        :data-motion-intent="motionIntent"
        class="talos-motion-feedback min-w-0 flex-1 text-xs leading-5 text-[var(--talos-text)]"
    >
        {{ message }}
    </div>
</template>
