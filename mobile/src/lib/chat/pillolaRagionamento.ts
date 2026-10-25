/*
 * ⛔ PORTA FISSATA (J3, 24/10/2026) — `harness-ui/frontend/src/components/pillola-ragionamento.js` del desktop (talos-private) @
 *   c6d1cbff2 (sha256 del file 07d816862bbc12f668848b950e34ca1aad3d14ceef6e5081ddc42d806892df4e): `SCALA_RAGIONAMENTO`,
 *   `livelliDaMostrare`, `statoDelLivello`. Logica IDENTICA, riga per riga: qui ci sono solo i tipi TS. `creaPillolaRagionamento`
 *   (il DOM del menu) non si porta: sul mobile la pillola è `TalosMobileReasoningPill.vue`.
 * ⛔ Registrata in `upstream/desktop-ported-libs-manifest.json` (`desktopPortedConformance`): un ritocco fa rosso finché non si
 *   riallinea al desktop. I casi del desktop (`tests/unit/pillola-ragionamento.test.mjs`) stanno in `pillolaRagionamento.test.ts`.
 * Il lessico è quello del desktop (`none`); il mobile dice `off`, e la traduzione sta FUORI da qui (`statoPillolaRagionamento.ts`).
 *
 * Dal desktop:
 * ⛔ La regola di quale livello si mostra è UNA, qui (`statoDelLivello`), e la usano anche il cursore di «Nuova sessione»
 *   (`creaEffortPicker`): prima stava dentro il cursore, e una seconda copia per la pillola avrebbe divergito al primo ritocco.
 */

export interface LivelloRagionamento { readonly valore: string }
/** La mappa del filo (A9): per ogni livello chiesto, che cosa arriva DAVVERO al fornitore (`null` = niente); `auto` = senza scelta. */
export type FiloRagionamento = Readonly<Record<string, string | null>>
export type NotaRagionamento =
  | { chiave: 'effortNotSent' }
  | { chiave: 'effortNotTaken', scelto: string }
  | { chiave: 'effortSentAs', scelto: string, inviato: string }
  | { chiave: 'effortAutoSent', inviato: string }
export interface StatoDelLivello {
  indice: number
  toccato: boolean
  senzaTacca: boolean
  nota: NotaRagionamento | null
  nessuno: boolean
}

/** La scala dal più debole al più forte, la stessa del server (`livelloRagionamentoPiuVicino`, openai-compatible-runtime.mjs). */
export const SCALA_RAGIONAMENTO: readonly string[] = Object.freeze(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])

/**
 * I livelli da offrire: quelli che il modello dichiara (`none` resta, spegnere non è un livello del fornitore) e, con la mappa del
 * filo (A9), solo quelli che arrivano al fornitore COSÌ COME SONO.
 */
export function livelliDaMostrare<L extends LivelloRagionamento>({ tutti, livelliAmmessi = null, filo = null }: { tutti: readonly L[], livelliAmmessi?: readonly string[] | null, filo?: FiloRagionamento | null }): readonly L[] {
  const delModello = Array.isArray(livelliAmmessi) && livelliAmmessi.length
    ? tutti.filter((l) => l.valore === 'none' || livelliAmmessi.includes(l.valore))
    : tutti;
  return filo ? delModello.filter((l) => filo[l.valore] === l.valore) : delModello;
}

/**
 * Quale livello si mostra e quale riga lo spiega — la regola che stava dentro `creaEffortPicker`, spostata qui senza cambiarla.
 * `indice` è la posizione mostrata; `toccato` dice se è una scelta della persona (senza, la pillola dice «Automatico»);
 * `senzaTacca` dice che nessun livello va segnato; `nota` è `null` o `{chiave, scelto?, inviato?}` con le chiavi di `app.modelPicker`.
 * `nessuno` = il modello non riceve nessun livello: la pillola non si mostra.
 */
export function statoDelLivello({ livelli, valoreIniziale = null, filo = null }: { livelli: readonly LivelloRagionamento[], valoreIniziale?: string | null, filo?: FiloRagionamento | null }): StatoDelLivello {
  if (!livelli.length) return { indice: -1, toccato: false, senzaTacca: true, nota: { chiave: 'effortNotSent' }, nessuno: true };
  let nota: NotaRagionamento | null = null;
  let indice = livelli.findIndex((l) => l.valore === valoreIniziale);
  let toccato = indice >= 0;
  if (indice < 0 && valoreIniziale != null) {
    /* BUG-18 gen.2: una preferenza fuori dalla lista del modello mostra il livello PIÙ VICINO con la regola del server — prima il
       più debole, poi a salire; «none» non è mai una meta del ripiego (Hermes reasoning_effort.py: «so a clamp never escalates cost») */
    const pos = SCALA_RAGIONAMENTO.indexOf(valoreIniziale);
    if (pos >= 0) {
      for (let d = 1; d < SCALA_RAGIONAMENTO.length && indice < 0; d++) {
        for (const vicino of [SCALA_RAGIONAMENTO[pos - d], SCALA_RAGIONAMENTO[pos + d]]) {
          if (!vicino || (vicino === 'none' && valoreIniziale !== 'none')) continue;
          indice = livelli.findIndex((l) => l.valore === vicino);
          if (indice >= 0) { toccato = true; break; }
        }
      }
    }
  }
  /* A9: con la mappa del filo il livello mostrato è quello che PARTE; se parte un altro livello, la riga lo dice */
  let senzaTacca = false;
  const inviato = filo && typeof valoreIniziale === 'string' && Object.hasOwn(filo, valoreIniziale) ? filo[valoreIniziale] : undefined;
  if (inviato !== undefined) {
    indice = typeof inviato === 'string' ? livelli.findIndex((l) => l.valore === inviato) : -1;
    toccato = indice >= 0;
    if (inviato === null) { senzaTacca = true; nota = { chiave: 'effortNotTaken', scelto: valoreIniziale as string }; }
    else if (inviato !== valoreIniziale) nota = { chiave: 'effortSentAs', scelto: valoreIniziale as string, inviato };
  }
  /* owner 09/10 («Automatico + riga»): senza una scelta, nessuna tacca, e la riga dice che cosa parte */
  if (filo && valoreIniziale == null && typeof filo.auto === 'string') {
    senzaTacca = true;
    nota = { chiave: 'effortAutoSent', inviato: filo.auto };
    const doveParte = livelli.findIndex((l) => l.valore === filo.auto);
    if (doveParte >= 0) indice = doveParte;
  }
  if (indice < 0) indice = Math.max(0, livelli.findIndex((l) => l.valore === 'high'));
  return { indice, toccato, senzaTacca, nota, nessuno: false };
}
