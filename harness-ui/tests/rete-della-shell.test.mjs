/*
 * La rete dei comandi (owner 09/10/2026, «Segue il modo + si chiede (Consigliata)»; lane CLI). Fuori da Accesso completo la sandbox
 * della CLI chiude la rete di ogni comando, e il modello non aveva modo di chiederla (il tester ha dovuto passare dai test). Ora
 * l'attrezzo `shell` ha `network: true`: l'azione da approvare lo porta (`rete: true`), la domanda parte in ogni livello tranne
 * «Full access» (chi ospita decide: la CLI la apre senza chiedere solo in Accesso completo), e l'esecutore riceve `rete: true`
 * solo dopo il sì. Codex: `sandbox_permissions: "require_escalated"` con una giustificazione; Claude Code:
 * `dangerouslyDisableSandbox: true`, che chiede fuori da bypassPermissions — entrambi tolgono TUTTA la sandbox, qui solo la rete.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { talosLavora, ATTREZZI_OPENAI } from '../src/kernel/talosHarness.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

const enc = new TextEncoder();
const risposta = (delta, fine) => new Response(new ReadableStream({ start(c) {
  c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`));
  c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: fine }] })}\n\n`));
  c.enqueue(enc.encode('data: [DONE]\n\n')); c.close();
} }));

async function comando(argomenti, { livelloAccesso = 'Workspace write', approva = true, reteChiusaDallOspite = true, permessiPerAttrezzo } = {}) {
  const domande = []; const eseguiti = []; const corpi = []; let n = 0;
  await talosLavora({
    cartella: cartellaDiProva('talos-rete-shell-'), task: { consegna: 'run it' }, modello: 'x', chiave: 'y', livelloAccesso,
    ...(reteChiusaDallOspite ? { reteChiusaDallOspite: true } : {}), ...(permessiPerAttrezzo ? { permessiPerAttrezzo } : {}),
    onDelta: () => {},
    chiediApprovazioneFn: async (azione) => { domande.push(azione); return approva; },
    eseguiComandoSandboxatoFn: async (cmd, _cartella, opzioni) => { eseguiti.push({ cmd, rete: opzioni?.rete === true }); return { codice: 0, testo: 'ok', enforcement: 'none' }; },
    fetchDiRete: async (_u, init) => { corpi.push(JSON.parse(init.body)); n += 1; return n === 1
      ? risposta({ tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'shell', arguments: JSON.stringify(argomenti) } }] }, 'tool_calls')
      : risposta({ content: 'done' }, 'stop'); },
  });
  return { domande, eseguiti, corpi };
}

test('rete: the shell tool offers `network`, optional, and says what it is for', () => {
  const shell = ATTREZZI_OPENAI.map((a) => a.function ?? a).find((a) => a.name === 'shell');
  const schema = shell.parameters ?? shell.input_schema;
  assert.equal(schema.properties.network?.type, 'boolean');
  assert.equal(schema.required.includes('network'), false);
  assert.match(schema.properties.network.description, /blocked network/u);
});

test('rete: network:true is asked even where a command is not, and runs with the network only after the yes', async () => {
  const si = await comando({ comando: 'npm view left-pad version', network: true });
  assert.equal(si.domande.length, 1);
  assert.equal(si.domande[0].rete, true);
  assert.deepEqual(si.eseguiti, [{ cmd: 'npm view left-pad version', rete: true }]);
  const no = await comando({ comando: 'npm view left-pad version', network: true }, { approva: false });
  assert.deepEqual(no.eseguiti, [], 'refused: not run at all');
});

test('rete: without network the command is as before (no question at this level, no network asked)', async () => {
  const r = await comando({ comando: 'dir' });
  assert.equal(r.domande.length, 0);
  assert.deepEqual(r.eseguiti, [{ cmd: 'dir', rete: false }]);
});

/*
 * R1 della review del desktop (09/10/2026): l'esecutore del desktop NON chiude la rete (Windows `enforcement: 'none'`, WSL2 non la
 * blocca). Lì `network: true` chiedeva alla persona un permesso che non cambia niente, la descrizione («il resto della sandbox
 * resta») era falsa, e «Per questa sessione» (shell: sempre) non bastava a far tacere la domanda. La rete chiusa la DICHIARA chi
 * ospita (`reteChiusaDallOspite: true`, la CLI): senza, lo schema non offre `network` e la richiesta non diventa una domanda.
 */
test('rete R1: without the host declaration the shell schema has no `network` and network:true asks nothing', async () => {
  const r = await comando({ comando: 'dir', network: true }, { reteChiusaDallOspite: false, permessiPerAttrezzo: { shell: 'sempre' } });
  const shell = r.corpi[0].tools.map((a) => a.function ?? a).find((a) => a.name === 'shell');
  assert.equal(shell.parameters.properties.network, undefined, 'the model is not offered a permission that changes nothing');
  assert.equal(r.domande.length, 0, '«for this session» stays silent: no question about a network that is not closed');
  assert.deepEqual(r.eseguiti, [{ cmd: 'dir', rete: false }]);
});

test('rete R1: with the host declaration the schema offers `network` and the question still comes', async () => {
  const r = await comando({ comando: 'dir', network: true }, { permessiPerAttrezzo: { shell: 'sempre' } });
  const shell = r.corpi[0].tools.map((a) => a.function ?? a).find((a) => a.name === 'shell');
  assert.equal(shell.parameters.properties.network?.type, 'boolean');
  assert.equal(r.domande.length, 1);
});

/*
 * Taccuino del 10/10/2026 (review di «talos desktop», confermato dalla CLI): l'eccezione «Full access» della domanda sulla rete
 *   confrontava `livelloAccesso` con la parola della POLITICA ('Full access'), ma il server del desktop passa il livello del
 *   KERNEL ('accesso-pieno', `livelloDaPermessi`): lì la rete avrebbe chiesto anche con accesso pieno. Oggi nessun ospite desktop
 *   dichiara la rete chiusa, quindi l'effetto è nullo; la CLI passa le parole della politica. Si accettano tutte e due.
 */
for (const livello of ['Full access', 'accesso-pieno']) {
  test(`rete: in full access (${livello}) network:true runs with the network and asks nothing`, async () => {
    const r = await comando({ comando: 'npm view left-pad version', network: true }, { livelloAccesso: livello });
    assert.equal(r.domande.length, 0);
    assert.deepEqual(r.eseguiti, [{ cmd: 'npm view left-pad version', rete: true }]);
  });
}
for (const livello of ['On request', 'su-richiesta', 'scrittura-progetto']) {
  test(`rete: AL CONTRARIO, below full access (${livello}) network:true still asks`, async () => {
    const r = await comando({ comando: 'npm view left-pad version', network: true }, { livelloAccesso: livello });
    assert.equal(r.domande.length, 1);
    assert.equal(r.domande[0].rete, true);
  });
}
