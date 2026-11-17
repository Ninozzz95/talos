/*
 * Uscita di riparazione, giro 2 (12/11/2026, dopo i tre revisori; giudice v1686) — LE GRAFIE DI WINDOWS CHE IL CANCELLO NON LEGGEVA.
 * Ogni prova qui dice un posto protetto con una grafia che Windows apre davvero, e la sua prova al contrario.
 *  - GRAFIE-XR1, XR2: «X:rel», il disco senza barra (revisore A, appendice A; revisore B, P1): è relativo alla cartella corrente
 *    di quel disco. Per un attrezzo dei file è `resolve(cartella, percorso)`; per la shell si guardano le due letture.
 *  - GRAFIE-GB1, GB2: `/c/…` di Git Bash verso una cartella BLOCCATA (revisore A, appendice B).
 *  - GRAFIE-BR1, BR2: una cartella bloccata sulla radice di un ALTRO disco non rifiuta i comandi di tutti i giorni (revisore C,
 *    «un rifiuto in più»: 14 su 18), e resta rifiutata quando il comando nomina quel disco.
 *  - GRAFIE-DS1, DS2: le barre raddoppiate dopo il disco (`C:\\Users\\…`, `C://Users//…`) non sono un indirizzo di rete.
 *  - GRAFIE-PL1, PL2: `\\?\C:\…`, `\\.\C:\…`, `\\localhost\c$\…` anche per chi scrive, per le cartelle bloccate e per i secondi nomi.
 *  - GRAFIE-HP1, HP2: le altre grafie della casa (`%HOMEPATH%`, `$env:HOMEPATH`, `${env:USERPROFILE}`, `%HOMEDRIVE%%HOMEPATH%`).
 *  - GRAFIE-CD1, CD2: la lettura di una credenziale segue il `cd` dello STESSO comando.
 *  - GRAFIE-CC1, CC2: la carta della cancellazione critica nomina il posto che il SISTEMA userà (revisore C, limite 2; M14, P09).
 *  - GRAFIE-MU1, MU2: le prove che mancavano ai mutanti vivi del revisore C (C10, M15, M08, M19, M20).
 * Il processo sta su un disco che non esiste: niente passa per caso dal disco del processo. Niente viene cancellato: le prove di
 * cancellazione chiamano solo la funzione che giudica. Tutto finto; la giunzione si stacca alla fine (`rmdir`).
 * Fonti (lette il 12/11/2026): learn.microsoft.com/en-us/dotnet/standard/io/file-path-formats (i percorsi `\\?\`, `\\.\`, UNC, e
 * «If the path starts with a drive letter, volume separator, and no component separator, the last current directory set from the
 * command shell for the specified drive is applied»); learn.microsoft.com/en-us/windows-server/administration/windows-commands/cd.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, linkSync, mkdirSync, mkdtempSync, realpathSync, rmdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { talosLavora, verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs';
import { bloccataDa, comandoNominaUnaBloccata, credenzialeDellaCasaLetta, motivoDaChiedere, scritturaDiUnaCredenziale } from '../src/path-policy.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const WINDOWS = process.platform === 'win32';
const SEGNO = 'CHIAVE-FINTA-DELLE-GRAFIE';
const SK = ['sk', 'proj', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4'].join('-'); // la FORMA di una chiave, a pezzi: non è una chiave
const LIVELLI = ['accesso-pieno', 'scrittura-progetto', 'su-richiesta'];
const BS = String.fromCharCode(92);
const DOLLARO = String.fromCharCode(36);

const radice = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-grafie-w-')));
const L = radice.slice(0, 1).toUpperCase();
const liberi = WINDOWS ? [...'QZYXWVUSPONMK'].filter((l) => l !== L && !existsSync(`${l}:${BS}`)) : [];
const [fantasma, terzo] = liberi; // il disco del processo e un terzo disco: solo parole
const SALTA = !WINDOWS || !fantasma || !terzo;
const dritte = (p) => p.replaceAll(BS, '/');
const gitBash = (p) => `/${p.slice(0, 1).toLowerCase()}${dritte(p.slice(2))}`; // C:\T\x → /c/T/x

const f = {
  casa: join(radice, 'casa'), progetto: join(radice, 'lavori', 'progetto'), riservata: join(radice, 'lavori', 'progetto', 'riservata'),
  bloccata: join(radice, 'bloccata'), altro: join(radice, 'altro'), ponte: join(radice, 'ponte'),
};
for (const d of [join(f.casa, '.ssh'), join(f.casa, '.config', 'gh'), join(f.casa, 'progetti'), join(f.progetto, 'src'), f.riservata, f.bloccata, f.altro]) mkdirSync(d, { recursive: true });
writeFileSync(join(f.casa, '.ssh', 'id_ed25519'), `${SEGNO} ssh\n`);
writeFileSync(join(f.casa, '.config', 'gh', 'hosts.yml'), `${SEGNO} gh\n`);
writeFileSync(join(f.casa, '.npmrc'), `${SEGNO} npmrc\n`);
writeFileSync(join(f.casa, 'progetti', 'nota.txt'), 'una nota della casa\n');
writeFileSync(join(f.casa, 'progetti', 'config.example.json'), `{"apiKey":"${SK}"}\n`); // un esempio con una chiave: si riconosce solo aprendolo
writeFileSync(join(f.progetto, '.env'), `TOKEN=${SEGNO}\n`);
writeFileSync(join(f.progetto, 'nota.txt'), 'una nota qualunque\n');
writeFileSync(join(f.progetto, 'README.md'), '# finto\n');
writeFileSync(join(f.riservata, 'privato.txt'), `${SEGNO} riservata\n`);
writeFileSync(join(f.bloccata, 'privato.txt'), `${SEGNO} bloccata\n`);
writeFileSync(join(f.altro, 'nota.txt'), 'una nota qualunque\n');
if (WINDOWS) {
  symlinkSync(f.bloccata, f.ponte, 'junction');
  linkSync(join(f.progetto, '.env'), join(f.progetto, 'note.md')); // un secondo nome del segreto del progetto
}
const prima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
process.env.USERPROFILE = f.casa; process.env.HOME = f.casa;
const cwdVera = process.cwd;
if (!SALTA) process.cwd = () => `${fantasma}:${BS}`;
test.after(async () => {
  process.cwd = cwdVera;
  try { rmdirSync(f.ponte); } catch { /* già staccata */ }
  if (prima.USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prima.USERPROFILE;
  if (prima.HOME === undefined) delete process.env.HOME; else process.env.HOME = prima.HOME;
  await rimuoviCartellaDiProvaAttesa(radice);
});

/** Il cancello, con «shell: sempre»: una carta c'è solo se un vincolo la vuole. La carta risponde «no»: niente parte. */
const carte = async (azione, livelloAccesso, cartella = f.progetto, extra = {}) => {
  const chieste = [];
  const esito = await verificaPermessoScrittura({ toolCallId: 'k', ...azione }, { livelloAccesso, cartella, consensiSessione: {}, permessiPerAttrezzo: { shell: 'sempre' }, chiediApprovazioneFn: async (a) => { chieste.push(a); return false; }, ...extra });
  return { chieste, esito };
};
/** Un giro VERO del nucleo: il modello finto chiama un attrezzo, il cancello decide, l'attrezzo gira solo se nessuno ferma. */
async function giro(cartella, livelloAccesso, chiamata, extra = {}) {
  const chieste = [];
  const risposte = [{ role: 'assistant', content: null, tool_calls: [{ id: 'k0', type: 'function', function: { name: chiamata.nome, arguments: JSON.stringify(chiamata.argomenti) } }] },
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
    chiediApprovazioneFn: async (a) => { chieste.push(a); return false; },
    ambienteComandiFn: async () => ({ dove: 'windows', revisione: 0 }),
    ...extra,
  });
  const esito = String((messaggi.at(-1) ?? []).filter((m) => m.role === 'tool').at(-1)?.content ?? '');
  return { chieste, esito };
}
const letta = (comando, cartella = f.progetto) => credenzialeDellaCasaLetta({ tipo: 'shell', comando, cartella, home: f.casa });
const lettaDa = (tipo, percorso, cartella = f.progetto) => credenzialeDellaCasaLetta({ tipo, percorso, cartella, home: f.casa });

/* ===== «X:rel»: il disco senza barra ===== */

/** Le sette grafie dell'appendice A del revisore A: dal progetto `<R>\lavori\progetto` alla casa `<R>\casa`. */
const relativeAlDisco = (coda) => [
  `${L}:..${BS}..${BS}casa${BS}${coda}`,
  `${L}:.${BS}..${BS}..${BS}casa${BS}${coda}`,
  `${L.toLowerCase()}:..${BS}..${BS}casa${BS}${coda}`,
  `${L}:../../casa/${dritte(coda)}`,
  `${L.toLowerCase()}:./../../casa/${dritte(coda)}`,
  `${L}:..${BS}progetto${BS}..${BS}..${BS}casa${BS}${coda}`,
  `${L}:riservata${BS}..${BS}..${BS}..${BS}casa${BS}${coda}`,
];
const CODE = [`.ssh${BS}id_ed25519`, `.config${BS}gh${BS}hosts.yml`];

test('GRAFIE-XR1 — «X:rel» dalla shell: le quattordici righe del revisore A leggono una credenziale di casa, e in Accesso pieno c\'è la carta col segno', { skip: SALTA }, async () => {
  for (const coda of CODE) {
    for (const grafia of relativeAlDisco(coda)) {
      for (const comando of [`type ${grafia}`, `powershell -NoProfile -Command "Get-Content ${grafia}"`]) {
        assert.equal(letta(comando)?.credenzialeDellaCasa, true, `riconosciuta: ${comando}`);
        const { chieste, esito } = await carte({ tipo: 'shell', comando }, 'accesso-pieno');
        assert.equal(chieste.length, 1, `una carta in Accesso pieno: ${comando}`);
        assert.equal(chieste[0].segreto?.credenzialeDellaCasa, true, `col segno: ${comando}`);
        assert.equal(esito.consentito, false);
      }
    }
  }
  /* al contrario: «X:rel» verso un file qualunque, del progetto o di fuori, non chiede */
  for (const comando of [`type ${L}:nota.txt`, `type ${L}:..${BS}..${BS}altro${BS}nota.txt`, `type ${L}:src${BS}..${BS}README.md`]) {
    assert.equal(letta(comando), null, comando);
    const { chieste, esito } = await carte({ tipo: 'shell', comando }, 'accesso-pieno');
    assert.equal(chieste.length, 0, `nessuna carta: ${comando}`);
    assert.equal(esito.consentito, true);
  }
});

test('GRAFIE-XR2 — «X:rel» dagli attrezzi dei file: è `resolve(cartella, percorso)`, per chi legge, per chi elenca e per le cartelle bloccate; giro vero', { skip: SALTA }, async () => {
  for (const coda of CODE) {
    for (const grafia of relativeAlDisco(coda)) {
      for (const tipo of ['leggi', 'elenca']) assert.equal(lettaDa(tipo, grafia)?.credenzialeDellaCasa, true, `${tipo}: ${grafia}`);
    }
  }
  assert.deepEqual(scritturaDiUnaCredenziale(`${L}:..${BS}..${BS}casa${BS}.ssh${BS}authorized_keys`, { cartella: f.progetto, home: f.casa }), { percorso: join(f.casa, '.ssh', 'authorized_keys') }, 'chi scrive');
  assert.deepEqual(bloccataDa(`${L}:riservata${BS}privato.txt`, { cartella: f.progetto, bloccati: [f.riservata] }), { radice: f.riservata }, 'una cartella bloccata dentro il progetto');
  assert.deepEqual(comandoNominaUnaBloccata(`type ${L.toLowerCase()}:riservata${BS}privato.txt`, { cartella: f.progetto, bloccati: [f.riservata] }), { radice: f.riservata }, 'e dalla shell');
  assert.deepEqual(bloccataDa(`${L}:..${BS}..${BS}bloccata${BS}privato.txt`, { cartella: f.progetto, bloccati: [f.bloccata] }), { radice: f.bloccata }, 'una cartella bloccata fuori dal progetto');
  assert.equal(motivoDaChiedere({ tipo: 'leggi', percorso: `${L}:.env`, cartella: f.progetto, home: f.casa, accessoPieno: false })?.classe, 'segreto', 'il `.env` del progetto');
  /* giro vero: la chiave finta non arriva al modello, in nessun modo dei permessi */
  for (const livello of LIVELLI) {
    const { chieste, esito } = await giro(f.progetto, livello, { nome: 'leggi', argomenti: { percorso: `${L}:..${BS}..${BS}casa${BS}.ssh${BS}id_ed25519` } });
    assert.equal(chieste.length, 1, `${livello}: una carta`);
    assert.ok(!esito.includes(SEGNO), `${livello}: la chiave finta non arriva al modello`);
    if (livello === 'accesso-pieno') assert.equal(chieste[0].segreto?.credenzialeDellaCasa, true, 'la carta dell\'Accesso pieno porta il segno');
  }
  /* al contrario: «X:rel» verso un file qualunque non chiede, non è una scrittura vietata, non è bloccato */
  assert.equal(lettaDa('leggi', `${L}:nota.txt`), null);
  assert.equal(lettaDa('leggi', `${L}:..${BS}..${BS}altro${BS}nota.txt`), null);
  assert.equal(scritturaDiUnaCredenziale(`${L}:src${BS}nuovo.txt`, { cartella: f.progetto, home: f.casa }), null);
  assert.equal(bloccataDa(`${L}:src${BS}app.js`, { cartella: f.progetto, bloccati: [f.riservata, f.bloccata] }), null);
  /* un attrezzo dei file ha UNA lettura: «X:rel» scritto dalla radice del disco porta DENTRO il progetto, non alla casa né alla cartella bloccata */
  const casaDallaRadice = `${L}:${f.casa.slice(3)}`; const bloccataDallaRadice = `${L}:${f.bloccata.slice(3)}`;
  assert.equal(scritturaDiUnaCredenziale(`${casaDallaRadice}${BS}.ssh${BS}authorized_keys`, { cartella: f.progetto, home: f.casa }), null, 'chi scrive: una lettura');
  assert.equal(bloccataDa(`${bloccataDallaRadice}${BS}privato.txt`, { cartella: f.progetto, bloccati: [f.bloccata] }), null, 'cartella bloccata dall\'attrezzo: una lettura');
  /* un comando ne ha DUE (Git Bash legge `C:rel` dalla radice), e la lettura delle credenziali tiene quella della 0.2.1: mai una carta in meno */
  assert.deepEqual(comandoNominaUnaBloccata(`type ${bloccataDallaRadice}${BS}privato.txt`, { cartella: f.progetto, bloccati: [f.bloccata] }), { radice: f.bloccata }, 'cartella bloccata dalla shell: due letture');
  assert.equal(lettaDa('leggi', `${casaDallaRadice}${BS}.ssh${BS}id_ed25519`)?.credenzialeDellaCasa, true, 'la lettura di una credenziale dalla radice chiede come nella 0.2.1');
});

/* ===== I dischi che un comando nomina ===== */

test('GRAFIE-LU1 — sessione e processo su altri dischi: un percorso senza disco si guarda sul disco della casa (credenziali) e sui dischi che il comando NOMINA, non altrove', { skip: SALTA }, () => {
  const lontana = `${terzo}:${BS}lavori${BS}progetto`; // la sessione su un terzo disco; il processo sta su `fantasma`
  const sd = (p) => p.slice(2);
  const privato = `${sd(f.bloccata)}${BS}privato.txt`;
  const bloccata = (comando) => comandoNominaUnaBloccata(comando, { cartella: lontana, bloccati: [f.bloccata] });
  /* le credenziali: il disco della casa sempre, per un comando; un attrezzo dei file apre sul disco della sessione e non chiede */
  assert.equal(letta(`type ${sd(f.casa)}${BS}.ssh${BS}id_ed25519`, lontana)?.credenzialeDellaCasa, true, 'un comando: il disco della casa sempre');
  assert.equal(lettaDa('leggi', `${sd(f.casa)}${BS}.ssh${BS}id_ed25519`, lontana), null, 'un attrezzo dei file: solo dove apre');
  /* le cartelle bloccate: solo se il comando nomina quel disco */
  assert.equal(bloccata(`type ${privato}`), null, 'nessun disco nominato: il disco della cartella bloccata non si guarda');
  assert.deepEqual(bloccata(`${L}: && type ${privato}`), { radice: f.bloccata }, 'la lettera scritta');
  assert.deepEqual(bloccata(`copy ${privato} ${L.toLowerCase()}:${BS}copie`), { radice: f.bloccata }, 'la lettera scritta in un altro pezzo, minuscola');
  process.env.TALOS_PROVA_DISCO_NOMINATO = `${L}:${BS}qualcosa`;
  try {
    assert.deepEqual(bloccata(`copy ${privato} %TALOS_PROVA_DISCO_NOMINATO%`), { radice: f.bloccata }, 'una variabile che vale quel disco');
    assert.deepEqual(bloccata(`Copy-Item ${privato} ${DOLLARO}env:TALOS_PROVA_DISCO_NOMINATO`), { radice: f.bloccata }, 'la stessa variabile, come la scrive PowerShell');
    assert.deepEqual(bloccata(`pushd %TALOS_PROVA_DISCO_NOMINATO% & type ${privato}`), { radice: f.bloccata }, 'e come bersaglio di uno spostamento');
  } finally { delete process.env.TALOS_PROVA_DISCO_NOMINATO; }
  assert.equal(bloccata(`copy ${privato} %TALOS_PROVA_DISCO_NOMINATO%`), null, 'una variabile che non c\'è non nomina niente');
  assert.deepEqual(bloccata(`type ~${BS}progetti${BS}nota.txt & type ${privato}`), { radice: f.bloccata }, 'la casa detta con la tilde nomina il suo disco');
  assert.deepEqual(bloccata(`type %USERPROFILE%${BS}progetti${BS}nota.txt & type ${privato}`), { radice: f.bloccata }, 'e con la variabile della casa');
  /* i segreti del progetto: il secondo nome di un `.env` sul disco che il comando nomina */
  const secondoNome = `${sd(f.progetto)}${BS}note.md`;
  assert.equal(motivoDaChiedere({ tipo: 'shell', comando: `${L}: && type ${secondoNome}`, cartella: lontana, home: f.casa, accessoPieno: false })?.classe, 'segreto', 'il disco nominato');
  assert.equal(motivoDaChiedere({ tipo: 'shell', comando: `type ${secondoNome}`, cartella: lontana, home: `${terzo}:${BS}Users${BS}persona`, accessoPieno: false })?.classe, undefined, 'nessun disco nominato, la casa altrove: non è quel file');
  /* al contrario: sul disco nominato, un file qualunque */
  assert.equal(bloccata(`${L}: && type ${sd(f.altro)}${BS}nota.txt`), null);
  /* la casa in due pezzi come bersaglio di uno spostamento: è UNA casa, e `%HOMEDRIVE%` da solo nomina il suo disco */
  assert.equal(letta(`cd /d %HOMEDRIVE%%HOMEPATH% && type .npmrc`, lontana)?.credenzialeDellaCasa, true, 'cd verso la casa in due pezzi, da un altro disco');
  assert.equal(letta(`cd /d %HOMEDRIVE%%HOMEPATH%${BS}progetti && type nota.txt`, lontana), null, 'e un file qualunque della casa non chiede');
  assert.deepEqual(bloccata(`cd /d %HOMEDRIVE%${BS} & type ${privato}`), { radice: f.bloccata }, '`%HOMEDRIVE%` nomina il disco della casa');
  /* il percorso vero che non si sa dire: sul posto di sempre (il primo) si rifiuta, come nella 0.2.1; un posto in più si salta */
  const nonSiSa = () => { throw new Error('percorso vero che non si sa dire'); };
  assert.deepEqual(bloccataDa('nota.txt', { cartella: f.progetto, bloccati: [f.bloccata], realpathFn: nonSiSa }), { radice: f.bloccata, irrisolvibile: true }, 'il posto di sempre: rifiutato');
  assert.equal(comandoNominaUnaBloccata(`${L}: && type ${sd(f.altro)}${BS}nota.txt`, { cartella: lontana, bloccati: [f.bloccata], realpathFn: nonSiSa }), null, 'un posto in più che non si risolve non rifiuta');
});

/* ===== `/c/…` di Git Bash verso una cartella bloccata ===== */

test('GRAFIE-GB1 — una cartella bloccata scritta `/c/…` come la legge Git Bash è RIFIUTATA dalla shell: mai stampata, mai una carta', { skip: SALTA }, async () => {
  const privato = join(f.bloccata, 'privato.txt');
  assert.deepEqual(comandoNominaUnaBloccata(`bash -c "cat ${gitBash(privato)}"`, { cartella: f.progetto, bloccati: [f.bloccata] }), { radice: f.bloccata });
  assert.deepEqual(comandoNominaUnaBloccata(`git -c alias.vedi="!cat ${gitBash(privato)}" vedi`, { cartella: f.progetto, bloccati: [f.bloccata] }), { radice: f.bloccata });
  assert.deepEqual(bloccataDa(gitBash(privato), { cartella: f.progetto, bloccati: [f.bloccata] }), { radice: f.bloccata });
  /* al contrario: un file qualunque scritto /c/… non è bloccato */
  assert.equal(comandoNominaUnaBloccata(`bash -c "cat ${gitBash(join(f.progetto, 'nota.txt'))}"`, { cartella: f.progetto, bloccati: [f.bloccata] }), null);
  /* giro vero, in ogni modo: nessuna carta, il rifiuto, il segno non esce */
  for (const livello of LIVELLI) {
    const { chieste, esito } = await giro(f.progetto, livello, { nome: 'shell', argomenti: { comando: `"C:${BS}Program Files${BS}Git${BS}bin${BS}bash.exe" -c "cat ${gitBash(privato)}"` } }, { percorsiBloccatiFn: async () => [f.bloccata] });
    assert.equal(chieste.length, 0, `${livello}: nessuna carta`);
    assert.match(esito, /^REFUSED\./u, `${livello}: rifiutato`);
    assert.match(esito, /blocked for the device/u);
    assert.ok(!esito.includes(SEGNO), `${livello}: il file non esce`);
  }
});

test('GRAFIE-GB2 — `/c/…` verso una cartella bloccata DENTRO il progetto, attraverso una giunzione, e con la lettera maiuscola: rifiutata', { skip: SALTA }, () => {
  assert.deepEqual(comandoNominaUnaBloccata(`cat ${gitBash(join(f.riservata, 'privato.txt'))}`, { cartella: f.progetto, bloccati: [f.riservata] }), { radice: f.riservata }, 'dentro il progetto');
  assert.deepEqual(comandoNominaUnaBloccata(`cat ${gitBash(join(f.ponte, 'privato.txt'))}`, { cartella: f.progetto, bloccati: [f.bloccata] }), { radice: f.bloccata }, 'dietro una giunzione: si segue il percorso vero');
  assert.deepEqual(comandoNominaUnaBloccata(`ls /${L}${dritte(f.bloccata.slice(2))}`, { cartella: f.progetto, bloccati: [f.bloccata] }), { radice: f.bloccata }, 'la lettera maiuscola, la cartella stessa');
  /* al contrario: accanto alla cartella bloccata, e un altro disco con lo stesso resto del percorso */
  assert.equal(comandoNominaUnaBloccata(`cat ${gitBash(join(f.altro, 'nota.txt'))}`, { cartella: f.progetto, bloccati: [f.bloccata, f.riservata] }), null);
  assert.equal(comandoNominaUnaBloccata(`cat /${terzo.toLowerCase()}${dritte(f.bloccata.slice(2))}/privato.txt`, { cartella: f.progetto, bloccati: [f.bloccata] }), null, 'un altro disco non è quella cartella');
});

/* ===== Una cartella bloccata su un altro disco non rifiuta i comandi di tutti i giorni ===== */

const PB = gitBash(f.progetto);
const DI_TUTTI_I_GIORNI = ['dir /s /b src', 'rmdir /s /q build', 'del /q /s *.tmp', `cat ${PB}/README.md`, `git -C ${PB} status --short`, `find . -name "*.js" -exec grep -n TODO {} ${BS};`,
  `type ${BS}Windows${BS}System32${BS}drivers${BS}etc${BS}hosts`, `xcopy /E /I src ${BS}temp${BS}copia`, 'ls /c/Windows/System32/drivers/etc', `cd ${PB} && npm test`, 'npm test', 'git status',
  'findstr /s /i TODO *.js', `wsl ls /mnt/${PB.slice(1)}`];
const FILE_DI_TUTTI_I_GIORNI = ['src/app.js', join(f.progetto, 'README.md'), `${BS}Windows${BS}win.ini`, '/c/Windows/win.ini'];

test('GRAFIE-BR1 — una cartella bloccata sulla radice (o in una cartella) di un ALTRO disco non rifiuta nessuno dei 18 comandi di tutti i giorni del revisore C', { skip: SALTA }, () => {
  const blocchi = [[`${terzo}:${BS}`], [`${terzo}:${BS}Windows`], [`${terzo}:${BS}Foto`], [`${terzo}:${BS}temp`, `${terzo}:${BS}Windows${BS}System32`]];
  let rifiuti = 0;
  for (const bloccati of blocchi) {
    for (const comando of DI_TUTTI_I_GIORNI) {
      const esito = comandoNominaUnaBloccata(comando, { cartella: f.progetto, bloccati });
      if (esito) rifiuti += 1;
      assert.equal(esito, null, `${bloccati.join(', ')}: ${comando}`);
    }
    for (const percorso of FILE_DI_TUTTI_I_GIORNI) {
      const esito = bloccataDa(percorso, { cartella: f.progetto, bloccati });
      if (esito) rifiuti += 1;
      assert.equal(esito, null, `${bloccati.join(', ')}: ${percorso}`);
    }
  }
  assert.equal(rifiuti, 0);
});

test('GRAFIE-BR2 — AL CONTRARIO: quando il comando NOMINA quel disco, la cartella bloccata scritta senza disco resta rifiutata', { skip: SALTA }, () => {
  const foto = `${terzo}:${BS}Foto`;
  for (const comando of [`${terzo}: && type ${BS}Foto${BS}a.jpg`, `cd /d ${terzo}:${BS} && type ${BS}Foto${BS}a.jpg`, `pushd ${terzo}:${BS}lavori & dir ${BS}Foto`,
    `powershell -NoProfile -Command "Set-Location ${terzo}:${BS}; Get-Content ${BS}Foto${BS}a.jpg"`, `type ${terzo}:${BS}Foto${BS}a.jpg`, `copy ${BS}Foto${BS}a.jpg ${terzo}:${BS}copie`]) {
    assert.deepEqual(comandoNominaUnaBloccata(comando, { cartella: f.progetto, bloccati: [foto] }), { radice: foto }, comando);
  }
  assert.deepEqual(comandoNominaUnaBloccata(`${terzo}: && dir ${BS}lavori`, { cartella: f.progetto, bloccati: [`${terzo}:${BS}`] }), { radice: `${terzo}:${BS}` }, 'la radice intera del disco nominato');
  assert.deepEqual(bloccataDa(`${terzo}:${BS}Foto${BS}a.jpg`, { cartella: f.progetto, bloccati: [foto] }), { radice: foto }, 'dall\'attrezzo, col disco scritto');
  /* e nel disco nominato, fuori dalla cartella bloccata, niente rifiuto */
  assert.equal(comandoNominaUnaBloccata(`${terzo}: && type ${BS}Musica${BS}a.mp3`, { cartella: f.progetto, bloccati: [foto] }), null);
});

/* ===== Le barre raddoppiate dopo il disco ===== */

const doppieRovesce = (p) => p.replaceAll(BS, BS + BS); // C:\\T\\x
const doppieDritte = (p) => p.replaceAll(BS, '//'); // C://T//x

test('GRAFIE-DS1 — `C:\\\\cartella\\\\…` e `C://cartella//…` sono lo stesso file: credenziale di casa, segreto del progetto, cartella bloccata, scrittura vietata', { skip: SALTA }, async () => {
  const chiave = join(f.casa, '.ssh', 'id_ed25519');
  for (const doppie of [doppieRovesce, doppieDritte]) {
    const g = doppie(chiave);
    assert.equal(lettaDa('leggi', g)?.credenzialeDellaCasa, true, `leggi: ${g}`);
    for (const comando of [`type ${g}`, `powershell -NoProfile -Command "Get-Content ${g}"`]) {
      assert.equal(letta(comando)?.credenzialeDellaCasa, true, comando);
      const { chieste } = await carte({ tipo: 'shell', comando }, 'accesso-pieno');
      assert.equal(chieste.length, 1, `una carta in Accesso pieno: ${comando}`);
      assert.equal(chieste[0].segreto?.credenzialeDellaCasa, true);
    }
    assert.equal(motivoDaChiedere({ tipo: 'leggi', percorso: doppie(join(f.progetto, '.env')), cartella: f.progetto, home: f.casa, accessoPieno: false })?.classe, 'segreto', `il .env: ${doppie(join(f.progetto, '.env'))}`);
    assert.deepEqual(bloccataDa(doppie(join(f.bloccata, 'privato.txt')), { cartella: f.progetto, bloccati: [f.bloccata] }), { radice: f.bloccata }, 'la cartella bloccata, dall\'attrezzo');
    assert.deepEqual(comandoNominaUnaBloccata(`type ${doppie(join(f.bloccata, 'privato.txt'))}`, { cartella: f.progetto, bloccati: [f.bloccata] }), { radice: f.bloccata }, 'e dalla shell');
    assert.deepEqual(scritturaDiUnaCredenziale(doppie(join(f.casa, '.ssh', 'authorized_keys')), { cartella: f.progetto, home: f.casa }), { percorso: join(f.casa, '.ssh', 'authorized_keys') }, 'chi scrive');
  }
  /* al contrario: un file qualunque con le barre raddoppiate, e un indirizzo vero */
  for (const doppie of [doppieRovesce, doppieDritte]) {
    const { chieste, esito } = await carte({ tipo: 'shell', comando: `type ${doppie(join(f.altro, 'nota.txt'))}` }, 'accesso-pieno');
    assert.equal(chieste.length, 0);
    assert.equal(esito.consentito, true);
  }
  assert.equal(letta('curl -s https://example.invalid//casa//.ssh//id_ed25519'), null, 'un indirizzo resta un indirizzo');
});

/* ===== I prefissi lunghi e la rete che è questo computer ===== */

/* La 0.2.1 dice «irrisolvibile» a un prefisso di dispositivo verso un file qualunque solo quando `realpathSync` (quello JS) non sa dire
   il percorso vero della grafia com'è scritta, e questo dipende da Node: v24.18 dà EISDIR su `\\?\C:\…`, v24.22 lo risolve (runner
   GitHub, PR 96). L'atteso si misura qui, sullo stesso Node e sulla stessa grafia; i rifiuti delle bloccate sopra non ne dipendono. */
const comeNellaZeroDueUno = (g) => {
  const scritto = resolve(g);
  assert.ok(existsSync(scritto), `il file qualunque c è: ${scritto}`);
  try { realpathSync(scritto); return false; } catch { return true; }
};

const prefissi = (p) => [`${BS}${BS}?${BS}${p}`, `${BS}${BS}.${BS}${p}`, `${BS}${BS}localhost${BS}${p.slice(0, 1).toLowerCase()}${DOLLARO}${p.slice(2)}`, `${BS}${BS}127.0.0.1${BS}${p.slice(0, 1)}${DOLLARO}${p.slice(2)}`];

test('GRAFIE-PL1 — `\\\\?\\C:\\…`, `\\\\.\\C:\\…`, `\\\\localhost\\c$\\…`: scrivere una credenziale di casa è vietato, una cartella bloccata è rifiutata', { skip: SALTA }, () => {
  for (const g of prefissi(join(f.casa, '.ssh', 'authorized_keys'))) {
    assert.equal(scritturaDiUnaCredenziale(g, { cartella: f.progetto, home: f.casa })?.percorso.toLowerCase(), join(f.casa, '.ssh', 'authorized_keys').toLowerCase(), `chi scrive: ${g}`);
  }
  for (const g of prefissi(join(f.bloccata, 'privato.txt'))) {
    assert.deepEqual(bloccataDa(g, { cartella: f.progetto, bloccati: [f.bloccata] }), { radice: f.bloccata }, `dall'attrezzo: ${g}`);
    assert.deepEqual(comandoNominaUnaBloccata(`type ${g}`, { cartella: f.progetto, bloccati: [f.bloccata] }), { radice: f.bloccata }, `dalla shell: ${g}`);
  }
  for (const g of prefissi(join(f.ponte, 'privato.txt'))) {
    assert.deepEqual(bloccataDa(g, { cartella: f.progetto, bloccati: [f.bloccata] }), { radice: f.bloccata }, `dietro la giunzione: ${g}`);
  }
  /* al contrario: lo stesso prefisso verso un file qualunque; un computer DI RETE non è questo */
  for (const g of prefissi(join(f.altro, 'nota.txt'))) {
    assert.equal(scritturaDiUnaCredenziale(g, { cartella: f.progetto, home: f.casa }), null, g);
    assert.equal(comandoNominaUnaBloccata(`type ${g}`, { cartella: f.progetto, bloccati: [f.bloccata] }), null, `un comando non è rifiutato: ${g}`);
    /* dall'attrezzo, `\\?\` e `\\.\` verso un file qualunque rispondono come nella 0.2.1 sullo stesso Node (mai un rifiuto in meno); la rete di questo computer non è bloccata */
    const esito = bloccataDa(g, { cartella: f.progetto, bloccati: [f.bloccata] });
    if (/^[\\/]{2}[?.][\\/]/u.test(g)) {
      if (comeNellaZeroDueUno(g)) assert.equal(esito?.irrisolvibile, true, `come nella 0.2.1: ${g}`);
      else assert.equal(esito, null, `come nella 0.2.1 su questo Node, che il percorso vero lo sa dire: ${g}`);
    } else assert.equal(esito, null, g);
  }
  assert.equal(scritturaDiUnaCredenziale(`${BS}${BS}archivio-di-rete${BS}condivisa${f.casa.slice(2)}${BS}.ssh${BS}authorized_keys`, { cartella: f.progetto, home: f.casa }), null, 'la rete vera non è la casa');
});

test('GRAFIE-PL2 — il secondo nome (collegamento fisico) di un `.env` scritto coi prefissi lunghi: la carta del segreto, fuori dall\'Accesso pieno', { skip: SALTA }, async () => {
  for (const g of prefissi(join(f.progetto, 'note.md'))) {
    assert.equal(motivoDaChiedere({ tipo: 'shell', comando: `type ${g}`, cartella: f.progetto, home: f.casa, accessoPieno: false })?.classe, 'segreto', `dalla shell: ${g}`);
    for (const livello of ['scrittura-progetto', 'su-richiesta']) {
      const { chieste } = await carte({ tipo: 'shell', comando: `type ${g}` }, livello);
      assert.equal(chieste.length, 1, `${livello}: una carta (anche con «shell: sempre»): ${g}`);
    }
  }
  /* al contrario: un file qualunque del progetto con lo stesso prefisso non è un segreto */
  for (const g of prefissi(join(f.progetto, 'nota.txt'))) {
    assert.equal(motivoDaChiedere({ tipo: 'shell', comando: `type ${g}`, cartella: f.progetto, home: f.casa, accessoPieno: false })?.classe, undefined, g);
  }
});

/* ===== Le altre grafie della casa ===== */

const DELLA_CASA = [`%HOMEPATH%${BS}`, `${DOLLARO}env:HOMEPATH${BS}`, `${DOLLARO}{env:HOMEPATH}${BS}`, `${DOLLARO}{env:USERPROFILE}${BS}`, `%HOMEDRIVE%%HOMEPATH%${BS}`,
  `${DOLLARO}env:HOMEDRIVE${DOLLARO}env:HOMEPATH${BS}`, `${DOLLARO}{env:HOMEDRIVE}${DOLLARO}{env:HOMEPATH}${BS}`, `${DOLLARO}{env:HOME}/`];
const leggeConLaGrafia = (g, coda) => (g.startsWith('%') ? `type ${g}${coda}` : `Get-Content ${g}${coda}`);

test('GRAFIE-HP1 — `%HOMEPATH%`, `$env:HOMEPATH`, `${env:USERPROFILE}`, `%HOMEDRIVE%%HOMEPATH%`: in Accesso pieno leggere una credenziale di casa chiede, col segno', { skip: SALTA }, async () => {
  for (const g of DELLA_CASA) {
    for (const coda of CODE) {
      const comando = leggeConLaGrafia(g, coda);
      assert.equal(letta(comando)?.credenzialeDellaCasa, true, comando);
      const { chieste, esito } = await carte({ tipo: 'shell', comando }, 'accesso-pieno');
      assert.equal(chieste.length, 1, `una carta in Accesso pieno: ${comando}`);
      assert.equal(chieste[0].segreto?.credenzialeDellaCasa, true, `col segno: ${comando}`);
      assert.equal(esito.consentito, false);
    }
  }
  /* al contrario: la stessa grafia verso un file qualunque della casa non chiede in Accesso pieno */
  for (const g of DELLA_CASA) {
    const comando = leggeConLaGrafia(g, `progetti${BS}nota.txt`);
    assert.equal(letta(comando), null, comando);
    const { chieste } = await carte({ tipo: 'shell', comando }, 'accesso-pieno');
    assert.equal(chieste.length, 0, `nessuna carta: ${comando}`);
  }
});

test('GRAFIE-HP2 — le stesse grafie FUORI dall\'Accesso pieno: una carta sola, per il segreto', { skip: SALTA }, async () => {
  for (const g of DELLA_CASA) {
    const comando = leggeConLaGrafia(g, `.ssh${BS}id_ed25519`);
    for (const livello of ['scrittura-progetto', 'su-richiesta']) {
      const { chieste, esito } = await carte({ tipo: 'shell', comando }, livello);
      assert.equal(chieste.length, 1, `${livello}: una carta sola: ${comando}`);
      assert.equal(esito.consentito, false);
    }
    assert.equal(motivoDaChiedere({ tipo: 'shell', comando, cartella: f.progetto, home: f.casa, accessoPieno: false })?.classe, 'segreto', `un segreto: ${comando}`);
    /* e non solo per il nome: un file d'esempio con una chiave dentro si riconosce solo se la grafia porta DAVVERO nella casa */
    const esempio = leggeConLaGrafia(g, `progetti${BS}config.example.json`);
    assert.equal(motivoDaChiedere({ tipo: 'shell', comando: esempio, cartella: f.progetto, home: f.casa, accessoPieno: false })?.contenuto, true, `l'esempio con una chiave: ${esempio}`);
  }
  /* al contrario: un'altra variabile non è la casa, e un file qualunque della casa non è un segreto */
  assert.equal(letta(`type %HOMEPATHS%${BS}.ssh${BS}id_ed25519`), null, 'un\'altra variabile');
  assert.equal(motivoDaChiedere({ tipo: 'shell', comando: `type %HOMEPATH%${BS}progetti${BS}nota.txt`, cartella: f.progetto, home: f.casa, accessoPieno: true }), null, 'un file qualunque della casa, in Accesso pieno');
});

/* ===== La lettura di una credenziale segue il `cd` dello stesso comando ===== */

test('GRAFIE-CD1 — `cd /d <casa> && type .ssh\\id_ed25519`, `Set-Location`, `pushd`, una catena di `cd`: la credenziale letta dopo lo spostamento chiede in Accesso pieno', { skip: SALTA }, async () => {
  const comandi = [
    `cd /d ${f.casa} && type .ssh${BS}id_ed25519`,
    `powershell -NoProfile -Command "Set-Location ${f.casa}; Get-Content .ssh${BS}id_ed25519"`,
    `Set-Location -Path ${f.casa}; Get-Content .npmrc`,
    `pushd ${f.casa} & type .npmrc`,
    `cd /d ${join(f.casa, '.ssh')} && type id_ed25519`,
    `cd ..${BS}..${BS}casa && type .config${BS}gh${BS}hosts.yml`,
    `cd .. && cd .. && cd casa${BS}.ssh && cat id_ed25519`,
    `cd ${dritte(f.casa)} ; cat .ssh/id_ed25519`,
    /* la casa in due pezzi è UNA casa (non due di fila), e `%HOMEDRIVE%` da solo è il suo disco */
    `cd /d %HOMEDRIVE%%HOMEPATH% && type .ssh${BS}id_ed25519`,
    `Set-Location ${DOLLARO}env:HOMEDRIVE${DOLLARO}env:HOMEPATH; Get-Content .npmrc`,
    `cd /d %HOMEDRIVE%${f.casa.slice(2)} && type .npmrc`,
    `pushd "%USERPROFILE%" & type .ssh${BS}id_ed25519`,
  ];
  for (const comando of comandi) {
    assert.equal(letta(comando)?.credenzialeDellaCasa, true, comando);
    const { chieste, esito } = await carte({ tipo: 'shell', comando }, 'accesso-pieno');
    assert.equal(chieste.length, 1, `una carta in Accesso pieno: ${comando}`);
    assert.equal(chieste[0].segreto?.credenzialeDellaCasa, true, `col segno: ${comando}`);
    assert.equal(esito.consentito, false);
  }
});

test('GRAFIE-CD2 — AL CONTRARIO: i `cd` di tutti i giorni non chiedono, e oltre il tetto degli spostamenti il comando è «troppo complesso»', { skip: SALTA }, async () => {
  for (const comando of ['cd src && npm test', `cd /d ${f.altro} && type nota.txt`, `cd ${f.casa} && dir progetti`, `pushd ${join(f.casa, 'progetti')} & type nota.txt`, `type .ssh${BS}id_ed25519`,
    `cd /d ${f.altro} && type .ssh${BS}id_ed25519`, 'cd .. && git status', `cd ${dritte(f.progetto)}/src && node app.js`,
    `cd /d %HOMEDRIVE%%HOMEPATH%${BS}progetti && type nota.txt`, `cd /d %HOMEDRIVE%${f.altro.slice(2)} && type .ssh${BS}id_ed25519`]) {
    assert.equal(letta(comando), null, comando);
    const { chieste, esito } = await carte({ tipo: 'shell', comando }, 'accesso-pieno');
    assert.equal(chieste.length, 0, `nessuna carta: ${comando}`);
    assert.equal(esito.consentito, true);
  }
  /* sedici cartelle diverse si seguono ancora; alla diciassettesima non si finge di sapere */
  const catena = (n) => `${Array.from({ length: n }, (_, i) => `cd /d ${join(f.altro, `c${i}`)}`).join(' && ')} && type nota.txt`;
  assert.equal(letta(catena(16)), null, 'sedici spostamenti: si seguono, e non c\'è niente');
  const oltre = letta(catena(17));
  assert.equal(oltre?.credenzialeDellaCasa, true, 'diciassette: chiede');
  const { chieste } = await carte({ tipo: 'shell', comando: catena(17) }, 'accesso-pieno');
  assert.equal(chieste.length, 1, 'una carta, non un passaggio in silenzio');
});

/* ===== La carta della cancellazione critica nomina il posto che il sistema userà ===== */

test('GRAFIE-CC2 — la carta della credenziale di casa scritta `/t/casa/…` dice il percorso com\'è scritto, senza inventare un collegamento (revisore C, P09)', { skip: !WINDOWS }, () => {
  const casa = `C:${BS}t${BS}casa`; const cartella = `C:${BS}x${BS}proj`;
  const collegato = `t:${BS}casa${BS}.ssh${BS}id_ed25519`;
  const nodo = (link) => ({ isSymbolicLink: () => link, isDirectory: () => !link, isFile: () => false });
  const lancia = (codice) => () => { const e = new Error(codice); e.code = codice; throw e; };
  const fsFinto = { lstatSync: (p) => nodo(String(p).toLowerCase() === collegato), readlinkSync: (p) => (String(p).toLowerCase() === collegato ? `C:${BS}t${BS}casa${BS}.aws${BS}credentials` : lancia('EINVAL')()) };
  for (const [tipo, testo] of [['shell', 'type /t/casa/.ssh/id_ed25519'], ['leggi', '/t/casa/.ssh/id_ed25519']]) {
    const esito = credenzialeDellaCasaLetta({ tipo, ...(tipo === 'shell' ? { comando: testo } : { percorso: testo }), cartella, home: casa, fsSync: fsFinto, statFn: lancia('ENOENT'), elencaFn: () => [] });
    assert.equal(esito?.credenzialeDellaCasa, true, `${tipo}: chiede`);
    assert.equal(esito.percorso, '/t/casa/.ssh/id_ed25519', `${tipo}: la carta dice il percorso scritto`);
  }
});

/* ===== Le prove che mancavano ai mutanti vivi del revisore C ===== */

test('GRAFIE-MU2 — senza una cartella di sessione (`cartella: \'\'`) un percorso relativo non si risolve sulla cartella del processo (M08, M19, M20)', { skip: SALTA }, () => {
  process.cwd = () => f.progetto; // il processo NEL progetto: un relativo, risolto per sbaglio su di lui, arriverebbe alla casa
  try {
    const versoLaCasa = `..${BS}..${BS}casa${BS}.npmrc`;
    assert.equal(lettaDa('leggi', versoLaCasa, f.progetto)?.credenzialeDellaCasa, true, 'la premessa: con la cartella della sessione chiede');
    assert.equal(lettaDa('leggi', versoLaCasa, ''), null, 'M08: senza cartella, la lettura non inventa');
    assert.equal(scritturaDiUnaCredenziale(`..${BS}..${BS}casa${BS}.ssh${BS}authorized_keys`, { cartella: '', home: f.casa }), null, 'M19: senza cartella, la scrittura non inventa');
    assert.equal(bloccataDa(`riservata${BS}privato.txt`, { cartella: '', bloccati: [f.riservata] })?.irrisolvibile, true, 'M20: senza cartella, un relativo non si sa dov\'è: si dice, non si finge');
    /* al contrario: senza cartella un percorso intero si giudica lo stesso */
    assert.equal(lettaDa('leggi', join(f.casa, '.npmrc'), '')?.credenzialeDellaCasa, true);
    assert.deepEqual(scritturaDiUnaCredenziale(join(f.casa, '.ssh', 'authorized_keys'), { cartella: '', home: f.casa }), { percorso: join(f.casa, '.ssh', 'authorized_keys') });
    assert.deepEqual(bloccataDa(join(f.riservata, 'privato.txt'), { cartella: '', bloccati: [f.riservata] }), { radice: f.riservata }, 'un percorso intero si sa dov\'è: nessun «irrisolvibile»');
  } finally { process.cwd = () => `${fantasma}:${BS}`; }
});
