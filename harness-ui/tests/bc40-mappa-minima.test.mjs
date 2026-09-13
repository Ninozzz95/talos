/**
 * BC-40 — LA MAPPA DEL PROGETTO SI FERMA AI PRIMI LIVELLI, E LO DICE.
 *
 * Owner 12/09/2026, dopo la lentezza del primo messaggio: «ci deve essere un metodo migliore,
 * magari mettere il preambolo come tool o qualcosa del genere». Il TEMPO era già stato curato
 * (`TEMPO_MASSIMO_MAPPA_MS`, 12/09); qui si curano i TOKEN e la FORMA.
 *
 * ⛔⛔⛔ IL RISCHIO CHE QUESTE PROVE ESISTONO PER CHIUDERE — e non è ipotetico: un modello che
 *   vede meno non tace, SPIEGA. Alla domanda «quanti file .mjs ci sono in harness-ui/src?»
 *   TALOS rispose «0 — la cartella `harness-ui/src` non esiste», con otto giri e sei ricerche
 *   dietro. Sono 104 ([[un-modello-che-non-vede-non-tace-spiega]]).
 *   ⇒ Una mappa ridotta è accettabile SOLO se (a) dichiara di essere ridotta, (b) dice fin dove
 *     è vera, (c) nomina l'attrezzo con cui si scende. Ognuna delle tre ha la sua prova, e
 *     ognuna ha la gemella AL CONTRARIO — perché una mappa che dichiara sempre «ridotta»
 *     supererebbe la prima metà da sola, esattamente come il cancello semantico inerte del 27/8
 *     ([[il-cancello-semantico-era-spento-da-sempre]]).
 */

import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import {
  costruisciMappaCartelle,
  testoMappaCartelle,
  mappaEntroIlTetto,
  PROFONDITA_MAPPA_PREDEFINITA,
  TETTO_TOKEN_MAPPA_PREDEFINITO,
} from '../src/mappa-cartelle.mjs';
import { contestoDelProgetto } from '../src/contesto-del-progetto.mjs';
import { elencaDaCartella } from '../src/kernel/talosHarness.mjs';

/** Un progetto vero su disco: `costruisciMappaCartelle` cammina il filesystem, non un doppio. */
async function progettoFinto(file) {
  const base = await mkdtemp(join(tmpdir(), 'bc40-'));
  for (const [percorso, contenuto] of Object.entries(file)) {
    const pieno = join(base, percorso);
    await mkdir(dirname(pieno), { recursive: true });
    await writeFile(pieno, contenuto);
  }
  return base;
}

const gitFinto = async () => ({ codice: 1, uscita: '', errore: '' });

/** Un albero profondo quattro, per vedere la differenza fra «fin qui» e «tutto». */
const ALBERO_PROFONDO = {
  'src/uno.mjs': 'a',
  'src/kernel/due.mjs': 'b',
  'src/kernel/motore/tre.mjs': 'c',
  'src/kernel/motore/giu/quattro.mjs': 'd',
  'tests/cinque.test.mjs': 'e',
};

// ─────────────────────────────────────────────────────────────────────────────────────────────
// (a) LA MAPPA RIDOTTA DICHIARA DI ESSERLO
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('BC-40: la profondità predefinita è 2, e non si scopre leggendo il codice', () => {
  assert.equal(PROFONDITA_MAPPA_PREDEFINITA, 2,
    '⛔ se questo cambia, cambiano i token di OGNI primo messaggio: si misura prima');
});

test('BC-40: una mappa che si ferma in profondità lo DICHIARA, e non si dice completa', async () => {
  const base = await progettoFinto(ALBERO_PROFONDO);
  try {
    const mappa = await costruisciMappaCartelle({ radice: base });
    assert.equal(mappa.fermatoInProfondita, true, '⛔ sotto `src/kernel` c’è altro: va registrato');
    assert.equal(mappa.troncato, false, '⛔ nessun tetto ha morso: `troncato` è un’ALTRA cosa');
    assert.equal(mappa.profonditaRaggiunta, 2);

    const testo = testoMappaCartelle(mappa, { radice: base });
    assert.match(testo, /MAPPA INCOMPLETA PER SCELTA/);
    assert.ok(!testo.includes('albero COMPLETO'),
      '⛔ una mappa che si ferma a 2 su un albero profondo 4 NON è completa');
    assert.match(testo, /primi 2 livelli/, '⛔ deve dire FIN DOVE è vera, non solo che è tagliata');
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('BC-40: il testo nomina gli attrezzi con cui si scende, e la forma esatta di `elenca`', async () => {
  const base = await progettoFinto(ALBERO_PROFONDO);
  try {
    const mappa = await costruisciMappaCartelle({ radice: base });
    const testo = testoMappaCartelle(mappa, { radice: base });
    assert.match(testo, /`cerca`/, '⛔ senza il nome dell’attrezzo il modello non sa cosa chiamare');
    assert.match(testo, /`elenca`|elenca \{/, '⛔ idem per `elenca`');
    assert.ok(testo.includes('"percorso"'),
      '⛔ dire «usa elenca» senza mostrare l’argomento è la promessa che fino a BC-40 era FALSA');
    /* ⛔ Il promemoria che conta sta in FONDO, dopo l’elenco: è dove il modello guarda per ultimo
       prima di rispondere ([[il-promemoria-dove-guarda-per-ultimo]]). */
    const coda = testo.slice(testo.lastIndexOf('\n', testo.length - 2));
    assert.match(coda, /non vuol dire che non esista/i,
      '⛔ la riga che impedisce «la cartella non esiste» deve essere l’ULTIMA, non la prima');
  } finally { await rm(base, { recursive: true, force: true }); }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// (b) AL CONTRARIO: chi NON è ridotta non lo dice
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('BC-40, AL CONTRARIO: un albero che finisce entro i 2 livelli si dichiara COMPLETO', async () => {
  const base = await progettoFinto({ 'src/uno.mjs': 'a', 'src/kernel/due.mjs': 'b', 'tests/tre.mjs': 'c' });
  try {
    const mappa = await costruisciMappaCartelle({ radice: base });
    assert.equal(mappa.fermatoInProfondita, false,
      '⛔ nessuna cartella è rimasta fuori: dichiarare una riduzione che non c’è è una bugia uguale e contraria');
    const testo = testoMappaCartelle(mappa, { radice: base });
    assert.match(testo, /albero COMPLETO/);
    assert.ok(!testo.includes('INCOMPLETA'));
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('BC-40, AL CONTRARIO: una cartella vuota al secondo livello NON conta come «c’è altro sotto»', async () => {
  /* Una cartella senza figli sta tutta nella mappa: se `fermatoInProfondita` scattasse qui,
     scatterebbe SEMPRE, e una bandiera sempre accesa non informa di niente. */
  const base = await progettoFinto({ 'src/uno.mjs': 'a' });
  await mkdir(join(base, 'src', 'vuota'), { recursive: true });
  try {
    const mappa = await costruisciMappaCartelle({ radice: base });
    assert.deepEqual(mappa.cartelle.map((c) => c.percorso), ['src', 'src/vuota']);
    assert.equal(mappa.fermatoInProfondita, false);
    assert.match(testoMappaCartelle(mappa, { radice: base }), /albero COMPLETO/);
  } finally { await rm(base, { recursive: true, force: true }); }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// (c) LA PROFONDITÀ PIENA NON È SPARITA: È UN PARAMETRO
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('BC-40: la profondità piena resta disponibile via parametro, e allora non c’è niente da dichiarare', async () => {
  const base = await progettoFinto(ALBERO_PROFONDO);
  try {
    const piena = await costruisciMappaCartelle({ radice: base, profonditaMax: 8 });
    assert.equal(piena.profonditaRaggiunta, 4);
    assert.equal(piena.fermatoInProfondita, false, '⛔ a profondità 8 l’albero ci sta tutto');
    assert.match(testoMappaCartelle(piena, { radice: base }), /albero COMPLETO/);
    assert.deepEqual(
      piena.cartelle.map((c) => c.percorso),
      ['src', 'src/kernel', 'src/kernel/motore', 'src/kernel/motore/giu', 'tests'],
    );
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('BC-40: il tetto di TOKEN che taglia in profondità finisce nello stesso campo, non in `troncato`', async () => {
  const albero = {};
  for (let a = 0; a < 8; a += 1) for (let b = 0; b < 8; b += 1) albero[`liv1-${a}/liv2-${b}/f`] = '';
  const base = await progettoFinto(albero);
  try {
    const mappa = await costruisciMappaCartelle({ radice: base });
    assert.equal(mappa.troncato, false);
    const stretta = mappaEntroIlTetto(mappa, { radice: base, tettoToken: 120 });
    assert.equal(stretta.profonditaUsata, 1, '⛔ il tetto deve mordere');
    assert.equal(stretta.tagliataInProfondita, true);
    assert.match(stretta.testo, /MAPPA INCOMPLETA PER SCELTA/,
      '⛔ per chi legge, «ho scelto di fermarmi» e «il tetto mi ha fermato» sono la stessa cosa: sotto c’è altro');
    assert.ok(!stretta.testo.includes('albero COMPLETO'));
  } finally { await rm(base, { recursive: true, force: true }); }
});

test('BC-40: il tetto predefinito è 1.200 token, e la mappa dei tre spazi veri ci sta sotto', () => {
  assert.equal(TETTO_TOKEN_MAPPA_PREDEFINITO, 1200,
    '⛔ misurato 12/09 a profondità 2: harness-ui/ 327, AVM-harness-desktop 923, Desktop 939');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// (d) IL CONTRATTO VERSO IL PREAMBOLO: additivo, mai sostitutivo
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('BC-40: `blocchi.mappa` dice che è ridotta SENZA togliere niente a chi leggeva prima', async () => {
  const base = await progettoFinto({ ...ALBERO_PROFONDO, 'AGENTS.md': 'regole' });
  try {
    const preambolo = await contestoDelProgetto({ cartella: base, deps: { eseguiGit: gitFinto } });
    const m = preambolo.blocchi.mappa;
    assert.equal(m.ridottaPerDisegno, true, '⛔ il campo nuovo');
    /* ⛔ I campi di prima devono dire ESATTAMENTE quello che dicevano: `troncata` false (nessun
       tetto ha morso) e `tagliataInProfondita` false (il tetto di token non c’entra). */
    assert.equal(m.troncata, false);
    assert.equal(m.tagliataInProfondita, false);
    assert.equal(m.profondita, 2);
    assert.equal(m.profonditaPiena, 2);
    assert.equal(typeof m.token, 'number');
    assert.ok(!preambolo.testo.includes(base), '⛔ mai il percorso assoluto della persona nel prompt');
  } finally { await rm(base, { recursive: true, force: true }); }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// (e) `elenca` SA SCENDERE — altrimenti la mappa ridotta promette una cosa che non esiste
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Lo stesso doppio di `tests/cerca-kernel.test.mjs`: `elenca(dentro)` → `{nome, cartella, byte}`. */
function discoFinto(file, { illeggibili = [] } = {}) {
  const percorsi = Object.keys(file);
  return {
    async elenca(dentro = '') {
      if (illeggibili.includes(dentro)) throw new Error('EACCES');
      const prefisso = dentro ? `${dentro}/` : '';
      if (dentro && !percorsi.some((p) => p.startsWith(prefisso))) throw new Error('ENOENT');
      const visti = new Map();
      for (const p of percorsi) {
        if (dentro && !p.startsWith(prefisso)) continue;
        const resto = p.slice(prefisso.length);
        const taglio = resto.indexOf('/');
        if (taglio === -1) visti.set(resto, { nome: resto, cartella: false, byte: file[p].length });
        else {
          const nome = resto.slice(0, taglio);
          if (!visti.has(nome)) visti.set(nome, { nome, cartella: true, byte: 0 });
        }
      }
      return [...visti.values()];
    },
  };
}

const PROGETTO = {
  'package.json': '{}',
  'src/uno.mjs': 'a',
  'src/kernel/due.mjs': 'b',
  'src/kernel/motore/tre.mjs': 'c',
  'tests/quattro.test.mjs': 'd',
};

test('BC-40: `elenca` senza percorso è IDENTICO a com’era — il banco confronta byte per byte', async () => {
  const disco = discoFinto(PROGETTO);
  /* ⛔ L'atteso è ricalcolato a mano dalla forma VECCHIA del ramo (file della radice, poi i figli
     delle sue cartelle), non copiato dall'uscita nuova: un atteso preso dall'uscita proverebbe
     solo che la funzione è uguale a sé stessa ([[andata-ritorno-non-prova-compatibilita]]). */
  assert.equal(
    await elencaDaCartella(disco, ''),
    ['package.json', 'src/uno.mjs', 'src/kernel', 'tests/quattro.test.mjs'].join('\n'),
  );
});

test('BC-40: `elenca` con `percorso` apre UNA cartella, e i percorsi restano relativi alla RADICE', async () => {
  const disco = discoFinto(PROGETTO);
  const esito = await elencaDaCartella(disco, 'src');
  assert.equal(esito, ['src/uno.mjs', 'src/kernel/due.mjs', 'src/kernel/motore'].join('\n'));
  assert.ok(!esito.split('\n').some((r) => r.startsWith('kernel/')),
    '⛔ un percorso relativo alla cartella aperta il modello lo passerebbe a `leggi` così com’è, e fallirebbe');
});

test('BC-40, AL CONTRARIO: una cartella che non c’è NON porta il percorso assoluto nel messaggio', async () => {
  const disco = discoFinto(PROGETTO);
  const esito = await elencaDaCartella(disco, 'inventata');
  assert.match(esito, /not a readable folder/);
  assert.match(esito, /cerca/, '⛔ un errore deve dire cosa fare dopo, non solo che è andata male');
  assert.ok(!/[A-Za-z]:[\\/]/.test(esito),
    '⛔ [[cancello-4-non-guardava-tutto-mobile]]: il catch generico stampava `scandir C:\\Users\\<nome>\\…`');
});

test('BC-40, AL CONTRARIO: una sottocartella illeggibile non fa sparire tutto l’elenco', async () => {
  const disco = discoFinto(PROGETTO, { illeggibili: ['src/kernel'] });
  const esito = await elencaDaCartella(disco, 'src');
  assert.equal(esito, ['src/uno.mjs'].join('\n'));
  assert.ok(!esito.includes('src/kernel/'), 'la sottocartella cieca sparisce, il resto resta');
});

test('BC-40, AL CONTRARIO: `elenca` non è un modo per uscire dal workspace', async () => {
  /* La guardia sta nel ramo dell'attrezzo (`RISALITA`), non qui: questa prova fissa la REGOLA —
     se un domani la si sposta, si sposta anche la prova, ma non si perde. */
  const risalita = /(^|[\\/])\.\.([\\/]|$)/;
  for (const cattivo of ['..', '../fuori', 'src/../..', 'src\\..\\..']) {
    assert.ok(risalita.test(cattivo), `⛔ "${cattivo}" deve essere riconosciuto come risalita`);
  }
  for (const buono of ['', 'src', 'src/kernel', 'a..b', 'src/..nascosto']) {
    assert.ok(!risalita.test(buono), `⛔ "${buono}" è un percorso legittimo e non va rifiutato`);
  }
});
