#!/usr/bin/env node
/**
 * La prova dell'hook che mi impedisce di fermarmi.
 *
 * Sta accanto all'hook e non nella suite di `mobile/` perché l'hook non è codice
 * dell'app: è codice dell'ambiente di lavoro, e deve poter essere provato anche
 * da chi non ha installato le dipendenze del progetto. Si lancia con
 * `node .claude/hooks/prova-non-fermarti.mjs`.
 *
 * Il primo caso è quello VERO: la frase esatta con cui mi sono fermato il
 * 2026-08-06. Se un giorno smettesse di bloccare quella, l'hook non serve più a
 * niente ed è giusto che si veda subito.
 */
import { decidiFermata } from './non-fermarti.mjs'

const casi = [
    {
        nome: 'blocca la PROMESSA del 2026-08-06 («vado su quelli»)',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Restano da innestare i quattro canali Android, il '
                + 'campanello e la notifica di background. Vado su quelli.',
        },
        blocca: true,
    },
    {
        nome: 'blocca «adesso faccio»',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Commit fatto. Adesso faccio i canali Android.',
        },
        blocca: true,
    },
    {
        nome: 'blocca un elenco di cose che restano da fare',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Tutto verde. Restano da collegare il campanello e la notifica.',
        },
        blocca: true,
    },
    {
        nome: 'blocca la frase esatta del 2026-08-06',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Ho committato. Adesso proseguo su fase 5 e poi il '
                + 'centro notifiche, salvo che tu voglia che parta prima da qualcos\'altro.',
        },
        blocca: true,
    },
    {
        nome: 'blocca «vuoi che proceda?»',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Il piano è pronto. Vuoi che proceda?',
        },
        blocca: true,
    },
    {
        nome: 'blocca «fammi sapere se»',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Fatto. Fammi sapere se preferisci un altro ordine.',
        },
        blocca: true,
    },
    {
        nome: 'LASCIA PASSARE una fermata dichiarata',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: '⛔ FERMATA: serve la tua licenza Gemma su Hugging Face '
                + 'e il token. Senza non posso proseguire. Vuoi che intanto faccia altro?',
        },
        blocca: false,
    },
    {
        nome: 'LASCIA PASSARE un resoconto senza offerte',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Fatto: 3779 test verdi, commit 4133088, provato sul tablet.',
        },
        blocca: false,
    },
    {
        nome: 'LASCIA PASSARE se ha già bloccato in questo turno',
        input: {
            stop_hook_active: true,
            stop_reason: 'end_turn',
            last_assistant_message: 'Vuoi che proceda?',
        },
        blocca: false,
    },
    {
        nome: 'LASCIA PASSARE un turno finito per max_tokens',
        input: {
            stop_hook_active: false,
            stop_reason: 'max_tokens',
            last_assistant_message: 'Vuoi che proceda?',
        },
        blocca: false,
    },
    {
        nome: 'LASCIA PASSARE una domanda citata a metà di un messaggio lungo',
        input: {
            stop_hook_active: false,
            stop_reason: 'end_turn',
            last_assistant_message: 'Mi hai scritto «vuoi che proceda?» e la risposta è sì. '
                + 'Ho quindi fatto tutto quanto segue.' + ' Dettagli.'.repeat(120),
        },
        blocca: false,
    },
]

let falliti = 0
for (const caso of casi) {
    const esito = decidiFermata(caso.input)
    const bloccato = esito !== null && esito.decision === 'block'
    const ok = bloccato === caso.blocca
    if (!ok) falliti += 1
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${caso.nome}`)
}

console.log(falliti === 0
    ? `\n${casi.length} casi, tutti passati.`
    : `\n${falliti} casi FALLITI su ${casi.length}.`)
process.exit(falliti === 0 ? 0 : 1)
