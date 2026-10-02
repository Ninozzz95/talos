/*
 * ⛔⛔ Fase B «casa di esecuzione» (owner 01/10/2026: B col Node di TALOS; «anche Automatico»; il modello vede i percorsi di
 *   Linux, l'interfaccia quelli di Windows) — shell e attrezzi dei file nella STESSA casa, dal giro vero del kernel.
 *   WSL vero coi binari preparati (`npm run prepara:casa-linux`); senza, le prove si saltano e lo dicono.
 *   Il difetto che chiude (AUDITV2-F01, NAMESPACE26): ciò che la shell creava in /tmp, `leggi` lo cercava in C:\tmp.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora, ambienteSenzaCredenziali, convertiPercorsoWsl } from '../src/kernel/talosHarness.mjs'
import { creaCasaLinuxSessione } from '../src/kernel/casa-linux.mjs'
import { verificaCasaLinux } from '../src/casa-linux-binari.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'
import { wslDiPreparazione } from './aiuto/wsl-di-preparazione.mjs'

const binari = process.platform === 'win32' ? await verificaCasaLinux() : { pronta: false, motivo: 'non è Windows' }
const wsl = process.platform === 'win32' ? spawnSync('wsl.exe', ['--exec', 'sh', '-c', 'echo ok'], { encoding: 'utf8', timeout: 15_000, windowsHide: true }) : null
const vero = { skip: !binari.pronta ? `casa Linux non preparata: ${binari.motivo}` : wsl?.status === 0 ? false : 'WSL non disponibile' }

function preparazione(t) {
    const cartella = mkdtempSync(join(tmpdir(), 'talos-b2-'))
    const tmpLinux = `/tmp/talos-b2-${process.pid}-${Math.random().toString(16).slice(2, 8)}`
    const sessione = creaCasaLinuxSessione({ node: binari.node, rg: binari.rg, env: ambienteSenzaCredenziali() })
    t.after(() => {
        sessione.chiudi()
        spawnSync('wsl.exe', ['--exec', 'rm', '-rf', '--', tmpLinux, convertiPercorsoWsl(cartella)], { windowsHide: true })
        rimuoviCartellaDiProva(cartella)
    })
    return { cartella, tmpLinux, sessione }
}

async function giro({ cartella, sessione }, chiamate, extra = {}) {
    const esiti = [], ricevute = [], descrizioni = [], scritture = []
    let n = 0
    await talosLavora({
        cartella, task: { consegna: 'prova' }, modello: 'f', chiave: 'k', giriMassimi: chiamate.length + 2, livelloAccesso: 'accesso-pieno',
        ambienteComandiFn: async () => ({ dove: null, revisione: 0 }),
        casaLinuxSessione: sessione,
        fetchDiRete: async (_url, init) => {
            const corpo = JSON.parse(init.body)
            descrizioni.push(corpo.tools?.find((a) => a.function.name === 'shell')?.function.description ?? '')
            const c = chiamate[n++]
            const message = c ? { role: 'assistant', content: null, tool_calls: [{ id: `c${n}`, type: 'function', function: { name: c[0], arguments: JSON.stringify(c[1]) } }] } : { role: 'assistant', content: 'fatto' }
            return new Response(JSON.stringify({ choices: [{ message, finish_reason: c ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } })
        },
        onGiro: (e) => { if (e.tipo === 'tool-esito') esiti.push(String(e.content)); if (e.tipo === 'ricevuta') ricevute.push(e.ricevuta) },
        /* Ciò che arriva alla Review: che cosa c'era PRIMA della scrittura. */
        onScrittura: (percorso, contenuto, esisteva, contenutoPrima) => scritture.push({ percorso, contenuto, esisteva, contenutoPrima }),
        ...extra,
    })
    return { esiti, ricevute, descrizioni, scritture }
}

test('B2-01 (WSL vero): ciò che la shell crea in /tmp, `leggi` lo legge con lo STESSO percorso — e viceversa', vero, async (t) => {
    const p = preparazione(t)
    const { esiti } = await giro(p, [
        ['shell', { comando: `mkdir -p ${p.tmpLinux} && printf 'dalla shell' > ${p.tmpLinux}/a.txt` }],
        ['leggi', { percorso: `${p.tmpLinux}/a.txt` }],
        ['scrivi', { percorso: `${p.tmpLinux}/b.txt`, contenuto: 'da scrivi' }],
        ['shell', { comando: `cat ${p.tmpLinux}/b.txt` }],
        ['elenca', { percorso: p.tmpLinux }],
    ])
    assert.match(esiti[0], /^exit 0 \[sandbox: wsl2 /)
    assert.match(esiti[1], /dalla shell/)
    assert.doesNotMatch(esiti[1], /FILE_NAMESPACE_MISMATCH/, 'il rifiuto dei percorsi Linux non vale nella casa Linux')
    assert.match(esiti[2], new RegExp(`^written: ${p.tmpLinux}/b\\.txt`), 'il modello vede il SUO percorso, quello di Linux')
    assert.match(esiti[3], /da scrivi$/)
    assert.match(esiti[4], /a\.txt[\s\S]*b\.txt/, 'elenca apre una cartella che esiste solo in Linux')
})

test('B2-02 (WSL vero): la descrizione della shell dice la casa, e «Automatico» va in Linux senza sondare comando per comando', vero, async (t) => {
    const p = preparazione(t)
    const { esiti, descrizioni } = await giro(p, [['shell', { comando: 'uname -s' }], ['shell', { comando: 'talos-programma-che-linux-non-ha-b2' }]])
    assert.match(descrizioni[0], /Selected command environment: Linux \(WSL2\), Bash\. The file tools .* work in the same Linux environment: use Linux paths/)
    assert.match(esiti[0], /^exit 0 \[sandbox: wsl2 [^\n]*\]\nLinux$/)
    assert.match(esiti[1], /^exit 127 \[sandbox: wsl2 /, 'una casa sola: anche un programma che Linux non ha gira di là (e lo dice), non torna su Windows')
})

test('B2-03 (WSL vero): «leggi prima di sostituire» — nessun falso allarme dopo una lettura, e una modifica della shell lo fa scattare', vero, async (t) => {
    const p = preparazione(t)
    writeFileSync(join(p.cartella, 'nota.txt'), 'prima\n')
    const { esiti } = await giro(p, [
        ['leggi', { percorso: 'nota.txt' }],
        ['scrivi', { percorso: 'nota.txt', contenuto: 'dopo\n' }],
        ['shell', { comando: 'sleep 0.05; printf "toccato dalla shell\\n" > nota.txt' }],
        ['scrivi', { percorso: 'nota.txt', contenuto: 'ancora\n' }],
    ])
    assert.match(esiti[1], /^written: nota\.txt \(replaced an existing file/, 'letta per intero dalla stessa casa: si sostituisce')
    assert.doesNotMatch(esiti[3], /^written:/, 'cambiato fuori dalla lettura: non si sostituisce alla cieca')
})

test('B2-04 (WSL vero): nella casa Linux i collegamenti si seguono, elenca e cerca lavorano di là con l rg per Linux', vero, async (t) => {
    const p = preparazione(t)
    writeFileSync(join(p.cartella, 'vero.txt'), 'ago nel pagliaio\n')
    mkdirSync(join(p.cartella, 'sotto'))
    writeFileSync(join(p.cartella, 'sotto', 'altro.txt'), 'altro pagliaio\n')
    wslDiPreparazione(['--exec', 'ln', '-s', 'vero.txt', `${convertiPercorsoWsl(p.cartella)}/link.txt`])
    const { esiti } = await giro(p, [['leggi', { percorso: 'link.txt' }], ['elenca', {}], ['cerca', { testo: 'pagliaio' }],
        ['cerca', { testo: 'pagliaio', dentro: 'sotto' }], ['cerca', { testo: 'pagliaio', dentro: p.cartella }]])
    assert.match(esiti[0], /ago nel pagliaio/)
    assert.doesNotMatch(esiti[0], /symbolic link created by Linux/, '5a vale dal lato Windows; di qua il collegamento si legge')
    assert.match(esiti[1], /link\.txt/)
    assert.doesNotMatch(esiti[1], /symbolic link created by Linux/, 'elenca gira di là')
    assert.match(esiti[2], /vero\.txt:1:ago nel pagliaio/)
    assert.doesNotMatch(esiti[2], /symbolic link created by Linux|os error 1920/, 'cerca gira di là, con l rg per Linux')
    assert.match(esiti[3], /altro\.txt:1:altro pagliaio/, '`dentro` relativo cerca di là')
    assert.doesNotMatch(esiti[3], /vero\.txt/)
    assert.match(esiti[4], new RegExp(`^REFUSED\\. "${p.cartella.split('\\').join('\\\\')}" is not a subfolder of this workspace`), 'un assoluto si rifiuta come su Windows (T-13), con le parole del modello')
})

test('B2-07 (WSL vero): attraverso un collegamento Linux si legge E si sostituisce — disco e istantanea sono quelli della casa', vero, async (t) => {
    const p = preparazione(t)
    writeFileSync(join(p.cartella, 'vero.txt'), 'prima\n')
    wslDiPreparazione(['--exec', 'ln', '-s', 'vero.txt', `${convertiPercorsoWsl(p.cartella)}/link.txt`])
    const { esiti, scritture } = await giro(p, [
        ['leggi', { percorso: 'link.txt' }],
        ['scrivi', { percorso: 'link.txt', contenuto: 'dopo' }],
        ['scrivi', { percorso: 'link.txt', contenuto: 'coda', mode: 'append' }],
        ['file_edit', { percorso: 'link.txt', old_string: 'coda', new_string: 'fine' }],
        ['shell', { comando: 'cat vero.txt; echo; test -L link.txt && echo ancora-un-collegamento' }],
    ])
    assert.match(esiti[0], /prima/)
    assert.match(esiti[1], /^written: link\.txt \(replaced an existing file of 6 bytes\)/, 'il «prima» viene dalla casa: si sostituisce, e lo si dice')
    assert.match(esiti[2], /^appended to: link\.txt \(\+5 bytes incl\. 1 newline separator/, 'l a capo si decide guardando di là')
    assert.match(esiti[3], /^edited: link\.txt \(1 occurrence replaced/)
    assert.match(esiti[4], /\ndopo\nfine\nancora-un-collegamento$/)
    const allaReview = scritture.map((s) => [s.percorso, s.esisteva, s.contenutoPrima])
    assert.deepEqual(allaReview[0], ['link.txt', true, 'prima\n'], 'la Review sa che cosa c era prima, visto dalla casa')
    assert.deepEqual(allaReview.at(-1), ['link.txt', true, 'dopo\ncoda'], 'anche per file_edit')
})

test('B2-08 (WSL vero): «leggi prima di sostituire» nella casa — una modifica dietro un collegamento si vede, e A.txt letto non vale per a.txt', vero, async (t) => {
    const p = preparazione(t)
    writeFileSync(join(p.cartella, 'vero.txt'), 'prima\n')
    wslDiPreparazione(['--exec', 'ln', '-s', 'vero.txt', `${convertiPercorsoWsl(p.cartella)}/link.txt`])
    const { esiti } = await giro(p, [
        ['leggi', { percorso: 'link.txt' }],
        ['shell', { comando: `sleep 0.05; printf 'cambiato dalla shell\\n' > vero.txt; mkdir -p ${p.tmpLinux} && printf x > ${p.tmpLinux}/A.txt && printf y > ${p.tmpLinux}/a.txt && touch -d '2026-01-01 00:00:00' ${p.tmpLinux}/A.txt ${p.tmpLinux}/a.txt` }],
        ['scrivi', { percorso: 'link.txt', contenuto: 'sovrascritto\n' }],
        ['leggi', { percorso: `${p.tmpLinux}/A.txt` }],
        ['scrivi', { percorso: `${p.tmpLinux}/a.txt`, contenuto: 'z' }],
    ])
    assert.match(esiti[1], /^exit 0 /)
    assert.match(esiti[2], /^REFUSED\. "link\.txt" already exists \(\d+ bytes\) and it changed after you last read it/, 'la data e la misura si guardano di là, attraverso il collegamento')
    assert.match(esiti[3], /x/)
    assert.match(esiti[4], new RegExp(`^REFUSED\\. "${p.tmpLinux}/a\\.txt" already exists \\(1 bytes\\) and you have not read it in this session`), 'in Linux A.txt e a.txt sono due file')
})

test('B2-09 (WSL vero): `prova` gira nella casa anche con un programma che Linux non ha — e lo dice', vero, async (t) => {
    const p = preparazione(t)
    const { esiti } = await giro(p, [['prova', {}]], { comandoProva: 'talos-programma-che-linux-non-ha-b2 "x"' })
    assert.match(esiti[0], /^exit 127 \[sandbox: wsl2 /)
})

test('B2-05 (WSL vero): ricevute e permessi vedono la vista WINDOWS dello stesso percorso (l interfaccia mostra quella)', vero, async (t) => {
    const p = preparazione(t)
    const { ricevute } = await giro(p, [['scrivi', { percorso: `${p.tmpLinux}/r.txt`, contenuto: 'x' }], ['scrivi', { percorso: 'dentro.txt', contenuto: 'y' }]])
    assert.equal(ricevute[0].azione, 'scrivi')
    assert.equal(ricevute[0].percorso, `\\\\wsl.localhost\\Ubuntu${p.tmpLinux.split('/').join('\\')}\\r.txt`)
    assert.equal(ricevute[0].status, 'succeeded')
    assert.equal(ricevute[1].percorso, 'dentro.txt', 'un relativo resta relativo')
})

test('B2-06 (WSL vero): la scelta «Windows» spegne la casa Linux per quel giro — attrezzi dei file su Windows, come prima', vero, async (t) => {
    const p = preparazione(t)
    writeFileSync(join(p.cartella, 'w.txt'), 'su windows\n')
    const { esiti, descrizioni } = await giro(p, [['leggi', { percorso: '/tmp/qualunque' }], ['leggi', { percorso: 'w.txt' }]],
        { ambienteComandiFn: async () => ({ dove: 'windows', revisione: 0 }) })
    assert.match(esiti[0], /FILE_NAMESPACE_MISMATCH/, 'su Windows un percorso Linux resta ambiguo, come prima')
    assert.match(esiti[1], /su windows/)
    assert.match(descrizioni[0], /Windows host \(cmd\.exe\)/)
    assert.equal(p.sessione.prendi.length, 1)
})
