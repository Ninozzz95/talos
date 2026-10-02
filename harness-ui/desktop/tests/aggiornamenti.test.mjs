import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { firmaManifesto, sha512Base64 } from '../firma-aggiornamenti.mjs';
import {
  INTERVALLO_MS, RITARDO_PRIMO_CONTROLLO_MS, confrontaVersioni, creaAggiornatore, leggiManifestoVerificato, sceltaRelease,
} from '../aggiornamenti.mjs';

/*
 * 01/10/2026 — l'aggiornatore del guscio (owner: «seamless, automatizzato e user friendly»; firma Ed25519 nostra). Tutto ciò che
 * tocca il mondo è finto: l'autoUpdater di electron-updater, la rete, il tempo, le impostazioni. Le prove dicono il percorso
 * felice E ogni verso in cui NON si deve installare niente.
 */
const coppia = () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return { privata: privateKey.export({ type: 'pkcs8', format: 'pem' }), pubblica: publicKey.export({ type: 'spki', format: 'pem' }) };
};
const CHIAVI = coppia();
const INSTALLER = Buffer.from('installer 0.1.21');
const manifestoDi = (versione = '0.1.21', sha = sha512Base64(INSTALLER)) => `version: ${versione}
files:
  - url: TALOS-Setup-${versione}.exe
    sha512: ${sha}
path: TALOS-Setup-${versione}.exe
sha512: ${sha}
releaseDate: '2026-10-01T20:00:00.000Z'
`;
const RELEASE = [
  { tag_name: 'talos-cli-v9.0.0', draft: false, prerelease: false, html_url: 'https://github.com/Ninozzz95/talos/releases/tag/talos-cli-v9.0.0' },
  { tag_name: 'v0.1.40', draft: false, prerelease: false },
  { tag_name: 'desktop-v0.1.22', draft: true, prerelease: false },
  { tag_name: 'desktop-v0.1.23', draft: false, prerelease: true },
  { tag_name: 'desktop-v0.1.21', draft: false, prerelease: false, html_url: 'https://github.com/Ninozzz95/talos/releases/tag/desktop-v0.1.21' },
  { tag_name: 'desktop-v0.1.20', draft: false, prerelease: false },
  { tag_name: 'desktop-v0.1.21-rc', draft: false, prerelease: false },
];
const BASE = 'https://github.com/Ninozzz95/talos/releases/download/desktop-v0.1.21';

function rete({ release = RELEASE, manifesto = manifestoDi(), firma = firmaManifesto(manifestoDi(), CHIAVI.privata), stati = {} } = {}) {
  const chiamate = [];
  const fetch = async (url) => {
    chiamate.push(url);
    const stato = stati[url] ?? 200;
    const corpo = url.startsWith('https://api.github.com/') ? JSON.stringify(release) : url.endsWith('/latest.yml') ? manifesto : url.endsWith('/latest.yml.sig') ? firma : null;
    if (corpo === null) return { ok: false, status: 404 };
    const byte = Buffer.from(corpo);
    return { ok: stato >= 200 && stato < 300, status: stato, json: async () => JSON.parse(corpo), text: async () => corpo, arrayBuffer: async () => byte.buffer.slice(byte.byteOffset, byte.byteOffset + byte.length) };
  };
  return { fetch, chiamate };
}

/*
 * Il finto riproduce ciò che conta di electron-updater 6.8.9 (`out/BaseUpdater.js`): alla fine dello scaricamento emette
 * `update-downloaded` e SUBITO DOPO aggancia l'installazione alla chiusura, ma SOLO se `autoInstallOnAppQuit` è vero in
 * quell'istante (`addQuitHandler`, righe 69-73); alla chiusura il gestore rilegge il valore (riga 79) e installa se è vero.
 * `chiudi()` simula la chiusura dell'app.
 */
function updaterFinto({ versione = '0.1.21', disponibile = true, file = 'C:\\aggiornamenti\\TALOS-Setup-0.1.21.exe', nullo = false } = {}) {
  const ascolti = new Map();
  const u = {
    autoDownload: true, autoInstallOnAppQuit: true, feed: null, scaricati: 0, installati: [], gestoreChiusura: false, installatoAllaChiusura: false,
    setFeedURL(o) { u.feed = o; },
    on(evento, fn) { ascolti.set(evento, [...(ascolti.get(evento) ?? []), fn]); return u; },
    async checkForUpdates() { return nullo ? null : { isUpdateAvailable: disponibile, updateInfo: { version: versione } }; },
    async downloadUpdate() {
      u.scaricati += 1;
      for (const fn of ascolti.get('update-downloaded') ?? []) fn({ version: versione, downloadedFile: file });
      if (u.autoInstallOnAppQuit) u.gestoreChiusura = true;
      await new Promise((r) => setImmediate(r));
      return [file];
    },
    quitAndInstall(...a) { u.installati.push(a); },
    chiudi() { if (u.gestoreChiusura && u.autoInstallOnAppQuit) u.installatoAllaChiusura = true; },
  };
  return u;
}

function tempo() {
  const timer = [];
  return {
    timer,
    pianifica: (fn, ms) => { const t = { fn, ms, attivo: true }; timer.push(t); return t; },
    annulla: (t) => { if (t) t.attivo = false; },
    attivi: () => timer.filter((t) => t.attivo),
  };
}

function aggiornatore({ updater = updaterFinto(), fetchFinto = rete(), salvate = {}, sha = sha512Base64(INSTALLER), notifiche = [], versioneAttuale = '0.1.20' } = {}) {
  const t = tempo();
  const scritte = [];
  const a = creaAggiornatore({
    updater, fetch: fetchFinto.fetch, chiavePubblica: CHIAVI.pubblica, versioneAttuale,
    impostazioni: { leggi: () => salvate, scrivi: (v) => scritte.push(v) },
    pianifica: t.pianifica, annulla: t.annulla, ora: () => new Date('2026-10-01T21:00:00.000Z'),
    notifica: (s) => notifiche.push(s), calcolaSha512: async () => sha,
  });
  return { a, t, scritte, updater, notifiche, fetchFinto };
}

test('AGG-VERS-01: le versioni si confrontano numero per numero; una non x.y.z è un errore, non un «uguale»', () => {
  assert.equal(confrontaVersioni('0.1.10', '0.1.9'), 1);
  assert.equal(confrontaVersioni('0.1.9', '0.1.10'), -1);
  assert.equal(confrontaVersioni('1.0.0', '1.0.0'), 0);
  for (const v of ['0.1', '0.1.21-rc', '', null]) assert.throws(() => confrontaVersioni(v, '0.1.0'), /non confrontabile/);
});

test('AGG-SCELTA-01: si prende la desktop più alta e più nuova, mai bozze, pre-release, CLI, mobile o tag storti', () => {
  assert.deepEqual(sceltaRelease(RELEASE, '0.1.20'), { tag: 'desktop-v0.1.21', versione: '0.1.21', pagina: 'https://github.com/Ninozzz95/talos/releases/tag/desktop-v0.1.21' });
  assert.equal(sceltaRelease(RELEASE, '0.1.21'), null, 'già aggiornata');
  assert.equal(sceltaRelease(RELEASE, '0.2.0'), null, 'installata più nuova della pubblicata');
  assert.equal(sceltaRelease(null, '0.1.20'), null);
  assert.equal(sceltaRelease([{ tag_name: 42 }, null], '0.1.20'), null);
});

test('AGG-MANIF-01: il manifesto vale solo con la firma giusta, sui byte esatti, e con la versione della release', async () => {
  const ok = await leggiManifestoVerificato({ fetch: rete().fetch, base: BASE, versione: '0.1.21', chiavePubblica: CHIAVI.pubblica });
  assert.equal(ok.version, '0.1.21');
  assert.equal(ok.sha512, sha512Base64(INSTALLER));
  const altra = coppia();
  const casi = {
    'manifesto toccato': rete({ manifesto: manifestoDi().replace('installer', 'x').replace('2026-10-01', '2026-10-02') }),
    'firmato da un altra chiave': rete({ firma: firmaManifesto(manifestoDi(), altra.privata) }),
    'firma vuota': rete({ firma: '' }),
    'firma assente (404)': rete({ stati: { [`${BASE}/latest.yml.sig`]: 404 } }),
  };
  for (const [nome, r] of Object.entries(casi)) {
    await assert.rejects(leggiManifestoVerificato({ fetch: r.fetch, base: BASE, versione: '0.1.21', chiavePubblica: CHIAVI.pubblica }), undefined, nome);
  }
  const versioneDiversa = rete({ manifesto: manifestoDi('0.1.22'), firma: firmaManifesto(manifestoDi('0.1.22'), CHIAVI.privata) });
  await assert.rejects(leggiManifestoVerificato({ fetch: versioneDiversa.fetch, base: BASE, versione: '0.1.21', chiavePubblica: CHIAVI.pubblica }), /0\.1\.22.*0\.1\.21/);
});

test('AGG-FLUSSO-01: percorso felice — release desktop, manifesto verificato, feed generico sul tag, scarica, ricontrolla lo sha512, POI installa alla chiusura', async () => {
  const { a, updater, scritte, notifiche } = aggiornatore();
  assert.equal(updater.autoDownload, false, 'mai scaricare prima della verifica');
  assert.equal(updater.autoInstallOnAppQuit, false, 'mai installare prima del secondo controllo');
  const stato = await a.controlla({ manuale: true });
  assert.deepEqual(updater.feed, { provider: 'generic', url: BASE });
  assert.equal(updater.scaricati, 1);
  assert.equal(updater.autoInstallOnAppQuit, true);
  assert.equal(stato.stato, 'pronto');
  assert.deepEqual(stato.pronto, { versione: '0.1.21', pagina: 'https://github.com/Ninozzz95/talos/releases/tag/desktop-v0.1.21' });
  assert.deepEqual(scritte.at(-1), { automatici: true, ultimoControllo: { quando: '2026-10-01T21:00:00.000Z', esito: 'pronto', errore: null } });
  assert.ok(notifiche.some((n) => n.stato === 'controllo') && notifiche.at(-1).stato === 'pronto', 'l interfaccia vede il controllo e l esito');
});

test('AGG-CHIUSURA-01: l installazione alla chiusura si AGGANCIA davvero (electron-updater la aggancia solo se il flag è vero allo scaricamento) e avviene alla chiusura', async () => {
  const { a, updater } = aggiornatore();
  await a.controlla({ manuale: true });
  assert.equal(updater.gestoreChiusura, true, 'senza aggancio «si installa quando chiudi l app» non succederebbe mai');
  updater.chiudi();
  assert.equal(updater.installatoAllaChiusura, true);
});

test('AGG-CHIUSURA-02: AL CONTRARIO — fra lo scaricamento e il secondo controllo dello sha512 una chiusura NON installa; se lo sha512 non torna, mai', async () => {
  const updater = updaterFinto();
  const t = tempo();
  let chiusoDuranteIlControllo = null;
  const a = creaAggiornatore({
    updater, fetch: rete().fetch, chiavePubblica: CHIAVI.pubblica, versioneAttuale: '0.1.20',
    impostazioni: { leggi: () => ({}), scrivi: () => {} }, pianifica: t.pianifica, annulla: t.annulla,
    calcolaSha512: async () => { updater.chiudi(); chiusoDuranteIlControllo = updater.installatoAllaChiusura; return 'sbagliato'; },
  });
  const stato = await a.controlla({ manuale: true });
  assert.equal(chiusoDuranteIlControllo, false, 'una chiusura prima della verifica non installa');
  assert.equal(stato.stato, 'errore');
  updater.chiudi();
  assert.equal(updater.installatoAllaChiusura, false, 'un file che non torna col manifesto firmato non si installa mai');
});

test('AGG-CHIUSURA-03: con l interruttore spento lo scaricamento manuale aggancia lo stesso, ma la chiusura non installa; acceso dopo, sì', async () => {
  const spento = aggiornatore({ salvate: { automatici: false } });
  await spento.a.controlla({ manuale: true });
  spento.updater.chiudi();
  assert.equal(spento.updater.installatoAllaChiusura, false);
  spento.a.impostaAutomatici(true);
  spento.updater.chiudi();
  assert.equal(spento.updater.installatoAllaChiusura, true);
});

test('AGG-FLUSSO-02: AL CONTRARIO — l installer scaricato non torna col manifesto firmato: niente installazione, e lo dice', async () => {
  const { a, updater } = aggiornatore({ sha: sha512Base64(Buffer.from('un altro file')) });
  const stato = await a.controlla({ manuale: true });
  assert.equal(stato.stato, 'errore');
  assert.match(stato.errore, /non corrisponde al manifesto firmato/);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(stato.pronto, null);
});

test('AGG-FLUSSO-03: AL CONTRARIO — se electron-updater non vede l aggiornamento, o vede un altra versione, non si scarica niente', async () => {
  for (const updater of [updaterFinto({ versione: '0.1.22' }), updaterFinto({ disponibile: false }), updaterFinto({ nullo: true })]) {
    const { a } = aggiornatore({ updater });
    const stato = await a.controlla({ manuale: true });
    assert.equal(stato.stato, 'errore');
    assert.equal(updater.scaricati, 0);
    assert.equal(updater.autoInstallOnAppQuit, false);
  }
});

test('AGG-FLUSSO-04: AL CONTRARIO — firma sbagliata: nessun feed, nessuno scaricamento', async () => {
  const altra = coppia();
  const { a, updater } = aggiornatore({ fetchFinto: rete({ firma: firmaManifesto(manifestoDi(), altra.privata) }) });
  const stato = await a.controlla({ manuale: true });
  assert.equal(stato.stato, 'errore');
  assert.match(stato.errore, /firma del manifesto non è valida/);
  assert.equal(updater.feed, null);
  assert.equal(updater.scaricati, 0);
});

test('AGG-FLUSSO-05: nessuna release più nuova ⇒ «aggiornato», senza toccare electron-updater', async () => {
  const { a, updater } = aggiornatore({ versioneAttuale: '0.1.21' });
  const stato = await a.controlla({ manuale: true });
  assert.equal(stato.stato, 'aggiornato');
  assert.equal(updater.feed, null);
  assert.equal(updater.scaricati, 0);
});

test('AGG-TEMPO-01: il primo controllo 30 s dopo l avvio, poi ogni 4 ore; due controlli insieme sono uno solo', async () => {
  const { a, t, fetchFinto } = aggiornatore();
  a.avvia();
  assert.deepEqual(t.attivi().map((x) => x.ms), [RITARDO_PRIMO_CONTROLLO_MS]);
  const [uno, due] = [a.controlla(), a.controlla()];
  await Promise.all([uno, due]);
  assert.equal(fetchFinto.chiamate.filter((u) => u.startsWith('https://api.github.com/')).length, 1, 'una sola richiesta alle release');
  assert.deepEqual(t.attivi().map((x) => x.ms), [INTERVALLO_MS]);
  assert.equal(INTERVALLO_MS, 4 * 60 * 60 * 1000);
});

test('AGG-INTERRUTTORE-01: spento ⇒ nessun controllo da solo, «Controlla ora» sì; spento dopo lo scaricamento ⇒ niente installazione alla chiusura', async () => {
  const spento = aggiornatore({ salvate: { automatici: false } });
  spento.a.avvia();
  assert.equal(spento.t.attivi().length, 0);
  const s = await spento.a.controlla();
  assert.equal(s.stato, 'fermo');
  assert.equal(spento.fetchFinto.chiamate.length, 0);
  const m = await spento.a.controlla({ manuale: true });
  assert.equal(m.stato, 'pronto');
  assert.equal(spento.updater.autoInstallOnAppQuit, false, 'interruttore spento: scaricato, ma non si installa da solo');
  const acceso = aggiornatore();
  await acceso.a.controlla({ manuale: true });
  acceso.a.impostaAutomatici(false);
  assert.equal(acceso.updater.autoInstallOnAppQuit, false);
  assert.equal(acceso.scritte.at(-1).automatici, false);
  acceso.a.impostaAutomatici(true);
  assert.equal(acceso.updater.autoInstallOnAppQuit, true);
});

test('AGG-RIAVVIA-01: «Riavvia ora» installa solo un aggiornamento scaricato e verificato', async () => {
  const { a, updater } = aggiornatore();
  assert.equal(a.riavviaOra(), false);
  assert.deepEqual(updater.installati, []);
  await a.controlla({ manuale: true });
  assert.equal(a.riavviaOra(), true);
  assert.deepEqual(updater.installati, [[true, true]]);
});

test('AGG-ROBUSTO-01: impostazioni che non si salvano e notifiche che lanciano non fermano l aggiornatore', async () => {
  const updater = updaterFinto();
  const t = tempo();
  const a = creaAggiornatore({
    updater, fetch: rete().fetch, chiavePubblica: CHIAVI.pubblica, versioneAttuale: '0.1.20',
    impostazioni: { leggi: () => null, scrivi: () => { throw new Error('disco pieno'); } },
    pianifica: t.pianifica, annulla: t.annulla, notifica: () => { throw new Error('finestra chiusa'); },
    calcolaSha512: async () => sha512Base64(INSTALLER),
  });
  const stato = await a.controlla({ manuale: true });
  assert.equal(stato.stato, 'pronto');
});

test('AGG-FONTE-01: con la fonte di prova (passo 4) l aggiornatore chiede l elenco e scarica dal server indicato, mai da GitHub', async () => {
  const LOCALE = 'http://127.0.0.1:47311';
  const chiamate = [];
  const manifesto = manifestoDi();
  const firma = firmaManifesto(manifesto, CHIAVI.privata);
  const fetch = async (url) => {
    chiamate.push(url);
    const corpo = url === `${LOCALE}/repos/prova/talos/releases?per_page=30` ? JSON.stringify(RELEASE)
      : url === `${LOCALE}/prova/talos/releases/download/desktop-v0.1.21/latest.yml` ? manifesto
        : url === `${LOCALE}/prova/talos/releases/download/desktop-v0.1.21/latest.yml.sig` ? firma : null;
    if (corpo === null) return { ok: false, status: 404 };
    const byte = Buffer.from(corpo);
    return { ok: true, status: 200, json: async () => JSON.parse(corpo), text: async () => corpo, arrayBuffer: async () => byte.buffer.slice(byte.byteOffset, byte.byteOffset + byte.length) };
  };
  const updater = updaterFinto();
  const t = tempo();
  const a = creaAggiornatore({
    updater, fetch, chiavePubblica: CHIAVI.pubblica, versioneAttuale: '0.1.20', repo: 'prova/talos', fonte: { api: LOCALE, download: LOCALE },
    impostazioni: { leggi: () => ({}), scrivi: () => {} }, pianifica: t.pianifica, annulla: t.annulla, calcolaSha512: async () => sha512Base64(INSTALLER),
  });
  const stato = await a.controlla({ manuale: true });
  assert.equal(stato.stato, 'pronto');
  assert.deepEqual(updater.feed, { provider: 'generic', url: `${LOCALE}/prova/talos/releases/download/desktop-v0.1.21` });
  assert.ok(chiamate.every((u) => u.startsWith(LOCALE)), `nessuna chiamata fuori dalla fonte: ${chiamate.join(', ')}`);
});
