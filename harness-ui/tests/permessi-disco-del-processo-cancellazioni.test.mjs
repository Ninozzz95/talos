/* Diviso da `permessi-disco-del-processo.test.mjs` (giro unico della riparazione, 12/11/2026): qui le prove di `cancellazioni-critiche.mjs` (PROCESSO-P3, PROCESSO-P4, PROCESSO-P5, PROCESSO-P6),
 * con la stessa preparazione; là quelle di `path-policy.mjs`, che si portano sulla CLI anche dove questo modulo non c'è. */
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
import { cancellazioneCritica } from '../src/kernel/cancellazioni-critiche.mjs';
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
const critica = (comando, extra = {}) => cancellazioneCritica(comando, { cartella: sessione, home: f.casa, piattaforma: 'win32', ambiente: {}, ...extra });

test('PROCESSO-P3 — solo il cancello: «X:» da solo È un cambio di disco, e la casa (o un progetto critico) scritta poi senza disco è una cancellazione critica', { skip: SALTA }, async () => {
  for (const comando of [`${L}: & rd /s /q ${sd(f.casa)}`, `${L}: && rd /s /q ${sd(f.casa)}`, `powershell -NoProfile -Command "${L}:; Remove-Item -Recurse -Force ${sd(f.casa)}"`, `cmd /c "${L.toLowerCase()}: & rmdir /s /q ${sd(f.casa)}"`]) {
    assert.equal(critica(comando)?.perche, 'casa', comando);
    assert.equal(critica(comando).percorso.toLowerCase(), f.casa.toLowerCase(), `la carta nomina la casa sul suo disco: ${comando}`);
  }
  assert.equal(critica(`cd /d ${L}:${BS} & rd /s /q ${sd(f.casa)}`)?.perche, 'casa', 'la premessa: con `cd /d` era già riconosciuta');
  assert.equal(critica(`${L}: & rd /s /q ${sd(f.dati)}`, { progettiCritici: [f.dati] })?.perche, 'progetto', 'un progetto critico su quel disco');
  const { chieste, esito } = await carte({ tipo: 'shell', comando: `${L}: & rd /s /q ${sd(f.casa)}` }, 'accesso-pieno');
  assert.equal(chieste.length, 1, 'dal cancello: una carta in Accesso pieno');
  assert.equal(chieste[0].cancellazioneCritica?.perche, 'casa');
  assert.equal(esito.consentito, false);
  /* al contrario: dopo «X:» una sottocartella qualunque, e «X:» che torna sul disco della sessione prima di cancellare */
  assert.equal(critica(`${L}: & rd /s /q ${sd(f.altro)}${BS}sotto${BS}cartella`), null, 'una sottocartella qualunque non è critica');
  assert.equal(critica(`${L}: & ${fantasma}: & rd /s /q build`), null, 'tornati sul disco della sessione, `build` è una sottocartella del progetto');
  assert.equal(critica(`${L}: & ${fantasma}: & rd /s /q .`)?.perche, 'progetto', 'tornati sul disco della sessione, `.` è di nuovo il progetto');
  /* la lettera del disco in cui si è già non sposta: `build` resta una sottocartella del progetto, `.` resta il progetto */
  const sottoLaCasa = { cartella: f.sottoCasa, home: f.casa, piattaforma: 'win32', ambiente: {} };
  assert.equal(cancellazioneCritica(`${L}: & rd /s /q build`, sottoLaCasa), null, 'il proprio disco: niente si sposta');
  assert.equal(cancellazioneCritica(`${L}: & rd /s /q .`, sottoLaCasa)?.perche, 'progetto', 'il proprio disco: `.` è il progetto');
  /* e come nella 0.2.1: in Git Bash «X:» non è un cambio di disco, quindi la casa scritta senza disco sul disco della sessione resta critica */
  assert.equal(cancellazioneCritica(`${fantasma}: & rd /s /q ${sd(f.casa)}`, sottoLaCasa)?.perche, 'casa', 'la lettura di Git Bash non si perde');
});

test('PROCESSO-P4 — solo il cancello: «cd X:\\altro» SENZA /d in cmd non cambia disco, e «rd /s /q .» cancella il PROGETTO; nell\'altro verso resta la lettura di PowerShell', { skip: SALTA }, async () => {
  for (const comando of [`cd ${f.altro} & rd /s /q .`, `cd ${f.altro} && del /s /q *`, `chdir ${f.altro} & rd /s /q .`]) {
    assert.equal(critica(comando)?.perche, 'progetto', comando);
    assert.equal(critica(comando).percorso.toLowerCase(), sessione.toLowerCase(), `la carta nomina il progetto: ${comando}`);
  }
  /* nell'altro verso: PowerShell con `cd` si sposta davvero, e lì un posto critico resta critico */
  assert.equal(critica(`cd ${f.casa}${BS}.. ; Remove-Item -Recurse -Force casa`)?.perche, 'casa', 'PowerShell: `cd` verso un altro disco sposta');
  /* e in cmd, dopo `cd X:\altro` senza /d, «X:» porta nella cartella ricordata di quel disco */
  assert.equal(critica(`cd ${f.casa}${BS}.. & ${L}: & rd /s /q casa`)?.perche, 'casa', 'cmd: la cartella ricordata del disco');
  assert.equal(critica(`cd ${f.casa}${BS}.. & rd /s /q ${L}:casa`)?.perche, 'casa', 'cmd: «X:rel» parte dalla cartella ricordata di quel disco');
  assert.equal(critica(`cd ${f.altro} & rd /s /q ${L}:sotto${BS}cartella`), null, 'e lì una sottocartella qualunque non è critica');
  /* la casa scritta dalla radice, dopo `cd X:\altro`, sta SOTTO `altro`: «X:rel» non riparte dalla radice se quel disco ha una cartella ricordata */
  assert.equal(critica(`cd ${f.altro} & rd /s /q ${L}:${sd(f.casa).slice(1)}`), null, 'cmd: «X:rel» parte dalla cartella ricordata, non dalla radice');
  const { chieste } = await carte({ tipo: 'shell', comando: `cd ${f.altro} & rd /s /q .` }, 'accesso-pieno');
  assert.equal(chieste.length, 1, 'dal cancello: una carta in Accesso pieno');
  assert.equal(chieste[0].cancellazioneCritica?.perche, 'progetto');
  /* al contrario: con /d il disco cambia e `.` è la cartella qualunque; senza /d una sottocartella del progetto resta libera */
  assert.equal(critica(`cd /d ${f.altro}${BS}sotto & rd /s /q .`), null, 'con /d: la cartella dove si è andati, che non è critica');
  assert.equal(critica(`cd ${f.altro} & rd /s /q build`), null, 'senza /d: una sottocartella del progetto');
});

test('PROCESSO-P5 — solo il cancello: la casa scritta «X:rel» dalla radice, con la sessione su un altro disco', { skip: SALTA }, () => {
  assert.equal(critica(`rd /s /q ${L}:${sd(f.casa).slice(1)}`)?.perche, 'casa');
  assert.equal(critica(`Remove-Item -Recurse -Force ${L}:${sd(f.casa).slice(1)}`)?.perche, 'casa');
  /* al contrario: «X:rel» verso una sottocartella qualunque, e sullo stesso disco della sessione resta relativo alla sua cartella */
  assert.equal(critica(`rd /s /q ${L}:${sd(f.altro).slice(1)}${BS}sotto${BS}cartella`), null);
  assert.equal(cancellazioneCritica(`rd /s /q ${L}:build`, { cartella: f.sottoCasa, home: f.casa, piattaforma: 'win32', ambiente: {} }), null, 'stesso disco: `X:build` è una sottocartella del progetto');
  assert.equal(cancellazioneCritica(`rd /s /q ${L}:.`, { cartella: f.sottoCasa, home: f.casa, piattaforma: 'win32', ambiente: {} })?.perche, 'progetto', 'stesso disco: `X:.` è il progetto');
});

test('PROCESSO-P6 — solo il cancello: chi lascia un disco con `cd /d`, `pushd`, `popd`, `Set-Location` ne ricorda la cartella, e «X:» (o «X:rel») ci torna', { skip: SALTA }, () => {
  /* dal progetto si va sull'altro disco e si torna con «X:»: `.` è di nuovo il progetto, non la radice del suo disco */
  for (const comando of [`cd /d ${f.altro} & ${fantasma}: & rd /s /q .`, `pushd ${f.altro} & ${fantasma}: & rd /s /q .`, `Set-Location ${f.altro}; ${fantasma}:; Remove-Item -Recurse -Force .`]) {
    assert.equal(critica(comando)?.perche, 'progetto', comando);
    assert.equal(critica(comando).percorso.toLowerCase(), sessione.toLowerCase(), `la carta nomina il progetto: ${comando}`);
  }
  /* la lettura di PowerShell da sola: `cd` senza /d sposta, `cd sotto` scende, «X:» torna nel progetto (per cmd si è in `progetto\sotto`, per Git Bash in `altro\sotto`) */
  const soloPowerShell = `cd ${f.altro}; cd sotto; ${fantasma}:; Remove-Item -Recurse -Force .`;
  assert.equal(critica(soloPowerShell)?.perche, 'progetto', soloPowerShell);
  assert.equal(critica(soloPowerShell).percorso.toLowerCase(), sessione.toLowerCase());
  /* `popd` che riporta sul disco della sessione lascia l'altro dov'era: «X:rel» riparte da lì */
  assert.equal(critica(`pushd ${f.casa}${BS}.. & popd & rd /s /q ${L}:casa`)?.perche, 'casa', 'dopo `popd`, «X:casa» parte dalla cartella lasciata su quel disco');
  /* e chi va dove non si sa dire (un `popd` senza niente da riprendere) non fa dimenticare dov'era quel disco: «X:» ci torna */
  const dopoIlVuoto = `popd & pushd ${f.altro} & ${fantasma}: & rd /s /q .`;
  assert.equal(critica(dopoIlVuoto)?.perche, 'progetto', dopoIlVuoto);
  assert.equal(critica(dopoIlVuoto).percorso.toLowerCase(), sessione.toLowerCase());
  assert.equal(critica(`popd & pushd ${f.altro} & ${fantasma}: & rd /s /q build`), null, 'e lì `build` resta una sottocartella del progetto');
  /* al contrario: tornati nel progetto una sottocartella resta libera, e dalla cartella lasciata una sottocartella qualunque non è critica */
  assert.equal(critica(`cd /d ${f.altro} & ${fantasma}: & rd /s /q build`), null, 'tornati nel progetto: `build` è una sua sottocartella');
  assert.equal(critica(`pushd ${f.altro} & popd & rd /s /q ${L}:${sd(f.casa).slice(1)}`), null, 'dopo `popd`: la casa scritta dalla radice sta sotto la cartella lasciata, e non è la casa');
});
