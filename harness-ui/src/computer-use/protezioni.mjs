/**
 * Computer use — le protezioni prima di ogni azione (credenziali, consensi, anti-robot, cancellazioni definitive, pagamento, invio).
 *
 * Modulo PURO del kernel: niente I/O, niente import dal resto del nucleo (la CLI non lo vede). Lo chiama il ciclo del computer use
 * prima di OGNI azione, anche dentro un lotto, sul bersaglio vivo (per `scrivi` e `tasti` il bersaglio è l'elemento col fuoco).
 *
 * Forma approvata da Mobile, CLI e Performance il 01/11/2026 e decisioni dell'owner del 31/10 e del 01/11 sera:
 *   `Downloads/TALOS/computer-use/in-corso/CONTRATTI-COMPUTER-USE-V2-2026-11-01.md` §6 e `FORMA-QUATTRO-PROTEZIONI-2026-11-01.md`.
 *   - restituisce CODICI, mai una frase: ogni superficie dice le sue parole (condizione della CLI);
 *   - la politica entra come ARGOMENTO (condizione del Mobile): telefono e PC decidono diverso sulle stesse protezioni;
 *   - espressioni regolari compilate una volta al caricamento; p95 < 1 ms su 500 elementi (condizione di Performance).
 * Concorrenti letti il 01/11 (`riferimenti/RICERCA-COMPUTER-USE-CODICE-CONCORRENTI-2026-11-01.md` §4): nessuno ha un controllo LOCALE
 *   e fisso — Claude in Chrome oscura `autocomplete` current-password/one-time-code/cc-* e per il resto promette a parole; UFO lascia la
 *   conferma al modello; cua la conferma in automatico.
 *
 * Tre giri di revisione avversaria (01-02/11). Lezione del secondo: riconoscere TUTTO dalle parole lascia buchi in tutte e due le
 * direzioni. Da qui la forma, più strutturale:
 *   - FALLISCE CHIUSO: azione/tipo fuori dal vocabolario della piattaforma, bersaglio mancante, schermata malformata, scritture miste
 *     in un nome da confermare, programmi offuscati, un'eccezione ⇒ `non-valutabile`, deciso da `politica.nonValutabile` (mai procedi);
 *   - PAGINA DI CASSA dai CAMPI della carta e dal TITOLO della finestra (condizione del Mobile), mai dal testo di messaggi o liste; in
 *     cassa OGNI conferma che non sia un'uscita è un pagamento, al clic come da tastiera;
 *   - parole FORTI (pagano/inviano ovunque) e DEBOLI (solo in cassa, accanto a un prezzo o dentro una finestra modale);
 *   - il segnaposto vale solo se il testo è SOLO segnaposto; tasti in un campo sensibile e «incolla» sono credenziali;
 *   - anti-robot: frasi di sfida ovunque, nomi di prodotto solo su un widget o un'origine; mai sul piè di pagina;
 *   - intenzioni: domande, condizioni, «prima di», «chiedimi», ritrattazioni ⇒ niente sblocco.
 *   ⛔ «Finestra protetta = ferma» (contratto §6) NON passa da qui: la decide il ciclo con l'esito `rifiutata`/`finestra-protetta`.
 *   ⛔ Il legame segreto↔dominio (contratto §6) è del ciclo: il portachiavi sostituisce `{{segreto:nome}}` solo sul dominio/app a cui
 *      il segreto è legato; qui si controlla solo che il testo sia davvero un segnaposto.
 */

export const DECISIONI = Object.freeze(['procedi', 'procedi-e-segna', 'chiedi', 'ferma', 'scegli-riservato', 'riscrivi']);
export const PROTEZIONI = Object.freeze(['credenziale', 'consenso', 'anti-robot', 'cancellazione', 'pagamento', 'invio']);
/** Il vocabolario chiuso del contratto §3 e i sottoinsiemi per piattaforma: un tipo fuori da qui non si valuta, si ferma. */
export const TIPI_AZIONE = Object.freeze(['premi', 'scrivi', 'scegli', 'scorri', 'tasti', 'hover', 'apri', 'aspetta', 'zoom', 'clic', 'trascina', 'sistema', 'chiedi_persona', 'programma', 'fine']);
export const TIPI_PER_PIATTAFORMA = Object.freeze({
  pc: Object.freeze(TIPI_AZIONE.filter((t) => t !== 'sistema')),
  telefono: Object.freeze(TIPI_AZIONE.filter((t) => !['clic', 'trascina', 'zoom', 'hover', 'programma'].includes(t))),
});

const NESSUNA = Object.freeze({ decisione: 'procedi', protezione: null, motivo: null, prova: null });
const NON_VALUTABILE = 'non-valutabile';

// ---------- normalizzazione (compilata una volta) ----------
const INVISIBILI = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\p{Default_Ignorable_Code_Point}\p{Cf}]/gu;
const CONTROLLI = /[\x00-\x08\x0E-\x1F\x7F-\x9F]/gu; // C0 e C1 che non sono spazi: a schermo non si vedono
const APOSTROFI = /[\u2018\u2019\u201A\u201B\u2032\u2035\u02B9\u02BB\u02BC\u02BD\u00B4\u0060]/gu;
const SPAZI = /[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u2800\u3000]+/gu; // U+2800 (spazio Braille): TR39 → spazio (R9c)
const SEGNI_COMBINANTI = /\p{M}+/gu; // dopo NFKC: le lettere accentate italiane sono già composte, restano solo i segni sciolti
// cirillico, greco, armeno, latino esteso, lisu e CJK che somigliano alle lettere latine (sottoinsieme di UTS #39 per i nomi dei pulsanti)
const CONFONDIBILI = Object.freeze(Object.fromEntries([
  [0x0430, 'a'], [0x0435, 'e'], [0x043E, 'o'], [0x0440, 'p'], [0x0441, 'c'], [0x0443, 'y'], [0x0445, 'x'], [0x0456, 'i'], [0x0458, 'j'],
  [0x0455, 's'], [0x0501, 'd'], [0x051B, 'q'], [0x051D, 'w'], [0x0261, 'g'], [0x04BB, 'h'], [0x04CF, 'l'], [0x0131, 'i'], [0x0237, 'j'],
  [0x03B1, 'a'], [0x03B5, 'e'], [0x03BF, 'o'], [0x03C1, 'p'], [0x03C4, 't'], [0x03BD, 'v'], [0x03BA, 'k'], [0x03B9, 'i'], [0x03C5, 'u'],
  [0x03C7, 'x'], [0x03F2, 'c'], [0x0585, 'o'], [0x0578, 'n'], [0x057D, 'u'], [0x0581, 'g'], [0x0570, 'h'], [0x0561, 'w'], [0x0566, 'q'],
  [0xA4D0, 'b'], [0xA4D1, 'p'], [0xA4D2, 'd'], [0xA4D3, 'd'], [0xA4D4, 't'], [0xA4D6, 'g'], [0xA4D7, 'k'], [0xA4D9, 'j'], [0xA4DA, 'c'],
  [0xA4DC, 'z'], [0xA4DD, 'f'], [0xA4DF, 'm'], [0xA4E0, 'n'], [0xA4E1, 'l'], [0xA4E2, 's'], [0xA4E3, 'r'], [0xA4E6, 'v'], [0xA4E7, 'h'],
  [0xA4EA, 'w'], [0xA4EB, 'x'], [0xA4EC, 'y'], [0xA4F0, 'e'], [0xA4F2, 'i'], [0xA4F3, 'o'], [0xA4F4, 'u'],
  // CJK che a vista è una lettera latina (revisione del Desktop 04/11, D1): ammesso il CJK accanto al latino, «Place ㅇrder» o «De丨ete»
  // non devono più sfuggire. TR39 confusables.txt del 2026-08-06: ㅇ U+3147 e ᄋ U+110B → o, 〇 U+3007 → O, ㆀ U+3180 e ᅇ U+1147 → oo,
  // ㄒ U+3112 e 丅 U+4E05 → T, ㄚ U+311A e 丫 U+4E2B → Y, ㅣ U+3163 e ᅵ U+1175 → 丨 U+4E28 (la «l» a vista, come ㄧ U+3127).
  // Qui stanno le forme Jamo (U+110B, U+1147, U+1175): `norma` e `scrittureMiste` fanno NFKC prima della mappa, e NFKC porta ㅇ, ㆀ e ㅣ
  // lì; le forme di compatibilità (U+3147, U+3180, U+3163) non arrivano mai alla mappa e non si elencano.
  [0x110B, 'o'], [0x3007, 'o'], [0x1147, 'oo'], [0x3112, 't'], [0x4E05, 't'], [0x311A, 'y'], [0x4E2B, 'y'],
  [0x1175, 'l'], [0x4E28, 'l'], [0x3127, 'l'],
  // Maiuscoletto latino (revisione R, R9b e R10: «ʙᴜʏ ɴᴏᴡ», «ɪɢɴᴏʀᴇ ᴀʟʟ…»). NFKC non lo tocca e la minuscola non lo cambia. TR39 del
  // 2026-08-06 ne porta al latino ASCII solo una parte (ᴄ ɪ ᴏ ꜱ ᴜ ᴠ ᴡ ʏ ᴢ; ᴋ → ĸ e ᴍ → ʍ): gli altri si mappano a vista, il verso
  // sicuro per i nomi dei pulsanti (una protezione in più, mai una in meno).
  [0x1D00, 'a'], [0x0299, 'b'], [0x1D04, 'c'], [0x1D05, 'd'], [0x1D07, 'e'], [0xA730, 'f'], [0x0262, 'g'], [0x029C, 'h'], [0x026A, 'i'],
  [0x1D0A, 'j'], [0x1D0B, 'k'], [0x029F, 'l'], [0x1D0D, 'm'], [0x0274, 'n'], [0x1D0F, 'o'], [0x1D18, 'p'], [0x0280, 'r'], [0xA731, 's'],
  [0x1D1B, 't'], [0x1D1C, 'u'], [0x1D20, 'v'], [0x1D21, 'w'], [0x028F, 'y'], [0x1D22, 'z'],
].map(([cp, l]) => [String.fromCodePoint(cp), l])));
const CONFONDIBILI_RE = new RegExp(`[${Object.keys(CONFONDIBILI).join('')}]`, 'gu');
const LETTERA_LATINA = /\p{Script=Latin}/u;
const NON_ALFANUMERICI = /[^\p{L}\p{N}]+/gu;

/** Testo grezzo da un valore qualunque: un array (anche annidato) si unisce senza virgole, un testo spezzato non deve sfuggire. */
function grezzo(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.flat(Infinity).map((x) => grezzo(x)).join('');
  return String(v); // un toString ostile che lancia finisce nel catch di valutaAzione ⇒ non-valutabile
}
/* Mobile 04/11: «Paga李» o «Invia送» sono UNA parola per i confini delle regole (李 è una lettera), e nessuna regola leggeva «paga». Fra
   latino e CJK si mette uno spazio: «paga 李» lo legge la regola del pagamento; «t シャツ» e «mario 李» non toccano nessuna regola. */
const CONFINE_LATINO_CJK = /(?<=\p{Script=Latin})(?=[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Hangul}\p{scx=Bopomofo}])|(?<=[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Hangul}\p{scx=Bopomofo}])(?=\p{Script=Latin})/gu;
const LETTERA_CJK = /[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Hangul}\p{scx=Bopomofo}]/u;
/* Filtro veloce di NFKC (Performance e Mobile 04/11, S-8): NFKC in V8 passa da ICU ed è la parte cara di una pagina giapponese. Unicode
   UAX #15 §9 «Detecting Normalization Forms»: se ogni carattere ha NFKC_QC=Yes e classe combinante 0, il testo è già in NFKC. Qui solo
   blocchi dove vale per ogni carattere (ASCII, hiragana senza i segni sonori U+3099-309C, katakana senza U+30FF, ideogrammi unificati
   U+4E00-9FFF, sillabe hangul): la prova PROT-11-NFKC lo controlla carattere per carattere. Fuori da qui si normalizza come prima. */
const STABILE_NFKC = /^[\t\n\v\f\r\x20-\x7Eぁ-ゖァ-ヺー一-鿿가-힣]*$/u;
const nfkc = (s) => (STABILE_NFKC.test(s) ? s : s.normalize('NFKC'));
/* Classi dei caratteri in tabella (S-8, stessa richiesta). Su una stringa a due byte una regex con proprietà Unicode costa in V8 circa
   25 ns a carattere (misurato su un nome giapponese di 25 caratteri: CONFINE_LATINO_CJK 600 ns, PANINO_LARGO 850 ns), e una pagina di
   500 campi latino+CJK ne passa diverse per campo. Le classi si leggono dalle STESSE regex, a pagine di 256 caratteri riempite alla
   prima lettura; fuori dal piano base (coppie surrogate) si chiede alla regex ogni volta. */
const K_LATINO = 1; const K_CJK = 2; const K_NPS = 4; const K_CONFONDIBILE = 8; const K_ALTRA = 16;
const NPS = /[\p{N}\p{P}\p{S}]/u;
const classeDi = (c) => (LETTERA_LATINA.test(c) ? K_LATINO : 0) | (LETTERA_CJK.test(c) ? K_CJK : 0) | (NPS.test(c) ? K_NPS : 0)
  | (Object.hasOwn(CONFONDIBILI, c) && !LETTERA_CJK.test(c) ? K_CONFONDIBILE : 0) | (LETTERA_NE_LATINA_NE_CJK.test(c) ? K_ALTRA : 0);
const PAGINE_CLASSI = new Array(256);
function paginaClassi(p) {
  const t = new Uint8Array(256);
  for (let u = 0; u < 256; u += 1) { const cp = p * 256 + u; if (cp < 0xD800 || cp > 0xDFFF) t[u] = classeDi(String.fromCharCode(cp)); }
  PAGINE_CLASSI[p] = t;
  return t;
}
let passoClasse = 1; // quanti code unit ha letto l'ultima classeIn (2 per una coppia surrogata)
function classeIn(s, i) {
  const u = s.charCodeAt(i);
  if (u >= 0xD800 && u <= 0xDBFF && i + 1 < s.length) {
    const w = s.charCodeAt(i + 1);
    if (w >= 0xDC00 && w <= 0xDFFF) { passoClasse = 2; return classeDi(s.slice(i, i + 2)); }
  }
  passoClasse = 1;
  return (PAGINE_CLASSI[u >> 8] ?? paginaClassi(u >> 8))[u & 255];
}
/** Unione delle classi di tutti i caratteri di `s`. */
function classiDi(s) { let k = 0; for (let i = 0; i < s.length; i += passoClasse) k |= classeIn(s, i); return k; }
/** Come `s.replace(CONFINE_LATINO_CJK, ' ')`: uno spazio fra una lettera latina e un CJK accanto, nei due versi. */
function confine(s) {
  let fuori = ''; let da = 0; let prima = 0;
  for (let i = 0; i < s.length; i += passoClasse) {
    const k = classeIn(s, i);
    if (((prima & K_LATINO) && (k & K_CJK)) || ((prima & K_CJK) && (k & K_LATINO))) { fuori += `${s.slice(da, i)} `; da = i; }
    prima = k;
  }
  return da === 0 ? s : fuori + s.slice(da);
}
/** Come `PANINO_LARGO.test(pre)` con `pre` = `s` dopo la mappa dei confondibili NON CJK: quelli contano già come lettere latine. */
function paninoLargo(s) {
  const A = K_LATINO | K_CONFONDIBILE;
  let dopoLatino = false; let dentroCjk = false; // latino [NPS]*  ·  latino [NPS]* CJK [CJK NPS]*
  for (let i = 0; i < s.length; i += passoClasse) {
    const k = classeIn(s, i);
    if (dentroCjk && (k & A)) return true;
    dentroCjk = (dopoLatino && (k & K_CJK) !== 0) || (dentroCjk && (k & (K_CJK | K_NPS)) !== 0);
    dopoLatino = (k & A) !== 0 || (dopoLatino && (k & K_NPS) !== 0);
  }
  return false;
}
/** Prima metà di `norma`: NFKC, minuscole (prima dei segni, S-4), niente invisibili né segni sciolti. Un testo stabile non ne ha. */
function basePiana(v) {
  const g = grezzo(v);
  return STABILE_NFKC.test(g) ? g.toLowerCase() : g.normalize('NFKC').toLowerCase().replace(INVISIBILI, '').replace(CONTROLLI, '').replace(SEGNI_COMBINANTI, '');
}
const MEMO_NORMA = new Map(); // stesso testo, stessa forma: la cassa e l'importo rileggono gli stessi campi nella stessa valutazione
/** Forma confrontabile di un nome: NFKC, niente invisibili né segni sciolti, minuscole, apostrofi e confondibili uniformati. */
function norma(v) {
  const memo = typeof v === 'string' && v.length <= 256;
  if (memo && MEMO_NORMA.has(v)) return MEMO_NORMA.get(v);
  const n = confine(basePiana(v).replace(APOSTROFI, "'").replace(CONFONDIBILI_RE, (c) => CONFONDIBILI[c])).replace(SPAZI, ' ').trim();
  if (memo) { if (MEMO_NORMA.size >= 4096) MEMO_NORMA.clear(); MEMO_NORMA.set(v, n); }
  return n;
}
/** Forma leggera per scorrere TUTTA la schermata (anti-robot, cookie, cassa): niente NFKC, che è la parte cara. */
function normaLeggera(v) { return grezzo(v).replace(INVISIBILI, '').toLowerCase().replace(APOSTROFI, "'").replace(SPAZI, ' '); }
/** Testo per i numeri (carte, IBAN): NFKC (cifre a larghezza piena), niente invisibili, spazi uniformi; maiuscole conservate. */
function normaNumeri(v) { return nfkc(grezzo(v)).replace(INVISIBILI, '').replace(SPAZI, ' '); }
/** C8 (revisione PR19): chi legge il testo della pagina (il rilevatore) toglie gli STESSI invisibili delle protezioni: NFKC, niente
 *  invisibili né controlli. A capo e tabulazioni restano. */
const SPAZIO_BRAILLE = /\u2800/gu;
export function testoSenzaInvisibili(v) {
  const g = grezzo(v);
  return STABILE_NFKC.test(g) ? g : g.normalize('NFKC').replace(INVISIBILI, '').replace(CONTROLLI, '').replace(SPAZIO_BRAILLE, ' '); // nei blocchi stabili non ce n'è
}
/** C8: le lettere sosia di un altro alfabeto (fuori dal CJK) portate a quelle latine, in minuscolo; null se nessuna sta ACCANTO a una
 *  lettera latina. Il camuffamento cambia lettere dentro una parola latina («Ignоre»): una pagina russa o greca non paga la seconda lettura.
 *  R9 (revisione R): anche una frase fatta SOLO di sosia, se ne mescola due alfabeti uno accanto all'altro («іցոоꓣе», cirillico + armeno
 *  + lisu); Hermes `tools/threat_patterns.py:141-143` nota che NFKC non piega i sosia fra alfabeti, ed è questo il buco. */
const ALFABETI_DEI_SOSIA = [/\p{Script=Latin}/u, /\p{Script=Cyrillic}/u, /\p{Script=Greek}/u, /\p{Script=Armenian}/u, /\p{Script=Lisu}/u];
const ALFABETO_DEL_SOSIA = new Map(Object.keys(CONFONDIBILI).map((c) => [c, ALFABETI_DEI_SOSIA.findIndex((re) => re.test(c))]));
export function sosiaInLatino(v) {
  const m = grezzo(v).toLowerCase();
  if (m.search(CONFONDIBILI_RE) === -1) return null;
  let prima = 0;
  for (let i = 0; i < m.length; i += passoClasse) {
    const k = classeIn(m, i);
    if (((prima & K_LATINO) && (k & K_CONFONDIBILE)) || ((prima & K_CONFONDIBILE) && (k & K_LATINO))) return mappaNonCjk(m);
    if ((prima & K_CONFONDIBILE) && (k & K_CONFONDIBILE) && ALFABETO_DEL_SOSIA.get(m[i - 1]) !== ALFABETO_DEL_SOSIA.get(m[i])) return mappaNonCjk(m);
    prima = k;
  }
  return null;
}
/* Scritture miste (Mobile 04/11: «Mario 李», «Vai 日本» fermavano ogni tocco su un contatto). Il camuffamento cambia lettere DENTRO una
   parola (Hermes `optional-skills/security/godmode/scripts/parseltongue.py:121-130`, sostituzione lettera per lettera), quindi si guarda
   parola per parola. Latino con cinese, giapponese o coreano nella stessa parola («Tシャツ») è ammesso: è l'uso normale secondo Unicode
   TR39 rev. 34 §5.2 «Highly Restrictive» (Latn + Jpan, Latn + Hanb, Latn + Kore). */
const PAROLA = /[\p{L}\p{M}]+/gu;
const LETTERA_NE_LATINA_NE_CJK = /(?=\p{L})[^\p{Script=Latin}\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Hangul}\p{scx=Bopomofo}]/u;
const mista = (p) => LETTERA_LATINA.test(p) && LETTERA_NE_LATINA_NE_CJK.test(p);
/**
 * Una parola mista PRIMA e DOPO la mappa dei confondibili è quasi sempre un camuffamento («Senդ»). Solo prima («Pаy» con la «а»
 * cirillica) la mappa la riporta al latino e la leggono le regole normali; solo dopo («Иванов», che la mappa latinizza a metà) è una
 * parola straniera intera. `n` è il nome già normalizzato (filtro veloce), `v` il valore grezzo da cui si rileggono le parole.
 */
/* Regola del panino (owner 04/11, decisione 146): CJK FRA due lettere latine della stessa parola («Pa李ga», «Se信nd») non è un nome
   vero — i nomi veri sono latino poi CJK («Tシャツ», «LG전자») — ma il modo di spezzare «paga» per le regole: non valutabile. Si guarda
   dopo la mappa, così «De丨ete» torna «delete» e lo legge la sua regola. */
// Riferimento lento di spremi: la prova MISTE-25 controlla che diano lo stesso testo (V2-2, revisione del Desktop 04/11).
const PANINO_G = /(?<=\p{Script=Latin})[\p{N}\p{P}\p{S}]*[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Hangul}\p{scx=Bopomofo}][\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Hangul}\p{scx=Bopomofo}\p{N}\p{P}\p{S}]*(?=\p{Script=Latin})/gu;
const PANINO_LARGO = /\p{Script=Latin}[\p{N}\p{P}\p{S}]*[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Hangul}\p{scx=Bopomofo}][\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}\p{scx=Hangul}\p{scx=Bopomofo}\p{N}\p{P}\p{S}]*\p{Script=Latin}/u;
/** Come `s.replace(PANINO_G, '')` ma lineare: toglie le corse di CJK (con cifre e segni) fra due lettere latine. */
function spremi(s) {
  let fuori = ''; let da = 0; let i = 0; let primaLatino = false;
  while (i < s.length) {
    const k = classeIn(s, i); const p = passoClasse;
    if (primaLatino && (k & (K_CJK | K_NPS))) {
      let j = i; let kj = k; let pj = p; let cjk = false;
      while (j < s.length && (kj & (K_CJK | K_NPS))) { if (kj & K_CJK) cjk = true; j += pj; if (j < s.length) { kj = classeIn(s, j); pj = passoClasse; } }
      if (cjk && j < s.length && (kj & K_LATINO)) { fuori += s.slice(da, i); da = j; }
      i = j; primaLatino = false; continue;
    }
    primaLatino = (k & K_LATINO) !== 0; i += p;
  }
  return da === 0 ? s : fuori + s.slice(da);
}
const REGOLE_DELICATE = [(n) => NOME_CANCELLAZIONE.test(n), (n) => pagamentoForte(n), (n) => PAGAMENTO_DEBOLE.test(n), (n) => ORDINA_DEBOLE.test(n),
  (n) => INVIO_FORTE.test(n), (n) => INVIO_DEBOLE.test(n), (n) => COOKIE_SPECIFICO.test(n), (n) => ACCETTA_GENERICO.test(n), (n) => PERMESSO_NOME.test(n),
  (n) => NOME_TERMINI_PULSANTE.test(n), (n) => CONFERMA_GENERICA.test(n), (n) => NOME_MARKETING.test(n), (n) => NOME_TERMINI_CASELLA.test(n),
  (n) => TITOLO_CASSA.test(n), (n) => CAMPO_CARTA.test(n), (n) => NOME_CREDENZIALE.test(n), (n) => ANTI_ROBOT_FRASI.test(n), (n) => CAMPO_CHAT.test(n),
  (n) => CAMPO_IMPORTO.test(n), (n) => CAMPO_SCADENZA.test(n), (n) => CAMPO_CARTA_DEBOLE.test(n)];
/** Quali regole delicate legge un nome normalizzato (una per bit). */
const regoleDi = (n) => REGOLE_DELICATE.reduce((m, f, i) => (f(n) ? m | (1 << i) : m), 0);
const mappaNonCjk = (s) => s.replace(CONFONDIBILI_RE, (c) => (LETTERA_CJK.test(c) ? c : CONFONDIBILI[c]));
/** Solo per le prove: i pezzi veloci e le regex di cui devono dare lo stesso risultato (PROT-11-NFKC, PROT-11-TABELLA). */
export const PROVE_INTERNE = Object.freeze({ nfkc, basePiana, confine, paninoLargo, mappaNonCjk, spremi, CONFINE_LATINO_CJK, PANINO_LARGO, PANINO_G });
function scrittureMiste(n, v) {
  const kn = classiDi(n);
  const fuori = (kn & K_LATINO) !== 0 && (kn & K_ALTRA) !== 0; // = mista(n)
  const crudo = grezzo(v);
  // il filtro veloce guarda anche il valore grezzo: un omoglifo CJK («丨») nel nome normalizzato è già diventato latino
  if (!fuori && !((kn & K_LATINO) && ((kn & K_CJK) || (classiDi(crudo) & K_CJK)))) return false;
  const leggera = basePiana(crudo);
  if (fuori && (leggera.match(PAROLA) ?? []).some((p) => mista(p) && mista(p.replace(CONFONDIBILI_RE, (c) => CONFONDIBILI[c])))) return true;
  // panino: i confondibili NON CJK si mappano (la «а» cirillica torna «a»), quelli CJK restano CJK; poi si toglie il CJK fra due lettere
  // latine e si guarda se resta una parola delle regole (con e senza accenti: «Pá李ga»). `paninoLargo` lo cerca prima della mappa.
  if (!paninoLargo(leggera)) return false;
  // V2-1: non valutabile solo se la lettura SENZA il CJK trova una regola che la lettura normale (`n`, con la mappa) non trova già;
  // una regola forte altrove nel nome («Invia e Pa李ga») non spegne più il panino, e «Cㅇnfirm ㅇrder» resta della sua regola
  const gia = regoleDi(n);
  const pre = mappaNonCjk(leggera);
  const spremuta = spremi(pre);
  if ((regoleDi(norma(spremuta)) & ~gia) || (regoleDi(norma(spremuta.normalize('NFD').replace(SEGNI_COMBINANTI, ''))) & ~gia)) return true;
  return false;
}

/** Parole intere su testo già normalizzato: i confini valgono anche per le lettere accentate (`\b` di JS è solo ASCII). */
const parole = (alternative) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternative})(?![\\p{L}\\p{N}])`, 'u');
const intero = (alternative) => new RegExp(`^(?:${alternative})$`, 'u');

// ---------- credenziali ----------
const AUTOCOMPLETE_SENSIBILI = new Set(['current-password', 'new-password', 'one-time-code']);
const INPUT_TYPE_PASSWORD = /password/iu; // Android: textPassword, textWebPassword, textVisiblePassword, numberPassword
const NOME_CREDENZIALE = parole("password|passwd|pwd|passcode|passphrase|parola d'ordine|chiave di accesso|codice segreto|pin|codice pin|codice di verifica|codice otp|otp|cvv2?|cvc2?|codice di sicurezza|security code|verification code|iban|codice fiscale|carta d'identità|carta di identità|passaporto|numero (?:della |di )?carta(?: di credito)?|card number|credit card number|carta di credito|api[ -]?key|chiave api|secret key|chiave segreta|access token|token di accesso|private key|chiave privata|seed phrase|frase di recupero|recovery phrase|mot de passe|contraseña|passwort|kennwort|senha|wachtwoord");
const NOME_CODICE = parole('codice|code|otp|verifica|verification|token|2fa|one-time|monouso|pin');
const NON_E_UN_CODICE = parole("postale|avviamento postale|cap|zip|postal|promo\\p{L}*|sconto|coupon|discount|gift|regalo|voucher|buono|fiscale|iva|vat|tracking|spedizione|ordine|order|prodotto|product|articolo|item|sku|riferimento|reference");
// C6 (revisione PR19): dal controllo della carta è esente solo un campo d'IDENTIFICATIVO, col nome intero («Numero ordine», «Tracking
// number», «SKU»), e solo per un testo di sole cifre. Una parola dentro un nome più lungo («Note sull'ordine», «Messaggio regalo») non basta.
const NOME_IDENTIFICATIVO = intero("(?:(?:numero|num\\.?|n\\.?|n°|nr\\.?|codice|id)\\s*(?:(?:dell'|d'|di|del|della)\\s*)?)?"
  // R5 (revisione R): «Riferimento» o «Reference» da soli sono la causale di un bonifico, non un identificativo: esente solo quello dell'ordine
  + "(?:ordine|order|tracking|tracciamento|spedizione|riferimento (?:(?:dell'|d'|del|di) ?)?ordine|prodotto|product|articolo|item|sku)"
  + '(?:\\s*(?:number|no\\.?|nr\\.?|#|id|code|numero))?\\s*[:*]?');
const SOLO_CIFRE_E_SEPARATORI = /^[\d\s./-]+$/u;
const SEGNAPOSTO = /\{\{\s*segreto\s*:[^{}]+\}\}/giu; // [^{}] non attraversa un'altra graffa: niente ritorno quadratico
const SOLO_SEGNAPOSTI = /^\s*(?:\{\{\s*segreto\s*:[^{}]+\}\}\s*)+$/iu;
const SOLO_CODICE = /^\d{4,8}$/u;
const SEQUENZE_CIFRE = /\d+(?:[ .,_x/\-‐-―]{1,4}\d+)*/gu;
const NON_CIFRE = /\D+/u;
const CANDIDATO_IBAN = /(?<![A-Z0-9])[A-Z]{2}\d{2}(?:[ \-./]?[A-Z0-9]){10,32}/gu;
const SEPARATORI_IBAN = /[ \-./]+/gu;
const LUNGHEZZE_IBAN = Object.freeze({
  IT: 27, SM: 27, VA: 22, DE: 22, FR: 27, MC: 27, ES: 24, AD: 24, PT: 25, GB: 22, IE: 22, NL: 18, BE: 16, LU: 20, AT: 20, CH: 21, LI: 21,
  PL: 28, MT: 31, GR: 27, SE: 24, DK: 18, FI: 18, NO: 15, IS: 26, CZ: 24, SK: 24, HU: 28, RO: 24, BG: 22, HR: 21, SI: 19, EE: 20, LV: 21,
  LT: 20, CY: 28, TR: 26, AL: 28, AE: 23, SA: 24, BR: 29,
});
const CIFRE_MASCHERATE = /(?:[•●∙·*]{2,}\s*\d{2,4}|\d{2,4}\s*[•●∙·*]{2,}|[•●∙·*]{4,})/u; // «Visa •••• 1111», «••••••••»
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/u;

// ---------- campi, finestre, pagina di cassa ----------
const CAMPO_INDIRIZZO = parole("barra degli indirizzi|barra indirizzi|indirizzo e ricerca|address and search bar|address bar|omnibox|url");
// Solo i campi dove Invio SPEDISCE (chat): nel corpo di una mail o in un commento Invio va a capo, e Ctrl+Invio è già un invio.
const CORPO_A_PIU_RIGHE = parole("corpo|body|nota|note|notes|descrizione|description|beschreibung|corps");
/** C2 (revisione R, M-C): UNA regola per l'a capo, che l'ospite del PC importa (attrezzo.mjs). Un a capo in mezzo al testo è un Invio
 *  (anche un «\r» da solo, M20); va a capo senza inviare solo nel corpo di una mail, una nota o una descrizione FUORI da una cassa (R1:
 *  «Note sull'ordine» in un checkout conferma l'ordine). Come cua-driver: `post_type_text` manda «\n» come un Invio vero (Q3-B). */
const A_CAPO_IN_MEZZO = /[\r\n](?!\s*$)/u;
const A_CAPO_IN_FONDO = /[\r\n]\s*$/u;
export function aCapoInMezzo(testo) { return A_CAPO_IN_MEZZO.test(grezzo(testo)); }
export function aCapoAmmesso(bersaglio, schermata) {
  try {
    if (!CORPO_A_PIU_RIGHE.test(norma(bersaglio?.nome))) return false;
    const elementi = Array.isArray(schermata?.elementi) ? schermata.elementi : [];
    return !paginaDiCassa(bersaglio, elementi, schermata ?? {}, leggiFinestre(elementi));
  } catch { return false; } // chi non sa valutare nega
}
// N3 (revisione delle cure R): anche i campi di commento e di recensione pubblicano con Invio («Scrivi un commento», «Add a comment…»,
// «Lascia una recensione»); «corpo», «nota», «descrizione» restano fuori (CORPO_A_PIU_RIGHE). Terzo giro (N3 oltre it/en): «Kommentar
// schreiben», «Écrire un commentaire», «Escribe un comentario», «Escreva um comentário», «Say something…», «Join the discussion»; R4
// della sua revisione: «Nachricht schreiben», «Escribe un mensaje», «Escreva uma mensagem», «Répondre», «Responder», «Antworten»
const CAMPO_CHAT = parole("messaggio|message|scrivi un messaggio|type a message|chat|rispondi|reply|tweet|a cosa stai pensando|what's happening|what's on your mind|commento|commenta|commenti|comment|comments|recensione|review|commentaire|commentaires|comentario|comentarios|comentário|comentários|kommentar|kommentare|discussion|say something|nachricht|nachricht schreiben|nachricht eingeben|mensaje|escribe un mensaje|mensagem|escreva uma mensagem|répondre|responder|antworten");
// Ruoli che si attivano con Invio come col clic (N1, N9): mai un campo di chat, qualunque sia il nome
const SI_PREMONO = new Set(['pulsante', 'collegamento', 'voce', 'scheda']);
const CAMPO_CARTA = parole("numero (?:della |di )?carta|card number|cvv2?|cvc2?|codice di sicurezza|security code|scadenza della carta|card expiry|mm ?/ ?aa|mm ?/ ?yy|titolare della carta|cardholder|name on card");
const CAMPO_SCADENZA = parole("scadenza|expiry|expiration date|valid thru|data di scadenza");
const CAMPO_CARTA_DEBOLE = parole("titolare|cardholder|carta|card|intestatario");
const TITOLO_CASSA = parole("checkout|secure checkout|pagamento|pagamento sicuro|payment|riepilogo (?:dell')?ordine|order summary|order review|rivedi (?:il tuo )?ordine|review (?:your )?order|conferma (?:l')?ordine|place (?:your )?order|completa (?:l')?acquisto|kasse|zur kasse|paiement|caisse|finalizar compra");
const PREZZO = /(?:[€$£]\s?\d|\d[\d.,]*\s?(?:€|eur|euro|usd|\$|£|chf)(?!\p{L}))/u;

// ---------- consensi ----------
const COOKIE_SPECIFICO = parole("accett[ao] (?:tutti i |i )?cookies?|accept (?:all )?cookies|allow (?:all )?cookies|consenti (?:tutti i )?cookies?|accepter les cookies|cookies akzeptieren|aceptar cookies");
const ACCETTA_GENERICO = intero("accetta|accetto|sì,? accetto|si,? accetto|acconsento|acconsenti|va bene|d'accordo|ok|okay|continua|continue|accett[ao] tutti e continua|accept all and continue|accept|got it|ho capito|agree|i agree|accett[ao] tutt[io]|accept all|allow all|consenti tutt[io]|accetta e chiudi|accetta e continua|accept and close|accept and continue|agree and close|agree and proceed|tout accepter|alle akzeptieren|aceptar todo|aceptar todas|aceitar todos|accepteer alles");
const MENZIONA_COOKIE = /cookie/u;
const BANNER_COOKIE = /(?:usiamo|utilizziamo|utilizza|we use|this site uses|questo sito|consenso|consent|preferenze|preferences|partner|personalizz|tracciament|tracking|privacy)/u;
const PERMESSO_NOME = intero("consenti|allow|permetti|autorizza|authorize|consenti accesso|consenti l'accesso|allow access|allow once|consenti una volta|only this time|solo questa volta|while using the app|mentre usi l'app|consenti mentre usi l'app|consenti durante l'uso dell'app|allow while using the app|allow while visiting the site|consenti mentre visiti il sito|allow all the time|consenti sempre|always allow|consenti questa volta|allow this time|allow on every visit|consenti ogni volta|consenti a ogni visita");
// Marketing, newsletter, terzi, profilazione: la scelta riservata è NON spuntare (condizione del Mobile su T7, 02/11). Prima non era
// una protezione affatto: una casella «Voglio la newsletter» passava in ogni permesso.
const NOME_MARKETING = parole("newsletter|marketing|promozion\\p{L}*|offert[ae] (?:commerciali|speciali)|pubblicit\\p{L}*|profilazione|partner|terze parti|terzi|comunicazioni commerciali|finalità commerciali|advertising|promotional|third part(?:y|ies)|special offers|personalized ads");
const NOME_TERMINI_CASELLA = parole("termini|condizioni|privacy|informativa|consenso|ho letto|accetto|acconsento|terms|conditions|policy|eula|licenza|license|i agree|i accept");
const NOME_TERMINI_PULSANTE = parole("i agree|agree|accetto|acconsento|accett[ao] (?:i |le )?(?:termini|condizioni)|ho letto e accetto|accept (?:the )?terms|i accept|agree and continue|accetto e continuo|accetta e continua|accept and continue");

// ---------- anti-robot ----------
// Frasi di SFIDA: valgono su qualunque elemento (la pagina interstiziale di Cloudflare è testo). Nomi di PRODOTTO: solo su un widget
// o con un'origine (un articolo o un piè di pagina che nomina «reCAPTCHA» non è una sfida).
const ANTI_ROBOT_FRASI = parole("non sono un robot|i'?m not a robot|i am not a robot|i am human|sono umano|are you a robot|sei un robot|verify(?:ing)? (?:that )?you(?: are|'re) (?:a )?human|verifica (?:di essere|che sei) (?:un )?(?:essere )?umano|stiamo verificando che (?:tu )?sia (?:un )?(?:essere )?umano|conferma (?:di essere|che sei) (?:un )?(?:essere )?umano|press (?:&|and) hold|premi e tieni premuto|select all (?:images|squares)|seleziona tutte le (?:immagini|caselle)|slide to verify|scorri per verificare|unusual traffic|traffico insolito|human verification|verifica umana|complete the security check|completa il controllo di sicurezza");
const ANTI_ROBOT_PRODOTTI = parole("recaptcha|hcaptcha|turnstile|captcha|funcaptcha|arkose|geetest|datadome");
const ANTI_ROBOT_ORIGINE = /(?:google\.com\/recaptcha|recaptcha\.net|gstatic\.com\/recaptcha|hcaptcha\.com|challenges\.cloudflare\.com|captcha-delivery\.com|arkoselabs\.com|funcaptcha\.com|awswaf\.com|px-captcha|px-cdn\.net|px-cloud\.net|perimeterx\.net|geetest\.com|friendlycaptcha\.com|mtcaptcha\.com)/iu;
const ANTI_ROBOT_INVISIBILE = /size=invisible/iu; // reCAPTCHA v3/invisibile: nessuna sfida a schermo
const RUOLI_NON_WIDGET = new Set(['testo', 'collegamento']);

// ---------- cancellazioni ----------
const NOME_CANCELLAZIONE = parole("(?:elimina|eliminare|cancella|cancellare|rimuovi) (?:definitivamente|per sempre)|svuota (?:il )?cestino|(?:elimina|chiudi|disattiva|cancella|rimuovi) (?:il |l'|questo |il mio |l'intero )?account|delete (?:permanently|forever)|permanently delete|empty (?:the )?(?:recycle bin|trash|bin)|empty trash|(?:delete|close|deactivate|remove) (?:my |the |this )?account|(?:elimina|cancella) tutto|cancella tutti i dati|elimina tutti i (?:dati|messaggi|file)|delete all(?: data| messages| files)?|erase all(?: data| content)?|ripristin[ao] (?:i )?dati di fabbrica|factory (?:reset|data reset)|elimina per tutti|delete for everyone|elimina (?:la |questa )?(?:chat|conversazione)|delete (?:this )?(?:chat|conversation)|delete (?:this )?repository|elimina (?:questo )?repository|formatta|format disk|format drive|endgültig löschen|papierkorb leeren|supprimer définitivement|vider la corbeille|eliminar definitivamente|vaciar (?:la )?papelera");
const TESTO_IRREVERSIBILE = parole("definitivamente|per sempre|forever|non (?:si )?(?:pu[òo]|potr[àa]) (?:essere )?annull\\p{L}*|non potrai (?:pi[ùu] )?(?:recuperar|annullar)\\p{L}*|non sar[àa] (?:pi[ùu] )?possibile (?:recuperar|ripristinar|annullar)\\p{L}*|irreversibil\\p{L}*|non reversibile|cannot be (?:undone|recovered|restored|reversed)|can'?t be (?:undone|recovered|restored)|can not be undone|will be (?:permanently )?(?:lost|deleted forever)|permanently|permanent|this action is final|nicht rückgängig|endgültig|unwiderruflich|irréversible|définitivement|ne peut pas être annul\\p{L}*|no se puede deshacer|permanentemente");
/* Decisioni 167 e 170 (owner 04/11 17:49 e 18:16): un «Elimina», «Delete» o «Rimuovi» NUDO dentro una finestra di conferma modale è una
   cancellazione: è il pulsante di «Eliminare 1 file?», che spesso non dice che non si torna indietro. Nudo = il nome intero, tolti segni e
   simboli ai bordi («Elimina…», «🗑 Elimina»), con al più un «Sì,» / «Yes,» davanti. Vale solo con le politiche che lo dichiarano
   (`eliminaNudoInFinestra`): Accesso pieno, Consenti sempre e Normale del PC e Accesso pieno del telefono; il telefono di serie lo
   decide il Mobile (decisione 170). Sul PC vero scatta quando l'ospite segna le finestre modali (Q2-F1, decisione 181). */
const ELIMINA_NUDO = intero("(?:(?:sì|si|yes|ok),? )?(?:elimina|elimina per tutti|elimina per me|delete|delete for everyone|delete for me|rimuovi|remove|cancella|löschen|supprimer|eliminar|borrar)");
const BORDI_NON_PAROLA = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
const eliminaNudo = (nome) => ELIMINA_NUDO.test(nome.replace(BORDI_NON_PAROLA, ''));
const NOME_USCITA_DIALOGO = intero("annulla|cancel|no|chiudi|close|indietro|back|mantieni|keep|non ora|not now|esci|x|×|torna indietro|go back|torna al carrello|back to cart|abbrechen|annuler|cancelar");

// ---------- pagamento e invio: parole FORTI ovunque, DEBOLI solo in cassa, accanto a un prezzo o dentro una finestra modale ----------
// «F24», «bollettino», «pagoPA» sono NOMI di documenti di pagamento: da soli pagano (un pulsante «F24» in un'app bancaria), ma non
// quando la voce dice che si scarica, si stampa o si guarda il documento («Scarica il modello F24 (PDF)»: censimento del 02/11, T3)
const DOCUMENTO_DI_PAGAMENTO = parole("bollettino|bollettini|pagopa|f24");
const SOLO_DOCUMENTO = parole("scarica|scaricare|download|pdf|stampa|stampare|modello|modelli|modulo|moduli|visualizza|anteprima|istruzioni|guida|compila|compilare");
const PAGAMENTO_FORTE = parole("bonifico|(?:invia|conferma|esegui|effettua|autorizza) (?:il |un )?bonifico|giroconto|trasferisci|trasferimento|invia (?:denaro|soldi|i soldi|il denaro)|manda (?:denaro|soldi)|ricarica|ricaricare|send money|transfer|wire|top up|paga|pagare|paga ora|paga adesso|pay|pay now|paga con [\\p{L} ]{2,20}|pay with [\\p{L} ]{2,20}|(?:conferma|effettua|esegui|vai al|procedi al) (?:il )?pagamento|conferma (?:l'|il |e )?(?:acquisto|ordine|paga)|completa (?:l'|il |la )?(?:acquisto|ordine|pagamento|prenotazione)|procedi (?:all'acquisto|al checkout|all'ordine|al pagamento)|proceed to (?:payment|checkout)|acquista|acquista ora|compra|compra ora|compra subito|ordina ora|ordina e paga|invia (?:l')?ordine|effettua (?:l')?ordine|buy|buy now|purchase|complete (?:the |your )?(?:purchase|order|booking)|confirm (?:and pay|purchase|payment|order|booking)|place (?:your |the )?order|order now|submit order|checkout|paypal|apple pay|google pay|g pay|satispay|klarna|rent now|prenota e paga|book and pay|jetzt kaufen|kaufen|zahlungspflichtig bestellen|jetzt bestellen|bezahlen|pagar|comprar|confirmar (?:pedido|compra|(?:el |o )?(?:pago|pagamento))|bestellen|acheter|payer|commander|valider (?:la commande|le paiement)|kopen|betalen");
const pagamentoForte = (testo) => PAGAMENTO_FORTE.test(testo) || (DOCUMENTO_DI_PAGAMENTO.test(testo) && !SOLO_DOCUMENTO.test(testo));
const PAGAMENTO_DEBOLE = parole("abbonati|subscribe|start (?:my |your )?(?:subscription|free trial)|prova gratis|inizia la prova|iscriviti a prime|rinnova|renew|dona|donate|noleggia|prenota|prenota ora|book|book now|reserve|conferma (?:la )?prenotazione|upgrade|passa a [\\p{L} ]{2,20}|autorizza|authorize");
const ORDINA_DEBOLE = parole("ordina|order|bestellen");
const CAMPO_IMPORTO = parole("importo|amount|somma|cifra da (?:inviare|pagare)|quanto vuoi (?:inviare|pagare)|betrag|montant");
const CONFERMA_GENERICA = parole("invia|conferma|continua|avanti|procedi|send|confirm|continue|next|proceed");
const INVIO_FORTE = parole("invia|inviare|invio|manda|pubblica|send|send now|submit|publish|post|tweet|upload|carica (?:il |la |i |le |un |una )?(?:file|foto|documento|documenti|allegato|immagine|immagini|video)|invia messaggio|carica su|envoyer|senden|absenden|enviar");
// C7 (revisione PR19): su un campo o un collegamento l'invio si riconosce solo quando il NOME INTERO è un comando d'invio («Pubblica»,
// «Publish now», «Invia ordine»): «Send a message» (un campo di chat) o «Come inviare un pacco» (un link) restano fuori.
const INVIO_COMANDO = intero("(?:invia|manda|pubblica|send|submit|publish|post|tweet|upload|envoyer|senden|absenden|enviar)(?: (?:ora|adesso|subito|now|it|all|tutto|ordine|order|messaggio|message|post|modulo|form))?");
/* C7 (revisione R, R4): un COLLEGAMENTO invia quando il nome è un verbo d'invio col suo oggetto («Send email», «Invia candidatura»,
   «Post comment», fino a tre parole) o un imperativo da solo che non è anche un nome («Invia», «Pubblica», «Submit»). «Send», «Post» e
   «Upload» da soli sono voci di menu; «Pubblica amministrazione», «Post recenti» sono un aggettivo e una sezione: niente carta. */
/* N1 (revisione delle cure R, 04/11): UNA lettura dei collegamenti, la stessa al clic e con Invio (W3C ARIA APG, «Link pattern»: Enter
   attiva il link come il clic). Prima un trattino («Send e-mail»), un segno in coda («Invia!», «Send →»), il verbo in fondo («Nachricht
   senden»), quattro parole o più, o una parola qualsiasi dopo il verbo che stava nell'elenco dei titoli («Send to office») facevano
   passare il link, mentre Invio sullo stesso link era invio (INVIO_FORTE cerca il verbo in tutto il nome). Regole:
   - parole separate da spazi e segni, col trattino DENTRO la parola («e-mail» è una parola);
   - verbo d'invio in testa: è un invio, salvo un titolo di sezione noto SUBITO dopo il verbo («Pubblica amministrazione», «Post recenti»);
   - un verbo da solo è un invio se è un imperativo che non è anche un nome («Invia», «Submit»), o se lo segue un segno di comando
     («Send →», «Post!», «Upload »»); «Send», «Post», «Upload» nudi restano voci di menu (REV-R-08);
   - il verbo può stare in fondo (tedesco: «Nachricht senden», «Kommentar absenden»), fino a quattro parole.
   Su un collegamento INVIO_FORTE non si applica (romperebbe REV-R-08): decide solo questa lettura. Hermes chiede per TIPO d'azione
   (`tools/computer_use/tool.py:338-341`, scope = nome dell'azione distruttiva), mai per gesto: qui il gesto non cambia la lettura. */
/* Terzo giro (N1 con Invio, N6), 05/11: il verbo conta in qualunque posizione fra le prime quattro parole quando lo precede un legame
   («Conferma e invia», «Review and send», «Click here to submit»), salvo una domanda in testa («How to send a parcel», «Come si invia
   un pacco»: un articolo); un trattino dopo il verbo separa il suo oggetto («Send-email»); «Posta» invia solo col suo oggetto («Posta
   commento»; «Posta in arrivo» è una cartella); ➤, ✉ e «:» sono segni di comando. Lo spazio di larghezza zero fra due lettere
   («Send​email») è letto in tutte e due le forme dal chiamante (`invioDaCollegamentoGrezzo`). Il trattino U+2011 non serve nella
   classe: `norma` passa da NFKC, che lo porta a U+2010. */
const INVIO_LINK_NUDO = intero('invia|manda|pubblica|spedisci|submit|publish|tweet|envoyer|senden|absenden|versenden|enviar|publicar');
const VERBI_INVIO_IN_TESTA = new Set(['invia', 'manda', 'pubblica', 'spedisci', 'send', 'submit', 'publish', 'post', 'tweet', 'upload', 'envoyer', 'senden', 'absenden', 'enviar', 'publicar', 'publique']);
const VERBI_INVIO_IN_FONDO = new Set(['senden', 'absenden', 'abschicken', 'verschicken', 'versenden', 'posten', 'veröffentlichen']);
const VERBI_CON_OGGETTO = new Set(['posta']);
const OGGETTO_DA_INVIARE = intero('commento|commenti|messaggio|risposta|recensione|foto|video|post|comment|message|reply|review');
const NON_E_UN_INVIO = intero('amministrazione|amministrazioni|istruzione|sicurezza|sanità|opinione|utilità|recenti|recente|recent|posts|inviati|inviate|sent|office|ufficio');
const LEGAME_PRIMA_DEL_VERBO = intero('e|ed|and|to|then|poi|und|et|y|&|\\+');
const DOMANDA_IN_TESTA = intero('come|perché|perche|cosa|quando|dove|how|why|what|when|where|wie|warum|was|comment|pourquoi|quand|cómo|como|por qué|qué');
const PAROLE_DEL_LINK = /[\p{L}\p{N}]+(?:[-‐][\p{L}\p{N}]+)*/gu;
const TRATTINO = /[-‐]/u;
const SEGNO_DI_COMANDO = /[!→»›>➤✉:]️?\s*$/u;
const PAROLE_MAX_VERBO_IN_FONDO = 4;
const PAROLE_MAX_VERBO_DENTRO = 4;
const verboInTesta = (w, i) => VERBI_INVIO_IN_TESTA.has(w[i]) || (VERBI_CON_OGGETTO.has(w[i]) && OGGETTO_DA_INVIARE.test(w[i + 1] ?? ''));
/** N1: il nome (già passato da `norma`) di un collegamento è un comando d'invio? */
function invioDaCollegamento(nome) {
  // «Send-email»: un verbo che non è anche un nome, col trattino, è il verbo col suo oggetto; «Post-it», «Upload-Bereich», «e-mail»
  // restano una parola sola (R2-12)
  const w = (nome.match(PAROLE_DEL_LINK) ?? []).flatMap((p, i) => {
    const [testa, ...resto] = p.split(TRATTINO);
    return i === 0 && resto.length && (testa === 'send' || INVIO_LINK_NUDO.test(testa)) ? [testa, resto.join('-')] : [p];
  });
  if (w.length === 0) return false;
  if (w.length === 1) return INVIO_LINK_NUDO.test(w[0]) || (VERBI_INVIO_IN_TESTA.has(w[0]) && SEGNO_DI_COMANDO.test(nome));
  if (verboInTesta(w, 0)) return !NON_E_UN_INVIO.test(w[1]);
  if (!DOMANDA_IN_TESTA.test(w[0])) {
    for (let i = 1; i < Math.min(w.length, PAROLE_MAX_VERBO_DENTRO); i += 1) {
      if (LEGAME_PRIMA_DEL_VERBO.test(w[i - 1]) && verboInTesta(w, i) && !NON_E_UN_INVIO.test(w[i + 1] ?? '')) return true;
    }
  }
  return w.length <= PAROLE_MAX_VERBO_IN_FONDO && VERBI_INVIO_IN_FONDO.has(w.at(-1));
}
// lo spazio di larghezza zero (e i suoi simili) fra due lettere separa due parole: «Send​email» si legge anche «send email»
const LARGHEZZA_ZERO_FRA_LETTERE = /(?<=[\p{L}\p{N}])[​‌‍⁠﻿­]+(?=[\p{L}\p{N}])/gu; // R6: anche lo spazio morbido U+00AD («Send­email»)
const C_E_LARGHEZZA_ZERO = new RegExp(LARGHEZZA_ZERO_FRA_LETTERE.source, 'u'); // senza «g»: `test` non tiene memoria fra due chiamate
function invioDaCollegamentoGrezzo(nome, grezzoNome) {
  if (invioDaCollegamento(nome)) return true;
  const g = grezzo(grezzoNome);
  return C_E_LARGHEZZA_ZERO.test(g) && invioDaCollegamento(norma(g.replace(LARGHEZZA_ZERO_FRA_LETTERE, ' ')));
}
const INVIO_DEBOLE = parole("condividi|share|rispondi|rispondi a tutti|reply|reply all|inoltra|forward|commenta|comment|teilen|partager|compartir");
const DESTINAZIONE_CARICAMENTO = parole("trascina (?:qui|i file)|rilascia (?:qui|i file)|drop (?:files|here|file)|drag (?:and drop|files|here)|carica|upload|allega|attach");
// Ruoli che confermano: un campo si mette a fuoco, un collegamento o una scheda navigano.
const RUOLI_NON_CONFERMA = new Set(['campo', 'collegamento', 'scheda', 'area-scorrevole', 'testo', 'immagine', 'finestra']);

// ---------- tastiera ----------
const SINONIMI_TASTI = Object.freeze({
  maiusc: 'shift', maiuscole: 'shift', shift: 'shift', canc: 'delete', del: 'delete', delete: 'delete', supr: 'delete', entf: 'delete', elimina: 'delete',
  ctrl: 'ctrl', control: 'ctrl', ctl: 'ctrl', strg: 'ctrl', alt: 'alt', option: 'alt', opt: 'alt', altgr: 'alt',
  win: 'meta', windows: 'meta', meta: 'meta', cmd: 'meta', command: 'meta', super: 'meta',
  invio: 'enter', enter: 'enter', return: 'enter', ret: 'enter', numpadenter: 'enter', kpenter: 'enter', kp_enter: 'enter', numpad_enter: 'enter', '~': 'enter',
  space: 'space', spazio: 'space', spacebar: 'space', barra: 'space',
  esc: 'escape', escape: 'escape', left: 'left', arrowleft: 'left', sinistra: 'left', browserback: 'browserback', backspace: 'backspace',
  ins: 'insert', insert: 'insert', tab: 'tab', tabulazione: 'tab',
});
// R2 (revisione R): i modificatori col lato («ShiftLeft», «lshift», «Control_L», «RightCtrl») sono lo stesso modificatore. Come Hermes
// `tools/computer_use/cua_backend_parse.py:134` (`_MODIFIER_NAMES`), un nome solo per modificatore; qui anche le varianti col lato.
const MODIFICATORE_COL_LATO = /^(?:l|r|left|right)?[_-]?(shift|ctrl|control|alt|option|meta|win|super|cmd|command)[_-]?(?:l|r|left|right)?$/u;
const SEPARATORI_TASTI = /[\s+,]+|(?<=\p{L}{2,})-(?=\p{L})/u;
const GRAFFE = /^\{|\}$/gu;
function insiemeTasti(combinazione) {
  const pezzi = [combinazione].flat(Infinity).map((p) => grezzo(p));
  const s = new Set();
  for (const p of pezzi) {
    if (p === ' ') { s.add('space'); continue; }
    for (const q of p.split(SEPARATORI_TASTI)) { const k = q.normalize('NFKC').trim().toLowerCase().replace(GRAFFE, ''); if (k) s.add(SINONIMI_TASTI[k] ?? SINONIMI_TASTI[MODIFICATORE_COL_LATO.exec(k)?.[1]] ?? k); }
  }
  return s;
}
const uguale = (s, ...tasti) => s.size === tasti.length && tasti.every((t) => s.has(t));
const eShiftCanc = (s) => uguale(s, 'shift', 'delete');
const eIncolla = (s) => uguale(s, 'ctrl', 'v') || uguale(s, 'meta', 'v') || uguale(s, 'shift', 'insert') || uguale(s, 'ctrl', 'shift', 'v');
const eInvioTastiera = (s) => (s.has('enter') && (s.has('ctrl') || s.has('meta'))) || uguale(s, 'alt', 's');
// C2 (revisione PR19): Invio o Spazio con Shift o Alt confermano come da soli (Shift+Invio su «Paga ora» lo preme); Ctrl e Meta li porta eInvioTastiera
const MODIFICATORI = new Set(['shift', 'alt', 'ctrl', 'meta']);
// R2: Invio o spazio con tasti che non scrivono (Fn, Tab, un modificatore col lato) confermano come da soli; con un tasto che SCRIVE
// («ctrl+a+enter», M2) non si sa cosa faccia: non valutabile (`tastoCheScrive`)
const tastoCheScrive = (t) => [...t].length === 1 && /[\p{L}\p{N}\p{P}\p{S}]/u.test(t);
const eConfermaTastiera = (s) => ((s.has('enter') || s.has('space')) && ![...s].some(tastoCheScrive)) || eInvioTastiera(s);
/** Tasti che confermano (Invio, spazio, Ctrl+Invio, Alt+S): senza un bersaglio non si valutano. Per l'ospite del PC (04/11/2026).
 *  Fusione col blocco C2 (04/11): qui restano le conferme che ARRIVANO come sono scritte; Maiusc o Alt con Invio o spazio no, perché
 *  in sottofondo il modificatore si perde (Q2-A1, Q3-A) e l'ospite le scarta. La politica, più larga, le legge come conferme. */
const eConfermaCheArriva = (s) => uguale(s, 'enter') || uguale(s, 'space') || eInvioTastiera(s);
export const eTastiDiConferma = (combinazione) => eConfermaCheArriva(insiemeTasti(combinazione));
// Azioni che si ALLONTANANO da un controllo anti-robot (rilievo del Mobile): Esc, chiudi finestra/scheda, indietro.
const eUscitaTastiera = (s) => uguale(s, 'escape') || uguale(s, 'alt', 'f4') || uguale(s, 'ctrl', 'w') || uguale(s, 'ctrl', 'f4') || uguale(s, 'alt', 'left') || uguale(s, 'browserback') || uguale(s, 'meta', 'w');
const TASTI_DI_SPOSTAMENTO = new Set(['tab', 'left', 'right', 'up', 'down', 'arrowright', 'arrowup', 'arrowdown', 'home', 'end', 'pageup', 'pagedown', 'shift', 'escape']);
const soloSpostamento = (s) => s.size > 0 && [...s].every((t) => TASTI_DI_SPOSTAMENTO.has(t));
const tastoSingolo = (s) => s.size === 1 && /^(?:\p{L}|space|enter)$/u.test([...s][0]);
/** Guardia, decisione 145: una combinazione che sposta soltanto o si allontana (Esc, chiudi, indietro) non cambia niente. */
export function tastiSenzaEffetto(combinazione) {
  try { const s = insiemeTasti(combinazione); return eUscitaTastiera(s) || soloSpostamento(s); } catch { return false; }
}

// ---------- intenzioni dalla frase della PERSONA (mai dagli argomenti del modello: cure S2) ----------
// Solo verbi all'imperativo che chiedono davvero l'azione; in dubbio `false` (il verso sicuro). Una proposizione che è una DOMANDA non
// sblocca; una negazione, una condizione, «prima di», «chiedimi», «quale» PRIMA del verbo la annullano; una ritrattazione annulla tutto.
const VUOLE_PAGARE = parole("compra|comprami|compramelo|compramela|comprare|acquista|acquistare|paga|pagami|pagamela|pagalo|pagala|pagare|prenota|prenotare|prenotami|rinnova|rinnovare|abbonami|fai il checkout|ordina (?:un|una|uno|un'|del|della|delle|dei|degli|\\d+)|buy|purchase|pay(?! attention)|book|renew|checkout|order (?:me|a|an|some|two|three|\\d)");
const VUOLE_INVIARE = parole("invia|inviare|inviagli|inviale|manda|mandare|mandagli|mandale|mandaci|spedisci|spediscigli|scrivi a|scrivigli|scrivile|rispondi (?:a|ad|al|allo|alla|ai|agli|alle|all'\\p{L}+)(?! (?:mio|mia|miei|mie|me|questo|questa|questi|queste|quest|quello|quella|quelli|quelle|tutte le domande|domanda|domande|seguente|seguenti|prossima|prossimo|prossime|prossimi|tua|tuo|tue|tuoi|quesito|quesiti|quiz|questionario|sondaggio|test|telefono|chiamata|citofono|alta voce)(?![\\p{L}\\p{N}]))|rispondigli|rispondile|inoltra|inoltrare|pubblica|pubblicare|condividi|condividere|carica (?:il |la |i |le |un |una )?(?:file|foto|documento|documenti|video|immagine|immagini)[\\p{L} ]{0,30} su|send|reply to|forward|post (?:it|this|that|on|to)|publish|share(?! price)|upload|e-?mail (?:me|him|her|them|it to)|text (?:him|her|them)");
const VUOLE_CANCELLARE = parole("(?:elimina|eliminare|eliminali|eliminale|cancella|cancellare|cancellali|cancellale|svuota|svuotare|butta|cestina|delete|erase|trash|wipe)(?!(?: [\\p{L}']+){0,3} (?:testo|text|filtr\\p{L}*|filters?|campo|field|ricerca|search|selezione|selection|formattazione|formatting|zoom|cronologia di ricerca))|chiudi (?:il |l')?account");
const FRENO_DELLA_PROPOSIZIONE = parole("non|no|mai|senza|nessun\\p{L}*|niente|nulla|evita|evitare|don't|dont|do not|never|not|without|avoid|no need to|come si|come faccio|come posso|how to|how do|how can|cosa succede se|what happens if|prima di|before|chiedimi|chiedi a me|ask me|quale|quali|which|what|se|solo se|if|only if|unless|a meno che|posso|can i|dovrei|should i|vorrei sapere|i wonder");
const ANNULLA_TUTTO = parole("non farlo|non eseguire|non fare niente|non fare nulla|don't do it|do not do it|dimmi solo|solo dimmi|just tell me|only tell me|senza farlo|without doing it|anzi no|non ancora|not yet|lascia stare|lascia perdere|non importa|never mind|nevermind|forget it|scherzavo|just kidding");
// «rispondi alla mail ma non inviarla»: una negazione dell'invio in QUALSIASI proposizione spegne l'invio (revisione del Desktop 04/11, V2-R1).
const NEGA_INVIO = parole("(?:non|senza|mai|evita di|don't|dont|do not|never|without) (?:\\p{L}+ ){0,2}(?:invia\\p{L}*|manda\\p{L}*|spedi\\p{L}*|inoltra\\p{L}*|pubblica\\p{L}*|send\\p{L}*|post\\p{L}*)");
const CITAZIONI = /«[^»]*»|"[^"]*"|“[^”]*”|'[^']{2,}'/gu;
const CONTENUTO_DETTATO = /((?:scrivi|scrivigli|scrivile|manda|mandagli|mandale|invia|inviagli|inviale|rispondi|rispondigli|rispondile|inoltra|di'|dì|dici|digli|dille|send|text|message|tell|reply)[^:.;!?\n]{0,80}):[^.;!?\n]*/gu;
const SEGMENTI = /[^.;:!?\n()]+[.;:!?\n()]*/gu;
const PROPOSIZIONI = /,|(?<![\p{L}\p{N}])(?:ma|però|but|then|poi|e poi|and then|invece|instead)(?![\p{L}\p{N}])/u;

/* R11 (revisione R): «cerca un volo … da prenotare», «trova delle cuffie per poterle comprare»: in una frase che CERCA, il verbo del
   pagamento dopo «da» o «per (poter…)» dice lo scopo, non chiede di pagare ora. «vai sul sito per pagare» chiede (non è una ricerca). */
const SEGMENTO_DI_RICERCA = /^(?:cerca|cercami|trova|trovami|confronta|guarda|controlla|look for|find|search|compare)(?![\p{L}\p{N}])/u;
const SCOPO_PRIMA = /(?:^|[\s,])(?:da|per(?: poter\p{L}*)?)\s*$/u;
function vuolePagare(proposizioni) {
  for (const p of proposizioni) {
    const t = String(p);
    const m = VUOLE_PAGARE.exec(t);
    if (m && !FRENO_DELLA_PROPOSIZIONE.test(t.slice(0, m.index)) && !(p.cerca && SCOPO_PRIMA.test(t.slice(0, m.index)))) return true;
  }
  return false;
}
function vuole(proposizioni, re) {
  for (const p of proposizioni) {
    const m = re.exec(p);
    if (m && !FRENO_DELLA_PROPOSIZIONE.test(p.slice(0, m.index))) return true;
  }
  return false;
}
// ---------- importi e tetto di spesa (owner 02/11: «carta alla cassa, oppure un tetto»; condizioni di Desktop, Mobile, Frontend) ----------
const SIGLA_VALUTA = Object.freeze({ '€': 'EUR', eur: 'EUR', euro: 'EUR', $: 'USD', usd: 'USD', dollari: 'USD', dollars: 'USD', '£': 'GBP', gbp: 'GBP', sterline: 'GBP', chf: 'CHF', franchi: 'CHF' });
const IMPORTO_CON_VALUTA = /(€|\$|£|(?<![\p{L}])(?:eur|usd|gbp|chf)(?![\p{L}]))\s*(\d[\d.,'\u00a0 ]*\d|\d)|(\d[\d.,'\u00a0 ]*\d|\d)\s*(€|\$|£|(?:euro|eur|usd|dollari|dollars|gbp|sterline|chf|franchi)(?![\p{L}]))/giu;
function numero(cifre) {
  const s = cifre.replace(/['\u00a0 ]/gu, '');
  const ultimaVirgola = s.lastIndexOf(','); const ultimoPunto = s.lastIndexOf('.');
  const sep = Math.max(ultimaVirgola, ultimoPunto);
  // decimale se è l'ULTIMO separatore e ha 1-2 cifre dopo; ogni altro separatore è delle migliaia
  if (sep >= 0 && s.length - sep - 1 >= 1 && s.length - sep - 1 <= 2) return Number(`${s.slice(0, sep).replace(/[.,]/gu, '')}.${s.slice(sep + 1)}`);
  return Number(s.replace(/[.,]/gu, ''));
}
/** Tutti gli importi CON valuta in un testo: [{ importo, valuta }]. Un numero senza valuta non è un importo. */
export function importiNelTesto(testo) {
  const esito = [];
  for (const m of String(testo ?? '').normalize('NFKC').matchAll(IMPORTO_CON_VALUTA)) {
    const sigla = (m[1] ?? m[4]).toLowerCase();
    const importo = numero(m[2] ?? m[3]);
    if (Number.isFinite(importo) && importo > 0 && SIGLA_VALUTA[sigla]) esito.push({ importo, valuta: SIGLA_VALUTA[sigla] });
  }
  return esito;
}
const SEGNALE_TETTO = /(?:fino a|al massimo|massimo|max|non (?:\p{L}+ ){0,2}più di|entro|tetto di|budget di|spesa massima di|up to|at most|no more than|max(?:imum)? of)\s*$/u;
/** Il tetto di spesa detto dalla PERSONA («compra le cuffie, fino a 50 €»): { importo, valuta } o null. Senza valuta non è un tetto. */
export function tettoDallaFrase(testo) {
  const t = String(testo ?? '').normalize('NFKC').toLowerCase();
  for (const m of t.matchAll(IMPORTO_CON_VALUTA)) {
    if (!SEGNALE_TETTO.test(t.slice(Math.max(0, m.index - 30), m.index))) continue;
    const [imp] = importiNelTesto(m[0]);
    if (imp) return imp;
  }
  return null;
}

/** Che cosa la persona ha chiesto di fare, letto SOLO dal suo testo. */
export function intenzioniDallaFrase(testo) {
  const nulla = { pagare: false, inviare: false, cancellare: false };
  let t;
  try { t = norma(testo); } catch { return nulla; }
  if (!t || ANNULLA_TUTTO.test(t)) return nulla;
  t = t.replace(CITAZIONI, ' '); // «il sito dice "paga ora"»: le parole citate non sono una richiesta
  t = t.replace(CONTENUTO_DETTATO, '$1'); // «manda a mamma: compra il pane»: dopo i due punti è il messaggio
  const ps = [];
  for (const [segmento] of t.matchAll(SEGMENTI)) {
    if (segmento.includes('?')) continue; // una domanda non chiede di agire
    const cerca = SEGMENTO_DI_RICERCA.test(segmento.trim());
    for (const p of segmento.split(PROPOSIZIONI)) if (p.trim()) ps.push(cerca ? Object.assign(new String(p.trim()), { cerca }) : p.trim());
  }
  return { pagare: vuolePagare(ps), inviare: vuole(ps, VUOLE_INVIARE) && !ps.some((p) => NEGA_INVIO.test(p)), cancellare: vuole(ps, VUOLE_CANCELLARE) };
}

// ---------- verifiche numeriche ----------
function luhn(cifre) {
  let somma = 0; let doppio = false;
  for (let i = cifre.length - 1; i >= 0; i -= 1) {
    let d = cifre.charCodeAt(i) - 48;
    if (doppio) { d *= 2; if (d > 9) d -= 9; }
    somma += d; doppio = !doppio;
  }
  return somma % 10 === 0;
}
/** Una carta in qualunque sequenza di cifre del testo: gruppi contigui da 13 a 19 cifre con Luhn (niente finestre a caso). */
function cartaNelTesto(testo) {
  for (const m of normaNumeri(testo).matchAll(SEQUENZE_CIFRE)) {
    const gruppi = m[0].split(NON_CIFRE);
    for (let i = 0; i < gruppi.length; i += 1) {
      let acc = '';
      for (let j = i; j < gruppi.length; j += 1) {
        acc += gruppi[j];
        if (acc.length > 19) break;
        if (acc.length >= 13 && luhn(acc)) return acc;
      }
    }
  }
  return null;
}
function mod97(iban) {
  const r = iban.slice(4) + iban.slice(0, 4);
  let resto = 0;
  for (const c of r) {
    const v = c >= 'A' && c <= 'Z' ? String(c.charCodeAt(0) - 55) : c;
    for (const d of v) resto = (resto * 10 + (d.charCodeAt(0) - 48)) % 97;
  }
  return resto === 1;
}
function ibanNelTesto(testo) {
  for (const m of normaNumeri(testo).toUpperCase().matchAll(CANDIDATO_IBAN)) {
    const s = m[0].replace(SEPARATORI_IBAN, '');
    const fissa = LUNGHEZZE_IBAN[s.slice(0, 2)];
    const lunghezze = fissa ? [fissa] : Array.from({ length: 20 }, (_, k) => 15 + k);
    for (const l of lunghezze) if (s.length >= l && mod97(s.slice(0, l))) return s.slice(0, l);
  }
  return null;
}
function entropiaPerCarattere(s) {
  const conta = new Map();
  for (const c of s) conta.set(c, (conta.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of conta.values()) { const p = n / s.length; h -= p * Math.log2(p); }
  return h;
}

// ---------- indirizzi ----------
const SOLO_ESADECIMALE = /^[0-9a-f]+$/iu;
const SOLO_CODIFICA = /^[A-Za-z0-9_\-+/=.~]+$/u;
const PEZZI_INDIRIZZO = /[/?#&=;,:+\s]+|%20/u;
const ETICHETTA_ALFANUMERICA = /^[a-z0-9-]+$/u;
const SOGLIA_CODIFICATI = 64;
const SOGLIA_LEGGIBILI_FUORI_PIANO = 200;
/** Un pezzo «codificato»: esadecimale lungo, o base64 con maiuscole, minuscole, cifre ed entropia alta. Le parole vere hanno separatori. */
function pezzoCodificato(t) {
  if (t.length >= 32 && SOLO_ESADECIMALE.test(t)) return true;
  return t.length >= 24 && SOLO_CODIFICA.test(t) && /\d/u.test(t) && /[a-z]/u.test(t) && /[A-Z]/u.test(t) && entropiaPerCarattere(t) > 3.8;
}
const etichettaDns = (e) => (e.length >= 32 && SOLO_ESADECIMALE.test(e))
  || (e.length >= 40 && ETICHETTA_ALFANUMERICA.test(e) && /\d/u.test(e) && /[a-z]/u.test(e) && entropiaPerCarattere(e) > 3.5);
const decodifica = (s) => { try { return decodeURIComponent(String(s).replace(/\+/gu, ' ')); } catch { return String(s); } };
function leggiIndirizzo(indirizzo) {
  const s = grezzo(indirizzo).normalize('NFKC').replace(INVISIBILI, '').trim();
  try { return { s, u: new URL(s) }; } catch { /* senza schema */ }
  try { return { s, u: new URL(`https://${s}`) }; } catch { return { s, u: null }; }
}
/**
 * Dati che un indirizzo porterebbe fuori: codificati in qualunque parte (host, percorso, query, frammento), oppure in chiaro (carta,
 * IBAN, email, o tanto testo leggibile) verso un dominio fuori dal piano. Torna il motivo o null.
 */
function datiInIndirizzo(indirizzo, contesto) {
  const { s, u } = leggiIndirizzo(indirizzo);
  if (u) for (const etichetta of u.hostname.split('.')) if (etichettaDns(etichetta)) return 'dati-in-indirizzo';
  const parti = u ? [u.pathname, u.search, u.hash, u.username, u.password] : [s];
  let codificati = 0;
  for (const p of parti) for (const pezzo of decodifica(p).split(PEZZI_INDIRIZZO)) for (const t of pezzo.split('.')) if (pezzoCodificato(t)) codificati += t.length;
  if (codificati >= SOGLIA_CODIFICATI) return 'dati-in-indirizzo';
  const leggibile = decodifica(u ? `${u.username} ${u.password} ${u.pathname} ${u.search} ${u.hash}` : s);
  if ((cartaNelTesto(leggibile) || ibanNelTesto(leggibile)) && !dallaPersona(leggibile, contesto)) return 'dati-in-indirizzo';
  if (u && !dominioNelPiano(contesto, u.hostname)) {
    const query = decodifica(`${u.search}${u.hash}`);
    if (EMAIL.test(query) || query.length >= SOGLIA_LEGGIBILI_FUORI_PIANO || NOME_CREDENZIALE.test(norma(query))) return 'dati-in-indirizzo';
  }
  return null;
}

// ---------- programmi (attrezzo shell del kernel: in Accesso pieno il suo cancello non chiede, quindi S1 si guarda qui) ----------
// Il riconoscimento per parole è un pavimento, non una prova: ciò che nasconde il comando (eval, codifica, nomi spezzati) non si valuta.
const PROGRAMMA_OFFUSCATO = /(?:\beval\s*\(|\bexec\s*\(|__import__|importlib|invoke-expression|(?<![\w-])iex(?![\w-])|\[scriptblock\]::create|-enc(?:odedcommand)?(?![\w-])|frombase64string|new\s+function\s*\(|getattr\s*\(|['"][\w-]{1,6}['"]\s*\+\s*['"][\w-]{1,6}['"]|-join\s*\()/iu;
const PROGRAMMA_RETE = /(?:invoke-webrequest|invoke-restmethod|(?<![\w-])(?:iwr|irm|curl|wget|nc|ncat|scp|sftp|rsync|ftp|ssh|smbclient)(?![\w-])|net\.webclient|system\.net|send-mailmessage|smtp|fetch\s*\(|https?:\/\/|requests\.|urllib|http\.client|httpx|aiohttp|socket|xmlhttprequest|axios|start-bitstransfer|upload|require\(\s*['"](?:node:)?(?:https?|http2|net|tls|dgram)['"]\s*\)|from\s+['"](?:node:)?(?:https?|http2|net|tls|dgram)['"]|\bnet\.connect|\bhttps?\.(?:request|get)\b|\\\\[\w.-]+\\|net\s+use|new-psdrive|git\s+push)/iu;
const PROGRAMMA_CANCELLA_SHELL = /(?:remove-item|(?<![\w-])(?:rm|rmdir|rd|del|erase|ri|sdelete|diskpart)(?![\w-])|clear-recyclebin|format-volume|cipher\s+\/w|clear-content|set-content[^\n]*-value\s*(?:''|""|\$null)|git\b[^\n;|&]*?\s(?:clean|reset\s+--hard)|\[system\.io\.(?:file|directory)\]::delete)/iu;
const PROGRAMMA_CANCELLA_CODICE = /(?:shutil\.rmtree|os\.remove|os\.unlink|os\.rmdir|\.unlink\s*\(|\.rmdir\s*\(|unlinksync|rmsync|rmdirsync|fs\.rm|fs\.promises\.rm|fs\.unlink|directory\.delete|file\.delete)/iu;
const PROGRAMMA_LANCIA_SHELL = /(?:os\.system|os\.popen|subprocess|child_process|\bexecsync\b|\bspawn(?:sync)?\b|start-process|shell\s*=\s*true)/iu;
function programmaCancella(linguaggio, codice) {
  const l = norma(linguaggio);
  if (PROGRAMMA_CANCELLA_CODICE.test(codice)) return true;
  // le parole brevi della shell (rm, del, rd…) contano in PowerShell, o quando un altro linguaggio lancia la shell: `del x` in Python no
  return (l !== 'python' && l !== 'node') || PROGRAMMA_LANCIA_SHELL.test(codice) ? PROGRAMMA_CANCELLA_SHELL.test(codice) : false;
}

// ---------- schermata ----------
const visibile = (el) => el !== null && typeof el === 'object' && el.visibile !== false;
const haStato = (el, s) => (Array.isArray(el?.stato) ? el.stato.map(normaLeggera).includes(s) : normaLeggera(el?.stato).split(/[\s,]+/u).includes(s));
const eModale = (el) => el?.ruolo === 'finestra' && (el.modale === true || haStato(el, 'modale') || haStato(el, 'modal'));
const testoElemento = (el) => normaLeggera(`${grezzo(el?.nome)} ${grezzo(el?.valore)}`);

/** Le finestre della schermata, lette UNA volta per chiamata: modali, titoli, testi per finestra (niente costo modali × elementi). */
function leggiFinestre(elementi) {
  const modali = new Map(); const titoli = []; const testiPer = new Map();
  for (const el of elementi) {
    if (!visibile(el)) continue;
    if (el.ruolo === 'finestra') { titoli.push({ ref: el.ref, testo: testoElemento(el), grezzo: grezzo(el.nome) }); if (eModale(el)) modali.set(el.ref, el); }
    if (el.finestra != null) { const t = testoElemento(el); const a = testiPer.get(el.finestra); if (a) a.push(t); else testiPer.set(el.finestra, [t]); }
  }
  return { modali, titoli, testiPer };
}
/** Testi della finestra MODALE che conta: quella del bersaglio se si sa, altrimenti ogni finestra modale aperta. Nessuna modale ⇒ nulla. */
function testiDelDialogo(bersaglio, f) {
  if (f.modali.size === 0) return [];
  const dove = bersaglio?.finestra;
  const refs = dove != null && f.modali.has(dove) ? [dove] : [...f.modali.keys()];
  const testi = [];
  for (const r of refs) { testi.push(testoElemento(f.modali.get(r))); for (const t of f.testiPer.get(r) ?? []) testi.push(t); }
  return testi;
}
const dentroModale = (bersaglio, f) => bersaglio?.finestra != null && f.modali.has(bersaglio.finestra);

// Spia economica (una regex senza sguardi indietro) prima delle due complete: tiene il p95 sotto 1 ms su una schermata nuova.
const SPIA_ANTI_ROBOT = /robot|human|umano|captcha|turnstile|arkose|geetest|datadome|hold|premuto|immagini|images|squares|caselle|verif|traffic|sicurezza|security/u;
function controlloAntiRobot(elementi) {
  for (const el of elementi) {
    if (!visibile(el)) continue;
    const origine = grezzo(el.origine);
    if (origine && ANTI_ROBOT_INVISIBILE.test(origine)) continue;
    if (origine && ANTI_ROBOT_ORIGINE.test(origine)) return origine.slice(0, 80);
    if (el.ruolo === 'collegamento') continue;
    if (!SPIA_ANTI_ROBOT.test(`${grezzo(el.nome)} ${grezzo(el.valore)}`.replace(INVISIBILI, '').toLowerCase())) continue;
    const testo = testoElemento(el);
    if (!el.inLista && ANTI_ROBOT_FRASI.test(testo)) return testo.slice(0, 80); // `inLista`: vero o l'id della lista (telefono)
    if (!RUOLI_NON_WIDGET.has(el.ruolo) && ANTI_ROBOT_PRODOTTI.test(testo)) return testo.slice(0, 80);
  }
  return null;
}
/** I CAMPI della carta a schermo (numero, CVV, autocomplete cc-*, scadenza accanto a un altro campo della carta). */
function campiDellaCarta(elementi) {
  let scadenza = false; let altroCampoCarta = false;
  for (const el of elementi) {
    if (!visibile(el) || el.ruolo !== 'campo') continue;
    if (grezzo(el.segnali?.autocomplete).toLowerCase().split(/\s+/u).some((t) => t.startsWith('cc-'))) return true;
    const n = norma(el.nome);
    if (CAMPO_CARTA.test(n) || scrittureMiste(n, el.nome)) return true;
    if (CAMPO_SCADENZA.test(n)) scadenza = true; else if (CAMPO_CARTA_DEBOLE.test(n)) altroCampoCarta = true;
  }
  return scadenza && altroCampoCarta;
}
/** Il TITOLO della finestra (o della modale del bersaglio) dice cassa. */
function titoloDiCassa(bersaglio, schermata, f) {
  const titoli = bersaglio?.finestra != null ? f.titoli.filter((t) => t.ref === bersaglio.finestra) : f.titoli;
  const titolo = norma(schermata?.titolo);
  return titoli.some((t) => { const n = norma(t.grezzo); return TITOLO_CASSA.test(n) || scrittureMiste(n, t.grezzo); }) || TITOLO_CASSA.test(titolo) || scrittureMiste(titolo, schermata?.titolo);
}
/**
 * Pagina di cassa per la PROTEZIONE «pagamento» (condizione del Mobile): dai CAMPI della carta o dal TITOLO della finestra, mai dal
 * testo di messaggi o liste. Invariata con la decisione 145: il restringimento vale solo per la guardia (`ragioneDellaCassa`).
 */
function paginaDiCassa(bersaglio, elementi, schermata, f) {
  return campiDellaCarta(elementi) || titoloDiCassa(bersaglio, schermata, f);
}
// Il TOTALE FINALE etichettato a schermo (tetto di spesa, carta della cassa, guardia): un'etichetta «Totale» con un importo solo, e un
// totale solo; altrimenti null. Spostato qui da ciclo.mjs (04/11, identico) perché la guardia lo legge per riconoscere la cassa.
const ETICHETTA_TOTALE = /(?<![\p{L}])(?:totale(?: ordine| da pagare)?|total|importo da pagare|da pagare|amount due|order total|grand total)(?![\p{L}])/iu;
const testiDellaSchermata = (s) => [s?.titolo, ...(Array.isArray(s?.elementi) ? s.elementi : []).map((e) => e?.nome)].filter((x) => typeof x === 'string');
export function totaleFinale(s) {
  const visti = new Map();
  for (const t of testiDellaSchermata(s)) {
    if (!ETICHETTA_TOTALE.test(t)) continue;
    const imp = importiNelTesto(t);
    if (imp.length !== 1) return null; // un'etichetta «Totale» con due importi non si capisce: carta
    visti.set(`${imp[0].importo}|${imp[0].valuta}`, imp[0]);
  }
  return visti.size === 1 ? [...visti.values()][0] : null; // nessun totale, o due totali diversi: carta
}
/** Un tasto che paga, visibile e che conferma (non un campo, un collegamento o un testo). */
const tastoPaga = (elementi) => elementi.some((el) => visibile(el) && !RUOLI_NON_CONFERMA.has(el.ruolo) && pagamentoForte(norma(el.nome)));
/**
 * Perché la schermata è una cassa PER LA GUARDIA (decisione 145, owner 04/11): 'campi' (i campi della carta), 'titolo-totale-paga'
 * (titolo di cassa + totale finale etichettato + tasto che paga), 'errore' (la lettura fallisce: chi non riesce a valutare nega);
 * null = non è una cassa. Un titolo da solo, o un titolo col solo totale o col solo tasto, non basta più.
 */
export function ragioneDellaCassa(schermata) {
  const elementi = Array.isArray(schermata?.elementi) ? schermata.elementi : [];
  if (elementi.length === 0 && !schermata?.titolo) return null;
  try {
    if (campiDellaCarta(elementi)) return 'campi';
    return titoloDiCassa(null, schermata, leggiFinestre(elementi)) && totaleFinale(schermata) !== null && tastoPaga(elementi) ? 'titolo-totale-paga' : null;
  } catch { return 'errore'; }
}
/** La schermata è una pagina di cassa per la guardia (D7, ristretta dalla decisione 145)? */
export function eUnaCassa(schermata) { return ragioneDellaCassa(schermata) !== null; }
function prezzoAccanto(bersaglio, elementi, f) {
  const dove = bersaglio?.finestra;
  const testi = dove != null ? (f.testiPer.get(dove) ?? []) : elementi.filter(visibile).map(testoElemento);
  return testi.some((t) => PREZZO.test(t));
}

function autocompleteSensibile(v) {
  for (const t of grezzo(v).toLowerCase().split(/\s+/u)) if (AUTOCOMPLETE_SENSIBILI.has(t) || t.startsWith('cc-')) return true;
  return false;
}
/** Segreto dalla STRUTTURA del campo (password, codice monouso, carta…), non dal suo nome. */
function campoSegretoStrutturale(bersaglio) {
  const s = bersaglio?.segnali ?? {};
  return s.isPassword === true || norma(s.type) === 'password' || autocompleteSensibile(s.autocomplete) || INPUT_TYPE_PASSWORD.test(grezzo(s.inputType))
    || bersaglio?.sensibile === true;
}
function campoSensibile(bersaglio) {
  return campoSegretoStrutturale(bersaglio) || NOME_CREDENZIALE.test(norma(bersaglio?.nome));
}
/** Un campo che si chiama «IBAN» e riceve SOLO un IBAN valido: la prova è l'IBAN, non un segreto qualunque (owner 02/11, telefono). */
const NOME_IBAN = /\biban\b/u;
function soloIbanInCampoIban(bersaglio, testo) {
  if (campoSegretoStrutturale(bersaglio) || !NOME_IBAN.test(norma(bersaglio?.nome))) return false;
  const t = normaNumeri(testo).toUpperCase().replace(SEPARATORI_IBAN, '');
  return ibanNelTesto(t) === t; // il testo intero, senza separatori, È un IBAN valido: niente prima, niente dopo
}
/** Il testo scritto viene dalle parole della persona (es. «bonifica a IT60…»)? Allora non è un segreto inventato dal modello. */
function dallaPersona(testo, contesto) {
  const p = contesto?.testoDellaPersona;
  if (typeof p !== 'string' || !p) return false;
  const a = norma(testo).replace(NON_ALFANUMERICI, '');
  return a.length >= 8 && norma(p).replace(NON_ALFANUMERICI, '').includes(a);
}

/** Pulsante, voce o conferma da tastiera su un bersaglio: le stesse regole, qualunque sia il gesto. */
function riconosciConferma(bersaglio, elementi, schermata, f, viaTastiera, extra = '') {
  const nome = norma(bersaglio?.nome ?? '');
  const ruolo = bersaglio?.ruolo;
  const prova = nome.slice(0, 80);
  const conValore = extra ? `${nome} ${norma(extra)}` : nome;
  if (scrittureMiste(conValore, [bersaglio?.nome ?? '', ' ', extra])) return { ...nonValutabile('scritture-miste'), testo: String(bersaglio?.nome || extra || '') };
  // C2: anche Invio o Spazio col fuoco SUL pulsante del banner danno il consenso; Invio in un campo accanto al banner no
  // R3 (revisione R): Invio su un COLLEGAMENTO lo attiva come il clic, quindi anche «Accetta tutto» fatto a link
  if (!viaTastiera || ruolo === 'collegamento' || !RUOLI_NON_CONFERMA.has(ruolo)) {
    // il cookie si legge dal banner (la finestra del bersaglio, o un testo non collegamento), non dal «Cookie policy» del piè di pagina
    const testiCookie = bersaglio?.finestra != null ? (f.testiPer.get(bersaglio.finestra) ?? []) : elementi.filter((el) => visibile(el) && el.ruolo !== 'collegamento').map(testoElemento);
    if (COOKIE_SPECIFICO.test(nome) || (ACCETTA_GENERICO.test(nome) && testiCookie.some((t) => MENZIONA_COOKIE.test(t) && BANNER_COOKIE.test(t)))) return { protezione: 'consenso', motivo: 'cookie', prova };
    if (PERMESSO_NOME.test(nome)) return { protezione: 'consenso', motivo: 'permesso', prova };
  }
  if (NOME_USCITA_DIALOGO.test(nome)) return null; // uscire è sempre permesso
  if (NOME_CANCELLAZIONE.test(conValore)) return { protezione: 'cancellazione', motivo: 'pulsante', prova };
  if (pagamentoForte(conValore)) return { protezione: 'pagamento', motivo: viaTastiera ? 'tasti' : 'pulsante', prova };
  const conferma = !RUOLI_NON_CONFERMA.has(ruolo);
  // in cassa OGNI conferma che non sia un'uscita è un pagamento (anche «Conferma», «Continua», «Prenota», un nome vuoto, Invio)
  if ((conferma || viaTastiera) && paginaDiCassa(bersaglio, elementi, schermata, f)) return { protezione: 'pagamento', motivo: 'conferma-in-cassa', prova };
  // un campo «Importo» accanto: «Invia», «Conferma», «Continua» spostano denaro (bonifici, ricariche, app di pagamento)
  if ((conferma || viaTastiera) && CONFERMA_GENERICA.test(nome) && elementi.some((el) => visibile(el) && el.ruolo === 'campo' && CAMPO_IMPORTO.test(norma(el.nome)))) {
    return { protezione: 'pagamento', motivo: 'conferma-con-importo', prova };
  }
  if (conferma && ORDINA_DEBOLE.test(conValore) && dentroModale(bersaglio, f)) return { protezione: 'pagamento', motivo: 'pulsante-in-finestra', prova };
  if (conferma && PAGAMENTO_DEBOLE.test(conValore) && (prezzoAccanto(bersaglio, elementi, f) || dentroModale(bersaglio, f))) {
    return { protezione: 'pagamento', motivo: 'pulsante-con-prezzo', prova };
  }
  if (ruolo === 'casella' || ruolo === 'interruttore') {
    const etichetta = nome || norma(bersaglio?.etichetta ?? bersaglio?.descrizione ?? '');
    if (NOME_MARKETING.test(etichetta)) return { protezione: 'consenso', motivo: 'marketing', prova: etichetta.slice(0, 80) };
    if (NOME_TERMINI_CASELLA.test(etichetta)) return { protezione: 'consenso', motivo: 'termini', prova: etichetta.slice(0, 80) };
    if (!etichetta) {
      const vicino = testiDelDialogo(bersaglio, f).concat(elementi.filter(visibile).map(testoElemento)).find((t) => NOME_TERMINI_CASELLA.test(t));
      if (vicino) return { protezione: 'consenso', motivo: 'termini', prova: vicino.slice(0, 80) };
    }
  } else if (conferma && NOME_TERMINI_PULSANTE.test(nome)) return { protezione: 'consenso', motivo: 'termini', prova };
  // N1: su un collegamento decide solo `invioDaCollegamento`, al clic come con Invio (C7)
  if (ruolo === 'collegamento') {
    if (invioDaCollegamentoGrezzo(nome, bersaglio?.nome)) return { protezione: 'invio', motivo: viaTastiera ? 'tasti' : 'pulsante', prova };
  } else if ((conferma || viaTastiera) && INVIO_FORTE.test(conValore)) return { protezione: 'invio', motivo: viaTastiera ? 'tasti' : 'pulsante', prova };
  if (conferma && INVIO_DEBOLE.test(conValore) && dentroModale(bersaglio, f)) return { protezione: 'invio', motivo: 'pulsante-in-finestra', prova };
  // nel corpo di una mail («Corpo del messaggio», «Message body») Invio va a capo: il «messaggio» del nome non lo fa una chat (M-C)
  // N1 e N9: un collegamento, un pulsante, una voce o una scheda col fuoco si attivano con Invio come col clic: «Rispondi», «Commenti»
  // o «Elimina messaggio» lì non sono un campo di chat
  if (viaTastiera && !SI_PREMONO.has(ruolo) && CAMPO_CHAT.test(nome) && !CORPO_A_PIU_RIGHE.test(nome)) return { protezione: 'invio', motivo: 'tasti-in-campo-chat', prova };
  const irreversibile = dialogoIrreversibile(nome, bersaglio, f);
  if (irreversibile) return irreversibile;
  // Decisioni 167 e 170: «Elimina», «Delete», «Rimuovi» nudi (anche a link) dentro una finestra di conferma modale sono una cancellazione
  if (f.eliminaNudo && (conferma || ruolo === 'collegamento') && eliminaNudo(nome) && dentroModale(bersaglio, f)) return { protezione: 'cancellazione', motivo: 'pulsante-in-finestra', prova };
  return null;
}
/** Dentro una finestra modale che parla di qualcosa di irreversibile, ogni conferma è una cancellazione; uscire («Annulla») no. */
function dialogoIrreversibile(nome, bersaglio, f) {
  if (NOME_USCITA_DIALOGO.test(nome)) return null;
  for (const t of testiDelDialogo(bersaglio, f)) if (TESTO_IRREVERSIBILE.test(t)) return { protezione: 'cancellazione', motivo: 'dialogo', prova: t.slice(0, 80) };
  return null;
}
/* Terzo giro, T-R4 e N5 (05/11): Invio in un campo di testo invia il modulo, cioè preme il suo pulsante predefinito (WHATWG HTML,
   «Implicit submission»: «the user agent must fire a click event at the form's default button», il primo pulsante d'invio; letto il
   05/11/2026). L'albero non dice quale modulo né quale pulsante sia il predefinito: si guarda ogni PULSANTE attivo e visibile della
   stessa finestra del campo (un collegamento non è mai il pulsante predefinito) e decide il più forte fra pagamento, cancellazione e
   invio, letto come al clic. Fuori: i campi di chat (hanno la loro lettura), quelli a più righe (Invio va a capo), la barra degli
   indirizzi e le ricerche (Invio cerca o naviga). Claude Code lo dice per i campi web (`CHANGELOG.md:681`, Invio invia); Hermes chiede
   per tipo d'azione e non guarda il modulo (`tools/computer_use/tool.py:338-343`). */
const NOME_RICERCA = parole("cerca|ricerca|search|suche|suchen|rechercher|recherche|buscar|búsqueda|pesquisar|pesquisa|filtra|filter");
const FORZA_NEL_MODULO = Object.freeze({ pagamento: 3, cancellazione: 2, invio: 1 });
function invioImplicito(bersaglio, elementi, schermata, f) {
  if (bersaglio?.ruolo !== 'campo') return null;
  const nome = norma(bersaglio.nome ?? '');
  if (CAMPO_CHAT.test(nome) || CORPO_A_PIU_RIGHE.test(nome) || CAMPO_INDIRIZZO.test(nome) || NOME_RICERCA.test(nome)) return null;
  const finestra = bersaglio.finestra ?? null;
  let scelto = null;
  for (const el of elementi) {
    if (!visibile(el) || el.ruolo !== 'pulsante' || el.stato?.attivo === false || (el.finestra ?? null) !== finestra) continue;
    const r = riconosciConferma(el, elementi, schermata, f, false);
    if ((FORZA_NEL_MODULO[r?.protezione] ?? 0) > (FORZA_NEL_MODULO[scelto?.protezione] ?? 0)) scelto = { protezione: r.protezione, motivo: 'invio-implicito', prova: r.prova };
  }
  return scelto;
}
/** Invio (o un a capo scritto) sul bersaglio: la sua lettura come conferma, e per un campo il modulo che invia. */
const confermaDaInvio = (bersaglio, elementi, schermata, f) => riconosciConferma(bersaglio, elementi, schermata, f, true) ?? invioImplicito(bersaglio, elementi, schermata, f);

// ---------- riconoscimento: quale protezione scatta, con quale motivo e quale prova ----------
function nonValutabile(prova) { return { protezione: null, motivo: NON_VALUTABILE, prova }; }
const senzaBersaglio = (b) => b === null || typeof b !== 'object' || Array.isArray(b);

function riconosci(azione, bersaglio, schermata, contesto, tipiAmmessi, eliminaNudoInFinestra = false) {
  if (azione === null || typeof azione !== 'object') return nonValutabile('azione-mancante');
  const tipo = azione.tipo;
  if (!tipiAmmessi.includes(tipo)) return nonValutabile('tipo-fuori-vocabolario');
  if (schermata === null || typeof schermata !== 'object' || Array.isArray(schermata)) return nonValutabile('schermata-malformata');
  if (schermata.elementi != null && !Array.isArray(schermata.elementi)) return nonValutabile('schermata-malformata');
  const elementi = schermata.elementi ?? [];
  const tasti = tipo === 'tasti' ? insiemeTasti(azione.combinazione) : null;

  // anti-robot: vale per ogni azione che tocca la pagina, NON per quelle che se ne allontanano (rilievo del Mobile)
  const siAllontana = tipo === 'aspetta' || tipo === 'chiedi_persona' || tipo === 'fine' || tipo === 'scorri' || tipo === 'zoom'
    || tipo === 'sistema' || tipo === 'apri' || (tasti !== null && eUscitaTastiera(tasti));
  if (!siAllontana) {
    const prova = controlloAntiRobot(elementi);
    if (prova !== null) return { protezione: 'anti-robot', motivo: 'controllo-visibile', prova };
  }
  const f = leggiFinestre(elementi);
  f.eliminaNudo = eliminaNudoInFinestra; // decisione 170: la regola dell'«Elimina» nudo la accende la politica

  switch (tipo) {
    case 'scrivi': {
      if (senzaBersaglio(bersaglio)) return nonValutabile('bersaglio-mancante'); // il ciclo passa l'elemento col fuoco
      if (!['string', 'number'].includes(typeof azione.testo) && !Array.isArray(azione.testo)) return nonValutabile('testo-malformato');
      const t = grezzo(azione.testo);
      // «Numero ordine», «Tracking»: 16 cifre lì non sono una carta; ma solo nel campo d'identificativo e senza altre parole (C6)
      const campoNumerico = NOME_IDENTIFICATIVO.test(norma(bersaglio.nome).trim()) && SOLO_CIFRE_E_SEPARATORI.test(t.normalize('NFKC'));
      const tn = t.normalize('NFKC');
      const resto = tn.replace(SEGNAPOSTO, ' ');
      const conSegnaposto = resto !== tn;
      let r = null;
      if (SOLO_SEGNAPOSTI.test(tn)) r = { protezione: 'credenziale', motivo: 'portachiavi', prova: campoSensibile(bersaglio) ? 'campo' : 'segnaposto' };
      else if (campoSensibile(bersaglio)) {
        r = { protezione: 'credenziale', motivo: conSegnaposto ? 'segreto-misto' : 'campo-sensibile', prova: !conSegnaposto && soloIbanInCampoIban(bersaglio, tn) ? 'iban' : 'campo' };
      }
      else if (!campoNumerico && cartaNelTesto(resto)) r ={ protezione: 'credenziale', motivo: 'testo-carta', prova: 'luhn' };
      else if (ibanNelTesto(resto)) r = { protezione: 'credenziale', motivo: 'testo-iban', prova: 'iban' };
      else if (conSegnaposto) r = { protezione: 'credenziale', motivo: 'segreto-misto', prova: 'segnaposto' };
      else if (SOLO_CODICE.test(tn.replace(SPAZI, '')) && NOME_CODICE.test(norma(bersaglio.nome)) && !NON_E_UN_CODICE.test(norma(bersaglio.nome))) r = { protezione: 'credenziale', motivo: 'codice', prova: 'codice' };
      if (r) {
        if (r.motivo !== 'portachiavi' && r.motivo !== 'segreto-misto' && dallaPersona(t, contesto)) r.motivo = 'testo-della-persona';
        return r;
      }
      if (CAMPO_INDIRIZZO.test(norma(bersaglio.nome))) {
        const m = datiInIndirizzo(t.trim(), contesto);
        if (m) return { protezione: 'invio', motivo: m, prova: 'indirizzo' };
      }
      // un a capo invia come il tasto Invio (in chat, o in cassa), in fondo come in mezzo: scrivere «ciao\nsì» in una chat sono due invii (C2);
      // in mezzo al testo di un campo a più righe («Corpo del messaggio» di un'email, una nota, PROT-29) è solo una riga nuova
      if (A_CAPO_IN_FONDO.test(t) || (A_CAPO_IN_MEZZO.test(t) && !aCapoAmmesso(bersaglio, schermata))) return confermaDaInvio(bersaglio, elementi, schermata, f);
      return null;
    }
    case 'tasti': {
      if (eShiftCanc(tasti)) {
        const sostitutiva = { tipo: 'tasti', combinazione: 'delete' };
        if (azione.ripeti != null) sostitutiva.ripeti = azione.ripeti;
        return { protezione: 'cancellazione', motivo: 'tasti', prova: [...tasti].join('+'), sostitutiva };
      }
      if (tasti.size === 0 || [...tasti].some((t) => t.startsWith('[object'))) return nonValutabile('combinazione-malformata');
      if (eUscitaTastiera(tasti) || soloSpostamento(tasti)) return null;
      if (!senzaBersaglio(bersaglio) && campoSensibile(bersaglio)) {
        return { protezione: 'credenziale', motivo: eIncolla(tasti) ? 'incolla' : 'tasti-in-campo-sensibile', prova: [...tasti].join('+') };
      }
      if ((tasti.has('enter') || tasti.has('space')) && [...tasti].some(tastoCheScrive)) return nonValutabile('combinazione-malformata'); // M2
      if (eConfermaTastiera(tasti)) {
        if (senzaBersaglio(bersaglio)) return dialogoIrreversibile('', null, f) ?? nonValutabile('bersaglio-mancante');
        // lo spazio in un campo scrive uno spazio: il modulo lo invia solo Invio
        const r = tasti.has('enter') ? confermaDaInvio(bersaglio, elementi, schermata, f) : riconosciConferma(bersaglio, elementi, schermata, f, true);
        if (r) return r;
        return eInvioTastiera(tasti) ? { protezione: 'invio', motivo: 'tasti-invio', prova: [...tasti].join('+') } : null;
      }
      // «s», «y», spazio dentro un dialogo irreversibile: rispondono «sì»
      if (tastoSingolo(tasti)) return dialogoIrreversibile('', senzaBersaglio(bersaglio) ? null : bersaglio, f);
      return null;
    }
    case 'apri': {
      const m = azione.indirizzo != null ? datiInIndirizzo(azione.indirizzo, contesto) : null;
      return m ? { protezione: 'invio', motivo: m, prova: 'indirizzo' } : null;
    }
    case 'premi': case 'scegli': case 'clic': {
      if (senzaBersaglio(bersaglio)) return nonValutabile('bersaglio-mancante');
      if (azione.uscita === true) return { protezione: 'invio', motivo: 'azione-di-uscita', prova: norma(bersaglio.nome).slice(0, 80) };
      // riempimento automatico del browser: una voce con cifre mascherate o dei pallini è un segreto salvato
      const voce = norma(`${grezzo(bersaglio.nome)} ${grezzo(azione.valore)}`);
      if (CIFRE_MASCHERATE.test(voce)) return { protezione: 'credenziale', motivo: 'riempimento-automatico', prova: voce.slice(0, 80) };
      if (bersaglio.ruolo === 'campo') {
        // mettere a fuoco non invia; ma un «Paga ora» esposto come campo resta un pagamento (il ruolo lo sceglie la pagina)
        const n = norma(bersaglio.nome);
        if (pagamentoForte(n)) return { protezione: 'pagamento', motivo: 'pulsante', prova: n.slice(0, 80) };
        // C7: anche «Elimina definitivamente» e un comando d'invio esposti come campo restano quello che sono
        if (NOME_CANCELLAZIONE.test(n)) return { protezione: 'cancellazione', motivo: 'pulsante', prova: n.slice(0, 80) };
        if (INVIO_COMANDO.test(n.trim())) return { protezione: 'invio', motivo: 'pulsante', prova: n.slice(0, 80) };
        return dialogoIrreversibile(n, bersaglio, f);
      }
      return riconosciConferma(bersaglio, elementi, schermata, f, false, tipo === 'scegli' ? grezzo(azione.valore) : '');
    }
    case 'trascina': {
      if (senzaBersaglio(bersaglio)) return nonValutabile('bersaglio-mancante');
      const nome = norma(bersaglio.nome);
      if (DESTINAZIONE_CARICAMENTO.test(nome) || INVIO_FORTE.test(nome)) return { protezione: 'invio', motivo: 'trascina-caricamento', prova: nome.slice(0, 80) };
      return null;
    }
    case 'programma': {
      const codice = grezzo(azione.codice);
      if (PROGRAMMA_OFFUSCATO.test(codice)) return nonValutabile('programma-offuscato');
      if (PROGRAMMA_RETE.test(codice)) return { protezione: 'invio', motivo: 'programma-rete', prova: 'programma' };
      if (programmaCancella(azione.linguaggio, codice)) return { protezione: 'cancellazione', motivo: 'programma', prova: 'programma' };
      return null;
    }
    default: return null; // hover, scorri, zoom, aspetta, sistema, chiedi_persona, fine: nessuna protezione oltre l'anti-robot
  }
}

// ---------- politiche (argomento; tabella CONTRATTI v2 §6) ----------
const SUFFISSI_PUBBLICI = new Set(['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'com.au', 'net.au', 'org.au', 'co.jp', 'co.nz', 'com.br', 'com.ar', 'com.mx', 'co.in', 'com.cn', 'com.tr', 'co.za', 'com.sg', 'gov.it', 'edu.it', 'co.it',
  'github.io', 'gitlab.io', 'blogspot.com', 'netlify.app', 'vercel.app', 'pages.dev', 'workers.dev', 'herokuapp.com', 'web.app', 'firebaseapp.com', 'azurewebsites.net', 'cloudfront.net', 's3.amazonaws.com', 'appspot.com',
  'wordpress.com', 'wixsite.com', 'glitch.me', 'repl.co', 'onrender.com', 'fly.dev', 'ngrok.io', 'ngrok-free.app', 'trycloudflare.com', 'duckdns.org', 'no-ip.org',
  // R8b (revisione R): Public Suffix List, VERSION 2026-11-04_14-48-28_UTC (sezione PRIVATE); github.dev, blogspot.it e weebly.com non ci
  // sono ma ospitano siti di chiunque sotto di sé
  'myshopify.com', 'altervista.org', 'r2.dev', 'github.dev', 'surge.sh', 'ondigitalocean.app', 'azurestaticapps.net', 'blogspot.it', 'framer.website',
  'webflow.io', 'square.site', 'carrd.co', 'replit.app', 'weebly.com']);
const SECONDO_LIVELLO_GENERICO = /^(?:co|com|net|org|gov|edu|ac|ne|or|go|mil)\.[a-z]{2}$/u;
export function dominioValido(x) {
  const d = String(x ?? '').toLowerCase().replace(/\.$/u, '');
  return d.includes('.') && !SUFFISSI_PUBBLICI.has(d) && !SECONDO_LIVELLO_GENERICO.test(d) ? d : null;
}
/** C10 (revisione PR19): `dominio` è `sito` o un suo sottodominio, e `sito` non è un suffisso pubblico («github.io», «co.uk», «com»).
 *  Un solo confronto per le protezioni e per il ciclo (piano, tetto, luoghi ricordati). */
export function dominioSotto(dominio, sito) {
  const d = String(dominio ?? '').toLowerCase().replace(/\.$/u, '');
  const v = dominioValido(sito);
  return Boolean(d) && v !== null && (d === v || d.endsWith(`.${v}`));
}
function dominioNelPiano(contesto, dominio) {
  const domini = Array.isArray(contesto?.piano?.domini) ? contesto.piano.domini : [];
  return domini.some((x) => dominioSotto(dominio, x));
}
// un dominio ostile che lancia dentro la politica finisce nel try di valutaAzione attorno a `decidi` ⇒ ferma
const nelPiano = (contesto, schermata) => dominioNelPiano(contesto, schermata?.dominio);
/** I luoghi del compito come li mostra la carta iniziale: i domini del piano e, per una finestra senza dominio, le app del piano. */
function nelLuoghiDelCompito(contesto, schermata) {
  if (nelPiano(contesto, schermata)) return true;
  const app = typeof schermata?.app === 'string' ? schermata.app : '';
  return !schermata?.dominio && app !== '' && Array.isArray(contesto?.piano?.app) && contesto.piano.app.includes(app);
}
const sospetto = (c) => Boolean(c?.sospetto);
const richiesto = (c, cosa) => c?.richiesta?.[cosa] === true && !sospetto(c);
const segretoLegittimo = (r) => r.motivo === 'portachiavi' || r.motivo === 'testo-della-persona';
const riservata = (r) => r.motivo === 'cookie' || r.motivo === 'permesso' || r.motivo === 'marketing';

/* S-5 (decisione 146, owner 04/11): sul PC un pulsante a scritture miste chiede invece di fermare. Carta «Non riesco a leggere bene
   questo pulsante: lo premo?»; il sì vale per quel pulsante solo, due «no» o nessuna risposta fermano (ciclo.mjs). Il telefono resta
   a 'ferma' fino alla cura del pilota del Mobile (SIC-01). Ogni altro non valutabile resta a `nonValutabile`. Per prova si ammettono
   solo 'chiedi' e 'ferma': un valore fuori elenco ferma. Come Gemini computer use (agent.py:557-573, sì o no, un no chiude) e il
   revisore di Codex (policy_template.md:74, si nega e la persona riapprova «after seeing the concrete risk»). */
const CARTA_PER_LE_MISTE = Object.freeze({ 'scritture-miste': 'chiedi' });
const PER_PROVA_AMMESSE = Object.freeze(['chiedi', 'ferma']);
const TESTO_CARTA_MAX = 80;
/** Testo della carta (il nome letto, fino a 80 code unit senza spezzare una coppia surrogata) e indici, in code unit, delle lettere
 *  di un'altra scrittura: sono quelle da evidenziare. Un nome arriva qui solo se ha lettere latine (scrittureMiste lo richiede). */
function testoDellaCarta(nome) {
  const crudo = typeof nome === 'string' ? nome : '';
  let fine = Math.min(crudo.length, TESTO_CARTA_MAX);
  if (fine < crudo.length) { const u = crudo.charCodeAt(fine - 1); if (u >= 0xD800 && u <= 0xDBFF) fine -= 1; }
  const testo = crudo.slice(0, fine);
  const strane = [];
  for (let i = 0; i < testo.length; i += passoClasse) if (classeIn(testo, i) & (K_ALTRA | K_CJK)) strane.push(i);
  return { testo, strane };
}

/** Ogni politica: nome, piattaforma, decidi(riconosciuto, contesto, schermata) → decisione, e cosa fare quando non si può valutare. */
export const POLITICHE = Object.freeze({
  pcAccessoPieno: Object.freeze({
    nome: 'pc-accesso-pieno',
    eliminaNudoInFinestra: true, // decisioni 167 e 170
    piattaforma: 'pc',
    nonValutabile: 'ferma',
    nonValutabilePer: CARTA_PER_LE_MISTE,
    /* Decisione 159 (owner 04/11, supera in parte la 156): in Accesso pieno fermano SOLO l'invio col sospetto acceso, la credenziale in
       chiaro (non dal portachiavi né dal riempimento automatico) e l'anti-robot; il pagamento fa UNA carta (il sì vale per il totale
       mostrato, C4, e il ponte T9 lo porta alla conferma della pagina dopo); il resto passa e si segna. Come la modalità YOLO di Hermes
       (`tools/computer_use/tool.py:145-153`: niente domande a ogni azione) ma con i blocchi che nessuna approvazione toglie
       (`tool.py:41`). Il non valutabile resta 'ferma': la carta non saprebbe dire cosa fa l'azione, e il modello può rimandarla ben
       formata; le scritture miste restano la carta S-5. */
    decidi(r, c, s) {
      switch (r.protezione) {
        case 'credenziale':
          /* Decisione 169 (owner 04/11 18:16, reperto N2): il riempimento automatico (carta salvata, password del browser) fuori dai luoghi
             del compito chiede con una carta; dentro passa e si segna. Una pagina civetta raggiunta da un risultato di ricerca non riceve
             la carta salvata senza che la persona lo veda. Col sospetto resta 'ferma'. */
          if (r.motivo === 'riempimento-automatico') return sospetto(c) ? 'ferma' : (nelLuoghiDelCompito(c, s) ? 'procedi-e-segna' : 'chiedi');
          // «Invio» o Tab in un campo password già riempito non scrive un segreto; un incolla sì, e non si sa da dove viene
          if (segretoLegittimo(r) || r.motivo === 'tasti-in-campo-sensibile') return sospetto(c) ? 'ferma' : 'procedi-e-segna';
          return 'ferma';
        case 'consenso': return riservata(r) ? 'scegli-riservato' : (sospetto(c) ? 'chiedi' : 'procedi-e-segna');
        case 'anti-robot': return 'ferma';
        case 'cancellazione':
          if (sospetto(c)) return 'chiedi';
          return r.sostitutiva ? 'riscrivi' : 'procedi-e-segna'; // Maiusc+Canc diventa Canc: nel cestino, recuperabile
        case 'pagamento': return 'chiedi'; // chiesto e dentro il tetto di spesa il ciclo lo fa passare (ciclo.mjs, tetto)
        case 'invio':
          if (sospetto(c)) return 'ferma';
          return richiesto(c, 'inviare') ? 'procedi' : 'procedi-e-segna';
        default: return 'ferma';
      }
    },
  }),
  /* Decisione 239 (owner 05/11, R1 della revisione del terzo giro): nel luogo ricordato con «Consenti sempre» salta la carta SOLO la
     cancellazione chiesta dalla persona (decisione 149). Tutto il resto è il permesso Normale: il segreto del portachiavi, quello dettato
     dalla persona, il consenso sul dominio del piano, il pagamento e l'invio chiedono, e ciò che non si valuta chiede (non ferma). */
  pcConsentiSempre: Object.freeze({
    nome: 'pc-consenti-sempre',
    eliminaNudoInFinestra: true, // decisioni 167 e 170
    piattaforma: 'pc',
    nonValutabile: 'chiedi',
    decidi(r, c) {
      switch (r.protezione) {
        // decisione 149 (owner 04/11, C9 della revisione PR19): chiesta procede (Shift+Canc diventa Canc, nel cestino); non chiesta o col sospetto chiede
        case 'cancellazione': return richiesto(c, 'cancellare') ? (r.sostitutiva ? 'riscrivi' : 'procedi') : 'chiedi';
        case 'consenso': return riservata(r) ? 'scegli-riservato' : 'chiedi'; // i cookie restano «riservati», come in Normale
        case 'anti-robot': return 'ferma';
        default: return 'chiedi';
      }
    },
  }),
  pcNormale: Object.freeze({
    nome: 'pc-normale',
    eliminaNudoInFinestra: true, // decisioni 167 e 170
    piattaforma: 'pc',
    nonValutabile: 'chiedi',
    decidi(r) {
      if (r.protezione === 'anti-robot') return 'ferma';
      if (r.protezione === 'consenso' && riservata(r)) return 'scegli-riservato';
      return 'chiedi';
    },
  }),
  /* Decisione 160 (owner 04/11): l'Accesso pieno del TELEFONO, forma del Mobile; la politica «telefono» qui sotto non cambia. Il pilota
     del telefono a 'ferma' passa la mano alla persona (pagamento, password in chiaro: ASS-161); nessun valore nuovo in DECISIONI. */
  telefonoAccessoPieno: Object.freeze({
    nome: 'telefono-accesso-pieno',
    eliminaNudoInFinestra: true, // decisioni 167 e 170
    piattaforma: 'telefono',
    nonValutabile: 'ferma', // SIC-01: anche le scritture miste fermano sul telefono
    decidi(r, c) {
      switch (r.protezione) {
        case 'credenziale': // come «telefono»: l'IBAN dettato dalla persona passa e si segna; ogni altro segreto passa la mano
          return r.prova === 'iban' && r.motivo === 'testo-della-persona' && !sospetto(c) ? 'procedi-e-segna' : 'ferma';
        case 'invio': return sospetto(c) ? 'ferma' : 'procedi';
        case 'pagamento': return 'ferma';
        case 'cancellazione': return 'procedi-e-segna';
        case 'consenso': return riservata(r) ? 'scegli-riservato' : 'procedi-e-segna';
        case 'anti-robot': return 'ferma';
        default: return 'ferma';
      }
    },
  }),
  telefono: Object.freeze({
    nome: 'telefono',
    eliminaNudoInFinestra: false, // decisione 170: il telefono di serie lo decide il Mobile coi suoi compiti
    piattaforma: 'telefono',
    nonValutabile: 'ferma',
    // Decisioni dell'owner del 02/11 mattina (portate dal Mobile):
    //   - invio di dati come sul PC: procede solo se la frase della persona lo chiede, mai col sospetto attivo;
    //   - IBAN dettato dalla persona: procede e si segna nella traccia; password, carte, codici e ogni altro segreto: ferma.
    decidi(r, c) {
      switch (r.protezione) {
        case 'credenziale':
          return r.prova === 'iban' && r.motivo === 'testo-della-persona' && !sospetto(c) ? 'procedi-e-segna' : 'ferma';
        case 'anti-robot': case 'cancellazione': case 'pagamento': return 'ferma';
        case 'consenso': return 'scegli-riservato';
        case 'invio': return richiesto(c, 'inviare') ? 'procedi' : 'ferma';
        default: return 'ferma';
      }
    },
  }),
});

/**
 * @param {{ azione: object, bersaglio: object|null, schermata: object,
 *   politica: { nome: string, decidi: Function, nonValutabile?: string, nonValutabilePer?: Record<string, string>, piattaforma?: 'pc'|'telefono' },
 *   contesto?: { richiesta?: { pagare?: boolean, inviare?: boolean, cancellare?: boolean }, sospetto?: boolean,
 *   piano?: { domini?: string[] }, testoDellaPersona?: string } }} a
 *   Elementi della schermata come nel contratto §4, più `finestra` (ref della finestra che li contiene) e, sulle finestre, `modale`;
 *   `schermata.titolo` facoltativo (titolo della finestra in primo piano). Per `scrivi` e `tasti` il bersaglio è l'elemento col fuoco.
 * @returns {{ decisione: string, protezione: string|null, motivo: string|null, prova: string|null, azioneSostitutiva?: object }}
 *   `protezione: null` con `motivo: 'non-valutabile'` = l'azione non si è potuta valutare: decide `politica.nonValutabile` (mai `procedi`).
 */
export function valutaAzione({ azione, bersaglio = null, schermata = { elementi: [] }, politica, contesto = {} } = {}) {
  if (!politica || typeof politica.decidi !== 'function') throw new TypeError('valutaAzione: serve una politica (argomento obbligatorio)');
  const tipiAmmessi = TIPI_PER_PIATTAFORMA[politica.piattaforma] ?? TIPI_AZIONE;
  let r;
  try { r = riconosci(azione, bersaglio, schermata, contesto, tipiAmmessi, politica.eliminaNudoInFinestra === true); } catch { r = nonValutabile('eccezione'); } // chi non sa valutare NEGA
  if (!r) return { ...NESSUNA };
  if (r.protezione === null) {
    const perProva = politica.nonValutabilePer;
    const decisione = perProva != null && typeof perProva === 'object' && Object.hasOwn(perProva, r.prova)
      ? (PER_PROVA_AMMESSE.includes(perProva[r.prova]) ? perProva[r.prova] : 'ferma')
      : (DECISIONI.includes(politica.nonValutabile) && politica.nonValutabile !== 'procedi' ? politica.nonValutabile : 'ferma');
    const esito = { decisione, protezione: null, motivo: r.motivo, prova: r.prova ?? null };
    if (r.prova === 'scritture-miste') Object.assign(esito, testoDellaCarta(r.testo));
    return esito;
  }
  let decisione;
  try { decisione = politica.decidi(r, contesto, schermata); } catch { decisione = 'ferma'; } // una politica che esplode non procede
  if (!DECISIONI.includes(decisione) || (decisione === 'riscrivi' && !r.sostitutiva)) {
    return { decisione: 'ferma', protezione: r.protezione, motivo: 'politica-incoerente', prova: String(decisione).slice(0, 40) };
  }
  const esito = { decisione, protezione: r.protezione, motivo: r.motivo, prova: r.prova ?? null };
  if (decisione === 'riscrivi') {
    esito.azioneSostitutiva = { ...r.sostitutiva };
  }
  return esito;
}
