/*
 * Le due schede del Terminale del mockup: quella dell'agente (viva, attiva) e quella della persona.
 * Le schede «agente» non nascono ancora nell'app (i comandi dell'agente passano dal kernel, non da
 * una PTY): il componente le sa disegnare, l'app oggi produce solo schede «tu».
 */
export const SCHEDE_TERMINALE = Object.freeze([
  { terminalId: 'agente-7', origine: 'agente', giro: 7, stato: 'live', cartella: 'C:\\Users\\Antonino\\Desktop\\projects\\AVM-harness-desktop\\harness-ui' },
  { terminalId: 'tu-1', origine: 'tu', titolo: 'tu · PowerShell', stato: 'connesso', cartella: 'C:\\Users\\Antonino\\Desktop\\projects\\AVM-harness-desktop\\harness-ui' },
]);
export const CORNICE_TERMINALE = Object.freeze({
  attiva: 'agente-7',
  puoAprire: true,
  badges: [{ testo: 'Isolato · sandbox locale', tono: 'success' }, { testo: 'harness-ui/' }],
  piede: { chi: "Lanciato dall'agente al giro 7", dettaglio: '41 s', stato: 'in corso', nota: "Ogni comando dichiara chi l'ha lanciato e dove." },
});
