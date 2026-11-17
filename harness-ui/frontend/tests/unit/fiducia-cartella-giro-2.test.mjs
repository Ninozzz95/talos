/*
 * Fiducia della cartella, giro 2 (Desktop 11/11/2026; ROSSO del giudice v1461, D4 e testi; owner 13:08 «Avviso con Mi fido»), la finestra:
 *   · TRATTENUTO-01: la nota di `/settings` della persona dice il modo vero quando il server trattiene l'Accesso pieno (EN e IT);
 *   · CARTA-02: la carta a metà conversazione non usa le frasi della nascita, e il modo si chiama come la pillola («Chiede prima»);
 *   · AVVISO-03: l'avviso dell'automazione trattenuta sta in «Da fare» e dice cosa aspetta, senza nomi tecnici (EN e IT).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { impostaLingua, t } from '../../src/components/lingua.js';
import { rigaDelTrattenuto } from '../../src/components/impostazioni-dalla-chat.js';
import { testiCartaFiducia } from '../../src/components/fiducia-cartella.js';
import { fraseDellaVoce, vociDaFare, FATTI_DA_FARE } from '../../src/components/notifiche.js';

test('TRATTENUTO-01: la ricevuta di /settings dice «in attesa della tua risposta… per ora Chiede prima», e col No «non è fidata»', () => {
  impostaLingua('it');
  assert.equal(rigaDelTrattenuto({ chiave: 'conversation.permissions', trattenuto: { motivo: 'fiducia-da-chiedere', vale: 'onRequest' } }),
    'Accesso pieno chiesto, in attesa della tua risposta sulla fiducia di questa cartella: per ora Chiede prima.');
  assert.equal(rigaDelTrattenuto({ chiave: 'conversation.permissions', trattenuto: { motivo: 'cartella-non-fidata', vale: 'onRequest' } }),
    'Questa cartella non è fidata: qui l’Accesso pieno lavora come Chiede prima.');
  impostaLingua('en');
  assert.equal(rigaDelTrattenuto({ chiave: 'conversation.permissions', trattenuto: { motivo: 'fiducia-da-chiedere', vale: 'onRequest' } }),
    'Full access requested, waiting for your answer about trusting this folder: for now Asks first.');
  assert.equal(rigaDelTrattenuto({ chiave: 'conversation.permissions', dopo: 'fullAccess' }), null, 'niente trattenuto, niente riga');
});

test('CARTA-02: a metà conversazione la carta dice che le istruzioni restano e cosa fa il No da ora; «Chiede prima» come la pillola', () => {
  for (const lingua of ['it', 'en']) {
    impostaLingua(lingua);
    const nascita = testiCartaFiducia();
    const aperta = testiCartaFiducia({ aMetaSessione: true });
    assert.notEqual(aperta.perche, nascita.perche, 'non «TALOS caricherà…»: sono già caricate');
    assert.notEqual(aperta.nota, nascita.nota, 'non «Apri senza…»: la chat è già aperta');
    const pillola = t('chat.foot.permission.onRequest');
    assert.ok(aperta.motivo.includes(pillola), `il modo si chiama «${pillola}» anche nella carta (${aperta.motivo})`);
    assert.ok(nascita.motivo.includes(pillola), `anche alla nascita (${nascita.motivo})`);
  }
  impostaLingua('it');
  assert.doesNotMatch(testiCartaFiducia().motivo, /Su richiesta/u);
});

test('AVVISO-03: l\'avviso dell\'automazione trattenuta aspetta la persona e dice cosa aspetta', () => {
  assert.ok(FATTI_DA_FARE.has('fiducia-cartella'));
  const voce = { id: 'fiducia-cartella:cartella:abc', fatto: 'fiducia-cartella', seq: 3, istante: '2026-11-11T12:00:00.000Z',
    cosa: { tipo: 'automazione', id: 'a1', nome: 'Riordino' }, dato: { genere: 'testo', valore: 'progetto' }, porta: { tipo: 'sessione', id: 's1' }, stato: { visto: false, risolto: false } };
  assert.equal(vociDaFare([voce]).length, 1);
  impostaLingua('en');
  assert.equal(fraseDellaVoce(voce).frase, 'Full access is waiting: do you trust this folder?');
  impostaLingua('it');
  const detto = fraseDellaVoce(voce);
  assert.equal(detto.frase, 'L’Accesso pieno aspetta: ti fidi di questa cartella?');
  assert.equal(detto.dato.valore, 'progetto');
  assert.equal(detto.tono, 'accento');
});
