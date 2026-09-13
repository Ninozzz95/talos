/*
 * La RETE del laboratorio per il CRUD di Note, Attività e Memoria (12/09/2026).
 *
 * ⛔ Non è un secondo backend: è la stessa busta e le stesse chiavi del contratto
 *   (`.claude/RAPPORTO-CRUD-BACKEND-2026-09-11.md` §4), tenute in memoria, perché il laboratorio
 *   serve a GUARDARE le superfici — e senza una rete le tre sezioni, giustamente, non disegnano
 *   nemmeno un pulsante: un comando che non può funzionare non si mostra.
 * ⛔ Le due cose che il laboratorio deve poter far vedere e che l'elenco non porta sono `formato`
 *   (l'interruttore Anteprima/Testo di una nota) e `origine` («scritta da te»): qui arrivano dalla
 *   GET di una voce, esattamente come dal server vero.
 * ⛔ Il rilevamento del formato è quello della specifica CommonMark ridotto ai marcatori che il
 *   magazzino guarda (`rilevaFormatoNota`): serve a far vedere l'interruttore, non a sostituirlo.
 */

const MARCATORI = /^ {0,3}(#{1,6}\s|[-+*]\s|\d{1,9}[.)]\s|>\s|```|~~~|---)/m;

function formatoDi(testo) {
  return MARCATORI.test(String(testo ?? '')) || /\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*/.test(String(testo ?? '')) ? 'markdown' : 'testo';
}

/**
 * @param {{notes?:Array, tasks?:Array, memory?:Array}} dati le fixture, copiate (non mutate)
 * @returns {{rete:object, elenco:(risorsa:string)=>Array}} la rete da iniettare e ciò che c'è dentro
 */
export function reteDiProva(dati = {}) {
  const magazzino = {
    notes: (dati.notes || []).map((v) => ({ origine: 'modello', ...v })),
    tasks: (dati.tasks || []).map((v) => ({ origine: 'modello', ...v })),
    memory: (dati.memory || []).map((v) => ({ origine: 'persona', ...v })),
  };
  const CHIAVE = { notes: 'nota', tasks: 'attivita', memory: 'memoria' };
  const parti = (pathname) => {
    const m = /^\/api\/v1\/sessions\/[^/]+\/(notes|tasks|memory)(?:\/([^/]+))?(?:\/(stato))?$/.exec(pathname);
    if (!m) throw Object.assign(new Error('Indirizzo sconosciuto nel laboratorio'), { code: 'NOT_FOUND' });
    return { risorsa: m[1], id: m[2] ? decodeURIComponent(m[2]) : null, coda: m[3] || null };
  };
  const trova = (risorsa, id) => {
    const voce = magazzino[risorsa].find((v) => String(v.id) === String(id));
    if (!voce) throw Object.assign(new Error('Non c’è più'), { code: `${risorsa === 'notes' ? 'NOTE' : risorsa === 'tasks' ? 'TASK' : 'MEMORY'}_NOT_FOUND` });
    return voce;
  };
  const vestita = (risorsa, voce) => ({
    ...voce,
    ...(risorsa === 'notes' ? { formato: voce.formato || formatoDi(voce.contenuto) } : {}),
    ...(risorsa === 'tasks' ? { fatta: voce.stato === 'done' } : {}),
  });

  const rete = {
    leggi: async (pathname) => {
      const { risorsa, id } = parti(pathname);
      return { [CHIAVE[risorsa]]: vestita(risorsa, trova(risorsa, id)) };
    },
    post: async (pathname, corpo) => {
      const { risorsa, id, coda } = parti(pathname);
      if (coda === 'stato') {
        const voce = trova(risorsa, id);
        voce.stato = corpo.stato;
        voce.aggiornataAlle = new Date().toISOString();
        return { attivita: vestita(risorsa, voce) };
      }
      if (risorsa === 'memory') {
        const gemella = magazzino.memory.find((v) => String(v.titolo).trim().toLowerCase() === String(corpo.titolo).trim().toLowerCase());
        if (gemella) return { memoria: vestita(risorsa, gemella), duplicato: true };
      }
      const nata = {
        id: `nuova-${magazzino[risorsa].length + 1}`,
        stato: risorsa === 'tasks' ? 'todo' : undefined,
        priorita: 'normal',
        genere: 'preference',
        descrizione: null,
        ...corpo,
        origine: 'persona',
        creataAlle: new Date().toISOString(),
        aggiornataAlle: new Date().toISOString(),
      };
      magazzino[risorsa].unshift(nata);
      return { [CHIAVE[risorsa]]: vestita(risorsa, nata), ...(risorsa === 'memory' ? { duplicato: false } : {}) };
    },
    patch: async (pathname, corpo) => {
      const { risorsa, id } = parti(pathname);
      const voce = trova(risorsa, id);
      for (const [k, v] of Object.entries(corpo)) voce[k] = v === null ? undefined : v;
      voce.aggiornataAlle = new Date().toISOString();
      return { [CHIAVE[risorsa]]: vestita(risorsa, voce) };
    },
    elimina: async (pathname) => {
      const { risorsa, id } = parti(pathname);
      const voce = trova(risorsa, id);
      magazzino[risorsa] = magazzino[risorsa].filter((v) => v !== voce);
      return { eliminata: true, id: voce.id, titolo: voce.titolo };
    },
  };
  return { rete, elenco: (risorsa) => magazzino[risorsa].map((v) => ({ ...v })) };
}
