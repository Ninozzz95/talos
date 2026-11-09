/*
 * FE-016, 057, 063, 064: gli schermi del computer use sul PC, con dati di prova. NON montati: nessuno emette ancora gli eventi, e il legame col guscio è del Desktop
 * (via libera di Computer use, 03/11). Campi e risposte sono quelli di `harness-ui/src/computer-use/ciclo.mjs` sul ramo `feat/computer-use-protezioni`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento, clic } from './aiuto-dom-blocchi.mjs';
import { fraseDiFine, frasePausa, nomeProtezione, paroleDellaFonte } from '../../src/components/computer-use/parole.js';
import { creaRigaPosso, leggiTetto } from '../../src/components/computer-use/riga-posso.js';
import { cartaDelCompito, cartaConferme, cartaCassa, cartaMano, cartaFine, testoTotale } from '../../src/components/computer-use/carte.js';
import { creaPillola, statoPillola, STATO_PILLOLA_INIZIALE } from '../../src/components/computer-use/pillola.js';

const voce = (nodo, testo) => nodo.querySelectorAll('button').find((b) => b.textContent.startsWith(testo));
const scrivi = (input, v) => { input.value = v; input.dispatchEvent(new Event('input')); };

test('CU-01 ogni codice ha la sua frase al passato; un codice nuovo non arriva mai a schermo', () => {
  assert.equal(fraseDiFine({ esito: 'completato', motivo: 'completato' }), 'Fatto.');
  assert.equal(fraseDiFine({ motivo: 'tetto-passi', n: 12 }), 'Ho fatto 12 passi senza finire, quindi mi sono fermato.');
  assert.equal(fraseDiFine({ motivo: 'mano-della-persona', dispositivo: 'tastiera' }), 'Hai usato la tastiera, quindi mi sono fermato. Il computer è tuo.');
  assert.match(fraseDiFine({ motivo: 'pagamento-non-completato' }), /la conferma è ancora a schermo e io non l'ho premuta/u);
  assert.match(fraseDiFine({ motivo: 'codice-sicurezza' }), /il codice di sicurezza della carta lo scrivi solo tu/u);
  for (const motivo of ['un-codice-futuro', 'freno-non-armato', '', undefined]) {
    const f = fraseDiFine({ motivo });
    assert.ok(f.length > 0);
    assert.doesNotMatch(f, /freno|codice-futuro|undefined/u, String(motivo));
  }
});

test('CU-02 mai «aiutante nativo» a schermo: una frase per assenza, e senza dato nessun rimedio promesso', () => {
  assert.match(fraseDiFine({ motivo: 'aiutante-assente', assenza: 'binario' }), /Reinstallare TALOS/u);
  assert.match(fraseDiFine({ motivo: 'aiutante-assente', assenza: 'non-windows' }), /solo su Windows/u);
  assert.match(fraseDiFine({ motivo: 'aiutante-assente', assenza: 'senza-schermo' }), /non c'è uno schermo/u);
  assert.match(fraseDiFine({ motivo: 'aiutante-assente', assenza: 'spento' }), /in Impostazioni/u);
  const senza = fraseDiFine({ motivo: 'aiutante-assente', assenza: null });
  assert.equal(senza, 'Qui non posso usare il computer.');
  assert.equal(fraseDiFine({ motivo: 'aiutante-assente', causa: 'binario' }), senza, '`causa` resta per pagare, inviare e cancellare');
});

test('CU-03 davanti a una protezione la causa sceglie la frase, e nessuna dice ciò che non è successo', () => {
  assert.equal(fraseDiFine({ motivo: 'protezione:pagamento', causa: 'non-chiesto' }), 'Stavo per pagare, ma tu non me l\'hai chiesto: mi fermo.');
  assert.equal(fraseDiFine({ motivo: 'protezione:invio', causa: 'non-chiesto' }), 'Stavo per inviare, ma tu non me l\'hai chiesto: mi fermo.');
  assert.equal(fraseDiFine({ motivo: 'protezione:cancellazione', causa: 'non-chiesto' }), 'Stavo per cancellare, ma tu non me l\'hai chiesto: mi fermo.');
  assert.equal(fraseDiFine({ motivo: 'protezione:pagamento', causa: 'sospetto' }), 'Questa pagina contiene istruzioni che non vengono da te: qui non pago.');
  assert.equal(fraseDiFine({ motivo: 'protezione:invio', causa: 'sospetto' }), 'Questa pagina contiene istruzioni che non vengono da te: qui non invio.');
  assert.equal(fraseDiFine({ motivo: 'protezione:cancellazione', causa: 'sospetto' }), 'Questa pagina contiene istruzioni che non vengono da te: qui non cancello.');
  assert.equal(fraseDiFine({ motivo: 'sospetto' }), 'Questa pagina contiene istruzioni che non vengono da te. Non le seguo.');
  assert.match(fraseDiFine({ motivo: 'protezione:cancellazione', causa: 'politica' }), /la regola di questo dispositivo/u);
  assert.equal(fraseDiFine({ motivo: 'protezione:altro', causa: 'non-chiesto' }), fraseDiFine({ motivo: 'x' }));
});

test('CU-04 l\'attesa dice quanto ho aspettato davvero, e la cassa solo se era alla cassa; senza il dato niente durata', () => {
  assert.match(fraseDiFine({ motivo: 'attesa-scaduta', attesaMs: 600000, allaCassa: true }), /^Ti ho aspettato 10 minuti alla cassa e non hai risposto: mi sono fermato senza comprare/u);
  assert.equal(fraseDiFine({ motivo: 'attesa-scaduta', attesaMs: 600000 }), 'Ti ho aspettato 10 minuti e non hai risposto, quindi mi sono fermato.');
  assert.equal(fraseDiFine({ motivo: 'attesa-scaduta', attesaMs: 60000 }), 'Ti ho aspettato 1 minuto e non hai risposto, quindi mi sono fermato.');
  assert.equal(fraseDiFine({ motivo: 'attesa-scaduta', attesaMs: 45000 }), 'Ti ho aspettato 45 secondi e non hai risposto, quindi mi sono fermato.');
  assert.equal(fraseDiFine({ motivo: 'attesa-scaduta', attesaMs: null }), 'Non hai risposto, quindi mi sono fermato.');
  assert.match(fraseDiFine({ motivo: 'attesa-scaduta', allaCassa: true }), /^Non hai risposto alla cassa: mi sono fermato senza comprare/u);
});

test('CU-24 il tempo si ricava dall\'esito; quattro motivi hanno la loro frase', () => {
  assert.equal(fraseDiFine({ motivo: 'tetto-tempo', millisecondi: 1200000 }), 'Ci stavo mettendo troppo (20 min), quindi mi sono fermato.');
  assert.equal(fraseDiFine({ motivo: 'tetto-tempo' }), 'Ci stavo mettendo troppo, quindi mi sono fermato.');
  assert.equal(fraseDiFine({ motivo: 'impossibile' }), 'Questa cosa non si può fare.');
  assert.equal(fraseDiFine({ motivo: 'senza-esito' }), 'Non so se è andata: controlla a schermo.');
  assert.equal(fraseDiFine({ motivo: 'errore-interno' }), 'Qualcosa è andato storto da parte mia, quindi mi sono fermato.');
  assert.equal(fraseDiFine({ motivo: 'freno-perso' }), 'Ho perso il controllo del freno, quindi mi sono fermato per sicurezza.');
  assert.equal(fraseDiFine({ motivo: 'rifiutata-dalla-persona' }), fraseDiFine({ motivo: 'tempo' }));
});

test('CU-05 le pause: la frase del codice, e la mano chiesta col suo campo', () => {
  assert.match(frasePausa({ motivo: 'bloccato' }), /lo schermo è bloccato/u);
  assert.match(frasePausa({ motivo: 'uac' }), /Windows ti ha chiesto un permesso/u);
  assert.equal(frasePausa({ motivo: 'persona', fase: 'inizio' }), 'Non guardo lo schermo finché non riprendi');
  assert.equal(frasePausa({ motivo: 'chiedi_persona:accesso' }), 'In pausa: ti ho chiesto una mano');
  assert.equal(frasePausa({ motivo: 'permesso:pagamento' }), 'In pausa: ti ho chiesto una mano');
  assert.equal(frasePausa({ motivo: 'chissà' }), 'In pausa');
});

test('CU-06 chi ha deciso: le parole per ogni fonte; una fonte ignota non inventa', () => {
  assert.equal(paroleDellaFonte({ fonte: 'frase', citazione: 'manda la ricevuta' }), '«manda la ricevuta», nella tua frase');
  assert.equal(paroleDellaFonte({ fonte: 'tocco-posso' }), 'Col tuo tocco sulla riga «Posso»');
  assert.equal(paroleDellaFonte({ fonte: 'si-carta' }), 'Col tuo sì alla carta');
  assert.equal(paroleDellaFonte({ fonte: 'serie' }), 'Scelta di serie');
  assert.equal(paroleDellaFonte({ fonte: 'permesso' }, { nomePermesso: 'Accesso pieno' }), 'Col permesso Accesso pieno');
  assert.equal(paroleDellaFonte({ fonte: 'permesso' }), '');
  assert.equal(paroleDellaFonte({ fonte: 'nuova' }), '');
  assert.equal(nomeProtezione('pagamento'), 'Pagamento');
  assert.equal(nomeProtezione('sconosciuta'), 'Azione delicata');
});

test('CU-07 riga «Posso»: niente voci capite, niente riga', () => {
  const document = documento();
  assert.equal(creaRigaPosso({ document, voci: { pagare: false, inviare: false, cancellare: false } }), null);
  assert.ok(creaRigaPosso({ document, voci: { pagare: false, inviare: true, cancellare: false } }));
});

test('CU-08 riga «Posso»: un tocco vale subito e dice tutto il valore; spente tutte la riga resta', () => {
  const document = documento();
  const cambi = [];
  const r = creaRigaPosso({ document, voci: { pagare: true, inviare: false, cancellare: false }, alCambia: (v) => cambi.push(v) });
  assert.equal(voce(r.nodo, 'pagare').getAttribute('aria-pressed'), 'true');
  clic(voce(r.nodo, 'inviare'));
  assert.deepEqual(cambi.at(-1), { pagare: true, inviare: true, cancellare: false, tetto: null });
  clic(voce(r.nodo, 'pagare'));
  clic(voce(r.nodo, 'inviare'));
  assert.equal(voce(r.nodo, 'inviare').getAttribute('aria-pressed'), 'false');
  assert.equal(voce(r.nodo, 'pagare').getAttribute('aria-pressed'), 'false');
  clic(voce(r.nodo, 'cancellare'));
  assert.deepEqual(cambi.at(-1), { pagare: false, inviare: false, cancellare: true, tetto: null }, 'spente tutte, la riga resta e si riaccende');
});

test('CU-09 il tetto: numeri italiani, valuta del nucleo, vuoto toglie, spazzatura non vale', () => {
  assert.deepEqual(leggiTetto('49,90', 'EUR'), { importo: 49.9, valuta: 'EUR' });
  assert.deepEqual(leggiTetto('50', 'USD'), { importo: 50, valuta: 'USD' });
  assert.equal(leggiTetto('', 'EUR'), null);
  assert.equal(leggiTetto('0', 'EUR'), null);
  assert.equal(leggiTetto('-3', 'EUR'), null);
  assert.equal(leggiTetto('tanti', 'EUR'), null);
  assert.equal(leggiTetto('50', 'XYZ'), null, 'valute del nucleo: EUR, USD, GBP, CHF');
});

test('CU-10 il campo del tetto sta accanto a «pagare»: sparisce con la voce spenta, e spegnere toglie il tetto', () => {
  const document = documento();
  const cambi = [];
  const r = creaRigaPosso({ document, voci: { pagare: true, inviare: false, cancellare: false }, tetto: { importo: 50, valuta: 'EUR' }, alCambia: (v) => cambi.push(v) });
  const campo = r.nodo.querySelector('[data-tetto]');
  assert.equal(campo.value, '50');
  scrivi(campo, '30,5');
  assert.deepEqual(cambi.at(-1).tetto, { importo: 30.5, valuta: 'EUR' });
  clic(voce(r.nodo, 'pagare'));
  assert.equal(cambi.at(-1).pagare, false);
  assert.equal(cambi.at(-1).tetto, null);
  assert.equal(r.nodo.querySelector('label').hidden, true);
});

const PIANO = { obiettivo: 'Compra il biglietto', domini: [{ nome: 'trenitalia.example' }], app: [{ nome: 'WhatsApp' }], accessi: [{ dominio: 'trenitalia.example' }], posso: { pagare: true, inviare: true, cancellare: false, tetto: null } };

test('CU-11 carta unica: obiettivo, dove, accessi, Posso; il pagamento si annuncia alla cassa', () => {
  const document = documento();
  const c = cartaDelCompito(PIANO, { document });
  assert.equal(c.getAttribute('role'), 'dialog');
  const t = c.textContent;
  for (const x of ['Usa un’app al posto tuo', 'Compra il biglietto', 'trenitalia.example, WhatsApp', 'trenitalia.example, dal portachiavi', 'pagare']) assert.ok(t.includes(x), x);
  assert.match(t, /il pagamento te lo mostro alla cassa col totale/u);
  assert.equal(voce(c, 'Consenti per questo compito'), undefined, 'parola non ancora scelta dall\'owner');
  assert.ok(voce(c, 'Consenti sempre'));
});

test('CU-12 carta unica, le note: col tetto, senza pagare, e senza voci niente riga', () => {
  const document = documento();
  const col = cartaDelCompito({ ...PIANO, posso: { ...PIANO.posso, tetto: { importo: 50, valuta: 'EUR' } } }, { document });
  assert.match(col.textContent, /Alla cassa ti mostro il totale, se supera il tetto/u);
  const senza = cartaDelCompito({ ...PIANO, posso: { pagare: false, inviare: false, cancellare: false, tetto: null } }, { document });
  assert.doesNotMatch(senza.textContent, /cassa/u);
  assert.equal(senza.querySelector('[data-posso]'), null);
  assert.equal(senza.querySelectorAll('dt').filter((d) => d.textContent === 'Accessi').length, 1);
  const noAccessi = cartaDelCompito({ ...PIANO, accessi: [] }, { document });
  assert.equal(noAccessi.querySelectorAll('dt').filter((d) => d.textContent === 'Accessi').length, 0);
});

test('CU-13 carta unica, le risposte del contratto: \'si\', \'sempre\', \'no\'', () => {
  const document = documento();
  const risposte = [];
  const c = cartaDelCompito(PIANO, { document, alRisposta: (r) => risposte.push(r) });
  clic(c.querySelector('.cs-si'));
  clic(c.querySelector('.cs-sempre'));
  clic(c.querySelector('.cs-no'));
  clic(c.querySelector('.cs-x'));
  assert.deepEqual(risposte, ['si', 'sempre', 'no', 'no']);
});

test('CU-14 un luogo nuovo chiede solo per lui, e si può ricordare', () => {
  const document = documento();
  const c = cartaDelCompito({ nuovo: { dominio: 'prenotazioni.example' } }, { document });
  assert.match(c.textContent, /Posso andare su un altro sito\?/u);
  assert.match(c.textContent, /Nuovo sito.*prenotazioni\.example/u);
  assert.ok(c.querySelector('.cs-sempre'));
  const a = cartaDelCompito({ nuovo: { app: 'Mail' } }, { document });
  assert.match(a.textContent, /Posso usare un'altra app\?/u);
  assert.match(a.textContent, /Nuova app.*Mail/u);
});

const VOCI = [{ id: 0, protezione: 'credenziale', prova: 'luce.example' }, { id: 1, protezione: 'pagamento', prova: 'Paga ora', importo: { importo: 84.2, valuta: 'EUR' } }];

test('CU-15 conferme insieme: tutte accese danno \'si\'', () => {
  const document = documento();
  let r = null;
  const c = cartaConferme({ voci: VOCI }, { document, alRisposta: (x) => { r = x; } });
  assert.match(c.textContent, /Per andare avanti mi serve il tuo sì per:/u);
  assert.match(c.textContent, /84,20 €/u);
  clic(voce(c, 'Sì, a tutti e due'));
  assert.equal(r, 'si');
});

test('CU-16 conferme insieme: una spenta risponde per voce; tutte spente non sono un sì', () => {
  const document = documento();
  let r = null;
  const c = cartaConferme({ voci: VOCI }, { document, alRisposta: (x) => { r = x; } });
  const levette = c.querySelectorAll('[role="switch"]');
  clic(levette[1]);
  assert.equal(c.querySelectorAll('[role="switch"]')[1].getAttribute('aria-checked'), 'false');
  assert.match(c.textContent, /Non lo faccio/u);
  clic(voce(c, 'Sì, all\'altro'));
  assert.deepEqual(r, { 0: 'si', 1: 'no' });
  clic(c.querySelectorAll('[role="switch"]')[0]);
  clic(voce(c, 'Va bene così'));
  assert.deepEqual(r, { 0: 'no', 1: 'no' });
  clic(voce(c, 'No, fermati'));
  assert.equal(r, 'annulla');
});

test('CU-17 la cassa: totale, dominio, metodo; il sì vale per questo pagamento', () => {
  const document = documento();
  const risposte = [];
  const c = cartaCassa({ totale: { importo: 59.9, valuta: 'EUR' }, dominio: 'trenitalia.example', metodo: 'carta salvata', tetto: { importo: 50, valuta: 'EUR' } }, { document, alRisposta: (x) => risposte.push(x) });
  assert.match(c.textContent, /Costa 59,90 €, più del tuo tetto di 50,00 €\. Lo pago\?/u);
  assert.match(c.textContent, /59,90 € · trenitalia\.example, carta salvata/u);
  clic(voce(c, 'Paga 59,90 €'));
  clic(voce(c, 'Non pagare'));
  assert.deepEqual(risposte, ['si', 'no']);
});

test('CU-18 la cassa senza metodo, o senza un totale leggibile: non si inventa', () => {
  const document = documento();
  const senzaMetodo = cartaCassa({ totale: { importo: 10, valuta: 'USD' }, dominio: 'a.example', metodo: null, tetto: null }, { document });
  assert.match(senzaMetodo.textContent, /10,00 USD · a\.example/u);
  assert.doesNotMatch(senzaMetodo.textContent, /,\s*null|undefined/u);
  const senzaTotale = cartaCassa({ totale: null, dominio: 'a.example', metodo: null, tetto: null }, { document });
  assert.match(senzaTotale.textContent, /Non riesco a leggere il totale/u);
  assert.ok(voce(senzaTotale, 'Paga'));
  assert.equal(testoTotale({ importo: 84.2, valuta: 'EUR' }), '84,20 €');
  assert.equal(testoTotale({ importo: 84.2, valuta: 'GBP' }), '84,20 GBP');
});

test('CU-19 la mano alla persona: anti-robot, banca, codice col clic suo; solo \'fatto\' riprende', () => {
  const document = documento();
  const risposte = [];
  const o = { document, alRisposta: (x) => risposte.push(x) };
  assert.match(cartaMano({ motivo: 'anti-robot' }, o).textContent, /risolvilo tu/u);
  assert.match(cartaMano({ motivo: 'verifica-banca' }, o).textContent, /La banca chiede la sua verifica/u);
  const cvv = cartaMano({ motivo: 'codice-sicurezza', ancheIlClic: true }, o);
  assert.match(cvv.textContent, /premi tu «Paga», poi premi «Fatto»/u);
  clic(voce(cvv, 'Fatto'));
  assert.deepEqual(risposte, ['fatto']);
  assert.match(cartaMano({ motivo: 'codice-sicurezza' }, o).textContent, /Scrivi tu il codice di sicurezza della carta, poi premi «Fatto»\./u);
});

test('CU-20 la carta di fine: chi ha deciso, riga per riga, col conto del tetto', () => {
  const document = documento();
  const c = cartaFine({
    decisioni: [{ passo: 3, protezione: 'pagamento', azione: 'premi', fonte: 'frase', citazione: 'fino a 50 €' }, { passo: 5, protezione: 'credenziale', azione: 'scrivi', fonte: 'si-carta' }, { passo: 7, protezione: 'pagamento', azione: 'premi', fonte: 'si-carta', metodo: 'Visa' }],
    spese: [{ passo: 3, totale: 49.9, resta: 0.1, valuta: 'EUR' }],
  }, { document });
  assert.match(c.textContent, /Cosa ho fatto, e chi l'ha deciso:/u);
  assert.match(c.textContent, /Pagato 49,90 €/u);
  assert.match(c.textContent, /«fino a 50 €», nella tua frase/u);
  assert.match(c.textContent, /Restano 0,10 € del tetto/u);
  assert.match(c.textContent, /Col tuo sì alla carta/u);
  assert.match(c.textContent, /Visa/u);
  assert.equal(cartaFine({ decisioni: [], spese: [] }, { document }), null, 'niente di delicato, niente carta');
});

test('CU-21 la pillola segue gli eventi: passo, presa della persona e ritorno alla frase di prima', () => {
  let s = statoPillola(STATO_PILLOLA_INIZIALE, { name: 'talos.computer-use-passo', value: { fase: 'annuncio', n: 1, bersaglio: 'Cerca' } });
  assert.equal(s.fase, 'Cerca');
  s = statoPillola(s, { name: 'talos.computer-use-pausa', value: { motivo: 'persona', fase: 'inizio' } });
  assert.equal(s.fase, 'Non guardo lo schermo finché non riprendi');
  assert.equal(s.fermo, true);
  s = statoPillola(s, { name: 'talos.computer-use-pausa', value: { motivo: 'persona', fase: 'fine' } });
  assert.equal(s.fase, 'Cerca');
  assert.equal(s.fermo, false);
  s = statoPillola(s, { name: 'talos.computer-use-fermato', value: { motivo: 'pulsante-ferma' } });
  assert.equal(s.lavora, false);
  assert.equal(statoPillola(s, { name: 'altro', value: {} }), s);
});

test('CU-22 la pillola a schermo: la fase, i secondi e il tasto che ferma', () => {
  const document = documento();
  let fermata = 0;
  const p = creaPillola({ document, alFerma: () => { fermata += 1; } });
  p.aggiorna({ fase: 'Cerca', lavora: true, fermo: false, secondi: 7 });
  assert.match(p.nodo.textContent, /Cerca/u);
  assert.match(p.nodo.textContent, /7 s/u);
  clic(p.nodo.querySelector('[data-ferma]'));
  assert.equal(fermata, 1);
  p.aggiorna({ fase: '', lavora: false, fermo: false, secondi: null });
  assert.equal(p.nodo.hidden, true);
});

test('CU-23 non montati: nessun import dalla regia e nessun foglio caricato; il foglio sta nei suoi token', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  /* FE-070 approvato: la pagina principale monta solo il ponte verso la bolla e il segno; le schermate e la regia restano fuori. */
  const importati = [...app.matchAll(/from '\.\.\/components\/computer-use\/([^']+)'/gu)].map((m) => m[1]);
  assert.deepEqual(importati, ['ponte-bolla.js']);
  assert.doesNotMatch(app.replace("'../components/computer-use/ponte-bolla.js'", ''), /components\/computer-use\//u);
  const main = readFileSync(new URL('../../src/styles/main.css', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /computer-use\.css/u);
  const css = readFileSync(new URL('../../src/styles/computer-use.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/iu, 'colori solo dai token');
  for (const c of ['.cs{', '.talos-controllo{', '.talos-levetta', '.cu-pillola{']) assert.ok(css.includes(c), c);
  const f = ['computer-use/carte.js', 'computer-use/riga-posso.js', 'computer-use/pillola.js'].map((p) => readFileSync(new URL(`../../src/components/${p}`, import.meta.url), 'utf8')).join('');
  assert.doesNotMatch(f, /innerHTML|insertAdjacentHTML/u, 'il testo delle pagine entra solo come testo');
});

/* Revisione avversaria M del 04/11 (feat/computer-use-schermi), D1, D2 e il mutante vivo M3-d. */
test('CU-27 (D1) un luogo tolto dai ricordati: la carta chiede di continuare lì, non «un altro sito» né «Non era nel piano»', () => {
  const document = documento();
  // forma vera di `ciclo.mjs` (~608): `chiediConsenso({ nuovo: qui, tolto: true })`, e quel luogo può essere del piano
  const sito = cartaDelCompito({ nuovo: { dominio: 'trenitalia.example' }, tolto: true }, { document });
  assert.doesNotMatch(sito.textContent, /Non era nel piano|altro sito/u, sito.textContent);
  assert.match(sito.textContent, /Posso continuare su questo sito\?/u);
  assert.match(sito.textContent, /L’hai tolto dai luoghi ricordati/u);
  assert.match(sito.textContent, /trenitalia\.example/u);
  const app = cartaDelCompito({ nuovo: { app: 'Posta' }, tolto: true }, { document });
  assert.match(app.textContent, /Posso continuare con questa app\?/u);
  // controllo: il luogo nuovo vero resta com'era
  assert.match(cartaDelCompito({ nuovo: { dominio: 'altro.example' } }, { document }).textContent, /Non era nel piano/u);
});

test('CU-28 (D2) la stessa riga si chiama allo stesso modo nella carta e nel riepilogo finale: «Dove lavoro»', () => {
  const document = documento();
  const carta = cartaDelCompito({ obiettivo: 'Compra', domini: [{ nome: 'a.example' }] }, { document }).textContent;
  const fine = cartaFine({ decisioni: [{ passo: 0, protezione: null, azione: 'consenso', fonte: 'sempre' }], spese: [] }, { document }).textContent;
  assert.match(carta, /Dove lavoro/u);
  assert.match(fine, /Dove lavoro(?!re)/u, fine.slice(0, 160));
});

test('CU-29 (M3-d) in pausa la frase della pausa resta anche se arriva un esito «coperto da TALOS»', () => {
  let s = statoPillola(STATO_PILLOLA_INIZIALE, { name: 'talos.computer-use-passo', value: { fase: 'annuncio', n: 1, bersaglio: 'Cerca' } });
  s = statoPillola(s, { name: 'talos.computer-use-pausa', value: { motivo: 'persona', fase: 'inizio' } });
  const inPausa = s.fase;
  s = statoPillola(s, { name: 'talos.computer-use-passo', value: { fase: 'esito', n: 1, esito: 'non-eseguita', motivo: 'coperto-da-talos' } });
  assert.equal(s.fase, inPausa, 'la pausa non si copre');
  assert.equal(s.fermo, true);
  // controllo: fuori dalla pausa lo stesso esito si dice
  const fuori = statoPillola(statoPillola(STATO_PILLOLA_INIZIALE, { name: 'talos.computer-use-passo', value: { fase: 'annuncio', n: 1, bersaglio: 'Cerca' } }),
    { name: 'talos.computer-use-passo', value: { fase: 'esito', n: 1, esito: 'non-eseguita', motivo: 'coperto-da-talos' } });
  assert.notEqual(fuori.fase, 'Cerca');
});
