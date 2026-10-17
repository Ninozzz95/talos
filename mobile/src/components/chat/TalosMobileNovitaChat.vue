<script setup lang="ts">
/**
 * ⭐ A3-84 seconda parte (owner 25/09/2026, «finché non la apri») — «nuova risposta» su una chat che ha risposto
 * mentre eri altrove. Accanto allo stato, mai al suo posto: una chat può essere in pausa E avere una risposta nuova.
 *
 * Un pallino d'accento e una parola: il colore da solo non basta (WCAG 1.4.1, «Use of Color»). Le due forme sono
 * quelle di `TalosMobileStatoChat.vue`: `riga` nell'elenco Chat, `pastiglia` nella barra laterale.
 */
import { useTalosI18n } from '@/i18n'

const props = withDefaults(defineProps<{ forma?: 'riga' | 'pastiglia' | 'punto' }>(), { forma: 'riga' })
const { t } = useTalosI18n()
</script>

<template>
    <span
        data-testid="talos-chat-new"
        :data-forma="props.forma"
        class="inline-flex min-w-0 shrink-0 items-center gap-1 whitespace-nowrap leading-none font-medium text-[var(--talos-accent)]"
        :class="props.forma === 'pastiglia'
            ? 'min-h-5 rounded-[var(--talos-radius-control)] border border-[var(--talos-accent-border)] bg-[var(--talos-accent-soft)] px-1.5 text-3xs'
            : 'text-2xs'"
    >
        <!-- ⛔ SIDEBAR-NOVITA-02 (Pad, 12/10/2026): nella barra stretta la pastiglia stringeva il titolo fino a «C.». La
             forma «punto» mostra solo il pallino; la parola resta per i lettori di schermo e per `aria-describedby`. -->
        <span :class="props.forma === 'punto' ? 'size-2' : 'size-1.5'" class="shrink-0 rounded-full bg-[var(--talos-accent)]" aria-hidden="true" />
        <span :class="props.forma === 'punto' ? 'sr-only' : undefined">{{ t('chats.newReply') }}</span>
    </span>
</template>
