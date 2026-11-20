/*
 * Il cancello sulla lunghezza delle note di rilascio (lista 0.2.3, voce 108): il corpo che GitHub riceve, per PC, CLI e telefono,
 * si misura PRIMA dell'etichetta. Rosso con un file di note finto da 130.000 caratteri; verde sotto il tetto; la 0.2.3 vera è rossa.
 * Concorrenti: hermes-agent scripts/releases/entrypoint.py:175-176 (`GITHUB_BODY_LIMIT = 125_000`) e :262-270 (corpo misurato
 *   prima di prendersi la versione, e il rifiuto dice cosa fare).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AMMESSO, MARGINE, TETTO_GITHUB, corpoDellaRelease, misura, misure, modelloDelTelefono, sezioneDelTelefono } from '../scripts/cancello/lunghezza-note.mjs';
import { noteDellaRelease } from '../desktop/scripts/release-assets.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const CANCELLO = join(QUI, '..', 'scripts', 'cancello', 'lunghezza-note.mjs');
const RADICE = join(QUI, '..', '..');

function deposito(t, file, testo) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-note-tetto-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  mkdirSync(dirname(join(radice, file)), { recursive: true });
  writeFileSync(join(radice, file), testo);
  return radice;
}
const cancello = (...argomenti) => spawnSync(process.execPath, [CANCELLO, ...argomenti], { encoding: 'utf8' });
/* 130.000 caratteri di note: righe da 100, come un CHANGELOG lungo */
const lunga = (n = 130_000) => Array.from({ length: Math.ceil(n / 100) }, (_, i) => `- voce ${String(i).padStart(6, '0')} `.padEnd(99, '·')).join('\n').slice(0, n);

test('NOTE-TETTO-01 il tetto sta in un posto solo, col margine sotto quello di GitHub', () => {
  assert.equal(TETTO_GITHUB, 125_000);
  assert.ok(MARGINE > 0 && AMMESSO === TETTO_GITHUB - MARGINE);
});

test('NOTE-TETTO-02 ROSSO: PC con 130.000 caratteri di note ⇒ esce 1 prima dell etichetta, dice di quanto e cosa fare', (t) => {
  const radice = deposito(t, 'harness-ui/desktop/CHANGELOG.md', `# Changelog\n\n## desktop-v9.9.9 — 2026-11-18\n\n${lunga()}\n\n## desktop-v9.9.8\n\n- vecchia\n`);
  const r = cancello('pc', '9.9.9', '--radice', radice);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const m = /corpo (\d+) caratteri e (\d+) byte .*conta il più grande, (\d+)\).*: (\d+) di troppo/u.exec(r.stderr);
  assert.ok(m, r.stderr);
  assert.ok(Number(m[1]) > 130_000, 'il corpo del PC è la sezione PIÙ il testo fisso della release');
  assert.equal(Number(m[3]), Math.max(Number(m[1]), Number(m[2])));
  assert.equal(Number(m[4]), Number(m[3]) - AMMESSO);
  assert.match(r.stderr, /HTTP 422/u);
  assert.match(r.stderr, /riassunto/u);
  assert.match(r.stderr, /file a parte/u);
});

test('NOTE-TETTO-03 verde: PC con una sezione normale ⇒ esce 0 e dice lo spazio che resta', (t) => {
  const radice = deposito(t, 'harness-ui/desktop/CHANGELOG.md', '## desktop-v9.9.9\n\n- una cura\n');
  const r = cancello('pc', '9.9.9', '--radice', radice);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /di spazio/u);
});

test('NOTE-TETTO-04 al confine (in byte e in caratteri, un testo ASCII): il corpo del PC misurato è quello che `noteDellaRelease` scrive', async (t) => {
  const base = await corpoDellaRelease({ prodotto: 'pc', versione: '9.9.9', testoChangelog: '## desktop-v9.9.9\n\nx\n', radice: RADICE });
  const fisso = misura(base.corpo) - 1;
  const giusta = 'y'.repeat(AMMESSO - fisso);
  const sotto = deposito(t, 'harness-ui/desktop/CHANGELOG.md', `## desktop-v9.9.9\n\n${giusta}\n`);
  assert.equal(cancello('pc', '9.9.9', '--radice', sotto).status, 0, 'esattamente al tetto ammesso passa');
  const sopra = deposito(t, 'harness-ui/desktop/CHANGELOG.md', `## desktop-v9.9.9\n\n${giusta}y\n`);
  assert.equal(cancello('pc', '9.9.9', '--radice', sopra).status, 1, 'un carattere in più no');
  const r = await corpoDellaRelease({ prodotto: 'pc', versione: '9.9.9', testoChangelog: '## desktop-v9.9.9\n\nx\n', radice: RADICE });
  assert.equal(r.corpo, noteDellaRelease({ versione: '9.9.9', tag: 'desktop-v9.9.9', repository: r.corpo.match(/github\.com\/([^/#]+\/[^/#]+)#code-signing/u)[1], cambiamenti: 'x', somme: r.corpo.match(/```text\n([\s\S]*?)```/u)[1] }));
});

/* Cura piccola del blocco 0 (giudice, 19/11/2026): GitHub non dice se «125000 characters» sono caratteri o byte, e i concorrenti non sono
   d'accordo (Hermes caratteri, cua byte). Un corpo di 120.000 «à» passava, e pesa più del doppio in byte UTF-8: si tiene il più grande. */
test('NOTE-TETTO-12 ROSSO: 120.000 caratteri di «à» passano a caratteri ma non a byte UTF-8 ⇒ esce 1, e stampa i due numeri', async (t) => {
  const base = await corpoDellaRelease({ prodotto: 'pc', versione: '9.9.9', testoChangelog: '## desktop-v9.9.9\n\nx\n', radice: RADICE });
  const caratteriFissi = [...base.corpo].length - 1;
  const accenti = 'à'.repeat(AMMESSO - caratteriFissi);
  const radice = deposito(t, 'harness-ui/desktop/CHANGELOG.md', `## desktop-v9.9.9\n\n${accenti}\n`);
  const r = cancello('pc', '9.9.9', '--radice', radice);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const m = /corpo (\d+) caratteri e (\d+) byte/u.exec(r.stderr);
  assert.ok(m, r.stderr);
  assert.equal(Number(m[1]), AMMESSO, 'a caratteri è proprio al tetto ammesso');
  assert.ok(Number(m[2]) > 1.9 * AMMESSO, `in byte pesa quasi il doppio (${m[2]}; il testo fisso della release è ASCII)`);
  /* i confini rifatti in byte: «à» vale 2 byte; esattamente al tetto ammesso passa, un byte in più no */
  const byteFissi = misure(base.corpo).byte - 1;
  const resto = AMMESSO - byteFissi;
  const giusta = `${'à'.repeat(Math.floor(resto / 2))}${'y'.repeat(resto % 2)}`;
  const sotto = deposito(t, 'harness-ui/desktop/CHANGELOG.md', `## desktop-v9.9.9\n\n${giusta}\n`);
  const v = cancello('pc', '9.9.9', '--radice', sotto);
  assert.equal(v.status, 0, v.stdout + v.stderr);
  assert.match(v.stdout, new RegExp(`e ${AMMESSO} byte .*: 0 di spazio`, 'u'));
  const sopra = deposito(t, 'harness-ui/desktop/CHANGELOG.md', `## desktop-v9.9.9\n\n${giusta}y\n`);
  const s = cancello('pc', '9.9.9', '--radice', sopra);
  assert.equal(s.status, 1, 'un byte in più no');
  assert.match(s.stderr, /: 1 di troppo/u);
});

test('NOTE-TETTO-05 i caratteri si contano come li conta GitHub, mai meno: un emoji non fa passare un corpo lungo', () => {
  assert.equal(misura('abc'), 3);
  assert.deepEqual(misure('😀'), { caratteri: 2, byte: 4 }, 'due unità UTF-16, un punto di codice, quattro byte');
  assert.deepEqual(misure('è'), { caratteri: 1, byte: 2 });
  assert.equal(misura('😀'), 4, 'si tiene il più grande');
  assert.equal(misura('è'), 2);
});

test('NOTE-TETTO-06 ROSSO senza sezione, come il telefono (manifesto-android.mjs:83-84) e la CLI: una release che non dice cosa è cambiato non esce', (t) => {
  const radice = deposito(t, 'harness-ui/desktop/CHANGELOG.md', '## desktop-v9.9.8\n\n- vecchia\n');
  const r = cancello('pc', '9.9.9', '--radice', radice);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /non ha una sezione "## desktop-v9\.9\.9"/u);
  const senzaFile = deposito(t, 'altro.txt', '');
  assert.equal(cancello('pc', '9.9.9', '--radice', senzaFile).status, 1);
});

test('NOTE-TETTO-07 ROSSO telefono: 130.000 caratteri nella sezione «## mobile-vX» del CHANGELOG di radice ⇒ esce 1; il corpo è il `body:` di release.yml', (t) => {
  const radice = deposito(t, 'CHANGELOG.md', `## mobile-v9.9.9\n\n${lunga()}\n\n## mobile-v9.9.8\n\n- vecchia\n`);
  const r = cancello('telefono', '9.9.9', '--radice', radice);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const verde = deposito(t, 'CHANGELOG.md', '## mobile-v9.9.9\n\n- una cura\n');
  const v = cancello('telefono', '9.9.9', '--radice', verde);
  assert.equal(v.status, 0, v.stdout + v.stderr);
  assert.match(v.stdout, /note generate/u, 'dice che GitHub aggiunge le sue in coda');
});

test('NOTE-TETTO-08 telefono: la sezione si prende come il passo `changelog` dell APK (riga ESATTA), il modello è il `body:` vero', async () => {
  assert.equal(sezioneDelTelefono('## mobile-v1.0.0 — 2026\n- a\n', 'mobile-v1.0.0'), '', 'awk confronta la riga intera');
  assert.equal(sezioneDelTelefono('## mobile-v1.0.0\n- a\n## mobile-v0.9.9\n- b\n', 'mobile-v1.0.0'), '- a');
  const modello = modelloDelTelefono(readFileSync(join(RADICE, '.github', 'workflows', 'release.yml'), 'utf8'));
  assert.ok(modello && modello.startsWith('## What changed\n'), 'il body del passo che pubblica l APK');
  assert.match(modello, /\$\{\{ steps\.changelog\.outputs\.testo \}\}/u);
  assert.match(modello, /## Install/u);
  const r = await corpoDellaRelease({ prodotto: 'telefono', versione: '1.0.0', testoChangelog: '## mobile-v1.0.0\n- a\n', radice: RADICE });
  assert.ok(r.corpo.includes('\n- a\n') && !r.corpo.includes('${{'), 'la sezione al posto dell espressione, le altre riempite');
});

test('NOTE-TETTO-09 ROSSO CLI: 130.000 caratteri in «## talos-cli-vX» ⇒ esce 1 (regola di release-plan.mjs quando il ramo della CLI non c è)', (t) => {
  const radice = deposito(t, 'cli/CHANGELOG.md', `## talos-cli-v9.9.9 — 2026-11-18\n\n${lunga()}\n\n## talos-cli-v9.9.8\n\n- vecchia\n`);
  const r = cancello('cli', '9.9.9', '--radice', radice);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const verde = deposito(t, 'cli/CHANGELOG.md', '## talos-cli-v9.9.9\n\n- una cura\n');
  assert.equal(cancello('cli', '9.9.9', '--radice', verde).status, 0);
  const inUscita = deposito(t, 'cli/CHANGELOG.md', '## Unreleased (talos-cli-v9.9.9)\n\n- una cura\n');
  assert.equal(cancello('cli', '9.9.9', '--radice', inUscita).status, 1, '«Unreleased» non è la sezione della versione');
});

test('NOTE-TETTO-10 il CHANGELOG vero: la sezione della 0.2.3 lo avrebbe fermato, la 0.2.2 passa', () => {
  const r23 = cancello('pc', '0.2.3');
  assert.equal(r23.status, 1, r23.stdout + r23.stderr);
  assert.match(r23.stderr, /HTTP 422/u);
  assert.equal(cancello('pc', '0.2.2').status, 0);
});

test('NOTE-TETTO-11 uso sbagliato ⇒ esce 2', () => {
  assert.equal(cancello().status, 2);
  assert.equal(cancello('server', '1.0.0').status, 2);
  assert.equal(cancello('pc', 'uno').status, 2);
});
