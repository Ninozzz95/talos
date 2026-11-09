/*
 * The rules of the engine bench, as the owner wrote them on 01/11/2026 (`DECISIONI-APERTE-MOTORE-LOCALE-2026-11-01.md`, `00-INDICE-MOTORE-LOCALE.md` §2).
 * Nothing here loads a model: pure functions over the rows the bench writes, so that a rule is proved in a test and is the same at every run.
 * An answer is always one of three: `passa`, `non passa`, `non misurato`. A measure that is not there is never a zero and never a pass.
 */

const QUANT = /^(?:[A-Z]*Q\d+(?:_[A-Z0-9]+)*|BF16|F16|F32)$/iu;

/** `Qwen3.8-27B-UD-Q4_K_M.gguf` → family `Qwen3.8-27B`, version `Q4_K_M`. A file with no version in its name says so: it counts for no version. */
export function famigliaEVersione(file) {
  const nome = String(file).split(/[\\/]/u).pop().replace(/\.gguf$/iu, '').replace(/-\d{5}-of-\d{5}$/iu, '');
  const parti = nome.split('-');
  const ultima = parti.at(-1);
  if (!QUANT.test(ultima)) return { famiglia: nome, versione: null };
  return { famiglia: parti.slice(0, -1).filter((p) => p.toUpperCase() !== 'UD').join('-'), versione: ultima.toUpperCase() };
}

export const FAMIGLIE_DI_SERIE = 5;
export const VERSIONI_DI_SERIE = 3;

/**
 * «fase chiusa solo con 5 famiglie per 3 versioni»: `esiti` = `{ modello, passa }`, one per GGUF. A version that failed once stays failed, whatever a later run
 * says: a family counts only when three of its versions pass and none fails.
 */
export function promozioneDiSerie(esiti) {
  const famiglie = new Map();
  for (const { modello, passa } of esiti) {
    const { famiglia, versione } = famigliaEVersione(modello);
    if (!versione) continue;
    if (!famiglie.has(famiglia)) famiglie.set(famiglia, new Map());
    const versioni = famiglie.get(famiglia);
    versioni.set(versione, (versioni.get(versione) ?? true) && passa === true);
  }
  const righe = [...famiglie].map(([famiglia, versioni]) => {
    const passano = [...versioni.values()].filter(Boolean).length;
    return { famiglia, versioni: versioni.size, passano, completa: passano >= VERSIONI_DI_SERIE && passano === versioni.size };
  });
  const complete = righe.filter((r) => r.completa).length;
  return { promossa: complete >= FAMIGLIE_DI_SERIE, famiglieComplete: complete, servono: FAMIGLIE_DI_SERIE, righe };
}

const mediana = (x) => { const o = [...x].sort((a, b) => a - b); return o.length ? (o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2) : null; };
const numero = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;
/* a line is read on the true number, never on the rounded one: rounded first, 5.04% passes as 5%. The margin is only for the arithmetic of the computer: 10.5/10 - 1 is 0.05000000000000004 */
const MARGINE = 1e-9;
const almeno = (x, soglia) => x >= soglia - MARGINE;
const alPiu = (x, soglia) => x <= soglia + MARGINE;
const tre = (x) => +x.toFixed(3);
/** The pairs of a crossed run: the i-th of one case with the i-th of the other. A row with an error or no number leaves its pair not measured. */
function coppie(righe, a, b, leggi) {
  const di = (caso) => righe.filter((r) => r.caso === caso);
  const quante = Math.min(di(a).length, di(b).length);
  return Array.from({ length: quante }, (_, i) => {
    const x = di(a)[i];
    const y = di(b)[i];
    return { base: x.errore ? null : leggi(x), prova: y.errore ? null : leggi(y), errore: Boolean(x.errore || y.errore) };
  });
}

/** Owner: «almeno +15% sul lavoro vero, nessun crash da 4.000 a 64.000, risposte non peggiori, tre su tre». On every window of `finestre`. */
export function regolaMtp(righe, { finestre = [4000, 16000, 64000], soglia = 1.15, ripetizioni = 3 } = {}) {
  const perFinestra = finestre.map((finestra) => {
    const qui = righe.filter((r) => r.finestra === finestra);
    const c = coppie(qui, 'serie', 'mtp', (r) => r.genTs);
    if (qui.some((r) => r.caso === 'mtp' && r.errore)) return { finestra, esito: 'non passa', motivo: 'crash' };
    if (qui.some((r) => r.caso === 'mtp' && r.controlliOk === false)) return { finestra, esito: 'non passa', motivo: 'risposte peggiori' };
    if (c.length < ripetizioni || c.some((p) => !numero(p.base) || !numero(p.prova))) return { finestra, esito: 'non misurato', coppie: c.length };
    const guadagni = c.map((p) => p.prova / p.base);
    return { finestra, guadagni: guadagni.map(tre), esito: guadagni.every((g) => almeno(g, soglia)) ? 'passa' : 'non passa' };
  });
  return { perFinestra, esito: complessivo(perFinestra.map((f) => f.esito)) };
}

/** Owner: «almeno il 25% sulla prima parola, 3 su 3, senza perdere in scrittura». `caso` = `vulkan` | `hip`, on one family. */
export function regolaHip(righe, { soglia = 0.25, ripetizioni = 3 } = {}) {
  const prima = coppie(righe, 'vulkan', 'hip', (r) => r.primaParolaMs);
  const scrittura = coppie(righe, 'vulkan', 'hip', (r) => r.genTs);
  if (prima.length < ripetizioni || [...prima, ...scrittura].some((p) => !numero(p.base) || !numero(p.prova))) return { esito: 'non misurato', coppie: prima.length };
  const guadagni = prima.map((p) => 1 - p.prova / p.base);
  const scriveMeno = scrittura.some((p) => p.prova < p.base);
  return { guadagni: guadagni.map(tre), scriveMeno, esito: guadagni.every((g) => almeno(g, soglia)) && !scriveMeno ? 'passa' : 'non passa' };
}

/** Owner, «Una prova sola, su 3 famiglie»: tre su tre. `esiti` = one answer of `regolaHip` per family. */
export function regolaHipFamiglie(esiti) {
  if (esiti.length < 3) return { esito: 'non misurato', famiglie: esiti.length };
  return { esito: complessivo(esiti.map((e) => e.esito)), famiglie: esiti.length };
}

/** Owner: «secondo posto solo con almeno il 30% in meno sul tempo delle deleghe, senza peggiorare il giro normale». Medians of the crossed cases. */
export function regolaPosti(righe, { soglia = 0.3, ripetizioni = 3 } = {}) {
  const pulite = (caso) => righe.filter((r) => r.caso === caso && !r.errore && numero(r.ms) && numero(r.giroSolo?.genTs));
  const uno = pulite('un-posto');
  const due = pulite('due-posti');
  if (uno.length < ripetizioni || due.length < ripetizioni) return { esito: 'non misurato', un: uno.length, due: due.length };
  const risparmio = 1 - mediana(due.map((r) => r.ms)) / mediana(uno.map((r) => r.ms));
  const giro = [mediana(uno.map((r) => r.giroSolo.genTs)), mediana(due.map((r) => r.giroSolo.genTs))];
  return { risparmio: tre(risparmio), giroNormale: giro, esito: almeno(risparmio, soglia) && giro[1] >= giro[0] ? 'passa' : 'non passa' };
}

/** Owner, «Prima un conto gratis, poi la regola»: from 25% it is done and proposed upstream, under 10% it closes, in between the owner decides with the numbers. */
export function regolaParole(quota) {
  if (typeof quota !== 'number' || !Number.isFinite(quota) || quota < 0) return 'non misurato';
  return quota >= 0.25 ? 'si fa' : quota < 0.1 ? 'si chiude' : 'decide l\'owner';
}

/** Owner: esperti «Prima l'interruttore ufficiale»: under 10% from the switch, with at least 25% in a copy of ours on 3 families, the copy is made. Here the first half. */
export function regolaEsperti(righe, { soglia = 0.1 } = {}) {
  const c = coppie(righe, 'senza', 'con', (r) => r.genTs);
  if (!c.length || c.some((p) => !numero(p.base) || !numero(p.prova))) return { esito: 'non misurato' };
  const guadagni = c.map((p) => p.prova / p.base - 1);
  return { guadagni: guadagni.map(tre), esito: guadagni.every((g) => almeno(g, soglia)) ? 'basta l\'interruttore' : 'si guarda la copia' };
}

/**
 * The rule of 2026-09-11, pass^3, on one arm. Third review, D5: a run counts for the arm only if it ran on that engine: a router that fell back on today's engine, or a card
 * that fell on the processor, measured something else and would promote it. Skipped checks are counted and shown; the owner sees them, they do not decide alone.
 */
export function verdettoBraccio({ braccio, corse, ripetizioni }) {
  const atteso = String(braccio).endsWith('|router') ? 'router' : 'oggi';
  const buona = (c) => c.tutteOk === true && !c.errore && c.motoreUsato === atteso && !c.ripiegoProcessore;
  /* 02/11, Performance's review S2-1: a run taken while the machine paged is set aside and redone, never counted either way */
  const pulite = corse.filter((c) => !c.sottoPressione);
  const daRifare = corse.length - pulite.length;
  const riuscite = pulite.filter(buona).length;
  const tutteBuone = riuscite === pulite.length;
  const esito = !tutteBuone ? 'non passa' : pulite.length >= ripetizioni ? 'passa' : daRifare > 0 ? 'non misurato' : 'non passa';
  return { braccio, ripetizioni: corse.length, riuscite, saltate: [...new Set(corse.flatMap((c) => c.saltate ?? []))], motoriUsati: [...new Set(corse.map((c) => c.motoreUsato ?? 'non misurato'))],
    ripieghiProcessore: corse.filter((c) => c.ripiegoProcessore).length, ...(daRifare ? { daRifare } : {}), esito, passa: esito === 'passa' };
}

/** Owner: router 5% and the new version 5%: no worsening over 5% on opening and first sign, and answers not worse. Medians on the runs that really ran there. */
export function regolaNonPeggiore(base, prova, { soglia = 0.05, ripetizioni = 3 } = {}) {
  const pulite = (x) => x.filter((c) => !c.errore && c.tutteOk === true && !c.sottoPressione); // 02/11 S2-1: paging slows opening and first sign
  const a = pulite(base);
  const b = pulite(prova);
  if (a.length < ripetizioni || b.length < ripetizioni) return { esito: 'non misurato', corse: [a.length, b.length] };
  const letture = { apertura: (c) => c.avvioS, primoSegno: (c) => c.primoSegnoFreddo?.primoSegnoMs };
  const confronti = {};
  for (const [nome, leggi] of Object.entries(letture)) {
    const [x, y] = [a, b].map((g) => g.map(leggi));
    if ([...x, ...y].some((n) => !numero(n))) return { esito: 'non misurato', manca: nome };
    confronti[nome] = mediana(y) / mediana(x) - 1;
  }
  const rinomine = [a, b].map((g) => g.filter((c) => c.ricopia?.rinomina === true).length);
  const esito = Object.values(confronti).every((d) => alPiu(d, soglia)) && rinomine[1] >= rinomine[0] ? 'passa' : 'non passa';
  return { confronti: Object.fromEntries(Object.entries(confronti).map(([k, v]) => [k, tre(v)])), rinomine, esito };
}

/** Owner: «5 cambi su 5»: five steps through the router, none on a fallback, the memory back at the end, and the same model always holding the same memory (#19627). */
export function regolaCambi(riga, { passi = 5, scartoMiB = 512 } = {}) {
  if (!riga || riga.errore || riga.sottoPressione || !Array.isArray(riga.passi) || riga.passi.length < passi) return { esito: 'non misurato' };
  if (riga.passi.some((p) => p.ripieghi > 0)) return { esito: 'non misurato', motivo: 'ripiego: non è il router' };
  if (riga.passi.some((p) => !numero(p.usataMiB))) return { esito: 'non misurato', motivo: 'memoria non letta' };
  const perModello = new Map();
  for (const p of riga.passi) perModello.set(p.modello, [...(perModello.get(p.modello) ?? []), p.usataMiB]);
  const scarti = [...perModello.values()].map((x) => Math.max(...x) - Math.min(...x));
  return { scarti, tornata: riga.liberazione?.tornata === true, esito: riga.liberazione?.tornata === true && scarti.every((s) => s <= scartoMiB) ? 'passa' : 'non passa' };
}

/**
 * 02/11/2026, night bench: the codes in an answer that belong to ANOTHER conversation. Its own code cut short by the token limit is not a
 * leak (LFM2.5, famiglie-notte.jsonl rows 126-127: «ALFA-77-861» for ALFA-77-86131): a code counts only if it is not its own and not a piece
 * of it, so «ALFA-7-…» against «ALFA-77-…» still counts (the piece must match character by character).
 */
export function codiciAltrui(testo, mio) {
  return [...String(testo ?? '').matchAll(/(?:ALFA|BETA)-\d+-\d+/gu)].map((c) => c[0]).filter((c) => c !== mio && !String(mio).startsWith(c));
}

/**
 * 02/11/2026, night bench: the guard stops on commit (Windows charges the graphics card to commit, 31/10), and now also says when the
 * machine is paging. At 08:49 ERNIE Q6 held 19.2 GB resident with 1.0 GB of free RAM and 15.4 GB of commit: nothing stopped, and the
 * numbers taken then are doubtful. Low RAM does not stop the run (the owner let ERNIE finish): it marks the rows.
 */
export function pressioneDiMemoria({ impegnabileGb, liberaGb }, { sogliaImpegnabileGb = 5, sogliaRamGb = 1.5 } = {}) {
  return {
    ferma: Number.isFinite(impegnabileGb) && impegnabileGb < sogliaImpegnabileGb,
    sottoPressione: Number.isFinite(liberaGb) && liberaGb < sogliaRamGb,
  };
}

/**
 * 02/11/2026, Performance's review S2-2: an answer is mixed (another conversation's code), right, its own code cut short by the token limit
 * (not a leak and not a proof: counted apart, it does not switch the rule off), or without the code (proves nothing). Known limit (S3): its
 * own code with MORE digits («ALFA-77-861310») is neither equal nor a piece, and counts as mixed.
 */
export function classificaRisposta(testo, mio) {
  if (codiciAltrui(testo, mio).length) return 'mescolata';
  const t = String(testo ?? '');
  if (t.includes(mio)) return 'giusta';
  return [...t.matchAll(/(?:ALFA|BETA)-\d+-\d+/gu)].some((c) => String(mio).startsWith(c[0])) ? 'tagliata' : 'senza';
}

/**
 * Owner, «Prova prima di accendere il router»: one mixed answer switches that memory off for everybody. Third review, D4: the proof counts only if it went through the memory it
 * must prove: `ripristiniProvati`, the third request of a pair served from what was saved. One slot and four, as in the reported case.
 * 02/11: a mixed answer fails even under memory pressure (a leak is a leak); otherwise a row taken while the machine paged is redone.
 */
export function regolaMescolamento(righe, { posti = [1, 4], quotaProvata = 0.5, coppie = 100 } = {}) {
  const dettagli = posti.map((n) => {
    const r = righe.find((x) => x.posti === n);
    if (!r) return { posti: n, esito: 'non misurato', motivo: 'non girata' };
    if (r.mescolate > 0) return { posti: n, esito: 'non passa', mescolate: r.mescolate };
    if (r.errore || r.fermataMemoria || r.sottoPressione || r.senzaCodice > 0 || r.motoreUsato === 'ripiego-su-oggi') return { posti: n, esito: 'non misurato' };
    if (r.coppie < coppie) return { posti: n, esito: 'non misurato', motivo: `${r.coppie} coppie su ${coppie}`, ripristini: r.ripristiniProvati ?? 0 };
    if (!((r.ripristiniProvati ?? 0) >= r.coppie * quotaProvata)) return { posti: n, esito: 'non misurato', motivo: 'la memoria veloce non è stata attraversata', ripristini: r.ripristiniProvati ?? 0 };
    return { posti: n, esito: 'passa', ripristini: r.ripristiniProvati };
  });
  return { dettagli, esito: complessivo(dettagli.map((d) => d.esito)) };
}

/**
 * 02/11/2026, owner: after Qwen, LFM2.5 is downloaded again and ONLY the mixing proof is redone with the cured tool (`--solo-mescolamento`).
 * Same exit codes as the whole bench: 0 pass, 5 a rule fails (a leak), 6 not measured.
 */
export function esitoSoloMescolamento(righe) {
  const regola = regolaMescolamento(righe);
  return { esito: regola.esito, uscita: regola.esito === 'passa' ? 0 : regola.esito === 'non passa' ? 5 : 6, regola };
}

/** Brief G5: ten minutes with no collapse. */
export function regolaTenuta(riga) {
  if (!riga || riga.errore || riga.sottoPressione || typeof riga.crollo !== 'boolean') return { esito: 'non misurato' }; // 02/11 S2-1: paging invents a collapse
  return { esito: riga.crollo ? 'non passa' : 'passa', prima: riga.prima, ultima: riga.ultima };
}

/** Third review, M2: the card can be slow already at the start. A reading under the reference of that card and driver voids the run, as a drop during it does. */
export function regolaScheda({ inizio, fine, riferimento = null, caloMassimo = 0.2 }) {
  if (!numero(inizio) || !numero(fine)) return { corsaValida: false, motivo: 'scheda non letta' };
  const calo = 1 - fine / inizio;
  const sulRiferimento = numero(riferimento) ? 1 - inizio / riferimento : null;
  return { calo: tre(calo), sulRiferimento: sulRiferimento === null ? null : tre(sulRiferimento), corsaValida: alPiu(calo, caloMassimo) && (sulRiferimento === null || alPiu(sulRiferimento, caloMassimo)) };
}

/**
 * Owner 01/11/2026, «Tre compiti su tre, su 5 famiglie», against plain chat and the free format. On one family: every task passes in every repetition of `emulata`, and it must
 * do at least as well as the free format. Performance: the step after a call reads only the new piece, plus a margin for the call itself: `promptDopo` that grows with the history does not promote.
 */
export function regolaEmulati(righe, { compiti = ['legge', 'chiama', 'non-chiama'], ripetizioni = 3, margine = 300 } = {}) {
  const di = (caso) => righe.filter((r) => r.caso === caso);
  const riuscite = (caso) => di(caso).filter((r) => r.riuscito === true).length;
  const emulata = di('emulata');
  if (emulata.some((r) => r.nonEmulabile)) return { esito: 'non misurato', motivo: 'il template dichiara gli attrezzi' };
  const mancanti = compiti.filter((c) => emulata.filter((r) => r.compito === c && !r.errore).length < ripetizioni);
  if (mancanti.length) return { esito: 'non misurato', mancanti };
  /* fourth review, D1: what is read again against the new piece, not against the whole: the result of a tool can be most of the prompt, and that is right */
  const passi = emulata.filter((r) => numero(r.promptDopo) && numero(r.pezzoNuovo));
  if (!passi.length) return { esito: 'non misurato', motivo: 'prefisso non letto' };
  const fuoriDalPezzo = Math.max(...passi.map((r) => r.promptDopo - r.pezzoNuovo));
  const conteggio = { emulata: riuscite('emulata'), libero: riuscite('libero'), chat: riuscite('chat') };
  return { conteggio, fuoriDalPezzo, esito: emulata.every((r) => r.riuscito === true) && fuoriDalPezzo <= margine ? 'passa' : 'non passa' };
}

/**
 * Owner 01/11/2026, «Riparto senza la copia in RAM… se regge diventa la regola di serie su PC». «Regge»: much less memory on the PC, first sign and writing not over 5% worse.
 * The longer opening is written and does not decide: it is what the owner reads next to the memory saved.
 */
export function regolaCopiaInRam(righe, { soglia = 0.05, ripetizioni = 3, quotaRam = 0.5 } = {}) {
  const pulite = (caso) => righe.filter((r) => r.caso === caso && !r.errore && numero(r.ramMiB) && numero(r.avvioS) && numero(r.primoSegnoMs) && numero(r.genTs));
  const oggi = pulite('oggi');
  const senza = pulite('senza');
  if (oggi.length < ripetizioni || senza.length < ripetizioni) return { esito: 'non misurato', corse: [oggi.length, senza.length] };
  const med = (x, leggi) => mediana(x.map(leggi));
  const ram = [med(oggi, (r) => r.ramMiB), med(senza, (r) => r.ramMiB)];
  const primo = med(senza, (r) => r.primoSegnoMs) / med(oggi, (r) => r.primoSegnoMs) - 1;
  const scrittura = 1 - med(senza, (r) => r.genTs) / med(oggi, (r) => r.genTs);
  const apertura = med(senza, (r) => r.avvioS) / med(oggi, (r) => r.avvioS) - 1;
  return { ram, primo: tre(primo), scrittura: tre(scrittura), apertura: tre(apertura), esito: ram[1] <= ram[0] * quotaRam && alPiu(primo, soglia) && alPiu(scrittura, soglia) ? 'passa' : 'non passa' };
}

/**
 * Fourth review, D2: the rename in one place. `\b`: the file also has `cartellaScratchAttesa`, which a right answer keeps.
 */
export function rinominaRiuscita(testo) {
  const t = String(testo ?? '');
  return /\bscratchFolder\b/u.test(t) && !/\bcartellaScratch\b/u.test(t);
}

/**
 * Fourth review, D4: what a verdict promotes. The checks alone are not a promotion: a version counts if its arm passes and so do the jump from the old engine and the ten minutes.
 * The router has its own list, with its own rules: a green engine does not switch on a router that was never proved.
 */
export function esitiDelVerdetto({ bracci = [], regole = {} }) {
  const regola = new Map((regole.perModello ?? []).map((m) => [m.modello, m]));
  const motore = [];
  const router = [];
  for (const b of bracci) {
    const [modello, braccio] = String(b.braccio).split('|');
    const r = regola.get(modello);
    if (braccio === 'nuovo') motore.push({ modello, passa: b.passa === true && r?.salto?.esito === 'passa' && r?.tenuta?.esito === 'passa' });
    if (braccio === 'router') router.push({ modello, passa: b.passa === true && r?.router?.esito === 'passa' && regole.cambi?.esito === 'passa' && regole.mescolamento?.esito === 'passa' });
  }
  return { motore, router };
}

/** The word on a whole run: it decides the exit of the bench. */
export function giudizio(esiti) {
  return complessivo(esiti);
}

/** One red answer closes it, one measure missing leaves it open: a rule never passes on what was not measured. */
function complessivo(esiti) {
  if (esiti.includes('non passa')) return 'non passa';
  return esiti.length && esiti.every((e) => e === 'passa') ? 'passa' : 'non misurato';
}
