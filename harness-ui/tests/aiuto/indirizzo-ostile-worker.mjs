/*
 * Giro di cura 1 di «chiavi nel testo web» (giudice v2243): il tempo dell'aiuto su un indirizzo ostile, misurato in un Worker che il
 * chiamante ferma col suo tetto. Nessuna rete, nessun valore vero: le chiavi nascono a caso qui dentro e non escono (solo numeri e sì/no).
 */
import { randomBytes } from 'node:crypto';
import { parentPort, workerData } from 'node:worker_threads';

const { indirizzoConUnaChiave } = await import(workerData.modulo);
const note = new Set(Array.from({ length: 30 }, () => `q${randomBytes(16).toString('hex')}`));
const codifica = (s) => [...s].map((ch) => `%${ch.charCodeAt(0).toString(16).padStart(2, '0')}`).join('');

/* indirizzi ostili lunghi `n`: pieni di %25, di %2525, di «%» e %ZZ mescolati, di parametri corti */
const ostili = (n) => {
  const base = 'https://x.example/?a=';
  const riempi = (pezzo) => base + pezzo.repeat(Math.ceil((n - base.length) / pezzo.length)).slice(0, n - base.length);
  return [riempi('%25'), riempi('%2525'), riempi('%25%ZZ%'), riempi('&a=%25'), riempi('%E0%A4%25')];
};
const misura = (n) => {
  const urls = ostili(n);
  const tempi = [];
  for (let giro = 0; giro < 5; giro += 1) {
    const t0 = process.hrtime.bigint();
    for (const u of urls) if (indirizzoConUnaChiave([u, u], note)) throw new Error('falso positivo');
    tempi.push(Number(process.hrtime.bigint() - t0) / 1e6 / urls.length);
  }
  return tempi.sort((a, b) => a - b)[2];
};
misura(2000); // riscaldamento
const ms8 = misura(8000);
const ms16 = misura(16000);
/* al contrario: la chiave codificata tre volte in fondo all'indirizzo ostile si trova lo stesso */
const una = [...note][0];
const inFondo = `${ostili(8000)[0]}&k=${codifica(una).replaceAll('%', '%2525')}`;
parentPort.postMessage({ ms8, ms16, trovataInFondo: indirizzoConUnaChiave([inFondo], note) });
