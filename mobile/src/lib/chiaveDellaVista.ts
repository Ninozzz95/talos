/**
 * ⛔ D-RM4-7 (dal Pad, 20/10/2026): la chiave della vista delle rotte (`App.vue`). Senza, Vue Router teneva la STESSA istanza di
 * `CodiceR4Screen` fra il Codice del telefono (`codice-r4`) e quello di un PC (`computer-codice`): la schermata legge il PC una volta
 * sola all'avvio, quindi il Codice «del telefono» restava sul ponte del PC (e il r4 del telefono non partiva).
 * Una chiave per ogni PC; il telefono e ogni altra rotta restano senza (`undefined`, come prima): nessuna chiave e `pc:<id>` sono
 * diverse, quindi passando fra il telefono e un PC, o fra due PC, la schermata si rimonta; dentro lo stesso modo cambiare sessione no
 * (lo fa già lei). Corta di proposito: sta nel pacchetto d'avvio (tetto 668.000 byte).
 */
export const chiaveDellaVista = (r: { name?: unknown, params?: Record<string, unknown> }): string | undefined =>
    (r.name === 'computer-codice' ? `pc:${String(r.params?.pcId)}` : undefined)
