/*
 * L'ospite di `ATTREZZI_LUOGHI` (kernel `talosHarness.mjs`): `onLuoghiFn(nome, argomenti, { fase, toolCallId })`, con le due fasi delle
 * automazioni. `anteprima` controlla gli argomenti e dice se serve la carta; `esegui` fa. Il PC lo passa al kernel solo col computer use
 * acceso, deciso all'inizio della sessione (Performance, 03/11): oggi nessuno lo collega, lo farà l'attrezzo `computer_use` (fase 7c).
 *
 * Al modello: `site`/`program` (inglese, come gli schemi), nel registro `dominio`/`app`. Leggere non chiede; togliere chiede la carta,
 * tranne in Accesso pieno (lo decide il kernel). Un luogo che non c'è si dice subito, senza carta per niente.
 */
const TIPO_DEL_REGISTRO = Object.freeze({ site: 'dominio', program: 'app' });
const TIPO_PER_IL_MODELLO = Object.freeze({ dominio: 'site', app: 'program' });

/** @param {{ registro: ReturnType<import('./luoghi-ricordati.mjs').creaRegistroLuoghi> | null }} p */
export function creaOspiteLuoghi({ registro }) {
  return async function ospiteLuoghi(nome, argomenti, { fase } = {}) {
    if (!registro) return { ok: false, messaggio: 'Computer use is not available on this computer.' };
    if (nome === 'computer_use_places_list') {
      if (fase !== 'esegui') return { ok: true, carta: false };
      const { voci } = await registro.elenco();
      if (!voci.length) return { ok: true, testo: 'No site or program is always allowed: TALOS asks before working anywhere.' };
      return { ok: true, testo: voci.map((v) => `${TIPO_PER_IL_MODELLO[v.tipo]}: ${JSON.stringify(v.nome)}${v.quando ? ` (since ${v.quando.slice(0, 10)})` : ''}`).join('\n') };
    }
    if (nome !== 'computer_use_places_remove') return { ok: false, messaggio: `${nome} is not a remembered places tool.` };
    const a = argomenti && typeof argomenti === 'object' && !Array.isArray(argomenti) ? argomenti : {};
    const tipo = TIPO_DEL_REGISTRO[a.type];
    if (!tipo || typeof a.name !== 'string' || !a.name.trim()) return { ok: false, messaggio: 'computer_use_places_remove needs type ("site" or "program") and name. Nothing was removed.' };
    const nomeLuogo = tipo === 'dominio' ? a.name.trim().toLowerCase() : a.name.trim();
    const { voci } = await registro.elenco();
    if (!voci.some((v) => v.tipo === tipo && v.nome === nomeLuogo)) {
      return { ok: false, messaggio: `${JSON.stringify(nomeLuogo)} is not among the always allowed places. Call computer_use_places_list. Nothing was removed.` };
    }
    if (fase !== 'esegui') return { ok: true, carta: true, azione: { tipo: 'computer_use_places_remove', luogo: { tipo, nome: nomeLuogo } } };
    const { tolti } = await registro.togli({ tipo, nome: nomeLuogo });
    if (!tolti) return { ok: false, messaggio: `${JSON.stringify(nomeLuogo)} was already gone. Nothing was removed.` };
    return { ok: true, testo: `Removed ${JSON.stringify(nomeLuogo)}: from now on TALOS asks the person before working there.` };
  };
}
