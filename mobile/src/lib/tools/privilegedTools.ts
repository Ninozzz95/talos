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

interface Esito { done: boolean, via: 'shell' | 'panel' | 'none', output?: string, reason?: string }

export interface TalosPrivilegedToolSources {
    wifi(on: boolean): Promise<Esito>
    bluetooth(on: boolean): Promise<Esito>
    doNotDisturb(mode: string): Promise<Esito>
    systemSetting(name: string, value?: string): Promise<Esito & { value?: string }>
    appUsage(days: number): Promise<Esito>
    listApps(): Promise<Esito>
    ready(): Promise<boolean>
    reasonOf(reason: string | undefined): string
}

function esitoDi(sources: TalosPrivilegedToolSources, r: Esito, fatto: string) {
    if (r.done && r.via === 'shell') return { ok: true, content: fatto }
    if (r.done && r.via === 'panel') {
        /*
         * ⛔ `ok: true` ma il testo non dice «fatto»: la porta è aperta e la
         * cosa NON è ancora successa. Un modello che leggesse «fatto» lo
         * riferirebbe come concluso, e la persona si fiderebbe di un
         * interruttore che nessuno ha toccato.
         */
        return { ok: true, content: `${fatto} — but it is NOT done yet: the phone panel is open and the user must tap the switch. Say exactly that.` }
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
            description: [
                'List the apps installed on this phone, with the name the user sees and the',
                'package name. ⛔ Use this BEFORE device_open_app instead of guessing a',
                'package name: guessing is how you open the wrong app, or nothing at all.',
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
