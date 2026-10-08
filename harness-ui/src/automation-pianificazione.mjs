/**
 * automation-pianificazione.mjs — QUANDO gira un'automazione. Puro: niente orologio, niente disco; chi chiama passa `dopo`,
 * il fuso e l'ultimo giro.
 *
 * ⛔⛔ Automazioni a due porte (owner 08/10/2026 notte, «stato dell'arte come Claude e Codex»):
 * - i preset sono quelli di Claude Desktop (A mano, Ogni ora, Ogni giorno, Giorni feriali, Ogni settimana) più «Una volta»;
 *   tutto il resto si chiede in chat e arriva come intervallo o come cron
 *   (code.claude.com/docs/en/desktop-scheduled-tasks, letto l'08/10);
 * - le forme sono quelle di Hermes (`cron/jobs.py:787-860`): intervallo, una volta, cron a 5 campi. Un'ora scritta è un'ora
 *   del FUSO dell'automazione, non del server (Hermes #51021);
 * - tetti «come Hermes, minimo 5 min» (owner): niente tetto al giorno; il minimo di 5 minuti vale anche per un cron, misurato
 *   sui suoi giri veri («ogni 7 minuti» in cron passa da :56 a :00, cioè 4 minuti, e si rifiuta);
 * - grazia e recupero come Hermes (`jobs.py:937-963`): metà del periodo fra 120 s e 2 h; oltre, i giri persi si saltano e ne
 *   gira uno solo.
 * Il calcolo delle date lo fa croner 10.0.1 (sì dell'owner, 08/10): fusi e ora legale (un'ora che non esiste si salta, una
 * doppia gira una volta, dal README del pacchetto). Solo 5 campi: croner accetterebbe anche secondi e anno, e qui la
 * granularità è il minuto, come per Hermes e Claude.
 */
import { Cron } from 'croner';

export const INTERVALLO_MINIMO_MINUTI = 5;
export const TIPI_PIANIFICAZIONE = Object.freeze(['manuale', 'ogni-ora', 'giornaliera', 'feriali', 'settimanale', 'ogni-n-minuti', 'cron', 'una-volta']);

const GRAZIA_MINIMA_S = 120;
const GRAZIA_MASSIMA_S = 7200;
const IN_ORARIO_S = 300; // Hermes `_LATE_DISPATCH_TOLERANCE_SECONDS`
const GIRI_PER_LA_FREQUENZA = 60;

/** Un rifiuto con il suo codice; il messaggio è per il modello e per i registri, in inglese. */
export class PianificazioneNonValida extends Error {
  constructor(message, code = 'AUTOMATION_SCHEDULE_INVALID') {
    super(message);
    this.name = 'PianificazioneNonValida';
    this.code = code;
  }
}

const CAMPI = Object.freeze({
  manuale: [], 'ogni-ora': ['minuto'], giornaliera: ['ora'], feriali: ['ora'], settimanale: ['ora', 'giorno'],
  'ogni-n-minuti': ['minuti'], cron: ['espressione'], 'una-volta': ['quando'],
});
/**
 * Solo i campi che il tipo usa. Per la porta del MODELLO (automation-per-il-modello.mjs): dal vivo, l'08/10/2026, glm-5.3-flash ha
 * mandato `{tipo:'feriali', ora:'09:00', giorno:0}` riempiendo un campo dello schema che «feriali» non usa, e il rifiuto gli è
 * costato un giro intero. La persona vede comunque la bozza normalizzata sulla carta prima del sì; la rotta HTTP resta severa.
 * Un tipo ignoto passa com'è: lo rifiuta `normalizzaPianificazione` col suo codice.
 */
export function soloCampiDelTipo(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p) || !Object.hasOwn(CAMPI, p.tipo)) return p;
  return Object.fromEntries(Object.entries(p).filter(([k]) => k === 'tipo' || CAMPI[p.tipo].includes(k)));
}

const ORA = /^([01]\d|2[0-3]):([0-5]\d)$/u;
const ISTANTE_LOCALE = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/u;

function intero(valore, min, max) {
  return Number.isSafeInteger(valore) && valore >= min && valore <= max;
}

export function fusoValido(fuso) {
  if (typeof fuso !== 'string' || fuso === '') return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: fuso }); return true; } catch { return false; }
}
function richiediFuso(fuso) {
  if (!fusoValido(fuso)) throw new PianificazioneNonValida(`unknown time zone: ${String(fuso)}`, 'AUTOMATION_TIMEZONE_INVALID');
}

function cronDiCinqueCampi(espressione) {
  const campi = espressione.trim().split(/\s+/u);
  if (campi.length !== 5 || campi[0] === '') {
    throw new PianificazioneNonValida('a cron schedule has exactly 5 fields: minute hour day-of-month month day-of-week', 'AUTOMATION_CRON_FIELDS');
  }
  const pulita = campi.join(' ');
  try { new Cron(pulita, { paused: true, timezone: 'UTC' }); } catch (errore) {
    throw new PianificazioneNonValida(`invalid cron schedule "${pulita}": ${errore instanceof Error ? errore.message : String(errore)}`, 'AUTOMATION_CRON_INVALID');
  }
  return pulita;
}

/** Il cron equivalente di un preset (o il cron chiesto); `null` per a mano, ogni N minuti e una volta. */
function cronDi(p) {
  if (p.tipo === 'ogni-ora') return `${p.minuto} * * * *`;
  if (p.tipo === 'cron') return p.espressione;
  if (p.tipo === 'giornaliera' || p.tipo === 'feriali' || p.tipo === 'settimanale') {
    const [, hh, mm] = ORA.exec(p.ora);
    const giorni = p.tipo === 'giornaliera' ? '*' : p.tipo === 'feriali' ? '1-5' : String(p.giorno);
    return `${Number(mm)} ${Number(hh)} * * ${giorni}`;
  }
  return null;
}

/** Il passo più corto fra due giri consecutivi di un cron, in secondi (misurato sui giri veri, da una data fissa). */
function passoMinimoCronS(espressione) {
  const giri = new Cron(espressione, { paused: true, timezone: 'UTC' }).nextRuns(GIRI_PER_LA_FREQUENZA, new Date('2026-01-01T00:00:00Z'));
  let minimo = Infinity;
  for (let i = 1; i < giri.length; i += 1) minimo = Math.min(minimo, (giri[i].getTime() - giri[i - 1].getTime()) / 1000);
  return minimo;
}

/**
 * Valida e normalizza ciò che arriva dal foglio o dal modello. Niente campi in più, niente correzioni silenziose: un valore
 * fuori posto si rifiuta col suo codice.
 */
export function normalizzaPianificazione(entrata) {
  if (!entrata || typeof entrata !== 'object' || Array.isArray(entrata)) throw new PianificazioneNonValida('schedule must be an object with a "tipo"');
  const { tipo } = entrata;
  if (!TIPI_PIANIFICAZIONE.includes(tipo)) throw new PianificazioneNonValida(`schedule "tipo" must be one of: ${TIPI_PIANIFICAZIONE.join(', ')}`);
  const ammessi = new Set(['tipo', ...CAMPI[tipo]]);
  const estranei = Object.keys(entrata).filter((k) => !ammessi.has(k));
  if (estranei.length) throw new PianificazioneNonValida(`schedule "${tipo}" does not take: ${estranei.join(', ')}`);
  if (tipo === 'manuale') return { tipo };
  if (tipo === 'ogni-ora') {
    if (!intero(entrata.minuto, 0, 59)) throw new PianificazioneNonValida('"minuto" must be an integer from 0 to 59');
    return { tipo, minuto: entrata.minuto };
  }
  if (tipo === 'giornaliera' || tipo === 'feriali' || tipo === 'settimanale') {
    if (typeof entrata.ora !== 'string' || !ORA.test(entrata.ora)) throw new PianificazioneNonValida('"ora" must be a local time "HH:MM" (00:00-23:59)');
    if (tipo === 'settimanale') {
      if (!intero(entrata.giorno, 0, 6)) throw new PianificazioneNonValida('"giorno" must be 0 (Sunday) to 6 (Saturday)');
      return { tipo, ora: entrata.ora, giorno: entrata.giorno };
    }
    return { tipo, ora: entrata.ora };
  }
  if (tipo === 'ogni-n-minuti') {
    if (!Number.isSafeInteger(entrata.minuti) || entrata.minuti < 1) throw new PianificazioneNonValida('"minuti" must be a whole number of minutes');
    if (entrata.minuti < INTERVALLO_MINIMO_MINUTI) {
      throw new PianificazioneNonValida(`an automation runs at most every ${INTERVALLO_MINIMO_MINUTI} minutes`, 'AUTOMATION_SCHEDULE_TOO_FREQUENT');
    }
    return { tipo, minuti: entrata.minuti };
  }
  if (tipo === 'cron') {
    if (typeof entrata.espressione !== 'string') throw new PianificazioneNonValida('"espressione" must be a cron string');
    const espressione = cronDiCinqueCampi(entrata.espressione);
    if (passoMinimoCronS(espressione) < INTERVALLO_MINIMO_MINUTI * 60) {
      throw new PianificazioneNonValida(`this cron schedule runs more often than every ${INTERVALLO_MINIMO_MINUTI} minutes`, 'AUTOMATION_SCHEDULE_TOO_FREQUENT');
    }
    return { tipo, espressione };
  }
  // una-volta: un'ora LOCALE del fuso dell'automazione, al minuto
  const m = typeof entrata.quando === 'string' ? ISTANTE_LOCALE.exec(entrata.quando) : null;
  const data = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
  if (!m || data.getUTCMonth() !== Number(m[2]) - 1 || data.getUTCDate() !== Number(m[3])) {
    throw new PianificazioneNonValida('"quando" must be a local date and time "YYYY-MM-DDTHH:MM"');
  }
  return { tipo, quando: entrata.quando };
}

/**
 * Il prossimo giro dopo `dopo`, o `null` (a mano; una volta già passata o già girata).
 * @param {object} p pianificazione normalizzata
 * @param {{ dopo: Date, fusoOrario: string, ultimoGiro?: Date|null }} opzioni
 */
export function prossimoGiro(p, { dopo, fusoOrario, ultimoGiro = null } = {}) {
  richiediFuso(fusoOrario);
  if (p.tipo === 'manuale') return null;
  if (p.tipo === 'ogni-n-minuti') {
    const base = ultimoGiro instanceof Date ? ultimoGiro : dopo;
    return new Date(base.getTime() + p.minuti * 60_000);
  }
  if (p.tipo === 'una-volta') {
    if (ultimoGiro instanceof Date) return null;
    return new Cron(`${p.quando}:00`, { paused: true, timezone: fusoOrario }).nextRun(dopo) ?? null;
  }
  return new Cron(cronDi(p), { paused: true, timezone: fusoOrario }).nextRun(dopo) ?? null;
}

function periodoS(p, fusoOrario) {
  if (p.tipo === 'ogni-n-minuti') return p.minuti * 60;
  const cron = cronDi(p);
  if (!cron) return null;
  const [a, b] = new Cron(cron, { paused: true, timezone: fusoOrario }).nextRuns(2, new Date('2026-01-05T00:00:00Z'));
  return a && b ? (b.getTime() - a.getTime()) / 1000 : null;
}

/** Hermes `_compute_grace_seconds`: metà del periodo, fra 120 s e 2 h; senza periodo (a mano, una volta) 120 s. */
export function graziaSecondi(p, { fusoOrario } = {}) {
  richiediFuso(fusoOrario);
  const periodo = periodoS(p, fusoOrario);
  if (!periodo) return GRAZIA_MINIMA_S;
  return Math.max(GRAZIA_MINIMA_S, Math.min(Math.floor(periodo / 2), GRAZIA_MASSIMA_S));
}

/** Hermes `_classify_dispatch_lateness`: oltre la grazia è «recupero» (un giro solo, i persi si saltano). */
export function classificaRitardo(ritardoS, graziaS) {
  if (ritardoS > graziaS) return 'recupero';
  if (ritardoS > IN_ORARIO_S) return 'in-ritardo';
  return 'in-orario';
}
