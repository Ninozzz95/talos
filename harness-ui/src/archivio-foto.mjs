/*
 * The engine's snapshots on disk: «Memoria delle conversazioni» for the person (never «foto» on screen, Frontend). Form
 * `FORMA-FOTO-E-RIORDINO-2026-11-01.md`: owner «Sì, forma completa», 8 GB of conversations (0 turns it off), 10 GB in all, the common
 * snapshot never deleted, the least recently used goes first, writes safe against a blackout. With the notes of Performance (no rewrite
 * if the prefix did not change, nothing saved under 20 GB free, projector and speculative options in the identity) and of the Mobile
 * (engine and layers on the card, the GGUF sha256 before its date, a missing file is a normal case).
 *
 * Pure: it decides and keeps the index; llama-server writes the slot files (`POST /slots/:id?action=save`), the caller deletes them.
 * Same identity idea as Jan (`slots.rs:7-9`, `:38-61`): a snapshot carries no identity of its own and, put back on a different model,
 * «restores as plausible-looking nonsense rather than an error». So it goes back only on the very same identity.
 */
import { createHash } from 'node:crypto';

export const GB = 1024 ** 3;
export const TETTO_CONVERSAZIONI = 8 * GB;
export const TETTO_TOTALE = 10 * GB;
export const DISCO_MINIMO = 20 * GB;
export const MINIMO_TOKEN = 256; // Jan `slots.rs:27`: under this the snapshot costs more than reading again

/** The identity of a snapshot: every field that, if different, makes it wrong to put back. */
export function identitaFoto({ modello, ggufSha256 = null, ggufBytes = null, ggufData = null, build, commit = null, finestra, tipoKv = null,
  motore, livelli = null, proiettoreSha256 = null, speculativa = null } = {}) {
  return {
    modello: String(modello ?? ''),
    gguf: ggufSha256 ? { sha256: String(ggufSha256) } : { bytes: ggufBytes ?? null, data: ggufData ?? null }, // Mobile 2: the content first
    build: build ?? null, commit: commit ?? null, finestra: finestra ?? null, tipoKv: tipoKv ?? null,
    motore: motore ?? null, livelli: livelli ?? null, // Mobile 1
    proiettore: proiettoreSha256 ?? null, speculativa: speculativa ?? null, // Performance 4
  };
}

const ordinato = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordinato(v[k])])) : Array.isArray(v) ? v.map(ordinato) : v);
const impronta = (v) => createHash('sha256').update(JSON.stringify(ordinato(v))).digest('hex');

export function stessaIdentita(a, b) { return Boolean(a && b) && impronta(a) === impronta(b); }

/** The key of a prefix layer: the messages up to the first person message, the tools and the template options (analysis B §3.1). */
export function chiaveDelloStrato({ messaggi = [], attrezzi = [], opzioniTemplate = {} } = {}) {
  const prefisso = [];
  for (const m of Array.isArray(messaggi) ? messaggi : []) { if (m?.role === 'user') break; prefisso.push({ role: m?.role, content: m?.content }); }
  return impronta({ prefisso, attrezzi, opzioniTemplate });
}

/**
 * The index of the snapshots. `voci`: { [nome]: { tipo: 'comune'|'progetto'|'conversazione', bytes, usata (ms), identita, chiave } }.
 * `ammetti` says whether a new snapshot may be written and which ones must go first to stay under the caps.
 */
export function creaArchivioFoto({ voci = {}, tettoConversazioni = TETTO_CONVERSAZIONI, tettoTotale = TETTO_TOTALE, discoMinimo = DISCO_MINIMO, adesso = () => Date.now() } = {}) {
  const indice = new Map(Object.entries(voci && typeof voci === 'object' ? voci : {}));
  const somma = (filtro) => [...indice.values()].filter(filtro).reduce((s, v) => s + (Number(v.bytes) || 0), 0);

  return {
    voci: () => Object.fromEntries(indice),
    /** Put back only on the same identity; a missing entry is a normal miss (Mobile 4). */
    daRimettere(nome, identita) {
      const v = indice.get(nome);
      if (!v) return { rimetti: false, motivo: 'assente' };
      if (!stessaIdentita(v.identita, identita)) return { rimetti: false, motivo: 'identita-diversa', cancella: [nome] };
      v.usata = adesso();
      return { rimetti: true };
    },
    /**
     * May `nome` be written? `{ scrivi, cancella: [names to delete first], motivo }`. Nothing under the free-disk floor (Performance 3), nothing
     * when the conversations memory is off (cap 0), no rewrite of the same prefix on the same identity (Performance 3), never the common one
     * deleted; conversations go least recently used first.
     */
    ammetti({ nome, tipo, bytes, identita, chiave = null, discoLibero = Infinity, token = Infinity }) {
      if (!(Number(bytes) > 0)) return { scrivi: false, cancella: [], motivo: 'vuota' };
      if (token < MINIMO_TOKEN) return { scrivi: false, cancella: [], motivo: 'troppo-corta' };
      if (Number.isFinite(discoLibero) && discoLibero < discoMinimo) return { scrivi: false, cancella: [], motivo: 'disco-pieno' };
      if (tipo === 'conversazione' && tettoConversazioni <= 0) return { scrivi: false, cancella: [], motivo: 'spenta' };
      const gia = indice.get(nome);
      if (gia && chiave && gia.chiave === chiave && stessaIdentita(gia.identita, identita) && gia.bytes === bytes) return { scrivi: false, cancella: [], motivo: 'uguale' };
      const cancella = [];
      const dopo = (filtro) => somma((v) => filtro(v)) - (gia && filtro(gia) ? Number(gia.bytes) || 0 : 0) + bytes;
      const togliibili = [...indice.entries()].filter(([n, v]) => n !== nome && v.tipo !== 'comune').sort((a, b) => (a[1].usata ?? 0) - (b[1].usata ?? 0));
      let conv = tipo === 'conversazione' ? dopo((v) => v.tipo === 'conversazione') : somma((v) => v.tipo === 'conversazione');
      let tot = dopo(() => true);
      for (const [n, v] of togliibili) {
        if (conv <= tettoConversazioni && tot <= tettoTotale) break;
        if (conv > tettoConversazioni && v.tipo !== 'conversazione' && tot <= tettoTotale) continue;
        cancella.push(n);
        tot -= Number(v.bytes) || 0;
        if (v.tipo === 'conversazione') conv -= Number(v.bytes) || 0;
      }
      if (conv > tettoConversazioni || tot > tettoTotale) return { scrivi: false, cancella: [], motivo: 'non-entra' };
      return { scrivi: true, cancella, motivo: null };
    },
    /** After llama-server wrote it (temporary name, then rename by the caller). */
    registra({ nome, tipo, bytes, identita, chiave = null, sessione = null }) { indice.set(nome, { tipo, bytes, identita, chiave, sessione, usata: adesso() }); },
    togli(nome) { indice.delete(nome); },
  };
}
