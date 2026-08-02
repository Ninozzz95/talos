<script setup lang="ts">
/**
 * The one tab strip.
 *
 * Before this the app drew "choose one of these views" five different ways:
 * a filled box in Doctor, an underline in Model Lab, an outlined chip in
 * Appearance, pills carrying aria-pressed in Library and the media panel, and a
 * vertical tablist in the settings centre that on a phone hides its own list —
 * which is not a tab strip at all, it is navigation wearing one. Three of the
 * five already used Reka's TabsRoot, so the markup was never the problem: the
 * problem was that each screen decided the grammar again.
 *
 * This component takes the decision away from the screen and reads it from the
 * register (`lib/navigation/viewRegistry`). From one declaration it gets the
 * views, their order, their names, the default, and whether activation may be
 * automatic — which the APG allows only where a panel can be shown instantly,
 * and Model Lab's cannot because it probes the local engine when it mounts.
 *
 * It also remembers. Not because remembering is a feature, but because the
 * Library had to be taught it separately once already, after someone noticed it
 * "just never survived a reopen". Storage is passed in rather than reached for,
 * so the memory is testable and a caller that does not want it simply does not
 * pass it.
 *
 * The visible treatment is the underline: M3's secondary tabs, which is what
 * fits a strip that lives inside a page rather than at its root.
 */
import { computed, watch } from 'vue'
import { TabsIndicator, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import { useTalosI18n } from '@/i18n'
import {
    talosResolveView,
    talosViewExists,
    talosViewSurfaceOf,
} from '@/lib/navigation/viewRegistry'

const props = defineProps<{
    /** Which surface in the register this strip is showing. */
    surface: string
    /** The chosen view. Controlled: the parent owns it, as with the shared switch. */
    modelValue: string
    /** Names the strip for a screen reader. The surface, not the current view. */
    ariaLabel?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { t } = useTalosI18n()

const surface = computed(() => talosViewSurfaceOf(props.surface))
const views = computed(() => surface.value?.views ?? [])

/**
 * A surface can only be shown as tabs if it declared itself as tabs. Navigation
 * and filters are different controls with different semantics, and rendering
 * them through a tablist is exactly the mistake the settings centre makes today.
 */
const renders = computed(() => surface.value?.grammar === 'tabs' && views.value.length > 1)

const activation = computed(() => surface.value?.activation ?? 'manual')

/**
 * Never hand Reka a value that is not one of its triggers: it would render the
 * strip with nothing selected and no panel at all. A view can disappear in a
 * release while a device still holds its name, so the value is resolved rather
 * than trusted, and the parent is told when the resolution changed it.
 */
const selected = computed(() => talosResolveView(props.surface, props.modelValue) ?? '')

watch(selected, (value) => {
    if (value && value !== props.modelValue) emit('update:modelValue', value)
}, { immediate: true })

function choose(value: unknown): void {
    if (typeof value !== 'string') return
    if (!talosViewExists(props.surface, value)) return
    emit('update:modelValue', value)
}
</script>

<template>
    <TabsRoot
        v-if="renders"
        :data-talos-tabs="surface"
        :model-value="selected"
        :activation-mode="activation"
        @update:model-value="choose"
    >
        <TabsList
            :aria-label="ariaLabel"
            class="relative flex w-full items-stretch gap-1 overflow-x-auto border-b border-[var(--talos-border)]"
        >
            <TabsTrigger
                v-for="view in views"
                :key="view.id"
                :value="view.id"
                :data-talos-tab="view.id"
                class="relative min-h-11 shrink-0 whitespace-nowrap px-3 text-sm font-medium text-[var(--talos-muted)] outline-none transition-colors data-[state=active]:text-[var(--talos-text)] focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] focus-visible:ring-inset"
            >
                {{ t(view.labelKey) }}
            </TabsTrigger>
            <!-- The underline follows the selection instead of each trigger
                 drawing its own, so a tab cannot disagree with the indicator. -->
            <TabsIndicator
                class="absolute bottom-0 left-0 h-0.5 w-[var(--reka-tabs-indicator-size)] translate-x-[var(--reka-tabs-indicator-position)] rounded-full bg-[var(--talos-accent)] transition-[width,transform] duration-200"
            />
        </TabsList>
        <slot :view="selected" />
    </TabsRoot>
</template>
