/*
 * Cura dei permessi per la 0.2.3 (14/11/2026, giudice v1914-v1915) — UNA VARIABILE VUOTA O IGNOTA DAVANTI A «/» O «\» È LA RADICE.
 * La sonda del mutante K01 del nono giro: con la variabile vuota `rm -rf "$VUOTA"/*` passava SENZA carta, nella lettura nuova e nella
 * 0.2.1, mentre bash lo legge come `rm -rf /*` (una variabile non messa vale la stringa vuota: GNU Bash manual, «Shell Parameter
 * Expansion»; `${VAR:?}` è la guardia che serve proprio a questo). PowerShell dà `$null` a `$env:X` che non c'è, e in una stringa
 * `"$env:X\*"` diventa `\*`, la radice del disco. Nella 0.2.2 era un limite scritto nel CHANGELOG.
 *  - VUOTA-<S>: le forme del brief danno la carta, nei due accessi, col cancello intero (W L A M).
 *  - VUOTA-AMBIENTE: la variabile c è ma vuota (`VUOTA=` nell ambiente) chiede come quella che non c è.
 *  - VUOTA-ALTRE: le forme vicine (`/..`, i tagli `${X%/}`, due variabili di fila, una cartella costruita con la variabile vuota, `cd`).
 *  - ONESTE-<S>: le forme oneste NON danno la carta: la variabile col valore, `"$HOME"/x`, un valore che non si sa (`$(mktemp -d)`,
 *    `read`, `foreach`, i valori del `for`), la variabile senza barra dopo, il valore di serie `${X:-build}`, i nomi della shell.
 *  - CONVIVENZA-*: col tetto dell espansione del decimo giro (oltre il tetto resta «troppo complesso», sotto il tetto la radice).
 * Niente viene eseguito: solo il cancello a parole, su cartelle e dischi che non esistono; la carta risponde «no». Nessuna
 * cancellazione; il bash vero non si prova.
 * Fonti (riaperte il 14/11/2026): Codex `codex-rs/shell-command/src/command_safety/is_dangerous_command.rs:141-142` (`rm -rf` è
 * pericoloso senza guardare il bersaglio) e `:285`; Codex `codex-rs/shell-command/src/bash.rs:30-31` (un albero con un errore non dà
 * il sì); Claude Code `CHANGELOG.md:3481` e `:2384` (`rm -rf "$(pwd)"`: un bersaglio scritto con un valore calcolato chiede).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import * as critiche from '../src/kernel/cancellazioni-critiche.mjs';
import { verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs';

const BS = String.fromCharCode(92);
const WINDOWS = process.platform === 'win32';
const liberi = WINDOWS ? [...'QZYXWVUTSPONMLK'].filter((l) => !existsSync(`${l}:${BS}`)) : [];
const SALTA_W = !WINDOWS || liberi.length < 1 ? 'serve Windows con una lettera di disco libera' : false;
const D = liberi[0] ?? 'Q';
const SIS = {
  W: { piattaforma: 'win32', cartella: `${D}:${BS}w${BS}progetto`, home: `${D}:${BS}Users${BS}tizio`, fuori: `${D}:${BS}dati${BS}out` },
  L: { piattaforma: 'linux', cartella: '/home/tizio/w/progetto', home: '/home/tizio', fuori: '/opt/dati/out' },
  A: { piattaforma: 'android', cartella: '/storage/emulated/0/Documents/w/progetto', home: '/data/user/0/ai.talos.dev/files', fuori: '/storage/emulated/0/Download/out' },
  M: { piattaforma: 'darwin', cartella: '/Users/tizio/w/progetto', home: '/Users/tizio', fuori: '/usr/local/dati/out' },
};
const POSIX = ['L', 'A', 'M'];
const SISTEMI = SALTA_W ? POSIX : ['W', ...POSIX];
const LIVELLI = ['accesso-pieno', 'scrittura-progetto'];
const P = critiche.__perLeProve;
const mondo = (s, ambiente = {}) => ({ cartella: SIS[s].cartella, home: SIS[s].home, piattaforma: SIS[s].piattaforma, ambiente: { HOME: SIS[s].home, ...ambiente }, realpathFn: (p) => p });

/* i nomi delle prove non devono esserci nell ambiente vero del processo (il cancello intero legge `process.env`) */
const NOMI_DI_PROVA = ['VUOTA', 'V', 'v', 'A1', 'B1', 'PIENA', 'D', 'd'];
for (const n of NOMI_DI_PROVA) delete process.env[n];

/** Il cancello intero su un sistema, nel processo principale (`process.platform` finto fuori da Windows): carte ed esito. */
async function cancello(s, comando, livelloAccesso = 'accesso-pieno', ambiente = {}) {
  const chieste = [];
  const descrittore = Object.getOwnPropertyDescriptor(process, 'platform');
  const prima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
  process.env.USERPROFILE = SIS[s].home; process.env.HOME = SIS[s].home;
  for (const [k, v] of Object.entries(ambiente)) process.env[k] = v;
  if (SIS[s].piattaforma !== process.platform) Object.defineProperty(process, 'platform', { ...descrittore, value: SIS[s].piattaforma });
  let esito = null;
  try {
    esito = await verificaPermessoScrittura({ toolCallId: 'v023', tipo: 'shell', comando }, { livelloAccesso, cartella: SIS[s].cartella, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' }, chiediApprovazioneFn: async (x) => { chieste.push(x); return false; } });
  } finally {
    Object.defineProperty(process, 'platform', descrittore);
    for (const k of Object.keys(ambiente)) delete process.env[k];
    if (prima.USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prima.USERPROFILE;
    if (prima.HOME === undefined) delete process.env.HOME; else process.env.HOME = prima.HOME;
  }
  const carte = chieste.filter((c) => c.cancellazioneCritica).map((c) => c.cancellazioneCritica);
  return { consentito: esito?.consentito ?? null, perche: carte.map((c) => c.perche), percorsi: carte.map((c) => c.percorso) };
}

/* ───────────── le forme del brief: la carta, W L A M, nei due accessi ───────────── */

const FORME_BRIEF = [
  'rm -rf "$VUOTA"/*',
  'rm -rf $VUOTA/',
  'rm -rf "${VUOTA}"/etc',
  'V=; rm -rf "$V"/*',
  `set V= & rd /s /q "%V%${BS}*"`,
  `$v = ""; Remove-Item -Recurse "$v${BS}*"`,
  `Remove-Item -Recurse "$env:VUOTA${BS}*"`,
];

for (const s of SISTEMI) {
  test(`VUOTA-${s} — le forme del brief con la variabile vuota o che non c è danno la carta col cancello intero, nei due accessi`, { skip: s === 'W' ? SALTA_W : false }, async () => {
    for (const c of FORME_BRIEF) for (const livello of LIVELLI) {
      const g = await cancello(s, c, livello);
      assert.equal(g.consentito, false, `${s} ${livello} «${c}»: consentito`);
      assert.equal(g.perche.length, 1, `${s} ${livello} «${c}»: ${JSON.stringify(g.perche)}`);
    }
  });
}

test('VUOTA-FUNZIONE — le forme del brief nella lettura nuova e nella funzione del cancello: la radice o una sua figlia (W L A M)', () => {
  for (const s of SISTEMI) for (const c of FORME_BRIEF) {
    const nuova = P.letturaNuova(c, mondo(s));
    assert.ok(nuova && ['radice', 'primo-livello'].includes(nuova.perche), `${s} «${c}» lettura nuova: ${JSON.stringify(nuova)}`);
    assert.deepEqual(critiche.cancellazioneCritica(c, mondo(s)), nuova, `${s} «${c}» funzione del cancello`);
  }
});

test('VUOTA-AMBIENTE — la variabile messa vuota nell ambiente chiede come quella che non c è (W L A M)', () => {
  for (const s of SISTEMI) for (const c of ['rm -rf "$VUOTA"/*', 'rm -rf $VUOTA/', `Remove-Item -Recurse "$env:VUOTA${BS}*"`, ...(s === 'W' ? [`rd /s /q "%VUOTA%${BS}"`] : [])]) {
    const r = critiche.cancellazioneCritica(c, mondo(s, { VUOTA: '' }));
    assert.equal(r?.perche, 'radice', `${s} «${c}»: ${JSON.stringify(r)}`);
  }
});

test('VUOTA-AMBIENTE-CONTRO-VALORE — la stessa variabile: vuota nell ambiente è la radice, col valore è il suo posto (W L A M)', () => {
  for (const s of SISTEMI) for (const c of ['rm -rf "$VUOTA"/*', `Remove-Item -Recurse -Force "$env:VUOTA${BS}*"`]) {
    assert.equal(P.letturaNuova(c, mondo(s, { VUOTA: '' }))?.perche, 'radice', `${s} «${c}» vuota`);
    assert.equal(critiche.cancellazioneCritica(c, mondo(s, { VUOTA: SIS[s].fuori })), null, `${s} «${c}» col valore`);
  }
});

test('VUOTA-ALTRE — le forme vicine: «/..», i tagli, due variabili di fila, la cartella costruita, `cd` nella radice (L A M)', () => {
  const forme = [
    'rm -rf "$VUOTA"/..', 'rm -rf "$VUOTA"/', 'rm -rf "${VUOTA%/}"/*', 'rm -rf "${VUOTA#x}"/*', 'rm -rf "${VUOTA:+x}"/*',
    'rm -rf "$A1$B1"/*', 'rm -rf "$A1${B1}"/', 'D="$VUOTA"/; rm -rf "$D"', 'cd "$VUOTA"/ && rm -rf ./*', 'bash -c \'rm -rf "$VUOTA"/*\'',
    'local d; rm -rf "$d"/*', 'declare V; rm -rf "$V"/', 'rm -rf "$TEMP"/*',
  ];
  for (const s of POSIX) for (const c of forme) {
    const r = critiche.cancellazioneCritica(c, mondo(s));
    assert.equal(r?.perche, 'radice', `${s} «${c}»: ${JSON.stringify(r)}`);
  }
});

test('VUOTA-ALTRE-W — le forme vicine di cmd e PowerShell: «!X!», `${env:X}`, `$null`, la barra rovescia e quella dritta (W)', { skip: SALTA_W }, () => {
  const forme = [
    `rd /s /q "%VUOTA%${BS}"`, `rd /s /q %VUOTA%${BS}*`, `cmd /v:on /c "rd /s /q !VUOTA!${BS}"`, `Remove-Item -Recurse "\${env:VUOTA}${BS}*"`,
    `Remove-Item -Recurse -Force "$null${BS}*"`, `Remove-Item -Recurse "$env:VUOTA/*"`, `$env:VUOTA = ""; Remove-Item -Recurse "$env:VUOTA${BS}*"`,
    'rm -rf "$VUOTA"/*', `rd /s /q "%VUOTA%${BS}Windows"`, `rd /s /q "%A1%%B1%${BS}"`, `Remove-Item -Recurse "$env:A1$env:B1${BS}*"`,
  ];
  for (const c of forme) {
    const r = critiche.cancellazioneCritica(c, mondo('W'));
    assert.ok(r && ['radice', 'primo-livello'].includes(r.perche), `«${c}»: ${JSON.stringify(r)}`);
  }
});

/* ───────────── le forme oneste: nessuna carta ───────────── */

const ONESTE = (s) => [
  'rm -rf "$PIENA"/*',
  'rm -rf "$HOME"/progetto/build',
  'rm -rf "$VUOTA"',
  'rm -rf "$VUOTA"build',
  'rm -rf "$VUOTA".cache',
  'D=$(mktemp -d); rm -rf "$D"/*',
  'for d in a b; do rm -rf "$d"/build; done',
  'while read -r d; do rm -rf "$d"/node_modules; done < elenco.txt',
  'rm -rf "${VUOTA:-build}"/*',
  'rm -rf "${VUOTA:?}"/*',
  'rm -rf $PREFIX/tmp/x',
  'D=out; rm -rf "$D"/*',
  ...(s === 'W' ? [
    `foreach ($d in $elenco) { Remove-Item -Recurse "$d${BS}bin" }`,
    `Get-ChildItem | ForEach-Object { Remove-Item -Recurse "$_${BS}obj" }`,
    `rd /s /q "%PIENA%${BS}x"`,
    `Remove-Item -Recurse "$env:PIENA${BS}*"`,
    `del /q "%TEMP%${BS}x.tmp"`,
    `Remove-Item -Recurse "$env:SystemRoot${BS}Temp${BS}x"`,
  ] : []),
];

test('VUOTA-NOMI-DI-WINDOWS — `%TEMP%` e `%SystemRoot%` non sono mai ignote su Windows, anche fuori dall ambiente; fuori da Windows sì (W L A M)', () => {
  for (const s of SISTEMI) for (const c of ['rm -rf "$TEMP"/*', `rd /s /q "%SystemRoot%${BS}*"`]) {
    const r = critiche.cancellazioneCritica(c, mondo(s));
    if (s === 'W') assert.equal(r, null, `${s} «${c}»: ${JSON.stringify(r)}`);
    else assert.equal(r?.perche, 'radice', `${s} «${c}»: ${JSON.stringify(r)}`);
  }
});

for (const s of SISTEMI) {
  test(`ONESTE-${s} — le forme oneste con le variabili non danno la carta, nei due accessi`, { skip: s === 'W' ? SALTA_W : false }, async () => {
    for (const c of ONESTE(s)) for (const livello of LIVELLI) {
      const g = await cancello(s, c, livello, { PIENA: SIS[s].fuori });
      assert.deepEqual(g.perche, [], `${s} ${livello} «${c}»: ${JSON.stringify(g)}`);
    }
  });
}

test('ONESTE-FUNZIONE — le stesse nella funzione del cancello, più i nomi che la shell mette da sé e una variabile non stringa (W L A M)', () => {
  for (const s of SISTEMI) for (const c of [...ONESTE(s), 'rm -rf "$PWD"/build', 'rm -rf "$OSTYPE"/x', 'rm -rf "$DATI"/x']) {
    assert.equal(critiche.cancellazioneCritica(c, mondo(s, { PIENA: SIS[s].fuori, DATI: ['x'] })), null, `${s} «${c}»`);
  }
});

test('ONESTE-NOMI-DELLA-SHELL — i nomi che bash, PowerShell e cmd mettono da sé non sono mai ignoti, anche senza ambiente (W L A M)', () => {
  const forme = ['rm -rf "$OSTYPE"/x', 'rm -rf "$HOSTNAME"/x', `Remove-Item -Recurse "$PSHOME${BS}x"`, `Remove-Item -Recurse "$_${BS}obj"`, 'rm -rf "$BASHPID"/x'];
  for (const s of SISTEMI) for (const c of forme) {
    assert.equal(P.letturaNuova(c, { ...mondo(s), ambiente: {} }), null, `${s} «${c}»`);
  }
});

/* ───────────── convivenza col tetto dell espansione del decimo giro ───────────── */

test('CONVIVENZA-TETTO — oltre il tetto resta «troppo complesso»; sotto il tetto la variabile vuota dopo è la radice (L)', () => {
  /* `a=x×64; b=$a×64; …`: ogni livello moltiplica per 64 (come le forme del revisore del nono giro), con un testo corto */
  const molti = (livelli) => { const p = [`a=${'x'.repeat(64)}`]; for (let i = 1; i <= livelli; i += 1) p.push(`${'abcde'[i]}=${`$${'abcde'[i - 1]}`.repeat(64)}`); return p.join('; '); };
  assert.deepEqual(P.letturaNuova(`${molti(3)}; rm -rf "$d"/x; rm -rf "$VUOTA"/*`, mondo('L')), { percorso: null, perche: 'troppo-complesso' }); // 64^4 > tetto
  assert.equal(P.letturaNuova(`${molti(2)}; rm -rf "$c"/x; rm -rf "$VUOTA"/*`, mondo('L'))?.perche, 'radice'); // 64^3 sotto il tetto
  assert.ok(P.espansi() > 64 ** 3 && P.espansi() <= P.TETTO_DELL_ESPANSIONE, `espansi ${P.espansi()}`);
});

test('CONVIVENZA-ERRORE — un ambiente che lancia mentre si guarda se la variabile è vuota dà «troppo complesso», mai null (L)', () => {
  const lancia = new Proxy({}, { ownKeys() { throw new Error('ambiente illeggibile (prova)'); } });
  assert.deepEqual(P.letturaNuova('rm -rf "$VUOTA"/*', { ...mondo('L'), ambiente: lancia }), { percorso: null, perche: 'troppo-complesso' });
  assert.deepEqual(critiche.cancellazioneCritica('rm -rf "$VUOTA"/*', { ...mondo('L'), ambiente: lancia }), { percorso: null, perche: 'troppo-complesso' });
});

test('VUOTA-TELEFONO — sul telefono la variabile vuota davanti alla memoria condivisa resta una carta del telefono (A)', () => {
  const r = critiche.cancellazioneCritica('rm -rf "$VUOTA"/storage/emulated/0', mondo('A'));
  assert.ok(r, JSON.stringify(r));
});
