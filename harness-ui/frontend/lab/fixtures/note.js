/*
 * Fixture nella forma esatta di `GET /api/v1/sessions/:id/notes` (`notes-store.mjs`): id, titolo,
 * contenuto, `creataAlle`/`aggiornataAlle`. Non sono note presenti su un disco: servono al
 * laboratorio per far vedere la sezione elenco+dettaglio con testi di lunghezza diversa — quella
 * corta, quella lunga che il ritaglio a quattro righe deve tagliare, e quella SENZA titolo, che è
 * il caso per cui `titoloNota()` esiste.
 */
export const ADESSO_NOTE = new Date('2026-09-11T18:30:00');

export const NOTE = [
  /*
   * ⭐ 12/09 — LA NOTA IN MARKDOWN. Le altre quattro sono testo semplice, e con quelle sole
   *   l'interruttore «Anteprima · Testo» del dettaglio non si sarebbe mai visto in una foto: un
   *   modo solo non è un interruttore, quindi la striscia giustamente non compare. Questa ha i
   *   marcatori veri della specifica CommonMark — titolo ATX, elenco, recinto — e serve a
   *   fotografare la resa che l'owner ha chiesto («le note, se sono markdown, devono essere
   *   renderizzate in markdown»).
   */
  {
    id: 'nota-markdown',
    titolo: 'Come si legge una nota in Markdown',
    contenuto: "# Come si legge una nota\n\nUna nota scritta con i marcatori si legge **resa**, e il testo com’è scritto resta a un clic di distanza.\n\n## I marcatori che contano\n\n- il cancelletto seguito da uno spazio apre un titolo\n- il trattino seguito da uno spazio apre un elenco\n- tre apici aprono un blocco di codice\n\n```bash\nnpm run test:unit\n```\n\nLo spazio dopo il trattino è ciò che evita di chiamare «markdown» una lista della spesa.",
    creataAlle: '2026-09-11T18:00:00.000Z',
    aggiornataAlle: '2026-09-11T18:20:00.000Z',
  },
  {
    id: 'nota-cache',
    titolo: 'La cache vale sei volte, e non la contavamo',
    contenuto: 'Misurato sul banco: 87 token in ingresso per ogni token in uscita, cioè il 93% del costo è rileggere lo stesso prefisso.\n\n`input_cache_read` costa 0,01 $/M contro 0,06 $/M. Alla terza chiamata la cache prende 16.768 token su 16.811: la sticky routing impara.\n\nLa cura non era nell’agente: due lettori non conoscevano il nome `prompt_tokens_details.cached_tokens`.',
    creataAlle: '2026-09-10T09:12:00.000Z',
    aggiornataAlle: '2026-09-11T17:58:00.000Z',
  },
  {
    id: 'nota-divisorio',
    titolo: 'Il divisorio è un cursore, non una linea',
    contenuto: 'Un pannello ridimensionabile vuole `role="separator"`, `aria-orientation` e i tre valori. Le frecce spostano di un passo dichiarato: qui 24 px.',
    creataAlle: '2026-09-11T08:00:00.000Z',
    aggiornataAlle: '2026-09-11T08:00:00.000Z',
  },
  {
    id: 'nota-senza-titolo',
    titolo: '',
    contenuto: 'Senza titolo la prima riga diventa il titolo: è la regola scritta in note.js, e questa nota esiste per provarla.',
    creataAlle: '2026-09-09T22:40:00.000Z',
    aggiornataAlle: '2026-09-09T22:40:00.000Z',
  },
  {
    id: 'nota-senza-data',
    titolo: 'Una nota senza data non dice «01/01 01:00»',
    contenuto: 'Il 1970 non è «nessuna data». Questa nota non porta né `creataAlle` né `aggiornataAlle`: in fondo all’ordine per data, e in scheda si legge «senza data».',
  },
];
