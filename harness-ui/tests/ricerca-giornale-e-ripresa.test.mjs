import assert from 'node:assert/strict';
import { appendFileSync, closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  CARTELLA_RICERCA, NOME_GIORNALE, NOME_META, ResearchStoreError,
  accodaEvento, aggiornaRicerca, cartellaDellaRicerca, creaRicerca, elencaFonti, elencaRicerche,
  eliminaRicerca, leggiFonte, leggiGiornale, leggiIstantaneaCache, leggiPiano, leggiRapporto,
  leggiRicerca, migraRicerca, percorsoGiornale, percorsoMeta, percorsoRapporto, percorsoVoceLegacy,
  rinominaConRitento, scriviAtomico, scriviFonte, scriviIstantaneaCache, scriviPiano, scriviRapporto,
  statRapporto, SUFFISSO_NON_RINOMINATO,
} from '../src/research-store.mjs';
import { classificaErroreDiCorsa, creaResearchOrchestrator, rileggiRapportoRecintato } from '../src/research-orchestrator.mjs';
import { talosResearchReportDocument } from '../src/research/report.mjs';
import { talosResearchReplay, talosResearchSpent } from '../src/research/run.mjs';

/*
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * L4 (11/09/2026) — IL GIORNALE SU DISCO, LA MIGRAZIONE AL PRIMO TOCCO E LA RIPRESA VERA
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⛔ Questo file usa un filesystem VERO, in una cartella temporanea, e lo fa apposta: L3b aveva
 *   dichiarato, nel suo «cosa NON ho verificato», che il test sul giornale troncato costruiva il
 *   JSONL **in memoria** e che «che `research-store.mjs` salti davvero una riga mozzata leggendo
 *   da disco è L4, e questo test non lo copre». Copriamolo dal disco, allora — altrimenti la
 *   riga del disegno resterebbe aperta con l'aria di essere chiusa.
 * ⛔ Nessun 4174, nessun modello, nessuna rete: solo file.
 */

function cartellaVera() {
  return mkdtempSync(join(tmpdir(), 'talos-l4-'));
}

/** Un rapporto col record recintato, scritto dallo scrittore VERO del motore. */
function rapportoRecintato({ fonti = 1, affermazioni = 1, passaggio = 'un passaggio ritrovato' } = {}) {
  return talosResearchReportDocument({
    question: 'Come stanno evolvendo gli harness agentici desktop',
    summary: 'Convergono su controllo del computer, permessi per attrezzo e memoria persistente.',
    judge: null,
    claims: Array.from({ length: affermazioni }, (_v, i) => ({
      claim: { text: `Affermazione ${i + 1}.`, sourceIndex: (i % Math.max(fonti, 1)) + 1, quote: 'q' },
      passage: passaggio,
      checks: { claimSupported: 'unchecked' },
    })),
    sources: Array.from({ length: fonti }, (_v, i) => ({
      url: `https://arxiv.org/abs/2606.2002${i}`, title: `Fonte ${i + 1}`, publishedAt: null, obtained: 'page',
    })),
  });
}

/** La scusa verbatim dell'11/09: 290 byte, e il rapporto permanente di una corsa da 484.171 token. */
const SCUSA_DEL_11_SETTEMBRE = 'La sessione è in sola lettura, quindi non posso creare documenti direttamente. '
  + 'Tuttavia, posso darti il contenuto completo in un formato pronto per essere salvato, o posso provare a '
  + 'scriverlo in un file del workspace. Vuoi che cerchi il modo per salvarlo in un file markdown nel workspace?';

/* ─────────────────────────── 1. LA FORMA SU DISCO E LA MIGRAZIONE ─────────────────────────── */

test('⭐⭐⭐ L4 — una ricerca nuova nasce come CARTELLA: meta.json dentro `<id>/`, mai più `<id>.json`', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  const voce = await creaRicerca({ cartella, id: 'ric-1', domanda: 'Una domanda' });
  assert.equal(voce.formato, 2, 'il formato viaggia sulla voce: è ciò che dice al cancello se il ripiego è lecito');
  assert.ok(existsSync(percorsoMeta(cartella, 'ric-1')), 'la voce sta in `<id>/meta.json`');
  assert.equal(existsSync(percorsoVoceLegacy(cartella, 'ric-1')), false, 'e NON nella forma vecchia');
  assert.deepEqual(await leggiRicerca({ cartella, id: 'ric-1' }), voce);
});

test('⛔⛔⛔ L4, VERSO CONTRARIO — un id che può attraversare una cartella è respinto ALLA NASCITA (adesso l\'id è un nome di cartella)', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  for (const ostile of ['..', '../fuori', 'a/b', 'a\\b', 'C:\\Windows', '', '.']) {
    await assert.rejects(() => creaRicerca({ cartella, id: ostile, domanda: 'x' }), ResearchStoreError, `${ostile} non deve diventare una cartella`);
  }
  assert.equal(existsSync(join(cartella, 'fuori')), false, 'e niente è stato creato fuori');
});

test('⭐⭐⭐ L4 — LA MIGRAZIONE È AL PRIMO TOCCO CHE SCRIVE: leggere ed elencare NON migrano', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  mkdirSync(join(cartella, CARTELLA_RICERCA), { recursive: true });
  const vecchia = { id: 'antica', domanda: 'Una domanda di ieri', profondita: 'deep', titolo: null, avviataAlle: '2026-09-01T10:00:00.000Z', terminata: 'done', reportLibraryId: 'lib-9' };
  writeFileSync(percorsoVoceLegacy(cartella, 'antica'), JSON.stringify(vecchia, null, 2), 'utf8');

  // Leggere: la voce si vede, e il file vecchio è ancora lì.
  assert.deepEqual(await leggiRicerca({ cartella, id: 'antica' }), vecchia);
  assert.equal((await elencaRicerche({ cartella })).length, 1);
  assert.ok(existsSync(percorsoVoceLegacy(cartella, 'antica')), '⛔ leggere NON migra: venti letture per disegnare un elenco sarebbero la migrazione «in blocco» che il disegno vieta');
  assert.equal(existsSync(percorsoMeta(cartella, 'antica')), false);

  // Scrivere: adesso sì.
  const aggiornata = await aggiornaRicerca({ cartella, id: 'antica', titolo: 'Il mio titolo' });
  assert.equal(aggiornata.titolo, 'Il mio titolo');
  assert.equal(aggiornata.domanda, 'Una domanda di ieri', 'nessun campo si perde nella migrazione');
  assert.equal(aggiornata.reportLibraryId, 'lib-9', 'e il puntatore al lavoro già pagato nemmeno');
  assert.equal(aggiornata.migrataDa, 'antica.json', 'la voce DICE da dove viene');
  assert.equal(aggiornata.formato, undefined, '⛔ e NON si finge nata oggi: senza `formato`, il cancello sa che il record recintato non poteva esistere');
  assert.ok(existsSync(percorsoMeta(cartella, 'antica')));
  assert.equal(existsSync(percorsoVoceLegacy(cartella, 'antica')), false, 'il file vecchio si toglie DOPO che il nuovo è sul disco');
  assert.equal((await elencaRicerche({ cartella })).length, 1, 'e l\'elenco continua a vederne una sola');
});

test('⛔⛔ L4, VERSO CONTRARIO — migrazione interrotta a metà (entrambe le copie sul disco): l\'elenco ne mostra UNA, quella NUOVA', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  mkdirSync(cartellaDellaRicerca(cartella, 'doppia'), { recursive: true });
  writeFileSync(percorsoVoceLegacy(cartella, 'doppia'), JSON.stringify({ id: 'doppia', domanda: 'vecchia', titolo: 'VECCHIO', avviataAlle: '2026-09-01T10:00:00.000Z' }), 'utf8');
  writeFileSync(percorsoMeta(cartella, 'doppia'), JSON.stringify({ id: 'doppia', domanda: 'vecchia', titolo: 'NUOVO', avviataAlle: '2026-09-01T10:00:00.000Z' }), 'utf8');
  const elenco = await elencaRicerche({ cartella });
  assert.equal(elenco.length, 1, 'mai due righe per la stessa ricerca');
  assert.equal(elenco[0].titolo, 'NUOVO', 'vince la cartella: è ciò che l\'ultima scrittura ha prodotto');
  assert.equal((await leggiRicerca({ cartella, id: 'doppia' })).titolo, 'NUOVO');
});

test('⛔⛔ L4, VERSO CONTRARIO — un `<id>.json` ILLEGGIBILE non si migra e non si cancella: si dice, e si lascia dov\'è', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  mkdirSync(join(cartella, CARTELLA_RICERCA), { recursive: true });
  writeFileSync(percorsoVoceLegacy(cartella, 'rotta'), '{ questo non e json', 'utf8');
  await assert.rejects(() => migraRicerca({ cartella, id: 'rotta' }), /illeggibile/);
  assert.ok(existsSync(percorsoVoceLegacy(cartella, 'rotta')), '⛔ è l\'unica copia di qualcosa che è costato denaro: non si tocca');
});

test('⭐⭐ L4 — eliminaRicerca toglie la CARTELLA intera (giornale, piano, fonti, rapporto) e anche il `<id>.json` mai migrato', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  await creaRicerca({ cartella, id: 'ric-x', domanda: 'x' });
  await accodaEvento({ cartella, id: 'ric-x', evento: { kind: 'run_started', at: 'ora', id: 'ric-x', sessionId: 'ric-x', question: 'x', depth: 'deep', engine: 'device' } });
  await scriviFonte({ cartella, id: 'ric-x', testo: 'il testo di una pagina' });
  await scriviRapporto({ cartella, id: 'ric-x', testo: rapportoRecintato() });
  writeFileSync(percorsoVoceLegacy(cartella, 'ric-x'), '{"id":"ric-x"}', 'utf8');

  assert.deepEqual(await eliminaRicerca({ cartella, id: 'ric-x' }), { id: 'ric-x' });
  assert.equal(existsSync(cartellaDellaRicerca(cartella, 'ric-x')), false);
  assert.equal(existsSync(percorsoVoceLegacy(cartella, 'ric-x')), false, 'altrimenti l\'elenco mostrerebbe ancora una ricerca dichiarata eliminata');
  assert.equal(await leggiRicerca({ cartella, id: 'ric-x' }), null);
});

/* ─────────────────────────── 2. LA SCRITTURA ATOMICA ─────────────────────────── */

test('⭐⭐⭐ L4 — scriviAtomico: temporaneo nella STESSA cartella, poi rename. Il contenuto arriva intero', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  const percorso = join(cartella, 'sotto', 'cosa.txt');
  await scriviAtomico(percorso, 'contenuto nuovo');
  assert.equal(readFileSync(percorso, 'utf8'), 'contenuto nuovo');
  assert.deepEqual(
    readdirSync(join(cartella, 'sotto')), ['cosa.txt'],
    '⛔ nessun temporaneo lasciato indietro: una cartella di ricerca piena di `.tmp-` è il segno di un guasto inghiottito',
  );
});

test('⛔⛔⛔ L4, IL VINCOLO — un crash FRA il temporaneo e il rename lascia il file VECCHIO intatto, e non lascia scorie', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  const percorso = join(cartella, 'pagato.txt');
  await scriviAtomico(percorso, 'IL LAVORO GIÀ PAGATO');

  const crash = new Error('il processo muore qui');
  await assert.rejects(
    () => scriviAtomico(percorso, 'la scrittura che non arriverà mai', { renameFn: async () => { throw crash; } }),
    /il processo muore qui/,
    '⛔ il guasto si RILANCIA: un errore inghiottito qui direbbe «salvato» su una cosa mai salvata',
  );
  assert.equal(readFileSync(percorso, 'utf8'), 'IL LAVORO GIÀ PAGATO', '⛔ ciò che è costato denaro non si sovrascrive mai — nemmeno con un guasto');
  /*
   * ⛔⛔ CONTRATTO CAMBIATO il 12/09/2026, e non di nascosto: qui prima c'era
   *   `assert.deepEqual(readdirSync(cartella), ['pagato.txt'], 'e il temporaneo è stato pulito')`.
   *   Il motivo di allora era buono («una cartella piena di `.tmp-` è il segno di un guasto
   *   inghiottito») ma la conclusione no: a questo punto la SCRITTURA è riuscita — i byte nuovi
   *   sono interi sul disco — ed è solo il rename ad aver fallito. Buttarli è buttare lavoro già
   *   pagato per tenere pulita una cartella. ⇒ restano, con un nome DICHIARATO e uno solo.
   * ⛔ Qui il nome dichiarato NON arriva, ed è giusto così: `renameFn` è iniettato e fallisce
   *   SEMPRE, quindi fallisce anche il parcheggio sotto `.non-rinominato`. È il ripiego scritto
   *   accanto al codice — si tiene il nome casuale e lo si dice nel messaggio — e questo test è
   *   il solo posto che lo esercita. L'invariante che conta non è il NOME: è che i byte ci siano.
   */
  const rimasti = readdirSync(cartella).filter((nome) => nome !== 'pagato.txt');
  assert.equal(rimasti.length, 1, '⛔ uno solo, e non zero: il nuovo contenuto non si butta');
  assert.equal(readFileSync(join(cartella, rimasti[0]), 'utf8'), 'la scrittura che non arriverà mai');
  // ⛔ `crash` è lo STESSO oggetto che il codice arricchisce: il messaggio deve dire dove sono
  //    finiti i byte, altrimenti chi legge il log non ha modo di ritrovarli.
  assert.match(crash.message, /NON è perso/);
  assert.match(crash.message, /\.tmp-/, 'e nomina il file per esteso, non «da qualche parte»');
});

test('⛔⛔⛔ L4 — lo stesso vincolo sulla VOCE: se il rename fallisce, `meta.json` resta quello di prima', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  await creaRicerca({ cartella, id: 'ric-1', domanda: 'x' });
  await aggiornaRicerca({ cartella, id: 'ric-1', terminata: 'done', reportLibraryId: 'lib-1' });
  await assert.rejects(() => aggiornaRicerca({ cartella, id: 'ric-1', terminata: 'cancelled' }, { renameFn: async () => { throw new Error('disco morto'); } }));
  const riletta = await leggiRicerca({ cartella, id: 'ric-1' });
  assert.equal(riletta.terminata, 'done', 'lo stato di prima è ancora leggibile');
  assert.equal(riletta.reportLibraryId, 'lib-1');
});

/* ───────────── 2-bis. IL RITENTO DEL RENAME — la contesa di Windows (12/09/2026) ───────────── */

/*
 * ⛔⛔⛔ IL DIFETTO CHE QUESTI TEST PRESIDIANO, riprodotto e non dedotto.
 *
 * Un LETTORE che tiene aperto `meta.json` fa fallire il `rename` che lo sostituisce:
 *
 *   const h = openSync(meta, 'r'); renameSync(tmp, meta);  →  EPERM
 *   senza il lettore, lo stesso rename RIESCE.
 *
 * Su Windows `MoveFileExW` non sostituisce una destinazione che qualcun altro tiene aperta, e
 * libuv apre i file senza `FILE_SHARE_DELETE`. In produzione il lettore è **la sezione Ricerca**,
 * che interroga elenco e scheda mentre la ricerca gira: alla conclusione `onConclusioneRicerca`
 * esplodeva e la voce restava `running` sul disco per sempre.
 *
 * ⛔ I due versi, e servono entrambi:
 *   (a) la contesa PASSA  → il rename riesce dentro i tentativi, e nessuno se ne accorge;
 *   (b) la contesa NON passa (o è un altro guasto) → si rilancia, e il contenuto nuovo NON si perde.
 * ⛔ Niente attese a tempo: l'handle si chiude DENTRO `attendiFn`, cioè esattamente al tentativo
 *   che scegliamo noi. Il disco è vero, l'EPERM è vero, il momento è deterministico.
 */

test('⭐⭐⭐⭐ 12/09 — un LETTORE con l\'handle aperto fa fallire il rename: si ritenta, e passa', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  const percorso = join(cartella, 'meta.json');
  await scriviAtomico(percorso, '{"stato":"running"}');

  const handle = openSync(percorso, 'r');
  let chiuso = false;
  const attese = [];
  await scriviAtomico(percorso, '{"stato":"done"}', {
    attendiFn: async (ms) => {
      attese.push(ms);
      // Alla seconda attesa il lettore chiude: è il momento in cui la contesa finisce davvero.
      if (attese.length === 2 && !chiuso) { closeSync(handle); chiuso = true; }
    },
  });
  if (!chiuso) closeSync(handle);

  assert.equal(readFileSync(percorso, 'utf8'), '{"stato":"done"}', '⛔ la scrittura è arrivata: è questo che prima non succedeva');
  assert.deepEqual(attese, [20, 40], '⛔ e ci sono voluti due ritenti: una cura che non si conta non si sa se è servita');
  assert.deepEqual(readdirSync(cartella), ['meta.json'], 'nessuna scoria: la strada felice resta pulita');
});

test('⛔⛔ AL CONTRARIO — la contesa che NON passa: si rilancia, e il contenuto nuovo resta accanto', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  const percorso = join(cartella, 'meta.json');
  await scriviAtomico(percorso, '{"stato":"running"}');

  const handle = openSync(percorso, 'r');
  t.after(() => { try { closeSync(handle); } catch { /* già chiuso */ } });
  const attese = [];
  await assert.rejects(
    () => scriviAtomico(percorso, '{"stato":"done"}', { attendiFn: async (ms) => { attese.push(ms); }, tentativiRename: 4 }),
    (errore) => {
      assert.equal(errore.code, 'EPERM', '⛔ il codice VERO sopravvive: un chiamante che filtra sul codice deve continuare a vederlo');
      assert.match(errore.message, /NON è perso/, 'e il messaggio dice dove sono finiti i byte');
      return true;
    },
  );
  assert.equal(attese.length, 3, 'quattro tentativi, tre attese');
  assert.equal(readFileSync(percorso, 'utf8'), '{"stato":"running"}', '⛔ il file vecchio è ancora intatto');
  assert.equal(
    readFileSync(join(cartella, `meta.json${SUFFISSO_NON_RINOMINATO}`), 'utf8'), '{"stato":"done"}',
    '⛔ e il nuovo è accanto, con un nome dichiarato — non buttato',
  );
});

test('⛔⛔ AL CONTRARIO — un rename IMPOSSIBILE (destinazione = una cartella) rilancia dopo i tentativi', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  // Una CARTELLA al posto del file: su Windows il rename ci sbatte con EPERM, cioè con lo stesso
  // codice della contesa — è il caso in cui ritentare non serve a niente e deve finire.
  const percorso = join(cartella, 'occupato');
  mkdirSync(percorso, { recursive: true });

  const attese = [];
  await assert.rejects(
    () => scriviAtomico(percorso, 'contenuto che non entrerà mai', { attendiFn: async (ms) => { attese.push(ms); }, tentativiRename: 3 }),
    (errore) => {
      assert.ok(['EPERM', 'EISDIR', 'EACCES', 'ENOTEMPTY'].includes(errore.code), `codice inatteso: ${errore.code}`);
      return true;
    },
  );
  assert.equal(attese.length, 2, '⛔ tre tentativi e poi basta: un ritento senza fine è un blocco, non una cura');
  assert.equal(
    readFileSync(join(cartella, `occupato${SUFFISSO_NON_RINOMINATO}`), 'utf8'), 'contenuto che non entrerà mai',
    'e anche qui i byte non si buttano',
  );
});

test('⛔ un guasto che NON è contesa non si ritenta nemmeno una volta', async () => {
  /* Aspettare 1,3 secondi per un disco pieno è tempo rubato a chi sta guardando lo schermo. */
  const attese = [];
  const pieno = Object.assign(new Error('no space left on device'), { code: 'ENOSPC' });
  await assert.rejects(
    () => rinominaConRitento('a', 'b', { renameFn: async () => { throw pieno; }, attendiFn: async (ms) => { attese.push(ms); } }),
    /no space left/,
  );
  assert.deepEqual(attese, [], '⛔ nessuna attesa: si rilancia subito');
});

test('⭐⭐ le attese crescono, si fermano a 200 ms, e in tutto stanno SOTTO i 2 secondi', async () => {
  /*
   * ⛔ Il tetto non è un gusto: questa scrittura sta DENTRO la conclusione di una ricerca e dentro
   *   una richiesta HTTP. graceful-fs ritenta per 60 secondi (pensati per un antivirus che blocca
   *   un file per un minuto): qui sarebbero 60 secondi di schermo fermo.
   * ⛔ E le attese passano da `setTimeout`, mai da un ciclo stretto — graceful-fs lo dice e il
   *   motivo è che «Windows scheduling gives CPU to a busy looping process», cioè un ciclo a vuoto
   *   affamerebbe proprio il processo che tiene il file aperto: la cura diventerebbe la causa.
   */
  const attese = [];
  const conteso = Object.assign(new Error('bloccato'), { code: 'EBUSY' });
  await assert.rejects(
    () => rinominaConRitento('a', 'b', { renameFn: async () => { throw conteso; }, attendiFn: async (ms) => { attese.push(ms); } }),
    /bloccato/,
  );
  assert.deepEqual(attese, [20, 40, 80, 160, 200, 200, 200, 200, 200], 'dieci tentativi, nove attese');
  assert.equal(attese.reduce((somma, ms) => somma + ms, 0), 1300);
  assert.ok(attese.reduce((somma, ms) => somma + ms, 0) < 2000, '⛔ sotto i due secondi, sempre');
});

test('⭐⭐⭐⭐ 12/09, IL DIFETTO VERO — una ricerca che conclude MENTRE qualcuno la legge non resta «running»', async (t) => {
  /*
   * È il giro che falliva in produzione, ridotto ai suoi tre pezzi: una voce `running` sul disco,
   * un lettore che tiene aperto `meta.json` (la sezione Ricerca), e la conclusione che scrive.
   * Prima di oggi: EPERM da `aggiornaRicerca`, eccezione fuori da `onConclusioneRicerca`, e la
   * ricerca conclusa e pagata restava `running` **per sempre**.
   */
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  await creaRicerca({ cartella, id: 'ric-contesa', domanda: 'chi tiene aperto il file' });
  assert.equal((await leggiRicerca({ cartella, id: 'ric-contesa' })).terminata, null, 'parte «in corso»');

  const handle = openSync(percorsoMeta(cartella, 'ric-contesa'), 'r');
  let chiuso = false;
  await aggiornaRicerca(
    { cartella, id: 'ric-contesa', terminata: 'done', reportLibraryId: 'lib-1' },
    { attendiFn: async () => { if (!chiuso) { closeSync(handle); chiuso = true; } } },
  );
  if (!chiuso) closeSync(handle);

  const riletta = await leggiRicerca({ cartella, id: 'ric-contesa' });
  assert.equal(riletta.terminata, 'done', '⛔ la conclusione è arrivata sul disco nonostante il lettore aperto');
  assert.equal(riletta.reportLibraryId, 'lib-1');
  assert.deepEqual(
    readdirSync(cartellaDellaRicerca(cartella, 'ric-contesa')).filter((n) => n.includes('.tmp-') || n.endsWith(SUFFISSO_NON_RINOMINATO)),
    [], 'e non ha lasciato scorie',
  );
});

/* ─────────────────────────── 3. IL GIORNALE ─────────────────────────── */

test('⭐⭐⭐ L4 — il giornale è SOLO APPEND: dieci eventi, dieci righe, nessuna riscrittura', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  for (let i = 0; i < 10; i += 1) {
    await accodaEvento({ cartella, id: 'ric-1', evento: { kind: 'step_started', at: `2026-09-11T00:00:0${i}.000Z`, stepId: `s${i}`, branchId: 'b1', stepKind: 'search' } });
  }
  const grezzo = readFileSync(percorsoGiornale(cartella, 'ric-1'), 'utf8');
  assert.equal(grezzo.trim().split('\n').length, 10);
  const { eventi, righeSaltate } = await leggiGiornale({ cartella, id: 'ric-1' });
  assert.equal(eventi.length, 10);
  assert.equal(righeSaltate, 0);
  assert.equal(eventi[0].stepId, 's0', 'l\'ordine è quello in cui i fatti sono accaduti');
  assert.equal(eventi[9].stepId, 's9');
});

test('⭐⭐⭐ L4 — SCRITTURE CONCORRENTI sullo stesso giornale: 50 righe, tutte leggibili, nessuna intrecciata', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  /*
   * ⛔ Il caso vero da cui nasce la coda (W0-07, 04/09): un record grande viene spezzato in più
   *   chiamate di scrittura, e un secondo scrittore si infila in mezzo. Qui il carico è grande
   *   apposta (~64 KB per evento) perché una riga corta non riproduce il guasto.
   */
  const carico = 'x'.repeat(64 * 1024);
  await Promise.all(Array.from({ length: 50 }, (_v, i) => accodaEvento({
    cartella, id: 'ric-1', evento: { kind: 'step_finished', at: 'ora', stepId: `s${i}`, spend: { tokens: 1, searches: 0, pages: 0 }, resultRef: carico },
  })));
  const { eventi, righeSaltate } = await leggiGiornale({ cartella, id: 'ric-1' });
  assert.equal(righeSaltate, 0, '⛔ una sola riga intrecciata qui varrebbe un passo pagato perso');
  assert.equal(eventi.length, 50);
  assert.equal(new Set(eventi.map((e) => e.stepId)).size, 50, 'cinquanta passi distinti, nessuno mangiato da un altro');
});

test('⭐⭐⭐ L4, DAL DISCO — un giornale TRONCATO A METÀ RIGA si carica lo stesso: la riga mozzata si salta e si CONTA', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  for (const e of [
    { kind: 'run_started', at: 'a', id: 'ric-1', sessionId: 'ric-1', question: 'q', depth: 'deep', engine: 'device' },
    { kind: 'plan_approved', at: 'b', branches: [{ id: 'b1', question: 'r1', estimate: { tokens: 10, searches: 1, pages: 1 } }] },
    { kind: 'step_started', at: 'c', stepId: 'b1:search', branchId: 'b1', stepKind: 'search' },
    { kind: 'step_finished', at: 'd', stepId: 'b1:search', spend: { tokens: 900, searches: 1, pages: 2 }, resultRef: 'fonti/aa.txt' },
  ]) await accodaEvento({ cartella, id: 'ric-1', evento: e });

  // ⛔ Il processo muore DENTRO `appendFile`: l'ultima riga resta mozzata, senza `\n`.
  appendFileSync(percorsoGiornale(cartella, 'ric-1'), '{"kind":"step_started","at":"e","stepId":"b2:sea', 'utf8');

  const { eventi, righeSaltate } = await leggiGiornale({ cartella, id: 'ric-1' });
  assert.equal(eventi.length, 4, 'i quattro eventi completi ci sono tutti');
  assert.equal(righeSaltate, 1, '⛔ e il numero si dichiara: «si è caricato» e «si è caricato per intero» non sono la stessa frase');
  const giro = talosResearchReplay(eventi);
  assert.ok(giro, '⛔ un giro che non si può rigiocare è un giro il cui lavoro pagato è perso');
  assert.deepEqual(talosResearchSpent(giro), { tokens: 900, searches: 1, pages: 2 }, 'e la spesa non viene inventata dalla riga rotta');
});

test('⛔⛔ L4, DAL DISCO — una riga rotta IN MEZZO (non solo l\'ultima) non fa fallire la lettura', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  mkdirSync(cartellaDellaRicerca(cartella, 'ric-1'), { recursive: true });
  writeFileSync(percorsoGiornale(cartella, 'ric-1'), [
    JSON.stringify({ kind: 'run_started', at: 'a', id: 'ric-1', sessionId: 'ric-1', question: 'q', depth: 'deep', engine: 'device' }),
    '{"kind":"step_star',
    JSON.stringify({ kind: 'run_paused', at: 'c' }),
    '[]',
    JSON.stringify({ kind: 'run_resumed', at: 'e' }),
    '',
  ].join('\n'), 'utf8');
  const { eventi, righeSaltate } = await leggiGiornale({ cartella, id: 'ric-1' });
  /*
   * ⛔ È una DEVIAZIONE VOLUTA da `session-store.leggiRegistro`, che invece lancia su una riga
   *   rotta che non sia l'ultima. Là il file è una trascrizione da mostrare; qui è la prova di
   *   ciò che è stato speso, e perderla tutta per una riga è il guasto peggiore dei due.
   */
  assert.equal(eventi.length, 3);
  assert.equal(righeSaltate, 2, 'la riga mozzata E il JSON valido che non è un evento');
  assert.equal(talosResearchReplay(eventi).status, 'collecting');
});

test('⭐⭐⭐ L4, DAL DISCO — UN EVENTO DUPLICATO NON CONTA DUE VOLTE LA SPESA', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  /*
   * ⛔ Il caso normale, non il caso limite: un'aggiunta scritta due volte perché il processo è
   *   morto fra la scrittura e la conferma. `run.mjs` lo prevede; qui si prova che ci arrivi
   *   DAL DISCO — cioè che nulla nel percorso file → parse → replay lo trasformi in due fatti.
   */
  const finito = { kind: 'step_finished', at: 'd', stepId: 'b1:search', spend: { tokens: 1_200, searches: 2, pages: 3 }, resultRef: 'fonti/aa.txt' };
  for (const e of [
    { kind: 'run_started', at: 'a', id: 'ric-1', sessionId: 'ric-1', question: 'q', depth: 'deep', engine: 'device' },
    { kind: 'step_started', at: 'c', stepId: 'b1:search', branchId: 'b1', stepKind: 'search' },
    finito, finito,
  ]) await accodaEvento({ cartella, id: 'ric-1', evento: e });

  const { eventi } = await leggiGiornale({ cartella, id: 'ric-1' });
  assert.equal(eventi.length, 4, 'il duplicato è DAVVERO sul disco: non lo sto togliendo io prima del replay');
  const giro = talosResearchReplay(eventi);
  assert.deepEqual(talosResearchSpent(giro), { tokens: 1_200, searches: 2, pages: 3 }, '⛔ 1.200, non 2.400: contare due volte riporterebbe denaro mai speso');
  assert.equal(giro.steps.length, 1);
});

test('⭐⭐⭐ L4 — UNA CORSA REGISTRATA E RIGIOCATA DÀ LO STESSO STATO, letta due volte dallo stesso file', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  const corsa = [
    { kind: 'run_started', at: 'a', id: 'ric-1', sessionId: 'ric-1', question: 'q', depth: 'deep', engine: 'device' },
    { kind: 'plan_proposed', at: 'b', branches: [{ id: 'b1', question: 'r1', estimate: { tokens: 10, searches: 1, pages: 1 } }, { id: 'b2', question: 'r2', estimate: { tokens: 10, searches: 1, pages: 1 } }] },
    { kind: 'plan_approved', at: 'c', branches: [{ id: 'b1', question: 'r1', estimate: { tokens: 10, searches: 1, pages: 1 } }, { id: 'b2', question: 'r2', estimate: { tokens: 10, searches: 1, pages: 1 } }] },
    { kind: 'step_started', at: 'd', stepId: 'b1:search', branchId: 'b1', stepKind: 'search' },
    { kind: 'step_finished', at: 'e', stepId: 'b1:search', spend: { tokens: 500, searches: 1, pages: 1 }, resultRef: 'fonti/aa.txt' },
    { kind: 'step_started', at: 'f', stepId: 'b2:search', branchId: 'b2', stepKind: 'search' },
    { kind: 'run_pause_requested', at: 'g' },
    { kind: 'run_paused', at: 'h' },
  ];
  for (const e of corsa) await accodaEvento({ cartella, id: 'ric-1', evento: e });

  const primo = talosResearchReplay((await leggiGiornale({ cartella, id: 'ric-1' })).eventi);
  const secondo = talosResearchReplay((await leggiGiornale({ cartella, id: 'ric-1' })).eventi);
  assert.deepEqual(primo, secondo, '⛔ deterministico per costruzione: se due letture dello stesso file divergessero, nessuna ripresa sarebbe affidabile');
  assert.equal(primo.status, 'paused');
  assert.equal(primo.plan.length, 2);
  assert.deepEqual(talosResearchSpent(primo), { tokens: 500, searches: 1, pages: 1 });
});

test('⛔ L4, VERSO CONTRARIO — un evento senza `kind` è respinto alla scrittura, e un id ostile pure', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  await assert.rejects(() => accodaEvento({ cartella, id: 'ric-1', evento: { at: 'ora' } }), /vuole un .kind./);
  await assert.rejects(() => accodaEvento({ cartella, id: '../fuori', evento: { kind: 'run_paused' } }), /id di ricerca non valido/);
  assert.deepEqual(await leggiGiornale({ cartella, id: 'ric-1' }), { eventi: [], righeSaltate: 0, byte: 0 });
});

/* ─────────────────────────── 4. PIANO E FONTI TENUTE ─────────────────────────── */

test('⭐⭐ L4 — il piano si scrive e si rilegge; un piano assente è `null`, mai un errore', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  assert.equal(await leggiPiano({ cartella, id: 'ric-1' }), null);
  const piano = [{ id: 'b1', question: 'Quanto costa?', estimate: { tokens: 100, searches: 2, pages: 3 } }];
  await scriviPiano({ cartella, id: 'ric-1', piano });
  assert.deepEqual(await leggiPiano({ cartella, id: 'ric-1' }), piano);
});

test('⭐⭐⭐ L4 — una fonte tenuta è INDIRIZZATA DAL CONTENUTO: stesso testo ⇒ stesso file, mai riscritto', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  const testo = 'Il testo integrale di una pagina che abbiamo pagato per leggere.';
  const primo = await scriviFonte({ cartella, id: 'ric-1', testo });
  assert.match(primo.ref, /^fonti\/[0-9a-f]{64}\.txt$/);
  assert.equal(primo.giaPresente, false);
  const secondo = await scriviFonte({ cartella, id: 'ric-1', testo });
  assert.equal(secondo.ref, primo.ref, 'due linee d\'indagine che leggono la stessa pagina la tengono UNA volta sola');
  assert.equal(secondo.giaPresente, true, '⛔ e la seconda volta non si riscrive niente: il vincolo «non sovrascrivere» applicato senza doverselo ricordare');
  assert.equal(await leggiFonte({ cartella, id: 'ric-1', ref: primo.ref }), testo);
  assert.deepEqual(await elencaFonti({ cartella, id: 'ric-1' }), [primo.ref]);
});

test('⛔⛔⛔ L4, VERSO CONTRARIO — un `ref` ostile o inventato non legge niente fuori dalla cartella della ricerca', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  writeFileSync(join(cartella, 'segreto.txt'), 'roba di qualcun altro', 'utf8');
  for (const ostile of ['fonti/../../segreto.txt', '../segreto.txt', 'fonti/ABC.txt', 'fonti/x.txt', 'segreto.txt', '', null, 42]) {
    assert.equal(await leggiFonte({ cartella, id: 'ric-1', ref: ostile }), null, `${String(ostile)} non deve leggere niente`);
  }
  assert.deepEqual(await elencaFonti({ cartella, id: '../fuori' }), []);
});

/* ─────────────────────────── 5. IL CANCELLO SUL RECORD VERO ─────────────────────────── */

test('⭐⭐⭐ L4 — il cancello legge il RECORD RECINTATO: ≥1 affermazione e ≥1 fonte ⇒ passa, col bilancio', () => {
  const letto = rileggiRapportoRecintato(rapportoRecintato({ fonti: 2, affermazioni: 3 }));
  assert.equal(letto.ok, true);
  assert.equal(letto.ripiego, false, 'questo è il controllo vero, non il ripiego');
  assert.equal(letto.affermazioni, 3);
  assert.equal(letto.fonti.length, 2);
  assert.deepEqual(letto.bilancio, { totali: 3, sostenute: 0, inParte: 0, nonSostenute: 0, contese: 0, nonVerificate: 3 });
  assert.equal(letto.proveDistinte, 2, 'due fonti diverse portano un passaggio davvero ritrovato');
});

test('⛔⛔⛔ L4, LA FIXTURE OBBLIGATORIA — la scusa da 290 byte dell\'11/09 non passa MAI, in nessuno dei due modi', () => {
  assert.equal(rileggiRapportoRecintato(SCUSA_DEL_11_SETTEMBRE).ok, false, 'senza ripiego: non c\'è nessun record');
  assert.equal(rileggiRapportoRecintato(SCUSA_DEL_11_SETTEMBRE, { ripiegoConsentito: true }).ok, false, '⛔ e nemmeno col ripiego: non ha titolo e non ha fonti');
  assert.equal(rileggiRapportoRecintato('').ok, false);
  assert.equal(rileggiRapportoRecintato(null).ok, false);
});

test('⛔⛔ L4, VERSO CONTRARIO — un record recintato ROTTO o di una versione ignota non si recupera a metà: si respinge', () => {
  const buono = rapportoRecintato();
  for (const guasto of [
    buono.replace('"version":1', '"version":7'),
    buono.replace('```talos-research-report', '```json'),
    buono.replace(/\{"version".*\}/, '{"version":1,"claims":'),
  ]) {
    const letto = rileggiRapportoRecintato(guasto);
    assert.equal(letto.ok, false, 'un rapporto letto a metà mostrerebbe verdetti accanto ad affermazioni a cui non appartengono');
    assert.equal(letto.bilancio, null, '⛔ e un bilancio non si inventa: `null` non è «tutto a zero»');
  }
});

test('⛔⛔ L4, VERSO CONTRARIO — un record con affermazioni ma ZERO fonti è respinto, e il motivo nomina il record', () => {
  const letto = rileggiRapportoRecintato(rapportoRecintato({ fonti: 0, affermazioni: 1 }));
  assert.equal(letto.ok, false);
  assert.match(letto.motivo, /record del rapporto non elenca nessuna fonte/);
});

test('⭐⭐ L4 — il passaggio VUOTO non conta come prova: `proveDistinte` scende, le affermazioni no', () => {
  const letto = rileggiRapportoRecintato(rapportoRecintato({ fonti: 2, affermazioni: 2, passaggio: '' }));
  assert.equal(letto.ok, true, 'il cancello non giudica la qualità: dice che c\'è un artefatto rileggibile');
  assert.equal(letto.affermazioni, 2);
  assert.equal(letto.proveDistinte, 0, '⛔ ma zero prove distinte: «citata» non è «ritrovata nel testo»');
});

/* ─────────────────────────── 6. LA RIPRESA VERA, DOPO UN RIAVVIO ─────────────────────────── */

/** Un orchestratore con lo store VERO su disco — è il punto: qui si prova il giro dal disco. */
function orchestratoreSuDisco(cartella, sessioni, extra = {}) {
  const avviati = [];
  const orch = creaResearchOrchestrator({
    sessioni,
    avviaESeguiFn: (spec) => { avviati.push(spec); return { sessionId: spec.sessionId }; },
    randomUUIDFn: () => 'ric-viva',
    creaRicercaFn: (a) => creaRicerca({ ...a, cartella }),
    leggiRicercaFn: (a) => leggiRicerca({ ...a, cartella }),
    aggiornaRicercaFn: (a) => aggiornaRicerca({ ...a, cartella }),
    eliminaRicercaFn: (a) => eliminaRicerca({ ...a, cartella }),
    elencaRicercheFn: () => elencaRicerche({ cartella }),
    salvaVoceLibreriaFn: async () => 'lib-1',
    leggiVoceLibreriaFn: async () => null,
    eliminaVoceLibreriaFn: async () => {},
    ...extra,
  });
  return { orch, avviati };
}

test('⭐⭐⭐⭐ L4 §6.6 — LA RIPRESA DOPO UN RIAVVIO: un registro NUOVO, sullo stesso disco, riparte dal giornale', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));

  /* ── Vita 1: la ricerca parte e scrive il suo giornale. ── */
  const sessioniPrima = new Map();
  const primo = orchestratoreSuDisco(cartella, sessioniPrima);
  const { id } = await primo.orch.avvia({ cartella, question: 'Come stanno evolvendo gli harness?', depth: 'deep' });
  assert.equal(id, 'ric-viva');
  // Due passi veri, di cui uno rimasto IN VOLO quando il processo è morto.
  await scriviPiano({ cartella, id, piano: [{ id: 'b1', question: 'r1', estimate: { tokens: 10, searches: 1, pages: 1 } }, { id: 'b2', question: 'r2', estimate: { tokens: 10, searches: 1, pages: 1 } }] });
  await accodaEvento({ cartella, id, evento: { kind: 'plan_approved', at: 'b', branches: [{ id: 'b1', question: 'r1', estimate: { tokens: 10, searches: 1, pages: 1 } }, { id: 'b2', question: 'r2', estimate: { tokens: 10, searches: 1, pages: 1 } }] } });
  await accodaEvento({ cartella, id, evento: { kind: 'step_started', at: 'c', stepId: 'b1:search', branchId: 'b1', stepKind: 'search' } });
  await accodaEvento({ cartella, id, evento: { kind: 'step_finished', at: 'd', stepId: 'b1:search', spend: { tokens: 4_213, searches: 3, pages: 5 }, resultRef: 'fonti/aa.txt' } });
  await accodaEvento({ cartella, id, evento: { kind: 'step_started', at: 'e', stepId: 'b2:search', branchId: 'b2', stepKind: 'search' } });
  await scriviFonte({ cartella, id, testo: 'il testo della pagina già letta' });

  /* ── Il riavvio: un registro NUOVO, una voce ripristinata senza conversazione. ── */
  const sessioniDopo = new Map([[id, {
    cartella, conclusa: true, interrotta: true, messaggiFinali: null,
    taskId: 'ricerca', task: { consegna: 'La consegna originale, con le regole del deposito.', ricercaId: id },
    forkDa: null, controller: { abort() {} },
  }]]);
  const secondo = orchestratoreSuDisco(cartella, sessioniDopo);

  const esito = await secondo.orch.riprendi({ id });
  assert.equal(esito.ok, true, '⛔ prima d\'oggi qui c\'era «start a new one»: 484.171 token da ripagare per un processo morto');
  assert.match(esito.esito, /from its journal/);
  assert.equal(secondo.avviati.length, 1, 'la sessione riparte davvero');

  const consegna = secondo.avviati[0].messaggiIniziali[0].content;
  assert.match(consegna, /Come stanno evolvendo gli harness\?/, 'la domanda viene dal giornale, non da un campo in memoria');
  assert.match(consegna, /4213 tokens, 3 searches, 5 pages/, '⛔ quanto è già stato speso si DICE: è ciò che impedisce di ripagarlo');
  assert.match(consegna, /Steps already completed: b1:search/);
  assert.match(consegna, /Resume from this step: b2:search \(search\), which was in flight when the process died/, '⛔ riparte dal passo DOPO l\'ultimo committato');
  assert.match(consegna, /Lines of inquiry still open: «r2»/);
  /*
   * ⭐ L9 (12/09/2026) — «source text(s)», non più «source page(s)»: UNA PAROLA, e su una misura.
   *
   * Da oggi in `fonti/` finiscono anche gli ESTRATTI dei risultati di ricerca, non solo le
   * pagine aperte — una fonte vista e mai aperta è comunque una prova, e senza di lei la
   * verifica direbbe «la fonte citata non esiste fra quelle raccolte» per un fatto che invece è
   * vero («l'ha vista solo dall'elenco»). ⇒ il conteggio è di TESTI TENUTI, e chiamarli «pagine»
   * sarebbe un numero gonfiato detto a un modello che ci conta sopra per non ripagarle.
   */
  assert.match(consegna, /1 source text\(s\) were already fetched/);
  assert.match(consegna, /La consegna originale, con le regole del deposito\./, '⛔ senza le regole del deposito, una ricerca ripresa consegnerebbe qualcosa che il cancello respinge');

  // E il giornale registra la ripresa: un altro riavvio la vedrebbe.
  const { eventi } = await leggiGiornale({ cartella, id });
  assert.ok(eventi.some((e) => e.kind === 'run_resumed'));
  assert.equal(eventi.filter((e) => e.kind === 'step_started' && e.stepId === 'b2:search').length, 2, 'il passo in volo viene ri-annunciato');
  const giro = talosResearchReplay(eventi);
  assert.deepEqual(talosResearchSpent(giro), { tokens: 4_213, searches: 3, pages: 5 }, '⛔ e ri-annunciarlo NON raddoppia la spesa');
});

test('⛔⛔⛔ L4, VERSO CONTRARIO — una ricerca ANNULLATA non si riprende dal giornale: cancellato vuol dire cancellato', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  await creaRicerca({ cartella, id: 'ric-morta', domanda: 'x' });
  await accodaEvento({ cartella, id: 'ric-morta', evento: { kind: 'run_started', at: 'a', id: 'ric-morta', sessionId: 'ric-morta', question: 'x', depth: 'deep', engine: 'device' } });
  await accodaEvento({ cartella, id: 'ric-morta', evento: { kind: 'run_cancelled', at: 'b' } });
  const sessioni = new Map([['ric-morta', { cartella, conclusa: true, interrotta: true, messaggiFinali: null, taskId: 'ricerca', task: {}, forkDa: null, controller: { abort() {} } }]]);
  const { orch, avviati } = orchestratoreSuDisco(cartella, sessioni);
  const esito = await orch.riprendi({ id: 'ric-morta' });
  assert.equal(esito.ok, false);
  assert.match(esito.esito, /is cancelled and will not be resumed/);
  assert.equal(avviati.length, 0, '⛔ una ripresa che riaprisse un giro chiuso spenderebbe denaro su una cosa che la persona ha chiuso');
});

test('⛔⛔ L4, VERSO CONTRARIO — senza giornale (ricerca nata prima dell\'11/09) la ripresa rifiuta ONESTAMENTE, e non inventa un `run_started`', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  const sessioni = new Map([['antica', { cartella, conclusa: true, interrotta: true, messaggiFinali: null, taskId: 'ricerca', task: {}, forkDa: null, controller: { abort() {} } }]]);
  const { orch, avviati } = orchestratoreSuDisco(cartella, sessioni);
  const esito = await orch.riprendi({ id: 'antica' });
  assert.equal(esito.ok, false);
  assert.match(esito.esito, /has no journal to resume from/);
  assert.equal(avviati.length, 0);
  assert.equal(existsSync(percorsoGiornale(cartella, 'antica')), false, '⛔ un fatto che nessuno ha osservato non si scrive nel registro per far quadrare le cose');
});

test('⭐⭐ L4 — con la conversazione ANCORA in memoria vince quella (contesto esatto), e la ripresa si registra lo stesso', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  const voce = {
    cartella, conclusa: true, interrotta: false, messaggiFinali: [{ role: 'assistant', content: 'trovato A' }],
    taskId: 'ricerca', task: { consegna: 'x' }, forkDa: null, controller: { abort() {} },
  };
  const sessioni = new Map([['ric-viva', voce]]);
  const { orch, avviati } = orchestratoreSuDisco(cartella, sessioni);
  const esito = await orch.riprendi({ id: 'ric-viva' });
  assert.equal(esito.ok, true);
  assert.equal(avviati[0].messaggiIniziali.length, 2, 'i messaggi veri + la continuazione: nessun riassunto al posto del contesto');
  assert.match(avviati[0].messaggiIniziali.at(-1).content, /Continue the research/);
  assert.ok((await leggiGiornale({ cartella, id: 'ric-viva' })).eventi.some((e) => e.kind === 'run_resumed'));
});

/* ─────────────────────────── 7. L'ELENCO CHE NON MENTE PIÙ ─────────────────────────── */

test('⭐⭐⭐⭐ L4 — L\'ELENCO NON MENTE PIÙ: una `done` col rapporto valido resta `done`, una senza esce `senza-rapporto` — e il file NON si riscrive', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  const sessioni = new Map();
  const { orch } = orchestratoreSuDisco(cartella, sessioni);

  await creaRicerca({ cartella, id: 'con-rapporto', domanda: 'A' });
  await scriviRapporto({ cartella, id: 'con-rapporto', testo: rapportoRecintato({ fonti: 2, affermazioni: 2 }) });
  await aggiornaRicerca({ cartella, id: 'con-rapporto', terminata: 'done' });

  await creaRicerca({ cartella, id: 'senza-niente', domanda: 'B' });
  await aggiornaRicerca({ cartella, id: 'senza-niente', terminata: 'done', reportLibraryId: 'lib-scusa' });

  const { ricerche } = await orch.elenca({ cartella });
  const per = (id) => ricerche.find((r) => r.id === id);
  assert.equal(per('con-rapporto').stato, 'done');
  assert.deepEqual(per('con-rapporto').bilancio, { totali: 2, sostenute: 0, inParte: 0, nonSostenute: 0, contese: 0, nonVerificate: 2 }, '§6.7 — la riga guida col BILANCIO, mai col conteggio delle fonti');
  assert.equal(per('con-rapporto').proveDistinte, 2);
  assert.equal(per('senza-niente').stato, 'senza-rapporto', '⛔ è il difetto che l\'owner vedeva: «Conclusa» in lista e «senza rapporto» nel dettaglio');
  assert.equal(per('senza-niente').bilancio, null);
  assert.match(per('senza-niente').motivo, /non è leggibile|senza depositare/);

  // ⛔ Il disco resta com'era: la correzione vive nella LETTURA.
  assert.equal((await leggiRicerca({ cartella, id: 'senza-niente' })).terminata, 'done');
  assert.equal((await leggiRicerca({ cartella, id: 'senza-niente' })).reportLibraryId, 'lib-scusa');
});

test('⭐⭐⭐ L4 — LA CACHE DELL\'ELENCO è su `mtime`+`size`: non rilegge due volte lo stesso file, ma rilegge SEMPRE uno cambiato', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  await creaRicerca({ cartella, id: 'ric-1', domanda: 'A' });
  await scriviRapporto({ cartella, id: 'ric-1', testo: rapportoRecintato() });
  await aggiornaRicerca({ cartella, id: 'ric-1', terminata: 'done' });

  let letture = 0;
  let impronta = { mtimeMs: 1, size: 10 };
  const { orch } = orchestratoreSuDisco(cartella, new Map(), {
    statRapportoFn: async () => impronta,
    leggiRapportoFn: async (a) => { letture += 1; return leggiRapporto(a); },
  });

  await orch.elenca({ cartella });
  await orch.elenca({ cartella });
  await orch.elenca({ cartella });
  assert.equal(letture, 1, '⛔ tre aperture della sezione, UNA lettura: il costo che L2 temeva si paga una volta');

  // Il rapporto cambia ⇒ l'impronta cambia ⇒ il giudizio si rifà. Una cache a chiave-id sola
  // servirebbe il verdetto vecchio, cioè rifarebbe in memoria la bugia che stiamo togliendo dal disco.
  impronta = { mtimeMs: 2, size: 11 };
  await orch.elenca({ cartella });
  assert.equal(letture, 2);
});

/* ─────────────────────────── 8. L'ISTANTANEA DELLA CACHE DEL FETCH ─────────────────────────── */

test('⭐⭐⭐ L4+L6 — l\'istantanea della cache del fetch si salva accanto al giornale e RIENTRA alla ripresa', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  await creaRicerca({ cartella, id: 'ric-c', domanda: 'x' });
  await accodaEvento({ cartella, id: 'ric-c', evento: { kind: 'run_started', at: 'a', id: 'ric-c', sessionId: 'ric-c', question: 'x', depth: 'deep', engine: 'device' } });

  /*
   * ⛔ L'istantanea è costruita con `snapshot()` del modulo VERO, non a mano: così il test prova
   *   il formato che il modulo produce, non quello che io credo che produca. Il modulo è di L6 e
   *   qui è solo usato — nessun file di `src/research/` è stato toccato.
   */
  const { talosResearchFetchCache } = await import('../src/research/fetch-cache.mjs');
  const cachePiena = talosResearchFetchCache();
  cachePiena.restore({ version: 1, savedAt: 1, entries: [{ key: 'p:https://esempio.it/a', storedAt: 1, chars: 20, value: 'il testo della pagina' }] });
  await scriviIstantaneaCache({ cartella, id: 'ric-c', istantanea: cachePiena.snapshot() });
  assert.ok(existsSync(join(cartellaDellaRicerca(cartella, 'ric-c'), 'cache.json')));

  const sessioni = new Map([['ric-c', { cartella, conclusa: true, interrotta: true, messaggiFinali: null, taskId: 'ricerca', task: {}, forkDa: null, controller: { abort() {} } }]]);
  const { orch } = orchestratoreSuDisco(cartella, sessioni);
  const esito = await orch.riprendi({ id: 'ric-c' });
  assert.equal(esito.ok, true);
  assert.match(esito.esito, /1 cached pages restored/, '⛔ una ricerca ripresa non ripaga le pagine che aveva già aperto');
});

test('⛔⛔ L4+L6, VERSO CONTRARIO — un\'istantanea di versione IGNOTA o malformata si ignora, e la ripresa riesce lo stesso', async (t) => {
  for (const rotta of ['{"version":99,"entries":[]}', '{"version":1,"entries":"non un array"}', 'non e json', '']) {
    const cartella = cartellaVera();
    try {
      await creaRicerca({ cartella, id: 'ric-c', domanda: 'x' });
      await accodaEvento({ cartella, id: 'ric-c', evento: { kind: 'run_started', at: 'a', id: 'ric-c', sessionId: 'ric-c', question: 'x', depth: 'deep', engine: 'device' } });
      writeFileSync(join(cartellaDellaRicerca(cartella, 'ric-c'), 'cache.json'), rotta, 'utf8');
      const sessioni = new Map([['ric-c', { cartella, conclusa: true, interrotta: true, messaggiFinali: null, taskId: 'ricerca', task: {}, forkDa: null, controller: { abort() {} } }]]);
      const { orch, avviati } = orchestratoreSuDisco(cartella, sessioni);
      const esito = await orch.riprendi({ id: 'ric-c' });
      assert.equal(esito.ok, true, `con «${rotta.slice(0, 20)}» la ripresa deve riuscire lo stesso`);
      assert.doesNotMatch(esito.esito, /cached pages restored/, 'e non deve vantare un risparmio che non c\'è');
      assert.equal(avviati.length, 1);
    } finally {
      rmSync(cartella, { recursive: true, force: true });
    }
  }
});

test('⭐⭐ L4 — leggiIstantaneaCache: assente o illeggibile ⇒ `null`, mai un\'eccezione', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  assert.equal(await leggiIstantaneaCache({ cartella, id: 'mai-esistita' }), null);
  assert.equal(await leggiIstantaneaCache({ cartella, id: '../fuori' }), null);
});

/* ─────────────────────────── 9. IL GIRO INTERO, SU DISCO ─────────────────────────── */

test('⭐⭐⭐⭐ L4 — IL GIRO INTERO SU DISCO: avvio → deposito → conclusione ⇒ `done`, giornale coerente, niente scorie', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  let conclusione = null;
  const sessioni = new Map();
  const { orch } = orchestratoreSuDisco(cartella, sessioni, {
    avviaESeguiFn: (spec) => { conclusione = spec.onConclusioneFn; return { sessionId: spec.sessionId }; },
  });
  const { id } = await orch.avvia({ cartella, question: 'Quanto costa il caching?', depth: 'deep', padreId: 'madre-1' });

  // Il deposito, come lo fa `research_deposit` nel kernel: un file dentro la cartella della ricerca.
  await scriviRapporto({ cartella, id, testo: rapportoRecintato({ fonti: 2, affermazioni: 2 }) });
  await conclusione({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'assistant', content: 'Il rapporto è pronto.' }] } });

  const letta = await orch.leggi({ cartella, id });
  assert.equal(letta.stato, 'done');
  assert.equal(letta.motivo, null);
  assert.equal(letta.proveDistinte, 2);
  assert.equal(letta.giornale.stato, 'done', 'il giornale dice «done» perché `run_finished` è stato scritto DAVVERO');
  assert.equal(letta.giornale.righeSaltate, 0);
  assert.ok(letta.contenutoRapporto.includes('```talos-research-report'));

  // La forma su disco è quella di §6.2, e non c'è nient'altro.
  const dentro = readdirSync(cartellaDellaRicerca(cartella, id)).sort();
  /*
   * ⭐ L9 (12/09/2026) — `piano.json` È UN FILE IN PIÙ, ED È VOLUTO.
   *
   * Da oggi `avvia()` costruisce il piano (rami per profondità) prima ancora che la figlia
   * parli, lo registra nel giornale (`plan_proposed` + `plan_approved`) e lo scrive qui: è la
   * forma che §6.2 disegna da sempre e che fino a ieri restava vuota. ⛔ L'asserzione resta
   * ESATTA (`deepEqual`, non «contiene»): il punto del controllo non è quanti file ci sono, è
   * che non ne resti nessuno che nessuno ha voluto — un `.tmp-` superstite è il segno di un
   * guasto inghiottito, e quello si vede solo con un elenco chiuso.
   * ⛔ `fonti/` NON c'è in questa prova, e è corretto: qui nessuno ha aperto una pagina (la
   *   figlia è finta). La cartella nasce alla prima fonte tenuta, non all'avvio.
   */
  assert.deepEqual(dentro, ['cache.json', 'giornale.jsonl', 'meta.json', 'piano.json', 'rapporto.md'], '⛔ nessun `.tmp-` rimasto: un temporaneo superstite è il segno di un guasto inghiottito');
  assert.ok(await statRapporto({ cartella, id }));
  assert.equal(existsSync(percorsoRapporto(cartella, id)), true);
  assert.equal(readFileSync(percorsoMeta(cartella, id), 'utf8').includes('"terminata": "done"'), true);
  assert.equal(readFileSync(percorsoGiornale(cartella, id), 'utf8').includes(NOME_GIORNALE), false, 'il giornale porta fatti, non il proprio nome');
  assert.ok(NOME_META && CARTELLA_RICERCA);
});

/* ══════════ 7. BC-44 (12/09/2026) — TRANSITORIO NON È FALLITO ══════════
 *
 * Il fatto: ricerca `dec896c0`, 16 giri, 32 attrezzi, 67 testi tenuti, «Poi deposito.» — e poi
 *   {"type":"RunError","message":"Upstream idle timeout exceeded","code":"internal-error"}
 * ⇒ `terminata:'failed'`, e `POST …/ripresa` rispondeva 409. Venti minuti pagati, il giornale
 * intatto, e nessuna via per rientrarci.
 *
 * ⛔ Ogni prova qui sotto è nei DUE VERSI: una che si riprende E una che continua a NON
 *   riprendersi. Un permesso nuovo provato in un verso solo è un permesso che non si sa dove
 *   finisce.
 */

/** La conclusione VERA di una corsa caduta sul fornitore: `esito:null`, il messaggio del fornitore. */
function cadutaDelFornitore(messaggio = 'Upstream idle timeout exceeded', codice = 'internal-error') {
  return { threadId: 't', runId: 'r', ok: false, esito: null, erroreInterno: messaggio, codiceErrore: codice };
}

/** Una ricerca già a metà strada: piano, un passo pagato, un passo in volo. */
async function ricercaAMetaStrada(cartella, id) {
  const rami = [{ id: 'b1', question: 'r1', estimate: { tokens: 10, searches: 1, pages: 1 } }, { id: 'b2', question: 'r2', estimate: { tokens: 10, searches: 1, pages: 1 } }];
  await scriviPiano({ cartella, id, piano: rami });
  await accodaEvento({ cartella, id, evento: { kind: 'plan_approved', at: 'b', branches: rami } });
  await accodaEvento({ cartella, id, evento: { kind: 'step_started', at: 'c', stepId: 'b1:search', branchId: 'b1', stepKind: 'search' } });
  await accodaEvento({ cartella, id, evento: { kind: 'step_finished', at: 'd', stepId: 'b1:search', spend: { tokens: 4_213, searches: 3, pages: 5 }, resultRef: 'fonti/aa.txt' } });
  await accodaEvento({ cartella, id, evento: { kind: 'step_started', at: 'e', stepId: 'b2:search', branchId: 'b2', stepKind: 'search' } });
  await scriviFonte({ cartella, id, testo: 'il testo della pagina già letta' });
}

/** La voce di sessione come la lascia una corsa caduta col RunError: conclusa, MAI `interrotta`. */
function voceDopoLaCaduta(cartella, id) {
  return {
    cartella, conclusa: true, messaggiFinali: null,
    taskId: 'ricerca', task: { consegna: 'La consegna originale, con le regole del deposito.', ricercaId: id },
    forkDa: null, controller: { abort() {} },
  };
}

test('⭐⭐⭐⭐ BC-44 — LA TABELLA: cosa si riprende e cosa no, e l ordine che la tiene onesta', () => {
  const classe = (messaggio, codice) => classificaErroreDiCorsa({ codice, messaggio });

  // ── Transitorie: il fornitore o la rete, non la ricerca.
  assert.deepEqual(classe('Upstream idle timeout exceeded', 'internal-error'), { classe: 'timeout-fornitore', transitorio: true }, '⛔ IL CASO VERO del 12/09, verbatim dal `.jsonl` della sessione');
  assert.equal(classe('HTTP 429 dopo 4 tentativi: rate limit exceeded', 'internal-error').transitorio, true);
  assert.equal(classe('HTTP 503 dopo 4 tentativi: service unavailable', 'internal-error').classe, 'guasto-fornitore');
  assert.equal(classe('fetch failed', 'internal-error').classe, 'rete');
  assert.equal(classe('flusso SSE senza contenuto ne tool_calls', 'internal-error').classe, 'flusso-interrotto');

  // ── NON transitorie: ritentare le riprodurrebbe identiche, e costerebbe due volte.
  assert.deepEqual(classe('HTTP 401: no auth credentials found', 'internal-error'), { classe: 'credenziale', transitorio: false });
  assert.deepEqual(classe('This endpoint maximum context length is 131072 tokens', 'internal-error'), { classe: 'contesto', transitorio: false });
  assert.deepEqual(classe(null, 'CTX_TRUNCATED_SUMMARY'), { classe: 'contesto', transitorio: false });
  assert.deepEqual(classe('⛔ fermato su richiesta mentre il modello stava rispondendo.', 'internal-error'), { classe: 'fermato', transitorio: false });
  assert.deepEqual(classe(null, 'giri-esauriti'), { classe: 'giri-esauriti', transitorio: false });

  /*
   * ⛔⛔ L'ORDINE È LA CURA, e queste due righe sono la prova che morde: entrambe le frasi
   *   contengono le parole di una classe transitoria, ed entrambe NON si devono riprendere.
   *   È la stessa precedenza di Hermes (`agent/error_classifier.py`: billing prima di
   *   rate_limit) — con l'ordine sbagliato, una ricerca ripartirebbe su un conto vuoto.
   */
  assert.equal(classe('insufficient credits: you have been rate limited until you top up', 'internal-error').classe, 'credito');
  assert.equal(classe('unauthorized: the upstream provider is overloaded', 'internal-error').classe, 'credenziale');

  /*
   * ⛔ IGNOTO = NON transitorio, e DIVERGE da Hermes apposta (là `unknown → retryable=True`).
   *   Là si ritenta una chiamata; qui si riaprirebbe una corsa da venti minuti. Costi diversi,
   *   default diversi: si riprende solo ciò che si è RICONOSCIUTO.
   */
  assert.deepEqual(classe('qualcosa che non abbiamo mai visto', 'internal-error'), { classe: 'ignoto', transitorio: false });
  assert.deepEqual(classe(null, null), { classe: 'ignoto', transitorio: false }, 'e senza niente in mano non si inventa un permesso');
});

test('⭐⭐⭐⭐ BC-44 — una corsa caduta sul FORNITORE registra la causa, lo dice in italiano, e si dichiara riprendibile', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  const sessioni = new Map();
  const { orch, avviati } = orchestratoreSuDisco(cartella, sessioni, { ripresaAutomatica: false });
  const { id } = await orch.avvia({ cartella, question: 'Come stanno evolvendo gli harness?', depth: 'deep' });
  await ricercaAMetaStrada(cartella, id);

  await avviati[0].onConclusioneFn(cadutaDelFornitore());

  const suDisco = await leggiRicerca({ cartella, id });
  assert.equal(suDisco.terminata, 'failed', 'lo stato resta `failed`: il contratto non cambia, cresce');
  assert.deepEqual(suDisco.motivoErrore, {
    classe: 'timeout-fornitore', transitorio: true,
    codice: 'internal-error', messaggio: 'Upstream idle timeout exceeded',
  }, '⛔ la frase grezza del fornitore resta SUL DISCO: è la diagnosi, e senza di lei «failed» non dice niente');

  sessioni.set(id, voceDopoLaCaduta(cartella, id));
  const { ricerche } = await orch.elenca({ cartella });
  assert.equal(ricerche[0].riprendibile, true, '⛔ è il server a dire che il pulsante può esistere, non il frontend a indovinarlo');
  assert.deepEqual(ricerche[0].motivoErrore, { classe: 'timeout-fornitore', transitorio: true }, '⛔ e il messaggio grezzo NON esce: a schermo sarebbe un nome tecnico');
  assert.equal(ricerche[0].motivo, 'La ricerca si è interrotta a metà: il fornitore del modello ha chiuso la connessione mentre lavorava. Il lavoro già fatto è conservato e può riprendere da lì.');
  assert.doesNotMatch(ricerche[0].motivo, /Upstream|timeout|internal-error/, '⛔ la frase per una persona non nomina il guasto tecnico');
});

test('⭐⭐⭐⭐ BC-44 — LA RIPRESA ACCETTA quella caduta, riparte dal giornale e NON ripaga i passi già fatti', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  const sessioni = new Map();
  const { orch, avviati } = orchestratoreSuDisco(cartella, sessioni, { ripresaAutomatica: false });
  const { id } = await orch.avvia({ cartella, question: 'Come stanno evolvendo gli harness?', depth: 'deep' });
  await ricercaAMetaStrada(cartella, id);
  await avviati[0].onConclusioneFn(cadutaDelFornitore());
  sessioni.set(id, voceDopoLaCaduta(cartella, id));

  const spesaPrima = talosResearchSpent(talosResearchReplay((await leggiGiornale({ cartella, id })).eventi));
  const esito = await orch.riprendi({ id });
  assert.equal(esito.ok, true, '⛔ prima d oggi: «That research is still running: nothing to resume» ⇒ 409. Falsa due volte.');
  assert.match(esito.esito, /from its journal/);
  assert.equal(avviati.length, 2, 'la corsa riparte davvero');

  const consegna = avviati[1].messaggiIniziali[0].content;
  assert.match(consegna, /4213 tokens, 3 searches, 5 pages/, '⛔ quello che è già stato pagato si DICE al modello: è l unica cosa che gli impedisce di ripagarlo');
  assert.match(consegna, /Steps already completed: b1:search/);
  assert.match(consegna, /Resume from this step: b2:search/);
  assert.match(consegna, /1 source text\(s\) were already fetched/);

  const dopo = await leggiRicerca({ cartella, id });
  assert.equal(dopo.terminata, null, '⛔ la metadata si riapre: senza, `statoVivo` direbbe `failed` su una ricerca che sta girando');
  assert.equal(dopo.motivoErrore, null, 'e il motivo di una caduta superata non descrive più niente');

  const { eventi } = await leggiGiornale({ cartella, id });
  assert.equal(eventi.filter((e) => e.kind === 'run_resumed').length, 1);
  assert.equal(eventi.find((e) => e.kind === 'run_resumed').auto, undefined, '⛔ una ripresa CHIESTA non si marca `auto`: il tetto della ripresa automatica legge proprio quella riga');
  assert.deepEqual(talosResearchSpent(talosResearchReplay(eventi)), spesaPrima, '⛔ riprendere non ri-annuncia una spesa: i 4.213 token restano 4.213');
});

test('⛔⛔⛔ BC-44, VERSO CONTRARIO — una caduta NON transitoria resta ferma, e lo dice', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  const sessioni = new Map();
  const { orch, avviati } = orchestratoreSuDisco(cartella, sessioni, { ripresaAutomatica: false });
  const { id } = await orch.avvia({ cartella, question: 'Come stanno evolvendo gli harness?', depth: 'deep' });
  await ricercaAMetaStrada(cartella, id);
  await avviati[0].onConclusioneFn(cadutaDelFornitore('HTTP 401: no auth credentials found'));
  sessioni.set(id, voceDopoLaCaduta(cartella, id));

  assert.equal((await leggiRicerca({ cartella, id })).motivoErrore.transitorio, false);
  const { ricerche } = await orch.elenca({ cartella });
  assert.equal(ricerche[0].riprendibile, false, '⛔ il pulsante non deve nemmeno comparire: una chiave sbagliata resta sbagliata al secondo tentativo');
  assert.equal(ricerche[0].motivo, 'La ricerca non è arrivata in fondo.', 'la frase di sempre, per la causa di sempre');

  const esito = await orch.riprendi({ id });
  assert.equal(esito.ok, false, '⇒ la rotta risponde ancora 409');
  assert.match(esito.esito, /still running: nothing to resume/);
  assert.equal(avviati.length, 1, '⛔ e soprattutto: non è ripartita');
});

test('⛔⛔ BC-44, VERSO CONTRARIO — una ricerca caduta PRIMA di oggi (nessun `motivoErrore`) si comporta come ieri', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  await creaRicerca({ cartella, id: 'ric-viva', domanda: 'x' });
  await accodaEvento({ cartella, id: 'ric-viva', evento: { kind: 'run_started', at: 'a', id: 'ric-viva', sessionId: 'ric-viva', question: 'x', depth: 'deep', engine: 'device' } });
  await aggiornaRicerca({ cartella, id: 'ric-viva', terminata: 'failed' });
  const sessioni = new Map([['ric-viva', voceDopoLaCaduta(cartella, 'ric-viva')]]);
  const { orch, avviati } = orchestratoreSuDisco(cartella, sessioni);
  assert.equal((await orch.elenca({ cartella })).ricerche[0].riprendibile, false);
  const esito = await orch.riprendi({ id: 'ric-viva' });
  assert.equal(esito.ok, false, '⛔ nessuna regressione possibile: senza una causa registrata, nessun permesso nuovo');
  assert.equal(avviati.length, 0);
});

test('⛔⛔⛔ BC-44, VERSO CONTRARIO — una ricerca CONSEGNATA non riparte, nemmeno con la conversazione ancora in memoria', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  await creaRicerca({ cartella, id: 'ric-viva', domanda: 'x' });
  await aggiornaRicerca({ cartella, id: 'ric-viva', terminata: 'done', reportLibraryId: 'lib-1' });
  const voce = { ...voceDopoLaCaduta(cartella, 'ric-viva'), messaggiFinali: [{ role: 'assistant', content: 'fatto' }] };
  const { orch, avviati } = orchestratoreSuDisco(cartella, new Map([['ric-viva', voce]]));
  const esito = await orch.riprendi({ id: 'ric-viva' });
  assert.equal(esito.ok, false, '⛔ buco PREESISTENTE chiuso qui: la via A (conversazione in memoria) non guardava lo stato, e una ricerca già consegnata poteva ripartire');
  assert.match(esito.esito, /is done and will not be resumed/);
  assert.equal(avviati.length, 0);
});

test('⭐⭐⭐⭐ BC-44 — LA RIPRESA AUTOMATICA: una volta sola, dichiarata nel giornale, e mai due', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  const sessioni = new Map();
  let attese = 0;
  const { orch, avviati } = orchestratoreSuDisco(cartella, sessioni, { dormiFn: async () => { attese += 1; } });
  const { id } = await orch.avvia({ cartella, question: 'Come stanno evolvendo gli harness?', depth: 'deep' });
  await ricercaAMetaStrada(cartella, id);
  sessioni.set(id, voceDopoLaCaduta(cartella, id));

  await avviati[0].onConclusioneFn(cadutaDelFornitore());
  assert.equal(attese, 1, '⛔ si aspetta PRIMA di ritentare: ripartire nello stesso istante ricadrebbe nella finestra che ha appena fallito');
  assert.equal(avviati.length, 2, 'la ricerca è ripartita da sola');
  const primo = await leggiGiornale({ cartella, id });
  const auto = primo.eventi.filter((e) => e.kind === 'run_resumed' && e.auto === true);
  assert.equal(auto.length, 1);
  assert.equal(auto[0].causa, 'timeout-fornitore', '⛔ il giornale dice CHE È STATA AUTOMATICA e PERCHÉ: senza, un giornale rigiocato attribuirebbe a una persona una spesa decisa da un timer');
  assert.equal((await leggiRicerca({ cartella, id })).terminata, null);

  // ── E la seconda caduta NON fa ripartire niente: il tetto è uno, per ricerca.
  await avviati[1].onConclusioneFn(cadutaDelFornitore());
  assert.equal(attese, 1, '⛔ non si aspetta nemmeno: il cancello si chiude PRIMA di bruciare venti secondi');
  assert.equal(avviati.length, 2, '⛔ se due riprese automatiche non bastano, la terza la decide una persona');
  assert.equal((await leggiRicerca({ cartella, id })).terminata, 'failed');
  assert.equal((await orch.elenca({ cartella })).ricerche[0].riprendibile, true, 'a mano si può ancora: è il timer ad avere un tetto, non la persona');
});

test('⛔⛔⛔ BC-44, VERSO CONTRARIO — la ripresa automatica NON scatta senza lavoro da salvare, né su una causa non transitoria', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  const sessioni = new Map();
  const { orch, avviati } = orchestratoreSuDisco(cartella, sessioni, { dormiFn: async () => {} });
  const { id } = await orch.avvia({ cartella, question: 'Come stanno evolvendo gli harness?', depth: 'deep' });
  sessioni.set(id, voceDopoLaCaduta(cartella, id));

  // Nessun `step_finished`: caduta al primo respiro.
  await avviati[0].onConclusioneFn(cadutaDelFornitore());
  assert.equal(avviati.length, 1, '⛔ ripartire non salverebbe niente e spenderebbe il doppio');

  // Con lavoro fatto, ma per una causa che si ripeterebbe identica.
  await ricercaAMetaStrada(cartella, id);
  await avviati[0].onConclusioneFn(cadutaDelFornitore('HTTP 402: insufficient credits'));
  assert.equal(avviati.length, 1, '⛔ e un conto vuoto non si riempie ritentando');
  assert.equal((await leggiRicerca({ cartella, id })).motivoErrore.classe, 'credito');
});

test('⭐⭐⭐⭐ BC-44 — LA CAUSA DEDOTTA: una ricerca caduta PRIMA della cura si riprende lo stesso, perché il `RunError` è negli eventi della sessione', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));

  /*
   * ⛔ È esattamente la forma su disco della ricerca `dec896c0` del 12/09: `terminata:'failed'`,
   *   NESSUN `motivoErrore` (la cura non esisteva ancora), e la sola prova del guasto nel
   *   `.jsonl` della sessione. Senza la deduzione, la cura non curerebbe il caso che l'ha fatta
   *   scrivere — e i venti minuti pagati resterebbero persi.
   */
  await creaRicerca({ cartella, id: 'ric-viva', domanda: 'Come stanno evolvendo gli harness?' });
  await accodaEvento({ cartella, id: 'ric-viva', evento: { kind: 'run_started', at: 'a', id: 'ric-viva', sessionId: 'ric-viva', question: 'Come stanno evolvendo gli harness?', depth: 'deep', engine: 'device' } });
  await ricercaAMetaStrada(cartella, 'ric-viva');
  await aggiornaRicerca({ cartella, id: 'ric-viva', terminata: 'failed' });

  const voce = {
    ...voceDopoLaCaduta(cartella, 'ric-viva'),
    eventi: [
      { type: 'RunStarted', threadId: 't', runId: 'r' },
      { type: 'ToolCallResult', content: 'una pagina letta' },
      { type: 'RunError', message: 'Upstream idle timeout exceeded', code: 'internal-error' },
    ],
  };
  const { orch, avviati } = orchestratoreSuDisco(cartella, new Map([['ric-viva', voce]]), { ripresaAutomatica: false });

  const riga = (await orch.elenca({ cartella })).ricerche[0];
  assert.equal(riga.riprendibile, true, '⛔ la prova c\'era già, e nessuno la leggeva');
  assert.deepEqual(riga.motivoErrore, { classe: 'timeout-fornitore', transitorio: true });

  const esito = await orch.riprendi({ id: 'ric-viva' });
  assert.equal(esito.ok, true);
  assert.equal(avviati.length, 1, 'ed è ripartita dal giornale, senza ripagare i passi fatti');
  assert.match(avviati[0].messaggiIniziali[0].content, /4213 tokens, 3 searches, 5 pages/);
  assert.equal((await leggiRicerca({ cartella, id: 'ric-viva' })).terminata, null);
});

test('⛔⛔⛔ BC-44, VERSO CONTRARIO — il `RunError` di un giro PRECEDENTE non conta: si legge solo l\'ultimo giro', async (t) => {
  const cartella = cartellaVera();
  t.after(() => rmSync(cartella, { recursive: true, force: true }));
  await creaRicerca({ cartella, id: 'ric-viva', domanda: 'x' });
  await accodaEvento({ cartella, id: 'ric-viva', evento: { kind: 'run_started', at: 'a', id: 'ric-viva', sessionId: 'ric-viva', question: 'x', depth: 'deep', engine: 'device' } });
  await ricercaAMetaStrada(cartella, 'ric-viva');
  await aggiornaRicerca({ cartella, id: 'ric-viva', terminata: 'failed' });

  const voce = {
    ...voceDopoLaCaduta(cartella, 'ric-viva'),
    eventi: [
      { type: 'RunStarted', threadId: 't', runId: 'r1' },
      { type: 'RunError', message: 'Upstream idle timeout exceeded', code: 'internal-error' },
      // ── Il giro DOPO: ripreso, e caduto per un motivo che non si ritenta.
      { type: 'RunStarted', threadId: 't', runId: 'r2' },
      { type: 'RunError', message: 'HTTP 401: no auth credentials found', code: 'internal-error' },
    ],
  };
  const { orch, avviati } = orchestratoreSuDisco(cartella, new Map([['ric-viva', voce]]), { ripresaAutomatica: false });
  assert.deepEqual((await orch.elenca({ cartella })).ricerche[0].motivoErrore, { classe: 'credenziale', transitorio: false }, '⛔ un `RunError` di tre giri fa non dice niente sul giro appena caduto');
  assert.equal((await orch.elenca({ cartella })).ricerche[0].riprendibile, false);
  assert.equal((await orch.riprendi({ id: 'ric-viva' })).ok, false);
  assert.equal(avviati.length, 0);
});
