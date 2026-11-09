// UIG-9.3 (ledger UI generativa 05/11, G-C, scena 9): la disposizione del diagramma. Nessuna sovrapposizione, un ciclo termina.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NODO, disponiDiagramma } from '../src/blocchi/disposizione.mjs';

const nodi = (n) => Array.from({ length: n }, (_, i) => ({ id: `n${i}`, testo: `Nodo ${i}` }));

function nessunaSovrapposizione(r) {
  const scatole = [...r.posizioni.values()];
  for (let i = 0; i < scatole.length; i += 1) {
    const p = scatole[i];
    assert.ok(p.x >= 0 && p.y >= 0 && p.x + NODO.larghezza <= r.larghezza && p.y + NODO.altezza <= r.altezza, 'dentro la tela');
    for (let j = i + 1; j < scatole.length; j += 1) {
      const q = scatole[j];
      const separati = p.x + NODO.larghezza <= q.x || q.x + NODO.larghezza <= p.x || p.y + NODO.altezza <= q.y || q.y + NODO.altezza <= p.y;
      assert.ok(separati, `nodi ${i} e ${j} sovrapposti`);
    }
  }
}

test('UIG-9.3 una catena va dall\'alto in basso, una freccia in avanti scende', () => {
  const r = disponiDiagramma(nodi(3), [{ da: 'n0', a: 'n1' }, { da: 'n1', a: 'n2' }]);
  const y = (id) => r.posizioni.get(id).y;
  assert.ok(y('n0') < y('n1') && y('n1') < y('n2'));
  assert.equal(r.posizioni.get('n0').x, r.posizioni.get('n2').x);
  nessunaSovrapposizione(r);
  for (const f of r.frecce) assert.ok(f.punti.at(-1)[1] > f.punti[0][1] && !f.indietro);
});

test('UIG-9.3 cammino più lungo: un nodo raggiunto da due strade sta sotto la più lunga', () => {
  const r = disponiDiagramma(nodi(4), [{ da: 'n0', a: 'n1' }, { da: 'n1', a: 'n2' }, { da: 'n0', a: 'n3' }, { da: 'n2', a: 'n3' }]);
  assert.ok(r.posizioni.get('n3').y > r.posizioni.get('n2').y);
});

test('UIG-9.3 un ciclo termina: la freccia che lo chiude è tagliata dai livelli e disegnata lo stesso, all\'indietro', () => {
  const r = disponiDiagramma(nodi(3), [{ da: 'n0', a: 'n1' }, { da: 'n1', a: 'n2' }, { da: 'n2', a: 'n0' }, { da: 'n1', a: 'n1' }]);
  assert.equal(r.posizioni.size, 3);
  assert.equal(r.frecce.length, 4);
  assert.deepEqual(r.frecce.map((f) => f.indietro), [false, false, true, true]);
  assert.ok(r.frecce[2].punti.at(-1)[1] < r.frecce[2].punti[0][1], 'la freccia all\'indietro sale');
  nessunaSovrapposizione(r);
  // un ciclo che copre tutti i 12 nodi, più 4 corde: termina e non sovrappone
  const dodici = nodi(12);
  const anello = dodici.map((n, i) => ({ da: n.id, a: dodici[(i + 1) % 12].id }));
  const r2 = disponiDiagramma(dodici, [...anello, { da: 'n3', a: 'n0' }, { da: 'n5', a: 'n2' }, { da: 'n7', a: 'n9' }, { da: 'n11', a: 'n6' }]);
  assert.equal(r2.posizioni.size, 12);
  nessunaSovrapposizione(r2);
});

test('UIG-9.3 nessuna sovrapposizione su 300 grafi a caso fino a 12 nodi e 16 frecce; frecce verso nodi assenti ignorate', () => {
  let seme = 9;
  const caso = (n) => { seme = (seme * 1103515245 + 12345) % 2147483648; return Math.floor((seme / 2147483648) * n); };
  for (let k = 0; k < 300; k += 1) {
    const ns = nodi(1 + caso(12));
    const fs = Array.from({ length: caso(17) }, () => ({ da: ns[caso(ns.length)].id, a: ns[caso(ns.length)].id }));
    const r = disponiDiagramma(ns, fs);
    assert.equal(r.posizioni.size, ns.length);
    nessunaSovrapposizione(r);
    for (const f of r.frecce) for (const [x, y] of f.punti) assert.ok(Number.isFinite(x) && Number.isFinite(y));
  }
  assert.equal(disponiDiagramma(nodi(2), [{ da: 'n0', a: 'zz' }]).frecce.length, 0);
  assert.equal(disponiDiagramma([], []).posizioni.size, 0);
});

test('UIG-9.3 il baricentro riduce gli incroci: i figli seguono l\'ordine dei genitori', () => {
  // n0, n1 in alto; n2 figlio di n1, n3 figlio di n0: dopo la passata n3 sta a sinistra di n2
  const r = disponiDiagramma(nodi(4), [{ da: 'n1', a: 'n2' }, { da: 'n0', a: 'n3' }]);
  assert.ok(r.posizioni.get('n3').x < r.posizioni.get('n2').x);
});

test('C2 d3 ogni livello è centrato sulla larghezza del più largo', () => {
  // n0 sopra n1, n2, n3: il livello 0 ha un nodo solo, il livello 1 ne ha tre
  const r = disponiDiagramma(nodi(4), [{ da: 'n0', a: 'n1' }, { da: 'n0', a: 'n2' }, { da: 'n0', a: 'n3' }]);
  const centro = (id) => r.posizioni.get(id).x + NODO.larghezza / 2;
  assert.equal(centro('n0'), r.larghezza / 2, 'il nodo solo sta in mezzo');
  assert.equal(centro('n2'), r.larghezza / 2, 'il figlio di mezzo sta in mezzo');
  assert.equal(r.posizioni.get('n1').x, r.larghezza - (r.posizioni.get('n3').x + NODO.larghezza), 'margini uguali ai due lati');
});

test('C2 un anello su sé stesso resta dentro la tela, anche sul nodo più a destra; senza anelli la tela non cambia', () => {
  const senza = disponiDiagramma(nodi(2), []);
  const con = disponiDiagramma(nodi(2), [{ da: 'n1', a: 'n1' }]);
  const destra = Math.max(...con.frecce[0].punti.map((p) => p[0]));
  assert.ok(destra <= con.larghezza, `anello a ${destra}, tela ${con.larghezza}`);
  assert.deepEqual([...con.posizioni], [...senza.posizioni], 'i nodi non si spostano per l\'anello');
  assert.equal(senza.larghezza, 352, 'senza anelli la tela è quella di prima: 2×12 di margine + 2×150 + 28');
  // l'anello di un nodo che non tocca il bordo destro non allarga niente
  const solo = (fs) => disponiDiagramma(nodi(3), fs).larghezza;
  // una freccia che PARTE dal nodo più a destra (n1, livello 0) non è un anello: la tela non si allarga
  assert.equal(solo([{ da: 'n0', a: 'n2' }, { da: 'n1', a: 'n2' }]), 352, 'frecce senza anelli: la tela non si allarga');
  assert.equal(solo([{ da: 'n0', a: 'n0' }, { da: 'n0', a: 'n1' }, { da: 'n0', a: 'n2' }]), solo([{ da: 'n0', a: 'n1' }, { da: 'n0', a: 'n2' }]));
  // 300 grafi a caso: ogni punto di ogni freccia sta dentro la tela
  let seme = 31;
  const caso = (n) => { seme = (seme * 1103515245 + 12345) % 2147483648; return Math.floor((seme / 2147483648) * n); };
  for (let k = 0; k < 300; k += 1) {
    const ns = nodi(1 + caso(12));
    const fs = Array.from({ length: caso(17) }, () => ({ da: ns[caso(ns.length)].id, a: ns[caso(ns.length)].id }));
    const r = disponiDiagramma(ns, fs);
    for (const f of r.frecce) for (const [x, y] of f.punti) assert.ok(x >= 0 && x <= r.larghezza && y >= 0 && y <= r.altezza, `punto ${x},${y} fuori da ${r.larghezza}×${r.altezza}`);
  }
});
