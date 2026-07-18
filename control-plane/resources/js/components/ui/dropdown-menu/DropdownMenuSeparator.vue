<script setup>
import { DropdownMenuSeparator } from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps({
  asChild: { type: Boolean, required: false },
  as: { type: null, required: false },
  class: {
    type: [Boolean, null, String, Object, Array],
    required: false,
    skipCheck: true,
  },
});
</script>

<template>
  <DropdownMenuSeparator
    :as-child="props.asChild"
    :as="props.as"
    :class="cn('-mx-1 my-1 h-px bg-[var(--talos-border)]', props.class)"
  />
</template>
