/*
 * UI-151 (04/11/2026; condizioni `CONDIZIONI-UI151-CHAT-SETTINGS-2026-11-04.md`, Mobile 11:40, CLI 11:41): il telefono LEGGE la scelta
 * «Blocchi vivi nelle risposte» (decisione 140) con UNA operazione del ponte, `chat.settings` (GET), accanto a `context.settings`.
 * Niente `chat.settings.update`: dal telefono si scrive solo con `app-settings.apply` (ricevuta con origine del dispositivo e Annulla).
 * Condizione della CLI: il ponte lo ospita anche la CLI (`cli/src/remote/host.ts:106`, `createHttpApp` del nucleo con le sole dipendenze
 * di `http-deps.ts`), che non passa né l'archivio della preferenza né il servizio delle impostazioni: lì `chat.settings` non dice MAI
 * «acceso» (risponde il 503 dichiarato, che il telefono legge «spento e non disponibile», mai una carta d'errore), e `app-settings.apply`
 * sulla voce `chat.liveBlocks` rifiuta senza scrivere.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { createImpostazioniChat } from '../src/impostazioni-chat.mjs';
import { creaFontiDelServer } from '../src/impostazioni/fonti-impostazioni.mjs';
import { creaServizioImpostazioni } from '../src/impostazioni/servizio-impostazioni.mjs';
import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { creaOperazioni, OPERAZIONI_HTTP } from '../src/remoto/operazioni.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const contesto = { dispositivo: { id: 'dispositivo-A1', nome: 'OnePlus Pad 3' }, iscrizioni: new Map(), iscrivi: () => async () => {} };
const sessionRegistry = { elenca: () => [], esiste: () => false, async cartellaPerChatFile() { return { code: 'NOT_FOUND' }; } };

/* il ponte VERO davanti all'app del nucleo: `creaOperazioni` + `creaChiamataInterna`, come `remoto/coordinatore` e la CLI */
function ponte(dipendenze, { gettone = null } = {}) {
  const httpApp = createHttpApp({ ...(gettone ? { token: gettone } : { senzaGettone: 'prove' }), staticHandler: async () => null, sessionRegistry, ...dipendenze });
  const chiama = creaChiamataInterna({ httpApp, porta: 4999, gettone });
  return creaOperazioni({ chiama, sessionRegistry, iscriviConRigiocata });
}
function cartella(t) {
  const dir = mkdtempSync(join(tmpdir(), 'ui151-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  return dir;
}
/* il 503 come lo vede il telefono: codice dichiarato, stato 503, frase leggibile; mai un guasto (500, INTERNAL_ERROR) */
const rifiutoLeggibile = (codice) => (e) => {
  assert.equal(e.code, codice);
  assert.equal(e.stato, 503);
  assert.ok(typeof e.message === 'string' && e.message.length > 0 && !/internal/iu.test(e.message), e.message);
  return true;
};

test('UI151-01 una sola operazione, di lettura, sulla rotta vera; nessuna scrittura della preferenza dal ponte', () => {
  const leggi = OPERAZIONI_HTTP['chat.settings'];
  assert.ok(leggi, 'manca chat.settings');
  assert.deepEqual({ metodo: leggi.metodo, percorso: leggi.percorso({}), corpo: leggi.corpo }, { metodo: 'GET', percorso: '/api/v1/chat-settings', corpo: undefined });
  assert.equal(Object.hasOwn(OPERAZIONI_HTTP, 'chat.settings.update'), false, 'dal telefono si scrive solo con app-settings.apply');
  /* le voci che vogliono altri argomenti lanciano: non sono sulla rotta dei blocchi */
  const percorsoDi = (v) => { try { return v.percorso({ sessionId: 's1' }).split('?')[0]; } catch { return null; } };
  const sullaRotta = Object.entries(OPERAZIONI_HTTP).filter(([, v]) => percorsoDi(v) === '/api/v1/chat-settings').map(([n, v]) => [n, v.metodo]);
  assert.deepEqual(sullaRotta, [['chat.settings', 'GET']]);
});

test('UI151-02 dal ponte il telefono legge la stessa scelta della finestra, anche dopo un cambio', async (t) => {
  const impostazioniChat = createImpostazioniChat({ file: join(cartella(t), '.impostazioni-chat.json') });
  const operazioni = ponte({ impostazioniChat });
  assert.ok(operazioni.elenco().includes('chat.settings'));
  assert.deepEqual(await operazioni.esegui('chat.settings', {}, contesto), { blocchiVivi: true });
  await impostazioniChat.scrivi({ blocchiVivi: false });
  assert.deepEqual(await operazioni.esegui('chat.settings', {}, contesto), { blocchiVivi: false });
});

test('UI151-03 un PC senza l\'archivio: il 503 CHAT_SETTINGS_UNAVAILABLE arriva al telefono leggibile, non come guasto', async () => {
  const operazioni = ponte({});
  await assert.rejects(operazioni.esegui('chat.settings', {}, contesto), rifiutoLeggibile('CHAT_SETTINGS_UNAVAILABLE'));
});

test('UI151-04 (condizione della CLI) un ospite come la CLI: `chat.settings` non dice MAI «acceso»', async () => {
  /* le sole dipendenze di `cli/src/remote/http-deps.ts` che contano qui: niente `impostazioniChat`, niente `impostazioniApp`; col gettone */
  const operazioni = ponte({ catalogoModelliFn: async () => ({ modelli: [] }) }, { gettone: 'gettone-cli' });
  let esito = null;
  try { esito = await operazioni.esegui('chat.settings', {}, contesto); } catch (e) { rifiutoLeggibile('CHAT_SETTINGS_UNAVAILABLE')(e); }
  assert.equal(esito, null, `l'ospite CLI ha risposto ${JSON.stringify(esito)}: deve valere spento`);
});

test('UI151-05 (condizione della CLI) un ospite come la CLI: app-settings.apply su chat.liveBlocks rifiuta senza scrivere', async () => {
  /* anche se un giorno l'ospite passasse un archivio per la sola lettura: senza il servizio delle impostazioni niente lo scrive */
  const spia = { scritture: 0, leggi: async () => ({ blocchiVivi: false }), scrivi: async (p) => { spia.scritture += 1; return p; }, blocchiViviPerUnaConversazioneNuova: () => false };
  for (const dipendenze of [{}, { impostazioniChat: spia }]) {
    const operazioni = ponte({ catalogoModelliFn: async () => ({ modelli: [] }), ...dipendenze }, { gettone: 'gettone-cli' });
    for (const value of [false, true]) {
      await assert.rejects(operazioni.esegui('app-settings.apply', { corpo: { changes: [{ key: 'chat.liveBlocks', value }] } }, contesto),
        rifiutoLeggibile('SETTINGS_UNAVAILABLE'));
    }
  }
  assert.equal(spia.scritture, 0);
});

test('UI151-06 (condizione della CLI, domani) un ospite col servizio delle impostazioni ma senza l\'archivio dei blocchi: la voce non si offre e non si scrive', async () => {
  const wsl = { valori: { usaUtenteNormale: true }, leggi() { return { ...this.valori }; }, imposta(p) { Object.assign(this.valori, p); } };
  const servizio = creaServizioImpostazioni({ fonti: creaFontiDelServer({ preferenzeWslStore: wsl }) });
  assert.equal(servizio.catalogo().voci?.some?.((v) => v.chiave === 'chat.liveBlocks') ?? JSON.stringify(servizio.catalogo()).includes('chat.liveBlocks'), false);
  const operazioni = ponte({ impostazioniApp: servizio }, { gettone: 'gettone-cli' });
  await assert.rejects(operazioni.esegui('app-settings.apply', { corpo: { changes: [{ key: 'chat.liveBlocks', value: true }] } }, contesto), (e) => {
    assert.notEqual(e.stato, 500, 'un rifiuto, non un guasto');
    assert.ok(e.stato >= 400 && e.stato < 500, String(e.stato));
    return true;
  });
  assert.deepEqual(await servizio.ricevute(), [], 'nessuna ricevuta: niente è stato scritto');
});
