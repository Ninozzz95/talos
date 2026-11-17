/*
 * ⭐ Fase 8 «Impostazioni dalla chat» (owner 01/11/2026, tutte le consigliate: D1-D8) — IL SERVIZIO del server: legge e scrive le voci
 *   del catalogo, tiene la REVISIONE ATTESA, le RICEVUTE con l'Annulla, e il canale verso le finestre del PC (§3.5, strada A).
 *
 * Fonti lette nel codice dei concorrenti (forma §1, cloni del 01/11 in TALOS-RICERCHE/concorrenti):
 *   · Codex `app-server-protocol/src/protocol/v2/config.rs:1177-1202` — `expected_version` sulle scritture della configurazione
 *     (concorrenza ottimistica) ⇒ qui `expected_revision`, per voce: si rifiuta solo se è cambiata una voce che si sta cambiando;
 *   · Hermes `tools/set_theme_tool.py:1-7` — «The renderer applies the values and answers with what it applied, so the model reports
 *     what the user sees» ⇒ la finestra risponde con ciò che ha applicato, e l'esito lo dice;
 *   · Hermes `server-requests.ts:120-124` — il server tiene la richiesta aperta finché una finestra risponde ⇒ qui si aspetta la PRIMA
 *     risposta vera, con un tetto (senza finestre aperte non si aspetta nessuno: la copia vale alla prossima apertura).
 *   Ricerca web del 01/11/2026 (WebSearch): la documentazione pubblica di Hermes descrive il cambio di tema dell'agente come
 *   `hermes config set display.skin`, ripreso da un osservatore che ridisegna «every surface within ~a second»
 *   (hermes-agent.nousresearch.com/docs/user-guide/skills/bundled/hermes-themes) — conferma che le finestre si riallineano da sole.
 * Il one-up (forma §1.7): catalogo convalidato, più cambi in una carta sola, tutti o nessuno, Annulla dopo l'applicazione, l'origine
 *   «modello» col dispositivo nel registro.
 *
 * ⛔ Condizioni di Performance (forma §6): il catalogo si legge una volta (modulo); `list` senza parole né sezione dà le sole sezioni;
 *   con parole o sezione al più 15 voci e meno di 2 KB; l'esito di `set` e `undo` è una riga per cambio.
 * ⛔ Condizioni del Mobile: l'evento delle finestre porta `destinatario: 'finestre-pc'` (il telefono non lo applica e nessuno aspetta
 *   lui); la carta dice `dove` ('pc' su questo server); l'Annulla passa dal ponte con `receipt_id`; l'origine porta il dispositivo.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { scriviAtomico } from '../research-store.mjs';
import { scansionaIstruzioni } from '../automation-sicurezza.mjs';
import { GRUPPI_CARTA_SEMPRE } from '../kernel/impostazioni-app.mjs';
import {
  CATALOGO_IMPOSTAZIONI, RIMANDI_IMPOSTAZIONI, SEZIONI_IMPOSTAZIONI, catalogoPubblico, controllaValore, valoreInterno, valorePubblico,
} from './catalogo-impostazioni.mjs';
import { FINESTRA_SCRITTA_MINIMA, FINESTRA_SCRITTA_MASSIMA } from '../finestra-di-ripiego.mjs';

export const NOME_ATTREZZO_IMPOSTAZIONI = 'app_settings';
/* REV8-03 (revisione della fase 8, 01/11/2026): dove una fonte mette, accanto ai campi letti, i valori INTERNI che la voce pubblica perde
   (`leggi()[VALORI_INTERNI] = { campo: valore }`); il servizio li riporta con `scrivi(patch, { interni })` solo all'Annulla e al ritorno
   indietro di un errore. Un simbolo: nessuna fonte di oggi lo legge per sbaglio come un campo. */
export const VALORI_INTERNI = Symbol.for('talos.impostazioni.valoriInterni');
export const DESTINATARIO_FINESTRE_PC = 'finestre-pc';
export const EVENTO_IMPOSTAZIONI_FINESTRA = 'talos.impostazioni-finestra';
export const VOCI_MASSIME_IN_ELENCO = 15;
export const CAMBI_MASSIMI = 10;
export const RICEVUTE_MASSIME = 100;
const ATTESA_FINESTRA_MS = 3_000;
const VALORI_MOSTRATI = 6;

const rifiuto = (messaggio) => ({ ok: false, messaggio });
/* `/settings` della persona (02/11/2026): lo stesso rifiuto del piano, col MOTIVO (kebab-case) e la voce, per la rotta. Il modello
   riceve solo `messaggio` (`perLaSessione` rifà il rifiuto): i due campi in più non entrano mai nel testo che legge. */
const rifiutoCon = (messaggio, motivo, chiave = null) => ({ ok: false, messaggio, motivo, ...(chiave ? { chiave } : {}) });
const errore = (code, messaggio) => Object.assign(new Error(messaggio), { code });
const stesso = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const mostra = (valore) => JSON.stringify(valore ?? null);
/* 11/11/2026: come si scrive la memoria di un modello (`tipo: 'memoria'`), con gli stessi limiti di `finestra-di-ripiego.mjs` */
const DESCRIZIONE_TOKEN = `a whole number of tokens between ${FINESTRA_SCRITTA_MINIMA.toLocaleString('en-US')} and ${FINESTRA_SCRITTA_MASSIMA.toLocaleString('en-US')}, or null for automatic`;
const AMBITO_PUBBLICO = { app: 'app', conversazione: 'conversation' };
/* giro dopo i revisori della soglia (punto 5, BASSO 3 di A): la memoria di un modello vale per QUEL modello in ogni conversazione, e resta salvata */
const dove = (v) => (v.chiave === 'conversation.modelMemory' ? 'this model, in every conversation' : v.ambito === 'conversazione' ? 'this conversation' : v.dove === 'finestra' ? 'this app, window preference' : v.chiave.startsWith('context.engine') || v.chiave === 'tools.defaultCommandShell' || v.chiave === 'chat.liveBlocks' ? 'new conversations' : 'this app');
const TAG_GRUPPO = { sicurezza: 'security', costo: 'cost', aggiornamenti: 'updates' };

/*
 * Fase 8, cura 2 (forma `FORMA-FASE-8-TRE-CURE-2026-11-01.md` §2; OK di Performance, CLI e Mobile il 01/11 sera) — CHI HA CONFERMATO un
 *   cambio. Accanto a `origine` (che dice chi l'ha CHIESTO: il modello, e il dispositivo del giro), nella ricevuta e nell'evento
 *   `talos.impostazioni-sessione`, MAI nel testo letto dal modello (Performance 2):
 *   · `{ tipo: 'finestra-pc' }` / `{ tipo: 'dispositivo', dispositivoId }` — li stampa la ROTTA `POST …/approve` (http-app.mjs);
 *   · `{ tipo: 'nessuno', motivo: 'accesso-pieno' }` — la carta non c'era (il nucleo lo dice con `senzaCarta`);
 *   · `null` — una risposta senza la rotta (una regola, un'automazione, la CLI): mai dedotto «finestra-pc» (CLI b).
 */
const CONFERMA_SENZA_CARTA = Object.freeze({ tipo: 'nessuno', motivo: 'accesso-pieno' });
/** La forma ammessa di `confermatoDa`, ricopiata campo per campo; ogni altra cosa è `null`. */
export function confermatoDaValido(grezzo) {
  if (!grezzo || typeof grezzo !== 'object') return null;
  if (grezzo.tipo === 'finestra-pc') return { tipo: 'finestra-pc' };
  if (grezzo.tipo === 'dispositivo') return { tipo: 'dispositivo', dispositivoId: typeof grezzo.dispositivoId === 'string' && grezzo.dispositivoId ? grezzo.dispositivoId.slice(0, 200) : null };
  return null;
}

/*
 * Fase 8, cura 4 (forma `FORMA-FASE-8-TRE-CURE-2026-11-01.md` §4, domanda del Frontend del 01/11 sera; OK di Performance e Frontend, del
 *   Mobile con tre condizioni) — LA RAGIONE SULLA CARTA. `set` riceve `reason`, facoltativo: una frase del modello, che la carta mostra
 *   come la riga del perché. È testo del MODELLO davanti a chi deve decidere, quindi:
 *   · testo semplice in una riga: a capo e tabulazioni diventano uno spazio, gli altri caratteri di controllo (C0, DEL, C1) e quelli
 *     invisibili o di direzione (U+200B-200F, U+202A-202E, U+2060-2064, U+2066-2069, U+FEFF) si TOLGONO, prima del taglio (Mobile 1);
 *   · al più 200 caratteri (code point, mai mezza coppia), oltre si taglia con «…», qui nel server (Performance);
 *   · vuota, di soli spazi o di soli invisibili = assente (Frontend): la carta usa la sua frase;
 *   · mai nel testo letto dal modello né nella ricevuta (Performance): vive solo nell'anteprima della carta;
 *   · non sostituisce le righe prima → dopo, che restano costruite dal catalogo (Mobile 2): è un campo in più, accanto;
 *   · si scansiona sul testo GREZZO come le istruzioni delle automazioni (`scansionaIstruzioni`, automation-sicurezza.mjs; le carte delle
 *     automazioni portano `avvisi: { oltre, minacce }`, automation-per-il-modello.mjs `avvisiPer`) ⇒ `azione.avvisi.minacce` (Mobile 3).
 *     In più, solo per questa carta, `pressione-sulla-carta`: una frase che spinge chi decide a non leggere («already approved», «approve
 *     without reading», «già confermato», «approva senza leggere»). La scansione delle automazioni non la conosceva, e non l'ho toccata:
 *     è condivisa con le carte delle automazioni, e cambiarla vuole l'OK delle altre sessioni.
 */
export const RAGIONE_MASSIMA = 200;
// eslint-disable-next-line no-control-regex
const SPAZI_DI_RIGA = /[\t\n\v\f\r\u0085\u2028\u2029]/gu;
/*
 * Revisione avversaria della fase 8, REV8-02 (01/11/2026 notte; condizioni del Mobile): i caratteri che si tolgono si scelgono per
 *   PROPRIET\u00c0 Unicode, non per elenco \u2014 l'elenco di prima lasciava sulla carta U+061C (un segno di direzione), U+180E, U+2065, i
 *   caratteri tag U+E0000-E007F (il canale di contrabbando documentato) e il trattino morbido, che dentro \u00abal\u00adready approved\u00bb spegneva
 *   la scansione. Ora: i controlli (`\p{Cc}`), i caratteri di formato (`\p{Cf}`: bidi, larghezza zero, trattino morbido, tag), U+034F, i
 *   riempitivi Hangul, i selettori di variante (U+180B-180F, U+FE00-FE0F, U+E0100-E01EF) e tutto il piano dei tag U+E0000-E0FFF.
 *   Ricerca del 01/11/2026: NFKC NON toglie i caratteri di formato (github/gh-aw#28036; securelayer7 \u00abunicode tag smuggling\u00bb: \u00abremove
 *   the Tag block and zero-width characters, apply Unicode normalisation\u00bb; AWS security blog sul contrabbando Unicode) \u21d2 prima si
 *   tolgono, poi NFKC piega la larghezza piena, poi si cercano gli schemi di pressione sul testo GI\u00c0 pulito. La carta mostra il testo
 *   pulito (senza NFKC: ci\u00f2 che il modello ha scritto, meno l'invisibile) e il tetto dei 200 si conta dopo la pulizia.
 */
/* U+2065 e U+FFF0-FFF8 sono NON assegnati (Cn, non Cf): stanno in blocchi di caratteri invisibili e si tolgono per intervallo */
const NASCOSTI = /[\p{Cc}\p{Cf}\u034f\u115f\u1160\u3164\uffa0\u180b-\u180f\u2060-\u206f\ufe00-\ufe0f\ufff0-\ufff8\u{E0000}-\u{E0FFF}]/gu;
/** Il testo in una riga senza controlli n\u00e9 invisibili, spazi compattati (nessun taglio). */
function pulisci(grezza) {
  return grezza.toWellFormed().replace(SPAZI_DI_RIGA, ' ').replace(NASCOSTI, '').replace(/\s+/gu, ' ').trim();
}
/*
 * Fase 8, giro 3b (revisione avversaria della CLI, 02/11/2026, P1 e P4) — tre passi in più, DOPO la pulizia e NFKC, prima degli schemi:
 *   · TETTO: si guardano al più i primi 2000 caratteri (code point) del testo pulito. La carta ne mostra 200 (`RAGIONE_MASSIMA`): una
 *     pressione oltre il 2000 la persona non la vede mai, quindi non la spinge; 2000 = dieci volte il mostrato, margine per chi la legge
 *     intera altrove. Hermes `tools/threat_patterns.py:16-17,138` (`MAX_SCAN_CHARS = 65_536`, «scanners are advisory, so bound
 *     worst-case runtime»): lì è il testo intero di un file, qui una frase di una riga. Gli invisibili tolti prima non contano.
 *     ⛔ Solo per la pressione: `scansionaIstruzioni` (condivisa con le automazioni) guarda ancora tutto.
 *   · LETTERE CONFONDIBILI: NFKC NON piega lettere d'alfabeti diversi che a schermo sono identiche («аlready аpproved» con la «а»
 *     cirillica U+0430 non scattava). Lo fa lo «skeleton» di UTS #39 (unicode.org/reports/tr39, versione 18.0.0 del 27/08/2026, letto
 *     il 02/11/2026: «paypal» e «pаypаl» sono mixed-script confusables, «scope» e «ѕсоре» whole-script). Qui una tabella piccola e scritta,
 *     solo cirillico, greco e due lettere IPA verso il latino: ogni voce è nel confusables.txt 17.0.0 (controllato sulla tabella
 *     generata in qwen-code `packages/web-shell/client/utils/unicodeConfusables.ts:149-444`), tranne κ e τ (lì → ĸ e ᴛ, non ASCII: le
 *     pieghiamo in k e t) e І/Ι (lì → l, perché anche la I latina va in l: qui → I). Fuori, per scelta: ε (→ ꞓ), χ e ω (assenti), ı.
 *     Stessa scelta del consenso di cua (`libs/cua/crates/cua-keyvault/src/confusable.rs:72-92`, `skeleton_char`) e contro l'attacco
 *     che Hermes stesso prova (`optional-skills/security/godmode/scripts/parseltongue.py:53-54`, `UNICODE_MAP` а с е і о р ѕ х у: tutte
 *     qui). Una frase VERA in russo o in greco non diventa inglese (RAG-10, al contrario). Ogni voce è di 1 code unit e va in 1.
 *   · TRATTINI E SIMILI = SPAZI: «Already-approved» non scattava (`FRA` vuole spazi o virgole). Ogni `\p{Pd}`, il meno U+2212 e `_`.
 *   La frase mostrata (`fraseDellaRagione`) viene da questo testo piegato, come già per NFKC: «аlready аpproved» si mostra in latino.
 */
const TETTO_SCANSIONE = 2000;
const PRIMI_CARATTERI = new RegExp(String.raw`^[\s\S]{0,${TETTO_SCANSIONE}}`, 'u');
const CONFONDIBILI = Object.freeze({
  /* cirillico minuscolo: а е о р с х у і ј ѕ ԁ һ ԛ ԝ ӏ ү г */
  '\u0430': 'a', '\u0435': 'e', '\u043e': 'o', '\u0440': 'p', '\u0441': 'c', '\u0445': 'x', '\u0443': 'y', '\u0456': 'i', '\u0458': 'j',
  '\u0455': 's', '\u0501': 'd', '\u04bb': 'h', '\u051b': 'q', '\u051d': 'w', '\u04cf': 'l', '\u04af': 'y', '\u0433': 'r',
  /* cirillico maiuscolo: А В Е К М Н О Р С Т Х У І Ј Ѕ Ԍ Ԝ */
  '\u0410': 'A', '\u0412': 'B', '\u0415': 'E', '\u041a': 'K', '\u041c': 'M', '\u041d': 'H', '\u041e': 'O', '\u0420': 'P', '\u0421': 'C',
  '\u0422': 'T', '\u0425': 'X', '\u0423': 'Y', '\u0406': 'I', '\u0408': 'J', '\u0405': 'S', '\u050c': 'G', '\u051c': 'W',
  /* greco minuscolo: α ι ν ο ρ υ γ ϲ κ τ */
  '\u03b1': 'a', '\u03b9': 'i', '\u03bd': 'v', '\u03bf': 'o', '\u03c1': 'p', '\u03c5': 'u', '\u03b3': 'y', '\u03f2': 'c', '\u03ba': 'k', '\u03c4': 't',
  /* greco maiuscolo: Α Β Ε Ζ Η Ι Κ Μ Ν Ο Ρ Τ Υ Χ */
  '\u0391': 'A', '\u0392': 'B', '\u0395': 'E', '\u0396': 'Z', '\u0397': 'H', '\u0399': 'I', '\u039a': 'K', '\u039c': 'M', '\u039d': 'N',
  '\u039f': 'O', '\u03a1': 'P', '\u03a4': 'T', '\u03a5': 'Y', '\u03a7': 'X',
  /* latino IPA: ɡ ɑ */
  '\u0261': 'g', '\u0251': 'a',
});
const CONFONDIBILE = new RegExp(`[${Object.keys(CONFONDIBILI).join('')}]`, 'gu');
const TRATTINI = /[\p{Pd}\u2212_]/gu;
const piega = (testo) => testo.replace(CONFONDIBILE, (c) => CONFONDIBILI[c]);
/** Il testo su cui si cercano gli schemi di pressione: pulito e tagliato ai primi 2000 caratteri (il testo che la carta mostra, quindi il
 *  tetto si conta lì e il lavoro dopo non cresce con la ragione), confondibili in latino, piegato con NFKC, ripulito (NFKC non deve far
 *  rientrare niente), confondibili di nuovo, trattini in spazi. La piega va PRIMA di NFKC perché è il testo mostrato (NFKC porterebbe
 *  ϲ U+03F2 in ς, fuori tabella) e DOPO perché NFKC fa nascere lettere greche (𝛂 U+1D6C2 → α). Esportato per le prove (RAG-10, RAG-12). */
export const testoPerGliSchemi = (grezza) =>
  piega(pulisci(piega(pulisci(grezza).match(PRIMI_CARATTERI)[0]).normalize('NFKC'))).replace(TRATTINI, (c, i, s) => (aggettivoComposto(s, i, c) ? c : ' '));
/*
 * Giro 4 (seconda lettura della CLI sul 3b, A, 02/11/2026): «trattini = spazi» faceva scattare la regola del SOGGETTO su un aggettivo
 *   composto davanti a un nome — «Show only user-approved extensions», «Allow owner-approved plugins only» diventavano «user approved» e
 *   sembravano «la persona ha approvato». L'eccezione vale SOLO per quella regola: il trattino resta (e la regola, che vuole spazi o virgole
 *   fra soggetto e verbo, non lo attraversa) quando sta fra user/person/owner e il verbo e dopo il verbo viene una parola che non è
 *   l'oggetto della pressione (it/this/the card…, by/earlier/before/in chat/in advance: `OGGETTO`). Restano pressione «Already-approved
 *   by you», «a pre-approved change», «the already-approved card» (altre regole, trattino piegato come prima) e «user-approved.» o
 *   «owner-approved it» (dopo il verbo la fine della frase o l'oggetto).
 */
/* senza confine davanti: anche «superuser-approved list» tiene il trattino, ed è indifferente (la regola del soggetto vuole `\buser`) */
const SOGGETTO_PRIMA = /(?:user|person|owner)$/iu;
/* le parole-oggetto di `OGGETTO` (più sotto), senza la fine della frase: qui dopo il verbo serve comunque una parola. «confirmed» non c'è:
   nella regola del soggetto vuole già la carta per oggetto, quindi «user-confirmed devices» non scatta nemmeno col trattino piegato */
const OGGETTO_A_PAROLE = String.raw`\s+(?:(?:at|over|through)\s+)?(?:it|this|these|them|anything|the\s+(?:card|request|changes?|details))\b|\s+(?:by|earlier|before|in\s+(?:chat|advance))\b`;
/*
 * Giro 5 (terza lettura della CLI sul giro 4, A, S4, 02/11/2026): l'eccezione del composto lasciava passare «Apply this user-approved
 *   change now», «an owner-approved request», «A person-approved settings update» — pretese d'approvazione su QUESTA carta. Se dopo il
 *   composto viene un NOME DELLA CARTA (change, request, update, setting, card e i plurali; modifica, richiesta, aggiornamento,
 *   impostazione, carta e i plurali) il trattino si piega e la regola del soggetto scatta. Il nome è una parola intera: «changelog»,
 *   «cardigans», «settingsfile» lasciano il trattino. Restano pulite «user-approved extensions», «owner-approved plugins».
 *   ⛔ Limite: solo il nome SUBITO dopo («user-approved theme change» passa, come ogni nome composto in mezzo); allargarlo a una parola
 *   in mezzo farebbe scattare «user-approved extensions update list» e simili.
 */
const NOME_DELLA_CARTA = String.raw`\s+(?:changes?|requests?|updates?|settings?|cards?|modific(?:a|he)|richiest[ae]|aggiornament[oi]|impostazion[ei]|cart[ae])(?![\p{L}\p{N}])`;
const VERBO_DOPO = new RegExp(String.raw`^(?:approved|agreed|authori[sz]ed|consented)(?!${OGGETTO_A_PAROLE}|${NOME_DELLA_CARTA})\s+\p{L}`, 'iu');
function aggettivoComposto(testo, i, trattino) {
  return SOGGETTO_PRIMA.test(testo.slice(Math.max(0, i - 6), i)) && VERBO_DOPO.test(testo.slice(i + trattino.length, i + trattino.length + 40));
}

/*
 * Giro 4 (seconda lettura della CLI sul 3b, C, 02/11/2026; cura proposta dalla CLI e accettata dal Desktop) — ALFABETI MESCOLATI. La tabella
 *   dei confondibili qui sopra resta una tabella: «confırmed» e «saıd yes» (ı senza punto, U+0131, fuori per scelta), «apprօved» e «սser»
 *   (armeno օ U+0585, ս U+057D), «approᴠed» (ᴠ maiuscoletta U+1D20) passavano. Motivo a parte, `alfabeti-mescolati`: UNA parola (lettere e
 *   segni attaccati) che ha lettere latine E lettere cirilliche, greche, armene, cherokee, oppure le latine «strane» dei blocchi IPA
 *   (U+0250-02AF), fonetici (U+1D00-1D7F, maiuscolette) o la ı (che sono latine per Unicode: una parola di sole maiuscolette scatta anche
 *   lei, e nessuno la scrive per caso). Nessuna ragione onesta scrive «apprօved».
 *   Fonte: UTS #39 (unicode.org/reports/tr39, versione 18.0.0 del 27/08/2026, letta il 02/11/2026) §5.1: una stringa è «mixed-script» se
 *   l'intersezione degli alfabeti dei suoi caratteri è vuota; qui la stringa è la PAROLA, non la frase, così «Imposta il tema Тёмная» resta
 *   pulita. Hermes (`tools/threat_patterns.py:142`, clone 2026-11-01) dichiara di non piegare i confondibili di altri alfabeti: questo è il
 *   segnale che lì manca. Sul testo pulito, tagliato ai 2000 e piegato con NFKC (𝛂 matematica → α greca: «𝛂pproved» si vede).
 *   ⛔ Al contrario (RAG-15): una frase tutta russa, tutta greca, «naïve», «Straße», «Ørsted», un nome cinese accanto a uno latino: zero.
 *   ⛔ Limite: una parola turca con la ı («kapı»), azera con la ə («Azərbaycan») scattano (le sigle di misura «μs», «kΩ» non più: giro 5, `SIGLA_DI_MISURA`); nelle ragioni
 *   di un cambio d'impostazioni sono rare, e il segnale non blocca niente (una voce nel riquadro della carta).
 */
const ALTRO_ALFABETO = /[\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Armenian}\p{Script=Cherokee}\u0250-\u02af\u1d00-\u1d7f\u0131]/u;
const LATINA = /\p{Script=Latin}/u;
const PAROLE = /[\p{L}\p{M}]+/gu;
/*
 * Giro 5 (terza lettura della CLI sul giro 4, B, S4, 02/11/2026): NFKC porta il segno micro µ (U+00B5, alfabeto Common) nella μ greca
 *   (U+03BC) e l'ohm Ω (U+2126, già Greek per Unicode) nella Ω greca (U+03A9), così «500µs», «10kΩ», «2 µm» scattavano. Å (U+212B) e
 *   K (U+212A) diventano LATINE (U+00C5, K): non mescolano. Ricerca del 02/11/2026: UTS #39 18.0.0 §5.1 (unicode.org/reports/tr39, rev.
 *   34 del 27/08/2026) tratta Common come ALL, quindi la µ non rende «mixed-script» una parola; ruff (astral-sh/ruff#4430) ha aggiunto
 *   µ→μ, Å, Ω fra i confondibili e ha dovuto silenziare a mano i falsi positivi su pandas e bokeh (gli alias «µs»). Cura con la cautela
 *   della CLI: la parola mescolata si perdona SOLO se è per intero una sigla di misura — una μ seguita da un'unità latina (s, m, g, l, L,
 *   A, V, W, F, H, J, C, T, N, S, K, Hz, mol, Pa) o una Ω dopo un prefisso (k, M, m, G, T). Le cifre non stanno nella parola (`PAROLE`),
 *   quindi «500µs» e «500 µs» danno la stessa «μs», e «in µs» senza numero resta pulita: una sigla intera non imita nessuna parola degli
 *   schemi. Ogni altra parola conta: «µser», «5µser», «jµst», «Ωwner», «µsx», «kΩx», «µp». Il controllo resta DOPO NFKC (𝛂 → α), e
 *   vale anche per μ e Ω greche scritte a mano (dopo NFKC non si distinguono, ed è giusto: è lo stesso segno a schermo).
 *   Le sigle tutte greche («µΩ») o tutte latine («mA») non mescolano: non servono qui.
 */
const SIGLA_DI_MISURA = /^(?:[kMmGT]Ω|μ(?:Hz|mol|Pa|[sgmlLAVWFHJCTNSK]))$/u;
export function mescolaAlfabeti(grezza) {
  if (typeof grezza !== 'string' || !grezza) return false;
  const testo = pulisci(grezza).match(PRIMI_CARATTERI)[0].normalize('NFKC');
  for (const [parola] of testo.matchAll(PAROLE)) if (ALTRO_ALFABETO.test(parola) && LATINA.test(parola) && !SIGLA_DI_MISURA.test(parola)) return true;
  return false;
}
/*
 * Fase 8, giro 3 (owner 02/11/2026 mattina, AskUserQuestion «Allargarli») — gli schemi di pressione con l'ORDINE LIBERO, i SINONIMI e le
 *   PAROLE IN MEZZO, in inglese e in italiano («the user has ALREADY, earlier, said yes», «pre-approved», «just approve», «ha detto di sì»,
 *   «approva e basta»…). Ricerca del 02/11/2026:
 *   · Hermes `tools/threat_patterns.py:18-19` — fra le parole chiave un riempitivo LIMITATO, `(?:\w+\s+){0,8}`, perché quello senza tetto
 *     «backtracks badly»; `:16-17` un tetto al testo scansionato; `:143` NFKC prima degli schemi; `:6-8` gli schemi nuovi si ancorano a
 *     un comportamento d'attacco inequivocabile, non all'inglese perentorio ⇒ qui al più 3 parole in mezzo (2 per il soggetto), separate
 *     da spazi o virgole, mai da un punto; la carta ha già il tetto di 200 caratteri e il testo già pulito e piegato;
 *   · Codex `codex-rs/prompts/templates/guardian/policy_template.md:6-7,11,22` — il testo dell'assistente non stabilisce l'autorizzazione
 *     della persona, si ignora chi «force approval», e si giudica «by the material semantics, not exact syntax» (lì con un modello);
 *   · Claude Code (`mods/types/claude-code.d.ts:6103`, modo `auto`) affida la decisione a un classificatore-modello: nessuna lista di frasi
 *     sul perché scritto dal modello;
 *   · Checkmarx «Lies-in-the-Loop» e arXiv 2606.02668 (letti il 02/11/2026): il testo della finestra di approvazione lo scrive l'agente,
 *     quindi può spingere chi decide; Goose block/goose#4237 mette gli avvisi a schemi DENTRO la conferma, come qui.
 *   ⛔ Solo la carta delle impostazioni: `scansionaIstruzioni` (automation-sicurezza.mjs) è condivisa con le automazioni e NON si tocca.
 *   ⛔ Al contrario (prove RAG-08): «Say yes to enable dark mode?», «the previous setting was approved by IT», «yes» e «approve» da soli
 *     non scattano: «say» al presente, «approved» senza «already» né un soggetto che sia la persona, e un verbo da solo, restano puliti.
 */
/* giro 3b: niente trattino nella parola — nel testo scansionato i trattini sono già spazi (`testoPerGliSchemi`) */
const PAROLA = String.raw`[\p{L}\p{N}'’]+`;
/** Al più `n` parole in mezzo, separate da spazi o virgole (mai un punto: la frase finisce lì); pigro, quindi la frase mostrata è la più corta. */
const FRA = (n) => String.raw`(?:[\s,]+${PAROLA}){0,${n}}?[\s,]+`;
/** Lo stesso, solo spazi: per «non serve leggere», dove una virgola apre di solito un'altra frase («non serve riavviare, controlla…»). */
const FRA_SPAZI = (n) => String.raw`(?:\s+${PAROLA}){0,${n}}?\s+`;
/** Fine di parola che vale anche dopo una lettera accentata (`\b` di JavaScript conosce solo le lettere ASCII). */
const FINE = String.raw`(?![\p{L}\p{N}])`;
/*
 * Giro 3b (revisione della CLI, P2: sei ragioni oneste facevano scattare l'avviso, e un avviso che scatta sulle ragioni oneste insegna a
 *   ignorarlo) — per i verbi che hanno ANCHE un uso normale («look at the screen», «confirmed unreadable», «accepted a theme», «confirmed in
 *   the README») l'oggetto dev'essere la carta: dopo il verbo viene la fine della frase, oppure it/this/these/them/anything/the card,
 *   request, change(s), details (anche dopo at/over/through), oppure by/earlier/before/in chat/in advance. In italiano: il pronome
 *   attaccato all'infinito («leggerla», «controllarle», «leggerne»), la fine della frase, oppure la carta/la richiesta/il cambio/
 *   questo-a-i-e/niente/nulla. «guardare lo schermo», «la tv»: un articolo dopo l'infinito è un articolo, non il pronome.
 *   ⛔ LIMITE DICHIARATO (P3 della CLI, NON curato): il vocabolario resta aperto. Passano «You already gave the OK», «The user okayed
 *   this», «signed off by you», «Consent was already given», «Don't bother reading», «Skip the review», QUATTRO parole in mezzo
 *   («already, earlier today in chat, approved»), «L'utente ha già dato l'ok», «Inutile leggere», «L'utente ha acconsentito». Una lista di
 *   frasi resta una lista: Codex (guardian) e Claude Code (modo auto) lo giudicano con un modello. Questo avviso è un aiuto, NON una garanzia.
 *   ⛔ LIMITE DICHIARATO anche al contrario (B della seconda lettura della CLI sul 3b, 02/11/2026, NON curato): «it/this/-lo» non sono per
 *   forza la carta, quindi scattano «Auto-update on: no need to check it every week.», «Aggiornamento automatico: non serve controllarlo
 *   ogni settimana.», «You previously accepted this theme, but it hides the cursor…». Restringere l'oggetto lascerebbe passare «no need to
 *   check it»; è lo stesso limite delle liste: falsi positivi e falsi negativi si spostano, non spariscono.
 */
const FINE_FRASE = String.raw`\s*(?:[.,;:!?]|$)`;
const OGGETTO = String.raw`(?=${FINE_FRASE}|\s+(?:(?:at|over|through)\s+)?(?:it|this|these|them|anything|the\s+(?:card|request|changes?|details))\b|\s+(?:by|earlier|before|in\s+(?:chat|advance))\b)`;
const OGGETTO_IT = String.raw`(?:\p{L}*r(?:l[oaie]|ne)|\p{L}*(?=${FINE_FRASE}|\s+(?:la\s+carta|la\s+richiesta|il\s+cambio|quest[oaie]|niente|nulla)${FINE}))`;
const schema = (sorgente) => new RegExp(sorgente, 'iu');
const PRESSIONE_SULLA_CARTA = Object.freeze([
  /* «already approved» (prima: solo adiacenti o con «been») — ora con parole in mezzo e i verbi nuovi */
  schema(String.raw`\b(?:already|previously)${FRA(3)}(?:approved|agreed|authori[sz]ed)\b`),
  /* giro 3b: «confirmed» e «accepted» solo se l'oggetto è la carta («already confirmed unreadable», «previously accepted a theme» no) */
  schema(String.raw`\b(?:already|previously)${FRA(3)}(?:confirmed|accepted)${OGGETTO}`),
  /\bapprove\w*\b[^.\n]{0,30}\bwithout\s+(?:reading|looking|checking)\b/iu,
  /* «no need to read» (prima: solo esatta) — «no need for you to read», «you don't need to even check», «doesn't need reviewing»;
     giro 3b: l'oggetto è la carta («no need to look at the screen» no) */
  schema(String.raw`(?:\bno|\bnot|n['’]t)\s+need${FRA_SPAZI(3)}(?:read|check|look|review)(?:ing)?${OGGETTO}`),
  /* «già approvato» (prima: solo adiacenti o con «stato») — ora con parole in mezzo e «accettato» */
  schema(String.raw`\bgià${FRA(3)}(?:approvat|confermat|autorizzat|accettat)`),
  /\bapprova\w*\b[^.\n]{0,30}\bsenza\s+(?:leggere|guardare|controllare)\b/iu,
  /* «non serve leggere» (prima: solo esatta) — «non serve che tu la legga», «non occorre», «non hai bisogno di», «non devi nemmeno»;
     giro 3b: l'oggetto è la carta («non devi guardare lo schermo» no) */
  schema(String.raw`\bnon\s+(?:serve|occorre|c['’]è\s+bisogno|hai\s+bisogno|devi)${FRA_SPAZI(3)}(?:legg|controll|guard)${OGGETTO_IT}`),
  /* ── nuove, giro 3 ── */
  /* ordine libero: «approved already», «agreed on it already» */
  schema(String.raw`\b(?:approved|confirmed|agreed)${FRA(2)}already\b`),
  /* «said yes», «answered yes», «replied "yes"» (al passato: «Say yes to…» è una domanda, non una pressione) */
  schema(String.raw`\b(?:said|answered|replied)\s+["“”'‘’]?yes\b`),
  /* «pre-approved», «preapproved», «pre approved», col trattino tipografico; «pre-approvato» (giro 3b: i trattini sono già spazi) */
  schema(String.raw`\bpre\s?(?:approved|authori[sz]ed|confirmed|approvat|autorizzat|confermat)`),
  /* «approved in advance», «approved beforehand», «agreed ahead of time» */
  schema(String.raw`\b(?:approved|authori[sz]ed|agreed)\s+(?:in\s+advance|beforehand|ahead\s+of\s+time)\b`),
  /* il soggetto è la persona: «the user agreed», «the person has approved», «the owner explicitly confirmed»; giro 3b: in mezzo solo
     ausiliari e avverbi («the user wants the approved theme» no), e «confirmed» con la carta per oggetto («confirmed in the README» no) */
  schema(String.raw`\b(?:user|person|owner)(?:[\s,]+(?:has|had|already|also|just|earlier|\p{L}+ly)){0,2}?[\s,]+(?:(?:approved|agreed|authori[sz]ed|consented)\b|confirmed${OGGETTO})`),
  /* «just approve», «just say yes» */
  schema(String.raw`\bjust\s+(?:approve|accept|confirm|say\s+yes)\b`),
  /* «ha (già) detto sì», «ha detto di sì / di si», «ha detto «sì»» (mai «come detto si applica») */
  schema(String.raw`\bdetto\s+(?:di\s+s[iì]|["«“‘']?sì)${FINE}`),
  /* «approvato in anticipo», «approvata preventivamente» */
  schema(String.raw`\bapprovat[oaie]\s+(?:in\s+anticipo|preventivamente)\b`),
  /* «approva e basta», «confermalo e basta» */
  schema(String.raw`\b(?:approva|conferma|accetta)(?:l[oaie])?\s+e\s+basta\b`),
]);
/*
 * PR21-I4 (revisione cloud, 04/11/2026): la ragione del modello arrivava INTERA a `scansionaIstruzioni` (condivisa con le automazioni, ha
 *   un'espressione con ritorno all'indietro polinomiale: `ignore\s+(?:\w+\s+)*…`) e alla ricerca binaria di `fraseDellaRagione`, che la
 *   chiama decine di volte — misurato il 04/11 sulla candidata: «ignore all » ripetuto, 2000 caratteri 0,15 s, 8000 10 s, 16 000 100 s,
 *   tutto sul filo del server. ⇒ Si taglia UNA volta all'ingresso di `set` (`perLaSessione`), prima di ogni scansione e della carta.
 *   Dove si taglia: dove il testo PULITO (quello che la carta mostra) arriva a `TETTO_SCANSIONE` = 2000 caratteri — gli invisibili che la
 *   pulizia toglie e gli spazi che compatta non contano, quindi la pressione dopo 5000 invisibili si vede ancora (RAG-12) e gli schemi
 *   guardano lo stesso testo di prima. In più al più 65 536 caratteri grezzi, il `MAX_CARATTERI_SCANSIONE` del kernel
 *   (`kernel/confine-dati.mjs:100`) e di Hermes (`tools/threat_patterns.py:16-17`, «scanners are advisory, so bound worst-case runtime»).
 *   La carta e le scansioni partono dallo STESSO testo tagliato: ciò che la persona vede è sempre dentro ciò che si scansiona.
 *   ⛔ `scansionaIstruzioni` non si tocca (è condivisa); chiamata diretta di `minacceDellaRagione` resta su tutto il testo.
 */
const TETTO_GREZZO = 65_536;
const PRIMI_GREZZI = new RegExp(String.raw`^[\s\S]{0,${TETTO_GREZZO}}`, 'u');
const UNO_SPAZIO_DI_RIGA = new RegExp(SPAZI_DI_RIGA.source, 'u');
const UN_NASCOSTO = new RegExp(NASCOSTI.source, 'u');
export function ragioneAllIngresso(grezza) {
  if (typeof grezza !== 'string') return grezza;
  const testa = grezza.match(PRIMI_GREZZI)[0];
  let visti = 0;
  let dopoUnoSpazio = true; // gli spazi all'inizio la pulizia li toglie
  let fine = 0;
  for (const c of testa) {
    fine += c.length;
    const spazio = UNO_SPAZIO_DI_RIGA.test(c) || (!UN_NASCOSTO.test(c) && /\s/u.test(c));
    if (!spazio && UN_NASCOSTO.test(c)) continue;
    if (spazio) { if (dopoUnoSpazio) continue; dopoUnoSpazio = true; } else dopoUnoSpazio = false;
    visti += 1;
    if (visti >= TETTO_SCANSIONE) break;
  }
  return testa.slice(0, fine);
}
/** La ragione da mostrare (testo semplice, una riga, ≤ 200 caratteri) o `null`. */
export function ragioneDellaCarta(grezza) {
  return testoSemplice(grezza, RAGIONE_MASSIMA);
}
/** Testo semplice in una riga, senza controlli né invisibili (tolti PRIMA del taglio), al più `massimo` code point con «…»; o `null`. */
export function testoSemplice(grezza, massimo) {
  if (typeof grezza !== 'string') return null;
  const pulita = pulisci(grezza);
  if (!pulita) return null;
  const caratteri = [...pulita];
  return caratteri.length <= massimo ? pulita : `${caratteri.slice(0, massimo - 1).join('').trimEnd()}…`;
}

/*
 * Cura 5, aggiunta (Frontend via Desktop, 01/11 notte): la riga d'avviso mostra la FRASE che ha fatto scattare la scansione — il pezzo, mai
 *   la ragione intera: testo semplice (`testoSemplice`), al più 60 caratteri con «…». Prima gli schemi di pressione (il loro pezzo esatto);
 *   poi quelli di `scansionaIstruzioni`, che dice solo i codici: la finestra PIÙ CORTA che li fa scattare si trova con due ricerche
 *   binarie sulla stessa funzione pubblica (la fine più vicina, poi l'inizio più lontano: tutte e due monotone), senza copiarne le regole;
 *   per i soli caratteri invisibili, il pezzo intorno (20 caratteri per parte), pulito. Nessuno schema ⇒ `null`.
 */
export const FRASE_MASSIMA = 60;
export function fraseDellaRagione(grezza) {
  if (typeof grezza !== 'string' || !grezza) return null;
  /* REV8-02: gli schemi di pressione sul testo GIÀ pulito e piegato (un invisibile in mezzo alla frase non la nasconde più) */
  const piegata = testoPerGliSchemi(grezza);
  for (const regola of PRESSIONE_SULLA_CARTA) {
    const trovata = regola.exec(piegata);
    if (trovata) return testoSemplice(trovata[0], FRASE_MASSIMA);
  }
  const finestra = (testo, vale) => {
    if (!vale(testo, 0, testo.length)) return null;
    let basso = 1; let alto = testo.length;
    while (basso < alto) { const m = (basso + alto) >> 1; if (vale(testo, 0, m)) alto = m; else basso = m + 1; }
    const fine = basso;
    let da = 0; let a = fine - 1;
    while (da < a) { const m = (da + a + 1) >> 1; if (vale(testo, m, fine)) da = m; else a = m - 1; }
    return { inizio: da, fine };
  };
  const unIstruzione = (testo, s, e) => scansionaIstruzioni(testo.slice(s, e)).some((c) => c !== 'caratteri-invisibili');
  /* sul grezzo prima; se lo schema si vede solo col testo pulito (un invisibile lo spezzava), sul pulito */
  for (const testo of [grezza, pulisci(grezza)]) {
    const istruzione = finestra(testo, unIstruzione);
    if (istruzione) return testoSemplice(testo.slice(istruzione.inizio, istruzione.fine), FRASE_MASSIMA);
  }
  const invisibile = finestra(grezza, (testo, s, e) => scansionaIstruzioni(testo.slice(s, e)).includes('caratteri-invisibili'));
  if (invisibile) return testoSemplice(grezza.slice(Math.max(0, invisibile.inizio - 20), invisibile.fine + 20), FRASE_MASSIMA);
  return null;
}
/** Gli schemi d'istruzione nella ragione GREZZA (prima della pulizia: un bidi tolto si segnala lo stesso) e in quella PULITA (un
 *  invisibile in mezzo non nasconde lo schema, REV8-02); la pressione sul testo pulito e piegato; una parola che mescola alfabeti (giro 4).
 *  Senza doppioni. */
export function minacceDellaRagione(grezza) {
  if (typeof grezza !== 'string' || !grezza) return [];
  const motivi = [...scansionaIstruzioni(grezza), ...scansionaIstruzioni(pulisci(grezza))];
  if (PRESSIONE_SULLA_CARTA.some((r) => r.test(testoPerGliSchemi(grezza)))) motivi.push('pressione-sulla-carta');
  if (mescolaAlfabeti(grezza)) motivi.push('alfabeti-mescolati');
  return [...new Set(motivi)];
}

/* REV8-04: le revisioni restano di 5 cifre; il limite prenotato si legge dal file delle ricevute (vedi `creaServizioImpostazioni`) */
const REVISIONE_MINIMA = 10_000;
const REVISIONE_MASSIMA = 99_999;
const BLOCCO_REVISIONI = 1_000;
/** Il limite delle revisioni prenotate dall'avvio prima, o `null` (nessun file, file illeggibile, valore fuori forma). Una lettura sola,
 *  sincrona, alla nascita del servizio: il file è piccolo (al più 100 ricevute) e la base serve subito. */
/* PR21-I2 (revisione cloud, 04/11/2026): `incerto` quando il file C'È ma non si legge (EBUSY/EACCES/EPERM, JSON rotto): allora il limite
   sul disco può essere più alto di quello di questo avvio, e non si deve abbassare (vedi `caricaRicevute`). Solo ENOENT vale «nessun file». */
function leggiLimiteRevisioni(file) {
  if (!file) return { limite: null, incerto: false };
  try {
    const n = JSON.parse(readFileSync(file, 'utf8'))?.limiteRevisioni;
    return { limite: Number.isSafeInteger(n) && n >= REVISIONE_MINIMA ? n : null, incerto: false };
  } catch (e) { return { limite: null, incerto: e?.code !== 'ENOENT' }; }
}
/*
 * PR21-I2: la lettura del file delle ricevute RITENTA sui codici di contesa di Windows (antivirus, OneDrive, indicizzatore), con
 *   `setTimeout` e mai un ciclo stretto, come `rinominaConRitento` (research-store.mjs) — graceful-fs (README, letto il 04/11/2026) ritenta
 *   su EACCES/EPERM perché «antivirus software has locked» il file, ma solo il rename: la lettura la ritentiamo noi. 10 tentativi, 1,3 s.
 *   ⇒ `{ ricevute, limite }`, `{ ricevute: [], limite: null }` per ENOENT (si parte davvero vuoti), `null` se il file c'è e non si legge.
 *   `null` vuol dire NON SCRIVERE SOPRA: come Hermes `cron/jobs.py:1468-1469,1510-1519` (`_peek_jobs_unlocked`: «[] if missing, None if
 *   corrupt»; `_unmerged_disk_jobs`: «refusing to overwrite… writing over an unknown baseline would silently drop every job in it»).
 */
const CODICI_DI_CONTESA = new Set(['EPERM', 'EBUSY', 'EACCES']);
const LETTURA_TENTATIVI = 10;
/* 0.2.2-DL, giro 4 (revisione del giro 2, reperto 1): `perché` dice PERCHÉ il file non si è letto — `'rovinato'` (letto, ma il JSON è
   rotto) o `'non-letto'` (c'è e non si apre: bloccato oltre i ritenti, una cartella, i permessi). Per la migrazione della copia della
   finestra non è la stessa cosa: un file rovinato vale «nessuna ricevuta» (giudice v1304), uno non letto non decide niente. */
async function leggiFileRicevute(file, perché = () => {}, tentativi = LETTURA_TENTATIVI) {
  for (let tentativo = 0; ; tentativo += 1) {
    let testo;
    try {
      testo = await readFile(file, 'utf8');
    } catch (e) {
      if (e?.code === 'ENOENT') return { ricevute: [], limite: null };
      if (!CODICI_DI_CONTESA.has(e?.code) || tentativo >= tentativi - 1) { perché('non-letto'); return null; }
      await new Promise((risolvi) => { setTimeout(risolvi, Math.min(20 * (2 ** tentativo), 200)); });
      continue;
    }
    try {
      const letto = JSON.parse(testo);
      return { ricevute: Array.isArray(letto?.ricevute) ? letto.ricevute.slice(-RICEVUTE_MASSIME) : [], limite: Number.isSafeInteger(letto?.limiteRevisioni) ? letto.limiteRevisioni : null };
    } catch { perché('rovinato'); return null; }
  }
}

/* 0.2.2-DL, giro 3: il nome della migrazione nel timbro della copia della finestra (vedi `creaServizioImpostazioni`) */
export const MIGRAZIONE_DOMANDE_LARGHE = 'user-bubble-full-width-default-on-0.2.2';
/* giro 5: chi ha chiesto il valore che una migrazione rimasta in sospeso porta alle finestre aperte: nessuno, è l'aggiornamento */
const ORIGINE_AGGIORNAMENTO = Object.freeze({ tipo: 'aggiornamento' });
/** L'ultimo cambio di una voce nelle ricevute (in ordine di arrivo): `{ dopo, annullata }` o `null`. Una ricevuta fuori forma non conta. */
export function ultimoCambioDellaVoce(elenco, chiave) {
  if (!Array.isArray(elenco)) return null;
  for (let i = elenco.length - 1; i >= 0; i -= 1) {
    const r = elenco[i];
    const cambio = r && typeof r === 'object' && Array.isArray(r.cambi) ? r.cambi.find((c) => c && typeof c === 'object' && c.chiave === chiave) : null;
    if (cambio) return { dopo: cambio.dopo, annullata: Boolean(r.annullata) };
  }
  return null;
}

/** Il prezzo detto sulla carta e nell'esito: dollari per milione di token, ingresso / uscita. */
function frasePrezzo(p) {
  if (!p) return 'price unknown';
  const d = (n) => (Number.isFinite(n) ? `$${n >= 10 ? n.toFixed(0) : n.toFixed(2)}` : '?');
  return `${d(p.in)}/${d(p.out)} per million tokens in/out`;
}

/**
 * @param {{
 *   fonti?: Record<string, {leggi:Function, scrivi:Function}>, copiaFinestra?: ReturnType<import('./copia-finestra.mjs').creaCopiaFinestra>|null,
 *   prezzoDelModelloFn?: (id:string) => ({in:number,out:number}|null|Promise<…>), dove?: 'pc'|'telefono', fileRicevute?: string|null,
 *   adesso?: () => number, idFn?: () => string, attesaFinestraMs?: number, osservaCambioFn?: (ricevuta:object) => unknown,
 * }} p
 */
export function creaServizioImpostazioni({ fonti = {}, copiaFinestra = null, prezzoDelModelloFn = null, dove: doveDelServer = 'pc',
  fileRicevute = null, adesso = () => Date.now(), idFn = () => randomUUID(), attesaFinestraMs = ATTESA_FINESTRA_MS, osservaCambioFn = null,
  annotaPerIlModelloFn = null } = {}) {
  /*
   * Fase 8, cura 3 (forma `FORMA-FASE-8-TRE-CURE-2026-11-01.md` §3, D6): dopo un `set`/`undo` del MODELLO, la ricevuta va a chi scrive la
   *   notifica (`notifiche-scrittori.mjs`, `impostazioni`). Condizione 3 di Performance: DOPO l'esito e senza farlo aspettare ⇒ al giro
   *   dopo del ciclo (`setImmediate`), mai atteso; un osservatore che lancia, rifiuta o resta appeso non tocca l'esito.
   *   ⛔ Niente copia della ricevuta: il mutante che la toglieva (M3-14, 01/11) sopravviveva perché chi scrive la notifica legge solo campi
   *   che non cambiano dopo la nascita (l'Annulla segna `annullata`, che la notifica non legge). Un osservatore nuovo che la cambiasse
   *   dovrà copiarla lui.
   */
  /*
   * Giro 2 delle cure, voce 1 (02/11/2026 notte, scelta del Desktop per l'owner): il MODELLO viene informato di un cambio fatto dalla PERSONA
   *   (`/settings` dal PC o dal dispositivo, e il suo Annulla). Una nota in inglese per la conversazione dove la persona l'ha fatto
   *   (`ricevuta.sessionId`): la porta il registro col PROSSIMO messaggio della persona, in coda alla conversazione — mai nel testo di
   *   sistema (P2 di Performance), mai a metà giro (P1: vale dalla prossima richiesta). Come Hermes (`cli_model_switch_mixin.py:130-145`:
   *   la nota del cambio va col prossimo messaggio, «a mid-history system message would break providers and prompt caching») e Claude
   *   Code. Niente ricevuta nella nota (l'Annulla resta della persona). Chi annota e si rompe non cambia l'esito.
   */
  const annotaPerIlModello = (ricevuta, { annullo = false, trattenuto = null } = {}) => {
    if (typeof annotaPerIlModelloFn !== 'function' || !ricevuta || typeof ricevuta.sessionId !== 'string' || !ricevuta.sessionId) return;
    const cambi = Array.isArray(ricevuta.cambi) ? ricevuta.cambi : [];
    if (!cambi.length) return;
    const da = ricevuta.origine?.tipo === 'dispositivo' ? 'from a paired device' : 'on the computer';
    const quanti = cambi.length === 1 ? (annullo ? 'a settings change' : 'a setting') : (annullo ? `a change to ${cambi.length} settings` : `${cambi.length} settings`);
    const righe = cambi.map((c) => {
      const v = perChiave.get(c.chiave);
      return `${c.chiave}${v ? ` (${v.testo.en})` : ''}: ${mostra(c.prima)} → ${mostra(c.dopo)}${v ? ` (${dove(v)})` : ''}${trattenuto && c.chiave === trattenuto.chiave ? `,${fraseDelTrattenuto(trattenuto)}` : ''}`;
    });
    const testo = `The user ${annullo ? 'undid' : 'changed'} ${quanti} ${da}: ${righe.join('; ')}. It applies from this request.`;
    try { annotaPerIlModelloFn(ricevuta.sessionId, testo); } catch { /* la nota non cambia mai l'esito */ }
  };
  const notificaIlCambio = (ricevuta) => {
    if (typeof osservaCambioFn !== 'function') return;
    setImmediate(() => {
      try { Promise.resolve(osservaCambioFn(ricevuta)).catch(() => {}); } catch { /* la notifica non cambia mai l'esito */ }
    });
  };
  /* le voci che QUESTO ospite sa leggere e scrivere: una fonte assente toglie le sue voci (CLI e Mobile portano le loro) */
  const voci = Object.freeze(CATALOGO_IMPOSTAZIONI.filter((v) => (v.fonte === 'finestra' ? Boolean(copiaFinestra) : Boolean(fonti[v.fonte]))));
  const perChiave = new Map(voci.map((v) => [v.chiave, v]));
  const diSerieFinestra = Object.fromEntries(voci.filter((v) => v.fonte === 'finestra' && v.diSerie !== undefined).map((v) => [v.campo, valoreInterno(v, v.diSerie)]));

  /* ── revisione attesa: per voce (e per conversazione), un contatore che parte da una base d'avvio CORTA ──
     ⛔ Revisione del Desktop, prova dal vivo del 01/11 sera: la base era l'ora d'avvio in ms (13 cifre) e glm-5.3-flash l'ha
     ricopiata troncata a 5 (17935 per 1793561855572) ⇒ rifiuto «someone else changed it» FALSO e una domanda alla persona.
     Ora la base ha 5 cifre: (10 + secondi d'avvio mod 90) × 1000. Una revisione più piccola della base è di prima del riavvio e si
     rifiuta col suo motivo; una più grande del contatore non l'ha data TALOS. Limite dichiarato: due avvii nella stessa classe dei
     90 secondi hanno la stessa base (1 su 90), e allora una revisione vecchia passa SOLO se nessuna voce chiesta è cambiata dopo.
     ⛔ Revisione avversaria della fase 8, REV8-04 (01/11 notte): oltre 999 cambi osservati un avvio entrava nell'intervallo dell'avvio
     dopo, e una sua revisione vecchia passava sopra una scelta della persona fatta prima del riavvio. Ora, quando c'è il file delle
     ricevute, ci si scrive anche il LIMITE delle revisioni prenotate (a blocchi di 1000: una scrittura all'avvio e una ogni 1000 cambi),
     e l'avvio dopo parte da lì: sopra ogni revisione già data, quindi una vecchia è sempre «di prima del riavvio». Le cifre restano 5:
     arrivato in cima (99999) si riparte da 10000 — una revisione di ~90 avvii fa non la tiene nessun modello. Senza file (o col file
     illeggibile) la base resta quella dell'ora, col limite di prima dichiarato. */
  const dalTempo = (10 + (Math.floor(adesso() / 1000) % 90)) * 1000;
  const { limite: limiteLetto, incerto: limiteIncerto } = leggiLimiteRevisioni(fileRicevute);
  const inizio = limiteLetto === null ? dalTempo : limiteLetto + BLOCCO_REVISIONI - 1 <= REVISIONE_MASSIMA ? limiteLetto : REVISIONE_MINIMA;
  let contatore = inizio;
  let limiteRevisioni = inizio + BLOCCO_REVISIONI;
  const viste = new Map();
  function osserva(id, valore) {
    const impronta = JSON.stringify(valore ?? null);
    const vista = viste.get(id);
    if (!vista) { viste.set(id, { impronta, rev: inizio }); return inizio; }
    if (vista.impronta !== impronta) {
      contatore += 1; vista.impronta = impronta; vista.rev = contatore;
      /* REV8-04: prima di dare l'ultima revisione del blocco se ne prenota un altro, sul file */
      if (contatore >= limiteRevisioni - 1) { limiteRevisioni += BLOCCO_REVISIONI; void scriviFile(); }
    }
    return vista.rev;
  }
  const idVista = (v, sessionId) => (v.ambito === 'conversazione' ? `${sessionId}\u0000${v.chiave}` : v.chiave);

  /*
   * PR21-I6 (revisione cloud, 04/11/2026): piano → scrittura → ricevuta, UNO ALLA VOLTA per servizio. Prima il controllo di
   *   `expected_revision` e la rilettura dell'Annulla non erano atomici con la scrittura: una scelta della persona fatta mentre il modello
   *   scriveva veniva sovrascritta, e due Annulla insieme davano due ricevute. Come Hermes `cron/jobs.py:107-109` («In-process lock for
   *   load_jobs→modify→save_jobs cycles; without it, parallel tick threads' … calls clobber each other»): qui una coda di promesse, il
   *   piano si rifà DENTRO il turno. Ci passano il `set` e l'`undo` eseguiti del modello, `/settings` e l'Annulla della persona; l'anteprima
   *   e `list` no (non scrivono). Un turno che fallisce non ferma la coda.
   */
  let codaCambi = Promise.resolve();
  function inFila(lavoro) {
    const turno = codaCambi.then(() => lavoro());
    codaCambi = turno.catch(() => {});
    return turno;
  }

  /* ── lettura ── */
  async function leggiFonte(nome, contesto) {
    if (nome === 'finestra') {
      const copia = await copiaFinestra.leggi();
      return { ...diSerieFinestra, ...copia.valori };
    }
    return fonti[nome].leggi(contesto);
  }
  /** I valori pubblici di queste voci: `Map<chiave, valore>`; una fonte che non risponde dà `undefined` alle sue voci. */
  async function valoriDi(elenco, contesto) {
    const perFonte = new Map();
    for (const v of elenco) if (!perFonte.has(v.fonte)) perFonte.set(v.fonte, null);
    await Promise.all([...perFonte.keys()].map(async (nome) => {
      try { perFonte.set(nome, await leggiFonte(nome, contesto)); } catch (e) { perFonte.set(nome, { __errore: e }); }
    }));
    const valori = new Map();
    for (const v of elenco) {
      const letto = perFonte.get(v.fonte);
      if (!letto || letto.__errore) { valori.set(v.chiave, { errore: letto?.__errore ?? null }); continue; }
      const valore = valorePubblico(v, letto[v.campo]);
      /* REV8-03: il valore interno, se la fonte lo dà (Coordinazione), per la ricevuta e l'Annulla */
      const interni = letto[VALORI_INTERNI];
      valori.set(v.chiave, { valore, rev: osserva(idVista(v, contesto.sessionId), valore),
        ...(interni && Object.hasOwn(interni, v.campo) ? { interno: interni[v.campo] } : {}) });
    }
    return valori;
  }

  /* ── list ── */
  const conteggi = () => SEZIONI_IMPOSTAZIONI.map((s) => [s, voci.filter((v) => v.sezione === s).length]).filter(([, n]) => n > 0);
  const parole = (testo) => (String(testo ?? '').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []);
  const pagliaio = new Map(voci.map((v) => [v.chiave, `${v.chiave} ${v.sezione} ${v.testo.en} ${v.testo.it} ${v.valori ? v.valori.join(' ') : ''}`.toLowerCase()]));
  function trova({ sezione, query }) {
    let elenco = sezione ? voci.filter((v) => v.sezione === sezione) : voci;
    const q = typeof query === 'string' ? query.trim() : '';
    if (!q) return { elenco, esatta: false };
    const esatta = perChiave.get(q);
    if (esatta && (!sezione || esatta.sezione === sezione)) return { elenco: [esatta], esatta: true };
    const termini = parole(q);
    if (!termini.length) return { elenco: [], esatta: false };
    const tutti = elenco.filter((v) => termini.every((t) => pagliaio.get(v.chiave).includes(t)));
    if (tutti.length) return { elenco: tutti, esatta: false };
    const punteggi = elenco.map((v) => [v, termini.filter((t) => pagliaio.get(v.chiave).includes(t)).length]).filter(([, n]) => n > 0);
    elenco = punteggi.sort((a, b) => b[1] - a[1]).map(([v]) => v);
    return { elenco, esatta: false };
  }
  /*
   * 0.2.2-DL, giro 6 (controllore del giro 5, R-A; owner 10/11/2026 22:51) — LA PORTA DEL MODELLO DICE IL VERO. Finché la migrazione di
   *   una voce della finestra aspetta (`copia-finestra.mjs`, `sospesi`), il valore che il modello legge non è confermato: la finestra può
   *   mostrare l'opposto. `list` e `pick` lo dicono sulla riga di quella voce, e solo lì; leggere non decide mai niente (giudice v1377).
   *   Come Hermes `tools/set_theme_tool.py:3-4` («The renderer applies the values and answers with what it applied, so the model reports
   *   what the user sees»: l'attrezzo delle preferenze dice ciò che la persona vede, non ciò che il server crede).
   */
  const NOTA_NON_CONFERMATA = 'not confirmed yet: the Settings window may still show the opposite; a "set" to this same value, when the person asks for it, confirms it';
  async function chiaviNonConfermate() {
    if (typeof copiaFinestra?.nonConfermati !== 'function') return new Set();
    let campi = {};
    try { campi = await copiaFinestra.nonConfermati() ?? {}; } catch { campi = {}; }
    return new Set(voci.filter((v) => v.fonte === 'finestra' && Object.hasOwn(campi, v.campo)).map((v) => v.chiave));
  }
  function rigaDiVoce(v, letto, esatta, nonConfermata = false) {
    const valori = v.tipo === 'modello' ? `a model id${v.nullo ? ' or null' : ''}`
      : v.tipo === 'memoria' ? DESCRIZIONE_TOKEN // 11/11/2026: la memoria del modello (`conversation.modelMemory`)
      : v.tipo === 'sino' ? 'true or false'
        : esatta || v.valori.length <= VALORI_MOSTRATI + 2 ? `one of ${v.valori.join(', ')}`
          : `one of ${v.valori.slice(0, VALORI_MOSTRATI).join(', ')}, … (${v.valori.length}; query "${v.chiave}" for all)`;
    const attuale = letto?.errore !== undefined ? 'unreadable now' : mostra(letto?.valore);
    const tag = v.gruppo ? `, ${TAG_GRUPPO[v.gruppo]}` : '';
    return `- ${v.chiave} = ${attuale}; ${valori}; ${AMBITO_PUBBLICO[v.ambito]}${tag}${nonConfermata ? `; ${NOTA_NON_CONFERMATA}` : ''}`;
  }
  async function elenca(argomenti, contesto) {
    const sezione = typeof argomenti?.section === 'string' && argomenti.section.trim() ? argomenti.section.trim() : null;
    const query = typeof argomenti?.query === 'string' && argomenti.query.trim() ? argomenti.query.trim() : null;
    if (sezione && !SEZIONI_IMPOSTAZIONI.includes(sezione)) return rifiuto(`unknown section "${sezione}". Sections: ${conteggi().map(([s]) => s).join(', ')}.`);
    if (!sezione && !query) {
      return { ok: true, testo: `TALOS settings by section: ${conteggi().map(([s, n]) => `${s} (${n})`).join(', ')}. Call list with "section" or "query" to read them. Revision ${contatore}.` };
    }
    const { elenco, esatta } = trova({ sezione, query });
    const prese = elenco.slice(0, VOCI_MASSIME_IN_ELENCO);
    const letti = await valoriDi(prese, contesto);
    const sospese = await chiaviNonConfermate(); // giro 6: vuoto quando le due parti sono d'accordo, e le righe restano quelle di sempre
    const righe = prese.map((v) => rigaDiVoce(v, letti.get(v.chiave), esatta, sospese.has(v.chiave)));
    const termini = new Set(parole(query));
    const rimandi = query ? RIMANDI_IMPOSTAZIONI.filter((r) => r.parole.some((p) => termini.has(p))).map((r) => r.testo) : [];
    if (!righe.length && !rimandi.length) return { ok: true, testo: `No setting matches${query ? ` "${query}"` : ''}. Sections: ${conteggi().map(([s]) => s).join(', ')}. Revision ${contatore}.` };
    return { ok: true, testo: [...righe, ...rimandi,
      ...(elenco.length > prese.length ? [`${elenco.length - prese.length} more match: narrow the query.`] : []),
      `Revision ${contatore}: pass it as expected_revision to "set".`].join('\n') };
  }

  /* ── set e undo: il piano, poi la scrittura tutta o niente ── */
  const prezzo = async (id) => {
    if (typeof prezzoDelModelloFn !== 'function' || typeof id !== 'string' || !id || id === 'conversazione') return null;
    /* REV8-06: qualunque ospite: un prezzo vale solo con i due numeri finiti e non negativi, altrimenti «price unknown» (carta ed esito) */
    const buono = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
    try { const p = await prezzoDelModelloFn(id); return p && buono(p.in) && buono(p.out) ? p : null; } catch { return null; }
  };
  async function cambioDaMostrare(v, prima, dopo) {
    const base = { chiave: v.chiave, nome: { ...v.testo }, ambito: AMBITO_PUBBLICO[v.ambito], dove: v.dove === 'finestra' ? 'window' : 'server', gruppo: v.gruppo, prima, dopo };
    if (v.tipo === 'modello' && v.gruppo === 'costo') return { ...base, prezzo: { prima: await prezzo(prima), dopo: await prezzo(dopo) } };
    return base;
  }

  /**
   * `set`: dagli argomenti del modello al piano `{ cambi, revisione }`, o un rifiuto. Nessuna scrittura.
   * `revisioneFacoltativa` (solo `/settings` della persona, forma §2): senza `expected_revision` non si confronta nessuna revisione — è la
   *   persona stessa a scegliere adesso, come un clic nelle Impostazioni (Codex `expected_version: Option<String>`,
   *   `app-server-protocol/src/protocol/v2/config.rs:1185`); con una revisione, gli stessi controlli del modello.
   */
  async function pianoDelSet(argomenti, contesto, { revisioneFacoltativa = false } = {}) {
    const changes = Array.isArray(argomenti?.changes) ? argomenti.changes : null;
    if (!changes || changes.length === 0) return rifiutoCon('"set" needs "changes": [{ "key": "...", "value": ... }]. Call list first.', 'changes-invalid');
    if (changes.length > CAMBI_MASSIMI) return rifiutoCon(`at most ${CAMBI_MASSIMI} changes in one call.`, 'too-many-changes');
    const senzaRevisione = revisioneFacoltativa && (argomenti?.expected_revision === undefined || argomenti?.expected_revision === null);
    const attesa = senzaRevisione ? Number.POSITIVE_INFINITY : argomenti?.expected_revision;
    if (!senzaRevisione) {
      if (!Number.isSafeInteger(attesa)) return rifiutoCon('"set" needs "expected_revision": the revision that list returned. Call list first.', 'revision-invalid');
      if (attesa > contatore) return rifiutoCon(`revision ${attesa} is not one TALOS gave: call list again.`, 'revision-unknown');
      if (attesa < inizio) return rifiutoCon(`revision ${attesa} is from before TALOS restarted, or was copied wrong: call list again and pass its revision exactly.`, 'revision-before-restart');
    }
    const scope = argomenti?.scope;
    if (scope !== undefined && scope !== null && scope !== 'app' && scope !== 'conversation') return rifiutoCon('"scope" is "app" or "conversation".', 'scope-invalid');
    const scelte = [];
    for (const c of changes) {
      const v = perChiave.get(typeof c?.key === 'string' ? c.key.trim() : '');
      if (!v) return rifiutoCon(`unknown setting ${JSON.stringify(c?.key ?? null)}: use a key that list returned. Nothing was changed.`, 'unknown-setting');
      if (scelte.some((s) => s.v === v)) return rifiutoCon(`${v.chiave} appears twice. Nothing was changed.`, 'duplicate-setting', v.chiave);
      if (scope && AMBITO_PUBBLICO[v.ambito] !== scope) return rifiutoCon(`${v.chiave} applies to ${AMBITO_PUBBLICO[v.ambito] === 'app' ? 'the app' : 'this conversation'}, not to the ${scope}. Nothing was changed.`, 'scope-mismatch', v.chiave);
      if (v.ambito === 'conversazione' && !contesto.sessionId) return rifiutoCon(`${v.chiave} belongs to a conversation, and none is open here.`, 'conversation-needed', v.chiave);
      const controllo = controllaValore(v, c?.value);
      if (!controllo.ok) return rifiutoCon(`${controllo.motivo} Nothing was changed.`, 'invalid-value', v.chiave);
      scelte.push({ v, dopo: controllo.valore });
    }
    const letti = await valoriDi(scelte.map((s) => s.v), contesto);
    const cambi = [];
    for (const { v, dopo } of scelte) {
      const letto = letti.get(v.chiave);
      if (letto.errore !== undefined) return rifiutoCon(`${v.chiave} cannot be read now (${letto.errore?.message ?? 'error'}). Nothing was changed.`, 'setting-unreadable', v.chiave);
      if (letto.rev > attesa) return rifiutoCon(`${v.chiave} changed after revision ${attesa} (someone else changed it): call list again and ask the person. Nothing was changed.`, 'changed-meanwhile', v.chiave);
      if (!stesso(letto.valore, dopo)) cambi.push({ v, prima: letto.valore, dopo, ...(Object.hasOwn(letto, 'interno') ? { primaInterna: letto.interno } : {}) });
    }
    return { ok: true, cambi, gia: scelte.filter((s) => !cambi.some((c) => c.v === s.v)).map((s) => s.v.chiave) };
  }

  /* ── il canale delle finestre del PC ── */
  const ascoltatori = new Set();
  const inAttesa = new Map();
  function annunciaAlleFinestre(valori, revisione, origine) {
    if (ascoltatori.size === 0) return Promise.resolve(null);
    const richiestaId = idFn();
    const evento = { type: EVENTO_IMPOSTAZIONI_FINESTRA, destinatario: DESTINATARIO_FINESTRE_PC, richiestaId, valori, revisione, origine };
    const risposta = new Promise((risolvi) => {
      const orologio = setTimeout(() => { inAttesa.delete(richiestaId); risolvi(null); }, attesaFinestraMs);
      orologio.unref?.();
      inAttesa.set(richiestaId, (r) => { clearTimeout(orologio); inAttesa.delete(richiestaId); risolvi(r); });
    });
    for (const fn of [...ascoltatori]) { try { fn(evento); } catch { /* una finestra rotta non ferma le altre */ } }
    return risposta;
  }

  /* ── scrittura tutta o niente, con le ricevute ── */
  async function scriviCambi(cambi, contesto) {
    const perFonte = new Map();
    for (const c of cambi) {
      const gruppo = perFonte.get(c.v.fonte) ?? { avanti: {}, indietro: {}, interniAvanti: {}, interniIndietro: {} };
      gruppo.avanti[c.v.campo] = valoreInterno(c.v, c.dopo);
      gruppo.indietro[c.v.campo] = valoreInterno(c.v, c.prima);
      /* REV8-03: il valore interno da rimettere (l'Annulla: `dopoInterna`; il ritorno indietro di un errore: `primaInterna`) */
      if (Object.hasOwn(c, 'dopoInterna')) gruppo.interniAvanti[c.v.campo] = c.dopoInterna;
      if (Object.hasOwn(c, 'primaInterna')) gruppo.interniIndietro[c.v.campo] = c.primaInterna;
      perFonte.set(c.v.fonte, gruppo);
    }
    const fatte = [];
    let rispostaFinestra = null;
    let finestraAnnunciata = false;
    try {
      for (const [nome, gruppo] of perFonte) {
        if (nome === 'finestra') {
          const copia = await copiaFinestra.scriviCampi(gruppo.avanti);
          fatte.push([nome, gruppo]);
          finestraAnnunciata = ascoltatori.size > 0;
          rispostaFinestra = annunciaAlleFinestre(gruppo.avanti, copia.revisione, contesto.origine);
        } else {
          await fonti[nome].scrivi(gruppo.avanti, { ...contesto, interni: gruppo.interniAvanti });
          fatte.push([nome, gruppo]);
        }
      }
    } catch (e) {
      /* tutto o niente (come `applica` dei fornitori): ciò che era già scritto torna com'era, e si dice se non è tornato */
      const nonTornati = [];
      for (const [nome, gruppo] of fatte.reverse()) {
        try {
          if (nome === 'finestra') { const copia = await copiaFinestra.scriviCampi(gruppo.indietro); void annunciaAlleFinestre(gruppo.indietro, copia.revisione, contesto.origine); }
          else await fonti[nome].scrivi(gruppo.indietro, { ...contesto, interni: gruppo.interniIndietro });
        } catch { nonTornati.push(nome); }
      }
      throw errore(e?.code ?? 'SETTING_REFUSED', `nothing was changed: ${e?.message ?? 'the setting was refused'}${nonTornati.length ? ` (and a part already written could not be put back: ${nonTornati.join(', ')}; the person should check Settings)` : ''}.`);
    }
    const risposta = rispostaFinestra ? await rispostaFinestra : null;
    /* le revisioni vedono il valore nuovo: il prossimo `set` sulla stessa voce passa con la revisione che l'esito dice */
    for (const c of cambi) osserva(idVista(c.v, contesto.sessionId), c.dopo);
    return { risposta, finestraAnnunciata };
  }

  /*
   * Giro 2, D4 (giudice v1458/v1461, owner 13:08): l'Accesso pieno scelto e TRATTENUTO dalla fiducia della cartella. La scelta resta quella
   *   (la ricevuta e l'Annulla la tengono), ma la persona e il modello leggono il modo VERO: la fonte della conversazione lo dice dopo la
   *   scrittura (`trattenuto`: in attesa della risposta, o cartella col «No»). `{ chiave, motivo, vale }` o null. Come Codex, che dice il
   *   modo in vigore e non quello chiesto (`permission_popups.rs:340`, la conferma prima di salire a full-access).
   */
  async function trattenutoDopo(cambi, contesto) {
    const c = cambi.find((x) => x.v?.chiave === 'conversation.permissions' && x.dopo === 'fullAccess');
    if (!c || typeof fonti.sessione?.leggi !== 'function' || !contesto?.sessionId) return null;
    let letto = null;
    try { letto = await fonti.sessione.leggi(contesto); } catch { return null; }
    if (!letto?.trattenuto || letto.permessi === 'Full access') return null;
    return { chiave: c.v.chiave, motivo: letto.trattenuto, vale: valorePubblico(c.v, letto.permessi) };
  }
  const fraseDelTrattenuto = (t) => (t.motivo === 'cartella-non-fidata'
    ? ` but Full access is held: the person does not trust this folder, so here this conversation works as ${mostra(t.vale)} (edits and commands ask first).`
    : ` but Full access is held: the person has not answered yet whether they trust this folder, so for now this conversation works as ${mostra(t.vale)} (edits and commands ask first).`);
  function codaDellaFinestra(c, esito) {
    if (c.v.fonte !== 'finestra') return '';
    if (!esito.finestraAnnunciata) return ' No TALOS window is open: it applies when one opens.';
    const r = esito.risposta;
    if (!r) return ' Saved; no window confirmed it yet.';
    if (r.nonApplicati && Object.hasOwn(r.nonApplicati, c.v.campo)) return ` The window did not apply it: ${String(r.nonApplicati[c.v.campo]).slice(0, 120)}.`;
    if (r.applicati && Object.hasOwn(r.applicati, c.v.campo)) {
      const visto = valorePubblico(c.v, r.applicati[c.v.campo]);
      return stesso(visto, c.dopo) ? ' The open window applied it.' : ` The open window shows ${mostra(visto)}.`;
    }
    return ' Saved; the window did not say.';
  }

  /* ricevute: in memoria e (se c'è il file) sul disco, le ultime 100 */
  const ricevute = [];
  let codaRicevute = Promise.resolve();
  /* PR21-I5: una promessa sola per tutti — prima `ricevute = []` stava PRIMA dell'attesa, e una ricevuta spinta in quel momento finiva
     in un elenco che la lettura poi sostituiva. Ora l'elenco è uno (si riempie, mai si rimpiazza) e chi arriva aspetta la stessa lettura. */
  let caricamento = null;
  /* PR21-I2: vero quando il file c'è ma non si è letto — allora NON si scrive (le ricevute nuove vivono in memoria), e a ogni scrittura
     si riprova a leggerlo; letto, le sue ricevute vanno davanti a quelle nuove. */
  let fileDaRileggere = false;
  /* giro 4: perché l'ultima lettura non è riuscita (`'rovinato'` o `'non-letto'`, vedi `leggiFileRicevute`) */
  let perchéNonLetto = null;
  const segnaPerché = (motivo) => { perchéNonLetto = motivo; };
  let avvisato = false;
  function unisciDalDisco(letto) {
    ricevute.unshift(...letto.ricevute);
    if (ricevute.length > RICEVUTE_MASSIME) ricevute.splice(0, ricevute.length - RICEVUTE_MASSIME);
    /* il limite prenotato da un avvio prima non scende mai per colpa di una lettura mancata all'avvio */
    if (limiteIncerto && Number.isSafeInteger(letto.limite) && letto.limite > limiteRevisioni) limiteRevisioni = letto.limite;
  }
  function caricaRicevute() {
    caricamento ??= (async () => {
      if (!fileRicevute) return ricevute;
      const letto = await leggiFileRicevute(fileRicevute, segnaPerché);
      if (letto) unisciDalDisco(letto); else fileDaRileggere = true;
      return ricevute;
    })();
    return caricamento;
  }
  /* REV8-04: lo stesso file tiene le ricevute e il limite delle revisioni prenotate; le ricevute si caricano PRIMA di scrivere, così una
     prenotazione all'avvio non cancella quelle già sul disco. Il contenuto si costruisce quando tocca a lui: porta sempre l'ultimo limite. */
  /* 0.2.2-DL, giro 5: la rilettura del file non letto. La chiedono `scriviFile` (coi ritenti interi) e il ritento della migrazione qui
     sotto (un tentativo solo: chi cambia l'aspetto non aspetta 1,3 s a ogni clic), anche insieme: le ricevute del disco entrano in
     memoria UNA volta sola (`unisciDalDisco`), chi arriva secondo le trova già lì. ⇒ vero se adesso sono in memoria. */
  async function rileggi(tentativi = LETTURA_TENTATIVI) {
    if (!fileDaRileggere) return true;
    const letto = await leggiFileRicevute(fileRicevute, segnaPerché, tentativi);
    if (letto && fileDaRileggere) { fileDaRileggere = false; unisciDalDisco(letto); }
    return !fileDaRileggere;
  }
  function scriviFile() {
    if (!fileRicevute) return Promise.resolve();
    const lavoro = async () => {
      await caricaRicevute();
      if (fileDaRileggere) {
        if (!(await rileggi())) {
          if (!avvisato) { avvisato = true; console.warn(`[impostazioni] the receipts file exists but cannot be read; it is left untouched and new receipts stay in memory: ${fileRicevute}`); }
          return;
        }
        /* giro 5 (reperto D1c): le ricevute sono tornate leggibili ⇒ la migrazione rimasta «non decisa» riprova adesso, non al riavvio */
        try { await copiaFinestra?.ritentaMigrazioni?.(); } catch { /* la migrazione non ferma mai le ricevute */ }
      }
      await scriviAtomico(fileRicevute, `${JSON.stringify({ schema: 'talos.app-settings.receipts.v1', ricevute, limiteRevisioni }, null, 1)}\n`);
    };
    codaRicevute = codaRicevute.then(lavoro, lavoro).catch(() => {});
    return codaRicevute;
  }
  const salvaRicevute = scriviFile;
  void scriviFile(); // REV8-04: la prenotazione del primo blocco di questo avvio

  /*
   * 0.2.2-DL, giro 3 (decisione dell'owner del 09/11/2026 21:57, «Spente, rispetta la scelta»; giudice v1303-v1304) — «Domande a tutta
   *   larghezza» è accesa di serie dalla 0.2.2, ma la finestra delle 0.2.0 e 0.2.1 mandava al server l'aspetto INTERO alla prima apertura
   *   (`copia-sul-server.js`, `valoriDellaFinestra`): chi non l'ha mai toccata ha qui un `userBubbleFullWidth:false` esplicito, che
   *   vincerebbe sul valore di serie nuovo (`leggiFonte`). Al primo avvio, una volta sola (`migraUnaVolta`, timbro nel file della copia):
   *   · il false scritto prima del timbro si SCARTA (vale il valore di serie, accesa);
   *   · TRANNE se nelle ricevute l'ultimo cambio di quella voce è «→ false» e non è stato annullato: una scelta con la ricevuta (il `set`
   *     del modello, `/settings` della persona anche dal dispositivo, l'Annulla di un'accensione). Quel false RESTA, e la revisione
   *     della copia avanza: la finestra, che in locale non l'aveva scritto (salvataggio rado della 0.2.0) e oggi mostra accesa, trova una
   *     copia più nuova e si spegne;
   *   · spenta con l'interruttore della finestra non lascia ricevuta: si scarta (indistinguibile da chi non l'ha mai toccata).
   *   · Ricevute mancanti o rovinate (lette, JSON rotto o fuori forma) = nessuna ricevuta (il false si scarta), mai un errore all'avvio.
   *   · (giro 4, revisione del giro 2, reperto 1) Ricevute che ci sono ma NON SI LEGGONO (bloccate oltre i ritenti da un antivirus o da
   *     OneDrive, una cartella al loro posto, i permessi): la migrazione NON decide. `decidi` lancia ⇒ `'non-decisa'`: niente scarto,
   *     niente timbro, il disco resta, si riprova all'avvio dopo. Decidere su un elenco non letto perderebbe per sempre un false scelto
   *     con la ricevuta (la regola di `leggiFileRicevute`: «`null` vuol dire NON SCRIVERE SOPRA»). Come Hermes `cron/jobs.py:1468-1469`
   *     («`[]` if missing, `None` if corrupt (never shrink-merge against an unknown baseline)») e `:1511-1519` («fail closed: writing over
   *     an unknown baseline would silently drop every job in it»).
   *   · (0.2.2, giro 5, revisione del giro 3, reperto D1) Una migrazione non decisa NON aspetta il riavvio (`copia-finestra.mjs`, in
   *     testa): riprova quando `scriviFile` rilegge le ricevute, e prima di ogni scrittura della copia (qui con UNA lettura, senza i
   *     ritenti). Finché aspetta: la finestra che manda «accesa» non l'ha mai vista spenta (è il suo valore di serie): non si scrive sopra
   *     il false; la finestra che manda «spenta», e `/settings` della persona che la chiede spenta («già così», nessuna ricevuta),
   *     l'hanno scelta in questa versione: resta, col timbro (giro 6: anche il `set` del modello ESEGUITO allo stesso valore, vedi `confermaSeInSospeso`; mai la sua anteprima né una lettura). Quando si chiude dopo un'attesa, le finestre aperte ricevono il valore
   *     deciso (`talos.impostazioni-finestra`), sennò la prossima scheda mandata dalla finestra lo coprirebbe col suo.
   *     Se le ricevute non si leggono MAI, la finestra mostra accesa e il modello legge spenta finché una delle due porte non sceglie
   *     (misurato, FIN-05): NON si manda il false alla finestra prima di aver deciso, perché a chi non l'ha mai toccata resterebbe
   *     scritto in locale anche dopo lo scarto (misurato su una copia il 10/11/2026: finestra spenta e modello accesa a ogni avvio dopo).
   *   Le ricevute si leggono da `caricaRicevute` (il file `.impostazioni-ricevute.json`, `{ ricevute: [...] }` in ordine di arrivo: l'ultima
   *   è la più nuova; ogni ricevuta `{ cambi: [{ chiave, prima, dopo }], annullata }`). Un ospite senza copia della finestra (la CLI) non fa
   *   niente. Hermes `hermes_cli/config.py:2400-2403` (`_explicit_config_paths`: ciò che la persona ha scritto resta anche se uguale al
   *   valore di serie) e `:1240-1243` (timbro con la migrazione).
   */
  const vocePiena = perChiave.get('appearance.userBubbleFullWidth');
  if (vocePiena && vocePiena.fonte === 'finestra' && typeof copiaFinestra?.migraUnaVolta === 'function') {
    let rimandoDetto = false;
    void copiaFinestra.migraUnaVolta(MIGRAZIONE_DOMANDE_LARGHE, async (valori, { ritento = false } = {}) => {
      if (valori[vocePiena.campo] !== false) return { valori, avanza: false };
      let elenco = [];
      try { const lette = await caricaRicevute(); elenco = Array.isArray(lette) ? lette : []; } catch { elenco = []; }
      if (ritento && fileDaRileggere) await rileggi(1); // giro 5: al ritento si guarda di nuovo il disco (le lette entrano in `elenco`, che è l'elenco vivo)
      if (fileDaRileggere && perchéNonLetto !== 'rovinato') {
        if (!rimandoDetto) { rimandoDetto = true; console.warn(`[impostazioni] the receipts file exists but cannot be read: the full-width questions update waits until it can be read: ${fileRicevute}`); }
        throw Object.assign(new Error('receipts file not read'), { code: 'RECEIPTS_NOT_READ' });
      }
      const ultimo = ultimoCambioDellaVoce(elenco, vocePiena.chiave);
      if (ultimo && ultimo.dopo === false && !ultimo.annullata) return { valori, avanza: true };
      const { [vocePiena.campo]: _scartato, ...resto } = valori;
      return { valori: resto, avanza: false };
    }, {
      campi: [vocePiena.campo],
      /* giro 5: chiusa dopo un'attesa ⇒ le finestre aperte prendono il valore deciso (accesa di serie se il false è stato scartato) */
      quandoSiChiude: ({ revisione, valori }) => {
        const deciso = Object.hasOwn(valori, vocePiena.campo) ? valori[vocePiena.campo] : diSerieFinestra[vocePiena.campo];
        void annunciaAlleFinestre({ [vocePiena.campo]: deciso }, revisione, ORIGINE_AGGIORNAMENTO);
      },
    });
  }
  /* giro 5: la voce che la PERSONA chiede uguale a com'è («già così», `/settings`) mentre la sua migrazione aspetta è una scelta di
     questa versione: resta.
     giro 6 (R-A, owner 10/11/2026 22:51: «se la persona chiede di cambiarla, chiuda il disaccordo»): passa di qui anche il `set` del
     modello ESEGUITO allo stesso valore. Nel giro 5 no («senza carta il modello non decide»): ma così rispondeva «Nothing to change»
     mentre la finestra mostrava l'opposto, e la persona che gliel'aveva chiesta spenta la vedeva ancora accesa. Ora il valore che il
     modello legge (e che `list` dichiara «not confirmed yet») diventa quello di tutti, e la finestra aperta lo segue. Resta senza carta
     (0 carte in più; il valore non cambia per il modello). Giro 7 (K2): ma lascia la RICEVUTA di ciò che la finestra mostrava
     (`confermeVisibili`), e la persona lo rovescia con il suo «Annulla» o con un tocco sull'interruttore.
     ⇒ vero se una migrazione si è chiusa adesso. MAI dall'anteprima, da `list` o da `pick` (giudice v1377, (iii)). */
  async function confermaSeInSospeso(chiavi) {
    if (!vocePiena || !Array.isArray(chiavi) || !chiavi.includes(vocePiena.chiave) || typeof copiaFinestra?.confermaInSospeso !== 'function') return false;
    return (await copiaFinestra.confermaInSospeso([vocePiena.campo])) === true;
  }
  /*
   * 0.2.2-DL, giro 7 (controllore del giro 6, K2: R1 e R2) — CIÒ CHE LA PERSONA VEDE CAMBIARE HA LA SUA TRACCIA. Per il modello la
   *   conferma non cambia niente (legge già quel valore), ma la finestra, che finché la migrazione aspetta mostra il suo valore di serie,
   *   CAMBIA: l'interruttore passa da accesa a spenta. Prima quel cambio non aveva ricevuta, né «Cambiata da TALOS · Annulla», né
   *   notifica, e nel `set` misto la carta non lo nominava: meno traccia di un cambio senza carta in Accesso pieno. Ora le voci chieste
   *   uguali che il `set` confermerebbe e che la finestra mostra DIVERSE diventano cambi da mostrare `{ v, prima, dopo }`: `prima` è ciò
   *   che la finestra mostra (il valore di serie: finché la migrazione aspetta il campo non le arriva, `copia-finestra.mjs`, `leggi`; e
   *   una finestra che avesse mandato lo stesso valore l'avrebbe già chiusa), `dopo` ciò che il modello legge. Vanno sulla carta del
   *   `set` misto, nella ricevuta e nella risposta. Il `set` puro resta senza carta (regola 17: 0 carte in più). Sola lettura: non decide.
   *   Come WorkOS (blog «AI agent trace tampering and audit logs», letto l'11/11/2026): «Emit an audit event for every agent action that
   *   changes state, with the agent as the actor»; Hermes `tools/set_theme_tool.py:3-4` («the model reports what the user sees»).
   */
  async function confermeVisibili(chiavi, contesto) {
    if (!vocePiena || !Array.isArray(chiavi) || !chiavi.includes(vocePiena.chiave) || !(await chiaviNonConfermate()).has(vocePiena.chiave)) return [];
    const mostrata = valorePubblico(vocePiena, diSerieFinestra[vocePiena.campo]);
    const letta = (await valoriDi([vocePiena], contesto)).get(vocePiena.chiave);
    if (!letta || letta.errore !== undefined || stesso(mostrata, letta.valore)) return [];
    return [{ v: vocePiena, prima: mostrata, dopo: letta.valore }];
  }
  async function nuovaRicevuta({ cambi, contesto, annulla = null }) {
    const elenco = await caricaRicevute();
    /* REV8-03: il valore INTERNO di prima, per chiave, solo delle voci che lo hanno (Coordinazione). Sta sul disco con la ricevuta, così
       l'Annulla lo rimette anche dopo un riavvio; non esce mai dalle ricevute pubbliche (`ricevute()`). */
    const interni = Object.fromEntries(cambi.filter((c) => Object.hasOwn(c, 'primaInterna')).map((c) => [c.v.chiave, c.primaInterna]));
    const ricevuta = { id: `set-${idFn().replace(/-/gu, '').slice(0, 12)}`, sessionId: contesto.sessionId ?? null, quando: new Date(adesso()).toISOString(),
      origine: contesto.origine, confermatoDa: contesto.confermatoDa ?? null, cambi: cambi.map((c) => ({ chiave: c.v.chiave, ambito: AMBITO_PUBBLICO[c.v.ambito], prima: c.prima, dopo: c.dopo })),
      ...(annulla ? { annulla } : {}), annullata: null, ...(Object.keys(interni).length ? { interni } : {}) };
    elenco.push(ricevuta);
    if (elenco.length > RICEVUTE_MASSIME) elenco.splice(0, elenco.length - RICEVUTE_MASSIME);
    await salvaRicevute();
    return ricevuta;
  }

  /** `undo`: il piano dalla ricevuta. Ogni voce deve valere ancora ciò che il cambio aveva messo; altrimenti niente. */
  async function pianoDellUndo(receiptId, contesto, { soloLaSuaConversazione }) {
    const elenco = await caricaRicevute();
    const ricevuta = typeof receiptId === 'string' ? elenco.find((r) => r.id === receiptId.trim()) : null;
    if (!ricevuta) return rifiuto(`no change with receipt ${JSON.stringify(receiptId ?? null)}: undo needs the receipt id that a "set" returned.`);
    if (soloLaSuaConversazione && ricevuta.sessionId !== (contesto.sessionId ?? null)) return rifiuto('that change was made in another conversation: only the person can undo it from Settings.');
    if (ricevuta.annullata) return rifiuto(`the change ${ricevuta.id} was already undone.`);
    const daRiportare = [];
    for (const c of ricevuta.cambi) {
      const v = perChiave.get(c.chiave);
      if (!v) return rifiuto(`${c.chiave} cannot be changed on this server anymore. Nothing was changed.`);
      /* REV8-03: si rimette il valore interno di prima quando la ricevuta lo porta («nega» resta «nega», mai allargato a «chiedi») */
      const interno = ricevuta.interni && Object.hasOwn(ricevuta.interni, c.chiave) ? { dopoInterna: ricevuta.interni[c.chiave] } : {};
      daRiportare.push({ v, prima: c.dopo, dopo: c.prima, ...interno });
    }
    const contestoVoci = { ...contesto, sessionId: ricevuta.sessionId ?? contesto.sessionId };
    const letti = await valoriDi(daRiportare.map((d) => d.v), contestoVoci);
    for (const d of daRiportare) {
      const letto = letti.get(d.v.chiave);
      if (letto.errore !== undefined) return rifiuto(`${d.v.chiave} cannot be read now. Nothing was changed.`);
      if (!stesso(letto.valore, d.prima)) return rifiuto(`${d.v.chiave} changed again since (now ${mostra(letto.valore)}): undo would overwrite a newer choice. Nothing was changed.`);
      if (Object.hasOwn(letto, 'interno')) d.primaInterna = letto.interno; // per la ricevuta dell'Annulla (e un Annulla dell'Annulla)
    }
    return { ok: true, ricevuta, cambi: daRiportare, contesto: contestoVoci };
  }

  async function eseguiUndo(piano, origine, confermatoDa = null) {
    const esito = await scriviCambi(piano.cambi, { ...piano.contesto, origine, confermatoDa });
    piano.ricevuta.annullata = { quando: new Date(adesso()).toISOString(), origine, confermatoDa };
    const nuova = await nuovaRicevuta({ cambi: piano.cambi, contesto: { ...piano.contesto, origine, confermatoDa }, annulla: piano.ricevuta.id });
    return { esito, nuova };
  }

  const cartaDi = (azione, cambi, extra = {}) => ({
    tipo: NOME_ATTREZZO_IMPOSTAZIONI, azione, dove: doveDelServer, cambi, ...extra,
  });

  /**
   * L'ospite del nucleo per UNA conversazione: `onImpostazioniFn(nome, argomenti, {fase, toolCallId})`, con le due fasi dei fornitori
   *   (`anteprima` ⇒ `{ok, carta, azione}` o il rifiuto subito; `esegui` ⇒ `{ok, testo}`). La carta la DECIDE il nucleo (Accesso pieno,
   *   gruppi): qui si dice solo che c'è un cambio da approvare.
   */
  function perLaSessione({ sessionId = null, dispositivoFn = null, confermatoDaFn = null } = {}) {
    const origine = () => {
      let dispositivoId = null;
      try { dispositivoId = typeof dispositivoFn === 'function' ? dispositivoFn() ?? null : null; } catch { dispositivoId = null; }
      return { tipo: 'modello', sessionId, dispositivoId };
    };
    /* Cura 2: chi ha confermato QUESTA chiamata. `senzaCarta` lo dice il nucleo (Accesso pieno, nessuna carta); altrimenti lo dice chi
       ospita, per l'id della chiamata (`confermatoDaFn`: il registro, dalla rotta che ha ricevuto il sì). Letto UNA volta all'esecuzione. */
    /* 02/11/2026 notte (Desktop per l'owner, domanda 3 delle cure REV8): in Accesso pieno una chiamata scritta come TESTO ha avuto la
       carta del testo, e la persona ci ha detto sì (il registro lo segna sull'id della chiamata promossa, CS-R4). La ricevuta dice lei,
       non «nessuno»: è più vera. Senza quel sì resta «nessuno, accesso pieno». */
    const confermaDi = (toolCallId, senzaCarta) => {
      let daChi = null;
      if (typeof confermatoDaFn === 'function' && typeof toolCallId === 'string' && toolCallId) {
        try { daChi = confermatoDaValido(confermatoDaFn(toolCallId)); } catch { daChi = null; }
      }
      if (senzaCarta === true) return daChi ?? { ...CONFERMA_SENZA_CARTA };
      return daChi;
    };
    return async function onImpostazioniFn(nome, argomenti = {}, { fase = 'esegui', toolCallId = null, senzaCarta = false } = {}) {
      try {
        if (nome !== NOME_ATTREZZO_IMPOSTAZIONI) return rifiuto(`unknown tool ${nome}.`);
        const azione = typeof argomenti?.action === 'string' ? argomenti.action.trim().toLowerCase() : '';
        const contesto = { sessionId };
        if (azione === 'list') return fase === 'anteprima' ? { ok: true, carta: false } : elenca(argomenti, contesto);
        if (azione === 'pick') {
          /* La carta di scelta (Hermes `set_theme picker`) aspetta il bozzetto del Frontend: oggi `pick` dà le scelte, e la domanda alla
             persona la fa il modello con ask_user_question. Non cambia niente. */
          if (fase === 'anteprima') return { ok: true, carta: false };
          const v = perChiave.get(typeof argomenti?.key === 'string' ? argomenti.key.trim() : '');
          if (!v) return rifiuto('"pick" needs "key": a key that list returned.');
          const letto = (await valoriDi([v], contesto)).get(v.chiave);
          const scelte = v.tipo === 'sino' ? 'true, false' : v.tipo === 'modello' ? 'a model id from the model selector' : v.tipo === 'memoria' ? DESCRIZIONE_TOKEN : v.valori.join(', ');
          const sospesa = (await chiaviNonConfermate()).has(v.chiave) ? ` N${NOTA_NON_CONFERMATA.slice(1)}.` : ''; // giro 6: dirlo non decide niente
          return { ok: true, testo: `${v.chiave} (${v.testo.en}) is ${mostra(letto?.valore)}.${sospesa} Choices: ${scelte}. Ask the person with ask_user_question, then call "set" with their choice.` };
        }
        if (azione !== 'set' && azione !== 'undo') return rifiuto('app_settings needs action "list", "set", "pick" or "undo".');
        /* PR21-I6: l'esecuzione aspetta il suo turno; l'anteprima no */
        return fase === 'anteprima' ? await setOUndo(azione, argomenti, contesto, fase, toolCallId, senzaCarta)
          : await inFila(() => setOUndo(azione, argomenti, contesto, fase, toolCallId, senzaCarta));
      } catch (e) {
        if (e && typeof e.message === 'string' && typeof e.code === 'string') return rifiuto(e.message);
        throw e;
      }
    };
    async function setOUndo(azione, argomentiGrezzi, contesto, fase, toolCallId, senzaCarta) {
        /* PR21-I4 (revisione cloud, 04/11/2026): la ragione si taglia UNA volta qui, prima di ogni scansione (`ragioneAllIngresso`) */
        const argomenti = argomentiGrezzi && typeof argomentiGrezzi === 'object' && Object.hasOwn(argomentiGrezzi, 'reason')
          ? { ...argomentiGrezzi, reason: ragioneAllIngresso(argomentiGrezzi.reason) } : argomentiGrezzi;
        if (azione === 'set') {
          const piano = await pianoDelSet(argomenti, contesto);
          if (!piano.ok) return rifiuto(piano.messaggio); // al modello solo la frase: motivo e voce sono della rotta della persona
          if (!piano.cambi.length && fase === 'anteprima') return { ok: true, carta: false }; // regola 17: il `set` puro resta senza carta
          /* giro 6 (R-A): solo all'ESECUZIONE, una voce chiesta uguale mentre la sua migrazione aspetta si conferma.
             giro 7 (K2): ciò che la finestra mostrava e ora cambia (`confermeVisibili`, letto PRIMA della conferma) va sulla carta del
             `set` misto (sola lettura) e, eseguito, nella ricevuta e nella risposta, come ogni cambio del modello. */
          const visibili = await confermeVisibili(piano.gia, contesto);
          let confermati = [];
          let confermata = null;
          if (fase !== 'anteprima' && await confermaSeInSospeso(piano.gia)) {
            confermati = visibili;
            if (!confermati.length) { // la finestra la mostrava già così: per la persona niente cambia, ed è vero dire «stays»
              const letta = (await valoriDi([vocePiena], contesto)).get(vocePiena.chiave);
              confermata = `Confirmed: ${vocePiena.chiave} stays ${mostra(letta?.valore)}; it was not confirmed yet.`;
            }
          }
          if (!piano.cambi.length && !confermati.length) {
            if (confermata) return { ok: true, testo: confermata };
            return { ok: true, testo: `Nothing to change: ${piano.gia.join(', ')} already ${piano.gia.length === 1 ? 'has' : 'have'} that value.` };
          }
          const daMostrare = fase === 'anteprima' ? [...piano.cambi, ...visibili] : [...piano.cambi, ...confermati];
          const cambi = await Promise.all(daMostrare.map((c) => cambioDaMostrare(c.v, c.prima, c.dopo)));
          if (fase === 'anteprima') {
            /* cura 4: la ragione e il suo segnale vanno SOLO nell'anteprima della carta, accanto alle righe del catalogo */
            const ragione = ragioneDellaCarta(argomenti?.reason);
            const minacce = minacceDellaRagione(argomenti?.reason);
            return { ok: true, carta: true, azione: cartaDi('set', cambi, { revisione: argomenti.expected_revision,
              ...(ragione ? { ragione } : {}), ...(minacce.length ? { avvisi: { minacce } } : {}) }) };
          }
          /*
           * Fra la carta e il sì la persona può aver cambiato la stessa voce (forma §3.4: «la carta lo dice e non scrive sopra»): lo copre
           *   `pianoDelSet` qui sopra, rifatto all'esecuzione. Rilegge ogni voce da cambiare, e un valore diverso da quello visto riceve una
           *   revisione PIÙ ALTA di ogni revisione già data ⇒ `expected_revision` non basta più e il cambio si rifiuta (SRV-04). Un secondo
           *   confronto coi «prima» della carta era codice morto: il mutante che lo spegneva (M11, 01/11) sopravviveva per questo.
           */
          const o = origine();
          const confermatoDa = confermaDi(toolCallId, senzaCarta);
          const esito = await scriviCambi(piano.cambi, { ...contesto, origine: o, confermatoDa });
          /* giro 7 (K2): una ricevuta sola per tutto ciò che la persona vede cambiare, così il suo Annulla rimette anche la voce confermata */
          const ricevuta = await nuovaRicevuta({ cambi: daMostrare, contesto: { ...contesto, origine: o, confermatoDa } });
          /*
           * Cura 5 (owner 01/11 sera, «Fallo e avvisami dopo», non la consigliata): in Accesso pieno una ragione sospetta non ferma il cambio,
           *   che è già avvenuto senza carta; l'evento della conversazione porta i codici (`avvisi`) e la ricevuta, e la finestra disegna la
           *   riga d'avviso con «Annulla». Con la carta il segnale stava già nella carta (`azione.avvisi`): niente qui. Un guasto dell'avviso
           *   non cambia l'esito (il cambio è scritto).
           */
          if (senzaCarta === true && typeof fonti.sessione?.avvisa === 'function') {
            const avvisi = minacceDellaRagione(argomenti?.reason);
            if (avvisi.length) {
              try { await fonti.sessione.avvisa(sessionId, { origine: o, confermatoDa, avvisi, ricevuta: ricevuta.id, frase: fraseDellaRagione(argomenti?.reason) }); } catch { /* l'esito resta */ }
            }
          }
          const trattenuto = await trattenutoDopo(piano.cambi, contesto); // giro 2, D4: il modo vero, non solo quello chiesto
          const righe = cambi.map((c, i) => (i < piano.cambi.length
            ? `${c.chiave}: ${mostra(c.prima)} → ${mostra(c.dopo)} (${dove(piano.cambi[i].v)}${c.prezzo ? `; ${frasePrezzo(c.prezzo.prima)} → ${frasePrezzo(c.prezzo.dopo)}` : ''})${trattenuto && c.chiave === trattenuto.chiave ? `,${fraseDelTrattenuto(trattenuto)}` : '.'}${codaDellaFinestra(piano.cambi[i], esito)}`
            /* giro 7 (K2): il cambio come la persona lo vede, e perché per il modello il valore era già quello (mai «stays») */
            : `${c.chiave}: ${mostra(c.prima)} → ${mostra(c.dopo)} (${dove(daMostrare[i].v)}). It was not confirmed yet: TALOS read ${mostra(c.dopo)} while the Settings window showed ${mostra(c.prima)}; now the window shows ${mostra(c.dopo)} too.`));
          righe[righe.length - 1] += ` Receipt ${ricevuta.id} (undo with receipt_id). Revision ${contatore}.`;
          if (confermata) righe.push(confermata);
          notificaIlCambio(ricevuta); // cura 3: dopo l'esito, mai atteso
          return { ok: true, testo: righe.join('\n'), ricevuta: ricevuta.id };
        }
        if (azione === 'undo') {
          const piano = await pianoDellUndo(argomenti?.receipt_id, contesto, { soloLaSuaConversazione: true });
          if (!piano.ok) return piano;
          const cambi = await Promise.all(piano.cambi.map((c) => cambioDaMostrare(c.v, c.prima, c.dopo)));
          if (fase === 'anteprima') return { ok: true, carta: true, azione: cartaDi('undo', cambi, { ricevuta: piano.ricevuta.id }) };
          const { esito, nuova } = await eseguiUndo(piano, origine(), confermaDi(toolCallId, senzaCarta));
          const righe = cambi.map((c, i) => `${c.chiave}: ${mostra(c.prima)} → ${mostra(c.dopo)} (undone).${codaDellaFinestra(piano.cambi[i], esito)}`);
          righe[righe.length - 1] += ` Receipt ${nuova.id}. Revision ${contatore}.`;
          notificaIlCambio(nuova); // cura 3: l'Annulla del modello, come il set
          return { ok: true, testo: righe.join('\n'), ricevuta: nuova.id };
        }
        return rifiuto('app_settings needs action "list", "set", "pick" or "undo".');
    }
  }

  /*
   * ⭐ `/settings` DELLA PERSONA (fase 8, decisione 8 dell'owner; forma `FORMA-SETTINGS-DELLA-PERSONA-2026-11-02.md`, OK di CLI, Mobile e
   *   Performance il 02/11 notte). La porta della persona dal compositore, accanto a quella del modello (`app_settings` con la carta):
   *   la STESSA strada — `pianoDelSet` (catalogo, valori, gruppi, revisione), `scriviCambi` tutto o niente, la ricevuta con l'Annulla —
   *   senza carta, perché è la persona stessa (come un clic nelle Impostazioni).
   *   · `origine`: `{ tipo:'persona' }` dalla finestra del PC, `{ tipo:'dispositivo', dispositivoId }` dal ponte (CLI: 'persona' per
   *     lei vuol dire «al computer», `cli/src/protocol/v2/events.ts:446-450`); `confermatoDa` lo stampa la ROTTA, come per `approve`.
   *   · Mobile: dal dispositivo le voci dei gruppi `sicurezza` e `aggiornamenti` (`GRUPPI_CARTA_SEMPRE`, la stessa regola della carta del
   *     modello) si rifiutano PRIMA di leggere o scrivere, con `PC_CONFIRMATION_REQUIRED` e `{ chiave, nome, nomeEn, nomeIt }` (correzione
   *     del Mobile: NON `CONSENT_REQUIRED`, che sul telefono vuol dire «consenso su una cartella»).
   *   · Performance P1: un cambio a giro in corso vale dalla prossima richiesta — il giro ha già in mano modello, sforzo e attrezzi
   *     (passati per valore all'avvio, `agent-service.mjs`), e qui non si tocca niente del giro. Come Hermes (`cli_model_switch_mixin.py:
   *     130-145`: «a mid-history system message would break providers and prompt caching») e Claude Code (code.claude.com/docs/en/
   *     prompt-caching, letta il 02/11/2026: modello e sforzo stanno nella chiave della cache).
   *   · Performance P2: niente nel testo di sistema. ⛔ Giro 2, voce 1 (02/11 notte, scelta del Desktop per l'owner): il modello viene
   *     informato con una nota in CODA alla conversazione, col prossimo messaggio della persona (`annotaPerIlModello` qui sopra) — prima
   *     non gli arrivava niente. Resta anche l'evento della sessione (`talos.impostazioni-sessione`, CUSTOM).
   * ⇒ `{ ricevuta, cambi, gia, revisione }`; un rifiuto è un errore con `code`, `reason`, `params` e `stato` (la rotta li porta fuori).
   */
  const rifiutoDellaPersona = (code, stato, messaggio, reason, params = null) => Object.assign(errore(code, messaggio), { stato, reason, ...(params ? { params } : {}) });
  const MOTIVI_DELLA_REVISIONE = new Set(['revision-unknown', 'revision-before-restart', 'changed-meanwhile']);
  /*
   *   · Revisione della CLI, F1 (02/11/2026 notte, S2 provato): `serveLaCarta` lo mette la ROTTA quando il server gira SENZA gettone
   *     (avvii da sorgente come il 4174). Lì la guardia della finestra si fida di `Origin` e `Sec-Fetch-Site`, che un programma locale
   *     scrive come vuole — anche un comando lanciato dal modello nella sua shell. ⇒ Le voci dei gruppi a carta sempre si trattano come
   *     dal dispositivo: `PC_CONFIRMATION_REQUIRED`, niente scritto, e la finestra manda `/settings` al modello, che passa dalla carta
   *     (decisione del Desktop: la persona ottiene comunque il cambio, con la carta). Il motivo `card-required` lo distingue dal ponte.
   *     Fonti (02/11/2026): CVE-2026-55532 (securelayer7.net, PraisonAI: «start the server with --api-key» contro l'Origin falsificato);
   *     Hermes `hermes_cli/web_server.py:220-224` (clone 2026-11-01): un gettone di sessione per processo, messo nell'HTML della pagina.
   */
  /*
   * PR21-I1 (revisione cloud, 04/11/2026): lo stesso cancello per `/settings` e per l'Annulla della persona. Prima l'Annulla lo saltava:
   *   un dispositivo, o un programma locale che scrive l'`Origin` della finestra su un server senza gettone, annullava un cambio di
   *   sicurezza o degli aggiornamenti senza la conferma sul PC. Annullare è cambiare: stesse voci, stessi motivi, stesse parole.
   */
  function cancelloDelPc(chiavi, { origine, serveLaCarta, verbo = 'changed' }) {
    const dalDispositivo = origine?.tipo === 'dispositivo';
    if (!dalDispositivo && serveLaCarta !== true) return;
    for (const chiave of chiavi) {
      const v = perChiave.get(typeof chiave === 'string' ? chiave.trim() : '');
      if (!v || !GRUPPI_CARTA_SEMPRE.includes(v.gruppo)) continue;
      const params = { chiave: v.chiave, nome: v.testo.en, nomeEn: v.testo.en, nomeIt: v.testo.it };
      if (dalDispositivo) {
        throw rifiutoDellaPersona('PC_CONFIRMATION_REQUIRED', 403, `${v.chiave} can be ${verbo} from a device only after a confirmation on the computer. Nothing was changed.`,
          'pc-confirmation-required', params);
      }
      throw rifiutoDellaPersona('PC_CONFIRMATION_REQUIRED', 403, `${v.chiave} can be ${verbo} here only through the confirmation card. Nothing was changed.`,
        'card-required', params);
    }
  }
  async function applicaDallaPersona(argomenti = {}) { return inFila(() => applicaDallaPersonaInFila(argomenti)); }
  async function applicaDallaPersonaInFila({ sessionId = null, changes, expectedRevision = null, origine, confermatoDa = null, serveLaCarta = false } = {}) {
    if (Array.isArray(changes)) cancelloDelPc(changes.map((c) => c?.key), { origine, serveLaCarta });
    const contesto = { sessionId: typeof sessionId === 'string' && sessionId ? sessionId : null };
    const piano = await pianoDelSet({ changes, expected_revision: expectedRevision }, contesto, { revisioneFacoltativa: true });
    if (!piano.ok) {
      const params = piano.chiave ? { chiave: piano.chiave } : null;
      if (MOTIVI_DELLA_REVISIONE.has(piano.motivo)) throw rifiutoDellaPersona('SETTINGS_CHANGED_MEANWHILE', 409, piano.messaggio, piano.motivo, params);
      throw rifiutoDellaPersona('SETTINGS_APPLY_REFUSED', 400, piano.messaggio, piano.motivo, params);
    }
    await confermaSeInSospeso(piano.gia); // giro 5: «già così» è una scelta, se la migrazione aspetta
    if (!piano.cambi.length) return { ricevuta: null, cambi: [], gia: piano.gia, revisione: contatore };
    const pieno = { ...contesto, origine, confermatoDa };
    try {
      await scriviCambi(piano.cambi, pieno);
    } catch (e) {
      /* il rifiuto di una fonte (una fonte di ricerca senza chiave, un id di modello) col suo codice; la rotta tiene solo i codici dichiarati */
      throw rifiutoDellaPersona(typeof e?.code === 'string' ? e.code : 'SETTINGS_APPLY_REFUSED', 409, e?.message ?? 'nothing was changed.', 'setting-refused');
    }
    const ricevuta = await nuovaRicevuta({ cambi: piano.cambi, contesto: pieno });
    const trattenuto = await trattenutoDopo(piano.cambi, contesto); // giro 2, D4: la ricevuta e la nota dicono il modo vero
    notificaIlCambio(ricevuta); // la stessa strada del modello; chi scrive la notifica tiene i cambi del modello e quelli dal dispositivo (giro 2, voce 2)
    annotaPerIlModello(ricevuta, { trattenuto }); // giro 2, voce 1: il modello lo sa dal prossimo messaggio della persona
    return { ricevuta: ricevuta.id, cambi: ricevuta.cambi.map((c) => ({ ...c, ...(trattenuto && c.chiave === trattenuto.chiave ? { trattenuto: { motivo: trattenuto.motivo, vale: trattenuto.vale } } : {}) })),
      gia: piano.gia, revisione: contatore };
  }

  return Object.freeze({
    /** `/settings` della persona: dalla finestra del PC o dal ponte (la rotta `POST /api/v1/app-settings/apply`). Niente carta. */
    applicaDallaPersona,
    /** Il catalogo è caricato e c'è almeno una voce che questo ospite sa toccare: senza, l'attrezzo non si offre. */
    pronto: () => voci.length > 0,
    voci: () => voci,
    catalogo: () => ({ schema: 'talos.app-settings.catalog.v1', voci: catalogoPubblico(voci) }),
    elenca: (argomenti, contesto = {}) => elenca(argomenti, contesto),
    perLaSessione,
    /** L'Annulla della persona sulla riga dell'esito (o nelle Impostazioni): niente carta, la porta è sua. */
    /*  PR21-I1: `serveLaCarta` lo mette la rotta senza gettone, come per `/settings`; dal dispositivo il cancello vale sempre. */
    annullaDallaPersona: ({ receiptId, origine, serveLaCarta = false }) => inFila(async () => {
      const trovata = typeof receiptId === 'string' ? (await caricaRicevute()).find((r) => r.id === receiptId.trim()) : null;
      if (trovata && Array.isArray(trovata.cambi)) cancelloDelPc(trovata.cambi.map((c) => c?.chiave), { origine, serveLaCarta, verbo: 'undone' });
      const piano = await pianoDellUndo(receiptId, {}, { soloLaSuaConversazione: false });
      if (!piano.ok) throw errore('SETTINGS_UNDO_REFUSED', piano.messaggio);
      const { nuova } = await eseguiUndo(piano, origine);
      annotaPerIlModello(nuova, { annullo: true }); // giro 2, voce 1: anche l'Annulla della persona (anche di un cambio del modello)
      return { annullata: piano.ricevuta.id, ricevuta: nuova.id, cambi: nuova.cambi };
    }),
    /** Le ricevute, le più nuove prima: la base di «Cambiata da TALOS · Annulla» nelle Impostazioni (schermo: aspetta il bozzetto). */
    async ricevute() { return [...await caricaRicevute()].reverse().map(({ interni: _interni, ...r }) => structuredClone(r)); }, // REV8-03: i valori interni restano dentro
    /** Le scritture del file delle ricevute (e del limite delle revisioni) in coda finite: per chi chiude, e per le prove. */
    attendiScritture: () => codaRicevute,
    finestra: Object.freeze({
      /** Le finestre del PC si iscrivono (lo stream `/api/v1/remote/events`). */
      ascolta(fn) { ascoltatori.add(fn); return () => { ascoltatori.delete(fn); }; },
      /** La risposta di una finestra: la prima vince, le altre trovano la richiesta già chiusa. */
      risposta({ richiestaId, applicati = {}, nonApplicati = {} } = {}) {
        const chiudi = typeof richiestaId === 'string' ? inAttesa.get(richiestaId) : null;
        if (!chiudi) return { accettata: false };
        chiudi({ applicati: applicati && typeof applicati === 'object' ? applicati : {}, nonApplicati: nonApplicati && typeof nonApplicati === 'object' ? nonApplicati : {} });
        return { accettata: true };
      },
      leggi: () => (copiaFinestra ? copiaFinestra.leggi({ perLaFinestra: true }) : Promise.resolve(null)), // giro 5: senza ciò che una migrazione non ha ancora deciso
      /** La persona ha cambiato qualcosa nella finestra: la copia si aggiorna (e la revisione delle voci la vede alla prossima lettura). */
      dallaPersona: (valori) => (copiaFinestra ? copiaFinestra.dallaFinestra(valori) : Promise.resolve(null)),
    }),
  });
}
