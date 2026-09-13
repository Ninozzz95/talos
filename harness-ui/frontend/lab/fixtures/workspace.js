/*
 * Il piede della sidebar come lo mostra il mockup («Workspace locale» / «Tema
 * Calm · locale»), nella forma dei dati del monolite: nessuna sessione aperta
 * (cartella null), preset del tema `calm` (impostazioni desktop), modello del
 * runtime locale (`local:<id>`).
 */
export const WORKSPACE = Object.freeze({
  cartella: null,
  nomeAnteprima: null,
  tema: 'calm',
  modello: 'local:qwen3-8b',
});
