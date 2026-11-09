/*
 * ⭐ Fase 8, cura 1 (forma `FORMA-FASE-8-TRE-CURE-2026-11-01.md` §1, domanda 2 del Frontend; OK di Performance, CLI e Mobile il 01/11 sera)
 *   — I NOMI DELLE VOCI DEL CATALOGO, presi dal dizionario dell'interfaccia (`frontend/src/i18n/testi/`), chiave per chiave.
 *
 * La fonte è UNA: il dizionario, cioè le parole che la persona legge accanto al campo nelle Impostazioni (o, per le voci della
 *   conversazione, nel foglio della sessione). Il catalogo porta la CHIAVE; il nome si risolve qui UNA volta, al caricamento
 *   (Performance, nota 1): inglese per il modello, la chiave e le due lingue per la carta (la finestra la dice nella lingua della persona).
 *
 * ⛔ Perché una copia e non un `import` del dizionario: il pacchetto dell'app installata NON porta `frontend/`
 *   (`desktop/scripts/prepara-pacchetto.mjs:38`, `fileProduzione`), e il 28/09 un modulo escluso dal pacchetto ha fatto cadere il server
 *   installato cinque volte di fila (ERR_MODULE_NOT_FOUND). Un `import` da qui sarebbe verde in sviluppo e rotto nell'app vera.
 *   ⇒ La copia non decide niente: la prova fissa `tests/impostazioni-nomi-dal-dizionario.test.mjs` (CAT-03) importa il dizionario vero e
 *   pretende, per ogni voce, la chiave in EN e IT e le STESSE parole. Chi rinomina un campo nelle Impostazioni la vede rossa e aggiorna qui.
 *   La stessa forma di Hermes desktop (`apps/desktop/src/app/settings/config-subpages.ts:3,16`, `labelKey` nello schema, le parole nel
 *   suo i18n) e dei `%chiave%` dei contributi di VS Code risolti al caricamento da `package.nls.json` (github.com/microsoft/vscode-l10n,
 *   letto il 01/11/2026).
 */

/** `{ chiave del dizionario: { en, it } }` — le sole chiavi che il catalogo usa. */
export const NOMI_DAL_DIZIONARIO = Object.freeze({
  "impostazioni.field.themePresetSelect.title": { en: "TALOS theme", it: "Tema TALOS" },
  "impostazioni.field.colorModeSelect.title": { en: "Color mode", it: "Modalità colore" },
  "impostazioni.field.uiDensitySelect.title": { en: "List density", it: "Densità delle liste" },
  "impostazioni.field.uiFontScaleSelect.title": { en: "Interface size", it: "Dimensione interfaccia" },
  "impostazioni.field.chatFontScaleSelect.title": { en: "Chat text", it: "Testo chat" },
  "impostazioni.field.newSessionViewSelect.title": { en: "How New session opens", it: "Come si apre Nuova sessione" },
  "impostazioni.field.messageStyleSelect.title": { en: "Message style", it: "Stile dei messaggi" },
  "impostazioni.field.streamingAnimationSelect.title": { en: "Reply animation", it: "Animazione risposta" },
  "impostazioni.field.chatFullWidthToggle.title": { en: "Full-width chat", it: "Chat a tutta larghezza" },
  "impostazioni.field.userBubbleFullWidthToggle.title": { en: "Full-width questions", it: "Domande a tutta larghezza" },
  "impostazioni.field.immersiveHeaderToggle.title": { en: "Immersive header", it: "Intestazione immersiva" },
  "impostazioni.field.uiLanguageSelect.title": { en: "Menu language", it: "Lingua dei menu" },
  "impostazioni.field.replyLanguageSelect.title": { en: "Reply and dictation language", it: "Lingua delle risposte e della dettatura" },
  "impostazioni.field.backgroundMotionToggle.title": { en: "Animated background", it: "Sfondo animato" },
  "impostazioni.field.interfaceMotionToggle.title": { en: "Interface animations", it: "Animazioni interfaccia" },
  "impostazioni.field.reducedMotionToggle.title": { en: "Reduce motion", it: "Riduci movimento" },
  "impostazioni.field.askTimeoutSelect.title": { en: "Question timeout", it: "Scadenza delle domande" },
  "impostazioni.field.stopWithAgentsSelect.title": { en: "Stop while agents are working", it: "Stop con agenti al lavoro" },
  "impostazioni.field.windowPresentationSelect.title": { en: "Panels", it: "Pannelli" },
  "varie.updates.card.autoLabel": { en: "Automatic updates", it: "Aggiornamenti automatici" },
  "app.sheets.model.title": { en: "Model", it: "Modello" },
  "app.workspace.plannerLabel": { en: "Optional planner", it: "Pianificatore opzionale" },
  "app.modelPicker.reasoningLevel": { en: "Reasoning level", it: "Livello di ragionamento" },
  "app.fastMode.label": { en: "Fast mode", it: "Modalità veloce" },
  "app.sheets.permissions.title": { en: "Execution permissions", it: "Permessi di esecuzione" },
  "app.sheets.permissions.coordination": { en: "Coordination", it: "Coordinazione" },
  "app.sheets.permissions.whereCommandsRun": { en: "Where commands run · this conversation", it: "Dove girano i comandi · questa conversazione" },
  "app.sheets.permissions.commandOutputAriaList": { en: "Who reads the output of the commands run with the exclamation mark", it: "Chi legge l’uscita dei comandi lanciati con il punto esclamativo" },
  "varie.contextEngine.card.title": { en: "Context engine", it: "Motore del contesto" },
  "varie.compaction.card.modelLabel": { en: "Compaction model", it: "Modello della compattazione" },
  "varie.compaction.card.backupLabel": { en: "If it does not answer", it: "Se non risponde" },
  "varie.localWindow.card.title": { en: "When a local model’s window fills up", it: "Quando la finestra di un modello locale si riempie" },
  "varie.commandsDefault.title": { en: "Where commands run · new conversations", it: "Dove girano i comandi · conversazioni nuove" },
  "blocchi.settings.title": { en: "Live blocks in replies", it: "Blocchi vivi nelle risposte" },
  "modello.permissions.useANormalUser": { en: "Use a normal user if the distro has one", it: "Usa un utente normale se la distro ne ha uno" },
  "computer.settings.title": { en: "Computer use", it: "Uso del computer" },
  "modello.frammenti.impostazioni.webSearchSource": { en: "Web search source", it: "Origine della ricerca web" },
  "chat.trust.menuItem": { en: "Trust this folder", it: "Fidati di questa cartella" },
});

/*
 * Cura 6 (forma §5, i nomi decisi dal Frontend il 01/11 notte): «se l'etichetta non sta in piedi da sola, la voce porta la chiave del
 *   titolo che la contiene e il nome si COMPONE; la pagina non si cambia per far tornare la carta». Un nome composto = le parti unite da
 *   « · », e ogni parte dopo la prima comincia minuscola («Compaction model · if it does not answer»). `chiavi` le porta tutte (la
 *   finestra compone allo stesso modo con `t()`); `chiave` c'è solo quando la parte è una, altrimenti è `null`.
 */
export const SEPARATORE_DEL_NOME = ' · ';
const minuscolaIniziale = (testo, lingua) => testo.charAt(0).toLocaleLowerCase(lingua) + testo.slice(1);

/** Il nome di questa chiave (o di queste chiavi, composto), congelato `{ chiave, chiavi, en, it }`. Una chiave che non c'è FERMA il
 *  caricamento del catalogo (mai un nome vuoto). */
export function nomeDalDizionario(chiaveOChiavi) {
  const chiavi = Array.isArray(chiaveOChiavi) ? [...chiaveOChiavi] : [chiaveOChiavi];
  const parti = chiavi.map((chiave) => {
    const parole = typeof chiave === 'string' && Object.hasOwn(NOMI_DAL_DIZIONARIO, chiave) ? NOMI_DAL_DIZIONARIO[chiave] : null;
    if (!parole) throw new Error(`app_settings catalog: no name for ${JSON.stringify(chiave ?? null)} in the dictionary copy (nomi-impostazioni.mjs).`);
    return parole;
  });
  if (!parti.length) throw new Error('app_settings catalog: no name for null in the dictionary copy (nomi-impostazioni.mjs).');
  const componi = (lingua) => parti.map((p, i) => (i === 0 ? p[lingua] : minuscolaIniziale(p[lingua], lingua))).join(SEPARATORE_DEL_NOME);
  return Object.freeze({ chiave: chiavi.length === 1 ? chiavi[0] : null, chiavi: Object.freeze(chiavi), en: componi('en'), it: componi('it') });
}
