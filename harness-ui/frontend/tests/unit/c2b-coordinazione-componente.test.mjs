/*
 * C2b «Coordinazione» (owner 08/10/2026 sera) — le costanti e le due regole che l'interfaccia usa in più punti:
 * - è accesa solo se la conversazione principale dice «sempre» alla chiave `delega_sottotask` (assente = spenta, di serie), e
 *   nessun anello della catena dice «chiedi», «nega» o un valore storto: la stessa regola del server (`coordinazione.mjs`)
 *   senza il tetto, perché la modale di un agente delegato dica lo stato vero;
 * - una mappa che diventa il PREDEFINITO di una sessione nuova (preferenze, «Nuova sessione») perde la chiave: owner, «spenta di
 *   serie per le sessioni nuove» — accenderla in una conversazione non la accende nelle prossime.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { CHIAVE_COORDINAZIONE, TETTO_AVVII_DA_SOLO, coordinazioneAccesaNellaCatena, mappaPerUnaSessioneNuova } from '../../src/components/coordinazione.js';

test('C2B-UI-01 — la chiave e il tetto sono quelli del server', () => {
  assert.equal(CHIAVE_COORDINAZIONE, 'delega_sottotask');
  assert.equal(TETTO_AVVII_DA_SOLO, 20);
});

test('C2B-UI-02 — conversazione principale: accesa solo con «sempre»; assente, «chiedi», «nega» o mappa storta: spenta', () => {
  assert.equal(coordinazioneAccesaNellaCatena([{ delega_sottotask: 'sempre' }]), true);
  for (const mappa of [{}, null, undefined, { delega_sottotask: 'chiedi' }, { delega_sottotask: 'nega' }, { delega_sottotask: 'si' }, { shell: 'sempre' }, []]) {
    assert.equal(coordinazioneAccesaNellaCatena([mappa]), false, JSON.stringify(mappa));
  }
  assert.equal(coordinazioneAccesaNellaCatena([]), false, 'nessun anello: niente da dire, spenta');
  assert.equal(coordinazioneAccesaNellaCatena(null), false);
});

test('C2B-UI-02b — agente delegato: decide la conversazione principale; un anello senza la chiave eredita, uno che nega spegne', () => {
  const radiceAccesa = { delega_sottotask: 'sempre' };
  assert.equal(coordinazioneAccesaNellaCatena([{}, radiceAccesa]), true, 'la figlia senza la chiave eredita');
  assert.equal(coordinazioneAccesaNellaCatena([{ shell: 'sempre' }, {}, radiceAccesa]), true, 'anche la nipote');
  assert.equal(coordinazioneAccesaNellaCatena([{ delega_sottotask: 'sempre' }, {}]), false, 'la figlia non sta sopra la radice spenta');
  assert.equal(coordinazioneAccesaNellaCatena([{ delega_sottotask: 'nega' }, radiceAccesa]), false, 'il nega della figlia spegne');
  assert.equal(coordinazioneAccesaNellaCatena([{}, { delega_sottotask: 'chiedi' }, radiceAccesa]), false, 'il chiedi di un anello di mezzo spegne');
  assert.equal(coordinazioneAccesaNellaCatena([{ delega_sottotask: 'boh' }, radiceAccesa]), false, 'un valore storto conta come nega');
});

test('C2B-UI-02c — la stessa risposta del server su ogni catena fino a tre anelli (le due copie della regola non si separano)', async () => {
  const server = await import('../../../src/coordinazione.mjs');
  assert.equal(server.CHIAVE_COORDINAZIONE, CHIAVE_COORDINAZIONE);
  assert.equal(server.TETTO_AVVII_DA_SOLO, TETTO_AVVII_DA_SOLO);
  const anelli = [undefined, {}, { delega_sottotask: 'sempre' }, { delega_sottotask: 'chiedi' }, { delega_sottotask: 'nega' }, { delega_sottotask: 'x' }];
  let confrontate = 0;
  for (const a of anelli) for (const b of [null, ...anelli]) for (const c of [null, ...anelli]) {
    const catena = [a, b, c].filter((x) => x !== null);
    assert.equal(coordinazioneAccesaNellaCatena(catena), server.modoCoordinazione(catena).modo === 'sempre', JSON.stringify(catena));
    confrontate += 1;
  }
  assert.equal(confrontate, 6 * 7 * 7);
});

test('C2B-UI-03 — una sessione nuova non eredita Coordinazione dal predefinito, il resto sì (e la mappa di partenza non si tocca)', () => {
  const sessione = { shell: 'chiedi', delega_sottotask: 'sempre', scrivi: 'sempre' };
  assert.deepEqual(mappaPerUnaSessioneNuova(sessione), { shell: 'chiedi', scrivi: 'sempre' });
  assert.deepEqual(sessione, { shell: 'chiedi', delega_sottotask: 'sempre', scrivi: 'sempre' }, 'una copia, mai la stessa');
  assert.deepEqual(mappaPerUnaSessioneNuova({ delega_sottotask: 'sempre' }), {});
  assert.deepEqual(mappaPerUnaSessioneNuova(null), {});
  assert.deepEqual(mappaPerUnaSessioneNuova(undefined), {});
});
