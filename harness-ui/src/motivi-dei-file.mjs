/*
 * ⛔ 16/10/2026 (segnalato dalla sessione mobile il 15/10 su r4 2161afb32) — I MOTIVI dei rifiuti dell'albero dei file.
 *   Ogni rifiuto di `workspace-files.mjs` e di `workspace-tree.mjs` senza un codice suo usciva come 400 QUERY_INVALID «Invalid
 *   query»: rinominare con una barra nel nome, spostare una cartella dentro sé stessa, aprire una cartella come file, chiedere
 *   l'albero di `../` o di una cartella che non c'è, eliminare la radice. La frase vera c'era, e restava nel log.
 * ⇒ Il codice resta QUERY_INVALID (lo stato HTTP e i client non cambiano). Il MOTIVO (kebab-case, inglese, stabile) dice quale
 *   rifiuto è, come il `reason` di ErrorInfo in Google AIP-193 («Errors», aip.dev/193: un identificatore leggibile dalla
 *   macchina, così cambiare la frase non rompe chi la legge). La frase inglese è qui, una volta sola; l'interfaccia ha la sua
 *   voce `errori.QUERY_INVALID.<motivo_con_trattini_bassi>` (`i18n/testi/errori.js`) e la dice nella sua lingua.
 * ⛔ Ogni frase è per lo schermo: niente percorsi, niente nomi di file, niente identificatori (`public-problem.mjs` la pubblica
 *   come `explanation` solo per i motivi di questa tabella). Lo pretende `tests/motivi-dei-file.test.mjs`.
 */
export const FRASI_DEI_MOTIVI_DEI_FILE = Object.freeze({
  'path-invalid': 'Invalid path',
  'path-outside-session': 'Path outside the session folder',
  'path-outside-or-root': 'Path outside the session folder, or it is the root itself',
  'path-not-readable': 'Path not readable',
  'folder-not-found': 'Folder not found',
  'not-a-file-preview': 'Not a file — open a folder from the tree, not from here',
  'not-a-file-download': 'Not a file: a folder cannot be downloaded',
  'not-a-file-reveal': 'Not a file: use “Show in folder”',
  'new-name-invalid': 'Invalid new name — a file name, not a path',
  'name-invalid': 'Invalid name — a name, not a path',
  'file-name-invalid': 'Invalid file name — a name, not a path',
  'mode-invalid': 'Invalid mode: "nuovo" (rejects a name already taken) or "accoda" (appends at the end)',
  'type-invalid': 'Invalid type: "file" or "cartella"',
  'destination-outside-session': 'Destination outside the session folder',
  'destination-outside-session-workspace': 'Destination outside the session workspace',
  'destination-outside-workspace': 'Destination outside the workspace folder',
  'destination-folder-invalid': 'Invalid destination folder',
  'destination-not-a-folder': 'The destination is not a folder',
  'move-into-itself': 'You cannot move an item into itself or one of its descendants',
  'too-many-copies': 'Too many existing copies with this name',
  'base-folder-invalid': 'Invalid base folder',
  'base-folder-outside-session': 'Base folder outside the session workspace',
  'base-not-a-folder': 'The base folder is not a folder',
});
