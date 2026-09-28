/*
 * ⭐ Refactor dei grafi (decisioni owner 24-31, 26/09/2026) — la DISPOSIZIONE del diagramma, portata dal prototipo approvato
 *   (`prototypes/grafi-v2/disposizione.js`, commit ab51d6166) sui dati VERI: elkjs fuori dal thread principale (decisione 26).
 *
 * Due livelli, e non uno, per una misura: con le fasi come partizioni di un solo layout gerarchico ELK centra sempre le
 * colonne in verticale (provate `bk.fixedAlignment` LEFTUP/RIGHTUP, `elk.alignment: TOP`, NETWORK_SIMPLEX, 25/09/2026) — e
 * la struttura R4 approvata (decisione 27) vuole le colonne allineate in cima.
 *  1. ELK dispone l'INTERNO di ogni fase aperta (strati a destra; `considerModelOrder` tiene l'ordine del grafo,
 *     `separateConnectedComponents: false` una colonna sola);
 *  2. le colonne delle fasi stanno in fila, cime allineate, con un CORRIDOIO fra l'una e l'altra;
 *  3. gli archi fra fasi li instradiamo noi nel corridoio, ortogonali, sfalsati di pochi pixel per non sovrapporsi.
 * Scala: fino a SOGLIA_GRIGLIA passi una fase aperta è un sottografo; oltre è un blocco a griglia (decisione 31, e 13: passi
 * singoli, niente sotto-gruppi) le cui CELLE si riempiono quando le loro pagine arrivano (a 1.120 passi sono 23 pagine: si
 * chiedono solo quelle che si vedono). Gli archi: solo quelli fra fasi aperte come sottografo (decisione 30, rotta filtrata
 * per fase); per ogni altra coppia di fasi UN arco contato dai `groupConnections` della panoramica — gli «archi fusi» di
 * Airflow (#67714). Coordinate relative al contenitore (eclipse.dev «Coordinate System», default).
 */
export const MISURE = Object.freeze({
  passo: { w: 236, h: 86 },
  gruppo: { w: 248, h: 214 },
  mini: { w: 216, h: 54, gap: 10 }, // 196 troncava «Agente 75 - Verifica» accanto alla durata (foto del 26/09)
  testaFase: 90, // 78 fino al 26/09: una riga sola di nome; ora il nome va a capo su due (owner «nome intero», grafo-tela.css)
  bordoFase: 16,
  corridoio: 76,
  margine: 24,
  sessione: { w: 320, h: 96 },
  sottoSessione: 88,
});
/* ⛔ foto del 26/09 (scena 200): con la soglia a 120 un gruppo aperto di 36 passi indipendenti diventava UNA colonna alta
   3.580 px, e «Adatta» scendeva al 15%. Oltre 12 passi la fase aperta è una griglia di card compatte (decisione owner 31). */
export const SOGLIA_GRIGLIA = 12;

/** Come si presenta ogni fase: `gruppo` chiuso, `fase` aperta come sottografo, `griglia` aperta a blocco. */
export function formaDelleFasi(panoramica, aperti) {
  return new Map(panoramica.groups.map((g) => [g.phaseId, !aperti.has(g.phaseId) ? 'gruppo' : g.total > SOGLIA_GRIGLIA ? 'griglia' : 'fase']));
}

/** La chiave di una cella della griglia: il passo che ci sta si sa solo quando la sua pagina è arrivata. */
export const chiaveCella = (phaseId, indice) => `cella:${phaseId}:${indice}`;

export function misuraGriglia(n) {
  const { w, h, gap } = MISURE.mini;
  const colonne = Math.max(2, Math.ceil(Math.sqrt((n * (h + gap)) / (w + gap))));
  const righe = Math.ceil(n / colonne);
  return { colonne, righe, w: MISURE.bordoFase * 2 + colonne * (w + gap) - gap, h: MISURE.testaFase + MISURE.bordoFase + righe * (h + gap) - gap };
}

/** Il sottografo di UNA fase aperta, per ELK. */
export function grafoDellaFase(fase, righe, archiInterni) {
  return {
    id: `fase:${fase.phaseId}`,
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.padding': `[top=${MISURE.testaFase},left=${MISURE.bordoFase},bottom=${MISURE.bordoFase},right=${MISURE.bordoFase}]`,
      'elk.separateConnectedComponents': 'false',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.edgeRouting': 'ORTHOGONAL',
      // Airflow `elkGraphUtils.ts:405-429`: SIMPLE è «much faster than the default BRANDES_KOEPF»
      'elk.layered.nodePlacement.strategy': righe.length > 60 ? 'SIMPLE' : 'BRANDES_KOEPF',
      'elk.spacing.nodeNode': '14',
      'elk.layered.spacing.nodeNodeBetweenLayers': '40',
      'elk.spacing.edgeNode': '12',
    },
    children: righe.map((r) => ({ id: r.nodeId, width: MISURE.passo.w, height: MISURE.passo.h })),
    edges: archiInterni.map((a) => ({ id: a.edgeId, sources: [a.fromNodeId], targets: [a.toNodeId] })),
  };
}

/** Un arco ortogonale fra due colonne, nel corridoio dopo la sorgente (sfalsato di `sfalsa` px). Salta le colonne passando sopra. */
export function instrada(da, a, { corsiaAlta, sfalsa = 0 }) {
  const cx = da.corridoio + sfalsa;
  if (a.colonna === da.colonna + 1) return [[da.x, da.y], [cx, da.y], [cx, a.y], [a.x, a.y]];
  const cx2 = a.corridoioPrima + sfalsa;
  return [[da.x, da.y], [cx, da.y], [cx, corsiaAlta], [cx2, corsiaAlta], [cx2, a.y], [a.x, a.y]];
}

/**
 * Il lavoro intero: sottografi → ELK (nel suo worker) → colonne → archi. `elk` è un'istanza di elkjs.
 * `righeFase`: le righe delle fasi aperte come SOTTOGRAFO (al più SOGLIA_GRIGLIA ciascuna, una pagina); `archi`: quelli
 * restituiti dalla rotta filtrata sulle stesse fasi (decisione 30).
 */
export async function disponi(elk, { panoramica, righeFase, archi }, aperti) {
  const t0 = globalThis.performance?.now?.() ?? Date.now();
  const forme = formaDelleFasi(panoramica, aperti);
  const faseDi = new Map();
  for (const [phaseId, righe] of righeFase) for (const r of righe) faseDi.set(r.nodeId, phaseId);
  const interni = new Map(panoramica.groups.map((g) => [g.phaseId, []]));
  const fra = [];
  for (const a of archi) {
    const p = faseDi.get(a.fromNodeId), q = faseDi.get(a.toNodeId);
    if (!p || !q || forme.get(p) !== 'fase' || forme.get(q) !== 'fase') continue; // un capo fuori da un sottografo: non si disegna
    if (p === q) interni.get(p).push(a); else fra.push(a);
  }
  // 1. l'interno delle fasi aperte come sottografo, tutte insieme (il worker di ELK le mette in fila)
  const sottografi = await Promise.all(panoramica.groups.map(async (g) => (forme.get(g.phaseId) === 'fase'
    ? elk.layout(grafoDellaFase(g, righeFase.get(g.phaseId) ?? [], interni.get(g.phaseId))) : null)));
  // 2. le colonne, cime allineate
  const cima = MISURE.sessione.h + MISURE.sottoSessione;
  const blocchi = [];
  const passi = new Map();
  const archiDisegnati = [];
  let x = MISURE.margine;
  panoramica.groups.forEach((g, colonna) => {
    const forma = forme.get(g.phaseId);
    let w, h;
    if (forma === 'gruppo') ({ w, h } = MISURE.gruppo);
    else if (forma === 'griglia') {
      const m = misuraGriglia(g.total);
      ({ w, h } = m);
      for (let i = 0; i < g.total; i += 1) {
        const c = i % m.colonne, riga = Math.floor(i / m.colonne);
        passi.set(chiaveCella(g.phaseId, i), { x: x + MISURE.bordoFase + c * (MISURE.mini.w + MISURE.mini.gap), y: cima + MISURE.testaFase + riga * (MISURE.mini.h + MISURE.mini.gap),
          w: MISURE.mini.w, h: MISURE.mini.h, forma: 'mini', phaseId: g.phaseId, colonna, indice: i });
      }
    } else {
      const s = sottografi[colonna];
      w = s.width; h = s.height;
      for (const c of s.children ?? []) passi.set(c.id, { x: x + c.x, y: cima + c.y, w: c.width, h: c.height, forma: 'card', phaseId: g.phaseId, colonna });
      for (const e of s.edges ?? []) {
        const punti = [];
        for (const sez of e.sections ?? []) {
          punti.push([x + sez.startPoint.x, cima + sez.startPoint.y]);
          for (const p of sez.bendPoints ?? []) punti.push([x + p.x, cima + p.y]);
          punti.push([x + sez.endPoint.x, cima + sez.endPoint.y]);
        }
        if (punti.length > 1) archiDisegnati.push({ id: e.id, da: e.sources[0], a: e.targets[0], punti, livello: 'passo' });
      }
    }
    blocchi.push({ id: `${forma}:${g.phaseId}`, tipo: forma, phaseId: g.phaseId, colonna, x, y: cima, w, h });
    x += w + MISURE.corridoio;
  });
  const larghezza = x - MISURE.corridoio + MISURE.margine;
  const altezza = Math.max(...blocchi.map((b) => b.y + b.h)) + MISURE.margine;
  // 3. gli archi fra le fasi: fra due sottografi aperti, un arco di passo; per ogni altra coppia uno solo fra i due blocchi, contato
  const bloccoDi = new Map(blocchi.map((b) => [b.phaseId, b]));
  const corsiaAlta = cima - 22;
  const porta = (b, lato, y) => ({ x: lato === 'esce' ? b.x + b.w : b.x, y, colonna: b.colonna, corridoio: b.x + b.w + MISURE.corridoio / 2, corridoioPrima: b.x - MISURE.corridoio / 2 });
  let k = 0;
  for (const a of fra) {
    const pa = passi.get(a.fromNodeId), pb = passi.get(a.toNodeId);
    if (!pa || !pb) continue;
    const da = { ...porta(bloccoDi.get(pa.phaseId), 'esce', pa.y + pa.h / 2), x: pa.x + pa.w };
    const verso = { ...porta(bloccoDi.get(pb.phaseId), 'entra', pb.y + pb.h / 2), x: pb.x };
    archiDisegnati.push({ id: a.edgeId, da: a.fromNodeId, a: a.toNodeId, punti: instrada(da, verso, { corsiaAlta, sfalsa: ((k++ % 7) - 3) * 4 }), livello: 'passo' });
  }
  for (const c of panoramica.groupConnections ?? []) {
    if (forme.get(c.fromPhaseId) === 'fase' && forme.get(c.toPhaseId) === 'fase') continue; // già disegnati passo per passo
    const bp = bloccoDi.get(c.fromPhaseId), bq = bloccoDi.get(c.toPhaseId);
    if (!bp || !bq) continue;
    const y = Math.min(bp.y + Math.min(bp.h, MISURE.gruppo.h) / 2, bq.y + Math.min(bq.h, MISURE.gruppo.h) / 2);
    archiDisegnati.push({ id: `fuso:${c.fromPhaseId}>${c.toPhaseId}`, da: `fase:${c.fromPhaseId}`, a: `fase:${c.toPhaseId}`, conto: c.total, livello: 'fase',
      punti: instrada(porta(bp, 'esce', y), porta(bq, 'entra', y), { corsiaAlta }) });
  }
  const sessione = { x: Math.round((larghezza - MISURE.sessione.w) / 2), y: 0, w: MISURE.sessione.w, h: MISURE.sessione.h };
  const ms = Math.round((globalThis.performance?.now?.() ?? Date.now()) - t0);
  return { blocchi, passi, archi: archiDisegnati, sessione, larghezza, altezza, forme, cima, ms };
}
