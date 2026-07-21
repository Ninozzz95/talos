<script setup>
import { reactiveOmit } from "@vueuse/core";
import { ComboboxTrigger, useForwardProps } from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps({
  disabled: { type: Boolean, required: false },
  asChild: { type: Boolean, required: false },
  as: { type: null, required: false },
  class: {
    type: [Boolean, null, String, Object, Array],
    required: false,
    skipCheck: true,
  },
});

const delegatedProps = reactiveOmit(props, "class");

const forwarded = useForwardProps(delegatedProps);
</script>

<template>
  <ComboboxTrigger v-bind="forwarded" :class="cn('', props.class)" tabindex="0">
    <slot />
  </ComboboxTrigger>
</template>
