/*
 * Third round of computer-use cures (review of the merged R2 + step-5 head, 05/11/2026). Fake helper, fake model, no real screen.
 * TG-1 implicit submission (T-R4, N5) · TG-2 links read the same with Enter and click (N1, N6) · TG-3 small windows are dialogs only
 * with a sentence and no text field (G5) · TG-4 comment fields in more languages (N3) · TG-5 surviving mutants · TG-6 the PC wires
 * «Consenti sempre» (decision 237).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { valutaAzione, POLITICHE } from '../src/computer-use/protezioni.mjs';
import { creaOspiteComputerUse, NOME_COMPUTER_USE, segnaDialoghi, formaDiDialogo } from '../src/computer-use/attrezzo.mjs';
import { EVENTI } from '../src/computer-use/ciclo.mjs';
import { validaDomandeUtente } from '../src/user-question-contract.mjs';

const PIENO = POLITICHE.pcAccessoPieno;
const NORMALE = POLITICHE.pcNormale;
const ctx = (o = {}) => ({ richiesta: { pagare: false, inviare: false, cancellare: false }, sospetto: false, piano: { domini: [], app: [] }, ...o });
const INVIO = { tipo: 'tasti', combinazione: 'enter' };
const campo = (nome, extra = {}) => ({ ref: 'e1', ruolo: 'campo', nome, stato: { attivo: true }, ...extra });
const pulsante = (nome, extra = {}) => ({ ref: 'e2', ruolo: 'pulsante', nome, stato: { attivo: true }, ...extra });
const modulo = (c, ...altri) => ({ elementi: [{ ref: 't0', ruolo: 'testo', nome: 'Modulo', soloTesto: true }, c, ...altri], app: 'chrome', dominio: 'esempio.it' });
const valuta = (azione, bersaglio, schermata, politica = NORMALE, contesto = ctx()) => valutaAzione({ azione, bersaglio, schermata, politica, contesto });
const esito = (v) => `${v.protezione ?? '-'}/${v.decisione}`;

// ---------- TG-1: Enter in a form field submits the form (HTML implicit submission) ----------
const MODULI_PROTETTI = [
  ['Codice sconto', 'Paga ora', 'pagamento'],
  ['Importo', 'Invia denaro', 'pagamento'],
  ['Nome del profilo', 'Elimina account', 'cancellazione'],
  ['Scrivi il tuo nome per confermare', 'Elimina account', 'cancellazione'],
  ['Name', 'Delete account', 'cancellazione'],
  ['Nome utente', 'Elimina il mio account', 'cancellazione'],
  ['Indirizzo e-mail', 'Invia', 'invio'],
];
for (const [nomeCampo, nomePulsante, protezione] of MODULI_PROTETTI) {
  test(`TG-1 Enter in «${nomeCampo}» with only «${nomePulsante}» protected ⇒ ${protezione} (Normal card, Full access by policy)`, () => {
    const c = campo(nomeCampo);
    const s = modulo(c, pulsante(nomePulsante));
    const n = valuta(INVIO, c, s, NORMALE);
    assert.equal(esito(n), `${protezione}/chiedi`, JSON.stringify(n));
    assert.equal(n.motivo, 'invio-implicito');
    const p = valuta(INVIO, c, s, PIENO);
    assert.equal(p.protezione, protezione, JSON.stringify(p));
    assert.equal(p.decisione, protezione === 'pagamento' ? 'chiedi' : 'procedi-e-segna');
  });
}

test('TG-1 a trailing newline typed in the field submits like Enter (N5)', () => {
  const c = campo('Codice sconto');
  const v = valuta({ tipo: 'scrivi', testo: 'SCONTO10\n' }, c, modulo(c, pulsante('Paga ora')));
  assert.equal(esito(v), 'pagamento/chiedi', JSON.stringify(v));
});

const MODULI_LIBERI = [
  ['Cerca', 'Cerca'], ['Nome', 'Salva'], ['Cerca prodotti', 'Paga ora'], ['Search', 'Delete account'],
  ['Barra degli indirizzi e di ricerca', 'Paga ora'], ['Address bar', 'Paga ora'], ['Descrizione', 'Pubblica'],
];
for (const [nomeCampo, nomePulsante] of MODULI_LIBERI) {
  test(`TG-1 control: Enter in «${nomeCampo}» next to «${nomePulsante}» does not submit a protected form`, () => {
    const c = campo(nomeCampo);
    const v = valuta(INVIO, c, modulo(c, pulsante(nomePulsante)));
    assert.equal(v.protezione ?? null, null, JSON.stringify(v));
  });
}

test('TG-1 control: the space bar in a field types a space, it does not submit the form', () => {
  const c = campo('Codice sconto');
  assert.equal(valuta({ tipo: 'tasti', combinazione: 'space' }, c, modulo(c, pulsante('Paga ora'))).protezione ?? null, null);
});

test('TG-1 control: a disabled or hidden protected button is not the default button', () => {
  const c = campo('Codice sconto');
  assert.equal(valuta(INVIO, c, modulo(c, pulsante('Paga ora', { stato: { attivo: false } }))).protezione ?? null, null);
  assert.equal(valuta(INVIO, c, modulo(c, pulsante('Paga ora', { visibile: false }))).protezione ?? null, null);
});

test('TG-1 control: the protected button sits in another window (a dialog) ⇒ the field does not submit it', () => {
  const c = campo('Nome');
  const s = modulo(c, { ref: 'w0', ruolo: 'finestra', nome: 'Elimina', modale: true }, pulsante('Elimina account', { finestra: 'w0' }));
  assert.equal(valuta(INVIO, c, s).protezione ?? null, null);
});

test('TG-1 two protected buttons ⇒ the strongest one decides (payment over deletion over sending)', () => {
  const c = campo('Nome');
  const s = modulo(c, pulsante('Invia'), { ...pulsante('Elimina account'), ref: 'e3' }, { ...pulsante('Paga ora'), ref: 'e4' });
  assert.equal(esito(valuta(INVIO, c, s)), 'pagamento/chiedi');
});

test('TG-1 a chat field keeps its own reading (sending), not the deletion button next to it', () => {
  const c = campo('Messaggio');
  const v = valuta(INVIO, c, modulo(c, pulsante('Elimina account')));
  assert.equal(v.protezione, 'invio');
  assert.equal(v.motivo, 'tasti-in-campo-chat');
});

// ---------- TG-2: links, same reading with Enter and with the click ----------
const collegamento = (nome) => ({ ref: 'e5', ruolo: 'collegamento', nome, stato: { attivo: true } });
const pagina = (l) => ({ elementi: [l], app: 'chrome', dominio: 'esempio.it' });
const LINK_INVIO = ['Conferma e invia', 'Review and send', 'Click here to submit', 'Apply and send', 'Spedisci messaggio', 'Send-email',
  'Send​email', 'Send ➤', 'Send ✉', 'Send ✉️', 'Send:', 'Email versenden', 'Posta commento', 'Publicar comentario', 'Send »',
  'Nachricht per E-Mail senden', 'Nachricht per E‑Mail senden'];
for (const nome of LINK_INVIO) {
  test(`TG-2 link «${nome}» is a send, with Enter and with the click`, () => {
    const l = collegamento(nome);
    const t = valuta(INVIO, l, pagina(l), PIENO);
    const c = valuta({ tipo: 'premi' }, l, pagina(l), PIENO);
    assert.equal(t.protezione, 'invio', `Enter: ${JSON.stringify(t)}`);
    assert.equal(c.protezione, 'invio', `click: ${JSON.stringify(c)}`);
  });
}
const LINK_NAVIGAZIONE = ['Posta in arrivo', 'Posta inviata', 'Vedi tutti i post', 'How to send a parcel', 'Come si invia un pacco', 'Pubblica amministrazione',
  'Post recenti', 'Send', 'Post', 'Upload', 'Sent items', '', '→', '★★', 'Post-office', 'Notizie e post recenti', 'Tutorial: how to write and send'];
for (const nome of LINK_NAVIGAZIONE) {
  test(`TG-2 control: link «${nome}» navigates (no send), with Enter and with the click`, () => {
    const l = collegamento(nome);
    assert.equal(valuta(INVIO, l, pagina(l), PIENO).protezione ?? null, null);
    assert.equal(valuta({ tipo: 'premi' }, l, pagina(l), PIENO).protezione ?? null, null);
  });
}

// ---------- TG-4: comment fields beyond Italian and English (N3) ----------
for (const nome of ['Kommentar schreiben', 'Écrire un commentaire', 'Escribe un comentario', 'Escreva um comentário', 'Say something…', 'Join the discussion']) {
  test(`TG-4 Enter in «${nome}» publishes (comment field)`, () => {
    const c = campo(nome);
    const v = valuta(INVIO, c, modulo(c));
    assert.equal(v.protezione, 'invio', JSON.stringify(v));
    assert.equal(v.motivo, 'tasti-in-campo-chat');
  });
}

// ---------- TG-3: small windows are confirmation dialogs only with a sentence and no text field (G5, decision 181) ----------
function finestraPiccola(righe, { larghezza = 480, altezza = 520, propria = false } = {}) {
  const grezzi = righe.filter((r) => r.indice != null).map((r) => ({ element_index: r.indice, role: r.ruolo, depth: r.prof, label: r.nome }));
  const md = righe.map((r) => `${'  '.repeat(r.prof)}- ${r.indice != null ? `[${r.indice}] ` : ''}${r.ruolo}${r.nome ? ` "${r.nome}"` : ''}`).join('\n');
  const elementi = grezzi.map((g) => ({ ref: `e${g.element_index}`, ruolo: g.role === 'Window' ? 'finestra' : (g.role === 'Edit' ? 'campo' : 'pulsante'), nome: g.label, valore: null, stato: { attivo: true }, inLista: false }));
  const scelta = { window_id: 2, pid: 5, z_index: 3 };
  const finestre = propria ? [scelta, { window_id: 1, pid: 5, z_index: 1, bounds: { x: 0, y: 0, width: 1600, height: 900 } }] : [scelta];
  const fi = formaDiDialogo(scelta, { x: 0, y: 0, width: larghezza, height: altezza }, finestre);
  return segnaDialoghi({ elementi, grezzi, markdown: md, titolo: righe[0].nome, finestraIntera: fi });
}
const r = (prof, ruolo, nome, indice = null) => ({ prof, ruolo, nome, indice });
const segnata = (out) => out.some((e) => e.modale === true);

test('TG-3 a small app with only buttons (sticky note, 480x520) is not a dialog: «Elimina» and «Condividi» cost no card', () => {
  const out = finestraPiccola([r(0, 'Window', 'Nota adesiva', 0), r(1, 'Button', 'Elimina', 1), r(1, 'Button', 'Condividi', 2), r(1, 'Button', 'Nuova nota', 3), r(1, 'Button', 'Impostazioni', 4)]);
  assert.equal(segnata(out), false, JSON.stringify(out));
  const s = { elementi: out, app: 'stickynotes', dominio: null };
  for (const nome of ['Elimina', 'Condividi']) assert.equal(valuta({ tipo: 'premi' }, out.find((e) => e.nome === nome), s).protezione ?? null, null, nome);
});

test('TG-3 a small window with a sentence and buttons is a dialog («Eliminare 1 file?»)', () => {
  const out = finestraPiccola([r(0, 'Window', 'Eliminare 1 file?', 0), r(1, 'Text', 'Il file verrà spostato nel Cestino.'), r(1, 'Button', 'Elimina', 1), r(1, 'Button', 'Annulla', 2)]);
  assert.equal(segnata(out), true, JSON.stringify(out));
});

test('TG-3 a small window with a sentence and a text field is not a confirmation (a login or a search box)', () => {
  const out = finestraPiccola([r(0, 'Window', 'Rinomina', 0), r(1, 'Text', 'Nuovo nome della nota'), r(1, 'Edit', 'Nome', 1), r(1, 'Button', 'Elimina', 2), r(1, 'Button', 'OK', 3)]);
  assert.equal(segnata(out), false, JSON.stringify(out));
});

test('TG-3 (A06) a small window with a document inside is an app, even with a sentence and two buttons', () => {
  const out = finestraPiccola([r(0, 'Window', 'Appunti', 0), r(1, 'Text', 'Ultima modifica ieri'), r(1, 'Document', 'Testo della nota'), r(1, 'Button', 'Elimina', 1), r(1, 'Button', 'Condividi', 2)]);
  assert.equal(segnata(out), false, JSON.stringify(out));
});

test('TG-3 an owned window over a bigger one of the same process stays a dialog, sentence or not', () => {
  const out = finestraPiccola([r(0, 'Window', 'Elimina file', 0), r(1, 'Button', 'Sì', 1), r(1, 'Button', 'No', 2)], { larghezza: 645, altezza: 300, propria: true });
  assert.equal(segnata(out), true, JSON.stringify(out));
});

// ---------- TG-5: the surviving mutants of the second review ----------
test('TG-5 (R18) a link whose name has no words is not a send', () => {
  for (const nome of ['', '→', '…', '★★']) {
    const l = collegamento(nome);
    assert.equal(valuta({ tipo: 'premi' }, l, pagina(l), PIENO).protezione ?? null, null, JSON.stringify(nome));
  }
});

// ---------- TG-1 and TG-6 through the real PC host ----------
function png(w, h) {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}
const FINESTRA = { window_id: 400, pid: 88, app_name: 'olk.exe', title: 'Posta in arrivo - Outlook', bounds: { x: 0, y: 0, width: 1600, height: 900 }, z_index: 9, is_on_screen: true, minimized: false };
const att = (i, role, label, depth) => ({ el: { element_index: i, element_token: `s0:${i}`, role, label, depth, actions: ['invoke'], frame: { x: 600, y: 360 + i * 40, w: 120, h: 30 } },
  md: `${'  '.repeat(depth)}- [${i}] ${role} "${label}" [actions=[invoke]]` });
const txt = (depth, role, label) => ({ md: `${'  '.repeat(depth)}- ${role} "${label}"` });
// posta: dialogo «Eliminare il messaggio?» dentro la finestra (schermata D del conto del 05/11)
const RIGHE_POSTA = [txt(0, 'Window', 'Posta in arrivo - Outlook'), att(0, 'Button', 'Nuova mail', 1), att(1, 'ListItem', 'Riunione di giovedì', 2),
  txt(1, 'Window', 'Eliminare il messaggio?'), txt(2, 'Text', 'Il messaggio verrà spostato in Posta eliminata.'), att(2, 'Button', 'Elimina', 2), att(3, 'Button', 'Annulla', 2)];
// profilo: un modulo con «Nome» e «Elimina account» come unico pulsante protetto
const RIGHE_PROFILO = [txt(0, 'Window', 'Profilo'), att(0, 'Edit', 'Nome del profilo', 1), att(1, 'Button', 'Elimina account', 1)];
const statoDa = (righe) => () => ({ window_id: FINESTRA.window_id, pid: FINESTRA.pid, window_title: righe[0].md.match(/"(.*)"/u)[1], app_name: FINESTRA.app_name,
  window_bounds: FINESTRA.bounds, screenshot_width: 1600, screenshot_height: 900, elements: righe.filter((x) => x.el).map((x) => x.el), tree_markdown: `${righe.map((x) => x.md).join('\n')}\n` });
function aiutanteFinto(stato) {
  const azioni = [];
  return { azioni, async apri() { return { ok: true }; }, compito() { return () => {}; },
    async chiama(nome, argomenti) {
      if (nome === 'list_windows') return { ok: true, dati: { windows: [FINESTRA] }, immagine: null, errore: null };
      if (nome === 'get_window_state') return { ok: true, dati: stato(), immagine: { base64: png(1600, 900).toString('base64'), mime: 'image/png' }, errore: null };
      azioni.push({ nome, argomenti }); return { ok: true, dati: {}, immagine: null, errore: null };
    } };
}
function sessione(testoDellaPersona, risposte) {
  const domande = []; const eventi = []; let n = 0;
  return { domande, eventi, valore: { testoDellaPersona,
    chiediModello: async () => { const x = risposte[Math.min(n, risposte.length - 1)]; n += 1; return { testo: JSON.stringify(x), usage: null }; },
    chiediDomanda: async (q) => { validaDomandeUtente(q); domande.push(q[0].question); return { status: 'answered', answers: { [q[0].id]: 'Allow' } }; },
    emetti: (nome, dati) => { eventi.push({ nome, dati }); } } };
}
const INIZIALE = /wants to use this computer|vuole usare questo computer|outside the places/u;
const ricordaOutlook = () => ({ perIlCiclo: async () => ({ domini: [], app: ['olk'] }), ricorda: async () => {} });
async function giro({ righe, testo, azione, livello = 'scrittura-progetto', registroLuoghi = null }) {
  const aiutante = aiutanteFinto(statoDa(righe));
  const s = sessione(testo, [{ actions: [azione] }, { done: { success: true } }]);
  await creaOspiteComputerUse({ aiutante, registroLuoghi })(NOME_COMPUTER_USE, { task: 'work on the screen' },
    { fase: 'esegui', toolCallId: 'c1', segnale: new AbortController().signal, livelloAccesso: livello, sessione: s.valore });
  return { carte: s.domande.filter((q) => !INIZIALE.test(q)), iniziali: s.domande.filter((q) => INIZIALE.test(q)), azioni: aiutante.azioni,
    protezioni: s.eventi.filter((e) => e.nome === EVENTI.protezione && e.dati?.protezione).map((e) => `${e.dati.protezione}/${e.dati.motivo ?? ''}→${e.dati.decisione}`) };
}

test('TG-1 (host, T-R4 decided) Enter in «Nome del profilo» with «Elimina account»: Normal asks a card, Full access marks it', async () => {
  const azione = { type: 'keys', keys: 'enter', ref: 'e0' };
  const n = await giro({ righe: RIGHE_PROFILO, testo: 'Scrivi Mario nel campo Nome del profilo', azione });
  assert.equal(n.carte.length, 1, JSON.stringify(n));
  const p = await giro({ righe: RIGHE_PROFILO, testo: 'Scrivi Mario nel campo Nome del profilo', azione, livello: 'accesso-pieno' });
  assert.deepEqual(p.protezioni, ['cancellazione/invio-implicito→procedi-e-segna'], JSON.stringify(p));
});

test('TG-6 «Consenti sempre» on the PC: a deletion the person asked for, in a remembered app, goes without a card (decisions 149, 237)', async () => {
  const g = await giro({ righe: RIGHE_POSTA, testo: 'Elimina la mail della riunione di giovedì', azione: { type: 'press', ref: 'e2' }, registroLuoghi: ricordaOutlook() });
  assert.deepEqual(g.carte, [], JSON.stringify(g));
  // 'procedi' non apre carte né segni: la stessa pressione senza il luogo ricordato chiede (il controllo qui sotto)
  assert.deepEqual(g.azioni.map((a) => a.nome), ['click']);
});

test('TG-6 «Consenti sempre» on the PC: a deletion nobody asked for still asks a card', async () => {
  const g = await giro({ righe: RIGHE_POSTA, testo: 'Apri la posta e dimmi cosa c\'è', azione: { type: 'press', ref: 'e2' }, registroLuoghi: ricordaOutlook() });
  assert.equal(g.carte.length, 1, JSON.stringify(g));
});

test('TG-6 control: without a remembered place the Normal policy stays (the asked deletion still asks)', async () => {
  const g = await giro({ righe: RIGHE_POSTA, testo: 'Elimina la mail della riunione di giovedì', azione: { type: 'press', ref: 'e2' } });
  assert.equal(g.carte.length, 1, JSON.stringify(g));
});

test('TG-6 control: in a remembered app a payment or a send keeps its card even when asked (decision 75 for money and sending)', async () => {
  const righe = [txt(0, 'Window', 'Posta in arrivo - Outlook'), att(0, 'Edit', 'A', 1), att(1, 'Button', 'Invia', 1)];
  const g = await giro({ righe, testo: 'Invia la mail a Marco', azione: { type: 'press', ref: 'e1' }, registroLuoghi: ricordaOutlook() });
  assert.equal(g.carte.length, 1, JSON.stringify(g));
});
