/*
 * Giro di cura unico della riparazione dei permessi (12/11/2026, dopo il secondo ripasso) — LE PROVE CHE MANCAVANO: i mutanti rimasti
 * vivi nei ripassi (B: D16, D37; C: N04, N27b, N17c, N25, N34, N40; A: A2-24), uno per uno con il caso che li distingue, e il
 * contrario accanto. Solo `path-policy.mjs` (niente cancellazioni critiche): questo file si porta così com'è sulla CLI. Le prove
 * delle cancellazioni critiche (K09 di C, G02 e N05 di B) stanno in `permessi-mutanti-vivi-cancellazioni.test.mjs`.
 * Casi presi dai revisori (sola lettura): B `C:/T/rev-riparazione-b-mut/lavoro2/vivi.mjs`, C `…/rev-riparazione-c-mut/lavoro/ripasso-2/vivi-2b.mjs`.
 * Niente viene eseguito né letto: lettere di dischi che non esistono, oppure un disco finto (`fsSync`, `leggiTesta`, `realpathFn`).
 * D27 (B, `cd` verso un glob non si segue) NON si cura: è un limite uguale alla base, scritto nel CHANGELOG; PERM-D27 lo fissa.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { comandoNominaUnaBloccata, credenzialeDellaCasaLetta, motivoDaChiedere } from '../src/path-policy.mjs';

const WINDOWS = process.platform === 'win32';
const BS = String.fromCharCode(92);
const w = (s) => s.replaceAll('/', BS);
/* i casi di B vogliono K:, L:, M:, N: che non esistono; il processo finto su N: */
const LIBERI = WINDOWS && ![...'KLMN'].some((l) => existsSync(`${l}:${BS}`));
const casaB = `K:${BS}Users${BS}tizio`;
const sessioneB = `L:${BS}lavori${BS}progetto`;
const cwdVera = process.cwd;
const casaPrima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
const conIlProcessoSuN = (fn) => {
  process.cwd = () => `N:${BS}programmi${BS}app`;
  process.env.USERPROFILE = casaB; process.env.HOME = casaB;
  try { return fn(); } finally {
    process.cwd = cwdVera;
    if (casaPrima.USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = casaPrima.USERPROFILE;
    if (casaPrima.HOME === undefined) delete process.env.HOME; else process.env.HOME = casaPrima.HOME;
  }
};
const credB = (comando, cartella = sessioneB) => conIlProcessoSuN(() => credenzialeDellaCasaLetta({ tipo: 'shell', comando, cartella, home: casaB }));

/* i casi di C: un disco finto, niente si apre */
const casa = w('C:/Users/persona');
const progetto = w('C:/lavori/progetto');
const CHIAVE = 'AWS_ACCESS_KEY_ID=AKIA' + 'Q7ZT3XW9PL2MN8RB'; // finta, solo la forma
const fsFinto = (link) => ({
  lstatSync: (p) => ({ isSymbolicLink: () => Object.hasOwn(link, String(p).toLowerCase()) }),
  readlinkSync: (p) => link[String(p).toLowerCase()],
});
const esempio = w('/cfg/chiavi.example.json');
const conLaChiave = (p) => (String(p).toLowerCase() === w('d:/cfg/chiavi.example.json') ? CHIAVE : 'niente');

test('PERM-D16 — il disco della cartella in cui ci si sposta anche quando il testo non lo scrive «X:» (`cd /m/x` di Git Bash): la bloccata di M: si rifiuta', { skip: !LIBERI }, () => {
  const bloccati = [`M:${BS}bloccata`];
  const nomina = (c) => conIlProcessoSuN(() => comandoNominaUnaBloccata(c, { cartella: sessioneB, bloccati }));
  assert.ok(nomina(`cd /m/x && cmd /c type ${BS}bloccata${BS}privato.txt`), 'cd /m/x e poi \\bloccata: è M:\\bloccata');
  assert.ok(nomina(`cd /mnt/m/x && cmd /c type ${BS}bloccata${BS}privato.txt`), 'la stessa con WSL');
  assert.equal(nomina(`cd /m/x && type ${BS}altro${BS}nota.txt`), null, 'al contrario: un altro posto di M:');
});

test('PERM-D37 — progetto DENTRO una cartella di credenziali (`.config\\gh\\estensione`): un `cd` dentro il progetto e una lettura qualunque non chiedono', { skip: !LIBERI }, () => {
  const estensione = `${casaB}${BS}.config${BS}gh${BS}estensione`;
  for (const c of ['cd sub && type README.md', 'pushd sub && type README.md', `cd /d ${estensione}${BS}sub && type README.md`]) assert.equal(credB(c, estensione), null, c);
  assert.equal(credB('cd .. && type hosts.yml', estensione)?.credenzialeDellaCasa, true, 'al contrario: un livello sopra è la cartella delle credenziali di gh');
});

test('PERM-D27 — limite uguale alla base, scritto: un `cd` verso un glob non si segue (la lettura dopo si giudica dal posto di prima)', { skip: !LIBERI }, () => {
  assert.equal(credB(`cd ${casaB}${BS}* && type ..${BS}.ssh${BS}id_ed25519`), null, 'glob: non seguito, come nella 0.2.1');
  assert.equal(credB(`cd ${casaB}${BS}Documents && type ..${BS}.ssh${BS}id_ed25519`)?.credenzialeDellaCasa, true, 'al contrario: senza glob si segue');
});

test('PERM-N04 — un esempio NON nascosto con una chiave dentro, su un disco NOMINATO dal comando, chiede; senza la chiave no', { skip: !WINDOWS }, () => {
  const motivo = (comando, leggiTesta) => motivoDaChiedere({ tipo: 'shell', comando, cartella: progetto, home: casa, leggiTesta });
  assert.equal(motivo(`D: && type ${esempio}`, conLaChiave)?.classe, 'segreto');
  assert.equal(motivo(`cd /d D:${BS} && type ${esempio}`, conLaChiave)?.classe, 'segreto', 'dopo cd /d sul disco nominato, relativo');
  assert.equal(motivo(`D: && type ${esempio}`, () => 'niente'), null, 'al contrario: la chiave non c è');
});

test('PERM-N17c — `chdir` e `sl` verso la casa, poi `.npmrc` relativo: si seguono come `cd`', { skip: !WINDOWS }, () => {
  const cred = (comando) => credenzialeDellaCasaLetta({ tipo: 'shell', comando, cartella: progetto, home: casa, fsSync: fsFinto({}) });
  assert.equal(cred(`chdir ${casa} & type .npmrc`)?.credenzialeDellaCasa, true);
  assert.equal(cred(`sl ${casa}; Get-Content .npmrc`)?.credenzialeDellaCasa, true);
  assert.equal(cred(`chdir ${w('C:/lavori/altro')} & type .npmrc`), null, 'al contrario: una cartella normale');
});

test('PERM-N25 — il primo posto dietro un collegamento verso la rete non ferma lo sguardo: il secondo (dopo `cd /d`) porta alla casa e chiede', { skip: !WINDOWS }, () => {
  const cred = (link) => credenzialeDellaCasaLetta({ tipo: 'shell', comando: `cd /d ${w('D:/altro')} && type ${w('ponte/.npmrc')}`, cartella: progetto, home: casa, fsSync: fsFinto(link) });
  assert.equal(cred({ [w('c:/lavori/progetto/ponte')]: `${BS}${BS}server${BS}share`, [w('d:/altro/ponte')]: casa })?.credenzialeDellaCasa, true);
  assert.equal(cred({ [w('c:/lavori/progetto/ponte')]: `${BS}${BS}server${BS}share`, [w('d:/altro/ponte')]: w('C:/lavori/normale') }), null, 'al contrario: verso una cartella normale');
  const attrezzo = credenzialeDellaCasaLetta({ tipo: 'leggi', percorso: w('/ponte/.npmrc'), cartella: w('D:/progetto'), home: casa, fsSync: fsFinto({ [w('d:/ponte')]: `${BS}${BS}server${BS}share`, [w('c:/ponte')]: casa }) });
  assert.equal(attrezzo?.credenzialeDellaCasa, true, 'attrezzo dei file: sessione dietro la rete, disco del processo verso la casa');
});

test('PERM-N34 — bloccata sul disco nominato quando il percorso vero di quel disco non si sa dire (EPERM): si rifiuta lo stesso', { skip: !WINDOWS }, () => {
  const bloccati = [w('D:/bloccata-finta-giro-unico')];
  const comando = `D: && type ${w('/bloccata-finta-giro-unico/x.txt')}`;
  const eperm = (p) => { if (/^d:/iu.test(String(p))) throw Object.assign(new Error('EPERM'), { code: 'EPERM' }); return p; };
  assert.equal(comandoNominaUnaBloccata(comando, { cartella: progetto, bloccati, realpathFn: eperm })?.radice, bloccati[0]);
  assert.equal(comandoNominaUnaBloccata(comando, { cartella: progetto, bloccati, realpathFn: (p) => p })?.radice, bloccati[0], 'e quando si sa dire');
  assert.equal(comandoNominaUnaBloccata(`D: && type ${w('/libera/x.txt')}`, { cartella: progetto, bloccati, realpathFn: eperm }), null, 'al contrario: un altro posto');
});

test('PERM-N40 (anche A2-24) — un `cd` verso una variabile che non si conosce non si segue: il `cd` dopo parte dal posto di prima', { skip: !WINDOWS }, () => {
  const cred = (comando) => credenzialeDellaCasaLetta({ tipo: 'shell', comando, cartella: w('C:/Users'), home: casa, fsSync: fsFinto({}) });
  assert.equal(cred('cd %NON_ESISTE_GIRO_UNICO% & cd persona & type .npmrc')?.credenzialeDellaCasa, true, 'cmd');
  assert.equal(cred('cd $nonEsisteGiroUnico; cd persona; type .npmrc')?.credenzialeDellaCasa, true, 'PowerShell');
  assert.equal(cred('cd //server/share & cd persona & type .npmrc')?.credenzialeDellaCasa, true, 'un indirizzo di rete scritto con le barre dritte');
  assert.equal(cred('cd persona & type .npmrc')?.credenzialeDellaCasa, true, 'senza la variabile');
  assert.equal(cred('cd %NON_ESISTE_GIRO_UNICO% & cd altro & type .npmrc'), null, 'al contrario: verso una cartella normale');
});
