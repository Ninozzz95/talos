/*
 * Revisore del tredicesimo giro (17/11/2026): un insieme NEGATO letto «senza maiuscole» prende MENO nomi. La shell che espande il glob
 * (bash, zsh, la bash di Git per Windows: misurato con `echo [!T]izio` che dà `tizio`) bada alle maiuscole anche su un disco che non ci
 * bada; il lettore prova le tre forme del carattere e nega il «c'è», così `[!W]` non prende `w` e `[![:upper:]]` non prende `p`.
 * Prova attesa ROSSA sulla testa efc2320ec per le forme che la copia ferma della 0.2.1 non vede (le classi POSIX, e su Windows `bash -c`).
 * I comandi sono DATI: il cancello li legge, niente viene eseguito.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as critiche from '../src/kernel/cancellazioni-critiche.mjs';

const BS = String.fromCharCode(92);
const D = '/storage/emulated/0/Documents';
const A = { cartella: `${D}/w/progetto`, home: '/data/user/0/ai.talos.dev/files', piattaforma: 'android', ambiente: { HOME: '/data/user/0/ai.talos.dev/files' }, realpathFn: (p) => p };
const M = { cartella: '/Users/tizio/w/progetto', home: '/Users/tizio', piattaforma: 'darwin', ambiente: { HOME: '/Users/tizio' }, realpathFn: (p) => p };
const W = { cartella: `Q:${BS}w${BS}progetto`, home: `Q:${BS}Users${BS}tizio`, piattaforma: 'win32', ambiente: { USERPROFILE: `Q:${BS}Users${BS}tizio`, HOME: `Q:${BS}Users${BS}tizio` }, realpathFn: (p) => p };
const L = { cartella: '/home/tizio/w/progetto', home: '/home/tizio', piattaforma: 'linux', ambiente: { HOME: '/home/tizio' }, realpathFn: (p) => p };

const CASI = [
  ['A-classe-progetto (dodicesimo giro: carta; testa: nessuna)', `rm -rf ${D}/w/[![:upper:]]rogetto`, A, 'progetto'],
  ['A-classe-madre (dodicesimo giro: carta; testa: nessuna)', `rm -rf ${D}/[![:upper:]]`, A, 'sopra-il-progetto'],
  ['M-classe-casa (già nella 0.2.1)', 'rm -rf /Users/[![:upper:]]izio', M, 'casa'],
  ['M-classe-progetto (già nella 0.2.1)', 'rm -rf ../[![:upper:]]rogetto', M, 'progetto'],
  ['W-bash-negato (già nella 0.2.1)', 'bash -c "rm -rf ../[!P]rogetto"', W, 'progetto'],
  ['W-bash-casa (già nella 0.2.1)', 'bash -c "rm -rf /q/Users/[!T]izio"', W, 'casa'],
];
for (const [nome, comando, mondo, perche] of CASI) {
  test(`REV13-N ${nome}: «${comando}» nomina un posto critico`, () => {
    assert.equal(critiche.cancellazioneCritica(comando, mondo)?.perche, perche);
  });
}

test('REV13-N al contrario: su Linux le stesse forme hanno già la carta; un negato che esclude davvero il nome resta senza', () => {
  assert.equal(critiche.cancellazioneCritica('rm -rf ../[![:upper:]]rogetto', L)?.perche, 'progetto');
  assert.equal(critiche.cancellazioneCritica('rm -rf ../[!p]rogetto', L), null);
});
