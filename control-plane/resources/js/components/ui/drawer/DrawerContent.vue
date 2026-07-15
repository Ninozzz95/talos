<script setup>
import { reactiveOmit } from "@vueuse/core";
import { DrawerContent, DrawerHandle, DrawerPortal, useForwardPropsEmits } from "reka-ui";
import { cn } from "@/lib/utils";
import DrawerOverlay from "./DrawerOverlay.vue";

defineOptions({ inheritAttrs: false });

const props = defineProps({
  forceMount: { type: Boolean, required: false },
  disableOutsidePointerEvents: { type: Boolean, required: false },
  asChild: { type: Boolean, required: false },
  as: { type: null, required: false },
  to: { type: null, required: false, default: "#talos-portal-root" },
  class: {
    type: [Boolean, null, String, Object, Array],
    required: false,
    skipCheck: true,
  },
});
const emits = defineEmits([
  "escapeKeyDown",
  "pointerDownOutside",
  "focusOutside",
  "interactOutside",
  "openAutoFocus",
  "closeAutoFocus",
]);

const delegatedProps = reactiveOmit(props, "class", "to");
const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <DrawerPortal :to="to">
    <DrawerOverlay />
    <DrawerContent
      v-bind="{ ...forwarded, ...$attrs }"
      :class="
        cn(
          'talos-shadcn-drawer-content fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-[10px] border bg-background',
          props.class,
        )
      "
    >
      <DrawerHandle class="mx-auto mt-4 h-2 w-[100px] rounded-full bg-muted" />
      <slot />
    </DrawerContent>
  </DrawerPortal>
</template>

<style scoped>
.talos-shadcn-drawer-content {
  transform: translateY(var(--drawer-swipe-movement-y, 0px));
  transition: transform var(--talos-motion-duration-window-open, 250ms) var(--talos-motion-ease, ease);
}

.talos-shadcn-drawer-content[data-state='open'] {
  animation: talos-shadcn-drawer-in var(--talos-motion-duration-window-open, 250ms) var(--talos-motion-ease, ease) both;
}

.talos-shadcn-drawer-content[data-state='closed'] {
  animation: talos-shadcn-drawer-out var(--talos-motion-duration-window-close, 250ms) var(--talos-motion-ease-exit, ease) both;
}

.talos-shadcn-drawer-content[data-swiping] {
  transition-duration: 0ms;
}

@keyframes talos-shadcn-drawer-in {
  from { translate: 0 100%; }
}

@keyframes talos-shadcn-drawer-out {
  to { translate: 0 100%; }
}
</style>
