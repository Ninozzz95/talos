<script setup>
import { reactiveOmit } from "@vueuse/core";
import { DropdownMenuItem, useForwardPropsEmits } from "reka-ui";
import { cn } from "@/lib/utils";

const props = defineProps({
  disabled: { type: Boolean, required: false },
  textValue: { type: String, required: false },
  asChild: { type: Boolean, required: false },
  as: { type: null, required: false },
  variant: { type: String, required: false, default: "default" },
  class: {
    type: [Boolean, null, String, Object, Array],
    required: false,
    skipCheck: true,
  },
});
const emits = defineEmits(["select"]);

const delegatedProps = reactiveOmit(props, "class", "variant");

const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <DropdownMenuItem
    v-bind="forwarded"
    :class="
      cn(
        'flex w-full cursor-pointer select-none items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] outline-none transition data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-[var(--talos-panel-soft)]',
        props.variant === 'destructive'
          ? 'text-[var(--talos-danger)] data-[highlighted]:bg-[var(--talos-danger-soft)]'
          : 'text-[var(--talos-text)]',
        props.class,
      )
    "
  >
    <slot />
  </DropdownMenuItem>
</template>
