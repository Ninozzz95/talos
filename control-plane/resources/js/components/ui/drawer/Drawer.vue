<script setup>
import { useForwardPropsEmits } from "reka-ui";
import { DrawerRoot } from "reka-ui";

const props = defineProps({
  defaultOpen: { type: Boolean, required: false },
  defaultSnapPoint: { type: [Number, String, null], required: false },
  modal: { type: [Boolean, String], required: false },
  open: { type: Boolean, required: false },
  snapPoint: { type: [Number, String, null], required: false },
  snapPoints: { type: Array, required: false },
  snapToSequentialPoints: { type: Boolean, required: false },
  swipeDirection: { type: String, required: false },
});

const emits = defineEmits([
  "update:open",
  "update:openComplete",
  "update:snapPoint",
]);

const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <DrawerRoot v-bind="forwarded">
    <slot />
  </DrawerRoot>
</template>
