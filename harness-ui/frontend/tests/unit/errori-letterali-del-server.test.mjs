import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { testoErroreServer } from '../../src/components/errori.js';
import { impostaLingua, t } from '../../src/components/lingua.js';
import { toPublicProblem } from '../../../src/public-problem.mjs';

/*
 * Mobile 27/10/2026 (censimento «Avvisi ed errori», seconda tornata; owner: «tutti gli avvisi e gli errori anche nel mobile»).
 * `testoErroreServer` sostituisce le parole del server solo con una voce il cui INGLESE è identico: qui ci sono le frasi che ARRIVANO
 * davvero alla persona così come il server le scrive, per uno dei due canali:
 *   · REMOTO — `remoto/servizio.mjs` manda al dispositivo `e.message` dell'errore lanciato dal modulo remoto (non passa da
 *     `errorEnvelope`, che manda `MESSAGE_BY_CODE`): la frase arriva come `message`;
 *   · BUSTA — per i codici di `MESSAGGIO_GIA_PER_LA_PERSONA` (`public-problem.mjs`) la frase del server diventa l'`explanation`:
 *     qui si passa dal `toPublicProblem` vero, così la prova dice anche che il canale c'è.
 * (a) il letterale si legge dal SORGENTE del server, sulla riga del suo codice: una frase cambiata là fa diventare rossa questa prova
 *     invece di tornare inglese in silenzio; (b) in inglese esce identico; (c) in italiano esce la voce italiana, mai la chiave grezza.
 */
const sorgente = (rel) => readFileSync(new URL(`../../../src/${rel}`, import.meta.url), 'utf8');

/* [codice, voce del dizionario, file del server, letterale, canali, motivo che il server manda (se lo manda)] */
const CASI = [
  ['BAD_MESSAGE', 'BAD_MESSAGE.image_empty', 'remoto/file-dispositivi.mjs', 'An image for the model cannot be empty.', ['remoto'], 'image-empty'],
  ['BAD_MESSAGE', 'BAD_MESSAGE.image_too_large', 'remoto/file-dispositivi.mjs', 'An image for the model is at most 5 MiB.', ['remoto'], 'image-too-large'],
  ['BAD_MESSAGE', 'BAD_MESSAGE.image_invalid', 'remoto/file-dispositivi.mjs', 'Attach a PNG, JPEG or WebP image.', ['remoto'], 'image-invalid'],
  ['BAD_MESSAGE', 'BAD_MESSAGE.push_subscription_invalid', 'remoto/index.mjs', 'The push subscription is not valid (https endpoint, p256dh of 65 bytes, auth of 16 bytes).', ['remoto']],
  ['BAD_MESSAGE', 'BAD_MESSAGE.body_not_object', 'remoto/operazioni.mjs', 'The body must be an object.', ['remoto']],
  ['CONSENT_REQUIRED', 'CONSENT_REQUIRED.consent_required', 'remoto/operazioni.mjs', 'The computer must allow this device to write in this folder.', ['remoto'], 'consent-required'],
  ['FILE_GONE', 'FILE_GONE.file_changed_or_gone', 'remoto/file-dispositivi.mjs', 'This file changed or is no longer in this conversation.', ['remoto']],
  ['FOLDER_NOT_LISTED', 'FOLDER_NOT_LISTED.folder_gone', 'remoto/cartelle-dispositivi.mjs', 'This folder is no longer on the computer.', ['remoto']],
  ['NOT_ALLOWED_REMOTELY', 'NOT_ALLOWED_REMOTELY.folder_not_allowed_remotely', 'remoto/operazioni.mjs', 'From the device a new session opens only in one of the allowed folders (cartellaId).', ['remoto']],
  ['NOT_FOUND', 'NOT_FOUND.device_session_not_found', 'remoto/file-dispositivi.mjs', 'Session not found.', ['remoto']],
  ['NOT_FOUND', 'NOT_FOUND.consent_request_not_found', 'remoto/cartelle-dispositivi.mjs', 'This consent request does not exist.', ['remoto']],
  ['REMOTE_UNAVAILABLE', 'REMOTE_UNAVAILABLE.remote_not_running', 'remoto/index.mjs', 'Remote control is not running on this computer.', ['remoto']],
  ['REMOTE_STORE_BUSY', 'REMOTE_STORE_BUSY.device_folders_busy', 'remoto/cartelle-dispositivi.mjs', 'Another TALOS window is changing the device folders: try again in a moment.', ['remoto', 'busta']],
  ['REMOTE_STORE_BUSY', 'REMOTE_STORE_BUSY.paired_devices_busy', 'remoto/dispositivi.mjs', 'Another TALOS window is changing the paired devices: try again in a moment.', ['remoto', 'busta']],
  ['SESSION_NOT_READY', 'SESSION_NOT_READY.no_model_declared', 'prompt-enhancer-provider.mjs', 'This session does not declare a model.', ['busta']],
];

/* Ciò che il client riceve davvero, per canale: la parte da guardare e il problema che arriva. */
function arrivi(code, letterale, canali, motivo) {
  const fuori = [];
  if (canali.includes('remoto')) {
    fuori.push(['message', { code, message: letterale, ...(motivo ? { reason: motivo } : {}) }]);
    fuori.push(['message', { code, message: letterale }]); // un client che non copia il motivo: il confronto con l'inglese basta
  }
  if (canali.includes('busta')) {
    const problema = toPublicProblem(Object.assign(new Error(letterale), { code }), { messaggioDelCodice: 'Request not completed here' });
    assert.equal(problema.explanation, letterale, `${code}: la busta non pubblica più «${letterale}» come explanation`);
    fuori.push(['explanation', { code, message: 'Request not completed here', ...problema }]);
  }
  return fuori;
}

test('ERR-LETTERALI-01 (a) ogni letterale c\'è ancora nel sorgente del server, sulla riga del suo codice', () => {
  for (const [code, , file, letterale] of CASI) {
    const righe = sorgente(file).split(/\r?\n/u).filter((r) => r.includes(`'${letterale}'`));
    assert.ok(righe.length > 0, `in ${file} non c'è più «${letterale}»: la voce del dizionario va rifatta`);
    assert.ok(righe.some((r) => r.includes(`'${code}'`) || r.includes(`codice: '${code}'`)), `in ${file} «${letterale}» non è più del codice ${code}`);
  }
});

test('ERR-LETTERALI-02 (b)+(c) in inglese esce il testo del server identico, in italiano la sua voce (mai la chiave grezza)', () => {
  try {
    for (const [code, chiave, , letterale, canali, motivo] of CASI) {
      for (const [parte, problema] of arrivi(code, letterale, canali, motivo)) {
        impostaLingua('en');
        assert.equal(testoErroreServer(problema)[parte], letterale, `${chiave} (${parte}): l'inglese non è il testo del server`);
        impostaLingua('it');
        const it = testoErroreServer(problema)[parte];
        assert.notEqual(it, letterale, `${chiave} (${parte}): «${letterale}» resta in inglese`);
        assert.ok(!/^errori\./u.test(it), `${chiave}: chiave grezza`);
        assert.equal(it, t(`errori.${chiave}`), `${chiave} (${parte}): non è la voce italiana`);
      }
    }
  } finally { impostaLingua('en'); }
});

test('ERR-LETTERALI-03 AL CONTRARIO: un testo diverso dello stesso codice resta le parole del server', () => {
  try {
    impostaLingua('it');
    // basta un punto in meno perché la voce non coincida
    assert.equal(testoErroreServer({ code: 'BAD_MESSAGE', message: 'An image for the model cannot be empty', reason: 'image-empty' }).message, 'An image for the model cannot be empty');
    assert.equal(testoErroreServer({ code: 'NOT_FOUND', message: 'Session gone.' }).message, 'Session gone.');
    assert.equal(testoErroreServer({ code: 'REMOTE_STORE_BUSY', message: 'x', explanation: 'Another window is busy.' }).explanation, 'Another window is busy.');
    assert.equal(testoErroreServer({ code: 'SESSION_NOT_READY', message: 'x', explanation: 'This session does not declare a model' }).explanation, 'This session does not declare a model');
  } finally { impostaLingua('en'); }
});
