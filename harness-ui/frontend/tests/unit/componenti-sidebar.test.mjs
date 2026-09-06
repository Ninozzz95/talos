import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nomeModello, oraCompatta, statoSessione } from '../../src/components/session-item.js';
import { LUOGHI, LUOGHI_ALTRI } from '../../src/components/nav-item.js';
import { fornitoreDelModello, nomeDaPercorso, testiPiede } from '../../src/components/workspace-footer.js';

test('WorkspaceFooter: cartella, tema e fornitore dai dati del monolite — e niente inventato', () => {
  assert.equal(nomeDaPercorso('C:\\Users\\Antonino\\Desktop\\projects\\AVM\\'), 'AVM');
  assert.equal(nomeDaPercorso('/home/nino/talos'), 'talos');
  assert.equal(nomeDaPercorso(null), null);
  assert.equal(nomeDaPercorso('C:\\'), 'C:\\'); // la radice del disco non ha un nome: si mostra com'è
  assert.equal(nomeDaPercorso('/'), '/');
  assert.equal(fornitoreDelModello('local:qwen3-8b'), 'locale');
  assert.equal(fornitoreDelModello('google/gemini-3.7-flash'), 'google');
  assert.equal(fornitoreDelModello('claude-opus-5'), null);
  assert.deepEqual(testiPiede({ cartella: null, tema: 'calm', modello: 'local:x' }), { titolo: 'Workspace locale', sotto: 'Tema Calm · locale' });
  assert.deepEqual(testiPiede({ cartella: 'D:\\lavoro\\talos', tema: 'forge', modello: 'claude-opus-5' }), { titolo: 'talos', sotto: 'Tema Forge' });
  assert.equal(testiPiede({ cartella: null, nomeAnteprima: 'nuovo-progetto', tema: 'ignoto' }).titolo, 'nuovo-progetto');
});

/*
 * Le funzioni PURE dei componenti della sidebar (Fase 2, S-01 e S-02). Il
 * markup lo prova il cancello dei componenti contro il mockup; qui si provano
 * le derivazioni, anche al VERSO CONTRARIO (regola 5-bis).
 */

test('statoSessione: l\'ordine degli stati — attesa prima di vivo, interrotta prima di conclusa', () => {
  assert.equal(statoSessione({ inAttesaApprovazione: true, conclusa: false }).classe, 'attesa');
  assert.equal(statoSessione({ conclusa: false }).classe, 'vivo');
  assert.equal(statoSessione({ conclusa: true, interrotta: true, ultimoEsito: 'successo' }).classe, 'interrotto');
  assert.equal(statoSessione({ conclusa: true, ultimoEsito: 'errore' }).testo, 'errore');
  assert.equal(statoSessione({ conclusa: true, ultimoEsito: 'errore', motivoChiusura: 'giri-finiti' }).testo, 'giri finiti');
  assert.equal(statoSessione({ conclusa: true, ultimoEsito: 'successo' }).tono, 'success');
});

test('⛔ T05-D3: una sessione uccisa dal riavvio del server NON è «in corso» — è interrotta', () => {
  /*
   * Il caso VERO che il server manda (session-registry, ripristino: `interrotta: !conclusa`):
   * `conclusa:false` E `interrotta:true`. Il test che c'era provava `{conclusa:true, interrotta:true}`,
   * una combinazione che il server non produce MAI — per questo passava con l'ordine sbagliato,
   * mentre a schermo quattro sessioni morte da due ore dicevano ancora «in corso» col pallino vivo.
   */
  const morta = statoSessione({ conclusa: false, interrotta: true });
  assert.equal(morta.classe, 'interrotto');
  assert.equal(morta.tono, null, 'niente pallino vivo su una sessione che nessuno sta eseguendo');
  assert.equal(morta.testo, 'interrotta', 'corta come le sorelle: in 180 px una frase lunga tronca e mangia il modello');
  assert.match(morta.aiuto, /Scrivi un messaggio per riprenderla/u, 'dire che è ferma non basta: il come-si-riparte vive nel titolo della riga');
  assert.equal(statoSessione({ conclusa: true, ultimoEsito: 'successo' }).aiuto, null, 'nessun titolo dove non serve');
});

test('⛔ AL CONTRARIO — una sessione DAVVERO viva resta «in corso», e chi aspetta te vince su tutto', () => {
  // `interrotta` si azzera quando un giro riparte: metterla per prima non può spegnere una sessione viva.
  assert.equal(statoSessione({ conclusa: false, interrotta: false }).classe, 'vivo');
  assert.equal(statoSessione({ conclusa: false, interrotta: false }).tono, 'live');
  // e una sessione interrotta che però aspetta una risposta chiede ancora qualcosa alla persona
  assert.equal(statoSessione({ conclusa: false, interrotta: true, inAttesaApprovazione: true }).classe, 'attesa');
});

test('statoSessione: nessun esito registrato NON è un successo (niente pallino colorato)', () => {
  const s = statoSessione({ conclusa: true });
  assert.equal(s.classe, 'ignoto');
  assert.equal(s.tono, null);
  assert.match(s.testo, /esito non registrato/u);
});

test('oraCompatta: oggi l\'ora, ieri «ieri», poi i giorni, poi la data', () => {
  const adesso = new Date('2026-09-04T18:30:00');
  assert.equal(oraCompatta('2026-09-04T18:09:00', adesso), '18:09');
  assert.equal(oraCompatta('2026-09-03T23:59:00', adesso), 'ieri');
  assert.equal(oraCompatta('2026-09-02T08:00:00', adesso), '2 g');
  assert.equal(oraCompatta('2026-08-20T08:00:00', adesso), '20/08');
  assert.equal(oraCompatta('non-una-data', adesso), '');
});

test('nomeModello: via il fornitore, mai una stringa vuota', () => {
  assert.equal(nomeModello('google/gemini-3.7-flash'), 'gemini-3.7-flash');
  assert.equal(nomeModello('claude-opus-5'), 'claude-opus-5');
  assert.equal(nomeModello(''), null);
  assert.equal(nomeModello(undefined), null);
});

test('LUOGHI: le voci del mockup, nell\'ordine, con una sola voce senza schermata (Note)', () => {
  assert.deepEqual(LUOGHI.map((l) => l.vaia), ['capability', 'board', 'libreria', 'memoria', 'attivita']);
  assert.deepEqual(LUOGHI_ALTRI.filter((l) => !l.vaia).map((l) => l.conteggio), ['note']);
});
