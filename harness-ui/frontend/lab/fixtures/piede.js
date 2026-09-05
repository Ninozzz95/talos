/*
 * Il piede della chat come lo mostra il mockup, nella forma dei dati del
 * monolite: un giro in corso (comando nel terminale), `usage` come arriva da
 * StateDelta /usage, il permesso col suo valore interno, il tema come lo
 * scrive il piede della sidebar.
 */
export const PIEDE = Object.freeze({
  attivo: true,
  cosa: 'Comando nel terminale',
  dettaglio: 'node --test tests/*.test.mjs',
  giro: 7,
  secondi: 41,
  usage: { prompt_tokens: 38_000, completion_tokens: 3_200, cached_tokens: 33_060, giri: 7 },
  tettoGiri: null,
  latenzaMs: 1400,
  costo: '$0,08',
  modello: 'claude-opus-5',
  permesso: 'Workspace write',
  tema: 'Tema Calm · locale',
});
