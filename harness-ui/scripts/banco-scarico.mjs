/*
 * The bench's download of one file, resumed with Range, capped, watched for speed, checked against the LFS sha256.
 * Moved out of `banco-notte-famiglie.mjs` on 02/11/2026 so that it can be tried against a fake server (`tests/banco-scarico.test.mjs`).
 *
 * Why the speed watch: on 02/11 the third GPT-OSS file went at 0.4-0.9 MB/s for 96 minutes, with no error and so no retry; a new
 * connection went at 24 MB/s at once. Now a window with fewer bytes than the floor closes the request and resumes from Range.
 * Desktop's conditions (02/11): bytes are appended only on 206 whose Content-Range starts where asked; a 200 starts again from zero
 * (never duplicated bytes); the whole file is checked by its fingerprint; a cap on retries stops with a sentence, keeping the .part.
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as dormi } from 'node:timers/promises';

async function impronta(percorso) {
  const h = createHash('sha256');
  for await (const pezzo of createReadStream(percorso)) h.update(pezzo);
  return h.digest('hex');
}

const chiudi = (uscita) => new Promise((ok, no) => uscita.end((e) => (e ? no(e) : ok())));

export async function scaricaUno({
  url, nome, oid, byte, dove,
  fetchImpl = fetch,
  tetto = () => Infinity, // bytes per second allowed now (the night's cap: 10 MB/s during Performance's campaign, then 25)
  stato = () => {},
  attendi = dormi,
  tentativi = 8,
  attesaRiprova = (n) => 15_000 * n,
  sorveglianza = { finestraMs: 180_000, minimoBps: 2_000_000 }, // 3 minutes under 2 MB/s: close and resume
}) {
  const finale = join(dove, nome);
  const parte = `${finale}.part`;
  if (existsSync(finale) && statSync(finale).size === byte) return { finale, giaPresente: true };
  /* CLI review of d6acb0412 (02/11): the cap counts only attempts IN A ROW that brought no new byte (a 55 GB file on a line that breaks
     now and then would stop while it was moving); a hard ceiling on all attempts stays, so a broken server cannot loop forever */
  let senzaProgressi = 0;
  const giriMassimi = tentativi * 25;
  for (let tentativo = 1; senzaProgressi < tentativi && tentativo <= giriMassimi; tentativo += 1) {
    let da = existsSync(parte) ? statSync(parte).size : 0;
    if (da > byte) { // CLI review: a .part longer than the file would block every later attempt; it is removed and said
      rmSync(parte, { force: true });
      stato({ evento: 'riprova', file: nome, tentativo, motivo: `.part più lungo del file (${da} su ${byte}): tolto, si riparte da zero` });
      da = 0;
    }
    if (da === byte) break;
    const controllo = new AbortController();
    let nellaFinestra = 0;
    const guardia = setInterval(() => {
      /* CLI review S4: the floor never sits above the bench's own brake (0.8 × the cap), or the brake would close its own connection */
      const minimoBps = Math.min(sorveglianza.minimoBps, 0.8 * tetto());
      const minimo = (minimoBps * sorveglianza.finestraMs) / 1000;
      if (nellaFinestra < minimo) controllo.abort(new Error(`lento: ${nellaFinestra} byte in ${sorveglianza.finestraMs} ms, sotto ${Math.round(minimoBps)} B/s`));
      nellaFinestra = 0;
    }, sorveglianza.finestraMs);
    let uscita = null;
    try {
      const r = await fetchImpl(url, { headers: { Range: `bytes=${da}-`, 'User-Agent': 'talos-bench' }, redirect: 'follow', signal: controllo.signal });
      let daCapo = false;
      if (r.status === 206) {
        const inizio = /^bytes (\d+)-/u.exec(r.headers?.get?.('content-range') ?? '');
        if (!inizio || Number(inizio[1]) !== da) throw new Error(`Content-Range «${r.headers?.get?.('content-range')}» non parte da ${da}`);
      } else if (r.status === 200) {
        daCapo = true; // the server ignored the Range: the whole file comes again, the .part is rewritten from zero
      } else {
        throw new Error(`HTTP ${r.status}`);
      }
      uscita = createWriteStream(parte, { flags: daCapo ? 'w' : 'a' });
      let scritti = daCapo ? 0 : da;
      let prossimo = Date.now();
      for await (const pezzo of r.body) {
        nellaFinestra += pezzo.length;
        /* CLI review: never more bytes than the file (a 200 with a longer body, a wrong file): the extra is not written */
        if (scritti + pezzo.length > byte) throw new Error(`il server manda più byte del file (${scritti + pezzo.length} su ${byte}): .part più lungo evitato`);
        scritti += pezzo.length;
        if (!uscita.write(pezzo)) await new Promise((ok) => uscita.once('drain', ok));
        prossimo = Math.max(prossimo, Date.now() - 1000) + (pezzo.length / tetto()) * 1000;
        const anticipo = prossimo - Date.now();
        if (anticipo > 20) await attendi(anticipo);
      }
      await chiudi(uscita);
      uscita = null;
    } catch (e) {
      const motivo = controllo.signal.aborted ? String(controllo.signal.reason?.message ?? e.message) : e.message;
      stato({ evento: 'riprova', file: nome, tentativo, motivo });
      await attendi(attesaRiprova(senzaProgressi + 1));
    } finally {
      clearInterval(guardia);
      if (uscita) await chiudi(uscita).catch(() => {});
    }
    const dopo = existsSync(parte) ? statSync(parte).size : 0;
    senzaProgressi = dopo > da || (dopo === byte) ? 0 : senzaProgressi + 1;
  }
  const presi = existsSync(parte) ? statSync(parte).size : 0;
  if (presi > byte) rmSync(parte, { force: true });
  if (presi !== byte) throw new Error(`${nome}: non finito dopo ${tentativi} tentativi di fila senza byte nuovi (${presi} byte su ${byte}); ${presi > byte ? 'il .part più lungo è stato tolto' : 'il .part resta per riprendere'}`);
  const letta = await impronta(parte);
  if (letta !== oid) { rmSync(parte, { force: true }); throw new Error(`${nome}: impronta ${letta}, attesa ${oid}: file tolto`); }
  renameSync(parte, finale);
  return { finale, giaPresente: false };
}
