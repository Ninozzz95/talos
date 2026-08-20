import { test } from 'node:test'
import assert from 'node:assert/strict'

import { decidiTypecheck, basenameDi } from './typecheck-vero.mjs'

const bash = (command, cwd = 'C:/Users/Antonino/Desktop/projects/AVM/mobile') =>
    ({ tool_name: 'Bash', tool_input: { command }, cwd })

const ferma = (input) => decidiTypecheck(input) !== null

test('⛔ le forme che non controllano NIENTE vengono fermate', () => {
    for (const c of [
        'npx tsc --noEmit -p tsconfig.json',
        'npx vue-tsc --noEmit -p tsconfig.json',
        'cd mobile && npx tsc --noEmit -p ./tsconfig.json',
        'npx tsc --noEmit --project tsconfig.json',
        'cd /c/Users/Antonino/Desktop/projects/AVM/mobile && npx tsc --noEmit',
    ]) {
        assert.equal(ferma(bash(c)), true, `doveva fermare: ${c}`)
    }
})

test('⭐ il comando GIUSTO passa', () => {
    for (const c of [
        'npm run typecheck',
        'cd mobile && npm run typecheck',
        'npm run build',
    ]) {
        assert.equal(ferma(bash(c)), false, `non doveva fermare: ${c}`)
    }
})

test('⛔ e i typecheck su un ALTRO progetto passano — il cancello è locale', () => {
    assert.equal(ferma(bash('npx tsc --noEmit -p tsconfig.json', 'C:/altro/progetto')), false,
        'un cancello che grida dove non serve viene spento')
})

test('⭐ un tsconfig SPECIFICO passa: quello controlla davvero', () => {
    assert.equal(ferma(bash('npx tsc --noEmit -p tsconfig.app.json')), false)
    assert.equal(ferma(bash('npx vue-tsc --noEmit -p tsconfig.node.json')), false)
})

test('il motivo dice il comando giusto — un divieto senza alternativa si aggira', () => {
    const esito = decidiTypecheck(bash('npx tsc --noEmit -p tsconfig.json'))
    assert.match(esito.hookSpecificOutput.permissionDecisionReason, /npm run typecheck/)
    assert.equal(esito.hookSpecificOutput.permissionDecision, 'deny')
})

test('gli strumenti che non lanciano comandi non lo riguardano', () => {
    assert.equal(decidiTypecheck({ tool_name: 'Edit', tool_input: { file_path: 'x.ts' } }), null)
    assert.equal(decidiTypecheck({}), null)
    assert.equal(decidiTypecheck(null), null)
})

test('⛔ un payload rotto non deve far esplodere il cancello', () => {
    assert.doesNotThrow(() => decidiTypecheck({ tool_name: 'Bash', tool_input: null }))
    assert.doesNotThrow(() => decidiTypecheck({ tool_name: 'Bash', tool_input: { command: 123 } }))
})

test('⛔⛔ il basename si taglia su TUTT\'E DUE i separatori', () => {
    // ⛔ Su Windows `process.argv[1]` usa il BACKSLASH: uno split sul solo `/`
    // restituirebbe il percorso intero, la guardia non scatterebbe mai e
    // l'hook non funzionerebbe da hook — in silenzio.
    assert.equal(basenameDi(String.raw`C:\Users\x\.claude\hooks\typecheck-vero.mjs`), 'typecheck-vero.mjs')
    assert.equal(basenameDi('/c/Users/x/.claude/hooks/typecheck-vero.mjs'), 'typecheck-vero.mjs')
    // ⛔ E il file di PROVA non va scambiato per l'hook: con `endsWith` lo era,
    // e il test restava appeso su stdin per sempre — nessun errore, solo silenzio.
    assert.notEqual(basenameDi(String.raw`C:\x\prova-typecheck-vero.mjs`), 'typecheck-vero.mjs')
    assert.equal(basenameDi(undefined), '')
})
