import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, chmod, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { startTau2SimulatorProviderServer } from "../../control-plane/tests/human-journey/fixtures/tau2SimulatorProviderServer.mjs";

const fixtureHostPath = resolve("scripts/human-journey/fixture-host.mjs");

test("HJSTART-002 fixture host publishes separated descriptors and releases both loopback servers", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "talos-hj-fixture-host-"));
  await chmod(root, 0o700).catch(() => undefined);
  t.after(async () => rm(root, { recursive: true, force: true }));
  const readyFile = join(root, "ready.json");
  const secretFile = join(root, "control.json");
  const child = spawn(process.execPath, [
    fixtureHostPath,
    `--ready-file=${readyFile}`,
    `--secret-file=${secretFile}`,
  ], {
    cwd: resolve("."),
    env: { ...process.env, NODE_ENV: "test" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  });

  await waitForFile(readyFile, child, 5_000);
  const ready = JSON.parse(await readFile(readyFile, "utf8"));
  const secret = JSON.parse(await readFile(secretFile, "utf8"));

  assert.deepEqual(Object.keys(ready).sort(), [
    "browser_site_origin",
    "pid",
    "protocol",
    "provider_base_url",
    "provider_health_url",
    "started_at",
  ]);
  assert.equal(ready.protocol, "talos.human_journey.fixture_host.v1");
  assert.equal(ready.pid, child.pid);
  assert.match(ready.browser_site_origin, /^http:\/\/127\.0\.0\.1:[0-9]+$/u);
  assert.match(ready.provider_base_url, /^http:\/\/127\.0\.0\.1:[0-9]+$/u);
  assert.equal(ready.provider_health_url, `${ready.provider_base_url}/health`);
  assert.deepEqual(Object.keys(secret).sort(), ["protocol", "provider_control_token"]);
  assert.equal(secret.protocol, "talos.human_journey.fixture_secret.v1");
  assert.match(secret.provider_control_token, /^[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify(ready).includes(secret.provider_control_token), false);

  const [siteResponse, providerResponse] = await Promise.all([
    fetch(`${ready.browser_site_origin}/`),
    fetch(ready.provider_health_url),
  ]);
  assert.equal(siteResponse.status, 200);
  assert.match(await siteResponse.text(), /<h1>Deterministic catalog<\/h1>/u);
  assert.equal(providerResponse.status, 200);
  assert.deepEqual(await providerResponse.json(), {
    contract: "talos.human_journey.provider_fixture",
    status: "ok",
    version: 1,
  });
  if (process.platform !== "win32") {
    assert.equal((await stat(secretFile)).mode & 0o777, 0o600);
  }

  child.kill("SIGTERM");
  await waitForExit(child, 5_000);
  const renderedOutput = `${Buffer.concat(stdout).toString("utf8")}\n${Buffer.concat(stderr).toString("utf8")}`;
  assert.equal(renderedOutput.includes(secret.provider_control_token), false);
  await assert.rejects(fetch(`${ready.browser_site_origin}/`));
  await assert.rejects(fetch(ready.provider_health_url));
});

test("HJ9-028 adaptive fixture host publishes isolated simulator credentials and a real OpenAI-compatible endpoint", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "talos-hj-adaptive-fixture-host-"));
  await chmod(root, 0o700).catch(() => undefined);
  t.after(async () => rm(root, { recursive: true, force: true }));
  const readyFile = join(root, "ready.json");
  const secretFile = join(root, "control.json");
  const child = spawn(process.execPath, [
    fixtureHostPath,
    `--ready-file=${readyFile}`,
    `--secret-file=${secretFile}`,
    "--lane=adaptive",
  ], {
    cwd: resolve("."),
    env: { ...process.env, NODE_ENV: "test" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const stderr = [];
  child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  });

  await waitForFile(readyFile, child, 5_000);
  const ready = JSON.parse(await readFile(readyFile, "utf8"));
  const secret = JSON.parse(await readFile(secretFile, "utf8"));

  assert.deepEqual(Object.keys(ready).sort(), [
    "browser_site_origin",
    "pid",
    "protocol",
    "provider_base_url",
    "provider_health_url",
    "simulator_base_url",
    "simulator_health_url",
    "started_at",
  ]);
  assert.equal(ready.protocol, "talos.human_journey.fixture_host.adaptive.v1");
  assert.deepEqual(Object.keys(secret).sort(), [
    "protocol",
    "provider_control_token",
    "simulator_api_key",
  ]);
  assert.equal(secret.protocol, "talos.human_journey.fixture_secret.adaptive.v1");
  assert.match(secret.simulator_api_key, /^[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify(ready).includes(secret.simulator_api_key), false);

  const providerOrigin = new URL(ready.provider_base_url).origin;
  const simulatorOrigin = new URL(ready.simulator_base_url).origin;
  assert.notEqual(providerOrigin, simulatorOrigin);
  assert.equal(ready.simulator_base_url, `${simulatorOrigin}/v1`);
  assert.equal(ready.simulator_health_url, `${simulatorOrigin}/health`);

  const unauthorized = await fetch(`${ready.simulator_base_url}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "talos-hj-tau2-simulator", messages: [], seed: 42 }),
  });
  assert.equal(unauthorized.status, 401);

  const completionRequest = {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret.simulator_api_key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "talos-hj-tau2-simulator",
      messages: [{
        role: "system",
        content: `<scenario>The controlled target URL is ${ready.browser_site_origin}/catalog.</scenario>`,
      }],
      seed: 42,
      max_tokens: 128,
    }),
  };
  const response = await fetch(`${ready.simulator_base_url}/chat/completions`, completionRequest);
  assert.equal(response.status, 200);
  const completion = await response.json();
  assert.equal(completion.object, "chat.completion");
  assert.match(completion.choices[0].message.content, new RegExp(ready.browser_site_origin.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));

  child.kill("SIGTERM");
  await waitForExit(child, 5_000);
  assert.equal(Buffer.concat(stderr).toString("utf8").includes(secret.simulator_api_key), false);
  await assert.rejects(fetch(ready.simulator_health_url));
  await assert.rejects(fetch(ready.provider_health_url));
});

test("HJ9-041 adaptive simulator advances from conversation history across changing seeds and replays identical requests", async (t) => {
  const apiKey = "a".repeat(64);
  const fixture = await startTau2SimulatorProviderServer({ apiKey });
  t.after(() => fixture.close());

  const target = "http://127.0.0.1:43125/catalog";
  const messages = [
    { role: "system", content: `<scenario>The controlled target URL is ${target}.</scenario>` },
    { role: "user", content: "TALOS is ready for the browser request." },
  ];
  const expectedReplies = [
    `${target} aprilo e dimmi cosa vedi`,
    "Riprova usando il link di prima e dimmi cosa vedi.",
    "Riesci a catturare uno screenshot visibile nella chat?",
    "Adesso descrivi cosa e cambiato nella pagina.",
    "Continua da dove eri rimasto senza perdere il contesto.",
    "Perfetto, la prova richiesta e completa. ###STOP###",
  ];

  let finalRequest;
  let finalCompletion;
  for (const [turnIndex, expected] of expectedReplies.entries()) {
    const request = {
      model: "talos-hj-tau2-simulator",
      messages: structuredClone(messages),
      seed: 500 + turnIndex,
      max_tokens: 128,
    };
    const completion = await requestSimulatorCompletion(fixture.baseUrl, apiKey, request);
    assert.equal(completion.choices[0].message.content, expected);
    finalRequest = request;
    finalCompletion = completion;
    messages.push({ role: "assistant", content: expected });
    messages.push({ role: "user", content: `Visible TALOS response ${turnIndex + 1}.` });
  }

  const replay = await requestSimulatorCompletion(fixture.baseUrl, apiKey, finalRequest);
  assert.deepEqual(replay, finalCompletion);

  const independent = await requestSimulatorCompletion(fixture.baseUrl, apiKey, {
    model: "talos-hj-tau2-simulator",
    messages: [
      { role: "system", content: `<scenario>The controlled target URL is ${target}.</scenario>` },
      { role: "user", content: "A separate TALOS trial starts here." },
    ],
    seed: 999,
    max_tokens: 128,
  });
  assert.equal(independent.choices[0].message.content, expectedReplies[0]);
});

async function requestSimulatorCompletion(baseUrl, apiKey, body) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 200);
  return response.json();
}

async function waitForFile(path, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Fixture host exited before readiness (${child.exitCode ?? child.signalCode}).`);
    }
    try {
      await access(path);
      return;
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
    }
  }
  throw new Error("Fixture host readiness file timed out.");
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  let timer;
  try {
    await Promise.race([
      new Promise((resolveExit) => child.once("exit", resolveExit)),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Fixture host shutdown timed out.")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
