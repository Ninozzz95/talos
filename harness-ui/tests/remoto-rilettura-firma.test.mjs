/*
 * 27/10/2026 — i file del remoto si rileggono quando CAMBIANO sul disco, come Hermes (`gateway/pairing.py:397-415`: impronta dello stat
 * del file aperto; `utils.py:40-60`: `file_signature` + finestra «racily clean» di 2 s). Prima l'elenco dei dispositivi e i consensi delle
 * cartelle si leggevano UNA volta per processo: con la finestra e `talos remote` (CLI) sullo stesso profilo, un telefono revocato
 * dall'altro processo restava ammesso qui, e la scrittura successiva di questo processo rimetteva in vita la voce revocata.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const imp = (p) => import(new URL(`../${p}`, import.meta.url).href);
const { rimuoviCartellaDiProva } = await imp('tests/aiuto/rimuovi-cartella-di-prova.mjs');
const { creaElencoDispositivi } = await imp('src/remoto/dispositivi.mjs');

const cartella = (t) => { const c = mkdtempSync(join(tmpdir(), 'rilettura-firma-')); t.after(() => rimuoviCartellaDiProva(c)); return c; };
/* fuori dalla finestra incerta di 2 s: la prova non dipende dal tempo */
const invecchia = (file, secondi = 10) => { const t = new Date(Date.now() - secondi * 1000); utimesSync(file, t, t); };
/** «un altro processo» scrive il file: lo stesso formato, un'altra copia in memoria */
const scriviDaFuori = (file, trasforma) => {
  writeFileSync(file, JSON.stringify(trasforma(JSON.parse(readFileSync(file, 'utf8')))));
  invecchia(file, 8);
};

test('RILETTURA-01 un telefono revocato da un altro processo non resta ammesso qui, e la scrittura dopo non lo rimette in vita', async (t) => {
  const file = join(cartella(t), 'telefoni.json');
  const qui = creaElencoDispositivi({ file });
  const tel = await qui.aggiungi({ endpointId: 'ep-1', nome: 'Pad' });
  const altro = await qui.aggiungi({ endpointId: 'ep-2', nome: 'Telefono' });
  invecchia(file);
  assert.ok(await qui.ammesso('ep-1'), 'premessa: ammesso');
  scriviDaFuori(file, (d) => ({ ...d, dispositivi: d.dispositivi.map((v) => (v.id === tel.id ? { ...v, revocatoAlle: 123, revocatoDa: 'pc' } : v)) }));
  assert.equal(await qui.ammesso('ep-1'), null, 'revocato dall\'altro processo: qui non è più ammesso');
  await qui.rinomina(altro.id, 'Telefono nuovo');
  const dopo = JSON.parse(readFileSync(file, 'utf8')).dispositivi.find((v) => v.id === tel.id);
  assert.equal(dopo.revocatoAlle, 123, 'la scrittura di questo processo non riporta in vita il revocato');
});

test('RILETTURA-02 AL CONTRARIO: senza cambi sul disco la copia in memoria resta quella (nessuna lettura in più), e un file illeggibile si dice', async (t) => {
  const file = join(cartella(t), 'telefoni.json');
  let letture = 0;
  const fs = await import('node:fs/promises');
  const contato = { ...fs, readFile: (...a) => { letture += 1; return fs.readFile(...a); } };
  const qui = creaElencoDispositivi({ file, fs: contato });
  await qui.aggiungi({ endpointId: 'ep-1', nome: 'Pad' });
  invecchia(file);
  await qui.elenca();
  const prima = letture;
  await qui.elenca(); await qui.ammesso('ep-1');
  assert.equal(letture, prima, 'stesso file, stessa impronta: nessuna rilettura');
  writeFileSync(file, '{ rotto');
  invecchia(file, 9);
  await assert.rejects(() => qui.elenca(), { code: 'REMOTE_DEVICES_UNREADABLE' });
});

test('RILETTURA-03 una lettura che parte durante una scrittura non sostituisce l\'elenco che la scrittura sta cambiando', async (t) => {
  const file = join(cartella(t), 'telefoni.json');
  const fs = await import('node:fs/promises');
  let trattieni = null;
  const lento = { ...fs, rename: async (...a) => { if (trattieni) await trattieni; return fs.rename(...a); } };
  const qui = creaElencoDispositivi({ file, fs: lento });
  await qui.aggiungi({ endpointId: 'ep-1', nome: 'Pad' });
  let libera; trattieni = new Promise((r) => { libera = r; });
  const scrittura = qui.aggiungi({ endpointId: 'ep-2', nome: 'Telefono' });
  await new Promise((r) => setTimeout(r, 30));
  const lettura = qui.elenca(); // parte mentre la scrittura aspetta il rename
  const tempo = trattieni; trattieni = null; libera(); await tempo;
  await scrittura;
  const vista = JSON.stringify((await lettura).map((v) => v.endpointId).sort());
  assert.ok(vista === '["ep-1"]' || vista === '["ep-1","ep-2"]', `la lettura vede uno dei due stati veri, non altro: ${vista}`);
  assert.deepEqual((await qui.elenca()).map((v) => v.endpointId).sort(), ['ep-1', 'ep-2'], 'nessuna voce persa in memoria');
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).dispositivi.map((v) => v.endpointId).sort(), ['ep-1', 'ep-2'], 'né sul disco');
});

const { creaCartelleDeiDispositivi } = await imp('src/remoto/cartelle-dispositivi.mjs');

test('RILETTURA-04 i consensi delle cartelle: una revoca o un consenso scritti dall\'altro processo valgono anche qui, e un ricordo non ancora salvato non si perde', async (t) => {
  const radice = cartella(t);
  const dati = join(radice, 'dati');
  const lavoro = join(radice, 'progetto');
  (await import('node:fs')).mkdirSync(lavoro, { recursive: true });
  const fileConsensi = join(dati, 'remoto', 'consensi.json');
  const crea = () => creaCartelleDeiDispositivi({ fileConsensi, fileSegreto: join(dati, 'remoto', 'segreto-cartelle'), cartelleEscluse: [dati] });
  const finestra = crea();
  const terminale = crea();
  await finestra.consentiInAnticipo('pad', lavoro);
  invecchia(fileConsensi);
  assert.ok(await terminale.consensoDi('pad', lavoro), 'premessa: il terminale legge il consenso dato dalla finestra');
  /* il terminale revoca (come `talos remote folders --revoke`) */
  const id = (await terminale.consensoDi('pad', lavoro)).cartellaId;
  await terminale.revoca('pad', id);
  invecchia(fileConsensi);
  assert.equal(await finestra.consensoDi('pad', lavoro), null, 'revocato dall\'altro processo: qui non è più consentito');
  /* un ricordo della Chat in sospeso (salvato in fila, dopo) sopravvive a una rilettura chiesta nel frattempo */
  await finestra.segnaSessioneChat('s1', 'pad');
  scriviDaFuori(fileConsensi, (d) => d); // l'altro processo riscrive: la finestra rileggerebbe
  assert.equal(await finestra.dispositivoDellaSessioneChat('s1'), 'pad');
  await finestra.attendiScritture();
  assert.equal(JSON.parse(readFileSync(fileConsensi, 'utf8')).sessioniChat?.s1?.dispositivoId, 'pad', 'il ricordo è arrivato sul disco');
});

/* Le due guardie si provano con la fila TRATTENUTA (un `rename` che aspetta): così la scrittura dell'altro processo arriva di sicuro
   prima del lavoro in fila, invece di dipendere da chi vince il giro degli eventi. */
const fsTrattenuto = async () => {
  const fs = await import('node:fs/promises');
  const stato = { blocco: null, libera: null };
  return { stato, fs: { ...fs, rename: async (...a) => { if (stato.blocco) await stato.blocco; return fs.rename(...a); } } };
};

test('RILETTURA-05 un ricordo della Chat in sospeso NON si perde se, prima del suo salvataggio, l\'altro processo riscrive il file', async (t) => {
  const radice = cartella(t);
  const dati = join(radice, 'dati');
  const lavoro = join(radice, 'progetto');
  (await import('node:fs')).mkdirSync(lavoro, { recursive: true });
  const fileConsensi = join(dati, 'remoto', 'consensi.json');
  const { stato, fs } = await fsTrattenuto();
  const finestra = creaCartelleDeiDispositivi({ fileConsensi, fileSegreto: join(dati, 'remoto', 'segreto-cartelle'), cartelleEscluse: [dati], fs });
  await finestra.consentiInAnticipo('pad', lavoro);
  invecchia(fileConsensi);
  stato.blocco = new Promise((r) => { stato.libera = r; });
  const occupata = finestra.consentiInAnticipo('tel', lavoro); // la fila resta occupata sul suo rename
  await new Promise((r) => setTimeout(r, 30));
  await finestra.segnaSessioneChat('s1', 'pad'); // il salvataggio va in fila, DOPO quello trattenuto
  scriviDaFuori(fileConsensi, (d) => d); // l'altro processo riscrive adesso
  stato.blocco = null; stato.libera();
  await occupata; await finestra.attendiScritture();
  assert.equal(JSON.parse(readFileSync(fileConsensi, 'utf8')).sessioniChat?.s1?.dispositivoId, 'pad', 'il ricordo in sospeso è arrivato sul disco');
});

test('RILETTURA-06 chi scrive rilegge PRIMA di scrivere: un telefono aggiunto dall\'altro processo mentre la fila era occupata non sparisce', async (t) => {
  const file = join(cartella(t), 'telefoni.json');
  const { stato, fs } = await fsTrattenuto();
  const qui = creaElencoDispositivi({ file, fs });
  const pad = await qui.aggiungi({ endpointId: 'ep-1', nome: 'Pad' });
  invecchia(file);
  await qui.elenca(); // copia in memoria aggiornata
  stato.blocco = new Promise((r) => { stato.libera = r; });
  const occupata = qui.visto(pad.id); // trattenuta sul rename
  await new Promise((r) => setTimeout(r, 30));
  const rinomina = qui.rinomina(pad.id, 'Pad di casa'); // in fila dietro
  /* mentre la fila è ferma, l'altro processo aggiunge un telefono (dopo il rename trattenuto, che scrive la sua copia) */
  stato.blocco = null; stato.libera(); await occupata;
  scriviDaFuori(file, (d) => ({ ...d, dispositivi: [...d.dispositivi, { ...d.dispositivi[0], id: 'altro-id', endpointId: 'ep-9', nome: 'Altro' }] }));
  await rinomina;
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).dispositivi.map((v) => v.endpointId).sort(), ['ep-1', 'ep-9'], 'la rinomina non ha cancellato il telefono dell\'altro processo');
});
