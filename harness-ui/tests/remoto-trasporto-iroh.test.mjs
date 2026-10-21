import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { ALPN_ACCOPPIAMENTO, ALPN_LAVORO, creaAccoppiamento } from '../src/remoto/accoppiamento.mjs';
import { creaElencoDispositivi } from '../src/remoto/dispositivi.mjs';
import { codifica, creaLettore } from '../src/remoto/filo.mjs';
import { creaServizioRemoto } from '../src/remoto/servizio.mjs';
import { avviaTrasportoIroh, configuraRelay, relaySenzaGettone } from '../src/remoto/trasporto-iroh.mjs';

/*
 * 18/10/2026 — controllo remoto, il TRASPORTO iroh vero: due endpoint sulla stessa macchina, SOLO percorso diretto (nessun relay,
 * nessuna scoperta: mai la rete vera nelle prove, contratto §17). Il binding qui è quello della prova del 17/10 (npm 1.1.0, in
 * TALOS-RICERCHE): il prodotto userà quello compilato nella nostra CI (owner 18/10). Se il binding non c'è, la prova si SALTA
 * dicendolo — non passa a vuoto.
 * ⛔ 21/10/2026 (export a secco della 0.1.35, BLOCCO PERCORSO): la cartella del binding NON si scrive qui — era un percorso vero della
 *   macchina e il cancello dell'export l'ha fermato. Si passa con `TALOS_IROH_BINDING=<cartella del pacchetto @number0/iroh>`.
 */
const BINDING = typeof process.env.TALOS_IROH_BINDING === 'string' && process.env.TALOS_IROH_BINDING ? process.env.TALOS_IROH_BINDING : null;
const iroh = BINDING && existsSync(BINDING) ? createRequire(import.meta.url)(BINDING) : null;
const salta = iroh ? false : 'binding iroh non presente (TALOS_IROH_BINDING non dato o cartella assente)';

const comeByte = (t) => Array.from(Buffer.from(t, 'utf8'));

async function telefono(iroh) {
  const b = iroh.Endpoint.builder();
  configuraRelay(iroh, b, { modo: 'solo-diretto' });
  return b.bind();
}

async function chiama(ep, pc, alpn, messaggi) {
  const conn = await ep.connect(new iroh.EndpointAddr(iroh.EndpointId.fromString(pc.id), null, pc.diretti), comeByte(alpn));
  const bi = await conn.openBi();
  for (const m of messaggi) await bi.send.writeAll(Array.from(codifica(m)));
  const lettore = creaLettore();
  const pronti = [];
  return {
    conn, bi,
    async ricevi() {
      while (!pronti.length) {
        const pezzo = await bi.recv.read(65536);
        if (pezzo == null) return null;
        pronti.push(...lettore.aggiungi(pezzo));
      }
      return pronti.shift();
    },
    manda: (m) => bi.send.writeAll(Array.from(codifica(m))),
  };
}

test('TRA-01 sopra iroh vero: lo sconosciuto riceve NOT_PAIRED; accoppiato col codice, il telefono lavora', { skip: salta, timeout: 60_000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-remoto-iroh-'));
  const accoppiamento = creaAccoppiamento();
  const dispositivi = creaElencoDispositivi({ file: join(dir, 'telefoni.json') });
  const operazioni = { async esegui(op, args) { if (op === 'eco') return { eco: args.testo }; throw Object.assign(new Error('no'), { code: 'UNKNOWN_OPERATION' }); } };
  const chiave = iroh.SecretKey.generate().toBytes();
  let servizio;
  const pc = await avviaTrasportoIroh({ iroh, chiaveSegreta: Uint8Array.from(chiave), relay: { modo: 'solo-diretto' }, gestisci: (c) => servizio.gestisci(c) });
  servizio = creaServizioRemoto({ pcId: pc.id, nomePc: 'PC', vapidPubblica: 'V', accoppiamento, dispositivi, operazioni });
  const ep = await telefono(iroh);
  const estraneo = await telefono(iroh);
  t.after(async () => { await pc.ferma(); await ep.close(); await estraneo.close(); rimuoviCartellaDiProva(dir); });
  pc.diretti = (await new Promise((r) => setTimeout(r, 300)), pc.indirizziDiretti());
  assert.ok(pc.diretti.length > 0, 'il PC ha almeno un indirizzo diretto');

  /* lo sconosciuto */
  const no = await chiama(estraneo, pc, ALPN_LAVORO, [{ t: 'req', n: 'n-0000001', op: 'eco', args: { testo: 'x' } }]);
  assert.equal((await no.ricevi()).code, 'NOT_PAIRED');

  /* accoppiamento */
  const { gettone } = accoppiamento.apri({ pcId: pc.id });
  const p = await chiama(ep, pc, ALPN_ACCOPPIAMENTO, [{ t: 'pair.hello', gettone, nome: 'Pad' }]);
  const codice = await p.ricevi();
  assert.equal(codice.t, 'pair.code');
  assert.equal(accoppiamento.inAttesa()[0].telefonoId, ep.id().toString(), 'remoteId = la chiave vera del telefono');
  await servizio.conferma(accoppiamento.inAttesa()[0].id);
  assert.equal((await p.ricevi()).t, 'pair.ok');

  /* lavoro */
  const w = await chiama(ep, pc, ALPN_LAVORO, [{ t: 'req', n: 'n-0000002', op: 'eco', args: { testo: 'ciao' } }]);
  assert.deepEqual(await w.ricevi(), { v: 1, t: 'res', n: 'n-0000002', ok: true, data: { eco: 'ciao' } });
  assert.deepEqual(servizio.inLinea().length, 1);
});

test('TRA-02 talos-relay col gettone: si stacca dall\'indirizzo e va in authToken con la porta QUIC 7842; senza gettone come prima', () => {
  const finto = () => {
    const fatti = { inserite: [], modo: null };
    const irohFinto = {
      presetMinimal: () => {},
      RelayMap: { empty: () => ({ insert: (c) => fatti.inserite.push(c) }) },
      RelayMode: { custom: (m) => ({ custom: m }), customFromUrls: (u) => ({ urls: u }) },
    };
    return { irohFinto, fatti, builder: { relayMode: (m) => { fatti.modo = m; } } };
  };
  const a = finto();
  configuraRelay(a.irohFinto, a.builder, { modo: 'proprio', url: 'https://relay.esempio.it/?token=abc%2B1' });
  assert.deepEqual(a.fatti.inserite, [{ url: 'https://relay.esempio.it/', quicPort: 7842, authToken: 'abc+1' }]);
  assert.ok(a.fatti.modo.custom, 'mappa propria, non customFromUrls');
  const b = finto();
  configuraRelay(b.irohFinto, b.builder, { modo: 'proprio', url: 'https://relay.esempio.it' });
  assert.deepEqual([b.fatti.inserite, b.fatti.modo], [[], { urls: ['https://relay.esempio.it'] }]);
  assert.throws(() => configuraRelay(finto().irohFinto, finto().builder, { modo: 'proprio', url: 'http://relay.esempio.it/?token=x' }), { code: 'REMOTE_RELAY_INVALID' });
  assert.equal(relaySenzaGettone('https://relay.esempio.it/?token=x'), 'https://relay.esempio.it/');
  assert.equal(relaySenzaGettone('https://relay.esempio.it/?a=1&token=x'), 'https://relay.esempio.it/?a=1');
});
