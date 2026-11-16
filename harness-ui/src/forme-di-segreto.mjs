/*
 * ⭐ 14/10/2026, owner (regola unica per desktop e CLI): «I file con .example, .sample o .template si leggono senza chiedere, ma
 *   se dentro c'è qualcosa che sembra una chiave vera, TALOS chiede lo stesso.» Qui le FORME di una chiave vera.
 *
 * Sono le stesse della CLI, `cli/src/diagnostics/redact.ts:20-36` (Gate E12, owner 24/09/2026), portate in JavaScript senza
 * cambiarne una: confine sui due lati (un pezzo incollato ad altri caratteri da token non conta), un minimo di lunghezza e un tetto
 * a OGNI quantificatore (la nota ReDoS dello scanner di Qwen). `sk-` vuole una cifra, così `sk-your-key-here` e
 * `sk-learn-compatible-…` (un nome) restano leggibili; `ASIA` c'è perché Hermes, il sanificatore di Codex e Gemini la mancano.
 * Fonti della CLI: Hermes `agent/redact.py:148-207`, Codex `doctor/output.rs:915-945` (22/09/2026), prefissi dei token GitLab
 * (doc del 23/09/2026). Hermes il CONTENUTO dei file d'esempio non lo guarda affatto (`agent/file_safety.py:409` manda a leggere
 * `.env.example` «instead»): questa è la parte in più.
 * ⛔ Il segnaposto non è una chiave: senza una cifra, sotto la lunghezza minima o incollato ad altro testo non scatta. Una forma
 *   vera di aspetto ma finta (`sk-proj-0000…` lunga) fa chiedere: una domanda in più, mai un blocco.
 * ⛔ Limite DICHIARATO (nota di Nino2, 14/10/2026): si cercano solo FORME riconoscibili. Una coppia `PASSWORD=valore` (o
 *   `DB_PASS: hunter2`) con un valore senza forma non scatta: è una scelta, non un buco — una regola sul NOME della variabile
 *   farebbe chiedere su ogni `.env.example` scritto bene (`PASSWORD=changeme`), e un sì cliccato senza leggere non protegge.
 */
const T = 'A-Za-z0-9_\\-'; // caratteri da token: una corrispondenza non può essere incollata ad altri sui due lati
const confinata = (sorgente) => new RegExp(`(?<![${T}])(?:${sorgente})(?![${T}])`, 'u');
const DASH5 = '-{5}';
const ETICHETTA_PRIVATA = '[A-Z0-9 ]{0,40}PRIVATE KEY(?: BLOCK)?';

export const FORME_DI_SEGRETO = Object.freeze([
  // l'inizio di un blocco PEM privato basta: un blocco tagliato prima della sua fine resta una chiave privata
  new RegExp(`${DASH5}BEGIN ${ETICHETTA_PRIVATA}${DASH5}`, 'u'),
  confinata('eyJ[A-Za-z0-9_-]{8,4096}\\.eyJ[A-Za-z0-9_-]{8,8192}\\.[A-Za-z0-9_-]{10,4096}'), // JWT: tre segmenti base64url
  confinata('sk-(?=[A-Za-z0-9_-]{0,255}\\d)[A-Za-z0-9_-]{20,256}'), // OpenAI, Anthropic, OpenRouter
  confinata('gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{30,255}'),
  confinata('gl(?:pat|oas|dt|rtr|rt|cbt|ptt|ft|imt|agent|wt|soat|ffct)-[A-Za-z0-9_-]{20,255}'),
  confinata('xox[abprs]-[A-Za-z0-9-]{10,255}|xapp-[A-Za-z0-9-]{10,255}'),
  confinata('AIza[A-Za-z0-9_-]{35,64}'),
  confinata('(?:AKIA|ASIA)[A-Z0-9]{16}'),
  confinata('hf_[A-Za-z0-9]{30,255}|npm_[A-Za-z0-9]{36,255}'),
  /* REV-ESEMPI-06 (revisione del bugfixer, 14/10/2026): `BEARER` di `redact.ts:39` — 20+ caratteri token68 con una cifra dopo
     «Bearer», così «the bearer of bad news» resta prosa. */
  /(?<![A-Za-z0-9])bearer[ \t]+(?=[A-Za-z0-9._~+/-]{0,4095}\d)[A-Za-z0-9._~+/-]{20,4096}=*(?![A-Za-z0-9._~+/=-])/iu,
  /* Riserva della stessa revisione: forme che la CLI non ha e Hermes sì (`agent/redact.py:141-215`, clone 2026-10-07), coi confini e
     i tetti della CLI. Da proporre anche alla CLI: la regola è una per tutti e due. */
  confinata('gsk_[A-Za-z0-9]{20,255}'), // Groq
  confinata('(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,255}'), // Stripe
  confinata('xai-[A-Za-z0-9]{30,255}'), // xAI
  /* Revisione D del 29/10/2026 («Segnala un problema», concordata con la CLI): la chiave di Z.AI — 32 esadecimali, un punto, 16-64
     caratteri (la usiamo noi). Confinata e col tetto, come le altre. */
  confinata('[0-9a-f]{32}\\.[A-Za-z0-9]{16,64}'), // Z.AI
]);
/* Le chiavi d'ESEMPIO della documentazione, che stanno proprio nei file d'esempio: la chiave d'accesso di AWS
   (docs.aws.amazon.com, «AKIAIOSFODNN7EXAMPLE») e il token d'esempio di jwt.io. Non sono chiavi vere: non fanno chiedere. */
const SEGNAPOSTO_NOTI = Object.freeze(['AKIAIOSFODNN7EXAMPLE']);
const CARICO_DI_JWT_IO = '.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.';
const eUnSegnapostoNoto = (trovato) => SEGNAPOSTO_NOTI.includes(trovato) || trovato.includes(CARICO_DI_JWT_IO);

/*
 * Revisione del 20/10/2026 (D2, ripiego del riassunto): le stesse forme, OSCURATE nel testo invece che solo riconosciute — come
 *   Hermes passa il suo ripiego in `_redact_compaction_text` (`agent/context_compressor.py:3709`). In più le credenziali dentro un
 *   indirizzo (`https://utente:password@…`).
 * ⛔ Revisione D del 29/10/2026 («Segnala un problema», concordata con la CLI), tre cure misurate forma per forma
 *   (`tests/forme-di-segreto-oscura.test.mjs`):
 *   1. i segnaposto della documentazione SI OSCURANO: l'eccezione serve a non DOMANDARE su un file d'esempio
 *      (`formaDiSegretoNelTesto`, sotto, la tiene); per oscurare non costa niente, e in una pagina pubblica un segnaposto non si
 *      distingue da una chiave vera. `AKIAIOSFODNN7EXAMPLE` passava intero, da solo e dopo `AWS_ACCESS_KEY_ID=`. La CLI non lo esclude
 *      (`redact.ts`, SECRET_VALUE_PATTERNS);
 *   2. il blocco PEM si toglie INTERO, anche tagliato prima della riga END: prima si toglieva la sola riga BEGIN e il corpo base64
 *      restava. Le due forme sono quelle della CLI (`redact.ts`, le prime due di SECRET_VALUE_PATTERNS);
 *   3. il valore dopo un NOME di segreto (`OPENROUTER_API_KEY=…`, `export X_TOKEN='…'`, `db-password: …`): ogni identificatore che
 *      FINISCE col nome di un segreto; «key» da sola solo attaccata a un prefisso con `_` o `-` (la prosa «the key: Enter» resta). ⛔ I
 *      contatori restano leggibili (`MAX_TOKENS=4096`, `total_tokens: 1234`): un `tokens` al PLURALE è un contatore, come COUNTER_KEY
 *      della CLI (`redact.ts:3`). Solo qui: per DOMANDARE la regola sul nome non vale (vedi il «Limite DICHIARATO» in testa).
 */
export const SEGRETO_OSCURATO = '[redacted]';
const BLOCCHI_PEM = Object.freeze([
  new RegExp(`${DASH5}BEGIN ${ETICHETTA_PRIVATA}${DASH5}(?:(?!${DASH5})[\\s\\S]){0,16384}${DASH5}END ${ETICHETTA_PRIVATA}${DASH5}`, 'gu'),
  /* ⛔ ogni riga del corpo deve FINIRE lì (`(?=\r?\n|$)`): senza, la prima parola della riga dopo il blocco tagliato («il resto…»)
     passava per base64 e spariva. La CLI ha la stessa forma senza il confine: da riportare a lei. */
  /* Cura gemella della 0.2.2, giro 5 (revisore 1, ROSSO 4): il corpo di un blocco tagliato si toglie anche quando è UNA riga lunga
     (fino a 16.384, il tetto del blocco intero), attaccato all'intestazione senza a capo, o con gli a capo scritti come `\n` dentro un
     testo JSON (la `private_key` di un file di servizio); una riga finisce a un a capo, a una virgoletta o alla fine del testo, mai a
     uno spazio, così «il resto…» della riga dopo resta. Prima restavano in chiaro il corpo su una riga e quello attaccato. */
  new RegExp(String.raw`${DASH5}BEGIN ${ETICHETTA_PRIVATA}${DASH5}(?:(?:\r?\n|(?:\\r)?\\n)?(?:[A-Za-z0-9+/=]{1,16384}|[A-Za-z][A-Za-z-]{0,31}: [^\r\n\\]{0,128})(?=\r?\n|(?:\\r)?\\n|$|["'])){0,1024}`, 'gu'),
]);
/* I NOMI di un segreto, in UN posto (cura gemella della 0.2.2, giro 3, giudice v1853 punto 2): li usano il valore dopo un nome nel
   testo, il campo JSON dentro un testo e il nome di un CAMPO (`nomeDiCampoSegreto`: la carta di un connettore nel nucleo e la carta
   «dal testo» nella pagina).
 * Giro 5 (revisore 1, ROSSO 4; giudice v1878, condizione 2), come Hermes E OLTRE:
 *   - come Hermes `agent/redact.py:748-761` (`_is_python_repr_secret_key`, suffisso letto senza maiuscole): la parola del segreto alla
 *     FINE del nome, anche attaccata (`clientsecret`, `dbpassword`, `githubtoken`); i nomi interi di Hermes (`:451`, `_JSON_KEY_NAMES`:
 *     `bearer`, `secret_value`, `raw_secret`, `secret_input`, `key_material`);
 *   - in più di Hermes: `passphrase`, `privatekey`/`private_key`, `cookie(s)`, i plurali `secrets`, `passwords`, `api_keys` (un
 *     `secrets: {db: …}` si oscura intero), i caratteri invisibili tolti prima di leggere il nome (`pass\u200bword` è `password`) e gli
 *     spazi ai lati;
 *   - ⛔ i nomi onesti restano leggibili perché la parola deve FINIRE il nome: `token_limit`, `password_hint`, `cookie_policy`,
 *     `secretary`; `tokens`, `max_tokens` sono contatori (il plurale di «token» non è nell'elenco); «key» da sola solo dopo `_` o `-`
 *     (`monkey`, `keyboard` restano). `cookie` è un segreto, `cookie_policy` no: è lo stesso confine di `token` e `token_limit`. */
const SUFFISSI_DI_SEGRETO = 'api[_-]?keys?|token|secrets?|passwords?|passwd|passphrase|private[_-]?keys?|credentials?|cookies?';
const NOMI_INTERI_DI_SEGRETO = 'pwd|bearer|secret[_-]?value|raw[_-]?secret|secret[_-]?input|key[_-]?material';
/* ⛔ Giro 5 (revisore 1, ROSSO 1): il riconoscitore era QUADRATICO. Guardava a sinistra solo `[A-Za-z0-9]`, quindi ripartiva dopo ogni
   «_» o «-» e rileggeva il resto del nome: 4 valori «a-»×50.000 costavano 2.821 ms. Ora un nome parte solo dove a sinistra non c'è un
   carattere da nome (`[A-Za-z0-9_-]`), i trattini in testa e i separatori doppi stanno DENTRO il nome, e ogni pezzo è «lettere poi
   separatori» (due classi disgiunte, un solo modo di dividere): ogni nome si legge una volta, lineare. Il motore di V8 senza
   ritorni indietro non copre gli sguardi a sinistra (proposta TC39 «linear matching», letta il 14/11/2026): la linearità sta nella forma. */
/* Nel TESTO la parola del segreto chiude un nome diviso da `_` o `-` (`DB_PASSWORD`, `x-api-key`), mai attaccata: misurato il 14/11 sullo
   stesso corpus (47.200 righe di codice e note), la forma attaccata oscurava `finestraToken = null`, `primoToken: {…}` in ogni riassunto. */
const NOME_SEPARATO = (suffissi) => String.raw`[_-]*(?:[A-Za-z0-9]+[_-]+)*(?:${suffissi}|${NOMI_INTERI_DI_SEGRETO})|[_-]*(?:[A-Za-z0-9]+[_-]+)+key`;
/* Il valore, la forma della base (0.2.1): fra virgolette fino alla virgoletta che chiude; senza la virgoletta che chiude si ferma a uno
   spazio, a `;` o a `,`, come un valore senza virgolette (Hermes `agent/redact.py:249`, `(\S+)`).
 * ⛔ Giro 6, strada stretta (revisore 1 dopo il giro 5, ROSSO 2; owner 14/11 17:03): la coda del giro 5 `(?:"|$)` prendeva tutto fino alla
 *   FINE del testo quando la virgoletta non chiude: `token="` seguito da un a capo nascondeva sulla carta il resto dell'argomento, senza il
 *   segno del taglio, e nel riassunto senza modello le azioni dopo. Torna il limite DICHIARATO del giro 3: di una password fra virgolette
 *   con spazi più lunga della finestra della carta resta in chiaro ciò che passa la prima parola (curato nella 0.2.3).
 * (nel testo libero non `credentials`: «credentials: see the docs» è prosa; come nome di campo sì)
 * ⛔ Giro 6: tornano i due nomi attaccati della base, `accessToken` e `authToken` (anche `_authToken=` di un `.npmrc`): il giro 5 li aveva
 *   persi, misurato sul corpus del giro 6 (`{ accessToken: accesso }`, `authToken: gettone`: oscurati nella base, in chiaro nel giro 5). */
const SUFFISSI_NEL_TESTO = `${SUFFISSI_DI_SEGRETO.replace('|credentials?', '')}|access[_-]?token|auth[_-]?token`;
export const VALORE_DOPO_UN_NOME_DI_SEGRETO = new RegExp(String.raw`(?<![A-Za-z0-9_-])((?:${NOME_SEPARATO(SUFFISSI_NEL_TESTO)})\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s;,]+)`, 'giu');
/* Giro 6 (revisore 1 dopo il giro 5, ROSSO 3): un valore sì/no (`true`, `false`, `yes`, `no`) sotto un nome che la BASE 0.2.1 non oscurava
   resta leggibile: `clear_cookies=true`, `include_secrets: true`, `list_api_keys: false`, i falsi positivi nati dai nomi nuovi del giro 5.
   Sotto un nome che la base oscurava già (`password: true`, `is_password: true`) resta oscurato come prima: nessun testo torna in chiaro.
   La regola della base è quella della pagina 0.2.1 (`carta-dal-testo.js`), letta sul nome com'è e col camelCase diviso. */
const VALORE_SI_NO = /^(?:true|false|yes|no)[)\]}]*$/iu;
const NOME_SEGRETO_DELLA_BASE = /(?:^|[_-])(?:api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password|passwd|pwd)$|[_-]key$/iu;
export function siNoLeggibile(nome, valore) {
  const siNo = typeof valore === 'boolean' || (typeof valore === 'string' && VALORE_SI_NO.test(valore));
  if (!siNo || typeof nome !== 'string') return false;
  const n = nome.replace(INVISIBILI, '').trim();
  return !NOME_SEGRETO_DELLA_BASE.test(n) && !NOME_SEGRETO_DELLA_BASE.test(n.replace(/([a-z0-9])([A-Z])/gu, '$1_$2'));
}
/* Il campo JSON (o Python) dentro un testo con un valore SENZA virgolette, per un nome diviso da `_` o `-` (`"pin_password": 1234`).
 * ⛔ Giro 6, strada stretta (revisore 1 dopo il giro 5, ROSSO 1): il campo col valore FRA virgolette del giro 5 (CAMPO_TRA_VIRGOLETTE, la
 *   forma di Hermes `agent/redact.py:451-456` col riferimento all'indietro sulle barre) è tolto: su una scala di campi `\\…\"password\\…\":
 *   \\…\"x` con le barre che calano rileggeva la riga per ogni campo (~D³): 37,6 ms su una finestra della carta, ~10 s su 246 KB letti dal
 *   telefono. Un `{"password": "…"}` dentro un testo torna come nella base: in chiaro, limite dichiarato curato nella 0.2.3. Questa forma
 *   parte solo dalla prima barra di una fila e il nome si legge una volta: lineare. */
const CON_AUTORIZZAZIONE = `${SUFFISSI_DI_SEGRETO}|authorization`;
const CAMPO_TRA_VIRGOLETTE_NUDO = new RegExp(String.raw`(?<!\\)(\\*["'])(${NOME_SEPARATO(CON_AUTORIZZAZIONE)})\1(\s*:\s*)(?![\\"'])([^\s,;}\]]+)`, 'giu');
/* Il nome di un campo di argomenti è già un nome di segreto: il valore si oscura intero, qualunque forma abbia (Hermes
   `tools/mcp_tool_handlers.py:87` `_mask_secret_fields`, che usa `agent/redact.py:462-503` `is_secret_field_name`). Per un campo,
   come Hermes, anche `authorization`; il camelCase si legge come `_` (`clientSecret` = `client_Secret`). */
const NOME_DI_CAMPO_SEGRETO = new RegExp(`(?:${SUFFISSI_DI_SEGRETO}|authorization)$|(?:^|[_-])(?:${NOMI_INTERI_DI_SEGRETO})$|[_-]key$`, 'iu');
const INVISIBILI = /[\p{Default_Ignorable_Code_Point}\p{Bidi_Control}]/gu;
export function nomeDiCampoSegreto(chiave) {
  return typeof chiave === 'string' && NOME_DI_CAMPO_SEGRETO.test(chiave.replace(INVISIBILI, '').trim().replace(/([a-z0-9])([A-Z])/gu, '$1_$2'));
}
/* Cura gemella della 0.2.2, giro 7 (revisore della pagina, punto 1; revisore 3, ROSSO 1): le maschere della carta di un connettore
   (`argomentiPerLaCarta`, talosHarness.mjs) su un valore intero, senza tagli, per chi MOSTRA degli argomenti fuori da quella carta: la riga
   dell'attrezzo nella conversazione, la carta della chiamata scritta come testo, la riga del terminale. Scende negli oggetti e nelle liste
   a ogni profondità: un nome di segreto con un valore non vuoto diventa «[redacted]» (un sì/no sotto un nome che la base non oscurava
   resta, `siNoLeggibile`), ogni testo e ogni nome passano da `oscuraFormeDiSegreto`. Come Hermes `tools/mcp_tool_handlers.py:89-93`
   (`_mask_secret_fields`, ricorsivo su dict e list). Un nome che dopo l'oscuramento ripete uno già scritto prende «(2)», come sulla
   carta. Oltre 64 livelli il resto è «…» (si legge, non si esplora; la carta ne mostra 8). Sempre un oggetto NUOVO.
 * ⛔ Giro 8 (revisore 1 dopo il giro 7, ROSSO H2 e oggetto condiviso; owner 14/11 23:49, giudice v1917-v1920): un BILANCIO di lavoro unico
 *   per chiamata. Prima il «(n)» si cercava da 2 per ogni nome (369 KB di nomi uguali dopo l'oscuramento: 77 s sulla riga, la base 5,3 ms) e
 *   un figlio condiviso si visitava una volta per strada (22 livelli 95 s, 30 livelli la memoria finita). Ora:
 *   - il «(n)» riparte da dove era arrivato per quel nome (una mappa per oggetto): lineare;
 *   - ogni nodo visitato costa 1 (ogni valore e ogni nome), ogni carattere di un testo o di un nome costa 1. Tetti: 10.000 nodi e 1.000.000
 *     di caratteri. Perché: è lavoro, non ciò che si vede (la riga mostra un valore oltre 400 caratteri chiuso, la carta tutto); un milione
 *     tiene intero il caso di 1 MB già misurato sulla carta (28,7 ms), 10.000 nodi sono cento volte la carta da 100 valori. Hermes mostra
 *     1.200 caratteri e oscura una finestra di 4 volte (`tools/mcp_tool_handlers.py:78`, `:105-108`), DeepSeek ne mostra 20.000
 *     (`JsonBlock.tsx:6`): noi oscuriamo ciò che si vede, intero, e il bilancio taglia solo un argomento molto più grande;
 *   - ⛔ oltre il tetto si ferma e scrive «…» (riga 8 del giudice, v1920: il taglio crea un valore tronco): un testo o un nome che non sta
 *     INTERO nel bilancio non si mostra a pezzi, diventa «…» tutto, come un valore ancora aperto. Un segreto riconosciuto dalla FORMA vuole
 *     il token intero: un pezzo tagliato lo mostrerebbe a metà. Dopo il taglio, in un oggetto o in una lista una voce «…» dice che il
 *     resto non c'è. Entro i tetti l'uscita è quella di prima, senza «…».
 *   Per le prove il bilancio si passa (`{ nodi, caratteri }`); i chiamanti non lo passano. */
const PROFONDITA_DA_MOSTRARE = 64;
export const TETTO_NODI_DA_MOSTRARE = 10_000;
export const TETTO_CARATTERI_DA_MOSTRARE = 1_000_000;
const TAGLIATO = '…';
export function oscuraPerStruttura(valore, { nodi = TETTO_NODI_DA_MOSTRARE, caratteri = TETTO_CARATTERI_DA_MOSTRARE } = {}) {
  return scendi(valore, 0, { nodi, caratteri, finito: false });
}
/* spende dal bilancio, o lo chiude: dopo il primo no, tutto è «…» */
function spendi(bilancio, caratteri) {
  if (bilancio.finito || bilancio.nodi < 1 || caratteri > bilancio.caratteri) { bilancio.finito = true; return false; }
  bilancio.nodi -= 1;
  bilancio.caratteri -= caratteri;
  return true;
}
function metti(fuori, nome, valore) {
  Object.defineProperty(fuori, nome, { value: valore, enumerable: true, writable: true, configurable: true });
}
/* il primo nome libero: il nome com'è, poi «(2)», «(3)»… ripartendo da dove si era arrivati per quel nome */
function nomeLibero(fuori, prossimo, nome) {
  if (!Object.hasOwn(fuori, nome)) return nome;
  let n = prossimo.get(nome) ?? 2;
  while (Object.hasOwn(fuori, `${nome}(${n})`)) n += 1;
  prossimo.set(nome, n + 1);
  return `${nome}(${n})`;
}
function scendi(valore, profondita, bilancio) {
  if (!spendi(bilancio, typeof valore === 'string' ? valore.length : 0)) return TAGLIATO;
  if (typeof valore === 'string') return oscuraFormeDiSegreto(valore);
  if (valore === null || typeof valore !== 'object') return valore;
  if (profondita >= PROFONDITA_DA_MOSTRARE) return TAGLIATO;
  if (Array.isArray(valore)) {
    const fuori = [];
    for (const x of valore) {
      if (bilancio.finito) { if (fuori.at(-1) !== TAGLIATO) fuori.push(TAGLIATO); break; } // un «…» solo: il valore tagliato lo dice già
      fuori.push(scendi(x, profondita + 1, bilancio));
    }
    return fuori;
  }
  const fuori = {};
  const prossimo = new Map();
  for (const [k, x] of Object.entries(valore)) {
    if (!spendi(bilancio, k.length)) { metti(fuori, nomeLibero(fuori, prossimo, TAGLIATO), TAGLIATO); break; }
    const nome = nomeLibero(fuori, prossimo, oscuraFormeDiSegreto(k));
    const segreto = nomeDiCampoSegreto(k) && x !== null && x !== undefined && x !== '' && !siNoLeggibile(k, x);
    metti(fuori, nome, segreto ? SEGRETO_OSCURATO : scendi(x, profondita + 1, bilancio));
  }
  return fuori;
}
/* Giro 8: le forme con la «g» costruite UNA volta (prima ogni testo ne costruiva 17: su 10.000 nomi corti era metà del costo). `replace`
   con una espressione globale riparte sempre da 0 (lastIndex azzerato dalla specifica), quindi condividerle non cambia niente. */
const FORME_GLOBALI = Object.freeze(FORME_DI_SEGRETO.map((forma) => new RegExp(forma.source, `${forma.flags}g`)));
export function oscuraFormeDiSegreto(testo) {
  if (typeof testo !== 'string' || testo === '') return testo;
  let fuori = testo;
  for (const blocco of BLOCCHI_PEM) fuori = fuori.replace(blocco, SEGRETO_OSCURATO);
  for (const forma of FORME_GLOBALI) fuori = fuori.replace(forma, SEGRETO_OSCURATO);
  fuori = fuori.replace(CAMPO_TRA_VIRGOLETTE_NUDO, (tutto, q, nome, sep, valore) => (siNoLeggibile(nome, valore) ? tutto : `${q}${nome}${q}${sep}${SEGRETO_OSCURATO}`));
  fuori = fuori.replace(VALORE_DOPO_UN_NOME_DI_SEGRETO, (_tutto, nome, valore) => (valore === SEGRETO_OSCURATO || siNoLeggibile(nome.replace(/\s*[:=]\s*$/u, ''), valore) ? `${nome}${valore}` : `${nome}${SEGRETO_OSCURATO}`));
  return fuori.replace(/(\b[a-z][a-z0-9+.-]{1,20}:\/\/)[^\s/@:"']{1,256}:[^\s/@"']{1,256}@/giu, `$1${SEGRETO_OSCURATO}@`);
}

/** Il testo contiene qualcosa che ha la forma di una chiave vera? Il NOME della forma, o `null`. */
export function formaDiSegretoNelTesto(testo) {
  if (typeof testo !== 'string' || testo === '') return null;
  for (const forma of FORME_DI_SEGRETO) {
    for (const trovato of testo.matchAll(new RegExp(forma.source, `${forma.flags}g`))) {
      if (!eUnSegnapostoNoto(trovato[0])) return forma.source.slice(0, 40);
    }
  }
  return null;
}
