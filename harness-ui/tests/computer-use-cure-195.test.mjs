/*
 * 0.2.2-CU, giro 3, punto 7: le cure C1, C2 e C3 (decisione 195 dell'owner, 04/11/2026) riscritte sulla testa di oggi.
 * Le prove vengono dal ramo del 04/11 (fix/cu-cure-giro-2-2026-11-04 @ 75034d040, file cure-blocco-cu.test.mjs), lette solo per scopo
 * e casi; sulla testa 07b9bd3de erano rosse CB-01, CB-02, CB-04, CB-08, CB-09, CB-10, CB-18 e FD-06 (misurato il 10/11/2026), le altre
 * sono «verso contrario» (verdi per costruzione: fissano ciò che non deve cambiare). Le prove di R-MEDIO-2 non sono qui: «Consenti
 * sempre» sul PC è entrato per altra via (decisioni 237 e 239).
 * - C1: il vero dialogo di Windows 11 in italiano dice «Rimuovere in modo definitivo il file?».
 * - C2: se lo schermo dice in quale finestra sta ogni elemento, un bersaglio fuori dal dialogo non si giudica coi testi del dialogo.
 * - C3: un pulsante qualsiasi che non è un'uscita, dentro una finestra modale che CHIEDE di cancellare, è una cancellazione.
 * - FD-06 (Mobile): lo stesso dal lato del modulo condiviso, con le politiche del telefono.
 * Nessuno schermo vero: aiutante e modello finti. Fonte delle forme: Microsoft Learn, «Confirmations» (Win32 UX guide, 24/07/2025).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { valutaAzione, POLITICHE } from '../src/computer-use/protezioni.mjs';
import { creaOspiteComputerUse, NOME_COMPUTER_USE } from '../src/computer-use/attrezzo.mjs';
import { validaDomandeUtente } from '../src/user-question-contract.mjs';

const { pcNormale: NORMALE, pcConsentiSempre: SEMPRE, pcAccessoPieno: PIENO, telefono: TEL, telefonoAccessoPieno: TEL_PIENO } = POLITICHE;
const el = (ref, ruolo, nome, extra = {}) => ({ ref, ruolo, nome, ...extra });
/** Una finestra di conferma coi suoi testi e pulsanti, come la segna l'ospite del PC: ogni elemento del dialogo sa in quale finestra sta. */
const finestra = (titolo, testi, pulsanti, { ruolo = 'pulsante', modale = true, altri = [] } = {}) => ({ frenoArmato: true, dominio: '', elementi: [
  el('w', 'finestra', titolo, { modale }), ...[].concat(testi).map((t, i) => el(`t${i}`, 'testo', t, { finestra: 'w' })),
  ...pulsanti.map((p, i) => el(`b${i}`, ruolo, p, { finestra: 'w' })), ...altri] });
const su = (sch, nome, politica, { chiesta = false, azione = { tipo: 'premi' } } = {}) => {
  const b = sch.elementi.find((e) => e.nome === nome && e.ruolo !== 'testo' && e.ruolo !== 'finestra');
  return valutaAzione({ azione: { ...azione, ref: b.ref }, bersaglio: b, schermata: sch, politica, contesto: { richiesta: { cancellare: chiesta } } });
};

// ======================= C1: «in modo definitivo» (il testo vero di Windows 11 in italiano) =======================
test('CB-01 (C1): «Sì» sotto «in modo definitivo», «in maniera definitiva», «in modo permanente» è una cancellazione', () => {
  const rossi = [];
  for (const t of ['Rimuovere in modo definitivo il file?', 'I dati verranno cancellati in maniera definitiva.', 'Rimuovere in modo permanente 3 elementi?',
    'RIMUOVERE IN MODO DEFINITIVO IL FILE?']) {
    const sch = finestra('Avviso', t, ['Sì', 'No']);
    const r = su(sch, 'Sì', NORMALE);
    if (`${r.protezione}/${r.motivo}/${r.decisione}` !== 'cancellazione/dialogo/chiedi') rossi.push(`${t}: ${r.protezione}/${r.motivo}/${r.decisione}`);
    if (su(sch, 'Sì', PIENO).decisione !== 'procedi-e-segna') rossi.push(`${t}: Accesso pieno non segna`);
    if (su(sch, 'Sì', TEL).decisione !== 'ferma') rossi.push(`${t}: il telefono non ferma`);
    if (su(sch, 'No', NORMALE).protezione !== null) rossi.push(`${t}: «No» non è libero`);
  }
  assert.deepEqual(rossi, []);
});
test('CB-02 (C1): un pulsante «Rimuovere definitivamente» o «Elimina in modo definitivo» è una cancellazione anche fuori da un dialogo', () => {
  for (const nome of ['Rimuovere definitivamente', 'Elimina in modo definitivo', 'Rimuovi in modo definitivo', 'Cancellare in modo definitivo', 'Rimuovere per sempre']) {
    const sch = { frenoArmato: true, dominio: 'file.example', elementi: [el('b', 'pulsante', nome)] };
    const r = su(sch, nome, NORMALE);
    assert.equal(`${r.protezione}/${r.motivo}`, 'cancellazione/pulsante', nome);
  }
});
test('CB-03 (C1, verso contrario): «in modo» senza «definitivo/permanente», e «modo definitivo» senza «in», non fanno una cancellazione', () => {
  for (const t of ['Salvare in modo automatico le bozze?', 'Vuoi aprire il file in modo sicuro?', 'Scegli il modo definitivo di stampa']) {
    assert.equal(su(finestra('Conferma', t, ['Sì', 'No']), 'Sì', NORMALE).protezione, null, t);
  }
  const sch = { frenoArmato: true, dominio: 'file.example', elementi: [el('b', 'pulsante', 'Rimuovere il filtro')] };
  assert.equal(su(sch, 'Rimuovere il filtro', NORMALE).protezione, null);
});

// ======================= C2: il bersaglio fuori dal dialogo non si giudica coi testi del dialogo =======================
const conAvviso = (testoAvviso, fuori) => ({ frenoArmato: true, dominio: '', elementi: [
  el('w', 'finestra', 'Avviso', { modale: true }), el('t', 'testo', testoAvviso, { finestra: 'w' }), el('ok', 'pulsante', 'Chiudi avviso', { finestra: 'w' }),
  el('fuori', 'pulsante', fuori)] });
test('CB-04 (C2): un pulsante fuori dal dialogo, quando lo schermo dice dove sta ogni elemento, non prende i testi del dialogo', () => {
  const sch = conAvviso('Gli elementi del cestino vengono eliminati definitivamente dopo 30 giorni', 'Nuova cartella');
  for (const p of [NORMALE, SEMPRE, PIENO]) assert.equal(su(sch, 'Nuova cartella', p).protezione, null, p.nome);
  assert.equal(su(sch, 'Nuova cartella', NORMALE, { azione: { tipo: 'tasti', combinazione: 'enter' } }).protezione, null, 'Invio con ref, come il clic');
});
test('CB-05 (C2, verso contrario): senza bersaglio («s», «y» o Invio senza ref) il dialogo aperto conta ancora', () => {
  const sch = conAvviso('Rimuovere definitivamente il file?', 'Nuova cartella');
  for (const combinazione of ['s', 'y', 'enter']) {
    const r = valutaAzione({ azione: { tipo: 'tasti', combinazione }, bersaglio: null, schermata: sch, politica: NORMALE, contesto: { richiesta: {} } });
    assert.equal(r.protezione, 'cancellazione', combinazione);
  }
});
test('CB-06 (C2, verso contrario): se lo schermo NON dice in quale finestra sta un elemento (telefono, schermate vecchie) vale ogni dialogo aperto', () => {
  const sch = { frenoArmato: true, dominio: '', elementi: [el('w', 'finestra', 'Eliminare definitivamente il file?', { modale: true }), el('si', 'pulsante', 'Sì')] };
  assert.equal(su(sch, 'Sì', NORMALE).protezione, 'cancellazione');
  assert.equal(su(sch, 'Sì', TEL).decisione, 'ferma');
  // un elemento NASCOSTO con la finestra non basta a dire che lo schermo segna le finestre
  const nascosto = { ...sch, elementi: [...sch.elementi, el('h', 'testo', 'x', { finestra: 'w', visibile: false })] };
  assert.equal(su(nascosto, 'Sì', NORMALE).protezione, 'cancellazione');
});
test('CB-07 (C2, verso contrario): dentro il dialogo i suoi testi contano come prima', () => {
  const sch = conAvviso('Gli elementi verranno eliminati definitivamente', 'Nuova cartella');
  assert.equal(su(sch, 'Chiudi avviso', NORMALE).protezione, 'cancellazione');
  // Invio col fuoco sulla finestra del dialogo stessa (preme il pulsante di serie): resta una cancellazione anche con le finestre segnate
  const w = sch.elementi.find((e) => e.ruolo === 'finestra');
  const r = valutaAzione({ azione: { tipo: 'tasti', combinazione: 'enter', ref: 'w' }, bersaglio: w, schermata: sch, politica: NORMALE, contesto: { richiesta: {} } });
  assert.equal(r.protezione, 'cancellazione');
});

// ======================= C3 (decisione 195): un pulsante qualsiasi dentro una finestra che CHIEDE di cancellare =======================
const DOMANDE = [
  ['Sei sicuro di voler eliminare prova.txt?', 'Sì'], ['Are you sure you want to delete prova.txt?', 'Yes'], ['Eliminare il file?', 'OK'],
  ['Eliminare 1 file?', 'Elimina file'], ['Delete 1 file?', 'Delete file'], ['Eliminare la cartella?', 'Elimina comunque'], ['Delete this item?', 'Delete anyway'],
  ['Vuoi cancellare la bozza?', 'Continua'], ['Rimuovere l\'account dal dispositivo?', 'Sì'], ['Svuotare il Cestino?', 'Sì'], ['Scartare le modifiche?', 'Scarta'],
  ['Discard this draft?', 'Discard'], ['Remove 2 items?', 'OK'], ['Erase this disc?', 'Erase'], ['Datei löschen?', 'Ja'], ['Supprimer ce fichier ?', 'Oui'],
  ['¿Borrar el archivo?', 'Sí'], ['Excluir o arquivo?', 'Sim'],
  // un punto seguito da una cifra resta dentro la frase come quello seguito da una lettera (mutante C3-j)
  ['Eliminare la versione 2.0 del documento?', 'Sì'],
];
test('CB-08 (C3): ogni pulsante che non è un\'uscita, sotto una domanda di cancellazione, è una cancellazione; Normale chiede', () => {
  const rossi = [];
  for (const [t, p] of DOMANDE) {
    const r = su(finestra('Conferma', t, [p, 'Annulla']), p, NORMALE);
    if (`${r.protezione}/${r.motivo}/${r.decisione}` !== 'cancellazione/pulsante-in-finestra/chiedi') rossi.push(`${p} sotto «${t}»: ${r.protezione}/${r.motivo}/${r.decisione}`);
  }
  assert.deepEqual(rossi, []);
});
test('CB-09 (C3): basta la domanda nel TITOLO della finestra; un collegamento conta come un pulsante; Invio con ref come il clic', () => {
  assert.equal(su(finestra('Eliminare il file?', 'prova.txt', ['Sì', 'No']), 'Sì', NORMALE).protezione, 'cancellazione');
  assert.equal(su(finestra('Conferma', 'Eliminare il file?', ['Sì', 'No'], { ruolo: 'collegamento' }), 'Sì', NORMALE).protezione, 'cancellazione');
  assert.equal(su(finestra('Conferma', 'Eliminare il file?', ['Sì', 'No']), 'Sì', NORMALE, { azione: { tipo: 'tasti', combinazione: 'enter' } }).protezione, 'cancellazione');
});
test('CB-10 (C3): i cinque permessi, cancellazione chiesta e non chiesta', () => {
  const sch = finestra('Conferma', 'Eliminare il file?', ['OK', 'Annulla']);
  const got = Object.fromEntries([['Normale', NORMALE], ['Consenti sempre', SEMPRE], ['Accesso pieno', PIENO], ['Telefono', TEL], ['Telefono pieno', TEL_PIENO]]
    .map(([n, p]) => [n, [su(sch, 'OK', p, { chiesta: true }).decisione, su(sch, 'OK', p).decisione]]));
  assert.deepEqual(got, {
    Normale: ['chiedi', 'chiedi'], 'Consenti sempre': ['procedi', 'chiedi'], 'Accesso pieno': ['procedi-e-segna', 'procedi-e-segna'],
    Telefono: ['procedi', 'procedi'], // il telefono di serie non ha la regola (decisione 170, cancello della 188): invariato
    'Telefono pieno': ['procedi-e-segna', 'procedi-e-segna'],
  });
});
test('CB-11 (C3, verso contrario): uscite, caselle, finestre non modali, pulsanti fuori e domande che non cancellano restano libere', () => {
  const sch = finestra('Conferma', 'Eliminare il file?', ['Annulla', 'No', 'Chiudi', 'Cancel'], { altri: [el('fuori', 'pulsante', 'Nuova cartella')] });
  for (const p of ['Annulla', 'No', 'Chiudi', 'Cancel', 'Nuova cartella']) assert.equal(su(sch, p, NORMALE).protezione, null, p);
  // un pulsante in UN'ALTRA finestra segnata, non modale, mentre la domanda è aperta: non è dentro la modale (mutante C3-e)
  const dueFinestre = finestra('Conferma', 'Eliminare il file?', ['Sì', 'No'], { altri: [el('p', 'finestra', 'App', { modale: false }), el('ps', 'pulsante', 'OK', { finestra: 'p' })] });
  assert.equal(su(dueFinestre, 'OK', NORMALE).protezione, null);
  for (const ruolo of ['casella', 'interruttore', 'voce', 'scheda']) {
    assert.equal(su(finestra('Conferma', 'Eliminare il file?', ['Non chiedere più'], { ruolo }), 'Non chiedere più', NORMALE).protezione, null, ruolo);
  }
  assert.equal(su(finestra('Conferma', 'Eliminare il file?', ['Sì', 'No'], { modale: false }), 'Sì', NORMALE).protezione, null);
  for (const [t, p] of [['Salvare le modifiche a prova.txt?', 'Non salvare'], ['Vuoi continuare?', 'Sì'], ['Il file è stato eliminato.', 'OK'],
    ['Aggiornare l\'app?', 'Aggiorna'], ['Hai eliminato 3 file.', 'OK'], ['Ripristinare gli elementi eliminati', 'Sì'],
    ['Cancellazione completata. Chiudere la finestra?', 'Sì'], ['Eliminati 3 file! Vuoi continuare?', 'Sì']]) {
    assert.equal(su(finestra('Conferma', t, [p, 'Annulla']), p, NORMALE).protezione, null, `${p} sotto «${t}»`);
  }
});
test('CB-12 (C3, verso contrario): senza la regola nella politica niente cambia', () => {
  const senzaRegola = { ...NORMALE, eliminaNudoInFinestra: false };
  assert.equal(su(finestra('Conferma', 'Eliminare il file?', ['OK', 'Annulla']), 'OK', senzaRegola).protezione, null);
});
// FD-06 del Mobile (04/11 sera): lo stesso caso, fissato anche dal lato del modulo condiviso
test('FD-06 (C3, telefono): «Sposta nel cestino» in una finestra che chiede di cancellare ⇒ Accesso pieno del telefono procedi-e-segna; telefono di serie niente', () => {
  const sch = finestra('Eliminare la foto?', 'La foto verrà tolta da questo dispositivo.', ['Annulla', 'Sposta nel cestino']);
  const pieno = su(sch, 'Sposta nel cestino', TEL_PIENO);
  assert.equal(`${pieno.protezione}/${pieno.decisione}`, 'cancellazione/procedi-e-segna');
  const serie = su(sch, 'Sposta nel cestino', TEL);
  assert.equal(`${serie.protezione}/${serie.decisione}`, 'null/procedi');
});

// ======================= l'ospite finto (le forme di cua-driver): un dialogo sopra la finestra dell'app =======================
function png(w, h) {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}
const PRINCIPALE = { window_id: 700, pid: 55, app_name: 'App.exe', title: 'App', bounds: { x: 0, y: 0, width: 1600, height: 900 }, z_index: 3, is_on_screen: true, minimized: false };
const CONFERMA = { window_id: 701, pid: 55, app_name: 'App.exe', title: '', bounds: { x: 560, y: 330, width: 480, height: 220 }, z_index: 9, is_on_screen: true, minimized: false };
const ri = (p, t) => `${'  '.repeat(p)}${t}`;
const statoDialogo = (titolo, testo, pulsanti) => {
  const elements = pulsanti.map((p, k) => ({ element_index: k, element_token: `d:${k}`, role: 'Button', label: p, depth: 1, actions: ['invoke'], frame: { x: 600 + k * 130, y: 500, w: 120, h: 30 } }));
  const md = [ri(0, `- Window "${titolo}"`), ri(1, `- Text "${testo}"`), ...pulsanti.map((p, k) => ri(1, `- [${k}] Button "${p}" [actions=[invoke]]`))];
  return { window_id: 701, pid: 55, window_title: titolo, app_name: 'App.exe', window_bounds: CONFERMA.bounds, screenshot_width: 480, screenshot_height: 220, elements, tree_markdown: `${md.join('\n')}\n` };
};
/** Un compito: il modello preme `premi` nel dialogo. `sempre` = la risposta alle carte dei luoghi; `ricordati` = l'elenco di «Consenti sempre». */
async function compito({ frase, premi = 'Elimina', livello = 'scrittura-progetto', ricordati = null, ricordatiDopo = null, sempre = false,
  dialogo = ['Eliminare 1 file?', 'Eliminare 1 file?', ['Annulla', 'Elimina']], sito = null, programma = null }) {
  const stato = statoDialogo(...dialogo);
  // `sito`: la finestra è di un browser con la barra dell'indirizzo (il luogo è il dominio); `programma`: il nome del processo
  const nomeProcesso = sito ? 'msedge.exe' : (programma ?? 'App.exe');
  stato.app_name = nomeProcesso;
  if (sito) stato.elements.push({ element_index: 90, element_token: 'd:90', role: 'Edit', label: 'Address and search bar', value: sito, depth: 1, actions: ['focus'], frame: { x: 570, y: 340, w: 300, h: 24 } });
  const finestre = [PRINCIPALE, CONFERMA].map((w) => ({ ...w, app_name: nomeProcesso }));
  const ref = `e${stato.elements.find((e) => e.label === premi).element_index}`;
  const azioni = []; const carte = []; let i = 0; let letture = 0;
  const aggiunti = { domini: [], app: [] }; // ciò che il ciclo salva con «Consenti sempre» torna nelle letture dopo, come nel registro vero
  const aiutante = {
    async apri() { return { ok: true }; }, compito() { return () => {}; },
    async chiama(n) {
      if (n === 'list_windows') return { ok: true, dati: { windows: finestre }, immagine: null, errore: null };
      if (n === 'get_window_state') return { ok: true, dati: stato, immagine: { base64: png(480, 220).toString('base64') }, errore: null };
      azioni.push(n); return { ok: true, dati: {}, immagine: null, errore: null };
    },
  };
  // il modello preme finché il clic non parte (dopo la carta di un luogo nuovo il ciclo richiede il passo), poi ha finito
  const passo = () => (azioni.length > 0 || i >= 4 ? { done: { success: true } } : { actions: [{ type: 'press', ref }] });
  const registroLuoghi = ricordati ? {
    perIlCiclo: async () => {
      letture += 1; const base = letture > 1 && ricordatiDopo ? ricordatiDopo : ricordati;
      return { domini: [...base.domini, ...aggiunti.domini], app: [...base.app, ...aggiunti.app] };
    },
    ricorda: async ({ domini = [], app = [] }) => { aggiunti.domini.push(...domini); aggiunti.app.push(...app); },
  } : null;
  const sessione = {
    testoDellaPersona: frase,
    chiediModello: async () => { const r = passo(); i += 1; return { testo: JSON.stringify(r), usage: null }; },
    chiediDomanda: async (q) => {
      validaDomandeUtente(q);
      // carte dei luoghi: quella iniziale del compito («wants to use this computer») e quella di un luogo nuovo
      const luogo = /wants to use this computer|outside the places|vuole usare questo computer/u.test(q[0].question);
      if (!luogo) carte.push(q[0].question);
      return { status: 'answered', answers: { [q[0].id]: luogo && sempre ? 'Always allow' : 'Allow' } };
    },
    emetti: () => {},
  };
  await creaOspiteComputerUse({ aiutante, registroLuoghi })(NOME_COMPUTER_USE, { task: frase }, { fase: 'esegui', toolCallId: 'c1', segnale: new AbortController().signal, livelloAccesso: livello, sessione });
  return { carte: carte.length, premuto: azioni.length > 0 };
}
const CHIESTA = 'Elimina l\'elemento selezionato';
const NON_CHIESTA = 'Apri l\'elemento selezionato';
test('CB-18 (C1 all\'ospite): il vero dialogo «Rimuovere in modo definitivo il file?» fa UNA carta in Normale e zero in Accesso pieno', async () => {
  const vero = ['Elimina file', 'Rimuovere in modo definitivo il file?', ['Sì', 'No']];
  assert.deepEqual(await compito({ frase: NON_CHIESTA, premi: 'Sì', dialogo: vero }), { carte: 1, premuto: true });
  assert.deepEqual(await compito({ frase: NON_CHIESTA, premi: 'Sì', dialogo: vero, livello: 'accesso-pieno' }), { carte: 0, premuto: true });
  assert.deepEqual(await compito({ frase: NON_CHIESTA, premi: 'No', dialogo: vero }), { carte: 0, premuto: true });
});
