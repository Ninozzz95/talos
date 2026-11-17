/*
 * Uscita di riparazione, giro 2 (12/11/2026, dopo i tre revisori; giudice v1686) — NESSUNA CARTA E NESSUN RIFIUTO DELLA 0.2.1 SI PERDE.
 * La prima cura risolveva `\cartella\file` sul disco della SESSIONE e, solo a parole, su quello della cosa protetta. La 0.2.1 lo
 * risolveva sul disco del PROCESSO, e lì seguiva giunzioni e collegamenti fisici e apriva gli esempi. Con l'app e la casa su un
 * disco e il progetto su un altro, un comando che cambia disco da sé (`C: && type \ponte\id_ed25519`) prendeva la carta o il rifiuto:
 * dopo la prima cura no (revisore B: R1-R5; revisore C: «una carta tolta», 73 casi del suo differenziale).
 * Qui il processo sta sul disco delle cose protette (quello della cartella temporanea) e la sessione su una lettera che non esiste:
 * un disco solo basta, perché su quello del processo c'è qualcosa da seguire. `process.cwd` risponde la radice di quel disco, che è
 * tutto ciò che `path.resolve` guarda: la prova non dipende da dove viene lanciata.
 *  - PROCESSO-R1…R5, R0: le prove del revisore B (`prova-rossa-revisore-b.test.mjs`), verdi sulla base 5e9fdc1b9, rosse su 985ff74ba.
 *  - PROCESSO-M1, M2: «mai meno della 0.2.1» anche senza cambio di disco e dagli attrezzi dei file (revisore C, `carta-in-meno.mjs`).
 *  - PROCESSO-P1…P5: i difetti del disco GIÀ sulla base (rossi sulla base e su 985ff74ba): `X:rel`, `X:` da solo, `cd` senza `/d`.
 *  - PROCESSO-B23…B25: le prove che mancavano ai mutanti vivi del revisore B.
 * Niente viene eseguito: solo le funzioni del cancello. Tutto finto; le giunzioni si staccano alla fine (`rmdir`).
 * Fonti (lette il 12/11/2026): learn.microsoft.com/en-us/dotnet/standard/io/file-path-formats («If the path starts with a single
 * component separator, the drive from the current directory is applied»; «If the path starts with a drive letter, volume separator,
 * and no component separator, the last current directory set from the command shell for the specified drive is applied. If the last
 * current directory wasn't set, the drive alone is applied»); learn.microsoft.com/en-us/windows-server/administration/windows-commands/cd
 * («/d Changes the current drive as well as the current directory for a drive»); nodejs.org/api/path.html, `path.resolve`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, linkSync, mkdirSync, mkdtempSync, realpathSync, rmdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs';
import { bloccataDa, comandoNominaUnaBloccata, credenzialeDellaCasaLetta, motivoDaChiedere, scritturaDiUnaCredenziale } from '../src/path-policy.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const WINDOWS = process.platform === 'win32';
const SEGNO = 'CHIAVE-FINTA-DEL-PROCESSO';
const SK = ['sk', 'proj', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4'].join('-'); // la FORMA di una chiave, a pezzi: non è una chiave
const LIVELLI = ['accesso-pieno', 'scrittura-progetto', 'su-richiesta'];
const BS = String.fromCharCode(92);

const radice = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-processo-')));
const L = radice.slice(0, 1).toUpperCase(); // il disco del processo E delle cose protette
const fantasma = WINDOWS ? [...'QZYXWVUSPONMK'].find((l) => l !== L && !existsSync(`${l}:${BS}`)) : null; // il disco della sessione: solo parole
const SALTA = !WINDOWS || !fantasma;
const sessione = `${fantasma}:${BS}lavori${BS}progetto`;
const sd = (p) => p.slice(2); // `\cartella\…`: senza la lettera del disco
const dritte = (p) => p.slice(2).replaceAll(BS, '/'); // `/cartella/…`

const f = {
  casa: join(radice, 'casa'), sottoCasa: join(radice, 'casa', 'progetti', 'app'), bloccata: join(radice, 'bloccata'),
  ponteSsh: join(radice, 'ponte-ssh'), ponteBloc: join(radice, 'ponte-bloc'), dati: join(radice, 'dati'), esempi: join(radice, 'esempi'), altro: join(radice, 'altro'),
  estensione: join(radice, 'casa', '.config', 'gh', 'estensione'),
};
for (const d of [join(f.casa, '.ssh'), f.sottoCasa, f.bloccata, f.dati, f.esempi, f.altro, f.estensione]) mkdirSync(d, { recursive: true });
writeFileSync(join(f.casa, '.ssh', 'id_ed25519'), `${SEGNO} ssh\n`);
writeFileSync(join(f.casa, '.npmrc'), `${SEGNO} npmrc\n`);
writeFileSync(join(f.casa, '.config', 'gh', 'hosts.yml'), `${SEGNO} gh\n`);
writeFileSync(join(f.estensione, 'README.md'), 'un file del progetto\n');
writeFileSync(join(f.bloccata, 'privato.txt'), `${SEGNO} bloccata\n`);
writeFileSync(join(f.dati, '.env'), `TOKEN=${SEGNO}\n`);
writeFileSync(join(f.esempi, 'config.example.json'), `{"apiKey":"${SK}"}\n`);
writeFileSync(join(f.altro, 'nota.txt'), 'una nota qualunque\n');
if (WINDOWS) {
  symlinkSync(join(f.casa, '.ssh'), f.ponteSsh, 'junction');
  symlinkSync(f.bloccata, f.ponteBloc, 'junction');
  linkSync(join(f.casa, '.npmrc'), join(f.dati, 'appunti.txt')); // un secondo nome di una credenziale di casa
  linkSync(join(f.dati, '.env'), join(f.dati, 'note.md')); // un secondo nome di un segreto del progetto
}
const prima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
process.env.USERPROFILE = f.casa; process.env.HOME = f.casa;
const cwdVera = process.cwd;
/* il processo sul disco delle cose protette, da qualunque cartella parta la prova; in una cartella che NON è la radice, come un'app installata */
if (WINDOWS) process.cwd = () => `${L}:${BS}programmi${BS}app`;
test.after(async () => {
  process.cwd = cwdVera;
  for (const g of [f.ponteSsh, f.ponteBloc]) { try { rmdirSync(g); } catch { /* già staccata */ } }
  if (prima.USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prima.USERPROFILE;
  if (prima.HOME === undefined) delete process.env.HOME; else process.env.HOME = prima.HOME;
  await rimuoviCartellaDiProvaAttesa(radice);
});

/** I quattro modi in cui un comando cambia disco da sé prima di nominare il percorso senza disco. */
const CAMBI = [
  ['«X:»', (p) => `${L}: && type ${p}`],
  ['«cd /d X:\\»', (p) => `cd /d ${L}:${BS} && type ${p}`],
  ['«pushd X:\\»', (p) => `pushd ${L}:${BS} && type ${p}`],
  ['PowerShell «Set-Location X:\\»', (p) => `powershell -NoProfile -Command "Set-Location ${L}:${BS}; Get-Content ${p}"`],
];
/** Il cancello, con «shell: sempre»: una carta c'è solo se un vincolo la vuole. La carta risponde «no»: niente parte. */
const carte = async (azione, livelloAccesso, cartella = sessione, extra = {}) => {
  const chieste = [];
  const esito = await verificaPermessoScrittura({ toolCallId: 'k', ...azione }, { livelloAccesso, cartella, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' }, chiediApprovazioneFn: async (a) => { chieste.push(a); return false; }, ...extra });
  return { chieste, esito };
};

test('PROCESSO-R1 — una GIUNZIONE sul disco dell\'app verso una credenziale di casa, nominata senza disco dopo un cambio di disco: la carta dell\'Accesso pieno resta', { skip: SALTA }, async () => {
  for (const [nome, con] of CAMBI) {
    for (const percorso of [`${sd(f.ponteSsh)}${BS}id_ed25519`]) {
      const comando = con(percorso);
      const letta = credenzialeDellaCasaLetta({ tipo: 'shell', comando, cartella: sessione, home: f.casa });
      assert.equal(letta?.credenzialeDellaCasa, true, `${nome}: la funzione riconosce la credenziale dietro la giunzione (${percorso})`);
      assert.match(letta.percorso, / → /u, `${nome}: e dice dove porta`);
      const { chieste, esito } = await carte({ tipo: 'shell', comando }, 'accesso-pieno');
      assert.equal(chieste.length, 1, `${nome}: una carta in Accesso pieno`);
      assert.equal(chieste[0].segreto?.credenzialeDellaCasa, true, `${nome}: col segno della credenziale di casa`);
      assert.equal(esito.consentito, false, `${nome}: col no della persona non parte`);
    }
  }
});

test('PROCESSO-R2 — un COLLEGAMENTO FISICO sul disco dell\'app verso una credenziale di casa, nominato senza disco dopo un cambio di disco: la carta resta in ogni modo', { skip: SALTA }, async () => {
  for (const [nome, con] of CAMBI) {
    const comando = con(`${sd(f.dati)}${BS}appunti.txt`);
    const letta = credenzialeDellaCasaLetta({ tipo: 'shell', comando, cartella: sessione, home: f.casa });
    assert.equal(letta?.credenzialeDellaCasa, true, `${nome}: la funzione riconosce lo stesso file della credenziale`);
    assert.match(letta.percorso, / = /u, `${nome}: e dice di quale file è il secondo nome`);
    for (const livello of LIVELLI) {
      const { chieste, esito } = await carte({ tipo: 'shell', comando }, livello);
      assert.equal(chieste.length, 1, `${nome}, ${livello}: una carta (anche con «shell: sempre»)`);
      assert.equal(esito.consentito, false, `${nome}, ${livello}: col no non parte`);
    }
  }
});

test('PROCESSO-R3 — una GIUNZIONE sul disco dell\'app che porta in una cartella bloccata, nominata senza disco dopo un cambio di disco: resta rifiutata', { skip: SALTA }, () => {
  for (const [nome, con] of CAMBI) {
    for (const percorso of [`${sd(f.ponteBloc)}${BS}privato.txt`]) {
      const esito = comandoNominaUnaBloccata(con(percorso), { cartella: sessione, bloccati: [f.bloccata] });
      assert.deepEqual(esito, { radice: f.bloccata }, `${nome}: il comando nomina la cartella bloccata dietro la giunzione (${percorso})`);
    }
  }
});

test('PROCESSO-R4 — un COLLEGAMENTO FISICO di un `.env` sul disco dell\'app, nominato senza disco dopo un cambio di disco: la carta del segreto resta', { skip: SALTA }, async () => {
  for (const [nome, con] of CAMBI) {
    const comando = con(`${sd(f.dati)}${BS}note.md`);
    assert.equal(motivoDaChiedere({ tipo: 'shell', comando, cartella: sessione, home: f.casa, accessoPieno: false })?.classe, 'segreto', `${nome}: è un segreto`);
    for (const livello of ['scrittura-progetto', 'su-richiesta']) {
      const { chieste } = await carte({ tipo: 'shell', comando }, livello);
      assert.equal(chieste.length, 1, `${nome}, ${livello}: una carta (anche con «shell: sempre»)`);
    }
  }
});

test('PROCESSO-R5 — un file d\'esempio con una chiave vera sul disco dell\'app, nominato senza disco dopo un cambio di disco: la carta del segreto resta', { skip: SALTA }, async () => {
  for (const [nome, con] of CAMBI) {
    const comando = con(`${sd(f.esempi)}${BS}config.example.json`);
    const segreto = motivoDaChiedere({ tipo: 'shell', comando, cartella: sessione, home: f.casa, accessoPieno: false });
    assert.equal(segreto?.classe, 'segreto', `${nome}: è un segreto`);
    assert.equal(segreto?.contenuto, true, `${nome}: per ciò che ha dentro`);
    for (const livello of ['scrittura-progetto', 'su-richiesta']) {
      const { chieste } = await carte({ tipo: 'shell', comando }, livello);
      assert.equal(chieste.length, 1, `${nome}, ${livello}: una carta (anche con «shell: sempre»)`);
    }
  }
});

test('PROCESSO-R6 — le stesse giunzioni con le barre DRITTE (`/cartella/…`) dopo un cambio di disco: la credenziale chiede e la cartella bloccata è rifiutata', { skip: SALTA }, async () => {
  /* sulla base questa grafia sotto una cartella di una lettera era letta come un disco (il primo difetto dell'uscita): rossa anche lì */
  for (const [nome, con] of CAMBI) {
    const letta = credenzialeDellaCasaLetta({ tipo: 'shell', comando: con(`${dritte(f.ponteSsh)}/id_ed25519`), cartella: sessione, home: f.casa });
    assert.equal(letta?.credenzialeDellaCasa, true, `${nome}: la credenziale dietro la giunzione`);
    assert.match(letta.percorso, / → /u, `${nome}: e dice dove porta`);
    assert.deepEqual(comandoNominaUnaBloccata(con(`${dritte(f.ponteBloc)}/privato.txt`), { cartella: sessione, bloccati: [f.bloccata] }), { radice: f.bloccata }, `${nome}: la cartella bloccata dietro la giunzione`);
    const { chieste } = await carte({ tipo: 'shell', comando: con(`${dritte(f.ponteSsh)}/id_ed25519`) }, 'accesso-pieno');
    assert.equal(chieste.length, 1, `${nome}: una carta in Accesso pieno`);
    assert.equal(chieste[0].segreto?.credenzialeDellaCasa, true);
  }
});

test('PROCESSO-R0 — AL CONTRARIO: un file qualunque sul disco dell\'app, nominato senza disco dopo un cambio di disco, non chiede e non è rifiutato', { skip: SALTA }, async () => {
  for (const [nome, con] of CAMBI) {
    const comando = con(`${sd(f.altro)}${BS}nota.txt`);
    const { chieste, esito } = await carte({ tipo: 'shell', comando }, 'accesso-pieno');
    assert.equal(chieste.length, 0, `${nome}: nessuna carta`);
    assert.equal(esito.consentito, true, `${nome}: parte`);
    assert.equal(comandoNominaUnaBloccata(comando, { cartella: sessione, bloccati: [f.bloccata] }), null, `${nome}: non nomina la cartella bloccata`);
    assert.equal(motivoDaChiedere({ tipo: 'shell', comando, cartella: sessione, home: f.casa, accessoPieno: false })?.contenuto, undefined, `${nome}: non è un esempio con una chiave`);
  }
});

test('PROCESSO-M1 — mai meno della 0.2.1: senza nessun cambio di disco il disco del processo si guarda ancora, col controllo intero (giunzione, collegamento fisico, esempio)', { skip: SALTA }, async () => {
  const dietroLaGiunzione = `type ${sd(f.ponteSsh)}${BS}id_ed25519`;
  const secondoNome = `type ${sd(f.dati)}${BS}appunti.txt`;
  assert.match(credenzialeDellaCasaLetta({ tipo: 'shell', comando: dietroLaGiunzione, cartella: sessione, home: f.casa })?.percorso ?? '', / → /u, 'la giunzione, dalla shell');
  assert.match(credenzialeDellaCasaLetta({ tipo: 'shell', comando: secondoNome, cartella: sessione, home: f.casa })?.percorso ?? '', / = /u, 'il collegamento fisico, dalla shell');
  assert.deepEqual(comandoNominaUnaBloccata(`type ${sd(f.ponteBloc)}${BS}privato.txt`, { cartella: sessione, bloccati: [f.bloccata] }), { radice: f.bloccata }, 'la cartella bloccata dietro la giunzione');
  assert.equal(motivoDaChiedere({ tipo: 'shell', comando: `type ${sd(f.dati)}${BS}note.md`, cartella: sessione, home: f.casa, accessoPieno: false })?.classe, 'segreto', 'il secondo nome di un .env');
  assert.equal(motivoDaChiedere({ tipo: 'shell', comando: `type ${sd(f.esempi)}${BS}config.example.json`, cartella: sessione, home: f.casa, accessoPieno: false })?.contenuto, true, 'l\'esempio con una chiave');
  const { chieste } = await carte({ tipo: 'shell', comando: secondoNome }, 'accesso-pieno');
  assert.equal(chieste.length, 1, 'dal cancello: la carta dell\'Accesso pieno');
  assert.equal(chieste[0].segreto?.credenzialeDellaCasa, true);
});

test('PROCESSO-M2 — mai meno della 0.2.1: anche dagli attrezzi dei file il disco del processo si guarda ancora (lettura, elenco, scrittura, modifica)', { skip: SALTA }, () => {
  const secondoNome = `${sd(f.dati)}${BS}appunti.txt`;
  for (const tipo of ['leggi', 'elenca']) {
    assert.match(credenzialeDellaCasaLetta({ tipo, percorso: secondoNome, cartella: sessione, home: f.casa })?.percorso ?? '', / = /u, `${tipo}: il collegamento fisico`);
    assert.match(credenzialeDellaCasaLetta({ tipo, percorso: `${sd(f.ponteSsh)}${BS}id_ed25519`, cartella: sessione, home: f.casa })?.percorso ?? '', / → /u, `${tipo}: la giunzione`);
  }
  for (const tipo of ['leggi', 'scrivi', 'file_edit']) {
    for (const accessoPieno of [true, false]) {
      assert.equal(motivoDaChiedere({ tipo, percorso: secondoNome, cartella: sessione, home: f.casa, accessoPieno })?.classe, 'segreto', `${tipo} (pieno ${accessoPieno}): il collegamento fisico è un segreto`);
    }
  }
  assert.equal(motivoDaChiedere({ tipo: 'leggi', percorso: `${sd(f.esempi)}${BS}config.example.json`, cartella: sessione, home: f.casa, accessoPieno: false })?.contenuto, true, 'leggi: l\'esempio con una chiave');
  assert.deepEqual(bloccataDa(`${sd(f.ponteBloc)}${BS}privato.txt`, { cartella: sessione, bloccati: [f.bloccata] }), { radice: f.bloccata }, 'la cartella bloccata dietro la giunzione');
  /* un nome qualunque dietro la giunzione: è un segreto solo per DOVE porta (la cartella `.ssh` della casa), e lo dice */
  const dietro = motivoDaChiedere({ tipo: 'leggi', percorso: `${sd(f.ponteSsh)}${BS}appunti.txt`, cartella: sessione, home: f.casa, accessoPieno: false });
  assert.equal(dietro?.classe, 'segreto', 'leggi: un nome qualunque dietro la giunzione verso `.ssh`');
  assert.match(dietro.percorso, / → /u, 'e dice dove porta');
  /* al contrario: un file qualunque dello stesso disco non chiede e non è rifiutato */
  const nota = `${sd(f.altro)}${BS}nota.txt`;
  assert.equal(credenzialeDellaCasaLetta({ tipo: 'leggi', percorso: nota, cartella: sessione, home: f.casa }), null);
  assert.equal(motivoDaChiedere({ tipo: 'scrivi', percorso: nota, cartella: sessione, home: f.casa, accessoPieno: true }), null);
  assert.equal(bloccataDa(nota, { cartella: sessione, bloccati: [f.bloccata] }), null);
});

/* ===== I difetti del disco GIÀ sulla base 5e9fdc1b9 (rossi sulla base e su 985ff74ba) ===== */

test('PROCESSO-P1 — «X:..\\..\\.ssh\\id_ed25519» col progetto SOTTO la casa: `X:rel` è relativo alla cartella corrente di quel disco, cioè al progetto', { skip: SALTA }, async () => {
  const senza = credenzialeDellaCasaLetta({ tipo: 'shell', comando: `type ..${BS}..${BS}.ssh${BS}id_ed25519`, cartella: f.sottoCasa, home: f.casa });
  assert.equal(senza?.credenzialeDellaCasa, true, 'la premessa: lo stesso percorso senza «X:» chiede');
  for (const comando of [`type ${L}:..${BS}..${BS}.ssh${BS}id_ed25519`, `powershell -NoProfile -Command "Get-Content ${L.toLowerCase()}:../../.ssh/id_ed25519"`]) {
    assert.equal(credenzialeDellaCasaLetta({ tipo: 'shell', comando, cartella: f.sottoCasa, home: f.casa })?.credenzialeDellaCasa, true, `con «X:» davanti è lo stesso file: ${comando}`);
    const { chieste, esito } = await carte({ tipo: 'shell', comando }, 'accesso-pieno', f.sottoCasa);
    assert.equal(chieste.length, 1, `una carta in Accesso pieno: ${comando}`);
    assert.equal(chieste[0].segreto?.credenzialeDellaCasa, true, 'col segno');
    assert.equal(esito.consentito, false);
  }
  /* al contrario: «X:rel» verso un file qualunque del progetto non chiede */
  const { chieste } = await carte({ tipo: 'shell', comando: `type ${L}:README.md` }, 'accesso-pieno', f.sottoCasa);
  assert.equal(chieste.length, 0, '«X:README.md» non chiede');
});

test('PROCESSO-P2 — una cartella bloccata scritta «X:rel» dalla radice, con la sessione su un altro disco: lì la cartella corrente è la radice, non quella del processo', { skip: SALTA }, () => {
  const relativoAllaRadice = `${L}:${sd(f.bloccata).slice(1)}${BS}privato.txt`;
  assert.deepEqual(comandoNominaUnaBloccata(`type ${relativoAllaRadice}`, { cartella: sessione, bloccati: [f.bloccata] }), { radice: f.bloccata });
  assert.equal(credenzialeDellaCasaLetta({ tipo: 'shell', comando: `type ${L}:${sd(f.casa).slice(1)}${BS}.ssh${BS}id_ed25519`, cartella: sessione, home: f.casa })?.credenzialeDellaCasa, true, 'e una credenziale di casa');
  /* al contrario */
  assert.equal(comandoNominaUnaBloccata(`type ${L}:${sd(f.altro).slice(1)}${BS}nota.txt`, { cartella: sessione, bloccati: [f.bloccata] }), null);
});

/* ===== Le prove che mancavano ai mutanti vivi del revisore B ===== */

test('PROCESSO-B23 — la scrittura di una credenziale di casa attraverso una giunzione del disco del processo, scritta senza disco: vietata, col percorso vero', { skip: SALTA }, () => {
  const attraverso = `${sd(f.ponteSsh)}${BS}authorized_keys`;
  assert.deepEqual(scritturaDiUnaCredenziale(attraverso, { cartella: sessione, home: f.casa }), { percorso: join(f.casa, '.ssh', 'authorized_keys') }, 'barre rovesce');
  assert.deepEqual(scritturaDiUnaCredenziale(`${dritte(f.ponteSsh)}/authorized_keys`, { cartella: sessione, home: f.casa }), { percorso: join(f.casa, '.ssh', 'authorized_keys') }, 'barre dritte');
  /* al contrario: lo stesso disco, un file qualunque; e la sessione sul disco delle cose, un relativo qualunque */
  assert.equal(scritturaDiUnaCredenziale(`${sd(f.altro)}${BS}nuovo.txt`, { cartella: sessione, home: f.casa }), null);
  assert.equal(scritturaDiUnaCredenziale('nuovo.txt', { cartella: f.altro, home: f.casa }), null);
});

test('PROCESSO-B24 — una cartella bloccata scritta senza disco con le barre DRITTE: rifiutata sul disco del processo e sul disco che il comando nomina', { skip: SALTA }, () => {
  const privato = `${dritte(f.bloccata)}/privato.txt`;
  assert.deepEqual(comandoNominaUnaBloccata(`type ${privato}`, { cartella: sessione, bloccati: [f.bloccata] }), { radice: f.bloccata }, 'sul disco del processo, come la 0.2.1');
  assert.deepEqual(comandoNominaUnaBloccata(`${L}: && type ${privato}`, { cartella: sessione, bloccati: [f.bloccata] }), { radice: f.bloccata }, 'dopo «X:»');
  assert.deepEqual(bloccataDa(privato, { cartella: sessione, bloccati: [f.bloccata] }), { radice: f.bloccata }, 'dall\'attrezzo, sul disco del processo');
  /* al contrario: un file qualunque con le barre dritte */
  assert.equal(comandoNominaUnaBloccata(`${L}: && type ${dritte(f.altro)}/nota.txt`, { cartella: sessione, bloccati: [f.bloccata] }), null);
});

test('PROCESSO-B25 — il progetto aperto DENTRO una cartella di credenziali resta esente anche scritto senza disco; ciò che sta fuori dal progetto chiede ancora', { skip: SALTA }, () => {
  /* la sessione è `<casa>\.config\gh\estensione`: i suoi file non sono credenziali della casa, in nessuna delle letture del disco */
  for (const comando of [`type ${sd(f.estensione)}${BS}README.md`, `type ${dritte(f.estensione)}/README.md`, `${L}: && type ${sd(f.estensione)}${BS}README.md`]) {
    assert.equal(credenzialeDellaCasaLetta({ tipo: 'shell', comando, cartella: f.estensione, home: f.casa }), null, `esente: ${comando}`);
  }
  assert.equal(credenzialeDellaCasaLetta({ tipo: 'leggi', percorso: `${sd(f.estensione)}${BS}README.md`, cartella: f.estensione, home: f.casa }), null, 'esente dall\'attrezzo');
  /* fuori dal progetto, nella stessa cartella di credenziali: chiede, in ogni grafia senza disco */
  for (const comando of [`type ${sd(f.casa)}${BS}.config${BS}gh${BS}hosts.yml`, `type ${dritte(f.casa)}/.config/gh/hosts.yml`, `${L}: && type ${sd(f.casa)}${BS}.config${BS}gh${BS}hosts.yml`]) {
    assert.equal(credenzialeDellaCasaLetta({ tipo: 'shell', comando, cartella: f.estensione, home: f.casa })?.credenzialeDellaCasa, true, `chiede: ${comando}`);
  }
});
