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
  new RegExp(`${DASH5}BEGIN ${ETICHETTA_PRIVATA}${DASH5}(?:\\r?\\n(?:[A-Za-z0-9+/=]{1,128}|[A-Za-z][A-Za-z-]{0,31}: [^\\r\\n]{0,128})(?=\\r?\\n|$)){0,1024}`, 'gu'),
]);
export const VALORE_DOPO_UN_NOME_DI_SEGRETO = /(?<![A-Za-z0-9])((?:(?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password|passwd|pwd)|(?:[A-Za-z0-9]+[_-])+key)\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s;,]+)/giu;
export function oscuraFormeDiSegreto(testo) {
  if (typeof testo !== 'string' || testo === '') return testo;
  let fuori = testo;
  for (const blocco of BLOCCHI_PEM) fuori = fuori.replace(blocco, SEGRETO_OSCURATO);
  for (const forma of FORME_DI_SEGRETO) fuori = fuori.replace(new RegExp(forma.source, `${forma.flags}g`), SEGRETO_OSCURATO);
  fuori = fuori.replace(VALORE_DOPO_UN_NOME_DI_SEGRETO, (_tutto, nome, valore) => (valore === SEGRETO_OSCURATO ? `${nome}${valore}` : `${nome}${SEGRETO_OSCURATO}`));
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
