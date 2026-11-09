/*
 * FE-040, il cielo beta: la mappa dei progetti come modo di aprire Nuova sessione. Modulo suo, su tela, un solo ciclo, nessuna libreria; fermo a pagina
 * nascosta e a finestra chiusa; movimento ridotto calmo e mai fermo. Dal bozzetto `bozzetto-nuova-sessione-4`, righe 394-560. Di notte è un cielo vero, in
 * tema chiaro una carta celeste a inchiostro.
 * ⛔ «Elenco» è l'alternativa completa, e tutto si usa anche da tastiera.
 * ⛔ Nomi di sessioni e progetti entrano solo come testo. Il modulo non parla col server: l'avvio di un lavoro lo fa chi lo ospita (`onAvvia`), con la
 *   stessa strada della finestra. La finestra resta sempre a un clic. ⛔ Nessun accesso si alza da solo: il cielo propone quello scelto dalla persona.
 */
import { t as traduci, tn } from './lingua.js';
import { tempoBoard } from './board.js';
import { cercaNelCielo, costruisciCielo, esistevaAllora } from './cielo-dati.js';

const PAL = {
  notte: { griglia: 'rgba(150,170,200,.045)', tes: '#e9eef6', ten: '#93a1b4', lin: 'rgba(130,150,180,.22)', st: ['#fff3d6', '#f2b45c', '#a8671f'], alo: '201,139,50', fine: '#5f6c7e', corso: '#ffc266', att: '#f2c14e', rip: '#e8836b', sf: '210,222,240', alone: 'rgba(8,11,17,.82)', minifondo: 'rgba(9,13,21,.8)' },
  carta: { griglia: 'rgba(112,81,36,.1)', tes: '#2a2118', ten: '#7a6a55', lin: 'rgba(112,81,36,.34)', st: ['#fff', '#d39a48', '#705124'], alo: '201,139,50', fine: '#a79a86', corso: '#a85f12', att: '#a86c12', rip: '#b24f3a', sf: '112,81,36', alone: 'rgba(250,247,240,.86)', minifondo: 'rgba(250,247,240,.9)' },
};
const Z_MIN = 0.16;
const Z_MAX = 6;
const TONDO = 6.283;
const CARATTERE = '"Instrument Sans",sans-serif';

/** Dove sta un pianeta sulla sua orbita. */
export function posizione(s, l) {
  const c = Math.cos(s.rot); const n = Math.sin(s.rot);
  const x = Math.cos(l.a) * l.r; const y = Math.sin(l.a) * l.r * 0.64;
  return [s.x + x * c - y * n, s.y + x * n + y * c];
}

function orbite(stelle) {
  stelle.forEach((s, i) => {
    s.rot = ((i * 1.7) % 3.14) - 1.2;
    s.s.forEach((l, j) => {
      l.a = j * 2.4 + s.x * 0.01; l.r = s.m * 1.7 + 26 + Math.log1p(l.eta) * 30 + j * 9;
      l.w = (l.st === 'corso' ? 0.0009 : 0.00016) / (1 + j * 0.2); l.vis = 1;
      l.ag.forEach((a, k) => { a.a = k * 2.1; });
    });
  });
  return stelle;
}

const tocca = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/**
 * Revisione UX del 04/11, riga 29: il nome di una sessione copriva il nome o il conto del suo progetto. Il posto libero di un'etichetta, alla maniera
 * «greedy» di d3fc-label-layout (una etichetta dopo l'altra, contro i rettangoli già posati): a destra del pianeta, poi a sinistra, poi sopra e sotto.
 * Senza posto libero resta a destra, come prima.
 * @returns {{ x: number, y: number, w: number, h: number }} il rettangolo, col bordo sinistro dove comincia il testo
 */
export function postoEtichetta(occupati, px, py, raggio, w, h) {
  for (const [lato, dy] of [[1, 0], [-1, 0], [1, -h - 4], [1, h + 4], [-1, -h - 4], [-1, h + 4]]) {
    const r = { x: lato > 0 ? px + raggio + 7 : px - raggio - 7 - w, y: py - 7 + dy, w, h };
    if (!occupati.some((o) => tocca(o, r))) return r;
  }
  return { x: px + raggio + 7, y: py - 7, w, h };
}

/** Il disegno di un fotogramma: niente DOM, così una prova lo fa girare con un contesto finto. */
export function disegnaCielo(c, C, t, W, H, { scuro, calma }) {
  const p = scuro ? PAL.notte : PAL.carta;
  const lento = calma ? 0.2 : 1;
  const k = calma ? 0.35 : 0.09;
  if (C.ses && C.segui) { const [wx, wy] = posizione(C.ses.s, C.ses.l); const zz = C.mira.z; C.mira.x = wx + (W > 820 ? 178 / zz : 0); C.mira.y = wy + (W > 820 ? 0 : (H * 0.2) / zz); }
  if (!C.giu?.tira) { C.cam.x += (C.mira.x - C.cam.x) * k; C.cam.y += (C.mira.y - C.cam.y) * k; C.cam.z += (C.mira.z - C.cam.z) * k; }
  const z = C.cam.z;
  const SX = (x) => W / 2 + (x - C.cam.x) * z; const SY = (y) => H / 2 + (y - C.cam.y) * z;
  const cerchio = (x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, TONDO); };
  const scritta = (testo, x, y, font, col) => { c.font = font; c.lineJoin = 'round'; c.lineWidth = 3.5; c.strokeStyle = p.alone; c.strokeText(testo, x, y); c.fillStyle = col; c.fillText(testo, x, y); };
  c.clearRect(0, 0, W, H);
  /* reticolo della carta */
  c.strokeStyle = p.griglia; c.lineWidth = 1;
  for (let r = 300; r < 1900; r += 300) { cerchio(SX(1000), SY(700), r * z); c.stroke(); }
  /* stelle di fondo */
  for (const f of C.sf) {
    const x = W / 2 + (f.x - C.cam.x) * z * f.p; const y = H / 2 + (f.y - C.cam.y) * z * f.p;
    if (x < -4 || y < -4 || x > W + 4 || y > H + 4) continue;
    c.fillStyle = `rgba(${p.sf},${0.14 + (Math.sin(t * 0.001 * lento + f.f) + 1) * 0.17})`; cerchio(x, y, f.r); c.fill();
  }
  /* la galassia di questo PC: la sola che ha dati */
  { const x = SX(1000); const y = SY(700); const r = 900 * z; const a = c.createRadialGradient(x, y, 0, x, y, r); a.addColorStop(0, `rgba(${p.alo},.1)`); a.addColorStop(0.6, `rgba(${p.alo},.04)`); a.addColorStop(1, `rgba(${p.alo},0)`); c.fillStyle = a; cerchio(x, y, r); c.fill(); }
  /* costellazioni: i progetti in ordine di nascita */
  c.strokeStyle = p.lin; c.lineWidth = 1; c.setLineDash([2, 5]); c.beginPath();
  C.st.forEach((s, i) => { const x = SX(s.x); const y = SY(s.y); if (i === 0) c.moveTo(x, y); else c.lineTo(x, y); });
  c.stroke(); c.setLineDash([]);
  /* comete: automazioni in arrivo */
  C.stelleC = [];
  for (const co of C.comete) {
    const s = C.st[co.verso]; if (!s) continue;
    const u = (((t * lento * 0.00004 + co.a0) % 1) + 1) % 1; const d = co.d * (1 - u * 0.72); const a = co.a0 + u * 0.8;
    const cx = SX(s.x + Math.cos(a) * d); const cy = SY(s.y + Math.sin(a) * d);
    c.fillStyle = p.tes; cerchio(cx, cy, 2.6); c.fill();
    C.stelleC.push({ co, x: cx, y: cy });
    for (let q = 1; q < 16; q += 1) {
      const b = a - q * 0.016; const dd = co.d * (1 - (u - q * 0.012) * 0.72);
      c.fillStyle = `rgba(${p.sf},${0.4 - q * 0.025})`; cerchio(SX(s.x + Math.cos(b) * dd), SY(s.y + Math.sin(b) * dd), Math.max(0.4, 2.2 - q * 0.13)); c.fill();
    }
  }
  C.colpi = [];
  /* le scritte dei progetti si posano prima di tutto: i nomi delle sessioni le scansano (riga 29) */
  const largo = (testo, font) => { c.font = font; return c.measureText?.(testo)?.width ?? String(testo).length * 6.5; };
  const zm = z < 1.9 ? z : 1.9 + (z - 1.9) * 0.2;
  const fontNome = (s) => `600 ${Math.max(12.5, Math.min(13 + s.m * 0.42 * Math.min(z * 1.3, 1.5), 21))}px ${CARATTERE}`;
  const occupati = C.st.map((s) => {
    const x = SX(s.x); const y = SY(s.y); const m = s.m * zm; const conto = z > 0.6 && C.contoSessioni;
    const w = Math.max(largo(s.nomeVisto, fontNome(s)), conto ? largo(C.contoSessioni(s.tutte.length), `400 11.5px ${CARATTERE}`) : 0);
    return { x: x - w / 2, y: y + m - 4, w, h: conto ? 41 : 26 };
  });
  C.st.forEach((s, i) => {
    const x = SX(s.x); const y = SY(s.y);
    const vedi = (l) => esistevaAllora(l, C.tempo); const passa = (l) => C.filtro === 'tutto' || l.st === C.filtro;
    const attiva = s.s.some((l) => l.st === 'corso'); const aspetta = s.s.some((l) => l.st === 'aspetta' && vedi(l));
    const al = (C.filtro !== 'tutto' && !s.s.some((l) => passa(l) && vedi(l))) || (C.tempo > 0 && !s.s.some(vedi)) ? 0.25 : 1;
    const m = s.m * zm;
    c.globalAlpha = al;
    const fr = attiva ? 0.42 : 0.24 - Math.min(s.giorni, 10) * 0.012; const alo = c.createRadialGradient(x, y, 0, x, y, m * 5.5);
    alo.addColorStop(0, `rgba(${p.alo},${fr})`); alo.addColorStop(1, `rgba(${p.alo},0)`); c.fillStyle = alo; cerchio(x, y, m * 5.5); c.fill();
    /* cintura delle sessioni vecchie */
    if (s.vecchie && z > 0.42) {
      const rb = s.s.reduce((q, l) => Math.max(q, l.r), s.m * 2) + 34; const co = Math.cos(s.rot); const si = Math.sin(s.rot);
      for (let q = 0; q < Math.min(70, s.vecchie * 4); q += 1) {
        const a = q * 2.399 + s.rot; const w = rb + (q % 5) * 3; const lx = Math.cos(a) * w; const ly = Math.sin(a) * w * 0.64;
        c.fillStyle = p.fine; c.globalAlpha = al * 0.55; cerchio(SX(s.x + lx * co - ly * si), SY(s.y + lx * si + ly * co), Math.max(0.5, 0.9 * Math.min(z, 1.4))); c.fill();
      }
      c.globalAlpha = al;
    }
    for (const l of s.s) {
      l.vis += ((vedi(l) ? 1 : 0) - l.vis) * 0.1; if (l.vis < 0.02) continue;
      const ok = passa(l); const au = al * l.vis * (ok ? 1 : 0.2);
      c.globalAlpha = au * 0.55; c.strokeStyle = p.lin; c.lineWidth = l === C.ses?.l ? 1.6 : 1;
      c.save(); c.translate(x, y); c.rotate(s.rot); c.beginPath(); c.ellipse(0, 0, l.r * z, l.r * 0.64 * z, 0, 0, TONDO); c.stroke(); c.restore();
      l.a += l.w * 16 * lento;
      const [wx, wy] = posizione(s, l); const px = SX(wx); const py = SY(wy); const raggio = (1.8 + Math.sqrt(l.ctx) * 0.32) * Math.min(z * 1.25, 3.6);
      c.globalAlpha = au;
      /* la scia di chi sta lavorando */
      if (l.st === 'corso') {
        const co = Math.cos(s.rot); const si = Math.sin(s.rot);
        for (let q = 1; q < 14; q += 1) {
          const b = l.a - q * 0.075; const cx = Math.cos(b) * l.r; const cy = Math.sin(b) * l.r * 0.64;
          c.fillStyle = `rgba(${p.alo},${0.34 - q * 0.024})`; cerchio(SX(s.x + cx * co - cy * si), SY(s.y + cx * si + cy * co), Math.max(0.4, raggio * (1 - q * 0.06))); c.fill();
        }
      }
      if (l.st === 'aspetta' || l.st === 'riprendere') {
        const u = (Math.sin(t * 0.004 * lento) + 1) / 2;
        c.strokeStyle = l.st === 'aspetta' ? p.att : p.rip; c.globalAlpha = au * (l.st === 'aspetta' ? 0.9 - u * 0.6 : 0.6); c.lineWidth = 1.4;
        cerchio(px, py, raggio + 3 + (l.st === 'aspetta' ? u * 7 : 2)); c.stroke(); c.globalAlpha = au;
      }
      /* anelli: una compattazione, un anello, fino a tre */
      for (let q = 0; q < Math.min(l.ri, 3); q += 1) { c.strokeStyle = p.ten; c.lineWidth = 1; c.save(); c.translate(px, py); c.rotate(0.5); c.beginPath(); c.ellipse(0, 0, raggio + 3 + q * 2.6, (raggio + 3 + q * 2.6) * 0.4, 0, 0, TONDO); c.stroke(); c.restore(); }
      const col = l.st === 'corso' ? p.corso : l.st === 'aspetta' ? p.att : l.st === 'riprendere' ? p.rip : p.fine;
      const g = c.createRadialGradient(px - raggio * 0.3, py - raggio * 0.3, 0, px, py, raggio); g.addColorStop(0, '#fff'); g.addColorStop(0.28, col); g.addColorStop(1, col); c.fillStyle = g; cerchio(px, py, raggio); c.fill();
      /* lune: i sotto-agenti */
      for (const a of l.ag) {
        a.a += (a.st === 'corso' ? 0.03 : 0.006) * lento; const ra = raggio + 7 + (z > 2 ? 5 : 0);
        c.fillStyle = a.st === 'corso' ? p.corso : p.fine; cerchio(px + Math.cos(a.a) * ra, py + Math.sin(a.a) * ra * 0.7, Math.max(1, 1.3 * Math.min(z, 2))); c.fill();
      }
      C.colpi.push({ x: px, y: py, r: Math.max(13, raggio + 5), s, l });
      if ((z > 1.5 && l.st !== 'fine' && ok) || z > 2.7 || l === C.ses?.l) {
        const stato = z > 2.1 && C.statoTesto ? C.statoTesto(l) : null;
        const w = Math.max(largo(l.t, `500 12px ${CARATTERE}`), stato ? largo(stato, `400 11px ${CARATTERE}`) : 0);
        const r = postoEtichetta(occupati, px, py, raggio, w, stato ? 28 : 14); occupati.push(r);
        c.textAlign = 'left'; scritta(l.t, r.x, r.y + 11, `500 12px ${CARATTERE}`, p.tes); if (stato) scritta(stato, r.x, r.y + 25, `400 11px ${CARATTERE}`, p.ten);
      }
    }
    c.globalAlpha = al;
    /* i raggi di un progetto al lavoro: fermi con il movimento ridotto */
    if (attiva && !calma) {
      c.strokeStyle = `rgba(${p.alo},.5)`; c.lineWidth = 1;
      for (let q = 0; q < 4; q += 1) { const a = q * 1.571 + t * 0.00018; const r0 = m * 1.25; const r1 = m * (1.8 + Math.sin(t * 0.002 + q) * 0.15); c.beginPath(); c.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); c.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); c.stroke(); }
    }
    const g = c.createRadialGradient(x - m * 0.3, y - m * 0.3, 0, x, y, m); g.addColorStop(0, p.st[0]); g.addColorStop(0.5, p.st[1]); g.addColorStop(1, p.st[2]); c.fillStyle = g; cerchio(x, y, m); c.fill();
    if (aspetta && z < 1.2) { const u = (Math.sin(t * 0.0035 * lento) + 1) / 2; c.strokeStyle = p.att; c.globalAlpha = al * (0.7 - u * 0.5); c.lineWidth = 1.2; cerchio(x, y, m + 8 + u * 10); c.stroke(); c.globalAlpha = al; }
    if (C.fuoco === i || C.sel === s) { c.strokeStyle = p.tes; c.globalAlpha = 0.8; c.lineWidth = 1.3; c.setLineDash([4, 4]); cerchio(x, y, m + 7); c.stroke(); c.setLineDash([]); c.globalAlpha = al; }
    c.textAlign = 'center';
    scritta(s.nomeVisto, x, y + m + 18, fontNome(s), p.tes);
    if (z > 0.6 && C.contoSessioni) scritta(C.contoSessioni(s.tutte.length), x, y + m + 33, `400 11.5px ${CARATTERE}`, p.ten);
    c.globalAlpha = 1;
    C.colpi.push({ x, y, r: Math.max(26, m * 1.5), s, stella: true, i });
  });
  /* lampi: una sessione nata, una sessione finita */
  for (const a of C.lampi) {
    a.v += 0.02 * lento; const r = (6 + a.v * 70) * Math.min(z * 1.3, 2);
    c.strokeStyle = `rgba(${p.alo},${Math.max(0, 0.8 - a.v)})`; c.lineWidth = 2; cerchio(SX(a.x), SY(a.y), r); c.stroke();
  }
  C.lampi = C.lampi.filter((a) => a.v < 0.9);
  /* minimappa: solo da vicino, e mai sotto il pannello */
  const mw = Math.min(170, W * 0.22); const mh = mw * 0.64; const mx = W - mw - 14; const my = H - mh - 14;
  if (!(C.sel && W > 820) && W > 640 && z > (C.fit || Z_MIN) * 1.35) {
    c.fillStyle = p.minifondo; c.strokeStyle = p.lin; c.lineWidth = 1; c.beginPath(); c.roundRect?.(mx, my, mw, mh, 10); c.fill(); c.stroke();
    const k2 = mw / 2300; const ox = mx + 120 * k2; const oy = my + 30 * k2;
    for (const s of C.st) { c.fillStyle = s.s.some((l) => l.st === 'aspetta') ? p.att : p.st[1]; cerchio(ox + s.x * k2, oy + s.y * k2, Math.max(1.5, s.m * 0.14)); c.fill(); }
    const vx = ox + (C.cam.x - W / 2 / z) * k2; const vy = oy + (C.cam.y - H / 2 / z) * k2;
    c.strokeStyle = p.tes; c.strokeRect(Math.max(mx, vx), Math.max(my, vy), Math.min((W / z) * k2, mw), Math.min((H / z) * k2, mh));
    C.mini = { x: mx, y: my, w: mw, h: mh, k: k2, ox, oy };
  } else C.mini = null;
}

/** Il bersaglio più vicino: a pari distanza vince il pianeta, che è più piccolo e passa davanti alla stella. */
export function colpito(colpi, mx, my) {
  let m = null; let d = 1e9;
  for (const h of colpi ?? []) { const q = Math.hypot(mx - h.x, my - h.y); const pr = h.stella ? 1 : 0.6; if (q < h.r && q * pr < d) { m = h; d = q * pr; } }
  return m;
}

/**
 * @param {{ document: Document, contenitore: HTMLElement, dati: { sessioni: object[], automazioni?: object[] }, scuro: () => boolean, calma?: boolean,
 *   finestraDi?: Function, onApriSessione: Function, onNuovaQui: Function, onFinestra: Function, onBacheca: Function, onChiudi: Function,
 *   contesto?: object, pianifica?: (f: Function) => number, annulla?: (id: number) => void }} o
 */
export function apriCielo(o) {
  const doc = o.document;
  const crea = (tag, classe, testo) => { const n = doc.createElement(tag); if (classe) n.className = classe; if (testo !== undefined) n.textContent = testo; return n; };
  const bottone = (classe, testo, azione) => { const b = crea('button', classe, testo); b.type = 'button'; b.addEventListener('click', azione); return b; };
  const dati = costruisciCielo({ ...o.dati, finestraDi: o.finestraDi });
  const { stelle, comete } = dati;
  let { conti } = dati;
  const nomeDi = (s) => (s.libere ? traduci('sezioni.cielo.freeChats') : s.n);
  for (const s of stelle) s.nomeVisto = nomeDi(s);
  const C = { st: orbite(stelle), comete, sf: Array.from({ length: 260 }, (_, i) => ({ x: ((i * 811) % 2800) - 400, y: ((i * 547) % 2000) - 300, r: ((i * 7) % 12) / 10 + 0.2, f: i % 6, p: 0.25 + (i % 3) * 0.2 })), cam: { x: 1000, y: 700, z: 0.5 }, mira: { x: 1000, y: 700, z: 0.5 }, sel: null, ses: null, segui: false, filtro: 'tutto', tempo: 0, fuoco: -1, giu: null, colpi: [], lampi: [], stelleC: [], mini: null, fit: null, menu: null, bozza: '', avviso: '', scelta: { ...(o.scelte?.iniziale ?? {}) } };
  C.contoSessioni = (n) => tn('sezioni.cielo.sessionsOne', 'sezioni.cielo.sessionsMany', n);

  const radice = crea('div', 'cielo'); radice.dataset.c = 'Sky';
  const tela = crea('canvas'); tela.tabIndex = 0; tela.setAttribute('role', 'application'); tela.setAttribute('aria-label', traduci('sezioni.cielo.mapLabel'));
  const su = crea('div', 'c-su');
  const titolo = crea('div', 'c-tit');
  const nomeTitolo = crea('b'); const sottotitolo = crea('small');
  titolo.append(nomeTitolo, sottotitolo);
  const filtri = crea('div', 'c-fil'); filtri.setAttribute('role', 'group'); filtri.setAttribute('aria-label', traduci('sezioni.cielo.filter'));
  const cerca = crea('div', 'c-cerca');
  const campo = crea('input'); campo.placeholder = traduci('sezioni.cielo.search'); campo.setAttribute('aria-label', traduci('sezioni.cielo.search')); campo.autocomplete = 'off';
  const risultati = crea('div');
  cerca.append(campo, risultati);
  const azioni = crea('div', 'c-azioni');
  const beta = crea('span', 'talos-badge talos-badge--sm', traduci('sezioni.cielo.beta'));
  azioni.append(beta, bottone('c-tondo', traduci('sezioni.cielo.useWindow'), () => { chiudi(); o.onFinestra(); }), bottone('c-tondo', traduci('sezioni.cielo.close'), () => chiudi()));
  su.append(titolo, filtri, cerca, azioni);
  const giu = crea('div', 'c-giu');
  const tempo = crea('div', 'c-tempo');
  const pannelli = crea('div');
  const altro = crea('div');
  const elenco = bottone('c-tondo', traduci('sezioni.cielo.list'), () => mostraElenco());
  const allontana = bottone('c-tondo', '−', () => zooma(0.77)); allontana.setAttribute('aria-label', traduci('sezioni.cielo.zoomOut'));
  const avvicina = bottone('c-tondo', '+', () => zooma(1.3)); avvicina.setAttribute('aria-label', traduci('sezioni.cielo.zoomIn'));
  giu.append(tempo, allontana, avvicina, bottone('c-tondo', traduci('sezioni.cielo.wholeSky'), () => chiudiSelezione()), elenco, bottone('c-tondo', traduci('sezioni.cielo.legend'), () => mostraLegenda()));
  const sugg = crea('div', 'c-sugg'); sugg.hidden = true;
  const nuovoQui = bottone('nuovo-qui', traduci('sezioni.cielo.newProject'), () => { chiudi(); o.onFinestra(); }); nuovoQui.hidden = true;
  radice.append(tela, su, giu, pannelli, altro, sugg, nuovoQui);
  o.contenitore.append(radice);

  let W = tela.clientWidth || 1280; let H = tela.clientHeight || 800;
  const ctx = o.contesto ?? tela.getContext?.('2d');
  const misura = () => {
    const q = Math.min(globalThis.devicePixelRatio || 1, 2);
    W = tela.clientWidth || W; H = tela.clientHeight || H; tela.width = W * q; tela.height = H * q; ctx?.setTransform?.(q, 0, 0, q, 0, 0);
  };
  misura();
  const osservatore = typeof ResizeObserver === 'function' ? new ResizeObserver(misura) : null;
  osservatore?.observe(tela);

  /*
   * Riga 30 della revisione UX: il cielo intero si misura con le orbite (non solo coi centri delle stelle), fra la barra in alto (66 px) e quella in
   * basso (64 px) più lo spazio dei nomi sotto le stelle; con Elenco o «Come si legge» aperti a sinistra si sposta nella parte che resta libera.
   */
  const SU = 66; const GIU = 64; const NOMI = 40; const BORDO = 24;
  const riservaSinistra = () => {
    if (W <= 820) return 0; // sul telefono il riquadro prende tutta la larghezza: non c'è parte libera
    const aperto = altro.childNodes[0]?.className;
    return aperto === 'c-elenco' ? 334 + 16 : aperto === 'c-leg' ? 296 + 16 : 0;
  };
  function adatta() {
    if (!C.st.length) return;
    const raggio = (s) => Math.max(s.m * 2, ...s.s.map((l) => l.r));
    const x0 = Math.min(...C.st.map((s) => s.x - raggio(s))); const x1 = Math.max(...C.st.map((s) => s.x + raggio(s)));
    const y0 = Math.min(...C.st.map((s) => s.y - raggio(s))); const y1 = Math.max(...C.st.map((s) => s.y + raggio(s)));
    const sinistra = riservaSinistra();
    const largo = Math.max(W - sinistra - BORDO * 2, 40); const alto = Math.max(H - SU - GIU - NOMI - BORDO * 2, 40);
    const z = Math.max(Z_MIN, Math.min(1, largo / Math.max(x1 - x0, 1), alto / Math.max(y1 - y0, 1)));
    C.fit = z;
    const cx = sinistra + BORDO + largo / 2; const cy = SU + BORDO + alto / 2;
    C.mira = { x: (x0 + x1) / 2 - (cx - W / 2) / z, y: (y0 + y1) / 2 - (cy - H / 2) / z, z };
  }
  /* riga 31: chiude il riquadro di sinistra (Elenco o «Come si legge») e ridà al cielo tutta la larghezza */
  function chiudiAltro() { altro.replaceChildren(); elenco.setAttribute('aria-expanded', 'false'); if (!C.sel) adatta(); }
  function zooma(f, cx = W / 2, cy = H / 2) {
    const wx = C.cam.x + (cx - W / 2) / C.cam.z; const wy = C.cam.y + (cy - H / 2) / C.cam.z; const z = Math.max(Z_MIN, Math.min(Z_MAX, C.mira.z * f));
    C.mira = { x: wx - (cx - W / 2) / z, y: wy - (cy - H / 2) / z, z };
  }
  const secondi = (l) => (Number.isFinite(l.iniziato) ? traduci('sezioni.cielo.runningFor', { secondi: Math.max(0, Math.round((Date.now() - l.iniziato) / 1000)) }) : traduci('sezioni.cielo.running'));
  const statoTesto = (l) => (l.st === 'corso' ? secondi(l) : l.st === 'aspetta' ? traduci('sezioni.cielo.waiting') : l.st === 'riprendere' ? traduci('sezioni.cielo.resume') : tempoBoard(l.sessione.avviataAlle));

  C.statoTesto = statoTesto;

  function barra() {
    nomeTitolo.textContent = C.ses ? C.ses.l.t : C.sel ? C.sel.nomeVisto : traduci('sezioni.cielo.title');
    sottotitolo.textContent = C.tempo ? tn('sezioni.cielo.pastNoteOne', 'sezioni.cielo.pastNoteMany', C.tempo, { giorni: C.tempo }) : traduci('sezioni.cielo.counts', { corso: conti.corso, aspetta: tn('sezioni.cielo.waitingOne', 'sezioni.cielo.waitingMany', conti.aspetta) });
    filtri.replaceChildren(...[['tutto', traduci('sezioni.cielo.all')], ['corso', `${traduci('sezioni.cielo.running')} ${conti.corso}`], ['aspetta', `${traduci('sezioni.cielo.waiting')} ${conti.aspetta}`], ['riprendere', `${traduci('sezioni.cielo.resume')} ${conti.riprendere}`]].map(([f, testo]) => {
      const b = bottone('', testo, () => { C.filtro = f; if (f !== 'tutto' && !C.sel) { const i = C.st.findIndex((s) => s.s.some((l) => l.st === f)); if (i >= 0) C.fuoco = i; } barra(); }); b.setAttribute('aria-pressed', String(C.filtro === f)); return b;
    }));
    tempo.replaceChildren(crea('span', '', traduci('sezioni.cielo.lookBack')), ...[[0, 'now'], [1, 'yesterday'], [3, 'threeDays'], [7, 'week']].map(([g, k]) => {
      const b = bottone('', traduci(`sezioni.cielo.${k}`), () => { C.tempo = g; barra(); if (C.sel) pannelloStella(); }); b.setAttribute('aria-pressed', String(C.tempo === g)); return b;
    }));
  }
  function rigaSessione(s, l) {
    const b = bottone('c-ses', undefined, () => apriPianeta(s, l));
    const punto = crea('i', l.st);
    b.append(punto, crea('b', '', l.t), crea('em', '', l.ri ? tn('sezioni.cielo.compactionsOne', 'sezioni.cielo.compactionsMany', l.ri) : ''), crea('small', '', `${statoTesto(l)}${l.mod ? `, ${l.mod}` : ''}`));
    return b;
  }
  function numeri(coppie) {
    const griglia = crea('div', 'c-num');
    for (const [valore, nome] of coppie) { const d = crea('div'); d.append(crea('b', '', String(valore)), crea('small', '', nome)); griglia.append(d); }
    return griglia;
  }
  function pannello(nome) {
    const a = crea('aside', 'c-pan'); a.setAttribute('aria-label', nome);
    const via = bottone('c-x', '✕', () => chiudiSelezione());
    via.setAttribute('aria-label', traduci('sezioni.cielo.close'));
    a.append(via);
    return a;
  }
  function pannelloStella() {
    const s = C.sel; const a = pannello(s.nomeVisto);
    const ordine = { aspetta: 0, corso: 1, riprendere: 2, fine: 3 };
    const viste = s.s.filter((l) => esistevaAllora(l, C.tempo)).sort((x, y) => ordine[x.st] - ordine[y.st]);
    const lista = crea('div', 'c-lista');
    if (viste.length) lista.append(...viste.map((l) => rigaSessione(s, l))); else lista.append(crea('p', '', traduci('sezioni.cielo.nothingThen')));
    /* riga 29: un collegamento su una riga, non la griglia a tre colonne della riga di sessione, che metteva ogni parola nella colonna da 12 px */
    if (s.vecchie) lista.append(crea('div', 'c-et', traduci('sezioni.cielo.older', { n: s.vecchie })), bottone('c-tutte', traduci('sezioni.cielo.openAll'), () => { chiudi(); o.onBacheca(s); }));
    a.append(crea('h3', '', s.nomeVisto));
    if (s.p) a.append(crea('p', '', s.p));
    a.append(numeri([[s.tutte.length, traduci('sezioni.cielo.sessions')], [s.tutte.filter((l) => l.st === 'corso').length, traduci('sezioni.cielo.running')], [s.tutte.filter((l) => l.st === 'aspetta').length, traduci('sezioni.cielo.waiting')]]), lista, s.libere ? bottone('c-pieno', traduci('sezioni.cielo.useWindow'), () => { chiudi(); o.onFinestra(); }) : casellaDelLavoro(s));
    pannelli.replaceChildren(a);
  }
  /* la casella del lavoro: un messaggio su questo progetto, coi tre controlli di ogni avvio. La finestra resta a un clic per tutto il resto */
  function casellaDelLavoro(s) {
    const scatola = crea('div', 'c-comp');
    const scelte = o.scelte ?? {}; const scelta = C.scelta;
    const nomeDi2 = (lista, valore) => lista?.find((v) => v.valore === valore)?.nome ?? '';
    if (C.menu) {
      const menu = crea('div', 'c-menu'); const voci = scelte[C.menu] ?? [];
      for (const v of voci) {
        const b = bottone('', undefined, () => { scelta[{ modelli: 'modello', sforzi: 'sforzo', accessi: 'accesso' }[C.menu]] = v.valore; C.menu = null; pannelloStella(); });
        b.setAttribute('aria-pressed', String(Object.values(scelta).includes(v.valore))); b.disabled = v.spento === true;
        b.append(crea('span', '', v.nome)); if (v.nota) b.append(crea('small', '', v.nota)); menu.append(b);
      }
      scatola.append(menu);
    }
    const area = crea('textarea'); area.placeholder = traduci('sezioni.cielo.newWork', { nome: s.nomeVisto }); area.setAttribute('aria-label', area.placeholder); area.value = C.bozza;
    area.addEventListener('input', () => { C.bozza = area.value; });
    const avvia = async () => {
      const testo = area.value.trim();
      if (!testo) { area.focus(); return; }
      const esito = await o.onAvvia?.({ stella: s, testo, modello: scelta.modello, sforzo: scelta.sforzo, accesso: scelta.accesso });
      if (esito?.ok === false) { C.avviso = esito.messaggio ?? ''; pannelloStella(); return; }
      C.bozza = ''; C.avviso = ''; C.lampi.push({ x: s.x, y: s.y, v: 0 }); pannelloStella();
    };
    area.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void avvia(); } });
    const fila = crea('div', 'c-par');
    const chip = (k, testo, classe) => { const b = bottone(classe ?? '', testo, () => { C.menu = C.menu === k ? null : k; pannelloStella(); }); fila.append(b); };
    /* riga 29: senza un modello scelto il gettone era un riquadro vuoto; ora dice cosa fare */
    chip('modelli', nomeDi2(scelte.modelli, scelta.modello) || traduci('sezioni.cielo.chooseModel'));
    chip('sforzi', nomeDi2(scelte.sforzi, scelta.sforzo));
    chip('accessi', nomeDi2(scelte.accessi, scelta.accesso), scelta.accesso === 'Full access' ? 'alto' : '');
    fila.append(bottone('c-via', traduci('sezioni.cielo.start'), () => { void avvia(); }));
    scatola.append(area, fila);
    if (C.avviso) scatola.append(crea('div', 'c-avv', C.avviso));
    const fuori = crea('div'); fuori.append(scatola);
    if (scelta.accesso === 'Full access' && s.p) fuori.append(crea('p', '', traduci('sezioni.cielo.wholeFolder', { percorso: s.p })));
    fuori.append(bottone('c-indietro', traduci('sezioni.cielo.useWindow'), () => { chiudi(); o.onNuovaQui(s); }));
    return fuori;
  }
  function apriStella(i, vai = true) {
    const s = C.st[i]; C.sel = s; C.ses = null; C.segui = false; C.fuoco = i; C.menu = null; altro.replaceChildren(); nuovoQui.hidden = true;
    if (vai) { const z = 2.2; C.mira = { x: s.x + (W > 820 ? 178 / z : 0), y: s.y + (W > 820 ? 0 : (H * 0.2) / z), z }; }
    pannelloStella(); barra();
  }
  function apriPianeta(s, l) {
    C.sel = s; C.ses = { s, l }; C.segui = true; C.fuoco = C.st.indexOf(s);
    const [wx, wy] = posizione(s, l); const z = 4.2; C.mira = { x: wx + (W > 820 ? 178 / z : 0), y: wy + (W > 820 ? 0 : (H * 0.2) / z), z };
    const a = pannello(l.t);
    a.append(bottone('c-indietro', `‹ ${s.nomeVisto}`, () => apriStella(C.st.indexOf(s))), crea('h3', '', l.t), crea('p', '', statoTesto(l)), numeri([[l.giri, traduci('sezioni.cielo.turns')], [`${l.ctx}%`, traduci('sezioni.cielo.context')], [l.ri, traduci('sezioni.cielo.compactions')], ...(l.token === null ? [] : [[l.token.toLocaleString(), traduci('sezioni.cielo.tokens')]])]), crea('p', '', l.mod));
    if (l.ag.length) {
      const lista = crea('div', 'c-lista'); lista.append(crea('div', 'c-et', traduci('sezioni.cielo.subagents')));
      for (const ag of l.ag) { const r = crea('div', 'c-ag'); r.append(crea('i', ag.st), crea('span', '', ag.n), crea('em', '', ag.st === 'corso' ? traduci('sezioni.cielo.running') : traduci('sezioni.cielo.done'))); lista.append(r); }
      a.append(lista);
    }
    a.append(bottone('c-pieno', traduci(l.st === 'aspetta' ? 'sezioni.cielo.goToRequest' : l.st === 'riprendere' ? 'sezioni.cielo.doResume' : 'sezioni.cielo.open'), () => { chiudi(); o.onApriSessione(l.sessione); }));
    pannelli.replaceChildren(a);
    barra();
  }
  function chiudiSelezione() { C.sel = null; C.ses = null; C.segui = false; pannelli.replaceChildren(); adatta(); barra(); }
  function mostraElenco() {
    if (altro.childNodes[0]?.className === 'c-elenco') { chiudiAltro(); return; }
    const e = crea('div', 'c-elenco'); e.setAttribute('aria-label', traduci('sezioni.cielo.list'));
    C.st.forEach((s, i) => {
      const b = bottone('c-ses', undefined, () => apriStella(i));
      b.append(crea('i', s.tutte.some((l) => l.st === 'aspetta') ? 'aspetta' : s.tutte.some((l) => l.st === 'corso') ? 'corso' : ''), crea('b', '', s.nomeVisto), crea('em', '', String(s.tutte.length)));
      e.append(b);
    });
    if (!C.st.length) e.append(crea('p', '', traduci('sezioni.cielo.empty')));
    altro.replaceChildren(e); elenco.setAttribute('aria-expanded', 'true');
    if (!C.sel) adatta();
  }
  function mostraLegenda() {
    if (altro.childNodes[0]?.className === 'c-leg') { chiudiAltro(); return; }
    const l = crea('div', 'c-leg'); const dl = crea('dl');
    for (const k of ['star', 'planet', 'distance', 'rings', 'moons', 'belt', 'comet']) dl.append(crea('dt', '', traduci(`sezioni.cielo.legend.${k}`)), crea('dd', '', traduci(`sezioni.cielo.legend.${k}Means`)));
    l.append(dl); altro.replaceChildren(l); elenco.setAttribute('aria-expanded', 'false');
    if (!C.sel) adatta();
  }
  campo.addEventListener('input', () => {
    const trovati = cercaNelCielo(C.st, campo.value);
    if (!campo.value.trim()) { risultati.replaceChildren(); return; }
    const box = crea('div', 'c-ris');
    if (!trovati.length) { const b = crea('button', '', traduci('sezioni.cielo.noResults')); b.disabled = true; box.append(b); }
    for (const r of trovati) {
      const b = bottone('', r.tipo === 'stella' ? r.stella.nomeVisto : r.pianeta.t, () => { risultati.replaceChildren(); campo.value = ''; if (r.tipo === 'stella') apriStella(r.i); else if (r.stella.s.includes(r.pianeta)) apriPianeta(r.stella, r.pianeta); else { chiudi(); o.onApriSessione(r.pianeta.sessione); } });
      b.append(crea('small', '', r.tipo === 'stella' ? '' : r.stella.nomeVisto)); box.append(b);
    }
    risultati.replaceChildren(box);
  });
  const fraTempo = (ms) => { const min = Math.round(ms / 60_000); if (min < 60) return traduci('sezioni.cielo.inMinutes', { n: min }); const ore = Math.round(min / 60); return ore < 24 ? traduci('sezioni.cielo.inHours', { n: ore }) : tn('sezioni.cielo.inDaysOne', 'sezioni.cielo.inDaysMany', Math.round(ore / 24)); };
  /* il suggerimento al passaggio: stella, pianeta o cometa, sul pezzo esatto */
  function suggerisci(x, y) {
    const cometa = C.stelleC.find((v) => Math.hypot(x - v.x, y - v.y) < 14);
    const h = cometa ? null : colpito(C.colpi, x, y);
    if (!cometa && !h) { sugg.hidden = true; return; }
    const titolo = cometa ? cometa.co.n : h.stella ? h.s.nomeVisto : h.l.t;
    const sotto = cometa ? fraTempo(cometa.co.ms) : h.stella ? C.contoSessioni(h.s.tutte.length) : statoTesto(h.l);
    sugg.replaceChildren(crea('b', '', titolo), crea('small', '', sotto));
    sugg.style.left = `${Math.min(x + 14, W - 270)}px`; sugg.style.top = `${y + 14}px`; sugg.hidden = false;
  }
  const punto = (e) => { const r = tela.getBoundingClientRect?.() ?? { left: 0, top: 0 }; return [e.clientX - r.left, e.clientY - r.top]; };
  /* riga 29: al clic la vista si sposta, e il cartellino del punto di prima restava a galla su un posto ormai vuoto (WCAG 1.4.13: l'aiuto resta solo
     finché il puntatore è sul pezzo) */
  tela.addEventListener('pointerdown', (e) => { sugg.hidden = true; const [x, y] = punto(e); C.giu = { x, y, camX: C.cam.x, camY: C.cam.y, tira: false }; tela.setPointerCapture?.(e.pointerId); });
  tela.addEventListener('pointermove', (e) => {
    const [x, y] = punto(e);
    if (!C.giu) { suggerisci(x, y); return; }
    sugg.hidden = true;
    const dx = x - C.giu.x; const dy = y - C.giu.y;
    if (!C.giu.tira && Math.hypot(dx, dy) < 5) return;
    C.giu.tira = true; C.segui = false; C.cam.x = C.giu.camX - dx / C.cam.z; C.cam.y = C.giu.camY - dy / C.cam.z; C.mira = { ...C.mira, x: C.cam.x, y: C.cam.y };
  });
  tela.addEventListener('pointerup', (e) => {
    const tirava = C.giu?.tira; C.giu = null; sugg.hidden = true; if (tirava) return;
    const [x, y] = punto(e);
    if (C.mini && x >= C.mini.x && y >= C.mini.y && x <= C.mini.x + C.mini.w && y <= C.mini.y + C.mini.h) { C.mira = { ...C.mira, x: (x - C.mini.ox) / C.mini.k, y: (y - C.mini.oy) / C.mini.k }; return; }
    const h = colpito(C.colpi, x, y);
    nuovoQui.hidden = true;
    if (h?.stella) apriStella(h.i); else if (h) apriPianeta(h.s, h.l);
    else { /* nel vuoto: «Nuovo progetto» solo dopo l'etichetta visibile */ nuovoQui.style.left = `${x}px`; nuovoQui.style.top = `${y}px`; nuovoQui.hidden = false; }
  });
  tela.addEventListener('pointerleave', () => { sugg.hidden = true; });
  tela.addEventListener('wheel', (e) => { e.preventDefault(); sugg.hidden = true; const [x, y] = punto(e); zooma(e.deltaY < 0 ? 1.12 : 0.89, x, y); }, { passive: false });
  radice.addEventListener('keydown', (e) => {
    /* riga 31: Esc chiude il riquadro più in alto (risultati della ricerca, menu della casella, Elenco o «Come si legge»), come la pila LIFO dei
       livelli; solo senza riquadri torna indietro di un passo o chiude il cielo */
    if (e.key === 'Escape' && (risultati.childNodes.length || C.menu || (altro.childNodes.length && C.st.length))) {
      e.stopPropagation(); nuovoQui.hidden = true; sugg.hidden = true;
      if (risultati.childNodes.length) { risultati.replaceChildren(); campo.value = ''; } else if (C.menu) { C.menu = null; pannelloStella(); } else chiudiAltro();
      tela.focus?.(); return;
    }
    if (e.key === 'Escape') { e.stopPropagation(); nuovoQui.hidden = true; sugg.hidden = true; if (C.ses) apriStella(C.st.indexOf(C.ses.s), false); else if (C.sel) chiudiSelezione(); else chiudi(); tela.focus?.(); return; }
    if (e.target !== tela) return;
    if (e.key === '/') { e.preventDefault(); campo.focus(); return; }
    if (e.key === '+' || e.key === '=') { zooma(1.3); return; }
    if (e.key === '-') { zooma(0.77); return; }
    if (e.key === 'Enter' && C.fuoco >= 0) { apriStella(C.fuoco); return; }
    const v = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!v) return;
    e.preventDefault();
    const da = C.st[C.fuoco] ?? { x: C.mira.x, y: C.mira.y }; let m = -1; let md = 1e9;
    C.st.forEach((s, i) => {
      if (i === C.fuoco) return;
      const dx = s.x - da.x; const dy = s.y - da.y; if (dx * v[0] + dy * v[1] <= 0) return;
      const d = Math.hypot(dx, dy) + Math.abs(dx * v[1] - dy * v[0]) * 1.5; if (d < md) { md = d; m = i; }
    });
    if (m >= 0) { C.fuoco = m; C.mira = { ...C.mira, x: C.st[m].x, y: C.st[m].y }; }
  });

  /* un solo ciclo: fermo a pagina nascosta, e a finestra chiusa non si ripianifica */
  const pianifica = o.pianifica ?? ((f) => globalThis.requestAnimationFrame(f));
  const annulla = o.annulla ?? ((id) => globalThis.cancelAnimationFrame(id));
  let aperto = true; let ciclo = null;
  function fotogramma(t) {
    if (!aperto) return;
    if (!doc.hidden && ctx) disegnaCielo(ctx, C, t, W, H, { scuro: o.scuro(), calma: o.calma === true });
    radice.classList.toggle('carta', !o.scuro());
    ciclo = pianifica(fotogramma);
  }
  function chiudi() {
    if (!aperto) return;
    aperto = false; if (ciclo !== null) annulla(ciclo);
    osservatore?.disconnect();
    radice.remove();
    o.onChiudi?.();
  }
  /* l'elenco cambia mentre il cielo è aperto: le stelle restano dove sono, i pianeti sulla loro orbita; chi nasce e chi finisce fa un lampo */
  function aggiorna(nuoviDati) {
    if (!aperto) return;
    const nuovo = costruisciCielo({ ...nuoviDati, finestraDi: o.finestraDi });
    const stellePrima = new Map(C.st.map((s) => [s.n, s]));
    const primaPianeti = new Map(C.st.flatMap((s) => s.tutte).map((l) => [l.id, l]));
    const inPiu = nuovo.stelle.filter((s) => !stellePrima.has(s.n));
    const tenute = nuovo.stelle.filter((s) => stellePrima.has(s.n));
    for (const s of tenute) { const v = stellePrima.get(s.n); s.x = v.x; s.y = v.y; }
    C.st = orbite([...tenute.sort((a, b) => C.st.indexOf(stellePrima.get(a.n)) - C.st.indexOf(stellePrima.get(b.n))), ...inPiu]);
    for (const s of C.st) {
      s.nomeVisto = nomeDi(s);
      for (const l of s.s) {
        const v = primaPianeti.get(l.id);
        if (v) { l.a = v.a; l.vis = v.vis; for (const ag of l.ag) ag.a = v.ag.find((x) => x.id === ag.id)?.a ?? ag.a; }
        if (!v || (v.st === 'corso' && l.st === 'fine')) { const [x, y] = posizione(s, l); C.lampi.push({ x, y, v: 0 }); }
      }
    }
    C.comete = nuovo.comete; conti = nuovo.conti;
    if (C.sel) C.sel = C.st.find((s) => s.n === C.sel.n) ?? null;
    if (C.ses) { const l = C.sel?.s.find((x) => x.id === C.ses.l.id); C.ses = l ? { s: C.sel, l } : null; }
    if (C.sel && !C.ses) pannelloStella(); else if (C.ses) apriPianeta(C.ses.s, C.ses.l); else pannelli.replaceChildren();
    barra();
  }
  adatta(); C.cam = { ...C.mira, z: C.mira.z * 0.82 }; barra();
  if (!C.st.length) { altro.replaceChildren(crea('div', 'c-leg', traduci('sezioni.cielo.empty'))); }
  ciclo = pianifica(fotogramma);
  tela.focus?.();
  return { nodo: radice, chiudi, aggiorna, stato: C, aperto: () => aperto };
}
