import test from 'node:test';
import assert from 'node:assert/strict';
import { valutaAzione, intenzioniDallaFrase, POLITICHE, PROVE_INTERNE } from '../src/computer-use/protezioni.mjs';
import { eseguiCompito } from '../src/computer-use/ciclo.mjs';

const PIENO = POLITICHE.pcAccessoPieno;
assert.ok(PIENO, "la politica pcAccessoPieno esiste");
const vuota = { elementi: [] };
const pulsante = (nome) => ({ ref: 'b', ruolo: 'pulsante', nome, visibile: true });
const voce = (nome) => ({ ref: 'v', ruolo: 'voce', nome, visibile: true });
const premi = (b, schermata = vuota) => valutaAzione({ azione: { tipo: 'premi' }, bersaglio: b, schermata, politica: PIENO, contesto: { testoDellaPersona: 'apri la chat' } });

test('MISTE-01: nomi misti fra parole diverse, o latino con CJK, non fermano', () => {
  for (const nome of ['Mario 李', 'Vai 日本', 'Tシャツ', 'Mario Иванов', 'Kim 김민준', 'Ελένη Rossi', 'CDショップ']) {
    const r = premi(voce(nome));
    assert.notEqual(r.motivo, 'non-valutabile', nome);
  }
});

test('MISTE-02: una parola che mescola latino e altra scrittura (non CJK) resta non valutabile', () => {
  for (const nome of ['Senդ', 'Sendж', 'Iнvia ora', 'Confermaξ']) {
    assert.equal(premi(pulsante(nome)).motivo, 'non-valutabile', nome);
  }
});

test('MISTE-03: una finestra intitolata con un nome misto non è una cassa', () => {
  const schermata = { titolo: 'Chat con Mario 李', elementi: [{ ref: 'c', ruolo: 'pulsante', nome: 'Continua', visibile: true }] };
  const r = premi(schermata.elementi[0], schermata);
  assert.notEqual(r.protezione, 'pagamento');
});

test('MISTE-04: «Pаga ora» con la «а» cirillica resta un pagamento (la mappa la riporta al latino), non un non-valutabile', () => {
  const r = premi(pulsante('P\u0430ga ora'));
  assert.equal(r.protezione, 'pagamento');
});

test('MISTE-05: la parola camuffata conta anche accanto a una parola straniera intera; una finestra camuffata resta una cassa', () => {
  // «Pаga» (а cirillica) accanto a «Иванов»: il nome intero è misto, ma nessuna parola lo è prima E dopo la mappa ⇒ regole normali
  assert.equal(premi(pulsante('P\u0430ga Иванов')).protezione, 'pagamento');
  // una finestra col titolo camuffato: ogni conferma dentro è un pagamento (fallisce chiuso), Mario 李 invece no
  const cassa = (titolo) => ({ elementi: [{ ref: 'w', ruolo: 'finestra', nome: titolo, visibile: true }, { ref: 'c', ruolo: 'pulsante', nome: 'Continua', visibile: true, finestra: 'w' }] });
  const dentro = (s) => premi(s.elementi[1], s);
  assert.equal(dentro(cassa('Ordineդ')).protezione, 'pagamento');
  assert.notEqual(dentro(cassa('Chat con Mario 李')).protezione, 'pagamento');
});

test('MISTE-06 (Mobile 04/11): latino attaccato a CJK non apre una via; i nomi veri dei contatti e delle chat passano', () => {
  const politiche = [PIENO, POLITICHE.telefono].filter(Boolean);
  assert.ok(POLITICHE.telefono, 'la politica del telefono esiste');
  for (const politica of politiche) {
    for (const nome of ['Paga李', 'Send信', 'Invia送', 'Elimina definitivamente削除', 'Pay付款', '支払うPay']) {
      const r = valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante(nome), schermata: vuota, politica, contesto: { testoDellaPersona: 'apri la chat' } });
      assert.notEqual(r.decisione, 'procedi', `${politica.nome}: ${nome}`);
    }
    for (const nome of ['Mario 李', 'Ahmed أحمد', 'Müller Zoë', 'Tシャツ', 'Nonna 🍕', 'Luca (lavoro)', '李明 · 2 messaggi non letti']) {
      const r = valutaAzione({ azione: { tipo: 'premi' }, bersaglio: voce(nome), schermata: vuota, politica, contesto: { testoDellaPersona: 'apri la chat' } });
      assert.equal(r.decisione, 'procedi', `${politica.nome}: ${nome} (${r.motivo})`);
    }
  }
});

const conPolitica = (politica, nome, b = pulsante) => valutaAzione({ azione: { tipo: 'premi' }, bersaglio: b(nome), schermata: vuota, politica, contesto: { testoDellaPersona: 'apri la chat' } });

test('MISTE-07 (revisione Desktop 04/11, D1): un omoglifo CJK dentro una parola latina non apre una via (TR39 confusables 2026-08-06)', () => {
  for (const politica of [PIENO, POLITICHE.telefono]) {
    for (const nome of ['Place ㅇrder', 'PAㄚ', 'PA丫 NOW', 'DELE丅E PERMANENTLY', 'Cㅇnfirm ㅇrder', 'De丨ete permanently', 'Eㅣimina definitivamente', 'Place 〇rder', 'DELEㄒE PERMANENTLY', 'Deㄧete permanently']) {
      const r = conPolitica(politica, nome);
      assert.notEqual(r.decisione, 'procedi', `${politica.nome}: ${nome} ${JSON.stringify(r)}`);
      // la mappa lo riporta al latino: lo legge la sua regola, non la carta generica del panino (decisione 146)
      assert.notEqual(r.motivo, 'non-valutabile', `${politica.nome}: ${nome} ${JSON.stringify(r)}`);
    }
  }
});

test('MISTE-08: latino e coreano nella stessa parola sono un nome vero e passano; attaccati a una parola delle regole no', () => {
  for (const politica of [PIENO, POLITICHE.telefono]) {
    for (const nome of ['LG電子', 'LG전자', 'SK텔레콤', 'K팝 playlist', 'Lezioneㄅㄆㄇ']) {
      const r = conPolitica(politica, nome, voce);
      assert.equal(r.decisione, 'procedi', `${politica.nome}: ${nome} (${r.motivo})`);
    }
    for (const nome of ['Paga김', '결제Pay', 'Send메시지']) {
      assert.notEqual(conPolitica(politica, nome).decisione, 'procedi', `${politica.nome}: ${nome}`);
    }
  }
});

test('MISTE-09: il valore scelto si rilegge parola per parola: «Senդ» dentro un «scegli» resta non valutabile', () => {
  const scegli = (valore) => valutaAzione({ azione: { tipo: 'scegli', valore }, bersaglio: voce('Paese'), schermata: vuota, politica: PIENO, contesto: { testoDellaPersona: 'apri la chat' } });
  assert.equal(scegli('Senդ').motivo, 'non-valutabile');
  assert.equal(scegli(['Con', 'fermaξ']).motivo, 'non-valutabile');
  assert.notEqual(scegli('Mario 李').motivo, 'non-valutabile');
});

test('MISTE-10: il bopomofo attaccato al latino si separa come gli altri CJK («Payㄅ» resta un pagamento)', () => {
  for (const politica of [PIENO, POLITICHE.telefono]) {
    for (const nome of ['Payㄅ', 'ㄅPaga ora']) {
      assert.notEqual(conPolitica(politica, nome).decisione, 'procedi', `${politica.nome}: ${nome}`);
    }
  }
});

test('MISTE-11: «ㆀ» (oo a vista) dentro «cookies» resta un consenso ai cookie', () => {
  for (const politica of [PIENO, POLITICHE.telefono]) {
    const r = conPolitica(politica, 'Accept all cㆀkies');
    assert.equal(r.protezione, 'consenso', `${politica.nome}: ${JSON.stringify(r)}`);
  }
});

test('MISTE-12 (owner 04/11, decisione 146, «regola del panino»): una lettera CJK fra due lettere latine della stessa parola è non valutabile', () => {
  for (const politica of [PIENO, POLITICHE.telefono]) {
    for (const nome of ['Pa李ga ora', 'In信via', 'Eli削mina definitivamente', 'Se信nd', 'Pa김ga', 'Seㄅnd', 'Con確ferma ordine']) {
      const r = conPolitica(politica, nome);
      assert.equal(r.motivo, 'non-valutabile', `${politica.nome}: ${nome} ${JSON.stringify(r)}`);
      assert.notEqual(r.decisione, 'procedi', `${politica.nome}: ${nome}`);
    }
    // la stessa regola sul valore di un «scegli»
    const r = valutaAzione({ azione: { tipo: 'scegli', valore: 'Pa李ga' }, bersaglio: voce('Metodo'), schermata: vuota, politica, contesto: { testoDellaPersona: 'apri la chat' } });
    assert.equal(r.motivo, 'non-valutabile', `${politica.nome}: scegli`);
  }
});

test('MISTE-13 (decisione 146): i nomi veri con latino e CJK non chiedono carte; un omoglifo mappato resta alle regole', () => {
  for (const politica of [PIENO, POLITICHE.telefono]) {
    for (const nome of ['Tシャツ', 'LG전자', 'LG電子', 'CDショップ', 'Mario 李', '李明 · 2 messaggi non letti', 'Kim 김민준', 'iPhone 15 京东', 'Lezioneㄅㄆㄇ', 'SK텔레콤']) {
      const r = conPolitica(politica, nome, voce);
      assert.equal(r.decisione, 'procedi', `${politica.nome}: ${nome} (${r.motivo})`);
    }
    // «De丨ete» (丨 è una «l» a vista) non è un panino: la mappa lo riporta a «delete» e lo legge la regola, non la carta generica
    for (const nome of ['De丨ete permanently', 'De丨ete permanently 李']) {
      const r = conPolitica(politica, nome);
      assert.notEqual(r.motivo, 'non-valutabile', `${politica.nome}: ${nome}`);
      assert.notEqual(r.decisione, 'procedi', `${politica.nome}: ${nome}`);
    }
  }
});

// ---- revisione S del Desktop (04/11): RIREVISIONE-SCRITTURE-MISTE-2026-11-04.md, prove S-ROSSA-1..5 e i sette testimoni dei mutanti vivi ----
const DUE = [PIENO, POLITICHE.telefono];
const scrivi = (politica, campo, testo) => valutaAzione({ azione: { tipo: 'scrivi', testo }, bersaglio: campo, schermata: { elementi: [campo] }, politica, contesto: {} });
const cassaCon = (schermata) => premi(schermata.elementi.find((e) => e.nome === 'Continua'), schermata);
const continua = { ref: 'c', ruolo: 'pulsante', nome: 'Continua', visibile: true };

test('MISTE-14 (S-1, decisione 146 alla lettera): un omoglifo CJK INSERITO fra due lettere latine non apre una via', () => {
  // la mappa dei confondibili rende «丨» una «l»: «Pa丨ga» diventava «palga», nessuna regola, nessun panino. Il panino si guarda prima.
  for (const politica of DUE) {
    for (const nome of ['Pa丨ga ora', 'Se丫nd', 'Inㅣvia', 'Se丅nd', 'Eli丨mina definitivamente', 'Paㄧga ora', 'Seᄋnd']) {
      assert.notEqual(conPolitica(politica, nome).decisione, 'procedi', `${politica.nome}: ${nome}`);
    }
  }
});

test('MISTE-15 (S-1): una cifra o un segno ACCANTO al CJK non spezzano il panino', () => {
  for (const politica of DUE) {
    for (const nome of ['Pa李2ga ora', 'Pa2李ga ora', 'Pa-李-ga ora', "In李'via", 'Pa李.ga ora']) {
      assert.notEqual(conPolitica(politica, nome).decisione, 'procedi', `${politica.nome}: ${nome}`);
    }
  }
});

test('MISTE-16 (S-3): i segni invisibili di formato (tag U+E00xx, U+1D173, U+1BCA0) non nascondono la parola', () => {
  for (const politica of DUE) {
    for (const nome of ['Pa\u{E0041}ga ora', 'Pa\u{E0020}李ga ora', 'Pa\u{1D173}ga ora', 'Pa\u{1BCA0}ga ora', 'Eli\u{E0020}mina definitivamente']) {
      assert.notEqual(conPolitica(politica, nome).decisione, 'procedi', `${politica.nome}: ${JSON.stringify(nome)}`);
    }
  }
});

test('MISTE-17 (S-4): la «İ» turca non spezza ELIMINA, INVIA, SUBMIT, né il panino; «PİN» resta una credenziale', () => {
  for (const politica of DUE) {
    for (const nome of ['ELİMİNA DEFİNİTİVAMENTE', 'İNVİA', 'SUBMİT', 'CONFİRM ORDER', 'ELİ削MINA DEFINITIVAMENTE']) {
      assert.notEqual(conPolitica(politica, nome).decisione, 'procedi', `${politica.nome}: ${nome}`);
    }
  }
  assert.equal(scrivi(PIENO, { ref: 'f', ruolo: 'campo', nome: 'PİN', visibile: true }, '4821').protezione, 'credenziale');
});

test('MISTE-18 (S-2, decisione 146 «i nomi veri non cambiano»): latino-CJK-latino nei nomi veri non ferma e non fa una cassa', () => {
  for (const politica of DUE) {
    for (const nome of ['iPhoneとiPad', 'B站UP主', 'PC版Minecraft', 'YouTubeでMusicを聴く', 'Mac用App', 'LINEでSNS']) {
      assert.equal(conPolitica(politica, nome, voce).decisione, 'procedi', `${politica.nome}: ${nome}`);
    }
  }
  const finestra = (titolo) => ({ titolo, elementi: [{ ref: 'w', ruolo: 'finestra', nome: titolo, visibile: true }, { ...continua, finestra: 'w' }] });
  assert.notEqual(cassaCon(finestra('iPhoneとiPadの設定')).protezione, 'pagamento');
  assert.notEqual(cassaCon({ elementi: [{ ref: 'f', ruolo: 'campo', nome: 'ZIPコードまたはPostal code', visibile: true }, continua] }).protezione, 'pagamento');
  // e il panino vero resta: «Car李d number» fa ancora una cassa
  assert.equal(cassaCon({ elementi: [{ ref: 'f', ruolo: 'campo', nome: 'Car李d number', visibile: true }, continua] }).protezione, 'pagamento');
});

test('MISTE-19 (S-6): i sette casi testimone dei mutanti vivi', () => {
  for (const politica of DUE) {
    // più CJK in mezzo, kana in mezzo, invisibile dentro il panino, forma di compatibilità che solo NFKC rende CJK
    for (const nome of ['Pa李李ga ora', 'Paあga ora', 'Pa​李ga ora', 'Pa㊀ga ora']) {
      assert.notEqual(conPolitica(politica, nome).decisione, 'procedi', `${politica.nome}: ${JSON.stringify(nome)}`);
    }
  }
  // il panino nel titolo della schermata e nel nome di un campo della cassa
  assert.equal(cassaCon({ titolo: 'Che李ckout', elementi: [continua] }).protezione, 'pagamento');
  assert.equal(cassaCon({ elementi: [{ ref: 'f', ruolo: 'campo', nome: 'Car李d number', visibile: true }, continua] }).protezione, 'pagamento');
  // nome e valore di un «scegli» restano due parole: «Pa» + «李ga» non è un panino
  const r = valutaAzione({ azione: { tipo: 'scegli', valore: '李ga' }, bersaglio: voce('Pa'), schermata: vuota, politica: PIENO, contesto: { testoDellaPersona: 'apri la chat' } });
  assert.notEqual(r.motivo, 'non-valutabile');
});

test('MISTE-20 (S-8, testimoni dei mutanti vivi): accento dentro il panino e titolo di cassa camuffato', () => {
  // «Pá李ga»: tolto il CJK resta «pága», che nessuna regola legge; la seconda lettura senza accenti dà «paga»
  for (const politica of DUE) {
    for (const nome of ['Pá李ga ora', 'Elí李mina definitivamente']) {
      assert.notEqual(conPolitica(politica, nome).decisione, 'procedi', `${politica.nome}: ${nome}`);
    }
  }
  // una finestra col titolo della cassa spezzato dal CJK resta una cassa (paginaDiCassa legge anche TITOLO_CASSA; nomeDelicato, morto, tolto nella revisione R)
  const finestra = (titolo) => ({ elementi: [{ ref: 'w', ruolo: 'finestra', nome: titolo, visibile: true }, { ...continua, finestra: 'w' }] });
  assert.equal(cassaCon(finestra('Riepilogo dell\'or李dine')).protezione, 'pagamento');
});

// ── Revisione avversaria del Desktop 04/11 sulle scritture miste (V2-M1..M4) ──────────────────────────────────────────────
const premiCon = (nome, politica, testo = 'apri la pagina') => valutaAzione({ azione: { tipo: 'premi' }, bersaglio: pulsante(nome), schermata: vuota,
  politica, contesto: { testoDellaPersona: testo, richiesta: intenzioniDallaFrase(testo) } });

test('MISTE-21 (V2-M1, ALTA): una regola forte ALTROVE nel nome non spegne il panino («Invia e Pa李ga ora» con la persona che chiede di inviare)', () => {
  for (const politica of [POLITICHE.pcAccessoPieno, POLITICHE.telefono]) {
    for (const [nome, frase] of [['Invia e Pa李ga ora', 'invia la mail a Mario'], ['Send & Pa李y now', 'send the email to Mario'], ['Invia · Pa李ga 49 €', 'invia la mail a Mario']]) {
      const r = premiCon(nome, politica, frase);
      assert.notEqual(r.decisione, 'procedi', `${politica.nome}: ${nome} → ${r.decisione}/${r.protezione}`);
    }
  }
  // il controllo senza CJK: la regola del pagamento vince già sul nome pulito
  assert.equal(premiCon('Invia e Paga ora', POLITICHE.pcAccessoPieno, 'invia la mail a Mario').protezione, 'pagamento');
  // e il verso opposto: «Cㅇnfirm ㅇrder» resta della sua regola, il panino non la scavalca
  assert.notEqual(premiCon('Cㅇnfirm ㅇrder', POLITICHE.pcAccessoPieno).motivo, 'non-valutabile');
});

test('MISTE-22 (V2-M2, ReDoS): un nome lungo costruito con 、 o 〇 non blocca la valutazione (lineare)', () => {
  for (const segno of ['、', '〇']) {
    const nome = `a${segno.repeat(8000)} Pa李ga`;
    const t0 = performance.now();
    const r = premiCon(nome, POLITICHE.pcAccessoPieno);
    const ms = performance.now() - t0;
    assert.notEqual(r.decisione, 'procedi');
    assert.ok(ms < 250, `${segno}: ${ms.toFixed(0)} ms`);
  }
});

test('MISTE-23 (V2-M3): un carattere di controllo invisibile (C0/C1) accanto al CJK non spezza il panino', () => {
  for (const politica of [POLITICHE.pcAccessoPieno, POLITICHE.telefono]) {
    for (const nome of ['Pa\u0090李ga ora', 'Pa李\u0001ga ora', 'Se\u0081李nd']) {
      assert.notEqual(premiCon(nome, politica).decisione, 'procedi', `${politica.nome}: ${JSON.stringify(nome)}`);
    }
  }
});

test('MISTE-24 (V2-M4, testimone del mutante vivo V-M1): un segno di formato che NON è Default_Ignorable (U+FFF9, U+13430) non nasconde la parola', () => {
  for (const nome of ['Pa\uFFF9ga ora', 'Pa\u{13430}ga ora']) assert.equal(premiCon(nome, POLITICHE.pcAccessoPieno).protezione, 'pagamento', JSON.stringify(nome));
});

test('MISTE-25 (V2-2): spremi, lineare, dà lo stesso testo del riferimento lento replace(PANINO_G) su 20000 stringhe a caso', () => {
  const { spremi, PANINO_G, basePiana, mappaNonCjk } = PROVE_INTERNE;
  const alfabeto = ['a', 'P', 'g', 'é', 'а', 'α', '李', 'ケ', 'ー', 'と', '、', '〇', '々', 'ㅣ', '丨', 'ᄋ', '가', '㊀', '1', '２', '-', '.', "'", '$', '€', ' ', '​', '́', '𠀀', '😀', '\uD800', 'ª', 'ʰ', '\u0090'];
  let seme = 4112026;
  const caso = () => { seme = (seme * 1103515245 + 12345) % 2147483648; return seme; };
  let diversi = 0; let primo = null;
  for (let k = 0; k < 20000; k++) {
    const lunghezza = 1 + (caso() % 14);
    let s = '';
    for (let j = 0; j < lunghezza; j++) s += alfabeto[caso() % alfabeto.length];
    const pre = mappaNonCjk(basePiana(s));
    if (spremi(pre) !== pre.replace(PANINO_G, '')) { diversi++; primo ??= s; }
  }
  assert.equal(diversi, 0, `primo diverso: ${JSON.stringify(primo)}`);
  // il verso che deve cambiare qualcosa: la prova non è vuota
  assert.equal(spremi('Pa李ga'), 'Paga');
  assert.equal(spremi('Tシャツ'), 'Tシャツ');
});

// ── S-5 (decisione 146, owner 04/11): sul PC le scritture miste chiedono invece di fermare ──────────────────────────────
// Carta «Non riesco a leggere bene questo pulsante: lo premo?»; il sì copre solo quel pulsante; due «no» o nessuna risposta
// fermano il compito. Il telefono resta a 'ferma' fino alla cura SIC-01 del Mobile (poi S5-6).
const S5_NOME_1 = 'Send\u0436'; // «Sendж»: la ж cirillica in coda
const S5_NOME_2 = 'I\u043Dvia ora'; // «Iнvia ora»: la н cirillica al secondo posto

test('S5-1: pcAccessoPieno, scritture miste ⇒ chiedi con testo e lettere strane; il resto del non-valutabile resta ferma', () => {
  const r = conPolitica(PIENO, S5_NOME_1);
  assert.equal(r.decisione, 'chiedi');
  assert.equal(r.motivo, 'non-valutabile');
  assert.equal(r.prova, 'scritture-miste');
  assert.equal(r.testo, S5_NOME_1);
  assert.deepEqual(r.strane, [4]);
  const r2 = conPolitica(PIENO, S5_NOME_2);
  assert.equal(r2.decisione, 'chiedi');
  assert.deepEqual(r2.strane, [1]);
  // il testo resta corto: al massimo 80 caratteri
  const lungo = conPolitica(PIENO, `${S5_NOME_1} ${'a'.repeat(200)}`);
  assert.ok(typeof lungo.testo === 'string' && lungo.testo.length <= 80, 'testo tagliato a 80');
  // le altre prove non valutabili restano 'ferma' sul PC pieno
  const fuori = valutaAzione({ azione: { tipo: 'vola' }, bersaglio: pulsante('Ok'), schermata: vuota, politica: PIENO, contesto: {} });
  assert.equal(fuori.decisione, 'ferma');
  assert.equal(fuori.prova, 'tipo-fuori-vocabolario');
  const mancante = valutaAzione({ azione: null, schermata: vuota, politica: PIENO, contesto: {} });
  assert.equal(mancante.decisione, 'ferma');
  // la tabella è congelata e la difesa vale anche lì: mai procedi, un valore fuori elenco ferma
  assert.ok(Object.isFrozen(PIENO.nonValutabilePer), 'nonValutabilePer congelata');
  assert.equal(PIENO.nonValutabilePer['scritture-miste'], 'chiedi');
  for (const valore of ['procedi', 'boh', undefined]) {
    const politica = { ...PIENO, nonValutabilePer: Object.freeze({ 'scritture-miste': valore }) };
    assert.equal(conPolitica(politica, S5_NOME_1).decisione, 'ferma', `nonValutabilePer=${valore}`);
  }
});

test('S5-2: pcConsentiSempre, scritture miste ⇒ chiedi', () => {
  const r = conPolitica(POLITICHE.pcConsentiSempre, S5_NOME_1);
  assert.equal(r.decisione, 'chiedi');
  assert.equal(r.prova, 'scritture-miste');
  assert.equal(r.testo, S5_NOME_1);
});

test('S5-3 (guardia): il telefono resta a ferma sulle scritture miste', () => {
  const r = conPolitica(POLITICHE.telefono, S5_NOME_1);
  assert.equal(r.decisione, 'ferma');
  assert.equal(r.motivo, 'non-valutabile');
  assert.equal(r.prova, 'scritture-miste');
  assert.equal(POLITICHE.telefono.nonValutabilePer?.['scritture-miste'], undefined);
});

function s5Porte({ risposte = [], chiediPersona = () => 'si', titolo } = {}) {
  const m1 = { ref: 'm1', ruolo: 'pulsante', nome: S5_NOME_1, visibile: true };
  const m2 = { ref: 'm2', ruolo: 'pulsante', nome: S5_NOME_2, visibile: true };
  let k = 0; let t = 1000;
  const eseguite = []; const domande = [];
  return { eseguite, domande, porte: {
    guarda: async () => ({ frenoArmato: true, elementi: [m1, m2], origine: 'https://example.test', ...(titolo ? { titolo } : {}) }),
    chiedi: async () => (k < risposte.length ? risposte[k++] : { fine: { riuscito: true } }),
    agisci: async (azione, bersaglio) => { eseguite.push(bersaglio?.nome ?? null); return { esito: 'confermata' }; },
    bersaglio: (azione, s) => s.elementi.find((e) => e.ref === azione.ref) ?? null,
    chiediPersona: (q, segnale) => { domande.push(q); return chiediPersona(q, segnale); },
    emetti: () => {},
    adesso: () => (t += 10),
  } };
}
const premiRef = (ref) => ({ azioni: [{ tipo: 'premi', ref }] });

test('S5-4 (ciclo): ogni pulsante a scritture miste ha la sua carta; il sì copre solo quel pulsante', async () => {
  const p = s5Porte({ risposte: [premiRef('m1'), premiRef('m2')] });
  const fine = await eseguiCompito({ testoDellaPersona: 'apri la chat', politica: PIENO, porte: p.porte });
  const carte = p.domande.filter((q) => q.tipo === 'scritture-miste');
  assert.equal(carte.length, 2, `due carte, una per pulsante: ${JSON.stringify(p.domande)}`);
  assert.equal(carte[0].motivo, 'conferma');
  assert.equal(carte[0].testo, S5_NOME_1);
  assert.deepEqual(carte[0].strane, [4]);
  assert.equal(carte[1].testo, S5_NOME_2);
  assert.deepEqual(p.eseguite, [S5_NOME_1, S5_NOME_2]);
  assert.equal(fine.esito, 'riuscito');
});

test('S5-5 (ciclo): due «no» fermano il compito; nessuna risposta lo ferma', async () => {
  const p = s5Porte({ risposte: [premiRef('m1'), premiRef('m1'), premiRef('m1')], chiediPersona: () => 'no' });
  const fine = await eseguiCompito({ testoDellaPersona: 'apri la chat', politica: PIENO, porte: p.porte });
  assert.equal(fine.esito, 'fermato');
  assert.equal(fine.motivo, 'rifiutata-dalla-persona');
  assert.equal(p.eseguite.length, 0);
  assert.equal(p.domande.filter((q) => q.tipo === 'scritture-miste').length, 2);

  const q = s5Porte({ risposte: [premiRef('m1')], chiediPersona: () => new Promise(() => {}) });
  const fine2 = await eseguiCompito({ testoDellaPersona: 'apri la chat', politica: PIENO, porte: q.porte, limiti: { msAttesaPermesso: 20, msAnnullamento: 10 } });
  assert.equal(fine2.esito, 'fermato');
  assert.equal(fine2.motivo, 'nessuna-risposta');
  assert.equal(q.eseguite.length, 0);
});

test('C5 (revisione cloud PR19): con pcNormale il sì a un\'azione non valutabile non copre la successiva sulla stessa pagina', async () => {
  // prima della cura il sì apriva un'operazione con protezione null e motivo non-valutabile: null === null copriva ogni altro non
  // valutabile della pagina (misurato sul codice di prima: una carta sola per due combinazioni malformate, tutte e due eseguite)
  const c1 = { ref: 'c1', ruolo: 'campo', nome: 'Messaggio', visibile: true };
  const az = { tipo: 'tasti', combinazione: '' };
  const risposte = [{ azioni: [az] }, { azioni: [az] }];
  let k = 0; let t = 1000; const domande = []; const eseguite = [];
  const fine = await eseguiCompito({ testoDellaPersona: 'scrivi un messaggio', politica: POLITICHE.pcNormale, porte: {
    guarda: async () => ({ frenoArmato: true, elementi: [c1], origine: 'https://example.test', titolo: 'Chat - Example' }),
    chiedi: async () => (k < risposte.length ? risposte[k++] : { fine: { riuscito: true } }),
    agisci: async (a) => { eseguite.push(a.tipo); return { esito: 'confermata' }; },
    bersaglio: (_a, s) => s.elementi[0],
    chiediPersona: (q) => { domande.push(q); return 'si'; },
    emetti: () => {},
    adesso: () => (t += 10),
  } });
  const carte = domande.filter((q) => q.motivo === 'conferma' && q.prova === 'combinazione-malformata');
  assert.equal(carte.length, 2, `una carta per azione: ${JSON.stringify(domande)}`);
  assert.equal(eseguite.length, 2);
  assert.equal(fine.esito, 'riuscito');
});

test('S5-6 (ciclo): due pulsanti a scritture miste nello stesso lotto non entrano nella domanda unica del gruppo', async () => {
  const p = s5Porte({ risposte: [{ azioni: [{ tipo: 'premi', ref: 'm1' }, { tipo: 'premi', ref: 'm2' }] }] });
  const fine = await eseguiCompito({ testoDellaPersona: 'apri la chat', politica: PIENO, porte: p.porte });
  assert.equal(p.domande.filter((q) => q.motivo === 'conferme').length, 0, `niente domanda unica: ${JSON.stringify(p.domande)}`);
  assert.equal(p.domande.filter((q) => q.tipo === 'scritture-miste').length, 2);
  assert.deepEqual(p.eseguite, [S5_NOME_1, S5_NOME_2]);
  assert.equal(fine.esito, 'riuscito');
});

test('S5-7 (ciclo): se dopo il sì il pulsante dice altro, non si preme', async () => {
  const p = s5Porte({ risposte: [premiRef('m1')] });
  const guardaVera = p.porte.guarda; let giri = 0;
  // il primo sguardo mostra il nome della carta; dal secondo (la rilettura dopo il sì) lo stesso pulsante ha un'altra lettera strana
  p.porte.guarda = async () => {
    const s = await guardaVera(); giri += 1;
    if (giri >= 2) s.elementi = s.elementi.map((e) => (e.ref === 'm1' ? { ...e, nome: 'Sendд' } : e));
    return s;
  };
  await eseguiCompito({ testoDellaPersona: 'apri la chat', politica: PIENO, porte: p.porte });
  assert.equal(p.eseguite.includes(S5_NOME_1), false, 'il sì valeva per il testo mostrato nella carta');
  assert.equal(p.eseguite.includes('Sendд'), false);
});

test('S5-8: il testo della carta si taglia a 80 senza spezzare una coppia surrogata, e segna ogni lettera strana', () => {
  const lungo = 'Sendж' + 'a'.repeat(74) + '\u{1F600}' + 'b'.repeat(10); // la faccina occupa gli indici 79 e 80
  const r = conPolitica(PIENO, lungo);
  assert.equal(r.prova, 'scritture-miste');
  assert.equal(r.testo, lungo.slice(0, 79), 'la coppia a cavallo del taglio resta fuori intera');
  assert.deepEqual(r.strane, [4]);
  const due = conPolitica(PIENO, 'Pa李gа');
  assert.deepEqual(due.strane, [2, 4], 'il carattere CJK e la a cirillica');
});

// fusione guardia A + S-5 (04/11): sul sito in guardia la carta del pulsante illeggibile porta anche la riga «sito sensibile»,
// come la carta di una protezione: una domanda sola. Il «no» non segna il sì della guardia
function s5Guardia(risposta) {
  const m1 = { ref: 'm1', ruolo: 'pulsante', nome: S5_NOME_1, visibile: true };
  let k = 0; let t = 1000; const eseguite = []; const domande = []; const risposte = [premiRef('m1')];
  const porte = {
    guarda: async () => ({ frenoArmato: true, elementi: [m1], origine: 'https://www.unicredit.it' }),
    chiedi: async () => (k < risposte.length ? risposte[k++] : { fine: { riuscito: true } }),
    agisci: async (azione, bersaglio) => { eseguite.push(bersaglio?.nome ?? null); return { esito: 'confermata' }; },
    bersaglio: (azione, s) => s.elementi.find((e) => e.ref === azione.ref) ?? null,
    chiediPersona: (q) => { domande.push(q); return risposta; },
    emetti: () => {},
    adesso: () => (t += 10),
  };
  return { porte, eseguite, domande };
}

test('S5-9 (guardia A + S-5): sul sito in guardia la carta del pulsante illeggibile porta la riga della guardia, una domanda sola', async () => {
  const p = s5Guardia('si');
  const fine = await eseguiCompito({ testoDellaPersona: 'apri la chat', politica: PIENO, porte: p.porte, guardia: { accesa: true } });
  assert.equal(p.domande.length, 1, `una carta sola: ${JSON.stringify(p.domande)}`);
  assert.equal(p.domande[0].tipo, 'scritture-miste');
  assert.deepEqual(p.domande[0].guardia, { sito: 'unicredit.it', perche: 'ingresso', rinnovo: 'ogni-5-minuti-di-azioni' });
  assert.deepEqual(p.eseguite, [S5_NOME_1]);
  assert.equal(fine.esito, 'riuscito');
});

test('S5-9b (rovescio): col «no» il pulsante non si preme e non parte una seconda carta della guardia', async () => {
  const p = s5Guardia('no');
  await eseguiCompito({ testoDellaPersona: 'apri la chat', politica: PIENO, porte: p.porte, guardia: { accesa: true } });
  assert.deepEqual(p.eseguite, []);
  assert.equal(p.domande.filter((q) => q.tipo === 'guardia').length, 0, JSON.stringify(p.domande));
  assert.ok(p.domande.every((q) => q.tipo === 'scritture-miste' && q.guardia?.sito === 'unicredit.it'));
});

test('S5-9c (guardia spenta): la carta del pulsante illeggibile non porta la riga della guardia', async () => {
  const p = s5Guardia('si');
  await eseguiCompito({ testoDellaPersona: 'apri la chat', politica: PIENO, porte: p.porte });
  assert.equal(p.domande.length, 1);
  assert.equal(p.domande[0].guardia, undefined);
});
