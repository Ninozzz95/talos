import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// 11/11/2026, round 4: PowerShell and git need no provider key — every launch here gets the runner's environment without them.
import { ambienteSenzaChiavi } from './ambiente-senza-chiavi.mjs';

// Dipendenza di electron-builder già fissata a 4.3.2 nel lock desktop.
const { load } = createRequire(import.meta.url)('js-yaml');
const testo = readFileSync(new URL('../../../.github/workflows/release.yml', import.meta.url), 'utf8');
const workflow = load(testo);
const desktop = workflow.jobs.desktop;
const passi = desktop.steps;
const run = passi.map(p => p.run || '').join('\n');
const pacchetto = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const passo = id => { const p = passi.find(p => p.id === id); assert.ok(p, `Passo mancante: ${id}`); return p; };

test('R04-PRETAG-INSTALLER — la PR prova NSIS su Windows prima del tag senza permessi di pubblicazione', () => {
  const pretag = load(readFileSync(new URL('../../../.github/workflows/desktop-pretag-installer.yml', import.meta.url), 'utf8'));
  assert.ok(pretag.on.pull_request, 'Il gate deve partire su pull_request.');
  assert.equal(pretag.on.pull_request_target, undefined);
  // 22/10/2026: più la sola lettura dell'artefatto del binding iroh e della sua attestazione (R04-BINDING-IROH).
  assert.deepEqual(pretag.permissions, { contents: 'read', actions: 'read', attestations: 'read' });
  const job = pretag.jobs['desktop-installer'];
  assert.equal(job['runs-on'], 'windows-latest');
  assert.equal(job.defaults.run.shell, 'pwsh');
  assert.equal(job.env.CSC_IDENTITY_AUTO_DISCOVERY, 'false');
  assert.equal(job.env.TALOS_R02_BUILDER_NETWORK, '1');
  const steps = job.steps;
  const setup = steps.find(p => p.uses?.startsWith('actions/setup-node@'));
  const checkout = steps.find(p => p.uses?.startsWith('actions/checkout@'));
  assert.equal(checkout.with['persist-credentials'], false);
  assert.equal(String(setup.with['node-version']), '24');
  const named = name => { const p = steps.find(item => item.name === name); assert.ok(p, name); return p; };
  const go = named('Go 1.27.1 verificato');
  assert.match(go.run, /a3911b5e0e1b1053f25ed0675f4c1c6aad1e2bfcf253df2b9be4caabd2edd95d/);
  const dist = named('costruisci NSIS e ZIP');
  const smoke = named('installa, avvia e disinstalla prima del tag');
  assert.match(dist.run, /npm --prefix harness-ui\/desktop run dist/);
  assert.match(smoke.run, /scripts\/ci-smoke\.ps1/);
  assert.ok(steps.indexOf(go) < steps.indexOf(dist));
  assert.ok(steps.indexOf(dist) < steps.indexOf(smoke));
  assert.ok(steps.find(p => p.uses?.startsWith('actions/upload-artifact@') && p.if === 'always()'));
  for (const p of steps.filter(item => item.uses)) assert.match(p.uses, /@[a-f0-9]{40}$/);
  assert.doesNotMatch(JSON.stringify(job), /gh release|gh auth|git push|pull_request_target|secrets\.|contents:\s*write/);
});

test('R04-GO-ENV-CURRENT-STEP-019 — il builder usa il Go verificato nello stesso step', () => {
  const pretag = load(readFileSync(new URL('../../../.github/workflows/desktop-pretag-installer.yml', import.meta.url), 'utf8'));
  const go = pretag.jobs['desktop-installer'].steps.find(item => item.name === 'Go 1.27.1 verificato');
  assert.ok(go);
  const build = 'npm --prefix harness-ui run build:chat-upload';
  const beforeBuild = go.run.slice(0, go.run.indexOf(build));
  assert.ok(go.run.includes(build), 'Manca la build del helper.');
  assert.match(beforeBuild, /\$env:TALOS_GO_BINARY\s*=\s*\$go/u,
    'GITHUB_ENV rende la variabile disponibile solo agli step successivi.');
  assert.match(beforeBuild, /TALOS_GO_BINARY=\$go.*\$env:GITHUB_ENV/u);
});

test('R04-SMOKE-REPORT-GATE-019 — il gate usa la ricevuta dello smoke e non un exit code nativo rimasto', () => {
  const pretag = load(readFileSync(new URL('../../../.github/workflows/desktop-pretag-installer.yml', import.meta.url), 'utf8'));
  const smoke = pretag.jobs['desktop-installer'].steps.find(item => item.name === 'installa, avvia e disinstalla prima del tag');
  assert.ok(smoke);
  assert.match(smoke.run, /scripts\/ci-smoke\.ps1/u);
  assert.match(smoke.run, /R04-ci-smoke\.json/u, 'La ricevuta del ciclo installato deve essere letta.');
  assert.match(smoke.run, /completato/u, 'Solo una ricevuta completa supera il gate.');
  assert.doesNotMatch(smoke.run, /\$LASTEXITCODE/u, 'Uno script PowerShell non azzera il codice lasciato da un nativo interno.');
});

test('CI-CHAT-UPLOAD-BUILD-019 — il server prova gli upload dopo il helper Go verificato', () => {
  const ci = load(readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8'));
  const steps = ci.jobs.desktop.steps;
  const server = steps.find(item => item.name === 'server');
  const go = steps.find(item => item.name === 'Go 1.27.1 verificato per il server');
  assert.ok(server && go, 'Manca la compilazione Go prima della suite server.');
  assert.ok(steps.indexOf(go) < steps.indexOf(server));
  assert.match(go.run, /go1\.27\.1\.windows-amd64\.zip/u);
  assert.match(go.run, /a3911b5e0e1b1053f25ed0675f4c1c6aad1e2bfcf253df2b9be4caabd2edd95d/u);
  const build = 'npm --prefix harness-ui run build:chat-upload';
  assert.ok(go.run.includes(build));
  assert.match(go.run.slice(0, go.run.indexOf(build)), /\$env:TALOS_GO_BINARY\s*=\s*\$go/u);
});

test('R04-WINDOWS — Node 24, PowerShell, cache e cancelli prima dello staging', () => {
  assert.equal(desktop['runs-on'], 'windows-latest');
  assert.equal(desktop.defaults.run.shell, 'pwsh');
  // 09/11/2026 (0.2.0, giudice v1264): tetto del job alzato 45→60 in release.yml:541 (prove tagliate a 25 min con 0 rosse).
  assert.equal(desktop['timeout-minutes'], 60);
  assert.equal(desktop.if, "startsWith(github.ref_name, 'desktop-v')");
  /* owner 27/10/2026: dalla 0.1.47 il mobile si tagga `mobile-vX.Y.Z` (release.yml, 808c25c53); `v*` resta per i tag già usciti.
     Il desktop resta solo su `desktop-v*` (la riga sopra). */
  assert.deepEqual(workflow.on.push.tags, ['v*', 'mobile-v*', 'desktop-v*']);
  const setup = passi.find(p => p.uses?.startsWith('actions/setup-node@'));
  assert.equal(String(setup.with['node-version']), '24');
  assert.equal(setup.with.cache, 'npm');
  for (const lock of ['harness-ui/package-lock.json', 'harness-ui/frontend/package-lock.json', 'harness-ui/desktop/package-lock.json']) assert.ok(setup.with['cache-dependency-path'].split(/\s+/).includes(lock));
  assert.ok(passi.find(p => p.uses?.startsWith('actions/cache@')));
  for (const gate of ['tests/*.test.mjs', 'test:kernel', 'kernel:controlla', 'test:unit', 'test:puri', 'test:guscio']) assert.ok(passo('cancelli').run.includes(gate), gate);
  for (const prefix of ['harness-ui', 'harness-ui/frontend', 'harness-ui/desktop']) assert.ok(run.includes(`npm ci --prefix ${prefix}`));
  assert.doesNotMatch(run, /ignore-scripts|continue-on-error/);
  assert.match(run, /node harness-ui\/frontend\/node_modules\/playwright\/cli\.js install chromium/);
  assert.ok(passi.indexOf(passo('cancelli')) < passi.indexOf(passo('dist')));
  assert.ok(passi.indexOf(passo('dist')) < passi.indexOf(passo('smoke')));
});

test('R04-ATTEST — permessi invariati e actions/attest v4 identico ad apk', () => {
  // 22/10/2026: `actions: read` per l'artefatto del binding iroh da un'altra corsa (R04-BINDING-IROH), nient'altro.
  assert.deepEqual(workflow.permissions, { contents: 'write', 'id-token': 'write', attestations: 'write', 'artifact-metadata': 'write', actions: 'read' });
  assert.equal(desktop.permissions, undefined);
  const attest = passi.find(p => p.uses?.startsWith('actions/attest@'));
  assert.ok(attest, 'Manca actions/attest');
  assert.equal(attest.uses, 'actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6');
  assert.ok(workflow.jobs.apk.steps.some(p => p.uses === attest.uses));
  assert.deepEqual(attest.with['subject-path'].trim().split(/\r?\n/), ['${{ steps.asset.outputs.exe }}', '${{ steps.asset.outputs.zip }}']);
  for (const p of passi.filter(p => p.uses)) assert.match(p.uses, /@[a-f0-9]{40}$/);
  assert.ok(passi.indexOf(passo('smoke')) < passi.indexOf(attest));
  assert.ok(passi.indexOf(attest) < passi.indexOf(passo('release')));
  assert.equal(attest.if, undefined);
});

test('R04-BINDING-IROH (owner 22/10/2026, «nel repo solo l’impronta») — release e prova prima del tag scaricano il binding verificato prima di costruire', () => {
  const pretag = load(readFileSync(new URL('../../../.github/workflows/desktop-pretag-installer.yml', import.meta.url), 'utf8'));
  const passiPretag = pretag.jobs['desktop-installer'].steps;
  const binding = passo('binding_iroh');
  const bindingPretag = passiPretag.find(p => p.name === binding.name);
  assert.ok(bindingPretag, 'Manca il binding iroh nella prova prima del tag');
  for (const p of [binding, bindingPretag]) {
    assert.match(p.run, /^node harness-ui\/scripts\/scarica-binding-iroh\.mjs$/m);
    assert.match(p.run, /\$LASTEXITCODE -ne 0\) \{ throw/);
    assert.deepEqual(p.env, { GH_TOKEN: '${{ github.token }}' });
    assert.equal(p.if, undefined);
  }
  assert.ok(passi.indexOf(binding) < passi.indexOf(passo('cancelli')), 'Le prove girano con lo stesso native/ del pacchetto');
  assert.ok(passiPretag.indexOf(bindingPretag) < passiPretag.findIndex(p => p.name === 'costruisci NSIS e ZIP'));
  const script = readFileSync(new URL('../scripts/prepara-pacchetto.mjs', import.meta.url), 'utf8');
  assert.match(script, /const iroh = preparaBindingIroh\(\);/);
  assert.match(readFileSync(new URL('../scripts/verifica-nativi.mjs', import.meta.url), 'utf8'), /assert\.equal\(iroh\.da, 'pacchetto'/);
});

test('R04-AIUTANTE-PC (owner 09/11/2026, strada A) — release e prova prima del tag scaricano l\'aiutante del PC verificato prima di costruire, col solo gettone del job', () => {
  const pretag = load(readFileSync(new URL('../../../.github/workflows/desktop-pretag-installer.yml', import.meta.url), 'utf8'));
  const passiPretag = pretag.jobs['desktop-installer'].steps;
  const aiutante = passo('aiutante_pc');
  const aiutantePretag = passiPretag.find(p => p.name === aiutante.name);
  assert.ok(aiutantePretag, 'Manca l\'aiutante del PC nella prova prima del tag');
  for (const p of [aiutante, aiutantePretag]) {
    assert.match(p.run, /^node harness-ui\/scripts\/scarica-aiutante-pc\.mjs$/m);
    assert.match(p.run, /\$LASTEXITCODE -ne 0\) \{ throw/);
    /* nessun segreto oltre al gettone del job (GITHUB_TOKEN): né secrets.*, né altre variabili */
    assert.deepEqual(p.env, { GH_TOKEN: '${{ github.token }}' });
    assert.doesNotMatch(JSON.stringify(p), /secrets\./u);
    assert.equal(p.if, undefined);
  }
  /* accanto al binding iroh, e prima di ciò che prepara il pacchetto (dist nella release, NSIS e ZIP prima del tag) */
  assert.equal(passi.indexOf(aiutante), passi.indexOf(passo('binding_iroh')) + 1);
  assert.ok(passi.indexOf(aiutante) < passi.indexOf(passo('cancelli')));
  assert.ok(passi.indexOf(aiutante) < passi.findIndex(p => /run dist/u.test(p.run ?? '')), 'prima del pacchetto della release');
  assert.ok(passiPretag.indexOf(aiutantePretag) < passiPretag.findIndex(p => p.name === 'costruisci NSIS e ZIP'));
  const script = readFileSync(new URL('../../scripts/scarica-aiutante-pc.mjs', import.meta.url), 'utf8');
  assert.match(script, /TALOS_AIUTANTE_PC_SORGENTE=/u);
  assert.match(script, /TALOS_AIUTANTE_PC_AVVISI=/u);
  const prepara = readFileSync(new URL('../scripts/prepara-pacchetto.mjs', import.meta.url), 'utf8');
  assert.match(prepara, /process\.env\.TALOS_AIUTANTE_PC_SORGENTE \|\|/u);
  assert.match(prepara, /process\.env\.TALOS_AIUTANTE_PC_AVVISI \|\|/u);
});

test('R04-ASSET — installer R-02, ZIP completo, SHA e note esplicite', () => {
  assert.equal(pacchetto.build.nsis.artifactName, 'TALOS-Setup-${version}.${ext}');
  assert.equal(pacchetto.build.win.artifactName, 'TALOS-${version}-win.${ext}');
  assert.equal(pacchetto.build.nsis.perMachine, false);
  // F7-2 (owner 27/09/2026, «NSIS assistito + benvenuto in app»): da un clic ad ASSISTITO; /S resta per lo smoke della CI.
  assert.equal(pacchetto.build.nsis.oneClick, false);
  /* 01/10/2026 — aggiornamento automatico: un publish GENERICO serve solo perché electron-builder scriva latest.yml; la
     pubblicazione resta nostra (`distribuisci.mjs` passa publish: 'never', e il passo release la fa con gh). */
  assert.deepEqual(pacchetto.build.publish, [{ provider: 'generic', url: 'https://github.com/Ninozzz95/talos/releases' }]);
  assert.match(passo('asset').run, /scripts\/release-assets\.mjs/);
  assert.match(passo('smoke').run, /scripts\/ci-smoke\.ps1/);
  const upload = passi.find(p => p.id === 'upload');
  assert.deepEqual(upload.with.path.trim().split(/\r?\n/), ['${{ steps.asset.outputs.exe }}', '${{ steps.asset.outputs.zip }}', '${{ steps.asset.outputs.sha }}',
    '${{ steps.asset.outputs.manifesto }}', '${{ steps.asset.outputs.firma }}', '${{ steps.asset.outputs.mappa }}']);
  assert.equal(upload.with['if-no-files-found'], 'error');
  assert.equal(upload.with['compression-level'], 0);
  assert.match(passo('release').run, /gh release create/);
  for (const arg of ['--verify-tag', '--notes-file', '$env:EXE', '$env:ZIP', '$env:SHA', '$env:MANIFESTO', '$env:FIRMA']) assert.ok(passo('release').run.includes(arg));
  assert.doesNotMatch(passo('release').run, /--generate-notes|\*\.zip/);
});

test('R04-PORTABILITA — un solo segreto (la firma degli aggiornamenti, solo nel passo asset), nessun repository fisso o codice evento nella shell', () => {
  /* 01/10/2026 — owner «Firma Ed25519 fatta da noi»: la chiave privata sta nel segreto TALOS_UPDATE_SIGN_KEY. È l'UNICO segreto
     del job, solo nell'env del passo che firma, mai in un run. */
  const segreti = JSON.stringify(desktop).match(/secrets\.[A-Za-z0-9_]+/g) ?? [];
  assert.deepEqual(segreti, ['secrets.TALOS_UPDATE_SIGN_KEY']);
  assert.equal(passo('asset').env.TALOS_UPDATE_SIGN_KEY, '${{ secrets.TALOS_UPDATE_SIGN_KEY }}');
  for (const p of passi.filter(p => p.run)) assert.doesNotMatch(p.run, /secrets\./);
  const text = JSON.stringify({ ...desktop, steps: desktop.steps.map(p => (p.id === 'asset' ? { ...p, env: undefined } : p)) });
  assert.doesNotMatch(text, /secrets\.|AVM-harness-desktop|[\\/]Users[\\/]|\/home\/|4174|azure.*sign|attest-build-provenance/i);
  assert.equal(passo('release').env.GH_TOKEN, '${{ github.token }}');
  assert.equal(passo('release').env.GH_REPO, '${{ github.repository }}');
  for (const p of passi.filter(p => p.run)) assert.doesNotMatch(p.run, /\$\{\{\s*github\./);
  assert.equal(passo('release').if, undefined);
  assert.equal(passi.find(p => p.uses?.startsWith('actions/checkout@')).with['persist-credentials'], false);
});

test('R04-LOCK-CHIAVE-VUOTA — passo PowerShell reale, output e tag divergente', { skip: process.platform !== 'win32' }, t => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-r04-workflow-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const env = { ...ambienteSenzaChiavi(process.env), GITHUB_REF_NAME: `desktop-v${pacchetto.version}`, GITHUB_OUTPUT: join(dir, 'output'), GITHUB_ENV: join(dir, 'env'), GITHUB_STEP_SUMMARY: join(dir, 'summary') };
  const esegui = ambiente => spawnSync('pwsh.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', passo('ambiente').run], { cwd: fileURLToPath(new URL('../../../', import.meta.url)), env: ambiente, encoding: 'utf8', windowsHide: true, timeout: 20000 });
  const ok = esegui(env);
  assert.equal(ok.status, 0, ok.error?.message || ok.stdout + ok.stderr);
  assert.match(readFileSync(env.GITHUB_OUTPUT, 'utf8'), new RegExp(`exe=harness-ui/desktop/dist/TALOS-Setup-${pacchetto.version.replaceAll('.', '\\.')}\\.exe`));
  assert.match(readFileSync(env.GITHUB_ENV, 'utf8'), /electron-builder\/Cache/);
  const no = esegui({ ...env, GITHUB_REF_NAME: 'desktop-v999.0.0' });
  assert.notEqual(no.status, 0);
  assert.match(no.stdout + no.stderr, /Tag e versioni/);
});

test('R04-TAG-COMMIT — il ramo CI conserva il commit esatto del tag', { skip: process.platform !== 'win32' }, t => {
  const passoTag = passo('commit_tag');
  const dir = mkdtempSync(join(tmpdir(), 'talos-r04-tag-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  /* ⛔ 10/10/2026, PR pubblica #55 (desktop 0.1.26): rosso per TEMPO, non per la logica — `spawnSync git ETIMEDOUT` sul
     `fetch --depth=1` dell'intero repo dentro la cartella temporanea, sul runner `windows-latest`, prima di arrivare al passo
     provato. Il limite copre una copia del repo grande quanto il repo, non il passo `commit_tag`: 120 s invece di 20, le
     asserzioni restano le stesse. Stesso precedente di R04-SMOKE-LIMITI (01/10). Owner: «Alzo il limite, poi tag». */
  const LIMITE_MS = 120_000;
  const git = args => {
    const r = spawnSync('git', args, { cwd: dir, env: ambienteSenzaChiavi(process.env), encoding: 'utf8', windowsHide: true, timeout: LIMITE_MS });
    assert.equal(r.status, 0, r.error?.message || r.stderr);
    return r.stdout.trim();
  };
  git(['init', '--quiet']);
  git(['fetch', '--quiet', '--depth=1', fileURLToPath(new URL('../../../', import.meta.url)), 'HEAD']);
  git(['checkout', '--quiet', '--detach', 'FETCH_HEAD']);
  git(['tag', 'desktop-v0.1.0']);
  const prima = git(['rev-parse', 'HEAD']);
  const r = spawnSync('pwsh.exe', ['-NoProfile', '-Command', passoTag.run], { cwd: dir, env: { ...ambienteSenzaChiavi(process.env), GITHUB_REF_NAME: 'desktop-v0.1.0' }, encoding: 'utf8', windowsHide: true, timeout: LIMITE_MS });
  assert.equal(r.status, 0, r.error?.message || r.stdout + r.stderr);
  assert.equal(git(['rev-parse', 'HEAD']), prima);
  assert.equal(git(['branch', '--show-current']), 'ci-desktop-release');
  assert.equal(git(['rev-parse', 'desktop-v0.1.0^{commit}']), prima);
});

/*
 * ⛔ 01/10/2026, PR pubblica #45 (desktop 0.1.20): `desktop-installer` ROSSO per tempo, non per un difetto. Misurato sul runner
 *   `windows-latest` (ricevute R04-ci-smoke dei giri della PR): installazione **116,2 s** e **113,3 s** nei due giri verdi, oltre i
 *   120 s nel rosso; per la 0.1.19 era 89 s. Il pacchetto è passato da 158,8 a 188,5 MB (Node e rg per Linux, fase B), il limite
 *   interno di `ci-smoke.ps1` era rimasto 120 s: ogni giro era un lancio di moneta, e lo stesso controllo gira nel job di RELEASE,
 *   dove un rosso dopo il tag brucia la versione (0.1.16, 0.1.17). Owner: «Alzo i limiti, poi tag».
 * ⇒ Il limite d'installazione lascia almeno il DOPPIO del tempo misurato più lungo; e il passo del workflow dura più della somma
 *   dei limiti interni dello smoke (installazione + Electron + disinstallazione), o scade lui per primo e il limite alzato è finto.
 */
test('R04-SMOKE-LIMITI — il limite dell installatore lascia margine sul runner, e il passo dura più dei limiti interni', () => {
  const smokePs = readFileSync(new URL('../scripts/ci-smoke.ps1', import.meta.url), 'utf8');
  const attese = [...smokePs.matchAll(/WaitForExit\((\d+)\)/gu)].map(m => Number(m[1]));
  assert.equal(attese.length, 2, 'due attese nello smoke: installer/disinstallatore e Electron');
  const [installer, electron] = attese;
  const PIU_LUNGA_MISURATA_MS = 116_195; // installazioneMs, giro 36878949071 della PR #45
  assert.ok(installer >= 2 * PIU_LUNGA_MISURATA_MS, `limite installer ${installer} ms: meno del doppio di ${PIU_LUNGA_MISURATA_MS} ms misurati`);
  assert.match(smokePs, new RegExp(`oltre il limite di ${installer / 1000} secondi`, 'u'), 'il messaggio dice il limite vero');
  const sommaMs = installer /* installazione */ + electron + installer /* disinstallazione */;
  const pretag = load(readFileSync(new URL('../../../.github/workflows/desktop-pretag-installer.yml', import.meta.url), 'utf8'));
  const smokePretag = pretag.jobs['desktop-installer'].steps.find(item => item.name === 'installa, avvia e disinstalla prima del tag');
  for (const [nome, step] of [['release.yml', passo('smoke')], ['desktop-pretag-installer.yml', smokePretag]]) {
    assert.ok(step, nome);
    assert.ok(step['timeout-minutes'] * 60_000 > sommaMs, `${nome}: passo da ${step['timeout-minutes']} min, limiti interni ${sommaMs / 60_000} min`);
  }
});

/*
 * 09/11/2026, owner ~23:06 «togliere il salto, tenere il resto»: la release rifà SEMPRE la suite; il salto di `cancelli` quando i
 * cancelli di main erano verdi sullo stesso commit (giri 1 e 2 della voce A «prove non doppie») è stato tolto per intero.
 * Qui resta ciò che vale anche senza salto:
 * - `cancelli` di release.yml non ha condizioni né `continue-on-error`, e il suo `run` è fissato per UGUAGLIANZA INTERA: sei
 *   comandi, ognuno col suo `throw` (revisione 021-A giro 2: `|| true` sul passo «test puri desktop» restava verde);
 * - i sei passi di prova del lavoro `desktop` di ci.yml sono fissati per uguaglianza intera (ogni chiave del passo), e nessun
 *   `continue-on-error` né sul lavoro né sui suoi passi: i cancelli di main non possono finire verdi con un passo rosso o con un
 *   passo che non esegue nessuna prova. Un cambio voluto si fa qui, nella stessa modifica, e si vede;
 * - il limite del lavoro è 40 minuti (misurati lavori verdi a 27:50, 28:39, 28:42: a 30 il margine era di un minuto e mezzo).
 */
const SE_DESKTOP = "steps.dove.outputs.ci == 'si'";
const PASSI_CI_ATTESI = Object.freeze({
  // round (k) 11/11: the server step preloads the keyring hook (owner «aggancio in OGNI node --test»)
  server: { if: SE_DESKTOP, name: 'server', run: 'node --test --import=./desktop/tests/gancio-portachiavi.mjs tests/*.test.mjs', 'working-directory': 'harness-ui' },
  kernel: { if: SE_DESKTOP, name: 'kernel', run: 'npm run test:kernel', 'working-directory': 'harness-ui' },
  'il kernel del repo e quello della fonte': { if: SE_DESKTOP, name: 'il kernel del repo e quello della fonte', run: 'npm run kernel:controlla', 'working-directory': 'harness-ui' },
  'unit del frontend': { if: SE_DESKTOP, name: 'unit del frontend', run: 'npm run test:unit', 'working-directory': 'harness-ui/frontend' },
  'test puri desktop': { if: SE_DESKTOP, name: 'test puri desktop', run: 'npm --prefix harness-ui/desktop run test:puri' },
  'guscio Electron reale': { if: SE_DESKTOP, name: 'guscio Electron reale', run: 'npm --prefix harness-ui/desktop run test:guscio' },
});
const PASSI_DI_PROVA_CI = Object.freeze(Object.keys(PASSI_CI_ATTESI));
const CANCELLI_ATTESO = [
  'node --test --import=./harness-ui/desktop/tests/gancio-portachiavi.mjs harness-ui/tests/*.test.mjs', "if ($LASTEXITCODE -ne 0) { throw 'Test server falliti.' }",
  'npm --prefix harness-ui run test:kernel', "if ($LASTEXITCODE -ne 0) { throw 'Test kernel falliti.' }",
  'npm --prefix harness-ui run kernel:controlla', "if ($LASTEXITCODE -ne 0) { throw 'Controllo kernel fallito.' }",
  'npm --prefix harness-ui/frontend run test:unit', "if ($LASTEXITCODE -ne 0) { throw 'Test frontend falliti.' }",
  'npm --prefix harness-ui/desktop run test:puri', "if ($LASTEXITCODE -ne 0) { throw 'Test puri desktop falliti.' }",
  '# _electron usa Electron incluso; nessun browser Playwright da scaricare.',
  'npm --prefix harness-ui/desktop run test:guscio', "if ($LASTEXITCODE -ne 0) { throw 'Test Electron reali falliti.' }",
].join('\n') + '\n';
const ciYml = () => load(readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8'));
/*
 * 10/11/2026, giro di cura delle prove (controllore 021-A, GIALLO, sei mutanti vivi non equivalenti): fissare il NOME di
 * `TALOS_GO_BINARY` non basta, conta il VALORE che arriva alle prove. Vivevano: valore vuoto o sbagliato, riga in commento a fine
 * riga, in commento a blocco, in un ramo morto (ci.yml), e `env: TALOS_GO_BINARY: ''` sul passo `cancelli` (release.yml: l'env del
 * passo vince su GITHUB_ENV). Con la variabile vuota `chat-files.test.mjs` cade su `go` e salta le 4 M1-M4 in silenzio. Quindi:
 * il passo Go dei due workflow e il passo `cancelli` sono fissati INTERI (ogni chiave, ogni riga del `run`, commenti compresi).
 */
const GO_SCARICA_E_VERIFICA = Object.freeze([
  "$archive = Join-Path $env:RUNNER_TEMP 'go1.27.1.windows-amd64.zip'",
  "$directory = Join-Path $env:RUNNER_TEMP 'talos-go-1.27.1'",
  "Invoke-WebRequest -Uri 'https://go.dev/dl/go1.27.1.windows-amd64.zip' -OutFile $archive",
  '$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()',
  "if ($hash -ne 'a3911b5e0e1b1053f25ed0675f4c1c6aad1e2bfcf253df2b9be4caabd2edd95d') { throw 'Archivio Go non conforme.' }",
  'Expand-Archive -LiteralPath $archive -DestinationPath $directory',
]);
const GO_COSTRUISCE_IL_HELPER = Object.freeze(['npm --prefix harness-ui run build:chat-upload', "if ($LASTEXITCODE -ne 0) { throw 'Build helper upload fallita.' }"]);
const PASSO_GO_CI_ATTESO = Object.freeze({
  if: SE_DESKTOP,
  name: 'Go 1.27.1 verificato per il server',
  run: [
    ...GO_SCARICA_E_VERIFICA,
    "$go = Join-Path $directory 'go/bin/go.exe'",
    '$env:TALOS_GO_BINARY = $go',
    '# 09/11/2026 (revisione 021-A reperto A): come release.yml e desktop-pretag-installer.yml, anche ai passi DOPO.',
    '# Senza, il passo server saltava le 4 CHAT-FILES-HELPER M1-M4 (130 saltate contro le 127 della release 0.2.0).',
    '"TALOS_GO_BINARY=$go" >> $env:GITHUB_ENV',
    ...GO_COSTRUISCE_IL_HELPER,
  ].join('\n') + '\n',
});
const PASSO_GO_RELEASE_ATTESO = Object.freeze({
  name: 'compila il helper upload con Go verificato',
  shell: 'pwsh',
  run: [
    ...GO_SCARICA_E_VERIFICA,
    "$env:TALOS_GO_BINARY = Join-Path $directory 'go/bin/go.exe'",
    '"TALOS_GO_BINARY=$env:TALOS_GO_BINARY" >> $env:GITHUB_ENV',
    ...GO_COSTRUISCE_IL_HELPER,
  ].join('\n') + '\n',
});
const BUILD_DEL_FRONTEND = [
  'npm --prefix harness-ui/frontend run build', "if ($LASTEXITCODE -ne 0) { throw 'Build frontend fallita.' }",
  'Copy-Item -Path harness-ui/frontend/dist/* -Destination harness-ui/public/ -Recurse -Force',
].join('\n') + '\n';
const PASSI_DI_PREPARAZIONE_CI = Object.freeze([
  { if: SE_DESKTOP, name: 'il browser', run: 'node harness-ui/frontend/node_modules/playwright/cli.js install chromium' },
  { if: SE_DESKTOP, name: 'build del frontend', run: BUILD_DEL_FRONTEND },
]);
const PASSO_DOVE_ATTESO = Object.freeze({
  id: 'dove',
  name: "c'e il desktop in questo repo?",
  run: [
    "if (Test-Path -LiteralPath 'harness-ui/package.json' -PathType Leaf) {",
    "  'ci=si' >> $env:GITHUB_OUTPUT",
    "  \"harness-ui c'e: i cancelli del desktop girano\"",
    '} else {',
    "  'ci=no' >> $env:GITHUB_OUTPUT",
    "  \"harness-ui non c'e in questo repo (disposizione mobile): niente da provare\"",
    '}',
  ].join('\n') + '\n',
});
const ORDINE_DEI_PASSI_CI = Object.freeze([
  'actions/checkout', PASSO_DOVE_ATTESO.name, 'actions/setup-node', 'dipendenze dai quattro lock con addon nativi',
  'Go 1.27.1 verificato per il server', 'server', 'kernel', 'il kernel del repo e quello della fonte', 'il browser',
  'build del frontend', 'unit del frontend', 'test puri desktop', 'guscio Electron reale', 'actions/upload-artifact',
]);
const PASSO_CANCELLI_ATTESO = Object.freeze({ id: 'cancelli', name: 'server, kernel, frontend e guscio Electron reale', 'timeout-minutes': 40, run: CANCELLI_ATTESO });

test('R04-CANCELLI-UGUALI-021 — cancelli gira sempre, i sei passi di prova di ci.yml per uguaglianza intera, mai continue-on-error, limite 40', () => {
  const cancelli = passo('cancelli');
  assert.equal(cancelli.if, undefined, 'la release rifà SEMPRE la suite: nessuna condizione su cancelli (owner 09/11 ~23:06)');
  assert.equal(cancelli['continue-on-error'], undefined);
  assert.equal(cancelli.run, CANCELLI_ATTESO);
  // il passo INTERO: un `env`, uno `shell` o una cartella in più cambiano ciò che le prove vedono senza toccare il `run`
  assert.deepEqual(cancelli, PASSO_CANCELLI_ATTESO, 'release.yml «cancelli» cambiato: se è voluto, si cambia anche qui');
  const job = ciYml().jobs.desktop;
  assert.equal(job['continue-on-error'], undefined, 'il lavoro desktop di ci.yml non può finire success con un passo rosso');
  assert.equal(job.if, undefined);
  assert.equal(job['timeout-minutes'], 40, 'lavori verdi misurati a 27:50, 28:39, 28:42: a 30 il taglio era a un minuto e mezzo');
  for (const nome of PASSI_DI_PROVA_CI) {
    const trovati = job.steps.filter(p => p.name === nome);
    assert.equal(trovati.length, 1, nome);
    assert.deepEqual(trovati[0], PASSI_CI_ATTESI[nome], `ci.yml «${nome}» cambiato: se è voluto, si cambia anche qui`);
  }
  for (const p of job.steps) assert.equal(p['continue-on-error'], undefined, p.name ?? p.uses);
  /* 10/11/2026, giro di cura (due vivi di gravità bassa del controllore 021-A). «dove» decide se tutto il resto gira: se scrivesse
     sempre `ci=no` il lavoro finirebbe verde senza eseguire niente, quindi è fissato intero. E l'elenco dei passi è fissato
     nell'ORDINE: il build del frontend dopo le unit è l'ordine rosso già visto (run 36402785877); ogni passo fra «dove» e la
     raccolta dei reperti ha la stessa condizione delle prove. */
  assert.deepEqual(job.steps.filter(p => p.id === 'dove'), [PASSO_DOVE_ATTESO], 'ci.yml «dove» cambiato: se è voluto, si cambia anche qui');
  assert.deepEqual(job.steps.map(p => p.name ?? p.uses.split('@')[0]), ORDINE_DEI_PASSI_CI, 'ci.yml: passi aggiunti, tolti o spostati; se è voluto, si cambia anche qui');
  for (const p of job.steps.slice(2, -1)) assert.equal(p.if, SE_DESKTOP, p.name ?? p.uses);
  assert.equal(job.steps.at(-1).if, `failure() && ${SE_DESKTOP}`);
});

/*
 * Revisione 021-A, reperto A (ALTO), tenuto dall'owner il 09/11 ~23:06 anche senza salto: i cancelli di main devono eseguire le
 * prove che esegue la release, altrimenti una prova rossa si scopre solo dopo il tag. Sulla 0.2.0 non era così: `TALOS_GO_BINARY`
 * stava solo nel passo Go di ci.yml (`$env:` vale per quel passo) e in release.yml andava in GITHUB_ENV, quindi i cancelli
 * saltavano le 4 CHAT-FILES-HELPER M1-M4 (130 saltate contro 127; lavori 129172959453 e 129309468435). Qui: ogni variabile che
 * release.yml dà a `cancelli` (env del lavoro e del passo, righe GITHUB_ENV dei passi prima, anche quelle scritte dagli script che
 * lanciano) è CLASSIFICATA: «uguale» ⇒ ci.yml la dà a tutti e sei i passi di prova; «solo release» ⇒ nessun file di prova la
 * legge da `process.env` (il motivo è scritto). Una variabile nuova senza classe è rossa.
 * Una riga commentata non conta (prima contava: `# "TALOS_GO_BINARY=$go" >> $env:GITHUB_ENV` restava verde).
 * ⚠ Differenza nota e lasciata: la release lancia il server dalla radice, ci.yml da harness-ui. Effetto misurato sui log veri
 *   (stessi due lavori): «FORMA — «src» è rifiutata» la release la salta e i cancelli la eseguono (verso sicuro).
 */
const AMBIENTE_DELLE_PROVE = Object.freeze({
  TALOS_GO_BINARY: 'uguale',
  electron_config_cache: 'solo release: cache di Electron per il pacchetto (dist)',
  ELECTRON_BUILDER_CACHE: 'solo release: cache di electron-builder, la legge distribuisci.mjs (dist)',
  CSC_IDENTITY_AUTO_DISCOVERY: 'solo release: firma del pacchetto spenta, la legge electron-builder (dist)',
  TALOS_R02_BUILDER_NETWORK: 'solo release: rete del builder, la legge distribuisci.mjs (dist)',
  TALOS_AIUTANTE_PC_SORGENTE: 'solo release: l\'exe verificato per prepara-pacchetto (dist)',
  TALOS_AIUTANTE_PC_AVVISI: 'solo release: gli avvisi verificati per prepara-pacchetto (dist)',
  /* 13/11/2026 (giudice v1816): il lanciatore dei comandi dallo stesso commit; le prove passano l'ambiente a mano, nessuna lo legge */
  TALOS_PACCHETTO_RILASCIO: 'solo release: il lanciatore è obbligatorio nel pacchetto, lo leggono prepara-pacchetto e la prova dell\'installato (dist, smoke)',
  TALOS_LANCIATORE_SORGENTE: 'solo release: l\'exe costruito dallo stesso commit per prepara-pacchetto (dist)',
  TALOS_LANCIATORE_IMPRONTA: 'solo release: la sua impronta, con cui prepara-pacchetto verifica la copia (dist)',
});
const radice = new URL('../../../', import.meta.url);
const senzaCommenti = (run) => String(run).split('\n').filter(riga => !/^\s*#/u.test(riga)).join('\n');
function scritteInGithubEnv(step) {
  const nomi = new Set();
  const testo = senzaCommenti(step.run ?? '');
  for (const m of testo.matchAll(/["']([A-Za-z_][A-Za-z0-9_]*)=[^"'\n]*["']\s*>>\s*\$env:GITHUB_ENV/gu)) nomi.add(m[1]);
  const cartella = step['working-directory'] ? new URL(`${step['working-directory']}/`, radice) : radice;
  for (const m of testo.matchAll(/\bnode\s+(\S+\.mjs)/gu)) {
    const script = readFileSync(new URL(m[1], cartella), 'utf8');
    if (!script.includes('GITHUB_ENV')) continue;
    for (const n of script.matchAll(/([A-Z][A-Z0-9_]{2,})=\$\{/gu)) nomi.add(n[1]);
  }
  assert.ok(nomi.size > 0 || !/GITHUB_ENV/u.test(testo), `${step.name ?? step.id}: scrive in GITHUB_ENV in un modo che questa prova non sa leggere`);
  return nomi;
}
const disponibili = (lavoro, fino) => new Set([...Object.keys(lavoro.env ?? {}), ...Object.keys(fino.env ?? {}),
  ...lavoro.steps.slice(0, lavoro.steps.indexOf(fino)).flatMap(p => [...scritteInGithubEnv(p)])]);
function fileDiProva() {
  const cartelle = ['harness-ui/tests', 'harness-ui/desktop/tests', 'harness-ui/frontend/tests', 'harness-ui/src/kernel'];
  return cartelle.flatMap(c => {
    const dir = new URL(`${c}/`, radice);
    try { return readdirSync(dir).filter(f => /\.(test|spec)\.m?[jt]s$/u.test(f)).map(f => readFileSync(new URL(f, dir), 'utf8')); } catch { return []; }
  });
}

test('R04-STESSO-AMBIENTE-021 — ci.yml dà ai sei passi di prova le variabili che accendono prove, come release.yml a cancelli', () => {
  const job = ciYml().jobs.desktop;
  const dellaRelease = disponibili(desktop, passo('cancelli'));
  assert.deepEqual([...dellaRelease].sort(), Object.keys(AMBIENTE_DELLE_PROVE).sort(), 'una variabile nuova per i cancelli della release va classificata qui');
  const uguali = Object.keys(AMBIENTE_DELLE_PROVE).filter(v => AMBIENTE_DELLE_PROVE[v] === 'uguale');
  const prove = fileDiProva();
  assert.ok(prove.length > 100, `file di prova letti: ${prove.length}`);
  const leggeDaEnv = (v) => prove.some(t => new RegExp(`process\\.env(?:\\.${v}\\b|\\[\\s*['"]${v}['"]\\s*\\])`, 'u').test(t));
  assert.ok(leggeDaEnv('TALOS_GO_BINARY'), 'la regola non è vuota: chat-files.test.mjs legge TALOS_GO_BINARY');
  for (const nome of PASSI_DI_PROVA_CI) {
    const step = job.steps.find(p => p.name === nome);
    assert.ok(step, nome);
    const delCi = disponibili(job, step);
    assert.deepEqual([...delCi].sort(), uguali.sort(), `ci.yml «${nome}»: variabili diverse da quelle «uguale» della release`);
  }
  for (const [v, classe] of Object.entries(AMBIENTE_DELLE_PROVE)) {
    if (classe !== 'uguale') assert.equal(leggeDaEnv(v), false, `${v} è «${classe}», ma una prova la legge da process.env: va data anche ai cancelli`);
  }
  // il passo che scrive TALOS_GO_BINARY gira davvero quando girano le prove: stessa condizione dei sei passi
  const go = job.steps.find(p => p.name === 'Go 1.27.1 verificato per il server');
  assert.ok(go, 'Go 1.27.1 verificato per il server');
  assert.equal(go.if, SE_DESKTOP);
  assert.ok(scritteInGithubEnv(go).has('TALOS_GO_BINARY'), 'come release.yml e desktop-pretag-installer.yml:61-62');
  /* 10/11/2026, giro di cura (guardia tolta da `b449e91df`, rimessa sulla forma di oggi): fa parte dello stesso ambiente anche ciò
     che le prove trovano sul disco. I due passi di ci.yml che lo preparano (frontend costruito e consegnato in `public/`, browser
     di Playwright) sono fissati interi, e il build è lo stesso comando della release, che lo fa prima di `cancelli`. */
  for (const atteso of PASSI_DI_PREPARAZIONE_CI) {
    const trovati = job.steps.filter(p => p.name === atteso.name);
    assert.equal(trovati.length, 1, `ci.yml: passo «${atteso.name}»`);
    assert.deepEqual(trovati[0], atteso, `ci.yml «${atteso.name}» cambiato: se è voluto, si cambia anche qui`);
  }
  const buildRelease = passi.filter(p => p.name === 'costruisci il frontend e consegnalo');
  assert.equal(buildRelease.length, 1, 'release.yml: un solo build del frontend');
  assert.deepEqual(buildRelease[0], { name: 'costruisci il frontend e consegnalo', run: BUILD_DEL_FRONTEND });
  assert.ok(passi.indexOf(buildRelease[0]) < passi.indexOf(passo('cancelli')), 'release.yml: il build prima di cancelli');
});

/*
 * 10/11/2026, giro di cura: due guardie che stavano in R04-PROVE-NON-DOPPIE-021 (tolta col salto da `b449e91df`) e valgono anche
 * senza salto. (1) In release.yml nessun passo ha una condizione o `continue-on-error`, tranne i due di chiusura che conservano la
 * prova e il tempo anche dopo un errore: con `if: always()` su `dist`, `smoke` o sulla pubblicazione un passo girerebbe anche coi
 * cancelli rossi. (2) ci.yml gira sulla spinta su main e sulle richieste di unione: è la forma di oggi, fissata intera.
 * Il terzo pezzo di quella prova, `permissions.actions`, sta già in R04-ATTEST (i permessi per uguaglianza intera).
 */
const PASSI_DI_CHIUSURA_RELEASE = Object.freeze(['conserva la prova dello smoke anche in caso di errore', 'tempo totale osservato']);

test('R04-NESSUNA-CONDIZIONE-NUOVA-021 — release.yml: nessun passo con `if` o continue-on-error tranne i due di chiusura; ci.yml sulla spinta su main e sulle richieste di unione', () => {
  assert.equal(desktop['continue-on-error'], undefined, 'il lavoro desktop della release');
  for (const p of passi) {
    const nome = p.id ?? p.name ?? p.uses;
    assert.equal(p['continue-on-error'], undefined, `release.yml «${nome}»: continue-on-error`);
    assert.equal(p.if, PASSI_DI_CHIUSURA_RELEASE.includes(p.name) ? 'always()' : undefined, `release.yml «${nome}»: condizione nuova`);
  }
  assert.deepEqual(passi.slice(-PASSI_DI_CHIUSURA_RELEASE.length).map(p => p.name), PASSI_DI_CHIUSURA_RELEASE, 'i due passi con always() sono gli ultimi, dopo la pubblicazione');
  assert.deepEqual(ciYml().on, { push: { branches: ['main'] }, pull_request: null }, 'ci.yml: eventi cambiati; se è voluto, si cambia anche qui');
});

test('R04-GO-VERO-021 — alle prove arriva il Go verificato, non solo il nome della variabile: passo Go dei due workflow per uguaglianza intera, nessun altro la tocca', () => {
  const job = ciYml().jobs.desktop;
  const unSolo = (lavoro, nome) => { const trovati = lavoro.steps.filter(p => p.name === nome); assert.equal(trovati.length, 1, nome); return trovati[0]; };
  const goCi = unSolo(job, PASSO_GO_CI_ATTESO.name);
  assert.deepEqual(goCi, PASSO_GO_CI_ATTESO, 'ci.yml: passo Go cambiato (valore vuoto o sbagliato, riga spenta): se è voluto, si cambia anche qui');
  const goRelease = unSolo(desktop, PASSO_GO_RELEASE_ATTESO.name);
  assert.deepEqual(goRelease, PASSO_GO_RELEASE_ATTESO, 'release.yml: passo Go cambiato: se è voluto, si cambia anche qui');
  assert.ok(job.steps.indexOf(goCi) < job.steps.findIndex(p => p.name === PASSI_DI_PROVA_CI[0]), 'ci.yml: il Go prima della prima prova');
  assert.ok(passi.indexOf(goRelease) < passi.indexOf(passo('cancelli')), 'release.yml: il Go prima di cancelli');
  /* Fuori dal passo Go nessuno nomina la variabile: né l'env del workflow o del lavoro, né un altro passo che la riscriva in
     GITHUB_ENV o la copra col suo `env` (l'env di un passo vince su GITHUB_ENV, doc GitHub «workflow syntax», jobs.<id>.steps[*].env). */
  /* 11/11/2026 (giudice v1398 C4, vivi P01/P02 del controllore): `talos_go_binary` minuscola nell'env del workflow passava,
     perché l'espressione distingueva le maiuscole; le variabili d'ambiente di Windows no. Quindi il flag `i`. */
  for (const [file, intero, lavoro, go] of [['ci.yml', ciYml(), job, goCi], ['release.yml', workflow, desktop, goRelease]]) {
    assert.doesNotMatch(JSON.stringify(intero.env ?? {}), /TALOS_GO_BINARY/iu, `${file}: env del workflow`);
    const resto = { ...lavoro, steps: lavoro.steps.filter(p => p !== go) };
    assert.doesNotMatch(JSON.stringify(resto), /TALOS_GO_BINARY/iu, `${file}: TALOS_GO_BINARY nominata fuori dal passo Go`);
    /* (giudice v1398 C6, vivo P19) la cartella e l'archivio del Go verificato li nomina solo il passo Go: un'altra riga che li
       nomina (per esempio li cancella prima delle prove) è rossa qui; per ogni altra via resta CHAT-FILES-GO-IN-CI sul runner. */
    for (const p of resto.steps) assert.doesNotMatch(JSON.stringify(p), /talos-go-|go1\.27\.1\.windows/iu, `${file} «${p.id ?? p.name ?? p.uses}»: nomina il Go verificato fuori dal passo Go`);
  }
});

/*
 * 11/11/2026, giro 2 di cura (controllore 021-A, GIALLO; giudice v1398 C2, C3, C5, C6). Vivevano 12 mutanti:
 * - P13/P14: il checkout di ci.yml con `if: ${{ false }}` o `with.path` faceva scrivere `ci=no` a «dove» e il lavoro finiva verde
 *   senza eseguire niente. Il checkout ora è fissato INTERO (anche lo SHA: un aggiornamento voluto cambia anche questa riga);
 * - P04/P17 e P08/P10: shell, `runs-on`, setup-node, le chiavi del lavoro e il passo delle dipendenze di ci.yml non erano fissati,
 *   mentre quelli della release sì (R04-WINDOWS). Ora sono fissati interi e uguali a quelli della release dove devono esserlo;
 * - P18/P20/P21: l'elenco dei passi della release non era fissato: un passo nuovo prima di `cancelli`, o `commit_tag` spostato dopo
 *   `cancelli` (la guardia d'ordine di `02929839d`, caduta con `b449e91df`), restavano verdi. Ora l'ordine è fissato come in ci.yml.
 * - CHAT-FILES-GO-IN-CI (harness-ui/tests/chat-files.test.mjs) vale in più sul runner: un Go che manca rende rosse M1-M4.
 *   Perché quel segnale non si spenga, nessuno nei due lavori dà un valore a `CI` o a `GITHUB_ACTIONS` prima delle prove.
 * 11/11/2026, giro 3 (controllore 021-A giro 2, falso rosso BASSO-MEDIO; giudice v1404/v1405): lo SHA di checkout e setup-node
 * NON si fissa più per valore. `.github/dependabot.yml` aggiorna `github-actions` ogni settimana e la sua PR cambia lo SHA in
 * ci.yml e in release.yml nello stesso commit (`a055bd334`, setup-node 7.0.0→7.1.0): con lo SHA fissato qui nasceva rossa.
 * Si fissano: l'azione (`actions/checkout`, `actions/setup-node`), lo SHA INTERO di 40 caratteri (mai un'etichetta come `@v7`,
 * mai uno SHA corto: doc GitHub «Secure use reference», «You must use a commit's full SHA value») e lo stesso SHA della release;
 * il resto del passo (`if`, `with`, `path`…) resta fissato intero, quindi P13/P14 restano rossi.
 */
const CHECKOUT_CI_ATTESO = Object.freeze({ uses: 'actions/checkout', with: { 'fetch-depth': 0 } });
const SETUP_NODE_CI_ATTESO = Object.freeze({
  if: SE_DESKTOP,
  uses: 'actions/setup-node',
  with: {
    'node-version': 24, cache: 'npm',
    'cache-dependency-path': ['harness-ui/package-lock.json', 'harness-ui/frontend/package-lock.json', 'harness-ui/desktop/package-lock.json', 'context-engine/package-lock.json'].join('\n') + '\n',
  },
});
const DIPENDENZE_CI_ATTESO = Object.freeze({
  if: SE_DESKTOP,
  name: 'dipendenze dai quattro lock con addon nativi',
  'timeout-minutes': 10,
  run: ['harness-ui', 'harness-ui/frontend', 'harness-ui/desktop', 'context-engine'].map((cartella, i) => [
    `npm ci --prefix ${cartella} --no-audit --no-fund`, `if ($LASTEXITCODE -ne 0) { throw 'npm ci ${['backend', 'frontend', 'desktop', 'context-engine'][i]} fallito.' }`,
  ]).flat().join('\n') + '\n',
});
const ORDINE_DEI_PASSI_RELEASE = Object.freeze([
  'actions/checkout', 'commit_tag', 'actions/setup-node', 'ambiente', 'cache Electron, builder e staging', 'dipendenze dai lock con addon nativi',
  'compila il helper upload con Go verificato', 'costruisci il frontend e consegnalo', 'binding_iroh', 'aiutante_pc', 'lanciatore', 'cancelli', 'dist', 'smoke',
  'asset', 'provenienza GitHub di EXE e ZIP', 'upload', 'release', ...PASSI_DI_CHIUSURA_RELEASE,
]);

test('R04-CI-COME-RELEASE-021 — ci.yml: checkout, setup-node, dipendenze, shell e runs-on fissati interi; release.yml: ordine dei passi fissato, commit_tag prima di cancelli', () => {
  const ci = ciYml();
  const job = ci.jobs.desktop;
  assert.deepEqual(Object.keys(job).sort(), ['defaults', 'runs-on', 'steps', 'timeout-minutes'], 'ci.yml: chiavi del lavoro desktop cambiate (needs, strategy, env, if…): se è voluto, si cambia anche qui');
  assert.equal(job['runs-on'], desktop['runs-on'], 'ci.yml e release.yml sulla stessa macchina');
  assert.equal(job['runs-on'], 'windows-latest');
  assert.deepEqual(job.defaults, { run: { shell: 'pwsh' } }, 'ci.yml: la shell è pwsh come nella release (powershell 5.1 scrive GITHUB_OUTPUT in un altro modo)');
  assert.deepEqual(job.defaults, desktop.defaults);
  const perSha = (p, azione) => {
    assert.match(String(p.uses), new RegExp(`^${azione}@[0-9a-f]{40}$`, 'u'), `ci.yml: ${azione} fissata per SHA intero, mai per etichetta né SHA corto`);
    const dellaRelease = passi.filter(q => q.uses?.startsWith(`${azione}@`));
    assert.equal(dellaRelease.length, 1, `release.yml: un solo ${azione}`);
    assert.equal(p.uses, dellaRelease[0].uses, `ci.yml e release.yml sullo stesso ${azione} (Dependabot li aggiorna nello stesso commit)`);
    return { ...p, uses: azione };
  };
  assert.deepEqual(perSha(job.steps[0], 'actions/checkout'), CHECKOUT_CI_ATTESO, 'ci.yml: checkout cambiato (if, path, ref…): se è voluto, si cambia anche qui');
  const setup = job.steps.filter(p => p.uses?.startsWith('actions/setup-node@'));
  assert.deepEqual(setup.map(p => perSha(p, 'actions/setup-node')), [SETUP_NODE_CI_ATTESO], 'ci.yml: setup-node cambiato: se è voluto, si cambia anche qui');
  assert.equal(String(setup[0].with['node-version']), String(passi.find(p => p.uses?.startsWith('actions/setup-node@')).with['node-version']), 'ci.yml e release.yml sullo stesso Node');
  assert.deepEqual(job.steps.filter(p => p.name === DIPENDENZE_CI_ATTESO.name), [DIPENDENZE_CI_ATTESO], 'ci.yml: passo delle dipendenze cambiato: se è voluto, si cambia anche qui');
  assert.deepEqual(passi.map(p => p.id ?? p.name ?? p.uses.split('@')[0]), ORDINE_DEI_PASSI_RELEASE, 'release.yml: passi aggiunti, tolti o spostati; se è voluto, si cambia anche qui');
  assert.ok(passi.indexOf(passo('commit_tag')) < passi.indexOf(passo('cancelli')), 'release.yml: le prove girano sul commit esatto del tag');
  for (const [file, intero, lavoro, ultimaProva] of [['ci.yml', ci, job, job.steps.find(p => p.name === PASSI_DI_PROVA_CI.at(-1))], ['release.yml', workflow, desktop, passo('cancelli')]]) {
    const prima = lavoro.steps.slice(0, lavoro.steps.indexOf(ultimaProva) + 1);
    const nomi = [...Object.keys(intero.env ?? {}), ...Object.keys(lavoro.env ?? {}), ...prima.flatMap(p => [...Object.keys(p.env ?? {}), ...scritteInGithubEnv(p)])];
    assert.deepEqual(nomi.filter(n => /^(?:CI|GITHUB_ACTIONS)$/iu.test(n)), [], `${file}: CI o GITHUB_ACTIONS riscritte prima delle prove (spengono CHAT-FILES-GO-IN-CI)`);
  }
});
