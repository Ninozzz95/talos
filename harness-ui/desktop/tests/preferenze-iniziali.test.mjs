/*
 * Le scelte dell'installazione (0.2.2, brief «rete spegnibile», regole del giudice v1313): una prova per regola, e per ognuna il mutante
 * che la deve far cadere (elenco nel rapporto dell'agente). Ogni prova lavora in una cartella temporanea sua: mai i dati veri.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FILE_AGGIORNAMENTI, FILE_CATALOGO_PUBBLICO, FILE_PREFERENZE_IGNORATE, FILE_PREFERENZE_INIZIALI, FILE_PREFERENZE_LETTE,
  SCHEMA_CATALOGO_PUBBLICO, SCHEMA_PREFERENZE_INIZIALI, applicaPreferenzeIniziali, leggiScelte,
} from '../preferenze-iniziali.mjs';
import * as delServer from '../../src/catalogo-pubblico.mjs';

const cartelle = [];
function cartella() { const c = mkdtempSync(join(tmpdir(), 'talos-pi-')); cartelle.push(c); return c; }
test.after(() => { for (const c of cartelle) rmSync(c, { recursive: true, force: true }); });
const scrivi = (c, nome, valore) => writeFileSync(join(c, nome), typeof valore === 'string' ? valore : JSON.stringify(valore));
const leggi = (c, nome) => JSON.parse(readFileSync(join(c, nome), 'utf8'));
const preferenze = (c, valore) => scrivi(c, FILE_PREFERENZE_INIZIALI, { schema: SCHEMA_PREFERENZE_INIZIALI, ...valore });

test('PI-01 (regola 1): SOLO dalla cartella dell utente — un percorso relativo o assente non legge niente, nemmeno nella cartella di lavoro', () => {
  const lavoro = cartella();
  preferenze(lavoro, { automaticUpdates: false, publicModelCatalog: false });
  const prima = process.cwd();
  process.chdir(lavoro);
  try {
    for (const c of [undefined, '', '.', 'TALOS', FILE_PREFERENZE_INIZIALI, null, 42]) {
      assert.equal(applicaPreferenzeIniziali({ cartellaUtente: c }).esito, 'errore', String(c));
    }
    assert.equal(applicaPreferenzeIniziali().esito, 'errore');
  } finally { process.chdir(prima); }
  assert.deepEqual(readdirSync(lavoro).sort(), [FILE_PREFERENZE_INIZIALI], 'la cartella di lavoro resta com era: niente applicato, niente rinominato');
  const utente = cartella();
  assert.deepEqual(applicaPreferenzeIniziali({ cartellaUtente: utente }), { esito: 'nessuno' }, 'il file della cartella di lavoro non conta');
  assert.deepEqual(readdirSync(utente), []);
});

test('PI-02 (regola 1): una volta sola — dopo la lettura il file diventa .letto; un file nuovo non si applica e finisce in .ignorato', () => {
  const c = cartella();
  preferenze(c, { automaticUpdates: false, publicModelCatalog: false });
  const primo = applicaPreferenzeIniziali({ cartellaUtente: c });
  assert.equal(primo.esito, 'applicato');
  assert.deepEqual(primo.applicate, { automaticUpdates: false, publicModelCatalog: false });
  assert.equal(existsSync(join(c, FILE_PREFERENZE_INIZIALI)), false);
  assert.equal(existsSync(join(c, FILE_PREFERENZE_LETTE)), true);
  /* la persona riaccende tutto dalle Impostazioni; poi qualcuno rimette il file dell'installatore */
  scrivi(c, FILE_AGGIORNAMENTI, { automatici: true, ultimoControllo: 7 });
  scrivi(c, FILE_CATALOGO_PUBBLICO, { schema: SCHEMA_CATALOGO_PUBBLICO, acceso: true });
  preferenze(c, { automaticUpdates: false, publicModelCatalog: false });
  assert.deepEqual(applicaPreferenzeIniziali({ cartellaUtente: c }), { esito: 'gia-letto' });
  assert.deepEqual(leggi(c, FILE_AGGIORNAMENTI), { automatici: true, ultimoControllo: 7 }, 'la seconda lettura non spegne niente');
  assert.deepEqual(leggi(c, FILE_CATALOGO_PUBBLICO), { schema: SCHEMA_CATALOGO_PUBBLICO, acceso: true });
  assert.equal(existsSync(join(c, FILE_PREFERENZE_INIZIALI)), false);
  assert.equal(existsSync(join(c, FILE_PREFERENZE_IGNORATE)), true);
  /* terzo avvio senza file: niente da fare */
  assert.deepEqual(applicaPreferenzeIniziali({ cartellaUtente: c }), { esito: 'nessuno' });
});

test('PI-09 (giallo del revisore unico, 11/11): «una volta» vuol dire al PRIMO AVVIO CHE LO TROVA — anche su un profilo già usato', () => {
  /* Un profilo di una versione precedente, già usato: dati veri, aggiornamenti scelti, nessuna scelta del catalogo (prima non c era), nessun .letto.
     Il primo file che arriva, quando arriva, si applica (con le regole 2 e 3); il secondo no. La pagina lo dice così, non «al primo avvio». */
  const c = cartella();
  mkdirSync(join(c, 'sessions'));
  scrivi(c, FILE_AGGIORNAMENTI, { automatici: true, ultimoControllo: 3 });
  preferenze(c, { automaticUpdates: false, publicModelCatalog: true });
  const primo = applicaPreferenzeIniziali({ cartellaUtente: c });
  assert.equal(primo.esito, 'applicato');
  assert.deepEqual(primo.applicate, { automaticUpdates: false, publicModelCatalog: true }, 'il catalogo non era mai stato scelto: true vale');
  assert.deepEqual(leggi(c, FILE_CATALOGO_PUBBLICO), { schema: SCHEMA_CATALOGO_PUBBLICO, acceso: true });
  preferenze(c, { publicModelCatalog: false });
  assert.deepEqual(applicaPreferenzeIniziali({ cartellaUtente: c }), { esito: 'gia-letto' });
  assert.deepEqual(leggi(c, FILE_CATALOGO_PUBBLICO), { schema: SCHEMA_CATALOGO_PUBBLICO, acceso: true }, 'il secondo file non cambia niente');
});

test('PI-03 (regola 2): non accende ciò che la persona ha spento — true vale solo dove non c è una scelta salvata', () => {
  const spenta = cartella();
  scrivi(spenta, FILE_AGGIORNAMENTI, { automatici: false, ultimoControllo: 5 });
  scrivi(spenta, FILE_CATALOGO_PUBBLICO, { schema: SCHEMA_CATALOGO_PUBBLICO, acceso: false });
  preferenze(spenta, { automaticUpdates: true, publicModelCatalog: true });
  const esito = applicaPreferenzeIniziali({ cartellaUtente: spenta });
  assert.equal(esito.esito, 'applicato');
  assert.deepEqual(esito.applicate, {}, 'nessuna delle due si accende');
  assert.deepEqual(leggi(spenta, FILE_AGGIORNAMENTI), { automatici: false, ultimoControllo: 5 });
  assert.deepEqual(leggi(spenta, FILE_CATALOGO_PUBBLICO), { schema: SCHEMA_CATALOGO_PUBBLICO, acceso: false });
  /* un file del catalogo che non si sa leggere è una scelta che non si conosce: non si accende sopra */
  const rotta = cartella();
  scrivi(rotta, FILE_CATALOGO_PUBBLICO, '{ non json');
  preferenze(rotta, { publicModelCatalog: true });
  assert.deepEqual(applicaPreferenzeIniziali({ cartellaUtente: rotta }).applicate, {});
  assert.equal(readFileSync(join(rotta, FILE_CATALOGO_PUBBLICO), 'utf8'), '{ non json');
  /* dove non c'è niente, true si scrive (e conserva una scelta di OpenRouter già fatta) */
  const nuova = cartella();
  scrivi(nuova, FILE_CATALOGO_PUBBLICO, { schema: SCHEMA_CATALOGO_PUBBLICO, openrouterScelto: true });
  preferenze(nuova, { automaticUpdates: true, publicModelCatalog: true });
  assert.deepEqual(applicaPreferenzeIniziali({ cartellaUtente: nuova }).applicate, { automaticUpdates: true, publicModelCatalog: true });
  assert.deepEqual(leggi(nuova, FILE_AGGIORNAMENTI), { automatici: true, ultimoControllo: null });
  assert.deepEqual(leggi(nuova, FILE_CATALOGO_PUBBLICO), { schema: SCHEMA_CATALOGO_PUBBLICO, openrouterScelto: true, acceso: true });
  /* false vale sempre, anche sopra un acceso salvato (spegnere non toglie niente alla persona) */
  const accesa = cartella();
  scrivi(accesa, FILE_AGGIORNAMENTI, { automatici: true, ultimoControllo: 9 });
  scrivi(accesa, FILE_CATALOGO_PUBBLICO, { schema: SCHEMA_CATALOGO_PUBBLICO, acceso: true });
  preferenze(accesa, { automaticUpdates: false, publicModelCatalog: false });
  assert.deepEqual(applicaPreferenzeIniziali({ cartellaUtente: accesa }).applicate, { automaticUpdates: false, publicModelCatalog: false });
  assert.deepEqual(leggi(accesa, FILE_AGGIORNAMENTI), { automatici: false, ultimoControllo: 9 });
  assert.deepEqual(leggi(accesa, FILE_CATALOGO_PUBBLICO), { schema: SCHEMA_CATALOGO_PUBBLICO, acceso: false });
});

test('PI-04 (regola 3): tocca solo le due impostazioni — ogni altro campo si ignora, nessun altro file nasce, dei file solo i loro campi', () => {
  const c = cartella();
  scrivi(c, 'impostazioni.json', { tema: 'scuro' });
  scrivi(c, FILE_AGGIORNAMENTI, { automatici: true, ultimoControllo: 3, estraneo: 'x' });
  preferenze(c, { automaticUpdates: false, telemetry: true, theme: 'light', permissions: 'all', publicModelCatalog: 'no' });
  const esito = applicaPreferenzeIniziali({ cartellaUtente: c });
  assert.equal(esito.esito, 'applicato');
  assert.deepEqual(esito.applicate, { automaticUpdates: false }, 'un valore non booleano non è una scelta');
  assert.deepEqual(esito.ignorati.sort(), ['permissions', 'publicModelCatalog', 'telemetry', 'theme']);
  assert.deepEqual(readdirSync(c).sort(), [FILE_AGGIORNAMENTI, 'impostazioni.json', FILE_PREFERENZE_LETTE].sort(), 'nessun file nuovo, il catalogo non nasce');
  assert.deepEqual(leggi(c, 'impostazioni.json'), { tema: 'scuro' });
  assert.deepEqual(leggi(c, FILE_AGGIORNAMENTI), { automatici: false, ultimoControllo: 3 }, 'solo i due campi che il guscio scrive già');
  assert.deepEqual(Object.keys(leggiScelte(JSON.stringify({ automaticUpdates: true, publicModelCatalog: false, x: 1 })).scelte), ['automaticUpdates', 'publicModelCatalog']);
});

test('PI-05: un file illeggibile non decide niente e si segna letto; troppo grande o schema sconosciuto valgono come illeggibile', () => {
  for (const contenuto of ['{ rotto', '[]', '"testo"', JSON.stringify({ schema: 'talos.initial-preferences.v9', automaticUpdates: false }),
    JSON.stringify({ automaticUpdates: false, riempitivo: 'x'.repeat(5000) })]) {
    const c = cartella();
    scrivi(c, FILE_AGGIORNAMENTI, { automatici: true, ultimoControllo: null });
    scrivi(c, FILE_PREFERENZE_INIZIALI, contenuto);
    assert.equal(applicaPreferenzeIniziali({ cartellaUtente: c }).esito, 'illeggibile', contenuto.slice(0, 40));
    assert.deepEqual(leggi(c, FILE_AGGIORNAMENTI), { automatici: true, ultimoControllo: null });
    assert.equal(existsSync(join(c, FILE_PREFERENZE_LETTE)), true);
    assert.equal(existsSync(join(c, FILE_PREFERENZE_INIZIALI)), false);
  }
  /* senza `schema` il file vale lo stesso (il campo è facoltativo) */
  const c = cartella();
  scrivi(c, FILE_PREFERENZE_INIZIALI, { publicModelCatalog: false });
  assert.deepEqual(applicaPreferenzeIniziali({ cartellaUtente: c }).applicate, { publicModelCatalog: false });
});

test('PI-06: una scrittura che fallisce lascia il file dov è, e il prossimo avvio riprova con lo stesso risultato', () => {
  const c = cartella();
  /* una CARTELLA piena al posto del file del catalogo: il rename del temporaneo fallisce su ogni sistema */
  const ostacolo = join(c, FILE_CATALOGO_PUBBLICO);
  mkdirSync(ostacolo);
  writeFileSync(join(ostacolo, 'dentro'), '');
  preferenze(c, { automaticUpdates: false, publicModelCatalog: false });
  const esito = applicaPreferenzeIniziali({ cartellaUtente: c });
  assert.equal(esito.esito, 'errore');
  assert.equal(existsSync(join(c, FILE_PREFERENZE_INIZIALI)), true, 'il file resta');
  assert.equal(existsSync(join(c, FILE_PREFERENZE_LETTE)), false, 'e non si segna letto');
  rmSync(ostacolo, { recursive: true, force: true });
  rmSync(ostacolo + '.tmp', { force: true });
  const dopo = applicaPreferenzeIniziali({ cartellaUtente: c });
  assert.equal(dopo.esito, 'applicato');
  assert.deepEqual(dopo.applicate, { automaticUpdates: false, publicModelCatalog: false });
  assert.deepEqual(leggi(c, FILE_AGGIORNAMENTI), { automatici: false, ultimoControllo: null });
});

test('PI-07: il guscio legge il file PRIMA di aggiornatore e server, e dalla sua cartella dati', () => {
  const sorgente = readFileSync(fileURLToPath(new URL('../main.mjs', import.meta.url)), 'utf8');
  const chiamata = sorgente.indexOf('applicaPreferenzeIniziali({ cartellaUtente: dataDir })');
  assert.ok(chiamata > 0, 'chiamata con la cartella dati');
  /* il server nasce dallo spawn, l'aggiornatore da creaAggiornatore: entrambi DOPO, ed è la sola chiamata */
  for (const dopo of ['creaAggiornatore(', 'spawn(avvio.command']) assert.ok(sorgente.indexOf(dopo) > chiamata, dopo);
  assert.equal(sorgente.split('applicaPreferenzeIniziali(').length, 2, 'una sola chiamata');
  const pacchetto = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));
  assert.ok(pacchetto.build.files.includes('preferenze-iniziali.mjs'), 'il modulo entra nel pacchetto');
});

test('PI-08: la forma copiata è quella del server, e il server legge ciò che il guscio scrive', async () => {
  assert.equal(FILE_CATALOGO_PUBBLICO, delServer.FILE_CATALOGO_PUBBLICO);
  assert.equal(SCHEMA_CATALOGO_PUBBLICO, delServer.SCHEMA_CATALOGO_PUBBLICO);
  for (const [scelta, atteso] of [[false, false], [true, true]]) {
    const c = cartella();
    preferenze(c, { publicModelCatalog: scelta });
    applicaPreferenzeIniziali({ cartellaUtente: c });
    const avvisi = [];
    /* di serie al contrario della scelta: così la prova vede che il file conta, qualunque sarà il valore di serie */
    const store = delServer.creaImpostazioneCatalogoPubblico({ file: join(c, FILE_CATALOGO_PUBBLICO), diSerie: !atteso, avvisa: (m) => avvisi.push(m) });
    assert.equal(store.consentito(), atteso);
    assert.deepEqual(await store.leggi(), { acceso: atteso, spentoDallAmbiente: false });
    assert.deepEqual(avvisi, [], 'il file del guscio si legge senza avvisi');
    const conVariabile = delServer.creaImpostazioneCatalogoPubblico({ file: join(c, FILE_CATALOGO_PUBBLICO), spentoDallAmbiente: true, avvisa: () => {} });
    assert.equal(conVariabile.consentito(), false, 'la variabile vince sul file');
  }
});
