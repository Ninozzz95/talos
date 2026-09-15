/**
 * Whether the in-app viewer has anything useful to show for a file.
 *
 * Pure and eagerly importable on purpose: the SERVICE that hands a file to
 * another app pulls in Capacitor Filesystem and Share, and loading those to
 * answer a question about a media type would drag native plugins into a text
 * preview — and into every test that renders one.
 */
/**
 * ⛔⛔⛔ PDF-APRE-IL-FOGLIO-DI-CONDIVISIONE-01 — «Apri» CONDIVIDEVA.
 *
 * FOTOGRAFATO sul Pad il 2026-08-20: Libreria → un PDF → «Apri», e si è
 * aperto il foglio di condivisione di Android — «Condividi 1 file», con in
 * prima fila i contatti veri della persona, tre volti di WhatsApp, poi Drive,
 * Gmail, Telegram.
 *
 * ⛔ Non è una scomodità: è un comando che fa una cosa diversa da quella che
 * dice, e la cosa che fa mette il file **a un tocco dall'uscire dal
 * telefono**, verso una persona reale.
 *
 * La regola nasceva da un caso giusto — owner 2026-07-26, un `.xlsx` che non
 * si apriva — ma per il PDF la premessa non vale: **il visore ce l'abbiamo**,
 * è `TalosMobilePdfViewer.vue`, rende le pagine col renderer di Android, e lo
 * usava una sola scheda azione mentre la Libreria non lo chiamava mai.
 *
 * ⇒ Un formato che sappiamo mostrare si mostra IN CASA. Fuori ci va solo ciò
 * che davvero non sappiamo rendere — e quello continua ad andarci.
 */
export function talosNeedsExternalOpen(mediaType: string): boolean {
    return !(mediaType.startsWith('text/')
        || mediaType === 'application/json'
        || mediaType === 'application/pdf'
        || mediaType.startsWith('image/'))
}
