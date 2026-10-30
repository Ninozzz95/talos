/*
 * 22/10/2026 notte — il verdetto della CLI sulla regola «un riassunto si paga solo se serve» (ricerca su 12 concorrenti,
 * `research-overflow-0613/REPORT.md` §0), tre correzioni adottate nel primo passo:
 * C1. il pavimento porta anche il RIASSUNTO atteso (il suo budget d'uscita, mai più del tratto che riassume);
 * C2. una regola sola: il guadagno atteso è almeno il 10% della soglia (via il ramo «il meglio riporta sotto la linea», che rifà il
 *     thrashing che Claude Code ha dovuto fermare con un interruttore);
 * C4. il /compact a mano: la stessa aritmetica, con «guadagno > 0».
 * E una cura trovata dalla suite intera: il blocco dei fatti (git) parte SOLO quando il suo risultato si userà — un git avviato per un
 * riassunto poi saltato restava aperto nella cartella del progetto dopo il giro (EPERM sulla cartella di prova).
 * Ogni prova ha la sua scena AL CONTRARIO, e la regola di prima scritta qui come riferimento: la scena la paga, quella nuova no.
 */
import assert from 'node:assert/strict';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { promisify } from 'node:util';
import test from 'node:test';
import { corpoSenzaMarcatori } from './aiuto/corpo-senza-marcatori.mjs'; // 28/10: cache, punto 1

/* Il lettore di git del blocco dei fatti si lega a `execFile` quando il suo modulo si carica: lo si avvolge PRIMA di caricare il kernel,
   e si contano le sole letture del blocco (`git -C <cartella> log --oneline`). */
const require = createRequire(import.meta.url);
const processiFigli = require('node:child_process');
const execFileVero = processiFigli.execFile;
const letturaGitVera = promisify(execFileVero);
const lettureGit = [];
let ritardoGitMs = 0; // una prova può rallentare git, per mettere la preparazione in sottofondo dietro la fine del giro
let gitAperti = 0; // le letture di git ancora in corso (revisione 6 della CLI, S4-1: nessuna deve sopravvivere al giro)
function execFileContato(file, args, ...resto) { return execFileVero.call(this, file, args, ...resto); }
execFileContato[promisify.custom] = async (file, args, ...resto) => {
  if (!(file === 'git' && Array.isArray(args) && args.includes('log'))) return letturaGitVera(file, args, ...resto);
  lettureGit.push(args[1]);
  gitAperti += 1;
  try {
    /* il ritardo rispetta il segnale come lo rispetterebbe il processo vero (`execFile` con `signal`) */
    const segnale = resto[0]?.signal;
    if (ritardoGitMs > 0) {
      await new Promise((ok, no) => {
        const timer = setTimeout(ok, ritardoGitMs);
        segnale?.addEventListener('abort', () => { clearTimeout(timer); no(Object.assign(new Error('aborted'), { name: 'AbortError' })); }, { once: true });
      });
    }
    return await letturaGitVera(file, args, ...resto);
  } finally { gitAperti -= 1; }
};
processiFigli.execFile = execFileContato;
syncBuiltinESMExports();

const { talosLavora: talosLavoraVero } = await import('../src/kernel/talosHarness.desktop-hotfix.mjs');
/* Revisione 6 della CLI (S2-2): senza uno scarto misurato la prima richiesta di un giro porta la stima degli schemi degli attrezzi (i fornitori veri li contano). Il fornitore finto di questo file risponde `prompt_tokens` = stima dei soli MESSAGGI: lo scarto che il registro misurerebbe su di lui è 0, e lo si dichiara (`scartoMisurato: 0`) invece di cambiare tutte le soglie. */
const talosLavora = (input) => talosLavoraVero({ scartoMisurato: 0, ...input });
const { stimaTokenConversazione: stima } = await import('../src/kernel/talosHarness.mjs');
const compattazione = await import('../src/kernel/compattazione-desktop.mjs');
const { cartellaDiProva } = await import('./aiuto/cartelle-di-prova.mjs');

/* La regola di PRIMA, per dimostrare che ogni scena distingue: pavimento + 256, e il ramo della linea. */
const regolaDiPrima = ({ prima, pavimentoConCornice, linea, soglia }) => {
  const meglio = pavimentoConCornice + 256;
  if (prima - meglio <= 0) return false;
  if (Number.isFinite(linea) && meglio < linea) return true;
  return prima - meglio >= 0.10 * soglia;
};
const tratto = (token) => [{ role: 'user', content: 'x'.repeat(Math.max(0, token * 4 - 20)) }];

/* Revisione 6 della CLI (S3-1): il riassunto atteso è la dimensione ATTESA — un quinto del tratto, col tetto della finestra (5%, al più
   10.000) e un pavimento piccolo (400) — non il budget anti-troncamento (che non scende mai sotto 2.000 e su una finestra da 12k rendeva
   ogni tratto vecchio sotto i 2.000 irriducibile per sempre). */
test('VERDETTO-CLI-C1-01 — il riassunto atteso sta nel pavimento, alla sua dimensione attesa: con la soglia a 4.000 un tratto vecchio da ~700 token non si paga, uno da ~900 sì', () => {
  const soglia = 4_000;
  const pavimentoConCornice = 1_000;
  const piccolo = tratto(700);
  const prima = pavimentoConCornice + stima(piccolo);
  assert.equal(compattazione.riassuntoAtteso(piccolo, { soglia }), 400, 'il pavimento piccolo: un quinto (140) col tetto della finestra (266) è sotto i 400');
  assert.equal(regolaDiPrima({ prima, pavimentoConCornice, linea: null, soglia }), true, 'premessa: la regola senza il riassunto atteso lo pagava');
  assert.equal(compattazione.riassuntoUtile({ prima, pavimentoConCornice, mezzo: piccolo, soglia }), false, 'toglie ~700, ne scrive ~400: 300 sotto il 10% di 4.000');
  const grande = tratto(900);
  assert.equal(compattazione.riassuntoUtile({ prima: pavimentoConCornice + stima(grande), pavimentoConCornice, mezzo: grande, soglia }), true,
    'AL CONTRARIO: ~500 di guadagno netto, dal 10% in su: si paga');
  /* e su una finestra grande il riassunto atteso è un quinto del tratto, col tetto di 10.000 */
  assert.equal(compattazione.riassuntoAtteso(tratto(20_000), { soglia: 150_000 }), Math.floor(stima(tratto(20_000)) * 0.2));
  assert.equal(compattazione.riassuntoAtteso(tratto(80_000), { soglia: 150_000 }), 10_000);
});

test('VERDETTO-CLI-C1-02 — un tratto vecchio più piccolo del pavimento del riassunto non può ridurre: il riassunto atteso è grande quanto lui', () => {
  const piccolo = tratto(300);
  assert.equal(compattazione.riassuntoAtteso(piccolo, { soglia: 200_000 }), stima(piccolo), 'mai più del tratto che riassume');
  assert.equal(compattazione.riassuntoUtile({ prima: 50_000 + stima(piccolo), pavimentoConCornice: 50_000, mezzo: piccolo, soglia: 200_000 }), false);
});

/* N7 (revisione 9 della CLI, 23/10/2026): la regola approvata dall'owner il 22/10 («un riassunto si paga solo se toglie davvero almeno il
   10%») vale anche all'emergenza — prima qui c'era l'esenzione «all'emergenza basta un guadagno positivo», che non era sua */
test('VERDETTO-CLI-EMERGENZA-01 — anche all\'emergenza, con la finestra nota, un guadagno sotto il 10% della soglia non si paga; AL CONTRARIO dal 10% in su sì, all\'emergenza come alla soglia', () => {
  const mezzo = tratto(900);
  const argomenti = { prima: 10_000 + stima(mezzo), pavimentoConCornice: 10_000, mezzo, soglia: 12_000 };
  assert.equal(compattazione.riassuntoUtile({ ...argomenti, finestraToken: 16_000, motivo: 'emergenza' }), false, 'guadagno ~500, sotto il 10% di 12.000: all\'emergenza no');
  assert.equal(compattazione.riassuntoUtile({ ...argomenti, finestraToken: 16_000, motivo: 'soglia' }), false, 'alla soglia no, come sempre');
  const grande = tratto(6_000);
  const conGuadagno = { prima: 10_000 + stima(grande), pavimentoConCornice: 10_000, mezzo: grande, soglia: 12_000, finestraToken: 32_000 };
  assert.ok(compattazione.guadagnoAtteso(conGuadagno) >= 1_200, 'premessa: il guadagno supera il 10% della soglia');
  assert.equal(compattazione.riassuntoUtile({ ...conGuadagno, motivo: 'emergenza' }), true, 'AL CONTRARIO: dal 10% in su all\'emergenza si paga');
  assert.equal(compattazione.riassuntoUtile({ ...conGuadagno, motivo: 'soglia' }), true, 'e alla soglia uguale');
});

test('VERDETTO-CLI-C2-01 — niente ramo «il meglio riporta sotto la linea»: un passo sotto il 10% della soglia non si paga nemmeno se atterra appena sotto; AL CONTRARIO, uno dal 10% in su sì', () => {
  const soglia = 100_000;
  const mezzo = tratto(6_000);
  const pavimentoConCornice = 95_000;
  const prima = pavimentoConCornice + stima(mezzo);
  assert.equal(regolaDiPrima({ prima, pavimentoConCornice, linea: soglia, soglia }), true, 'premessa: la regola di prima lo pagava (il meglio atterrava sotto la linea)');
  assert.equal(compattazione.riassuntoUtile({ prima, pavimentoConCornice, mezzo, soglia }), false,
    'guadagno ~4.000 su una soglia di 100.000: il giro dopo si ricompatterebbe (thrashing)');
  const grande = tratto(14_000);
  assert.equal(compattazione.riassuntoUtile({ prima: 80_000 + stima(grande), pavimentoConCornice: 80_000, mezzo: grande, soglia }), true,
    'AL CONTRARIO: un guadagno dal 10% della soglia in su si paga');
});

test('VERDETTO-CLI-C4-01 — /compact a mano: «guadagno > 0» al netto del riassunto atteso; AL CONTRARIO, un guadagno vero si fa anche sotto il 10%', () => {
  const mezzo = tratto(350);
  const pavimento = 1_000;
  const token = pavimento + stima(mezzo);
  assert.equal(token - pavimento > 256, true, 'premessa: la regola di prima diceva «può ridurre»');
  assert.equal(compattazione.riassuntoNonPuoRidurre(token, pavimento, mezzo, { soglia: 4_000 }), true, 'il riassunto atteso è grande quanto il tratto: non può ridurre');
  const vero = tratto(2_400);
  assert.equal(compattazione.riassuntoNonPuoRidurre(pavimento + stima(vero), pavimento, vero, { soglia: 100_000 }), false,
    'AL CONTRARIO: 400 token di guadagno vero, molto sotto il 10% della soglia, la persona l\'ha chiesto e si fa');
});

/* Revisione 6 della CLI (S2-1): niente più esenzione della «stima cieca» — un'immagine nella prima richiesta (tenuta per sempre) la
   rendeva vera per tutta la sessione. Ora tutto coi pezzi: l'immagine nel tratto riassunto è guadagno, quella tenuta si annulla. */
test('VERDETTO-CLI-IMMAGINI-01 — un\'immagine nel tratto vecchio conta come guadagno; AL CONTRARIO una tenuta (in prima e nel pavimento) si annulla e non spegne la regola', () => {
  const immagine = { role: 'user', content: [{ type: 'text', text: 'logo' }, { type: 'image_url', image_url: { url: 'data:,' } }] };
  const mezzoConImmagine = [immagine, { role: 'assistant', content: 'visto' }];
  const pavimento = 1_000;
  assert.ok(compattazione.riassuntoAtteso(mezzoConImmagine, { soglia: 4_000 }) <= compattazione.stimaConPezzi(mezzoConImmagine), 'il riassunto atteso pesa i pezzi');
  assert.equal(compattazione.riassuntoUtile({ prima: pavimento + compattazione.stimaConPezzi(mezzoConImmagine), pavimentoConCornice: pavimento, mezzo: mezzoConImmagine, soglia: 4_000 }), true,
    'riassumere l\'immagine toglie ~1.500 token: si paga');
  /* l'immagine tenuta: in prima E nel pavimento; il tratto riassunto è testo corto ⇒ nessun guadagno, nessuna esenzione */
  const tenuta = compattazione.stimaConPezzi([immagine]);
  const corto = tratto(100);
  assert.equal(compattazione.riassuntoUtile({ prima: pavimento + tenuta + stima(corto), pavimentoConCornice: pavimento + tenuta, mezzo: corto, soglia: 4_000 }), false,
    'un\'immagine che resta non fa pagare un riassunto che non riduce');
});

/* Il giro vero: un log incollato negli ultimi scambi con poca storia vecchia (la scena S2-1-GIRO-NON-PAGA della revisione 4) — il
   riassunto si salta, e il blocco dei fatti NON legge git; AL CONTRARIO, con una storia vecchia grande il riassunto si paga e git sì. */
const storia = (coppie, lunghezza = 420) => Array.from({ length: coppie }, (_, i) => [
  { role: 'user', content: `Domanda ${i}: ${'parola '.repeat(lunghezza / 7)}` },
  { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(lunghezza / 7)}` },
]).flat();
const coppiePer = (token) => { let c = 1; while (stima(storia(c + 1)) < token) c += 1; return c; };
const rispostaFinta = (contenuto, prompt = 10) => Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: contenuto }, finish_reason: 'stop' }], usage: { prompt_tokens: prompt, completion_tokens: 1 } });
async function giroConIncollato(t, messaggiVecchi) {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = '4000';
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
  const cartella = cartellaDiProva('talos-verdetto-git-');
  let riassunti = 0;
  const fetchDiRete = async (_u, o) => {
    const corpo = corpoSenzaMarcatori(o.body);
    if (!corpo.tools?.length) { riassunti += 1; return rispostaFinta(`## Riassunto\n${'Dettaglio del lavoro fatto. '.repeat(12)}`); }
    return rispostaFinta('OK', stima(corpo.messages));
  };
  const incollato = `Ecco il log che ho incollato, rispondi solo OK.\n${'riga di log incollata '.repeat(1000)}`;
  lettureGit.length = 0;
  const ris = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' },
    messaggiIniziali: [...messaggiVecchi, { role: 'user', content: incollato }], contestoDelProgetto: 'Project files:\n', fetchDiRete });
  assert.equal(ris.comeFinita, 'concluso', 'premessa: il giro finisce');
  return { riassunti, git: lettureGit.filter((c) => c === cartella).length };
}

/* Il guadagno di un riassunto col pavimento NUDO (senza la cornice della proiezione riassunta), calcolato con le stesse funzioni del giro
   sulla richiesta che il fornitore ha ricevuto: serve a mettere la soglia nella fascia in cui decide la SOLA cornice. */
const guadagnoNudo = (messaggi, soglia) => {
  const divise = compattazione.dividiPerCompattazione(messaggi);
  const pressione = compattazione.riduciCodaSottoPressione(divise.coda, { budgetToken: compattazione.budgetCoda(soglia) });
  const parti = { ...divise, coda: pressione.coda };
  return stima([...parti.testa, ...parti.mezzo, ...parti.coda]) - stima([...parti.testa, ...parti.richiesteLetterali, ...parti.coda])
    - compattazione.riassuntoAtteso(parti.mezzo, { soglia });
};

test('VERDETTO-CLI-CORNICE-01 — nel giro la cornice conta: con la soglia dove il guadagno NUDO passa il 10% ma quello con la cornice no, nessun riassunto; AL CONTRARIO, con la soglia più bassa sì', async (t) => {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
  const cartella = cartellaDiProva('talos-verdetto-cornice-');
  /* un tratto vecchio di ~4.000 token, poi una richiesta breve e un log incollato da ~44.000 (nella coda: il pavimento è grande) */
  const messaggi = [...storia(coppiePer(4_000)), { role: 'user', content: 'Seconda richiesta: rispondi OK.' }, { role: 'assistant', content: 'OK' },
    { role: 'user', content: `Il log incollato: ${'riga di log incollata '.repeat(8_000)}` }];
  const corsa = async (tetto) => {
    process.env[compattazione.VARIABILE_TETTO_TOKEN] = String(tetto);
    const conti = { riassunti: 0, primaRichiesta: null };
    const fetchDiRete = async (_u, o) => {
      const corpo = corpoSenzaMarcatori(o.body);
      if (!corpo.tools?.length) { conti.riassunti += 1; return rispostaFinta('## Riassunto\nbreve.'); }
      conti.primaRichiesta ??= corpo.messages;
      return rispostaFinta('OK', stima(corpo.messages));
    };
    await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: messaggi, contestoDelProgetto: 'Project files:\n', fetchDiRete });
    return conti;
  };
  const misura = await corsa(200_000);
  assert.equal(misura.riassunti, 0, 'premessa: senza tetto nessuna compattazione');
  /* la soglia dove il 10% sta 150 token SOTTO il guadagno nudo (la cornice vale 391-555 token): il pavimento nudo pagherebbe, quello
     con la cornice no. Tre giri di punto fisso, perché la pressione sulla coda dipende dalla soglia. */
  const sogliaPer = (margine) => { let s = 10_000; for (let i = 0; i < 4; i += 1) s = Math.round(10 * (guadagnoNudo(misura.primaRichiesta, s) - margine)); return s; };
  const nellaFascia = sogliaPer(150);
  assert.ok(nellaFascia > 4_000 && nellaFascia < stima(misura.primaRichiesta), `premessa: la soglia della fascia sta sotto la richiesta (${nellaFascia} contro ${stima(misura.primaRichiesta)})`);
  assert.equal((await corsa(nellaFascia)).riassunti, 0, `alla soglia ${nellaFascia} il guadagno con la cornice è sotto il 10%: nessun riassunto`);
  const sotto = sogliaPer(1_000);
  assert.ok((await corsa(sotto)).riassunti >= 1, `AL CONTRARIO: alla soglia ${sotto} il guadagno con la cornice passa il 10% e il riassunto si paga`);
});

/* La FASCIA INCERTA (utile senza il blocco dei fatti, non utile col blocco più grande possibile): solo lì il giro aspetta git prima di
   decidere. Per una preparazione in sottofondo vuol dire che il suo «inizio» e il suo conto arrivano DOPO che il giro è tornato: il
   conto dev'essere vivo (`conteggioPreparazioni` coi getter), o chi lo legge dopo aver atteso la preparazione vede zero. Git rallentato
   di 400 ms dall'involucro: la scena è deterministica. */
test('VERDETTO-CLI-FASCIA-01 — una preparazione in sottofondo nella fascia incerta aspetta git dopo la fine del giro, e il conto lo vede (vivo, non fotografato)', async (t) => {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  t.after(() => { ritardoGitMs = 0; if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
  /* il tratto vecchio che mette il 10% della soglia 900 token SOTTO il guadagno nudo: la cornice senza blocco (~400) lascia utile,
     quella col blocco più grande (~1.000 in più) no ⇒ si aspetta il blocco vero; e la richiesta fra l'80% della soglia e la soglia.
     Storia e soglia si cercano insieme: il riassunto atteso e la pressione sulla coda dipendono dalla soglia (punto fisso). */
  let messaggi = null;
  let soglia = null;
  for (let lunghezza = 70; lunghezza <= 1_400 && !messaggi; lunghezza += 7) {
    const prova = [...storia(10, lunghezza), { role: 'user', content: 'Continua.' }];
    let s = 4_000;
    for (let i = 0; i < 4; i += 1) s = Math.round(10 * (guadagnoNudo(prova, s) - 900));
    if (s > 1_000 && stima(prova) >= 0.8 * s + 50 && stima(prova) < s - 50) { messaggi = prova; soglia = s; }
  }
  assert.ok(messaggi, 'premessa: una storia nella fascia');
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = String(soglia);
  const cartella = cartellaDiProva('talos-verdetto-fascia-');
  const eventi = [];
  let riassunti = 0;
  ritardoGitMs = 400;
  const ris = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: messaggi,
    contestoDelProgetto: 'Project files:\n', compattazioneIstantanea: true,
    onGiro: (e) => { if (e?.tipo === 'compattazione-preparata') eventi.push(e.fase ?? e.motivo ?? null); },
    fetchDiRete: async (_u, o) => {
      const corpo = corpoSenzaMarcatori(o.body);
      if (!corpo.tools?.length) { riassunti += 1; return rispostaFinta('## Riassunto\nbreve.'); }
      return rispostaFinta('fatto', stima(corpo.messages));
    } });
  const conteggio = ris.preparazioniDiCompattazione;
  assert.equal(eventi.filter((f) => f === 'inizio').length, 0, `premessa: al ritorno del giro la preparazione aspetta ancora git (${JSON.stringify(eventi)})`);
  assert.ok(ris.compattazioneInPreparazione, 'premessa: c\'è una preparazione in sottofondo');
  await ris.compattazioneInPreparazione;
  assert.equal(riassunti, 1, 'premessa: nella fascia, col blocco vero, il riassunto si paga');
  assert.equal(eventi.filter((f) => f === 'inizio').length, 1, `l'«inizio» arriva dopo git (${JSON.stringify(eventi)})`);
  assert.equal(conteggio.preparate, 1, 'e il conto letto al ritorno del giro lo vede: è vivo');
});

test('VERDETTO-CLI-GIT-01 — un riassunto saltato non avvia git: nessun processo resta aperto nella cartella del progetto dopo il giro; AL CONTRARIO, uno pagato sì', async (t) => {
  const brevi = [1, 2, 3].flatMap((i) => [{ role: 'user', content: `Richiesta ${i}: rispondi OK.` }, { role: 'assistant', content: 'OK' }]);
  const saltato = await giroConIncollato(t, brevi);
  assert.equal(saltato.riassunti, 0, 'premessa: il riassunto si salta (non poteva ridurre)');
  assert.equal(saltato.git, 0, `git non parte per un riassunto che non si fa (${saltato.git} letture)`);
  const pagato = await giroConIncollato(t, storia(coppiePer(4_500)));
  assert.ok(pagato.riassunti >= 1, `premessa: con la storia vecchia grande il riassunto si paga (${pagato.riassunti})`);
  assert.ok(pagato.git >= 1, `AL CONTRARIO: il blocco dei fatti legge git per la proiezione (${pagato.git} letture)`);
});

/* Revisione 6 della CLI (S2-2): la PRIMA richiesta di un giro si misurava senza gli schemi degli attrezzi. Senza uno scarto misurato ora
   li porta (stima dei loro schemi); con lo scarto misurato dal registro porta quello. E il giro restituisce lo scarto della sua ultima
   richiesta misurata: ciò che il fornitore ha contato in più della stima. */
test('VERDETTO-CLI-SCARTO-01 — senza scarto misurato la prima richiesta porta gli schemi degli attrezzi; AL CONTRARIO con lo scarto misurato a 0 no; e il giro restituisce lo scarto vero', async (t) => {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = '4000';
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
  const cartella = cartellaDiProva('talos-verdetto-scarto-');
  /* sotto la soglia di 4.000 coi soli messaggi; ~2.200 token di schemi degli attrezzi la portano oltre l'emergenza (4.800) */
  const messaggi = [...storia(coppiePer(3_300)), { role: 'user', content: 'Continua.' }];
  assert.ok(stima(messaggi) < 4_000, `premessa: coi soli messaggi sotto la soglia (${stima(messaggi)})`);
  const corsa = async (input, piu = 0) => {
    const conti = { riassunti: 0, inizi: 0 };
    const ris = await talosLavoraVero({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: messaggi, contestoDelProgetto: 'Project files:\n',
      onGiro: (e) => { if (e?.tipo === 'compattazione-inizio') conti.inizi += 1; },
      fetchDiRete: async (_u, o) => {
        const corpo = corpoSenzaMarcatori(o.body);
        if (!corpo.tools?.length) { conti.riassunti += 1; return rispostaFinta('## Riassunto\nbreve.'); }
        return rispostaFinta('fatto', stima(corpo.messages) + piu);
      }, ...input });
    return { ...conti, scarto: ris.scartoMisurato };
  };
  const senza = await corsa({});
  assert.ok(senza.inizi >= 1, `senza scarto misurato gli attrezzi contano: la compattazione parte alla prima richiesta (${JSON.stringify(senza)})`);
  const misurato = await corsa({ scartoMisurato: 0 });
  assert.equal(misurato.inizi, 0, `AL CONTRARIO: con lo scarto misurato a 0 (il fornitore conta i soli messaggi) no (${JSON.stringify(misurato)})`);
  const contaDiPiu = await corsa({ scartoMisurato: 0 }, 1_234);
  assert.equal(contaDiPiu.scarto, 1_234, `il giro restituisce ciò che il fornitore ha contato in più (${JSON.stringify(contaDiPiu)})`);
});

/* Revisione 6 della CLI (S4-1): git avviato per il blocco dei fatti sopravviveva al giro quando il riassunto falliva o arrivava lo Stop.
   Ora la preparazione lo aspetta su OGNI uscita, e lo Stop lo ferma. Git rallentato di 400 ms dall'involucro, che rispetta il segnale. */
async function giroConGitLento(t, { fetchDelRiassunto, stopDopoMs = null, ritardo = 400, storiaDa = 6_000 }) {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = '4000';
  t.after(() => { ritardoGitMs = 0; if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
  const cartella = cartellaDiProva('talos-verdetto-git-uscite-');
  const stop = new AbortController();
  lettureGit.length = 0;
  ritardoGitMs = ritardo;
  const fetchDiRete = async (u, o) => {
    const corpo = corpoSenzaMarcatori(o.body);
    if (!corpo.tools?.length) {
      if (stopDopoMs !== null) setTimeout(() => stop.abort(), stopDopoMs).unref();
      return fetchDelRiassunto(o);
    }
    return rispostaFinta('fatto', stima(corpo.messages));
  };
  const inizio = Date.now();
  const ris = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: [...storia(coppiePer(storiaDa)), { role: 'user', content: 'Continua.' }],
    contestoDelProgetto: 'Project files:\n', fetchDiRete, segnaleStop: stop.signal });
  return { ris, ms: Date.now() - inizio, aperti: gitAperti, letture: lettureGit.length };
}

test('VERDETTO-CLI-GIT-02 — git non sopravvive al giro: né con un riassunto che fallisce, né con lo Stop durante il riassunto (che lo ferma)', async (t) => {
  /* alla SOGLIA (4.400 su 4.000, sotto l'emergenza di 4.800): un riassunto fallito lì non ha ripiego senza modello, che aspetterebbe git
     per conto suo — è il caso in cui git restava aperto */
  /* un fallimento IMMEDIATO (un 400, che non si ritenta) e git più lento di lui (1,5 s): se la preparazione non lo aspettasse, il giro
     tornerebbe con git ancora aperto */
  const fallito = await giroConGitLento(t, { storiaDa: 4_400, ritardo: 1_500, fetchDelRiassunto: async () => new Response(JSON.stringify({ error: { message: 'invalid request' } }), { status: 400, headers: { 'Content-Type': 'application/json' } }) });
  assert.ok(fallito.letture >= 1, `premessa: git è partito (${JSON.stringify(fallito)})`);
  assert.equal(fallito.aperti, 0, `riassunto fallito: nessuna lettura di git ancora aperta al ritorno del giro (${JSON.stringify(fallito)})`);
  /* git rallentato di 2 s: se lo Stop non lo fermasse, il giro (che lo aspetta) tornerebbe dopo 2 s */
  const fermato = await giroConGitLento(t, { stopDopoMs: 50, ritardo: 2_000, fetchDelRiassunto: (o) => new Promise((_ok, ko) => {
    const ferma = () => ko(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    if (o.signal?.aborted) ferma(); else o.signal?.addEventListener('abort', ferma, { once: true });
  }) });
  assert.equal(fermato.ris.comeFinita, 'fermato', 'premessa: lo Stop ha fermato il giro');
  assert.ok(fermato.letture >= 1, 'premessa: git era partito');
  assert.equal(fermato.aperti, 0, `Stop: nessuna lettura di git ancora aperta al ritorno del giro (${JSON.stringify({ aperti: fermato.aperti, ms: fermato.ms })})`);
  assert.ok(fermato.ms < 1_000, `e lo Stop non aspetta git lento: lo ferma (${fermato.ms} ms)`);
});
