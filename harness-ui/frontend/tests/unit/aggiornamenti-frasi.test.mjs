import test from 'node:test';
import assert from 'node:assert/strict';
import { fraseBanda, fraseStato, quandoLeggibile } from '../../src/components/aggiornamenti.js';

/* 01/10/2026 — le frasi dell'aggiornamento automatico: dicono la verità su cosa succederà, in parole di chi usa l'app. */
const ADESSO = new Date(2026, 9, 1, 22, 0);

test('AGG-FRASI-01: l ora di un controllo si legge come la dice una persona', () => {
  assert.equal(quandoLeggibile(new Date(2026, 9, 1, 21, 30).toISOString(), ADESSO), 'oggi alle 21:30');
  assert.equal(quandoLeggibile(new Date(2026, 8, 30, 9, 5).toISOString(), ADESSO), 'ieri alle 09:05');
  assert.equal(quandoLeggibile(new Date(2026, 8, 28, 18, 0).toISOString(), ADESSO), '28/09 alle 18:00');
  assert.equal(quandoLeggibile('non una data', ADESSO), null);
});

test('AGG-FRASI-02: la banda promette l installazione alla chiusura SOLO con l interruttore acceso', () => {
  const pronto = { pronto: { versione: '0.1.21' } };
  assert.equal(fraseBanda({ ...pronto, automatici: true }), 'TALOS 0.1.21 è pronto. Si installa quando chiudi l’app.');
  assert.equal(fraseBanda({ ...pronto, automatici: false }), 'TALOS 0.1.21 è pronto. Riavvia per installarlo.');
  assert.equal(fraseBanda({ automatici: true }), null, 'niente di pronto, niente banda');
});

test('AGG-FRASI-03: la riga di stato per ogni stato, e per le copie che non si aggiornano', () => {
  const base = { attivo: true, automatici: true };
  const controllo = (esito, errore = null) => ({ ...base, stato: 'fermo', ultimoControllo: { quando: new Date(2026, 9, 1, 21, 30).toISOString(), esito, errore } });
  assert.equal(fraseStato({ ...base, stato: 'controllo' }, ADESSO), 'Controllo in corso…');
  assert.equal(fraseStato({ ...base, stato: 'scaricamento' }, ADESSO), 'Scaricamento dell’aggiornamento in corso…');
  assert.equal(fraseStato({ ...base, stato: 'pronto', pronto: { versione: '0.1.21' } }, ADESSO), 'TALOS 0.1.21 è pronto. Si installa quando chiudi l’app.');
  assert.equal(fraseStato(controllo('aggiornato'), ADESSO), 'Ultimo controllo oggi alle 21:30: TALOS è aggiornato.');
  assert.equal(fraseStato(controllo('errore', 'https://api.github.com/… ha risposto 403'), ADESSO), 'Ultimo controllo oggi alle 21:30 non riuscito: https://api.github.com/… ha risposto 403');
  assert.equal(fraseStato({ ...base, stato: 'fermo', ultimoControllo: null }, ADESSO), 'Nessun controllo ancora.');
  assert.match(fraseStato({ attivo: false, motivoSpento: 'preview' }, ADESSO), /^Questa è una copia di prova: non si aggiorna da sola/);
  assert.equal(fraseStato({ attivo: false, motivoSpento: 'sviluppo' }, ADESSO), 'Questa copia di sviluppo non si aggiorna da sola.');
  assert.match(fraseStato({ attivo: false, motivoSpento: 'non-avviato' }, ADESSO), /registro/);
});

test('AGG-FRASI-04: in inglese la banda e la riga di stato sono tradotte, con i segnaposto riempiti', async () => {
  const { impostaLingua } = await import('../../src/components/lingua.js');
  impostaLingua('en');
  try {
    assert.equal(fraseBanda({ pronto: { versione: '0.1.21' }, automatici: true }), 'TALOS 0.1.21 is ready. It installs when you close the app.');
    assert.equal(fraseStato({ attivo: true, stato: 'fermo', ultimoControllo: { quando: new Date(2026, 9, 1, 21, 30).toISOString(), esito: 'aggiornato' } }, ADESSO), 'Last check today at 21:30: TALOS is up to date.');
    assert.equal(fraseStato({ attivo: false, motivoSpento: 'preview' }, ADESSO), 'This is a preview copy: it does not update on its own. Install the new version from the releases page.');
  } finally { impostaLingua('it'); }
});

test('AGG-FRASI-05: «Riavvia ora» conta i giri aperti dall elenco del server; un elenco illeggibile è «non lo so», mai zero', async () => {
  const { contaGiriInCorso, fraseConfermaRiavvio } = await import('../../src/components/aggiornamenti.js');
  const finestra = (risposta) => ({ fetch: async () => (risposta instanceof Error ? Promise.reject(risposta) : risposta) });
  const ok = (corpo) => ({ ok: true, json: async () => corpo });
  const voci = [{ conclusa: false }, { conclusa: false, interrotta: true }, { conclusa: true }, { conclusa: false, interrotta: false }, null];
  assert.equal(await contaGiriInCorso(finestra(ok({ ok: true, data: { items: voci } }))), 2);
  assert.equal(await contaGiriInCorso(finestra(ok({ items: [] }))), 0);
  assert.equal(await contaGiriInCorso(finestra({ ok: false, json: async () => ({}) })), null);
  assert.equal(await contaGiriInCorso(finestra(ok({ ok: true, data: {} }))), null);
  assert.equal(await contaGiriInCorso(finestra(new Error('rete giù'))), null);
  assert.equal(fraseConfermaRiavvio(1), 'Una sessione sta lavorando: riavviare la interrompe.');
  assert.equal(fraseConfermaRiavvio(3), '3 sessioni stanno lavorando: riavviare le interrompe.');
  assert.match(fraseConfermaRiavvio(null), /^Non riesco a sapere/);
});
