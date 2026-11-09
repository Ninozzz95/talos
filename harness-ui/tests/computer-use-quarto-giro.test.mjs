/**
 * Fourth round of computer-use cures (05/11/2026): decision 239 (cures 6-bis and 7) and the findings R3-R7 of the third-round review.
 * QG-1 a remembered place widens only the deletions the person asked for · QG-2 the initial card is never skipped · QG-3 the site comes
 * only from the browser's own address bar · QG-4 typed confirmations stay dialogs, small apps with one line do not · QG-5 chat fields in
 * more languages · QG-6 payment words, the soft hyphen and the default-button rule.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { valutaAzione, POLITICHE } from '../src/computer-use/protezioni.mjs';
import { creaOspiteComputerUse, NOME_COMPUTER_USE, segnaDialoghi, formaDiDialogo } from '../src/computer-use/attrezzo.mjs';
import { EVENTI, eseguiCompito } from '../src/computer-use/ciclo.mjs';
import { validaDomandeUtente } from '../src/user-question-contract.mjs';

const SEMPRE = POLITICHE.pcConsentiSempre;
const NORMALE = POLITICHE.pcNormale;
const PIENO = POLITICHE.pcAccessoPieno;
const ctx = (o = {}) => ({ richiesta: { pagare: false, inviare: false, cancellare: false }, sospetto: false, piano: { domini: [], app: [] }, ...o });
const valuta = (azione, bersaglio, schermata, politica = NORMALE, contesto = ctx()) => valutaAzione({ azione, bersaglio, schermata, politica, contesto });
const INVIO = { tipo: 'tasti', combinazione: 'enter' };
const PREMI = { tipo: 'premi' };

// ---------- QG-1: decision 239, in a remembered place only the asked deletion skips the card ----------
test('QG-1 a secret from the keychain asks in a remembered place', () => {
  const campoPassword = { ruolo: 'campo', nome: 'Password', segnali: { isPassword: true } };
  const r = valuta({ tipo: 'scrivi', testo: '{{segreto:biglietti}}' }, campoPassword, { elementi: [], dominio: 'biglietti.example' }, SEMPRE);
  assert.deepEqual([r.protezione, r.motivo, r.decisione], ['credenziale', 'portachiavi', 'chiedi']);
});

test('QG-1 a secret the person dictated asks in a remembered place', () => {
  const iban = 'IT60X0542811101000000123456';
  const r = valuta({ tipo: 'scrivi', testo: iban }, { ruolo: 'campo', nome: 'IBAN del beneficiario' }, { elementi: [], dominio: 'banca.example' }, SEMPRE,
    ctx({ testoDellaPersona: `fai un bonifico di 20 euro a Marco, IBAN ${iban}` }));
  assert.deepEqual([r.protezione, r.motivo, r.decisione], ['credenziale', 'testo-della-persona', 'chiedi']);
});

test('QG-1 the consent box on the plan domain asks in a remembered place; the cookies stay «reserved»', () => {
  const nelPiano = ctx({ piano: { domini: ['otticarossi.example'], app: [] } });
  const r = valuta(PREMI, { ruolo: 'casella', nome: 'Ho letto e accetto l\'informativa privacy' }, { elementi: [], dominio: 'otticarossi.example' }, SEMPRE, nelPiano);
  assert.deepEqual([r.protezione, r.decisione], ['consenso', 'chiedi']);
  const banner = { elementi: [{ ruolo: 'testo', nome: 'Usiamo i cookie per migliorare la tua esperienza' }], dominio: 'otticarossi.example' };
  assert.equal(valuta(PREMI, { ruolo: 'pulsante', nome: 'Accetta tutti i cookie' }, banner, SEMPRE, nelPiano).decisione, 'scegli-riservato');
});

test('QG-1 what cannot be assessed asks, it does not stop', () => {
  const r = valuta({ tipo: 'boh' }, null, { elementi: [] }, SEMPRE);
  assert.deepEqual([r.protezione, r.decisione], [null, 'chiedi']);
});

test('QG-1 control: the deletion the person asked for still goes; not asked, suspicious, payment and send ask; the robot check stops', () => {
  const elimina = { ruolo: 'pulsante', nome: 'Elimina account' };
  const s = { elementi: [elimina], dominio: 'posta.example' };
  const chiesto = (cosa) => ctx({ richiesta: { pagare: false, inviare: false, cancellare: false, [cosa]: true } });
  assert.equal(valuta(PREMI, elimina, s, SEMPRE, chiesto('cancellare')).decisione, 'procedi');
  assert.equal(valuta(PREMI, elimina, s, SEMPRE).decisione, 'chiedi');
  assert.equal(valuta(PREMI, elimina, s, SEMPRE, { ...chiesto('cancellare'), sospetto: true }).decisione, 'chiedi');
  const paga = { ruolo: 'pulsante', nome: 'Paga ora' };
  assert.equal(valuta(PREMI, paga, { elementi: [paga] }, SEMPRE, chiesto('pagare')).decisione, 'chiedi');
  const invia = { ruolo: 'pulsante', nome: 'Invia' };
  assert.equal(valuta(PREMI, invia, { elementi: [invia] }, SEMPRE, chiesto('inviare')).decisione, 'chiedi');
  const captcha = { elementi: [{ ruolo: 'casella', nome: 'Non sono un robot' }] };
  assert.equal(valuta(PREMI, { ruolo: 'pulsante', nome: 'Avanti' }, captcha, SEMPRE).decisione, 'ferma');
});

// ---------- the real PC host, with a fake helper ----------
function png(w, h) {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}
const finestraDi = (app) => ({ window_id: 500, pid: 77, app_name: `${app}.exe`, title: 'Account', bounds: { x: 0, y: 0, width: 1600, height: 900 }, z_index: 9, is_on_screen: true, minimized: false });
/** an element of the helper: `web` = below the page's Document (cua-driver `in_web_content`), `valore` = its value */
const el = (i, role, label, depth, { web = false, valore = null } = {}) => ({
  el: { element_index: i, element_token: `s0:${i}`, role, label, depth, actions: ['invoke'], frame: { x: 600, y: 120 + i * 40, w: 200, h: 30 },
    ...(web ? { in_web_content: true } : {}), ...(valore !== null ? { value: valore } : {}) },
  md: `${'  '.repeat(depth)}- [${i}] ${role} "${label}"${valore !== null ? ` [value="${valore}"]` : ''}` });
const riga = (depth, role, label) => ({ md: `${'  '.repeat(depth)}- ${role} "${label}"` });
function aiutanteFinto(app, righe) {
  const azioni = []; const f = finestraDi(app);
  return { azioni, async apri() { return { ok: true }; }, compito() { return () => {}; },
    async chiama(nome, argomenti) {
      if (nome === 'list_windows') return { ok: true, dati: { windows: [f] }, immagine: null, errore: null };
      if (nome === 'get_window_state') {
        return { ok: true, dati: { window_id: f.window_id, pid: f.pid, window_title: f.title, app_name: f.app_name, window_bounds: f.bounds, screenshot_width: 1600,
          screenshot_height: 900, elements: righe.filter((x) => x.el).map((x) => x.el), tree_markdown: `${righe.map((x) => x.md).join('\n')}\n` },
        immagine: { base64: png(1600, 900).toString('base64'), mime: 'image/png' }, errore: null };
      }
      azioni.push({ nome, argomenti }); return { ok: true, dati: {}, immagine: null, errore: null };
    } };
}
const INIZIALE = /wants to use this computer|vuole usare questo computer|outside the places/u;
const registro = (luoghi) => ({ perIlCiclo: async () => luoghi, ricorda: async () => {} });
async function giro({ app = 'chrome', righe, testo, azione, registroLuoghi = null, lingua, esegui }) {
  const aiutante = aiutanteFinto(app, righe);
  const domande = []; const intere = []; const eventi = []; const richieste = []; let n = 0;
  const risposte = [{ actions: [azione] }, { done: { success: true } }];
  const si = lingua === 'it' ? 'Consenti' : 'Allow';
  const sessione = { testoDellaPersona: testo, ...(lingua ? { lingua } : {}),
    chiediModello: async (m) => { richieste.push(JSON.stringify(m)); const x = risposte[Math.min(n, risposte.length - 1)]; n += 1; return { testo: JSON.stringify(x), usage: null }; },
    chiediDomanda: async (q) => { validaDomandeUtente(q); domande.push(q[0].question); intere.push(q[0]); return { status: 'answered', answers: { [q[0].id]: si } }; },
    emetti: (nome, dati) => { eventi.push({ nome, dati }); } };
  await creaOspiteComputerUse({ aiutante, registroLuoghi, ...(esegui ? { esegui } : {}) })(NOME_COMPUTER_USE, { task: 'work on the screen' },
    { fase: 'esegui', toolCallId: 'c1', segnale: new AbortController().signal, livelloAccesso: 'scrittura-progetto', sessione });
  return { carte: domande.filter((q) => !INIZIALE.test(q)), iniziali: domande.filter((q) => INIZIALE.test(q)), intere, azioni: aiutante.azioni, richieste,
    protezioni: eventi.filter((e) => e.nome === EVENTI.protezione && e.dati?.protezione).map((e) => `${e.dati.protezione}→${e.dati.decisione}`) };
}
const ELIMINA = { type: 'press', ref: 'e2' };
const TESTO = 'Elimina il mio account';
const pagina = (...sopra) => [riga(0, 'Window', 'Account'), ...sopra, riga(1, 'Document', 'Account'), el(2, 'Button', 'Elimina account', 2, { web: true })];
const BARRA_VERA = el(0, 'Edit', 'Barra degli indirizzi e di ricerca', 1, { valore: 'posta.example/account' });

// ---------- QG-2: decision 239, the initial card is not skipped because every place is remembered ----------
test('QG-2 every place of the task remembered: the initial card is still shown', async () => {
  const g = await giro({ righe: pagina(BARRA_VERA), testo: 'Apri Chrome ed elimina il mio account', azione: ELIMINA, registroLuoghi: registro({ domini: ['posta.example'], app: ['chrome'] }) });
  assert.equal(g.iniziali.length, 1, JSON.stringify(g));
});

// ---------- QG-3: cure 7, the site comes only from the browser's own address bar ----------
test('QG-3 a page field «Indirizzo email» holding a remembered domain is not the address bar: no site, the deletion asks', async () => {
  const campoDellaPagina = el(1, 'Edit', 'Indirizzo email', 2, { web: true, valore: 'posta.example' });
  const righe = [riga(0, 'Window', 'Account'), riga(1, 'Document', 'Account'), campoDellaPagina, el(2, 'Button', 'Elimina account', 2, { web: true })];
  const g = await giro({ righe, testo: TESTO, azione: ELIMINA, registroLuoghi: registro({ domini: ['posta.example'], app: [] }) });
  assert.ok(!g.richieste.some((r) => r.includes('site posta.example')), 'the page field gave the site');
  assert.ok(g.protezioni.includes('cancellazione→chiedi'), JSON.stringify(g));
});

test('QG-3 a browser remembered as an app does not cover a site whose bar cannot be read', async () => {
  const g = await giro({ righe: pagina(), testo: TESTO, azione: ELIMINA, registroLuoghi: registro({ domini: [], app: ['chrome'] }) });
  assert.ok(g.protezioni.includes('cancellazione→chiedi'), JSON.stringify(g));
  assert.ok(g.carte.length >= 1, JSON.stringify(g));
});

test('QG-3 a tree that does not tell the page from the browser (no element below a Document) gives no site', async () => {
  const righe = [riga(0, 'Window', 'Account'), el(1, 'Edit', 'Indirizzo email', 1, { valore: 'posta.example' }), el(2, 'Button', 'Elimina account', 1)];
  const g = await giro({ righe, testo: TESTO, azione: ELIMINA, registroLuoghi: registro({ domini: ['posta.example'], app: [] }) });
  assert.ok(!g.richieste.some((r) => r.includes('site posta.example')), JSON.stringify(g.richieste.at(0)));
  assert.ok(g.protezioni.includes('cancellazione→chiedi'), JSON.stringify(g));
});

test('QG-3 a bar whose value is cut short gives no site', async () => {
  const tagliata = el(0, 'Edit', 'Barra degli indirizzi e di ricerca', 1, { valore: 'posta.exam…' });
  const g = await giro({ righe: pagina(tagliata), testo: TESTO, azione: ELIMINA, registroLuoghi: registro({ domini: ['posta.example'], app: [] }) });
  assert.ok(!g.richieste.some((r) => /, site /u.test(r)), 'a cut value gave a site');
  assert.ok(g.protezioni.includes('cancellazione→chiedi'), JSON.stringify(g));
});

test('QG-3 two browser fields and none named as the address bar: no site', async () => {
  const altro = el(1, 'Edit', 'Trova nella pagina', 1, { valore: 'posta.example' });
  const senzaNome = el(0, 'Edit', 'Campo', 1, { valore: 'posta.example/account' });
  const g = await giro({ righe: pagina(senzaNome, altro), testo: TESTO, azione: ELIMINA, registroLuoghi: registro({ domini: ['posta.example'], app: [] }) });
  assert.ok(!g.richieste.some((r) => r.includes('site posta.example')), JSON.stringify(g.richieste.at(0)));
});

test('QG-3 control: the real bar of the browser gives the site, and the remembered site lets the asked deletion go', async () => {
  const g = await giro({ righe: pagina(BARRA_VERA), testo: TESTO, azione: ELIMINA, registroLuoghi: registro({ domini: ['posta.example'], app: [] }) });
  assert.ok(g.richieste.some((r) => r.includes('site posta.example')), JSON.stringify(g.richieste.at(0)));
  // 'procedi' opens no card and emits no mark: the click goes (the same press without the remembered place asks, QG-3 above)
  assert.deepEqual(g.carte, [], JSON.stringify(g));
  assert.deepEqual(g.azioni.map((a) => a.nome), ['click']);
});

test('QG-3 control: with the find bar open the bar named as the address bar still gives the site', async () => {
  const trova = el(1, 'Edit', 'Trova nella pagina', 1, { valore: 'conto' });
  const g = await giro({ righe: pagina(BARRA_VERA, trova), testo: TESTO, azione: ELIMINA, registroLuoghi: registro({ domini: ['posta.example'], app: [] }) });
  assert.ok(g.richieste.some((r) => r.includes('site posta.example')), JSON.stringify(g.richieste.at(0)));
});

// ---------- QG-4: R3, typed confirmations are dialogs; a small app with one line of text is not ----------
function finestraPiccola(righe, { larghezza = 480, altezza = 300 } = {}) {
  const grezzi = righe.filter((x) => x.indice != null).map((x) => ({ element_index: x.indice, role: x.ruolo, depth: x.prof, label: x.nome }));
  const md = righe.map((x) => `${'  '.repeat(x.prof)}- ${x.indice != null ? `[${x.indice}] ` : ''}${x.ruolo}${x.nome ? ` "${x.nome}"` : ''}`).join('\n');
  const elementi = grezzi.map((g) => ({ ref: `e${g.element_index}`, ruolo: g.role === 'Window' ? 'finestra' : (g.role === 'Edit' ? 'campo' : 'pulsante'), nome: g.label, valore: null, stato: { attivo: true }, inLista: false }));
  const scelta = { window_id: 2, pid: 5, z_index: 3 };
  return segnaDialoghi({ elementi, grezzi, markdown: md, titolo: righe[0].nome, finestraIntera: formaDiDialogo(scelta, { x: 0, y: 0, width: larghezza, height: altezza }, [scelta]) });
}
const r = (prof, ruolo, nome, indice = null) => ({ prof, ruolo, nome, indice });
const segnata = (out) => out.some((e) => e.modale === true);

test('QG-4 «Digita ELIMINA per confermare» with a field is a dialog, and the bare «Elimina» asks in Normal', () => {
  const out = finestraPiccola([r(0, 'Window', 'Elimina account', 0), r(1, 'Text', 'Digita ELIMINA per confermare'), r(1, 'Edit', '', 1), r(1, 'Button', 'Elimina', 2), r(1, 'Button', 'Annulla', 3)]);
  assert.equal(segnata(out), true, JSON.stringify(out));
  const v = valuta(PREMI, out.find((e) => e.nome === 'Elimina'), { elementi: out, app: 'impostazioni', dominio: null });
  assert.deepEqual([v.protezione, v.decisione], ['cancellazione', 'chiedi']);
});

test('QG-4 «Type DELETE to confirm» in English is a dialog too', () => {
  const out = finestraPiccola([r(0, 'Window', 'Delete account', 0), r(1, 'Text', 'Type DELETE to confirm'), r(1, 'Edit', 'Confirmation', 1), r(1, 'Button', 'Delete', 2), r(1, 'Button', 'Cancel', 3)]);
  assert.equal(segnata(out), true, JSON.stringify(out));
});

test('QG-4 a sticky note with one line of text and three buttons is not a dialog', () => {
  const out = finestraPiccola([r(0, 'Window', 'Nota adesiva', 0), r(1, 'Text', 'Compra latte'), r(1, 'Button', 'Elimina', 1), r(1, 'Button', 'Condividi', 2), r(1, 'Button', 'Nuova nota', 3)], { altezza: 520 });
  assert.equal(segnata(out), false, JSON.stringify(out));
});

test('QG-4 a small clock with two «Cancella» buttons and the times is not a dialog', () => {
  const out = finestraPiccola([r(0, 'Window', 'Sveglie', 0), r(1, 'Text', '07:30'), r(1, 'Text', 'Lavoro'), r(1, 'Button', 'Cancella', 1), r(1, 'Button', 'Cancella', 2)]);
  assert.equal(segnata(out), false, JSON.stringify(out));
});

test('QG-4 control: a small window that says the action cannot be undone is a dialog', () => {
  const out = finestraPiccola([r(0, 'Window', 'Svuota cestino', 0), r(1, 'Text', 'Questa azione non può essere annullata.'), r(1, 'Button', 'Svuota', 1), r(1, 'Button', 'Annulla', 2)]);
  assert.equal(segnata(out), true, JSON.stringify(out));
});

test('QG-4 control: a login box with a field and «Inserisci la password» is not a confirmation dialog', () => {
  const out = finestraPiccola([r(0, 'Window', 'Accedi', 0), r(1, 'Text', 'Inserisci la password'), r(1, 'Edit', 'Password', 1), r(1, 'Button', 'Accedi', 2), r(1, 'Button', 'Annulla', 3)]);
  assert.equal(segnata(out), false, JSON.stringify(out));
});

// ---------- QG-5: R4, chat fields in German, Spanish, Portuguese and French ----------
const CHAT = ['Nachricht schreiben', 'Nachricht eingeben', 'Escribe un mensaje', 'Escreva uma mensagem', 'Répondre', 'Responder', 'Antworten'];
test('QG-5 Enter in a chat field sends, in every listed language', () => {
  for (const nome of CHAT) {
    const c = { ref: 'e1', ruolo: 'campo', nome, stato: { attivo: true } };
    for (const politica of [NORMALE, PIENO]) assert.equal(valuta(INVIO, c, { elementi: [c], app: 'chrome', dominio: 'chat.example' }, politica).protezione, 'invio', `${nome} ${politica.nome}`);
  }
});

// ---------- QG-6: R5, R6, R7 ----------
test('QG-6 (R5) «Bestellen» and «Confirmar pago» are payments, at the click and with Enter in the form', () => {
  for (const nome of ['Bestellen', 'Confirmar pago']) {
    const p = { ref: 'e2', ruolo: 'pulsante', nome, stato: { attivo: true } };
    assert.equal(valuta(PREMI, p, { elementi: [p], app: 'chrome', dominio: 'shop.example' }).protezione, 'pagamento', nome);
    const c = { ref: 'e1', ruolo: 'campo', nome: 'Nome', stato: { attivo: true } };
    assert.equal(valuta(INVIO, c, { elementi: [c, p], app: 'chrome', dominio: 'shop.example' }).protezione, 'pagamento', `${nome} Enter`);
  }
});

test('QG-6 (R6) the soft hyphen between two words of a link is read as a break: «Send­email» sends', () => {
  const l = { ref: 'e5', ruolo: 'collegamento', nome: 'Send­email', stato: { attivo: true } };
  assert.equal(valuta(PREMI, l, { elementi: [l], app: 'chrome', dominio: 'esempio.it' }, PIENO).protezione, 'invio');
});

test('QG-6 (R7) a link «Paga ora» next to the field is never the default button of the form', () => {
  const c = { ref: 'e1', ruolo: 'campo', nome: 'Nome', stato: { attivo: true } };
  const l = { ref: 'e5', ruolo: 'collegamento', nome: 'Paga ora', stato: { attivo: true } };
  assert.equal(valuta(INVIO, c, { elementi: [c, l], app: 'chrome', dominio: 'shop.example' }).protezione, null);
});

// ---------- QG-7: the four mutants that survived the first pass (mutants on a copy, 05/11) ----------
test('QG-7 (R3) each confirmation wording carries the dialog alone: «?», «annullata», «undone», and the window title', () => {
  const foto = finestraPiccola([r(0, 'Window', 'Foto', 0), r(1, 'Text', 'Togliere la foto dall\'album?'), r(1, 'Button', 'Togli', 1), r(1, 'Button', 'Annulla', 2)]);
  assert.equal(segnata(foto), true, 'a question with nothing else');
  const annullata = finestraPiccola([r(0, 'Window', 'Foto', 0), r(1, 'Text', 'Questa azione non può essere annullata.'), r(1, 'Button', 'Svuota', 1), r(1, 'Button', 'Annulla', 2)]);
  assert.equal(segnata(annullata), true, '«annullata» with a neutral title');
  const undone = finestraPiccola([r(0, 'Window', 'Photos', 0), r(1, 'Text', 'This can\'t be undone.'), r(1, 'Button', 'Empty', 1), r(1, 'Button', 'Cancel', 2)]);
  assert.equal(segnata(undone), true, '«undone» with a neutral title');
  const titolo = finestraPiccola([r(0, 'Window', 'Eliminare la nota?', 0), r(1, 'Text', 'Compra latte'), r(1, 'Button', 'Elimina', 1), r(1, 'Button', 'Annulla', 2)]);
  assert.equal(segnata(titolo), true, 'the question in the window title only');
});

test('QG-7 (R3) a field keeps the dialog only when the same line asks to type in order to confirm', () => {
  const cerca = finestraPiccola([r(0, 'Window', 'Note', 0), r(1, 'Text', 'Note eliminate di recente'), r(1, 'Edit', 'Cerca', 1), r(1, 'Button', 'Elimina', 2), r(1, 'Button', 'Ripristina', 3)]);
  assert.equal(segnata(cerca), false, 'a search field in a small notes window');
  const scrivi = finestraPiccola([r(0, 'Window', 'Note', 0), r(1, 'Text', 'Le note eliminate restano 30 giorni'), r(1, 'Edit', 'Scrivi una nota', 1), r(1, 'Button', 'Elimina', 2), r(1, 'Button', 'Salva', 3)]);
  assert.equal(segnata(scrivi), false, '«Scrivi una nota» asks to type, not to confirm');
});

test('QG-7 (cure 7) a bar value cut anywhere, or with an empty label, gives no site', async () => {
  for (const valore of ['posta.example/inbox/messag…', 'posta..example']) {
    const g = await giro({ righe: pagina(el(0, 'Edit', 'Barra degli indirizzi e di ricerca', 1, { valore })), testo: TESTO, azione: ELIMINA, registroLuoghi: registro({ domini: ['posta.example'], app: [] }) });
    assert.ok(!g.richieste.some((x) => /, site /u.test(x)), `${valore} gave a site`);
  }
});

test('QG-7 (cure 7) a browser remembered by app name does not skip the card of a new browser window whose bar cannot be read', async () => {
  const pulsante = { ref: 'b1', ruolo: 'pulsante', nome: 'Avanti', rettangolo: { x: 10, y: 10, w: 20, h: 10 } };
  const scheda = (over) => ({ frenoArmato: true, titolo: 'Pagina', elementi: [pulsante], ...over });
  let g = 0; let q = 0; const consensi = [];
  const risposte = [{ azioni: [{ tipo: 'premi', ref: 'b1' }] }, { azioni: [{ tipo: 'premi', ref: 'b1' }] }, { fine: { riuscito: true } }];
  await eseguiCompito({ testoDellaPersona: 'vai avanti', piano: { domini: ['negozio.example'] }, politica: NORMALE, luoghiRicordati: { domini: [], app: ['chrome'] },
    porte: {
      guarda: async () => (g++ === 0 ? scheda({ dominio: 'negozio.example' }) : scheda({ app: 'chrome', browser: true })),
      chiedi: async () => (q < risposte.length ? risposte[q++] : { fine: { riuscito: true } }),
      agisci: async () => ({ esito: 'confermata', modo: 'sottofondo' }),
      bersaglio: (a, s) => s.elementi.find((e) => e.ref === a.ref),
      chiediPersona: async () => 'si', emetti: () => {}, adesso: () => Date.now(),
      consensoDelCompito: (d) => { consensi.push(d); return 'si'; },
    } });
  assert.equal(consensi.length, 2, JSON.stringify(consensi));
  assert.deepEqual(consensi[1].nuovo, { app: 'chrome', browser: true });
});

// ---------- QG-8: the fourth-round review (05/11), cure A and reservation B ----------
test('QG-8 (A) a small Chinese, Japanese or Arabic window that asks a question is a dialog: full-width and Arabic question marks', () => {
  const casi = [['WPS', '确定要删除此文件吗？', '确定', '取消'], ['エクスプローラー', '本当に削除しますか？', 'はい', 'いいえ'], ['الملفات', 'هل أنت متأكد؟', 'نعم', 'لا']];
  for (const [titolo, frase, si, no] of casi) {
    const out = finestraPiccola([r(0, 'Window', titolo, 0), r(1, 'Text', frase), r(1, 'Button', si, 1), r(1, 'Button', no, 2)]);
    assert.equal(segnata(out), true, frase);
  }
  const nota = finestraPiccola([r(0, 'Window', '便笺', 0), r(1, 'Text', '买牛奶'), r(1, 'Button', '删除', 1), r(1, 'Button', '分享', 2)]);
  assert.equal(segnata(nota), false, 'a note with no question stays a normal window');
});

const cartaIniziale = async ({ app, appBrowser }) => {
  const consensi = [];
  await eseguiCompito({ testoDellaPersona: 'apri', piano: { domini: [], app }, politica: NORMALE, luoghiRicordati: { domini: [], app }, ...(appBrowser ? { appBrowser } : {}),
    porte: {
      guarda: async () => ({ frenoArmato: true, titolo: 'x', elementi: [], app: app[0] }),
      chiedi: async () => ({ fine: { riuscito: true } }),
      agisci: async () => ({ esito: 'confermata', modo: 'sottofondo' }), bersaglio: () => null,
      chiediPersona: async () => 'si', emetti: () => {}, adesso: () => Date.now(),
      consensoDelCompito: (d) => { consensi.push(d); return 'si'; },
    } });
  return consensi[0];
};
test('QG-8 (B) the initial card does not mark a browser of the plan as remembered by its app name', async () => {
  const c = await cartaIniziale({ app: ['chrome'], appBrowser: ['chrome', 'msedge'] });
  assert.equal(c.app[0].nome, 'chrome');
  assert.equal(c.app[0].ricordato, undefined, JSON.stringify(c.app));
});
test('QG-8 (B) control: an app that is not a browser is marked remembered on the card', async () => {
  const c = await cartaIniziale({ app: ['notepad'], appBrowser: ['chrome', 'msedge'] });
  assert.equal(c.app[0].ricordato, true, JSON.stringify(c.app));
});

// ---------- QG-9: the Desktop's follow-up (05/11, 15:50) ----------
test('QG-9 (1) a small Chinese, Japanese or Arabic window with the delete word and no question mark is a dialog', () => {
  const casi = [['WPS', '删除此文件', '确定', '取消'], ['エクスプローラー', 'このファイルを削除します', 'はい', 'いいえ'], ['الملفات', 'حذف الملف', 'نعم', 'لا']];
  for (const [titolo, frase, si, no] of casi) {
    const out = finestraPiccola([r(0, 'Window', titolo, 0), r(1, 'Text', frase), r(1, 'Button', si, 1), r(1, 'Button', no, 2)]);
    assert.equal(segnata(out), true, frase);
  }
  const nota = finestraPiccola([r(0, 'Window', '便笺', 0), r(1, 'Text', '买牛奶'), r(1, 'Button', '保存', 1), r(1, 'Button', '分享', 2)]);
  assert.equal(segnata(nota), false, 'a note with no confirmation phrase stays a normal window');
});

// decision 240 (owner 05/11): «Always allow» stays, the line under it says what it does after decision 239
const descrizioneSempre = async (lingua) => {
  const g = await giro({ righe: pagina(BARRA_VERA), testo: 'Apri Chrome ed elimina il mio account', azione: ELIMINA, lingua });
  const carta = g.intere.find((q) => INIZIALE.test(q.question));
  assert.ok(carta, JSON.stringify(g.intere.map((q) => q.question)));
  return carta.options[1];
};
test('QG-9 (2) English: «Always allow» says it skips only deletions you asked for; payments, sends, passwords and consents always ask', async () => {
  const o = await descrizioneSempre();
  assert.equal(o.label, 'Always allow');
  assert.match(o.description, /only for deletions you asked for/u);
  for (const p of ['Payments', 'sends', 'passwords', 'consents', 'always ask']) assert.ok(o.description.includes(p), `${p}: ${o.description}`);
  assert.doesNotMatch(o.description, /stops asking for these places/u);
});
test('QG-9 (2) Italian: «Consenti sempre» dice che salta solo le cancellazioni chieste; pagamenti, invii, password e consensi chiedono sempre', async () => {
  const o = await descrizioneSempre('it');
  assert.equal(o.label, 'Consenti sempre');
  assert.match(o.description, /solo per le cancellazioni che hai chiesto tu/u);
  for (const p of ['Pagamenti', 'invii', 'password', 'consensi', 'chiedono sempre']) assert.ok(o.description.includes(p), `${p}: ${o.description}`);
  assert.doesNotMatch(o.description, /non chiede più per questi luoghi/u);
});

test('QG-9 (3) the PC tool passes its browser list to the cycle (appBrowser)', async () => {
  const chiamate = [];
  const esegui = async (args) => { chiamate.push(args); return { esito: 'riuscito', passi: 0 }; };
  await giro({ righe: pagina(BARRA_VERA), testo: 'Apri Chrome', azione: ELIMINA, esegui });
  assert.equal(chiamate.length, 1);
  for (const b of ['chrome', 'msedge', 'firefox']) assert.ok(chiamate[0].appBrowser?.includes(b), JSON.stringify(chiamate[0].appBrowser));
});
