/**
 * 0.2.2-CU round 3, points 4 and 6 (judge v1314; reviews of 09/11/2026: CLI N3 and R4, Phone R3, Performance N4).
 * A coordinate click with no readable element under the point, in front of a confirmation window, was guarded by one word list only
 * (`TESTO_IRREVERSIBILE`) and only for modal windows: measured with NO card on the head 07b9bd3de for the real Italian Windows 11
 * dialog («Rimuovere in modo definitivo il file?»), «Eliminare il file?», «Svuotare il Cestino?», «Delete 3 items?», «Questa
 * operazione non è reversibile.», «There is no undo», «can't be reversed», Portuguese, Dutch, Japanese, Chinese, Polish, Russian, and
 * every confirmation window not marked modal. Now the click is judged by what the window can do at worst: its irreversible text, its
 * delete question (decisions 195 and 204), then its strongest button, read as a click on it (payment > deletion > send), the way
 * Enter in a form is judged by the form's default button (`invioImplicito`).
 * False alarms pinned the other way: «Permanent marker settings», «Keep forever?», a window that can be undone, text outside windows.
 * Hermes asks for every destructive action and does not read dialogs (tools/computer_use/tool.py:336-341); the Anthropic demo sends
 * the click as it is (computer-use-demo/computer_use_demo/tools/computer.py:220-226). Pure module: no screen, no helper.
 * The phrases of the new languages are the ones the reviewers measured, not read from a Windows in that language.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { valutaAzione, improntaDeiDialoghi, POLITICHE } from '../src/computer-use/protezioni.mjs';

const { pcNormale: NORMALE, pcAccessoPieno: PIENO, pcConsentiSempre: SEMPRE, telefono: TEL, telefonoAccessoPieno: TEL_PIENO } = POLITICHE;
const ctx = (over = {}) => ({ richiesta: { pagare: false, inviare: false, cancellare: false }, sospetto: false, piano: { domini: [], app: [] }, ...over });
const el = (ref, ruolo, nome, extra = {}) => ({ ref, ruolo, nome, ...extra });
/** a confirmation window as the PC host marks it: every element of the dialog knows its window */
const finestra = (titolo, testi, pulsanti, { ref = 'w', modale = true, ruolo = 'pulsante' } = {}) => [
  el(ref, 'finestra', titolo, modale ? { modale: true } : {}), ...[].concat(testi).map((t, i) => el(`${ref}t${i}`, 'testo', t, { finestra: ref })),
  ...pulsanti.map((p, i) => el(`${ref}b${i}`, ruolo, p, { finestra: ref }))];
const CLIC = { tipo: 'clic', x: 10, y: 10 };
const buio = (elementi, politica = NORMALE, contesto = ctx()) => valutaAzione({ azione: CLIC, bersaglio: null, schermata: { elementi }, politica, contesto });
const premi = (elementi, nome, politica = NORMALE) => {
  const b = elementi.find((e) => e.nome === nome && e.ruolo !== 'testo' && e.ruolo !== 'finestra');
  return valutaAzione({ azione: { tipo: 'premi', ref: b.ref }, bersaglio: b, schermata: { elementi }, politica, contesto: ctx() });
};
const invio = (elementi, politica = NORMALE) => valutaAzione({ azione: { tipo: 'tasti', combinazione: 'enter' }, bersaglio: null, schermata: { elementi }, politica, contesto: ctx() });
const breve = (r) => `${r.decisione}/${r.protezione}/${r.motivo}`;

// each: [language, text of the dialog, its confirm button, its way out] — real dialogs carry their own buttons
const IRREVERSIBILI = [
  ['it W11 (shell32 it-IT)', 'Rimuovere in modo definitivo il file?', 'Sì', 'No'],
  ['it «in modo permanente»', 'Vuoi eliminare in modo permanente questi 3 elementi?', 'Sì', 'No'],
  ['it «non potrà essere recuperato»', 'Il file non potrà essere recuperato. Continuare?', 'Continua', 'Annulla'],
  ['it «non è reversibile»', 'Questa operazione non è reversibile.', 'OK', 'Annulla'],
  ['it «non potrai tornare indietro»', 'Non potrai tornare indietro.', 'OK', 'Annulla'],
  ['en «there is no undo»', 'Delete this file? There is no undo.', 'OK', 'Cancel'],
  ['en «can\'t be reversed»', "Delete this file? This can't be reversed.", 'OK', 'Cancel'],
  ['en «won\'t be able to recover it»', "Delete this file? You won't be able to recover it.", 'OK', 'Cancel'],
  ['en «gone for good»', 'Delete this file? It will be gone for good.', 'OK', 'Cancel'],
  ['en «this action is permanent»', 'This action is permanent.', 'OK', 'Cancel'],
  ['en «deleted forever»', 'Your notes will be deleted forever.', 'OK', 'Cancel'],
  ['es «de forma permanente»', '¿Seguro que quieres eliminar este archivo de forma permanente?', 'Sí', 'No'],
  ['pt', 'Excluir este arquivo? Esta ação não pode ser desfeita.', 'Excluir', 'Cancelar'],
  ['pt «permanentemente»', 'Deseja excluir permanentemente este arquivo?', 'Sim', 'Não'],
  ['nl', 'Dit bestand verwijderen? Dit kan niet ongedaan worden gemaakt.', 'Verwijderen', 'Annuleren'],
  ['nl «permanent … verwijderen»', 'Weet je zeker dat je dit bestand permanent wilt verwijderen?', 'Ja', 'Nee'],
  ['ja', 'このファイルを削除しますか？この操作は元に戻せません。', '削除', 'キャンセル'],
  ['ja «完全に削除»', 'このファイルを完全に削除しますか?', 'はい', 'いいえ'],
  ['zh', '删除此文件？此操作无法撤消。', '删除', '取消'],
  ['zh «永久删除»', '确实要永久删除此文件吗？', '是', '否'],
  ['pl', 'Usunąć plik? Tej operacji nie można cofnąć.', 'Usuń', 'Anuluj'],
  ['pl «nieodwracalna»', 'Ta operacja jest nieodwracalna.', 'OK', 'Anuluj'],
  ['ru', 'Удалить файл? Это действие нельзя отменить.', 'Удалить', 'Отмена'],
  ['ru «безвозвратно»', 'Вы действительно хотите безвозвратно удалить этот файл?', 'Да', 'Нет'],
  ['de', 'Datei löschen? Dies kann nicht rückgängig gemacht werden.', 'Löschen', 'Abbrechen'],
  ['fr', 'Supprimer le fichier ? Cette action est irréversible.', 'Supprimer', 'Annuler'],
];

test('DLG-1 (point 4): an irreversible confirmation window in thirteen ways of saying it: the blind click asks ONE deletion card in Normal and is marked in Full access, like Enter and like the confirm button; the way out stays free', () => {
  const rossi = [];
  for (const [lingua, testo, conferma, uscita] of IRREVERSIBILI) {
    for (const dove of ['testo', 'titolo']) {
      const sch = dove === 'testo' ? finestra('Conferma', testo, [conferma, uscita]) : finestra(testo, [], [conferma, uscita]);
      const n = buio(sch);
      if (breve(n) !== 'chiedi/cancellazione/dialogo') rossi.push(`${lingua} [${dove}] blind click, Normal: ${breve(n)}`);
      if (breve(buio(sch, PIENO)) !== 'procedi-e-segna/cancellazione/dialogo') rossi.push(`${lingua} [${dove}] blind click, Full access: ${breve(buio(sch, PIENO))}`);
      if (buio(sch, SEMPRE).decisione !== 'chiedi') rossi.push(`${lingua} [${dove}] blind click, Always allow`);
      if (breve(invio(sch)) !== 'chiedi/cancellazione/dialogo') rossi.push(`${lingua} [${dove}] Enter without a target: ${breve(invio(sch))}`);
      if (premi(sch, conferma).protezione !== 'cancellazione') rossi.push(`${lingua} [${dove}] press «${conferma}»: ${breve(premi(sch, conferma))}`);
      if (premi(sch, uscita).protezione !== null) rossi.push(`${lingua} [${dove}] the way out «${uscita}» is not free: ${breve(premi(sch, uscita))}`);
      // the card names the dialog: the proof is its text
      if (!String(n.prova ?? '').includes(testo.toLowerCase().slice(0, 12))) rossi.push(`${lingua} [${dove}] proof: ${n.prova}`);
    }
  }
  assert.deepEqual(rossi, []);
});

test('DLG-2 (point 4, Phone R3): a window that ASKS to delete without saying it cannot be undone: the blind click asks like the button would (decisions 195 and 204)', () => {
  for (const [testo, pulsante] of [['Eliminare il file?', 'OK'], ['Svuotare il Cestino?', 'Sì'], ['Delete 3 items?', 'OK'], ['Excluir o arquivo?', 'OK'],
    ['Sei sicuro di voler eliminare prova.txt?', 'Sì'], ['Are you sure you want to delete this shortcut?', 'Yes']]) {
    const sch = finestra('Conferma', testo, [pulsante, 'Annulla']);
    assert.equal(breve(buio(sch)), 'chiedi/cancellazione/pulsante-in-finestra', testo);
    assert.equal(breve(buio(sch, PIENO)), 'procedi-e-segna/cancellazione/pulsante-in-finestra', testo);
    // with no button read at all (a custom-drawn dialog): the question alone is enough
    assert.equal(breve(buio(finestra('Conferma', testo, []))), 'chiedi/cancellazione/pulsante-in-finestra', `${testo} (no button)`);
  }
});

test('DLG-3 (point 4): with a text the vocabulary does not know, the strongest button of the modal window decides: payment over deletion over send', () => {
  const ignoto = 'Ez a művelet nem vonható vissza.'; // Hungarian: no rule reads it
  const casi = [
    [['Elimina', 'Annulla'], 'chiedi/cancellazione/clic-senza-bersaglio', 'elimina'],
    [['Delete', 'Cancel'], 'chiedi/cancellazione/clic-senza-bersaglio', 'delete'],
    [['Invia', 'Annulla'], 'chiedi/invio/clic-senza-bersaglio', 'invia'],
    [['Invia', 'Elimina', 'Annulla'], 'chiedi/cancellazione/clic-senza-bersaglio', 'elimina'],
    [['Elimina', 'Paga ora', 'Invia'], 'chiedi/pagamento/clic-senza-bersaglio', 'paga ora'],
    [['Paga ora', 'Elimina'], 'chiedi/pagamento/clic-senza-bersaglio', 'paga ora'],
  ];
  for (const [pulsanti, atteso, prova] of casi) {
    const r = buio(finestra('Megerősítés', ignoto, pulsanti));
    assert.equal(breve(r), atteso, pulsanti.join(' / '));
    assert.equal(r.prova, prova, pulsanti.join(' / '));
  }
  // Full access: deletion and send go and are marked, a payment still asks its one card (decision 159)
  assert.equal(buio(finestra('x', ignoto, ['Elimina', 'Annulla']), PIENO).decisione, 'procedi-e-segna');
  assert.equal(buio(finestra('x', ignoto, ['Paga ora', 'Annulla']), PIENO).decisione, 'chiedi');
  // what does NOT count: a disabled or hidden button, a button outside the modal window, a link, a checkbox, ways out, a save dialog
  const spento = finestra('x', ignoto, ['Annulla']).concat(el('b9', 'pulsante', 'Elimina', { finestra: 'w', stato: { attivo: false } }));
  const nascosto = finestra('x', ignoto, ['Annulla']).concat(el('b9', 'pulsante', 'Elimina', { finestra: 'w', visibile: false }));
  const fuori = finestra('x', ignoto, ['Annulla']).concat(el('b9', 'pulsante', 'Elimina definitivamente'));
  const altraFinestra = finestra('x', ignoto, ['Annulla']).concat(el('p', 'finestra', 'App'), el('b9', 'pulsante', 'Paga ora', { finestra: 'p' }), ...Array.from({ length: 6 }, (_, k) => el(`a${k}`, 'pulsante', `Voce ${k}`, { finestra: 'p' })));
  const link = finestra('x', ignoto, ['Elimina'], { ruolo: 'collegamento' });
  const casella = finestra('x', ignoto, ['Elimina'], { ruolo: 'casella' });
  const salva = finestra('Blocco note', 'Salvare le modifiche a Senza titolo?', ['Salva', 'Non salvare', 'Annulla']);
  for (const [nome, sch] of Object.entries({ spento, nascosto, fuori, link, casella, salva })) {
    for (const politica of [NORMALE, PIENO, SEMPRE]) assert.equal(breve(buio(sch, politica)), 'procedi/null/null', `${nome} ${politica.nome}`);
  }
  // owner 11/11 14:02 (judge v1472): a button that pays, anywhere on the screen, makes the blind click ask the payment card ALWAYS,
  // even outside the modal window (before this rule «Paga ora» in another window went with no card)
  for (const politica of [NORMALE, PIENO]) assert.equal(breve(buio(altraFinestra, politica)), 'chiedi/pagamento/clic-senza-bersaglio', `altraFinestra ${politica.nome}`);
});

test('DLG-4 (point 6, mutant R4 of the CLI review): two modal windows, the irreversible one SECOND: the blind click still asks; so does its question and its strongest button', () => {
  const salva = finestra('Salva', 'Salvare le modifiche?', ['Salva', 'Annulla'], { ref: 'a' });
  const perSempre = finestra('Conferma', 'Eliminare definitivamente questo file? Non si può annullare.', ['Sì', 'No'], { ref: 'b' });
  assert.equal(breve(buio([...salva, ...perSempre])), 'chiedi/cancellazione/dialogo');
  assert.equal(breve(buio([...perSempre, ...salva])), 'chiedi/cancellazione/dialogo');
  assert.equal(breve(invio([...salva, ...perSempre])), 'chiedi/cancellazione/dialogo', 'Enter without a target reads every modal window too');
  const chiede = finestra('Conferma', 'Eliminare 3 file?', ['OK', 'Annulla'], { ref: 'b' });
  assert.equal(breve(buio([...salva, ...chiede])), 'chiedi/cancellazione/pulsante-in-finestra');
  const forte = finestra('Megerősítés', 'Ez a művelet nem vonható vissza.', ['Elimina', 'Annulla'], { ref: 'b' });
  assert.equal(breve(buio([...salva, ...forte])), 'chiedi/cancellazione/clic-senza-bersaglio');
  // the other way round: two windows that can be undone stay free
  assert.equal(breve(buio([...salva, ...finestra('Stampa', 'Stampare il documento?', ['Stampa', 'Annulla'], { ref: 'b' })])), 'procedi/null/null');
});

test('DLG-5 (point 4, Phone R3): a confirmation window NOT marked modal (1 to 5 buttons of its own) with an irreversible text asks at the blind click; text outside windows, a window with no button or with a toolbar do not', () => {
  for (const [lingua, testo, conferma, uscita] of IRREVERSIBILI) {
    const r = buio(finestra('Conferma', testo, [conferma, uscita], { modale: false }));
    assert.equal(breve(r), 'chiedi/cancellazione/dialogo', lingua);
  }
  assert.equal(buio(finestra('Conferma', 'Rimuovere in modo definitivo il file?', ['Sì', 'No'], { modale: false }), PIENO).decisione, 'procedi-e-segna');
  assert.equal(breve(buio(finestra('Eliminare definitivamente il file?', [], ['Sì'], { modale: false }))), 'chiedi/cancellazione/dialogo', 'the title counts, one button is enough');
  // exactly five buttons is still a confirmation, six is an app window
  const cinque = finestra('App', 'Gli elementi vengono eliminati definitivamente dopo 30 giorni', ['A', 'B', 'C', 'D', 'E'], { modale: false });
  const sei = finestra('App', 'Gli elementi vengono eliminati definitivamente dopo 30 giorni', ['A', 'B', 'C', 'D', 'E', 'F'], { modale: false });
  assert.equal(buio(cinque).protezione, 'cancellazione');
  assert.equal(breve(buio(sei)), 'procedi/null/null');
  const senzaPulsanti = finestra('App', 'Gli elementi vengono eliminati definitivamente dopo 30 giorni', [], { modale: false });
  const soloLink = finestra('App', 'Gli elementi vengono eliminati definitivamente dopo 30 giorni', ['Scopri di più'], { modale: false, ruolo: 'collegamento' });
  const fuoriDaTutto = [el('t', 'testo', 'I messaggi verranno eliminati definitivamente dopo 7 giorni'), el('b', 'pulsante', 'Salva')];
  const reversibile = finestra('Blocco note', 'Salvare le modifiche a Senza titolo?', ['Salva', 'Non salvare', 'Annulla'], { modale: false });
  const nascosta = [el('w', 'finestra', 'Eliminare definitivamente?', { visibile: false }), el('b', 'pulsante', 'Sì', { finestra: 'w' })];
  for (const [nome, sch] of Object.entries({ senzaPulsanti, soloLink, fuoriDaTutto, reversibile, nascosta })) {
    for (const politica of [NORMALE, PIENO, SEMPRE]) assert.equal(breve(buio(sch, politica)), 'procedi/null/null', `${nome} ${politica.nome}`);
  }
  // only the blind click reads a window that is not modal: a button with a name in it is judged by its name, as before (decision 195)
  const nonModale = finestra('Conferma', 'Eliminare il file?', ['Sì', 'No'], { modale: false });
  assert.equal(premi(nonModale, 'Sì').protezione, null);
  assert.equal(breve(buio(nonModale)), 'procedi/null/null', 'the delete question alone asks only inside a modal window (decision 204)');
});

test('DLG-6 (Phone R3, false alarms): «Permanent marker settings», «Keep forever?» and the like are not irreversible: no card for the blind click, Enter or the button', () => {
  for (const testo of ['Permanent marker settings', 'Keep forever?', 'Il tuo abbonamento permanente', 'Salvare le modifiche?', 'Sei sicuro?',
    'Forever young playlist', 'Save as permanent link?', 'Questa azione si può annullare dal menu Modifica.', 'この操作は元に戻せます。', 'Undo is available for 30 seconds.']) {
    for (const dove of ['testo', 'titolo']) {
      const sch = dove === 'testo' ? finestra('Impostazioni', testo, ['OK', 'Annulla']) : finestra(testo, [], ['OK', 'Annulla']);
      assert.equal(breve(buio(sch)), 'procedi/null/null', `${testo} [${dove}] blind click`);
      assert.equal(premi(sch, 'OK').protezione, null, `${testo} [${dove}] press OK`);
      assert.equal(invio(sch).protezione, null, `${testo} [${dove}] Enter`);
      assert.equal(breve(buio(sch.map((e) => (e.ruolo === 'finestra' ? { ...e, modale: false } : e)))), 'procedi/null/null', `${testo} [${dove}] not modal`);
    }
  }
  // «permanently», and «permanent» or «forever» next to what is lost, still count
  for (const testo of ['Are you sure you want to permanently delete this file?', 'This will permanently remove the account.', 'Permanent deletion of 3 files',
    'Deleting is permanent.', 'These files will be lost forever.', 'Delete this chat forever?', 'It will be gone forever.']) {
    assert.equal(breve(buio(finestra('Confirm', testo, ['OK', 'Cancel']))), 'chiedi/cancellazione/dialogo', testo);
  }
});

test('DLG-7 (decision 204 with the new ways out): «Non eliminare», «Não excluir» and the ways out of the new languages are free under an irreversible question; a confirm is not', () => {
  const domanda = 'Eliminare definitivamente il file? Non si può annullare.';
  for (const uscita of ['Non eliminare', "Don't delete", 'Nicht löschen', 'Não excluir', 'Nein', 'Non', 'Não', 'Annuleren', 'Nee', 'Anuluj', 'Nie', 'キャンセル', 'いいえ',
    '取消', '否', 'Отмена', 'Нет', 'Не удалять', 'Cancelar', 'Fechar', 'Zamknij', '閉じる', '关闭']) {
    assert.equal(premi(finestra('Conferma', domanda, ['Sì', uscita]), uscita).protezione, null, uscita);
  }
  for (const conferma of ['Sì', 'Excluir', 'Verwijderen', 'Usuń', '削除', '删除', 'Удалить', 'Niet annuleren', 'Annulla tutto e elimina']) {
    assert.equal(premi(finestra('Conferma', domanda, [conferma, 'Annulla']), conferma).protezione, 'cancellazione', conferma);
  }
  // the same for a control the page exposes as a field: a way out stays free, anything else in that window is the deletion
  assert.equal(premi(finestra('Conferma', domanda, ['Annulla'], { ruolo: 'campo' }), 'Annulla').protezione, null);
  assert.equal(premi(finestra('Conferma', domanda, ['Motivo'], { ruolo: 'campo' }), 'Motivo').protezione, 'cancellazione');
});

test('DLG-8 (Phone lens): the phone has no coordinate click; what changes there is the text of the shared rules', () => {
  const sch = finestra('Conferma', 'Excluir este arquivo? Esta ação não pode ser desfeita.', ['Excluir', 'Cancelar']);
  for (const politica of [TEL, TEL_PIENO]) {
    const r = buio(sch, politica);
    assert.deepEqual([r.decisione, r.protezione, r.prova], ['ferma', null, 'tipo-fuori-vocabolario'], politica.nome);
  }
  // the same Portuguese dialog, button pressed: the phone stops (was «procedi» before: the text was not read), Full access marks it
  assert.equal(premi(sch, 'Excluir', TEL).decisione, 'ferma');
  assert.equal(premi(sch, 'Excluir', TEL_PIENO).decisione, 'procedi-e-segna');
  assert.equal(premi(sch, 'Cancelar', TEL).protezione, null);
});

test('DLG-9 (point 2): the fingerprint of the confirmation windows: same windows and texts, same string whatever the refs; a text, a value, a button or a window more, another string; no window, null', () => {
  const a = finestra('Conferma', 'Eliminare definitivamente il file «a.txt»?', ['Sì', 'No']);
  const impronta = improntaDeiDialoghi({ elementi: a });
  assert.equal(typeof impronta, 'string');
  // renumbered tree, elements outside the window added or changed: the same window
  const rinumerata = finestra('Conferma', 'Eliminare definitivamente il file «a.txt»?', ['Sì', 'No'], { ref: 'e41' });
  assert.equal(improntaDeiDialoghi({ elementi: rinumerata }), impronta);
  assert.equal(improntaDeiDialoghi({ elementi: [...a, el('z', 'pulsante', 'Aggiorna'), el('y', 'testo', 'ore 12:31')] }), impronta);
  // another file in the question, another button, a typed value, a second window, modal or not: another window
  const diversi = {
    testo: finestra('Conferma', 'Eliminare definitivamente il file «b.txt»?', ['Sì', 'No']),
    titolo: finestra('Elimina file', 'Eliminare definitivamente il file «a.txt»?', ['Sì', 'No']),
    pulsante: finestra('Conferma', 'Eliminare definitivamente il file «a.txt»?', ['Sì', 'No', 'Sì a tutti']),
    valore: [...a, el('c', 'campo', 'Conferma', { finestra: 'w', valore: 'ELIMINA' })],
    seconda: [...a, ...finestra('Salva', 'Salvare?', ['Salva'], { ref: 'v' })],
    nonModale: a.map((e) => (e.ruolo === 'finestra' ? { ...e, modale: false } : e)),
  };
  for (const [nome, sch] of Object.entries(diversi)) assert.notEqual(improntaDeiDialoghi({ elementi: sch }), impronta, nome);
  // no confirmation window on the screen, or a screen that cannot be read
  for (const schermata of [{ elementi: [] }, { elementi: [el('b', 'pulsante', 'Avanti'), el('w', 'finestra', 'App')] }, { elementi: null }, null, { elementi: 'x' }]) {
    assert.equal(improntaDeiDialoghi(schermata), null, JSON.stringify(schermata));
  }
});

test('DLG-10 (Performance): the blind click reads each window once: its cost grows with the buttons of a modal window in a straight line, not with their square', () => {
  // Like PROT-11-RAPPORTO: a ratio between two sizes measured call by call, which the load of the machine does not move. Measured on
  // 10/11/2026: 9-12 with the windows read once per call; 60-90 when every button reads the texts of its window again.
  const modale = (n, k) => ({ elementi: [el('w', 'finestra', `Finestra ${k}`, { modale: true }), el('t', 'testo', 'Scegli una voce', { finestra: 'w' }),
    ...Array.from({ length: n }, (_, i) => el(`b${i}`, i % 3 ? 'pulsante' : 'testo', `Voce numero ${i} della lista ${k}`, { finestra: 'w' }))] });
  const mediana = (v) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
  const chiama = (s) => valutaAzione({ azione: CLIC, bersaglio: null, schermata: s, politica: NORMALE, contesto: ctx() });
  const rapporti = [];
  for (let g = 0; g < 5; g += 1) {
    const tG = []; const tP = [];
    for (let i = 0; i < 80; i += 1) {
      const grande = modale(500, g * 100 + i); const piccola = modale(50, g * 100 + i);
      let t0 = process.hrtime.bigint(); chiama(grande); const dG = Number(process.hrtime.bigint() - t0) / 1e6;
      t0 = process.hrtime.bigint(); chiama(piccola); const dP = Number(process.hrtime.bigint() - t0) / 1e6;
      if (i >= 15) { tG.push(dG); tP.push(dP); }
    }
    rapporti.push(mediana(tG) / mediana(tP));
  }
  const rapporto = mediana(rapporti);
  console.log(`# DLG-10 blind click, modal window 500/50 elements: ratio ${rapporto.toFixed(1)} (${rapporti.map((r) => r.toFixed(1)).join(' ')})`);
  assert.ok(rapporto < 25, `ratio ${rapporto.toFixed(1)}`);
});
