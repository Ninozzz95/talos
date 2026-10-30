<script setup lang="ts">
// ASS-148 (owner 29/10 «Frase + pulsante»): il pulsante della scheda d'errore quando «Rete locale» è tolta. A parte e a richiesta,
// perché la scheda d'errore sta nel pezzo d'avvio della chat e il tetto è a 669.000 byte.
import { talosApriPermessiApp } from '@/lib/network/reteLocaleBloccata'
</script>

<template>
    <button
        type="button"
        data-testid="talos-mobile-fault-open-permissions"
        class="mt-3 flex min-h-touch items-center justify-center gap-2 rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-4 text-xs text-[var(--talos-text)]"
        @click="void talosApriPermessiApp()"
    >
        {{ $t('chat.openAppPermissions') }}
    </button>
</template>
