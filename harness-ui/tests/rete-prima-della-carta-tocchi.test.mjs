/*
 * BUG-024-UNC (PC 0.2.4, 20/11/2026) — UN PERCORSO DI RETE NON SI TOCCA PRIMA DELLA CARTA.
 *   Su Windows aprire, risolvere o anche solo guardare `\\computer\condivisione` avvia l'autenticazione SMB verso quel computer
 *   (Hermes `agent/file_safety.py:146-151`: «Checks the raw string only — never resolves the path»; Codex `gcp_setup.rs:67`: «Even
 *   checking a Windows UNC credential path can contact the remote host»; Claude Code `CHANGELOG.md:3721`: «refuse network paths…
 *   before touching them»; Starlette GHSA-wqp7-x3pw-xc5r, letta il 20/11/2026: `realpath` prima del controllo di contenimento). Qui
 *   ogni porta del disco e `child_process` è SPIATA: per un argomento che nomina un ospite inventato la spia CONTA e risponde ENOENT
 *   SENZA chiamare la funzione vera, quindi nemmeno la corsa rossa esce dalla macchina. Nessun comando viene eseguito: i comandi sono
 *   solo TESTO per i riconoscitori, e ogni processo che nominerebbe l'ospite, o che cancellerebbe (`clean -f`, `reset --hard`), è
 *   fermato dalla spia.
 *   Che cosa si prova: il cancello della shell di «Scrive nel progetto» (`scritturaDellaShellFuori`) e la carta prevista delle chiamate
 *   emulate (`cartaForzataPrevista`), e le chiamate emulate (scrivi, file_edit, leggi, elenca, cerca, view_image). Le prove RPC-LOCALE-*
 *   fissano che un disco LOCALE scritto come dispositivo (`\\.\C:\`, `\\.\GLOBALROOT\Device\HarddiskVolumeN\`) tiene la carta critica
 *   e la protezione del lavoro, come la base.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs, { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import fsp from 'node:fs/promises';
import processi from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const B = '\\';
const OSPITE = 'ospite-finto-talos';
const NAS = 'nas-finto-talos';
/* ⛔ Un disco mappato vero di questa macchina non si tocca nemmeno lui: il nome è inventato e la spia lo ferma come la rete. */
const MAPPATO = 'finto-talos-mappato';
const tocchi = [];      // { porta, percorso } — l'ospite di rete toccato: deve restare vuoto
const delNas = [];      // il progetto che sta su una condivisione (simulata): misurarlo è lecito, come oggi
const delMappato = [];  // il disco mappato: misurato come oggi
const lstatDelProgetto = []; // le `lstat` sotto una cartella marcata (prova del tempo): quante letture per comando
let marcaLstat = null;
const collegamentiFinti = new Map(); // percorso locale in minuscolo → bersaglio (un collegamento che NON esiste sul disco)
/* Giro 3: un disco che DISTINGUE le maiuscole (cartella con la distinzione accesa): qui il percorso si confronta esatto, quindi `sub\Link`
   è un collegamento e `sub\link` la cartella vera accanto. */
const collegamentiEsatti = new Map();

const testoDi = (x) => (typeof x === 'string' ? x : Buffer.isBuffer(x) ? x.toString('utf8') : x instanceof URL ? x.href : null);
const enoent = (porta) => Object.assign(new Error(`ENOENT: spia di rete (${porta})`), { code: 'ENOENT' });
const statFinto = (cartella) => ({ isSymbolicLink: () => !cartella, isDirectory: () => cartella, isFile: () => false });
const sottoNas = (s) => s.replaceAll('/', B).toLowerCase().includes(`${B}${B}${NAS}${B}lavoro`);
/* Un tocco di rete è un percorso che PARTE con due barre e nomina l'ospite (`\\ospite`, `\\?\UNC\ospite`, `\\ospite@SSL`); un nome
   locale dentro il progetto che contiene la parola (`progetto\'\ospite…'`, `progetto\file:\ospite…`) resta sul disco di questa macchina. */
const versoLOspite = (s) => /^[\\/]{2}/u.test(s) && s.toLowerCase().includes(OSPITE);

/* La spia: `realpath`, `lstat`, `stat`, `open`, `readdir`, `readlink`, `access`, `readFile`, `opendir` di `fs/promises`; le stesse
   `Sync` di `fs`, `existsSync` e `realpathSync.native`; `spawn`, `spawnSync`, `execFile`, `execFileSync`, `exec`, `execSync`. */
const PORTE_PROMESSE = ['realpath', 'lstat', 'stat', 'open', 'readdir', 'readlink', 'access', 'readFile', 'opendir'];
const PORTE_SYNC = ['realpathSync', 'existsSync', 'statSync', 'lstatSync', 'readdirSync', 'openSync', 'readlinkSync', 'accessSync', 'readFileSync', 'opendirSync'];
const vere = new Map();
function spia(modulo, porta, promessa) {
  const vera = modulo[porta];
  vere.set(`${promessa}${porta}`, vera);
  const finta = function (...args) {
    const s = testoDi(args[0]);
    if (s !== null) {
      const basso = s.toLowerCase();
      if (marcaLstat !== null && porta === 'lstat' && basso.startsWith(marcaLstat)) lstatDelProgetto.push(s);
      const link = collegamentiEsatti.get(s.replaceAll('/', B)) ?? collegamentiFinti.get(basso.replaceAll('/', B));
      if (link !== undefined && /^lstat/u.test(porta)) return promessa ? Promise.resolve(statFinto(false)) : statFinto(false);
      if (link !== undefined && /^readlink/u.test(porta)) return promessa ? Promise.resolve(link) : link;
      if (versoLOspite(s)) {
        tocchi.push({ porta, percorso: s });
        if (porta === 'existsSync') return false;
        if (promessa) return Promise.reject(enoent(porta));
        throw enoent(porta);
      }
      if (basso.includes(MAPPATO)) {
        delMappato.push(porta);
        if (porta === 'existsSync') return false;
        if (promessa) return Promise.reject(enoent(porta));
        throw enoent(porta);
      }
      if (sottoNas(s)) {
        /* la condivisione del progetto, simulata: esiste, è una cartella, il suo percorso vero è quello scritto */
        delNas.push(porta);
        const vero = s.replaceAll('/', B).replace(/\\+$/u, '');
        const risposta = /^realpath/u.test(porta) ? vero : porta === 'existsSync' ? true : /stat/u.test(porta) ? statFinto(true) : null;
        if (risposta === null) { if (promessa) return Promise.reject(enoent(porta)); throw enoent(porta); }
        return promessa ? Promise.resolve(risposta) : risposta;
      }
    }
    return vera.apply(this, args);
  };
  if (porta === 'realpathSync') {
    const nativa = vera.native;
    finta.native = function (...args) {
      const s = testoDi(args[0]);
      if (s !== null && versoLOspite(s)) { tocchi.push({ porta: 'realpathSync.native', percorso: s }); throw enoent('realpathSync.native'); }
      if (s !== null && s.toLowerCase().includes(MAPPATO)) { delMappato.push('realpathSync.native'); throw enoent('realpathSync.native'); }
      if (s !== null && sottoNas(s)) { delNas.push('realpathSync.native'); return s.replaceAll('/', B).replace(/\\+$/u, ''); }
      return nativa.apply(this, args);
    };
  }
  modulo[porta] = finta;
}
for (const porta of PORTE_PROMESSE) spia(fsp, porta, true);
for (const porta of PORTE_SYNC) spia(fs, porta, false);
const eseguiti = []; // processi fermati che avrebbero nominato l'ospite (MAI partiti)
const distruttivi = []; // processi fermati che avrebbero cancellato il lavoro (MAI partiti): la protezione del lavoro li ha lasciati passare
const DISTRUTTIVO = /clean["\s,]+-f|reset["\s,]+--hard|checkout["\s,]+--/u; // anche con gli argomenti divisi (`"clean","-fdx"`)
const processiVeri = new Map();
for (const porta of ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'execSync']) {
  const vera = processi[porta];
  processiVeri.set(porta, vera);
  processi[porta] = function (...args) {
    const opzioni = args.find((a) => a && typeof a === 'object' && !Array.isArray(a));
    const cwd = testoDi(opzioni?.cwd) ?? '';
    if (versoLOspite(cwd)) { tocchi.push({ porta: `${porta}(cwd)`, percorso: cwd }); throw enoent(porta); }
    const testo = JSON.stringify(args.map((a) => (typeof a === 'function' ? null : a)));
    if (DISTRUTTIVO.test(testo)) { distruttivi.push(porta); throw enoent(porta); }
    if (testo.toLowerCase().includes('finto-talos')) { eseguiti.push(porta); throw enoent(porta); }
    return vera.apply(this, args);
  };
}
syncBuiltinESMExports();
after(() => {
  for (const porta of PORTE_PROMESSE) fsp[porta] = vere.get(`true${porta}`);
  for (const porta of PORTE_SYNC) fs[porta] = vere.get(`false${porta}`);
  for (const [porta, vera] of processiVeri) processi[porta] = vera;
  syncBuiltinESMExports();
});

const { verificaPermessoScrittura, cartaForzataPrevista, letturaEmulataNelProgetto, posizioneNelProgetto, talosLavora } = await import('../src/kernel/talosHarness.mjs');
const { cancellazioneCritica, dimenticaPercorsiVeri } = await import('../src/kernel/cancellazioni-critiche.mjs');
const { classificaPercorsoDiRete } = await import('../src/kernel/file-namespace-contract.mjs');

const solo = { skip: process.platform !== 'win32' && 'solo Windows: fuori da Windows `\\\\x` non è la rete' };
const unc = (...pezzi) => B + B + pezzi.join(B);
/* Le forme che Windows apre in rete (forma, punto 1). `collegamento` è un collegamento LOCALE finto verso l'ospite. Le ultime cinque
   sono quelle dei revisori del giro 2: lo spazio dei dispositivi che porta alla rete (`GLOBAL`, `DosDevices`, `Mup`). */
const FORME = [
  ['unc', unc(OSPITE, 'cond', 'x.txt')],
  ['due barre', `//${OSPITE}/cond/x.txt`],
  ['barre miste', `${B}/${OSPITE}/cond${B}x.txt`],
  ['lunga ?', `${B}${B}?${B}UNC${B}${OSPITE}${B}cond${B}x.txt`],
  ['lunga .', `${B}${B}.${B}UNC${B}${OSPITE}${B}cond${B}x.txt`],
  ['webdav ssl', unc(`${OSPITE}@SSL`, 'cond', 'x.txt')],
  ['webdav 80', unc(`${OSPITE}@80`, 'x.txt')],
  ['webdav 443', unc(`${OSPITE}@SSL@443`, 'DavWWWRoot', 'x.txt')],
  ['amministrativa', unc(OSPITE, 'C$', 'x.txt')],
  ['amministrativa lunga', `${B}${B}?${B}UNC${B}${OSPITE}${B}C$${B}x.txt`],
  ['file url', `file://${OSPITE}/cond/x.txt`],
  ['collegamento', `collegamento${B}x.txt`],
  ['globale unc .', `${B}${B}.${B}GLOBAL${B}UNC${B}${OSPITE}${B}cond${B}x.txt`],
  ['dosdevices unc', `${B}${B}.${B}GLOBALROOT${B}DosDevices${B}UNC${B}${OSPITE}${B}cond${B}x.txt`],
  ['globale mup .', `${B}${B}.${B}GLOBAL${B}GLOBALROOT${B}Device${B}Mup${B}${OSPITE}${B}cond${B}x.txt`],
  ['mup ?', `${B}${B}?${B}GLOBALROOT${B}Device${B}Mup${B}${OSPITE}${B}cond${B}x.txt`],
  /* giro 3: dopo `\\?\GLOBAL\GLOBALROOT` le altre strade verso la rete (revisori di sicurezza e di riproduzione) */
  ['globale lanman ?', `${B}${B}?${B}GLOBAL${B}GLOBALROOT${B}Device${B}LanmanRedirector${B}${OSPITE}${B}cond${B}x.txt`],
  ['globale ??unc ?', `${B}${B}?${B}GLOBAL${B}GLOBALROOT${B}??${B}UNC${B}${OSPITE}${B}cond${B}x.txt`],
  ['globale dosdevices ?', `${B}${B}?${B}GLOBAL${B}GLOBALROOT${B}DosDevices${B}UNC${B}${OSPITE}${B}cond${B}x.txt`],
  ['globale global?? ?', `${B}${B}?${B}GLOBAL${B}GLOBALROOT${B}GLOBAL??${B}UNC${B}${OSPITE}${B}cond${B}x.txt`],
];
const LIVELLI = ['lettura', 'ricerca', 'su-richiesta', 'scrittura-area', 'scrittura-progetto', 'accesso-pieno'];
const PERMESSI = [undefined, { shell: 'sempre', scrivi: 'sempre', file_edit: 'sempre', leggi: 'sempre', elenca: 'sempre' }];
/* I comandi che scrivono: copia, reindirizzamento, PowerShell, virgolette, bash -c. */
const scrittureVerso = (p) => [
  `copy a.txt ${p}`, `cp a.txt ${p}`, `echo x > ${p}`, `powershell -Command "Set-Content '${p}' x"`, `copy a.txt "${p}"`,
  `bash -c 'cp a.txt ${p.replaceAll(B, '/')}'`,
];
/* La variabile data nel testo (forma, punto 1): PowerShell, cmd, POSIX. */
const CON_VARIABILE = [
  `$env:X='${unc(OSPITE, 'cond')}'; Set-Content "$env:X${B}x.txt" y`,
  `set X=${unc(OSPITE, 'cond')} && copy a.txt %X%${B}x.txt`,
  `X=//${OSPITE}/cond; cp a.txt $X/x.txt`,
];

function progetto(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-rete-prima-'));
  mkdirSync(join(c, 'src'));
  t.after(() => rimuoviCartellaDiProva(c));
  collegamentiFinti.set(join(c, 'collegamento').toLowerCase(), unc(OSPITE, 'cond'));
  return c;
}
const azzera = () => { tocchi.length = 0; eseguiti.length = 0; distruttivi.length = 0; };
const riassunto = () => [...new Set(tocchi.map((x) => x.porta))].join(',');

/* Quanti tocchi fa ciascun punto: `per` raccoglie i conteggi, la diagnostica li dice tutti prima di ogni altra asserzione. */
async function conta(per, nome, fn) {
  const prima = tocchi.length;
  const r = await fn();
  per[nome] = (per[nome] ?? 0) + tocchi.length - prima;
  return r;
}

/* La shell intera, dal cancello e dalla carta prevista delle chiamate emulate, in ogni livello, senza permessi e con «sempre». */
async function provaLaShell(t, comandiDi) {
  const c = progetto(t);
  azzera();
  const per = {};
  const senzaCarta = [];
  for (const [nome, p] of FORME) {
    for (const comando of comandiDi(nome, p)) {
      for (const livelloAccesso of LIVELLI) {
        for (const permessiPerAttrezzo of PERMESSI) {
          const chieste = [];
          await conta(per, 'cancello', () => verificaPermessoScrittura({ toolCallId: 'r', tipo: 'shell', comando }, {
            livelloAccesso, cartella: c, consensiSessione: {}, ...(permessiPerAttrezzo ? { permessiPerAttrezzo } : {}),
            chiediApprovazioneFn: async (a) => { chieste.push(a); return false; },
          }));
          await conta(per, 'prevista', () => cartaForzataPrevista('shell', { comando }, { livelloAccesso, cartella: c, consensiSessione: {} }));
          if (livelloAccesso !== 'scrittura-progetto') continue;
          if (chieste.length === 0 && nome !== 'file url') senzaCarta.push(`${nome} :: ${comando}`);
          for (const a of chieste) if (a.fuoriDalProgetto?.chiave !== undefined || a.cancellazioneCritica?.chiave !== undefined) senzaCarta.push(`«per la sessione» :: ${nome} :: ${comando}`);
        }
      }
    }
  }
  t.diagnostic(`tocchi: ${tocchi.length} (cancello ${per.cancello}, carta prevista ${per.prevista}; ${riassunto()}); processi fermati: ${eseguiti.length}`);
  assert.deepEqual(tocchi.map((x) => `${x.porta} ${x.percorso}`), [], 'nessun contatto con l ospite prima della carta');
  assert.deepEqual(senzaCarta, [], 'in «Scrive nel progetto» ogni scrittura verso la rete chiede, mai «per la sessione»');
}

test('RPC-T1-T2: la shell che SCRIVE verso la rete, in ogni livello e con «shell: sempre», non la tocca prima della carta; in «Scrive nel progetto» chiede senza «per la sessione»', solo, async (t) => {
  await provaLaShell(t, (nome, p) => [...scrittureVerso(p), ...(nome === 'unc' ? CON_VARIABILE : [])]);
});

test('RPC-T1-FRASE: in «Scrive nel progetto» la carta di una scrittura verso \\\\ospite dice il computer di rete (frase network.open); la lunga NT dice «non verificato»', solo, async (t) => {
  const c = progetto(t);
  azzera();
  const carta = async (comando) => {
    const chieste = [];
    await verificaPermessoScrittura({ toolCallId: 'r', tipo: 'shell', comando }, { livelloAccesso: 'scrittura-progetto', cartella: c, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' }, chiediApprovazioneFn: async (a) => { chieste.push(a); return false; } });
    assert.equal(chieste.length, 1, comando);
    return chieste[0].fuoriDalProgetto;
  };
  for (const p of [unc(OSPITE, 'cond', 'x.txt'), `//${OSPITE}/cond/x.txt`, unc(`${OSPITE}@SSL`, 'cond', 'x.txt'), `collegamento${B}x.txt`]) {
    const f = await carta(`copy a.txt ${p}`);
    assert.equal(f.fraseChiave, 'server.approval.network.open', p);
    assert.equal(f.fraseParams.cosaChiave, 'server.approval.network.action.write', p);
    assert.match(f.fraseParams.ospite, new RegExp(`^${OSPITE}`, 'u'), p);
    assert.equal(f.verificato, false, p);
  }
  /* la forma lunga NT: una carta c'è, senza «per la sessione» e senza tocchi */
  const nt = await carta(`copy a.txt ${B}${B}?${B}UNC${B}${OSPITE}${B}cond${B}x.txt`);
  assert.equal(nt.chiave, undefined, 'un prefisso NT: mai «per la sessione»');
  assert.equal((await carta(`copy a.txt file://${OSPITE}/cond/x.txt`)).fraseChiave, 'server.approval.outsideProject.unverified', 'file:// resta illeggibile');
  assert.deepEqual(tocchi, []);
});


test('RPC-T3-T4: le chiamate emulate (scrivi, file_edit, leggi, elenca, cerca, view_image) non toccano la rete', solo, async (t) => {
  const c = progetto(t);
  azzera();
  const per = {};
  const sbagli = [];
  for (const [nome, p] of FORME) {
    for (const livelloAccesso of LIVELLI) {
      for (const tipo of ['scrivi', 'file_edit']) {
        const previsto = await conta(per, 'T3', () => cartaForzataPrevista(tipo, { percorso: p }, { livelloAccesso, cartella: c, consensiSessione: {} }));
        if (livelloAccesso === 'scrittura-progetto' && nome !== 'file url' && previsto !== 'fuoriDalProgetto') sbagli.push(`${tipo} ${nome}: ${previsto}`);
      }
      /* `file://…` per un attrezzo dei file è un nome relativo nel progetto (`file:\…`), non la rete: qui non conta */
      for (const [tipo, campo] of [['leggi', 'percorso'], ['elenca', 'percorso'], ['cerca', 'dentro'], ['view_image', 'path']]) {
        const dentro = await conta(per, 'T4', () => letturaEmulataNelProgetto(tipo, { [campo]: p }, c));
        if (nome !== 'file url' && dentro !== false) sbagli.push(`${tipo} ${nome}: dentro`);
      }
    }
  }
  t.diagnostic(`tocchi: ${tocchi.length} (T3 ${per.T3}, T4 ${per.T4}; ${riassunto()})`);
  assert.deepEqual(tocchi.map((x) => `${x.porta} ${x.percorso}`), []);
  assert.deepEqual(sbagli, [], 'in «Scrive nel progetto» la scrittura emulata verso la rete prende la carta; la lettura emulata non è «dentro»');
});


/* ── I dischi LOCALI scritti come dispositivo (revisori del giro 2): nessuna carta critica persa, protezione del lavoro tenuta ── */

/* Il numero del volume di C: nello spazio dei dispositivi (`\\?\GLOBALROOT\Device\HarddiskVolumeN`): si cerca con `statSync` sul disco
   LOCALE (stesso file = stesso volume e stesso indice). Nessun volume trovato ⇒ si provano solo le forme `\\.\C:` e `\\?\C:`. */
const volumeDiC = (() => {
  if (process.platform !== 'win32') return null;
  let w;
  try { w = fs.statSync(`C:${B}Windows`, { bigint: true }); } catch { return null; }
  for (let n = 1; n <= 32; n += 1) {
    try {
      const v = fs.statSync(`${B}${B}?${B}GLOBALROOT${B}Device${B}HarddiskVolume${n}${B}Windows`, { bigint: true, throwIfNoEntry: false });
      if (v && v.ino === w.ino && v.dev === w.dev) return n;
    } catch { /* un volume che non si legge: il prossimo */ }
  }
  return null;
})();
const grafieLocali = (assoluto) => {
  const resto = assoluto.slice(2); // dopo `C:`
  return [
    [`\\\\.\\C:`, `${B}${B}.${B}${assoluto}`],
    [`\\\\?\\C:`, `${B}${B}?${B}${assoluto}`],
    ...(volumeDiC ? [
      ['\\\\.\\GLOBALROOT', `${B}${B}.${B}GLOBALROOT${B}Device${B}HarddiskVolume${volumeDiC}${resto}`],
      ['\\\\?\\GLOBALROOT', `${B}${B}?${B}GLOBALROOT${B}Device${B}HarddiskVolume${volumeDiC}${resto}`],
    ] : []),
  ];
};

test('RPC-LOCALE-CRITICHE: cancellare un disco LOCALE scritto `\\\\.\\C:\\…` o `\\\\.\\GLOBALROOT\\Device\\HarddiskVolumeN\\…` (prima cartella, casa, progetto) resta una cancellazione critica con la sua carta, come la base', { skip: (process.platform !== 'win32' || !/^C:/iu.test(tmpdir()) || !/^C:/iu.test(homedir())) && 'solo Windows, col profilo di prova su C:' }, async (t) => {
  const c = progetto(t);
  azzera();
  t.diagnostic(`volume di C: ${volumeDiC ?? 'non trovato (solo \\\\.\\C: e \\\\?\\C:)'}`);
  const perse = [];
  for (const posto of [`C:${B}Windows`, `C:${B}Users`, homedir(), c]) {
    for (const [nome, s] of grafieLocali(posto)) {
      for (const comando of [`rm -rf ${s}/`, `Remove-Item -Recurse -Force ${s}`, `rd /s /q ${s}${B}`]) {
        dimenticaPercorsiVeri();
        if (!cancellazioneCritica(comando, { cartella: c })) perse.push(`lettura :: ${nome} :: ${comando}`);
        for (const [livelloAccesso, permessiPerAttrezzo] of [['accesso-pieno', undefined], ['accesso-pieno', { shell: 'sempre' }], ['su-richiesta', { shell: 'sempre' }], ['scrittura-progetto', { shell: 'sempre' }]]) {
          const chieste = [];
          const r = await verificaPermessoScrittura({ toolCallId: 'r', tipo: 'shell', comando }, { livelloAccesso, cartella: c, consensiSessione: {}, ...(permessiPerAttrezzo ? { permessiPerAttrezzo } : {}), chiediApprovazioneFn: async (a) => { chieste.push(a); return false; } });
          if (r.consentito !== false || !chieste.some((a) => a.cancellazioneCritica)) perse.push(`${livelloAccesso}${permessiPerAttrezzo ? '+sempre' : ''} :: ${nome} :: ${comando}`);
        }
      }
    }
  }
  assert.deepEqual(perse, [], 'nessuna carta critica persa su un disco locale scritto come dispositivo');
  assert.deepEqual(tocchi, []);
});

test('RPC-LOCALE-LAVORO: `git -C \\\\.\\C:\\…\\repo clean -fdx` su un repository LOCALE col lavoro non salvato della persona resta fermato dalla protezione del lavoro, come la base', { skip: (process.platform !== 'win32' || !/^C:/iu.test(tmpdir())) && 'solo Windows, col profilo di prova su C:' }, async (t) => {
  const c = progetto(t);
  const repo = join(c, 'repo');
  mkdirSync(repo);
  const init = processi.spawnSync('git', ['init', '-q', repo], { stdio: 'ignore', windowsHide: true });
  if (init.status !== 0) { t.skip('git non disponibile'); return; }
  writeFileSync(join(repo, 'lavoro-della-persona.txt'), 'non salvato');
  azzera();
  const partiti = [];
  for (const [nome, dove] of [['C:', repo], ...grafieLocali(repo)]) {
    for (const [livelloAccesso, permessiPerAttrezzo] of [['su-richiesta', { shell: 'sempre' }], ['scrittura-progetto', undefined], ['scrittura-progetto', { shell: 'sempre' }], ['accesso-pieno', undefined], ['accesso-pieno', { shell: 'sempre' }]]) {
      const prima = distruttivi.length;
      await giro(c, [chiama('g', 'shell', { comando: `git -C ${dove} clean -fdx` })], { livelloAccesso, ...(permessiPerAttrezzo ? { permessiPerAttrezzo } : {}) });
      if (distruttivi.length > prima) partiti.push(`${nome} :: ${livelloAccesso}${permessiPerAttrezzo ? '+sempre' : ''}`);
    }
  }
  assert.deepEqual(partiti, [], 'il lavoro della persona su un disco locale scritto come dispositivo resta protetto');
  assert.deepEqual(tocchi, []);
});

const chiama = (id, nome, argomenti) => ({ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } });
async function giro(cartella, chiamate, extra) {
  let n = 0;
  const domande = [];
  await talosLavora({
    cartella, task: { consegna: 'Prova.' }, modello: 'test', chiave: 'test',
    chiediApprovazioneFn: async (a) => { domande.push(a); return false; },
    fetchDiRete: async () => ({ ok: true, status: 200, text: async () => '', json: async () => ({
      choices: [{ message: n++ === 0 ? { role: 'assistant', content: null, tool_calls: chiamate } : { role: 'assistant', content: 'Fatto.' } }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    }) }),
    ...extra,
  });
  return domande;
}

test('RPC-CONTROPROVA: progetto su una condivisione — dentro nessuna carta e si misura come oggi; un altra condivisione chiede; un disco mappato si misura come oggi', solo, async (t) => {
  azzera();
  delNas.length = 0;
  delMappato.length = 0;
  const nas = unc(NAS, 'lavoro');
  const dentro = await posizioneNelProgetto(nas, `sub${B}x.txt`);
  assert.equal(dentro.dentro, true, 'un file dentro il progetto di rete è dentro');
  assert.equal(dentro.verificato, true);
  assert.ok(delNas.length > 0, 'il progetto di rete si misura come oggi');
  const carte = [];
  for (const comando of [`copy a.txt sub${B}x.txt`, `copy a.txt ${unc(NAS, 'lavoro', 'sub', 'x.txt')}`, `echo x > ${unc(NAS, 'lavoro', 'y.txt')}`]) {
    const chieste = [];
    const r = await verificaPermessoScrittura({ toolCallId: 'r', tipo: 'shell', comando }, { livelloAccesso: 'scrittura-progetto', cartella: nas, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' }, chiediApprovazioneFn: async (a) => { chieste.push(a); return false; } });
    carte.push(...chieste);
    assert.equal(r.consentito, true, comando);
  }
  assert.equal(carte.length, 0, 'dentro il progetto di rete: nessuna carta in più');
  /* la condivisione accanto (`lavoro2`) e un altro ospite: rete estranea, mai misurata */
  delNas.length = 0;
  for (const altro of [unc(NAS, 'lavoro2', 'x.txt'), unc(OSPITE, 'lavoro', 'x.txt')]) {
    const fuori = await posizioneNelProgetto(nas, altro);
    assert.equal(fuori.verificato, false, altro);
    assert.equal(fuori.dentro, false, altro);
  }
  assert.deepEqual(delNas, [], '`lavoro2` non è dentro `lavoro`: nessuna misura');
  assert.deepEqual(tocchi, []);
  /* il disco mappato (nome inventato, fermato dalla spia): si misura come oggi */
  await posizioneNelProgetto(progetto(t), `Z:${B}${MAPPATO}${B}x.txt`);
  assert.ok(delMappato.length > 0, 'Z: si misura come oggi (realpath)');
});

test('RPC-SPIA: la spia conta davvero (AL CONTRARIO: chi apre la rete viene contato e non esce dalla macchina)', solo, async () => {
  azzera();
  await assert.rejects(fsp.realpath(unc(OSPITE, 'cond')), { code: 'ENOENT' });
  assert.equal(fs.existsSync(`${B}${B}?${B}UNC${B}${OSPITE}${B}cond`), false);
  assert.throws(() => fs.realpathSync.native(`//${OSPITE}/cond`), { code: 'ENOENT' });
  assert.deepEqual(tocchi.map((x) => x.porta), ['realpath', 'existsSync', 'realpathSync.native']);
  /* il bersaglio non esiste: anche se la spia sbagliasse, non ci sarebbe niente da cancellare */
  const nessuno = join(tmpdir(), 'talos-rete-prima-non-esiste');
  assert.throws(() => processi.spawnSync('git', ['-C', nessuno, 'clean', '-fdx']), { code: 'ENOENT' });
  assert.throws(() => processi.execSync(`git -C "${nessuno}" reset --hard`), { code: 'ENOENT' });
  assert.equal(distruttivi.length, 2, 'un processo che cancella è fermato e contato, con gli argomenti divisi o in una riga');
});

/* ── Giro 2, cure su A dai revisori ── */

const GLOBALE_UNC = `${B}${B}?${B}GLOBAL${B}UNC${B}${OSPITE}${B}cond${B}x.txt`;
test('RPC-GLOBALE: `\\\\?\\GLOBAL\\UNC\\ospite\\…` porta alla rete come `\\\\?\\UNC\\…`: riconosciuta dal testo, 0 tocchi in T1-T4; le grafie locali non cambiano', solo, async (t) => {
  assert.equal(classificaPercorsoDiRete(GLOBALE_UNC), 'nt');
  assert.equal(classificaPercorsoDiRete(`//?/global/Global/unc/${OSPITE}/cond`), 'nt', 'minuscole, barre dritte, GLOBAL ripetuto');
  assert.equal(classificaPercorsoDiRete(`${B}${B}?${B}Global${B}GLOBALROOT${B}Device${B}Mup${B}${OSPITE}${B}c`), 'nt');
  /* AL CONTRARIO: ciò che sta su questo disco resta com'era (nessuna decisione locale cambia) */
  assert.equal(classificaPercorsoDiRete(`${B}${B}?${B}GLOBAL${B}C:${B}Windows`), null);
  assert.equal(classificaPercorsoDiRete(`${B}${B}?${B}GLOBALE${B}UNC${B}${OSPITE}`), null);
  assert.equal(classificaPercorsoDiRete(`${B}${B}?${B}C:${B}x`), null);
  /* giro 3: `\\?\GLOBAL\GLOBALROOT…` è NT per intero, come `\\?\GLOBALROOT…` senza GLOBAL (che lo era già, anche verso un volume locale) */
  for (const coda of [`Device${B}LanmanRedirector${B}${OSPITE}${B}c`, `??${B}UNC${B}${OSPITE}${B}c`, `DosDevices${B}UNC${B}${OSPITE}${B}c`, `GLOBAL??${B}UNC${B}${OSPITE}${B}c`, `Device${B}HarddiskVolume3${B}x`]) {
    assert.equal(classificaPercorsoDiRete(`${B}${B}?${B}GLOBAL${B}GLOBALROOT${B}${coda}`), 'nt', coda);
    assert.equal(classificaPercorsoDiRete(`${B}${B}?${B}GLOBALROOT${B}${coda}`), 'nt', `senza GLOBAL, come prima: ${coda}`);
  }
  const c = progetto(t);
  /* AL CONTRARIO, sul disco: `\\?\GLOBAL\C:\<progetto>\x` resta locale, misurato come la base (nessun campo `rete`, dentro il progetto) */
  const locale = await posizioneNelProgetto(c, `${B}${B}?${B}GLOBAL${B}${c}${B}x.txt`);
  assert.equal(locale.rete, undefined, '`\\\\?\\GLOBAL\\C:` non è la rete');
  assert.equal(classificaPercorsoDiRete(`${B}${B}?${B}GLOBAL${B}${c}${B}x.txt`), null);
  azzera();
  for (const livelloAccesso of LIVELLI) {
    for (const comando of scrittureVerso(GLOBALE_UNC)) {
      const chieste = [];
      await verificaPermessoScrittura({ toolCallId: 'r', tipo: 'shell', comando }, { livelloAccesso, cartella: c, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' }, chiediApprovazioneFn: async (a) => { chieste.push(a); return false; } });
      await cartaForzataPrevista('shell', { comando }, { livelloAccesso, cartella: c, consensiSessione: {} });
      if (livelloAccesso === 'scrittura-progetto') assert.ok(chieste.length > 0 && chieste.every((a) => a.fuoriDalProgetto?.chiave === undefined), comando);
    }
    for (const tipo of ['scrivi', 'file_edit']) await cartaForzataPrevista(tipo, { percorso: GLOBALE_UNC }, { livelloAccesso, cartella: c, consensiSessione: {} });
    for (const [tipo, campo] of [['leggi', 'percorso'], ['elenca', 'percorso'], ['cerca', 'dentro'], ['view_image', 'path']]) assert.equal(await letturaEmulataNelProgetto(tipo, { [campo]: GLOBALE_UNC }, c), false);
  }
  const p = await posizioneNelProgetto(c, GLOBALE_UNC);
  assert.equal(p.verificato, false);
  t.diagnostic(`tocchi: ${tocchi.length} (${riassunto()})`);
  assert.deepEqual(tocchi.map((x) => `${x.porta} ${x.percorso}`), []);
});

test('RPC-GARA: un collegamento del progetto che durante la carta passa da `\\\\ospite` a `\\\\ospite-due`: la seconda misura lo vede e `scrivi` non scrive', solo, async (t) => {
  const c = progetto(t);
  const link = join(c, 'collegamento').toLowerCase();
  t.after(() => collegamentiFinti.set(link, unc(OSPITE, 'cond')));
  azzera();
  /* prima: le due misure di `posizioneNelProgetto` dicono ospiti diversi (il campo che la seconda misura confronta) */
  const prima = await posizioneNelProgetto(c, `collegamento${B}a.txt`);
  collegamentiFinti.set(link, unc(`${OSPITE}-due`, 'cond'));
  const ora = await posizioneNelProgetto(c, `collegamento${B}a.txt`);
  assert.equal(prima.rete?.ospite, OSPITE);
  assert.equal(ora.rete?.ospite, `${OSPITE}-due`);
  collegamentiFinti.set(link, unc(OSPITE, 'cond'));
  /* il giro vero: con un contenuto sospetto nel giro, dopo la prima misura il cancello chiede ancora («conferma», F-027). La persona
     dice sì a tutte e due le carte; durante la seconda il collegamento passa all'altro ospite. */
  let n = 0;
  const risposte = [];
  const carte = [];
  await talosLavora({
    cartella: c, task: { consegna: 'Prova.' }, modello: 'test', chiave: 'test', livelloAccesso: 'scrittura-progetto',
    sospettoDelContesto: { fonte: 'web_fetch', motivi: ['prova del giro 2'] },
    chiediApprovazioneFn: async (a) => { carte.push(a); if (carte.length >= 2) collegamentiFinti.set(link, unc(`${OSPITE}-due`, 'cond')); return true; },
    fetchDiRete: async (_u, init) => {
      risposte.push(String(init?.body ?? ''));
      return { ok: true, status: 200, text: async () => '', json: async () => ({
        choices: [{ message: n++ === 0 ? { role: 'assistant', content: null, tool_calls: [chiama('s', 'scrivi', { percorso: `collegamento${B}a.txt`, contenuto: 'x' })] } : { role: 'assistant', content: 'Fatto.' } }],
        usage: { prompt_tokens: 10, completion_tokens: 10 },
      }) };
    },
  });
  t.diagnostic(`carte: ${carte.length} ${JSON.stringify(carte.map((a) => Object.keys(a).filter((k) => a[k] && typeof a[k] === 'object')))}; tocchi: ${tocchi.length}`);
  assert.ok(carte.length >= 1, 'una carta c è');
  assert.match(risposte.at(-1), /leads somewhere else than when it was checked/u, 'la scrittura si rifiuta: il posto è cambiato durante la carta');
  assert.deepEqual(tocchi, []);
});

/* ── Giro 3 ── */
test('RPC-MAIUSCOLE: in una cartella che distingue le maiuscole, `sub\\link` cartella e `sub\\Link` collegamento verso la rete sono due posti; due cartelle `link` diverse anche: la memoria del comando non li confonde, la carta c è e 0 tocchi', solo, async (t) => {
  const c = progetto(t);
  for (const d of [['sub', 'link'], ['a', 'link'], ['b']]) mkdirSync(join(c, ...d), { recursive: true });
  const maiuscolo = join(c, 'sub', 'Link');
  const altroLink = join(c, 'b', 'link');
  collegamentiEsatti.set(maiuscolo, unc(OSPITE, 'cond'));
  collegamentiEsatti.set(altroLink, unc(OSPITE, 'cond'));
  t.after(() => { collegamentiEsatti.delete(maiuscolo); collegamentiEsatti.delete(altroLink); });
  azzera();
  const carta = async (comando) => {
    const chieste = [];
    const r = await verificaPermessoScrittura({ toolCallId: 'r', tipo: 'shell', comando }, { livelloAccesso: 'scrittura-progetto', cartella: c, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' }, chiediApprovazioneFn: async (a) => { chieste.push(a); return false; } });
    return { r, chieste };
  };
  /* prima la cartella vera, poi il collegamento con le maiuscole diverse (stessa madre, stesso comando) */
  const uno = await carta('cp a.txt sub/link/y.txt && cp a.txt sub/Link/x.txt');
  assert.equal(uno.r.consentito, false, 'sub/Link porta alla rete: una carta, mai via libera');
  assert.equal(uno.chieste.length, 1);
  assert.equal(uno.chieste[0].fuoriDalProgetto?.fraseChiave, 'server.approval.network.open');
  assert.equal(uno.chieste[0].fuoriDalProgetto?.chiave, undefined, 'mai «per la sessione»');
  /* due cartelle che si chiamano tutte e due `link`, in madri diverse: la memoria non si fa col solo nome dell'ultimo pezzo */
  const due = await carta('cp a.txt a/link/y.txt && cp a.txt b/link/x.txt');
  assert.equal(due.r.consentito, false, 'b/link porta alla rete');
  assert.equal(due.chieste[0]?.fuoriDalProgetto?.fraseChiave, 'server.approval.network.open');
  /* AL CONTRARIO: la sola cartella vera, nessuna carta */
  assert.equal((await carta('cp a.txt sub/link/y.txt && cp a.txt a/link/z.txt')).chieste.length, 0);
  t.diagnostic(`tocchi: ${tocchi.length} (${riassunto()})`);
  assert.deepEqual(tocchi.map((x) => `${x.porta} ${x.percorso}`), []);
});

test('RPC-PEZZI: nello stesso comando i pezzi del percorso già letti non si rileggono (`cp` verso 60 cartelle: al più 2 `lstat` per cartella)', solo, async (t) => {
  const c = progetto(t);
  for (let i = 0; i < 60; i += 1) mkdirSync(join(c, 'src', `d${i}`));
  const comando = Array.from({ length: 60 }, (_, i) => `cp a.txt src/d${i}/x.txt`).join(' && ');
  azzera();
  lstatDelProgetto.length = 0;
  marcaLstat = '';
  let r;
  try { r = await verificaPermessoScrittura({ toolCallId: 'r', tipo: 'shell', comando }, { livelloAccesso: 'scrittura-progetto', cartella: c, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' }, chiediApprovazioneFn: async () => false }); }
  finally { marcaLstat = null; }
  t.diagnostic(`lstat: ${lstatDelProgetto.length} per 60 cartelle`);
  assert.equal(r.consentito, true, 'dentro il progetto: nessuna carta');
  assert.ok(lstatDelProgetto.length <= 2 * 60 + 12, `lstat ${lstatDelProgetto.length}: i pezzi comuni (C:, C:\\T, …) si leggono una volta`);
  /* AL CONTRARIO: comandi diversi non condividono la memoria (un collegamento cambiato fra due comandi si vede) */
  lstatDelProgetto.length = 0;
  marcaLstat = '';
  try { for (let k = 0; k < 2; k += 1) await verificaPermessoScrittura({ toolCallId: 'r', tipo: 'shell', comando: 'cp a.txt src/d0/x.txt' }, { livelloAccesso: 'scrittura-progetto', cartella: c, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' }, chiediApprovazioneFn: async () => false }); }
  finally { marcaLstat = null; }
  const diUno = lstatDelProgetto.length / 2;
  assert.ok(Number.isInteger(diUno) && diUno >= 3, `due comandi uguali rileggono tutto: ${lstatDelProgetto.length}`);
  assert.deepEqual(tocchi, []);
});
