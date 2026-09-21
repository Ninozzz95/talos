/*
 * L6 — la cache dei risultati web dentro la corsa.
 *
 * ⛔ La rete non viene MAI toccata: ogni «produttore» qui è una chiusura che
 * conta le proprie chiamate. È esattamente ciò che rende misurabile il lotto —
 * il numero che conta è quante volte il produttore è stato chiamato.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TALOS_RESEARCH_CACHE_SNAPSHOT_VERSION,
  talosResearchFetchCache,
  talosResearchFetchKey,
  talosResearchLimitBucket,
  talosResearchNeverCached,
  talosResearchNormalizeQuery,
  talosResearchNormalizeUrl,
} from '../../src/research/fetch-cache.mjs';

test('la chiave: due richieste uguali devono AVERE lo stesso nome', async (t) => {
  await t.test('il frammento non identifica una pagina, la query sì', () => {
    assert.equal(
      talosResearchNormalizeUrl('https://a.example/doc#sezione-3'),
      talosResearchNormalizeUrl('https://a.example/doc'),
    );
    // ⛔ E la query NON si toglie: su moltissimi siti ?id=12 e ?id=13 sono due
    // articoli diversi, e fonderli sarebbe peggio di un doppione.
    assert.notEqual(
      talosResearchNormalizeUrl('https://a.example/art?id=12'),
      talosResearchNormalizeUrl('https://a.example/art?id=13'),
    );
  });

  await t.test('la query ORDINATA: ?b=2&a=1 è la stessa richiesta di ?a=1&b=2', () => {
    assert.equal(
      talosResearchNormalizeUrl('https://a.example/x?b=2&a=1'),
      talosResearchNormalizeUrl('https://a.example/x?a=1&b=2'),
    );
  });

  await t.test('schema e host minuscoli, porta di default e barra finale via', () => {
    assert.equal(talosResearchNormalizeUrl('HTTPS://A.Example:443/doc/'), 'https://a.example/doc');
    assert.equal(talosResearchNormalizeUrl('http://a.example:80/doc'), 'http://a.example/doc');
  });

  await t.test('un indirizzo illeggibile resta sé stesso invece di lanciare in mezzo a una raccolta', () => {
    assert.equal(talosResearchNormalizeUrl('   non-un-url   '), 'non-un-url');
  });

  await t.test('la query di ricerca è insensibile a maiuscole e spazi, come Hermes', () => {
    assert.equal(talosResearchNormalizeQuery('  Quale   TABLET conviene '), 'quale tablet conviene');
    assert.equal(
      talosResearchFetchKey({ kind: 'search', query: 'Quale tablet', limit: 5 }),
      talosResearchFetchKey({ kind: 'search', query: '  quale   tablet  ', limit: 5 }),
    );
  });

  await t.test('i limiti si raggruppano: 5 e 8 condividono una voce, 5 e 30 no', () => {
    assert.equal(talosResearchLimitBucket(5), 10);
    assert.equal(talosResearchLimitBucket(8), 10);
    assert.equal(talosResearchLimitBucket(30), 50);
    assert.equal(talosResearchLimitBucket(0), 10);
    assert.equal(talosResearchLimitBucket(4_000), 100);

    assert.equal(
      talosResearchFetchKey({ kind: 'search', query: 'q', limit: 5 }),
      talosResearchFetchKey({ kind: 'search', query: 'q', limit: 8 }),
    );
    assert.notEqual(
      talosResearchFetchKey({ kind: 'search', query: 'q', limit: 5 }),
      talosResearchFetchKey({ kind: 'search', query: 'q', limit: 30 }),
    );
  });

  await t.test('il fornitore entra nella chiave: due fornitori non danno la stessa pagina', () => {
    assert.notEqual(
      talosResearchFetchKey({ kind: 'extract', url: 'https://a.example', provider: 'duckduckgo' }),
      talosResearchFetchKey({ kind: 'extract', url: 'https://a.example', provider: 'tavily' }),
    );
  });

  await t.test('la parte libera sta ULTIMA: un | dentro una query non può fingersi un confine', () => {
    const conBarra = talosResearchFetchKey({ kind: 'search', query: 'a|b', provider: 'p', limit: 5 });
    const senza = talosResearchFetchKey({ kind: 'search', query: 'a', provider: 'b', limit: 5 });
    assert.notEqual(conBarra, senza);
    assert.ok(conBarra.startsWith('search|p|10|'));
  });
});

test('gli indirizzi che non si mettono MAI in cache', async (t) => {
  await t.test('locali, privati, a etichetta sola', () => {
    for (const url of [
      'http://localhost:4174/api/v1/sessions',
      'http://127.0.0.1:8080/x',
      'http://192.168.1.10/x',
      'http://10.0.0.1/x',
      'http://172.20.3.4/x',
      'http://169.254.1.1/x',
      'http://nas.local/x',
      'http://intranet/x',
      'non-un-url',
    ]) {
      assert.equal(talosResearchNeverCached(url), true, `${url} doveva essere escluso`);
    }
  });

  await t.test('un indirizzo pubblico invece sì', () => {
    assert.equal(talosResearchNeverCached('https://arxiv.org/abs/2605.06635'), false);
    assert.equal(talosResearchNeverCached('https://172.15.0.1/x'), false);
    assert.equal(talosResearchNeverCached('https://172.32.0.1/x'), false);
  });

  /*
   * ⛔ PROVA AL CONTRARIO, e non è teorica: il 4174 è la sessione viva
   * dell'owner. Una copia vecchia di una pagina del nostro stesso prodotto è il
   * modo più efficiente di perdere una giornata a studiare un guasto che non c'è.
   */
  await t.test('il 4174 si rilegge SEMPRE: due letture, due chiamate', async () => {
    const cache = talosResearchFetchCache();
    let chiamate = 0;
    const leggi = async () => { chiamate += 1; return { text: `versione ${chiamate}` }; };

    const uno = await cache.around({ kind: 'extract', url: 'http://localhost:4174/x' }, leggi);
    const due = await cache.around({ kind: 'extract', url: 'http://localhost:4174/x' }, leggi);

    assert.equal(chiamate, 2);
    assert.equal(due.fromCache, false);
    assert.notDeepEqual(uno.value, due.value);
    assert.equal(cache.stats().skipped, 2);
  });
});

test('la cache serve, accoda, e non conserva i fallimenti', async (t) => {
  await t.test('la seconda chiamata identica non tocca il produttore', async () => {
    const cache = talosResearchFetchCache();
    let chiamate = 0;
    const leggi = async () => { chiamate += 1; return { title: 't', text: 'il passaggio' }; };

    const uno = await cache.around({ kind: 'extract', url: 'https://a.example/x' }, leggi);
    const due = await cache.around({ kind: 'extract', url: 'https://a.example/x#altra-sezione' }, leggi);

    assert.equal(chiamate, 1);
    assert.equal(uno.fromCache, false);
    assert.equal(due.fromCache, true);
    // ⛔ Byte identici: un risultato «marcato come cache» cambierebbe il
    // prefisso e brucerebbe la cache del PROMPT, cioè il numero che stiamo
    // cercando di riparare. Che venisse dalla cache si dice nel registro.
    assert.deepEqual(due.value, uno.value);
    assert.equal(cache.stats().served, 1);
  });

  await t.test('due chiamate identiche IN VOLO diventano una sola: il primo paga', async () => {
    const cache = talosResearchFetchCache();
    let chiamate = 0;
    let sblocca;
    const attesa = new Promise((r) => { sblocca = r; });
    const cerca = async () => { chiamate += 1; await attesa; return [{ url: 'https://a.example' }]; };

    const insieme = Promise.all([
      cache.around({ kind: 'search', query: 'stessa domanda', limit: 5 }, cerca),
      cache.around({ kind: 'search', query: 'STESSA  domanda', limit: 8 }, cerca),
    ]);
    sblocca();
    const [a, b] = await insieme;

    assert.equal(chiamate, 1);
    assert.equal(a.fromCache, false);
    assert.equal(b.fromCache, true);
    assert.deepEqual(b.value, a.value);
    assert.equal(cache.stats().coalesced, 1);
  });

  await t.test('un errore non si conserva: si ritenta, come dice Hermes', async () => {
    const cache = talosResearchFetchCache();
    let chiamate = 0;
    const leggi = async () => {
      chiamate += 1;
      if (chiamate === 1) throw new Error('403');
      return { text: 'poi ha funzionato' };
    };

    await assert.rejects(() => cache.around({ kind: 'extract', url: 'https://a.example/x' }, leggi), /403/);
    const seconda = await cache.around({ kind: 'extract', url: 'https://a.example/x' }, leggi);

    assert.equal(chiamate, 2);
    assert.equal(seconda.fromCache, false);
    assert.equal(cache.stats().failed, 1);
  });

  await t.test('nemmeno un `null`: «non si è potuto leggere» non è una risposta da incidere', async () => {
    const cache = talosResearchFetchCache();
    let chiamate = 0;
    const leggi = async () => { chiamate += 1; return null; };

    await cache.around({ kind: 'extract', url: 'https://a.example/x' }, leggi);
    await cache.around({ kind: 'extract', url: 'https://a.example/x' }, leggi);

    assert.equal(chiamate, 2);
    assert.equal(cache.stats().failed, 2);
  });

  await t.test('il conto torna sempre: calls = fetched + served + coalesced', async () => {
    const cache = talosResearchFetchCache();
    const leggi = async () => ({ text: 'x' });
    await cache.around({ kind: 'extract', url: 'https://a.example/1' }, leggi);
    await cache.around({ kind: 'extract', url: 'https://a.example/1' }, leggi);
    await cache.around({ kind: 'extract', url: 'https://a.example/2' }, leggi);
    await cache.around({ kind: 'extract', url: 'http://localhost:4174/x' }, leggi);

    const s = cache.stats();
    assert.equal(s.calls, s.fetched + s.served + s.coalesced);
    assert.equal(s.calls, 4);
    assert.equal(s.served, 1);
    assert.ok(s.skipped <= s.fetched, 'gli esclusi sono un sottoinsieme delle chiamate vere');
  });
});

test('scadenza, sfratto e ripresa', async (t) => {
  await t.test('senza TTL la pagina vale per tutta la corsa: un dossier dev\'essere COERENTE', async () => {
    let orologio = 0;
    const cache = talosResearchFetchCache({ now: () => orologio });
    let chiamate = 0;
    const leggi = async () => { chiamate += 1; return { text: 'x' }; };

    await cache.around({ kind: 'extract', url: 'https://a.example/x' }, leggi);
    orologio += 9 * 60 * 60 * 1000;
    await cache.around({ kind: 'extract', url: 'https://a.example/x' }, leggi);

    assert.equal(chiamate, 1);
  });

  await t.test('con un TTL, scaduta si rilegge', async () => {
    let orologio = 0;
    const cache = talosResearchFetchCache({ now: () => orologio, ttlMs: 20 * 60_000 });
    let chiamate = 0;
    const leggi = async () => { chiamate += 1; return { text: 'x' }; };

    await cache.around({ kind: 'extract', url: 'https://a.example/x' }, leggi);
    orologio += 19 * 60_000;
    await cache.around({ kind: 'extract', url: 'https://a.example/x' }, leggi);
    assert.equal(chiamate, 1);

    orologio += 2 * 60_000;
    await cache.around({ kind: 'extract', url: 'https://a.example/x' }, leggi);
    assert.equal(chiamate, 2);
  });

  await t.test('lo sfratto toglie la meno usata di recente, non la più vecchia', async () => {
    const cache = talosResearchFetchCache({ maxEntries: 2 });
    const leggi = async () => ({ text: 'x' });

    await cache.around({ kind: 'extract', url: 'https://a.example/1' }, leggi);
    await cache.around({ kind: 'extract', url: 'https://a.example/2' }, leggi);
    // La 1 torna in cima perché è stata riletta.
    await cache.around({ kind: 'extract', url: 'https://a.example/1' }, leggi);
    await cache.around({ kind: 'extract', url: 'https://a.example/3' }, leggi);

    let chiamate = 0;
    const conta = async () => { chiamate += 1; return { text: 'x' }; };
    const uno = await cache.around({ kind: 'extract', url: 'https://a.example/1' }, conta);
    const due = await cache.around({ kind: 'extract', url: 'https://a.example/2' }, conta);

    assert.equal(uno.fromCache, true, 'la 1 era stata riletta: non doveva essere sfrattata');
    assert.equal(due.fromCache, false, 'la 2 era la meno usata');
    assert.equal(chiamate, 1);
  });

  await t.test('una risposta più grande del tetto per voce non si conserva, e lo dice', async () => {
    const cache = talosResearchFetchCache({ entryMaxChars: 100 });
    let chiamate = 0;
    const leggi = async () => { chiamate += 1; return { text: 'y'.repeat(5_000) }; };

    await cache.around({ kind: 'extract', url: 'https://a.example/x' }, leggi);
    await cache.around({ kind: 'extract', url: 'https://a.example/x' }, leggi);

    assert.equal(chiamate, 2);
    assert.equal(cache.stats().oversize, 2);
  });

  /*
   * ⛔ «Vive per corsa e SOPRAVVIVE ALLA PAUSA». Ciò che è costato denaro non si
   * ripaga: è la stessa regola del giornale, applicata alle pagine.
   */
  await t.test('l\'istantanea rimette dentro ciò che era già stato pagato', async () => {
    const prima = talosResearchFetchCache();
    let chiamate = 0;
    const leggi = async () => { chiamate += 1; return { text: 'il passaggio pagato' }; };
    await prima.around({ kind: 'extract', url: 'https://a.example/x' }, leggi);

    const istantanea = JSON.parse(JSON.stringify(prima.snapshot()));
    assert.equal(istantanea.version, TALOS_RESEARCH_CACHE_SNAPSHOT_VERSION);

    const dopo = talosResearchFetchCache();
    assert.equal(dopo.restore(istantanea), 1);
    const ripresa = await dopo.around({ kind: 'extract', url: 'https://a.example/x' }, leggi);

    assert.equal(chiamate, 1, 'la ripresa ha ripagato una pagina già pagata');
    assert.equal(ripresa.fromCache, true);
    assert.deepEqual(ripresa.value, { text: 'il passaggio pagato' });
  });

  await t.test('un\'istantanea di una versione che non conosco si ignora, non fa fallire la ripresa', () => {
    const cache = talosResearchFetchCache();
    assert.equal(cache.restore({ version: 99, savedAt: 0, entries: [{ key: 'k', value: { text: 'x' } }] }), 0);
    assert.equal(cache.restore(null), 0);
    assert.equal(cache.restore({ version: TALOS_RESEARCH_CACHE_SNAPSHOT_VERSION, savedAt: 0, entries: 'non una lista' }), 0);
  });

  await t.test('una voce malformata si salta, le altre rientrano', () => {
    const cache = talosResearchFetchCache();
    const rientrate = cache.restore({
      version: TALOS_RESEARCH_CACHE_SNAPSHOT_VERSION,
      savedAt: 0,
      entries: [
        { key: 'extract|-|-|https://a.example', storedAt: 0, chars: 10, value: { text: 'buona' } },
        null,
        { storedAt: 0, chars: 10, value: { text: 'senza chiave' } },
        { key: 'extract|-|-|https://b.example', storedAt: 0, chars: 10, value: null },
      ],
    });
    assert.equal(rientrate, 1);
    assert.equal(cache.stats().entries, 1);
  });
});
