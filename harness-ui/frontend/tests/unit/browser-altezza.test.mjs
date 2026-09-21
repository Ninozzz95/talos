import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
 * ⛔ 07/09/2026, owner (screenshot): «l'altezza dello spazio della finestra browser deve essere alta
 *   quanto tutto il resto della pagina, quello spazio fra la fine della pagina e la parte inferiore
 *   della finestra browser non si deve vedere. TLDR: fai la finestra browser più grande».
 *
 * La finestra aveva DUE tetti — `height:min(70vh,760px)` — e il secondo mordeva: misurato sul 4174,
 * 700px di finestra su 940 disponibili, e sopra una finestra da ~1086px si fermava a 760 e non
 * cresceva più. Adesso non ha un'altezza sua: prende quella che avanza.
 *
 * ⛔ Questa guardia esiste perché il difetto è di quelli che tornano: basta che qualcuno rimetta
 *   un'altezza in vh o in px «per sicurezza» e la fascia morta ricompare, senza che nessun test
 *   protesti. E difende anche le due cure nate DALLE FOTO, non da un numero:
 *   la card non si comprime mai sotto il proprio contenuto (o il testo esce e si scrive sopra la
 *   riga dei limiti), e cresce solo quando dentro c'è davvero una finestra da allungare.
 */

const CSS = readFileSync(new URL('../../src/styles/index.css', import.meta.url), 'utf8');

/** Il blocco di regole di un selettore, senza commenti: `.foo{…}` → `…`. */
export function corpoRegola(css, selettore) {
  const senzaCommenti = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const i = senzaCommenti.indexOf(selettore);
  if (i < 0) return null;
  const apre = senzaCommenti.indexOf('{', i);
  const chiude = senzaCommenti.indexOf('}', apre);
  if (apre < 0 || chiude < 0) return null;
  return senzaCommenti.slice(apre + 1, chiude).replace(/\s+/g, ' ').trim();
}

test('LA FINESTRA NON HA UN TETTO: niente altezza in vh o in px, prende quella che avanza', () => {
  const regola = corpoRegola(CSS, '.talos-browser__live{');
  assert.ok(regola, 'la regola della finestra non c\'è più: cercala prima di cancellare questa prova');
  // ⛔ il confine conta: senza `(^|[;\s])` questa prova accusa il `min-height` che vogliamo tenere.
  assert.doesNotMatch(regola, /(^|[;\s])height:\s*(min\(|\d+vh|\d+px)/, `la finestra è tornata ad avere un tetto: ${regola}`);
  assert.match(regola, /flex:\s*1 1 auto/, 'la finestra deve crescere con lo spazio disponibile');
});

test('AL CONTRARIO — un minimo resta: la finestra non può schiacciarsi a zero', () => {
  const regola = corpoRegola(CSS, '.talos-browser__live{');
  assert.match(regola, /min-height:\s*\d+px/, 'senza un minimo, a finestra bassa la pagina sparisce');
});

test('LA CARD NON SI COMPRIME sotto il proprio contenuto: o il testo esce e si sovrappone', () => {
  const regola = corpoRegola(CSS, '.talos-browser>.talos-card{');
  assert.ok(regola, 'la regola della card del Browser non c\'è più');
  assert.match(regola, /flex:\s*0 0 auto/, `la card deve avere shrink 0, altrimenti il testo esce: ${regola}`);
  assert.match(regola, /min-height:\s*0/, 'senza min-height:0 la catena flex non lascia crescere la finestra');
});

test('LA CARD CRESCE SOLO con una finestra dentro: senza, resterebbe alta e vuota', () => {
  const senzaCommenti = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const chi of ['#browserLive', '#browserVistaViva']) {
    assert.match(senzaCommenti, new RegExp(`:has\\(>\\s*${chi}:not\\(\\[hidden\\]\\)\\)`),
      `manca la condizione su ${chi}: la card si allungherebbe anche con la finestra nascosta`);
  }
});

test('LA STRISCIA DELLE SCHEDE dice che a lato c\'è altro, e solo quando c\'è davvero', () => {
  const senzaCommenti = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(senzaCommenti, /@supports \(animation-timeline:\s*scroll\(self inline\)\)/,
    'la sfumatura dei bordi va dietro a @supports: dove non è sostenuta, la striscia resta com\'era');
  // ⛔ Le due lunghezze partono da 0px: con una striscia che non scorre la timeline è inattiva e
  //    i valori restano quelli iniziali — nessuna sfumatura dove non serve.
  for (const nome of ['--talos-sfuma-sx', '--talos-sfuma-dx']) {
    const proprieta = corpoRegola(senzaCommenti, `@property ${nome}{`);
    assert.ok(proprieta, `manca @property ${nome}: senza, la custom property non si anima`);
    assert.match(proprieta, /initial-value:\s*0px/, `${nome} deve partire da 0px, o sfuma anche a striscia corta`);
  }
});

test('L\'ELLISSI DELLE RIGHE chiave/valore morde davvero: min-width:0, e il valore non va a capo', () => {
  const chiave = corpoRegola(CSS, '.talos-kv__k{');
  const valore = corpoRegola(CSS, '.talos-kv__v{');
  assert.match(chiave, /min-width:\s*0/, 'senza min-width:0 l\'ellissi è dichiarata e non si applica mai');
  assert.match(chiave, /text-overflow:\s*ellipsis/, 'la chiave si tronca, non manda il valore a capo');
  assert.match(valore, /white-space:\s*nowrap/, 'il valore di una riga non va mai a capo');
});
