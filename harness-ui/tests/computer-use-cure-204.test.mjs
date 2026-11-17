/*
 * 0.2.2-CU, giro 3, punto 7: la C3 per i tasti (RC-01), il sì che fa partire un tasto senza bersaglio (RC-02) e la decisione 204
 * dell'owner (04/11/2026: una finestra chiede di cancellare solo con una parola di cancellazione PIÙ una cosa che si perde, mai su
 * «Non eliminare») riscritte sulla testa di oggi. Le prove vengono dal ramo del 04/11 (fix/cu-cure-giro-2-2026-11-04 @ 75034d040, file
 * revisione-cure-cu.test.mjs), lette solo per scopo e casi; sulla testa 07b9bd3de erano tutte rosse (misurato il 10/11/2026). RC-05
 * (R-MEDIO-2) non è qui: «Consenti sempre» sul PC è entrato per altra via (decisioni 237 e 239).
 * Banco vero del 04/11: le stringhe di Esplora risorse lette da C:/Windows/System32/{it-IT,en-US}/shell32.dll.mui.
 * Fonti: Microsoft Learn, «Dialog Box Programming Considerations», sezione Mnemonics (11/03/2025): «the user can press the mnemonic
 * key alone or with ALT»; Microsoft Learn, «Confirmations» (Win32 UX guide). Nessuno schermo vero: aiutante e modello finti.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { valutaAzione, POLITICHE } from '../src/computer-use/protezioni.mjs';
import { creaOspiteComputerUse, NOME_COMPUTER_USE } from '../src/computer-use/attrezzo.mjs';
import { validaDomandeUtente } from '../src/user-question-contract.mjs';

const { pcNormale: NORMALE, pcAccessoPieno: PIENO } = POLITICHE;
const el = (ref, ruolo, nome, extra = {}) => ({ ref, ruolo, nome, ...extra });
const finestra = (titolo, testi, pulsanti) => ({ frenoArmato: true, dominio: '', elementi: [
  el('w', 'finestra', titolo, { modale: true }), ...[].concat(testi).map((t, i) => el(`t${i}`, 'testo', t, { finestra: 'w' })),
  ...pulsanti.map((p, i) => el(`b${i}`, 'pulsante', p, { finestra: 'w' }))] });
const bottone = (sch, nome) => sch.elementi.find((e) => e.nome === nome && e.ruolo === 'pulsante');
const tasti = (sch, combinazione, bersaglio = null, politica = NORMALE) =>
  valutaAzione({ azione: { tipo: 'tasti', combinazione, ...(bersaglio ? { ref: bersaglio.ref } : {}) }, bersaglio, schermata: sch, politica, contesto: { richiesta: {} } });
const premi = (sch, nome, politica = NORMALE) => {
  const b = bottone(sch, nome);
  return valutaAzione({ azione: { tipo: 'premi', ref: b.ref }, bersaglio: b, schermata: sch, politica, contesto: { richiesta: {} } });
};

// --------------------------- ospite finto (come compito() di cure-blocco-cu.test.mjs) ---------------------------
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
/** Un compito con un dialogo a schermo: il modello manda UNA mossa finché non parte un'azione (al più 4 giri). Conta le carte che
 * non sono di luogo e le azioni davvero inviate all'aiutante. */
async function compito({ frase, mossa, dialogo, livello = 'scrittura-progetto', ricordati = null, sito = null, dopoLaCarta = null }) {
  const stato = statoDialogo(...dialogo);
  const processo = sito ? 'msedge.exe' : 'App.exe';
  stato.app_name = processo;
  if (sito) stato.elements.push({ element_index: 90, element_token: 'd:90', role: 'Edit', label: 'Address and search bar', value: sito, depth: 1, actions: ['focus'], frame: { x: 570, y: 340, w: 300, h: 24 } });
  const finestre = [PRINCIPALE, CONFERMA].map((w) => ({ ...w, app_name: processo }));
  const azioni = []; const carte = []; let giri = 0;
  const aiutante = {
    async apri() { return { ok: true }; }, compito() { return () => {}; },
    async chiama(n, a) {
      if (n === 'list_windows') return { ok: true, dati: { windows: finestre }, immagine: null, errore: null };
      if (n === 'get_window_state') return { ok: true, dati: stato, immagine: { base64: png(480, 220).toString('base64') }, errore: null };
      azioni.push(`${n}:${a?.key ?? a?.keys?.join('+') ?? a?.element_token ?? ''}`);
      return { ok: true, dati: {}, immagine: null, errore: null };
    },
  };
  const ref = (label) => `e${stato.elements.find((e) => e.label === label).element_index}`;
  const passo = () => (azioni.length > 0 || giri >= 4 ? { done: { success: true } } : { actions: [typeof mossa === 'function' ? mossa(ref) : mossa] });
  const registroLuoghi = ricordati ? { perIlCiclo: async () => ({ domini: [...ricordati.domini], app: [...ricordati.app] }), ricorda: async () => {} } : null;
  const sessione = {
    testoDellaPersona: frase,
    chiediModello: async () => { const r = passo(); giri += 1; return { testo: JSON.stringify(r), usage: null }; },
    chiediDomanda: async (q) => {
      validaDomandeUtente(q);
      if (!/wants to use this computer|outside the places|vuole usare questo computer/u.test(q[0].question)) { carte.push(q[0].question); dopoLaCarta?.(stato, carte.length); }
      return { status: 'answered', answers: { [q[0].id]: 'Allow' } };
    },
    emetti: () => {},
  };
  await creaOspiteComputerUse({ aiutante, registroLuoghi })(NOME_COMPUTER_USE, { task: frase }, { fase: 'esegui', toolCallId: 'c1', segnale: new AbortController().signal, livelloAccesso: livello, sessione });
  return { carte: carte.length, azioni };
}
const NON_CHIESTA = "Apri l'elemento selezionato";
const IT = ['Elimina file', 'Eliminare il file «a.txt»?', ['Sì', 'No']];

// ======================= RC-01: C3 aggirata dalla tastiera (acceleratori del dialogo) =======================
test('RC-01 (C3, decisione 195): «s», «y», «alt+y» in un dialogo che CHIEDE di cancellare premono «Sì» e devono fare la stessa carta del clic', () => {
  const it = finestra(...IT);
  const en = finestra('Delete File', 'Are you sure you want to delete this file?', ['Yes', 'No']);
  assert.equal(premi(it, 'Sì').protezione, 'cancellazione', 'riferimento: il clic su «Sì» è già una carta');
  const casi = [['s su IT', tasti(it, 's')], ['y su EN', tasti(en, 'y')], ['alt+y su EN', tasti(en, 'alt+y')], ['s col bersaglio «Sì»', tasti(it, 's', bottone(it, 'Sì'))], ['alt+s su IT', tasti(it, 'alt+s')]];
  const sbagliati = casi.filter(([, r]) => r.protezione !== 'cancellazione' || r.decisione !== 'chiedi').map(([n, r]) => `${n} → ${r.protezione ?? '-'}/${r.decisione}`);
  assert.deepEqual(sbagliati, []);
  const pieno = tasti(it, 's', null, PIENO);
  assert.equal(pieno.decisione, 'procedi-e-segna', 'in Accesso pieno nessuna carta, ma la riga segnata (decisione 195)');
  const altY = tasti(en, 'alt+y', null, PIENO);
  assert.equal(`${altY.protezione}/${altY.decisione}`, 'cancellazione/procedi-e-segna');
  // Alt+S col fuoco sul testo del dialogo preme comunque «Sì» (il mnemonico vale in tutta la finestra), non è un semplice invio
  const testo = it.elementi.find((e) => e.ruolo === 'testo');
  assert.equal(tasti(it, 'alt+s', testo).protezione, 'cancellazione');
});

test('RC-01c (C3, giro 2): Invio o spazio senza bersaglio premono il pulsante di serie o quello a fuoco; Invio sulla finestra stessa come il clic', () => {
  const it = finestra(...IT);
  for (const k of ['enter', 'space']) { const r = tasti(it, k); assert.equal(`${r.protezione}/${r.decisione}`, 'cancellazione/chiedi', k); }
  const w = it.elementi.find((e) => e.ruolo === 'finestra');
  assert.equal(tasti(it, 'enter', w).protezione, 'cancellazione', 'Invio col fuoco sulla finestra del dialogo');
  assert.equal(tasti(it, 'enter', bottone(it, 'Sì')).protezione, 'cancellazione', 'Invio sul pulsante «Sì» a fuoco');
});

test('RC-01d (C3, giro 2, verso contrario): il mnemonico di un\'uscita, un dialogo che non chiede, un dialogo non modale e il telefono di serie restano liberi', () => {
  const it = finestra(...IT);
  assert.equal(tasti(it, 'n').protezione ?? null, null, '«n» preme «No»');
  assert.equal(tasti(it, 'alt+n').protezione ?? null, null, '«alt+n» preme «No»');
  assert.equal(tasti(finestra('Conferma', 'Eliminare il file?', ['Elimina', 'Non eliminare']), 'n').protezione ?? null, null, '«n» preme «Non eliminare»');
  assert.equal(tasti(finestra('Conferma', 'Salvare le modifiche a prova.txt?', ['Sì', 'No']), 's').protezione ?? null, null, 'una domanda che non cancella');
  assert.equal(tasti(finestra('Conferma', 'Rimuovere il filtro?', ['Sì', 'No']), 's').protezione ?? null, null, 'decisione 204: nessuna cosa che si perde');
  const nonModale = { ...it, elementi: it.elementi.map((e) => (e.ruolo === 'finestra' ? { ...e, modale: false } : e)) };
  assert.equal(tasti(nonModale, 's').protezione ?? null, null, 'nessuna finestra modale');
  assert.equal(tasti(it, 's', null, POLITICHE.telefono).protezione ?? null, null, 'il telefono di serie non ha la regola (decisione 170)');
  // un mnemonico che nessun pulsante porta, o che porta anche una conferma, resta una cancellazione (il verso sicuro)
  assert.equal(tasti(it, 'x').protezione, 'cancellazione');
  assert.equal(tasti(finestra('Conferma', 'Eliminare il file?', ['Sì', 'Salta']), 's').protezione, 'cancellazione');
  assert.equal(tasti(finestra('Conferma', 'Eliminare il file?', ['Elimina', 'Esci']), 'e').protezione, 'cancellazione', '«e» può premere «Elimina»');
  // un tasto con un nome di più lettere non è un mnemonico (mutante K8 del giro 2)
  assert.equal(tasti(it, 'backspace').protezione ?? null, null, 'backspace non preme un pulsante');
});

test('RC-01b (ospite): il modello manda «s» senza riferimento nel dialogo che chiede: 1 carta come il clic, mai 0', async () => {
  const clic = await compito({ frase: NON_CHIESTA, dialogo: IT, mossa: (r) => ({ type: 'press', ref: r('Sì') }) });
  assert.equal(clic.carte, 1, 'riferimento: il clic su «Sì» fa 1 carta');
  const tasto = await compito({ frase: NON_CHIESTA, dialogo: IT, mossa: { type: 'keys', keys: 's' } });
  assert.equal(tasto.carte, 1, `il tasto «s» è partito senza carta: ${tasto.azioni.join(', ')}`);
});

// ======================= RC-02: un tasto senza bersaglio, approvato, non parte mai =======================
test('RC-02 (ciclo): «s» nel vero dialogo irreversibile fa UNA carta e dopo «Consenti» il tasto parte (oggi: carte ripetute, nessuna azione)', async () => {
  const r = await compito({ frase: NON_CHIESTA, dialogo: ['Elimina file', 'Rimuovere in modo definitivo il file?', ['Sì', 'No']], mossa: { type: 'keys', keys: 's' } });
  assert.deepEqual({ carte: r.carte, azioni: r.azioni }, { carte: 1, azioni: ['press_key:s'] });
});

test('RC-02b (ciclo, verso contrario): senza bersaglio il sì vale per QUEL dialogo; se a carta aperta la domanda cambia, il tasto non parte e si chiede di nuovo', async () => {
  const r = await compito({ frase: NON_CHIESTA, dialogo: ['Elimina file', 'Rimuovere in modo definitivo il file?', ['Sì', 'No']], mossa: { type: 'keys', keys: 's' },
    dopoLaCarta: (stato, n) => { if (n === 1) stato.tree_markdown = stato.tree_markdown.replace('Rimuovere in modo definitivo il file?', () => 'Rimuovere in modo definitivo la cartella «Foto»?'); } });
  assert.deepEqual({ carte: r.carte, azioni: r.azioni }, { carte: 2, azioni: ['press_key:s'] });
});

// ======================= RC-03: carte in più che la 195 non ha misurato (decisione 181) =======================
test('RC-03 (C3, decisione 181): domande che contengono una radice ma non chiedono di cancellare nulla non fanno carte', () => {
  const casi = [
    ['Do you want to scan and fix Removable Disk (E:)?', 'Scan and fix'],
    ['Get exclusive offers by email?', 'Yes'],
    ['Borrow this e-book for 14 days?', 'Borrow'],
    ['Use the eraser tool?', 'Yes'],
    // decisione 204 (owner 04/11 20:57): parola di cancellazione SENZA una cosa che si perde, o una cancellazione già fatta
    ['Rimuovere il filtro?', 'Sì'], ['Rimuovere dai preferiti?', 'Sì'], ['Il file è stato eliminato, vuoi annullare?', 'Sì'],
    ['Remove device safely?', 'Yes'], ['Scartare questa carta?', 'Sì'],
    // le radici col confine anche accanto a una cosa che si perde (mutanti V2, V3 del giro 2)
    ['Use the eraser on this file?', 'Yes'], ['Borrow this document for 14 days?', 'Borrow'],
  ];
  const carte = casi.filter(([t, p]) => [NORMALE, PIENO].some((pol) => premi(finestra('Conferma', t, [p, 'No']), p, pol).protezione != null)).map(([t]) => t);
  assert.deepEqual(carte, []);
  // il decimo: il pulsante «Non eliminare» sotto una vera domanda di cancellazione (anche «Don't delete», «Nicht löschen»)
  for (const [t, p] of [['Eliminare il file «a.txt»?', 'Non eliminare'], ['Delete this file?', 'Don\'t delete'], ['Datei löschen?', 'Nicht löschen'],
    ['Eliminare definitivamente il file?', 'Non eliminare']]) {
    assert.equal(premi(finestra('Conferma', t, ['Elimina', p]), p).protezione, null, `${p} sotto «${t}»`);
  }
});

test('RC-03b (decisione 204, verso contrario): le vere cancellazioni restano protette, con la cosa prima o dopo il verbo, nelle lingue di oggi', () => {
  const casi = [
    'Eliminare il file «a.txt»?', 'Sei sicuro di voler eliminare prova.txt?', 'Sei sicuro di volerlo eliminare?', 'Vuoi eliminarli?',
    'Rimuovere 3 elementi?', 'Eliminare la cronologia?', 'Cancellare tutti i messaggi?', 'Rimuovere l\'account?', 'Eliminare i dati di navigazione?',
    'Eliminare la cartella «Foto 2025»?', 'Delete this item?', 'Are you sure you want to delete it?', 'Remove 2 items?', 'Erase this disc?',
    'Discard changes?', 'Delete selected?', 'Möchten Sie diese Datei wirklich löschen?', 'Supprimer ce fichier ?', '¿Borrar el archivo?',
    'Excluir o arquivo?', 'Il file verrà eliminato, continuare?', 'Removing these files cannot be undone. Continue?',
  ];
  const mancati = casi.filter((t) => premi(finestra('Conferma', t, ['Sì', 'No']), 'Sì').protezione !== 'cancellazione');
  assert.deepEqual(mancati, []);
});

// ======================= RC-04: domande vere che la C3 non vede =======================
test('RC-04 (C3): un percorso lungo e un nome di file con «n. 3» restano domande di cancellazione', () => {
  const lungo = 'Eliminare il file «C:\\Users\\Mario\\Documents\\Progetti\\Cliente Rossi\\Contratti firmati 2026\\Allegati\\bozza-finale-rev-3-approvata.docx»?';
  const senzaVirgolette = `Eliminare il file C:\\${'Cartella\\'.repeat(22)}x.docx?`; // ~220 caratteri fra il verbo e il «?»
  for (const testo of [lungo, 'Eliminare «Verbale n. 3.docx»?', senzaVirgolette]) {
    const r = premi(finestra('Conferma', testo, ['Sì', 'No']), 'Sì');
    assert.equal(`${r.protezione}/${r.decisione}`, 'cancellazione/chiedi', testo);
  }
  // una domanda e una frase che cancella (nello stesso testo o in due testi del dialogo)
  for (const testi of [['Sei sicuro? Il file verrà eliminato.'], ['Are you sure? This will delete 3 files.'], ['Sei sicuro?', 'I 3 file verranno eliminati.'],
    // il participio dopo «to be» / «essere» è una cancellazione che sta per avvenire (mutante P3 del giro 2)
    ['These files are going to be deleted. Continue?'], ['I file stanno per essere eliminati. Continuare?']]) {
    const r = premi(finestra('Conferma', testi, ['Sì', 'No']), 'Sì');
    assert.equal(`${r.protezione}/${r.decisione}`, 'cancellazione/chiedi', testi.join(' | '));
  }
  // verso contrario: oltre il tetto il verbo è troppo lontano dal «?»; una frase che cancella senza domanda; una cancellazione già fatta
  const troppoLontano = `Eliminare il file C:\\${'Cartella\\'.repeat(40)}x.docx?`;
  for (const testi of [[troppoLontano], ['Il file verrà eliminato.'], ['Sei sicuro? Il file è stato eliminato.'], ['Continuare? I file eliminati restano nel cestino.']]) {
    assert.equal(premi(finestra('Conferma', testi, ['Sì', 'No']), 'Sì').protezione, null, testi.join(' | ').slice(0, 80));
  }
});

test('RC-06 (C3, verso contrario): «preliminare» non è «eliminare»; un nome con «!» seguito da lettera e un percorso di 74 caratteri restano domande', () => {
  const nulla = premi(finestra('Conferma', 'Rivedere la versione preliminare?', ['Sì', 'No']), 'Sì');
  assert.equal(nulla.protezione ?? null, null, 'una radice dentro un\'altra parola non conta');
  for (const testo of ['Eliminare «urgente!v2.txt»?', 'Eliminare il file «C:\Users\Mario\Documenti\relazione-trimestrale-finale-2026.docx»?']) {
    const r = premi(finestra('Conferma', testo, ['Sì', 'No']), 'Sì');
    assert.equal(`${r.protezione}/${r.decisione}`, 'cancellazione/chiedi', testo);
  }
});

// ======================= RC-07 (giro 2): il banco vero di Esplora risorse (shell32.dll.mui it-IT e en-US, letto il 04/11) =======================
test('RC-07 (C3 + decisione 204): le domande vere di Esplora risorse che cancellano fanno carta; quelle che spostano, ripristinano o uniscono no', () => {
  const cancellano = [
    'Eliminare il collegamento?', 'Eliminare i file temporanei non ancora masterizzati su disco?', 'Il Cestino in C: è danneggiato. Svuotare il Cestino di tale unità?',
    'Eliminare l\'icona Prova ?', 'Eliminare le icone?', 'Vuoi eliminare la versione precedente di Windows?',
    'Do you want to delete this shortcut?', 'Are you sure you want to delete temporary files that haven\'t been burned to disc?',
    'Are you sure you want to delete the Prova icon from your desktop?', 'Are you sure you want to delete these icons?',
    'Eliminare urgente!v2.txt?', // un «!» seguito da lettera resta dentro la frase anche senza virgolette
    // banco shell32 (id 16400 e 8968): le impostazioni di un programma tolto e il Cestino da svuotare, anche in inglese
    "Prova è stata rimossa. Eliminare le impostazioni personalizzate dell'applicazione?", 'The Recycle Bin on C: is corrupted. Do you want to empty the Recycle Bin for this drive?',
  ];
  const mancati = cancellano.filter((t) => premi(finestra('Conferma', t, ['Sì', 'No']), 'Sì').protezione !== 'cancellazione');
  assert.deepEqual(mancati, []);
  const libere = ['Spostare questo file nel Cestino?', 'Ripristinare tutti gli elementi dal Cestino?', 'Si desidera comunque unire la cartella creata con questa?',
    'Are you sure you want to move this folder to the Recycle Bin?', 'Are you sure you want to restore all the items from the Recycle Bin?',
    'Do you still want to merge the folder with this one?', 'The folder is empty. Do you want to add files?', 'Change file format?', 'Open the empty folder?'];
  const carte = libere.filter((t) => premi(finestra('Conferma', t, ['Sì', 'No']), 'Sì').protezione != null);
  assert.deepEqual(carte, []);
  // col TITOLO vero di Esplora risorse («Elimina file», «Delete File»): la domanda che nomina la sua cosa si giudica da sola (R2-04, G)
  for (const [titolo, t] of [['Elimina file', 'Spostare questo file nel Cestino?'], ['Delete File', 'Are you sure you want to move this file to the Recycle Bin?'],
    ['Elimina collegamento', 'Are you sure you want to move this shortcut to the Recycle Bin? Deleting this shortcut does not uninstall the program.']]) {
    assert.equal(premi(finestra(titolo, t, ['Sì', 'No']), 'Sì').protezione, null, `${titolo} | ${t}`);
  }
  // una domanda nuda sotto un titolo o una frase che cancella chiede (stringhe 9991 e 16980 di shell32, e il titolo di un'app)
  for (const [titolo, t] of [['Elimina file', 'Sei sicuro?'], ['Delete File', 'Are you sure?'],
    ['Conferma', 'Moving these items to the Recycle Bin will cause them to be permanently deleted. Are you sure you want to continue?'],
    ['Conferma', 'Spostare questi elementi nel Cestino significa eliminarli definitivamente. Continuare?'],
    ['Conferma', 'Deleting an online-only file permanently removes it from your PC without sending it to the Recycle Bin. Are you sure you want to continue?']]) {
    const r = premi(finestra(titolo, t, ['Sì', 'No']), 'Sì');
    assert.equal(`${r.protezione}/${r.decisione}`, 'cancellazione/chiedi', `${titolo} | ${t}`);
  }
});
