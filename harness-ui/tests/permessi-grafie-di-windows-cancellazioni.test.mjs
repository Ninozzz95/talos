/* Diviso da `permessi-grafie-di-windows.test.mjs` (giro unico della riparazione, 12/11/2026): qui le prove di `cancellazioni-critiche.mjs` (GRAFIE-DS2, GRAFIE-CC1, GRAFIE-MU1),
 * con la stessa preparazione; là quelle di `path-policy.mjs`, che si portano sulla CLI anche dove questo modulo non c'è. */
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
import { join } from 'node:path';

import { talosLavora, verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs';
import { bloccataDa, comandoNominaUnaBloccata, credenzialeDellaCasaLetta, motivoDaChiedere, scritturaDiUnaCredenziale } from '../src/path-policy.mjs';
import { cancellazioneCritica } from '../src/kernel/cancellazioni-critiche.mjs';
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
const critica = (comando, extra = {}) => cancellazioneCritica(comando, { cartella: f.progetto, home: f.casa, piattaforma: 'win32', ambiente: {}, ...extra });

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

/* le barre raddoppiate dopo il disco (come nel file da cui è diviso) */
const doppieRovesce = (p) => p.replaceAll(BS, BS + BS); // C:\\T\\x
const doppieDritte = (p) => p.replaceAll(BS, '//'); // C://T//x

test('GRAFIE-DS2 — solo il cancello: cancellare la casa o il progetto scritti con le barre raddoppiate è una cancellazione critica', { skip: SALTA }, async () => {
  for (const doppie of [doppieRovesce, doppieDritte]) {
    for (const comando of [`Remove-Item -Recurse -Force ${doppie(f.casa)}`, `rd /s /q ${doppie(f.casa)}`, `rm -rf ${doppieDritte(f.casa)}`]) {
      assert.equal(critica(comando)?.perche, 'casa', comando);
      assert.equal(critica(comando).percorso.toLowerCase(), f.casa.toLowerCase(), `la carta nomina la casa: ${comando}`);
    }
    assert.equal(critica(`Remove-Item -Recurse -Force ${doppie(f.progetto)}`)?.perche, 'progetto');
  }
  const { chieste, esito } = await carte({ tipo: 'shell', comando: `rd /s /q ${doppieDritte(f.casa)}` }, 'accesso-pieno');
  assert.equal(chieste.length, 1, 'dal cancello: una carta in Accesso pieno');
  assert.equal(chieste[0].cancellazioneCritica?.perche, 'casa');
  assert.equal(esito.consentito, false);
  /* al contrario: una sottocartella qualunque con le barre raddoppiate, e un indirizzo vero non è un percorso */
  assert.equal(critica(`rd /s /q ${doppieDritte(join(f.progetto, 'build', 'vecchio'))}`), null);
  assert.equal(critica('git clone https://example.invalid//gruppo//progetto'), null);
  assert.equal(critica('curl -X DELETE https://example.invalid//'), null);
});

test('GRAFIE-CC1 — `/T/progetto` in una sessione `C:\\T\\progetto`: la carta dice `C:\\T\\progetto` (dove il sistema cancella), non un disco `T:` che non c\'è', { skip: !WINDOWS }, () => {
  const mondo = { cartella: `C:${BS}T${BS}progetto`, home: `C:${BS}Users${BS}persona`, piattaforma: 'win32', ambiente: {}, realpathFn: (p) => p };
  for (const comando of ['Remove-Item -Recurse -Force /T/progetto', `rd /s /q ${BS}T${BS}progetto`, 'rmdir /s /q /T/progetto', 'powershell -NoProfile -Command "Remove-Item -Recurse -Force /T/progetto"']) {
    assert.deepEqual(cancellazioneCritica(comando, mondo), { percorso: `C:${BS}T${BS}progetto`, perche: 'progetto' }, comando);
  }
  /* il revisore C, mutante M14: sopra il progetto, la lettura del sistema */
  const profondo = { ...mondo, cartella: `C:${BS}T${BS}mondo${BS}Temp${BS}progetto` };
  assert.deepEqual(cancellazioneCritica('Remove-Item -Recurse -Force /T/mondo', profondo), { percorso: `C:${BS}T${BS}mondo`, perche: 'sopra-il-progetto' });
  /* `rm` con le opzioni di PowerShell è `Remove-Item`: la lettura del sistema */
  for (const comando of ['rm -Recurse -Force /T/progetto', 'rm -recurse -force /T/progetto']) {
    assert.deepEqual(cancellazioneCritica(comando, mondo), { percorso: `C:${BS}T${BS}progetto`, perche: 'progetto' }, comando);
  }
  /* al contrario: un `rm -rf` alla POSIX è di Git Bash, e lì `/T/…` è il disco T: la carta lo dice; un posto qualunque non è critico */
  assert.deepEqual(cancellazioneCritica('rm -rf /T/progetto', mondo), { percorso: `T:${BS}progetto`, perche: 'primo-livello' });
  assert.equal(cancellazioneCritica('Remove-Item -Recurse -Force /T/progetto/build/vecchio', mondo), null);
});

test('GRAFIE-MU1 — solo il cancello: una variabile assegnata DOPO non rende critico il comando (C10), e un accento circonflesso in mezzo al nome non nasconde il progetto (M15)', { skip: !WINDOWS }, () => {
  const mondo = { cartella: `C:${BS}T${BS}mondo${BS}progetto`, home: `C:${BS}Users${BS}persona`, piattaforma: 'win32', ambiente: {}, realpathFn: (p) => p };
  const S = '/T/mondo/progetto';
  for (const comando of [`rm -rf ${DOLLARO}D /q/zz/y; D=${S}`, `rm -rf /q/zz/y ${DOLLARO}D; D=${S}`, `rm -rf /q/zz/y; rm -rf "${DOLLARO}D"; export D=${S}`]) {
    assert.equal(cancellazioneCritica(comando, mondo), null, `C10: ${comando}`);
  }
  for (const comando of ['Remove-Item -Recurse -Force /T/mondo/prog^etto', 'rm -rf /T/mon^do/progetto', `r^m -rf ${S}`]) {
    assert.deepEqual(cancellazioneCritica(comando, mondo), { percorso: `C:${BS}T${BS}mondo${BS}progetto`, perche: 'progetto' }, `M15: ${comando}`);
  }
  /* la premessa: senza trucchi il progetto scritto senza disco è critico */
  assert.equal(cancellazioneCritica(`Remove-Item -Recurse -Force ${S}`, mondo)?.perche, 'progetto');
});
