/*
 * Uscita di riparazione (owner 12/11/2026 14:06) — IL DISCO È QUELLO DELLA CARTELLA DELLA SESSIONE, NON QUELLO DEL PROCESSO.
 * Un percorso con la barra in testa e senza disco (`\cartella\file`) chi legge e chi scrive lo apre sul disco della cartella della
 * sessione (`resolve(cartella, percorso)`); il controllo dei permessi lo risolveva sul disco della cartella di lavoro del PROCESSO.
 * Con l'app installata su un disco e il progetto su un altro i due dischi sono diversi: le credenziali di casa si leggevano e si
 * scrivevano senza carta in Accesso pieno, e una cartella bloccata per un dispositivo si leggeva e si scriveva in ogni modo.
 * Come Codex (`codex-rs/utils/absolute-path/src/absolutize.rs`, `windows_root_relative_path_uses_base_prefix`: `\path\to\file` sulla
 * base `C:\base\cwd` è `C:\path\to\file`) e come dice Hermes dei suoi chiamanti (`agent/file_safety.py:384-386`).
 * Fonte: nodejs.org/api/path.html, `path.resolve` («If, after processing all given path segments, an absolute path has not yet been
 * generated, the current working directory is used»; «per-drive working directory»).
 *
 * ⛔ Il disco del processo qui è SIMULATO: `process.cwd` risponde la radice di una lettera che su questa macchina non esiste, ed è
 *   tutto ciò che `path.resolve` guarda. Niente viene scritto fuori dalla cartella temporanea e la prova gira anche con un disco solo.
 *   Col disco vero, nei due versi (processo su C: e progetto su D:, e al contrario), l'hanno misurato le sonde della cura.
 * Tutto finto: casa finta, chiavi finte scritte qui, modello finto in locale, la carta risponde «no». Ogni modo dei permessi ha
 * cartelle NUOVE, e una scrittura conta solo se il contenuto sul disco è cambiato.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { talosLavora, verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs';
import { bloccataDa, comandoNominaUnaBloccata, credenzialeDellaCasaLetta, scritturaDiUnaCredenziale } from '../src/path-policy.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const WINDOWS = process.platform === 'win32';
const SEGNO = 'CHIAVE-FINTA-DEL-DISCO';
const SCRITTO = 'SCRITTO-DALLA-PROVA';
const LIVELLI = ['accesso-pieno', 'scrittura-progetto', 'su-richiesta'];

const radice = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-disco-')));
const prima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
const cwdVera = process.cwd;
/* il disco «del processo»: una lettera diversa da quella dei file finti e che non esiste */
const altroDisco = WINDOWS ? [...'ZYXWVUTSRQPONMLKJIHGFED'].find((l) => l !== radice.slice(0, 1).toUpperCase() && !existsSync(`${l}:\\`)) : null;
if (altroDisco) process.cwd = () => `${altroDisco}:\\`;
test.after(async () => {
  process.cwd = cwdVera;
  if (prima.USERPROFILE === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = prima.USERPROFILE;
  if (prima.HOME === undefined) delete process.env.HOME; else process.env.HOME = prima.HOME;
  await rimuoviCartellaDiProvaAttesa(radice);
});
const SALTA = !WINDOWS || !altroDisco;
const BS = String.fromCharCode(92);

const senzaDisco = (p) => p.slice(2); // `\cartella\…`: la barra in testa, senza la lettera del disco
const dritte = (p) => p.slice(2).replaceAll('\\', '/'); // `/cartella/…`
const contenuto = (p) => { try { return readFileSync(p, 'utf8'); } catch { return null; } };
const SK = ['sk', 'proj', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4'].join('-'); // la FORMA di una chiave, a pezzi: non è una chiave

/** Cartelle finte NUOVE per ogni modo dei permessi: niente di ciò che un altro modo ha scritto può restare. */
function prepara(nome) {
  const base = join(radice, nome);
  const casa = join(base, 'casa');
  const progetto = join(base, 'progetto');
  const bloccataFuori = join(base, 'bloccata');
  const bloccataDentro = join(progetto, 'riservata');
  for (const dir of [join(casa, '.ssh'), progetto, bloccataFuori, bloccataDentro]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(casa, '.ssh', 'id_ed25519'), `${SEGNO} ssh\n`);
  writeFileSync(join(casa, '.npmrc'), `${SEGNO} npmrc\n`);
  writeFileSync(join(bloccataFuori, 'privato.txt'), `${SEGNO} bloccata-fuori\n`);
  writeFileSync(join(bloccataDentro, 'privato.txt'), `${SEGNO} bloccata-dentro\n`);
  writeFileSync(join(progetto, 'nota.txt'), 'una nota qualunque\n');
  process.env.USERPROFILE = casa;
  process.env.HOME = casa;
  return { casa, progetto, bloccataFuori, bloccataDentro };
}

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
    ambienteComandiFn: async () => ({ dove: 'windows', revisione: 0 }), // la shell di Windows, detta dall'ospite: nessuna sonda verso WSL
    ...extra,
  });
  const esito = String((messaggi.at(-1) ?? []).filter((m) => m.role === 'tool').at(-1)?.content ?? '');
  return { chieste, esito };
}

test('DISCO-B0 — la premessa: per `path.resolve` il processo sta su un altro disco, e chi legge e scrive usa quello della sessione', { skip: SALTA }, () => {
  const { progetto } = prepara('premessa');
  assert.equal(resolve('\\cartella\\file').slice(0, 2), `${altroDisco}:`, 'senza la cartella della sessione, il disco è quello del processo');
  assert.equal(resolve(progetto, '\\cartella\\file').slice(0, 2).toUpperCase(), radice.slice(0, 2).toUpperCase(), 'con la cartella della sessione, il suo disco');
});

test('DISCO-B1 — giro vero: leggere una credenziale di casa scritta `\\cartella\\…` chiede in ogni modo, dall\'attrezzo e dalla shell', { skip: SALTA }, async () => {
  for (const livello of LIVELLI) {
    const { casa, progetto } = prepara(`b1-${livello}`);
    const chiave = `${senzaDisco(casa)}\\.ssh\\id_ed25519`;
    for (const chiamata of [{ nome: 'leggi', argomenti: { percorso: chiave } },
      { nome: 'shell', argomenti: { comando: `powershell -NoProfile -NonInteractive -Command "Get-Content ${chiave}"` } }]) {
      const { chieste, esito } = await giro(progetto, livello, chiamata);
      assert.equal(chieste.length, 1, `${livello}, ${chiamata.nome}: una carta`);
      assert.ok(!esito.includes(SEGNO), `${livello}, ${chiamata.nome}: la chiave finta non arriva al modello`);
      if (livello === 'accesso-pieno') assert.equal(chieste[0].segreto?.credenzialeDellaCasa, true, `${chiamata.nome}: la carta dell'Accesso pieno porta il segno`);
    }
  }
});

test('DISCO-B2 — giro vero: scrivere o modificare una credenziale di casa scritta `\\cartella\\…` è VIETATO in ogni modo, senza carta', { skip: SALTA }, async () => {
  for (const livello of LIVELLI) {
    const { casa, progetto } = prepara(`b2-${livello}`);
    const scrivi = await giro(progetto, livello, { nome: 'scrivi', argomenti: { percorso: `${senzaDisco(casa)}\\.ssh\\nuovo.txt`, contenuto: `${SCRITTO}\n` } });
    assert.equal(contenuto(join(casa, '.ssh', 'nuovo.txt')), null, `${livello}: nessun file nuovo in .ssh`);
    assert.equal(scrivi.chieste.length, 0, `${livello}: il divieto non fa carte (una carta insegna a dire sì)`);
    assert.match(scrivi.esito, /login credential/u, `${livello}: il modello riceve il perché`);
    const modifica = await giro(progetto, livello, { nome: 'file_edit', argomenti: { percorso: `${senzaDisco(casa)}\\.npmrc`, vecchio: 'npmrc', nuovo: SCRITTO } });
    assert.equal(contenuto(join(casa, '.npmrc')), `${SEGNO} npmrc\n`, `${livello}: .npmrc non cambia`);
    assert.equal(modifica.chieste.length, 0, `${livello}: il divieto non fa carte`);
    assert.match(modifica.esito, /login credential/u, `${livello}: il modello riceve il perché`);
  }
});

test('DISCO-B3 — giro vero: una cartella bloccata scritta `\\cartella\\…` o `/cartella/…` è RIFIUTATA in ogni modo: mai letta, scritta, cambiata o stampata, e mai una carta', { skip: SALTA }, async () => {
  for (const livello of LIVELLI) {
    const { progetto, bloccataFuori, bloccataDentro } = prepara(`b3-${livello}`);
    const blocchi = { percorsiBloccatiFn: async () => [bloccataFuori, bloccataDentro] };
    for (const [dove, cartella] of [['fuori dal progetto', bloccataFuori], ['dentro il progetto', bloccataDentro]]) {
      const chiamate = [
        { nome: 'leggi', argomenti: { percorso: `${senzaDisco(cartella)}\\privato.txt` } },
        { nome: 'elenca', argomenti: { percorso: senzaDisco(cartella) } },
        { nome: 'scrivi', argomenti: { percorso: `${senzaDisco(cartella)}\\nuovo.txt`, contenuto: `${SCRITTO}\n` } },
        { nome: 'file_edit', argomenti: { percorso: `${senzaDisco(cartella)}\\privato.txt`, vecchio: 'bloccata', nuovo: SCRITTO } },
        { nome: 'shell', argomenti: { comando: `powershell -NoProfile -NonInteractive -Command "Get-Content ${senzaDisco(cartella)}\\privato.txt"` } },
        { nome: 'shell', argomenti: { comando: `powershell -NoProfile -NonInteractive -Command "Get-Content ${dritte(cartella)}/privato.txt"` } },
      ];
      for (const chiamata of chiamate) {
        const { chieste, esito } = await giro(progetto, livello, chiamata, blocchi);
        const caso = `${livello}, ${dove}, ${chiamata.nome} ${chiamata.argomenti.percorso ?? chiamata.argomenti.comando}`;
        assert.equal(chieste.length, 0, `il divieto, non una carta: ${caso}`);
        assert.match(esito, /^REFUSED\./u, `rifiutato: ${caso}`);
        assert.match(esito, /blocked for the device/u, `col perché della cartella bloccata: ${caso}`);
        assert.ok(!esito.includes(SEGNO), `niente del file arriva al modello: ${caso}`);
      }
      assert.equal(contenuto(join(cartella, 'nuovo.txt')), null, `${livello}, ${dove}: nessun file nuovo`);
      assert.match(contenuto(join(cartella, 'privato.txt')), /^CHIAVE-FINTA-DEL-DISCO bloccata-(?:fuori|dentro)\n$/u, `${livello}, ${dove}: il file non è cambiato`);
    }
  }
});

test('DISCO-B4 — AL CONTRARIO: un file qualunque del progetto scritto `\\cartella\\…` si legge e si scrive senza carte in più', { skip: SALTA }, async () => {
  for (const livello of ['accesso-pieno', 'scrittura-progetto']) {
    const { progetto, bloccataFuori, bloccataDentro } = prepara(`b4-${livello}`);
    const blocchi = { percorsiBloccatiFn: async () => [bloccataFuori, bloccataDentro] };
    const letta = await giro(progetto, livello, { nome: 'leggi', argomenti: { percorso: `${senzaDisco(progetto)}\\nota.txt` } }, blocchi);
    assert.equal(letta.chieste.length, 0, `${livello}: nessuna carta per leggere la nota`);
    assert.match(letta.esito, /una nota qualunque/u, `${livello}: la nota si legge`);
    const scritta = await giro(progetto, livello, { nome: 'scrivi', argomenti: { percorso: `${senzaDisco(progetto)}\\nuova-nota.txt`, contenuto: `${SCRITTO}\n` } }, blocchi);
    assert.equal(scritta.chieste.length, 0, `${livello}: nessuna carta per scrivere nel progetto`);
    assert.equal(contenuto(join(progetto, 'nuova-nota.txt')), `${SCRITTO}\n`, `${livello}: il file del progetto si scrive`);
  }
  const { progetto } = prepara('b4-shell');
  const stampata = await giro(progetto, 'accesso-pieno', { nome: 'shell', argomenti: { comando: `powershell -NoProfile -NonInteractive -Command "Get-Content ${senzaDisco(progetto)}\\nota.txt"` } });
  assert.equal(stampata.chieste.length, 0);
  assert.match(stampata.esito, /una nota qualunque/u);
});

test('DISCO-B5 — le funzioni, una per una: il percorso senza disco si risolve sulla cartella della sessione', { skip: SALTA }, () => {
  const { casa, progetto, bloccataFuori } = prepara('b5');
  const chiave = `${senzaDisco(casa)}\\.ssh\\id_ed25519`;
  assert.equal(credenzialeDellaCasaLetta({ tipo: 'leggi', percorso: chiave, cartella: progetto, home: casa })?.credenzialeDellaCasa, true, 'la lettura');
  assert.equal(credenzialeDellaCasaLetta({ tipo: 'shell', comando: `type ${chiave}`, cartella: progetto, home: casa })?.credenzialeDellaCasa, true, 'la shell');
  assert.equal(credenzialeDellaCasaLetta({ tipo: 'shell', comando: `type ${dritte(casa)}/.ssh/id_ed25519`, cartella: progetto, home: casa })?.credenzialeDellaCasa, true, 'la shell, barre dritte');
  assert.ok(scritturaDiUnaCredenziale(`${senzaDisco(casa)}\\.ssh\\nuovo.txt`, { cartella: progetto, home: casa }), 'la scrittura');
  assert.ok(scritturaDiUnaCredenziale(`${dritte(casa)}/.npmrc`, { cartella: progetto, home: casa }), 'la scrittura, barre dritte');
  assert.deepEqual(bloccataDa(`${senzaDisco(bloccataFuori)}\\privato.txt`, { cartella: progetto, bloccati: [bloccataFuori] }), { radice: bloccataFuori }, 'la cartella bloccata');
  assert.deepEqual(comandoNominaUnaBloccata(`type ${senzaDisco(bloccataFuori)}\\privato.txt`, { cartella: progetto, bloccati: [bloccataFuori] }), { radice: bloccataFuori }, 'la cartella bloccata, dalla shell');
  /* al contrario: col disco scritto resta tutto com'era, e un file qualunque non è né credenziale né bloccato */
  assert.equal(credenzialeDellaCasaLetta({ tipo: 'leggi', percorso: join(casa, '.ssh', 'id_ed25519'), cartella: progetto, home: casa })?.credenzialeDellaCasa, true);
  assert.equal(credenzialeDellaCasaLetta({ tipo: 'leggi', percorso: `${senzaDisco(progetto)}\\nota.txt`, cartella: progetto, home: casa }), null);
  assert.equal(scritturaDiUnaCredenziale(`${senzaDisco(progetto)}\\nota.txt`, { cartella: progetto, home: casa }), null);
  assert.equal(bloccataDa(`${senzaDisco(progetto)}\\nota.txt`, { cartella: progetto, bloccati: [bloccataFuori] }), null);
  /* senza la cartella della sessione (il servente della casa Linux, il remoto) vale il percorso assoluto com'è */
  assert.deepEqual(bloccataDa(join(bloccataFuori, 'privato.txt'), { bloccati: [bloccataFuori] }), { radice: bloccataFuori });
  assert.ok(scritturaDiUnaCredenziale(join(casa, '.npmrc'), { home: casa }));
});

test('DISCO-B6 — giro vero: i segreti del progetto dietro un nome innocuo, scritti `\\cartella\\…`: il collegamento, l\'hard link e l\'esempio con una chiave chiedono', { skip: SALTA }, async () => {
  for (const livello of ['scrittura-progetto', 'su-richiesta']) {
    const { progetto } = prepara(`b6-${livello}`);
    const fuori = join(radice, `b6-${livello}`, 'fuori', '.aws');
    mkdirSync(fuori, { recursive: true });
    writeFileSync(join(fuori, 'credentials'), `${SEGNO} aws\n`);
    symlinkSync(fuori, join(progetto, 'dati'), 'junction');
    writeFileSync(join(progetto, '.env'), `TOKEN=${SEGNO}\n`);
    linkSync(join(progetto, '.env'), join(progetto, 'appunti.md'));
    writeFileSync(join(progetto, 'config.example.txt'), `${SEGNO}\nOPENAI_API_KEY=${SK}\n`);
    writeFileSync(join(progetto, 'vuoto.example.txt'), 'OPENAI_API_KEY=\n');
    for (const nome of ['dati\\credentials', 'appunti.md', 'config.example.txt']) {
      const { chieste, esito } = await giro(progetto, livello, { nome: 'leggi', argomenti: { percorso: `${senzaDisco(progetto)}\\${nome}` } });
      assert.equal(chieste.length, 1, `${livello}: una carta per ${nome}`);
      assert.equal(chieste[0].segreto?.classe, 'segreto', `${livello}: la carta del segreto per ${nome}`);
      assert.ok(!esito.includes(SEGNO), `${livello}: il segreto non arriva al modello (${nome})`);
    }
    /* al contrario: un esempio senza chiave e una nota si leggono senza carta */
    for (const nome of ['vuoto.example.txt', 'nota.txt']) {
      const { chieste } = await giro(progetto, livello, { nome: 'leggi', argomenti: { percorso: `${senzaDisco(progetto)}\\${nome}` } });
      assert.equal(chieste.length, 0, `${livello}: nessuna carta per ${nome}`);
    }
  }
});

test('DISCO-B7 — la stessa grafia si guarda anche sul disco della casa e della cartella bloccata: un comando può cambiare disco da sé, e nessuna carta di prima si perde', { skip: SALTA }, async () => {
  const { casa, progetto, bloccataFuori } = prepara('b7');
  const discoDeiFile = radice.slice(0, 1).toUpperCase();
  /* la sessione su un TERZO disco, a parole: né quello del processo né quello della casa e della cartella bloccata */
  const terzo = [...'YXWVUTSRQPONMLKJIHGFED'].find((l) => l !== altroDisco && l !== discoDeiFile);
  const sessione = `${terzo}:${senzaDisco(progetto)}`;
  const chiave = `${senzaDisco(casa)}${BS}.ssh${BS}id_ed25519`;
  const privato = `${senzaDisco(bloccataFuori)}${BS}privato.txt`;
  const cambiaDisco = `cmd /c "${discoDeiFile}: && type ${chiave}"`;
  assert.equal(credenzialeDellaCasaLetta({ tipo: 'shell', comando: cambiaDisco, cartella: sessione, home: casa })?.credenzialeDellaCasa, true, 'la shell che cambia disco');
  assert.equal(credenzialeDellaCasaLetta({ tipo: 'shell', comando: `type ${dritte(casa)}/.ssh/id_ed25519`, cartella: sessione, home: casa })?.credenzialeDellaCasa, true, 'barre dritte');
  assert.deepEqual(comandoNominaUnaBloccata(`cmd /c "${discoDeiFile}: && type ${privato}"`, { cartella: sessione, bloccati: [bloccataFuori] }), { radice: bloccataFuori }, 'la cartella bloccata, dalla shell che cambia disco');
  /* giro 2 (12/11/2026, dopo i revisori): un ATTREZZO dei file apre sul disco della sessione e non cambia disco da sé; lì il disco
     della casa e quello della cartella bloccata non c'entrano (resta il disco del processo, come la 0.2.1: `permessi-disco-del-processo`).
     E una cartella bloccata sul suo disco si guarda solo se il comando NOMINA quel disco: senza, `type \…` resta sul disco della sessione. */
  assert.equal(credenzialeDellaCasaLetta({ tipo: 'leggi', percorso: chiave, cartella: sessione, home: casa }), null, 'la lettura: sul disco della sessione non è la credenziale');
  assert.equal(scritturaDiUnaCredenziale(`${senzaDisco(casa)}${BS}.ssh${BS}nuovo.txt`, { cartella: sessione, home: casa }), null, 'la scrittura: sul disco della sessione non è la credenziale');
  assert.equal(bloccataDa(privato, { cartella: sessione, bloccati: [bloccataFuori] }), null, 'la cartella bloccata: l\'attrezzo apre sul disco della sessione');
  assert.equal(comandoNominaUnaBloccata(`type ${privato}`, { cartella: sessione, bloccati: [bloccataFuori] }), null, 'la cartella bloccata: un comando che non nomina il suo disco');
  /* dal cancello: in Accesso pieno la carta col segno, come prima della cura quando il processo stava sul disco della casa */
  const chieste = [];
  const esito = await verificaPermessoScrittura({ tipo: 'shell', comando: cambiaDisco }, { livelloAccesso: 'accesso-pieno', cartella: sessione, chiediApprovazioneFn: async (a) => { chieste.push(a); return false; } });
  assert.equal(chieste.length, 1);
  assert.equal(chieste[0].segreto?.credenzialeDellaCasa, true);
  assert.equal(esito.consentito, false);
  /* al contrario: la stessa grafia verso un file qualunque non è né credenziale né bloccata */
  const nota = `${senzaDisco(progetto)}${BS}nota.txt`;
  assert.equal(credenzialeDellaCasaLetta({ tipo: 'shell', comando: `cmd /c "${discoDeiFile}: && type ${nota}"`, cartella: sessione, home: casa }), null);
  assert.equal(scritturaDiUnaCredenziale(nota, { cartella: sessione, home: casa }), null);
  assert.equal(bloccataDa(nota, { cartella: sessione, bloccati: [bloccataFuori] }), null);
});

test('DISCO-B8 — un collegamento sul disco della SESSIONE che porta a una credenziale o a una cartella bloccata di un altro disco: scritto senza disco, si segue dalla cartella della sessione', { skip: SALTA }, () => {
  const { progetto } = prepara('b8');
  const ponte = join(progetto, 'ponte'); // la cartella c'è davvero; DOVE porta lo dicono le funzioni finte qui sotto, a parole
  mkdirSync(ponte);
  const discoDeiFile = radice.slice(0, 1).toUpperCase();
  const lontano = [...'YXWVUTSRQPONMLKJIHGFED'].find((l) => l !== altroDisco && l !== discoDeiFile);
  const casaLontana = [`${lontano}:`, 'Z', 'utenti', 'casa-a-parole'].join(BS);
  const bloccataLontana = [`${lontano}:`, 'Z', 'bloccata-a-parole'].join(BS);
  const uguali = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  /* il percorso vero, come lo dà il sistema: il ponte porta dentro la casa lontana (o dentro la bloccata); ogni altro posto è sé stesso */
  const versoLaCasa = (p) => (uguali(p, ponte) ? join(casaLontana, '.ssh') : p);
  const versoLaBloccata = (p) => (uguali(p, ponte) ? bloccataLontana : p);
  const fsFinto = {
    lstatSync: (p) => ({ isSymbolicLink: () => uguali(p, ponte) }),
    readlinkSync: (p) => { assert.ok(uguali(p, ponte)); return join(casaLontana, '.ssh'); },
  };
  const perIlPonte = `${senzaDisco(ponte)}${BS}`;
  assert.equal(credenzialeDellaCasaLetta({ tipo: 'leggi', percorso: `${perIlPonte}id_ed25519`, cartella: progetto, home: casaLontana, fsSync: fsFinto })?.credenzialeDellaCasa, true, 'la lettura attraverso il ponte');
  assert.equal(credenzialeDellaCasaLetta({ tipo: 'shell', comando: `type ${dritte(ponte)}/id_ed25519`, cartella: progetto, home: casaLontana, fsSync: fsFinto })?.credenzialeDellaCasa, true, 'la shell attraverso il ponte');
  assert.deepEqual(scritturaDiUnaCredenziale(`${perIlPonte}nuovo.txt`, { cartella: progetto, home: casaLontana, realpathFn: versoLaCasa }), { percorso: join(casaLontana, '.ssh', 'nuovo.txt') }, 'la scrittura attraverso il ponte');
  assert.deepEqual(bloccataDa(`${perIlPonte}privato.txt`, { cartella: progetto, bloccati: [bloccataLontana], realpathFn: versoLaBloccata }), { radice: bloccataLontana }, 'la cartella bloccata attraverso il ponte');
  assert.deepEqual(comandoNominaUnaBloccata(`type ${dritte(ponte)}/privato.txt`, { cartella: progetto, bloccati: [bloccataLontana], realpathFn: versoLaBloccata }), { radice: bloccataLontana }, 'la cartella bloccata attraverso il ponte, dalla shell');
  /* al contrario: lo stesso giro verso un file del progetto che non passa dal ponte resta libero */
  const nota = `${senzaDisco(progetto)}${BS}nota.txt`;
  assert.equal(credenzialeDellaCasaLetta({ tipo: 'leggi', percorso: nota, cartella: progetto, home: casaLontana, fsSync: fsFinto }), null);
  assert.equal(scritturaDiUnaCredenziale(nota, { cartella: progetto, home: casaLontana, realpathFn: versoLaCasa }), null);
  assert.equal(bloccataDa(nota, { cartella: progetto, bloccati: [bloccataLontana], realpathFn: versoLaBloccata }), null);
});

test('DISCO-B9 — AL CONTRARIO: un percorso RELATIVO resta relativo alla cartella della sessione; non si guarda né sul disco della casa né su quello della cartella bloccata', { skip: SALTA }, () => {
  const { casa, progetto, bloccataFuori } = prepara('b9');
  mkdirSync(join(progetto, '.ssh'));
  writeFileSync(join(progetto, '.ssh', 'id_ed25519'), 'una chiave finta del progetto\n');
  writeFileSync(join(progetto, 'privato.txt'), 'un file del progetto col nome di quello bloccato\n');
  for (const relativo of ['.ssh/id_ed25519', `.ssh${BS}id_ed25519`, './.ssh/id_ed25519']) {
    assert.equal(credenzialeDellaCasaLetta({ tipo: 'leggi', percorso: relativo, cartella: progetto, home: casa }), null, `non è la credenziale della casa: leggi ${relativo}`);
    assert.equal(credenzialeDellaCasaLetta({ tipo: 'shell', comando: `type ${relativo}`, cartella: progetto, home: casa }), null, `non è la credenziale della casa: type ${relativo}`);
  }
  for (const relativo of ['.ssh/nuovo.txt', `.ssh${BS}nuovo.txt`, '.npmrc']) {
    assert.equal(scritturaDiUnaCredenziale(relativo, { cartella: progetto, home: casa }), null, `non è una scrittura nella casa: ${relativo}`);
  }
  for (const relativo of ['privato.txt', './privato.txt', 'nota.txt']) {
    assert.equal(bloccataDa(relativo, { cartella: progetto, bloccati: [bloccataFuori] }), null, `non è nella cartella bloccata: ${relativo}`);
    assert.equal(comandoNominaUnaBloccata(`type ${relativo}`, { cartella: progetto, bloccati: [bloccataFuori] }), null, `non nomina la cartella bloccata: type ${relativo}`);
  }
});
