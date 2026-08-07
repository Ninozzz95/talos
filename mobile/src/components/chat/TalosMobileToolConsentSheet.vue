<script setup lang="ts">
import { computed } from 'vue'
import { ShieldAlert, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import type { TalosToolAction } from '@/lib/tools/permissionTypes'

const MAX_RENDERED_ARGUMENTS = 4_096

const props = defineProps<{
    title: string
    description: string
    input: unknown
    actions: readonly TalosToolAction[]
    sessionTitle: string
    pendingCount: number
    allowPersistent: boolean
}>()

const emit = defineEmits<{
    /**
     * ⛔ «Consenti» vale per QUESTO MESSAGGIO, non per la singola chiamata.
     *
     * Owner 2026-08-07: «qual è la differenza tra "consenti una volta" e "per
     * questa richiesta"? Non possiamo unirli?»
     *
     * Aveva ragione: la differenza era NOSTRA, non sua. «Una volta» copriva una
     * chiamata con quegli argomenti esatti; «per questa richiesta» tutto il
     * messaggio. Ma chi legge pensa al messaggio che ha appena scritto — le
     * chiamate interne sono un dettaglio di come lavoriamo, ed esporlo come
     * scelta è la stessa famiglia di difetti del nome interno di un tool
     * mostrato al posto di una frase.
     *
     * E la grana fine non serviva a nessuno: chi vuole «solo questa e poi
     * richiedimelo» sta in realtà dicendo di no, e ha già il suo bottone.
     *
     * Restano TRE scelte, che sono una scala vera: no / per questo messaggio /
     * sempre. La scheda dice a voce quanto dura quella di mezzo.
     */
    /**
     * ⛔ «Per questa richiesta»: copre i passi che restano di QUESTO messaggio.
     *
     * Nasce da una misura: `deepseek-v4-flash` chiama gli strumenti pesanti
     * **uno per giro**, quindi una richiesta sola produce quattro schede in
     * fila. Il piano non puo' aiutare, perche' non vede mai piu' di un passo
     * alla volta.
     *
     * Non e' «sempre» travestito: muore quando il messaggio finisce, e la
     * trifecta e `R4` riportano la scheda anche dentro un turno gia' consentito.
     */
    allowTurn: []
    alwaysAllow: []
    deny: []
    later: []
}>()

const rendered = computed(() => {
    let value: string
    try {
        value = JSON.stringify(props.input, null, 2)
    } catch {
        value = String(props.input)
    }
    if (value.length <= MAX_RENDERED_ARGUMENTS) return value
    return `${value.slice(0, MAX_RENDERED_ARGUMENTS)}\n…`
})
</script>

<template>
    <Teleport to="body">
        <section
            data-testid="talos-tool-consent"
            role="dialog"
            aria-labelledby="talos-tool-authorization-title"
            tabindex="-1"
            class="pointer-events-auto fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[95] mx-auto flex max-h-[85dvh] w-auto max-w-[560px] flex-col rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-4 shadow-2xl"
            @keydown.esc.stop="emit('later')"
        >
            <!--
                ⛔ La parte che si LEGGE scorre; i bottoni restano fermi.

                MISURATO sul Pad il 2026-08-07, telefono in orizzontale con la
                tastiera aperta: la scheda cresceva verso l'alto e usciva dallo
                schermo. Restavano visibili **solo i quattro bottoni** — senza
                titolo, senza descrizione, senza argomenti.

                Cioe' si poteva approvare senza vedere COSA. E' il difetto
                peggiore che una scheda di consenso possa avere: non e' brutta,
                e' una firma in bianco.

                `max-h-[85dvh]` piu' il corpo scorrevole tengono la testa sempre
                dentro; `dvh` e non `vh` perche' con la tastiera aperta sono due
                numeri diversi, ed e' proprio quel caso.
            -->
            <div class="min-h-0 flex-1 overflow-y-auto">
            <div class="flex items-start gap-3">
                <ShieldAlert
                    class="mt-0.5 size-5 shrink-0 text-[var(--talos-accent)]"
                    aria-hidden="true"
                />
                <div class="min-w-0 flex-1">
                    <p class="text-2xs font-medium uppercase tracking-wide text-[var(--talos-muted)]">
                        {{ $t('chat.authorizationFromChat', { title: sessionTitle }) }}
                    </p>
                    <h2
                        id="talos-tool-authorization-title"
                        class="mt-0.5 text-md font-semibold text-[var(--talos-text)]"
                    >{{ title }}</h2>
                    <p class="mt-0.5 text-xs leading-5 text-[var(--talos-muted)]">
                        {{ description }}
                    </p>
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    data-testid="talos-tool-consent-later"
                    :aria-label="$t('chat.authorizationLater')"
                    class="talos-pressable shrink-0 rounded-full"
                    @click="emit('later')"
                >
                    <X class="size-4" aria-hidden="true" />
                </Button>
            </div>

            <div class="mt-3 flex flex-wrap items-center gap-1.5">
                <span
                    v-for="action in actions"
                    :key="action"
                    class="rounded-full border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] px-2 py-1 text-2xs font-medium text-[var(--talos-muted)]"
                >{{ $t(`chat.toolAction.${action}`) }}</span>
                <span class="ml-auto text-2xs text-[var(--talos-muted)]">
                    {{ $t('chat.pendingAuthorizationCount', { count: pendingCount }) }}
                </span>
            </div>
            <!--
                ⛔ Quanto dura un «sì» va DETTO, non dedotto dal nome del bottone.
                «Consenti» da solo si legge come «consenti per sempre» a chi non
                ha mai visto questa scheda, e chi lo scopre dopo non fida piu'.
            -->
            <div class="mt-2">
                <p class="text-2xs leading-4 text-[var(--talos-muted)]">
                    {{ $t('chat.consentScopeNote') }}
                </p>
            </div>

            <pre
                data-testid="talos-tool-consent-input"
                class="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-2 text-2xs leading-4 text-[var(--talos-muted)]"
            >{{ rendered }}</pre>

            <!--
                ⛔ Quattro scelte sono una SCALA, e vanno lette come tale:
                no → questa chiamata → questa richiesta → sempre.

                La griglia e' 2×2 OVUNQUE, e non una riga sola sul largo.

                ⛔ Visto sul Pad il 2026-08-07: con quattro colonne le etichette
                italiane **uscivano dalle pillole** — «Consenti una volta»
                sbordava da entrambi i lati, «Per questa richiesta» toccava i
                bordi. Una riga da quattro sta larga in inglese e stretta in
                italiano, e la lingua non e' un dettaglio da sistemare dopo.
                Meta' larghezza a testa ci sta in tutte e due.

                La primaria resta «una volta»: e' il gradino piu' basso che
                risolve il problema, ed e' quello che si tocca senza pensarci.
                Una scelta piu' larga si prende apposta, non per inerzia.
            -->
            </div>

            <div class="mt-4 grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3">
                <Button
                    type="button"
                    data-testid="talos-tool-consent-deny"
                    class="talos-pressable min-h-touch rounded-full border border-[var(--talos-border)] bg-transparent text-sm text-[var(--talos-text)]"
                    @click="emit('deny')"
                >{{ $t('chat.denyTool') }}</Button>
                <Button
                    type="button"
                    data-testid="talos-tool-consent-allow-once"
                    class="talos-pressable min-h-touch rounded-full bg-[var(--talos-accent)] text-sm font-medium text-[var(--talos-accent-contrast,var(--primary-foreground))]"
                    @click="emit('allowTurn')"
                >{{ $t('chat.consentOnce') }}</Button>
                <Button
                    v-if="allowPersistent"
                    type="button"
                    data-testid="talos-tool-consent-always"
                    class="talos-pressable col-span-2 min-h-touch rounded-full border border-[var(--talos-accent)] bg-transparent text-sm font-medium text-[var(--talos-accent)] sm:col-span-1"
                    @click="emit('alwaysAllow')"
                >{{ $t('chat.authorizationAlways') }}</Button>
            </div>
        </section>
    </Teleport>
</template>
