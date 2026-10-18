import assert from 'node:assert/strict';
import test from 'node:test';
import { creaAccessoChatgptOspite, CODICE_DA_RINNOVARE, MARGINE_OSPITE_MS } from '../src/chatgpt-accesso-ospite.mjs';
import { creaRotteChatgpt } from '../src/chatgpt-rotte.mjs';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { chiamaConRitenta } from '../src/kernel/talosHarness.mjs';

/*
 * 18/10/2026 — legge dell'owner «un solo accesso»: col custode nell'app (`TALOS_CHATGPT_CUSTODE=app`, il telefono) r4 tiene SOLO in
 * memoria il token che l'app spinge, non rinnova mai e, quando il token non basta, lo DICE (`CHATGPT_TOKEN_DA_RINNOVARE`). Contratto
 * concordato con la sessione mobile (stesso verso delle chiavi dei fornitori). Ogni prova ha il suo verso contrario.
 */
const ORA = 1_800_000_000_000;
const orologio = () => { let t = ORA; return { clock: () => t, avanza: (ms) => { t += ms; } }; };
const TOKEN = 'eyJ.TOKEN-DELL-APP.firma';

test('CUSTODE-01 — il token spinto dall’app torna a ogni richiesta, e lo stato non lo porta mai (né l’email)', async () => {
  const o = orologio();
  const a = creaAccessoChatgptOspite({ clock: o.clock });
  assert.equal(a.ricevi({ accessToken: TOKEN, scadeAlle: ORA + 60 * 60_000, accountId: 'acc-1' }), null);
  assert.equal(await a.tokenDiAccesso(), TOKEN);
  const stato = a.stato();
  assert.equal(stato.collegato, true);
  assert.equal(stato.gestitoDallApp, true);
  assert.equal(stato.email, null);
  assert.equal(JSON.stringify(stato).includes('TOKEN-DELL-APP'), false, 'no token in the state');
});

test('CUSTODE-02 — senza token, o con uno che scade entro 5 minuti: CHATGPT_TOKEN_DA_RINNOVARE, e quello vecchio si dimentica', async () => {
  const o = orologio();
  const a = creaAccessoChatgptOspite({ clock: o.clock });
  await assert.rejects(a.tokenDiAccesso(), (e) => e.code === CODICE_DA_RINNOVARE);
  a.ricevi({ accessToken: TOKEN, scadeAlle: ORA + 10 * 60_000 });
  assert.equal(await a.tokenDiAccesso(), TOKEN, 'ten minutes left: usable');
  o.avanza(10 * 60_000 - MARGINE_OSPITE_MS + 1);
  await assert.rejects(a.tokenDiAccesso(), (e) => e.code === CODICE_DA_RINNOVARE && !String(e.message).includes('TOKEN-DELL-APP'));
  assert.equal(a.stato().collegato, false, 'forgotten');
});

test('CUSTODE-03 — dopo un rifiuto del servizio (forzaRinnovo) non si torna MAI al token vecchio, finché l’app non ne spinge uno nuovo', async () => {
  const a = creaAccessoChatgptOspite({ clock: orologio().clock });
  a.ricevi({ accessToken: TOKEN, scadeAlle: ORA + 60 * 60_000 });
  await assert.rejects(a.tokenDiAccesso({ forzaRinnovo: true }), (e) => e.code === CODICE_DA_RINNOVARE);
  await assert.rejects(a.tokenDiAccesso(), (e) => e.code === CODICE_DA_RINNOVARE, 'the refused token is not reused');
  a.ricevi({ accessToken: 'eyJ.NUOVO.firma', scadeAlle: ORA + 60 * 60_000 });
  assert.equal(await a.tokenDiAccesso(), 'eyJ.NUOVO.firma');
});

test('CUSTODE-04 — accesso e uscita da r4 no: si fanno nella chat dell’app', async () => {
  const a = creaAccessoChatgptOspite();
  await assert.rejects(a.inizia({ consenso: true }), (e) => e.code === 'CHATGPT_GESTITO_DALL_APP');
  await assert.rejects(a.esci(), (e) => e.code === 'CHATGPT_GESTITO_DALL_APP');
});

test('CUSTODE-05 — un token storto si rifiuta col suo codice: vuoto, senza scadenza, già scaduto', () => {
  const a = creaAccessoChatgptOspite({ clock: orologio().clock });
  assert.equal(a.ricevi({ scadeAlle: ORA + 1 })?.code, 'CHATGPT_ACCESSO_NON_VALIDO');
  assert.equal(a.ricevi({ accessToken: TOKEN })?.code, 'CHATGPT_ACCESSO_NON_VALIDO');
  assert.equal(a.ricevi({ accessToken: TOKEN, scadeAlle: ORA - 1 })?.code, CODICE_DA_RINNOVARE);
  assert.equal(a.stato().collegato, false);
});

test('CUSTODE-ROTTE-01 — la rotta del token: tiene il token, rifiuta campi in più (l’email), e «remove» lo dimentica', async () => {
  const a = creaAccessoChatgptOspite({ clock: orologio().clock });
  const dimenticati = [];
  const rotta = creaRotteChatgpt({ accesso: a, catalogo: { dimentica: () => dimenticati.push(1) } });
  const ok = await rotta({ method: 'POST', percorso: '/api/v1/providers/chatgpt/access', corpo: { accessToken: TOKEN, scadeAlle: ORA + 3_600_000, accountId: 'acc-1' } });
  assert.deepEqual(ok, { stato: 200, dati: { scadeAlle: ORA + 3_600_000 } });
  assert.equal(JSON.stringify(ok).includes('TOKEN-DELL-APP'), false);
  assert.equal(dimenticati.length, 1, 'a new account: the model list is read again');
  await rotta({ method: 'POST', percorso: '/api/v1/providers/chatgpt/access', corpo: { accessToken: 'eyJ.altro.x', scadeAlle: ORA + 3_600_000, accountId: 'acc-1' } });
  assert.equal(dimenticati.length, 1, 'same account: the list stays');
  const conEmail = await rotta({ method: 'POST', percorso: '/api/v1/providers/chatgpt/access', corpo: { accessToken: TOKEN, scadeAlle: ORA + 3_600_000, email: 'x@y' } });
  assert.equal(conEmail.errore?.code, 'CHATGPT_RICHIESTA_NON_VALIDA');
  assert.equal((await rotta({ method: 'GET', percorso: '/api/v1/providers/chatgpt/access' })).stato, 405);
  const via = await rotta({ method: 'POST', percorso: '/api/v1/providers/chatgpt/access/remove' });
  assert.equal(via.stato, 200);
  assert.equal(a.stato().collegato, false);
});

test('CUSTODE-ROTTE-02 AL CONTRARIO — sul desktop (custodia nostra) la rotta del token non esiste per nessuno: 409 CHATGPT_CUSTODE_NON_APP', async () => {
  const accessoDesktop = { stato: () => ({ collegato: true }), ricevi: () => { throw new Error('never'); } };
  for (const accesso of [accessoDesktop, null]) {
    const rotta = creaRotteChatgpt({ accesso });
    const r = await rotta({ method: 'POST', percorso: '/api/v1/providers/chatgpt/access', corpo: { accessToken: TOKEN, scadeAlle: ORA + 3_600_000 } });
    assert.equal(r.stato, 409);
    assert.equal(r.errore.code, 'CHATGPT_CUSTODE_NON_APP');
  }
});

/* Il 401 del servizio attraverso il motore VERO (stesso banco di `chatgpt-instradamento.test.mjs`), con e senza il gancio. */
function bancoDel401({ gancio }) {
  const richieste = [];
  const rete = async (url, opzioni = {}) => {
    richieste.push(String(url));
    return new Response(JSON.stringify({ error: { message: 'Unauthorized.' } }), { status: 401, headers: { 'content-type': 'application/json' } });
  };
  const store = createProviderCredentialStore({ env: {}, keyring: { get: () => null, set: () => true, remove: () => true } });
  const dimenticati = [];
  const dipendenze = { leggiChiave: () => null, leggiRuntime: () => ({}), leggiTokenDelPiano: async () => TOKEN, registraUsoDelPiano: async () => {},
    ...(gancio ? { suTokenDelPianoRifiutato: () => { dimenticati.push(1); return Object.assign(new Error('renew'), { code: CODICE_DA_RINNOVARE, transitorio: false, fornitore: 'chatgpt' }); } } : {}) };
  const trasporto = creaFetchMultiProvider(rete, { providerStore: store, dipendenze });
  const run = () => chiamaConRitenta({ modello: 'chatgpt:gpt-6-sol', chiave: 'unused', messaggi: [{ role: 'user', content: 'ciao' }], attrezzi: [],
    maxOutputTokens: 50, fetchDiRete: trasporto, dormi: async () => {}, caso: () => 0 });
  return { richieste, dimenticati, run };
}

test('CUSTODE-401 — col custode nell’app un 401 diventa CHATGPT_TOKEN_DA_RINNOVARE e il token si dimentica; AL CONTRARIO, senza, resta CHATGPT_ACCESSO_NON_VALIDO', async () => {
  const app = bancoDel401({ gancio: true });
  await assert.rejects(app.run(), (e) => (e.code ?? e.cause?.code) === CODICE_DA_RINNOVARE);
  assert.equal(app.dimenticati.length, 1);
  assert.equal(app.richieste.length, 1, 'a refused token is not sent again');
  const desktop = bancoDel401({ gancio: false });
  await assert.rejects(desktop.run(), (e) => (e.code ?? e.cause?.code) === 'CHATGPT_ACCESSO_NON_VALIDO');
});
