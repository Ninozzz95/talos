<script setup lang="ts">
/**
 * F4-#24 / F5-#30 — boot-logo styled loader: a faint gold track (first-frame
 * 0.18 echo), a sweep drawing left→right, three empty nodes that fill exactly
 * as the line reaches them. Shared by the loading-answer bubble and the
 * prompt-enhancer drawer. Styles live in style.css (.talos-line-loader*).
 */
withDefaults(defineProps<{ width?: number }>(), { width: 96 })
</script>

<template>
    <svg
        class="talos-line-loader"
        viewBox="0 0 96 16"
        :width="width"
        :height="Math.round(width / 6)"
        aria-hidden="true"
    >
        <line class="talos-line-loader-track" x1="4" y1="8" x2="92" y2="8" />
        <line class="talos-line-loader-sweep" x1="4" y1="8" x2="92" y2="8" />
        <circle class="talos-line-loader-node" cx="16" cy="8" r="4" />
        <circle class="talos-line-loader-node" cx="48" cy="8" r="4" />
        <circle class="talos-line-loader-node" cx="80" cy="8" r="4" />
    </svg>
</template>
