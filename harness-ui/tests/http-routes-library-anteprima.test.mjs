import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createHttpApp, metodiAmmessiPerRotta } from '../src/http-app.mjs';

/*
 * ⭐⭐⭐⭐ 11/09/2026 — L'ANTEPRIMA DI UN PDF DENTRO TALOS.
 *
 * Owner, guardando il 4174: «il file deve essere visualizzato renderizzato». Per un PDF non era
 * una mancanza del frontend: erano tre intestazioni della rotta di SCARICO, misurate una per una
 * (`.claude/RAPPORTO-LIBRERIA-ANTEPRIMA-2026-09-11.md` §4) — `attachment` fa scaricare invece di
 * mostrare, `application/octet-stream` + `nosniff` impedisce al browser di trattarlo da PDF, e la
 * CSP `sandbox` senza valore spegne il lettore PDF integrato.
 *
 * ⇒ Una rotta GEMELLA, `/anteprima`, con le intestazioni opposte. Queste prove guardano le
 * INTESTAZIONI, perché sono loro il difetto: un test che si fermasse a «200 e i byte giusti»
 * sarebbe passato anche prima della cura, quando il file si scaricava invece di vedersi.
 */

const SESSIONE = 'sess-lib';
const BYTE_PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n', 'utf8');

/** Il registro finto conosce tre voci: un PDF, un markdown e niente altro. */
function registroFinto() {
  const voci = new Map([
    ['lib-pdf', { nome: 'Relazione fine mese.pdf', bytes: BYTE_PDF }],
    ['lib-pdf-maiuscolo', { nome: 'URLANTE.PDF', bytes: BYTE_PDF }],
    ['lib-md', { nome: 'appunti.md', bytes: Buffer.from('# titolo', 'utf8') }],
  ]);
  return {
    esiste: (id) => id === SESSIONE,
    async scaricaVoceLibreria(sessionId, voceId) {
      if (sessionId !== SESSIONE) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      const voce = voci.get(voceId);
      if (!voce) return { erroreAvvio: 'Questa voce della Libreria non esiste', code: 'LIBRARY_NOT_FOUND' };
      return { ok: true, ...voce };
    },
  };
}

async function listen(t) {
  const app = createHttpApp({
    staticHandler: async () => null,
    listaTaskDisponibili: () => [],
    elencaCartelleProgetto: () => [],
    sessionRegistry: registroFinto(),
  });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

const anteprima = (base, voceId) => fetch(`${base}/api/v1/sessions/${SESSIONE}/library/${voceId}/anteprima`);

test('⭐⭐⭐⭐ un PDF esce IN LINEA, col suo tipo vero e una CSP che lascia vivere il lettore del browser', async (t) => {
  const base = await listen(t);
  const risposta = await anteprima(base, 'lib-pdf');

  assert.equal(risposta.status, 200);
  assert.equal(risposta.headers.get('content-type'), 'application/pdf', 'senza il tipo vero il browser non può mostrarlo (difetto 2 dei tre misurati)');
  assert.match(risposta.headers.get('content-disposition'), /^inline; filename="/, 'inline, non attachment: era il difetto 1 — un iframe lo SCARICAVA');
  assert.match(risposta.headers.get('content-disposition'), /filename\*=UTF-8''/, 'le due forme del nome restano, come nello scarico (RFC 6266)');
  assert.equal(
    risposta.headers.get('content-security-policy'),
    "default-src 'none'; sandbox allow-scripts; object-src 'none'",
    'era il difetto 3: `sandbox` senza valore spegne il lettore PDF; `allow-scripts` è il minimo che gli serve, e i plugin restano vietati',
  );
  assert.equal(risposta.headers.get('x-content-type-options'), 'nosniff', 'il tipo lo decidiamo noi dall’estensione: al browser resta vietato indovinarne un altro');
  assert.equal(risposta.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(Buffer.from(await risposta.arrayBuffer()), BYTE_PDF, 'i byte sono gli stessi dello scarico: cambiano le intestazioni, non il file');

  const maiuscolo = await anteprima(base, 'lib-pdf-maiuscolo');
  assert.equal(maiuscolo.status, 200, '.PDF è la stessa cosa di .pdf: l’estensione non è sensibile alle maiuscole');
});

test('⛔⛔⛔ AL CONTRARIO — ogni altra estensione è 404: questa NON è una porta generica per servire byte in linea', async (t) => {
  const base = await listen(t);
  const risposta = await anteprima(base, 'lib-md');
  assert.equal(risposta.status, 404);
  const corpo = await risposta.json();
  assert.equal(corpo.error.code, 'NOT_FOUND', 'la voce esiste eccome: a non esistere è la sua anteprima — codice diverso da LIBRARY_NOT_FOUND');
  assert.equal(corpo.ok, false);
});

test('⛔⛔ le due assenze restano distinte: voce inesistente e sessione inesistente', async (t) => {
  const base = await listen(t);
  const senzaVoce = await anteprima(base, 'mai-esistita');
  assert.equal(senzaVoce.status, 404);
  assert.equal((await senzaVoce.json()).error.code, 'LIBRARY_NOT_FOUND');

  const senzaSessione = await fetch(`${base}/api/v1/sessions/altra/library/lib-pdf/anteprima`);
  assert.equal(senzaSessione.status, 404);
  assert.equal((await senzaSessione.json()).error.code, 'NOT_FOUND');
});

test('⛔ una query in coda è 400, e il metodo sbagliato è 405 con l’Allow vero', async (t) => {
  const base = await listen(t);
  const conQuery = await fetch(`${base}/api/v1/sessions/${SESSIONE}/library/lib-pdf/anteprima?scarica=1`);
  assert.equal(conQuery.status, 400);
  assert.equal((await conQuery.json()).error.code, 'QUERY_INVALID');

  const metodoSbagliato = await fetch(`${base}/api/v1/sessions/${SESSIONE}/library/lib-pdf/anteprima`, { method: 'POST' });
  assert.equal(metodoSbagliato.status, 405);
  assert.equal(metodoSbagliato.headers.get('allow'), 'GET, HEAD');
  assert.deepEqual(metodiAmmessiPerRotta(`/api/v1/sessions/x/library/y/anteprima`), ['GET', 'HEAD'], 'la rotta è nell’inventario: senza, risponderebbe 404 dove deve dire 405');
});

test('⛔⛔⛔ LA GEMELLA NON È CAMBIATA — lo SCARICO resta ostile: attachment, byte anonimi, niente plugin', async (t) => {
  // Se un giorno qualcuno «semplificasse» unendo le due rotte, il download tornerebbe a essere
  // eseguibile in linea: questa prova è il guardiano di quel confine.
  const base = await listen(t);
  const scarico = await fetch(`${base}/api/v1/sessions/${SESSIONE}/library/lib-pdf/file`);
  assert.equal(scarico.status, 200);
  assert.equal(scarico.headers.get('content-type'), 'application/octet-stream');
  assert.match(scarico.headers.get('content-disposition'), /^attachment;/);
  assert.equal(scarico.headers.get('content-security-policy'), "default-src 'none'; sandbox");
});
