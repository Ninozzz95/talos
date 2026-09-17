import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { funzioniDichiarate, funzioniMaiChiamate, quanteVolteNominata } from '../../scripts/cancello/funzioni-morte.mjs';

test('trova una funzione dichiarata e mai chiamata', () => {
  const codice = `
    function viva() { return 1; }
    function morta() { return 2; }
    const x = viva();
  `;
  const morte = funzioniMaiChiamate(codice).map((m) => m.nome);
  assert.deepEqual(morte, ['morta']);
});

test('⛔ AL CONTRARIO — chi è nominato DENTRO UNA STRINGA non è morto', () => {
  /*
   * È la guardia che tiene in vita lo strumento. Le fonti (knip.dev, Pi Stack, 06/09/2026) dicono
   * che ts-prune è morto proprio così: falsi positivi sulle invocazioni dinamiche, e chi lo usava
   * passava più tempo a triare l'output che a correggere. Un nome dentro una mappa o un
   * `window[nome]` è una chiamata a tutti gli effetti.
   */
  const perNome = `
    function apriPannello() {}
    const azioni = { 'apri': 'apriPannello' };
    window[azioni.apri]();
  `;
  assert.deepEqual(funzioniMaiChiamate(perNome), [], 'nominata in una stringa: viva');

  const daAttributo = `
    function suClic() {}
    document.body.setAttribute('data-azione', 'suClic');
  `;
  assert.deepEqual(funzioniMaiChiamate(daAttributo), [], 'nominata in un attributo: viva');
});

test('async, ricorsione e nomi che si somigliano', () => {
  const codice = `
    async function caricaTutto() { await caricaTutto(); }
    function carica() {}
    function caricaAncora() { carica(); }
  `;
  const morte = funzioniMaiChiamate(codice).map((m) => m.nome);
  // ⛔ `caricaTutto` chiama SE STESSA e nessun altro la chiama: è morta lo stesso, e il conteggio
  //    deve accorgersene invece di lasciarsi ingannare dalla ricorsione.
  assert.ok(morte.includes('caricaAncora'), 'nessuno la chiama');
  assert.ok(!morte.includes('carica'), 'chiamata da caricaAncora: viva');
  // `carica` non deve essere confusa con `caricaTutto`/`caricaAncora`: i confini di parola contano
  assert.equal(quanteVolteNominata(codice, 'carica'), 2, 'due volte: la dichiarazione e la chiamata');
});

test('le esenzioni esistono e valgono', () => {
  const codice = 'function soloPerIlFuturo() {}';
  assert.equal(funzioniMaiChiamate(codice).length, 1);
  assert.deepEqual(funzioniMaiChiamate(codice, { esenti: ['soloPerIlFuturo'] }), []);
});

test('funzioniDichiarate non conta due volte lo stesso nome, e ignora i metodi', () => {
  const codice = `
    function a() {}
    const o = { b() { return 1; }, c: function () {} };
    async function d() {}
  `;
  const nomi = funzioniDichiarate(codice);
  assert.ok(nomi.includes('a') && nomi.includes('d'));
  assert.ok(!nomi.includes('b'), 'un metodo abbreviato non è una funzione dichiarata');
});

test('⛔ sul monolite VERO: debito residuo limitato e vecchia intro rimossa', () => {
  /*
   * Questa non è una prova sintetica: è il codice di produzione. Se un giorno qualcuno le rimuove,
   * questo test lo dice — e va aggiornato, non silenziato.
   */
  const radice = fileURLToPath(new URL('../../', import.meta.url));
  const app = readFileSync(`${radice}src/legacy/app.js`, 'utf8');
  const morte = funzioniMaiChiamate(app).map((m) => m.nome);
  assert.ok(morte.length < 20, `troppe funzioni morte (${morte.length}): o il monolite è peggiorato, o il controllo ha iniziato ad accusare i vivi`);
  assert.ok(morte.includes('costruisciConversationHero'), 'la schermata di benvenuto che nessuno costruisce');
  assert.ok(!funzioniDichiarate(app).includes('apriIntroPrimoAvvio'), 'D21: il percorso introduttivo rimosso non deve rientrare');
});
