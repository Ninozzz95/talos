/*
 * Un lanciatore FINTO per le prove coi processi veri (cure dopo il ripasso dei revisori B e C, 12/11/2026): è node stesso, messo al
 * posto dell'exe (`TALOS_LANCIATORE = process.execPath`) e caricato con questo file (`NODE_OPTIONS=--require`). Agisce SOLO quando node è
 * stato lanciato come lanciatore (il primo argomento è la shell, `…\cmd.exe`: giro g4, il nome del Job non c'è più), mai nei comandi
 * veri che usano node. Tutto sincrono: esce prima che node cerchi uno «script» con quel nome. Come lo ha fatto il revisore C nel suo
 * ripasso (`stub/finto-lanciatore.js`).
 * Modi (`FINTO_LANCIATORE_MODO`):
 *   - `appeso`: parte, non scrive «avvio», non esce (30 s al massimo: una prova rossa non lascia un processo per sempre);
 *   - `avvio-poi-muore`: scrive «avvio» ed esce 57 senza far partire niente;
 *   - `avvio-tardi`: aspetta `FINTO_LANCIATORE_RITARDO_MS`, scrive «avvio», FA l'effetto del comando (una riga in più in `conta.txt` nella
 *     cartella del comando: è ciò che il comando vero farebbe), scrive «uscita» ed esce 0. È il lanciatore lento che arriva alla soglia
 *     del guardiano: se il nucleo rilanciasse anche lui il comando, le righe sarebbero due.
 */
const io = process.argv[1] || ''
if (/[\\/]cmd\.exe$/iu.test(io)) {
  const fs = require('node:fs')
  const modo = process.env.FINTO_LANCIATORE_MODO || ''
  const dormi = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
  const scrivi = (testo) => { try { fs.writeSync(3, testo); return true } catch { return false } }
  if (modo === 'appeso') { dormi(30_000); process.exit(1) }
  if (modo === 'avvio-poi-muore') { scrivi('{"avvio":4242,"nipoti":true}\n'); process.exit(57) }
  if (modo === 'avvio-tardi') {
    dormi(Number(process.env.FINTO_LANCIATORE_RITARDO_MS) || 0)
    if (scrivi('{"avvio":4242,"nipoti":true}\n')) {
      fs.appendFileSync('conta.txt', 'dal lanciatore\n')
      scrivi('{"uscita":0,"albero":"vuoto"}\n')
    }
    process.exit(0)
  }
  process.exit(57)
}
