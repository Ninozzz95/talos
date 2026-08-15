import { z } from 'zod'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'

/**
 * T2 — le capacità che finora costavano «un viaggio nelle impostazioni», e che
 * dopo la misura del 2026-08-08 non lo costano più.
 *
 * ## Cosa è cambiato, in una riga
 *
 * Cinque delle sei si aprono passando dalla shell via Shizuku: Wi-Fi,
 * Bluetooth, Non disturbare, impostazioni di sistema, uso delle app. La sesta —
 * l'overlay — resta l'unica cara, perché passa da `appops`, che è esattamente
 * la porta che il produttore chiude.
 *
 * ## ⛔ La regola che governa tutti questi tool
 *
 * **Ogni risposta dice per quale strada è passata.** `via: 'shell'` vuol dire
 * «l'ho fatto io»; `via: 'panel'` vuol dire «ti ho aperto la porta giusta e
 * tocchi tu». Per chi legge non sono la stessa cosa, e confonderle è il modo
 * più rapido di far credere che una cosa sia successa quando non lo è.
 *
 * Il ripiego non è un caso limite: Shizuku **non sopravvive al riavvio**, quindi
 * la strada senza privilegi è quella normale almeno una volta al giorno.
 */

/**
 * ⛔ `via` dice PER QUALE STRADA, e le strade sono quattro, non due.
 *
 * `shell` l'ho fatto io dal ponte · `panel` ti ho aperto la porta e tocchi tu ·
 * `none` non è successo niente · `native` l'ho fatto io **senza** ponte, con
 * un'API pubblica dell'app.
 *
 * `native` è nato il 2026-08-10 con l'elenco delle app: passa dal
 * `PackageManager` con le `<queries>` del manifest, quindi non vuole nessun
 * privilegio. Chiamarlo `shell` avrebbe detto una cosa falsa proprio nel campo
 * che esiste per non dire cose false.
 */
interface Esito { done: boolean, via: 'shell' | 'native' | 'panel' | 'none', output?: string, reason?: string }

export interface TalosPrivilegedToolSources {
    wifi(on: boolean): Promise<Esito>
    bluetooth(on: boolean): Promise<Esito>
    doNotDisturb(mode: string): Promise<Esito>
    airplane(on: boolean): Promise<Esito>
    powerSaving(on: boolean): Promise<Esito>
    systemSetting(name: string, value?: string): Promise<Esito & { value?: string }>
    appUsage(days: number): Promise<Esito>
    listApps(): Promise<Esito>
    ready(): Promise<boolean>
    reasonOf(reason: string | undefined): string
}

function esitoDi(sources: TalosPrivilegedToolSources, r: Esito, fatto: string) {
    // `shell` e `native` dicono la STESSA cosa a chi legge — «l'ho fatto io» —
    // e si distinguono solo su come. È `panel` che è un'altra cosa.
    if (r.done && (r.via === 'shell' || r.via === 'native')) return { ok: true, content: fatto }
    if (r.done && r.via === 'panel') {
        /*
         * ⛔ `ok: true` ma il testo non dice «fatto»: la porta è aperta e la
         * cosa NON è ancora successa. Un modello che leggesse «fatto» lo
         * riferirebbe come concluso, e la persona si fiderebbe di un
         * interruttore che nessuno ha toccato.
         */
        /*
         * ⛔ E col MOTIVO per cui non è stato fatto da noi.
         *
         * Misurato sul Pad il 2026-08-08: chiesto «spegni il wifi», TALOS ha
         * aperto il pannello e l'ha detto onestamente — ma alla domanda
         * «perché?» ha risposto di non avere nessun risultato grezzo da
         * mostrare. Il motivo esisteva (Shizuku non ci ha autorizzati) e si era
         * perso qui: il ramo del pannello buttava via `reason`.
         *
         * Non è un dettaglio da diagnostica. «Ti ho aperto il pannello» lascia
         * la persona a stringersi nelle spalle; «ti ho aperto il pannello
         * perché Shizuku non mi ha ancora autorizzato — te la apro?» le dice la
         * mossa successiva. Un ripiego senza la sua causa è un vicolo cieco con
         * l'aria di un servizio.
         */
        const perche = r.reason ? ` The privileged path was not available: ${sources.reasonOf(r.reason)}` : ''
        return { ok: true, content: `${fatto} — but it is NOT done yet: the phone panel is open and the user must tap the switch. Say exactly that.${perche}` }
    }
    return {
        ok: false,
        content: sources.reasonOf(r.reason),
        code: `TALOS_PRIVILEGE_${(r.reason ?? 'failed').toUpperCase().replace(/-/g, '_')}`,
    }
}

export function createTalosPrivilegedTools(
    sources: TalosPrivilegedToolSources,
): TalosToolDefinition<never>[] {
    return [
        defineTalosTool({
            name: 'device_wifi',
            action: 'write',
            title: 'Turn Wi-Fi on or off',
            description: [
                'Turn the phone Wi-Fi on or off. If TALOS cannot do it directly it opens the',
                'phone panel over this screen, and then the user taps the switch — say so',
                'clearly when that happens, because nothing has changed yet.',
            ].join(' '),
            input: z.object({ on: z.boolean() }),
            async run(input) {
                const r = await sources.wifi(input.on)
                return esitoDi(sources, r, input.on ? 'Wi-Fi on.' : 'Wi-Fi off.')
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'device_bluetooth',
            action: 'write',
            title: 'Turn Bluetooth on or off',
            description: 'Turn the phone Bluetooth on or off. Send on:false to turn it off.',
            input: z.object({ on: z.boolean() }),
            async run(input) {
                const r = await sources.bluetooth(input.on)
                return esitoDi(sources, r, input.on ? 'Bluetooth on.' : 'Bluetooth off.')
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'device_airplane',
            action: 'write',
            title: 'Turn airplane mode on or off',
            description: [
                'Turn airplane mode on or off.',
                'IMPORTANT: turning it ON cuts the phone off the network, which also cuts',
                'the privileged bridge TALOS uses. The switch itself works, but after that',
                'anything needing the bridge will report it is not connected — say this',
                'before doing it, and do not promise to turn it back off yourself.',
            ].join(' '),
            input: z.object({ on: z.boolean() }),
            async run(input) {
                const r = await sources.airplane(input.on)
                return esitoDi(sources, r, input.on ? 'Airplane mode on.' : 'Airplane mode off.')
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'device_power_saving',
            action: 'write',
            title: 'Turn battery saver on or off',
            description: 'Turn the phone battery saver on or off. Send on:false to turn it off.',
            input: z.object({ on: z.boolean() }),
            async run(input) {
                const r = await sources.powerSaving(input.on)
                return esitoDi(sources, r, input.on ? 'Battery saver on.' : 'Battery saver off.')
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'device_do_not_disturb',
            action: 'write',
            title: 'Set Do Not Disturb',
            description: [
                'Silence the phone, or let it ring again. off = everything through,',
                'priority = only what the user marked important, none = total silence,',
                'alarms = alarms only. Prefer priority over none: total silence hides',
                'alarms and calls the user may be waiting for.',
            ].join(' '),
            input: z.object({ mode: z.enum(['off', 'priority', 'none', 'alarms']) }),
            async run(input) {
                const r = await sources.doNotDisturb(input.mode)
                return esitoDi(sources, r, input.mode === 'off'
                    ? 'The phone can ring again.'
                    : `Do Not Disturb set to ${input.mode}.`)
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'device_system_setting',
            action: 'write',
            /*
             * ⛔ Anche `read`: senza valore questo tool LEGGE. Chi ha chiuso la
             * lettura dev'essere fermato anche qui, non solo sui documenti.
             */
            requiredActions: ['read'],
            title: 'Read or change a phone setting',
            description: [
                'Read a phone setting, or change it. Send value to change it, leave it out',
                'to read. brightness is 0-255, screen_timeout is in seconds, auto_rotate is',
                '0 or 1. Nothing else is accepted.',
            ].join(' '),
            input: z.object({
                setting: z.enum(['brightness', 'screen_timeout', 'auto_rotate']),
                value: z.string().optional(),
            }),
            async run(input) {
                const r = await sources.systemSetting(input.setting, input.value)
                return esitoDi(sources, r, input.value === undefined
                    ? `${input.setting} is ${r.value ?? r.output ?? 'unknown'}.`
                    : `${input.setting} set to ${input.value}.`)
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'device_app_usage',
            action: 'read',
            title: 'How the phone has been used',
            description: [
                'Which apps the user has been on, and for how long, over the last few days.',
                'Use it when they ask about their own habits or screen time.',
            ].join(' '),
            input: z.object({ days: z.number().int().min(1).max(30).optional() }),
            async run(input) {
                const r = await sources.appUsage(input.days ?? 7)
                return esitoDi(sources, r, r.output ?? 'No usage data.')
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'device_list_apps',
            action: 'read',
            title: 'Which apps are on this phone',
            /*
             * ⛔ Questa descrizione PROMETTEVA già «the name the user sees», e
             * la sorgente restituiva solo pacchetti: una promessa al modello
             * che i dati non mantenevano. Misurato il 2026-08-10 —
             * `org.thunderdog.challegram` è Telegram X, e due provider su tre
             * hanno risposto che Telegram non era installato. Ora è vera, e la
             * riga dice il FORMATO perché il modello sappia cosa passare a
             * `device_open_app`.
             */
            description: [
                'List the apps installed on this phone. One app per line, as',
                '"Visible name<TAB>package.name" — pass the PACKAGE to device_open_app.',
                '⛔ Use this BEFORE device_open_app instead of guessing a package name:',
                'many packages do not resemble the app (Telegram X is org.thunderdog.challegram),',
                'and guessing is how you open the wrong app, or tell the user an installed app',
                'does not exist. `search` matches the visible name too, so search what the',
                'user actually said.',
            ].join(' '),
            input: z.object({ search: z.string().max(60).optional() }),
            async run(input) {
                const r = await sources.listApps()
                if (!r.done) return esitoDi(sources, r, '')
                const righe = (r.output ?? '').split('\n').filter(Boolean)
                const cercato = input.search?.trim().toLowerCase()
                const scelte = cercato
                    ? righe.filter((riga) => riga.toLowerCase().includes(cercato))
                    : righe
                return {
                    ok: true,
                    content: scelte.length
                        ? scelte.join('\n')
                        : `No app matches "${input.search}". There are ${righe.length} apps installed; ask to see them all.`,
                }
            },
        }) as TalosToolDefinition<never>,
    ]
}
