<script setup>
import { reactiveOmit } from "@vueuse/core";
import { DrawerOverlay } from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps({
  forceMount: { type: Boolean, required: false },
  asChild: { type: Boolean, required: false },
  as: { type: null, required: false },
  class: {
    type: [Boolean, null, String, Object, Array],
    required: false,
    skipCheck: true,
  },
});

const delegatedProps = reactiveOmit(props, "class");
</script>

<template>
  <DrawerOverlay
    v-bind="delegatedProps"
    :class="cn('talos-shadcn-drawer-overlay fixed inset-0 z-50 bg-black/80', props.class)"
  />
</template>

<style scoped>
.talos-shadcn-drawer-overlay {
  transition: opacity var(--talos-motion-duration-window-open, 250ms) var(--talos-motion-ease, ease);
}

.talos-shadcn-drawer-overlay[data-state='closed'] {
  opacity: 0;
  transition-duration: var(--talos-motion-duration-window-close, 250ms);
}
</style>
