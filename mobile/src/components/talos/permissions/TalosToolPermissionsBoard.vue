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
import { BookOpen, ChevronRight, Globe, PencilLine, TerminalSquare } from '@lucide/vue'
import {
    TALOS_TOOL_ACTIONS,
    type TalosToolAction,
    type TalosToolPermission,
    type TalosToolPermissions,
} from '@/lib/tools/permissionTypes'
import {
    TALOS_AGENT_TOOL_CONTROLS,
    TALOS_AGENT_TOOL_GROUP_ORDER,
    TALOS_AZIONI_GOVERNATE,
} from '@/lib/tools/toolControlCatalog'
import { TALOS_TOOL_LABEL_KEYS } from '@/lib/tools/toolLabels'

const { t } = useTalosI18n()

const permissions = defineModel<TalosToolPermissions>({ required: true })

const props = withDefaults(defineProps<{
    /** Vero mentre una scelta sta venendo salvata: spegne i comandi. */
    busy?: boolean
}>(), { busy: false })

const STATI: readonly TalosToolPermission[] = ['allow', 'ask', 'deny']

/**
 * ⭐⭐ I POTERI CHE SI GOVERNANO: quelli che almeno un attrezzo dichiara.
 *
 * ⛔ Non `TALOS_TOOL_ACTIONS`, che e il vocabolario COMPLETO e contiene anche
 * cio che nessuno usa ancora. Il 2026-08-20, quando `execute` e entrata per
 * l'esecuzione di codice, mostrarla qui avrebbe prodotto:
 *
 *   · una quarta riga senza attrezzi sotto, per un potere non esercitabile;
 *   · e — misurato — `autonomiaGiaConcessa` FALSA per chiunque l'avesse gia
 *     concessa, perche pretende che OGNI azione sia `allow` e scelta.
 *
 * ⇒ Si mostra cio che esiste. Il giorno che il primo attrezzo dichiara
 * `execute`, la riga compare da se — con la sua icona e la sua domanda.
 */
const azioniGovernate = computed(() => TALOS_AZIONI_GOVERNATE)

const ICONE: Record<TalosToolAction, typeof BookOpen> = {
    read: BookOpen, write: PencilLine, outbound: Globe, execute: TerminalSquare,
}

/**
 * Quali strumenti ricadono in ciascun potere, presi dal catalogo VERO.
 *
 * Un elenco scritto a mano sarebbe giusto oggi e falso al primo tool nuovo, e
 * nessuno se ne accorgerebbe: una pagina di permessi che dimentica uno
 * strumento non sbaglia in modo visibile, sbaglia in silenzio.
 */
/**
 * ⛔ Gli strumenti di ogni potere, RAGGRUPPATI PER CATEGORIA e non in fila.
 *
 * Owner 2026-08-08: «voglio che le categorie vengano raggruppate in un
 * collapse». Qui la ragione è più forte che nelle impostazioni: questa pagina
 * si incontra **al primo accesso**, e prima diceva
 *
 * > Copre: Aprire un'app · Aprire una schermata di sistema · Chiamata…
 *
 * — cinquantacinque nomi separati da un punto, tre volte. Un elenco così non si
 * legge: si salta. E una pagina di permessi che si salta ha ottenuto un
 * consenso senza lettura, che è esattamente l'antipattern per cui questa pagina
 * era stata scritta ([[permissions-single-global-grammar]]).
 *
 * Le categorie sono le STESSE delle impostazioni, prese dallo stesso ordine: chi
 * decide qui e poi va a cambiare idea là ritrova le stesse parole nello stesso
 * ordine. Un nome diverso per la stessa cosa nelle due schermate farebbe pensare
 * a due impostazioni diverse.
 */
const strumentiPer = computed<Record<TalosToolAction, {
    gruppo: string
    nomi: string[]
}[]>>(() => {
    const per = Object.fromEntries(
        TALOS_TOOL_ACTIONS.map((azione) => [azione, new Map<string, string[]>()]),
    ) as Record<TalosToolAction, Map<string, string[]>>
    for (const controllo of TALOS_AGENT_TOOL_CONTROLS) {
        for (const azione of controllo.actions) {
            const chiave = TALOS_TOOL_LABEL_KEYS[controllo.id]
            // Senza etichetta si mostra il nome tecnico: brutto, ma onesto —
            // meglio di uno strumento che sparisce dall'elenco dei permessi.
            const nome = chiave ? t(chiave) : controllo.id
            const dentro = per[azione].get(controllo.group) ?? []
            if (!dentro.includes(nome)) dentro.push(nome)
            per[azione].set(controllo.group, dentro)
        }
    }
    const finale = {} as Record<TalosToolAction, { gruppo: string, nomi: string[] }[]>
    for (const azione of TALOS_TOOL_ACTIONS) {
        // ⛔ L'ordine viene dal catalogo, non dalla mappa: le categorie devono
        // apparire nella stessa sequenza delle impostazioni, sempre.
        finale[azione] = TALOS_AGENT_TOOL_GROUP_ORDER
            .filter((gruppo) => (per[azione].get(gruppo)?.length ?? 0) > 0)
            .map((gruppo) => ({
                gruppo,
                nomi: [...per[azione].get(gruppo)!].sort((a, b) => a.localeCompare(b)),
            }))
    }
    return finale
})

/** Quanti strumenti in tutto ricadono in questo potere. Si legge da CHIUSO. */
function quanti(azione: TalosToolAction): number {
    return strumentiPer.value[azione].reduce((somma, riga) => somma + riga.nomi.length, 0)
}

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
    /*
     * ⛔⛔ SI EMETTE SOLO CIO CHE SI E MOSTRATO.
     *
     * `setToolPermissions` registra come SCELTA ogni potere presente nel patch
     * — e ha ragione: chi tocca la scheda sta decidendo. Ma la scheda mostra i
     * poteri GOVERNATI, e mandare anche gli altri farebbe registrare una
     * decisione su una domanda mai posta. Il 2026-08-20, con `execute` appena
     * entrata nel vocabolario e nessun attrezzo a dichiararla, sarebbe stata
     * marcata «scelta dalla persona» al primo tocco di un potere qualsiasi.
     *
     * ⛔ Cio che resta fuori NON si perde: lo store fonde sul valore salvato, e
     * chi legge un potere assente cade sul default di oggi. Assente qui
     * significa «non l'ho chiesto», non «vale zero» — la stessa distinzione di
     * sempre, un piano piu in su.
     */
    permissions.value = Object.fromEntries(
        azioniGovernate.value.map((azione) => [azione, prossimo[azione]]),
    ) as TalosToolPermissions
}

function scegli(azione: TalosToolAction, stato: TalosToolPermission): void {
    applica({ ...ultimo.value, [azione]: stato })
}

function scegliTutto(stato: TalosToolPermission): void {
    /*
     * ⛔ Solo i poteri GOVERNATI. Applicare lo stato anche a un potere che
     * nessun attrezzo dichiara scriverebbe una scelta su una domanda che non e
     * mai stata posta — ed e esattamente cio che `tools_chosen` esiste per
     * impedire.
     */
    applica({
        ...ultimo.value,
        ...Object.fromEntries(azioniGovernate.value.map((azione) => [azione, stato])),
    })
}

/** Vero quando tutti e tre i poteri hanno già lo stesso stato. */
function tuttoSu(stato: TalosToolPermission): boolean {
    return azioniGovernate.value.every((azione) => permissions.value[azione] === stato)
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
                v-for="azione in azioniGovernate"
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

                    ⛔ Chiuso di suo, e col NUMERO sulla riga chiusa: «copre 24
                    strumenti» dice quanto pesa la decisione anche a chi non
                    apre. Nascondere l'elenco senza dire quanto è lungo sarebbe
                    peggio del muro che sostituisce.

                    <details> nativo e non un nostro interruttore: la tastiera,
                    TalkBack e la ricerca-nella-pagina del browser lo conoscono
                    già, e su Android apre e chiude senza una riga di JavaScript.
                -->
                <details
                    :data-testid="`talos-tool-permission-${azione}-tools`"
                    class="group/covers"
                >
                    <summary
                        class="talos-pressable flex min-h-touch cursor-pointer list-none items-center gap-1.5 text-2xs text-[var(--talos-muted)]"
                    >
                        <ChevronRight
                            class="size-3 shrink-0 transition-transform group-open/covers:rotate-90 motion-reduce:transition-none"
                            aria-hidden="true"
                        />
                        {{ t('toolPermissions.coversCount', {
                            tools: quanti(azione),
                            groups: strumentiPer[azione].length,
                        }) }}
                    </summary>
                    <ul class="mt-1 flex flex-col gap-1.5 pl-4">
                        <li v-for="riga in strumentiPer[azione]" :key="riga.gruppo">
                            <p class="text-3xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">
                                {{ t(`agentTools.groups.${riga.gruppo}`) }}
                            </p>
                            <p class="text-2xs leading-5 text-[var(--talos-muted)]">
                                {{ riga.nomi.join(' · ') }}
                            </p>
                        </li>
                    </ul>
                </details>
            </li>
        </ul>

    </section>
</template>
