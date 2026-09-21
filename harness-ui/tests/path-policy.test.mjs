import assert from 'node:assert/strict';
import { mkdtemp, mkdir, open, readFile, realpath, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { ePercorsoDiControllo, esceDalWorkspaceVersoUnNascosto, FILE_DI_CONTROLLO, motivoDaChiedere, nominaUnSegreto, PathPolicyError, PERCORSI_SEGRETI, isPathInside, openContainedFile, resolveContainedRealPath } from '../src/path-policy.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * ⛔⛔⛔ 30/8 — questo file testava `createPathPolicy()` (5 test, tutti su
 * campagne TALOS-BANCO) — rimossa insieme al resto della lettura delle
 * campagne (piano "Board — da campagne TALOS-BANCO a cruscotto sessioni").
 * `isPathInside`/`PathPolicyError` restano vive (usate da
 * workspace-files.mjs/workspace-tree.mjs per il containment del
 * workspace) ma non avevano MAI un test proprio, solo indiretto via
 * createPathPolicy — questi test lo colmano, non solo lo spostano.
 */

test('isPathInside: un discendente reale è dentro la radice', () => {
  const root = resolve('/tmp/talos-radice');
  assert.equal(isPathInside(root, join(root, 'sotto', 'file.txt')), true);
});

test('isPathInside: la radice stessa è dentro se stessa', () => {
  const root = resolve('/tmp/talos-radice');
  assert.equal(isPathInside(root, root), true);
});

test('isPathInside AL CONTRARIO: ".." fuori dalla radice è rifiutato', () => {
  const root = resolve('/tmp/talos-radice');
  assert.equal(isPathInside(root, resolve(root, '..', 'fuori.txt')), false);
});

test('isPathInside AL CONTRARIO: un fratello con lo stesso prefisso testuale non è "dentro"', () => {
  // ⛔ il bug classico del containment ingenuo: confrontare le stringhe
  // farebbe passare "/tmp/talos-radice-evil" come "dentro"
  // "/tmp/talos-radice" perché il prefisso combacia — isPathInside usa
  // `relative()`, non un prefisso di stringa, e deve rifiutarlo.
  const root = resolve('/tmp/talos-radice');
  const sibling = resolve('/tmp/talos-radice-evil/file.txt');
  assert.equal(isPathInside(root, sibling), false);
});

test('PathPolicyError: nome e codice di default corretti', () => {
  const errore = new PathPolicyError('percorso non ammesso');
  assert.equal(errore.name, 'PathPolicyError');
  assert.equal(errore.code, 'PATH_NOT_ALLOWED');
  assert.ok(errore instanceof Error);
});

test('PathPolicyError: un codice esplicito sovrascrive il default', () => {
  const errore = new PathPolicyError('non inizializzata', 'CONFIG_INVALID');
  assert.equal(errore.code, 'CONFIG_INVALID');
});

test('resolveContainedRealPath: risolve un file reale dentro la radice e rifiuta traversal', async (t) => {
  // 13/09: sui runner GitHub `tmpdir()` è nella forma corta 8.3 (`C:\Users\RUNNER~1\…`) e la
  // funzione risponde col percorso vero (`runneradmin`): la radice si confronta già risolta.
  const root = await realpath(await mkdtemp(join(tmpdir(), 'talos-path-policy-')));
  t.after(() => rimuoviCartellaDiProvaAttesa(root));
  await writeFile(join(root, 'ok.txt'), 'ok');
  assert.equal(await resolveContainedRealPath(root, 'ok.txt'), resolve(root, 'ok.txt'));
  await assert.rejects(() => resolveContainedRealPath(root, '../fuori.txt'), { code: 'PATH_NOT_ALLOWED' });
  await assert.rejects(() => resolveContainedRealPath(root, resolve(root, 'ok.txt')), { code: 'PATH_NOT_ALLOWED' });
});

test('resolveContainedRealPath: un link simbolico che esce dalla radice viene rifiutato', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'talos-path-policy-'));
  const outside = await mkdtemp(join(tmpdir(), 'talos-path-policy-outside-'));
  t.after(async () => { await rimuoviCartellaDiProvaAttesa(root); await rimuoviCartellaDiProvaAttesa(outside); });
  await writeFile(join(outside, 'segreto.txt'), 'segreto');
  try {
    await symlink(outside, join(root, 'link'), 'junction');
  } catch (error) {
    t.skip(`il sistema non consente di creare una junction: ${error.code || error.message}`);
    return;
  }
  await assert.rejects(() => resolveContainedRealPath(root, 'link/segreto.txt'), { code: 'PATH_NOT_ALLOWED' });
});

test('openContainedFile: apre il file dentro la radice e non lascia handle su errore', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'talos-path-policy-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(root));
  await writeFile(join(root, 'ok.txt'), 'contenuto');
  const handle = await openContainedFile(root, 'ok.txt', 'r');
  assert.equal(await handle.readFile({ encoding: 'utf8' }), 'contenuto');
  await handle.close();
  await assert.rejects(() => openContainedFile(root, '../fuori.txt', 'r'), { code: 'PATH_NOT_ALLOWED' });
});

/*
 * ⭐⭐⭐ 04/9 — W1-13, `ePercorsoDiControllo`. Tutte su una cartella VERA
 * (mkdtemp), mai finta: la funzione risolve il percorso REALE sul
 * filesystem (esisteSync/realpathSync), quindi un test con percorsi solo
 * immaginati proverebbe un ramo diverso da quello che gira in produzione.
 */

test('ePercorsoDiControllo: veri per NOME, a qualunque profondità — anche un file che non esiste ancora', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'talos-controllo-nome-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(root));
  for (const nome of FILE_DI_CONTROLLO.file) {
    assert.equal(ePercorsoDiControllo(root, nome), true, `${nome} alla radice`);
    assert.equal(ePercorsoDiControllo(root, `sotto/annidato/${nome}`), true, `${nome} annidato`);
  }
});

test('ePercorsoDiControllo AL CONTRARIO: un file del progetto normale (src/a.js) è falso', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'talos-controllo-nome-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(root));
  assert.equal(ePercorsoDiControllo(root, 'src/a.js'), false);
  assert.equal(ePercorsoDiControllo(root, 'a.js'), false);
});

test('ePercorsoDiControllo: vero per le CARTELLE OVUNQUE (.harness-ui-plugins, .hooks-trust, .claude, .memory-store), a qualunque profondità', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'talos-controllo-cartella-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(root));
  for (const cartella of FILE_DI_CONTROLLO.cartelleOvunque) {
    assert.equal(ePercorsoDiControllo(root, `${cartella}/qualsiasi`), true, `${cartella}/qualsiasi alla radice`);
    assert.equal(ePercorsoDiControllo(root, `molto/annidato/${cartella}/x`), true, `${cartella}/x annidato`);
  }
});

test('ePercorsoDiControllo (F02, 14/09): i registri di fiducia .mcp-trust e .plugin-trust sono protetti, per nome e via alias', async (t) => {
  /*
   * ⛔ Nominati a mano, non presi da `FILE_DI_CONTROLLO.cartelleOvunque`: se un giorno qualcuno li togliesse dall'elenco
   *   (come erano assenti fino al 14/09), un test che itera l'elenco resterebbe verde. Questo diventa rosso.
   * Sono i registri dei consensi a MCP e ai plugin: se il modello potesse scriverci dentro, si auto-concederebbe la fiducia.
   */
  const root = await realpath(await mkdtemp(join(tmpdir(), 'talos-trust-')));
  t.after(() => rimuoviCartellaDiProvaAttesa(root));
  for (const cartella of ['.mcp-trust', '.plugin-trust']) {
    assert.equal(ePercorsoDiControllo(root, `${cartella}/grant.json`), true, `${cartella} diretta`);
    assert.equal(ePercorsoDiControllo(root, `progetto/${cartella}/grant.json`), true, `${cartella} annidata`);
  }
  // via alias/symlink: ePercorsoDiControllo risolve il realpath, quindi il consenso resta protetto anche dietro un link.
  await mkdir(join(root, '.mcp-trust'), { recursive: true });
  await symlink(join(root, '.mcp-trust'), join(root, 'alias-trust'), 'junction');
  assert.equal(ePercorsoDiControllo(root, 'alias-trust/grant.json'), true, 'un alias verso .mcp-trust resta protetto');
});

test('ePercorsoDiControllo AL CONTRARIO: un nome di cartella SIMILE ma diverso non è protetto — match esatto sul segmento, non un prefisso', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'talos-controllo-cartella-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(root));
  // ⛔ il bug classico "STRINGERE la guardia": un confronto per prefisso
  // farebbe passare ".claude-backup"/".hooks-trust-vecchio" come protetti.
  assert.equal(ePercorsoDiControllo(root, '.claude-backup/x'), false);
  assert.equal(ePercorsoDiControllo(root, '.hooks-trust-vecchio/x'), false);
  assert.equal(ePercorsoDiControllo(root, 'mie-skills/x'), false);
});

test('ePercorsoDiControllo: vero per skills/** SOLO alla radice del workspace', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'talos-controllo-skills-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(root));
  assert.equal(ePercorsoDiControllo(root, 'skills/x.md'), true);
  assert.equal(ePercorsoDiControllo(root, 'skills/sotto/y.md'), true);
});

test('ePercorsoDiControllo AL CONTRARIO: skills annidata sotto un\'altra cartella NON è protetta — un progetto che si chiama così non diventa tutto intoccabile', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'talos-controllo-skills-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(root));
  assert.equal(ePercorsoDiControllo(root, 'progetto/skills/x.md'), false);
});

test('ePercorsoDiControllo: vero anche passando da "../" — un file di controllo del genitore non si aggira uscendo dalla radice', async (t) => {
  const genitore = await mkdtemp(join(tmpdir(), 'talos-controllo-dotdot-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(genitore));
  const workspace = join(genitore, 'workspace');
  await mkdir(workspace);
  await writeFile(join(genitore, 'CLAUDE.md'), '# regole vere');
  assert.equal(ePercorsoDiControllo(workspace, '../CLAUDE.md'), true);
});

test('ePercorsoDiControllo AL CONTRARIO: "../" da sola, verso un file NORMALE del genitore, resta falso', async (t) => {
  const genitore = await mkdtemp(join(tmpdir(), 'talos-controllo-dotdot-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(genitore));
  const workspace = join(genitore, 'workspace');
  await mkdir(workspace);
  await writeFile(join(genitore, 'altro.txt'), 'niente di speciale');
  assert.equal(ePercorsoDiControllo(workspace, '../altro.txt'), false);
});

test('ePercorsoDiControllo: vero anche attraverso un link/junction che punta a un file di controllo VERO, pure con un nome di link innocuo', async (t) => {
  const radice = await mkdtemp(join(tmpdir(), 'talos-controllo-link-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(radice));
  const workspace = join(radice, 'workspace');
  const vero = join(radice, 'vero');
  await mkdir(workspace);
  await mkdir(vero);
  await writeFile(join(vero, 'CLAUDE.md'), '# regole vere');
  await writeFile(join(vero, 'normale.txt'), 'niente di speciale');
  try {
    await symlink(vero, join(workspace, 'collegamento'), 'junction');
  } catch (error) {
    t.skip(`il sistema non consente di creare una junction: ${error.code || error.message}`);
    return;
  }
  assert.equal(ePercorsoDiControllo(workspace, 'collegamento/CLAUDE.md'), true, 'il link punta a un file di controllo VERO: il nome del link non lo nasconde');
  // AL CONTRARIO, stesso link: un file normale raggiunto dallo stesso collegamento resta falso — non è il link a scattare, è la destinazione.
  assert.equal(ePercorsoDiControllo(workspace, 'collegamento/normale.txt'), false);
});

test('ePercorsoDiControllo: vero attraverso un link/junction che punta DENTRO una cartella OVUNQUE reale (fuori dal workspace)', async (t) => {
  const radice = await mkdtemp(join(tmpdir(), 'talos-controllo-link-cartella-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(radice));
  const workspace = join(radice, 'workspace');
  const claudeVera = join(radice, '.claude');
  await mkdir(workspace);
  await mkdir(claudeVera);
  await writeFile(join(claudeVera, 'nota.txt'), 'segreto');
  try {
    await symlink(claudeVera, join(workspace, 'segreto'), 'junction');
  } catch (error) {
    t.skip(`il sistema non consente di creare una junction: ${error.code || error.message}`);
    return;
  }
  assert.equal(ePercorsoDiControllo(workspace, 'segreto/nota.txt'), true, 'il link porta dentro ".claude" reale, anche se il segmento visibile nel percorso è "segreto"');
});

test('ePercorsoDiControllo: fallisce CHIUSO — un realpathFn che lancia torna sempre true, mai un\'eccezione propagata', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'talos-controllo-fallisce-chiuso-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(root));
  const realpathCheGetta = () => { throw new Error('disco non leggibile'); };
  // AL CONTRARIO del test "src/a.js è falso" sopra: stesso percorso, stesso file, MA il canale di risoluzione è rotto — qui deve tornare true, non false.
  assert.equal(ePercorsoDiControllo(root, 'src/a.js', { realpathFn: realpathCheGetta }), true);
});

test('ePercorsoDiControllo AL CONTRARIO: input degeneri (non stringa, vuoti) tornano falso, mai un\'eccezione', () => {
  assert.equal(ePercorsoDiControllo(123, 'x'), false);
  assert.equal(ePercorsoDiControllo('', 'x'), false);
  assert.equal(ePercorsoDiControllo('/x', ''), false);
  assert.equal(ePercorsoDiControllo('/x', null), false);
  assert.equal(ePercorsoDiControllo(undefined, undefined), false);
});

/*
 * ⛔⛔⛔⛔ F15 (17/09/2026) — LA GRAMMATICA DEI SEGRETI, provata da sola.
 *
 * Questi test non avviano nessuna sessione e non toccano il disco: `motivoDaChiedere` e le sue
 * due metà sono funzioni PURE, ed è il motivo per cui stanno qui invece che nel kernel. Le prove
 * end-to-end (il cancello che chiede davvero, lo stop, il «nega» che resta «nega») stanno in
 * `tests/shell-chiede-davanti-a-un-segreto.test.mjs`.
 *
 * ⛔ `home` e `cartella` sono SEMPRE passate a mano: una prova che cambia esito a seconda della
 *   macchina su cui gira non è una prova.
 */
const HOME_DI_PROVA = '/casa/persona';
const LAVORO_DI_PROVA = '/casa/persona/progetti/talos';
const daChiedere = (comando) => motivoDaChiedere({ tipo: 'shell', comando, cartella: LAVORO_DI_PROVA, home: HOME_DI_PROVA });

test('F15 — la CLASSE DICHIARATA innesca la domanda, in tutte le sue voci', () => {
  const nominano = [
    'cat .env', 'cat .env.local', 'cat config/.env.production', 'cat prod.env',
    'cat ~/.ssh/id_rsa', 'ls ~/.ssh', 'cat ~/.ssh/config',
    'cat ~/.aws/credentials', 'cat ~/.gnupg/secring.gpg', 'cat ~/.netrc', 'cat ~/.npmrc', 'cat ~/.pypirc',
    'cat ~/.docker/config.json', 'cat ~/.kube/config',
    'openssl x509 -in server.pem', 'cat chiave.key', 'cat certificato.p12', 'cat certificato.pfx',
    'cat id_ed25519', 'cat ../.provider-runtime.json', 'cat ~/.local/share/keyrings/login.keyring',
    'cmdkey /list', 'vaultcmd /list', 'secret-tool search servizio talos',
    'security find-generic-password -s talos',
  ];
  const muti = nominano.filter((c) => daChiedere(c) === null);
  assert.deepEqual(muti, [], `queste voci della classe dichiarata devono innescare la domanda: ${muti.join(' · ')}`);
});

test('F15 — le tre scritture della home e i separatori Windows portano allo STESSO esito', () => {
  for (const scrittura of ['~/.aws/credentials', '$HOME/.aws/credentials', '${HOME}/.aws/credentials', '%USERPROFILE%/.aws/credentials', '~\\.aws\\credentials', '"~/.aws/credentials"']) {
    assert.notEqual(daChiedere(`cat ${scrittura}`), null, `«${scrittura}» deve innescare come le altre`);
  }
});

/*
 * ⛔⛔⛔ B2, 17/09/2026 — IL TEST QUI SOPRA NON MORDEVA, e l'ha trovato il controllore
 * togliendo l'espansione della home e rilanciando: la suite restava 52/52. Il motivo è che ogni
 * suo caso nomina `.aws`, che appartiene alla CLASSE e scatta comunque, espansione o no —
 * misurava il secondo innesco credendo di misurare il primo.
 * ⇒ Questi casi innescano SOLO via CONFINE, cioè soltanto se la home viene espansa davvero:
 *   senza espansione il pezzo resta relativo, risolve DENTRO il workspace, e la domanda sparisce.
 *   Sono i tre casi che diventano rossi se la riga dell'espansione se ne va.
 */
test('F15 — B2: i casi che MORDONO sull\'espansione della home (solo confine, nessuna voce della classe)', () => {
  for (const comando of [
    'cat %USERPROFILE%\\.config\\appunti.txt',
    'Get-Content $env:USERPROFILE\\.vault\\nota.txt',
    'cat $HOME/.config/x',
    'cat ${HOME}/.config/x',
    'cat ~/.config/x',
  ]) {
    const esito = daChiedere(comando);
    assert.equal(esito?.classe, 'fuori-workspace-nascosto', `«${comando}» deve innescare SOLO via confine — cioè solo se la home è stata espansa`);
  }
  // ⛔ AL CONTRARIO nello stesso test: senza la home davanti, le stesse cartelle nascoste sono
  //   dentro il workspace e NON chiedono. È la prova che sopra si misura l'espansione, non altro.
  for (const comando of ['cat .config/appunti.txt', 'cat .vault/nota.txt', 'cat .config/x']) {
    assert.equal(daChiedere(comando), null, `«${comando}» è dentro il workspace: non deve chiedere`);
  }
});

test('F15 AL CONTRARIO — i comandi comuni NON chiedono: ogni «chiedi» in più addestra a cliccare sì', () => {
  const comuni = [
    'echo $HOME', 'echo ~', 'ls -la', 'ls', 'git status --short', 'git log --oneline -3',
    'npm run test:kernel', 'npm install', 'node --version', 'node scripts/x.mjs --sorgente=src/app.js',
    'grep -rn "chiave" ./src', 'cat package.json', 'mkdir -p build/out', 'rm build/tmp.txt',
    'curl https://example.com/.well-known/openid-configuration', 'echo fatto > build/marker.txt',
    'cat .env.example', 'cat .env.sample', 'cat id_rsa.pub', 'cat .ssh/id_rsa.pub',
    'cat .cache/appunti.txt', 'ls ./.git', 'cat ../fratello/note.txt', 'cd .. && ls',
  ];
  const chiesti = comuni.filter((c) => daChiedere(c) !== null);
  assert.deepEqual(chiesti, [], `questi comandi NON devono chiedere: ${chiesti.join(' · ')}`);
});

/*
 * ⛔⛔⛔ B3, 17/09/2026 — L'ESENZIONE `.pub` VINCE ANCHE SUL CONFINE, e prima non era così.
 *
 * Il difetto era una incoerenza fra codice, commento e test: il commento su `esenzioniOvunque`
 * portava come esempio `~/.ssh/id_rsa.pub`, e proprio su quell'esempio l'esenzione era INERTE —
 * il percorso chiedeva lo stesso, inciampando nel confine. Un'esenzione che non esenta il caso
 * che il suo commento cita non è un'esenzione: è una frase.
 * ⇒ Scelta (indicazione del controllore, e la ragione regge): una chiave pubblica è pubblica,
 *   chiedere lì insegna a cliccare sì e la volta che conta — `id_rsa`, senza `.pub` — la persona
 *   clicca sì per abitudine. Vale SOLO per `.pub` e SOLO per il file: la CARTELLA `~/.ssh` resta
 *   un segreto, perché `ls ~/.ssh` elenca anche ciò che pubblico non è.
 */
test('F15 — B3: `.pub` è esente in entrambi gli inneschi, la cartella no', () => {
  assert.equal(daChiedere('cat .ssh/id_rsa.pub'), null, 'dentro il workspace');
  assert.equal(daChiedere('cat ~/.ssh/id_rsa.pub'), null, 'e fuori: l\'esenzione vince anche sul confine');
  assert.equal(daChiedere('cat ~/.config/chiave.pub'), null, 'una chiave pubblica è pubblica ovunque stia');
  assert.equal(daChiedere('cat ~/.ssh/id_rsa')?.classe, 'segreto', 'ma la chiave PRIVATA resta un segreto');
  assert.equal(daChiedere('ls ~/.ssh')?.classe, 'segreto', 'e la CARTELLA resta un segreto: elenca anche ciò che pubblico non è');
  assert.equal(daChiedere('cat ~/.ssh/config')?.classe, 'segreto', 'e ogni altro file lì dentro pure');
  assert.equal(daChiedere('cat ~/.config/nota.txt')?.classe, 'fuori-workspace-nascosto', 'un file NON `.pub` fuori dal workspace inciampa ancora nel confine');
});

test('F15 — il CONFINE vuole DUE condizioni: fuori dal workspace E nascosto', () => {
  const fuoriENascosto = esceDalWorkspaceVersoUnNascosto('../.config/appunti.txt', { cartella: LAVORO_DI_PROVA, home: HOME_DI_PROVA });
  assert.equal(fuoriENascosto?.classe, 'fuori-workspace-nascosto');
  // Fuori ma NON nascosto: no. Nascosto ma DENTRO: no. Nessuna delle due: no.
  assert.equal(esceDalWorkspaceVersoUnNascosto('../fratello/note.txt', { cartella: LAVORO_DI_PROVA, home: HOME_DI_PROVA }), null);
  assert.equal(esceDalWorkspaceVersoUnNascosto('.cache/appunti.txt', { cartella: LAVORO_DI_PROVA, home: HOME_DI_PROVA }), null);
  assert.equal(esceDalWorkspaceVersoUnNascosto('src/app.js', { cartella: LAVORO_DI_PROVA, home: HOME_DI_PROVA }), null);
  // ⛔ Senza radice non si può dire «fuori»: si tace, non si indovina.
  assert.equal(esceDalWorkspaceVersoUnNascosto('../.config/appunti.txt', { home: HOME_DI_PROVA }), null);
});

test('F15 — la COPIA per la persona: lingua naturale, nomina il file, nessun nome tecnico', () => {
  const comando = daChiedere('cat ~/.ssh/id_rsa');
  assert.equal(comando.frase, 'Il comando tocca un file che può contenere chiavi o password (~/.ssh/id_rsa): vuoi che lo esegua?');
  const lettura = motivoDaChiedere({ tipo: 'leggi', percorso: '~/.aws/credentials', cartella: LAVORO_DI_PROVA, home: HOME_DI_PROVA });
  assert.equal(lettura.frase, 'Questa lettura apre un file che può contenere chiavi o password (~/.aws/credentials): vuoi che la faccia?');
  const portachiavi = daChiedere('cmdkey /list');
  assert.equal(portachiavi.frase, 'Il comando apre il portachiavi del sistema, dove sono custodite le password: vuoi che lo esegua?');
  const confine = daChiedere('cat ../.config/appunti.txt');
  assert.equal(confine.frase, 'Il comando tocca una cartella nascosta fuori dalla cartella di lavoro (../.config/appunti.txt): vuoi che lo esegua?');
  for (const frase of [comando.frase, lettura.frase, portachiavi.frase, confine.frase]) {
    for (const tecnico of ['shell', 'leggi', 'workspace', 'PERCORSI_SEGRETI', 'permessiPerAttrezzo', 'null']) {
      assert.ok(!frase.includes(tecnico), `nessun nome tecnico nella copia: «${tecnico}» in «${frase}»`);
    }
  }
});

test('F15 AL CONTRARIO — input degeneri tornano null, mai un\'eccezione', () => {
  for (const testo of [undefined, null, '', '   ', 123, {}]) {
    assert.equal(motivoDaChiedere({ tipo: 'shell', comando: testo, cartella: LAVORO_DI_PROVA, home: HOME_DI_PROVA }), null);
  }
  assert.equal(motivoDaChiedere(), null);
  assert.equal(nominaUnSegreto('', { home: HOME_DI_PROVA }), null);
  assert.equal(esceDalWorkspaceVersoUnNascosto(null, { cartella: LAVORO_DI_PROVA }), null);
});

test('F15 — la classe è DICHIARATA e congelata: chi la legge non può cambiarla per sbaglio', () => {
  assert.equal(Object.isFrozen(PERCORSI_SEGRETI), true);
  assert.equal(Object.isFrozen(PERCORSI_SEGRETI.cartelle), true);
  assert.ok(PERCORSI_SEGRETI.cartelle.includes('.ssh') && PERCORSI_SEGRETI.cartelle.includes('.aws'));
  // ⛔ Il file delle chiavi di TALOS sta in ENTRAMBE le liste, e le due dicono cose diverse:
  //   `FILE_DI_CONTROLLO` guarda le SCRITTURE del modello, questa guarda shell e letture.
  assert.ok(PERCORSI_SEGRETI.nomiFile.includes('.provider-runtime.json'));
  assert.ok(FILE_DI_CONTROLLO.file.includes('.provider-runtime.json'));
});
