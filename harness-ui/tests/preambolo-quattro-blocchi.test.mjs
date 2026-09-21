import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  contestoDelProgetto,
  aggiornamentoInCoda,
  preamboloVistoDa,
  segnalaFileCambiati,
  dimenticaTuttiGliElenchi,
  INIZIO_SCHEDA,
  INIZIO_AGGIORNAMENTO,
} from '../src/contesto-del-progetto.mjs';
import { costruisciMappaCartelle, testoMappaCartelle, mappaEntroIlTetto, TETTO_TOKEN_MAPPA_PREDEFINITO } from '../src/mappa-cartelle.mjs';
import {
  trovaIstruzioniDiProgetto,
  testoIstruzioniDiProgetto,
  tagliaIstruzioni,
  TETTO_BYTE_PREDEFINITO,
} from '../src/istruzioni-di-progetto.mjs';
import { creaFiltroGitignore } from '../src/gitignore-elenco.mjs';
import { fattiDelProgetto, testoSchedaDiLavoro } from '../src/scheda-di-lavoro.mjs';
import { conMarcatoreDiCache, CARATTERI_MINIMI_PER_CACHE } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * ⛔⛔⛔ BC-07 — IL PREAMBOLO A QUATTRO BLOCCHI.
 *
 * La prova che conta più di tutte le altre in questo file è la PRIMA: **due giri di fila devono
 * ricevere la stessa identica stringa, byte per byte**. È la condizione della cache, non un
 * dettaglio: Claude Platform Docs, «Prompt caching» (letto 11/09/2026) — *«Cache hits require 100%
 * identical prompt segments»*, e la lookup lavora sul **prefisso intero** fino al breakpoint.
 *
 * Le altre provano il VERSO CONTRARIO, che è la regola di casa
 * ([[provare-sempre-anche-il-verso-contrario]]): un `AGENTS.md` enorme, un `.gitignore` che deve
 * mordere, una cartella senza istruzioni, un errore di contratto che NON si deve degradare.
 */

/** Un progetto vero su disco: le prove del preambolo camminano un albero, non un finto. */
async function progettoFinto(contenuti) {
  const base = await mkdtemp(join(tmpdir(), 'talos-preambolo-'));
  for (const [percorso, contenuto] of Object.entries(contenuti)) {
    const pieno = join(base, percorso);
    await mkdir(join(pieno, '..'), { recursive: true });
    await writeFile(pieno, contenuto, 'utf8');
  }
  return base;
}

const filtroDa = async (radice) => {
  const regole = await creaFiltroGitignore({ radice });
  return (percorso, forma) => regole(percorso, typeof forma === 'object' && forma !== null ? Boolean(forma.cartella) : Boolean(forma));
};

/* Git non deve girare nelle prove: è lento, e soprattutto il suo esito cambia fra una prova e
   l'altra — cioè romperebbe proprio la stabilità che stiamo provando. Si inietta un esecutore
   deterministico, che è anche il modo di provare che `statoVolatile` fa quello che dice. */
const gitFinto = async (argomenti) => {
  if (argomenti[0] === 'rev-parse' && argomenti[1] === '--is-inside-work-tree') return 'true\n';
  if (argomenti[0] === 'rev-parse') return 'ramo-di-prova\n';
  if (argomenti[0] === 'status') return ' M uno.mjs\n';
  if (argomenti[0] === 'log') return 'abc1234 un commit di prova\n';
  return null;
};

test.beforeEach(() => { dimenticaTuttiGliElenchi(); });

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LA PROVA CHE CONTA: il prefisso è byte-identico, e cambia solo quando cambia davvero qualcosa
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('BC-07: due messaggi consecutivi della stessa sessione ricevono il preambolo BYTE-IDENTICO', async () => {
  const base = await progettoFinto({ 'AGENTS.md': '# Regole\nUsa npm test.\n', 'src/uno.mjs': '', 'src/giu/due.mjs': '' });
  try {
    const opzioni = { cartella: base, permesso: 'scrittura', modello: 'glm-5.3-flash', deps: { eseguiGit: gitFinto } };
    const primo = await contestoDelProgetto(opzioni);
    const secondo = await contestoDelProgetto(opzioni);
    assert.ok(primo && secondo);
    assert.equal(secondo.riusato, true, 'il secondo giro deve RIUSARE, non ricostruire');
    assert.equal(
      Buffer.compare(Buffer.from(primo.testo, 'utf8'), Buffer.from(secondo.testo, 'utf8')),
      0,
      '⛔ un solo byte di differenza azzera la cache del fornitore da lì in poi',
    );
  } finally { await rimuoviCartellaDiProvaAttesa(base); }
});

test('BC-07: il preambolo cambia quando cambia il PERMESSO, e solo per quello', async () => {
  const base = await progettoFinto({ 'src/uno.mjs': '' });
  try {
    const comuni = { cartella: base, modello: 'glm-5.3-flash', deps: { eseguiGit: gitFinto } };
    const lettura = await contestoDelProgetto({ ...comuni, permesso: 'sola lettura' });
    const scrittura = await contestoDelProgetto({ ...comuni, permesso: 'scrittura' });
    assert.notEqual(lettura.testo, scrittura.testo);
    assert.ok(lettura.testo.includes('sola lettura'));
    assert.ok(scrittura.testo.includes('scrittura'));
    /* ⛔ E devono essere DUE voci di cache, non una che si sovrascrive: se si sovrascrivessero,
       due sessioni con permessi diversi sulla stessa cartella si ruberebbero il preambolo. */
    const ancoraLettura = await contestoDelProgetto({ ...comuni, permesso: 'sola lettura' });
    assert.equal(ancoraLettura.testo, lettura.testo);
    assert.equal(ancoraLettura.riusato, true);
  } finally { await rimuoviCartellaDiProvaAttesa(base); }
});

test('BC-07: il preambolo cambia quando cambia il MODELLO', async () => {
  const base = await progettoFinto({ 'src/uno.mjs': '' });
  try {
    const comuni = { cartella: base, permesso: 'scrittura', deps: { eseguiGit: gitFinto } };
    const a = await contestoDelProgetto({ ...comuni, modello: 'glm-5.3-flash' });
    const b = await contestoDelProgetto({ ...comuni, modello: 'qwen3.7-flash' });
    assert.notEqual(a.testo, b.testo);
    assert.ok(a.testo.includes('glm-5.3-flash'));
    assert.ok(b.testo.includes('qwen3.7-flash'));
  } finally { await rimuoviCartellaDiProvaAttesa(base); }
});

test('BC-07: due CARTELLE diverse hanno due preamboli diversi, e non si scambiano', async () => {
  const uno = await progettoFinto({ 'src/uno.mjs': '' });
  const due = await progettoFinto({ 'lib/due.mjs': '' });
  try {
    const a = await contestoDelProgetto({ cartella: uno, deps: { eseguiGit: gitFinto } });
    const b = await contestoDelProgetto({ cartella: due, deps: { eseguiGit: gitFinto } });
    assert.ok(a.testo.includes('src/'));
    assert.ok(b.testo.includes('lib/'));
    const ancoraA = await contestoDelProgetto({ cartella: uno, deps: { eseguiGit: gitFinto } });
    assert.equal(ancoraA.testo, a.testo);
  } finally { await rimuoviCartellaDiProvaAttesa(uno); await rimuoviCartellaDiProvaAttesa(due); }
});

test('BC-07: quando i file cambiano davvero, il preambolo si rifà — per TUTTI i permessi', async () => {
  const base = await progettoFinto({ 'src/uno.mjs': '' });
  try {
    await contestoDelProgetto({ cartella: base, permesso: 'lettura', deps: { eseguiGit: gitFinto } });
    await contestoDelProgetto({ cartella: base, permesso: 'scrittura', deps: { eseguiGit: gitFinto } });
    assert.equal(segnalaFileCambiati(base), true);
    const dopo = await contestoDelProgetto({ cartella: base, permesso: 'lettura', deps: { eseguiGit: gitFinto } });
    assert.equal(dopo.riusato, false, '⛔ una sola chiave invalidata lascerebbe l’altro permesso con una mappa vecchia');
  } finally { await rimuoviCartellaDiProvaAttesa(base); }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// BLOCCO 3 — le istruzioni di progetto: il tetto, il taglio, e l'assenza
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('BC48-A-BC07: un AGENTS.md da 200 KB senza sezioni è omesso intero e dichiarato', async () => {
  const enorme = `# Inizio riconoscibile\n${'riga di riempimento che serve solo a fare volume\n'.repeat(4500)}# Fine riconoscibile\n`;
  assert.ok(Buffer.byteLength(enorme, 'utf8') > 200_000, `il file di prova deve superare i 200 KB (è ${Buffer.byteLength(enorme, 'utf8')})`);
  const base = await progettoFinto({ 'AGENTS.md': enorme, 'src/uno.mjs': '' });
  try {
    const trovati = await trovaIstruzioniDiProgetto(base);
    const esito = testoIstruzioniDiProgetto(trovati, { tetto: TETTO_BYTE_PREDEFINITO });
    assert.ok(esito, 'un file enorme non deve far sparire il blocco');
    assert.ok(esito.byte <= TETTO_BYTE_PREDEFINITO, `⛔ il tetto è una promessa: ${esito.byte} byte contro ${TETTO_BYTE_PREDEFINITO}`);
    assert.deepEqual(esito.tagliati, []);
    assert.deepEqual(esito.omessi, ['AGENTS.md']);
    assert.match(esito.testo, /⚠ Tetto delle istruzioni/);
    assert.match(esito.testo, /leggile con `leggi`/);
    assert.ok(!esito.testo.includes('# Inizio riconoscibile'), 'nessuna testa isolata');
    assert.ok(!esito.testo.includes('# Fine riconoscibile'), 'nessuna coda isolata');
  } finally { await rimuoviCartellaDiProvaAttesa(base); }
});

test('BC-07, AL CONTRARIO: una cartella SENZA AGENTS.md/CLAUDE.md non ha il blocco 3, e nessun errore', async () => {
  const base = await progettoFinto({ 'src/uno.mjs': '', 'README.txt': 'niente istruzioni qui' });
  try {
    const trovati = await trovaIstruzioniDiProgetto(base);
    assert.deepEqual(trovati, []);
    assert.equal(testoIstruzioniDiProgetto(trovati), null, '⛔ nessuna intestazione vuota: zero byte');
    const preambolo = await contestoDelProgetto({ cartella: base, deps: { eseguiGit: gitFinto } });
    assert.ok(preambolo, 'il preambolo esiste lo stesso: scheda + mappa');
    assert.equal(preambolo.blocchi.istruzioni, null);
    assert.ok(!preambolo.testo.includes('Istruzioni di questo progetto'));
  } finally { await rimuoviCartellaDiProvaAttesa(base); }
});

test('BC-07: la catena va dal PIÙ GENERICO al PIÙ SPECIFICO, e un solo file per cartella', async () => {
  const base = await progettoFinto({
    '.git': '', // un worktree ha `.git` FILE, non directory: la radice si riconosce lo stesso
    'AGENTS.md': 'REGOLA DELLA RADICE',
    'CLAUDE.md': 'QUESTA NON DEVE ENTRARE: nella stessa cartella vince AGENTS.md',
    'pacchetto/AGENTS.md': 'REGOLA DEL PACCHETTO',
    'pacchetto/src/uno.mjs': '',
  });
  try {
    const trovati = await trovaIstruzioniDiProgetto(join(base, 'pacchetto'));
    assert.deepEqual(trovati.map((f) => f.etichetta), ['AGENTS.md', 'pacchetto/AGENTS.md']);
    const esito = testoIstruzioniDiProgetto(trovati);
    assert.ok(esito.testo.indexOf('REGOLA DELLA RADICE') < esito.testo.indexOf('REGOLA DEL PACCHETTO'), 'l’ultimo è quello che comanda');
    assert.ok(!esito.testo.includes('QUESTA NON DEVE ENTRARE'));
  } finally { await rimuoviCartellaDiProvaAttesa(base); }
});

test('BC-07, AL CONTRARIO: quando il tetto morde si tolgono INTERI i file generici, e si dice QUALI', async () => {
  const grosso = 'x'.repeat(9_000);
  const base = await progettoFinto({
    '.git': '',
    'AGENTS.md': `GENERICO ${grosso}`,
    'pacchetto/AGENTS.md': `SPECIFICO ${grosso}`,
    'pacchetto/uno.mjs': '',
  });
  try {
    const trovati = await trovaIstruzioniDiProgetto(join(base, 'pacchetto'));
    const esito = testoIstruzioniDiProgetto(trovati, { tetto: 10_000 });
    assert.deepEqual(esito.usati, ['pacchetto/AGENTS.md'], '⛔ sopravvive il più VICINO al lavoro');
    assert.deepEqual(esito.omessi, ['AGENTS.md']);
    assert.match(esito.testo, /NON ti ho mostrato `AGENTS\.md`/, '⛔ un avviso che non dice CHE COSA manca non è azionabile');
    assert.ok(esito.byte <= 10_000);
  } finally { await rimuoviCartellaDiProvaAttesa(base); }
});

test('BC-07: `tagliaIstruzioni` non tocca un file che sta sotto il tetto', () => {
  const corto = 'due righe\nsoltanto\n';
  const esito = tagliaIstruzioni(corto, 24_000, 'AGENTS.md');
  assert.equal(esito.tagliato, false);
  assert.equal(esito.testo, corto, '⛔ nessun marcatore su un file che non è stato tagliato');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// BLOCCO 4 — la mappa delle cartelle: il .gitignore, la completezza, l'onestà del troncamento
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('BC-07: la mappa RISPETTA il .gitignore — sull\'albero vero, non su una fixture', async () => {
  const base = await progettoFinto({
    '.gitignore': 'esiti/\n*.log\n',
    'src/uno.mjs': '',
    'src/giu/due.mjs': '',
    'esiti/tanti/uno.json': '',
    'rumore.log': '',
  });
  try {
    const mappa = await costruisciMappaCartelle({ radice: base, filtro: await filtroDa(base) });
    const percorsi = mappa.cartelle.map((c) => c.percorso);
    assert.ok(percorsi.includes('src'));
    assert.ok(percorsi.includes('src/giu'));
    assert.ok(!percorsi.includes('esiti'), '⛔ una cartella ignorata non si apre nemmeno');
    assert.ok(!percorsi.includes('esiti/tanti'));
    /* ⛔ Il conteggio dei file passa dallo STESSO filtro: `rumore.log` non deve contare, o il
       numero fra parentesi non combacerebbe con quello che il modello trova cercando. */
    assert.equal(mappa.radiceFile, 1, 'solo .gitignore; rumore.log è ignorato');
  } finally { await rimuoviCartellaDiProvaAttesa(base); }
});

test('BC-07, AL CONTRARIO: senza filtro il .gitignore NON morde — la prova che il filtro serve davvero', async () => {
  const base = await progettoFinto({ '.gitignore': 'esiti/\n', 'src/uno.mjs': '', 'esiti/tanti/uno.json': '' });
  try {
    const senza = await costruisciMappaCartelle({ radice: base });
    assert.ok(senza.cartelle.map((c) => c.percorso).includes('esiti'), 'senza filtro si vede tutto');
    const con = await costruisciMappaCartelle({ radice: base, filtro: await filtroDa(base) });
    assert.ok(!con.cartelle.map((c) => c.percorso).includes('esiti'));
  } finally { await rimuoviCartellaDiProvaAttesa(base); }
});

test('BC-07: l\'ordine della mappa è deterministico, e un genitore precede sempre i suoi figli', async () => {
  const base = await progettoFinto({ 'b/x/uno': '', 'a/due': '', 'b/tre': '', 'a/z/quattro': '' });
  try {
    const primo = await costruisciMappaCartelle({ radice: base });
    const secondo = await costruisciMappaCartelle({ radice: base });
    assert.deepEqual(primo.cartelle.map((c) => c.percorso), secondo.cartelle.map((c) => c.percorso));
    assert.deepEqual(primo.cartelle.map((c) => c.percorso), ['a', 'a/z', 'b', 'b/x']);
  } finally { await rimuoviCartellaDiProvaAttesa(base); }
});

test('BC-07, AL CONTRARIO: se il tetto sulle cartelle morde, il testo lo DICHIARA in testa e in coda', async () => {
  const albero = {};
  for (let i = 0; i < 40; i += 1) albero[`c${String(i).padStart(2, '0')}/f`] = '';
  const base = await progettoFinto(albero);
  try {
    const mappa = await costruisciMappaCartelle({ radice: base, tettoCartelle: 10 });
    assert.equal(mappa.troncato, true);
    const testo = testoMappaCartelle(mappa, { radice: base });
    assert.match(testo, /MAPPA INCOMPLETA/);
    assert.match(testo, /Fine di una mappa INCOMPLETA/);
    assert.ok(!testo.includes('albero COMPLETO'), '⛔ una mappa tagliata non può dirsi completa');
  } finally { await rimuoviCartellaDiProvaAttesa(base); }
});

test('BC-07: una mappa completa lo dichiara, e non porta nessun avviso', async () => {
  const base = await progettoFinto({ 'src/uno.mjs': '' });
  try {
    const mappa = await costruisciMappaCartelle({ radice: base });
    const testo = testoMappaCartelle(mappa, { radice: base });
    assert.match(testo, /albero COMPLETO/);
    assert.ok(!testo.includes('INCOMPLETA'));
  } finally { await rimuoviCartellaDiProvaAttesa(base); }
});

test('BC-07: nel testo non finisce MAI il percorso assoluto della persona', async () => {
  const base = await progettoFinto({ 'AGENTS.md': 'regole', 'src/uno.mjs': '' });
  try {
    const preambolo = await contestoDelProgetto({ cartella: base, deps: { eseguiGit: gitFinto } });
    assert.ok(!preambolo.testo.includes(base), `⛔ [[cancello-4-non-guardava-tutto-mobile]]: un percorso assoluto porta fuori il nome della persona`);
    assert.ok(!preambolo.testo.includes(tmpdir()));
  } finally { await rimuoviCartellaDiProvaAttesa(base); }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// IL CONTESTO CHE SI APPENDE
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('BC-07: su una sessione FRESCA non si appende niente — il preambolo è già in testa', () => {
  assert.equal(aggiornamentoInCoda({ storia: [], testo: `${INIZIO_SCHEDA}x` }), null);
  assert.equal(aggiornamentoInCoda({ storia: [{ role: 'user', content: 'ciao' }], testo: `${INIZIO_SCHEDA}x` }), null);
});

test('BC-07: se il preambolo NON è cambiato, in coda non va niente (zero token)', () => {
  const testo = `${INIZIO_SCHEDA}Cartella: «x».`;
  const storia = [{ role: 'system', content: 'istruzioni' }, { role: 'system', content: testo }, { role: 'user', content: 'ciao' }];
  assert.equal(aggiornamentoInCoda({ storia, testo }), null);
});

test('BC-07: se il preambolo È cambiato, si APPENDE dichiarando che sostituisce', () => {
  const vecchio = `${INIZIO_SCHEDA}Cartella: «x». Permesso: sola lettura.`;
  const nuovo = `${INIZIO_SCHEDA}Cartella: «x». Permesso: scrittura.`;
  const storia = [{ role: 'system', content: 'istruzioni' }, { role: 'system', content: vecchio }, { role: 'user', content: 'ciao' }];
  const coda = aggiornamentoInCoda({ storia, testo: nuovo });
  assert.ok(coda);
  assert.ok(coda.startsWith(INIZIO_AGGIORNAMENTO));
  assert.match(coda, /SOSTITUISCE/);
  assert.ok(coda.endsWith(nuovo), 'il preambolo nuovo va per intero in coda al messaggio');
  /* ⛔ E il PREFISSO non si tocca: la storia che è entrata esce identica. Questa è la differenza
     fra appendere e riscrivere, e la ragione per cui esiste tutta questa cura. */
  assert.equal(storia[1].content, vecchio);
});

test('BC-07: un secondo aggiornamento si confronta con l\'ULTIMO, non col primo', () => {
  const a = `${INIZIO_SCHEDA}A`;
  const b = `${INIZIO_SCHEDA}B`;
  const storia = [
    { role: 'system', content: a },
    { role: 'user', content: 'ciao' },
    { role: 'system', content: `${INIZIO_AGGIORNAMENTO} ...\n\n${b}` },
  ];
  assert.equal(preamboloVistoDa(storia), b);
  assert.equal(aggiornamentoInCoda({ storia, testo: b }), null, 'B è già quello che il modello ha davanti');
  assert.ok(aggiornamentoInCoda({ storia, testo: a }), 'tornare ad A è un cambiamento come un altro');
});

test('BC-07, AL CONTRARIO: una conversazione nata PRIMA di questa cura non riceve un aggiornamento fantasma', () => {
  const storia = [{ role: 'system', content: 'FILE:\nsrc/uno.mjs\n' }, { role: 'user', content: 'ciao' }];
  assert.equal(preamboloVistoDa(storia), null);
  assert.equal(aggiornamentoInCoda({ storia, testo: `${INIZIO_SCHEDA}x` }), null, '⛔ non c’è niente da SOSTITUIRE: non si appende');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// IL MARCATORE DI CACHE — si misura il PREFISSO, non l'ultimo blocco
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('BC-07: il marcatore di cache guarda il PREFISSO INTERO, non solo il blocco marcato', () => {
  /* Due blocchi di sistema che da soli stanno SOTTO la soglia, ma insieme la superano: è
     esattamente il caso creato da BC-07, dove il preambolo è sceso da 66.523 a ~13.700 byte. */
  const meta = 'x'.repeat(Math.ceil(CARATTERI_MINIMI_PER_CACHE * 0.6));
  const messaggi = [
    { role: 'system', content: meta },
    { role: 'system', content: meta },
    { role: 'user', content: 'ciao' },
  ];
  const marcati = conMarcatoreDiCache(messaggi);
  assert.ok(Array.isArray(marcati[1].content), '⛔ con la vecchia misura (solo l’ultimo blocco) il marcatore sarebbe sparito in silenzio');
  assert.equal(marcati[1].content[0].cache_control.type, 'ephemeral');
  assert.equal(typeof marcati[0].content, 'string', 'gli altri messaggi restano stringhe');
});

test('BC-07, AL CONTRARIO: un prefisso davvero corto NON prende il marcatore', () => {
  const messaggi = [{ role: 'system', content: 'due parole' }, { role: 'user', content: 'ciao' }];
  const marcati = conMarcatoreDiCache(messaggi);
  assert.equal(typeof marcati[0].content, 'string', '⛔ un marcatore che il fornitore non può onorare è solo formato in più');
  assert.equal(marcati, messaggi, 'e l’array torna identico, non una copia');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// IL TETTO DELLA MAPPA E' IN TOKEN, e si taglia in PROFONDITA'
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('BC-07: la mappa entra nel tetto di TOKEN togliendo profondita, e lo DICHIARA', async () => {
  /* Un albero profondo e largo: al livello pieno non entra in un tetto piccolo. */
  const albero = {};
  for (let a = 0; a < 6; a += 1) {
    for (let b = 0; b < 6; b += 1) {
      for (let c = 0; c < 6; c += 1) albero[`liv1-${a}/liv2-${b}/liv3-${c}/f`] = '';
    }
  }
  const base = await progettoFinto(albero);
  try {
    /* ⛔ BC-40 (12/09) — `profonditaMax: 8` ESPLICITO, e non e' un aggiustamento per far
       passare il test: questa prova parla del TETTO DI TOKEN, che per mordere ha bisogno di un
       albero profondo. Dal 12/09 la profondita' predefinita e' 2 (BC-40), quindi il default
       non produrrebbe piu' i tre livelli di cui questa prova ha bisogno. Cio' che si prova qui
       resta identico; cambia solo che la profondita' si CHIEDE invece di ereditarla. */
    const mappa = await costruisciMappaCartelle({ radice: base, profonditaMax: 8 });
    assert.equal(mappa.profonditaRaggiunta, 3);
    const piena = mappaEntroIlTetto(mappa, { radice: base, tettoToken: 100_000 });
    assert.equal(piena.profonditaUsata, 3);
    assert.equal(piena.tagliataInProfondita, false);

    const stretta = mappaEntroIlTetto(mappa, { radice: base, tettoToken: 300 });
    assert.ok(stretta.profonditaUsata < 3, `⛔ il tetto deve mordere (profondita usata ${stretta.profonditaUsata})`);
    assert.ok(stretta.token <= 300 || stretta.profonditaUsata === 1);
    assert.equal(stretta.tagliataInProfondita, true);
    assert.match(stretta.testo, /MAPPA INCOMPLETA/, '⛔ una mappa tagliata non puo sembrare intera');
    assert.match(stretta.testo, /Fine di una mappa INCOMPLETA/);
    /* ⛔ Cio che resta deve essere VERO E CHIUSO: tutte le cartelle fino alla profondita usata,
       nessuna esclusa. E' la differenza fra tagliare in profondita e tagliare in ordine alfabetico. */
    const attese = mappa.cartelle.filter((c) => c.livello <= stretta.profonditaUsata).length;
    const righe = stretta.testo.split(String.fromCharCode(10)).filter((r) => /^\s+\S+\/ \(\d+\)$/.test(r)).length;
    assert.equal(righe, attese, 'ogni cartella fino alla profondita dichiarata compare');
  } finally { await rimuoviCartellaDiProvaAttesa(base); }
});

test('BC-07, AL CONTRARIO: una mappa che sta gia nel tetto non viene toccata ne dichiarata incompleta', async () => {
  const base = await progettoFinto({ 'src/uno.mjs': '', 'src/giu/due.mjs': '' });
  try {
    const mappa = await costruisciMappaCartelle({ radice: base });
    const resa = mappaEntroIlTetto(mappa, { radice: base, tettoToken: TETTO_TOKEN_MAPPA_PREDEFINITO });
    assert.equal(resa.tagliataInProfondita, false);
    assert.equal(resa.testo, testoMappaCartelle(mappa, { radice: base }), '⛔ nessuna differenza di un byte: il prefisso deve restare stabile');
    assert.match(resa.testo, /albero COMPLETO/);
  } finally { await rimuoviCartellaDiProvaAttesa(base); }
});

test('BC-07: il preambolo dichiara i DUE modi di essere incompleta, separati', async () => {
  const albero = {};
  for (let a = 0; a < 5; a += 1) for (let b = 0; b < 5; b += 1) albero[`a${a}/b${b}/f`] = '';
  const base = await progettoFinto(albero);
  try {
    const preambolo = await contestoDelProgetto({ cartella: base, tettoTokenMappa: 120, deps: { eseguiGit: gitFinto } });
    const m = preambolo.blocchi.mappa;
    assert.equal(m.troncata, false, 'il camminatore NON si e fermato');
    assert.equal(m.tagliataInProfondita, true, 'ma il tetto di token ha morso');
    assert.ok(m.profondita < m.profonditaPiena);
    assert.ok(m.cartelle < m.cartelleTotali, 'e si sa quante ne sono rimaste fuori');
  } finally { await rimuoviCartellaDiProvaAttesa(base); }
});

// -------------------------------------------------------------------------------------------
// BLOCCO 2 - la riga a segnale piu alto: i comandi di verifica
// -------------------------------------------------------------------------------------------

test('BC-07: i comandi di verifica si trovano anche quando lo script ha un PREFISSO (verify:all)', async () => {
  const base = await progettoFinto({
    'package.json': JSON.stringify({ scripts: { 'build:ui': 'x', 'verify:all': 'x', 'verify:ui': 'x', 'test:kernel': 'x', aggiorna: 'x' } }),
    'package-lock.json': '{}',
    'uno.mjs': '',
  });
  try {
    const fatti = await fattiDelProgetto(base);
    assert.equal(fatti.gestore, 'npm');
    /* Ordine deterministico: prima la priorita della parola (test, poi build, poi verify), poi il
       nome. Lo stesso package.json deve dare sempre la stessa riga, o la cache si azzera. */
    assert.deepEqual(fatti.comandi, ['npm run test:kernel', 'npm run build:ui', 'npm run verify:all', 'npm run verify:ui']);
    assert.ok(!fatti.comandi.includes('npm run aggiorna'), 'uno script che non e verifica non entra');
    const testo = testoSchedaDiLavoro({ cartella: base, fatti });
    assert.match(testo, /Verifica: npm run test:kernel/);
  } finally { await rimuoviCartellaDiProvaAttesa(base); }
});

test('BC-07, AL CONTRARIO: senza script di verifica la riga NON esce, e non si inventa un comando', async () => {
  const base = await progettoFinto({ 'package.json': JSON.stringify({ scripts: { aggiorna: 'x' } }), 'uno.mjs': '' });
  try {
    const fatti = await fattiDelProgetto(base);
    assert.deepEqual(fatti.comandi, []);
    const testo = testoSchedaDiLavoro({ cartella: base, fatti });
    assert.ok(!testo.includes('Verifica:'), 'meglio tacere che suggerire un comando che non esiste');
    assert.match(testo, /Progetto: package\.json/);
  } finally { await rimuoviCartellaDiProvaAttesa(base); }
});

test('BC-07, AL CONTRARIO: un package.json ROTTO non fa cadere la scheda', async () => {
  const base = await progettoFinto({ 'package.json': '{ questo non e json', 'uno.mjs': '' });
  try {
    const fatti = await fattiDelProgetto(base);
    assert.deepEqual(fatti.manifesti, ['package.json'], 'il manifesto resta riconosciuto');
    assert.deepEqual(fatti.comandi, [], 'ma nessun comando inventato');
  } finally { await rimuoviCartellaDiProvaAttesa(base); }
});

test('BC-07: statoVolatile:false toglie git dalla scheda - la leva per A/B sulla cache', async () => {
  const base = await progettoFinto({ 'uno.mjs': '' });
  try {
    const con = await contestoDelProgetto({ cartella: base, deps: { eseguiGit: gitFinto } });
    dimenticaTuttiGliElenchi();
    const senza = await contestoDelProgetto({ cartella: base, statoVolatile: false, deps: { eseguiGit: gitFinto } });
    assert.match(con.testo, /ramo-di-prova/);
    assert.ok(!senza.testo.includes('ramo-di-prova'), 'senza stato volatile il ramo sparisce');
    assert.ok(!senza.testo.includes('abc1234'), 'e nemmeno i commit');
    assert.ok(Buffer.byteLength(senza.testo) < Buffer.byteLength(con.testo));
  } finally { await rimuoviCartellaDiProvaAttesa(base); }
});
