#!/usr/bin/env node
/**
 * Le prove dell'hook che chiede una verifica prima di chiudere.
 *
 * ⛔ Un hook che nessuno prova è un hook che un giorno blocca tutto o non
 * blocca niente, e in entrambi i casi te ne accorgi al momento sbagliato.
 *
 * Il primo caso è quello vero del 2026-08-08: modifiche a raffica e nessun
 * comando eseguito.
 */
import { decidiVerifica, eventiDelTurno } from './verifica-prima-di-chiudere.mjs'

let falliti = 0

function prova(nome, atteso, ottenuto) {
    const bloccato = ottenuto !== null
    if (bloccato === atteso) {
        console.log(`  ok   ${nome}`)
        return
    }
    falliti += 1
    console.log(`  NO   ${nome} — atteso ${atteso ? 'BLOCCO' : 'passaggio'}, ottenuto il contrario`)
}

const chiudi = { stop_reason: 'end_turn', last_assistant_message: 'Fatto, tutto collegato.' }

// ── Il caso che l'ha fatto nascere ────────────────────────────────────────────
prova(
    'ha scritto file e non ha eseguito niente → blocca',
    true,
    decidiVerifica(chiudi, [
        { name: 'Edit', command: 'src/lib/tools/registry.ts' },
        { name: 'Write', command: 'src/lib/tools/deviceTools.ts' },
        { name: 'Read', command: 'src/lib/tools/toolset.ts' },
    ]),
)

// ── Ciò che deve passare ─────────────────────────────────────────────────────
prova(
    'ha scritto E ha fatto girare i test → passa',
    false,
    decidiVerifica(chiudi, [
        { name: 'Edit', command: 'src/x.ts' },
        { name: 'Bash', command: 'npx vitest run' },
    ]),
)

prova(
    'ha scritto E ha provato sul dispositivo → passa',
    false,
    decidiVerifica(chiudi, [
        { name: 'Write', command: 'android/app/src/main/cpp/talos_llama_jni.cpp' },
        { name: 'Bash', command: 'node scripts/device.mjs find' },
    ]),
)

prova(
    'ha scritto E ha costruito il nativo → passa',
    false,
    decidiVerifica(chiudi, [
        { name: 'Edit', command: 'x.cpp' },
        { name: 'PowerShell', command: './gradlew assembleDebug -q' },
    ]),
)

prova(
    'turno di sola conversazione → passa sempre',
    false,
    decidiVerifica(chiudi, [{ name: 'Read', command: 'src/x.ts' }, { name: 'Grep', command: '' }]),
)

prova(
    'nessuno strumento usato → passa',
    false,
    decidiVerifica(chiudi, []),
)

// ── La via d'uscita, e le guardie ────────────────────────────────────────────
prova(
    'la fermata dichiarata «⛔ NON VERIFICATO» apre la porta',
    false,
    decidiVerifica(
        { ...chiudi, last_assistant_message: '⛔ NON VERIFICATO: la build parte adesso, dura 20 minuti.' },
        [{ name: 'Edit', command: 'src/x.ts' }],
    ),
)

prova(
    'non si avvita: se ha già bloccato una volta, lascia passare',
    false,
    decidiVerifica({ ...chiudi, stop_hook_active: true }, [{ name: 'Edit', command: 'src/x.ts' }]),
)

prova(
    'un turno troncato da max_tokens non è una scelta mia → passa',
    false,
    decidiVerifica({ ...chiudi, stop_reason: 'max_tokens' }, [{ name: 'Edit', command: 'src/x.ts' }]),
)

// ⛔ La prova che il riconoscimento MORDE: un comando che sembra una verifica
// ma non lo è non deve aprire la porta.
prova(
    '`git status` NON è una verifica → blocca lo stesso',
    true,
    decidiVerifica(chiudi, [
        { name: 'Edit', command: 'src/x.ts' },
        { name: 'Bash', command: 'git status --short' },
    ]),
)

// ── La lettura del transcript ────────────────────────────────────────────────
{
    const transcript = [
        JSON.stringify({ type: 'user', message: { content: 'primo compito' } }),
        JSON.stringify({ message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'a.ts' } }] } }),
        JSON.stringify({ message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'npx vitest run' } }] } }),
        // ⛔ Un turno NUOVO dell'owner azzera il conto: le verifiche di prima
        // non coprono le modifiche di adesso.
        JSON.stringify({ type: 'user', message: { content: 'secondo compito' } }),
        JSON.stringify({ message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'b.ts' } }] } }),
    ].join('\n')

    const eventi = eventiDelTurno(transcript)
    const soloUltimo = eventi.length === 1 && eventi[0].name === 'Edit'
    if (soloUltimo) console.log('  ok   il transcript conta solo dal turno corrente')
    else { falliti += 1; console.log(`  NO   il transcript ha contato ${eventi.length} eventi invece di 1`) }

    prova('e allora il secondo compito, non verificato, blocca', true, decidiVerifica(chiudi, eventi))
}

console.log(falliti === 0 ? '\nTutte le prove passano.' : `\n${falliti} prove fallite.`)
process.exit(falliti === 0 ? 0 : 1)
