/*
 * Giro di cura unico della riparazione dei permessi (12/11/2026) — LE SECONDE PROVE di `path-policy.mjs`: ogni riga che nella corsa dei
 * mutanti del giro (B 52, C 70, A 24 e quelli dell'autore, in copia) cadeva per UNA prova sola ha qui una seconda prova, con un
 * ingresso diverso dalla prima. Solo `path-policy.mjs` (niente cancellazioni critiche): questo file si porta così com'è sulla CLI.
 * Riga → prima prova → questa (path-policy.mjs):
 *  :302 :304 (la casa in due pezzi, `${env:USERPROFILE}`) GRAFIE-HP2 → SECONDA-P01 · :1479 (secondo nome coi prefissi lunghi)
 *  GRAFIE-PL2 → SECONDA-P02 · :2000 (questo computer: 127.x, `\\?\UNC\`) CRED-GRAFIE-01 → SECONDA-P03 · :2057 :2244 (la parola che
 *  sposta non è un percorso) CDL-1 → SECONDA-P04 · :2074 :2078 :2079 (i dischi delle variabili e della casa) GRAFIE-LU1 → SECONDA-P05
 *  · :2333 (secondo nome sul disco nominato) GRAFIE-LU1 → SECONDA-P06 · :2341 (esempio con una chiave sul disco nominato) PERM-N04 →
 *  SECONDA-P07 · :2092 :2103 (la casa in due pezzi come bersaglio, la catena dei `cd`) GRAFIE-CD1 → SECONDA-P08 · :2111 (il tetto per
 *  spostamento) CDL-2 → SECONDA-P09 · :2115 (il disco della cartella in cui ci si sposta) PERM-D16 → SECONDA-P10 · :2123 :2556 (senza
 *  cartella) GRAFIE-MU2 → SECONDA-P11 · :2254 (un posto senza percorso vero non ferma gli altri) PERM-N25 → SECONDA-P12 · :2562
 *  (bloccata per nome su ogni posto) PERM-N34 → SECONDA-P13 · :2568 :2572 (il posto di sempre che non si risolve, i prefissi di
 *  dispositivo) GRAFIE-LU1 e GRAFIE-PL1 → SECONDA-P14 · :1452 :1456 :1957 :1958 (giunzione del disco del processo) PROCESSO-M2 e
 *  PROCESSO-B23 → SECONDA-P15 · :2067 (fuori da Windows gli spostamenti non si contano) FUORI-W2 → SECONDA-P16.
 * Tutto finto (cartelle temporanee, segreti finti, dischi che non esistono); niente viene eseguito; la giunzione si stacca (`rmdir`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { bloccataDa, comandoNominaUnaBloccata, credenzialeDellaCasaLetta, motivoDaChiedere, scritturaDiUnaCredenziale } from '../src/path-policy.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const WINDOWS = process.platform === 'win32';
const SEGNO = 'CHIAVE-FINTA-DELLE-SECONDE-PROVE';
const SK = ['sk', 'proj', 'Z9y8X7w6V5u4T3s2R1q0P9o8N7m6'].join('-'); // la FORMA di una chiave, a pezzi: non è una chiave
const BS = String.fromCharCode(92);
const DOLLARO = String.fromCharCode(36);

const radice = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-seconde-')));
const L = radice.slice(0, 1).toUpperCase(); // il disco delle cose (vero)
const liberi = WINDOWS ? [...'QZYXWVUSPONMK'].filter((l) => l !== L && !existsSync(`${l}:${BS}`)) : [];
const [fantasma, terzo] = liberi;
const SALTA = !WINDOWS || !fantasma || !terzo;
const sd = (p) => p.slice(2);
const dritte = (p) => p.replaceAll(BS, '/');
const f = {
  casa: join(radice, 'casa'), progetto: join(radice, 'lavori', 'progetto'), riservata: join(radice, 'lavori', 'progetto', 'riservata'),
  bloccata: join(radice, 'bloccata'), altro: join(radice, 'altro'), ponteSsh: join(radice, 'ponte-ssh'),
};
for (const d of [join(f.casa, '.ssh'), join(f.casa, 'progetti'), join(f.progetto, 'src'), f.riservata, f.bloccata, f.altro]) mkdirSync(d, { recursive: true });
writeFileSync(join(f.casa, '.ssh', 'id_ed25519'), `${SEGNO} ssh\n`);
writeFileSync(join(f.casa, '.ssh', 'config'), `${SEGNO} config\n`);
writeFileSync(join(f.casa, '.npmrc'), `${SEGNO} npmrc\n`);
writeFileSync(join(f.casa, 'progetti', 'nota.txt'), 'una nota della casa\n');
writeFileSync(join(f.casa, 'progetti', 'chiavi.example.json'), `{"apiKey":"${SK}"}\n`); // un esempio con una chiave: si riconosce solo aprendolo
writeFileSync(join(f.progetto, '.env'), `TOKEN=${SEGNO}\n`);
writeFileSync(join(f.progetto, 'nota.txt'), 'una nota qualunque\n');
writeFileSync(join(f.bloccata, 'privato.txt'), `${SEGNO} bloccata\n`);
writeFileSync(join(f.bloccata, 'altro.txt'), `${SEGNO} bloccata\n`);
writeFileSync(join(f.altro, 'nota.txt'), 'una nota qualunque\n');
if (WINDOWS) {
  symlinkSync(join(f.casa, '.ssh'), f.ponteSsh, 'junction');
  linkSync(join(f.progetto, '.env'), join(f.progetto, 'appunti.md')); // un secondo nome del segreto del progetto
}
const prima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
process.env.USERPROFILE = f.casa; process.env.HOME = f.casa;
const cwdVera = process.cwd;
const processoSu = (cartella) => { process.cwd = () => cartella; };
if (!SALTA) processoSu(`${fantasma}:${BS}`);
test.after(async () => {
  process.cwd = cwdVera;
  try { rmdirSync(f.ponteSsh); } catch { /* già staccata */ }
  if (prima.USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prima.USERPROFILE;
  if (prima.HOME === undefined) delete process.env.HOME; else process.env.HOME = prima.HOME;
  await rimuoviCartellaDiProvaAttesa(radice);
});
const letta = (comando, cartella = f.progetto) => credenzialeDellaCasaLetta({ tipo: 'shell', comando, cartella, home: f.casa });
const lontana = () => `${terzo}:${BS}lavori${BS}progetto`;

test('SECONDA-P01 — la casa in due pezzi e le forme di PowerShell, dall\'attrezzo dei file fuori dall\'Accesso pieno: un segreto', { skip: SALTA }, () => {
  for (const g of [`%HOMEDRIVE%%HOMEPATH%${BS}.ssh${BS}id_ed25519`, `${DOLLARO}env:HOMEDRIVE${DOLLARO}env:HOMEPATH${BS}.npmrc`, `${DOLLARO}{env:USERPROFILE}${BS}.ssh${BS}id_ed25519`, `${DOLLARO}env:HOME${BS}.npmrc`]) {
    assert.equal(motivoDaChiedere({ tipo: 'leggi', percorso: g, cartella: f.progetto, home: f.casa, accessoPieno: false })?.classe, 'segreto', g);
  }
  /* un esempio con una chiave dentro, nella casa nominata così: si riconosce dal contenuto */
  for (const g of ['%HOMEDRIVE%%HOMEPATH%', `${DOLLARO}env:HOMEDRIVE${DOLLARO}env:HOMEPATH`, `${DOLLARO}{env:USERPROFILE}`, `${DOLLARO}env:HOME`]) {
    const comando = `more < ${g}${BS}progetti${BS}chiavi.example.json`;
    assert.equal(motivoDaChiedere({ tipo: 'shell', comando, cartella: f.progetto, home: f.casa, accessoPieno: false })?.contenuto, true, comando);
  }
  /* e dalla shell, con altri comandi che leggono (la prima prova usa `type`) */
  for (const comando of [`more < %HOMEDRIVE%%HOMEPATH%${BS}.npmrc`, `findstr x "%HOMEDRIVE%%HOMEPATH%${BS}.ssh${BS}id_ed25519"`, `Get-Content ${DOLLARO}{env:USERPROFILE}${BS}.npmrc`, `cat ${DOLLARO}env:HOME/.ssh/id_ed25519`, `more < ${DOLLARO}env:HOMEDRIVE${DOLLARO}env:HOMEPATH${BS}.npmrc`]) {
    assert.equal(motivoDaChiedere({ tipo: 'shell', comando, cartella: f.progetto, home: f.casa, accessoPieno: false })?.classe, 'segreto', comando);
  }
  assert.notEqual(motivoDaChiedere({ tipo: 'leggi', percorso: `%HOMEDRIVE%%HOMEPATH%${BS}progetti${BS}nota.txt`, cartella: f.progetto, home: f.casa, accessoPieno: false })?.classe, 'segreto', 'al contrario: un file qualunque della casa');
});

test('SECONDA-P02 — il secondo nome di un `.env` coi prefissi lunghi, dall\'attrezzo dei file: un segreto; un file qualunque no', { skip: SALTA }, () => {
  const nome = join(f.progetto, 'appunti.md');
  for (const g of [`${BS}${BS}?${BS}${nome}`, `${BS}${BS}.${BS}${nome}`, `${BS}${BS}localhost${BS}${L.toLowerCase()}$${sd(nome)}`]) {
    assert.equal(motivoDaChiedere({ tipo: 'leggi', percorso: g, cartella: f.progetto, home: f.casa, accessoPieno: false })?.classe, 'segreto', g);
  }
  assert.notEqual(motivoDaChiedere({ tipo: 'leggi', percorso: `${BS}${BS}localhost${BS}${L.toLowerCase()}$${sd(join(f.progetto, 'nota.txt'))}`, cartella: f.progetto, home: f.casa, accessoPieno: false })?.classe, 'segreto', 'al contrario: un file qualunque (la forma lunga non si vede mai dentro il progetto: la carta di fuori, non quella del segreto)');
});

test('SECONDA-P03 — questo computer per indirizzo (`127.x`, `\\\\?\\UNC\\`): scrivere una credenziale di casa è vietato', { skip: SALTA }, () => {
  const chiavi = join(f.casa, '.ssh', 'authorized_keys');
  for (const g of [`${BS}${BS}127.0.0.2${BS}${L}$${sd(chiavi)}`, `${BS}${BS}?${BS}UNC${BS}127.0.0.1${BS}${L}$${sd(chiavi)}`, `${BS}${BS}?${BS}UNC${BS}localhost${BS}${L.toLowerCase()}$${sd(chiavi)}`]) {
    assert.equal(scritturaDiUnaCredenziale(g, { cartella: f.progetto, home: f.casa })?.percorso?.toLowerCase(), chiavi.toLowerCase(), g);
  }
  assert.equal(scritturaDiUnaCredenziale(`${BS}${BS}127.0.0.2${BS}${L}$${sd(join(f.altro, 'nuovo.txt'))}`, { cartella: f.progetto, home: f.casa }), null, 'al contrario: un file qualunque (nessun computer di rete vero: niente traffico)');
});

test('SECONDA-P04 — la carta nomina la credenziale anche dopo `chdir`, `sl`, `Set-Location`, `pushd`: la parola che sposta non è un file', { skip: SALTA }, () => {
  const ssh = join(f.casa, '.ssh');
  for (const comando of [`chdir ${ssh} && more known_hosts`, `sl ${ssh}; cat known_hosts`, `Set-Location ${ssh}; type known_hosts`, `pushd ${ssh} & more known_hosts & popd`]) {
    const carta = letta(comando);
    assert.equal(carta?.credenzialeDellaCasa, true, comando);
    assert.ok(!/(?:^|[\\/])(?:chdir|sl|set-location|pushd|popd)$/iu.test(String(carta.percorso)), `non nomina la parola: ${comando} → ${carta.percorso}`);
  }
  assert.equal(letta(`chdir ${f.altro} && more nota.txt`), null, 'al contrario: una cartella normale');
});

test('SECONDA-P05 — sessione su un altro disco: una cartella bloccata si guarda sul disco che il comando nomina con `$HOME`, `${HOME}`, `%HOMEPATH%`, `$env:USERPROFILE`', { skip: SALTA }, () => {
  const privato = `${sd(f.bloccata)}${BS}altro.txt`;
  const nomina = (comando) => comandoNominaUnaBloccata(comando, { cartella: lontana(), bloccati: [f.bloccata] });
  for (const comando of [`cat ${DOLLARO}HOME/progetti/nota.txt; type ${privato}`, `cat ${DOLLARO}{HOME}/progetti/nota.txt; type ${privato}`, `dir %HOMEPATH% & type ${privato}`, `Get-Content ${DOLLARO}env:USERPROFILE${BS}progetti${BS}nota.txt; type ${privato}`]) {
    assert.deepEqual(nomina(comando), { radice: f.bloccata }, comando);
  }
  assert.equal(nomina(`type ${privato}`), null, 'al contrario: nessun disco nominato');
});

test('SECONDA-P06 — il secondo nome di un `.env` sul disco che il comando nomina in un altro pezzo: un segreto', { skip: SALTA }, () => {
  const nome = `${sd(f.progetto)}${BS}appunti.md`;
  const motivo = (comando) => motivoDaChiedere({ tipo: 'shell', comando, cartella: lontana(), home: f.casa, accessoPieno: false });
  assert.equal(motivo(`copy ${nome} ${L.toLowerCase()}:${BS}copie`)?.classe, 'segreto');
  assert.equal(motivo(`pushd ${L}:${BS} && type ${nome}`)?.classe, 'segreto');
  assert.equal(motivo(`copy ${sd(f.progetto)}${BS}nota.txt ${L.toLowerCase()}:${BS}copie`)?.classe, undefined, 'al contrario: un file qualunque');
});

test('SECONDA-P07 — un esempio non nascosto con una chiave, su un disco nominato in un altro pezzo del comando: un segreto', { skip: !WINDOWS }, () => {
  const w = (s) => s.replaceAll('/', BS);
  const CHIAVE = 'AWS_ACCESS_KEY_ID=AKIA' + 'R4TY8UI2OP6LK3JH'; // finta, solo la forma
  const leggiTesta = (p) => (String(p).toLowerCase() === w('d:/cfg/chiavi.example.json') ? CHIAVE : 'niente');
  const motivo = (comando, lt = leggiTesta) => motivoDaChiedere({ tipo: 'shell', comando, cartella: w('C:/lavori/progetto'), home: w('C:/Users/persona'), leggiTesta: lt });
  assert.equal(motivo(`dir D:${BS} & type ${w('/cfg/chiavi.example.json')}`)?.classe, 'segreto');
  assert.equal(motivo(`pushd D:${BS} && type ${w('/cfg/chiavi.example.json')}`)?.classe, 'segreto');
  assert.equal(motivo(`dir D:${BS} & type ${w('/cfg/chiavi.example.json')}`, () => 'niente'), null, 'al contrario: la chiave non c è');
});

test('SECONDA-P08 — la casa in due pezzi come bersaglio di `pushd`, e una catena di `cd` che avanza passo per passo: la credenziale chiede', { skip: SALTA }, () => {
  assert.equal(letta(`pushd %HOMEDRIVE%%HOMEPATH% & type .npmrc`, lontana())?.credenzialeDellaCasa, true);
  assert.equal(letta(`cd /d %HOMEDRIVE%%HOMEPATH%${BS}.ssh && type config`, lontana())?.credenzialeDellaCasa, true);
  assert.equal(letta(`cd /d ${radice} && cd casa && cd .ssh && type config`)?.credenzialeDellaCasa, true, 'tre cd di fila');
  assert.equal(letta(`pushd %HOMEDRIVE%${sd(f.casa)} & type .npmrc`)?.credenzialeDellaCasa, true, '`%HOMEDRIVE%` da solo è il disco della casa');
  assert.equal(letta(`cd .. & cd .. & cd casa & type .npmrc`)?.credenzialeDellaCasa, true, 'relativi, dalla sessione');
  assert.equal(letta(`cd .. & cd .. & cd altro & type nota.txt`), null, 'al contrario: un file qualunque');
  assert.equal(letta(`pushd %HOMEDRIVE%%HOMEPATH%${BS}progetti & type nota.txt`, lontana()), null, 'al contrario: un file qualunque della casa');
});

test('SECONDA-P09 — il tetto si conta per spostamento: dodici `cd /x/…` di Git Bash separati da `;` si seguono, diciassette chiedono', { skip: SALTA }, () => {
  const d = fantasma.toLowerCase();
  const catena = (n) => `${Array.from({ length: n }, (_, i) => `cd /${d}/lavori/q${i}`).join('; ')}; cat nota.txt`;
  const sessione = `${fantasma}:${BS}lavori${BS}progetto`;
  assert.equal(credenzialeDellaCasaLetta({ tipo: 'shell', comando: catena(12), cartella: sessione, home: `${fantasma}:${BS}Users${BS}tizio` }), null);
  assert.equal(credenzialeDellaCasaLetta({ tipo: 'shell', comando: catena(17), cartella: sessione, home: `${fantasma}:${BS}Users${BS}tizio` })?.credenzialeDellaCasa, true);
});

test('SECONDA-P10 — dopo `pushd /m/x` (Git Bash) una cartella di M: nominata senza disco è quella bloccata', { skip: SALTA }, () => {
  const M = liberi[2] ?? terzo;
  const m = M.toLowerCase();
  const bloccati = [`${M}:${BS}bloccata`];
  const nomina = (comando) => comandoNominaUnaBloccata(comando, { cartella: lontana(), bloccati });
  assert.ok(nomina(`pushd /${m}/x && type ${BS}bloccata${BS}altro.txt`), 'pushd /m/x');
  assert.ok(nomina(`cd /${m}/x; cat /bloccata/altro.txt`), 'cd /m/x e poi /bloccata');
  assert.equal(nomina(`pushd /${m}/x && type ${BS}libera${BS}nota.txt`), null, 'al contrario: un altro posto');
});

test('SECONDA-P11 — senza la cartella della sessione un relativo non si inventa sul processo, e una cartella bloccata lo dice', { skip: SALTA }, () => {
  processoSu(f.progetto);
  try {
    assert.equal(credenzialeDellaCasaLetta({ tipo: 'elenca', percorso: `..${BS}..${BS}casa${BS}.ssh`, cartella: '', home: f.casa }), null, 'elenca: niente si inventa');
    assert.equal(bloccataDa(`riservata${BS}altro.txt`, { cartella: '', bloccati: [f.riservata] })?.irrisolvibile, true, 'un relativo senza cartella: irrisolvibile');
    assert.equal(credenzialeDellaCasaLetta({ tipo: 'elenca', percorso: `..${BS}..${BS}casa${BS}.ssh`, cartella: f.progetto, home: f.casa })?.credenzialeDellaCasa, true, 'al contrario: con la cartella chiede');
  } finally { processoSu(`${fantasma}:${BS}`); }
});

test('SECONDA-P12 — il primo posto dietro un collegamento verso la rete non ferma lo sguardo: con `pushd` il secondo porta alla casa e chiede', { skip: !WINDOWS }, () => {
  const w = (s) => s.replaceAll('/', BS);
  const casa = w('C:/Users/persona');
  const fsFinto = (link) => ({ lstatSync: (p) => ({ isSymbolicLink: () => Object.hasOwn(link, String(p).toLowerCase()) }), readlinkSync: (p) => link[String(p).toLowerCase()] });
  const cred = (link) => credenzialeDellaCasaLetta({ tipo: 'shell', comando: `pushd ${w('D:/altro')} && more ${w('ponte/.npmrc')}`, cartella: w('C:/lavori/progetto'), home: casa, fsSync: fsFinto(link) });
  assert.equal(cred({ [w('c:/lavori/progetto/ponte')]: `${BS}${BS}server${BS}share`, [w('d:/altro/ponte')]: casa })?.credenzialeDellaCasa, true);
  assert.equal(cred({ [w('c:/lavori/progetto/ponte')]: `${BS}${BS}server${BS}share`, [w('d:/altro/ponte')]: w('C:/lavori/normale') }), null, 'al contrario');
});

test('SECONDA-P13 — una cartella bloccata sul disco nominato in un altro pezzo, quando il percorso vero di quel disco non si sa dire: rifiutata', { skip: !WINDOWS }, () => {
  const w = (s) => s.replaceAll('/', BS);
  const bloccati = [w('D:/bloccata-finta-seconda')];
  const eperm = (p) => { if (/^d:/iu.test(String(p))) throw Object.assign(new Error('EPERM'), { code: 'EPERM' }); return p; };
  assert.equal(comandoNominaUnaBloccata(`copy ${w('/bloccata-finta-seconda/x.txt')} D:${BS}y`, { cartella: w('C:/lavori/progetto'), bloccati, realpathFn: eperm })?.radice, bloccati[0]);
  assert.equal(comandoNominaUnaBloccata(`copy ${w('/libera/x.txt')} D:${BS}y`, { cartella: w('C:/lavori/progetto'), bloccati, realpathFn: eperm }), null, 'al contrario');
});

test('SECONDA-P14 — il posto di sempre che non si sa dire si rifiuta come nella 0.2.1, e così i prefissi di dispositivo scritti con le barre dritte', { skip: SALTA }, () => {
  const nonSiSa = () => { throw new Error('percorso vero che non si sa dire'); };
  assert.deepEqual(bloccataDa(`src${BS}x.js`, { cartella: f.progetto, bloccati: [f.bloccata], realpathFn: nonSiSa }), { radice: f.bloccata, irrisolvibile: true });
  for (const g of [`//?/${dritte(join(f.altro, 'nota.txt'))}`, `//./${dritte(join(f.altro, 'nota.txt'))}`]) {
    assert.equal(bloccataDa(g, { cartella: f.progetto, bloccati: [f.bloccata] })?.irrisolvibile, true, `come nella 0.2.1: ${g}`);
  }
  assert.deepEqual(bloccataDa(`//?/${dritte(join(f.bloccata, 'privato.txt'))}`, { cartella: f.progetto, bloccati: [f.bloccata] }), { radice: f.bloccata }, 'la bloccata stessa: rifiutata');
});

test('SECONDA-P15 — la giunzione sul disco del processo verso `.ssh`, nominata senza disco dall\'attrezzo dei file: chiede, e la scrittura è vietata col percorso vero', { skip: SALTA }, () => {
  processoSu(`${L}:${BS}programmi${BS}app`);
  const sessione = `${fantasma}:${BS}lavori${BS}progetto`;
  try {
    assert.match(credenzialeDellaCasaLetta({ tipo: 'leggi', percorso: `${sd(f.ponteSsh)}${BS}known_hosts`, cartella: sessione, home: f.casa })?.percorso ?? '', / → /u, 'leggi (`.ssh\config` resta fuori dalla lettura dell Accesso pieno, come nella 0.2.1)');
    assert.equal(motivoDaChiedere({ tipo: 'leggi', percorso: `${sd(f.ponteSsh)}${BS}known_hosts`, cartella: sessione, home: f.casa, accessoPieno: false })?.classe, 'segreto', 'un nome qualunque dietro la giunzione');
    assert.deepEqual(scritturaDiUnaCredenziale(`${sd(f.ponteSsh)}${BS}id_rsa`, { cartella: sessione, home: f.casa }), { percorso: join(f.casa, '.ssh', 'id_rsa') });
    assert.equal(scritturaDiUnaCredenziale(`${sd(f.altro)}${BS}config`, { cartella: sessione, home: f.casa }), null, 'al contrario: un file qualunque');
  } finally { processoSu(`${fantasma}:${BS}`); }
});

/* il gemello di Linux, come FUORI-*: lo stesso sorgente con `node:path/posix` e la piattaforma scritta */
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const gemello = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-seconde-gemello-')));
mkdirSync(join(gemello, 'src'), { recursive: true });
for (const nome of ['path-policy.mjs', 'forme-di-segreto.mjs']) {
  const testo = readFileSync(join(SRC, nome), 'utf8');
  writeFileSync(join(gemello, 'src', nome), testo.replaceAll("from 'node:path'", () => "from 'node:path/posix'").replaceAll('process.platform', () => "'linux'"));
}
const linux = await import(pathToFileURL(join(gemello, 'src', 'path-policy.mjs')).href);
test.after(async () => { await rimuoviCartellaDiProvaAttesa(gemello); });

test('SECONDA-P16 — fuori da Windows gli spostamenti non si contano: trenta `cd` con `;` e `pushd` non diventano «troppo complesso»', () => {
  const enoent = () => { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; };
  const cred = (comando) => linux.credenzialeDellaCasaLetta({ tipo: 'shell', comando, cartella: '/home/u/proj', home: '/home/u', fsSync: { lstatSync: enoent, readlinkSync: enoent }, statFn: enoent, elencaFn: () => [] });
  assert.equal(cred(`${Array.from({ length: 30 }, (_, i) => `pushd /srv/d${i}`).join('; ')}; cat nota.txt`), null);
  assert.equal(cred('cat /home/u/.npmrc')?.credenzialeDellaCasa, true, 'al contrario: la credenziale si vede');
});

/* Giro piccolo dopo il controllore (13/11/2026): le seconde prove dei tre mutanti di path-policy che nella sua corsa cadevano per UNA
   prova sola: B-D37 (:2260, PERM-D37), K30 (:2119, CDL-2), K36 (:2253, CDL-1); e nella corsa del giro piccolo anche C-N17b
   (GRAFIE-CD1) e C-N17c (PERM-N17c) a :2063. Ingressi diversi dalla prima prova. */
test('SECONDA-P17 — progetto dentro una cartella di credenziali: `Set-Location`, `chdir`, `sl` dentro il progetto e una lettura qualunque non chiedono (B-D37)', { skip: SALTA }, () => {
  const estensione = join(f.casa, '.config', 'gh', 'estensione');
  for (const comando of ['Set-Location sub; Get-Content README.md', 'chdir sub & type package.json', 'sl sub; gc config.yml']) assert.equal(letta(comando, estensione), null, comando);
  assert.equal(letta('Set-Location ..; Get-Content hosts.yml', estensione)?.credenzialeDellaCasa, true, 'al contrario: un livello sopra è la cartella di gh');
});

test('SECONDA-P18 — col progetto su un altro disco, dodici `cd /x/…` di Git Bash con una lettura dopo ognuno si seguono, anche dentro `powershell -c` (K30)', { skip: SALTA }, () => {
  const d = fantasma.toLowerCase();
  const catena = (n) => Array.from({ length: n }, (_, i) => `cd /${d}/lavori/r${i} && type README.md`).join(' && ');
  assert.equal(letta(catena(12), lontana()), null);
  assert.equal(letta(`powershell -c "${catena(12)}"`, lontana()), null);
  assert.equal(letta(catena(17), lontana())?.credenzialeDellaCasa, true, 'al contrario: diciassette spostamenti chiedono');
});

test('SECONDA-P19 — le opzioni dello spostamento (`-LiteralPath`, `-Path`, `-PSPath`, `--`) non sono file: la carta nomina la cartella delle credenziali (K36)', { skip: SALTA }, () => {
  const ssh = join(f.casa, '.ssh');
  for (const comando of [`Set-Location -LiteralPath ${ssh}; Get-Content config`, `Push-Location -Path ${ssh}; Get-Content config`, `sl -PSPath ${ssh}; gc known_hosts`, `cd -- ${ssh} && cat config`]) {
    const carta = letta(comando);
    assert.equal(carta?.credenzialeDellaCasa, true, comando);
    assert.equal(carta.percorso, ssh, `la carta nomina .ssh: ${comando}`);
  }
});

test('SECONDA-P20 — `Set-Location`, `chdir` e `sl` verso la casa spostano anche quando il comando non nomina la credenziale: `.npmrc` relativo chiede (C-N17b, C-N17c)', { skip: SALTA }, () => {
  for (const comando of [`Set-Location ${f.casa}; Get-Content .npmrc`, `powershell -c "Set-Location ${f.casa}; gc .npmrc"`, `chdir ${f.casa} & type .npmrc`, `sl ${f.casa}; type .npmrc`]) {
    assert.equal(letta(comando)?.credenzialeDellaCasa, true, comando);
  }
  assert.equal(letta(`Set-Location ${f.altro}; Get-Content .npmrc`), null, 'al contrario: verso una cartella normale niente');
});
