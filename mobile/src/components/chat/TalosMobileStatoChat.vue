<script lang="ts">
// La logica sta in `src/lib/chat/statoDellaChat.ts`; qui resta riesportata per chi la importava dal componente.
export { talosStatoDellaChat, talosStatoChatParla, TALOS_STATO_CHAT_CHIAVE, type TalosFontiStatoChat } from '@/lib/chat/statoDellaChat'
</script>

<script setup lang="ts">
/**
 * ⭐ B3 / F4-B (parità desktop A1-01) — lo stato di una chat, detto in una parola.
 *
 * Riferimento desktop (sola lettura): `components/session-item.js:35-63` — parole
 * brevi in minuscolo, un tono per ciò che chiede qualcosa alla persona. La FORMA
 * viene dalla lista gemella del telefono, `HarnessScreen.vue:315-346`: icona piccola
 * più parola, al posto dell'ora quando c'è qualcosa da dire.
 *
 * ⛔ Parola E icona, mai solo il colore (WCAG 1.4.1, «Use of Color»,
 *   https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html, letto il 24/09/2026).
 *   L'icona è `aria-hidden`: la parola la porta già.
 * ⛔ Tono d'attenzione SOLO per chi chiede un'azione: «aspetta te» (warning) e
 *   «fallita» (danger). «interrotta» resta quieta come sul desktop (`TONI`, dove
 *   non ha tono): si riprende scrivendo, non è un allarme.
 * ⛔ «conclusa» e «vuota» non disegnano niente: un'etichetta «conclusa» su ogni
 *   riga normale sarebbe rumore (stessa scelta dichiarata in `HarnessScreen.vue:109-114`).
 *
 * Due forme, una sola logica:
 *   - `riga` (elenco Chat): testo sulla seconda riga, dove sta l'ora;
 *   - `pastiglia` (barra laterale, righe su una sola linea): la stessa pastiglia
 *     del segno «bozza», colorata solo per i due toni d'attenzione.
 */
import { computed } from 'vue'
import { CircleDashed, CircleX, Hourglass, LoaderCircle, Pause, ShieldQuestion } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import type { TalosStatoChat } from '@/lib/chat/statoChat'
import { TALOS_STATO_CHAT_CHIAVE, talosStatoChatParla } from '@/lib/chat/statoDellaChat'

const props = withDefaults(defineProps<{
    stato: TalosStatoChat
    forma?: 'riga' | 'pastiglia'
    /** Per `aria-describedby` di chi la mostra accanto a un pulsante col suo nome. */
    id?: string
}>(), { forma: 'riga', id: undefined })

const { t } = useTalosI18n()

/*
 * Le icone sono quelle GIÀ in uso per gli stessi fatti:
 *   aspetta te → ShieldQuestion (la scheda del permesso in attesa, `TalosMobileMessageList.vue:604`);
 *   in corso   → LoaderCircle che gira (le attese vive dell'app);
 *   in coda    → Hourglass (i giri che aspettano, `TalosResearchStatusPill.vue:40`);
 *   in pausa   → Pause (la pausa della memoria, `TalosMobileMemoryState.vue:40`) — CODA-PAUSA (25/09/2026, owner «in pausa»);
 *   fallita    → CircleX (errore, `HarnessScreen.vue:338`);
 *   interrotta → CircleDashed (interrotta, `TalosResearchStatusPill.vue:34`).
 */
const ICONE = {
    'aspetta-te': ShieldQuestion,
    'in-corso': LoaderCircle,
    'in-coda': Hourglass,
    'in-pausa': Pause,
    fallita: CircleX,
    interrotta: CircleDashed,
} as const

type Tono = 'attenzione' | 'pericolo' | 'vivo' | 'quieto'
const TONO: Readonly<Record<keyof typeof ICONE, Tono>> = {
    'aspetta-te': 'attenzione',
    fallita: 'pericolo',
    'in-corso': 'vivo',
    'in-coda': 'quieto',
    'in-pausa': 'quieto',
    interrotta: 'quieto',
}

/*
 * Classi scritte per esteso: Tailwind legge il sorgente, un nome composto con
 * un'interpolazione non finirebbe nel CSS (stessa nota di `researchPresentation.ts`).
 */
const CLASSI_RIGA: Readonly<Record<Tono, string>> = {
    attenzione: 'font-medium text-[var(--talos-warning)]',
    pericolo: 'text-[var(--talos-danger,#dc5b5b)]',
    vivo: 'text-[var(--talos-muted)]',
    quieto: 'text-[var(--talos-muted)]',
}
const CLASSI_PASTIGLIA: Readonly<Record<Tono, string>> = {
    attenzione: 'border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] text-[var(--talos-warning)]',
    pericolo: 'border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] text-[var(--talos-danger,#dc5b5b)]',
    vivo: 'border-[var(--talos-border)] text-[var(--talos-muted)]',
    quieto: 'border-[var(--talos-border)] text-[var(--talos-muted)]',
}

const parla = computed(() => talosStatoChatParla(props.stato))
const chiave = computed(() => props.stato as keyof typeof ICONE)
const tono = computed<Tono>(() => TONO[chiave.value])
const icona = computed(() => ICONE[chiave.value])
const parola = computed(() => t(TALOS_STATO_CHAT_CHIAVE[props.stato] ?? ''))
</script>

<template>
    <span
        v-if="parla"
        :id="props.id"
        data-testid="talos-chat-status"
        :data-stato="props.stato"
        :data-tone="tono"
        class="inline-flex min-w-0 shrink-0 items-center gap-1 whitespace-nowrap leading-none"
        :class="[
            props.forma === 'pastiglia'
                ? `min-h-5 rounded-[var(--talos-radius-control)] border px-1.5 text-3xs ${CLASSI_PASTIGLIA[tono]}`
                : `text-2xs ${CLASSI_RIGA[tono]}`,
        ]"
    >
        <!-- Misure prese dai vicini: la pastiglia è quella di `.recent-draft` della barra laterale
             (min-h 1.25rem, padding .375rem, text-3xs); la riga è quella dell'ora (text-2xs). -->
        <component
            :is="icona"
            class="size-3 shrink-0"
            :class="props.stato === 'in-corso' ? 'text-[var(--talos-accent)] motion-safe:animate-spin' : ''"
            aria-hidden="true"
        />
        <span>{{ parola }}</span>
    </span>
</template>
