import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

/*
 * ⛔ Allegati, owner 02/11/2026 sul 4174: «non riesco ad allegare file». Uno dei due guasti: il «+» del compositore
 * (`#capabilityBtn`) stava dentro `<form id="composerForm">` SENZA `type`, e un `<button>` senza tipo dentro un
 * modulo è un «Invia» (HTML, «The button element», stato predefinito Submit). Con un allegato già nel compositore,
 * il «+» premuto per aggiungerne un secondo mandava il messaggio. Visto dal vivo: un giro partito in «ciao-3» col solo
 * file di prova. Regola: nel compositore l'UNICO pulsante che invia è quello di invio; ogni altro dichiara `type="button"`.
 */
const TEMPLATE = fileURLToPath(new URL('../../index.template.html', import.meta.url));

export function pulsantiDelCompositore(html) {
  const inizio = html.indexOf('id="composerForm"');
  assert.ok(inizio > 0, 'il modulo del compositore deve esistere');
  const apertura = html.lastIndexOf('<form', inizio);
  const fine = html.indexOf('</form>', inizio);
  assert.ok(apertura >= 0 && fine > inizio, 'il modulo del compositore deve chiudersi');
  const corpo = html.slice(apertura, fine);
  return [...corpo.matchAll(/<button\b[^>]*>/gu)].map((m) => m[0]);
}

export function tipoDelPulsante(tag) {
  const m = /\stype\s*=\s*"([^"]*)"/iu.exec(tag);
  return m ? m[1].toLowerCase() : 'submit';
}

test('nel compositore solo il pulsante di invio invia; il «+» e gli altri sono type="button"', () => {
  const pulsanti = pulsantiDelCompositore(readFileSync(TEMPLATE, 'utf8'));
  assert.ok(pulsanti.length >= 2, `pochi pulsanti trovati: ${pulsanti.length}`);
  const cheInviano = pulsanti.filter((tag) => tipoDelPulsante(tag) === 'submit');
  assert.deepEqual(cheInviano.map((tag) => /data-c="([^"]+)"/u.exec(tag)?.[1] ?? tag.slice(0, 80)), ['SendButton'],
    'un pulsante del compositore diverso da Invia è un submit: premendolo parte il messaggio');
  const piu = pulsanti.find((tag) => /id="capabilityBtn"/u.test(tag));
  assert.ok(piu, 'il «+» del compositore deve esserci');
  assert.equal(tipoDelPulsante(piu), 'button');
});

test('il lettore del tipo distingue i casi (controllo della prova stessa)', () => {
  assert.equal(tipoDelPulsante('<button class="x">'), 'submit');
  assert.equal(tipoDelPulsante('<button type="button" class="x">'), 'button');
  assert.equal(tipoDelPulsante('<button class="x" type="submit">'), 'submit');
  assert.deepEqual(pulsantiDelCompositore('<div><form id="composerForm"><button type="button"><button data-c="SendButton"></form><button>'),
    ['<button type="button">', '<button data-c="SendButton">']);
});
