import { PROVIDER_DIRETTI } from '../../src/components/fonti-modelli.js';

const parametri = new URLSearchParams(location.search);
export const numeroFonti = Number(parametri.get('fonti') || 8);
const collegati = PROVIDER_DIRETTI.slice(0, numeroFonti - 2);
export const state = { effort: null };
export const textElement = (tag, classe, testo) => {
  const nodo = document.createElement(tag); nodo.className = classe; nodo.textContent = testo; return nodo;
};
export const icon = nome => `<svg width="16" height="16" aria-hidden="true"><use href="#${nome}"/></svg>`;
const modelli = (id, quanti = 15) => Array.from({ length: quanti }, (_, i) => ({
  id: `${id}:modello-${i + 1}`, nome: `Modello dimostrativo ${i + 1}`, provider: id,
  contextLength: 128000, catalogo: { fonte: 'models.dev', aggiornatoAlle: '2026-09-12T10:00:00Z' },
}));

// Sostituisce soltanto il confine API: nessuna rete verso fornitori, nessuna credenziale.
export async function apiGet(percorso) {
  if (percorso === '/api/v1/providers') return { items: collegati.map(p => ({ id: p.id, keyConfigured: true })) };
  if (percorso === '/api/v1/local-models') return { items: [] };
  if (percorso.startsWith('/api/v1/models')) return { modelli: modelli('openrouter', 24) };
  const id = /^\/api\/v1\/providers\/([^/]+)\/models$/u.exec(percorso)?.[1];
  if (id) {
    if (parametri.get('errore') === id) throw new Error('Catalogo dimostrativo temporaneamente non raggiungibile');
    return { modelli: modelli(id) };
  }
  throw new Error(`Richiesta non prevista dal banco: ${percorso}`);
}
