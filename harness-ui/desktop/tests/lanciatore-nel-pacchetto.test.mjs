/*
 * Il lanciatore dei comandi nel pacchetto del PC (owner via giudice v1815 e v1816, 13/11/2026). Il difetto: `scarica-lanciatore.mjs`
 * non lo chiamava nessun flusso e `prepara-pacchetto.mjs` non lo copiava, quindi nessuna app installata portava `talos-lanciatore.exe`.
 * La regola (v1816): il RILASCIO costruisce l'exe dallo stesso commit, ne fissa l'impronta e verifica con lei la copia nel pacchetto;
 * impronta nulla o che non torna ferma il rilascio. Solo una build LOCALE con l'impronta nulla esce senza lanciatore, e lo dice.
 * Concorrenti: Codex `.github/workflows/rust-release-windows.yml:250` («Build same-commit native runtime and helper»); Hermes
 * `apps/desktop/scripts/stage-native-deps.mjs:771` (l'aiutante nativo compilato mentre si prepara il pacchetto).
 * I moduli nuovi si caricano dentro le prove: sulla base senza la cura ogni prova è rossa da sola, col suo motivo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const modulo = () => import('../scripts/lanciatore-nel-pacchetto.mjs');
const costruttore = () => import('../../scripts/costruisci-lanciatore.mjs');
const HARNESS = fileURLToPath(new URL('../../', import.meta.url));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const { load } = createRequire(import.meta.url)('js-yaml');
const flusso = (nome) => load(readFileSync(new URL(`../../../.github/workflows/${nome}`, import.meta.url), 'utf8'));

/** Un `harness-ui/native` finto: riferimento come quello del repo (impronta nulla), avvisi veri, un exe di prova coi suoi byte. */
function banco(t, { riferimentoFissato = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'talos-lanciatore-pacchetto-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const native = join(dir, 'native');
  mkdirSync(join(native, 'lanciatore-bin'), { recursive: true });
  const rif = JSON.parse(readFileSync(join(HARNESS, 'native', 'lanciatore-binding.json'), 'utf8'));
  writeFileSync(join(native, 'lanciatore-binding.json'), JSON.stringify({ ...rif, sha256: riferimentoFissato }));
  copyFileSync(join(HARNESS, 'native', 'lanciatore-THIRD_PARTY_NOTICES.txt'), join(native, 'lanciatore-THIRD_PARTY_NOTICES.txt'));
  const byte = randomBytes(4096);
  const exe = join(dir, 'costruito', 'talos-lanciatore.exe');
  mkdirSync(join(dir, 'costruito'));
  writeFileSync(exe, byte);
  return { dir, native, exe, impronta: sha(byte), destinazione: join(dir, 'staging', 'harness-ui', 'native') };
}
const rilascio = (b, altro = {}) => ({ TALOS_PACCHETTO_RILASCIO: '1', TALOS_LANCIATORE_SORGENTE: b.exe, TALOS_LANCIATORE_IMPRONTA: b.impronta, ...altro });

test('LNP-01 (a) il pacchetto porta l exe del lanciatore, il suo .sha256, gli avvisi di licenza e il riferimento del pacchetto, verificati per impronta', async (t) => {
  const { copiaLanciatore } = await modulo();
  const b = banco(t);
  const esito = await copiaLanciatore({ ambiente: rilascio(b), native: b.native, destinazione: b.destinazione });
  assert.deepEqual(esito, { incluso: true, sha256: b.impronta, byte: 4096, origine: 'stesso-commit' });
  const cartella = join(b.destinazione, 'lanciatore-bin');
  assert.equal(sha(readFileSync(join(cartella, 'talos-lanciatore.exe'))), b.impronta, 'l exe nel pacchetto è quello costruito');
  assert.equal(readFileSync(join(cartella, 'talos-lanciatore.exe.sha256'), 'utf8'), `${b.impronta}  talos-lanciatore.exe\n`);
  assert.equal(readFileSync(join(cartella, 'THIRD_PARTY_NOTICES.txt'), 'utf8'), readFileSync(join(b.native, 'lanciatore-THIRD_PARTY_NOTICES.txt'), 'utf8'), 'gli avvisi viaggiano con l exe');
  const riferimento = JSON.parse(readFileSync(join(b.destinazione, 'lanciatore-binding.json'), 'utf8'));
  assert.equal(riferimento.sha256, b.impronta, 'il nucleo dell app legge l impronta da qui');
  assert.equal(riferimento.file, 'talos-lanciatore.exe');
});

test('LNP-02 (b) impronta sbagliata: il pacchetto si FERMA e nel pacchetto non resta l exe', async (t) => {
  const { copiaLanciatore } = await modulo();
  const b = banco(t);
  for (const ambiente of [rilascio(b, { TALOS_LANCIATORE_IMPRONTA: 'a'.repeat(64) }), { TALOS_LANCIATORE_SORGENTE: b.exe, TALOS_LANCIATORE_IMPRONTA: 'b'.repeat(64) }]) {
    await assert.rejects(copiaLanciatore({ ambiente, native: b.native, destinazione: b.destinazione }), /SHA256 della copia nel pacchetto/u);
    assert.equal(existsSync(join(b.destinazione, 'lanciatore-bin', 'talos-lanciatore.exe')), false, 'la copia sbagliata non resta');
    assert.equal(existsSync(join(b.destinazione, 'lanciatore-binding.json')), false, 'nessun riferimento per un exe che non torna');
  }
});

test('LNP-03 build LOCALE con l impronta nulla: il pacchetto esce SENZA lanciatore e lo dice (log e manifesto), mai un errore', async (t) => {
  const { copiaLanciatore, rigaDelPacchetto } = await modulo();
  const b = banco(t);
  copyFileSync(b.exe, join(b.native, 'lanciatore-bin', 'talos-lanciatore.exe')); // anche con un exe lì: senza impronta non si verifica
  const esito = await copiaLanciatore({ ambiente: {}, native: b.native, destinazione: b.destinazione });
  assert.deepEqual(esito, { incluso: false, motivo: 'non-fissato' });
  assert.equal(existsSync(join(b.destinazione, 'lanciatore-bin')), false, 'niente lanciatore nel pacchetto');
  const riga = rigaDelPacchetto(esito, {});
  assert.equal(riga.livello, 'warn');
  assert.match(riga.testo, /^Attenzione: pacchetto SENZA il lanciatore dei comandi/u);
  assert.match(rigaDelPacchetto(esito, { GITHUB_ACTIONS: 'true' }).testo, /^::warning title=Lanciatore::pacchetto SENZA/u);
  assert.match(rigaDelPacchetto({ incluso: true, sha256: b.impronta, byte: 1, origine: 'stesso-commit' }, {}).testo, new RegExp(`sha256 ${b.impronta}`, 'u'));
});

test('LNP-04 RILASCIO con l impronta nulla: si FERMA, anche se il riferimento scritto a mano ne ha una (nel rilascio non vale)', async (t) => {
  const { copiaLanciatore } = await modulo();
  const b = banco(t);
  await assert.rejects(copiaLanciatore({ ambiente: { TALOS_PACCHETTO_RILASCIO: '1' }, native: b.native, destinazione: b.destinazione }), /nel rilascio l'impronta manca/u);
  const fissato = banco(t, { riferimentoFissato: 'c'.repeat(64) });
  writeFileSync(join(fissato.native, 'lanciatore-bin', 'talos-lanciatore.exe'), randomBytes(8));
  await assert.rejects(copiaLanciatore({ ambiente: { TALOS_PACCHETTO_RILASCIO: '1', TALOS_LANCIATORE_IMPRONTA: '  ' }, native: fissato.native, destinazione: fissato.destinazione }), /nel rilascio l'impronta manca/u);
  assert.equal(existsSync(join(b.destinazione, 'lanciatore-bin')), false);
});

test('LNP-05 un tag desktop-v in GitHub Actions è un rilascio anche senza il segno esplicito: impronta nulla ⇒ fermo; altrove no', async (t) => {
  const { copiaLanciatore, rilascioDaAmbiente } = await modulo();
  const b = banco(t);
  const tag = { GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/tags/desktop-v0.2.3' };
  assert.equal(rilascioDaAmbiente(tag), true);
  assert.equal(rilascioDaAmbiente({ TALOS_PACCHETTO_RILASCIO: '1' }), true);
  for (const no of [{}, { GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/pull/12/merge' }, { GITHUB_REF: 'refs/tags/desktop-v0.2.3' }, { TALOS_PACCHETTO_RILASCIO: 'true' }]) assert.equal(rilascioDaAmbiente(no), false, JSON.stringify(no));
  await assert.rejects(copiaLanciatore({ ambiente: tag, native: b.native, destinazione: b.destinazione }), /nel rilascio l'impronta manca/u);
});

test('LNP-06 build locale con l impronta FISSATA nel riferimento: come iroh, l exe in lanciatore-bin entra; se manca si ferma', async (t) => {
  const { copiaLanciatore } = await modulo();
  const b = banco(t);
  const fissato = banco(t, { riferimentoFissato: b.impronta });
  await assert.rejects(copiaLanciatore({ ambiente: {}, native: fissato.native, destinazione: fissato.destinazione }), /Lanciatore dei comandi assente/u);
  copyFileSync(b.exe, join(fissato.native, 'lanciatore-bin', 'talos-lanciatore.exe'));
  const esito = await copiaLanciatore({ ambiente: {}, native: fissato.native, destinazione: fissato.destinazione });
  assert.deepEqual(esito, { incluso: true, sha256: b.impronta, byte: 4096, origine: 'riferimento' });
  await assert.rejects(copiaLanciatore({ ambiente: { TALOS_LANCIATORE_IMPRONTA: 'non-uno-sha' }, native: fissato.native, destinazione: fissato.destinazione }), /non è uno sha256/u);
});

/** Le risorse di un'app impacchettata, finte ma col nucleo VERO: `resources/harness-ui/src/kernel/lanciatore-windows.mjs`. */
async function risorseFinte(t, b, { manifestLanciatore } = {}) {
  const risorse = join(b.dir, 'resources');
  for (const file of ['src/kernel/lanciatore-windows.mjs', 'src/taskkill-di-sistema.mjs']) {
    mkdirSync(join(risorse, 'harness-ui', file, '..'), { recursive: true });
    copyFileSync(join(HARNESS, file), join(risorse, 'harness-ui', file));
  }
  const { copiaLanciatore } = await modulo();
  const lanciatore = manifestLanciatore ?? await copiaLanciatore({ ambiente: rilascio(b), native: b.native, destinazione: join(risorse, 'harness-ui', 'native') });
  writeFileSync(join(risorse, 'MANIFEST.json'), JSON.stringify({ schema: 'talos.desktop.package.v1', lanciatore, files: [] }));
  return risorse;
}

test('LNP-07 (c) nell app impacchettata il nucleo trova l exe del pacchetto in modalità app; exe cambiato, avvisi assenti o rilascio senza lanciatore ⇒ rosso', async (t) => {
  const { controllaLanciatoreInstallato } = await modulo();
  const b = banco(t);
  const risorse = await risorseFinte(t, b);
  assert.deepEqual(await controllaLanciatoreInstallato({ risorse, ambiente: {} }), { incluso: true, sha256: b.impronta, origine: 'stesso-commit', trovato: true });
  const cartella = join(risorse, 'harness-ui', 'native', 'lanciatore-bin');
  renameSync(join(cartella, 'THIRD_PARTY_NOTICES.txt'), join(b.dir, 'avvisi.txt'));
  await assert.rejects(controllaLanciatoreInstallato({ risorse, ambiente: {} }), /Avvisi di licenza del lanciatore assenti/u);
  renameSync(join(b.dir, 'avvisi.txt'), join(cartella, 'THIRD_PARTY_NOTICES.txt'));
  writeFileSync(join(cartella, 'talos-lanciatore.exe'), randomBytes(16));
  await assert.rejects(controllaLanciatoreInstallato({ risorse, ambiente: {} }), /Impronta del lanciatore installato diversa/u);
  const senza = banco(t);
  const risorseSenza = await risorseFinte(t, senza, { manifestLanciatore: { incluso: false, motivo: 'non-fissato' } });
  assert.deepEqual(await controllaLanciatoreInstallato({ risorse: risorseSenza, ambiente: {} }), { incluso: false, motivo: 'non-fissato' });
  await assert.rejects(controllaLanciatoreInstallato({ risorse: risorseSenza, ambiente: { TALOS_PACCHETTO_RILASCIO: '1' } }), /Pacchetto di rilascio senza il lanciatore/u);
  writeFileSync(join(risorseSenza, 'MANIFEST.json'), JSON.stringify({ files: [] }));
  await assert.rejects(controllaLanciatoreInstallato({ risorse: risorseSenza, ambiente: {} }), /non dice se porta il lanciatore/u);
});

/* Un exe VERO (TALOS_LANCIATORE, come le prove LANC): il comando passa dal lanciatore del pacchetto, non dal ripiego. */
const exeVero = process.platform === 'win32' && process.env.TALOS_LANCIATORE && existsSync(process.env.TALOS_LANCIATORE) ? process.env.TALOS_LANCIATORE : null;
test('LNP-08 (c) col lanciatore VERO copiato come nel pacchetto, un comando del nucleo dell app parte dentro il suo gruppo e finisce col suo codice', { skip: exeVero ? false : 'SALTATA, non verde: serve TALOS_LANCIATORE con un exe costruito (solo Windows)', timeout: 30_000 }, async (t) => {
  const b = banco(t);
  copyFileSync(exeVero, b.exe);
  b.impronta = sha(readFileSync(b.exe));
  const risorse = await risorseFinte(t, b);
  const L = await import(pathToFileURL(join(risorse, 'harness-ui', 'src', 'kernel', 'lanciatore-windows.mjs')).href);
  const ambiente = { ...process.env, TALOS_DESKTOP_DATA_DIR: join(b.dir, 'dati'), TALOS_LANCIATORE: join(b.dir, 'non-esiste.exe') };
  assert.equal(L.trovaLanciatore({ ambiente }).percorso, join(risorse, 'harness-ui', 'native', 'lanciatore-bin', 'talos-lanciatore.exe'), 'in modalità app vince l exe del pacchetto, mai TALOS_LANCIATORE');
  const righe = [];
  const p = L.lanciaComando('echo TALOS-LNP-08& exit /b 3', { cwd: b.dir, shell: true, windowsHide: true }, { ambiente, log: (r) => righe.push(r) });
  assert.equal(typeof p.fermaAlbero, 'function', 'il comando è passato dal lanciatore');
  let uscita = '';
  p.stdout.on('data', (d) => { uscita += d; });
  const codice = await new Promise((ok) => p.once('exit', (c) => ok(c)));
  await p.alberoVuoto;
  assert.equal(codice, 3);
  assert.match(uscita, /TALOS-LNP-08/u);
  assert.deepEqual(righe, [], 'nessun ripiego detto nel log');
});

/* (d) I flussi, sul testo, MAI avviandoli. */
const passiDi = (nome, lavoro) => flusso(nome).jobs[lavoro].steps;
const COMANDO = /^node harness-ui\/scripts\/costruisci-lanciatore\.mjs$/mu;

test('LNP-09 (d) la release costruisce il lanciatore dallo stesso commit PRIMA dei cancelli e del pacchetto, col segno del rilascio sul lavoro', () => {
  const lavoro = flusso('release.yml').jobs.desktop;
  const passi = lavoro.steps;
  assert.equal(lavoro.env.TALOS_PACCHETTO_RILASCIO, '1', 'il pacchetto della release vuole il lanciatore');
  const passo = passi.find((p) => p.id === 'lanciatore');
  assert.ok(passo, 'manca il passo del lanciatore nella release');
  assert.match(passo.run, COMANDO);
  assert.match(passo.run, /\$LASTEXITCODE -ne 0\) \{ throw/u);
  assert.equal(passo.if, undefined);
  assert.equal(passo.env, undefined, 'nessun gettone né segreto: si costruisce, non si scarica');
  assert.doesNotMatch(JSON.stringify(passi), /scarica-lanciatore/u, 'la release non dipende più da una corsa separata di lanciatore.yml');
  const indice = (id) => passi.findIndex((p) => p.id === id);
  assert.ok(indice('commit_tag') < passi.indexOf(passo), 'sul commit esatto del tag');
  assert.ok(passi.indexOf(passo) < indice('cancelli'));
  assert.ok(passi.indexOf(passo) < passi.findIndex((p) => /run dist/u.test(p.run ?? '')), 'prima del pacchetto');
});

test('LNP-10 (d) ogni flusso che costruisce il pacchetto di rilascio (release e prova prima del tag) ha il segno e costruisce il lanciatore prima di `run dist`', () => {
  for (const [nome, lavoro] of [['release.yml', 'desktop'], ['desktop-pretag-installer.yml', 'desktop-installer']]) {
    const job = flusso(nome).jobs[lavoro];
    assert.equal(job.env?.TALOS_PACCHETTO_RILASCIO, '1', `${nome}: senza il segno un pacchetto senza lanciatore passerebbe`);
    const passi = passiDi(nome, lavoro);
    const costruzione = passi.findIndex((p) => COMANDO.test(p.run ?? ''));
    const dist = passi.findIndex((p) => /npm --prefix harness-ui\/desktop run dist/u.test(p.run ?? ''));
    assert.ok(costruzione >= 0, `${nome}: manca la costruzione del lanciatore`);
    assert.ok(costruzione < dist, `${nome}: il lanciatore prima del pacchetto`);
    assert.ok(costruzione > passi.findIndex((p) => p.uses?.startsWith('actions/checkout@')), `${nome}: dopo il checkout`);
  }
  const prepara = readFileSync(new URL('../scripts/prepara-pacchetto.mjs', import.meta.url), 'utf8');
  assert.match(prepara, /const lanciatore = await copiaLanciatore\(\{ native: join\(root, '\.\.\/native'\), destinazione: join\(backend, 'native'\) \}\);/u);
  assert.ok(prepara.indexOf('copiaLanciatore({') < prepara.indexOf('await inventario(staging)'), 'prima dell inventario');
  assert.match(prepara, /casaLinux: BINARI_CASA_LINUX, lanciatore, files/u, 'il manifesto dice se c è');
  assert.match(readFileSync(new URL('../scripts/ci-smoke-installed.mjs', import.meta.url), 'utf8'), /controllaLanciatoreInstallato\(\{ risorse: percorsi\.risorse \}\)/u, 'la prova dell app installata in CI lo guarda');
  assert.match(readFileSync(new URL('../scripts/verifica-nativi.mjs', import.meta.url), 'utf8'), /L\.trovaLanciatore\(\{ ambiente: ambienteApp \}\)/u);
});

/** Una crate finta: la toolchain del repo, e un «cargo» che scrive l'exe dove lo scriverebbe cargo. */
function crateFinta(t) {
  const crate = mkdtempSync(join(tmpdir(), 'talos-crate-lanciatore-'));
  t.after(() => rmSync(crate, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  copyFileSync(join(HARNESS, 'native', 'lanciatore', 'rust-toolchain.toml'), join(crate, 'rust-toolchain.toml'));
  return crate;
}

test('LNP-11 la costruzione del rilascio: toolchain fissata, cargo --locked, prova di fumo sull exe, poi exe e impronta in GITHUB_ENV', async (t) => {
  const { costruisciLanciatore, daRigaDiComando } = await costruttore();
  const crate = crateFinta(t);
  const byte = randomBytes(1024);
  const chiamate = [];
  const esegui = (comando, argomenti, { cwd }) => {
    chiamate.push([comando, ...argomenti]);
    assert.equal(cwd, crate);
    if (comando === 'cargo') { mkdirSync(join(crate, 'target', 'x86_64-pc-windows-msvc', 'release'), { recursive: true }); writeFileSync(join(crate, 'target', 'x86_64-pc-windows-msvc', 'release', 'talos-lanciatore.exe'), byte); }
  };
  const exe = join(crate, 'target', 'x86_64-pc-windows-msvc', 'release', 'talos-lanciatore.exe');
  const esito = costruisciLanciatore({ crate, esegui, node: 'node-di-prova', target: join(crate, 'target') });
  assert.deepEqual(chiamate, [
    ['rustup', 'toolchain', 'install', '1.97.1', '--profile', 'minimal', '--target', 'x86_64-pc-windows-msvc'],
    ['cargo', 'build', '--locked', '--release', '--target', 'x86_64-pc-windows-msvc'],
    ['node-di-prova', join(crate, 'prova-fumo.mjs'), exe],
  ]);
  assert.deepEqual(esito, { exe, impronta: sha(byte), byte: 1024 });
  const scritto = [];
  const codice = daRigaDiComando({ argomenti: [], ambiente: { GITHUB_ENV: 'env.txt' }, costruisci: () => esito, scriviAmbiente: (f, testo) => scritto.push([f, testo]), scrivi: () => {}, errore: () => {} });
  assert.equal(codice, 0);
  assert.deepEqual(scritto, [['env.txt', `TALOS_LANCIATORE_SORGENTE=${exe}\nTALOS_LANCIATORE_IMPRONTA=${sha(byte)}\n`]]);
});

test('LNP-12 la costruzione del rilascio che non riesce (cargo, prova di fumo, exe assente) esce 1 e non scrive niente in GITHUB_ENV', async (t) => {
  const { costruisciLanciatore, daRigaDiComando } = await costruttore();
  const crate = crateFinta(t);
  for (const cade of ['cargo', 'node-di-prova', 'nessuno']) {
    const esegui = (comando) => { if (comando === cade) throw new Error(`${comando} non riuscito`); };
    const scritto = [];
    const errori = [];
    const codice = daRigaDiComando({ argomenti: [], ambiente: { GITHUB_ENV: 'env.txt' }, costruisci: (o) => costruisciLanciatore({ ...o, crate, esegui, node: 'node-di-prova', target: join(crate, 'target') }),
      scriviAmbiente: (f, testo) => scritto.push(testo), scrivi: () => {}, errore: (r) => errori.push(r) });
    assert.equal(codice, 1, cade);
    assert.deepEqual(scritto, [], `${cade}: nessuna impronta per il pacchetto`);
    assert.match(errori.join('\n'), /^Lanciatore dei comandi non pronto/u);
  }
  assert.equal(daRigaDiComando({ argomenti: ['--bersaglio'], costruisci: () => { throw new Error('mai'); }, scrivi: () => {}, errore: () => {} }), 1);
});

/* Secondi uccisori: ogni mutante delle righe nuove muore per almeno due prove diverse (regola del brief, 13/11/2026). */
test('LNP-13 riferimento fissato a mano: l exe in lanciatore-bin che non torna FERMA la build locale; nel rilascio il riferimento non basta mai', async (t) => {
  const { copiaLanciatore } = await modulo();
  const b = banco(t);
  const fissato = banco(t, { riferimentoFissato: b.impronta });
  writeFileSync(join(fissato.native, 'lanciatore-bin', 'talos-lanciatore.exe'), randomBytes(4096));
  await assert.rejects(copiaLanciatore({ ambiente: {}, native: fissato.native, destinazione: fissato.destinazione }), /SHA256 della copia nel pacchetto/u, 'l exe in lanciatore-bin si verifica col riferimento');
  assert.equal(existsSync(join(fissato.destinazione, 'lanciatore-bin', 'talos-lanciatore.exe')), false);
  copyFileSync(b.exe, join(fissato.native, 'lanciatore-bin', 'talos-lanciatore.exe'));
  await assert.rejects(copiaLanciatore({ ambiente: { TALOS_PACCHETTO_RILASCIO: '1' }, native: fissato.native, destinazione: fissato.destinazione }), /nel rilascio l'impronta manca/u, 'nel rilascio solo l impronta dello stesso commit');
  assert.equal(existsSync(join(fissato.destinazione, 'lanciatore-bin', 'talos-lanciatore.exe')), false);
  assert.equal(existsSync(join(fissato.destinazione, 'lanciatore-binding.json')), false);
});

/** Un nucleo dell'app finto che registra l'ambiente con cui lo si interroga e risponde come gli si dice. */
function nucleoFinto(risorse, risposta) {
  writeFileSync(join(risorse, 'harness-ui', 'src', 'kernel', 'lanciatore-windows.mjs'),
    `export function trovaLanciatore({ ambiente }) { globalThis.__ambienteLnp = ambiente; return ${JSON.stringify(risposta)}; }\n`);
}

test('LNP-14 controllo dell installato: un tag desktop-v senza lanciatore è rosso; se il nucleo dell app non lo trova, il controllo è rosso', async (t) => {
  const { controllaLanciatoreInstallato } = await modulo();
  const senza = banco(t);
  const risorseSenza = await risorseFinte(t, senza, { manifestLanciatore: { incluso: false, motivo: 'non-fissato' } });
  await assert.rejects(controllaLanciatoreInstallato({ risorse: risorseSenza, ambiente: { GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/tags/desktop-v0.2.3' } }), /Pacchetto di rilascio senza il lanciatore/u);
  const b = banco(t);
  const risorse = await risorseFinte(t, b);
  nucleoFinto(risorse, { percorso: null, motivo: 'impronta' });
  await assert.rejects(controllaLanciatoreInstallato({ risorse, ambiente: {} }), /Il nucleo dell'app non trova il lanciatore: impronta/u);
});

test('LNP-15 controllo dell installato: il nucleo dell app si interroga in modalità app e deve indicare PROPRIO l exe del pacchetto', async (t) => {
  const { controllaLanciatoreInstallato } = await modulo();
  const b = banco(t);
  const risorse = await risorseFinte(t, b);
  nucleoFinto(risorse, { percorso: b.exe, motivo: null });
  await assert.rejects(controllaLanciatoreInstallato({ risorse, ambiente: {} }), /Il nucleo dell'app non trova il lanciatore/u, 'un altro exe non vale');
  assert.ok(globalThis.__ambienteLnp?.TALOS_DESKTOP_DATA_DIR, 'interrogato in modalità app');
  assert.equal(globalThis.__ambienteLnp.TALOS_LANCIATORE, undefined, 'senza la via di sviluppo');
});

test('LNP-16 la costruzione del rilascio: exe costruito ma prova di fumo rossa ⇒ esce 1, niente in GITHUB_ENV', async (t) => {
  const { costruisciLanciatore, daRigaDiComando } = await costruttore();
  const crate = crateFinta(t);
  const chiamate = [];
  const esegui = (comando) => {
    chiamate.push(comando);
    if (comando === 'cargo') { mkdirSync(join(crate, 'target', 'x86_64-pc-windows-msvc', 'release'), { recursive: true }); writeFileSync(join(crate, 'target', 'x86_64-pc-windows-msvc', 'release', 'talos-lanciatore.exe'), randomBytes(64)); }
    if (comando === 'node-di-prova') throw new Error('prova di fumo rossa');
  };
  const scritto = [];
  const codice = daRigaDiComando({ argomenti: [], ambiente: { GITHUB_ENV: 'env.txt' }, costruisci: (o) => costruisciLanciatore({ ...o, crate, esegui, node: 'node-di-prova', target: join(crate, 'target') }),
    scriviAmbiente: (f, testo) => scritto.push(testo), scrivi: () => {}, errore: () => {} });
  assert.equal(codice, 1);
  assert.deepEqual(scritto, []);
  assert.deepEqual(chiamate, ['rustup', 'cargo', 'node-di-prova']);
});

test('LNP-17 (d) la prova prima del tag fallisce se il lanciatore non è pronto, e prepara-pacchetto chiama la copia una volta', () => {
  const passo = passiDi('desktop-pretag-installer.yml', 'desktop-installer').find((p) => /lanciatore dei comandi/u.test(p.name ?? ''));
  assert.ok(passo, 'manca il passo del lanciatore nella prova prima del tag');
  assert.match(passo.run, COMANDO);
  assert.match(passo.run, /\$LASTEXITCODE -ne 0\) \{ throw 'Lanciatore dei comandi non pronto\.' \}/u);
  assert.equal(passo.if, undefined);
  const prepara = readFileSync(new URL('../scripts/prepara-pacchetto.mjs', import.meta.url), 'utf8');
  assert.equal(prepara.match(/await copiaLanciatore\(/gu)?.length, 1, 'prepara-pacchetto copia il lanciatore');
  assert.match(prepara, /rigaDelPacchetto\(lanciatore\)/u);
});

/*
 * Unione vera (agente d unione, 14/11/2026, revisore lanc9 punto 5): il mutante K8 (segno della prova prima del tag '1'→'0') lo
 *   uccideva solo LNP-10, che confronta il testo. Seconda prova dal comportamento: l ambiente che ogni flusso dà al lavoro, letto dal
 *   modulo stesso, è un RILASCIO (senza impronta si ferma, con l impronta dello stesso commit copia l exe), fuori da GitHub Actions.
 */
test('LNP-18 (d) l ambiente di ogni flusso del pacchetto di rilascio, letto dal modulo, è un rilascio: senza impronta si ferma, con quella dello stesso commit copia (K8, seconda prova)', async (t) => {
  const { copiaLanciatore, rilascioDaAmbiente } = await modulo();
  for (const [nome, lavoro] of [['release.yml', 'desktop'], ['desktop-pretag-installer.yml', 'desktop-installer']]) {
    const ambiente = { ...flusso(nome).jobs[lavoro].env };
    assert.equal(rilascioDaAmbiente(ambiente), true, `${nome}: l ambiente del lavoro non è un rilascio`);
    const b = banco(t);
    await assert.rejects(copiaLanciatore({ ambiente, native: b.native, destinazione: b.destinazione }), /nel rilascio l'impronta manca/u, `${nome}: senza impronta deve fermarsi`);
    assert.equal(existsSync(join(b.destinazione, 'lanciatore-bin', 'talos-lanciatore.exe')), false, `${nome}: niente nel pacchetto`);
    const esito = await copiaLanciatore({ ambiente: { ...ambiente, TALOS_LANCIATORE_SORGENTE: b.exe, TALOS_LANCIATORE_IMPRONTA: b.impronta }, native: b.native, destinazione: b.destinazione });
    assert.deepEqual([esito.incluso, esito.origine, esito.sha256], [true, 'stesso-commit', b.impronta], nome);
  }
});
