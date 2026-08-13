<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronRight, ShieldCheck } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { useSettingsStore } from '@/stores/settings'
import TalosThemedSwitch from '@/components/talos/ui/TalosThemedSwitch.vue'
import TalosThemedSelect from '@/components/talos/ui/TalosThemedSelect.vue'
import type { TalosThemedSelectItem } from '@/components/talos/ui/TalosThemedSelect.vue'
import {
    TALOS_AGENT_TOOL_CONTROLS,
    TALOS_AGENT_TOOL_GROUP_ORDER,
} from '@/lib/tools/toolControlCatalog'
import type { TalosAgentToolControl } from '@/lib/tools/toolControlCatalog'
import type { TalosAgentToolId } from '@/lib/tools/toolControls'

const { t } = useTalosI18n()
const settings = useSettingsStore()
/*
 * ⛔ L'INTERFACCIA, non `typeof CATALOGO[number]`.
 *
 * Il catalogo è `as const`, quindi il tipo dedotto è l'unione delle 60 voci
 * *letterali*: `richiede` esiste solo sui membri che ce l'hanno scritto, e
 * leggerlo sull'unione non compila. Passando dall'interfaccia il campo è
 * opzionale su tutti — che è il fatto vero, e vale anche per il prossimo campo
 * facoltativo che nascerà.
 */
type AgentToolControl = TalosAgentToolControl

/**
 * ⛔⛔ L'INTERRUTTORE CHE MENTIVA — owner 2026-08-12.
 *
 * «L'assistente non ha accesso alla ricerca web, cosa che dovrebbe essere
 * tranquillamente accessibile dalla chat. Questo è assolutamente
 * inaccettabile.» Qui `web_search` era **acceso**; i permessi erano `allow`; e
 * il tool non veniva offerto al modello, perché nessun motore di ricerca era
 * mai stato scelto (`offerti=59` senza `web_search`, `61` con — vedi
 * `toolControlCatalog`).
 *
 * ⇒ Da fuori, «acceso ma manca il pezzo a monte» e «acceso e bloccato dai
 * permessi» erano indistinguibili. L'owner ha dedotto il secondo, che era la
 * spiegazione sbagliata, e ci ha perso una serata.
 *
 * Adesso la riga lo dice, e porta dove si aggiusta: un pannello di permessi ha
 * un solo lavoro — dire la verità su cosa succede — e «questo non funziona
 * comunque» fa parte della verità tanto quanto «questo è spento».
 */
const emit = defineEmits<{ (e: 'vaiAlMotore'): void }>()
const motoreScelto = computed(() => settings.state.search.source !== null)

function mancaIlRequisito(tool: AgentToolControl): boolean {
    return tool.richiede === 'motoreDiRicerca' && !motoreScelto.value
}
// Hand-ordered, so a group added to the catalogue and forgotten here is a set
// of tools nobody can switch off. `models` arrived 2026-07-31 with the
// on-device download tools.
// ⛔ L'ordine viene dal catalogo, dove un test lo confronta con i gruppi
// realmente usati. Qui era un elenco privato che nessuno poteva controllare, e
// un gruppo dimenticato non rompeva niente: faceva solo sparire i suoi tool
// dalla pagina — tool che il modello può usare e che nessuno può spegnere.
const groups = computed(() => TALOS_AGENT_TOOL_GROUP_ORDER.map((id) => ({
    id,
    tools: TALOS_AGENT_TOOL_CONTROLS.filter((tool) => tool.group === id),
})))
/**
 * ⛔ Ciò che VALE, non ciò che è rimasto scritto.
 *
 * ## Il difetto, riferito dall'owner il 2026-08-08
 *
 * Guardando questa schermata sul suo telefono leggeva «Consenti sempre» su
 * tutte e tre le voci. Nel file delle preferenze c'era davvero
 * `{read: allow, write: allow, outbound: allow}` — valori di un default
 * vecchio, mai scelti da nessuno.
 *
 * Ma la chat NON li usa: passa da `effectiveToolPermissions()`, che applica
 * la regola scritta in `talosEffectiveToolPermissions` — «un valore che
 * nessuno ha scelto è il default di OGGI, non quello del giorno in cui l'app è
 * stata installata». Quindi il modello chiedeva, correttamente, mentre la
 * schermata diceva che non avrebbe chiesto.
 *
 * ⇒ Non era un buco di sicurezza: era una **bugia a schermo**, nella direzione
 * innocua e per questo più difficile da scoprire. Chi legge «sempre» e vede
 * comparire una richiesta pensa che l'app sia rotta; chi legge «sempre» e non
 * la vede comparire si fida di un permesso che non ha.
 *
 * Un pannello dei permessi ha un solo lavoro: dire la verità su cosa succede.
 */
const permessiEffettivi = computed(() => settings.effectiveToolPermissions())

/**
 * ⛔ Le categorie sono RICHIUDIBILI, e la testata parla anche da chiusa.
 *
 * Owner 2026-08-08: «voglio che le categorie vengano raggruppate in un
 * collapse». La ragione è misurata: con 55 strumenti questo elenco arriva a
 * y≈13.000 sul Pad — tredici schermate. Una pagina che si scorre senza leggere
 * non è una pagina di controllo, è un muro con degli interruttori dentro.
 *
 * ## Perché tutte chiuse tranne una
 *
 * Aperte tutte, il collapse non serve a niente. Chiuse tutte, chi arriva qui la
 * prima volta vede sei titoli e nessuno strumento, e non capisce cosa può
 * spegnere. Aperta la PRIMA: si vede subito com'è fatta una riga, e le altre
 * cinque restano a un tocco.
 *
 * ## ⛔ E il conto sulla testata, che è la parte che conta
 *
 * «Questo telefono — 6 di 17 accesi» si legge **senza aprire**. Senza quel
 * numero, richiudere una categoria significherebbe nasconderne lo stato, e una
 * pagina di permessi che nasconde lo stato è peggio di una lunga: chi la chiude
 * non sa più cosa ha lasciato acceso.
 */
const aperte = ref<Set<string>>(new Set([TALOS_AGENT_TOOL_GROUP_ORDER[0] ?? '']))

function commuta(gruppo: string): void {
    const prossime = new Set(aperte.value)
    if (prossime.has(gruppo)) prossime.delete(gruppo)
    else prossime.add(gruppo)
    aperte.value = prossime
}

/** Quanti accesi su quanti, per categoria. Si legge a categoria chiusa. */
function accesiIn(tools: readonly AgentToolControl[]): number {
    return tools.filter((tool) => settings.state.agent_tools[tool.id]).length
}

const enabledCount = computed(() => TALOS_AGENT_TOOL_CONTROLS.filter(
    (tool) => settings.state.agent_tools[tool.id],
).length)
// Moved here from AI defaults on 2026-08-02, owner-approved: how far the
// model may go without asking is the frame around WHICH tools it may use,
// so it belongs above the list rather than at the foot of another screen.
const toolChoices = computed<TalosThemedSelectItem[]>(() => [
    { value: 'allow', label: t('agentTools.alwaysAllow') },
    { value: 'ask', label: t('agentTools.askEveryTime') },
    { value: 'deny', label: t('agentTools.neverAllow') },
])

function setToolPermission(action: 'read' | 'write' | 'outbound', value: string): void {
    void settings.setToolPermissions({ [action]: value as 'allow' | 'ask' | 'deny' })
}

const savingTool = ref<TalosAgentToolId | null>(null)
const revokingTool = ref<TalosAgentToolId | null>(null)
const saveError = ref<string | null>(null)

function title(tool: AgentToolControl): string {
    return t(`agentTools.tools.${tool.id}.title`)
}

function description(tool: AgentToolControl): string {
    return t(`agentTools.tools.${tool.id}.description`)
}

async function setEnabled(tool: AgentToolControl, enabled: boolean): Promise<void> {
    // The shared switch is controlled: it shows the stored value and never
    // moves on its own, so there is nothing to put back when a save fails.
    // What used to be three assignments to `input.checked` is now the absence
    // of one — the control cannot show something that was never persisted.
    if (savingTool.value !== null) return

    savingTool.value = tool.id
    saveError.value = null
    try {
        await settings.setAgentToolEnabled(tool.id, enabled)
    } catch {
        saveError.value = t('agentTools.saveFailed', { tool: title(tool) })
    } finally {
        savingTool.value = null
    }
}

function hasSavedAuthorization(tool: AgentToolControl): boolean {
    return settings.state.tool_authorizations.grants[tool.id] !== undefined
}

async function revokeAuthorization(tool: AgentToolControl): Promise<void> {
    if (revokingTool.value !== null || savingTool.value !== null) return
    revokingTool.value = tool.id
    saveError.value = null
    try {
        await settings.revokeToolAuthorization(tool.id)
    } catch {
        saveError.value = t('agentTools.revokeFailed', { tool: title(tool) })
    } finally {
        revokingTool.value = null
    }
}
</script>

<template>
    <section
        data-testid="talos-settings-agent-tools"
        class="flex flex-col gap-4"
        :aria-busy="savingTool !== null || revokingTool !== null"
    >
        <div class="flex items-start gap-2">
            <ShieldCheck class="mt-0.5 size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
            <div class="min-w-0">
                <p class="text-xs leading-5 text-[var(--talos-muted)]">{{ t('agentTools.intro') }}</p>
                <p class="mt-1 text-2xs leading-4 text-[var(--talos-muted)]">{{ t('agentTools.policyNote') }}</p>
            </div>
        </div>

        <!-- Owner 2026-07-25: what the model may do on its own. Moved out of AI
             defaults 2026-08-02: trust first, then the eighteen capacities. -->
        <section data-testid="talos-tool-permissions">
            <h3 class="text-sm font-semibold text-[var(--talos-text)]">{{ t('agentTools.autonomousTitle') }}</h3>
            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
                {{ t('agentTools.autonomousBody') }}
            </p>

            <label class="mt-3 block">
                <span class="block text-xs font-medium text-[var(--talos-muted)]">{{ t('agentTools.readThings') }}</span>
                <TalosThemedSelect
                    class="mt-1"
                    data-testid="talos-tool-permission-read"
                    :model-value="permessiEffettivi.read"
                    :items="toolChoices"
                    :aria-label="t('agentTools.readPermission')"
                    @update:model-value="setToolPermission('read', $event)"
                />
            </label>

            <label class="mt-3 block">
                <span class="block text-xs font-medium text-[var(--talos-muted)]">{{ t('agentTools.writeThings') }}</span>
                <TalosThemedSelect
                    class="mt-1"
                    data-testid="talos-tool-permission-write"
                    :model-value="permessiEffettivi.write"
                    :items="toolChoices"
                    :aria-label="t('agentTools.writePermission')"
                    @update:model-value="setToolPermission('write', $event)"
                />
            </label>

            <label class="mt-3 block">
                <span class="block text-xs font-medium text-[var(--talos-muted)]">{{ t('agentTools.outboundThings') }}</span>
                <TalosThemedSelect
                    class="mt-1"
                    data-testid="talos-tool-permission-outbound"
                    :model-value="permessiEffettivi.outbound"
                    :items="toolChoices"
                    :aria-label="t('agentTools.outboundPermission')"
                    @update:model-value="setToolPermission('outbound', $event)"
                />
                <span class="mt-1 block text-2xs leading-4 text-[var(--talos-muted)]">
                    {{ t('agentTools.outboundBody') }}
                </span>
            </label>
        </section>

        <p class="text-xs font-medium text-[var(--talos-text)]" aria-live="polite">
            {{ t('agentTools.enabledCount', { enabled: enabledCount, total: TALOS_AGENT_TOOL_CONTROLS.length }) }}
        </p>

        <p
            v-if="saveError"
            data-testid="agent-tools-save-error"
            role="alert"
            class="rounded-xl border border-[var(--talos-danger)]/35 bg-[var(--talos-danger)]/10 px-3 py-2 text-xs leading-5 text-[var(--talos-danger)]"
        >{{ saveError }}</p>

        <section v-for="group in groups" :key="group.id">
            <!--
                ⛔ La testata è il TETTO della scheda, non un titolo sopra di
                essa. Visto nello scatto del 2026-08-08 col viewport
                telefono: a categorie chiuse restavano sei scritte
                galleggianti su un fondo vuoto, e la pagina sembrava
                incompiuta — mentre da aperta il contenuto aveva la sua
                cornice e la testata no. Chiusa si arrotonda tutta; aperta
                perde il bordo di sotto e si attacca al corpo, così le due
                parti sono una cosa sola invece di due.
            -->
            <button
                type="button"
                class="talos-pressable flex min-h-touch w-full items-center gap-2 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 px-3 text-left"
                :class="aperte.has(group.id) ? 'rounded-b-none border-b-0' : ''"
                :data-agent-tool-group="group.id"
                :aria-expanded="aperte.has(group.id)"
                @click="commuta(group.id)"
            >
                <ChevronRight
                    class="size-3.5 shrink-0 text-[var(--talos-muted)] transition-transform motion-reduce:transition-none"
                    :class="aperte.has(group.id) ? 'rotate-90' : ''"
                    aria-hidden="true"
                />
                <h4 class="text-3xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">
                    {{ t(`agentTools.groups.${group.id}`) }}
                </h4>
                <!-- ⛔ Il conto si legge anche da CHIUSA: nascondere lo stato di
                     un permesso sarebbe peggio di una pagina lunga. -->
                <span class="ml-auto text-3xs tabular-nums text-[var(--talos-muted)]">
                    {{ t('agentTools.groupCount', {
                        enabled: accesiIn(group.tools),
                        total: group.tools.length,
                    }) }}
                </span>
            </button>
            <div
                v-show="aperte.has(group.id)"
                :data-agent-tool-group-body="group.id"
                class="divide-y divide-[var(--talos-border)] overflow-hidden rounded-xl rounded-t-none border border-t-0 border-[var(--talos-border)] bg-[var(--talos-panel)]/70">
                <div
                    v-for="tool in group.tools"
                    :key="tool.id"
                    :data-agent-tool="tool.id"
                    class="relative flex min-h-14 items-center gap-3 px-3 py-2.5"
                >
                    <button
                        type="button"
                        :data-agent-tool-label="tool.id"
                        tabindex="-1"
                        aria-hidden="true"
                        class="absolute inset-0 z-0 cursor-pointer"
                        :disabled="savingTool !== null || revokingTool !== null"
                        @click="setEnabled(tool, !settings.state.agent_tools[tool.id])"
                    ></button>
                    <span class="pointer-events-none relative z-10 min-w-0 flex-1">
                        <span class="block text-sm font-semibold text-[var(--talos-text)]">{{ title(tool) }}</span>
                        <span class="mt-0.5 block text-xs leading-4 text-[var(--talos-muted)]">{{ description(tool) }}</span>
                        <span class="mt-1.5 flex flex-wrap gap-1" aria-hidden="true">
                            <span
                                v-for="action in tool.actions"
                                :key="action"
                                :data-agent-tool-action="action"
                                class="rounded-md border border-[var(--talos-border)] px-1.5 py-0.5 text-3xs uppercase tracking-wide text-[var(--talos-muted)]"
                            >{{ t(`agentTools.actions.${action}`) }}</span>
                        </span>
                        <span
                            v-if="hasSavedAuthorization(tool)"
                            class="mt-1.5 inline-flex rounded-full bg-[var(--talos-accent)]/12 px-2 py-0.5 text-3xs font-medium text-[var(--talos-accent)]"
                        >{{ t('agentTools.alwaysAllowed') }}</span>
                        <!-- ⛔ Acceso NON basta: manca il pezzo a monte, e la
                             riga lo dice invece di lasciarlo dedurre. -->
                        <span
                            v-if="mancaIlRequisito(tool)"
                            :data-agent-tool-missing="tool.id"
                            class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1"
                        >
                            <span class="text-2xs leading-4 text-[var(--talos-warning)]">
                                {{ t('agentTools.needsSearchEngine') }}
                            </span>
                            <button
                                type="button"
                                data-agent-tool-fix="search-source"
                                class="talos-pressable pointer-events-auto relative z-30 min-h-8 rounded-full border border-[var(--talos-border)] px-2 text-2xs font-medium text-[var(--talos-accent)]"
                                @click="emit('vaiAlMotore')"
                            >{{ t('agentTools.chooseSearchEngine') }}</button>
                        </span>
                    </span>
                    <span class="relative z-20 flex shrink-0 flex-col items-end gap-1">
                        <button
                            v-if="hasSavedAuthorization(tool)"
                            type="button"
                            :data-agent-tool-revoke="tool.id"
                            class="talos-pressable min-h-8 rounded-full px-2 text-2xs font-medium text-[var(--talos-accent)]"
                            :disabled="revokingTool !== null || savingTool !== null"
                            @click="revokeAuthorization(tool)"
                        >{{ t('agentTools.askAgain') }}</button>
                        <div class="flex min-h-touch items-center">
                            <TalosThemedSwitch
                                :id="`talos-agent-tool-${tool.id}`"
                                :data-agent-tool-switch="tool.id"
                                :aria-label="t('agentTools.enableAria', { tool: title(tool) })"
                                :model-value="settings.state.agent_tools[tool.id]"
                                :disabled="savingTool !== null || revokingTool !== null"
                                @update:model-value="setEnabled(tool, $event)"
                            />
                        </div>
                    </span>
                </div>
            </div>
        </section>
    </section>
</template>
