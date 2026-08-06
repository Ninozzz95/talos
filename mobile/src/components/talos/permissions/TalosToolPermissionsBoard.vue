<script setup lang="ts">
/**
 * Tutti i permessi degli strumenti, decisi in una volta.
 *
 * ## Da dove nasce
 *
 * Owner 2026-08-06: «bisogna inserire una pagina dedicata di tutti i permessi
 * per i tool, in modo di impostarli **in one shot al primo accesso**».
 *
 * Prima, al primo accesso, c'erano due bottoni: «chiedimelo sempre» oppure
 * «lascialo fare». Una scelta sola per tre poteri molto diversi — leggere quello
 * che hai già scritto, scrivere sul tuo dispositivo, uscire in rete — e
 * nessun modo di sapere COSA si stesse decidendo. Chi premeva «lascialo fare»
 * autorizzava anche la rete senza che gliel'avesse detto nessuno.
 *
 * ## Perché non un interruttore per ogni tool
 *
 * Perché i tool oggi sono ventiquattro e domani saranno il doppio: una pagina
 * con cinquanta interruttori al primo accesso non è controllo, è una resa —
 * si preme «avanti» e si è deciso niente. La ricerca sulle richieste di
 * permesso è netta su questo: la raffica all'avvio è un antipattern proprio
 * perché produce consensi senza lettura.
 *
 * La grammatica di TALOS ha già la forma giusta e non ne va inventata un'altra
 * ([[permissions-single-global-grammar]]): **tre poteri**, e per ciascuno **tre
 * stati** — sempre, chiedimelo, mai. Quello che mancava non erano più
 * interruttori: era **dire quali strumenti stanno dentro ciascun potere**. Qui
 * l'elenco c'è, e viene dal catalogo vero — se domani nasce un tool nuovo,
 * questa pagina lo mostra senza che nessuno se ne ricordi.
 *
 * ## «Decidi tutto» in cima, non in fondo
 *
 * Chi vuole liquidare la pagina in un tocco deve poterlo fare subito, e chi
 * vuole leggere trova sotto le tre righe separate. Metterlo in fondo
 * costringerebbe a scorrere tutto proprio chi non voleva leggere niente.
 */
import { computed, ref, watch } from 'vue'
import { useTalosI18n } from '@/i18n'
import { BookOpen, Globe, PencilLine } from '@lucide/vue'
import {
    TALOS_TOOL_ACTIONS,
    type TalosToolAction,
    type TalosToolPermission,
    type TalosToolPermissions,
} from '@/lib/tools/permissionTypes'
import { TALOS_AGENT_TOOL_CONTROLS } from '@/lib/tools/toolControlCatalog'
import { TALOS_TOOL_LABEL_KEYS } from '@/lib/tools/toolLabels'

const { t } = useTalosI18n()

const permissions = defineModel<TalosToolPermissions>({ required: true })

const props = withDefaults(defineProps<{
    /** Vero mentre una scelta sta venendo salvata: spegne i comandi. */
    busy?: boolean
}>(), { busy: false })

const STATI: readonly TalosToolPermission[] = ['allow', 'ask', 'deny']

const ICONE = { read: BookOpen, write: PencilLine, outbound: Globe } as const

/**
 * Quali strumenti ricadono in ciascun potere, presi dal catalogo VERO.
 *
 * Un elenco scritto a mano sarebbe giusto oggi e falso al primo tool nuovo, e
 * nessuno se ne accorgerebbe: una pagina di permessi che dimentica uno
 * strumento non sbaglia in modo visibile, sbaglia in silenzio.
 */
const strumentiPer = computed<Record<TalosToolAction, string[]>>(() => {
    const per: Record<TalosToolAction, string[]> = { read: [], write: [], outbound: [] }
    for (const controllo of TALOS_AGENT_TOOL_CONTROLS) {
        for (const azione of controllo.actions) {
            const chiave = TALOS_TOOL_LABEL_KEYS[controllo.id]
            // Senza etichetta si mostra il nome tecnico: brutto, ma onesto —
            // meglio di uno strumento che sparisce dall'elenco dei permessi.
            per[azione].push(chiave ? t(chiave) : controllo.id)
        }
    }
    for (const azione of TALOS_TOOL_ACTIONS) {
        per[azione] = [...new Set(per[azione])].sort((a, b) => a.localeCompare(b))
    }
    return per
})

/**
 * L'ultimo valore EMESSO, che non è sempre quello che si legge nel modello.
 *
 * Visto sul OnePlus Pad 3 il 2026-08-06: toccando due poteri diversi in rapida
 * successione, il primo tocco spariva. Il modello arriva da fuori, e finché chi
 * sta sopra non ha propagato il cambiamento, `permissions.value` risponde ancora
 * col valore vecchio — quindi il secondo tocco ricostruiva l'oggetto partendo da
 * prima del primo, e lo cancellava.
 *
 * Un tocco perso in una pagina di permessi non è un fastidio: è una persona che
 * crede di aver negato la rete e non l'ha negata.
 */
const ultimo = ref<TalosToolPermissions>({ ...permissions.value })
watch(permissions, (valore) => { ultimo.value = { ...valore } })

function applica(prossimo: TalosToolPermissions): void {
    ultimo.value = prossimo
    permissions.value = prossimo
}

function scegli(azione: TalosToolAction, stato: TalosToolPermission): void {
    applica({ ...ultimo.value, [azione]: stato })
}

function scegliTutto(stato: TalosToolPermission): void {
    applica({ read: stato, write: stato, outbound: stato })
}

/** Vero quando tutti e tre i poteri hanno già lo stesso stato. */
function tuttoSu(stato: TalosToolPermission): boolean {
    return TALOS_TOOL_ACTIONS.every((azione) => permissions.value[azione] === stato)
}
</script>

<template>
    <section class="flex flex-col gap-4" data-testid="talos-tool-permissions-board">
        <div class="flex flex-col gap-2">
            <p class="text-xs uppercase tracking-wide text-[var(--talos-muted)]">
                {{ t('toolPermissions.allAtOnce') }}
            </p>
            <div class="flex flex-wrap gap-2" role="group" :aria-label="t('toolPermissions.allAtOnce')">
                <button
                    v-for="stato in STATI"
                    :key="`tutto-${stato}`"
                    type="button"
                    :data-testid="`talos-tool-permissions-all-${stato}`"
                    :disabled="props.busy"
                    :aria-pressed="tuttoSu(stato)"
                    class="talos-pressable min-h-touch rounded-full border px-4 text-sm disabled:opacity-50"
                    :class="tuttoSu(stato)
                        ? 'border-[var(--talos-accent)] bg-[var(--talos-accent)] text-[var(--talos-accent-contrast,var(--primary-foreground))]'
                        : 'border-[var(--talos-border)] text-[var(--talos-text)]'"
                    @click="scegliTutto(stato)"
                >
                    {{ t(`toolPermissions.state.${stato}`) }}
                </button>
            </div>
        </div>

        <ul class="flex flex-col gap-3">
            <li
                v-for="azione in TALOS_TOOL_ACTIONS"
                :key="azione"
                :data-testid="`talos-tool-permission-${azione}`"
                class="flex flex-col gap-2 rounded-2xl border border-[var(--talos-border)] p-3"
            >
                <div class="flex items-start gap-2">
                    <component :is="ICONE[azione]" class="mt-0.5 size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                    <div class="min-w-0">
                        <p class="text-sm font-semibold text-[var(--talos-text)]">
                            {{ t(`toolPermissions.action.${azione}.title`) }}
                        </p>
                        <p class="mt-0.5 text-xs leading-5 text-[var(--talos-muted)]">
                            {{ t(`toolPermissions.action.${azione}.body`) }}
                        </p>
                    </div>
                </div>

                <!--
                    `radiogroup` e non tre bottoni sciolti: sono tre scelte che
                    si escludono, e chi naviga con la tastiera o con TalkBack
                    deve sentirsele come tali — è la stessa correzione fatta ai
                    filtri nella fase di coerenza.
                -->
                <div
                    role="radiogroup"
                    :aria-label="t(`toolPermissions.action.${azione}.title`)"
                    class="flex flex-wrap gap-2"
                >
                    <button
                        v-for="stato in STATI"
                        :key="`${azione}-${stato}`"
                        type="button"
                        role="radio"
                        :data-testid="`talos-tool-permission-${azione}-${stato}`"
                        :aria-checked="permissions[azione] === stato"
                        :disabled="props.busy"
                        class="talos-pressable min-h-touch rounded-full border px-3 text-xs disabled:opacity-50"
                        :class="permissions[azione] === stato
                            ? 'border-[var(--talos-accent)] bg-[var(--talos-active)] font-semibold text-[var(--talos-text)]'
                            : 'border-[var(--talos-border)] text-[var(--talos-muted)]'"
                        @click="scegli(azione, stato)"
                    >
                        {{ t(`toolPermissions.state.${stato}`) }}
                    </button>
                </div>

                <!--
                    Quali strumenti stanno dentro questo potere. È la cosa che
                    mancava: senza, «scrivere» è una parola, e chi decide non sa
                    su cosa sta decidendo.
                -->
                <p
                    :data-testid="`talos-tool-permission-${azione}-tools`"
                    class="text-2xs leading-5 text-[var(--talos-muted)]"
                >
                    {{ t('toolPermissions.covers') }} {{ strumentiPer[azione].join(' · ') }}
                </p>
            </li>
        </ul>

    </section>
</template>
