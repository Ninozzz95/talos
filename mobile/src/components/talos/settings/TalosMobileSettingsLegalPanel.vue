<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import { talosNpuTermsText } from '@/lib/models/npuTerms'
import { TALOS_NATIVE_COMPONENTS } from '@/lib/legal/nativeComponents'

/**
 * ⛔ NOTE LEGALI — owner, 01/10/2026: «blocco della build e note complete».
 *
 * Quattro parti, una per fonte, e nessuna inventata:
 *  - il software Qualcomm (PKLA 3.8: l'avviso dei suoi diritti; e le condizioni
 *    approvate, leggibili in ogni momento, non solo al momento di accettarle);
 *  - i componenti nativi e i modelli (`lib/legal/nativeComponents.ts`, dalle
 *    provenienze del repo);
 *  - le librerie Android (AboutLibraries, `src/generated/androidLicenses.json`);
 *  - le librerie dell'interfaccia (license-checker, `src/generated/npmLicenses.json`).
 * Gli elenchi generati si caricano solo qui: sono centinaia di KB che il
 * pacchetto d'avvio non deve portarsi dietro.
 */
interface NpmVoce { package: string, license: string, repository: string | null, note: string | null, text: string | null }
interface AndroidVoce { uniqueId: string, name: string, artifactVersion?: string, licenses?: string[] }

const { t, locale } = useTalosI18n()
const termini = computed(() => talosNpuTermsText(String(locale.value ?? 'it')))
const terminiAperti = ref(false)

const npm = ref<NpmVoce[] | null>(null)
const android = ref<Array<{ id: string, name: string, version: string, licenses: string }> | null>(null)
const testoAperto = ref<string | null>(null)

onMounted(async () => {
    const [npmJson, androidJson] = await Promise.all([
        import('@/generated/npmLicenses.json'),
        import('@/generated/androidLicenses.json'),
    ])
    npm.value = (npmJson.default as NpmVoce[])
    const dati = androidJson.default as unknown as { libraries: AndroidVoce[], licenses: Record<string, { name?: string }> }
    android.value = dati.libraries
        .map((voce) => ({
            id: voce.uniqueId,
            name: voce.name,
            version: voce.artifactVersion ?? '',
            licenses: (voce.licenses ?? []).map((k) => dati.licenses[k]?.name || k).join(', '),
        }))
        .sort((a, b) => a.id.localeCompare(b.id))
})
</script>

<template>
    <div class="flex flex-col gap-[var(--talos-space-section)]" data-testid="talos-legal-panel">
        <section
            data-testid="talos-legal-qualcomm"
            class="rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)] p-[var(--talos-space-card)]"
        >
            <h3 class="text-sm font-semibold text-[var(--talos-text)]">{{ t('legal.qualcommTitle') }}</h3>
            <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">{{ t('legal.qualcommBody') }}</p>
            <button
                type="button"
                data-testid="talos-legal-qualcomm-terms-toggle"
                class="talos-pressable mt-1 min-h-touch text-xs font-medium text-[var(--talos-accent)] underline-offset-2 hover:underline"
                :aria-expanded="terminiAperti"
                @click="terminiAperti = !terminiAperti"
            >{{ terminiAperti ? t('legal.hideTerms') : t('legal.readTerms') }}</button>
            <div
                v-if="terminiAperti"
                data-testid="talos-legal-qualcomm-terms"
                class="mt-1 flex flex-col gap-2 text-xs leading-5 text-[var(--talos-muted)]"
            >
                <p class="font-semibold text-[var(--talos-text)]">{{ termini.title }}</p>
                <p>{{ termini.intro }}</p>
                <p v-for="(voce, indice) in termini.items" :key="indice">
                    <span class="font-semibold text-[var(--talos-text)]">{{ indice + 1 }}. {{ voce.title }}</span>
                    {{ voce.body }}
                </p>
            </div>
        </section>

        <section data-testid="talos-legal-native">
            <h3 class="text-sm font-semibold text-[var(--talos-text)]">{{ t('legal.nativeTitle') }}</h3>
            <ul class="mt-2 flex flex-col divide-y divide-[var(--talos-border)]">
                <li v-for="voce in TALOS_NATIVE_COMPONENTS" :key="voce.name" class="py-2">
                    <p class="text-xs text-[var(--talos-text)]">
                        {{ voce.name }} <span v-if="voce.version" class="text-[var(--talos-muted)]">{{ voce.version }}</span>
                    </p>
                    <p class="font-mono text-3xs text-[var(--talos-muted)]">{{ voce.license }} · {{ voce.source }}</p>
                    <p v-if="voce.note" class="text-3xs leading-4 text-[var(--talos-muted)]">{{ voce.note }}</p>
                </li>
            </ul>
        </section>

        <p v-if="!android || !npm" role="status" class="text-xs text-[var(--talos-muted)]">{{ t('legal.loading') }}</p>

        <section v-if="android" data-testid="talos-legal-android">
            <h3 class="text-sm font-semibold text-[var(--talos-text)]">{{ t('legal.androidTitle') }}</h3>
            <p class="text-3xs text-[var(--talos-muted)]">{{ t('legal.count', { count: android.length }) }}</p>
            <ul class="mt-2 flex flex-col divide-y divide-[var(--talos-border)]">
                <li v-for="voce in android" :key="voce.id" class="py-1.5">
                    <p class="text-xs text-[var(--talos-text)]">{{ voce.id }} <span class="text-[var(--talos-muted)]">{{ voce.version }}</span></p>
                    <p class="font-mono text-3xs text-[var(--talos-muted)]">{{ voce.licenses }}</p>
                </li>
            </ul>
        </section>

        <section v-if="npm" data-testid="talos-legal-npm">
            <h3 class="text-sm font-semibold text-[var(--talos-text)]">{{ t('legal.npmTitle') }}</h3>
            <p class="text-3xs text-[var(--talos-muted)]">{{ t('legal.count', { count: npm.length }) }}</p>
            <ul class="mt-2 flex flex-col divide-y divide-[var(--talos-border)]">
                <li v-for="voce in npm" :key="voce.package" class="py-1.5">
                    <p class="text-xs text-[var(--talos-text)]">{{ voce.package }}</p>
                    <p class="font-mono text-3xs text-[var(--talos-muted)]">{{ voce.license }}<template v-if="voce.repository"> · {{ voce.repository }}</template></p>
                    <p v-if="voce.note" class="text-3xs leading-4 text-[var(--talos-muted)]">{{ voce.note }}</p>
                    <button
                        type="button"
                        class="talos-pressable min-h-touch text-3xs font-medium text-[var(--talos-accent)] underline-offset-2 hover:underline"
                        :aria-expanded="testoAperto === voce.package"
                        @click="testoAperto = testoAperto === voce.package ? null : voce.package"
                    >{{ testoAperto === voce.package ? t('legal.hideText') : t('legal.showText') }}</button>
                    <pre
                        v-if="testoAperto === voce.package"
                        class="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--talos-active)] p-2 font-mono text-3xs leading-4 text-[var(--talos-muted)]"
                    >{{ voce.text ?? t('legal.noText') }}</pre>
                </li>
            </ul>
        </section>
    </div>
</template>
