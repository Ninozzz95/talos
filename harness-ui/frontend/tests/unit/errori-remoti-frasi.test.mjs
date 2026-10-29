import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { testoErroreServer } from '../../src/components/errori.js';
import { impostaLingua } from '../../src/components/lingua.js';

/*
 * Mobile 27/10/2026 (censimento «Avvisi ed errori», owner: «tutti gli avvisi e gli errori anche nel mobile»): otto codici del server non
 *   avevano una frase nel dizionario, e il computer mostrava l'inglese grezzo. La voce si sceglie solo se il suo inglese è il testo del
 *   server PAROLA PER PAROLA (`testoErroreServer`): qui il testo si legge dai SORGENTI del server, così una frase cambiata là fa
 *   diventare rossa questa prova invece di tornare inglese in silenzio. Al contrario: un testo diverso resta le parole del server.
 */
const sorgente = (rel) => readFileSync(new URL(`../../../src/${rel}`, import.meta.url), 'utf8');
const letterale = (rel, codice, re) => {
  const m = re.exec(sorgente(rel));
  assert.ok(m, `in ${rel} non c'è più il testo di ${codice}: la voce del dizionario va rifatta`);
  return m[1];
};
const CASI = [
  ['OUTPUT_SESSION_BUSY', letterale('process-output-worker.mjs', 'OUTPUT_SESSION_BUSY', /fail\('OUTPUT_SESSION_BUSY', '([^']+)'\)/u)],
  ['OPERATION_FAILED', letterale('remoto/chiamata-interna.mjs', 'OPERATION_FAILED', /errore\('OPERATION_FAILED', '([^']+)'\)/u)],
  ['OPERATION_FAILED', letterale('remoto/file-dispositivi.mjs', 'OPERATION_FAILED', /errore\('OPERATION_FAILED', '([^']+)'/u)],
  ['BAD_MESSAGE', letterale('remoto/chiamata-interna.mjs', 'BAD_MESSAGE', /errore\('BAD_MESSAGE', '([^']+)'\)/u)],
  ['BAD_MESSAGE', letterale('remoto/file-dispositivi.mjs', 'BAD_MESSAGE', /errore\('BAD_MESSAGE', '(Images[^']+)'/u)],
  ['TOO_LARGE', `A message cannot exceed ${letterale('remoto/filo.mjs', 'TOO_LARGE', /BYTE_MASSIMI = ([\d *]+);/u).split('*').reduce((a, b) => a * Number(b), 1)} bytes.`],
  ['UNKNOWN_OPERATION', letterale('remoto/operazioni.mjs', 'UNKNOWN_OPERATION', /errore\('UNKNOWN_OPERATION', '([^']+)'\)/u)],
  ['VERSION_UNSUPPORTED', letterale('remoto/filo.mjs', 'VERSION_UNSUPPORTED', /errore\('VERSION_UNSUPPORTED', '([^']+)'\)/u)],
  ['REMOTE_FOLDERS_FILE', letterale('remoto/cartelle-dispositivi.mjs', 'REMOTE_FOLDERS_FILE', /errore\('REMOTE_FOLDERS_FILE', '([^']+)'\)/u)],
  /* 27/10/2026 (Mobile, censimento): l'errore del giro col piano ChatGPT rifiutato, la risposta alla spinta del motore locale del
     dispositivo, la rotta del ponte che non esiste (dispositivo e computer su versioni diverse) */
  ['CHATGPT_TOKEN_DA_RINNOVARE', letterale('../server.mjs', 'CHATGPT_TOKEN_DA_RINNOVARE', /new Error\('(The ChatGPT access token[^']+)'\), \{ code: 'CHATGPT_TOKEN_DA_RINNOVARE'/u)],
  ['LOCAL_GUEST_SOCKET_INVALID', letterale('accesso-locale-ospite.mjs', 'LOCAL_GUEST_SOCKET_INVALID', /errore\('(The local engine socket does not exist\.)', 'LOCAL_GUEST_SOCKET_INVALID'\)/u)],
  ['LOCAL_GUEST_SOCKET_INVALID', letterale('accesso-locale-ospite.mjs', 'LOCAL_GUEST_SOCKET_INVALID', /errore\('(The local engine socket is outside[^']+)', 'LOCAL_GUEST_SOCKET_INVALID'\)/u)],
  ['LOCAL_GUEST_SOCKET_INVALID', letterale('accesso-locale-ospite.mjs', 'LOCAL_GUEST_SOCKET_INVALID', /errore\('(The local engine path is not a socket\.)', 'LOCAL_GUEST_SOCKET_INVALID'\)/u)],
  ['NOT_FOUND', letterale('remoto/rotte.mjs', 'NOT_FOUND', /code: 'NOT_FOUND', message: '([^']+)'/u)],
  /* il rifiuto del token spinto dal dispositivo quando questo server tiene il suo accesso (CMO-11 del Mobile) */
  ['CHATGPT_CUSTODE_NON_APP', letterale('chatgpt-rotte.mjs', 'CHATGPT_CUSTODE_NON_APP', /rifiuta\('CHATGPT_CUSTODE_NON_APP', '([^']+)'\)/u)],
];

test('ERR-REMOTI-01 ogni testo del server di questi codici ha la sua frase: in italiano diventa italiano, in inglese resta identico', () => {
  for (const [code, message] of CASI) {
    impostaLingua('en');
    assert.equal(testoErroreServer({ code, message }).message, message, `${code}: l'inglese non è il testo del server`);
    impostaLingua('it');
    const it = testoErroreServer({ code, message }).message;
    assert.notEqual(it, message, `${code}: «${message}» resta in inglese`);
    assert.ok(!/^errori\./u.test(it), 'mai una chiave grezza');
  }
});

test('ERR-REMOTI-02 AL CONTRARIO: un testo del server diverso resta le parole del server, mai una frase generica', () => {
  impostaLingua('it');
  assert.equal(testoErroreServer({ code: 'OPERATION_FAILED', message: 'The relay closed the stream' }).message, 'The relay closed the stream');
  assert.equal(testoErroreServer({ code: 'BAD_MESSAGE', message: 'A file version is needed.' }).message, 'A file version is needed.');
  impostaLingua('en');
});
