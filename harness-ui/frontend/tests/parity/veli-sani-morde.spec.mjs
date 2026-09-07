/*
 * IL CANCELLO DEI VELI MORDE? Si apre il banco (`veli-sani.banco.html`), che contiene di proposito
 * i due difetti veri del 07/9, e si verifica che il controllo li veda — e che TACCIA sul velo sano.
 *
 * ⛔ Senza questa prova non si saprebbe se il controllo funziona: al primo giro diceva «22 veli,
 *   tutti sani» perché li apriva VUOTI, e poi accusava la palette dei comandi, che invece scorre.
 *   Due modi diversi di essere inutile, trovati solo provandolo contro difetti noti.
 * Metodo: mutation testing (QASkills, «Mutation Testing With Stryker», letto 07/09/2026).
 */
import { test, expect } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { giudicaVelo } from '../../scripts/cancello/veli-sani.mjs';

const BANCO = pathToFileURL(path.resolve('scripts/cancello/veli-sani.banco.html')).href;
const src = readFileSync('scripts/cancello/veli-sani.mjs', 'utf8');
const CORPO = src.slice(src.indexOf('function sonda(idVelo) {'), src.indexOf('\n}\n', src.indexOf('function sonda(idVelo) {')) + 2);

async function guarda(page, id) {
  await page.evaluate((v) => {
    for (const a of document.querySelectorAll('.overlay-layer')) a.hidden = true;
    document.getElementById(v).hidden = false;
  }, id);
  const sonda = new Function('idVelo', CORPO.replace(/^function sonda\(idVelo\) \{/, '').replace(/\}\s*$/, ''));
  return giudicaVelo(await page.evaluate(sonda, id));
}

test('VELI-MORDE: il velo sano non produce un solo motivo', async ({ page }) => {
  await page.goto(BANCO);
  const v = await guarda(page, 'veloSano');
  expect(v.motivi, 'un falso allarme rende il controllo inutile').toEqual([]);
  expect(v.sano).toBe(true);
});

test('VELI-MORDE: il contenuto tagliato da un corpo che non scorre viene visto', async ({ page }) => {
  await page.goto(BANCO);
  const v = await guarda(page, 'veloTagliato');
  expect(v.sano).toBe(false);
  expect(v.motivi.join(' ')).toMatch(/esce di \d+px/);
  expect(v.motivi.join(' ')).toMatch(/non scorre/);
});

test('VELI-MORDE: il controllo nudo per una variabile assente viene visto, e la cura è nominata', async ({ page }) => {
  await page.goto(BANCO);
  const v = await guarda(page, 'veloNudo');
  expect(v.sano).toBe(false);
  expect(v.motivi.join(' ')).toMatch(/--linea-che-non-esiste|--fondo-che-non-esiste/);
  expect(v.motivi.join(' ')).toMatch(/fallback/);
});
