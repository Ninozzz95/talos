/**
 * Rendere JSON Schema uno schema che JSON Schema non è.
 *
 * ## Il guasto che l'ha fatto nascere, misurato
 *
 * Owner 03/9: «il modello locale dà errore, quindi non funziona». Il motore
 * rispondeva:
 *
 *   HTTP 400 — Unable to generate parser for this template.
 *   JSON schema conversion failed: Unrecognized schema: "string"
 *   Unrecognized schema: "string"
 *
 * Due volte. Ed erano esattamente due: un manifest Forge in
 * `.tool-forge-store/promemoria-trattativa.json` dichiara
 *
 *   { required: ['nome_contatto'],
 *     properties: { nome_contatto: 'string', dettagli_contatto: 'string' } }
 *
 * cioè le proprietà come STRINGHE NUDE invece di `{ type: 'string' }`, e senza
 * `type: 'object'` in testa. È un'abbreviazione comoda, ed è nostra: la scrive
 * chi forgia un attrezzo. Solo che non è JSON Schema.
 *
 * ## Perché non si era mai visto
 *
 * OpenRouter non costruisce grammatiche: riceve lo schema, lo passa al
 * modello come testo e non protesta. llama.cpp invece deve trasformarlo in
 * GBNF per vincolare l'output, quindi lo legge davvero — e si ferma.
 * ⇒ Il difetto era lì da sempre, e a scoprirlo è stato il primo motore che
 * quello schema lo legge sul serio. ⛔ Non è «un limite del locale»: è una
 * cosa rotta nostra che solo il locale è abbastanza severo da vedere.
 *
 * ⭐ Ricerca 03/9 (llama.cpp PR #17572; docs LLGuidance): il convertitore
 * JSON-Schema→GBNF di llama.cpp copre un SOTTOINSIEME e rifiuta il resto con
 * questo messaggio; upstream sta cambiando il 500 in 400 proprio per non far
 * ritentare a vuoto. LLGuidance coprirebbe di più ma vuole Rust.
 * ⭐ E il mobile aveva già scelto il principio giusto per lo stesso problema
 * (`localToolPromptProtocol.ts`): il trasporto si sceglie dalle capacità
 * MISURATE, «mai da un nome di file o da una famiglia indovinata».
 *
 * ## Cosa fa questo modulo, e cosa NON fa
 *
 * Espande le abbreviazioni verso il JSON Schema vero. ⛔ Non inventa vincoli
 * e non butta via proprietà che non capisce: uno schema sconosciuto resta com'è
 * e sarà il motore a dire la sua. Togliere in silenzio un parametro
 * cambierebbe cosa il modello può chiedere, ed è peggio di un errore visibile.
 */

/** I nomi di tipo che JSON Schema conosce. Una stringa nuda che ne è uno è un'abbreviazione. */
const TIPI_JSON = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array', 'null']);

/**
 * @param {unknown} schema
 * @returns {unknown} lo stesso schema, con le abbreviazioni espanse
 */
export function normalizzaSchemaAttrezzo(schema) {
  // `'string'` → `{ type: 'string' }`. È l'abbreviazione che ha rotto tutto.
  if (typeof schema === 'string') return TIPI_JSON.has(schema) ? { type: schema } : schema;
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(normalizzaSchemaAttrezzo);

  const uscita = { ...schema };
  if (uscita.properties && typeof uscita.properties === 'object' && !Array.isArray(uscita.properties)) {
    uscita.properties = Object.fromEntries(
      Object.entries(uscita.properties).map(([nome, valore]) => [nome, normalizzaSchemaAttrezzo(valore)]),
    );
    /*
     * ⛔ Un oggetto con `properties` ma senza `type` è la seconda metà della
     * stessa abbreviazione: chi scrive `{ properties: {...} }` intende un
     * oggetto, e il convertitore di grammatica non tira a indovinare.
     */
    if (uscita.type === undefined) uscita.type = 'object';
  }
  if (uscita.items !== undefined) uscita.items = normalizzaSchemaAttrezzo(uscita.items);
  if (uscita.additionalProperties !== undefined && typeof uscita.additionalProperties !== 'boolean') {
    uscita.additionalProperties = normalizzaSchemaAttrezzo(uscita.additionalProperties);
  }
  for (const combinatore of ['anyOf', 'oneOf', 'allOf']) {
    if (Array.isArray(uscita[combinatore])) uscita[combinatore] = uscita[combinatore].map(normalizzaSchemaAttrezzo);
  }
  if (uscita.$defs && typeof uscita.$defs === 'object') {
    uscita.$defs = Object.fromEntries(Object.entries(uscita.$defs).map(([k, v]) => [k, normalizzaSchemaAttrezzo(v)]));
  }
  if (uscita.definitions && typeof uscita.definitions === 'object') {
    uscita.definitions = Object.fromEntries(Object.entries(uscita.definitions).map(([k, v]) => [k, normalizzaSchemaAttrezzo(v)]));
  }
  return uscita;
}

/**
 * Uno schema di ingresso valido anche quando il manifest non ne dichiara uno.
 * ⛔ `{}` vuoto è ammesso da JSON Schema ma non dice niente a una grammatica:
 * meglio un oggetto senza proprietà, che è ciò che l'attrezzo intende.
 */
export function schemaIngressoAttrezzo(schema) {
  if (schema === undefined || schema === null) return { type: 'object', properties: {} };
  const normalizzato = normalizzaSchemaAttrezzo(schema);
  if (!normalizzato || typeof normalizzato !== 'object' || Array.isArray(normalizzato)) return { type: 'object', properties: {} };
  if (normalizzato.type === undefined && normalizzato.properties === undefined) return { ...normalizzato, type: 'object', properties: {} };
  return normalizzato;
}
