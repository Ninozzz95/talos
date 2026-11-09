/*
 * R8 della revisione del blocco difetti (02/11/2026) — dove torna ciò che la persona aveva mandato quando l'invio fallisce in una chat
 *   già aperta. Pura: chi la chiama lo rimette nel campo o nella bozza della chat (D27). Se la persona è già su un'altra chat, va nella
 *   bozza della sua: mai perso, mai nel campo di un'altra. Come Hermes: `apps/desktop/src/app/chat/composer/hooks/use-composer-submit.ts:173-178`,
 *   `restore` rimette testo e allegati nella bozza della chat dell'invio, e li ricarica nel campo solo se quella chat è ancora aperta.
 */
export function destinoInvioFallito({ sessionId, chiaveAperta, ripristino, immagini = [] }) {
  if (!ripristino) return null;
  const allegati = [...(ripristino.allegati ?? [])];
  for (const immagine of immagini) if (!allegati.some((a) => a.id === immagine.id)) allegati.push(immagine);
  const chiave = `sessione:${sessionId}`;
  const testo = ripristino.testo ?? '';
  return chiave === chiaveAperta ? { dove: 'campo', allegati, testo } : { dove: 'bozza', chiave, allegati, testo };
}

/** BD24: al ritorno in una chat entra chi non c'è già, fino al tetto; gli altri restano nella bozza. */
export function dividiBozza(daBozza, nelCampo, tetto) {
  const liberi = Math.max(0, tetto - nelCampo.length);
  const nuovi = daBozza.filter((a) => !nelCampo.includes(a));
  return { entrano: nuovi.slice(0, liberi), restano: nuovi.slice(liberi) };
}

/** BD11: il perché di un caricamento rifiutato: la chiave del dizionario, una per ogni rifiuto che la persona può capire. */
export function motivoDelCaricamento(stato) {
  return ({ 413: 'app.attachments.fileTooLargeBody', 503: 'app.attachments.storeUnavailable', 507: 'app.attachments.storeFull' })[stato] ?? 'app.attachments.serverNoConfirm';
}
