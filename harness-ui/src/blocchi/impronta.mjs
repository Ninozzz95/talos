// L'impronta del testo di un recinto `talos-blocco` (interfaccia generativa, 03/11/2026).
//
// Entra nella `chiave` di `talos.blocco.azione.v1`, quindi PC e telefono devono calcolarla uguale: sta qui, accanto al lettore, e viaggia
// col pin (condizione 2 del Mobile). ⛔ Si calcola sul testo così com'è arrivato, senza ritocchi: cambiarla riaccende i blocchi già usati.

/** Un'impronta corta e stabile del testo del recinto: lo stesso id in due messaggi diversi sono due blocchi. */
export function impronta(testo) {
  let h = 5381;
  for (const c of String(testo)) h = ((h * 33) ^ c.codePointAt(0)) >>> 0;
  return h.toString(36);
}
