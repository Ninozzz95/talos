/** Shared path labels extracted from the deleted first-run wizard. No filesystem access. */
export const normalizzaCartella = (p: unknown): string => String(p ?? '').replace(/\//g, '\\').replace(/[\\]+$/, '').replace(/^([a-z]):$/i, (_m, d: string) => `${d.toUpperCase()}:\\`);
export const nomeCartellaValido = (nome: unknown): boolean => {
  const n = String(nome ?? '').trim();
  return Boolean(n) && n !== '.' && n !== '..' && !/[\\/:*?"<>|]/.test(n);
};
export const ultimoSegmento = (p: unknown): string => {
  const n = normalizzaCartella(p); const parts = n.split('\\').filter(Boolean); const last = parts.at(-1) || n;
  return /^[a-z]:$/i.test(last) ? `${last}\\` : last;
};
export const cartellaSuperiore = (p: unknown): string | null => {
  const n = normalizzaCartella(p); if (/^[a-z]:\\$/i.test(n)) return null;
  const i = n.lastIndexOf('\\'); if (i <= 0) return null;
  const parent = n.slice(0, i); return /^[a-z]:$/i.test(parent) ? `${parent}\\` : parent;
};
