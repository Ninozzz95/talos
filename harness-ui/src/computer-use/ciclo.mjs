/**
 * Computer use — il CICLO: guarda, chiede al modello, valuta le protezioni, agisce, racconta (a codici) e sa QUANDO SMETTERE.
 *
 * Modulo PURO del kernel: nessuna dipendenza da Windows, Android, browser o modello; tutto entra da PORTE iniettate, così ogni tetto e
 * ogni ramo si prova senza un PC vero (un tetto che nessuno prova è un commento). Forma presa dal pilota del telefono, che la porta
 * da agosto (`mobile/src/lib/agent/pilotaDelloSchermo.ts`: porte guarda/agisci/chiedi/racconta/adesso, freno precondizione, tetti
 * passi/tempo/fallimenti di fila, ogni uscita passa da una sola strozzatura che la traccia; `trovaElemento.ts`: guardia degli ordinali)
 * e adattata al contratto del PC: `Downloads/TALOS/computer-use/in-corso/CONTRATTI-COMPUTER-USE-V2-2026-11-01.md` §2-§8.
 *
 * Revisione avversaria del Mobile (02/11 notte) curata qui:
 *   - un'azione o una domanda al modello che scade si ANNULLA (AbortSignal); se l'azione non conferma l'annullamento entro poco, il
 *     compito si ferma: mai due mani sullo stesso schermo;
 *   - OGNI porta può lanciare: il corpo intero passa dalla strozzatura, e un'eccezione esce come `non-riuscito`/`errore-interno` con
 *     il suo evento di fine; `emetti` che lancia non rompe il ciclo;
 *   - dopo OGNI attesa della persona si rilegge lo schermo e il bersaglio vivo e si rivalutano le protezioni; un bersaglio cambiato
 *     non riceve l'azione (`elemento-sparito`);
 *   - dentro un lotto, dalla seconda azione in poi lo schermo si rilegge: le protezioni vedono la modale aperta dall'azione prima, e il
 *     freno perso a metà lotto ferma;
 *   - tetto alle azioni per lotto e al tempo prima di ogni azione; due «no» della persona alla stessa azione ⇒ fermato;
 *   - l'esito porta `verificato` (null = non si è potuto verificare) e i campi di Performance (null = non misurato, mai assenti).
 */
import { valutaAzione, intenzioniDallaFrase, tettoDallaFrase, eUnaCassa, totaleFinale, dominioSotto } from './protezioni.mjs';
import { rilevaSospetto } from './rilevatore.mjs';
import {
  STATO_GUARDIA_VUOTO, cambiaQualcosa, elencoAppGuardia, elencoGuardia, elencoPassaggio, hostDi, passoGuardia, siDellaPersona, sitoDelicato,
} from './guardia.mjs';

// Tetto di spesa (owner 02/11: «carta alla cassa, oppure un tetto»; condizioni di Desktop, Mobile e Frontend, forma T1-T6):
// si paga da soli solo col TOTALE FINALE etichettato a schermo, nella valuta del tetto, sull'origine del piano, senza sospetto, mai per
// un pagamento che si rinnova, e finché la somma pagata nel compito resta sotto il tetto; altrimenti una carta col totale.
const RICORRENTE = /(?:\/\s*(?:mese|anno|mo|month|year|yr)(?![\p{L}])|al mese|all'anno|mensil|annual|abbonament|abbonati|rinnovo|si rinnova|per month|per year|monthly|yearly|subscription|subscribe|free trial|prova gratuita|renews|ricorrente|recurring)/iu;
const testiDi = (s) => [s?.titolo, ...(Array.isArray(s?.elementi) ? s.elementi : []).map((e) => e?.nome)].filter((x) => typeof x === 'string');
// `totaleFinale` sta in protezioni.mjs (guardia variante A: la cassa forte è titolo + totale + Paga), identico a com'era qui
const siRinnova = (s) => testiDi(s).some((t) => RICORRENTE.test(t));
const METODO_SALVATO = /(?:[•*·]\s?){2,}\d{4}/u;
const metodiDi = (s) => (Array.isArray(s?.elementi) ? s.elementi : []).filter((x) => METODO_SALVATO.test(String(x?.nome ?? '')));
// T11: lo stato «scelto» viene dal contratto degli elementi (§4: `stato.selezionato`, `stato.acceso`)
const giaScelto = (e) => e?.stato?.selezionato === true || e?.stato?.acceso === true;
const metodoDi = (s) => {
  const tutti = metodiDi(s);
  const e = tutti.find(giaScelto) ?? tutti[0]; // la carta della cassa dice quello che la pagina ha già scelto (Mobile, T11)
  return e ? String(e.nome).slice(0, 40) : null;
};
// il codice di sicurezza della carta (CVV/CVC) è un segreto della persona: lo scrive lei, come la verifica della banca (Mobile, T11)
const CAMPO_CODICE_CARTA = /(?:cvv|cvc|cid|codice di sicurezza|security code|card verification)/iu;
const chiedeIlCodice = (e) => e?.ruolo === 'campo' && (CAMPO_CODICE_CARTA.test(String(e.nome ?? '')) || e?.segnali?.autocomplete === 'cc-csc');
const stessoRef = (a, b) => Boolean(a && b) && (a.ref != null && b.ref != null ? a.ref === b.ref : a.nome === b.nome);
// Il destinatario di un invio si legge dallo schermo (osservazione del Mobile): la conversazione dichiarata o la testata; altrimenti null
const destinatarioDi = (s) => {
  if (typeof s?.conversazione === 'string' && s.conversazione.trim()) return s.conversazione.trim();
  const t = (Array.isArray(s?.elementi) ? s.elementi : []).find((e) => e?.ruolo === 'intestazione' && typeof e.nome === 'string' && e.nome.trim());
  return t ? t.nome.trim() : null;
};
// T7: una casella che dice solo di aver letto l'informativa (privacy) è coperta dalla carta iniziale; termini, condizioni e contratti no
const SOLO_INFORMATIVA = /(?:informativa|privacy|trattamento dei dati|ho letto)/iu;
const CONTRATTO = /(?:termini|condizioni|contratt|eula|licenz|license|terms|conditions|abbonament|subscription)/iu;
// T9 (Mobile): una verifica della banca (3-D Secure, codice via SMS, app della banca) è la firma della persona: TALOS non la tocca mai
const VERIFICA_BANCA = /(?:3-?d ?secure|verified by visa|mastercard (?:id check|securecode)|safekey|autorizza (?:il pagamento )?(?:nell'|con l'|sull')app|conferma (?:nell'|sull'|con l')app (?:della (?:tua )?)?banca|inserisci il codice (?:ricevuto|inviato)|codice (?:otp|sms|di sicurezza) (?:ricevuto|inviato)|approve (?:the payment )?in your (?:banking )?app)/iu;
// UN SOLO estrattore di nomi dalla frase della persona (revisioni della CLI CU-1, CU-4, CU-5; Desktop 02/11: «chiudi la malattia
// alla radice»). Una copertura che toglie una carta NON riconosce mai la volontà della persona da parole sparse della frase: estrae
// il NOME che segue una parola-guida, e lo confronta PER INTERO con ciò che legge a schermo. Un nome solo: zero nomi o due nomi diversi
// (anche «Per Natale scrivi a Marco») ⇒ nessun nome ⇒ si chiede.
const pulisci = (w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
const pezzi = (x) => String(x ?? '').normalize('NFC').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const piana = (w) => w.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
// - destinatario (CU-1): le parole con la maiuscola SUBITO dopo «a/ad/al/alla/…/per/to»;
// - metodo (CU-5): la prima parola dopo «con/usando/with/using/tramite» che non sia un articolo o una parola generica (marca,
//   «aziendale», ultime quattro cifre); la maiuscola non serve;
// - cartella (T10): le parole con la maiuscola dopo «cartella/folder» o subito dopo il verbo (svuota, cancella, elimina…), saltati gli
//   articoli.
const GUIDE = Object.freeze({
  destinatario: { dopo: new Set(['a', 'ad', 'al', 'allo', 'alla', 'ai', 'agli', 'alle', 'per', 'to']), salta: new Set(), maiuscola: true, una: false },
  metodo: {
    dopo: new Set(['con', 'usando', 'using', 'with', 'tramite']),
    salta: new Set(['la', 'il', 'lo', 'l', 'le', 'i', 'gli', 'mia', 'mio', 'my', 'the', 'a', 'an', 'carta', 'card', 'conto', 'account', 'che',
      'finisce', 'termina', 'ending', 'in', 'per', 'di', 'del', 'della', 'credito', 'debito', 'credit', 'debit']),
    maiuscola: false, una: true,
  },
  cartella: {
    dopo: new Set(['cartella', 'folder', 'svuota', 'cancella', 'elimina', 'pulisci', 'empty', 'delete', 'clear']),
    salta: new Set(['la', 'il', 'lo', 'l', 'the', 'mia', 'my', 'cartella', 'folder', 'di', 'della', 'dalla']), maiuscola: true, una: false,
  },
});
const nomeNellaFrase = (frase, tipo) => {
  const g = GUIDE[tipo];
  const parole = String(frase ?? '').normalize('NFC').split(/\s+/u).map(pulisci).filter(Boolean);
  const trovati = new Map();
  for (let i = 0; i < parole.length; i += 1) {
    if (!g.dopo.has(piana(parole[i]))) continue;
    let j = i + 1;
    while (j < parole.length && g.salta.has(piana(parole[j]))) j += 1;
    const nome = [];
    if (g.una) { if (j < parole.length) nome.push(...pezzi(parole[j])); } else {
      for (; j < parole.length && /^\p{Lu}/u.test(parole[j]); j += 1) nome.push(...pezzi(parole[j]));
    }
    if (nome.length) {
      const n = nome.map(piana);
      trovati.set(n.join(' '), n);
    }
  }
  // nessun nome ⇒ null; due nomi diversi ⇒ [] (AMBIGUO: non combacia con niente, e non vale come «nessun nome»)
  return trovati.size === 0 ? null : (trovati.size === 1 ? [...trovati.values()][0] : []);
};
// il confronto è PER INTERO: `uguale` = esattamente le stesse parole (testata, cartella: niente in più, niente in meno); `dentro` = tutte
// le parole del nome stanno, intere, fra quelle che distinguono l'oggetto (metodo: «Mastercard» in «Mastercard •••• 1111 (aziendale)»)
const combaciaPerIntero = (nome, paroleLette, modo) => {
  if (!nome?.length || !Array.isArray(paroleLette) || paroleLette.length === 0) return false;
  if (!nome.every((p) => paroleLette.includes(p))) return false;
  return modo === 'dentro' || paroleLette.every((p) => nome.includes(p));
};
const paroleDi = (testo) => pezzi(testo).map(piana);
// le parole che distinguono un metodo salvato: la marca e gli altri nomi, e le ULTIME QUATTRO cifre esatte
const distintiveDelMetodo = (m) => {
  const nome = String(m?.nome ?? '');
  const cifre = /(\d{4})(?!.*\d)/u.exec(nome.match(METODO_SALVATO)?.[0] ?? '')?.[1];
  const parole = paroleDi(nome.replace(METODO_SALVATO, ' ')).filter((p) => !/^\d+$/u.test(p) && !GUIDE.metodo.salta.has(p));
  return cifre ? [...parole, cifre] : parole;
};
// T10 (CU-3): la cartella si legge dal titolo SOLO in Esplora file; in un browser il titolo è quello della pagina
const ESPLORA_FILE = /^(?:esplora file|esplora risorse|file explorer|windows explorer|explorer(?:\.exe)?)$/iu;
const tettoValido = (t) => (t && typeof t === 'object' && Number.isFinite(t.importo) && t.importo > 0 && ['EUR', 'USD', 'GBP', 'CHF'].includes(t.valuta)
  ? { importo: t.importo, valuta: t.valuta } : null);

/** Tetti di partenza: quelli del telefono (owner 10/08); sul PC si tarano sul banco e arrivano dalle impostazioni (`tettoPassi`…). */
// `msAttesaPermesso`: quanto si aspetta la persona davanti alla riga «Posso» prima di chiudere (condizione del Desktop, 02/11)
export const LIMITI_PREDEFINITI = Object.freeze({ passi: 20, millisecondi: 120_000, fallimentiDiFila: 2, msPerPasso: 25_000, azioniPerLotto: 10, msAnnullamento: 2_000, msAttesaPermesso: 600_000 });
/** Le protezioni che una voce della riga «Posso» può sbloccare, e la voce (owner 02/11: §1 = A). */
const VOCE_DELLA_PROTEZIONE = Object.freeze({ pagamento: 'pagare', invio: 'inviare', cancellazione: 'cancellare' });
const GIRI_DEL_PERMESSO = 3; // «aggiunto» che non basta (per esempio col sospetto): si richiede, ma non all'infinito

// Un «sì» vale per UNA operazione (censimento delle interruzioni T2, condizioni del Mobile, 02/11): stessa protezione col suo motivo,
// stessa origine e stessa pagina (titolo), per un pagamento lo stesso importo a schermo; si consuma quando si lascia la pagina o quando
// un'azione fatta sotto quel sì cambia la finestra; un sospetto acceso dopo il sì lo revoca. Senza titolo o senza origine non vale mai.
const IMPORTO = /(?:€|eur|euro|\$|usd|£|chf)\s*\d[\d.,\s]*\d|\d[\d.,]*\s*(?:€|eur|euro|\$|usd|£|chf)(?![\p{L}])/giu;
const importiDi = (s) => {
  const visti = new Set();
  for (const t of [s?.titolo, ...(Array.isArray(s?.elementi) ? s.elementi : []).map((e) => e?.nome)]) {
    for (const m of String(t ?? '').matchAll(IMPORTO)) visti.add(m[0].replace(/[^\d,.]/gu, ''));
  }
  return [...visti].sort().join('|');
};
// C4 (revisione R, 04/11): il sì a un pagamento vale per il TOTALE che la carta ha mostrato, non solo per l'insieme degli importi a
// schermo (scambio 45 €/450 €: stesso insieme, totale diverso). '' se il totale etichettato non si legge.
const chiaveTotale = (s) => { const t = totaleFinale(s); return t ? `${t.importo}|${t.valuta}` : ''; };
const origineDi = (s) => (s && typeof s === 'object' && (s.origine || s.dominio || s.app)) || null;
// la guardia legge solo l'indirizzo (revisione Q, D2): il nome dell'app non è un'origine e la regola lo riceve a parte
const origineWebDi = (s) => (s && typeof s === 'object' && (s.origine || s.dominio)) || null;
const paginaDi = (s) => (s && typeof s === 'object' && typeof s.titolo === 'string' && s.titolo) || null;
// Pagamento (revisione del Desktop su 95a21bc45, S2): il sì passa SOLO dal pulsante che avvia («Paga ora», «Compra») a quello che
// conferma («Conferma pagamento») lo stesso importo letto a schermo, e UNA volta. Senza importo leggibile, o con un secondo pulsante che
// avvia (due «Compra ora» sulla stessa pagina), si chiede sempre. Una cancellazione chiede sempre.
const AVVIA_PAGAMENTO = /(?<![\p{L}\p{N}])(?:compra|acquista|paga|pagare|buy|purchase|ordina|order|prenota|book|abbonati|subscribe|ricarica|dona|donate)(?![\p{L}\p{N}])/u;
const CONFERMA_PAGAMENTO = /(?<![\p{L}\p{N}])(?:conferma|confermo|confirm|completa|complete|autorizza|authorize|approva|approve|verifica|verify|procedi|proceed|continua|continue|prosegui|ok|si|yes)(?![\p{L}\p{N}])/u;
const etichetta = (b) => String(b?.nome ?? '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
const confermaDelloStessoPagamento = (bersaglio) => {
  const t = etichetta(bersaglio);
  return CONFERMA_PAGAMENTO.test(t) && !AVVIA_PAGAMENTO.test(t);
};
// dopo il CVV della persona: un pulsante che paga o che conferma un pagamento («Paga», «Conferma pagamento»); «Continua» o «Torna al
// sito» da soli no, sono le pagine d'esito
const PAROLA_DEL_PAGAMENTO = /(?<![\p{L}\p{N}])(?:pagamento|ordine|acquisto|payment|order|purchase)(?![\p{L}\p{N}])/u;
const pulsanteDelPagamento = (e) => e?.ruolo === 'pulsante'
  && (AVVIA_PAGAMENTO.test(etichetta(e)) || (CONFERMA_PAGAMENTO.test(etichetta(e)) && PAROLA_DEL_PAGAMENTO.test(etichetta(e))));
export const ESITI_AZIONE = Object.freeze(['confermata', 'non-verificabile', 'probabilmente-a-vuoto', 'rifiutata', 'non-eseguita']);
export const EVENTI = Object.freeze({
  passo: 'talos.computer-use-passo', fermato: 'talos.computer-use-fermato', protezione: 'talos.computer-use-protezione',
  pausa: 'talos.computer-use-pausa', esito: 'talos.computer-use-esito',
  // la riga «Posso» cambiata dalla persona a metà compito: nella traccia resta CHI ha permesso cosa (Mobile, 02/11)
  permessi: 'talos.computer-use-permessi',
  // la modalità guardia sui siti delicati (decisione 145): la carta «Sto guardando» chiesta e il sì dato. Solo aggiunte.
  guardia: 'talos.computer-use-guardia',
  // il cursore che arriva PRIMA del clic (Desktop 05/11, decisione 252): finestra, punto, t0, durata, modo; il clic parte a t0+durata
  annuncio: 'talos.computer-use-annuncio',
  // dove il modello guarda quando legge senza agire (Desktop 05/11): solo la finestra
  guarda: 'talos.computer-use-guarda',
});
// il volo interrotto (Stop o tetto) prima del clic: l'azione non è partita
const NON_PARTITA = Symbol('non-partita');
const FETTA_DEL_VOLO_MS = 50;
const FALLIMENTI = new Set(['rifiutata', 'probabilmente-a-vuoto']);
// chi ha il mouse (Desktop 05/11/2026 18:34): 'preso' = TALOS, 'sottofondo' = la persona (l'aiutante agisce senza il puntatore vero)
const MODI = new Set(['preso', 'sottofondo']);
/* 04/11/2026 (revisione del passo 5, difetto 10c): `permesso-ridotto` = la persona ha abbassato il livello a metà compito; ferma come lo Stop */
const FERMI_DELLA_PERSONA = new Set(['mano-della-persona', 'pulsante-ferma', 'scorciatoia', 'permesso-ridotto']);
/* 04/11/2026 (revisione del passo 5, difetto 2): una carta che non si è potuta mostrare (il canale delle domande ha lanciato) NON è lo Stop
   della persona: ha il suo motivo. Lo schermo, che non lo conosce, dice la frase generica (`parole.js`). */
const DOMANDA_NON_MOSTRATA = 'domanda-non-mostrata';
const ERRORE_DELLA_CARTA = Symbol('carta-non-mostrata');
const motivoDelNo = (r) => (r === 'scaduta' ? 'attesa-scaduta' : (r === 'errore' ? DOMANDA_NON_MOSTRATA : 'pulsante-ferma'));
const TIPI_CON_ORDINALE = new Set(['premi', 'clic', 'scegli']);

// Guardia degli ordinali (pilota del telefono, `trovaElemento.ts`): «il primo» è il primo che la persona VEDE nella lista.
// ⛔ Le cifre nude («compra 2 biglietti») NON sono ordinali qui: sul PC una quantità è molto più comune di «il 2».
const ORDINALI = Object.freeze({ primo: 1, prima: 1, first: 1, secondo: 2, seconda: 2, second: 2, terzo: 3, terza: 3, third: 3, ultimo: -1, ultima: -1, last: -1 });
function leggiOrdinale(testo) {
  for (const parola of String(testo ?? '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').split(/[^\p{L}\p{N}]+/u)) {
    if (Object.hasOwn(ORDINALI, parola)) return ORDINALI[parola];
  }
  return null;
}
function nesimoInLista(elementi, ordinale) {
  const inLista = (Array.isArray(elementi) ? elementi : []).filter((e) => e && e.inLista && typeof e.nome === 'string' && e.nome !== '');
  if (inLista.length === 0) return null;
  return (ordinale === -1 ? inLista[inLista.length - 1] : inLista[ordinale - 1]) ?? null; // «il terzo» quando sono due: nessuno
}

/**
 * Chiama una porta con un tetto e un segnale di annullamento. Scaduto ⇒ si annulla e si aspetta `msAnnullamento` che la porta lo
 * confermi chiudendo la sua promessa: `{ scaduto: true, chiusa }`. In errore ⇒ `{ errore }`. Mai un'eccezione che esce.
 */
async function conTetto(chiama, ms, msAnnullamento) {
  const ctl = new AbortController();
  let promessa;
  try { promessa = Promise.resolve(chiama(ctl.signal)); } catch (errore) { return { errore }; }
  const esito = promessa.then((v) => ({ v }), (errore) => ({ errore }));
  let timer;
  const scadenza = new Promise((ok) => { timer = setTimeout(() => ok({ scaduto: true }), ms); });
  const primo = await Promise.race([esito, scadenza]);
  clearTimeout(timer);
  if (!primo.scaduto) return primo;
  ctl.abort();
  let t2;
  const grazia = new Promise((ok) => { t2 = setTimeout(() => ok(null), msAnnullamento); });
  const dopo = await Promise.race([esito, grazia]);
  clearTimeout(t2);
  return { scaduto: true, chiusa: dopo !== null };
}
const tipoDi = (azione) => (azione && typeof azione === 'object' ? String(azione.tipo ?? '') : '');
const breve = (b) => (b && typeof b === 'object' ? { ruolo: b.ruolo ?? null, nome: typeof b.nome === 'string' ? b.nome.slice(0, 80) : null } : null);
const stessoElemento = (a, b) => Boolean(a && b) && (a.ref ?? null) === (b.ref ?? null) && a.ruolo === b.ruolo && a.nome === b.nome;
const chiaveAzione = (azione, bersaglio) => `${tipoDi(azione)}|${bersaglio?.ref ?? ''}|${bersaglio?.nome ?? ''}`;

// Le finestre di TALOS (la bolla, il cursore): invisibili alle catture, sempre sopra, prendono i clic. Il modello vede il pulsante che sta
// SOTTO e TALOS premerebbe i propri, «Ferma» e le carte comprese (S4). Zone in pixel fisici, semiaperte come i pixel; malformate = scartate.
// Fonti unite: l'aiutante (`s.zoneDiTalos`, fonte prima) e il guscio (`porte.zoneDiTalos()`, `rettangoloFisico`). (Desktop, 03/11)
const zonaValida = (z) => Boolean(z) && typeof z === 'object' && [z.x, z.y, z.w, z.h].every(Number.isFinite) && z.w > 0 && z.h > 0;
const zoneDa = (lista) => (Array.isArray(lista) ? lista.filter(zonaValida).map(({ x, y, w, h }) => ({ x, y, w, h })) : []);
const nellaZona = (zone, p) => Boolean(p) && zone.some((z) => p.x >= z.x && p.x < z.x + z.w && p.y >= z.y && p.y < z.y + z.h);
const centroDi = (e) => {
  const r = e && typeof e === 'object' ? e.rettangolo : null;
  return r && [r.x, r.y, r.w, r.h].every(Number.isFinite) ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : null;
};
const puntoDi = (p) => (p && typeof p === 'object' && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null);
// le azioni che arrivano a un punto dello schermo; `tasti`, `aspetta`, `apri`, `programma` vanno alla finestra col fuoco
const SPAZIALI = new Set(['premi', 'scegli', 'clic', 'trascina', 'hover', 'scorri', 'scrivi', 'zoom']);
const puntiDellAzione = (azione, bersaglio, s) => {
  const el = (ref) => (Array.isArray(s?.elementi) ? s.elementi : []).find((e) => e?.ref === ref) ?? null;
  const punti = [centroDi(bersaglio), puntoDi(azione)];
  if (tipoDi(azione) === 'trascina') for (const k of ['da', 'a']) punti.push(typeof azione[k] === 'string' ? centroDi(el(azione[k])) : puntoDi(azione[k]));
  return punti.filter(Boolean);
};

/**
 * Quanto vola il cursore prima del clic (Desktop 05/11/2026, decisione 252), in ms: 250 + 12·√distanza in pixel, fra 250 e 850.
 * Senza un punto di partenza valido (prima azione, punto rotto) vale 850: il cursore entra da fuori. Col moto ridotto vale 0.
 * Pura: stessi argomenti, stesso risultato; il clic parte a t0 + questa durata.
 */
export function durataDelVolo(da, a, { ridotto = false } = {}) {
  if (ridotto === true) return 0;
  const p = puntoDi(a); const q = puntoDi(da);
  if (!p || !q) return 850;
  const distanza = Math.hypot(p.x - q.x, p.y - q.y);
  return Math.min(850, Math.round(250 + 12 * Math.sqrt(distanza))); // √ ≥ 0: il pavimento 250 viene dalla formula
}
// i campi dell'esito chiesti dal Frontend (03/11): null = non si sa, e lo schermo usa la frase di ripiego
const ASSENZE = new Set(['binario', 'non-windows', 'senza-schermo', 'spento']);
const DISPOSITIVI = new Set(['mouse', 'tastiera']);
const nomiDa = (x) => (Array.isArray(x) ? x.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim()) : []);

/**
 * Esegue un compito fino alla fine o al primo tetto. Non lancia mai: ogni uscita è un esito con il suo evento.
 * @param {object} a
 * @param {string} a.testoDellaPersona — le parole della PERSONA (non il prompt costruito): intenzioni, piano e ordinali solo da qui.
 * @param {{ domini?: string[], app?: string[] }} a.piano — fissato PRIMA della prima `guarda()`, dalla frase della persona (contratto §2).
 * @param {object} a.politica — una delle POLITICHE di `protezioni.mjs` (argomento, condizione del Mobile).
 * @param {object} a.porte — guarda(segnale), chiedi(input, segnale), agisci(azione, bersaglio, segnale), bersaglio(azione, sguardo),
 *   chiediPersona, attendiRipresa?, scegliRiservato?, fermato?, confermaObiettivo?, emetti, adesso; zoneDiTalos?() (la bolla, dal guscio),
 *   ricordaLuoghi?({ domini, app }, segnale) (salva «Consenti sempre»); attendi?(ms, segnale) (le fette del volo del cursore,
 *   di serie setTimeout); motoRidotto? (true, o una funzione che dà true: il cursore non vola, il clic parte subito).
 * @param {object} [a.limiti]
 * @param {{ domini?: string[], app?: string[] }} [a.luoghiRicordati] — l'elenco di «Consenti sempre», letto da chi monta il ciclo
 *   (impostazioni del PC, owner 03/11). Decisione 239 (owner 05/11): la carta iniziale c'è sempre, anche coi luoghi tutti ricordati.
 *   Un browser senza il sito letto dalla sua barra (`s.browser`, nessun `s.dominio`) non è un luogo ricordato.
 * @param {string[]} [a.appBrowser] — i nomi d'app che sono browser, da chi monta il ciclo (riserva B della revisione del quarto giro):
 *   un browser del piano la carta iniziale non lo segna come ricordato per il nome dell'app.
 * @param {object} [a.politicaLuoghiRicordati] — decisione 237 (owner 05/11): la politica per le azioni in un luogo ricordato («Consenti
 *   sempre», dall'elenco o dato in questo compito). Sul PC è `pcConsentiSempre`: salta la carta solo la cancellazione chiesta dalla
 *   persona (decisioni 149, 170 e 239); segreti, consenso, pagamenti e invii chiedono come in Normale. Senza, vale `politica` ovunque.
 * @param {{ accesa?: boolean, aggiunti?: string[], appAggiunte?: string[] }} [a.guardia] — la modalità guardia (decisione 145,
 *   `computerUse.guardia`), spenta di serie: su un sito o in un'app dell'elenco (145 bis: app per nome del pacchetto, `s.app`) si va
 *   avanti solo dopo il «Sto guardando» della persona, che vale 5 minuti lì, e UNA azione per passo. La carta la apre il ciclo, mai il
 *   modello; per un'app carta ed evento portano `genere: 'app'`.
 */
export async function eseguiCompito({ testoDellaPersona, piano = { domini: [], app: [] }, politica, porte, limiti = LIMITI_PREDEFINITI, valuta = valutaAzione,
  luoghiRicordati = { domini: [], app: [] }, guardia = { accesa: false, aggiunti: [] }, politicaLuoghiRicordati = null, appBrowser = [] }) {
  if (!porte || typeof porte.guarda !== 'function' || typeof porte.chiedi !== 'function' || typeof porte.agisci !== 'function') {
    throw new TypeError('eseguiCompito: servono le porte guarda, chiedi, agisci'); // errore di chi monta il ciclo, prima di partire
  }
  const adesso = typeof porte.adesso === 'function' ? () => { try { return Number(porte.adesso()) || 0; } catch { return 0; } } : () => Date.now();
  const emetti = (nome, dati) => { try { if (typeof porte.emetti === 'function') porte.emetti(nome, dati); } catch { /* un evento perso non ferma il ciclo */ } };
  const lim = { ...LIMITI_PREDEFINITI, ...limiti };
  // il modo è dell'ospite (Hermes tools_config.py:362: il fondo è del motore cua-driver); mai nullo negli eventi
  const modo = MODI.has(porte.modo) ? porte.modo : 'sottofondo';
  // guardia: accesa solo con `true` esatto; l'orologio suo dà NaN quando la porta fallisce (mai lo 0 del ciclo: un sì preso con l'orologio
  // rotto varrebbe per sempre), e la regola pura con NaN chiede di nuovo
  const guardiaAccesa = guardia !== null && typeof guardia === 'object' && guardia.accesa === true;
  const elencoDellaGuardia = guardiaAccesa ? elencoGuardia(guardia.aggiunti) : [];
  const elencoAppDellaGuardia = guardiaAccesa ? elencoAppGuardia(guardia.appAggiunte) : [];
  let statoGuardia = STATO_GUARDIA_VUOTO;
  // al più due carte di fila senza un'azione fatta in mezzo (schermo che resta spento, sito che cambia da solo): alla terza ci si ferma
  let carteGuardiaDiFila = 0; let azioniAlSiGuardia = -1;
  const oraDellaGuardia = () => {
    try { const v = typeof porte.adesso === 'function' ? Number(porte.adesso()) : Date.now(); return v > 0 ? v : NaN; } catch { return NaN; }
  };
  // le app «di passaggio» (tendina, tastiera, la carta di TALOS) con le aggiunte di chi monta il ciclo (la tastiera attiva, il processo)
  const passaggioDellaGuardia = guardiaAccesa ? elencoPassaggio(guardia.passaggio) : [];
  // Variante A (owner 04/11): il sì è UNO per compito (catena SPID compresa) e sostituisce il registro per sito (O2). `statoGuardia`
  // dice soltanto dove si è (sito e app); la data del sì sta qui
  let siDelCompito = null;
  // D7 (owner 04/11): una pagina di cassa che le protezioni riconoscono entra nella guardia; letta una volta per schermata
  const casse = new WeakMap();
  const cassaDi = (s) => {
    if (!guardiaAccesa || !s || typeof s !== 'object') return false;
    if (!casse.has(s)) casse.set(s, eUnaCassa(s));
    return casse.get(s);
  };
  const valutaGuardia = (s, origine, cassa) => passoGuardia({ accesa: guardiaAccesa, origine, app: s?.app ?? null, elenco: elencoDellaGuardia,
    elencoApp: elencoAppDellaGuardia, stato: { ...statoGuardia, siAl: siDelCompito }, adesso: oraDellaGuardia(),
    schermoSpento: s?.schermoSpento === true, passaggio: passaggioDellaGuardia, cassa });
  const guardiaDi = (s) => valutaGuardia(s, origineWebDi(s), cassaDi(s));
  // D3 (owner 04/11): l'elemento dentro un riquadro di un sito delicato (un iframe di pagamento) accende la guardia per quell'azione.
  // Limite dichiarato: un clic a coordinate su un'altra finestra non porta l'origine del riquadro
  const guardiaPerAzione = (s, bersaglio) => {
    const o = bersaglio && typeof bersaglio === 'object' ? bersaglio.origine : null;
    const h = o ? hostDi(o) : null;
    return h !== null && sitoDelicato(h, elencoDellaGuardia) ? valutaGuardia(s, o, false) : guardiaDi(s);
  };
  // la riga della guardia, da sola (la carta «Sto guardando») o dentro un'altra carta (protezione, luogo nuovo): una domanda sola
  const rigaDellaGuardia = (g) => ({ sito: g.sito, perche: g.motivo, rinnovo: 'ogni-5-minuti-di-azioni', ...(g.genere === 'app' ? { genere: 'app' } : {}) });
  // la guardia da chiedere per QUESTA azione: `chiedi` sempre (orologio, schermo spento); dentro senza sì fresco solo se l'azione cambia qualcosa
  const guardiaDaChiedere = (g, azione, bersaglio, v) => (g.esito === 'chiedi'
    || (g.esito === 'dentro' && g.fresco !== true && cambiaQualcosa(azione, bersaglio, v, politica, piano)) ? g : null);
  // il «Sto guardando» dato: il sì del compito, il posto con l'app (D2). Sul PC il sì su una pagina di cassa vale come sì T2 del
  // pagamento, legato a origine, pagina e importi (owner 04/11); sul telefono il pagamento resta fermo (Mobile). false: orologio rotto
  const segnaSiDellaGuardia = (g, s, azione) => {
    const ora = oraDellaGuardia();
    if (!Number.isFinite(ora)) return false;
    siDelCompito = ora;
    statoGuardia = siDellaPersona(g.sito, ora, s?.app ?? null);
    azioniAlSiGuardia = misure.azioni;
    emetti(EVENTI.guardia, { passo: n, sito: g.sito, motivo: g.motivo, fase: 'si', ...(g.genere === 'app' ? { genere: 'app' } : {}) });
    storia.push(`passo ${passi}: ${g.genere === 'app' ? 'app' : 'sito'} delicat${g.genere === 'app' ? 'a' : 'o'} ${g.sito}, la persona guarda`);
    if (politica?.piattaforma !== 'telefono' && cassaDi(s) && importiDi(s) !== '' && !siAttivi.some((e) => e.daCassa && e.pagina === paginaDi(s))) {
      const e = ricordaSi({ protezione: 'pagamento', motivo: null }, s, azione ?? { tipo: 'guardia' });
      e.daCassa = true;
      storia.push(`passo ${passi}: il sì alla cassa vale come conferma del pagamento di questa pagina`);
    }
    return true;
  };
  // la carta «Sto guardando» (decisione 145): null se la persona guarda e il sì ha una data, altrimenti il motivo con cui chiudere.
  // La chiamano la cima del giro (orologio, schermo spento) e il punto subito prima di un'azione che cambia qualcosa (variante A).
  const cartaDellaGuardia = async (g, s, azione = null) => {
    carteGuardiaDiFila = misure.azioni === azioniAlSiGuardia ? carteGuardiaDiFila + 1 : 0;
    if (carteGuardiaDiFila >= 2) return 'guardia';
    const genere = g.genere === 'app' ? { genere: 'app' } : {};
    emetti(EVENTI.guardia, { passo: n, sito: g.sito, motivo: g.motivo, fase: 'chiedi', ...genere });
    if (typeof porte.chiediPersona !== 'function') return 'guardia';
    const r = await aspettandoLaPersona(() => conTetto((segnale) => porte.chiediPersona({ motivo: 'guardia', tipo: 'guardia', ...rigaDellaGuardia(g) }, segnale),
      lim.msAttesaPermesso, lim.msAnnullamento));
    if (r.scaduto) return 'attesa-scaduta';
    if (r.errore) return DOMANDA_NON_MOSTRATA; // la carta non si è potuta mostrare: come le altre carte (ccd9)
    if (r.v !== 'si') return 'pulsante-ferma';
    if (!segnaSiDellaGuardia(g, s, azione)) return 'guardia'; // orologio illeggibile: il sì non si può datare
    return null;
  };
  // D6 (owner 04/11): una risposta a un'altra carta rinnova il sì della guardia SOLO se data sullo schermo pilotato (la porta lo dice);
  // dal telefono, o senza la porta, no. Vale qualunque risposta: la persona era davanti allo schermo. Rinnova, non crea
  const sulloSchermo = () => { try { return typeof porte.rispostaSulloSchermo === 'function' && porte.rispostaSulloSchermo() === true; } catch { return false; } };
  const rinnovaSiDelCompito = () => {
    if (!guardiaAccesa || !Number.isFinite(siDelCompito)) return;
    const ora = oraDellaGuardia();
    if (Number.isFinite(ora) && ora >= siDelCompito) siDelCompito = ora;
  };
  const chiediAllaPersona = async (q, segnale) => {
    const r = await porte.chiediPersona(q, segnale);
    if (q?.motivo !== 'guardia' && sulloSchermo()) rinnovaSiDelCompito();
    return r;
  };
  const contesto = { richiesta: intenzioniDallaFrase(testoDellaPersona), piano, sospetto: false, testoDellaPersona: String(testoDellaPersona ?? '') };
  // il tetto viene SOLO dalle parole della persona o dalla riga «Posso» (condizione del Desktop), mai dal modello o da una pagina
  let tetto = tettoDallaFrase(testoDellaPersona); let fonteTetto = tetto ? 'frase' : null;
  let speso = 0; let ultimoSottoTetto = null; const spese = [];
  // chi ha deciso ogni azione delicata (Frontend): 'frase' | 'tocco-posso' | 'si-carta' | 'serie' | 'permesso'
  const fonteVoce = { pagare: 'frase', inviare: 'frase', cancellare: 'frase' }; const decisioni = [];
  const citazione = String(testoDellaPersona ?? '').slice(0, 80);
  // C10 (revisione PR19): ogni confronto di domini del ciclo passa da `dominioSotto`, che non accetta un suffisso pubblico come sito
  const nelPianoDi = (s) => (piano?.domini ?? []).some((x) => dominioSotto(s?.dominio, x));
  // l'ordinale vale finché non è stato rispettato UNA volta su una lista (verifica del Mobile V3): «apri il primo contatto» non
  // impone «il primo» anche ai messaggi dentro quella chat
  let ordinale = leggiOrdinale(testoDellaPersona);
  const partenza = adesso();
  let fermo = 0; // millisecondi passati ad aspettare la persona: l'orologio dei tetti è fermo (Mobile)
  const storia = []; const protezioni = [];
  let passi = 0; let fallimenti = 0; let n = 0;
  const misure = { richieste: 0, catture: 0, azioni: 0, azioniFallite: 0, azioniRitentate: 0, msModello: 0, msAiutante: 0, msAttesa: 0 };
  const rifiuti = new Map();
  const siAttivi = []; const conferme = []; // T2: i sì validi adesso, e tutti quelli dati (per l'esito finale)
  let noMiste = 0; // S-5: i «no» alla carta del pulsante illeggibile, per compito; al secondo ci si ferma
  const siValido = (v, s, bersaglio) => {
    if (v.protezione === 'cancellazione') return null;
    // un'azione che non si sa valutare non ha un'operazione da aprire: il sì vale per lei sola (C5, S-5)
    if (v.protezione === null) return null;
    // il sì alla cassa della guardia (variante A, PC) vale per il pulsante che paga quell'importo su quella pagina, una volta
    return siAttivi.find((e) => e.protezione === v.protezione && (e.motivo === v.motivo || e.daCassa === true) && e.origine !== null
      && e.origine === origineDi(s) && e.pagina !== null && e.pagina === paginaDi(s)
      && (v.protezione !== 'pagamento' || (e.importi !== '' && e.importi === importiDi(s) && e.totale !== '' && e.totale === chiaveTotale(s) && (e.daCassa === true || confermaDelloStessoPagamento(bersaglio))))
      // un invio vale solo verso lo STESSO destinatario letto a schermo; se il destinatario non si legge, ogni invio chiede (Mobile)
      && (v.protezione !== 'invio' || (e.destinatario !== null && e.destinatario === destinatarioDi(s)))
      && !(contesto.sospetto && !e.sospetto)) ?? null;
  };
  // il sì apre un'operazione: vale per le azioni dopo con la stessa protezione, sulla stessa pagina (T2, Mobile)
  const ricordaSi = (v, s, azione) => {
    const nuovo = { protezione: v.protezione, motivo: v.motivo, origine: origineDi(s), pagina: paginaDi(s), importi: importiDi(s), totale: chiaveTotale(s),
      destinatario: destinatarioDi(s), sospetto: contesto.sospetto, passo: n, azioni: [tipoDi(azione)] };
    siAttivi.push(nuovo); conferme.push(nuovo);
    return nuovo;
  };
  const consumaSi = (e) => { const k = siAttivi.indexOf(e); if (k >= 0) siAttivi.splice(k, 1); };
  // lasciare la pagina o l'origine chiude l'operazione
  const lasciaPagina = (s) => { for (const e of [...siAttivi]) if (e.origine !== origineDi(s) || e.pagina !== paginaDi(s)) consumaSi(e); };

  const trascorso = () => adesso() - partenza - fermo;
  // la presa della persona si annuncia all'inizio e alla fine (Frontend: pillola «Non guardo lo schermo finché non riprendi»)
  let ultimaAttesaMs = null; let ultimaAssenza = null; let ultimoDispositivo = null;
  // dove il cursore annunciato si è fermato l'ultima volta: la partenza del volo dopo
  let ultimoPunto = null;
  const aspettandoLaPersona = async (fn) => {
    const t0 = adesso();
    emetti(EVENTI.pausa, { motivo: 'persona', fase: 'inizio' });
    try { return await fn(); } finally {
      const d = adesso() - t0; fermo += d; misure.msAttesa += d; ultimaAttesaMs = d;
      emetti(EVENTI.pausa, { motivo: 'persona', fase: 'fine' });
    }
  };
  // ⛔ La strozzatura: ogni uscita passa da qui, quindi non esiste un'uscita muta (pilota del telefono, 13/08).
  const chiudi = (esito, motivo, extra = {}) => {
    // le azioni fatte sotto ogni sì, col passo in cui è stato dato (Mobile, T2)
    const sottoISi = conferme.map((e) => ({ passo: e.passo, protezione: e.protezione, azioni: [...e.azioni] }));
    // Frontend (03/11): con che cosa la persona ha preso il computer, perché l'aiutante manca, quanto si è aspettato. Solo aggiunte.
    const dettagli = { dispositivo: motivo === 'mano-della-persona' ? ultimoDispositivo : null, assenza: motivo === 'aiutante-assente' ? ultimaAssenza : null,
      attesaMs: motivo === 'attesa-scaduta' ? ultimaAttesaMs : null };
    const fine = { esito, motivo, passi, millisecondi: trascorso(), protezioni, storia, verificato: null, causa: null, conferme: sottoISi,
      decisioni: decisioni.map((x) => ({ ...x })), spese: spese.map((x) => ({ ...x })), ...dettagli, ...extra };
    emetti(esito === 'fermato' ? EVENTI.fermato : EVENTI.esito, {
      esito, motivo, passi, millisecondi: fine.millisecondi, protezioni: protezioni.length, verificato: fine.verificato, conferme: sottoISi,
      decisioni: fine.decisioni, spese: fine.spese, dispositivo: fine.dispositivo, assenza: fine.assenza, attesaMs: fine.attesaMs, modo,
      // perché si è fermato davanti a pagare/inviare/cancellare: 'sospetto' | 'non-chiesto' | 'politica'; null per tutto il resto
      causa: fine.causa,
      // campi di Performance (contratto §8): null = non misurato, mai assenti
      richieste: misure.richieste, catture: misure.catture, azioni: misure.azioni, azioniFallite: misure.azioniFallite,
      azioniRitentate: misure.azioniRitentate, msModello: misure.msModello, msAiutante: misure.msAiutante, msAttesa: misure.msAttesa,
      tokenIngresso: null, tokenInCache: null, tokenUscita: null, tokenImmagine: null, tokenAlbero: null,
    });
    return fine;
  };
  const segnaProtezione = (azione, v, decisione) => {
    const riga = { passo: n, tipo: tipoDi(azione), protezione: v.protezione, motivo: v.motivo, prova: v.prova, decisione };
    protezioni.push(riga);
    emetti(EVENTI.protezione, riga);
  };
  // la riga «Posso» cambia i permessi a compito in corso: si legge prima di ogni valutazione; vale solo `=== true` (verso sicuro), e
  // una porta che lancia toglie tutto. Il sospetto resta del ciclo: la riga non lo spegne.
  const aggiornaRichiesta = () => {
    if (typeof porte.richiestaAggiornata !== 'function') return;
    let r = null;
    try { r = porte.richiestaAggiornata(); } catch { r = null; }
    if (r === undefined) return; // la riga non c'è (nessuna intenzione all'inizio): valgono le parole della persona
    const ok = r !== null && typeof r === 'object';
    const dopo = { pagare: ok && r.pagare === true, inviare: ok && r.inviare === true, cancellare: ok && r.cancellare === true };
    const prima = contesto.richiesta;
    // il tetto della riga: abbassarlo o toglierlo vale sempre, alzarlo è un tocco della persona (Frontend); se la riga non lo nomina, resta
    const tettoPrima = tetto;
    if (ok && Object.hasOwn(r, 'tetto')) { tetto = tettoValido(r.tetto); if (JSON.stringify(tetto) !== JSON.stringify(tettoPrima)) fonteTetto = tetto ? 'tocco-posso' : null; }
    const tettoCambiato = JSON.stringify(tetto) !== JSON.stringify(tettoPrima);
    if (dopo.pagare !== prima.pagare || dopo.inviare !== prima.inviare || dopo.cancellare !== prima.cancellare || tettoCambiato) {
      emetti(EVENTI.permessi, { passo: n, prima: { ...prima, tetto: tettoPrima }, dopo: { ...dopo, tetto } });
    }
    for (const k of ['pagare', 'inviare', 'cancellare']) if (dopo[k] && !prima[k]) fonteVoce[k] = 'tocco-posso';
    contesto.richiesta = dopo;
  };
  // il sospetto prima di tutto (Frontend): con istruzioni sospette accendere la voce non servirebbe, quindi la scheda non lo propone
  const causaDi = (v) => {
    const voce = VOCE_DELLA_PROTEZIONE[v?.protezione];
    if (!voce) return null;
    if (contesto.sospetto) return 'sospetto';
    return contesto.richiesta?.[voce] === true ? 'politica' : 'non-chiesto';
  };
  // decisione 237: nel luogo ricordato vale la politica di «Consenti sempre» (l'elenco si rilegge prima di ogni controllo: tolto, torna Normale)
  const politicaDi = (schermata) => (politicaLuoghiRicordati && eRicordato(luogoCorrente(schermata)) ? politicaLuoghiRicordati : politica);
  const valutaOra = (azione, bersaglio, schermata) => { aggiornaRichiesta(); return valuta({ azione, bersaglio, schermata, politica: politicaDi(schermata), contesto }); };
  const fermoDallaPersona = () => { try { const f = typeof porte.fermato === 'function' ? porte.fermato() : null; return FERMI_DELLA_PERSONA.has(f) ? f : null; } catch { return 'pulsante-ferma'; } };
  // moto ridotto: solo `true` esatto, o una funzione che dà `true`; una porta rotta vale «no» (il volo resta, il clic non cambia)
  const motoRidotto = () => {
    try { return typeof porte.motoRidotto === 'function' ? porte.motoRidotto() === true : porte.motoRidotto === true; } catch { return false; }
  };
  const attesa = (ms, segnale) => (typeof porte.attendi === 'function'
    ? Promise.resolve().then(() => porte.attendi(ms, segnale)).catch(() => {})
    : new Promise((ok) => {
      // un gestore con nome: la fetta finita lo stacca, o 17 ascoltatori restano sul segnale del passo fino al clic (revisione 05/11, difetto 5)
      const via = () => { clearTimeout(t); ok(); };
      const t = setTimeout(() => { segnale?.removeEventListener?.('abort', via); ok(); }, ms);
      segnale?.addEventListener?.('abort', via, { once: true });
    }));
  // il volo del cursore a fette corte: lo Stop della persona e il tetto del passo si sentono entro una fetta. null = arrivato
  const volo = async (ms, segnale) => {
    if (!(ms > 0)) return null;
    for (let resto = ms; resto > 0; resto -= FETTA_DEL_VOLO_MS) {
      if (segnale?.aborted) return 'tempo';
      const f = fermoDallaPersona(); if (f) return f;
      await attesa(Math.min(FETTA_DEL_VOLO_MS, resto), segnale);
    }
    if (segnale?.aborted) return 'tempo';
    return fermoDallaPersona();
  };
  const guarda = async () => {
    const t0 = adesso();
    const r = await conTetto((segnale) => porte.guarda(segnale), lim.msPerPasso, lim.msAnnullamento);
    misure.catture += 1; misure.msAiutante += adesso() - t0;
    if (!r.v || typeof r.v !== 'object') return null;
    // l'aiutante che sa perché manca lo dice (Frontend 03/11): lo schermo ne trae il rimedio giusto
    if (ASSENZE.has(r.v.assenza)) { ultimaAssenza = r.v.assenza; return null; }
    // qui e non a ogni lettura: valgono così tutti i punti che rileggono lo schermo. Un sospetto portato dall'ospite resta il suo.
    let zoneGuscio = [];
    if (typeof porte.zoneDiTalos === 'function') { try { zoneGuscio = zoneDa(await porte.zoneDiTalos()); } catch { zoneGuscio = []; } }
    const zone = [...zoneDa(r.v.zoneDiTalos), ...zoneGuscio];
    let v = { ...r.v, zoneDiTalos: zone };
    // gli elementi col centro sotto una finestra di TALOS si segnano: il modello sa che non sono raggiungibili
    if (zone.length && Array.isArray(v.elementi)) v.elementi = v.elementi.map((e) => (e && typeof e === 'object' && nellaZona(zone, centroDi(e)) ? { ...e, coperto: true } : e));
    if (v.sospetto) return v;
    const sospetto = rilevaSospetto(v);
    if (sospetto) v = { ...v, sospetto };
    return v;
  };
  const copertoDaTalos = (azione, bersaglio, s) => SPAZIALI.has(tipoDi(azione)) && puntiDellAzione(azione, bersaglio, s).some((p) => nellaZona(s?.zoneDiTalos ?? [], p));
  const leggiBersaglio = async (azione, s) => (typeof porte.bersaglio === 'function' ? (await porte.bersaglio(azione, s)) ?? null : null);
  const annota = (azione, bersaglio, esito, motivo, extra = {}) => {
    storia.push(`passo ${passi}: ${tipoDi(azione)}${bersaglio?.nome ? ` «${String(bersaglio.nome).slice(0, 40)}»` : ''} → ${esito}${motivo ? ` (${motivo})` : ''}`);
    emetti(EVENTI.passo, { n, fase: 'esito', tipo: tipoDi(azione), esito, motivo: motivo ?? null, modo: MODI.has(extra.modo) ? extra.modo : modo, processo: extra.processo ?? null });
  };
  const segnaResto = (azioni, da, esito) => { for (let k = da; k < azioni.length; k += 1) storia.push(`passo ${passi}: ${tipoDi(azioni[k])} → ${esito}`); };
  const controlloSchermo = (s) => {
    // ⛔ La persona PRIMA di tutto, a ogni lettura: freno non armato = non si parte, freno perso = stop (contratto §7)
    if (s.frenoArmato !== true) return passi === 0 && n === 0 ? 'freno-non-armato' : 'freno-perso';
    if (FERMI_DELLA_PERSONA.has(s.fermato)) {
      if (s.fermato === 'mano-della-persona') ultimoDispositivo = DISPOSITIVI.has(s.dispositivo) ? s.dispositivo : null;
      return s.fermato;
    }
    return fermoDallaPersona();
  };

  // T1 (regola 17): UNA carta all'inizio coi luoghi del compito e la riga «Posso», solo se chi monta il ciclo ha la porta (permesso
  // Normale); un luogo nuovo a metà compito chiede solo per quello (condizione del Desktop). Il sì non copre il pagamento (owner 02/11).
  const consentiti = { domini: new Set((piano?.domini ?? []).map((d) => String(d).toLowerCase())), app: new Set((piano?.app ?? []).map((a) => String(a))) };
  const chiediConsenso = async (domanda) => {
    const r = await aspettandoLaPersona(() => conTetto((segnale) => porte.consensoDelCompito(domanda, segnale), lim.msAttesaPermesso, lim.msAnnullamento));
    return r.scaduto ? 'scaduta' : (r.errore ? 'errore' : (r.v === 'si' || r.v === 'sempre' ? r.v : 'no'));
  };
  // «Consenti sempre» (owner 03/11): l'elenco lo tiene chi monta il ciclo; qui si legge e, a un «sempre», si chiede di salvarlo
  const ricordati = { domini: new Set(nomiDa(luoghiRicordati?.domini).map((d) => d.toLowerCase())), app: new Set(nomiDa(luoghiRicordati?.app)) };
  const eRicordato = (l) => (l?.dominio ? [...ricordati.domini].some((v) => dominioSotto(l.dominio, v)) : Boolean(l?.app) && l.browser !== true && ricordati.app.has(l.app));
  const ricorda = async ({ domini = [], app = [] }) => {
    for (const d of domini) ricordati.domini.add(d);
    for (const a of app) ricordati.app.add(a);
    if (typeof porte.ricordaLuoghi !== 'function') return;
    try {
      const r = await conTetto((segnale) => porte.ricordaLuoghi({ domini, app }, segnale), lim.msPerPasso, lim.msAnnullamento);
      storia.push(r.scaduto || r.errore ? 'elenco dei luoghi ricordati non salvato' : 'luoghi ricordati per i prossimi compiti');
    } catch { storia.push('elenco dei luoghi ricordati non salvato'); } // un elenco che non si salva non ferma il compito
  };
  // «togliere vale subito, aggiungere no» (Frontend, 03/11): `porte.luoghiRicordatiOra()` si rilegge prima di ogni controllo di un luogo e
  // può solo TOGLIERE; aggiunge soltanto l'ingresso del compito o un «sempre» dato qui. Che non risponda o lanci = elenco vuoto: la carta.
  const rileggiRicordati = async () => {
    if (typeof porte.luoghiRicordatiOra !== 'function') return;
    let ora = null;
    try {
      const r = await conTetto((segnale) => porte.luoghiRicordatiOra(segnale), lim.msPerPasso, lim.msAnnullamento);
      ora = r.v && typeof r.v === 'object' ? r.v : null;
    } catch { ora = null; }
    const d = new Set(nomiDa(ora?.domini).map((x) => x.toLowerCase())); const a = new Set(nomiDa(ora?.app));
    for (const v of [...ricordati.domini]) if (!d.has(v)) ricordati.domini.delete(v);
    for (const v of [...ricordati.app]) if (!a.has(v)) ricordati.app.delete(v);
  };
  // i luoghi consentiti SOLO perché ricordati (nessuna carta vista per loro): se la persona li toglie, la carta torna anche adesso
  const daRicordo = new Set();
  const chiaveLuogo = (l) => (l.dominio ? `d:${l.dominio}` : `a:${l.app}`);
  // cura 7 (decisione 239): un browser senza il sito letto dalla sua barra non è un luogo che si ricorda; l'app sola non copre ogni sito
  const luogoCorrente = (s) => {
    const d = String(s?.dominio ?? '').toLowerCase();
    if (d) return { dominio: d };
    return typeof s?.app === 'string' && s.app && s.browser !== true ? { app: s.app } : null;
  };
  const voceDaRicordo = (l) => [...daRicordo].find((k) => (l.dominio ? k.startsWith('d:') && dominioSotto(l.dominio, k.slice(2)) : k === `a:${l.app}`)) ?? null;
  const luogoNuovo = (s) => {
    const d = String(s?.dominio ?? '').toLowerCase();
    if (d && ![...consentiti.domini].some((v) => dominioSotto(d, v))) return { dominio: d };
    if (typeof s?.app === 'string' && s.app && !consentiti.app.has(s.app)) return { app: s.app, ...(s.browser === true && !d ? { browser: true } : {}) };
    return null;
  };
  let consensoDato = false;
  // T8: i domini del piano con una voce nel portachiavi (li dichiara chi monta il ciclo): la carta li elenca, mai il segreto
  const accessi = new Set((Array.isArray(piano?.accessi) ? piano.accessi : []).map((d) => String(d).toLowerCase()).filter(Boolean));
  let ponte = null; // T9: il pagamento avviato col sì della carta, per la conferma sulla pagina raggiunta da QUELL'azione
  const destinatario = nomeNellaFrase(testoDellaPersona, 'destinatario');
  const cartellaNominata = nomeNellaFrase(testoDellaPersona, 'cartella');
  // T11 (OK di Desktop e Mobile, 02/11): quale metodo salvato paga lo decide la persona. Coperto dal sì della cassa solo quello che la
  // frase nomina senza ambiguità («con la Visa», «la 4242»); se la frase non ne nomina nessuno, solo quello già scelto dalla pagina,
  // e uno solo. Più metodi senza nome, un nome che ne indica due, o un altro metodo rispetto a quello nominato o scelto: carta.
  // CU-5: i nomi vengono solo da «con …»; se la frase ne dice uno e a schermo non combacia con nessun metodo, si chiede (la persona
  // voleva un altro metodo); il metodo nominato è anche quello che la carta della cassa mostra
  const metodoNominato = nomeNellaFrase(testoDellaPersona, 'metodo');
  const metodiNominati = (s) => metodiDi(s).filter((m) => combaciaPerIntero(metodoNominato, distintiveDelMetodo(m), 'dentro'));
  const metodoDelPonte = (b, s) => {
    if (metodoNominato !== null) { // nominato (o ambiguo): mai il ripiego sul preselezionato
      const nominatiQui = metodiNominati(s);
      return nominatiQui.length === 1 && stessoRef(nominatiQui[0], b);
    }
    const scelti = metodiDi(s).filter(giaScelto);
    return scelti.length === 1 && stessoRef(scelti[0], b);
  };
  const metodoDellaCassa = (s) => { const n = metodiNominati(s); return n.length === 1 ? String(n[0].nome).slice(0, 40) : metodoDi(s); };
  // T9 + T11: cosa copre il ponte aperto dal «Paga ora» col sì della cassa, sulla pagina NUOVA raggiunta da quell'azione, con lo stesso
  // totale etichettato e la stessa origine, senza sospetto: la scelta del metodo salvato (una volta) e la conferma (che chiude il ponte).
  // La stessa funzione serve alla domanda unica T6, che così non chiede ciò che il ponte coprirà.
  const copertoDalPonte = (v0, a, b, s, pv) => {
    if (!pv || contesto.sospetto || v0?.decisione !== 'chiedi') return null;
    const tot = totaleFinale(s);
    if (!tot || `${tot.importo}|${tot.valuta}` !== pv.chiave || origineDi(s) !== pv.origine || paginaDi(s) === pv.pagina) return null;
    if (v0.protezione === 'pagamento' && confermaDelloStessoPagamento(b)) return 'conferma';
    if (v0.protezione === 'credenziale' && v0.motivo === 'riempimento-automatico' && !pv.metodo && ['premi', 'clic'].includes(tipoDi(a))
      && !(Array.isArray(s?.elementi) ? s.elementi : []).some(chiedeIlCodice) && metodoDelPonte(b, s)) return 'metodo';
    return null;
  };

  try {
    if (typeof porte.consensoDelCompito === 'function') {
      await rileggiRicordati();
      // decisione 239 (owner 05/11): la carta iniziale c'è anche quando ogni luogo del compito è ricordato; la riga «Posso» e gli accessi
      // del portachiavi si vedono a ogni compito. I luoghi ricordati la carta li segna come tali.
      const segna = (l, nome) => ({ nome, ...(eRicordato(l) ? { ricordato: true } : {}) });
      const r = await chiediConsenso({ domini: [...consentiti.domini].map((d) => segna({ dominio: d }, d)), app: [...consentiti.app].map((a) => segna({ app: a, ...(nomiDa(appBrowser).includes(a) ? { browser: true } : {}) }, a)),
        posso: { ...contesto.richiesta, tetto }, accessi: [...accessi].map((dominio) => ({ dominio })) });
      if (r !== 'si' && r !== 'sempre') return chiudi('fermato', motivoDelNo(r));
      consensoDato = true;
      storia.push('la persona ha consentito il compito sui luoghi del piano');
      if (r === 'sempre') {
        decisioni.push({ passo: 0, protezione: null, azione: 'consenso', fonte: 'sempre' });
        await ricorda({ domini: [...consentiti.domini], app: [...consentiti.app] });
      }
    }
    for (;;) {
      const s0 = await guarda();
      if (!s0) return chiudi('assente', 'aiutante-assente');
      let s = s0;
      const stop = controlloSchermo(s);
      if (stop) return chiudi('fermato', stop);
      if (s.pausa) {
        emetti(EVENTI.pausa, { motivo: String(s.pausa) });
        const ripreso = typeof porte.attendiRipresa === 'function' ? await aspettandoLaPersona(() => porte.attendiRipresa(s.pausa)) : false;
        if (!ripreso) return chiudi('fermato', 'tetto-tempo', { pausa: s.pausa });
        // O1 (owner 04/11): dopo una pausa (schermo bloccato, persona via) il sì della guardia non vale più
        statoGuardia = STATO_GUARDIA_VUOTO; siDelCompito = null;
        continue; // si rilegge lo schermo dopo la pausa
      }
      if (s.sospetto && !contesto.sospetto) {
        contesto.sospetto = true; // primo sospetto del compito: vale fino alla fine (DIFESA, strato 3)
        emetti(EVENTI.protezione, { passo: n, sospetto: String(s.sospetto) });
      }
      // modalità guardia (decisione 145, variante A): dentro si legge in silenzio e a lotti; qui si chiede solo per orologio illeggibile
      // e schermo spento. La carta per le azioni che cambiano qualcosa arriva sul posto, prima dell'azione
      const perLotto = lim.azioniPerLotto;
      if (guardiaAccesa) {
        const g = guardiaDi(s);
        statoGuardia = g.stato;
        if (g.esito === 'chiedi') {
          const no = await cartaDellaGuardia(g, s);
          if (no) return chiudi('fermato', no);
          continue; // dopo la persona si rilegge lo schermo
        }
      }
      if (trascorso() >= lim.millisecondi) return chiudi('fermato', 'tetto-tempo');
      if (passi >= lim.passi) return chiudi('fermato', 'tetto-passi');

      const t0 = adesso();
      const risposta = await conTetto((segnale) => porte.chiedi({ osservazione: s, storia: [...storia] }, segnale), lim.msPerPasso, lim.msAnnullamento);
      misure.richieste += 1; misure.msModello += adesso() - t0;
      const r = risposta.v;
      const azioni = r && Array.isArray(r.azioni) ? r.azioni : null;
      if (!r || (!azioni && !r.fine)) {
        fallimenti += 1;
        storia.push(`passo ${passi + 1}: risposta ${risposta.scaduto ? 'scaduta' : 'non utilizzabile'}`);
        if (fallimenti >= lim.fallimentiDiFila) return chiudi('non-riuscito', 'errori-di-fila');
        continue;
      }
      passi += 1;
      if (r.fine && (!azioni || azioni.length === 0)) return await concludi(r.fine);
      if (azioni.length > perLotto) {
        segnaResto(azioni, perLotto, 'non-eseguita');
        storia.push(`passo ${passi}: al massimo ${perLotto} azioni per volta`);
      }
      // il modello guarda senza agire (solo attese): la finestra che sta leggendo, nient'altro (Desktop 05/11)
      {
        const lotto = azioni.slice(0, perLotto); const f = s?.finestra;
        if (lotto.length > 0 && lotto.every((a) => tipoDi(a) === 'aspetta') && zonaValida(f)) {
          emetti(EVENTI.guarda, { finestra: { x: f.x, y: f.y, w: f.w, h: f.h } });
        }
      }

      // T6 (regola 17): le conferme che questo gruppo chiederebbe sullo schermo di adesso diventano UNA domanda con l'elenco; la risposta
      // vale per voce, e solo se quando l'azione arriva schermo, pagina e importi sono ancora quelli
      const preRisposte = new Map();
      if (typeof porte.chiediPersona === 'function') {
        // C3 (revisione PR19): la foto porta anche il sospetto di adesso, e ogni voce il suo bersaglio
        const voci = []; const foto = { origine: origineDi(s), pagina: paginaDi(s), importi: importiDi(s), totale: chiaveTotale(s), sospetto: contesto.sospetto === true };
        const bersagliDelleVoci = new Map();
        // T11: il ponte vale per l'azione subito dopo quella che l'ha aperto; qui si segue come farà il ciclo, azione per azione
        let pv = ponte && ponte.passo === n ? ponte : null;
        for (let k = 0; k < Math.min(azioni.length, perLotto); k += 1) {
          const a = azioni[k];
          if (['fine', 'chiedi_persona'].includes(tipoDi(a))) break;
          const b = await leggiBersaglio(a, s);
          if (!b || copertoDaTalos(a, b, s)) { pv = null; continue; } // sotto la bolla non partirà: niente domanda per lei
          const v0 = valutaOra(a, b, s);
          const copre = copertoDalPonte(v0, a, b, s, pv);
          pv = copre === 'metodo' ? { ...pv, metodo: String(b.nome).slice(0, 40) } : null;
          if (copre) continue; // lo coprirà il sì della cassa: non entra nella domanda unica
          if (v0.decisione !== 'chiedi' || siValido(v0, s, b)) continue;
          if (v0.prova === 'scritture-miste') continue; // S-5: il pulsante illeggibile ha la sua carta, col testo e le lettere strane
          if (v0.protezione === 'pagamento' && tetto && contesto.richiesta?.pagare === true) continue; // col tetto il pagamento lo decide il tetto
          voci.push({ id: k, protezione: v0.protezione, prova: v0.prova, ...(v0.protezione === 'pagamento' ? { importo: totaleFinale(s) } : {}) });
          bersagliDelleVoci.set(k, b);
        }
        if (voci.length >= 2) {
          const r = await aspettandoLaPersona(() => conTetto((segnale) => chiediAllaPersona({ motivo: 'conferme', voci }, segnale), lim.msAttesaPermesso, lim.msAnnullamento));
          if (r.scaduto) return chiudi('fermato', 'attesa-scaduta');
          if (r.errore) return chiudi('fermato', DOMANDA_NON_MOSTRATA);
          const risp = r.v;
          if (risp !== 'si' && (risp === null || typeof risp !== 'object')) return chiudi('fermato', 'pulsante-ferma');
          for (const voce of voci) preRisposte.set(voce.id, { ...foto, protezione: voce.protezione, bersaglio: bersagliDelleVoci.get(voce.id), risposta: risp === 'si' ? 'si' : (risp[voce.id] === 'si' ? 'si' : 'no') });
        }
      }
      let fineNelLotto = null;
      let ultimaNellaGuardia = false; // l'azione appena fatta cambiava qualcosa nella guardia (anche in un riquadro, D3): il lotto si chiude lì
      for (let i = 0; i < Math.min(azioni.length, perLotto); i += 1) {
        if (ultimaNellaGuardia) { segnaResto(azioni, i, 'non-eseguita'); break; }
        const azione = azioni[i];
        n += 1;
        // dalla seconda azione si rilegge lo schermo: la modale aperta dall'azione prima, il freno perso, la mano (Mobile S1-4, S2-2).
        // Con la guardia accesa anche per la prima: la pagina può cambiare da sola mentre il modello pensa (revisione Q, D1)
        if (i > 0 || guardiaAccesa) {
          const fresco = await guarda();
          if (!fresco) { segnaResto(azioni, i, 'non-eseguita'); return chiudi('assente', 'aiutante-assente'); }
          s = fresco;
          const ferma = controlloSchermo(s);
          if (ferma) { segnaResto(azioni, i, 'non-eseguita'); return chiudi('fermato', ferma); }
          if (s.sospetto) contesto.sospetto = true;
          if (s.pausa) { segnaResto(azioni, i, 'non-eseguita'); break; } // la pausa si gestisce in cima al giro
          // la guardia tiene il posto aggiornato a ogni lettura; orologio illeggibile o schermo spento: la carta in cima al giro
          if (guardiaAccesa) {
            const g = guardiaDi(s);
            statoGuardia = g.stato;
            if (g.esito === 'chiedi') { segnaResto(azioni, i, 'non-eseguita'); break; }
          }
        } else {
          const ferma = fermoDallaPersona();
          if (ferma) { segnaResto(azioni, i, 'non-eseguita'); return chiudi('fermato', ferma); }
        }
        if (trascorso() >= lim.millisecondi) { segnaResto(azioni, i, 'non-eseguita'); return chiudi('fermato', 'tetto-tempo'); }
        if (tipoDi(azione) === 'fine') { fineNelLotto = azione; segnaResto(azioni, i + 1, 'non-eseguita'); break; }
        if (tipoDi(azione) === 'chiedi_persona') {
          emetti(EVENTI.pausa, { motivo: `chiedi_persona:${azione.motivo ?? 'scelta'}` });
          const risp = await aspettandoLaPersona(() => chiediAllaPersona({ motivo: azione.motivo ?? '', tipo: 'chiedi_persona' })).catch(() => ERRORE_DELLA_CARTA);
          if (risp === ERRORE_DELLA_CARTA) return chiudi('fermato', DOMANDA_NON_MOSTRATA);
          if (risp === 'annulla') return chiudi('fermato', 'pulsante-ferma');
          storia.push(`passo ${passi}: la persona ha risposto (${risp === 'fatto' ? 'fatto' : 'risposta'})`);
          segnaResto(azioni, i + 1, 'non-eseguita'); // dopo la persona si rilegge lo schermo
          break;
        }

        if (consensoDato) {
          await rileggiRicordati();
          // un luogo consentito solo dal ricordo e tolto adesso dalla persona: la carta torna, poi si rilegge lo schermo in cima al giro
          const qui = luogoCorrente(s);
          const tolto = qui && !eRicordato(qui) ? voceDaRicordo(qui) : null;
          if (tolto) {
            const r = await chiediConsenso({ nuovo: qui, tolto: true });
            if (r !== 'si' && r !== 'sempre') { segnaResto(azioni, i, 'non-eseguita'); return chiudi('fermato', motivoDelNo(r)); }
            daRicordo.delete(tolto);
            storia.push(`passo ${passi}: ${qui.dominio ?? qui.app} non è più tra i luoghi ricordati: la persona l'ha consentito di nuovo`);
            if (r === 'sempre') {
              decisioni.push({ passo: n, protezione: null, azione: 'consenso', fonte: 'sempre' });
              await ricorda(qui.dominio ? { domini: [qui.dominio] } : { app: [qui.app] });
            }
            segnaResto(azioni, i, 'non-eseguita');
            break;
          }
          const nuovo = luogoNuovo(s);
          if (nuovo && eRicordato(nuovo)) {
            daRicordo.add(chiaveLuogo(nuovo));
            if (nuovo.dominio) consentiti.domini.add(nuovo.dominio);
            if (nuovo.app) consentiti.app.add(nuovo.app);
            storia.push(`passo ${passi}: ${nuovo.dominio ?? nuovo.app} è tra i luoghi ricordati`);
          } else if (nuovo) {
            // variante A: un luogo nuovo dentro la guardia senza un sì fresco porta la riga della guardia nella stessa carta
            const gNuovo = guardiaAccesa ? guardiaDi(s) : null;
            const conGuardia = gNuovo && gNuovo.esito === 'dentro' && gNuovo.fresco !== true ? gNuovo : null;
            const r = await chiediConsenso({ nuovo, ...(conGuardia ? { guardia: rigaDellaGuardia(conGuardia) } : {}) });
            if (r !== 'si' && r !== 'sempre') { segnaResto(azioni, i, 'non-eseguita'); return chiudi('fermato', motivoDelNo(r)); }
            if (conGuardia) segnaSiDellaGuardia(conGuardia, s, azione);
            if (nuovo.dominio) consentiti.domini.add(nuovo.dominio);
            if (nuovo.app) consentiti.app.add(nuovo.app);
            storia.push(`passo ${passi}: la persona ha consentito ${nuovo.dominio ?? nuovo.app}`);
            if (r === 'sempre') {
              decisioni.push({ passo: n, protezione: null, azione: 'consenso', fonte: 'sempre' });
              await ricorda(nuovo.dominio ? { domini: [nuovo.dominio] } : { app: [nuovo.app] });
            }
            const dopo = await guarda(); // dopo l'attesa si rilegge lo schermo
            if (!dopo) { segnaResto(azioni, i, 'non-eseguita'); return chiudi('assente', 'aiutante-assente'); }
            const fermaDopo = controlloSchermo(dopo);
            if (fermaDopo) { segnaResto(azioni, i, 'non-eseguita'); return chiudi('fermato', fermaDopo); }
            if (dopo.sospetto) contesto.sospetto = true;
            s = dopo;
            if (luogoNuovo(s)) { segnaResto(azioni, i, 'non-eseguita'); break; } // lo schermo è già altrove: si rilegge in cima
          }
        }
        // T9: il ponte vale solo per l'azione SUBITO dopo quella che ha avviato il pagamento
        const ponteOra = ponte && n === ponte.passo + 1 ? ponte : null;
        ponte = null;
        // verifica della banca (3-D Secure, codice, app) e codice di sicurezza della carta (CVV/CVC, T11): TALOS non li tocca, passa la
        // mano alla persona e la aspetta (Mobile)
        const primaLettura = tipoDi(azione) === 'scrivi' ? await leggiBersaglio(azione, s) : null;
        const mano = testiDi(s).some((t) => VERIFICA_BANCA.test(t)) && !['aspetta', 'scorri'].includes(tipoDi(azione)) ? 'verifica-banca'
          : (chiedeIlCodice(primaLettura) ? 'codice-sicurezza' : null);
        if (mano) {
          emetti(EVENTI.protezione, { passo: n, manoAllaPersona: mano, ...(mano === 'verifica-banca' ? { verificaBanca: true } : {}) });
          if (typeof porte.chiediPersona !== 'function') { segnaResto(azioni, i, 'non-eseguita'); return chiudi('fermato', mano); }
          // CVV (OK di Desktop e Mobile, 02/11): «scrivi il codice e premi tu Paga» — il clic finale è della persona (`ancheIlClic`)
          const r = await aspettandoLaPersona(() => conTetto((segnale) => chiediAllaPersona({ motivo: mano, tipo: mano, ...(mano === 'codice-sicurezza' ? { ancheIlClic: true } : {}) }, segnale), lim.msAttesaPermesso, lim.msAnnullamento));
          if (r.scaduto) { segnaResto(azioni, i, 'non-eseguita'); return chiudi('fermato', 'attesa-scaduta'); }
          if (r.errore) { segnaResto(azioni, i, 'non-eseguita'); return chiudi('fermato', DOMANDA_NON_MOSTRATA); }
          if (r.v !== 'fatto') { segnaResto(azioni, i, 'non-eseguita'); return chiudi('fermato', 'pulsante-ferma'); }
          rinnovaSiDelCompito(); // variante A: la mano alla persona chiusa con «fatto» vale come «Sto guardando» e rinnova il sì
          if (mano === 'codice-sicurezza') {
            // al ritorno della mano si rilegge: pagato ⇒ si prosegue e la traccia lo dice; il codice o il pulsante del pagamento ancora a
            // schermo ⇒ si chiude con una frase, SENZA mai premerlo (TALOS non conferma mai dopo un CVV)
            const totale = totaleFinale(s);
            const dopo = await guarda();
            if (!dopo) { segnaResto(azioni, i, 'non-eseguita'); return chiudi('assente', 'aiutante-assente'); }
            const ancoraLi = (Array.isArray(dopo.elementi) ? dopo.elementi : []).some((e) => chiedeIlCodice(e) || pulsanteDelPagamento(e));
            emetti(EVENTI.protezione, { passo: n, manoAllaPersona: mano, esito: ancoraLi ? 'conferma-a-schermo' : 'pagato-dalla-persona' });
            if (ancoraLi) {
              storia.push(`passo ${passi}: la conferma del pagamento è ancora a schermo: TALOS non la preme`);
              segnaResto(azioni, i, 'non-eseguita');
              return chiudi('fermato', 'pagamento-non-completato');
            }
            storia.push(`passo ${passi}: hai pagato tu${totale ? ` ${String(totale.importo.toFixed(2)).replace('.', ',')} ${totale.valuta === 'EUR' ? '€' : totale.valuta}` : ''}`);
          } else storia.push(`passo ${passi}: la persona ha completato la verifica della banca`);
          segnaResto(azioni, i, 'non-eseguita'); // si rilegge lo schermo dopo la persona
          break;
        }
        let bersaglio = primaLettura ?? await leggiBersaglio(azione, s);
        // guardia degli ordinali: «il primo contatto» è il primo che si vede nella lista, non quello che sceglie il modello
        if (ordinale !== null && TIPI_CON_ORDINALE.has(tipoDi(azione)) && bersaglio?.inLista) {
          const atteso = nesimoInLista(s.elementi, ordinale);
          // si blocca solo se le ETICHETTE differiscono (telefono, pilotaDelloSchermo.ts:337-351): contenitore e figlio con lo stesso
          // nome sono la stessa scelta della persona (verifica del Mobile V2)
          if (atteso && atteso.nome !== bersaglio.nome) {
            fallimenti += 1;
            annota(azione, bersaglio, 'non-eseguita', 'ordinale-sbagliato');
            storia.push(`passo ${passi}: è stato chiesto il ${ordinale === -1 ? 'ultimo' : `n. ${ordinale}`} della lista: è «${String(atteso.nome).slice(0, 40)}»`);
            segnaResto(azioni, i + 1, 'non-eseguita');
            if (fallimenti >= lim.fallimentiDiFila) return chiudi('non-riuscito', 'errori-di-fila');
            break;
          }
        }
        // S4 (Desktop, 03/11): un punto sotto la bolla o un'altra finestra di TALOS non riceve l'azione. Non è un errore del modello: non
        // conta fra i fallimenti di fila, e la storia gli dice perché, così sceglie altro.
        if (copertoDaTalos(azione, bersaglio, s)) {
          annota(azione, bersaglio, 'non-eseguita', 'coperto-da-talos');
          storia.push(`passo ${passi}: quel punto è coperto da una finestra di TALOS, invisibile nella cattura: non si raggiunge`);
          segnaResto(azioni, i + 1, 'non-eseguita');
          break;
        }
        lasciaPagina(s);
        let v = valutaOra(azione, bersaglio, s);
        // T4 (censimento del 02/11): un controllo anti-robot lo risolve la persona; il ciclo la ASPETTA con lo stesso tetto della riga
        // «Posso», poi rilegge schermo e bersaglio. Prima chiudeva il compito mentre la carta prometteva «Fatto, riprendi».
        if (v.decisione === 'ferma' && v.protezione === 'anti-robot' && typeof porte.chiediPersona === 'function') {
          segnaProtezione(azione, v, 'aspetta-la-persona');
          let salta = false;
          for (let giro = 0; giro < GIRI_DEL_PERMESSO && v.decisione === 'ferma' && v.protezione === 'anti-robot'; giro += 1) {
            emetti(EVENTI.pausa, { motivo: 'anti-robot', causa: null });
            const r = await aspettandoLaPersona(() => conTetto((segnale) => chiediAllaPersona({ motivo: 'anti-robot', tipo: 'anti-robot', prova: v.prova }, segnale), lim.msAttesaPermesso, lim.msAnnullamento));
            if (r.scaduto) { segnaResto(azioni, i, 'non-eseguita'); return chiudi('fermato', 'attesa-scaduta'); }
            if (r.errore) { segnaResto(azioni, i, 'non-eseguita'); return chiudi('fermato', DOMANDA_NON_MOSTRATA); }
            if (r.v !== 'fatto') { segnaResto(azioni, i, 'non-eseguita'); return chiudi('fermato', 'pulsante-ferma'); }
            const dopo = await guarda();
            if (!dopo) { segnaResto(azioni, i, 'non-eseguita'); return chiudi('assente', 'aiutante-assente'); }
            const fermaDopo = controlloSchermo(dopo);
            if (fermaDopo) { segnaResto(azioni, i, 'non-eseguita'); return chiudi('fermato', fermaDopo); }
            if (dopo.sospetto) contesto.sospetto = true;
            const vivo = await leggiBersaglio(azione, dopo);
            if (!stessoElemento(vivo, bersaglio)) {
              annota(azione, bersaglio, 'non-eseguita', 'elemento-sparito');
              segnaResto(azioni, i + 1, 'non-eseguita');
              salta = true;
              break;
            }
            s = dopo; bersaglio = vivo;
            v = valutaOra(azione, bersaglio, s);
          }
          if (salta) break;
          if (v.protezione !== 'anti-robot') storia.push(`passo ${passi}: la persona ha risolto il controllo, si riparte`);
        }
        // i conti di questa azione (tetto, sì aperti e usati) si fotografano qui: se l'azione alla fine non parte, si disfano (Q, D4-D5)
        const conti = { speso, ultimoSottoTetto, spese: spese.length, attivi: [...siAttivi], conferme: conferme.length };
        let siUsato = null;
        const disfaConti = () => {
          speso = conti.speso; ultimoSottoTetto = conti.ultimoSottoTetto; spese.length = conti.spese;
          siAttivi.splice(0, siAttivi.length, ...conti.attivi); conferme.length = conti.conferme;
          if (siUsato) siUsato.azioni.pop();
        };
        let daEseguire = azione;
        let sotto = null; // il sì sotto cui si agisce (T2)
        let fonte = null; // chi ha deciso questa azione delicata (Frontend)
        // tetto di spesa: vale in ogni permesso che non ferma già (sospetto, telefono, pagamento non chiesto restano fermi). Dalla
        // decisione 239 la carta iniziale non si salta mai, quindi il tetto vale anche nei luoghi ricordati
        // C1 (revisione PR19): il tetto vale solo se la persona ha chiesto di pagare; «cerca delle cuffie fino a 50 €» dà un tetto ma non un sì
        if (v.protezione === 'pagamento' && tetto && contesto.richiesta?.pagare === true && v.decisione !== 'ferma') {
          const tot = totaleFinale(s);
          const chiave = tot ? `${tot.importo}|${tot.valuta}` : null;
          const confermaSotto = ultimoSottoTetto && chiave && ultimoSottoTetto.chiave === chiave && ultimoSottoTetto.origine === origineDi(s)
            && ultimoSottoTetto.pagina === paginaDi(s) && confermaDelloStessoPagamento(bersaglio) && !contesto.sospetto;
          if (confermaSotto) {
            // la conferma dello STESSO pagamento già contato: niente carta e niente doppio conto (Mobile)
            ultimoSottoTetto = null; v = { ...v, decisione: 'procedi-e-segna' }; fonte = fonteTetto;
            storia.push(`passo ${passi}: conferma dello stesso pagamento, già dentro il tetto`);
          } else if (!contesto.sospetto && tot && tot.valuta === tetto.valuta && !siRinnova(s) && nelPianoDi(s)
            && speso + tot.importo <= tetto.importo + 1e-9) {
            speso += tot.importo;
            const resta = Math.round((tetto.importo - speso) * 100) / 100;
            ultimoSottoTetto = { chiave, origine: origineDi(s), pagina: paginaDi(s) };
            spese.push({ passo: n, totale: tot, resta, valuta: tetto.valuta });
            storia.push(`passo ${passi}: pagati ${tot.importo} ${tot.valuta} dentro il tetto di ${tetto.importo} ${tetto.valuta}, restano ${resta}`);
            v = { ...v, decisione: 'procedi-e-segna' }; fonte = fonteTetto;
          } else {
            v = { ...v, decisione: 'chiedi' }; // sopra il tetto, totale non letto, altra valuta, rinnovo, fuori piano o sospetto: carta col totale
          }
        }
        // T6: una risposta già data per questa azione nella domanda unica del gruppo, se lo schermo è ancora quello
        const pre = preRisposte.get(i);
        if (pre && v.decisione === 'chiedi' && v.prova !== 'scritture-miste' && pre.protezione === v.protezione && pre.origine === origineDi(s) && pre.pagina === paginaDi(s)
          // compito 7 (revisione delle cure R): il sì della domanda unica vale se il totale è UGUALE, anche illeggibile le due volte sulla
          // stessa pagina immutata; un totale che compare o cambia dopo il sì ('' contro '450|EUR') lo fa decadere. Come Codex
          // `codex-rs/core/src/tools/sandboxing.rs:66-97` (si richiede solo se la chiave dell'azione cambia)
          && pre.importi === importiDi(s) && (pre.protezione !== 'pagamento' || pre.totale === chiaveTotale(s))
          // C3: un sospetto nato dopo la domanda, o un altro elemento al posto di quello chiesto, vogliono una carta nuova
          && !(contesto.sospetto && !pre.sospetto) && stessoElemento(bersaglio, pre.bersaglio)) {
          if (pre.risposta !== 'si') {
            const chiave = chiaveAzione(azione, bersaglio);
            rifiuti.set(chiave, (rifiuti.get(chiave) ?? 0) + 1);
            annota(azione, bersaglio, 'rifiutata', 'protezione');
            segnaResto(azioni, i + 1, 'non-eseguita');
            if (rifiuti.get(chiave) >= 2) return chiudi('fermato', 'rifiutata-dalla-persona');
            break;
          }
          sotto = ricordaSi(v, s, azione); fonte = 'si-carta';
          v = { ...v, decisione: 'procedi-e-segna' };
          storia.push(`passo ${passi}: confermata nella domanda unica del gruppo`);
        }
        // T1: col sì della carta iniziale, un invio chiesto nella frase verso un destinatario NOMINATO nella frase e letto a schermo procede
        // (Mobile); un destinatario che non si legge o non nominato chiede. Il pagamento no (owner 02/11), la cancellazione no.
        if (v.decisione === 'chiedi' && consensoDato && v.protezione === 'invio' && contesto.richiesta.inviare && !contesto.sospetto) {
          const dest = destinatarioDi(s);
          if (dest && combaciaPerIntero(destinatario, paroleDi(dest), 'uguale')) {
            v = { ...v, decisione: 'procedi-e-segna' }; fonte = 'si-carta';
            storia.push(`passo ${passi}: invio a «${dest.slice(0, 40)}», nominato nella frase e coperto dalla carta iniziale`);
          }
        }
        // T7 (OK di Desktop e Mobile): la casella che dice solo di aver letto l'informativa, sul dominio del piano, è coperta dalla carta
        // iniziale; termini, condizioni e contratti chiedono; marketing e terzi sono già «scelta riservata» nelle protezioni
        if (v.decisione === 'chiedi' && consensoDato && v.protezione === 'consenso' && v.motivo === 'termini' && !contesto.sospetto && nelPianoDi(s)) {
          const etic = String(v.prova ?? bersaglio?.nome ?? '');
          if (SOLO_INFORMATIVA.test(etic) && !CONTRATTO.test(etic)) {
            v = { ...v, decisione: 'procedi-e-segna' }; fonte = 'si-carta';
            storia.push(`passo ${passi}: informativa segnata, coperta dalla carta iniziale`);
          }
        }
        // T8: la password dal portachiavi per un accesso elencato nella carta iniziale: dominio ESATTO della barra dell'indirizzo, voce del
        // portachiavi di quel dominio, campo della stessa origine (riquadri compresi), mai col sospetto (Desktop, Mobile)
        if (v.decisione === 'chiedi' && consensoDato && v.protezione === 'credenziale' && v.motivo === 'portachiavi' && !contesto.sospetto) {
          const dominio = String(s?.dominio ?? '').toLowerCase();
          const voce = /^\{\{segreto:([^}]+)\}\}$/u.exec(String(azione.testo ?? '').trim())?.[1]?.toLowerCase() ?? null;
          // CU-2: un'origine del campo che non si conosce conta come DIVERSA, mai come la stessa (riquadri di terzi)
          const origineCampo = bersaglio?.origine == null ? null : String(bersaglio.origine).toLowerCase();
          if (dominio && accessi.has(dominio) && voce === dominio && origineCampo === dominio) {
            v = { ...v, decisione: 'procedi-e-segna' }; fonte = 'si-carta';
            storia.push(`passo ${passi}: accesso a ${dominio} dal portachiavi, coperto dalla carta iniziale`);
          }
        }
        // T9 + T11: sulla pagina NUOVA raggiunta dal «Paga ora» appena fatto col sì della carta (stessa origine, stesso totale etichettato,
        // senza sospetto): la conferma chiude il ponte; la scelta del metodo salvato nominato o già scelto lo tiene aperto per l'azione dopo
        let metodoDelSi = null;
        // decisione 159: in Accesso pieno il metodo salvato passa già dalla politica (procedi-e-segna); il ponte lo conta lo stesso come il
        // metodo dello stesso pagamento, così la conferma della pagina dopo resta coperta dal sì di «Paga ora» (una carta per pagare)
        const vPonte = v.decisione === 'procedi-e-segna' && v.protezione === 'credenziale' && v.motivo === 'riempimento-automatico' ? { ...v, decisione: 'chiedi' } : v;
        const ponteCopre = copertoDalPonte(vPonte, azione, bersaglio, s, ponteOra);
        if (ponteCopre) {
          v = { ...v, decisione: 'procedi-e-segna' }; fonte = 'si-carta';
          if (ponteCopre === 'metodo') {
            metodoDelSi = String(bersaglio.nome).slice(0, 40);
            storia.push(`passo ${passi}: metodo «${metodoDelSi}» per lo stesso pagamento, coperto dal sì della cassa`);
          } else storia.push(`passo ${passi}: conferma dello stesso pagamento sulla pagina raggiunta dal passo ${ponteOra.passo}`);
        }
        // T10: svuotare nel CESTINO (recuperabile) la cartella nominata nella frase: Maiusc+Canc diventa Canc, senza carta; la
        // cancellazione definitiva e lo svuotamento del cestino chiedono sempre
        if (v.decisione === 'chiedi' && consensoDato && v.protezione === 'cancellazione' && v.motivo === 'tasti' && contesto.richiesta.cancellare
          && !contesto.sospetto && ESPLORA_FILE.test(String(s?.app ?? '').trim()) && !s?.dominio) {
          const cartella = String(s?.titolo ?? '').split(' - ')[0].trim();
          if (combaciaPerIntero(cartellaNominata, paroleDi(cartella), 'uguale') && !/cestino|recycle/iu.test(cartella)) {
            v = { ...v, decisione: 'riscrivi', azioneSostitutiva: { tipo: 'tasti', combinazione: 'delete', ...(azione.ripeti != null ? { ripeti: azione.ripeti } : {}) } };
            fonte = 'si-carta';
            storia.push(`passo ${passi}: «${cartella.slice(0, 40)}» nominata nella frase: nel cestino, recuperabile`);
          }
        }
        if (v.decisione === 'chiedi') {
          const gia = siValido(v, s, bersaglio);
          if (gia) {
            gia.azioni.push(tipoDi(azione)); siUsato = gia;
            v = { ...v, decisione: 'procedi-e-segna' };
            sotto = gia; fonte = 'serie';
            if (v.protezione === 'pagamento') consumaSi(gia); // la conferma è il clic finale: il sì del pagamento è speso
            storia.push(`passo ${passi}: vale il sì del passo ${gia.passo}`);
          }
        }
        // S-5 (decisione 146): «Non riesco a leggere bene questo pulsante: lo premo?» col testo letto e le lettere strane. Il sì vale
        // per QUESTO pulsante una volta (niente ricordaSi); due «no» nel compito fermano; nessuna risposta, o scaduta, ferma.
        if (v.decisione === 'chiedi' && v.protezione === null && v.prova === 'scritture-miste') {
          const vPrima = v;
          segnaProtezione(azione, v, 'chiedi');
          if (typeof porte.chiediPersona !== 'function') { segnaResto(azioni, i, 'non-eseguita'); return chiudi('fermato', 'nessuna-risposta'); }
          // variante A: come la carta di una protezione, anche questa porta la riga della guardia quando serve (una domanda sola)
          const gMiste = guardiaAccesa ? guardiaDaChiedere(guardiaPerAzione(s, bersaglio), azione, bersaglio, v) : null;
          const r = await aspettandoLaPersona(() => conTetto((segnale) => porte.chiediPersona({ motivo: 'conferma', tipo: 'scritture-miste', testo: v.testo,
            strane: v.strane, prova: v.prova, protezione: null, azione: tipoDi(azione), ...(gMiste ? { guardia: rigaDellaGuardia(gMiste) } : {}) }, segnale),
            lim.msAttesaPermesso, lim.msAnnullamento));
          if (r.errore) { segnaResto(azioni, i, 'non-eseguita'); return chiudi('fermato', DOMANDA_NON_MOSTRATA); } // come le altre carte (ccd9)
          const risp = r.scaduto ? null : r.v;
          if (risp === 'si' && gMiste) segnaSiDellaGuardia(gMiste, s, azione);
          if (risp === 'annulla') { segnaResto(azioni, i, 'non-eseguita'); return chiudi('fermato', 'pulsante-ferma'); }
          if (risp === 'no') {
            noMiste += 1;
            annota(azione, bersaglio, 'rifiutata', 'protezione');
            segnaResto(azioni, i + 1, 'non-eseguita');
            if (noMiste >= 2) return chiudi('fermato', 'rifiutata-dalla-persona');
            break; // il modello lo vede nella storia e cambia strada
          }
          if (risp !== 'si') { segnaResto(azioni, i, 'non-eseguita'); return chiudi('fermato', 'nessuna-risposta'); }
          // dopo l'attesa: schermo e bersaglio RILETTI, protezioni RIVALUTATE; il sì vale solo se il pulsante dice ancora la stessa cosa
          const dopo = await guarda();
          if (!dopo) return chiudi('assente', 'aiutante-assente');
          const ferma = controlloSchermo(dopo);
          if (ferma) return chiudi('fermato', ferma);
          if (dopo.sospetto) contesto.sospetto = true;
          const vivo = await leggiBersaglio(azione, dopo);
          if (!stessoElemento(vivo, bersaglio)) {
            annota(azione, bersaglio, 'non-eseguita', 'elemento-sparito');
            segnaResto(azioni, i + 1, 'non-eseguita');
            break;
          }
          // R6 (revisione R): come la carta di una protezione, il sì dato senza sospetto non vale se il sospetto è nato a carta aperta
          if (dopo.sospetto && !s.sospetto) {
            annota(azione, bersaglio, 'non-eseguita', 'sospetto-nato');
            segnaResto(azioni, i + 1, 'non-eseguita');
            break;
          }
          s = dopo; bersaglio = vivo;
          v = valutaOra(azione, bersaglio, s);
          if (v.decisione === 'chiedi') {
            // il nome è già lo stesso (stessoElemento): qui si controlla che il pulsante sia ancora solo illeggibile, e non altro
            if (v.protezione !== null || v.prova !== vPrima.prova) {
              annota(azione, bersaglio, 'non-eseguita', 'protezione-cambiata');
              segnaResto(azioni, i + 1, 'non-eseguita');
              break;
            }
            v = { ...v, decisione: 'procedi' }; fonte = 'si-carta';
            storia.push(`passo ${passi}: pulsante illeggibile premuto col sì della persona`);
          }
        }
        if (v.decisione === 'chiedi') {
          const vPrima = v;
          segnaProtezione(azione, v, 'chiedi');
          // la carta della cassa dice il totale finale, il dominio e il metodo (Frontend); null se non si leggono
          const extraCassa = v.protezione === 'pagamento' ? { totale: totaleFinale(s), dominio: origineDi(s), metodo: metodoDellaCassa(s), tetto } : {};
          // variante A: se l'azione chiede anche la guardia, la riga «sito sensibile» entra in QUESTA carta (una domanda sola)
          const gInsieme = guardiaAccesa ? guardiaDaChiedere(guardiaPerAzione(s, bersaglio), azione, bersaglio, v) : null;
          const si = await aspettandoLaPersona(() => chiediAllaPersona({ motivo: 'conferma', protezione: v.protezione, prova: v.prova, azione: tipoDi(azione), ...extraCassa,
            ...(gInsieme ? { guardia: rigaDellaGuardia(gInsieme) } : {}) })).catch(() => ERRORE_DELLA_CARTA);
          if (si === ERRORE_DELLA_CARTA) return chiudi('fermato', DOMANDA_NON_MOSTRATA);
          if (si === 'annulla') return chiudi('fermato', 'pulsante-ferma');
          if (si === 'si' && gInsieme) segnaSiDellaGuardia(gInsieme, s, azione);
          if (si !== 'si') {
            const chiave = chiaveAzione(azione, bersaglio);
            rifiuti.set(chiave, (rifiuti.get(chiave) ?? 0) + 1);
            annota(azione, bersaglio, 'rifiutata', 'protezione');
            segnaResto(azioni, i + 1, 'non-eseguita');
            if (rifiuti.get(chiave) >= 2) return chiudi('fermato', 'rifiutata-dalla-persona'); // il modello insiste: ci si ferma
            break; // il modello lo vede nella storia e cambia strada
          }
          // dopo l'attesa della persona: schermo e bersaglio RILETTI, protezioni RIVALUTATE (Mobile S1-3)
          const dopo = await guarda();
          if (!dopo) return chiudi('assente', 'aiutante-assente');
          const ferma = controlloSchermo(dopo);
          if (ferma) return chiudi('fermato', ferma);
          if (dopo.sospetto) contesto.sospetto = true; // C3 (revisione PR19), come a ogni altra rilettura
          const vivo = await leggiBersaglio(azione, dopo);
          if (!stessoElemento(vivo, bersaglio)) {
            annota(azione, bersaglio, 'non-eseguita', 'elemento-sparito');
            segnaResto(azioni, i + 1, 'non-eseguita');
            break;
          }
          // C3: il sì è stato dato su una pagina senza sospetto; se il sospetto è nato mentre la carta era aperta, non vale
          if (dopo.sospetto && !s.sospetto) {
            annota(azione, bersaglio, 'non-eseguita', 'sospetto-nato');
            segnaResto(azioni, i + 1, 'non-eseguita');
            break;
          }
          // C4: un pagamento si fa agli importi che la carta ha mostrato; se sono cambiati, si rilegge e si chiederà di nuovo
          // e al TOTALE che ha mostrato (C4, revisione R): un totale cambiato, sparito o comparso fa decadere il sì
          if (vPrima.protezione === 'pagamento' && (importiDi(dopo) !== importiDi(s) || chiaveTotale(dopo) !== chiaveTotale(s))) {
            annota(azione, bersaglio, 'non-eseguita', 'importo-cambiato');
            segnaResto(azioni, i + 1, 'non-eseguita');
            break;
          }
          s = dopo; bersaglio = vivo;
          v = valutaOra(azione, bersaglio, s);
          if (v.decisione === 'chiedi') {
            // il sì vale per QUELLA protezione col SUO motivo (verifica del Mobile V1): se la pagina è diventata altro (un invio
            // diventato pagamento) non si agisce, si rilegge e si chiederà di nuovo
            if (v.protezione !== vPrima.protezione || v.motivo !== vPrima.motivo) {
              annota(azione, bersaglio, 'non-eseguita', 'protezione-cambiata');
              segnaResto(azioni, i + 1, 'non-eseguita');
              break;
            }
            v = { ...v, decisione: 'procedi' };
            // il sì apre un'operazione: vale per le azioni dopo con la stessa protezione, sulla stessa pagina (T2, Mobile)
            sotto = ricordaSi(v, s, azione); fonte = 'si-carta';
          }
        }
        if (v.decisione === 'ferma') {
          segnaProtezione(azione, v, 'ferma');
          // riga «Posso» (owner 02/11): davanti a pagare/inviare/cancellare il ciclo ASPETTA la persona invece di chiudere, se la porta c'è
          let salta = false;
          for (let giro = 0; giro < GIRI_DEL_PERMESSO && v.decisione === 'ferma' && VOCE_DELLA_PROTEZIONE[v.protezione]
            && typeof porte.permessoMancante === 'function'; giro += 1) {
            const causa = causaDi(v);
            emetti(EVENTI.pausa, { motivo: `permesso:${v.protezione}`, causa });
            const domanda = { azione: tipoDi(azione), protezione: v.protezione, causa };
            const r = await aspettandoLaPersona(() => conTetto((segnale) => porte.permessoMancante(domanda, segnale), lim.msAttesaPermesso, lim.msAnnullamento));
            if (r.scaduto) { segnaResto(azioni, i, 'non-eseguita'); return chiudi('fermato', 'attesa-scaduta', { causa }); }
            if (r.errore) { segnaResto(azioni, i, 'non-eseguita'); return chiudi('fermato', DOMANDA_NON_MOSTRATA, { causa }); }
            const risp = r.v;
            if (risp === 'fallo-tu') { segnaResto(azioni, i, 'non-eseguita'); return chiudi('fermato', 'mano-della-persona', { causa }); }
            if (risp === 'riprendi') {
              const chiave = chiaveAzione(azione, bersaglio);
              rifiuti.set(chiave, (rifiuti.get(chiave) ?? 0) + 1);
              annota(azione, bersaglio, 'non-eseguita', 'rifiutata-dalla-persona');
              segnaResto(azioni, i + 1, 'non-eseguita');
              if (rifiuti.get(chiave) >= 2) return chiudi('fermato', 'rifiutata-dalla-persona', { causa });
              salta = true; // il modello lo vede nella storia e cambia strada
              break;
            }
            if (risp !== 'aggiunto') { segnaResto(azioni, i, 'non-eseguita'); return chiudi('fermato', 'pulsante-ferma', { causa }); }
            // la persona ha acceso la voce: schermo e bersaglio RILETTI, permessi e protezioni RIVALUTATI (come dopo ogni attesa)
            const dopo = await guarda();
            if (!dopo) { segnaResto(azioni, i, 'non-eseguita'); return chiudi('assente', 'aiutante-assente'); }
            const fermaDopo = controlloSchermo(dopo);
            if (fermaDopo) { segnaResto(azioni, i, 'non-eseguita'); return chiudi('fermato', fermaDopo); }
            if (dopo.sospetto) contesto.sospetto = true;
            const vivo = await leggiBersaglio(azione, dopo);
            if (!stessoElemento(vivo, bersaglio)) {
              annota(azione, bersaglio, 'non-eseguita', 'elemento-sparito');
              segnaResto(azioni, i + 1, 'non-eseguita');
              salta = true;
              break;
            }
            s = dopo; bersaglio = vivo;
            v = valutaOra(azione, bersaglio, s);
          }
          if (salta) break;
          if (v.decisione === 'ferma' || v.decisione === 'chiedi') {
            segnaResto(azioni, i, 'non-eseguita');
            return chiudi('fermato', `protezione:${v.protezione ?? v.motivo}`, { causa: causaDi(v) });
          }
          storia.push(`passo ${passi}: la persona ha acceso il permesso, si riparte`);
          fonte = 'tocco-posso';
        }
        if (v.decisione === 'scegli-riservato') {
          segnaProtezione(azione, v, 'scegli-riservato');
          const fatto = typeof porte.scegliRiservato === 'function' ? await porte.scegliRiservato(bersaglio, s, v) : null;
          annota(azione, bersaglio, fatto?.esito ?? 'rifiutata', fatto ? 'scelto-riservato' : 'protezione');
          if (!fatto || FALLIMENTI.has(fatto.esito)) { segnaResto(azioni, i + 1, 'non-eseguita'); break; }
          continue;
        }
        if (v.decisione === 'riscrivi') {
          segnaProtezione(azione, v, 'riscrivi');
          daEseguire = v.azioneSostitutiva;
        } else if (v.decisione === 'procedi-e-segna') {
          segnaProtezione(azione, v, 'procedi-e-segna');
        }

        // la guardia sullo schermo di ADESSO (riletto dopo un'attesa, o col tempo passato): senza il sì valido l'azione non parte. La carta
        // si chiede SUL POSTO (revisione Q, D4-D5): col sì si rilegge, e se schermo, pagina, importi ed elemento sono quelli si agisce;
        // altrimenti l'azione non parte e i suoi conti si disfano (niente spesa né sì segnati per un'azione mai fatta)
        if (guardiaAccesa) {
          const g = guardiaPerAzione(s, bersaglio);
          // variante A: solo un'azione che cambia qualcosa chiede (senza un sì fresco) e chiude il lotto; leggere e scorrere no
          if (g.esito !== 'nulla' && cambiaQualcosa(azione, bersaglio, v, politica, piano)) ultimaNellaGuardia = true;
          if (guardiaDaChiedere(g, azione, bersaglio, v)) {
            const no = await cartaDellaGuardia(g, s, azione);
            if (no) { disfaConti(); segnaResto(azioni, i, 'non-eseguita'); return chiudi('fermato', no); }
            const dopo = await guarda();
            if (!dopo) { disfaConti(); segnaResto(azioni, i, 'non-eseguita'); return chiudi('assente', 'aiutante-assente'); }
            const fermaDopo = controlloSchermo(dopo);
            if (fermaDopo) { disfaConti(); segnaResto(azioni, i, 'non-eseguita'); return chiudi('fermato', fermaDopo); }
            if (dopo.sospetto) contesto.sospetto = true;
            const vivo = await leggiBersaglio(azione, dopo);
            const stesso = bersaglio === null ? vivo === null : stessoElemento(vivo, bersaglio);
            if (!stesso || origineDi(dopo) !== origineDi(s) || paginaDi(dopo) !== paginaDi(s) || importiDi(dopo) !== importiDi(s)
              || (dopo.sospetto && !s.sospetto) || guardiaPerAzione(dopo, vivo).fresco !== true) {
              disfaConti();
              annota(azione, bersaglio, 'non-eseguita', 'schermo-cambiato');
              segnaResto(azioni, i + 1, 'non-eseguita');
              break;
            }
            s = dopo; bersaglio = vivo;
          }
        }
        if (v.protezione) {
          // ogni azione delicata fatta porta chi l'ha decisa; senza una fonte più precisa: la voce della riga, o il permesso scelto
          const voce = VOCE_DELLA_PROTEZIONE[v.protezione];
          const f = fonte ?? (voce && contesto.richiesta[voce] ? fonteVoce[voce] : 'permesso');
          // T11: il metodo scelto sotto il sì della cassa va nella riga (e nella carta di fine), anche su quella della conferma
          const metodo = metodoDelSi ?? (ponteCopre === 'conferma' ? ponteOra?.metodo ?? null : null);
          decisioni.push({ passo: n, protezione: v.protezione, azione: tipoDi(daEseguire), fonte: f, ...(f === 'frase' ? { citazione } : {}), ...(metodo ? { metodo } : {}) });
        }
        emetti(EVENTI.passo, { n, fase: 'annuncio', tipo: tipoDi(daEseguire), bersaglio: breve(bersaglio) }); // PRIMA di agire (Mobile 4)
        // il cursore annunciato (decisione 252): dove andrà, da quando e per quanto vola; il clic parte a t0 + durata
        let durata = 0;
        if (SPAZIALI.has(tipoDi(daEseguire))) {
          const punti = puntiDellAzione(daEseguire, bersaglio, s);
          if (punti[0]) {
            durata = durataDelVolo(ultimoPunto, punti[0], { ridotto: motoRidotto() });
            const f = s?.finestra;
            emetti(EVENTI.annuncio, {
              n,
              finestra: zonaValida(f) ? { x: f.x, y: f.y, w: f.w, h: f.h } : null,
              punto: { x: punti[0].x, y: punti[0].y }, t0: adesso(), durata, modo,
            });
            ultimoPunto = punti.at(-1);
          }
        }
        let partita = false;
        let t1 = adesso();
        // il volo sta DENTRO il tetto del passo: lo Stop o il tempo durante il volo lasciano l'azione non partita
        const fatto = await conTetto(async (segnale) => {
          const fermo = await volo(durata, segnale);
          if (fermo) return { [NON_PARTITA]: fermo };
          partita = true; t1 = adesso();
          return porte.agisci(daEseguire, bersaglio, segnale);
        }, lim.msPerPasso, lim.msAnnullamento);
        if (!partita && (fatto.scaduto || fatto.v?.[NON_PARTITA])) {
          const motivo = fatto.v?.[NON_PARTITA] ?? 'tempo';
          annota(daEseguire, bersaglio, 'non-eseguita', motivo);
          segnaResto(azioni, i + 1, 'non-eseguita');
          return chiudi('fermato', motivo);
        }
        misure.azioni += 1; misure.msAiutante += adesso() - t1;
        if (fatto.scaduto && !fatto.chiusa) {
          // l'aiutante non ha confermato l'annullamento: potrebbe ancora agire. Nessun'altra azione (Mobile S1-1)
          misure.azioniFallite += 1;
          annota(daEseguire, bersaglio, 'rifiutata', 'tempo');
          segnaResto(azioni, i + 1, 'non-eseguita');
          return chiudi('fermato', 'tempo');
        }
        const e = fatto.v && ESITI_AZIONE.includes(fatto.v.esito) ? fatto.v : { esito: 'rifiutata', motivo: fatto.scaduto ? 'tempo' : 'altro' };
        annota(daEseguire, bersaglio, e.esito, e.motivo, e);
        if (FALLIMENTI.has(e.esito)) {
          misure.azioniFallite += 1;
          fallimenti += 1;
          segnaResto(azioni, i + 1, 'non-eseguita');
          if (fallimenti >= lim.fallimentiDiFila) return chiudi('non-riuscito', 'errori-di-fila');
          break;
        }
        if (e.ritentata === true) misure.azioniRitentate += 1;
        fallimenti = 0;
        if (ordinale !== null && TIPI_CON_ORDINALE.has(tipoDi(azione)) && bersaglio?.inLista) ordinale = null; // rispettato una volta: basta
        // T9: un pagamento AVVIATO col sì della carta, con un totale etichettato, apre il ponte per la conferma dell'azione dopo
        if (v.protezione === 'pagamento' && fonte === 'si-carta' && AVVIA_PAGAMENTO.test(etichetta(bersaglio))) {
          const tot = totaleFinale(s);
          if (tot) ponte = { passo: n, chiave: `${tot.importo}|${tot.valuta}`, origine: origineDi(s), pagina: paginaDi(s) };
        }
        // T11: scelto il metodo sotto il sì della cassa, il ponte resta per la conferma subito dopo (il metodo una volta sola)
        if (metodoDelSi && ponteOra) ponte = { ...ponteOra, passo: n, metodo: metodoDelSi };
        if (sotto && e.cambiato) consumaSi(sotto); // l'azione sotto il sì ha cambiato la finestra: l'operazione è chiusa (T2)
        if (e.cambiato) { segnaResto(azioni, i + 1, 'non-eseguita'); break; } // finestra, indirizzo o fuoco cambiati: si rilegge
      }
      if (fineNelLotto) return await concludi(fineNelLotto);
    }
  } catch {
    // una porta ha lanciato: l'uscita passa comunque dalla strozzatura, col suo evento (Mobile S1-2)
    return chiudi('non-riuscito', 'errore-interno');
  }

  async function concludi(fine) {
    // `fine` dichiara: riuscito sì/no, o impossibile (il compito non si può fare: va detto, non finto)
    if (fine?.impossibile === true) return chiudi('non-riuscito', 'impossibile');
    if (fine?.riuscito !== true) return chiudi('non-riuscito', 'senza-esito');
    let verificato = null;
    if (typeof porte.confermaObiettivo === 'function') {
      const c = await conTetto((segnale) => porte.confermaObiettivo(segnale), lim.msPerPasso, lim.msAnnullamento);
      verificato = typeof c.v === 'boolean' ? c.v : null;
    }
    return chiudi(verificato === false ? 'non-riuscito' : 'riuscito', 'completato', { verificato });
  }
}
