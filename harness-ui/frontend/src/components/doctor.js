import { t as traduci, tn, linguaCorrenteDiT } from './lingua.js';
import { testoDelCampo, nomeDelFornitore, esecuzioneDelFornitore } from './testo-server.js'; // K4a: i dettagli che il server manda come dati, nella lingua corrente
/* Date nella lingua dell'interfaccia (italiano → it-IT, inglese → en-US), letta a ogni uso. */
const localeUI=()=>(linguaCorrenteDiT()==='en'?'en-US':'it-IT');
// 05/9 Fase 2: Doctor; il grado di certezza segue il dato, non la sua presenza.
/*
 * 023 passo 2 (owner 10/11/2026 21:47, registro 436): «Elenco e pannello». Ogni controllo è una voce con una riga breve (l'elenco),
 * i dettagli, ciò che il controllo NON prova e al massimo due cose che si possono fare (il pannello). «Chiave API» e «Fornitori e
 * portachiavi» sono una voce sola, «Modelli e accessi», con lo stato vero di ogni fornitore: la chiave e l'accesso col piano sono due
 * fonti distinte. ⛔ Dal piano si leggono SOLO due booleani; campo assente o malformato = «non misurato», mai «collegato».
 */
/* ⛔ Le parole della gravità sono funzioni: si leggono a ogni uso e seguono il cambio di lingua. */
const GRAVITA={danger:()=>traduci('varie.doctor.severity.danger'),warning:()=>traduci('varie.doctor.severity.warning'),info:()=>traduci('varie.doctor.severity.info'),success:()=>traduci('varie.doctor.severity.ok')};
/* Il conto di uno si dice al singolare («1 avviso», non «1 avvisi» com'era fino al 10/11/2026): la forma la sceglie la lingua (`tn`). */
const CONTO={danger:['varie.doctor.severity.danger','modello.doctor.failures'],warning:['varie.doctor.severity.warning','modello.doctor.warnings'],info:['varie.doctor.severity.info','modello.doctor.notes'],success:['varie.doctor.severity.ok','modello.doctor.ok']};
const parolaDelConto=(g,n)=>tn(CONTO[g][0],CONTO[g][1],n).toLocaleLowerCase(localeUI());
/* 023 cura piccola (giudice v1477, correzione 1; reperto 6 del controllore): la parola dell'esito DENTRO una frase va minuscola, come nei
   filtri (`parolaDelConto`): «Controllo rifatto: ora guasto.», non «ora Guasto.». Una sigla («OK») resta com'è. */
const parolaInFrase=(g)=>{const p=GRAVITA[g]();return p===p.toLocaleUpperCase(localeUI())?p:p.toLocaleLowerCase(localeUI());};
const ORDINE={danger:0,warning:1,info:2,success:3};
/* L'esito si riconosce dalla FORMA e dalla parola, non solo dal colore: cerchio ✓ e i, quadrato smussato !, quadrato ×. */
const SEGNI={danger:'×',warning:'!',info:'i',success:'✓'};
const ESITI=['danger','warning','info','success'];
/** I tipi di azione che una voce o il suo menu possono chiedere a chi ospita la pagina. */
export const TIPI_AZIONE_DOCTOR=Object.freeze(['apri','vai','copia','ricontrolla','chiedi','prova']);
const oggetto=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const testo=v=>typeof v==='string'?v:'';
const maiuscola=v=>v?v.charAt(0).toLocaleUpperCase(localeUI())+v.slice(1):v;
function valida(r){
 const errore=()=>{throw new Error(traduci('varie.doctor.error.invalidResponse'));};
 if(!oggetto(r)||!['chiaveApi','git','naviga'].every(k=>typeof r[k]==='boolean')||!['desktop','wsl2','none'].includes(r.shell))errore();
 const tipi={labs:{accesi:'array'},ricercaWeb:{fonte:'string',pronta:'boolean'},cartelleProgetto:{disponibili:'boolean',conteggio:'number'},providers:{storeAvailable:'boolean',items:'array'},ownerRuntime:{configurato:'boolean',pronto:'boolean'},catalogoTask:{disponibile:'boolean'},sessioniPersistenza:{corrotte:'array'}};
 for(const [k,shape] of Object.entries(tipi)){if(!(k in r))continue;if(!oggetto(r[k]))errore();for(const [f,t] of Object.entries(shape)){const v=r[k][f];if(t==='array'?!Array.isArray(v):typeof v!==t||(t==='number'&&(!Number.isFinite(v)||v<0)))errore();}if('dettaglio' in r[k]&&typeof r[k].dettaglio!=='string')errore();}
 if(r.labs&&!r.labs.accesi.every(v=>typeof v==='string'))errore();
 if(r.providers&&!r.providers.items.every(p=>oggetto(p)&&typeof p.id==='string'&&typeof p.label==='string'&&typeof p.keyConfigured==='boolean'))errore();
 const s=r.sessioniPersistenza;if(s){if(!s.corrotte.every(v=>typeof v==='string'))errore();if('scartate'in s&&(!Array.isArray(s.scartate)||!s.scartate.every(v=>oggetto(v)&&typeof v.sessionId==='string'&&typeof v.motivo==='string'&&(!('dettaglio'in v)||typeof v.dettaglio==='string'))))errore();if('ultimaLettura'in s&&(!oggetto(s.ultimaLettura)||!['ripristinate','totali'].every(k=>Number.isInteger(s.ultimaLettura[k])&&s.ultimaLettura[k]>=0)))errore();}
}
function dettaglioSessioni(s, scarti) {
 if (!s.dettaglioParams || !s.perMotivo) return testoDelCampo(s, 'dettaglio');
 const reasons = Object.entries(s.perMotivo).map(([motivo, n]) => {
  const voce = scarti.find(v => v.motivo === motivo);
  return `${n} ${voce ? testoDelCampo(voce, 'motivo') : motivo}`;
 }).join(', ');
 return testoDelCampo({ ...s, dettaglioParams: { ...s.dettaglioParams, reasons } }, 'dettaglio');
}

/* Una voce. `righe` resta (riga breve, dettagli, fornitori, limite): lo leggono il riassunto del foglio Controllo e «Copia i dettagli». */
function voce(id, titolo, gravita, riga, extra = {}) {
  const dettaglio = (extra.dettaglio || []).flat().filter(Boolean);
  const azioni = (extra.azioni || []).filter(Boolean).slice(0, 2);
  const limite = extra.limite || '';
  const daRivedere = gravita === 'warning' || gravita === 'danger';
  /* B2: per un avviso o un guasto c'è un'azione vera, oppure la frase che dice che da qui non si può fare niente. Mai solo «Ricontrolla». */
  const nienteDaFare = daRivedere && !azioni.length ? (extra.nienteDaFare || traduci('varie.doctor.panel.nothing') + '.') : '';
  const fatta = { id, titolo, gravita, riga, dettaglio, limite, azioni, nienteDaFare };
  if (extra.fornitori) fatta.fornitori = extra.fornitori;
  if (extra.prontezza) fatta.prontezza = extra.prontezza;
  fatta.righe = [riga, ...dettaglio, ...(extra.fornitori || []).map((f) => f.nome + ': ' + f.stato), limite].filter(Boolean);
  return fatta;
}
const apri = (dove, testoAzione) => ({ tipo: 'apri', dove, testo: testoAzione });

/* ⛔ E1: dal campo del piano si copiano due booleani, campo per campo. Qualunque altra forma = non misurato. */
function pianoChatgpt(r) {
  const c = oggetto(r.accessoPiano) && oggetto(r.accessoPiano.chatgpt) ? r.accessoPiano.chatgpt : null;
  return c && typeof c.collegato === 'boolean' && typeof c.pianoAbilitato === 'boolean' ? { collegato: c.collegato, pianoAbilitato: c.pianoAbilitato } : null;
}

/* Lo stato VERO di un fornitore. Il valore `execution` del server («collegato» = l'adattatore esiste) non è un accesso e non si mostra. */
function rigaFornitore(p, r, piano) {
  const riga = (gravita, stato, sotto, come) => ({ id: p.id, nome: nomeDelFornitore(p), gravita, stato, sotto, pronto: Boolean(come), ...(come ? { come } : {}) });
  /* `chiaveApi` è la chiave OpenRouter che il server legge dall'ambiente (la vecchia carta «Chiave API») */
  const chiave = p.keyConfigured || (p.id === 'openrouter' && r.chiaveApi === true);
  const origine = p.keyConfigured ? p.origineChiave : 'ambiente';
  const delPiano = p.id === 'openai' ? piano : null;
  if (delPiano?.collegato && delPiano.pianoAbilitato) return riga('success', traduci('varie.doctor.check.access.state.planConnected'), traduci('varie.doctor.check.access.under.planConnected'), traduci('varie.doctor.check.access.how.plan'));
  if (chiave) {
    const sotto = origine === 'ambiente' ? traduci('varie.doctor.check.access.under.keyEnv') : origine === 'custodia' ? traduci('varie.doctor.check.access.under.keyKeychain') : traduci('varie.doctor.check.access.under.keyUnknown');
    return delPiano?.collegato
      ? riga('warning', traduci('varie.doctor.check.access.state.keySaved'), traduci('varie.doctor.check.access.under.planReconnect'), traduci('varie.doctor.check.access.how.key'))
      : riga('success', traduci('varie.doctor.check.access.state.keySaved'), sotto, traduci('varie.doctor.check.access.how.key'));
  }
  if (delPiano?.collegato) return riga('warning', traduci('varie.doctor.check.access.state.planReconnect'), traduci('varie.doctor.check.access.under.planReconnect'));
  const esecuzione = testo(p.execution);
  /* runtime e motori locali, agente esterno: il Doctor non misura se sono avviati, quindi non li dà per pronti */
  if (esecuzione && esecuzione !== 'collegato') return riga('info', maiuscola(esecuzioneDelFornitore(esecuzione)), p.requiresKey !== false ? traduci('varie.doctor.check.access.under.noKey') : esecuzione === 'configurato' ? '' : traduci('varie.doctor.check.access.under.notChecked'));
  if (p.id === 'openai') return riga('info', traduci('varie.doctor.check.access.state.none'), piano ? traduci('varie.doctor.check.access.under.noPlanNoKey') : traduci('varie.doctor.check.access.under.planUnknown'));
  return riga('info', traduci('varie.doctor.check.access.state.none'), traduci('varie.doctor.check.access.under.noKey'));
}

function voceFornitori(r) {
  const titolo = traduci('varie.doctor.check.access.title');
  const limite = traduci('varie.doctor.check.access.limit');
  const apriProvider = apri('provider', traduci('varie.doctor.check.access.open'));
  /* un server di prima, senza l'elenco: resta ciò che diceva la carta «Chiave API» */
  if (!r.providers) return voce('fornitori', titolo, r.chiaveApi ? 'info' : 'warning', r.chiaveApi ? traduci('varie.doctor.check.access.keyOnlySaved') : traduci('varie.doctor.check.access.keyOnlyMissing'), { limite, azioni: [apriProvider] });
  const piano = pianoChatgpt(r);
  const fornitori = r.providers.items.map((p) => rigaFornitore(p, r, piano));
  /* il piano è collegato ma la risposta non ha la riga di OpenAI: l'accesso c'è lo stesso, e si dice */
  if (piano?.collegato && piano.pianoAbilitato && !fornitori.some((f) => f.id === 'openai')) fornitori.unshift(rigaFornitore({ id: 'openai', label: 'OpenAI', keyConfigured: false }, r, piano));
  const pronti = fornitori.filter((f) => f.pronto);
  const dettaglio = [r.providers.storeAvailable ? traduci('varie.doctor.check.access.keychainOk') : traduci('varie.doctor.check.access.keychainBad')];
  if (pronti.length) {
    const gravita = fornitori.some((f) => f.gravita === 'warning') || !r.providers.storeAvailable ? 'warning' : 'success';
    /* un avviso dice il suo motivo: il fornitore da rivedere può stare sotto «Tutti», fuori dalla vista «Pronti» */
    const daRivedere = fornitori.filter((f) => f.gravita === 'warning');
    const riga = tn('varie.doctor.check.access.readyOne', 'varie.doctor.check.access.readyMany', pronti.length, { list: pronti.map((f) => f.nome + ' (' + f.come + ')').join(', ') })
      + (daRivedere.length ? ' ' + traduci('varie.doctor.check.access.toReview', { list: daRivedere.map((f) => f.nome).join(', ') }) : '');
    const motivi = daRivedere.map((f) => f.nome + ': ' + f.stato + '.' + (f.sotto ? ' ' + f.sotto : ''));
    return voce('fornitori', titolo, gravita, riga, { dettaglio: [...motivi, ...dettaglio], limite, azioni: [apriProvider], fornitori });
  }
  const limiteSenzaPronti = limite + ' ' + traduci('varie.doctor.check.access.limitLocal');
  /* senza la misura del piano non si può dire «TALOS non può rispondere»: è un avviso, non un guasto inventato */
  if (!piano) return voce('fornitori', titolo, 'warning', traduci('varie.doctor.check.access.noneReadyPlanUnknown'), { dettaglio, limite: limiteSenzaPronti, azioni: [apriProvider], fornitori, prontezza: 'ignota' });
  /* 023 cura 1 (owner 11/11/2026, O2): la riga dice già che un motore locale avviato può rispondere e che qui non si misura; il limite
     non lo ripete (una frase sola, non due uguali nel pannello). */
  return voce('fornitori', titolo, 'danger', traduci('varie.doctor.check.access.noneReady'), { dettaglio, limite, azioni: [apri('provider', traduci('varie.doctor.check.access.connect'))], fornitori });
}

export function controlliDoctor(r){
  valida(r);
  const c = [];
  const ignoto = (id, titolo) => c.push(voce(id, titolo, 'info', traduci('varie.doctor.notObserved')));
  c.push(voceFornitori(r));
  const titoloRuntime = traduci('varie.doctor.check.runtime.title');
  if (r.ownerRuntime) c.push(voce('runtime', titoloRuntime, r.ownerRuntime.pronto ? 'success' : 'warning',
    testoDelCampo(r.ownerRuntime, 'dettaglio') || (r.ownerRuntime.pronto ? traduci('varie.doctor.check.runtime.ready') : traduci('varie.doctor.check.runtime.notReady')),
    { dettaglio: [r.ownerRuntime.configurato ? traduci('varie.doctor.check.runtime.configured') : traduci('varie.doctor.check.runtime.notConfigured')], limite: traduci('varie.doctor.check.runtime.limit'), nienteDaFare: traduci('varie.doctor.check.runtime.nothing') }));
  else ignoto('runtime', titoloRuntime);
  if (r.catalogoTask) c.push(voce('catalogo', traduci('varie.doctor.check.catalog.title'), r.catalogoTask.disponibile ? 'success' : 'warning',
    testoDelCampo(r.catalogoTask, 'dettaglio') || (r.catalogoTask.disponibile ? traduci('varie.doctor.check.catalog.available') : traduci('varie.doctor.check.catalog.unavailable')),
    { limite: traduci('varie.doctor.check.catalog.limit'), azioni: r.catalogoTask.disponibile ? [] : [{ tipo: 'vai', id: 'runtime', testo: traduci('varie.doctor.check.catalog.goTo', { title: titoloRuntime }) }] }));
  else ignoto('catalogo', traduci('varie.doctor.check.catalog.title'));
  const doveGirano = apri('doveGirano', traduci('varie.doctor.check.shell.action'));
  if (r.shell === 'none') c.push(voce('shell', traduci('varie.doctor.check.shell.title'), 'danger', traduci('varie.doctor.check.shell.none'), { azioni: [doveGirano] }));
  else if (r.shell === 'wsl2') c.push(voce('shell', traduci('varie.doctor.check.shell.title'), 'success', traduci('varie.doctor.check.shell.short.wsl2'), { dettaglio: [traduci('varie.doctor.check.shell.wsl2')], azioni: [doveGirano] }));
  else c.push(voce('shell', traduci('varie.doctor.check.shell.title'), 'info', traduci('varie.doctor.check.shell.short.desktop'), { limite: traduci('varie.doctor.check.shell.limit'), azioni: [doveGirano] }));
  c.push(r.naviga
    ? voce('browser', traduci('varie.doctor.check.browser.title'), 'info', traduci('varie.doctor.check.browser.short.ok'), { limite: traduci('varie.doctor.check.browser.limit') })
    : voce('browser', traduci('varie.doctor.check.browser.title'), 'warning', traduci('varie.doctor.check.browser.bad'), { nienteDaFare: traduci('varie.doctor.check.browser.nothing') }));
  if (r.ricercaWeb) c.push(voce('ricerca', traduci('varie.doctor.check.search.title'), r.ricercaWeb.pronta || r.ricercaWeb.fonte === 'off' ? 'info' : 'warning',
    testoDelCampo(r.ricercaWeb, 'etichetta') || r.ricercaWeb.fonte,
    { dettaglio: [testoDelCampo(r.ricercaWeb, 'dettaglio')], limite: traduci('varie.doctor.check.search.note'), azioni: [apri('fonteRicerca', traduci('varie.doctor.check.search.action'))] }));
  else ignoto('ricerca', traduci('varie.doctor.check.search.title'));
  c.push(r.git
    ? voce('git', 'Git', 'success', traduci('varie.doctor.check.git.ok'))
    : voce('git', 'Git', 'warning', traduci('varie.doctor.check.git.bad'), { nienteDaFare: traduci('varie.doctor.check.git.nothing') }));
  /* 29/10/2026: zero cartelle fisse con `sceltaPerSessione` è lo stato voluto dell'app installata, non un avviso */
  if (r.cartelleProgetto) {
    const perSessione = r.cartelleProgetto.sceltaPerSessione === true && r.cartelleProgetto.conteggio === 0;
    c.push(voce('cartelle', traduci('varie.doctor.check.folders.title'), r.cartelleProgetto.disponibili || perSessione ? 'success' : 'warning',
      perSessione ? traduci('varie.doctor.check.folders.choosePerSession') : tn('varie.doctor.check.folders.allowedOne', 'varie.doctor.check.folders.allowedMany', r.cartelleProgetto.conteggio),
      { dettaglio: [testoDelCampo(r.cartelleProgetto, 'dettaglio')], azioni: [apri('spazio', traduci('varie.doctor.check.folders.action'))] }));
  } else ignoto('cartelle', traduci('varie.doctor.check.folders.title'));
  if (r.sessioniPersistenza) {
    const s = r.sessioniPersistenza, scarti = s.scartate || [], nonElencate = s.corrotte.filter((id) => !scarti.some((v) => v.sessionId === id));
    const gravita = s.corrotte.length || scarti.some((v) => ['corrotta', 'lettura-fallita'].includes(v.motivo)) ? 'danger' : scarti.length ? 'warning' : 'success';
    c.push(voce('sessioni', traduci('varie.doctor.check.sessions.title'), gravita,
      dettaglioSessioni(s, scarti) || (s.ultimaLettura ? traduci('varie.doctor.check.sessions.restored', { restored: s.ultimaLettura.ripristinate, total: s.ultimaLettura.totali }) : traduci('varie.doctor.check.sessions.notObserved')),
      { dettaglio: [scarti.map((v) => v.sessionId + ' · ' + testoDelCampo(v, 'motivo') + (v.dettaglio ? ' · ' + testoDelCampo(v, 'dettaglio') : '')), nonElencate.map((id) => traduci('varie.doctor.check.sessions.corrupt', { id }))],
        azioni: gravita === 'success' ? [] : [{ tipo: 'copia', testo: traduci('varie.doctor.check.sessions.copy') }] }));
  } else ignoto('sessioni', traduci('varie.doctor.check.sessions.title'));
  if (r.labs) c.push(voce('labs', traduci('varie.doctor.check.labs.title'), 'info', testoDelCampo(r.labs, 'dettaglio') || traduci('varie.doctor.check.labs.on', { list: r.labs.accesi.join(', ') || traduci('varie.doctor.check.labs.none') })));
  else ignoto('labs', traduci('varie.doctor.check.labs.title'));
  return c.sort((a,b)=>ORDINE[a.gravita]-ORDINE[b.gravita]);
}
/**
 * Le voci della pagina: il controllo intero, e per le righe rifatte da «Ricontrolla solo questo» la voce letta dal LORO risultato
 * (`rifatte`: id → risposta grezza del server). Si tiene il risultato e non la voce già scritta: cambiando lingua, la riga rifatta si
 * riscrive nella lingua nuova come tutte le altre. Valgono finché non si rifà tutto («Ricontrolla» in alto, o l'apertura della pagina).
 */
export function vociDelDoctor(risultato, rifatte = {}, motoreLocale = null) {
  const voci = controlliDoctor(risultato).map((v) => (Object.hasOwn(rifatte, v.id) ? controlliDoctor(rifatte[v.id]).find((n) => n.id === v.id) || v : v));
  if (motoreLocale) voci.push(voceMotoreLocale(motoreLocale)); // la riga c'è solo dove chi ospita la pagina sa fare la prova
  return voci.sort((a, b) => ORDINE[a.gravita] - ORDINE[b.gravita]);
}
/**
 * ⭐ 023 cura piccola (owner 11/11/2026 13:50, decisione 9: «Sì, prova vera»; giudice v1477, correzione 3): la riga «Motore locale». La
 *   prova la fa il server (`POST /api/v1/doctor/local-engine`, `src/doctor-motore-locale.mjs`): una richiesta minima al modello GIÀ
 *   caricato, esito e tempo. ⛔ Mai un caricamento né uno scaricamento: senza un modello caricato la riga lo dice e basta.
 *   `prova`: `{ esito: 'nonProvato'|'inCorso'|'risponde'|'errore'|'dorme'|'statoIgnoto'|'nessunCaricato'|'nessunModello'|'nessunMotore'|'nonRiuscita', nome?, ms?, codice? }`.
 */
const secondi = (ms) => new Intl.NumberFormat(localeUI(), { maximumFractionDigits: 1 }).format(Math.max(0, Number(ms) || 0) / 1000) + ' s';
export function voceMotoreLocale(prova) {
  const titolo = traduci('varie.doctor.check.engine.title');
  const limite = traduci('varie.doctor.check.engine.limit');
  const prova1 = { tipo: 'prova', testo: traduci('varie.doctor.check.engine.run') };
  const ancora = { tipo: 'prova', testo: traduci('varie.doctor.check.engine.again') };
  const installati = apri('installati', traduci('varie.doctor.check.engine.openInstalled'));
  const modello = prova?.nome ? [traduci('varie.doctor.check.engine.model', { model: prova.nome })] : [];
  const caricato = prova?.nome ? [traduci('varie.doctor.check.engine.modelLoaded', { model: prova.nome })] : []; // dorme, stato ignoto: niente è stato provato
  switch (prova?.esito) {
    case 'inCorso': return voce('motore', titolo, 'info', traduci('varie.doctor.check.engine.running'), { limite });
    case 'risponde': return voce('motore', titolo, 'success', traduci('varie.doctor.check.engine.answered', { time: secondi(prova.ms) }), { dettaglio: modello, limite, azioni: [ancora] });
    /* giro dopo il revisore: «non ha risposto in 30 s» solo quando è finita l'attesa; un errore che arriva subito dice che è un errore */
    case 'errore': return voce('motore', titolo, 'warning', traduci(prova.codice === 'TIMEOUT' ? 'varie.doctor.check.engine.failed' : 'varie.doctor.check.engine.failedError', { time: secondi(prova.ms) }), { dettaglio: [...modello, traduci('varie.doctor.check.engine.failedHelp')], limite, azioni: [ancora, installati] });
    /* giudice v1503, opzione A: il modello dorme (motore a router, 15 minuti fermo) o il motore non dice se è sveglio: niente è partito */
    case 'dorme': return voce('motore', titolo, 'info', traduci('varie.doctor.check.engine.asleep'), { dettaglio: [...caricato, traduci('varie.doctor.check.engine.asleepHelp')], limite, azioni: [ancora] });
    case 'statoIgnoto': return voce('motore', titolo, 'warning', traduci('varie.doctor.check.engine.stateUnknown'), { dettaglio: caricato, limite, azioni: [ancora] });
    case 'nessunCaricato': return voce('motore', titolo, 'info', traduci('varie.doctor.check.engine.noneLoaded'), { dettaglio: [traduci('varie.doctor.check.engine.noneLoadedHelp')], limite, azioni: [ancora, installati] });
    /* senza un modello non c'è niente da riprovare né da aprire: il passo vero è trovarne uno (lo scarica la persona, mai il Doctor) */
    case 'nessunModello': return voce('motore', titolo, 'info', traduci('varie.doctor.check.engine.noModel'), { limite, azioni: [apri('scarica', traduci('varie.doctor.check.engine.findModel'))] });
    case 'nessunMotore': return voce('motore', titolo, 'info', traduci('varie.doctor.check.engine.noEngine'), { limite, azioni: [ancora] });
    /* l'errore del server non si mostra: arriva in inglese anche nell'interfaccia italiana (`http-app.mjs:1036`, revisore) */
    case 'nonRiuscita': return voce('motore', titolo, 'warning', traduci('varie.doctor.check.engine.notSent'), { limite, azioni: [ancora] });
    default: return voce('motore', titolo, 'info', traduci('varie.doctor.check.engine.notRun'), { limite, azioni: [prova1] });
  }
}
/**
 * ⭐ 023 cura 1 (owner 11/11/2026, O1; bozzetto `:660`): «Ricontrolla solo questo» rifà SOLO quella riga. Il server ha un controllo solo
 *   (`GET /api/v1/doctor`, tutto insieme): si prende dal risultato nuovo la voce chiesta e le altre restano come erano. Il messaggio è
 *   quello del bozzetto: «Controllo rifatto: stesso esito.», oppure il nuovo esito.
 */
export function ricontrollaSoloQuesta(vociPrima, risultatoNuovo, id) {
  const prima = vociPrima.find((v) => v.id === id) || null;
  const nuova = controlliDoctor(risultatoNuovo).find((v) => v.id === id) || prima;
  const voci = vociPrima.map((v) => (v.id === id && nuova ? nuova : v)).sort((a, b) => ORDINE[a.gravita] - ORDINE[b.gravita]);
  const stessoEsito = Boolean(prima && nuova && prima.gravita === nuova.gravita && prima.riga === nuova.riga);
  const messaggio = stessoEsito ? traduci('varie.doctor.recheck.same') : traduci('varie.doctor.recheck.now', { severity: parolaInFrase(nuova?.gravita || 'info') });
  return { voci, voce: nuova, stessoEsito, messaggio };
}
/**
 * ⭐ Ultimo giro della 023 (reperto 5 del controllore): il file di «Esporta» dice ciò che dice la pagina. Prima scriveva solo il controllo
 *   intero: dopo una riga rifatta il file diceva «git a posto» mentre la pagina diceva l'avviso. Ora il controllo intero resta com'era
 *   (`risultato`, con la sua ora), le righe rifatte ci sono col LORO risultato nuovo e la loro ora (`righeRifatte`), e `voci` sono le
 *   righe come la pagina le mostra (id, titolo, esito, riga), nell'ordine della pagina.
 */
/* 023 cura piccola, punto 4 (giudice 14:33; reperto 5 del controllore): i dati del server che fanno ciascuna riga. Una riga rifatta porta nel
   file SOLO questi, una volta: prima copiava il controllo intero nuovo a ogni riga (30 → 62 → 94 KB), con valori di righe che la pagina
   non mostra (chi legge il file poteva credere ricontrollate righe che non lo erano). */
const DATI_DELLA_RIGA = Object.freeze({ fornitori: ['chiaveApi', 'providers', 'accessoPiano'], runtime: ['ownerRuntime'], catalogo: ['catalogoTask'], shell: ['shell'],
  browser: ['naviga'], ricerca: ['ricercaWeb'], git: ['git'], cartelle: ['cartelleProgetto'], sessioni: ['sessioniPersistenza'], labs: ['labs'] });
const datiDellaRiga = (id, risultato) => Object.fromEntries((DATI_DELLA_RIGA[id] || Object.keys(risultato)).filter((k) => Object.hasOwn(risultato, k)).map((k) => [k, risultato[k]]));
export function esportazioneDoctor({ ricevutoAlle, risultato, vociRifatte = {}, rifatteAlle = {}, motoreLocale = null }) {
  const righeRifatte = Object.fromEntries(Object.entries(vociRifatte).map(([id, nuovo]) => [id, { ricevutoAlle: rifatteAlle[id] ?? null, risultato: datiDellaRiga(id, nuovo) }]));
  const voci = vociDelDoctor(risultato, vociRifatte, motoreLocale).map((v) => ({ id: v.id, titolo: v.titolo, esito: v.gravita, riga: v.riga }));
  return { ricevutoAlle, risultato, righeRifatte, ...(motoreLocale ? { motoreLocale } : {}), voci };
}
export function contaGravitaDoctor(voci){const n={success:0,info:0,warning:0,danger:0};for(const v of voci)n[v.gravita]++;return n;}

/** Il verdetto in testa alla pagina: una frase sola che dice se si può lavorare, e l'azione che porta al punto peggiore. */
export function verdettoDoctor(voci) {
  const n = contaGravitaDoctor(voci), modelli = voci.find((v) => v.id === 'fornitori'), peggiore = voci[0];
  const gravita = n.danger ? 'danger' : n.warning ? 'warning' : 'success';
  /* 023 cura 1 (owner 11/11/2026, O1): via il verdetto in più «Controlla l’accesso ai modelli». I titoli sono quelli del bozzetto;
     l'accesso non misurato è un avviso come gli altri, e la frase sotto il titolo (la riga dei modelli) dice che il piano non è misurato. */
  const titolo = modelli?.gravita === 'danger' ? traduci('varie.doctor.verdict.cannotAnswer')
    : n.danger ? tn('varie.doctor.verdict.failuresOne', 'varie.doctor.verdict.failuresMany', n.danger)
    : n.warning ? tn('varie.doctor.verdict.reviewOne', 'varie.doctor.verdict.reviewMany', n.warning)
    : traduci('varie.doctor.verdict.allGood');
  const daGuardare = peggiore && (peggiore.gravita === 'danger' || peggiore.gravita === 'warning') ? peggiore : null;
  const azione = !daGuardare ? null : daGuardare.id === 'fornitori' && daGuardare.azioni[0] ? daGuardare.azioni[0] : { tipo: 'vai', id: daGuardare.id, testo: traduci('varie.doctor.verdict.look', { title: daGuardare.titolo }) };
  return { gravita, titolo, frase: modelli?.riga || '', azione };
}

/** Le tre voci del menu «⋯» e del tasto destro di un controllo. */
export function vociMenuDoctor(_voce) {
  return [{ tipo: 'ricontrolla', testo: traduci('varie.doctor.menu.recheck') }, { tipo: 'copia', testo: traduci('varie.doctor.menu.copy') }, { tipo: 'chiedi', testo: traduci('varie.doctor.menu.ask') }];
}

/** Il testo di «Copia i dettagli»: ciò che la pagina già mostra per quel controllo, niente di più. */
export function testoDaCopiareDoctor(v) {
  return [v.titolo + ' — ' + GRAVITA[v.gravita](), ...v.righe, ...(v.nienteDaFare ? [v.nienteDaFare] : [])].join('\n');
}

/** La domanda di «Chiedi a TALOS di spiegarlo»: titolo, esito e riga breve. Chi ospita la scrive nel composer, non la invia. */
export function domandaDoctor(v) {
  return traduci('varie.doctor.ask.prompt', { title: v.titolo, severity: GRAVITA[v.gravita](), row: v.riga });
}

function nodo(doc,tag,classe,valore){const e=doc.createElement(tag);if(classe)e.className=classe;if(valore!==undefined)e.textContent=valore;return e;}
/* La carta di prima (una per controllo, tutte aperte). La pagina ora usa le righe dell'elenco; resta per chi la disegna da sola. */
export function creaCheckCard(voce,opzioni={}){const d=opzioni.document||globalThis.document;const card=nodo(d,'div','talos-card talos-check-card'+(voce.gravita==='success'?'':' talos-check-card--'+voce.gravita));card.dataset.c='CheckCard';card.dataset.doctorId=voce.id;const stripe=nodo(d,'span','talos-check-card__stripe');stripe.setAttribute('aria-hidden','true');const body=nodo(d,'div','talos-check-card__body');const title=nodo(d,'div','talos-check-card__title',GRAVITA[voce.gravita]()+' · '+voce.titolo);body.append(title,...voce.righe.map(r=>nodo(d,'p','',r)));card.append(stripe,body);return card;}

function segno(doc, gravita) {
  const e = nodo(doc, 'span', 'talos-doctor__sign', SEGNI[gravita]);
  e.dataset.g = gravita;
  e.setAttribute('aria-hidden', 'true');
  return e;
}
const giornoDiRoma = (data) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(data);
function quando(iso, adesso) {
  const data = new Date(iso);
  if (giornoDiRoma(data) === giornoDiRoma(adesso)) return traduci('varie.doctor.time.today', { time: new Intl.DateTimeFormat(localeUI(), { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }).format(data) });
  return new Intl.DateTimeFormat(localeUI(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }).format(data);
}

const ID_RIGA = (id) => 'doctor-ctl-' + id;
const schermi=new WeakMap();

/* Il corpo della pagina si costruisce qui, una volta: verdetto, errore, filtri, elenco e pannello. Chi ospita dà solo la testata. */
function costruisci(s, st) {
  const d = s.ownerDocument;
  const pagina = s.querySelector('[data-doctor-page]') || s.querySelector('[data-doctor-list]')?.parentNode || s;
  const verdetto = nodo(d, 'div', 'talos-doctor__verdict'); verdetto.dataset.doctorVerdict = '';
  const segnoVerdetto = segno(d, 'info'); segnoVerdetto.dataset.doctorVerdictSign = '';
  /* ⛔ l'UNICO `role=status` della schermata: titolo del verdetto, frase dei modelli e, se serve, lo stato della corsa */
  const esito = nodo(d, 'div', 'talos-doctor__verdict-text'); esito.setAttribute('role', 'status'); esito.dataset.doctorEsito = '';
  const azioniVerdetto = nodo(d, 'div', 'talos-doctor__verdict-actions'); azioniVerdetto.dataset.doctorVerdictActions = '';
  verdetto.append(segnoVerdetto, esito, azioniVerdetto);
  const errore = nodo(d, 'p', 'talos-doctor__error'); errore.setAttribute('role', 'alert'); errore.dataset.doctorErrore = ''; errore.hidden = true;
  const filtri = nodo(d, 'div', 'talos-doctor__filters'); filtri.dataset.c = 'SeverityCount'; filtri.dataset.doctorCounts = ''; filtri.setAttribute('role', 'group');
  for (const g of ESITI) {
    const b = nodo(d, 'button', 'talos-doctor__chip'); b.type = 'button'; b.dataset.doctorFilter = g; b.setAttribute('aria-pressed', 'false');
    const numero = nodo(d, 'b', '', '0'); numero.dataset.doctorCount = g;
    const parola = nodo(d, 'span', ''); parola.dataset.doctorKind = g;
    b.append(segno(d, g), numero, parola);
    b.addEventListener('click', () => { st.filtro = st.filtro === g ? null : g; disegna(s, st); b.focus(); });
    filtri.append(b);
  }
  const tutti = nodo(d, 'button', 'talos-button talos-button--ghost talos-button--sm'); tutti.type = 'button'; tutti.dataset.doctorFilterClear = ''; tutti.hidden = true;
  tutti.addEventListener('click', () => { st.filtro = null; disegna(s, st); s.querySelector('[data-doctor-list]').focus(); });
  filtri.append(tutti);
  const due = nodo(d, 'div', 'talos-doctor__split');
  const lista = nodo(d, 'ul', 'talos-doctor__list'); lista.setAttribute('role', 'listbox'); lista.setAttribute('tabindex', '0'); lista.dataset.doctorList = ''; lista.setAttribute('aria-busy', 'false');
  const pannello = nodo(d, 'aside', 'talos-doctor__panel'); pannello.dataset.doctorPanel = ''; pannello.setAttribute('aria-live', 'polite');
  due.append(lista, pannello);
  pagina.replaceChildren(verdetto, errore, filtri, due);

  const scegli = (id) => { st.scelto = id; disegna(s, st); };
  const menuDellaRiga = (id, punto) => { const v = st.voci.find((x) => x.id === id); if (v) st.opzioni.onMenu?.(v, { ...punto, ancora: lista }); };
  lista.addEventListener('click', (e) => { const riga = e.target.closest?.('[data-doctor-id]'); if (riga) scegli(riga.dataset.doctorId); });
  lista.addEventListener('contextmenu', (e) => { const riga = e.target.closest?.('[data-doctor-id]'); if (!riga) return; e.preventDefault(); scegli(riga.dataset.doctorId); menuDellaRiga(riga.dataset.doctorId, { x: e.clientX, y: e.clientY }); });
  lista.addEventListener('keydown', (e) => {
    if (e.target !== lista) return;
    const righe = visti(st).map((v) => v.id), i = righe.indexOf(st.scelto);
    const vai = (id) => { e.preventDefault(); if (id === undefined) return; scegli(id); s.querySelector('#' + ID_RIGA(id))?.scrollIntoView?.({ block: 'nearest' }); };
    if (e.key === 'ArrowDown') vai(righe[(i + 1) % righe.length]);
    else if (e.key === 'ArrowUp') vai(righe[(i - 1 + righe.length) % righe.length]);
    else if (e.key === 'Home') vai(righe[0]);
    else if (e.key === 'End') vai(righe.at(-1));
    else if (e.key === 'Enter') { e.preventDefault(); s.querySelector('[data-doctor-panel] h3')?.focus(); }
    else if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') { e.preventDefault(); const r = s.querySelector('#' + ID_RIGA(st.scelto))?.getBoundingClientRect(); if (r) menuDellaRiga(st.scelto, { x: r.left + 40, y: r.bottom }); }
  });
  pannello.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); lista.focus(); } });
  s.querySelector('[data-doctor-refresh]').addEventListener('click', () => st.opzioni.onRicontrolla?.());
  s.querySelector('[data-doctor-export]').addEventListener('click', () => { if (st.risultato && !st.opzioni.caricamento) st.opzioni.onEsporta?.(); });
}

const visti = (st) => st.voci.filter((v) => !st.filtro || v.gravita === st.filtro);

/* «vai» resta dentro la pagina (sceglie un altro controllo); tutto il resto lo fa chi ospita: aprire una scheda, copiare, chiedere. */
function esegui(s, st, azione, voceDiPartenza) {
  if (azione.tipo === 'vai') { st.scelto = azione.id; st.filtro = null; disegna(s, st); s.querySelector('[data-doctor-panel] h3')?.focus(); return; }
  st.opzioni.onAzione?.(azione, voceDiPartenza);
}

function disegnaPannello(s, st) {
  const d = s.ownerDocument, pannello = s.querySelector('[data-doctor-panel]');
  const v = st.voci.find((x) => x.id === st.scelto);
  pannello.setAttribute('aria-label', traduci('varie.doctor.panel.label'));
  pannello.hidden = !st.risultato;
  /* il pannello si ridisegna intero: se il fuoco era dentro (un ricontrollo che finisce) torna sul titolo, non si perde nel vuoto */
  const fuocoDentro = Boolean(d.activeElement) && pannello.contains(d.activeElement);
  if (!v) { pannello.replaceChildren(nodo(d, 'p', 'talos-doctor__panel-empty', traduci('varie.doctor.panel.choose'))); return; }
  const testa = nodo(d, 'header', 'talos-doctor__panel-head');
  const sinistra = nodo(d, 'div', 'talos-doctor__panel-title');
  const titolo = nodo(d, 'h3', '', v.titolo); titolo.setAttribute('tabindex', '-1');
  const parola = nodo(d, 'span', 'talos-doctor__word', GRAVITA[v.gravita]()); parola.dataset.g = v.gravita;
  sinistra.append(segno(d, v.gravita), titolo, parola);
  const altro = nodo(d, 'button', 'talos-button talos-button--ghost talos-button--sm talos-doctor__more', '⋯'); altro.type = 'button'; altro.dataset.doctorMore = '';
  altro.setAttribute('aria-label', traduci('varie.doctor.panel.more', { title: v.titolo })); altro.setAttribute('aria-haspopup', 'menu');
  altro.addEventListener('click', (e) => { e.stopPropagation(); const r = altro.getBoundingClientRect(); st.opzioni.onMenu?.(v, { x: r.left, y: r.bottom, ancora: altro }); });
  testa.append(sinistra, altro);
  const pezzi = [testa, nodo(d, 'p', 'talos-doctor__panel-row', v.riga), ...v.dettaglio.map((riga) => nodo(d, 'p', '', riga))];
  if (v.fornitori?.length) {
    const pronti = v.fornitori.filter((f) => f.pronto), soloPronti = st.soloPronti && pronti.length > 0;
    const sopra = nodo(d, 'div', 'talos-doctor__providers-head');
    const gruppo = nodo(d, 'div', 'talos-doctor__segment'); gruppo.setAttribute('role', 'radiogroup'); gruppo.setAttribute('aria-label', traduci('varie.doctor.panel.providersWhich'));
    const scelte = [[true, traduci('varie.doctor.panel.providersReady', { n: pronti.length })], [false, traduci('varie.doctor.panel.providersAll', { n: v.fornitori.length })]];
    const cambia = (vuole) => { st.soloPronti = vuole; disegnaPannello(s, st); s.querySelector('[data-doctor-panel] [role=radio][aria-checked=true]')?.focus(); };
    for (const [vuole, etichetta] of scelte) {
      const b = nodo(d, 'button', 'talos-doctor__segment-option', etichetta); b.type = 'button'; b.setAttribute('role', 'radio');
      const scelta = vuole === soloPronti; b.setAttribute('aria-checked', String(scelta)); b.setAttribute('tabindex', scelta ? '0' : '-1');
      /* «Pronti (0)» non si può scegliere: mostrerebbe una tabella vuota */
      if (vuole && !pronti.length) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); }
      b.addEventListener('click', () => cambia(vuole));
      b.addEventListener('keydown', (e) => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && pronti.length) { e.preventDefault(); cambia(!soloPronti); } });
      gruppo.append(b);
    }
    sopra.append(nodo(d, 'h4', '', traduci('varie.doctor.panel.providers')), gruppo);
    const tabella = nodo(d, 'table', 'talos-doctor__providers'); tabella.dataset.doctorProviders = '';
    const intestazione = nodo(d, 'tr'); intestazione.append(nodo(d, 'th', '', traduci('varie.doctor.panel.colProvider')), nodo(d, 'th', '', traduci('varie.doctor.panel.colAccess')));
    for (const th of intestazione.children) th.setAttribute('scope', 'col');
    const thead = nodo(d, 'thead'); thead.append(intestazione);
    const corpo = nodo(d, 'tbody');
    for (const f of soloPronti ? pronti : v.fornitori) {
      const tr = nodo(d, 'tr'); tr.dataset.doctorProvider = f.id;
      const stato = nodo(d, 'span', 'talos-doctor__provider-state'); stato.dataset.g = f.gravita; stato.append(segno(d, f.gravita), f.stato);
      const cella = nodo(d, 'td'); cella.append(stato, ...(f.sotto ? [nodo(d, 'small', '', f.sotto)] : []));
      tr.append(nodo(d, 'td', '', f.nome), cella); corpo.append(tr);
    }
    tabella.append(thead, corpo);
    pezzi.push(sopra, tabella);
  }
  if (v.limite) pezzi.push(nodo(d, 'h4', '', traduci('varie.doctor.panel.limitTitle')), nodo(d, 'p', 'talos-doctor__limit', v.limite));
  if (v.azioni.length || v.nienteDaFare) {
    pezzi.push(nodo(d, 'h4', '', traduci('varie.doctor.panel.actionsTitle')));
    if (v.azioni.length) {
      const azioni = nodo(d, 'div', 'talos-doctor__actions');
      v.azioni.forEach((a, i) => {
        const b = nodo(d, 'button', 'talos-button talos-button--sm ' + (i === 0 && (v.gravita === 'warning' || v.gravita === 'danger') ? 'talos-button--primary' : 'talos-button--secondary'), a.testo);
        b.type = 'button'; b.dataset.doctorAction = a.tipo;
        b.addEventListener('click', () => esegui(s, st, a, v));
        azioni.append(b);
      });
      pezzi.push(azioni);
    } else pezzi.push(nodo(d, 'p', 'talos-doctor__nothing', v.nienteDaFare));
  }
  pannello.replaceChildren(...pezzi);
  if (fuocoDentro && !pannello.contains(d.activeElement)) titolo.focus({ preventScroll: true });
}

function disegna(s, st) {
  const d = s.ownerDocument, q = (sel) => s.querySelector(sel), o = st.opzioni;
  const loading = !!o.caricamento, errore = o.errore || '', voci = st.voci, n = contaGravitaDoctor(voci), ha = !!st.risultato;
  q('[data-doctor-refresh]').disabled=loading;q('[data-doctor-refresh]').textContent=loading?traduci("varie.doctor.refresh.checking"):traduci("varie.doctor.refresh.checkAgain");q('[data-doctor-export]').disabled=!ha||loading;
  const conta = tn('varie.doctor.checks.one', 'varie.doctor.checks.many', voci.length);
  q('[data-doctor-tempo]').textContent = o.ricevutoAlle ? traduci('varie.doctor.time.checked', { when: quando(o.ricevutoAlle, o.adesso ? new Date(o.adesso) : new Date()), count: conta }) : traduci('varie.doctor.time.notRun');

  const verdetto = ha ? verdettoDoctor(voci) : null;
  q('[data-doctor-verdict]').dataset.g = verdetto ? verdetto.gravita : 'info';
  const segnoVerdetto = q('[data-doctor-verdict-sign]'); segnoVerdetto.hidden = !verdetto; segnoVerdetto.dataset.g = verdetto ? verdetto.gravita : 'info'; segnoVerdetto.textContent = SEGNI[verdetto ? verdetto.gravita : 'info'];
  const righeEsito = verdetto
    ? [nodo(d, 'h2', '', verdetto.titolo), nodo(d, 'p', '', verdetto.frase), ...(loading ? [nodo(d, 'p', 'talos-doctor__run', traduci('varie.doctor.summary.checking'))] : errore ? [nodo(d, 'p', 'talos-doctor__run', traduci('varie.doctor.summary.resultKept', { count: conta, review: n.warning + n.danger }))] : [])]
    : [nodo(d, 'h2', '', loading ? traduci('varie.doctor.summary.checking') : traduci('varie.doctor.summary.noResults'))];
  q('[data-doctor-esito]').replaceChildren(...righeEsito);
  const azioniVerdetto = q('[data-doctor-verdict-actions]');
  if (verdetto?.azione) {
    const b = nodo(d, 'button', 'talos-button talos-button--primary', verdetto.azione.testo); b.type = 'button'; b.dataset.doctorVerdictAction = verdetto.azione.tipo;
    b.addEventListener('click', () => esegui(s, st, verdetto.azione, voci[0]));
    azioniVerdetto.replaceChildren(b);
  } else azioniVerdetto.replaceChildren();
  q('[data-doctor-errore]').textContent=errore;q('[data-doctor-errore]').hidden=!errore;

  const filtri = q('[data-doctor-counts]'); filtri.hidden = !ha; filtri.setAttribute('aria-label', traduci('varie.doctor.filter.label'));
  for (const g of ESITI) {
    const b = q('[data-doctor-filter=' + g + ']');
    b.setAttribute('aria-pressed', String(st.filtro === g));
    b.setAttribute('aria-label', traduci('varie.doctor.filter.only', { n: n[g], kind: parolaDelConto(g, n[g]) }));
    q('[data-doctor-count=' + g + ']').textContent = String(n[g]);
    q('[data-doctor-kind=' + g + ']').textContent = parolaDelConto(g, n[g]);
  }
  const tutti = q('[data-doctor-filter-clear]'); tutti.hidden = !st.filtro; tutti.textContent = traduci('varie.doctor.filter.showAll');

  const mostrati = visti(st);
  if (!mostrati.some((v) => v.id === st.scelto)) st.scelto = mostrati[0]?.id ?? null;
  const lista = q('[data-doctor-list]');
  lista.setAttribute('aria-busy', String(loading)); lista.setAttribute('aria-label', traduci('varie.doctor.list.label'));
  const righe = mostrati.map((v) => {
    const li = nodo(d, 'li', 'talos-doctor__row'); li.id = ID_RIGA(v.id); li.setAttribute('role', 'option'); li.setAttribute('aria-selected', String(v.id === st.scelto));
    li.dataset.c = 'CheckCard'; li.dataset.doctorId = v.id;
    const testi = nodo(d, 'div', 'talos-doctor__row-text'); testi.append(nodo(d, 'div', 'talos-doctor__row-title', v.titolo), nodo(d, 'div', 'talos-doctor__row-line', v.riga));
    const parola = nodo(d, 'span', 'talos-doctor__word', GRAVITA[v.gravita]()); parola.dataset.g = v.gravita;
    li.append(segno(d, v.gravita), testi, parola);
    return li;
  });
  if (ha && !righe.length) {
    const vuoto = nodo(d, 'li', 'talos-doctor__empty'); vuoto.setAttribute('role', 'presentation');
    vuoto.append(nodo(d, 'b', '', traduci('varie.doctor.list.emptyTitle')), nodo(d, 'span', '', traduci('varie.doctor.list.emptyHelp')));
    righe.push(vuoto);
  }
  lista.replaceChildren(...righe);
  if (st.scelto) lista.setAttribute('aria-activedescendant', ID_RIGA(st.scelto)); else lista.removeAttribute('aria-activedescendant');
  disegnaPannello(s, st);
}

export function aggiornaDoctor(s,risultato,opzioni={}){
  let st = schermi.get(s);
  if (!st) { st = { filtro: null, scelto: null, soloPronti: true, voci: [], opzioni, risultato: null }; schermi.set(s, st); costruisci(s, st); }
  st.opzioni = opzioni; st.risultato = risultato;
  st.voci = risultato ? vociDelDoctor(risultato, opzioni.vociRifatte || {}, opzioni.motoreLocale || null) : [];
  disegna(s, st);
}
