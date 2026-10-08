/*
 * ⛔ K4b, review del bugfixer (07/10/2026). I preamboli salvati PRIMA di K4b iniziano con quattro marcature italiane, e la
 *   conversazione salvata è l'unica fonte di «che cosa ha già letto il modello» (`preamboloVistoDa`): vanno riconosciute per
 *   sempre. Erano scritte in base64, così l'inventario della lingua non le vedeva — una guardia aggirata in silenzio. Ora
 *   stanno in chiaro in `MARCHE_STORICHE_IT`, e queste prove dicono le due metà del patto:
 *   (1) ognuna riconosce ancora il SUO preambolo salvato, col testo esatto di 650f74fc8;
 *   (2) servono solo a riconoscere: il modulo non le emette, e nel sorgente compaiono solo nella costante e in `preamboloVistoDa`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MARCHE_STORICHE_IT, aggiornamentoInCoda, preamboloVistoDa } from '../src/contesto-del-progetto.mjs';

/* Le prime parole che 650f74fc8 scriveva (`INIZIO_AGGIORNAMENTO`, `INIZIO_SCHEDA` e i due inizi del blocco stabile). */
const DI_IERI = {
  aggiornamento: 'Aggiornamento del contesto del progetto:',
  istruzioni: 'Istruzioni di questo progetto — ',
  scheda: 'Scheda di lavoro — ',
  mappa: 'Struttura di «',
};
const SCHEDA = 'Scheda di lavoro — piattaforma win32, cartella C:/progetto';
const sistema = (content) => ({ role: 'system', content });

test('K4B-MARCHE-01 — ogni marcatura italiana salvata prima di K4b riconosce ancora il suo preambolo', () => {
  assert.deepEqual({ ...MARCHE_STORICHE_IT }, DI_IERI, 'le marcature sono le parole esatte di ieri');
  assert.equal(preamboloVistoDa([sistema(SCHEDA)]), SCHEDA, 'scheda in testa (l\'ordine storico)');
  const conIstruzioni = `Istruzioni di questo progetto — AGENTS.md\n\nregole del progetto\n\n${SCHEDA}`;
  assert.equal(preamboloVistoDa([sistema(conIstruzioni)]), conIstruzioni, 'blocco stabile che inizia dalle istruzioni');
  const conMappa = `Struttura di «progetto»\n\nsrc/\n\n${SCHEDA}`;
  assert.equal(preamboloVistoDa([sistema(conMappa)]), conMappa, 'blocco stabile che inizia dalla mappa');
  const aggiornamento = `Aggiornamento del contesto del progetto: quello che segue SOSTITUISCE ciò che hai ricevuto prima.\n\n${SCHEDA}`;
  assert.equal(preamboloVistoDa([sistema(conIstruzioni), sistema(aggiornamento)]), SCHEDA, 'l\'aggiornamento in coda vince, ed è il suo testo dopo la riga d\'apertura');
});

test('K4B-MARCHE-02 — le marcature servono solo a riconoscere: il modulo non le emette', () => {
  const coda = aggiornamentoInCoda({ storia: [sistema(SCHEDA)], testo: 'Working sheet — platform win32, folder C:/project' });
  assert.ok(typeof coda === 'string' && coda.startsWith('Project context update:'), 'premessa: c\'è un aggiornamento, in inglese');
  for (const marca of Object.values(DI_IERI)) assert.ok(!coda.includes(marca), `l'aggiornamento non contiene «${marca}»`);

  const sorgente = readFileSync(new URL('../src/contesto-del-progetto.mjs', import.meta.url), 'utf8');
  for (const marca of Object.values(DI_IERI)) {
    assert.equal(sorgente.split(marca).length - 1, 1, `«${marca}» compare una volta sola nel sorgente: nella costante`);
  }
  const inizio = sorgente.indexOf('export function preamboloVistoDa(');
  const fine = sorgente.indexOf('\n}\n', inizio);
  assert.ok(inizio > 0 && fine > inizio, 'premessa: la funzione che riconosce si trova');
  const usi = (testo) => testo.split('MARCHE_STORICHE_IT').length - 1;
  assert.equal(usi(sorgente) - usi(sorgente.slice(inizio, fine)), 1, 'fuori da preamboloVistoDa la costante compare solo dove è definita');

  const cartella = new URL('../src/', import.meta.url);
  const tuttiIFile = readdirSync(cartella, { recursive: true }).map(String).filter((f) => /\.m?js$/u.test(f) && f !== 'contesto-del-progetto.mjs');
  const altri = tuttiIFile.filter((f) => readFileSync(join(cartella.pathname.replace(/^\/([A-Za-z]:)/u, '$1'), f), 'utf8').includes('MARCHE_STORICHE_IT'));
  assert.deepEqual(altri, [], 'nessun altro modulo del server la usa');
});
