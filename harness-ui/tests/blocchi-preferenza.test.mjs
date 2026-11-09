/*
 * Decisione 140 dell'owner (04/11/2026): la preferenza «Blocchi vivi nelle risposte» / «Live blocks in replies», accesa di serie, che vale
 * per le conversazioni NUOVE. Sta sul SERVER (come «Dove girano i comandi» e il motore del contesto), perché una conversazione nasce anche
 * dal telefono e il registro la legge in modo sincrono alla nascita. Due porte: la riga in Impostazioni → Chat e l'attrezzo `app_settings`
 * del modello, dietro la carta; dal telefono la scrittura passa da `app-settings.apply` (la rotta del ponte che esiste già).
 * I moduli nuovi si importano dentro le prove: sulla testa di prima ogni prova è rossa per conto suo, mai l'intero file.
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

async function cartella(t) {
  const dir = await mkdtemp(join(tmpdir(), 'talos-blocchi-preferenza-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(dir));
  return dir;
}
const archivio = async (t, opzioni = {}) => {
  const { createImpostazioniChat } = await import('../src/impostazioni-chat.mjs');
  const file = join(await cartella(t), 'impostazioni-chat.json');
  return { file, crea: (o = {}) => createImpostazioniChat({ file, ...opzioni, ...o }) };
};

test('BLOCCHI-PREF-01 senza file è accesa; la scelta si salva, regge al riavvio e la risposta sincrona per una conversazione nuova la segue', async (t) => {
  const { file, crea } = await archivio(t);
  const prima = crea();
  assert.equal(prima.blocchiViviPerUnaConversazioneNuova(), true, 'di serie accesa, letta in modo sincrono');
  assert.deepEqual(await prima.leggi(), { blocchiVivi: true });
  assert.deepEqual(await prima.scrivi({ blocchiVivi: false }), { blocchiVivi: false });
  assert.equal(prima.blocchiViviPerUnaConversazioneNuova(), false);
  const dopo = crea();
  assert.deepEqual(await dopo.leggi(), { blocchiVivi: false });
  assert.equal(dopo.blocchiViviPerUnaConversazioneNuova(), false);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).schema, 'talos.chat-settings.v1');
  for (const sbagliato of [{}, { blocchiVivi: 'no' }, { blocchiVivi: 0 }, { blocchiVivi: true, altro: 1 }, null, []]) {
    await assert.rejects(() => dopo.scrivi(sbagliato), { code: 'CHAT_SETTINGS_INVALID' }, JSON.stringify(sbagliato));
  }
  assert.deepEqual(await dopo.leggi(), { blocchiVivi: false }, 'un corpo sbagliato non cambia niente');
});

test('BLOCCHI-PREF-02 un file illeggibile non decide per la persona: vale il di serie, e il problema si dice', async (t) => {
  const avvisi = [];
  const { file, crea } = await archivio(t, { avvisa: (m) => avvisi.push(m) });
  await writeFile(file, '{ rotto');
  assert.equal(crea().blocchiViviPerUnaConversazioneNuova(), true);
  assert.equal(avvisi.length, 1);
  assert.match(avvisi[0], /impostazioni-chat\.json/u);
});

test('BLOCCHI-PREF-03 GET e POST /api/v1/chat-settings: un campo solo, sì o no; un corpo sbagliato è 400 e non cambia niente; senza archivio 503', async (t) => {
  const { createHttpApp } = await import('../src/http-app.mjs');
  const { crea } = await archivio(t);
  const impostazioniChat = crea();
  const server = http.createServer(createHttpApp({ senzaGettone: 'prove', impostazioniChat }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/chat-settings`;
  const leggi = async () => { const r = await fetch(base); assert.equal(r.status, 200); return (await r.json()).data; };
  const manda = (corpo) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  assert.deepEqual(await leggi(), { blocchiVivi: true });
  const ok = await manda({ blocchiVivi: false });
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).data, { blocchiVivi: false });
  for (const corpo of [{}, { blocchiVivi: 'false' }, { blocchiVivi: true, altro: 1 }, { motore: 'legacy' }]) {
    assert.equal((await manda(corpo)).status, 400, JSON.stringify(corpo));
  }
  assert.deepEqual(await leggi(), { blocchiVivi: false });
  const spento = http.createServer(createHttpApp({ senzaGettone: 'prove' }));
  await new Promise((r) => spento.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => spento.close(r)));
  const r = await fetch(`http://127.0.0.1:${spento.address().port}/api/v1/chat-settings`);
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error.code, 'CHAT_SETTINGS_UNAVAILABLE');
});

test('BLOCCHI-PREF-04 seconda porta: `chat.liveBlocks` nel catalogo di app_settings; il modello la cambia dietro la carta, il telefono con app-settings.apply', async (t) => {
  const { voceDelCatalogo } = await import('../src/impostazioni/catalogo-impostazioni.mjs');
  const { creaFontiDelServer } = await import('../src/impostazioni/fonti-impostazioni.mjs');
  const { creaServizioImpostazioni } = await import('../src/impostazioni/servizio-impostazioni.mjs');
  const v = voceDelCatalogo('chat.liveBlocks');
  assert.ok(v, 'la voce c\'è');
  assert.deepEqual([v.sezione, v.ambito, v.dove, v.tipo, v.gruppo, v.testo.chiave], ['chat', 'app', 'server', 'sino', null, 'blocchi.settings.title']);
  assert.deepEqual([v.testo.en, v.testo.it], ['Live blocks in replies', 'Blocchi vivi nelle risposte']);

  const { crea } = await archivio(t);
  const impostazioniChat = crea();
  const s = creaServizioImpostazioni({ fonti: creaFontiDelServer({ impostazioniChat }) });
  assert.ok(s.voci().some((x) => x.chiave === 'chat.liveBlocks'), 'con l\'archivio la voce si offre');
  assert.equal(creaServizioImpostazioni({ fonti: creaFontiDelServer({}) }).voci().some((x) => x.chiave === 'chat.liveBlocks'), false, 'senza archivio no');

  const fn = s.perLaSessione({ sessionId: null });
  const elenco = (await fn('app_settings', { action: 'list', section: 'chat' }, { fase: 'esegui' })).testo;
  assert.match(elenco, /chat\.liveBlocks/u);
  const rev = Number(/Revision (\d+)/u.exec(elenco)?.[1]);
  const arg = { action: 'set', expected_revision: rev, changes: [{ key: 'chat.liveBlocks', value: false }] };
  const anteprima = await fn('app_settings', arg, { fase: 'anteprima', toolCallId: 'c1' });
  assert.equal(anteprima.carta, true, 'dietro la carta');
  assert.deepEqual(anteprima.azione.cambi.map((c) => [c.chiave, c.prima, c.dopo]), [['chat.liveBlocks', true, false]]);
  assert.equal(impostazioniChat.blocchiViviPerUnaConversazioneNuova(), true, 'la carta da sola non scrive');
  const fatto = await fn('app_settings', arg, { fase: 'esegui', toolCallId: 'c1' });
  assert.equal(fatto.ok, true, JSON.stringify(fatto));
  assert.match(fatto.testo, /^chat\.liveBlocks: true → false \(new conversations\)\./u, 'il modello sa che vale per le conversazioni nuove');
  assert.equal(impostazioniChat.blocchiViviPerUnaConversazioneNuova(), false);

  const dalTelefono = await s.applicaDallaPersona({ changes: [{ key: 'chat.liveBlocks', value: true }], origine: { tipo: 'dispositivo', dispositivoId: 'padnino0001aaaa' } });
  assert.deepEqual(dalTelefono.cambi.map((c) => [c.chiave, c.prima, c.dopo]), [['chat.liveBlocks', false, true]]);
  assert.equal(impostazioniChat.blocchiViviPerUnaConversazioneNuova(), true, 'dal telefono senza conferma sul PC: non è un gruppo a carta sempre');
});

test('BLOCCHI-PREF-05 il server del PC passa al registro la funzione della nascita (la preferenza e il dispositivo), e la preferenza vive accanto alle sorelle', async () => {
  const sorgente = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.match(sorgente, /blocchiViviPerNuoveFn: blocchiViviAllaNascita\(\(\) => impostazioniChat\.blocchiViviPerUnaConversazioneNuova\(\)\)/u);
  assert.match(sorgente, /createImpostazioniChat\(\{ file: percorsoDatiDesktop\('\.impostazioni-chat\.json'\) \}\)/u);
  const { blocchiViviAllaNascita } = await import('../src/blocchi/prompt-del-catalogo.mjs');
  let preferenza = true;
  const nascita = blocchiViviAllaNascita(() => preferenza);
  assert.equal(nascita({ dispositivo: null }), true);
  assert.equal(nascita({ dispositivo: 'padnino0001aaaa' }), false, 'fino a UI-137 una conversazione nata dal telefono resta senza');
  preferenza = false;
  assert.equal(nascita({ dispositivo: null }), false);
  assert.equal(nascita(), false);
  assert.equal(blocchiViviAllaNascita(() => { throw new Error('guasto'); })({ dispositivo: null }), true, 'un guasto della lettura vale il di serie');
});
