/**
 * ⭐⭐⭐ 04/9 — W0-03, la sonda di rilascio: la matematica da sola.
 *
 * Il lag visto dall'owner il 02/09 era FUORI dal codice (GPU spenta nel
 * browser: mediana 6,1 ms con GPU, 109 ms senza, p95 212). Da allora ogni
 * rilascio deve portare una misura da fermo — delta fra frame di
 * requestAnimationFrame — e lo stato dell'accelerazione, letti in Chrome
 * VERO. Qui stanno percentili, verdetto e riassunto GPU: funzioni pure,
 * provate a secco in `tests/statistiche-raf.test.mjs`. Il campionamento
 * vive nello scenario `qa-release-probe` di `qa-visual-pipeline.mjs`.
 */

export const BUDGET_RAF_P95_MS = 50;

/**
 * Percentili con il metodo del rango più vicino (nessuna interpolazione):
 * ⛔ su campioni interi di frame vogliamo un valore che sia STATO misurato,
 * non una media fra due. `{ p50: …, p95: … }`.
 */
export function percentili(campioniMs, richiesti) {
  if (!Array.isArray(campioniMs) || campioniMs.length === 0) throw new Error('percentili: nessun campione');
  for (const c of campioniMs) if (typeof c !== 'number' || Number.isNaN(c)) throw new Error(`percentili: campione non numerico (${String(c)})`);
  const ordinati = [...campioniMs].sort((a, b) => a - b);
  const risultato = {};
  for (const p of richiesti) {
    if (typeof p !== 'number' || p < 0 || p > 100) throw new Error(`percentili: percentile non valido (${String(p)})`);
    const rango = Math.max(1, Math.ceil((p / 100) * ordinati.length));
    risultato[`p${p}`] = ordinati[rango - 1];
  }
  return risultato;
}

/**
 * Il verdetto della sonda. ⛔ Una misura mancante NON è un passaggio: una
 * sonda muta è una sonda rotta, e si dichiara.
 */
export function verdettoSonda({ rafP95, budgetMs = BUDGET_RAF_P95_MS } = {}) {
  if (typeof rafP95 !== 'number' || Number.isNaN(rafP95)) return { ok: false, motivo: `nessuna misura di rafP95 (${String(rafP95)}): la sonda non ha campionato` };
  if (rafP95 > budgetMs) return { ok: false, motivo: `rafP95 ${rafP95} ms > budget ${budgetMs} ms` };
  return { ok: true, motivo: `rafP95 ${rafP95} ms ≤ budget ${budgetMs} ms` };
}

/**
 * Riassunto leggibile di `SystemInfo.getInfo` (CDP). Forma misurata il 04/09
 * su Chrome 1xx Windows: con la GPU vera `vendorString` è VUOTO e il nome
 * sta in `deviceString` ("AMD Radeon RX 9070 XT", `driverVendor` "AMD");
 * con `--disable-gpu` il dispositivo è "ANGLE (Microsoft, Microsoft Basic
 * Render Driver …)", `driverVendor` "SwANGLE", e `featureStatus.gpu_compositing`
 * passa da "enabled" a "disabled_software". ⛔ È quel campo a dire se
 * l'accelerazione è accesa, non il nome della scheda.
 */
export function riassuntoGpu(info) {
  const gpu = info?.gpu ?? {};
  const dispositivo = gpu.devices?.[0] ?? {};
  const compositing = gpu.featureStatus?.gpu_compositing ?? 'sconosciuto';
  return {
    dispositivo: dispositivo.deviceString || dispositivo.vendorString || 'sconosciuto',
    driver: [dispositivo.driverVendor, dispositivo.driverVersion].filter(Boolean).join(' ') || 'sconosciuto',
    compositing,
    accelerata: /^enabled/.test(compositing),
    dispositivi: gpu.devices?.length ?? 0,
  };
}
