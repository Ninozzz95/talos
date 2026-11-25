/*
 * Riga 192 della 0.2.5 (decisione dell'owner del 19/11 22:26): i difetti GIÀ USCITI del lettore dei comandi, voci 1a, 1b, 1c, 2 e 3 della
 * lista del revisore 024 (LISTA-GIA-USCITI-LETTORE-2026-11-19.md). Ogni prova guarda SOLO il testo: niente si esegue, niente si cancella.
 * La funzione (`cancellazioneCritica`) e il cancello intero (`verificaPermessoScrittura`, la carta risponde no) in due modi dei permessi.
 * Rumore: i 74 comandi di tutti i giorni (gli stessi di `permessi-doppio-controllo.test.mjs`) e i «vicini» delle cure, scritti prima
 * di misurare, restano senza carta critica (tranne la carta che c'era già: `rm -rf "$TMPDIR/build"`, regola della 0.2.3).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs';
import { cancellazioneCritica } from '../src/kernel/cancellazioni-critiche.mjs';

const BS = String.fromCharCode(92);
const WINDOWS = process.platform === 'win32';
const liberi = WINDOWS ? [...'QZYXWVUTSPONMLK'].filter((l) => !existsSync(`${l}:${BS}`)) : [];
const SALTA_W = !WINDOWS || liberi.length < 2 ? 'serve Windows con due dischi liberi' : false;
const D = liberi[0] ?? 'Q';
const K = liberi[1] ?? 'K';
const SIS = {
  W: { piattaforma: 'win32', cartella: `${D}:${BS}lavori${BS}progetto`, home: `${D}:${BS}Users${BS}caio`, r: { P: `${D}:${BS}lavori${BS}progetto`, H: `${D}:${BS}Users${BS}caio`, F: `${K}:${BS}altro${BS}build`, D } },
  L: { piattaforma: 'linux', cartella: '/home/caio/lavori/progetto', home: '/home/caio', r: { P: '/home/caio/lavori/progetto', H: '/home/caio', F: '/srv/altro/build' } },
  A: { piattaforma: 'android', cartella: '/storage/emulated/0/Documents/lavori/progetto', home: '/data/user/0/ai.talos.dev/files', r: { P: '/storage/emulated/0/Documents/lavori/progetto', H: '/data/user/0/ai.talos.dev/files', F: '/storage/emulated/0/Download/build' } },
  M: { piattaforma: 'darwin', cartella: '/Users/caio/lavori/progetto', home: '/Users/caio', r: { P: '/Users/caio/lavori/progetto', H: '/Users/caio', F: '/private/var/altro/build' } },
};
const SISTEMI = SALTA_W ? ['L', 'A', 'M'] : ['W', 'L', 'A', 'M'];
const riempi = (m, s) => m.replace(/\{(P|H|F|D)\}/gu, (_, x) => SIS[s].r[x] ?? x);
const mondo = (s) => ({ cartella: SIS[s].cartella, home: SIS[s].home, piattaforma: SIS[s].piattaforma, ambiente: { HOME: SIS[s].home }, realpathFn: (p) => p });
const LIVELLI = ['accesso-pieno', 'scrittura-progetto'];
const funzione = (s, modello) => cancellazioneCritica(riempi(modello, s), mondo(s))?.perche ?? null;

/** Il cancello intero: le carte critiche chieste (la carta risponde no: niente viene eseguito). */
async function carte(s, modello, livelloAccesso) {
  const chieste = [];
  const prima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
  const descrittore = Object.getOwnPropertyDescriptor(process, 'platform');
  process.env.USERPROFILE = SIS[s].home;
  process.env.HOME = SIS[s].home;
  if (s !== 'W') Object.defineProperty(process, 'platform', { ...descrittore, value: SIS[s].piattaforma });
  try {
    await verificaPermessoScrittura({ toolCallId: 'r192', tipo: 'shell', comando: riempi(modello, s) }, { livelloAccesso, cartella: SIS[s].cartella, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' }, chiediApprovazioneFn: async (x) => { chieste.push(x); return false; } });
  } finally {
    Object.defineProperty(process, 'platform', descrittore);
    if (prima.USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prima.USERPROFILE;
    if (prima.HOME === undefined) delete process.env.HOME; else process.env.HOME = prima.HOME;
  }
  return chieste.filter((c) => c.cancellazioneCritica).map((c) => c.cancellazioneCritica.perche);
}

/** Ogni comando chiede, nella funzione e nel cancello intero, coi motivi ammessi. */
async function chiede(rossi, sistemi, ammessi) {
  for (const s of sistemi) for (const m of rossi) {
    const f = funzione(s, m);
    assert.ok(ammessi.includes(f), `${s} funzione ${JSON.stringify(m)}: ${f}`);
    for (const livello of LIVELLI) assert.deepEqual(await carte(s, m, livello), [f], `${s} ${livello} ${JSON.stringify(m)}`);
  }
}

/* ───────────── RUMORE ───────────── */

const TUTTI_I_GIORNI = [
  'node --test --test-reporter=tap harness-ui/tests/session-registry.test.mjs', 'node --test --test-reporter=tap harness-ui/tests/agent-service.test.mjs harness-ui/tests/session-registry.test.mjs',
  'mkdir -p scripts', 'which node', 'pwd && ls', 'node scripts/somma.mjs 3 4', 'ls scripts/somma.mjs', 'ls -la scripts/', 'cat scripts/somma.mjs',
  'node --test --test-reporter=tap harness-ui/frontend/tests/unit/chat-foot.test.mjs', 'git status --short', 'git log --oneline -22', 'git diff --stat HEAD~3 HEAD',
  'grep -n "troppe" src/path-policy.mjs', 'sed -n 2060,2150p src/path-policy.mjs', 'cd harness-ui && npm run test:unit', 'df -h /c', 'date', 'tasklist | grep -i node', 'head -80 README.md',
  '(npm run dev &) && rm -rf dist', '{ make & wait; } && rm -rf build/tmp', 'npm start & npx wait-on http://127.0.0.1:3000 && npm test && rm -rf coverage',
  '(cd src && npm run build) && rm -rf dist', 'bash -c "cd build && (cmake .. &) ; rm -rf CMakeFiles"', 'bash -c "cd src && (node server.js &) && sleep 2 && rm -rf .cache"',
  'bash -c "(cd {F} && make &) ; cd build && rm -rf *"', 'bash -c "{ cd build && rm -rf *; } & wait"', 'bash -c "mkdir -p tmp && (cd tmp && touch a &) && rm -rf tmp/*"',
  'bash -c "cd {F} && { npm ci & npm run lint; wait; } && rm -rf node_modules"', 'bash -c "npm run dev & sleep 3 && rm -rf .next/cache"', 'bash -c "cd {F} && (true &) && rm -rf ./*"',
  'make & tail -n 20 log', '(cd build && cmake ..)', 'npm run dev & sleep 2; curl -s http://127.0.0.1:3000', '(cd build && make) && rm -rf build/tmp',
  'python3 -m http.server 8000 & sleep 1; kill %1', '{ cd build; make; } | tee build.log', 'cd build && rm -rf CMakeFiles &', "find . -name '*.o' -print0 | xargs -0 rm -f",
  'for f in *.log; do gzip "$f" & done; wait', 'if [ -d dist ]; then rm -rf dist; fi', 'docker compose up -d & sleep 5; docker ps', 'cd src && rm -rf __pycache__ && cd .. && ls',
  'while read l; do echo "$l" & done < files.txt; wait', 'case "$1" in a) make & ;; *) true ;; esac',
  'ls -la', 'cat file.txt | grep x', 'npm test', 'git status', 'cd src && node app.js', '(cd build && make)', 'pwd; ls src', 'node server.js & sleep 1; curl -s http://127.0.0.1:8080',
  'rm -rf node_modules/.cache', 'git log --oneline | head -5', 'mkdir -p out && cd out && rm -rf *', 'sh -c "cd src && ls"', 'cd src; rm -rf tmp & wait',
  'brew install jq', 'xcode-select -p', 'swift build', 'open -a Safari index.html', 'pbcopy < README.md', 'defaults read com.apple.finder',
  'ls ~/Library/Caches', 'rm -rf ~/Library/Caches/com.example.app', 'rm -rf DerivedData', 'cd ios && pod install', 'rm -rf node_modules && npm ci',
  'mdfind -name Package.swift', 'diskutil list', 'cd build && rm -rf *', 'rm -f .DS_Store',
];
/* i vicini delle cure, scritti prima di misurare: un nome calcolato, `call`, `/v:on`, `wsl` (su Windows) */
const VICINI = [
  '$EDITOR README.md', '"$CC" -o out main.c', '$PYTHON -m pytest', '${NODE:-node} script.js', '$MAKE clean && rm -rf build', 'npm run ${SCRIPT}',
  '$EDITOR .', '$EDITOR ~/.bashrc', '"$PYTHON" -m venv .venv', '$SHELL -c "ls"', 'cd $HOME && ls', 'bin/${TOOL}-cli --version', '$DOCKER compose up -d',
  '$PAGER ~/notes.txt', 'du -sh ~', '"$JAVA_HOME/bin/java" -jar app.jar', '$CARGO build --release',
];
const VICINI_W = [
  'call %MSBUILD% app.sln /t:Clean', 'call npm install', `call "%VSINSTALLDIR%${BS}VC${BS}Auxiliary${BS}Build${BS}vcvars64.bat" && rd /s /q build`, 'set N=1&& call echo %N%',
  'cmd /v:on /c "set n=1&& echo !n!"', 'cmd /v:on /c "for %i in (a b) do @echo %i"', 'wsl ls -la', 'wsl rm -rf build', 'wsl -e rm -rf ./dist',
  'wsl bash -c "cd /tmp && rm -rf x"', 'wsl make clean', 'wsl -- rm -rf node_modules', 'wsl rm -rf ~/tmp/cache', 'wsl cat ~/.bashrc', 'rd /s /q build',
  'rmdir /s /q node_modules', 'del /q *.log', '%~dp0build.bat', 'call %~dp0clean.bat .', '%COMSPEC% /c dir', 'wsl --cd ~ ls', 'wsl -d Ubuntu -- ls ~',
];

test('RUMORE — i 74 comandi di tutti i giorni e i vicini delle cure: nessuna carta critica (funzione e cancello intero)', async () => {
  assert.equal(TUTTI_I_GIORNI.length, 74);
  for (const s of SISTEMI) for (const m of [...TUTTI_I_GIORNI, ...VICINI, ...(s === 'W' ? VICINI_W : [])]) {
    assert.equal(funzione(s, m), null, `${s} funzione ${JSON.stringify(m)}`);
    for (const livello of LIVELLI) assert.deepEqual(await carte(s, m, livello), [], `${s} ${livello} ${JSON.stringify(m)}`);
  }
});

/* ───────────── 1a: un nome calcolato mentre gira (bash, PowerShell) ───────────── */

test('1a — un nome con un\'espansione dal valore ignoto, accanto a un bersaglio critico, chiede «troppo complesso» (W L A M)', async () => {
  await chiede(['r${empty}m -rf ~', '$X -rf ~', 'r${empty}m -rf /', 'r$Y"m" -rf {P}', '${X} -rf {H}'], SISTEMI, ['troppo-complesso']);
  /* con una grafia `/x/…` (su Windows due letture, la seconda come il sistema) la carta arriva lo stesso */
  await chiede(['r${X}m -rf /z/tmp ~'], SISTEMI, ['troppo-complesso']);
});
test('1a — un nome il cui valore si sa si legge col valore (`r${E}m` con `E=` è `rm`): la carta di sempre', async () => {
  await chiede(['E=; r${E}m -rf ~'], SISTEMI, ['casa']);
});
test('1a — «troppo complesso» solo se nessuna lettura dà una carta più precisa; un interruttore di cmd non è un bersaglio', async () => {
  await chiede(['r${X}m -rf ~; rm -rf ~'], SISTEMI, ['casa']);
  for (const s of SISTEMI.filter((x) => x !== 'W')) assert.equal(funzione(s, '$COMSPEC /c "rd /s /q ."'), null, s);
});
test('1a — il progetto stesso chiede solo con una cancellazione ricorsiva: `$EDITOR .` no, `$X -rf .` sì', async () => {
  for (const s of SISTEMI) {
    assert.equal(funzione(s, '$EDITOR .'), null, s);
    assert.equal(funzione(s, '$X -rf .'), 'troppo-complesso', s);
  }
});

/* ───────────── 1b: `call` con `%…%` (cmd) ───────────── */

test('1b — `call` con un `%…%` nel nome: col valore dei `set` dello stesso testo la carta di sempre, ignoto «troppo complesso» (W)', { skip: SALTA_W }, async () => {
  await chiede([`set x=xrd&& call %x:~1% /s /q {D}:${BS}`, `set x=rd&& call %x% /s /q {D}:${BS}`], ['W'], ['radice']);
  await chiede([`call %Y% /s /q {D}:${BS}`, `call r%Y%d /s /q {D}:${BS}`, 'call %Y% /s /q {H}'], ['W'], ['troppo-complesso']);
});

/* ───────────── 1c: `!x!` dentro `cmd /v:on` ───────────── */

test('1c — `!x!` nel nome dentro `cmd /v:on`: col valore dei `set` la carta di sempre, ignoto «troppo complesso» (W)', { skip: SALTA_W }, async () => {
  await chiede([`cmd /v:on /c "set x=rd&& !x! /s /q {D}:${BS}"`, `cmd /v /c "set x=rd&& !x! /s /q {D}:${BS}"`], ['W'], ['radice']);
  await chiede([`cmd /v:on /c "!y! /s /q {D}:${BS}"`, 'cmd /v:on /c "r!y!d /s /q {H}"'], ['W'], ['troppo-complesso']);
});

/* ───────────── 2: il testo dopo `wsl` lo legge bash ───────────── */

test('2 — senza `-e`/`--exec` il testo dopo `wsl` si rilegge con apici e barre di bash, come `bash -c` (W)', { skip: SALTA_W }, async () => {
  await chiede([`wsl r${BS}m -rf ~`, `wsl -u root r${BS}m -rf ~`, `wsl -d Ubuntu -- r${BS}m -rf ~`], ['W'], ['casa']);
  await chiede([`wsl r${BS}m -rf /`], ['W'], ['radice']);
  /* il testo fra apici di `bash -c` resta uno solo nella rilettura (senza gli apici `cd ..` usciva dal `bash -c`: carta sbagliata) */
  await chiede(["wsl bash -c 'cd src; cd .. && rm -rf *'"], ['W'], ['progetto']);
  /* con `-e` il programma parte senza shell: la barra resta nel nome (nessuna lettura di bash in più) */
  assert.equal(funzione('W', `wsl -e r${BS}m -rf ~`), null);
});

/* ───────────── 3: U+00A0, VT e FF sul PC ───────────── */

/* nessuna fonte su come cmd tratta U+00A0 in una riga Unicode (niente si esegue per scoprirlo): la strada prudente, «troppo complesso» */
test('3 — sul PC uno spazio insecabile, VT o FF nel nome o fra le parole, accanto a un bersaglio critico, chiede «troppo complesso» (W)', { skip: SALTA_W }, async () => {
  await chiede([`rd\u00a0/s /q {D}:${BS}`, `rd\u000b/s /q {D}:${BS}`, `rd\u000c/s /q {D}:${BS}`, `rd\u00a0{D}:${BS}`, `rd /s /q\u00a0{H}`], ['W'], ['troppo-complesso']);
  assert.equal(funzione('W', 'rd\u00a0/s /q build'), null, 'senza un bersaglio critico niente carta');
  /* il carattere fra due interruttori e il bersaglio critico scritto senza: resta la carta precisa di prima (non «troppo complesso») */
  await chiede([`rd /s\u00a0/q {D}:${BS}`], ['W'], ['radice']);
});
