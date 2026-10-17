/*
 * REVISIONE AVVERSARIA di b90500cb0 (15/10/2026 sera, bugfixer) — il Doctor come lo disegna l'interfaccia, in italiano e in
 * inglese, col dato ESATTO che la rotta manda (misurato dal vivo in `harness-ui/tests/revisione-doctor-frasi.test.mjs`,
 * DOCTOR-REV-02). «[REGGE]» = attaccato, ha retto.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { controlliDoctor } from '../../src/components/doctor.js';
import { impostaLingua } from '../../src/components/lingua.js';

const base = { chiaveApi: true, shell: 'desktop', git: true, naviga: true };
const righeDi = (controlli, id) => controlli.find((c) => c.id === id).righe.join(' | ');
const CATALOGO = 'The agent runtime does not expose the requested task catalog.';
const cartelle = (n) => ({ disponibili: n > 0, conteggio: n, dettaglio: `${n} project folder${n === 1 ? '' : 's'} available.`, dettaglioChiave: 'server.doctor.folders.available', dettaglioParams: { n } });

test('DOCTOR-REV-FE-01 [REGGE] — «Servizio agente» col catalogo mancante: italiano in italiano, inglese in inglese, mai la chiave', () => {
  const dati = { ...base, ownerRuntime: { configurato: true, pronto: false, dettaglio: CATALOGO, dettaglioChiave: 'server.doctor.runtime.noTaskCatalog' } };
  impostaLingua('it');
  const it = righeDi(controlliDoctor(dati), 'runtime');
  assert.match(it, /Il runtime agente non espone l’elenco delle attività richiesto\./u);
  assert.doesNotMatch(it, /does not expose|server\.doctor/u);
  impostaLingua('en');
  const en = righeDi(controlliDoctor(dati), 'runtime');
  assert.match(en, /The agent runtime does not expose the requested task catalog\./u);
  assert.doesNotMatch(en, /server\.doctor/u);
  /* AL CONTRARIO: un server di prima (senza chiave) resta com'era, in tutte e due le lingue */
  for (const lingua of ['it', 'en']) {
    impostaLingua(lingua);
    assert.match(righeDi(controlliDoctor({ ...base, ownerRuntime: { configurato: true, pronto: false, dettaglio: CATALOGO } }), 'runtime'), /does not expose the requested task catalog/u);
  }
  impostaLingua('it');
});

test('DOCTOR-REV-FE-02 [REGGE] — cartelle: 1 al singolare e 2 al plurale nelle due lingue (il plurale lo sceglie `tn` col numero)', () => {
  impostaLingua('it');
  assert.match(righeDi(controlliDoctor({ ...base, cartelleProgetto: cartelle(1) }), 'cartelle'), /1 cartella di progetto disponibile\./u);
  assert.match(righeDi(controlliDoctor({ ...base, cartelleProgetto: cartelle(2) }), 'cartelle'), /2 cartelle di progetto disponibili\./u);
  impostaLingua('en');
  assert.match(righeDi(controlliDoctor({ ...base, cartelleProgetto: cartelle(1) }), 'cartelle'), /1 project folder available\./u);
  assert.match(righeDi(controlliDoctor({ ...base, cartelleProgetto: cartelle(2) }), 'cartelle'), /2 project folders available\./u);
  impostaLingua('it');
});
