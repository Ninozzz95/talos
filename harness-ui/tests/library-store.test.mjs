import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  CARTELLA_LIBRERIA,
  LibraryStoreError,
  cercaVoci,
  creaCursoriLibreria,
  eliminaVoce,
  elencaVoci,
  elencaVociConTesto,
  idVoceLibreriaValido,
  impaginaVoci,
  leggiBytesVoce,
  leggiVoce,
  origineVoce,
  percorsoAssolutoVoce,
  percorsoContenutoVoce,
  rinominaVoce,
  salvaVoce,
  sanificaNomeLibreria,
  tipoFileLibreria,
  trovaVoce,
} from '../src/library-store.mjs';

// ⭐ Stesso principio di skill-registry.test.mjs/hook-registry.test.mjs: cartelle VERE su disco per la logica I/O, nessun mock del filesystem.
function cartellaVera() {
  return mkdtempSync(join(tmpdir(), 'talos-library-'));
}

test('⭐ tipoFileLibreria: image/* è image, tutto il resto è document', () => {
  assert.equal(tipoFileLibreria('image/png'), 'image');
  assert.equal(tipoFileLibreria('image/jpeg'), 'image');
  assert.equal(tipoFileLibreria('text/markdown'), 'document');
  assert.equal(tipoFileLibreria('application/pdf'), 'document');
  assert.equal(tipoFileLibreria(undefined), 'document');
});

test('⭐⭐⭐ elencaVoci: nessuna cartella .harness-ui-library — [], mai un errore', async () => {
  const cartella = cartellaVera();
  try {
    assert.deepEqual(await elencaVoci({ cartella }), []);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ salvaVoce + elencaVoci: una voce vera, campi corretti, deriva fileType dal mediaType', async () => {
  const cartella = cartellaVera();
  try {
    const id = await salvaVoce({ cartella, nome: 'report.md', mediaType: 'text/markdown', origine: 'uploaded', testo: '# Report\ncontenuto vero' });
    const voci = await elencaVoci({ cartella });
    assert.equal(voci.length, 1);
    assert.equal(voci[0].id, id);
    assert.equal(voci[0].nome, 'report.md');
    assert.equal(voci[0].fileType, 'document');
    assert.equal(voci[0].origine, 'uploaded');
    assert.equal(voci[0].modello, null);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ salvaVoce: origine "generated" porta modello/provider, "uploaded" no anche se passati', async () => {
  const cartella = cartellaVera();
  try {
    const idGen = await salvaVoce({ cartella, nome: 'gen.txt', mediaType: 'text/plain', origine: 'generated', testo: 'x', modello: 'z-ai/glm-5.3-flash', provider: 'openrouter' });
    const idUp = await salvaVoce({ cartella, nome: 'up.txt', mediaType: 'text/plain', origine: 'uploaded', testo: 'y', modello: 'non-dovrebbe-comparire' });
    const voci = await elencaVoci({ cartella });
    const gen = voci.find((v) => v.id === idGen);
    const up = voci.find((v) => v.id === idUp);
    assert.equal(gen.modello, 'z-ai/glm-5.3-flash');
    assert.equal(gen.provider, 'openrouter');
    assert.equal(up.modello, null); // ⛔ AL CONTRARIO — un modello passato su una voce "uploaded" non deve mai comparire: la provenienza dichiara solo ciò che è vero
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔ AL CONTRARIO — una sottocartella SENZA meta.json non è una voce, non è un errore', async () => {
  const cartella = cartellaVera();
  try {
    mkdirSync(join(cartella, CARTELLA_LIBRERIA, 'vuota'), { recursive: true });
    const id = await salvaVoce({ cartella, nome: 'vera.txt', mediaType: 'text/plain', testo: 'x' });
    const voci = await elencaVoci({ cartella });
    assert.deepEqual(voci.map((v) => v.id), [id]);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔⛔ AL CONTRARIO — un meta.json malformato FERMA il caricamento con un errore dichiarato', async () => {
  const cartella = cartellaVera();
  try {
    mkdirSync(join(cartella, CARTELLA_LIBRERIA, 'rotta'), { recursive: true });
    writeFileSync(join(cartella, CARTELLA_LIBRERIA, 'rotta', 'meta.json'), '{ non e json');
    await assert.rejects(() => elencaVoci({ cartella }), (errore) => {
      assert.ok(errore instanceof LibraryStoreError);
      assert.equal(errore.code, 'LIBRARY_MALFORMED');
      return true;
    });
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔ salvaVoce: AL CONTRARIO, senza nome o senza contenuto viene rifiutato', async () => {
  const cartella = cartellaVera();
  try {
    await assert.rejects(() => salvaVoce({ cartella, nome: '', mediaType: 'text/plain', testo: 'x' }), LibraryStoreError);
    await assert.rejects(() => salvaVoce({ cartella, nome: 'a.txt', mediaType: 'text/plain' }), LibraryStoreError);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ leggiVoce: un documento torna il testo vero, byte per byte', async () => {
  const cartella = cartellaVera();
  try {
    const id = await salvaVoce({ cartella, nome: 'note.md', mediaType: 'text/markdown', testo: 'riga uno\nriga due' });
    const letta = await leggiVoce({ cartella, id });
    assert.equal(letta.nome, 'note.md');
    assert.equal(letta.testo, 'riga uno\nriga due');
    assert.equal(letta.immagineBase64, undefined);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ leggiVoce: un\'immagine torna base64, non testo', async () => {
  const cartella = cartellaVera();
  try {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    const id = await salvaVoce({ cartella, nome: 'foto.png', mediaType: 'image/png', origine: 'generated', base64: bytes.toString('base64') });
    const letta = await leggiVoce({ cartella, id });
    assert.equal(letta.testo, undefined);
    assert.equal(Buffer.from(letta.immagineBase64, 'base64').equals(bytes), true);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔ leggiVoce: AL CONTRARIO, un id che non esiste torna null, mai un\'eccezione', async () => {
  const cartella = cartellaVera();
  try {
    assert.equal(await leggiVoce({ cartella, id: 'lib-non-esiste' }), null);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ origineVoce: la seconda porta — mai il contenuto, solo la provenienza', async () => {
  const cartella = cartellaVera();
  try {
    const id = await salvaVoce({ cartella, nome: 'gen.md', mediaType: 'text/markdown', origine: 'generated', testo: 'segreto che origineVoce non deve mai restituire', modello: 'qwen/qwen3.8-flash', provider: 'openrouter' });
    const origine = await origineVoce({ cartella, id });
    assert.equal(origine.origine, 'generated');
    assert.equal(origine.modello, 'qwen/qwen3.8-flash');
    assert.equal(origine.provider, 'openrouter');
    assert.equal('testo' in origine, false); // ⛔ AL CONTRARIO — nessun campo testo/contenuto in questa risposta
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔ origineVoce: AL CONTRARIO, un id che non esiste torna null', async () => {
  const cartella = cartellaVera();
  try {
    assert.equal(await origineVoce({ cartella, id: 'lib-fantasma' }), null);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ elencaVociConTesto: legge il testo per i documenti, lo salta per le immagini', async () => {
  const cartella = cartellaVera();
  try {
    await salvaVoce({ cartella, nome: 'doc.txt', mediaType: 'text/plain', testo: 'parola cercabile' });
    await salvaVoce({ cartella, nome: 'img.png', mediaType: 'image/png', base64: Buffer.from([1, 2, 3]).toString('base64') });
    const voci = await elencaVociConTesto({ cartella });
    const doc = voci.find((v) => v.nome === 'doc.txt');
    const img = voci.find((v) => v.nome === 'img.png');
    assert.equal(doc.testoEstratto, 'parola cercabile');
    assert.equal(img.testoEstratto, '');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

// --- impaginaVoci: PURA, nessun I/O — costruita a mano per isolare la logica di ordinamento/filtro/cursore ---

function vocePronta(overrides) {
  return {
    id: 'lib-1', nome: 'a', mediaType: 'text/plain', fileType: 'document', origine: 'uploaded',
    creatoIl: '2026-08-29T10:00:00.000Z', aggiornatoIl: '2026-08-29T10:00:00.000Z',
    modello: null, provider: null,
    ...overrides,
  };
}

test('⭐⭐⭐ impaginaVoci: ordina più-recente-per-aggiornamento prima', () => {
  const voci = [
    vocePronta({ id: 'vecchia', aggiornatoIl: '2026-08-27T00:00:00.000Z' }),
    vocePronta({ id: 'nuova', aggiornatoIl: '2026-08-29T00:00:00.000Z' }),
    vocePronta({ id: 'media', aggiornatoIl: '2026-08-28T00:00:00.000Z' }),
  ];
  const { pagina } = impaginaVoci(voci, {}, creaCursoriLibreria());
  assert.deepEqual(pagina.map((v) => v.id), ['nuova', 'media', 'vecchia']);
});

test('⭐⭐ impaginaVoci: filtra per origine e per fileType', () => {
  const voci = [
    vocePronta({ id: 'up-doc', origine: 'uploaded', fileType: 'document' }),
    vocePronta({ id: 'gen-doc', origine: 'generated', fileType: 'document' }),
    vocePronta({ id: 'up-img', origine: 'uploaded', fileType: 'image' }),
  ];
  const cursori = creaCursoriLibreria();
  assert.deepEqual(impaginaVoci(voci, { origine: 'generated' }, cursori).pagina.map((v) => v.id), ['gen-doc']);
  assert.deepEqual(impaginaVoci(voci, { fileType: 'image' }, cursori).pagina.map((v) => v.id), ['up-img']);
});

test('⭐⭐⭐ impaginaVoci: pagina reale con nextPageToken, e il cursore continua da dove si era fermati', () => {
  const voci = Array.from({ length: 5 }, (_, i) => vocePronta({
    id: `v${i}`, aggiornatoIl: `2026-08-2${9 - i}T00:00:00.000Z`, creatoIl: `2026-08-2${9 - i}T00:00:00.000Z`,
  }));
  const cursori = creaCursoriLibreria();
  const prima = impaginaVoci(voci, { pageSize: 2 }, cursori);
  assert.deepEqual(prima.pagina.map((v) => v.id), ['v0', 'v1']);
  assert.equal(prima.totale, 5);
  assert.ok(prima.nextPageToken);
  const seconda = impaginaVoci(voci, { pageSize: 2, pageToken: prima.nextPageToken }, cursori);
  assert.deepEqual(seconda.pagina.map((v) => v.id), ['v2', 'v3']);
  assert.equal(seconda.vistiPrima, 2);
  assert.ok(seconda.nextPageToken);
  const terza = impaginaVoci(voci, { pageSize: 2, pageToken: seconda.nextPageToken }, cursori);
  assert.deepEqual(terza.pagina.map((v) => v.id), ['v4']);
  assert.equal(terza.nextPageToken, null); // ⛔ AL CONTRARIO — l'ultima pagina non offre un altro giro
});

test('⛔ impaginaVoci: AL CONTRARIO, un pageToken sconosciuto torna CURSOR_INVALID', () => {
  const risultato = impaginaVoci([vocePronta()], { pageToken: 'token-mai-esistito' }, creaCursoriLibreria());
  assert.deepEqual(risultato, { errore: 'CURSOR_INVALID' });
});

test('⛔⛔ impaginaVoci: AL CONTRARIO, continuare un cursore con filtri diversi torna FILTER_DRIFT', () => {
  const voci = Array.from({ length: 3 }, (_, i) => vocePronta({ id: `v${i}`, aggiornatoIl: `2026-08-2${9 - i}T00:00:00.000Z` }));
  const cursori = creaCursoriLibreria();
  const prima = impaginaVoci(voci, { pageSize: 1, origine: 'all' }, cursori);
  const risultato = impaginaVoci(voci, { pageSize: 1, pageToken: prima.nextPageToken, origine: 'uploaded' }, cursori);
  assert.deepEqual(risultato, { errore: 'FILTER_DRIFT' });
});

test('⛔⛔⛔ impaginaVoci: AL CONTRARIO, un cursore vivo evita duplicati/salti quando le voci cambiano fra le due chiamate', () => {
  // Simula un nuovo file arrivato fra library_list e library_list(page_token=...): il cursore ancora a "dopo v1", non a un offset numerico, quindi v-nuova non fa slittare v2/v3.
  const voci = ['v0', 'v1', 'v2'].map((id, i) => vocePronta({ id, aggiornatoIl: `2026-08-2${9 - i}T00:00:00.000Z` }));
  const cursori = creaCursoriLibreria();
  const prima = impaginaVoci(voci, { pageSize: 1 }, cursori);
  assert.deepEqual(prima.pagina.map((v) => v.id), ['v0']);
  const vociConNuova = [vocePronta({ id: 'v-nuovissima', aggiornatoIl: '2026-08-30T00:00:00.000Z' }), ...voci];
  const seconda = impaginaVoci(vociConNuova, { pageSize: 1, pageToken: prima.nextPageToken }, cursori);
  assert.deepEqual(seconda.pagina.map((v) => v.id), ['v1']); // non 'v-nuovissima' (già vista prima del cursore) né un salto
});

// --- cercaVoci: PURA ---

function docPronto(overrides) {
  return vocePronta({ testoEstratto: '', ...overrides });
}

test('⭐⭐⭐ cercaVoci: il nome pesa più del corpo, punteggio zero è escluso', () => {
  const voci = [
    docPronto({ id: 'nome-giusto', nome: 'fattura-agosto.pdf', testoEstratto: 'nulla di rilevante qui' }),
    docPronto({ id: 'solo-corpo', nome: 'altro.txt', testoEstratto: 'parla di fattura da qualche parte' }),
    docPronto({ id: 'niente', nome: 'irrilevante.txt', testoEstratto: 'zero attinenza' }),
  ];
  const { pagina, totale } = cercaVoci(voci, { query: 'fattura' });
  assert.equal(totale, 2);
  assert.deepEqual(pagina.map((v) => v.id), ['nome-giusto', 'solo-corpo']); // nome vince sul corpo
});

test('⛔ cercaVoci: AL CONTRARIO, una query senza corrispondenze torna 0 risultati, mai un fallback a caso', () => {
  const voci = [docPronto({ nome: 'a.txt', testoEstratto: 'b c d' })];
  const { pagina, totale, nextOffset } = cercaVoci(voci, { query: 'introvabile' });
  assert.deepEqual(pagina, []);
  assert.equal(totale, 0);
  assert.equal(nextOffset, null);
});

test('⭐⭐ cercaVoci: offset/nextOffset pagina i risultati reali', () => {
  const voci = Array.from({ length: 3 }, (_, i) => docPronto({ id: `m${i}`, nome: `match-${i}.txt` }));
  const { pagina, nextOffset } = cercaVoci(voci, { query: 'match', limit: 2, offset: 0 });
  assert.equal(pagina.length, 2);
  assert.equal(nextOffset, 2);
  const ultima = cercaVoci(voci, { query: 'match', limit: 2, offset: nextOffset });
  assert.equal(ultima.pagina.length, 1);
  assert.equal(ultima.nextOffset, null);
});

test('⭐ creaCursoriLibreria: una Map nuova e vuota ad ogni chiamata, mai condivisa', () => {
  const a = creaCursoriLibreria();
  const b = creaCursoriLibreria();
  assert.notEqual(a, b);
  assert.equal(a.size, 0);
});

// --- sanificaNomeLibreria: PURA — porto di talosSafeLibraryName mobile ---

test('⭐⭐⭐ sanificaNomeLibreria: separatori di percorso e caratteri di controllo diventano spazio, poi collassano', () => {
  assert.equal(sanificaNomeLibreria('report.md'), 'report.md');
  assert.equal(sanificaNomeLibreria('../../etc/passwd'), '.. etc passwd');
  assert.equal(sanificaNomeLibreria('a\\b:c*d?e"f<g>h|i'), 'a b c d e f g h i');
  assert.equal(sanificaNomeLibreria(`x${String.fromCharCode(1)}y`), 'x y');
  assert.equal(sanificaNomeLibreria(`x${String.fromCharCode(127)}y`), 'x y'); // DEL
  assert.equal(sanificaNomeLibreria('report   finale.md'), 'report finale.md');
});

test('⭐⭐ sanificaNomeLibreria: un trattino VERO non è un separatore, resta', () => {
  assert.equal(sanificaNomeLibreria('report-finale-v2.md'), 'report-finale-v2.md');
});

test('⛔ AL CONTRARIO — sanificaNomeLibreria: un nome fatto solo di separatori/punti/spazi diventa la stringa vuota', () => {
  assert.equal(sanificaNomeLibreria('///\\\\'), '');
  assert.equal(sanificaNomeLibreria('   '), '');
  assert.equal(sanificaNomeLibreria(''), '');
  assert.equal(sanificaNomeLibreria('  .nascosto.md'), 'nascosto.md'); // solo il punto INIZIALE isolato, non ogni punto
});

// --- trovaVoce: PURA — porto della risoluzione id-o-nome di library_export mobile ---

test('⭐⭐⭐ trovaVoce: un id ESATTO vince sempre, anche se combacia anche per nome', () => {
  const voci = [vocePronta({ id: 'lib-1', nome: 'a.md' }), vocePronta({ id: 'lib-2', nome: 'lib-1' })];
  assert.equal(trovaVoce(voci, 'lib-1').id, 'lib-1');
});

test('⭐⭐⭐ trovaVoce: nessun id combacia — cade sul nome, case/spazi normalizzati', () => {
  const voci = [vocePronta({ id: 'lib-1', nome: 'Report Finale.md' })];
  assert.equal(trovaVoce(voci, '  report finale.md  ').id, 'lib-1');
});

test('⛔⛔ AL CONTRARIO — trovaVoce: due voci con lo STESSO nome sono ambigue, mai una scelta a caso', () => {
  const voci = [vocePronta({ id: 'lib-1', nome: 'a.md' }), vocePronta({ id: 'lib-2', nome: 'a.md' })];
  assert.deepEqual(trovaVoce(voci, 'a.md'), { ambiguo: true });
});

test('⛔ AL CONTRARIO — trovaVoce: nessuna corrispondenza è null, mai un fuzzy-match', () => {
  const voci = [vocePronta({ id: 'lib-1', nome: 'a.md' })];
  assert.equal(trovaVoce(voci, 'a-diverso.md'), null);
});

// --- rinominaVoce / eliminaVoce: I/O su cartelle vere ---

test('⭐⭐⭐ rinominaVoce: cambia SOLO il nome, il contenuto resta byte per byte identico', async () => {
  const cartella = cartellaVera();
  try {
    const id = await salvaVoce({ cartella, nome: 'vecchio.md', mediaType: 'text/markdown', testo: 'contenuto invariato' });
    const esito = await rinominaVoce({ cartella, id, nome: 'nuovo.md' });
    assert.deepEqual(esito, { id, nomePrima: 'vecchio.md', nomeDopo: 'nuovo.md' });
    const rilette = await elencaVoci({ cartella });
    assert.equal(rilette[0].nome, 'nuovo.md');
    const letta = await leggiVoce({ cartella, id });
    assert.equal(letta.testo, 'contenuto invariato');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐ rinominaVoce: il nome viene sanificato, mai un separatore di percorso scritto su disco', async () => {
  const cartella = cartellaVera();
  try {
    const id = await salvaVoce({ cartella, nome: 'a.md', mediaType: 'text/plain', testo: 'x' });
    // '/' -> spazio -> ".. evil.md" -> il ripulitore di punti iniziali toglie l'INTERO ".. " di testa (stesso comportamento verificato per sanificaNomeLibreria da sola): risultato "evil.md", mai un percorso, mai un residuo ".." a vista.
    const esito = await rinominaVoce({ cartella, id, nome: '../evil.md' });
    assert.equal(esito.nomeDopo, 'evil.md');
    assert.ok(!esito.nomeDopo.includes('/') && !esito.nomeDopo.includes('..'));
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔⛔ AL CONTRARIO — rinominaVoce: un nome vuoto dopo la sanificazione è rifiutato, mai un file rinominato al vuoto', async () => {
  const cartella = cartellaVera();
  try {
    const id = await salvaVoce({ cartella, nome: 'a.md', mediaType: 'text/plain', testo: 'x' });
    await assert.rejects(() => rinominaVoce({ cartella, id, nome: '///' }), (errore) => {
      assert.ok(errore instanceof LibraryStoreError);
      assert.equal(errore.code, 'LIBRARY_NAME_EMPTY');
      return true;
    });
    const voci = await elencaVoci({ cartella });
    assert.equal(voci[0].nome, 'a.md', 'il nome originale non deve essere toccato dal tentativo rifiutato');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔ AL CONTRARIO — rinominaVoce: un id che non esiste torna null, mai un\'eccezione', async () => {
  const cartella = cartellaVera();
  try {
    assert.equal(await rinominaVoce({ cartella, id: 'lib-fantasma', nome: 'x.md' }), null);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐⭐ eliminaVoce: la cartella della voce sparisce DAVVERO dal disco', async () => {
  const cartella = cartellaVera();
  try {
    const id = await salvaVoce({ cartella, nome: 'da-cancellare.md', mediaType: 'text/plain', testo: 'x' });
    const esito = await eliminaVoce({ cartella, id });
    assert.deepEqual(esito, { id, nome: 'da-cancellare.md' });
    assert.deepEqual(await elencaVoci({ cartella }), []);
    assert.equal(await leggiVoce({ cartella, id }), null);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐ eliminaVoce: cancellarne una NON tocca le altre voci', async () => {
  const cartella = cartellaVera();
  try {
    const idResta = await salvaVoce({ cartella, nome: 'resta.md', mediaType: 'text/plain', testo: 'y' });
    const idVia = await salvaVoce({ cartella, nome: 'via.md', mediaType: 'text/plain', testo: 'x' });
    await eliminaVoce({ cartella, id: idVia });
    const voci = await elencaVoci({ cartella });
    assert.deepEqual(voci.map((v) => v.id), [idResta]);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔ AL CONTRARIO — eliminaVoce: un id già sparito torna null, MAI un\'eccezione ("It may already be gone")', async () => {
  const cartella = cartellaVera();
  try {
    assert.equal(await eliminaVoce({ cartella, id: 'lib-mai-esistito' }), null);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});
/*
 * ⭐⭐⭐⭐ 10/09/2026 — LA METÀ SERVER DEL CRUD DI LIBRERIA PER LA PERSONA.
 *
 * Due cose nuove nel magazzino, e questi test provano tutte e due anche AL CONTRARIO:
 *  1. `leggiBytesVoce` — i BYTE di una voce, per scaricarla. `leggiVoce` legge in `utf8` tutto ciò
 *     che non è un'immagine, e un `.docx` (uno zip) o un `.pdf` passati da lì tornano corrotti in
 *     modo irreversibile: il primo test qui sotto misura proprio quel danno, invece di raccontarlo.
 *  2. la grammatica dell'id — da oggi un id arriva anche da un segmento di indirizzo HTTP, cioè da
 *     fuori. Il test che conta non è «rifiuta i puntini»: è quello che PREPARA la trappola (un
 *     `meta.json` valido nella cartella del progetto) e verifica che senza la guardia
 *     `eliminaVoce({id:'..'})` avrebbe cancellato l'INTERO progetto.
 */

const BINARIO_CATTIVO = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0xfe, 0x00, 0x80, 0xc3, 0x28, 0x1a]);

test('⭐⭐⭐ leggiBytesVoce: i byte di un binario arrivano IDENTICI — e utf8 li avrebbe distrutti', async () => {
  const cartella = cartellaVera();
  try {
    const id = await salvaVoce({
      cartella, nome: 'relazione.docx', origine: 'generated',
      mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      base64: BINARIO_CATTIVO.toString('base64'),
    });
    const esito = await leggiBytesVoce({ cartella, id });
    assert.equal(Buffer.compare(esito.bytes, BINARIO_CATTIVO), 0, 'byte per byte, non "quasi"');
    assert.equal(esito.dimensione, BINARIO_CATTIVO.length);
    assert.equal(esito.nome, 'relazione.docx');
    assert.equal(esito.mediaType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    // La misura del danno che questa funzione evita: la strada utf8 non torna più indietro.
    const perLaStradaSbagliata = Buffer.from(BINARIO_CATTIVO.toString('utf8'), 'utf8');
    assert.notEqual(Buffer.compare(perLaStradaSbagliata, BINARIO_CATTIVO), 0, 'se questo non fallisse, il test non starebbe misurando niente');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔ AL CONTRARIO — leggiBytesVoce: un id che non esiste torna null, mai un\'eccezione', async () => {
  const cartella = cartellaVera();
  try {
    assert.equal(await leggiBytesVoce({ cartella, id: 'lib-mai-esistito' }), null);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔⛔ leggiBytesVoce: la scheda c\'è e il file no — è uno stato ROTTO dichiarato, non un "non trovato"', async () => {
  const cartella = cartellaVera();
  try {
    const id = await salvaVoce({ cartella, nome: 'x.md', mediaType: 'text/plain', testo: 'x' });
    rmSync(join(cartella, CARTELLA_LIBRERIA, id, 'contenuto'));
    await assert.rejects(() => leggiBytesVoce({ cartella, id }), (errore) => {
      assert.ok(errore instanceof LibraryStoreError);
      assert.equal(errore.code, 'LIBRARY_READ_FAILED');
      return true;
    });
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔⛔ leggiBytesVoce: oltre il tetto dello scarico si DICHIARA, mai si tronca in silenzio', async () => {
  const cartella = cartellaVera();
  try {
    const id = await salvaVoce({ cartella, nome: 'enorme.bin', mediaType: 'application/octet-stream', testo: 'finto' });
    await assert.rejects(
      () => leggiBytesVoce({ cartella, id }, { statFn: async () => ({ size: 65 * 1024 * 1024 }) }),
      (errore) => {
        assert.equal(errore.code, 'LIBRARY_TOO_LARGE');
        assert.match(errore.message, /65 MB/);
        assert.match(errore.message, /tetto 64 MB/);
        return true;
      },
    );
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐ idVoceLibreriaValido: passa ciò che salvaVoce genera davvero, respinge tutto il resto', async () => {
  const cartella = cartellaVera();
  try {
    const id = await salvaVoce({ cartella, nome: 'vera.md', mediaType: 'text/plain', testo: 'x' });
    assert.equal(idVoceLibreriaValido(id), true, 'un id vero, generato da salvaVoce, deve passare');
    assert.match(id, /^lib-/);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
  for (const cattivo of ['..', '.', '../..', 'lib/../..', 'lib\\..', '.nascosto', '', ' ', 'a/b', 'a'.repeat(129), null, undefined, 42]) {
    assert.equal(idVoceLibreriaValido(cattivo), false, `doveva rifiutare ${JSON.stringify(cattivo)}`);
  }
});

test('⭐ percorsoContenutoVoce: una mappa sola della cartella di Libreria, e null per un id che non è un nome', () => {
  assert.equal(percorsoContenutoVoce('lib-1'), `${CARTELLA_LIBRERIA}/lib-1/contenuto`);
  assert.equal(percorsoContenutoVoce('..'), null);
  assert.equal(percorsoContenutoVoce('a/b'), null);
});

test('⛔⛔⛔ AL CONTRARIO — un id con "../" non legge, non rinomina e non cancella NIENTE fuori dalla Libreria', async () => {
  const cartella = cartellaVera();
  try {
    // La trappola, armata apposta: senza la guardia sull'id, `join(cartella, '.harness-ui-library', '..')`
    // è la cartella del PROGETTO, questo meta.json la fa passare per una voce vera, e `eliminaVoce`
    // la cancella tutta con rm(recursive). Senza questo file il test passerebbe anche senza cura.
    writeFileSync(join(cartella, 'meta.json'), JSON.stringify({ nome: 'esca.md' }), 'utf8');
    writeFileSync(join(cartella, 'segreto.txt'), 'roba dell\'owner', 'utf8');
    const idVero = await salvaVoce({ cartella, nome: 'vera.md', mediaType: 'text/plain', testo: 'contenuto vero' });

    for (const cattivo of ['..', '../..', 'lib/../..', '']) {
      assert.equal(await leggiVoce({ cartella, id: cattivo }), null, `leggiVoce ha seguito ${cattivo}`);
      assert.equal(await leggiBytesVoce({ cartella, id: cattivo }), null, `leggiBytesVoce ha seguito ${cattivo}`);
      assert.equal(await origineVoce({ cartella, id: cattivo }), null, `origineVoce ha seguito ${cattivo}`);
      assert.equal(await rinominaVoce({ cartella, id: cattivo, nome: 'preso.md' }), null, `rinominaVoce ha seguito ${cattivo}`);
      assert.equal(await eliminaVoce({ cartella, id: cattivo }), null, `eliminaVoce ha seguito ${cattivo}`);
    }

    // Niente è stato toccato: né i file del progetto, né la voce vera, né l'etichetta dell'esca.
    assert.equal(readFileSync(join(cartella, 'segreto.txt'), 'utf8'), 'roba dell\'owner');
    assert.deepEqual(JSON.parse(readFileSync(join(cartella, 'meta.json'), 'utf8')), { nome: 'esca.md' });
    assert.deepEqual((await elencaVoci({ cartella })).map((v) => v.id), [idVero]);
    assert.equal((await leggiVoce({ cartella, id: idVero })).testo, 'contenuto vero');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

/* ============================================================================================
 * BC-38 (12/09/2026), owner: «mettere il percorso dei file nella Libreria… nel dettaglio anche
 * da chi sono stati creati e da quale sessione».
 *
 * ⛔ Provati nei DUE VERSI, come vuole la regola: una voce NUOVA (sessione registrata) e una
 *   VECCHIA (meta.json senza sessionId, cioè ogni voce scritta prima di oggi). E il caso che
 *   rompe tutto se nessuno lo prova: un meta.json malformato non deve far cadere l'elenco in un
 *   modo diverso da ieri.
 * ============================================================================================ */

test('⭐⭐⭐ BC-38 percorsoAssolutoVoce: il percorso che si incolla in Esplora file, e null per un id che non è un nome', () => {
  const dentro = percorsoAssolutoVoce('C:/progetto', 'lib-abc');
  assert.ok(dentro.endsWith(join(CARTELLA_LIBRERIA, 'lib-abc', 'contenuto')), dentro);
  assert.ok(dentro.startsWith('C:'), dentro);
  // ⛔ AL CONTRARIO: la stessa grammatica di percorsoContenutoVoce, mai un percorso inventato.
  assert.equal(percorsoAssolutoVoce('C:/progetto', '../fuga'), null);
  assert.equal(percorsoAssolutoVoce('C:/progetto', ''), null);
  assert.equal(percorsoAssolutoVoce('', 'lib-abc'), null);
});

test('⭐⭐⭐ BC-38 salvaVoce + elencaVoci({conProvenienza}): percorso, cartella, creatoDa e sessione di una voce NUOVA', async () => {
  const cartella = cartellaVera();
  try {
    const id = await salvaVoce({
      cartella, nome: 'rapporto.md', mediaType: 'text/markdown', origine: 'generated',
      testo: '# vero', modello: 'z-ai/glm-5.3-flash', provider: 'openrouter',
      sessionId: 'c8e9b07b', sessionNome: 'Ricerca sugli harness',
    });
    // Il legame è sul DISCO, non solo in memoria: chi riapre domani lo ritrova.
    const meta = JSON.parse(readFileSync(join(cartella, CARTELLA_LIBRERIA, id, 'meta.json'), 'utf8'));
    assert.equal(meta.sessionId, 'c8e9b07b');
    assert.equal(meta.sessionNome, 'Ricerca sugli harness');

    const [voce] = await elencaVoci({ cartella, conProvenienza: true });
    assert.equal(voce.percorso, join(cartella, CARTELLA_LIBRERIA, id, 'contenuto'));
    assert.equal(voce.cartella, cartella);
    assert.deepEqual(voce.creatoDa, { tipo: 'modello', modello: 'z-ai/glm-5.3-flash', provider: 'openrouter' });
    assert.deepEqual(voce.sessione, { id: 'c8e9b07b', nome: 'Ricerca sugli harness' });
    // ⛔ ADDITIVO: i cinque campi di ieri sono ancora lì, identici.
    assert.equal(voce.nome, 'rapporto.md');
    assert.equal(voce.fileType, 'document');
    assert.equal(voce.origine, 'generated');
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔⛔ BC-38 AL CONTRARIO — una voce VECCHIA (nessun sessionId nel meta) resta leggibile con sessione null', async () => {
  const cartella = cartellaVera();
  try {
    // Esattamente la forma che oggi c'è sul disco dell'owner: nessun modello, nessuna sessione.
    const dove = join(cartella, CARTELLA_LIBRERIA, 'lib-vecchia');
    mkdirSync(dove, { recursive: true });
    writeFileSync(join(dove, 'meta.json'), JSON.stringify({
      nome: 'File di prova - Word.docx',
      mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      origine: 'generated',
      creatoIl: '2026-09-11T18:08:49.041Z',
      aggiornatoIl: '2026-09-11T18:08:49.041Z',
    }), 'utf8');
    writeFileSync(join(dove, 'contenuto'), 'x', 'utf8');

    const [voce] = await elencaVoci({ cartella, conProvenienza: true });
    assert.equal(voce.sessione, null, 'una sessione non registrata NON si inventa');
    assert.deepEqual(voce.creatoDa, { tipo: 'modello', modello: null, provider: null });
    assert.equal(voce.percorso, join(cartella, CARTELLA_LIBRERIA, 'lib-vecchia', 'contenuto'));
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⭐⭐ BC-38: un file CARICATO è creato da una persona, e un sessionId vuoto non conta come sessione', async () => {
  const cartella = cartellaVera();
  try {
    await salvaVoce({ cartella, nome: 'caricato.txt', mediaType: 'text/plain', origine: 'uploaded', testo: 'x', sessionId: '   ' });
    const [voce] = await elencaVoci({ cartella, conProvenienza: true });
    assert.deepEqual(voce.creatoDa, { tipo: 'persona' });
    assert.equal(voce.sessione, null, 'uno spazio non è un id di sessione');
    // ⛔ E il meta non porta chiavi vuote: un campo assente è più onesto di un campo vuoto.
    const meta = JSON.parse(readFileSync(join(cartella, CARTELLA_LIBRERIA, voce.id, 'meta.json'), 'utf8'));
    assert.equal('sessionId' in meta, false);
    assert.equal('sessionNome' in meta, false);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔⛔⛔ BC-38: SENZA conProvenienza l’elenco del MODELLO è identico a ieri, campo per campo', async () => {
  const cartella = cartellaVera();
  try {
    await salvaVoce({
      cartella, nome: 'gen.md', mediaType: 'text/markdown', origine: 'generated', testo: 'x',
      modello: 'm', provider: 'p', sessionId: 's1', sessionNome: 'nome',
    });
    const [voce] = await elencaVoci({ cartella });
    assert.deepEqual(Object.keys(voce).sort(), ['aggiornatoIl', 'creatoIl', 'fileType', 'id', 'mediaType', 'modello', 'nome', 'origine', 'provider']);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});

test('⛔⛔ BC-38 AL CONTRARIO — un meta.json malformato ferma l’elenco allo STESSO modo con e senza provenienza', async () => {
  const cartella = cartellaVera();
  try {
    const dove = join(cartella, CARTELLA_LIBRERIA, 'lib-rotta');
    mkdirSync(dove, { recursive: true });
    writeFileSync(join(dove, 'meta.json'), '{ non json', 'utf8');
    await assert.rejects(() => elencaVoci({ cartella }), LibraryStoreError);
    await assert.rejects(() => elencaVoci({ cartella, conProvenienza: true }), LibraryStoreError);
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});
