/*
 * ⛔⛔ 04/11/2026 — DECISIONE 155 DELL'OWNER (con 157 e 161): IN ACCESSO PIENO NIENTE OSTACOLA IL FLUSSO, COME CLAUDE CODE
 *   `bypassPermissions` (code.claude.com/docs/en/permission-modes, letta il 04/11: «Protected paths… Allowed»; i percorsi critici e le
 *   regole «ask» chiedono sempre). Brief: in-corso/BRIEF-ACCESSO-PIENO-155-NUCLEO-2026-11-04.md, con l'aggiornamento delle 17:02.
 *
 * Restano carte in Accesso pieno, e solo queste: la cancellazione di un posto critico (radice, primo livello, casa, progetto e madri,
 * radici del telefono), le regole «chiedi» della persona, la LETTURA delle credenziali di casa (161) e la ricerca che spende (158).
 * Ogni altra modalità resta com'era: per ogni caso c'è la prova al contrario.
 *
 * Ambiente: casa FINTA (USERPROFILE e HOME), cartelle temporanee vere, nessuna chiave, nessun dato dell'owner.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import * as politica from '../src/path-policy.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { talosLavora, verificaPermessoScrittura, SEGNI_DI_CARTA_FORZATA, FRASI_DI_PERMESSO } from '../src/kernel/talosHarness.mjs';
import { bloccoDelPavimento } from '../src/kernel/pavimento-comandi.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

/* sulla base senza la cura il modulo non c'è: la prova rossa deve fallire sulle asserzioni, non sull'import */
const critiche = await import('../src/kernel/cancellazioni-critiche.mjs').catch(() => ({}));
const cancellazioneCritica = critiche.cancellazioneCritica ?? (() => null);
const dimenticaPercorsiVeri = critiche.dimenticaPercorsiVeri ?? (() => {});

const { ePercorsoDiControllo, motivoDaChiedere, credenzialeDellaCasaLetta } = politica;
const WINDOWS = process.platform === 'win32';

const radice = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-155-')));
const casa = join(radice, 'casa');
mkdirSync(join(casa, '.ssh'), { recursive: true });
writeFileSync(join(casa, '.ssh', 'id_ed25519'), 'finta\n');
mkdirSync(join(casa, '.talos-biglietti'), { recursive: true });
writeFileSync(join(casa, '.talos-biglietti', '4174.chiave'), 'finta\n');
const prima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
process.env.USERPROFILE = casa;
process.env.HOME = casa;
assert.equal(homedir(), casa, 'premessa: la casa è quella finta');
test.after(async () => {
  for (const [k, v] of Object.entries(prima)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  await rimuoviCartellaDiProvaAttesa(radice);
});

let contatore = 0;
function progetto() {
  contatore += 1;
  const cartella = join(radice, 'lavoro', `p${contatore}`);
  mkdirSync(cartella, { recursive: true });
  return cartella;
}

/* ───────────── il percorso intero: registro vero, kernel vero, `scrivi` vero, la persona dice sempre NO ───────────── */

async function giro(cartella, percorsi, permessiScelto) {
  let input = null;
  const registro = createSessionRegistry({
    guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: null, task: { id: 'task-155', consegna: 'prova' } }),
    caricaHooksFn: async () => ({ hooks: [] }),
    avviaSessioneFn: (i) => { input = i; i.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); return new Promise(() => {}); },
  });
  const { sessionId } = registro.avvia('task-155', { permessiScelto });
  const carte = [];
  registro.iscriviti(sessionId, (e) => {
    if (e.type !== 'ApprovalRequested') return;
    carte.push(e);
    registro.rispondiApprovazione(sessionId, e.requestId, false);
  });
  const chiamate = percorsi.map((percorso, i) => ({ id: `c${i}`, type: 'function', function: { name: 'scrivi', arguments: JSON.stringify({ percorso, contenuto: 'x' }) } }));
  const risposte = [{ role: 'assistant', content: null, tool_calls: chiamate }, { role: 'assistant', content: 'fatto', tool_calls: [] }];
  let indice = 0;
  const fetchDiRete = async () => {
    const scelta = risposte[Math.min(indice++, risposte.length - 1)];
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' };
  };
  await talosLavora({
    cartella, task: { consegna: 'prova' }, modello: 'x', chiave: 'y', fetchDiRete,
    livelloAccesso: input.livelloAccesso, permessiPerAttrezzo: input.permessiPerAttrezzo, chiediApprovazioneFn: input.chiediApprovazioneFn, hookFn: input.hookFn,
  });
  return { livello: input.livelloAccesso, carte, scritti: new Map(percorsi.map((p) => [p, existsSync(join(cartella, p.replace(/::\$DATA$/u, '')))])) };
}

const DI_CONTROLLO = ['CLAUDE.md', 'AGENTS.md', 'sotto/CLAUDE.md', '.claude/settings.json', '.claude/hooks/gancio.mjs', '.talos/mcp.json',
  '.harness-ui-hooks.json', '.harness-ui-mcp.json', '.harness-ui-skills/x/SKILL.md', 'skills/x/SKILL.md', '.memory-store/x.json'];
const DI_GIT = ['.git/hooks/pre-commit', '.git/config', '.git/info/exclude'];
const SEGRETI_DEL_PROGETTO = ['.env', '.env.local'];

test('155 ROSSA→VERDE — in Accesso pieno nessuna carta per file di controllo, `.git` e segreti del progetto: tutto scritto', async () => {
  const cartella = progetto();
  mkdirSync(join(cartella, '.git', 'hooks'), { recursive: true });
  const tutti = [...DI_CONTROLLO, ...DI_GIT, ...SEGRETI_DEL_PROGETTO];
  const esito = await giro(cartella, tutti, 'Full access');
  assert.equal(esito.livello, 'accesso-pieno');
  assert.deepEqual(esito.carte.map((c) => c.azione?.percorso), [], 'nessuna carta');
  for (const p of tutti) assert.equal(esito.scritti.get(p), true, `${p} scritto`);
});

for (const [permessiScelto, scrive] of [['On request', true], ['Workspace write', true], ['Read only', false], ['Research', false]]) {
  test(`155 AL CONTRARIO — «${permessiScelto}» resta com'era: i file di controllo non si scrivono col no${scrive ? ', e la carta dei file di controllo c\'è' : ''}`, async () => {
    const cartella = progetto();
    const esito = await giro(cartella, DI_CONTROLLO, permessiScelto);
    for (const p of DI_CONTROLLO) assert.equal(esito.scritti.get(p), false, `${p} non scritto`);
    if (scrive) {
      const diControllo = new Set(esito.carte.filter((c) => c.azione?.fileDiControllo === true).map((c) => c.azione.percorso));
      for (const p of DI_CONTROLLO) assert.ok(diControllo.has(p), `${p}: carta dei file di controllo`);
    }
  });
}

/* ───────────── R1: il nome dello stream NTFS (`::$DATA`) non aggira più il controllo fuori dall'Accesso pieno ───────────── */

test('R1 ROSSA→VERDE — `CLAUDE.md::$DATA` e le sue grafie sono il file di controllo (confronto su Windows)', () => {
  const cartella = progetto();
  const w = { piattaforma: 'win32' };
  const casi = ['CLAUDE.md::$DATA', 'CLAUDE.md:$DATA', 'claude.MD::$data', 'CLAUDE.md:nascosto', 'CLAUDE.md:nascosto:$DATA', '.harness-ui-hooks.json::$DATA',
    '.claude::$INDEX_ALLOCATION/settings.json', '.claude:$I30:$INDEX_ALLOCATION/settings.json', 'sotto\\AGENTS.md::$DATA', '.talos:x/mcp.json',
    join(cartella, 'CLAUDE.md::$DATA')];
  if (WINDOWS) casi.push(`\\\\?\\${join(cartella, 'CLAUDE.md::$DATA')}`);
  for (const percorso of casi) assert.equal(ePercorsoDiControllo(cartella, percorso, w), true, percorso);
  /* AL CONTRARIO: un file del progetto col suo stream resta del progetto; la lettera del disco non è uno stream */
  for (const percorso of ['src/a.js::$DATA', 'README.md:Zone.Identifier', join(cartella, 'src', 'b.js')]) assert.equal(ePercorsoDiControllo(cartella, percorso, w), false, percorso);
});

test('R1 PERCORSO INTERO — «Workspace write», `scrivi CLAUDE.md::$DATA`: la carta c\'è e col no il file non compare', { skip: !WINDOWS && 'NTFS solo su Windows' }, async () => {
  const cartella = progetto();
  const esito = await giro(cartella, ['CLAUDE.md::$DATA', '.harness-ui-hooks.json::$DATA'], 'Workspace write');
  assert.equal(esito.carte.filter((c) => c.azione?.fileDiControllo === true).length, 2);
  assert.equal(existsSync(join(cartella, 'CLAUDE.md')), false);
  assert.equal(existsSync(join(cartella, '.harness-ui-hooks.json')), false);
});

test('`.harness-ui-skills` è controllo fuori dall\'Accesso pieno, come `.talos/skills`', () => {
  const cartella = progetto();
  assert.equal(ePercorsoDiControllo(cartella, '.harness-ui-skills/x/SKILL.md'), true);
  assert.equal(ePercorsoDiControllo(cartella, 'sotto/.harness-ui-skills/x.md'), true);
  assert.equal(ePercorsoDiControllo(cartella, 'harness-ui-skills/x.md'), false, 'AL CONTRARIO: senza il punto è una cartella qualunque');
});

/* ───────────── la guardia dei biglietti in Accesso pieno: le credenziali di casa sì (161), il resto no ───────────── */

const BIGLIETTI = 'node harness-ui/scripts/biglietto-talos.mjs --apri';
const COMPLESSO = 'bash -c '.repeat(20) + 'ls';
const CON_CHIAVE = 'grep -rn fuoriDalProgetto.chiave src';
const UNA_CHIAVE = 'cat 4174.chiave';
const SSH = 'cat ~/.ssh/id_ed25519';
const CHIAVE_DI_CASA = 'cat ~/.talos-biglietti/4174.chiave';

async function davanti(azione, { livelloAccesso = 'accesso-pieno', permessiPerAttrezzo, cartella = progetto() } = {}) {
  const carte = [];
  const esito = await verificaPermessoScrittura(azione, {
    livelloAccesso, cartella, consensiSessione: {}, ...(permessiPerAttrezzo ? { permessiPerAttrezzo } : {}),
    chiediApprovazioneFn: async (a) => { carte.push(a); return true; },
  });
  return { esito, carte };
}

test('155 ROSSA→VERDE — in Accesso pieno la guardia dei biglietti non fa carte: comando, «troppo complesso», parole con `.chiave`', async () => {
  for (const comando of [BIGLIETTI, COMPLESSO, CON_CHIAVE, UNA_CHIAVE, 'node harness-ui/scripts/b*.mjs --apri', "cat <<'X' | bash\n" + 'bash -c "x" '.repeat(40) + '\nX']) {
    const { esito, carte } = await davanti({ tipo: 'shell', comando });
    assert.equal(carte.length, 0, `nessuna carta: ${comando.slice(0, 60)}`);
    assert.equal(esito.consentito, true);
  }
});

test('161 — in Accesso pieno LEGGERE una credenziale di casa fa ancora la carta (shell e `leggi`), anche se la nomina insieme ai biglietti', async () => {
  for (const azione of [{ tipo: 'shell', comando: SSH }, { tipo: 'leggi', percorso: join(casa, '.ssh', 'id_ed25519') }, { tipo: 'shell', comando: CHIAVE_DI_CASA },
    { tipo: 'shell', comando: `${BIGLIETTI} && ${SSH}` }]) {
    const { carte } = await davanti(azione);
    assert.equal(carte.length, 1, JSON.stringify(azione));
    assert.equal(carte[0].segreto?.credenzialeDellaCasa, true);
    /* la chiave dei biglietti letta dice che cosa apre (la frase dei biglietti); una credenziale letta INSIEME al comando dei biglietti dice la credenziale */
    if (azione.comando === CHIAVE_DI_CASA) assert.equal(carte[0].segreto?.fraseChiave, 'server.approval.command.signInLink');
    else assert.notEqual(carte[0].segreto?.perche, 'biglietti', 'la carta dice la credenziale, non i biglietti');
  }
  assert.equal(credenzialeDellaCasaLetta({ tipo: 'shell', comando: BIGLIETTI, cartella: progetto(), home: casa }), null, 'la funzione stessa: niente biglietti');
});

test('161 — la cartella delle chiavi dei biglietti è una credenziale di casa: in Accesso pieno ogni sua grafia della shell chiede (glob, classi, nome corto 8.3)', async () => {
  for (const comando of ['cat ~/.talos-b*/4174.chiave', 'cat ~/.talos-bigliett[i]/4174.chiave', 'tar cf x.tar ~/.talos-b*', 'cat ~/TALOS-~1/4174~1.CHI', 'cat ~/.t*/4174.c*']) {
    const { carte } = await davanti({ tipo: 'shell', comando });
    assert.equal(carte.length, 1, comando);
    assert.equal(carte[0].segreto?.credenzialeDellaCasa, true, comando);
  }
  /* AL CONTRARIO: il nome del comando scritto con le stesse forme, e la chiave nominata da sola, no */
  for (const comando of ['node harness-ui/scripts/[b]iglietto-talos.mjs', 'node harness-ui/scripts/BIGLIE~1.MJS', 'cat 4174.chiav[e]', 'type 4174~1.CHI']) {
    assert.equal((await davanti({ tipo: 'shell', comando })).carte.length, 0, comando);
  }
});

test('155 AL CONTRARIO — fuori dall\'Accesso pieno la guardia dei biglietti chiede come prima (S2, S5, S6), anche con «shell: sempre»', async () => {
  for (const livelloAccesso of ['su-richiesta', 'scrittura-progetto', 'scrittura-area']) {
    for (const comando of [BIGLIETTI, COMPLESSO, UNA_CHIAVE]) {
      const { carte } = await davanti({ tipo: 'shell', comando }, { livelloAccesso, permessiPerAttrezzo: { shell: 'sempre' } });
      assert.equal(carte.length, 1, `${livelloAccesso}: ${comando.slice(0, 40)}`);
      assert.equal(carte[0].segreto?.percorso, 'biglietto-talos');
    }
    const { carte } = await davanti({ tipo: 'shell', comando: CON_CHIAVE }, { livelloAccesso, permessiPerAttrezzo: { shell: 'sempre' } });
    assert.equal(carte.length, 0, `S5 resta: ${livelloAccesso}`);
  }
});

/* ───────────── R4 (S6): un heredoc «finto» o mandato a una shell non toglie più il tetto «troppo complesso» ───────────── */

test('R4 ROSSA→VERDE — fuori dall\'Accesso pieno, `cat <<X | bash` e un `<<` nel commento non nascondono il corpo', () => {
  const cartella = progetto();
  const chiede = (comando) => motivoDaChiedere({ tipo: 'shell', comando, cartella, home: casa });
  const quaranta = 'bash -c "x" '.repeat(40);
  for (const comando of [`cat <<'X' | bash\n${quaranta}\nX`, `cat <<X | sudo sh -s\n${quaranta}\nX`, `cat <<'X' | tee a | bash\n${quaranta}\nX`,
    `# <<'X'\n${quaranta}\nX`, `echo "<<X"\n${quaranta}\nX`, `echo '<<X'\n${quaranta}\nX`, "cat <<'X' | bash\ncat ~/.talos-biglietti/4174.chiave\nX"]) {
    assert.ok(chiede(comando), `chiede: ${JSON.stringify(comando.slice(0, 40))}`);
  }
  /* AL CONTRARIO (S6 resta): un heredoc vero, fra virgolette, che non va a una shell, è testo */
  for (const comando of [`cat > R.md <<'EOF'\n${'`a` '.repeat(40)}\nEOF`, `cat > R.md <<'EOF' # nota\n${quaranta}\nEOF`, `python3 - <<'EOF'\nimport os\nprint('|bash')\nEOF`]) {
    assert.equal(chiede(comando), null, `libero: ${JSON.stringify(comando.slice(0, 40))}`);
  }
});

/* ───────────── le cancellazioni critiche: la sola carta nuova dell'Accesso pieno ───────────── */

test('155 (a) — `cancellazioneCritica` su Windows: radice, primo livello, casa, progetto e madri; un glob sulla radice è la radice', () => {
  dimenticaPercorsiVeri();
  const w = { cartella: 'C:\\Users\\nino\\lavoro\\progetto', home: 'C:\\Users\\nino', piattaforma: 'win32', ambiente: { ProgramFiles: 'C:\\Program Files' }, realpathFn: (p) => p };
  const casi = [
    ['Remove-Item -Recurse -Force C:\\', 'radice'], ['rd /s /q C:\\', 'radice'], ['del /s /q C:\\*', 'radice'], ['rm -rf /c/', 'radice'], ['rm -rf /mnt/c/*', 'radice'],
    ['rm -rf \\\\?\\C:\\', 'radice'], ['Remove-Item \\\\localhost\\C$\\ -Recurse', 'radice'], ['rmdir /s /q D:\\', 'radice'],
    ['Remove-Item -Recurse "C:\\Program Files"', 'primo-livello'], ['Remove-Item -Recurse $env:ProgramFiles', 'primo-livello'], ['rd /s /q %ProgramFiles%', 'primo-livello'],
    ['rm -rf C:\\Users', 'primo-livello'], ['ri C:\\Windows -Recurse', 'primo-livello'], ['rm -rf /c/Users/*', 'primo-livello'],
    ['Remove-Item -Recurse $env:USERPROFILE', 'casa'], ['rd /s /q %USERPROFILE%', 'casa'], ['rm -rf C:\\Users\\nino\\*', 'casa'], ['del /q C:/Users/NINO/', 'casa'],
    ['rm -rf .', 'progetto'], ['rm -rf ./*', 'progetto'], ['rm -rf *', 'progetto'], ['Remove-Item -Recurse -Force $PWD', 'progetto'], ['rm -rf "$(pwd)"', 'progetto'],
    ['rm -rf ..', 'sopra-il-progetto'], ['rm -rf ../..', 'casa'], ['cd x && rm -rf C:\\Users\\nino\\lavoro', 'sopra-il-progetto'],
    ['cmd /c "rd /s /q C:\\Users\\nino\\lavoro"', 'sopra-il-progetto'], ['powershell -Command "Remove-Item -Recurse C:\\Users"', 'primo-livello'],
    ['pwsh -c Remove-Item -Recurse C:\\', 'radice'], ['bash -c "rm -rf /c/Users"', 'primo-livello'], ['echo $(rm -rf /c/)', 'radice'],
    ['sudo rm -rf C:/', 'radice'], ['Remove-Item -Path a,C:\\ -Recurse', 'radice'], ['rm -rf -- C:\\Users', 'primo-livello'],
    ['rm -rf "$(mktemp -d)"', 'sostituzione'],
  ];
  for (const [comando, perche] of casi) assert.equal(cancellazioneCritica(comando, w)?.perche, perche, comando);
  /* AL CONTRARIO: il lavoro di ogni giorno non chiede */
  for (const comando of ['rm -rf node_modules', 'rm -rf dist build', 'Remove-Item -Recurse -Force .\\dist', 'rd /s /q build', 'rmdir /s /q build', 'del /q *.log',
    'rm -f "$(mktemp)"', 'rm -rf $TMPDIR_FINTO/x', 'rm -rf C:\\Users\\nino\\lavoro\\progetto\\out', 'git rm -r --cached x', 'npm run rm', 'echo "rm -rf C:\\"',
    'rm -rf C:\\Users\\nino\\Downloads\\vecchio', 'rm -rf C:\\Users\\nino\\lavoro\\altro', 'Remove-Item x -ErrorAction SilentlyContinue', 'rm -rf build > C:\\log.txt 2>&1',
    'mv C:\\Users x', 'ls C:\\', 'grep -r "rm -rf /" .', '# rm -rf C:\\']) {
    assert.equal(cancellazioneCritica(comando, w), null, comando);
  }
});

test('155 (a) — `cancellazioneCritica` sul telefono e su Linux: /, /storage, /storage/emulated, /storage/emulated/0 = /sdcard, la casa del Node, progetto e madri', () => {
  dimenticaPercorsiVeri();
  const a = { cartella: '/storage/emulated/0/Progetti/orca', home: '/data/user/0/ai.talos.dev/files/home', piattaforma: 'android', ambiente: {}, realpathFn: (p) => p };
  const casi = [
    ['rm -rf /sdcard/*', 'telefono'], ['rm -rf /sdcard', 'telefono'], ['rm -rf /storage/emulated/0/', 'telefono'], ['rm -rf /storage/self/primary/*', 'telefono'],
    ['rm -rf /storage/emulated', 'telefono'], ['rm -rf /storage', 'primo-livello'], ['rm -rf /data', 'primo-livello'], ['rm -rf /*', 'radice'],
    ['rm -rf ~', 'casa'], ['rm -rf $HOME', 'casa'], ['rm -rf /data/user/0/ai.talos.dev/files/home/', 'casa'],
    ['rm -rf .', 'progetto'], ['rm -rf /sdcard/Progetti', 'sopra-il-progetto'], ['rm -rf ../', 'sopra-il-progetto'],
  ];
  for (const [comando, perche] of casi) assert.equal(cancellazioneCritica(comando, a)?.perche, perche, comando);
  for (const comando of ['rm -rf /sdcard/Download/vecchio', 'rm -rf build', 'rm -rf /storage/emulated/0/Progetti/altro', 'rm -rf ~/tmp']) assert.equal(cancellazioneCritica(comando, a), null, comando);
});

test('155 (a) — il percorso VERO della cartella e della casa conta (giunzione), ma si calcola UNA volta: nessuna lettura del disco per comando', () => {
  dimenticaPercorsiVeri();
  let letture = 0;
  const realpathFn = (p) => { letture += 1; return p === '/sdcard/Progetti/orca' ? '/storage/emulated/0/Progetti/orca' : p; };
  const a = { cartella: '/sdcard/Progetti/orca', home: '/data/user/0/ai.talos.dev/files/home', piattaforma: 'android', ambiente: {}, realpathFn };
  assert.equal(cancellazioneCritica('rm -rf /storage/emulated/0/Progetti', a)?.perche, 'sopra-il-progetto', 'la madre scritta col percorso vero');
  for (let i = 0; i < 200; i += 1) cancellazioneCritica(`rm -rf build${i} && rm -rf /storage/emulated/0/Progetti/orca/x${i}`, a);
  assert.equal(letture, 2, 'due risoluzioni (cartella e casa), una volta sola per 201 comandi');
  assert.equal(cancellazioneCritica('npm test', { ...a, realpathFn: () => { throw new Error('nessuna lettura'); } }), null, 'senza un comando che cancella non si legge niente');
});

test('155 (a) ROSSA→VERDE — nel kernel in Accesso pieno la cancellazione critica fa UNA carta, anche con «shell: sempre»; il resto no', async () => {
  const cartella = progetto();
  const critico = WINDOWS ? 'Remove-Item -Recurse -Force C:\\Users' : 'rm -rf /home';
  for (const permessiPerAttrezzo of [undefined, { shell: 'sempre' }]) {
    const { carte } = await davanti({ tipo: 'shell', comando: critico }, { cartella, permessiPerAttrezzo });
    assert.equal(carte.length, 1, `una carta (${JSON.stringify(permessiPerAttrezzo)})`);
    assert.ok(carte[0].cancellazioneCritica, 'la carta porta il motivo');
    assert.equal(carte[0].cancellazioneCritica.fraseChiave, WINDOWS ? 'server.approval.criticalDelete.topLevel' : 'server.approval.criticalDelete.topLevel');
  }
  const progettoStesso = await davanti({ tipo: 'shell', comando: 'rm -rf .' }, { cartella });
  assert.equal(progettoStesso.carte[0]?.cancellazioneCritica?.perche, 'progetto');
  for (const comando of ['rm -rf node_modules', 'rm -rf dist', 'git clean -fdx']) assert.equal((await davanti({ tipo: 'shell', comando }, { cartella })).carte.length, 0, comando);
  assert.ok(SEGNI_DI_CARTA_FORZATA.includes('cancellazioneCritica'), 'un sì solo non la scavalca');
  for (const k of ['root', 'topLevel', 'phone', 'home', 'project', 'aboveProject', 'substitution']) assert.ok(FRASI_DI_PERMESSO[`server.approval.criticalDelete.${k}`], k);
  /* il «no» della persona ferma il comando */
  const no = await verificaPermessoScrittura({ tipo: 'shell', comando: 'rm -rf .' }, { livelloAccesso: 'accesso-pieno', cartella, consensiSessione: {}, chiediApprovazioneFn: async () => false });
  assert.equal(no.consentito, false);
  assert.equal(no.via, 'cancellazione-critica');
});

/* ⛔ Decisione 208 (owner 04/11/2026 sera) ha ROVESCIATO questa prova: prima diceva «nelle altre modalità nessuna carta nuova»; ora la
   cancellazione critica chiede in OGNI modo (prove intere in `cura-208-ogni-modo.test.mjs`). Resta qui il contrario che vale ancora:
   in ogni modo il lavoro di tutti i giorni non prende né carta nuova né segno. */
test('155 (a) / 208 — nelle altre modalità la cancellazione critica porta il segno; il resto della shell resta com\'era', async () => {
  const cartella = progetto();
  const { carte } = await davanti({ tipo: 'shell', comando: 'rm -rf .' }, { livelloAccesso: 'su-richiesta', cartella });
  assert.equal(carte.length, 1);
  assert.equal(carte[0].cancellazioneCritica?.perche, 'progetto', '208: la carta che c\'era già porta il segno');
  for (const livelloAccesso of ['scrittura-progetto']) {
    const r = await davanti({ tipo: 'shell', comando: 'rm -rf .' }, { livelloAccesso, cartella, permessiPerAttrezzo: { shell: 'sempre' } });
    assert.equal(r.carte.length, 1, `${livelloAccesso} con «sempre»: 208, una carta`);
    for (const comando of ['rm -rf node_modules', 'rm -rf dist', 'git clean -fdx']) {
      assert.equal((await davanti({ tipo: 'shell', comando }, { livelloAccesso, cartella, permessiPerAttrezzo: { shell: 'sempre' } })).carte.length, 0, `${livelloAccesso}: ${comando}`);
    }
  }
});

test('161 — il pavimento resta un RIFIUTO per «/», le cartelle di sistema e la casa (la carta non arriva nemmeno)', () => {
  for (const comando of ['rm -rf /', 'rm -rf /etc', 'rm -rf ~', 'rm -rf $HOME/']) assert.ok(bloccoDelPavimento(comando, { cartella: progetto() }), comando);
});

/* ───────────── la richiesta del Desktop delle 17:07: il nucleo rifiuta da sé prima di chiedere all'ospite (la CLI)? ───────────── */

async function giroConAttrezzi(cartella, livelloAccesso, chiamate, { rootWslFn } = {}) {
  const chieste = [];
  const risposte = [{ role: 'assistant', content: null, tool_calls: chiamate.map((c, i) => ({ id: `k${i}`, type: 'function', function: { name: c.nome, arguments: JSON.stringify(c.argomenti) } })) },
    { role: 'assistant', content: 'fatto', tool_calls: [] }];
  let indice = 0;
  const messaggi = [];
  const fetchDiRete = async (_url, init) => {
    try { messaggi.push(JSON.parse(init?.body ?? '{}').messages ?? []); } catch { /* niente */ }
    const scelta = risposte[Math.min(indice++, risposte.length - 1)];
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' };
  };
  await talosLavora({
    cartella, task: { consegna: 'prova' }, modello: 'x', chiave: 'y', fetchDiRete, livelloAccesso, consensiSessione: {},
    chiediApprovazioneFn: async (a) => { chieste.push(a); return false; }, ...(rootWslFn ? { rootWslFn } : {}),
  });
  const ultimi = messaggi.at(-1) ?? [];
  const esiti = Object.fromEntries(ultimi.filter((m) => m.role === 'tool').map((m) => [m.tool_call_id, String(m.content ?? '')]));
  return { chieste, esiti };
}

test('Desktop 17:07 — fuori dal progetto, root in WSL, rete: in Accesso pieno il nucleo NON rifiuta e non chiede; in «On request» chiede all\'ospite, non rifiuta da sé', async () => {
  const cartella = progetto();
  const fuori = join(radice, 'fuori', 'nota.txt');
  mkdirSync(join(radice, 'fuori'), { recursive: true });
  let sonde = 0;
  const rootWslFn = async () => { sonde += 1; return { distro: 'Ubuntu', utente: 'root' }; };
  const chiamate = [
    { nome: 'scrivi', argomenti: { percorso: fuori, contenuto: 'x' } },
    { nome: 'shell', argomenti: { comando: 'echo wsl-finto' } },
  ];
  const pieno = await giroConAttrezzi(cartella, 'accesso-pieno', chiamate, { rootWslFn });
  assert.deepEqual(pieno.chieste.map((c) => c.tipo), [], 'Accesso pieno: nessuna carta');
  assert.equal(existsSync(fuori), true, 'Accesso pieno: scritto fuori dal progetto');
  assert.equal(sonde, 0, 'Accesso pieno: la sonda di root in WSL non parte nemmeno');
  for (const [id, testo] of Object.entries(pieno.esiti)) assert.doesNotMatch(testo, /^REFUSED/u, `Accesso pieno: ${id}`);

  const fuori2 = join(radice, 'fuori', 'nota2.txt');
  const chiede = await giroConAttrezzi(cartella, 'su-richiesta', [{ nome: 'scrivi', argomenti: { percorso: fuori2, contenuto: 'x' } }, chiamate[1]], { rootWslFn });
  assert.deepEqual(chiede.chieste.map((c) => c.tipo), ['scrivi', 'shell'], 'On request: il nucleo chiede all\'ospite, una carta per azione');
  assert.equal(existsSync(fuori2), false, 'col no dell\'ospite niente è scritto');

  /* la rete (Windows): in Accesso pieno nessuna carta del nucleo; nelle altre modalità la carta di rete c'è, prima di aprire */
  if (WINDOWS) {
    const rete = '\\\\server-finto-155.invalid\\condivisa\\x.txt';
    const reteChiede = await giroConAttrezzi(cartella, 'su-richiesta', [{ nome: 'leggi', argomenti: { percorso: rete } }]);
    assert.ok(reteChiede.chieste.some((c) => c.percorsoDiRete), 'On request: la carta di rete, prima di aprire');
    /* `.invalid` non si risolve mai (RFC 6761): nessun computer vero riceve le credenziali */
    const retePieno = await giroConAttrezzi(cartella, 'accesso-pieno', [{ nome: 'leggi', argomenti: { percorso: rete } }]);
    assert.deepEqual(retePieno.chieste, [], 'Accesso pieno (157): nessuna carta di rete');
    assert.doesNotMatch(retePieno.esiti.k0 ?? '', /network share|no one to confirm/u, 'e nessun rifiuto di rete del nucleo');
  }
});
