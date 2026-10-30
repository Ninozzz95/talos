/**
 * IMPOSTAZIONE-RIFIUTATA (Pad, 27/10/2026; mockup approvato dal Desktop): l'avviso di una scelta delle impostazioni che il PC non ha
 * salvato, come il PC (`sincronizzaImpostazioniSessione`, `legacy/app.js:25234` @ r4 ca94ffa1c): «Preferenza non salvata» e il motivo.
 * La frase è del desktop (`testi/app-impostazioni-r4.json`, estratta da `testi-server-r4.mjs`), mai a mano.
 */
import testi from './testi/app-impostazioni-r4.json'

const italiano = (lingua: string) => /^it(?:-|$)/iu.test(lingua)

/** «Preferenza non salvata. <motivo>»: il motivo è già la frase del rifiuto nella lingua dell'app. */
export function avvisoImpostazioneRifiutataR4(motivo: string, lingua: string): string {
    const titolo = (italiano(lingua) ? testi.it['settings.preferenceNotSaved'] : undefined) ?? testi.en['settings.preferenceNotSaved']
    const resto = motivo.trim()
    return resto ? `${titolo}. ${resto}` : titolo
}
