import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { iconaDelDominio, dominioAmmesso, MAX_BYTE_ICONA, VALIDITA_MS } from '../src/favicon-proxy.mjs';

/*
 * ⛔⛔ LE FAVICON DELLE FONTI, e perché passano dal server.
 *
 * Owner 10/09: «i favicon dei siti delle fonti non ci sono (il mobile l'ha già fatto)». Il mobile le
 * legge da card salvate su disco e VIETA di scaricarle a schermo: «fetching a favicon at display
 * time is a request to every site every time the surface is opened». Qui il browser chiede solo a
 * noi; il server prende una volta e tiene. Architettura di SearXNG (docs.searxng.org «Favicons»,
 * letto il 10/09/2026).
 *
 * ⛔ Nessuna prova qui tocca la rete: `fetchFn` è iniettato, sempre.
 */

const cartella = () => mkdtemp(join(tmpdir(), 'favicon-'));
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const rispostaPng = () => ({
  ok: true,
  headers: { get: (k) => (k.toLowerCase() === 'content-type' ? 'image/png' : null) },
  arrayBuffer: async () => PNG,
});

test('favicon: un dominio buono viene preso e servito', async () => {
  const dove = await cartella();
  const icona = await iconaDelDominio('benchlm.ai', { cartellaCache: dove, fetchFn: async () => rispostaPng() });
  assert.ok(icona);
  assert.equal(icona.tipo, 'image/png');
  assert.equal(icona.daCache, false);
  assert.deepEqual(icona.byte, PNG);
});

/* ⛔ La ragione per cui esiste la cache: la seconda volta NON si esce. */
test('favicon: la seconda volta arriva dalla cache, senza toccare la rete', async () => {
  const dove = await cartella();
  let uscite = 0;
  const fetchFn = async () => { uscite += 1; return rispostaPng(); };
  await iconaDelDominio('benchlm.ai', { cartellaCache: dove, fetchFn });
  const seconda = await iconaDelDominio('benchlm.ai', { cartellaCache: dove, fetchFn });
  assert.equal(uscite, 1, '⛔ se questo diventa 2, ogni apertura di una chat bussa a ogni sito citato');
  assert.equal(seconda.daCache, true);
  assert.deepEqual(seconda.byte, PNG);
});

/* ⛔ Anche «non ce l'ha» è una risposta, e si ricorda: senza, si riprova all'infinito per ogni sito. */
test('favicon: un sito senza icona si ricorda, e non si ritenta', async () => {
  const dove = await cartella();
  let uscite = 0;
  const fetchFn = async () => { uscite += 1; throw new Error('ENOTFOUND'); };
  assert.equal(await iconaDelDominio('nessuna.it', { cartellaCache: dove, fetchFn }), null);
  assert.equal(await iconaDelDominio('nessuna.it', { cartellaCache: dove, fetchFn }), null);
  assert.equal(uscite, 1, 'il «no» è stato tenuto');
  const file = await readdir(dove);
  const salvato = JSON.parse(await readFile(join(dove, file[0]), 'utf8'));
  assert.equal(salvato.base64, null, 'e sul disco è scritto che non ce l’ha, non un’icona vuota');
});

test('favicon: dopo la scadenza si riprova', async () => {
  const dove = await cartella();
  let uscite = 0;
  const fetchFn = async () => { uscite += 1; return rispostaPng(); };
  await iconaDelDominio('benchlm.ai', { cartellaCache: dove, fetchFn, adesso: () => 1_000_000 });
  await iconaDelDominio('benchlm.ai', { cartellaCache: dove, fetchFn, adesso: () => 1_000_000 + VALIDITA_MS + 1 });
  assert.equal(uscite, 2);
});

/*
 * ⛔⛔ LA PARTE CHE CONTA DI PIÙ: un proxy che scarica quello che gli dici è una porta aperta.
 *   Ciò che non è un dominio non viene «ripulito»: viene rifiutato.
 */
test('favicon, AL CONTRARIO: la rete interna e i percorsi arbitrari sono rifiutati', async () => {
  for (const brutto of [
    'localhost', '127.0.0.1', '10.0.0.5', '192.168.1.1', '169.254.1.1', 'qualcosa.local', 'servizio.internal',
    'esempio.it/../../etc/passwd', 'http://esempio.it', 'esempio.it:8080', 'utente:password@esempio.it',
    '', '   ', null, undefined, 'senzapunto', 'a'.repeat(300),
  ]) {
    assert.equal(dominioAmmesso(brutto), null, `doveva essere rifiutato: ${JSON.stringify(brutto)}`);
  }
  const dove = await cartella();
  let uscite = 0;
  const icona = await iconaDelDominio('localhost', { cartellaCache: dove, fetchFn: async () => { uscite += 1; return rispostaPng(); } });
  assert.equal(icona, null);
  assert.equal(uscite, 0, '⛔ un dominio rifiutato non deve nemmeno far partire la richiesta');
});

test('favicon, AL CONTRARIO: un tipo non-immagine o un file enorme non passano', async () => {
  const dove = await cartella();
  const html = {
    ok: true,
    headers: { get: () => 'text/html' },
    arrayBuffer: async () => Buffer.from('<html>non sono un’icona</html>'),
  };
  assert.equal(await iconaDelDominio('esempio.it', { cartellaCache: dove, fetchFn: async () => html }), null);

  const enorme = {
    ok: true,
    headers: { get: () => 'image/png' },
    arrayBuffer: async () => Buffer.alloc(MAX_BYTE_ICONA + 1),
  };
  assert.equal(await iconaDelDominio('grande.it', { cartellaCache: await cartella(), fetchFn: async () => enorme }), null);
});

/* ⛔ Un redirect porta ALTROVE, e «altrove» è ciò che un proxy non segue per conto di chi lo chiama. */
test('favicon: la richiesta non segue i redirect', async () => {
  const dove = await cartella();
  let opzioni = null;
  await iconaDelDominio('esempio.it', {
    cartellaCache: dove,
    fetchFn: async (_u, o) => { opzioni = o; return rispostaPng(); },
  });
  assert.equal(opzioni.redirect, 'error');
});

test('favicon: senza una cartella di cache la funzione dice di no, non esplode', async () => {
  assert.equal(await iconaDelDominio('esempio.it', { cartellaCache: null, fetchFn: async () => rispostaPng() }), null);
});
