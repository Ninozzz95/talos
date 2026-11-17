/*
 * Giro di sicurezza 2 (10/11/2026; revisione 3, reperto 1 MEDIO; giudice v1301) — LA RETE DELLE PAGINE RESE, con Electron VERO.
 *   Misurato sulla 0.2.0 uscita e sul commit D1: una pagina d'artefatto con `connect-src 'none'` crea `RTCPeerConnection` con `stun:` e
 *   `turn:…?transport=tcp` e i pacchetti ARRIVANO a host e porta scelti dalla pagina (UDP verso lo STUN, TCP verso il TURN), dalla finestra
 *   dell'artefatto e dall'anteprima in chat. La politica del server non lo chiude (`webrtc 'block'` non è applicato da Chromium 152).
 * ⇒ Tre strati nel guscio (`finestra-artefatto.mjs`), qui misurati uno per uno con un finto STUN e un finto TURN su 127.0.0.1:
 *   · la lista delle connessioni (`Connection-Allowlist: (response-origin)`, Chrome 152) posata dal guscio su ogni pagina resa;
 *   · nella finestra dell'artefatto, in più, il proxy morto della sessione e WebRTC senza UDP diretto.
 *   Il terzo canale è il NOME del server (`stun:<dato>.attaccante`: il dato esce nella domanda al DNS). Si conta nel registro di rete
 *   della sessione: la lista lo chiude; la sola rete della sessione NO per il nome del TURN (Chromium lo risolve prima di passare dal
 *   proxy), ed è il motivo per cui la lista è il primo strato e non un di più. Lo stesso vale per `<link rel="dns-prefetch">`, che la
 *   politica del server non ferma (misurato: il nome arriva al DNS anche con `connect-src 'none'`).
 * Giro di sicurezza 3 (10/11/2026; controllore del giro 2, reperti N1, F3, F4): ART-RETE-08..13. Due lanci di Electron: il primo come
 *   l'app (un processo per pagina resa), il secondo SENZA, coi soli scenari delle cadute (la prova al contrario: la sorella cade anche lei).
 * Giro di sicurezza 5 (11/11/2026; forma `FORMA-ORIGINE-PER-PAGINA-2026-11-11.md`, giudice v1416-v1430): ogni pagina sulla SUA origine
 *   (`<etichetta>.localhost` alla porta del servizio) e un processo per ORIGINE (`grouping/per-origin`, quello di serie): ART-RETE-08 e 14-17.
 * Finestre nascoste, profilo finto, server finti solo su 127.0.0.1 (`fixtures/guscio-artefatto-rete.mjs`). Come `guscio.spec.mjs`, sta
 * in `test:guscio` (lancia Electron), non in `test:puri`.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { root, lineeDelGancio, nessunPortachiaviVero } from './support.mjs';

const require = createRequire(import.meta.url);
const eseguibile = require('electron');
/* round k (11/11): a path from `root`, like the other specs, so the keyring scan can lift this launch (SHELL-KEYRING-SITES) */
const guscio = join(root, 'tests', 'fixtures', 'guscio-artefatto-rete.mjs');

let esito = null; let uscita = null; let stderr = '';
/* giro 3: il secondo lancio, SENZA un processo per pagina resa, coi soli scenari delle cadute (la prova al contrario di ART-RETE-08) */
let contrario = null;
const cartelle = [];

async function lancia(extra = {}) {
  const prove = process.env.TALOS_PROVE_DIR || join(root, '.prove');
  mkdirSync(prove, { recursive: true });
  const cartella = mkdtempSync(join(prove, 'artefatto-rete-'));
  cartelle.push(cartella);
  const file = join(cartella, 'esito.json');
  /* come `preparaRuntime`: nessuna chiave e nessuna variabile di TALOS arriva al guscio di prova; poi, come `preparaRuntime` (round k,
     11/11), il portachiavi in memoria e il segno esplicito delle prove (TALOS_PROVA_ISOLATA), dopo gli `extra` perché nessuno li tolga */
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/KEY|TOKEN|SECRET|PASSWORD|TALOS_|NODE_OPTIONS|ELECTRON_RUN_AS_NODE|^PROVA_/i.test(k)));
  Object.assign(env, { PROVA_PROFILO: join(cartella, 'profilo'), PROVA_USCITA: file, ...extra, TALOS_HARNESS_UI_KEYRING: 'memoria', TALOS_PROVA_ISOLATA: '1' });
  const figlio = spawn(eseguibile, [guscio], { env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let errori = '';
  figlio.stderr.on('data', (d) => { errori = (errori + String(d)).slice(-4000); });
  const tetto = setTimeout(() => { try { figlio.kill(); } catch { /* già uscito */ } }, 110000);
  const [codice] = await once(figlio, 'exit');
  clearTimeout(tetto);
  let letto = null;
  try { letto = JSON.parse(readFileSync(file, 'utf8')); } catch { letto = null; }
  return { esito: letto, uscita: codice, stderr: errori };
}

before(async () => {
  const primaDelLancio = lineeDelGancio(); // round k (K1): the hook trace is read from here on, after the two launches
  ({ esito, uscita, stderr } = await lancia());
  contrario = await lancia({ PROVA_SOLO: 'cadute', PROVA_SENZA: 'isolamento' });
  nessunPortachiaviVero(primaDelLancio);
}, { timeout: 240000 });

/* `TALOS_PROVE_TIENI=1`: le cartelle restano (gli esiti di una corsa si rileggono dopo) */
after(() => { if (process.env.TALOS_PROVE_TIENI === '1') return; for (const cartella of cartelle) { try { rmSync(cartella, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Chromium può tenere un file ancora per un attimo */ } } });

const scenario = (nome) => {
  assert.ok(esito?.finito, `il guscio di prova non ha finito (uscita ${uscita}): ${esito?.errore ?? stderr}`);
  const s = esito.scenari[nome];
  assert.ok(s, `manca lo scenario ${nome}`);
  assert.equal(s.errore, undefined, `${nome}: ${s.errore}`);
  return s;
};
const esiti = (s) => { try { return JSON.parse(s.esiti) ?? {}; } catch { return {}; } };
const fuga = (s) => s.udp + s.tcp;
const nomi = (s) => ({ dnsUdp: s.dnsUdp, dnsTcp: s.dnsTcp, dnsCercato: s.dnsCercato });
const NESSUN_NOME = { dnsUdp: 0, dnsTcp: 0, dnsCercato: 0 };
const nomiChiesti = (s) => s.dnsUdp > 0 && s.dnsTcp > 0 && s.dnsCercato > 0;

test('ART-RETE-01 dalla finestra dell artefatto non esce niente: 0 pacchetti UDP e 0 connessioni TCP verso STUN e TURN scelti dalla pagina, e la pagina si carica', () => {
  const nuda = scenario('nuda');
  assert.ok(fuga(nuda) > 0, `la prova al contrario: senza gli strati del guscio la pagina ESCE (UDP ${nuda.udp}, TCP ${nuda.tcp}); se qui è 0 la sonda non vede nulla`);
  const s = scenario('finestra');
  assert.equal(s.caricata, true, 'con la rete chiusa la pagina si carica lo stesso');
  assert.deepEqual({ udp: s.udp, tcp: s.tcp }, { udp: 0, tcp: 0 }, `oggi: UDP ${nuda.udp}, TCP ${nuda.tcp} (${nuda.tcpByte} byte)`);
  assert.equal(s.politicaWebrtc, 'disable_non_proxied_udp');
  const pagina = esiti(s);
  assert.equal(pagina.tipo, 'function', 'la pagina ha davvero provato: RTCPeerConnection c è');
  assert.equal(pagina.parte, 'caricata', 'gli script della sua cartella arrivano');
  assert.equal(pagina.img, 7, 'le immagini della sua cartella arrivano');
  assert.equal(pagina.stile, '37px', 'gli stili della sua cartella arrivano');
  assert.deepEqual(s.versoB, []);
  /* il nome scelto dalla pagina non arriva al DNS */
  assert.ok(nomiChiesti(nuda), `la prova al contrario: senza strati i nomi dello STUN, del TURN e di un <link rel="dns-prefetch"> vengono chiesti al DNS (${nuda.dnsUdp}, ${nuda.dnsTcp}, ${nuda.dnsCercato}), anche con la politica del server`);
  assert.deepEqual(nomi(s), NESSUN_NOME);
  /* e dentro la sua cartella naviga ancora (un artefatto di più pagine) */
  const naviga = scenario('naviga');
  assert.match(naviga.url, /^A\/api\/v1\/pagine\/C{43}\/arrivo-naviga-\d+-\d+\.html$/u);
  assert.equal(esiti(naviga).arrivato, true);
  assert.equal(naviga.titolo, 'Artefatto · arrivato — TALOS');
});

test('ART-RETE-02 ogni strato chiude da solo UDP e TCP: la sola rete della sessione (proxy morto + WebRTC senza UDP diretto) e la sola lista delle connessioni, che chiude anche il nome', () => {
  for (const nome of ['sola-rete', 'sola-lista']) {
    const s = scenario(nome);
    assert.equal(s.caricata, true, nome);
    assert.deepEqual({ udp: s.udp, tcp: s.tcp }, { udp: 0, tcp: 0 }, nome);
    assert.equal(esiti(s).parte, 'caricata', nome);
    assert.equal(esiti(s).img, 7, nome);
  }
  assert.equal(scenario('sola-rete').politicaWebrtc, 'disable_non_proxied_udp');
  assert.deepEqual(nomi(scenario('sola-lista')), NESSUN_NOME, 'la lista chiude anche il nome');
  /* la sola rete della sessione non chiede il nome dello STUN (niente UDP); quello del TURN sì, e si sa: lo chiude la lista (vedi in testa) */
  assert.equal(scenario('sola-rete').dnsUdp, 0);
});

test('ART-RETE-03 la finestra non dipende dalla politica del server: una pagina arrivata senza politica non raggiunge «fuori» né STUN né TURN', () => {
  const nuda = scenario('spoglia-nuda');
  assert.ok(nuda.versoB.length > 0, 'la prova al contrario: senza politica e senza strati la pagina chiama «fuori» (fetch, immagine, WebSocket)');
  assert.ok(fuga(nuda) > 0, 'e esce con WebRTC');
  for (const nome of ['spoglia', 'spoglia-sola-rete', 'spoglia-sola-lista']) {
    const s = scenario(nome);
    assert.equal(s.caricata, true, nome);
    assert.deepEqual(s.versoB, [], nome);
    assert.deepEqual({ udp: s.udp, tcp: s.tcp }, { udp: 0, tcp: 0 }, nome);
    assert.equal(esiti(s).tipo, 'function', `${nome}: la pagina ha girato`);
    if (nome !== 'spoglia-sola-rete') assert.deepEqual(nomi(s), NESSUN_NOME, nome);
  }
});

test('ART-RETE-04 (giudice v1301) dall anteprima in chat non esce niente, e l app e il Browser continuano a usare la rete', () => {
  for (const [protetta, nuda] of [['principale', 'principale-nuda'], ['principale-vecchia', 'principale-vecchia-nuda']]) {
    const aperta = scenario(nuda);
    assert.ok(fuga(aperta) > 0, `${nuda}: la prova al contrario, senza la lista l anteprima ESCE (UDP ${aperta.udp}, TCP ${aperta.tcp})`);
    const s = scenario(protetta);
    assert.equal(s.caricata, true, protetta);
    assert.deepEqual({ udp: s.udp, tcp: s.tcp }, { udp: 0, tcp: 0 }, `${protetta}; oggi: UDP ${aperta.udp}, TCP ${aperta.tcp}`);
    assert.ok(nomiChiesti(aperta), `${nuda}: la prova al contrario, senza la lista i nomi vengono chiesti al DNS`);
    assert.deepEqual(nomi(s), NESSUN_NOME, `${protetta}: il nome scelto dalla pagina non arriva al DNS`);
    assert.equal(JSON.parse(s.app).api, '{"ok":true}', `${protetta}: l app parla col servizio`);
    assert.deepEqual(s.versoB, [`GET /${protetta}/sito`], `${protetta}: la cornice del Browser carica il suo sito`);
    assert.equal(s.cornici.length, 2);
    const anteprima = s.cornici.find((c) => c.url.startsWith('A/api/v1/'));
    assert.equal(JSON.parse(anteprima.esiti).tipo, 'function', `${protetta}: la pagina dell anteprima ha girato`);
  }
  const pagina = JSON.parse(scenario('principale').cornici.find((c) => c.url.startsWith('A/api/v1/pagine/')).esiti);
  assert.deepEqual({ parte: pagina.parte, img: pagina.img, stile: pagina.stile }, { parte: 'caricata', img: 7, stile: '37px' }, 'script, immagini e stili della cartella della pagina arrivano');
});

test('ART-RETE-05 (rev2 N20) il gettone del guscio sta nel documento dell app e in nessuna cornice', () => {
  const s = scenario('principale');
  assert.equal(s.gettoneNellApp, '48');
  assert.deepEqual(s.cornici.map((c) => c.gettone), ['undefined', 'undefined']);
});

test('ART-RETE-06 (rev3-2) il titolo vero della finestra: segno fisso davanti, niente caratteri di formato, lunghezza chiusa', () => {
  const { titolo } = scenario('titolo');
  assert.ok(titolo.startsWith('Artefatto · Accesso a TALOS gnp.exe — '), titolo.slice(0, 80));
  assert.ok(titolo.endsWith(' — TALOS'));
  assert.equal(/[\p{C}\p{Zl}\p{Zp}]/u.test(titolo), false);
  assert.equal([...titolo].length, [...'Artefatto · '].length + 120 + [...' — TALOS'].length);
});

test('ART-RETE-07 (rev2-C) una pagina senza la politica «sandbox» non trattiene la finestra: né alla X, né all uscita dell app', () => {
  const senza = scenario('trattiene-senza-ascolto');
  assert.equal(senza.attivazione, true, 'la pagina ha avuto il gesto: il suo «beforeunload» conta');
  assert.equal(senza.chiusa, false, 'la prova al contrario: senza l ascolto del guscio la pagina tiene aperta la finestra');
  for (const nome of ['trattiene-x', 'trattiene-tutte']) {
    const s = scenario(nome);
    assert.equal(s.attivazione, true, nome);
    assert.equal(s.chiusa, true, nome);
  }
});

/* ───── Giro di sicurezza 3 (10/11/2026): la pagina che cade, il secondo ascolto, l'altro nome della macchina ───── */

const scenarioContrario = (nome) => {
  assert.ok(contrario?.esito?.finito, `il secondo lancio (senza isolamento) non ha finito (uscita ${contrario?.uscita}): ${contrario?.esito?.errore ?? contrario?.stderr}`);
  const s = contrario.esito.scenari[nome];
  assert.ok(s, `manca lo scenario ${nome} nel secondo lancio`);
  assert.equal(s.errore, undefined, `${nome}: ${s.errore}`);
  return s;
};
const CHIUSA_DOPO_LA_RICARICA = 'Finestra dell\'artefatto: la pagina è caduta di nuovo dopo la ricarica; mostrata «Pagina non caricata».';

test('ART-RETE-08 (giro 3 N1, giro 5) una pagina resa che fa cadere il suo processo cade DA SOLA: la sorella innocua, sulla sua origine, resta viva, e l app se ne accorge e la ricarica', (t) => {
  /* giro 5: un processo per ORIGINE (quello di serie di Chromium), e ogni pagina ha la sua origine */
  assert.match(esito.accese, /(?:^|,)IsolateSandboxedIframes:grouping\/per-origin(?:,|$)/u, 'un processo per origine delle pagine rese');
  /* la prova al contrario: le tre anteprime sulla STESSA origine (quella del servizio, come fino al giro 4) cadono insieme */
  const stessa = scenario('cadute-stessa');
  assert.ok(stessa.chieste.sorella >= 2, `sulla stessa origine la sorella cade con la colpevole (${JSON.stringify(stessa.chieste)})`);
  assert.equal(stessa.stato.sorella?.ricariche, 1, JSON.stringify(stessa.stato));
  const nuda = scenarioContrario('cadute');
  assert.equal(contrario.esito.accese.includes('IsolateSandboxedIframes'), false);
  t.diagnostic(`senza IsolateSandboxedIframes, con le etichette: ${JSON.stringify(nuda.chieste)}`);
  const s = scenario('cadute');
  assert.ok(s.ospiti >= 4, `le anteprime arrivano davvero dal nome della loro pagina (${s.ospiti})`);
  assert.equal(s.processi, 2, 'le due anteprime vive: due processi');
  assert.equal(s.caricata, true);
  assert.equal(s.sorvegliata, true, 'il guscio guarda le anteprime (sorvegliaAnteprime)');
  assert.equal(s.principaleCaduta, undefined, 'il documento dell app non cade');
  assert.equal(s.app?.api, '{"ok":true}', 'l app parla ancora col servizio');
  /* la sorella: data una volta, mai ricaricata, viva */
  assert.equal(s.chieste.sorella, 1, `oggi la sorella cade con la colpevole (${JSON.stringify(s.chieste)})`);
  assert.deepEqual({ ricariche: s.stato.sorella?.ricariche, arrese: s.stato.sorella?.arrese }, { ricariche: 0, arrese: 0 });
  assert.ok(s.vive.sorella?.vivo > 10, `la sorella batte ancora: ${JSON.stringify(s.vive.sorella)}`);
  /* quella che cade solo la prima volta torna con UNA ricarica, da sola */
  assert.equal(s.chieste.unavolta, 2, JSON.stringify(s.chieste));
  assert.deepEqual({ ricariche: s.stato.unavolta?.ricariche, arrese: s.stato.unavolta?.arrese, riga: s.stato.unavolta?.riga }, { ricariche: 1, arrese: 0, riga: false });
  assert.ok(s.vive.unavolta?.vivo > 0, `dopo la ricarica batte: ${JSON.stringify(s.vive.unavolta)}`);
  /* niente esce, e nel registro mai il percorso (porta il lasciapassare) */
  assert.deepEqual({ udp: s.udp, tcp: s.tcp }, { udp: 0, tcp: 0 });
  assert.deepEqual(nomi(s), NESSUN_NOME);
  assert.ok(s.righe.includes('Anteprima caduta: avvisata l\'app.'), JSON.stringify(s.righe));
  assert.ok(s.righe.every((riga) => !riga.includes('/api/v1/pagine/')), 'mai il percorso nel registro');
});

test('ART-RETE-09 (giro 3, giudice v1376 i) mai un giro di ricariche: una pagina che cade SEMPRE ha esattamente 1 ricarica automatica, poi la riga con «Riprova»', () => {
  for (const [s, quale] of [[scenario('cadute'), 'con isolamento'], [scenarioContrario('cadute'), 'senza isolamento']]) {
    assert.equal(s.chieste.crollo, 2, `${quale}: data due volte, la prima e UNA ricarica (${JSON.stringify(s.chieste)})`);
    assert.deepEqual({ ricariche: s.stato.colpevole?.ricariche, arrese: s.stato.colpevole?.arrese, riga: s.stato.colpevole?.riga },
      { ricariche: 1, arrese: 1, riga: true }, `${quale}: la ricarica non azzera il conto`);
    assert.notEqual(s.rigaDopoMs, null, `${quale}: la riga arriva`);
  }
});

test('ART-RETE-10 (giro 3 N1, giro 4 C3) la finestra dell artefatto: la pagina caduta si ricarica UNA volta; se cade ancora la finestra RESTA con «Pagina non caricata.» e un «Riprova» che funziona', () => {
  const sempre = scenario('finestra-crollo');
  assert.equal(sempre.chieste, 2, 'la prima e UNA ricarica, mai un giro');
  assert.equal(sempre.chiusa, false, 'oggi la finestra sparisce senza una parola');
  assert.ok(sempre.righe.includes(CHIUSA_DOPO_LA_RICARICA), JSON.stringify(sempre.righe));
  /* la riga, nella lingua del sistema (qui italiano), senza copioni, letta dalla finestra vera */
  assert.deepEqual(sempre.riga, { lingua: 'it', titolo: 'Pagina non caricata.', testo: 'Si è fermata due volte. Riprova, oppure riaprila dalla sua carta nella chat.', riprova: 'Riprova', ruolo: 'alert', copioni: 0 });
  assert.equal(sempre.titolo, 'Artefatto · Pagina non caricata. — TALOS');
  /* «Riprova» col mouse: la pagina vera torna (1 richiesta), cade, UNA ricarica (1 richiesta), poi la stessa riga; mai un giro */
  assert.ok(sempre.dopoIlClic >= 3, `il clic su «Riprova» riporta la pagina vera (${sempre.dopoIlClic})`);
  assert.equal(sempre.chiesteDopo, 4, 'dopo «Riprova»: la pagina e UNA ricarica, poi basta');
  assert.equal(sempre.chiusaDopo, false);
  assert.deepEqual(sempre.rigaDopo, sempre.riga, 'la stessa riga');
  assert.deepEqual({ udp: sempre.udp, tcp: sempre.tcp }, { udp: 0, tcp: 0 });
  assert.deepEqual(nomi(sempre), NESSUN_NOME, 'dopo la ricarica e dopo «Riprova» la rete resta chiusa');
  const unavolta = scenario('finestra-unavolta');
  assert.equal(unavolta.chieste, 2);
  assert.equal(unavolta.chiusa, false, 'tornata dopo la ricarica, la finestra resta');
  assert.equal(unavolta.cadute, 1);
  assert.ok(esiti(unavolta).vivo > 0, unavolta.esiti);
  assert.deepEqual(unavolta.righe.filter((r) => r === CHIUSA_DOPO_LA_RICARICA), []);
});

test('ART-RETE-11 (giro 3, F4) a caldo, sulla sessione vera: un ascolto solo, e un secondo ascolto non toglie più la lista in silenzio', () => {
  for (const nome of ['principale', 'principale-vecchia', 'cadute', 'sigillo', 'alias', 'finestra', 'sola-lista', 'spoglia', 'sigillo-finestra', 'etichetta', 'finestra-etichetta']) {
    assert.equal(scenario(nome).ascolti, 1, `${nome}: il modulo posa UN ascolto`);
  }
  /* la prova al contrario: un secondo ascolto posato col metodo vero (dove il sigillo non arriva) toglie la lista, e la pagina ESCE */
  const forzato = scenario('sigillo-forzato');
  assert.ok(fuga(forzato) > 0, `un secondo ascolto toglie la lista: UDP ${forzato.udp}, TCP ${forzato.tcp}`);
  /* l istruzione del mutante K12 del controllore, e una riassegnazione: lanciano, e la lista resta */
  const s = scenario('sigillo');
  assert.match(s.secondo, /^ERR onHeadersReceived: questa sessione ha già il suo ascolto/u, 'oggi il secondo ascolto passa e toglie la lista');
  assert.equal(s.riassegna, 'ERR TypeError');
  assert.deepEqual({ udp: s.udp, tcp: s.tcp }, { udp: 0, tcp: 0 });
  assert.deepEqual(nomi(s), NESSUN_NOME);
  assert.equal(JSON.parse(s.cornici.find((c) => c.url.startsWith('A/api/v1/pagine/')).esiti).tipo, 'function', 'la pagina ha girato');
  assert.match(scenario('sigillo-finestra').secondo, /^ERR onHeadersReceived: questa sessione ha già il suo ascolto/u, 'anche sulla sessione degli artefatti');
});

test('ART-RETE-12 (giro 3, F3) l anteprima chiamata con l altro nome della macchina (localhost) prende la lista anche senza frame-ancestors', () => {
  const nuda = scenario('alias-nuda');
  assert.ok(fuga(nuda) > 0, `la prova al contrario: senza la lista, dall altro nome la pagina ESCE (UDP ${nuda.udp}, TCP ${nuda.tcp})`);
  assert.ok(nomiChiesti(nuda));
  const s = scenario('alias');
  const anteprima = s.cornici.find((c) => c.url.startsWith('L/api/v1/pagine/'));
  assert.ok(anteprima, JSON.stringify(s.cornici.map((c) => c.url)));
  assert.equal(JSON.parse(anteprima.esiti).tipo, 'function', 'la pagina ha girato davvero');
  assert.deepEqual({ udp: s.udp, tcp: s.tcp }, { udp: 0, tcp: 0 }, 'oggi la ferma solo frame-ancestors del servizio');
  assert.deepEqual(nomi(s), NESSUN_NOME);
  /* con la politica vera (frame-ancestors 'self') la pagina dall altro nome nemmeno parte nell app */
  const ferma = scenario('alias-ferma');
  const bloccata = ferma.cornici.find((c) => !c.url.startsWith('B/'));
  assert.notEqual(esiti(bloccata ?? {}).tipo, 'function', JSON.stringify(ferma.cornici));
  assert.deepEqual({ udp: ferma.udp, tcp: ferma.tcp }, { udp: 0, tcp: 0 });
});

test('ART-RETE-13 (giro 3) quanto costa un processo per anteprima: le due anteprime vive hanno processi diversi (memoria nel resoconto)', (t) => {
  const s = scenario('cadute');
  t.diagnostic(`memoria dei processi delle anteprime vive (KB): ${JSON.stringify(s.memoria)}`);
  assert.ok(s.memoria.length >= 2, JSON.stringify(s.memoria));
  assert.equal(new Set(s.memoria.map((m) => m.pid)).size, s.memoria.length);
});

/* ───── Giro di sicurezza 5 (11/11/2026): ogni pagina sulla sua origine ───── */
const SUL_SUO_NOME = /^E\/api\/v1\/pagine\/C{43}\//u;
test('ART-RETE-14 (giro 5, giudice v1416) sulla sua origine la pagina si carica davvero (Chromium porta <etichetta>.localhost a 127.0.0.1) e la rete resta chiusa: 0 UDP, 0 TCP, 0 nomi', () => {
  for (const [protetta, nuda] of [['etichetta', 'etichetta-nuda']]) {
    const aperta = scenario(nuda);
    assert.ok(fuga(aperta) > 0 && nomiChiesti(aperta), `${nuda}: la prova al contrario, senza strati la pagina sulla sua origine ESCE (UDP ${aperta.udp}, TCP ${aperta.tcp})`);
    const s = scenario(protetta);
    const pagina = s.cornici.find((c) => SUL_SUO_NOME.test(c.url));
    assert.ok(pagina, `l anteprima sta sulla sua origine: ${JSON.stringify(s.cornici.map((c) => c.url))}`);
    assert.deepEqual((({ tipo, parte, img, stile }) => ({ tipo, parte, img, stile }))(JSON.parse(pagina.esiti)), { tipo: 'function', parte: 'caricata', img: 7, stile: '37px' },
      'script, immagini e stili della sua cartella arrivano dalla sua origine');
    assert.ok(s.ospiti.some((o) => /^E webrtc-etichetta-\d+-\d+\.html$/u.test(o)), `il servizio ha ricevuto il nome della pagina: ${JSON.stringify(s.ospiti)}`);
    assert.deepEqual({ udp: s.udp, tcp: s.tcp }, { udp: 0, tcp: 0 }, `oggi: UDP ${aperta.udp}, TCP ${aperta.tcp}`);
    assert.deepEqual(nomi(s), NESSUN_NOME);
    assert.equal(JSON.parse(s.app).api, '{"ok":true}');
    assert.deepEqual(s.versoB, [`GET /${protetta}/sito`], 'e il Browser continua a usare la rete');
  }
  const nuda = scenario('finestra-etichetta-nuda');
  assert.ok(fuga(nuda) > 0 && nomiChiesti(nuda), 'la prova al contrario nella finestra');
  const s = scenario('finestra-etichetta');
  assert.match(s.url, SUL_SUO_NOME, 'la finestra dell artefatto sta sull origine della pagina');
  assert.equal(s.caricata, true);
  assert.deepEqual((({ tipo, parte, img, stile }) => ({ tipo, parte, img, stile }))(esiti(s)), { tipo: 'function', parte: 'caricata', img: 7, stile: '37px' });
  assert.equal(s.politicaWebrtc, 'disable_non_proxied_udp');
  assert.deepEqual({ udp: s.udp, tcp: s.tcp }, { udp: 0, tcp: 0 }, `oggi: UDP ${nuda.udp}, TCP ${nuda.tcp}`);
  assert.deepEqual(nomi(s), NESSUN_NOME);
});

test('ART-RETE-15 (giro 5, giudice v1417 c) nessun nome di pagina va al DNS: Chromium lo risolve da sé (solo la domanda al risolutore, nessun lavoro né domanda DNS), mentre i nomi .invalid ci vanno', () => {
  const tutti = Object.values(esito.scenari).filter((s) => s.risolutorePagine);
  assert.ok(tutti.length > 0);
  const pagine = {}; const invalid = {};
  for (const s of tutti) {
    for (const [tipo, n] of Object.entries(s.risolutorePagine)) pagine[tipo] = Math.max(pagine[tipo] ?? 0, n);
    for (const [tipo, n] of Object.entries(s.risolutoreInvalid ?? {})) invalid[tipo] = Math.max(invalid[tipo] ?? 0, n);
  }
  assert.ok((invalid.DNS_TRANSACTION ?? 0) > 0 && (invalid.HOST_RESOLVER_MANAGER_JOB ?? 0) > 0, `la prova al contrario: i nomi .invalid vanno al DNS (${JSON.stringify(invalid)})`);
  assert.ok((pagine.HOST_RESOLVER_MANAGER_REQUEST ?? 0) > 0, `i nomi delle pagine sono stati davvero chiesti al risolutore (${JSON.stringify(pagine)})`);
  assert.deepEqual(Object.keys(pagine), ['HOST_RESOLVER_MANAGER_REQUEST'], `per i nomi delle pagine nessun lavoro del risolutore e nessuna domanda DNS: ${JSON.stringify(pagine)}`);
});

test('ART-RETE-16 (giro 5, controllore del giro 4 w-scaduta) la finestra la cui ricarica trova il lasciapassare scaduto mostra «Pagina non caricata.» con la frase giusta, mai il JSON; «Riprova» non fa un giro', () => {
  const s = scenario('finestra-scaduta');
  assert.equal(s.chieste, 2, 'la pagina, poi UNA ricarica (rifiutata dal servizio)');
  assert.equal(s.chiusa, false);
  assert.deepEqual((({ corpo: _c, ...riga }) => riga)(s.riga ?? {}), { lingua: 'it', titolo: 'Pagina non caricata.', testo: 'Non si è potuta caricare. Riprova, oppure riaprila dalla sua carta nella chat.', riprova: 'Riprova', ruolo: 'alert', copioni: 0 },
    `oggi la finestra mostra il JSON del servizio: ${JSON.stringify(s.riga)}`);
  assert.equal(s.riga.corpo.includes('{'), false, s.riga.corpo);
  assert.equal(s.titolo, 'Artefatto · Pagina non caricata. — TALOS');
  assert.ok(s.righe.includes("Finestra dell'artefatto: il servizio ha rifiutato la pagina (lasciapassare scaduto o pagina tolta); mostrata «Pagina non caricata»."), JSON.stringify(s.righe));
  assert.equal(s.chiesteDopo, 3, '«Riprova» chiede la pagina UNA volta, poi la stessa riga');
  assert.equal(s.chiusaDopo, false);
  assert.deepEqual(s.rigaDopo, s.riga);
  assert.deepEqual({ udp: s.udp, tcp: s.tcp }, { udp: 0, tcp: 0 });
});

test('ART-RETE-17 (giro 5, giudice v1417 b e v1430 d) il biscotto: una pagina chiusa non lo tocca; anche aperta, il biscotto Domain=localhost non si posa e quello dell app non parte verso il servizio', () => {
  const chiusa = scenario('biscotto-chiusa');
  assert.match(chiusa.url, SUL_SUO_NOME);
  assert.deepEqual(esiti(chiusa), { scrittura: 'ERR SecurityError', fetch: ['ERR', 'ERR', 'ERR'] }, 'con la politica vera (sandbox) la pagina non legge né scrive biscotti, e non chiama l app');
  assert.equal(chiusa.eco, 0, 'al servizio non arriva niente');
  /* il caso peggiore: senza politica e senza strati */
  const aperta = scenario('biscotto-aperto');
  assert.equal(aperta.caricata, true);
  const nomi = aperta.biscotti.map((b) => `${b.nome}=${b.valore}@${b.soloQui ? '' : '.'}${b.dominio.replace(/^[0-9a-f]{32}\./u, 'E.')}`);
  assert.deepEqual(nomi, ['talos_token=vero@127.0.0.1', 'talos_token=dalla-pagina-qui@E.localhost'], 'Chromium rifiuta Domain=localhost: il biscotto della pagina resta sul SUO nome');
  const vie = Object.fromEntries(aperta.eco.map((q) => [q.via, q]));
  assert.deepEqual(Object.keys(vie).sort(), ['alias-get', 'fetch-get', 'fetch-post', 'img', 'modulo']);
  for (const q of aperta.eco) {
    assert.equal(q.biscotto, null, `${q.via}: nessun biscotto arriva al servizio`);
    assert.equal(q.sito, 'cross-site', `${q.via}: Chromium dice al servizio da dove arriva (${q.sito})`);
  }
});
