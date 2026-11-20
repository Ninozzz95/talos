import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, existsSync, symlinkSync, unlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';
import * as kernel from '../src/kernel/talosHarness.mjs';
import { scrittureDelComando } from '../src/kernel/scritture-della-shell.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const { talosLavora, verificaPermessoScrittura, cartaForzataPrevista } = kernel;

/*
 * ⛔⛔ 0.2.4 B3 (owner 17/11/2026 13:40, richiesta 154; forma `FORMA-024-B3-SCRIVE-NEL-PROGETTO-2026-11-18.md`) — in «Scrive nel progetto»
 *   chiedono anche i COMANDI che scrivono o cancellano fuori dal progetto. Prima della cura (misura del 19/11 su bb6d3799a): dei 20
 *   comandi che scrivono fuori ne chiedeva 1 (`sed -i … ~/.bashrc`, e solo come file nascosto fuori: la guardia dei segreti).
 * ⛔ NESSUNA PROVA ESEGUE UN COMANDO: le stringhe sono testo per il cancello. Nel giro vero (FILO) la persona risponde sempre «no», e il
 *   comando del modello è scelto innocuo anche se partisse (scrive in una cartella che non esiste: fallisce senza toccare niente).
 */

/** Una radice di prova con progetto, fuori, casa e temporanea SUE (la temporanea del sistema non deve contenere progetto e fuori). */
function radice(t) {
  /* .native: on Windows the temp folder can sit under an 8.3 short name (RUNNER~1); the plain realpathSync keeps it short. */
  const r = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-b3-')));
  const progetto = join(r, 'lavori', 'progetto');
  const fuori = join(r, 'lavori', 'fuori');
  const casa = join(r, 'casa');
  const temporanea = join(r, 'tmp');
  for (const d of [progetto, join(progetto, 'src'), join(progetto, 'dist'), fuori, casa, temporanea]) mkdirSync(d, { recursive: true });
  const era = { TEMP: process.env.TEMP, TMP: process.env.TMP, TMPDIR: process.env.TMPDIR, HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  Object.assign(process.env, { TEMP: temporanea, TMP: temporanea, TMPDIR: temporanea, HOME: casa, USERPROFILE: casa });
  const collegamenti = [];
  t.after(() => {
    for (const [k, v] of Object.entries(era)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    for (const p of collegamenti) { try { unlinkSync(p); } catch { /* già via */ } }
    return rimuoviCartellaDiProva(r);
  });
  const collega = (bersaglio, nome) => { const p = join(progetto, nome); symlinkSync(bersaglio, p, 'junction'); collegamenti.push(p); return p; };
  return { r, progetto, fuori, casa, temporanea, collega };
}

async function cancello(comando, { cartella, livelloAccesso = 'scrittura-progetto', risposta = false, ...resto } = {}) {
  const domande = [];
  const esito = await verificaPermessoScrittura({ tipo: 'shell', comando }, {
    livelloAccesso, cartella, chiediApprovazioneFn: async (a) => { domande.push(a); return risposta; }, ...resto,
  });
  return { esito, domande };
}

/* I 40 comandi di lavoro vero (rumore.md): solo questi tre scrivono davvero fuori. */
const LAVORO = ['npm install', 'npm ci', 'npm run build', 'npm test', 'npx tsc --noEmit', 'git status', 'git add -A', 'git commit -m "fix: x"',
  'git pull', 'git stash', 'pip install -r requirements.txt', 'python -m venv .venv', '.venv/bin/pip install -r requirements.txt', 'cargo build',
  'node script.mjs > out.txt', 'mkdir -p src/x && touch src/x/a.ts', 'rm -rf dist node_modules', 'cp a.txt b.txt', "sed -i 's/a/b/' src/app.js",
  'curl -L -o file.zip https://example.com/file.zip', 'tar -xf file.tar', 'npm test 2>/dev/null', 'node build.mjs > /tmp/log 2>&1',
  'echo hi > "$TMPDIR/x.txt"', 'git config user.name "Nino"', 'git config --global user.email a@b.c', 'npm i -g typescript', 'code .',
  'docker build -t app .', 'ls -la | grep x > list.txt', 'cd src && npm run lint -- --fix', 'find . -name "*.log" -delete', 'mv old.txt new.txt',
  'unzip -o file.zip -d vendor', 'python manage.py migrate 2>&1 | tee build.log', 'git checkout -b feature/x', 'Remove-Item -Recurse -Force dist',
  'New-Item -ItemType Directory -Path src\\nuovo', 'echo ok > NUL', 'git clone https://github.com/x/y.git vendor/y'];
const FUORI_DAVVERO = new Set(['pip install -r requirements.txt', 'git config --global user.email a@b.c', 'npm i -g typescript']);
/* I 20 che scrivono fuori: tutti chiedono. */
const FUORI = ['rm -rf ../fuori/build', 'rm -rf ~/Desktop/vecchio', 'echo x > ~/note.txt', 'cp report.pdf ~/Documents/', 'mv data.csv ../fuori/',
  'mkdir -p ~/progetti/nuovo', 'touch ../fuori.txt', "sed -i 's/a/b/' ~/.bashrc", 'npm test | tee -a ~/log.txt',
  'curl -o ~/Downloads/f.zip https://example.com/f.zip', 'tar -xf a.tar -C ~/estratti', 'unzip a.zip -d ../fuori', 'git clone https://x.org/y.git ~/y',
  'git -C ../fuori commit -am x', 'cd .. && rm -rf fuori/vecchio', 'Remove-Item -Recurse ~\\Desktop\\x', 'Copy-Item a.txt -Destination ..\\fuori\\a.txt',
  'cmd /c del ..\\fuori\\x.txt', 'ln -s src ~/collegamento', 'dd if=/dev/zero of=../disco.img bs=1M count=1'];

test('B3-01 RUMORE: dei 40 comandi di lavoro chiedono SOLO i tre che scrivono davvero fuori; i 20 che scrivono fuori chiedono tutti', async (t) => {
  const { progetto } = radice(t);
  const senzaCartaNuova = [];
  for (const c of LAVORO) {
    const { esito, domande } = await cancello(c, { cartella: progetto });
    if (FUORI_DAVVERO.has(c)) { assert.equal(domande.length, 1, `«${c}» scrive fuori: chiede`); assert.ok(domande[0].fuoriDalProgetto, c); assert.equal(esito.via, 'fuori-dal-progetto'); }
    else if (domande.length !== 0 || esito.consentito !== true) senzaCartaNuova.push(c);
  }
  assert.deepEqual(senzaCartaNuova, [], 'nessuna carta sui comandi che restano nel progetto o nel temporaneo');
  const muti = [];
  for (const c of FUORI) {
    const { esito, domande } = await cancello(c, { cartella: progetto });
    if (domande.length !== 1 || esito.consentito !== false) muti.push(c);
  }
  assert.deepEqual(muti, [], 'ogni comando che scrive fuori chiede, una carta sola');
});

test('B3-02 MODI: chiede prima chiede sempre; Scrive nel progetto chiede solo fuori; Accesso pieno non cambia; Solo lettura e Piano rifiutano', async (t) => {
  const { progetto } = radice(t);
  const fuori = 'rm -rf ../fuori/vecchio';
  const dentro = 'rm -rf dist';
  const p = await cancello(fuori, { cartella: progetto });
  assert.equal(p.domande.length, 1);
  assert.equal(p.domande[0].fuoriDalProgetto.fraseChiave, 'server.approval.outsideProject.verified');
  assert.match(p.esito.motivo, /outside the session folder.*Do not run it again in another form/s);
  assert.equal((await cancello(dentro, { cartella: progetto })).domande.length, 0);
  for (const c of [fuori, dentro]) {
    const r = await cancello(c, { cartella: progetto, livelloAccesso: 'su-richiesta' });
    assert.equal(r.domande.length, 1, `Chiede prima: «${c}» chiede`);
    assert.equal(r.domande[0].fuoriDalProgetto, undefined, 'Chiede prima: la carta di sempre, non quella del fuori');
    const pieno = await cancello(c, { cartella: progetto, livelloAccesso: 'accesso-pieno' });
    assert.deepEqual([pieno.domande.length, pieno.esito.consentito], [0, true], `Accesso pieno: «${c}» non chiede`);
    const lettura = await cancello(c, { cartella: progetto, livelloAccesso: 'lettura' });
    assert.deepEqual([lettura.domande.length, lettura.esito.via], [0, 'livello-lettura']);
    const piano = await cancello(c, { cartella: progetto, modalitaOperativa: 'piano' });
    assert.deepEqual([piano.domande.length, piano.esito.via], [0, 'modalita-piano']);
  }
  /* AL CONTRARIO: senza livello (il banco, la CLI che manda il suo modo) niente cambia */
  const domandeDelBanco = [];
  const banco = await verificaPermessoScrittura({ tipo: 'shell', comando: fuori }, { cartella: progetto, chiediApprovazioneFn: async (a) => { domandeDelBanco.push(a); return false; } });
  assert.deepEqual([domandeDelBanco.length, banco.via], [0, 'nessun-vincolo']);
});

test('B3-03 «shell: sempre» non scavalca il confine; «nega» vince per primo; senza nessuno davanti il no col motivo', async (t) => {
  const { progetto } = radice(t);
  const sempre = await cancello('echo x > ~/note.txt', { cartella: progetto, permessiPerAttrezzo: { shell: 'sempre' } });
  assert.equal(sempre.domande.length, 1);
  assert.equal((await cancello('echo x > out.txt', { cartella: progetto, permessiPerAttrezzo: { shell: 'sempre' } })).esito.via, 'permesso-per-attrezzo-sempre');
  const nega = await cancello('echo x > ~/note.txt', { cartella: progetto, permessiPerAttrezzo: { shell: 'nega' } });
  assert.deepEqual([nega.domande.length, nega.esito.via], [0, 'permesso-per-attrezzo-nega']);
  const nessuno = await verificaPermessoScrittura({ tipo: 'shell', comando: 'echo x > ~/note.txt' }, { livelloAccesso: 'scrittura-progetto', cartella: progetto });
  assert.equal(nessuno.consentito, false);
  assert.match(nessuno.motivo, /writes or deletes outside the session folder.*no active approval channel/s);
});

test('B3-04 «Consenti in questa cartella per la sessione» ricorda la CARTELLA: file ⇒ la madre, cartella ⇒ lei; sottocartelle comprese, le sorelle no', async (t) => {
  const { progetto, fuori, casa } = radice(t);
  const file = (await cancello('echo x > ~/appunti/note.txt', { cartella: progetto })).domande[0].fuoriDalProgetto;
  assert.equal(file.cartella, join(casa, 'appunti'));
  const consensiSessione = { cartelleFuori: [file.chiave] };
  assert.equal((await cancello('touch ~/appunti/altro.txt', { cartella: progetto, consensiSessione })).domande.length, 0, 'stessa cartella: niente carta');
  assert.equal((await cancello('mkdir -p ~/appunti/sotto/piu', { cartella: progetto, consensiSessione })).domande.length, 0, 'sottocartella: coperta');
  assert.equal((await cancello('touch ~/altrove.txt', { cartella: progetto, consensiSessione })).domande.length, 1, 'la casa intera NO');
  mkdirSync(join(fuori, 'vecchio'));
  const cartella = (await cancello('rm -rf ../fuori/vecchio', { cartella: progetto })).domande[0].fuoriDalProgetto;
  assert.equal(cartella.cartella, join(fuori, 'vecchio'), 'un bersaglio cartella ricorda sé stesso, non la madre');
  const solo = { cartelleFuori: [cartella.chiave] };
  assert.equal((await cancello('rm -rf ../fuori/vecchio/sotto', { cartella: progetto, consensiSessione: solo })).domande.length, 0);
  assert.equal((await cancello('rm -rf ../fuori/nuovo', { cartella: progetto, consensiSessione: solo })).domande.length, 1, 'la sorella chiede');
  /* lo stesso sì vale per `scrivi` nella stessa cartella: una memoria sola */
  const scrivi = await verificaPermessoScrittura({ tipo: 'scrivi', percorso: join(fuori, 'vecchio', 'f.txt') }, { livelloAccesso: 'scrittura-progetto', cartella: progetto, consensiSessione: solo, chiediApprovazioneFn: async () => false });
  assert.equal(scrivi.consentito, true);
});

test('B3-05 due cartelle fuori: una carta che le nomina tutte e due, senza «per la sessione»', async (t) => {
  const { progetto, fuori, casa } = radice(t);
  const { domande } = await cancello('cp a.txt ~/uno/ && cp a.txt ../fuori/due/', { cartella: progetto });
  assert.equal(domande.length, 1);
  assert.equal(domande[0].fuoriDalProgetto.chiave, undefined);
  assert.equal(domande[0].fuoriDalProgetto.cartella, `${join(casa, 'uno')}, ${join(fuori, 'due')}`);
  /* AL CONTRARIO: due file nella stessa cartella fuori sono UNA cartella, e il «per la sessione» resta */
  const una = (await cancello('touch ../fuori/x.txt ../fuori/y.txt', { cartella: progetto })).domande[0].fuoriDalProgetto;
  assert.equal(una.cartella, fuori);
  assert.equal(typeof una.chiave, 'string');
  /* una cartella che esiste, scritta senza la barra in coda, è lei la cartella da ricordare (non la madre) */
  mkdirSync(join(fuori, 'esiste'));
  assert.equal((await cancello('cp a.txt ../fuori/esiste', { cartella: progetto })).domande[0].fuoriDalProgetto.cartella, join(fuori, 'esiste'));
  /* una misura che lancia, o che non verifica: «non so dove» */
  for (const posizioneFn of [async () => { throw new Error('servente giù'); }, async () => ({ dentro: false, verificato: false, vero: null, cartella: null, spazio: 'linux:x' })]) {
    const d = (await cancello('touch ../fuori/z.txt', { cartella: progetto, posizioneFn })).domande[0].fuoriDalProgetto;
    assert.deepEqual([d.verificato, d.chiave, d.fraseParams.percorso], [false, undefined, '../fuori/z.txt']);
  }
  /* la casa Linux: la temporanea è /tmp di Linux, e il consenso porta lo spazio */
  const linux = async (p) => (p.includes('versotmp')
    ? { dentro: false, verificato: true, vero: '/tmp/sotto/a', cartella: '/tmp/sotto', spazio: 'linux:Ubuntu' }
    : { dentro: false, verificato: true, vero: '/home/u/lavori/x', cartella: '/home/u/lavori', spazio: 'linux:Ubuntu' });
  assert.equal((await cancello('touch versotmp/a', { cartella: progetto, posizioneFn: linux })).domande.length, 0);
  /* giro 3: una cartella sotto la casa Linux (la casa intera non si ricorda più: B3-18) */
  assert.equal((await cancello('touch /home/u/lavori/x', { cartella: progetto, posizioneFn: linux })).domande[0].fuoriDalProgetto.chiave, 'linux:Ubuntu|/home/u/lavori');
  /* la via corta vale solo per una madre VERIFICATA dentro e sul disco di questa macchina: un collegamento della casa Linux (che il disco
     di Windows non vede) o una madre non verificata fanno misurare il bersaglio per intero */
  const fuoriIlNome = (madre) => async (p) => (p.endsWith('collegamento')
    ? { dentro: false, verificato: true, vero: '/home/u/altrove', cartella: '/home/u', spazio: 'linux:Ubuntu' }
    : madre);
  for (const madre of [{ dentro: true, verificato: true, vero: '/home/u/p', cartella: '/home/u/p', spazio: 'linux:Ubuntu' }, { dentro: true, verificato: false, vero: null, cartella: null, spazio: 'locale' }])
    assert.equal((await cancello('touch collegamento', { cartella: progetto, posizioneFn: fuoriIlNome(madre) })).domande.length, 1, JSON.stringify(madre));
});

test('B3-06 dove non si sa: chiede «non so dove», senza cartella da consentire (cd illeggibile, xargs, installazione globale, -EncodedCommand rotto)', async (t) => {
  const { progetto } = radice(t);
  for (const [c, pezzo] of [['cd "$(boh)" && touch build', 'build'], ['ls | xargs rm', 'xargs rm'], ['npm i -g typescript', 'npm i -g'],
    ['pip install --user requests', 'pip install --user'], ['cd - && touch x', 'x']]) {
    const { domande } = await cancello(c, { cartella: progetto });
    assert.equal(domande.length, 1, c);
    assert.equal(domande[0].fuoriDalProgetto.verificato, false, c);
    assert.equal(domande[0].fuoriDalProgetto.chiave, undefined, c);
    assert.equal(domande[0].fuoriDalProgetto.fraseChiave, 'server.approval.outsideProject.unverified', c);
    assert.equal(domande[0].fuoriDalProgetto.fraseParams.percorso, pezzo, c);
  }
  /* PowerShell codificato che non si decodifica: una carta sola (qui la dà già la lettura delle cancellazioni critiche, che vince) */
  const codificato = await cancello('powershell -EncodedCommand !!!', { cartella: progetto });
  assert.equal(codificato.domande.length, 1);
  assert.ok(codificato.domande[0].cancellazioneCritica || codificato.domande[0].fuoriDalProgetto?.verificato === false);
  assert.deepEqual(scrittureDelComando('powershell -EncodedCommand !!!', { cartella: progetto }).illeggibili.map((x) => x.scritto), ['-EncodedCommand']);
  /* AL CONTRARIO: un comando illeggibile che non scrive non chiede (rumore) */
  for (const c of ['cd "$(boh)" && ls', 'echo "$(date)"', 'find . -name x | xargs grep y']) assert.equal((await cancello(c, { cartella: progetto })).domande.length, 0, c);
});

test('B3-07 una carta sola: la cancellazione critica vince sul fuori; segreto e fuori nella stessa carta', async (t) => {
  const { progetto } = radice(t);
  const critica = await cancello('rm -rf ..', { cartella: progetto });
  assert.equal(critica.domande.length, 1);
  assert.ok(critica.domande[0].cancellazioneCritica);
  assert.equal(critica.domande[0].fuoriDalProgetto, undefined);
  assert.equal(critica.esito.via, 'cancellazione-critica');
  const segreto = await cancello('cat ~/.ssh/id_rsa > ~/copia.txt', { cartella: progetto });
  assert.equal(segreto.domande.length, 1);
  assert.ok(segreto.domande[0].segreto && segreto.domande[0].fuoriDalProgetto);
});

test('B3-08 la temporanea del sistema non chiede (per nome e per percorso vero); un collegamento nel progetto che porta fuori chiede', async (t) => {
  const { progetto, fuori, temporanea, collega } = radice(t);
  for (const c of [`echo x > ${join(temporanea, 'a.log')}`, 'echo x > $TMPDIR/a.log', 'echo x > %TEMP%\\a.log', 'D=$(mktemp -d) && touch $D/a', 'npm test > /tmp/x.log', 'echo x > /dev/null', 'echo x 2> NUL'])
    assert.equal((await cancello(c, { cartella: progetto })).domande.length, 0, c);
  /* AL CONTRARIO: la variabile della temporanea riassegnata nel testo non vale più per nome */
  assert.equal((await cancello('TMPDIR=~/qui; echo x > $TMPDIR/a.log', { cartella: progetto })).domande.length, 1);
  collega(fuori, 'porta');
  const { domande } = await cancello('rm -rf porta/vecchio', { cartella: progetto });
  assert.equal(domande.length, 1, 'il percorso vero è fuori');
  assert.equal(domande[0].fuoriDalProgetto.cartella, join(fuori, 'vecchio'));
  /* la via corta (bersagli sotto il progetto misurati dalla madre): il bersaglio che È il collegamento si misura per intero */
  assert.equal((await cancello('touch porta', { cartella: progetto })).domande.length, 1, 'il nome è un collegamento nella madre');
  if (process.platform === 'win32') {
    assert.equal((await cancello('touch PORTA', { cartella: progetto })).domande.length, 1, 'Windows non bada alle maiuscole del nome');
    assert.equal((await cancello('touch PORTA/a.txt', { cartella: progetto })).domande.length, 1);
  }
  assert.equal((await cancello('touch src/a.txt src/b.txt dist/c.txt nuova/sotto/d.txt', { cartella: progetto })).domande.length, 0);
});

test('B3-09 FILO: dal modello alla carta e al no che torna al modello; il comando non parte', async (t) => {
  const { progetto, fuori } = radice(t);
  /* innocuo anche se partisse: la cartella `manca` non c'è, quindi la redirezione fallisce senza scrivere niente */
  const mancante = join(fuori, 'manca');
  const chiama = (id, comando) => ({ id, type: 'function', function: { name: 'shell', arguments: JSON.stringify({ comando }) } });
  async function giro(opzioni) {
    let richiesta = 0;
    const domande = [];
    const risultato = await talosLavora({
      cartella: progetto, task: { consegna: 'Pulisci.' }, modello: 'test', chiave: 'test', livelloAccesso: 'scrittura-progetto',
      fetchDiRete: async () => ({ ok: true, status: 200, text: async () => '', json: async () => ({
        choices: [{ message: richiesta++ === 0 ? { role: 'assistant', content: null, tool_calls: [chiama('s', 'echo x > ../fuori/manca/sotto/segno.txt')] } : { role: 'assistant', content: 'Fatto.' } }],
        usage: { prompt_tokens: 10, completion_tokens: 10 },
      }) }),
      ...(opzioni.risposta === undefined ? {} : { chiediApprovazioneFn: async (a) => { domande.push(a); return opzioni.risposta; } }),
    });
    return { esito: risultato.messaggiFinali.find((m) => m.tool_call_id === 's')?.content ?? '', domande };
  }
  const no = await giro({ risposta: false });
  assert.equal(no.domande.length, 1);
  assert.equal(no.domande[0].tipo, 'shell');
  assert.equal(no.domande[0].fuoriDalProgetto.cartella, join(mancante, 'sotto'));
  assert.match(no.esito, /^REFUSED\..*outside the session folder.*was not run/s);
  const nessuno = await giro({});
  assert.match(nessuno.esito, /^REFUSED\..*outside the session folder.*no active approval channel/s);
  assert.equal(existsSync(mancante), false);
});

test('B3-10 una figlia eredita il sì della madre e la traccia dice chi l ha dato', async (t) => {
  const { progetto, casa } = radice(t);
  const chiave = (await cancello('echo x > ~/condivisa/a.txt', { cartella: progetto })).domande[0].fuoriDalProgetto.chiave;
  const consensiSessione = { cartelleFuori: [chiave], [Symbol.for('talos.consensi.origine')]: (campo, valore) => (campo === 'cartelleFuori' && valore === chiave ? { sessionId: 'madre' } : null) };
  const traccia = { consentitoDa: null };
  const { domande, esito } = await cancello('touch ~/condivisa/b.txt', { cartella: progetto, consensiSessione, tracciaConsenso: traccia });
  assert.deepEqual([domande.length, esito.consentito], [0, true]);
  assert.deepEqual(traccia.consentitoDa, { sessionId: 'madre', tipo: 'cartella' });
  assert.ok(chiave.endsWith(join(casa, 'condivisa')));
});

test('B3-11 comando emulato: la carta del cancello basta (una, non due); dentro, critica e altri modi no', async (t) => {
  const { progetto } = radice(t);
  const o = { livelloAccesso: 'scrittura-progetto', cartella: progetto };
  assert.equal(await cartaForzataPrevista('shell', { comando: 'rm -rf ~/vecchio' }, o), 'fuoriDalProgetto');
  assert.equal(await cartaForzataPrevista('shell', { command: 'echo x > ~/a.txt' }, o), 'fuoriDalProgetto');
  assert.equal(await cartaForzataPrevista('shell', { comando: 'rm -rf dist' }, o), null);
  assert.equal(await cartaForzataPrevista('shell', { comando: 'rm -rf ..' }, o), null);
  assert.equal(await cartaForzataPrevista('shell', { comando: 'rm -rf ~/vecchio' }, { ...o, livelloAccesso: 'su-richiesta' }), null);
  assert.equal(await cartaForzataPrevista('shell', {}, o), null);
});

/* ── il lettore da solo, su Linux e su Windows (percorsi a parole, nessun disco) ───────────────────────────────────────────── */
const LINUX = { cartella: '/p/progetto', home: '/h', piattaforma: 'linux', ambiente: { TMPDIR: '/t' } };
const WIN = { cartella: 'C:\\p\\progetto', home: 'C:\\h', piattaforma: 'win32', ambiente: { TEMP: 'C:\\t' } };
const dove = (c, o = LINUX) => { const e = scrittureDelComando(c, o); return [...e.bersagli.map((b) => b.percorso + (b.cartella ? '/' : '')), ...e.illeggibili.map((x) => `?${x.scritto}`), ...e.globali.map((x) => `!${x.comando}`)]; };

test('B3-12 lettore: redirezioni, duplicazioni, heredoc, sottoshell e cd', () => {
  assert.deepEqual(dove('make 2>&1 >&2 1>&-'), []);
  assert.deepEqual(dove('make &> ~/log'), ['/h/log']);
  assert.deepEqual(dove('echo a>>~/x'), ['/h/x']);
  assert.deepEqual(dove('echo hi>out.txt'), ['/p/progetto/out.txt']);
  assert.deepEqual(dove('git commit -m "a -> /etc"'), [], 'testo fra virgolette con spazi: non è una redirezione');
  assert.deepEqual(dove("cat > nota.md <<'EOF'\nrm -rf ~/x\nEOF"), ['/p/progetto/nota.md'], 'il corpo di un heredoc è testo');
  assert.deepEqual(dove("bash <<'EOF'\nrm -rf ~/x\nEOF"), ['/h/x/'], 'ma se lo riceve una shell si legge');
  assert.deepEqual(dove('cd /altro && touch a; cd - && touch b'), ['/altro/a', '?b']);
  assert.deepEqual(dove('(cd /altro && touch a); touch b'), ['/altro/a', '/p/progetto/b'], 'la sottoshell non sposta chi viene dopo');
  assert.deepEqual(dove('pushd /x && popd && touch c'), ['/p/progetto/c']);
  assert.deepEqual(dove('D=/fuori; rm -rf $D/vecchio'), ['/fuori/vecchio/']);
  assert.deepEqual(dove('sudo -u root env -C /etc touch passwd'), ['/etc/passwd']);
  assert.deepEqual(dove('echo $(touch /x)'), ['/x']);
});

test('B3-13 lettore: altre shell, PowerShell e cmd', () => {
  assert.deepEqual(dove('bash -c "rm -rf ~/x"'), ['/h/x/']);
  assert.deepEqual(dove('sh -lc "echo x > /y"'), ['/y']);
  assert.deepEqual(dove('eval "touch /z"'), ['/z']);
  const codificato = Buffer.from('Remove-Item -Recurse C:\\fuori', 'utf16le').toString('base64');
  assert.deepEqual(dove(`powershell -EncodedCommand ${codificato}`, WIN), ['C:\\fuori/']);
  assert.deepEqual(dove('powershell -NoProfile -Command "Set-Content -Path ~\\a.txt -Value ciao"', WIN), ['C:\\h\\a.txt']);
  assert.deepEqual(dove('cmd /c "copy a.txt C:\\fuori\\b.txt"', WIN), ['C:\\fuori\\b.txt']);
  assert.deepEqual(dove('cmd /c rd /s /q C:\\fuori', WIN), ['C:\\fuori/']);
  assert.deepEqual(dove('Out-File -FilePath C:\\x.txt', WIN), ['C:\\x.txt']);
  assert.deepEqual(dove('Expand-Archive a.zip -DestinationPath C:\\dest', WIN), ['C:\\dest/']);
  assert.deepEqual(dove('Invoke-WebRequest https://x -OutFile C:\\f.zip', WIN), ['C:\\f.zip']);
  assert.deepEqual(dove('New-Item -Path C:\\base -Name f.txt', WIN), ['C:\\base/', 'C:\\base\\f.txt']);
  assert.deepEqual(dove('robocopy src C:\\copia /MIR', WIN), ['C:\\copia/', 'C:\\p\\progetto\\src/']);
  assert.deepEqual(dove('echo x > $env:TEMP\\a.log', WIN), []);
  assert.deepEqual(dove('Remove-Item -Recurse -Force dist', WIN), ['C:\\p\\progetto\\dist/']);
  /* `/p/…` su Windows: per un cmdlet è `\p\…` del disco corrente, per il `rm` di Git è il disco P: (la regola del programma) */
  assert.deepEqual(dove('Remove-Item -Recurse -Force /p/progetto/dist', WIN), ['C:\\p\\progetto\\dist/']);
  assert.deepEqual(dove('rm -rf /p/progetto/dist', WIN), ['p:\\progetto\\dist/']);
  assert.deepEqual(dove('cd /p/progetto; Remove-Item -Recurse x', WIN), ['C:\\p\\progetto\\x/']);
  assert.deepEqual(dove('D=/a; rm -rf $D; D=/b; rm -rf $D'), ['/a/', '/b/'], 'lo stesso bersaglio scritto, dopo un altro valore, è un altro posto');
});

test('B3-14 lettore: i comandi che scrivono, uno per famiglia', () => {
  assert.deepEqual(dove('cp -r src /backup'), ['/backup/']);
  assert.deepEqual(dove('cp -t /dest a b'), ['/dest/']);
  assert.deepEqual(dove('mv /fuori/a.txt .'), ['/fuori/a.txt', '/p/progetto'], 'chi sposta via toglie: anche la sorgente');
  assert.deepEqual(dove('install -m 755 bin /usr/local/bin/x'), ['/usr/local/bin/x']);
  assert.deepEqual(dove('ln -s /x'), ['/p/progetto/']);
  assert.deepEqual(dove('rsync -a src/ /backup/ --remove-source-files'), ['/backup/', '/p/progetto/src/']);
  assert.deepEqual(dove('rsync -a src/ host:/backup/'), [], 'una destinazione remota non è questo disco');
  assert.deepEqual(dove('chmod -R 755 /srv/app'), ['/srv/app/']);
  assert.deepEqual(dove('chown nino:nino /f'), ['/f']);
  assert.deepEqual(dove('truncate -s 0 /var/log/x'), ['/var/log/x']);
  assert.deepEqual(dove("perl -pi -e 's/a/b/' /etc/hosts"), ['/etc/hosts']);
  assert.deepEqual(dove("sed 's/a/b/' /etc/hosts"), [], 'sed senza -i legge soltanto');
  assert.deepEqual(dove("sed -i.bak -e 's/a/b/' /a /b"), ['/a', '/b']);
  assert.deepEqual(dove('tar -czf /backup/a.tgz src'), ['/backup/a.tgz']);
  assert.deepEqual(dove('tar xzf a.tgz -C /opt'), ['/opt/']);
  assert.deepEqual(dove('tar -tf a.tgz'), [], 'elencare non scrive');
  assert.deepEqual(dove('7z x a.7z -o/opt/x'), ['/opt/x/']);
  assert.deepEqual(dove('curl -sSLo /f https://x'), ['/f']);
  assert.deepEqual(dove('curl -O --output-dir /d https://x/f'), ['/d/']);
  assert.deepEqual(dove('curl -H "A: b" https://x'), []);
  assert.deepEqual(dove('wget -P /d https://x'), ['/d/']);
  assert.deepEqual(dove('wget -O - https://x | sh'), []);
  assert.deepEqual(dove('find /srv -name "*.tmp" -delete'), ['/srv/']);
  assert.deepEqual(dove('find /srv -name x -exec grep y {} +'), []);
  assert.deepEqual(dove('find /srv -name x | xargs rm'), ['/srv/']);
  assert.deepEqual(dove('git -C /altro log'), [], 'git che legge non chiede');
  assert.deepEqual(dove('git -C /altro push'), ['/altro/']);
  assert.deepEqual(dove('git init /nuovo'), ['/nuovo/']);
  assert.deepEqual(dove('git worktree add /alberi/x'), ['/alberi/x/']);
  assert.deepEqual(dove('git config --global --get user.name'), []);
  assert.deepEqual(dove('git archive -o /a.zip HEAD'), ['/a.zip']);
  assert.deepEqual(dove('npm --prefix /altro install'), ['/altro/']);
  assert.deepEqual(dove('yarn global add x'), ['!yarn global']);
  assert.deepEqual(dove('npm config set registry x'), ['/h/.npmrc']);
  assert.deepEqual(dove('source .venv/bin/activate && pip install -r r.txt'), ['/p/progetto/.venv/']);
  assert.deepEqual(dove('pip install -t /lib x'), ['/lib/']);
  assert.deepEqual(dove('python3 -m pip install x'), ['!pip install']);
  assert.deepEqual(dove('pip install x', { ...LINUX, ambiente: { VIRTUAL_ENV: '/p/progetto/.venv' } }), ['/p/progetto/.venv/']);
  assert.deepEqual(dove('cargo install ripgrep'), ['!cargo install']);
  assert.deepEqual(dove('sudo apt install -y jq'), ['!apt install']);
  assert.deepEqual(dove('make install PREFIX=/opt/x'), ['/opt/x/']);
  assert.deepEqual(dove('make install'), ['!make install']);
  assert.deepEqual(dove('dd if=a of=/dev/null'), []);
  assert.deepEqual(dove('rm -rf .*'), ['/p/'], 'un glob che può prendere `..` si giudica sulla madre');
  assert.deepEqual(dove('rm -rf /data/*/cache'), ['/data/']);
  assert.deepEqual(dove('touch "$(mktemp)"'), [], 'mktemp senza -p è la temporanea');
  assert.deepEqual(dove('chmod -R 777 /srv/.*/x'), ['//'], 'un pezzo `.*` in mezzo prende `..`: si giudica la madre');
  assert.deepEqual(dove('rm -rf /x', { ...LINUX, cartella: '' }), [], 'senza cartella della sessione non si giudica (il cancello non chiama)');
  /* il lettore che si ferma (qui il tetto dei caratteri espansi del lettore delle cancellazioni) chiede: fallisce chiuso */
  const grande = `a=${'x'.repeat(1000)}; b=${'$a'.repeat(64)}; c=${'$b'.repeat(80)}; touch /fuori/$c`;
  assert.deepEqual(dove(grande), [`?${grande.slice(0, 120)}`]);
  assert.deepEqual(dove('touch "$(mktemp -p /fuori)"'), ['?$(mktemp -p /fuori)'], 'mktemp -p: il posto non è la temporanea, non si sa dire');
});

/*
 * Giro 2 (revisore B3, S1, 19/11/2026): la temporanea «per nome» con `..` nel resto usciva senza carta (`%TEMP%\..\…\Startup\a.bat`,
 *   `$TEMP/../../../.ssh/authorized_keys`, `/tmp/../etc/x`). Ora vale solo se il resto non può risalire; altrimenti si misura.
 */
const L2 = { ...LINUX, ambiente: { TMPDIR: '/t', TEMP: '/t', TMP: '/t' } };
const W2 = { ...WIN, home: 'C:\\u', ambiente: { TEMP: 'C:\\u\\AppData\\Local\\Temp', TMP: 'C:\\u\\AppData\\Local\\Temp', TMPDIR: 'C:\\u\\AppData\\Local\\Temp' } };
const AVVIO = 'C:\\u\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\a.bat';
const CHIAVI = 'C:\\u\\.ssh\\authorized_keys';

test('B3-15 lettore: la temporanea per nome con `..` nel resto si risolve (Startup, .ssh, /etc), in ogni grafia', () => {
  for (const [c, atteso] of [
    ['echo x > "%TEMP%\\..\\..\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\a.bat"', AVVIO],
    ['echo x > "$TEMP/../../Roaming/Microsoft/Windows/Start Menu/Programs/Startup/a.bat"', AVVIO],
    ['echo x > "${TMPDIR}/../../Roaming/Microsoft/Windows/Start Menu/Programs/Startup/a.bat"', AVVIO],
    ['Set-Content -Path "$env:TEMP\\..\\..\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\a.bat" -Value x', AVVIO],
    ['cp k %TEMP%\\..\\..\\..\\.ssh\\authorized_keys', CHIAVI],
    ['cp k $TEMP/../../../.ssh/authorized_keys', CHIAVI],
    ['cp k ${TMPDIR}/../../../.ssh/authorized_keys', CHIAVI],
    ['cp k $env:TMP\\..\\..\\..\\.ssh\\authorized_keys', CHIAVI],
    ['cp k %TEMP%/..\\..\\../.ssh/authorized_keys', CHIAVI],
    ['cp k %temp%\\..\\..\\..\\.ssh\\authorized_keys', CHIAVI],
    ['cp k $Env:Temp\\..\\..\\..\\.ssh\\authorized_keys', CHIAVI],
    ['echo x > $TEMP/a/../../../../.ssh/authorized_keys', CHIAVI],
    ['echo x > %TEMP%\\..\\..\\..\\..\\etc\\x', 'C:\\etc\\x'],
    ['echo x > /tmp/../etc/x', 'C:\\etc\\x'],
    ['echo x > /var/tmp/../../etc/x', 'C:\\etc\\x'],
  ]) assert.deepEqual(dove(c, W2), [atteso], c);
  for (const [c, atteso] of [
    ['echo x > $TEMP/../etc/passwd', '/etc/passwd'], ['echo x > ${TMPDIR}/../etc/passwd', '/etc/passwd'],
    ['cp k $TMP/../h/.ssh/authorized_keys', '/h/.ssh/authorized_keys'], ['echo x > /tmp/../etc/x', '/etc/x'],
    ['echo x > /var/tmp/../../etc/x', '/etc/x'], ['echo x > /tmp/../h/.ssh/authorized_keys', '/h/.ssh/authorized_keys'],
    ['echo x > $TEMP/a/../../etc/x', '/etc/x'], ['echo x > $TEMP/\\.\\./etc/x', '/etc/x'],
    /* ciò che la shell espande ancora nel resto può diventare `..`: si risolve anche lui */
    ['X=..; echo x > $TEMP/$X/etc/x', '/etc/x'], ['echo x > /tmp/.?/etc/x', '//'], ['echo x > /tmp/.*/etc/x', '//'],
    ['echo x > $TMPDIR/[.][.]/etc/x', '//'],
  ]) assert.deepEqual(dove(c, L2), [atteso], c);
  /* apici inversi nel resto: non si esenta per nome, il lettore lo misura (le graffe: giro 3, B3-19) */
  assert.equal(dove('echo x > $TEMP/`echo ..`/etc/x', L2).length, 1);
  /* `..` scritto `%2e%2e`: per bash, cmd e PowerShell è un NOME (nessuna shell decodifica gli URL): si misura e resta nella temporanea */
  assert.deepEqual(dove('echo x > %TEMP%\\%2e%2e\\x', W2), ['C:\\u\\AppData\\Local\\Temp\\%2e%2e\\x']);
  assert.deepEqual(dove('echo x > /tmp/%2e%2e/etc/x', L2), ['/tmp/%2e%2e/etc/x']);
});

test('B3-15 AL CONTRARIO: la temporanea senza `..` resta senza bersaglio; `..` dentro un nome non conta', () => {
  for (const c of ['echo x > $TEMP/x', 'echo x > %TEMP%\\a\\b.txt', 'echo x > $env:TEMP\\a.log', 'echo x > $TEMP/..a/x', 'echo x > $TEMP/a..b',
    'echo x > %TEMP%\\...\\x', 'echo x > /tmp/build/out', 'echo x > /var/tmp/a..b'])
    assert.deepEqual(dove(c, W2), [], c);
  for (const c of ['echo x > /tmp/build/out', 'touch "$(mktemp)"', 'echo x > $TMPDIR/..a/x', 'echo x > ${TEMP}/a..b', 'echo x > /tmp'])
    assert.deepEqual(dove(c, L2), [], c);
});

test('B3-16 cancello: dalla temporanea con `..` verso la casa o fuori CHIEDE; senza uscire dalla temporanea no', async (t) => {
  const { progetto, casa, fuori } = radice(t);
  const avvio = join(casa, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
  for (const [c, cartellaAttesa] of [
    ['echo x > "%TEMP%\\..\\casa\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\a.bat"', avvio],
    ['cp k $TEMP/../casa/.ssh/authorized_keys', join(casa, '.ssh')],
    ['cp k ${TMPDIR}/../casa/.ssh/authorized_keys', join(casa, '.ssh')],
    ['cp k $Env:Temp\\..\\casa\\.ssh\\authorized_keys', join(casa, '.ssh')],
    ['echo x > %temp%/..\\lavori/fuori/x', fuori],
    ['echo x > $TEMP/a/../../lavori/fuori/x', fuori],
  ].filter(([c]) => process.platform === 'win32' || !/[%\\]|\$Env:/u.test(c))) {
    const { esito, domande } = await cancello(c, { cartella: progetto });
    assert.equal(domande.length, 1, c);
    assert.equal(domande[0].fuoriDalProgetto?.cartella, cartellaAttesa, c);
    assert.equal(esito.consentito, false, c);
  }
  for (const c of ['echo x > $TEMP/a/../b.txt', 'echo x > $TEMP/..a/x', 'echo x > $TEMP/a..b', 'echo x > %TEMP%\\%2e%2e\\x', 'echo x > $TEMP/x']
    .filter((c) => process.platform === 'win32' || !c.includes('%')))
    assert.equal((await cancello(c, { cartella: progetto })).domande.length, 0, c);
});

/*
 * Giro 3 (owner 19/11/2026 08:23, giudice v2229). Punto 1: nel resto della temporanea per nome sono esenti SOLO le espansioni che non
 *   possono dare `..`: `$RANDOM`, `${RANDOM}`, `%RANDOM%` (un numero, se il testo non nomina RANDOM in altro modo: `unset RANDOM` le
 *   toglie il senso, manuale di bash «Bash Variables»), `$$` (fuori da `$env:`) e un glob `*`/`?` nell'ULTIMO pezzo con almeno un segno
 *   che non è un punto. Ogni altra espansione continua a chiedere.
 */
test('B3-17 lettore: $RANDOM, %RANDOM%, $$ e il glob in coda restano nella temporanea; ogni altra espansione si misura', () => {
  for (const c of ['node build.mjs > $TEMP/build-$RANDOM/x.log', 'echo x > ${TEMP}/a-${RANDOM}.log', 'mkdir -p $TMPDIR/talos-$$ && cp a $TMPDIR/talos-$$/',
    'rm -f $TEMP/cache-?.tmp', 'rm -rf $TEMP/cache-*', 'rm -f /tmp/out-*.log', 'echo $RANDOM > $TEMP/$RANDOM*.log', 'echo x > $TEMP/.$RANDOM'])
    for (const o of [L2, W2]) assert.deepEqual(dove(c, o), [], `${c} ${o.piattaforma}`);
  assert.deepEqual(dove('python x.py > %TEMP%\\%RANDOM%.log', W2), []);
  assert.deepEqual(dove('python x.py > %TEMP%\\%random%.log', W2), [], 'cmd non bada alle maiuscole');
  /* AL CONTRARIO: RANDOM nominato in altro modo nel testo, `$$` di PowerShell, glob non in coda o che può prendere `..`, altre variabili */
  assert.deepEqual(dove('unset RANDOM; RANDOM=..; echo x > $TEMP/$RANDOM/etc/x', L2), ['/etc/x']);
  assert.deepEqual(dove('RANDOM=..; echo x > $TEMP/$RANDOM/x', L2), ['/x']);
  assert.deepEqual(dove('set RANDOM=..& echo x > %TEMP%\\%RANDOM%\\x', W2), ['C:\\u\\AppData\\Local\\x']);
  assert.deepEqual(dove('echo x > $TEMP/$RANDOM/x', { ...L2, ambiente: { ...L2.ambiente, RANDOM: '..' } }), ['/x'], 'RANDOM nell ambiente del servente');
  /* PowerShell: `$RANDOM` è una variabile come le altre. 0.2.4, giro dopo i revisori: sul PC il testo si legge anche come lo legge cmd
     (il guscio di `shell: true`), dove `'..'` è un nome con gli apostrofi: un bersaglio in più DENTRO la temporanea, nessuna carta
     (la prova «B3-17 cancello» qui sotto resta uguale) */
  assert.deepEqual(dove("$RANDOM = '..'; Set-Content -Path $env:TEMP\\$RANDOM\\x -Value y", W2), ['C:\\u\\AppData\\Local\\x', "C:\\u\\AppData\\Local\\Temp\\'..'\\x"]);
  assert.equal(dove("$RANDOM += 'a'; Set-Content -Path $env:TEMP\\$RANDOM\\x -Value y", W2).length, 2, 'uno di PowerShell, uno della lettura di cmd');
  for (const c of ['echo x > $env:TEMP\\$$\\x', 'echo x > $TEMP/a*/x', 'echo x > $TEMP/.?', 'echo x > $TEMP/.*', 'rm -rf $TEMP/*', 'echo x > $TEMP/..?/x',
    'echo x > $TEMP/$RANDOMX/x', 'echo x > $TEMP/${RANDOM:0:1}/x', 'echo x > $TEMP/$$$X/x', 'echo x > $TEMP/$(date)/x', 'cp a "$TEMP/${USER}-a.txt"',
    'echo x > $TEMP/%RANDOM:~0,1%/x', 'echo x > $TEMP/[ab]*.log', 'rm -rf $TEMP/..'])
    assert.equal(dove(c, W2).length, 1, c);
  assert.deepEqual(dove('rm -rf $TEMP/..', L2), ['//']);
});

test('B3-17 cancello: le espansioni ferme non chiedono più; RANDOM riassegnato o `..` sì', async (t) => {
  const { progetto, fuori } = radice(t);
  for (const c of ['node build.mjs > $TEMP/build-$RANDOM/x.log', 'rm -f /tmp/out-*.log', 'npm test > %TEMP%\\%RANDOM%.log', 'mkdir -p $TMPDIR/talos-$$']
    .filter((c) => process.platform === 'win32' || !c.includes('%')))
    assert.equal((await cancello(c, { cartella: progetto })).domande.length, 0, c);
  for (const c of ['unset RANDOM; RANDOM=../lavori/fuori; echo x > $TEMP/$RANDOM/x', 'echo x > $TEMP/../lavori/fuori/out-*.log']) {
    const { domande } = await cancello(c, { cartella: progetto });
    assert.equal(domande.length, 1, c);
    assert.equal(domande[0].fuoriDalProgetto?.cartella, fuori, c);
  }
});

/* Punto 2: «Consenti in questa cartella per la sessione» mai per la radice di un disco né per la casa: lì solo «una volta». */
test('B3-18 la radice di un disco e la casa non si consentono per la sessione (shell e scrivi); una cartella sotto la casa sì', async (t) => {
  const { progetto, casa } = radice(t);
  const radiceDisco = (await cancello('echo x > /tmp/../x', { cartella: progetto })).domande[0].fuoriDalProgetto;
  assert.equal(radiceDisco.cartella, parse(progetto).root);
  assert.equal(radiceDisco.chiave, undefined);
  const laCasa = (await cancello('echo x > ~/a.txt', { cartella: progetto })).domande[0].fuoriDalProgetto;
  assert.deepEqual([laCasa.cartella, laCasa.chiave], [casa, undefined]);
  const scrivi = async (percorso) => {
    const domande = [];
    await verificaPermessoScrittura({ tipo: 'scrivi', percorso }, { livelloAccesso: 'scrittura-progetto', cartella: progetto, chiediApprovazioneFn: async (a) => { domande.push(a); return false; } });
    return domande[0].fuoriDalProgetto;
  };
  assert.equal((await scrivi(join(casa, 'a.txt'))).chiave, undefined, 'scrivi nella casa');
  assert.equal((await scrivi(join(parse(progetto).root, 'a.txt'))).chiave, undefined, 'scrivi nella radice');
  /* AL CONTRARIO: una cartella sotto la casa resta consentibile */
  assert.equal(typeof (await scrivi(join(casa, 'sotto', 'a.txt'))).chiave, 'string');
  assert.equal(typeof (await cancello('echo x > ~/sotto/a.txt', { cartella: progetto })).domande[0].fuoriDalProgetto.chiave, 'string');
  /* la casa Linux: `/`, `/root`, `/home/<nome>` no; sotto sì */
  for (const [cartella, chiave] of [['/', undefined], ['/root', undefined], ['/home/u', undefined], ['/home/u/lavori', 'linux:Ubuntu|/home/u/lavori']]) {
    const posizioneFn = async () => ({ dentro: false, verificato: true, vero: `${cartella}/x`.replace('//', '/'), cartella, spazio: 'linux:Ubuntu' });
    assert.equal((await cancello('touch /qualcosa/x', { cartella: progetto, posizioneFn })).domande[0].fuoriDalProgetto.chiave, chiave, cartella);
  }
});

/* Punto 3a: le graffe di bash (`{a,b}`): oltre al testo com'è si legge ogni testo con le graffe aperte (anche su Windows, dove il lettore
   le spezza come blocchi di PowerShell). */
test('B3-19 graffe: `$TEMP/{..,..}` e `{.,..}/{.,..}` si misurano aperte; `{a,b}` dentro non chiede', async (t) => {
  assert.ok(dove('cp k $TEMP/{..,..}/x', L2).includes('/x'));
  assert.ok(dove('cp k $TEMP/{..,..}/x', W2).includes('C:\\u\\AppData\\Local\\x'));
  assert.ok(dove('cp evil.bat "$TEMP"/{.,..}/{.,..}/Roaming/x/', W2).includes('C:\\u\\AppData\\Roaming\\x/'));
  assert.ok(dove('cp k a {..,..}', L2).includes('/p/'));
  assert.ok(dove('bash -c "cp k ~/{a,.ssh}/x"', L2).includes('/h/.ssh/x'));
  /* AL CONTRARIO: `${x,,}` non è una graffa; fra virgolette con spazi o JSON nemmeno; dentro il progetto o la temporanea nessun bersaglio fuori */
  assert.deepEqual(dove('echo x > ${X,,}', { ...L2, ambiente: { ...L2.ambiente, X: 'a' } }).length, 1);
  assert.deepEqual(dove('echo \'{"a":1,"b":2}\' > out.json', L2), ['/p/progetto/out.json']);
  /* più di 32 combinazioni: «non so dove»; le variabili e i collegamenti del testo com'è non valgono per i testi aperti prima del loro posto */
  assert.ok(dove('touch {a,b}{a,b}{a,b}{a,b}{a,b}{a,b}', L2).some((x) => x.startsWith('?')));
  assert.ok(!dove('echo x > link/{a,b} && ln -s ../fuori link', L2).includes('/p/fuori/a'));
  assert.ok(!dove('echo x > $D/{a,b}; D=/etc', L2).some((x) => x.startsWith('/etc')));
  const { progetto, fuori } = radice(t);
  const { domande } = await cancello('cp k $TEMP/{..,..}/lavori/fuori/x', { cartella: progetto });
  assert.equal(domande.length, 1);
  assert.equal(domande[0].fuoriDalProgetto?.cartella, fuori);
  for (const c of ['echo x > $TMPDIR/{a,b}.txt', 'touch src/{a,b}.js', 'mkdir -p dist/{css,js}'])
    assert.equal((await cancello(c, { cartella: progetto })).domande.length, 0, c);
});

/* Punto 3b: un collegamento creato nel testo (`ln`, `mklink`, `New-Item -ItemType Junction`) e usato dopo: si misura anche dove porta. */
test('B3-20 collegamento creato e usato nello stesso comando: la scrittura dopo va dove porta', async (t) => {
  for (const [c, o, atteso] of [
    ['ln -s .. $TEMP/su && echo x > $TEMP/su/x', L2, '/x'], ['ln -s .. $TEMP/su && echo x > $TEMP/su/x', W2, 'C:\\u\\AppData\\Local\\x'],
    ['mklink /J %TEMP%\\su %TEMP%\\..\\.. && echo x > %TEMP%\\su\\x', W2, 'C:\\u\\AppData\\x'],
    ['ln -sf ../fuori link && echo x > link/a', L2, '/p/fuori/a'], ['ln -sf ../fuori link && echo x > link/a', W2, 'C:\\p\\fuori\\a'],
    ['mklink /J giunz ..\\fuori && echo x > giunz\\a', W2, 'C:\\p\\fuori\\a'], ['ln ../fuori/a.txt h && echo x > h', L2, '/p/fuori/a.txt'],
    ['New-Item -ItemType Junction -Path g -Target ..\\fuori; Set-Content g\\a x', W2, 'C:\\p\\fuori\\a'],
    ['ln -s /etc lnk; cd lnk && touch passwd', L2, '/etc/passwd'], ['ln -s ../../fuori -t dir && echo x > dir/fuori/a', L2, '/p/fuori/a'],
    ['mklink /J sotto\\g ..\\fuori && echo x > sotto\\g\\a', W2, 'C:\\p\\fuori\\a'], ['mklink /J giunz ..\\fuori && echo x > GIUNZ\\a', W2, 'C:\\p\\fuori\\a'],
    ['mklink /D sotto\\g ..\\..\\fuori && echo x > sotto\\g\\a', W2, 'C:\\p\\fuori\\a'],
    ['New-Item -ItemType SymbolicLink -Path g -Value ..\\fuori; Set-Content g\\a x', W2, 'C:\\p\\fuori\\a'],
    ['ln -s ../fuori && echo x > fuori/a', L2, '/p/fuori/a'], ['ln -s /etc /var dir && touch dir/etc/x', L2, '/etc/x'],
    ['ln -sr ../fuori sotto/l && echo x > sotto/l/a', L2, '/p/fuori/a'],
  ]) assert.ok(dove(c, o).includes(atteso), `${c} ${o.piattaforma}: ${JSON.stringify(dove(c, o))}`);
  /* creare un collegamento che porta fuori non è scrivere fuori; un nome che comincia come il collegamento non è sotto di lui */
  assert.deepEqual(dove('ln -sf ../fuori link', L2), ['/p/progetto/link']);
  assert.deepEqual(dove('ln --help', L2), []);
  assert.deepEqual(dove('ln -s ../fuori link && echo x > linkx/a', L2), ['/p/progetto/link', '/p/progetto/linkx/a']);
  assert.ok(!dove('ln -s self/x self && echo x > self/a', L2).some((x) => x.startsWith('?')), 'un collegamento dentro sé stesso: al più 4 giri');
  assert.ok(!dove('New-Item -ItemType Directory -Path g; Set-Content g\\a x', W2).some((x) => x.startsWith('?')));
  /* AL CONTRARIO: scritto PRIMA del collegamento, o un collegamento che porta dentro */
  assert.deepEqual(dove('echo x > link/a && ln -s ../fuori link', L2), ['/p/progetto/link/a', '/p/progetto/link']);
  assert.deepEqual(dove('ln -s src/a lnk && echo x > lnk/b', L2), ['/p/progetto/lnk', '/p/progetto/src/a/b', '/p/progetto/lnk/b']);
  const { progetto, fuori, r } = radice(t);
  for (const [c, cartella] of [['ln -sf ../fuori link && echo x > link/a', fuori], ['ln -s .. $TEMP/su && echo x > $TEMP/su/x', r],
    ['mklink /J giunz ..\\fuori && echo x > giunz\\a', fuori]].filter(([c]) => process.platform === 'win32' || !c.includes('\\'))) {
    const { domande } = await cancello(c, { cartella: progetto });
    assert.equal(domande.length, 1, c);
    assert.equal(domande[0].fuoriDalProgetto?.cartella, cartella, c);
  }
  assert.equal((await cancello('ln -s src lnk && echo x > lnk/a', { cartella: progetto })).domande.length, 0);
});

/*
 * Cura $TEMP di PowerShell (owner 19/11/2026 09:33, giudice v2239): in PowerShell `$TEMP`, `${TEMP}`, `$TMP` semplici sono variabili di
 *   PowerShell, non l'ambiente: non sono la temporanea e chiedono («non so dove»). Vale solo `$env:TEMP`/`$env:TMP`. Negli altri gusci
 *   (`$TEMP` di bash, `%TEMP%` di cmd) niente cambia.
 */
test('B3-21 PowerShell: $TEMP, ${TEMP} e $TMP semplici chiedono; $env:TEMP no; bash e cmd come prima', async (t) => {
  for (const c of ['Set-Content -Path $TEMP\\x -Value y', 'Set-Content -Path ${TEMP}\\x -Value y', 'Out-File $TMP\\x', 'Out-File -FilePath ${TMP}\\x',
    'powershell -Command "Set-Content -Path $TEMP\\x -Value y"', 'pwsh -c "echo x > $TEMP\\x"', 'Remove-Item -Recurse $TEMP\\cache', 'New-Item -ItemType File -Path $TMP\\a.txt',
    'sc $TEMP\\x y', 'Write-Output x > $TEMP\\x', 'iex "echo x > $TEMP\\x"', 'echo x > $TEMP\\a; Set-Content -Path $TEMP\\a -Value y'])
    for (const [o, t] of [[W2, c], [L2, c.replaceAll('\\', '/')]]) assert.ok(dove(t, o).some((x) => x.startsWith('?')), `${t} ${o.piattaforma}: ${JSON.stringify(dove(t, o))}`);
  /* AL CONTRARIO: `$env:TEMP`/`$env:TMP` restano la temporanea; `$TEMP` di bash e `%TEMP%` di cmd come prima; bash dentro PowerShell è bash */
  for (const c of ['Set-Content -Path $env:TEMP\\x -Value y', 'Out-File $env:TMP\\x', 'powershell -Command "Set-Content -Path $env:TEMP\\x -Value y"'])
    for (const [o, t] of [[W2, c], [L2, c.replaceAll('\\', '/')]]) assert.deepEqual(dove(t, o), [], `${t} ${o.piattaforma}`);
  for (const c of ['echo x > $TEMP/x', 'cp a $TMP/b', 'echo x > ${TEMP}/x', "bash -c 'echo x > $TEMP/x'", 'powershell -Command "bash -c \'echo x > $TEMP/x\'"']) for (const o of [W2, L2]) assert.deepEqual(dove(c, o), [], `${c} ${o.piattaforma}`);
  assert.deepEqual(dove('echo x > %TEMP%\\x', W2), []);
  assert.deepEqual(dove('cmd /c "echo x > %TEMP%\\x"', W2), []);
  assert.deepEqual(dove('eval "echo x > $TEMP/x"', L2), []);
  /* `$TEMP` assegnato nel testo di PowerShell: si misura col valore dato */
  /* 0.2.4, giro dopo i revisori: la lettura di cmd (dove `'C:\altrove'` è un nome con gli apostrofi) aggiunge un bersaglio DENTRO il progetto */
  assert.deepEqual(dove("$TEMP = 'C:\\altrove'; Set-Content -Path $TEMP\\x -Value y", W2), ['C:\\altrove\\x', "C:\\p\\progetto\\'C:\\altrove'\\x"]);
  const { progetto } = radice(t);
  const { domande } = await cancello('Set-Content -Path $TEMP\\x -Value y', { cartella: progetto });
  assert.equal(domande.length, 1);
  assert.deepEqual([domande[0].fuoriDalProgetto?.verificato, domande[0].fuoriDalProgetto?.chiave], [false, undefined]);
  for (const c of ['Set-Content -Path $env:TEMP\\x -Value y', 'echo x > $TEMP/x']) assert.equal((await cancello(c, { cartella: progetto })).domande.length, 0, c);
});
