import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, chmod, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  allocateLoopbackPort,
  generateRunId,
  generateRunToken,
  redactCanaries,
  writeAtomicCanaries,
  writeAtomicJson,
} from "../human-journey/runtime.mjs";

const runtimePath = fileURLToPath(new URL("../human-journey/runtime.mjs", import.meta.url));

test("HJPORT-001 allocates an OS-selected loopback port and releases the probe", async () => {
  const port = await allocateLoopbackPort("127.0.0.1");

  assert.equal(Number.isInteger(port), true);
  assert.equal(port > 0 && port <= 65_535, true);

  const rebound = createServer();
  await new Promise((resolve, reject) => {
    rebound.once("error", reject);
    rebound.listen(port, "127.0.0.1", resolve);
  });
  await new Promise((resolve, reject) => rebound.close((error) => error ? reject(error) : resolve()));
});

test("HJPORT-001 refuses allocation on any non-loopback host", async () => {
  await assert.rejects(allocateLoopbackPort("0.0.0.0"), /127\.0\.0\.1/u);
  await assert.rejects(allocateLoopbackPort("localhost"), /127\.0\.0\.1/u);
});

test("HJSECRET-001 generates unique bounded base64url tokens", () => {
  const first = generateRunToken(32);
  const second = generateRunToken(32);

  assert.match(first, /^[A-Za-z0-9_-]{43}$/u);
  assert.match(second, /^[A-Za-z0-9_-]{43}$/u);
  assert.notEqual(first, second);
  assert.throws(() => generateRunToken(31), /32.*128/u);
  assert.throws(() => generateRunToken(129), /32.*128/u);
  assert.throws(() => generateRunToken(32.5), /integer/u);
});

test("HJRERUN-001 generates unique protocol-shaped UTC run identities", () => {
  const now = new Date("2026-07-18T22:00:00.000Z");
  const first = generateRunId(now);
  const second = generateRunId(now);

  assert.match(first, /^hj_20260718T220000Z_[0-9a-f]{8}$/u);
  assert.match(second, /^hj_20260718T220000Z_[0-9a-f]{8}$/u);
  assert.notEqual(first, second);
  assert.throws(() => generateRunId(new Date("invalid")), /valid Date/u);
});

test("HJRESULT-001 writes one atomic top-level JSON object and preserves the prior file on failure", async (t) => {
  const root = await ownedTemporaryDirectory(t);
  const target = join(root, "result.json");
  await writeAtomicJson(target, { protocol: "talos.human_journey.result.v1", status: "passed" });

  assert.deepEqual(JSON.parse(await readFile(target, "utf8")), {
    protocol: "talos.human_journey.result.v1",
    status: "passed",
  });
  assert.deepEqual(await readdir(root), ["result.json"]);
  if (process.platform !== "win32") {
    assert.equal((await stat(target)).mode & 0o777, 0o600);
  }

  await assert.rejects(writeAtomicJson(target, ["not", "an", "object"]), /top-level JSON object/u);
  assert.equal(JSON.parse(await readFile(target, "utf8")).status, "passed");
  await assert.rejects(writeAtomicJson("relative-result.json", { status: "failed" }), /absolute/u);
});

test("HJRESULT-001 removes its temporary file when serialization fails", async (t) => {
  const root = await ownedTemporaryDirectory(t);
  const target = join(root, "result.json");
  const cyclic = {};
  cyclic.self = cyclic;

  await assert.rejects(writeAtomicJson(target, cyclic), /serializable/u);
  assert.deepEqual(await readdir(root), []);
});

test("HJSECRET-001 redacts every literal canary without regex interpretation", () => {
  const output = redactCanaries(
    "token=a+b token=a+b-long repeated=a+b",
    ["a+b", "a+b-long"],
  );

  assert.equal(output, "token=[REDACTED] token=[REDACTED] repeated=[REDACTED]");
  assert.throws(() => redactCanaries("text", [""]), /non-empty/u);
  assert.throws(() => redactCanaries("text", ["duplicate", "duplicate"]), /unique/u);
});

test("HJSECRET-003 atomically extends a strict unique canary list and preserves it on rejection", async (t) => {
  const root = await ownedTemporaryDirectory(t);
  const target = join(root, "canaries.json");
  await writeAtomicCanaries(target, ["alpha-secret", "beta-secret"]);

  assert.deepEqual(JSON.parse(await readFile(target, "utf8")), ["alpha-secret", "beta-secret"]);
  await assert.rejects(writeAtomicCanaries(target, ["duplicate", "duplicate"]), /unique/u);
  assert.deepEqual(JSON.parse(await readFile(target, "utf8")), ["alpha-secret", "beta-secret"]);
});

test("HJCLI-002 rejects unknown or malformed runtime subcommands with exit 2", () => {
  for (const args of [[], ["unknown"], ["allocate-port", "extra"], ["generate-token"], ["generate-token", "31"], ["write-canaries"]]) {
    const result = spawnSync(process.execPath, [runtimePath, ...args], { encoding: "utf8" });
    assert.equal(result.status, 2, `${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
    assert.equal(result.stdout, "");
  }
});

test("HJPORT-001 runtime CLI emits one strict loopback allocation envelope", () => {
  const result = spawnSync(process.execPath, [runtimePath, "allocate-port"], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(parsed).sort(), ["host", "port", "protocol"]);
  assert.equal(parsed.protocol, "talos.human_journey.port.v1");
  assert.equal(parsed.host, "127.0.0.1");
  assert.equal(Number.isInteger(parsed.port), true);
});

test("HJSECRET-001 runtime CLI emits only one generated token", () => {
  const result = spawnSync(process.execPath, [runtimePath, "generate-token", "32"], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^[A-Za-z0-9_-]{43}\n$/u);
  assert.equal(result.stderr, "");
});

test("HJRERUN-001 runtime CLI emits only one protocol-shaped run identity", () => {
  const result = spawnSync(process.execPath, [runtimePath, "generate-run-id"], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^hj_[0-9]{8}T[0-9]{6}Z_[0-9a-f]{8}\n$/u);
  assert.equal(result.stderr, "");
});

test("HJRESULT-001 runtime CLI reads JSON from stdin and writes only an absolute target", async (t) => {
  const root = await ownedTemporaryDirectory(t);
  const target = join(root, "result.json");
  assert.equal(isAbsolute(target), true);
  const result = spawnSync(process.execPath, [runtimePath, "write-json", target], {
    encoding: "utf8",
    input: JSON.stringify({ protocol: "talos.human_journey.result.v1", status: "failed" }),
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.equal(JSON.parse(await readFile(target, "utf8")).status, "failed");
});

test("HJSECRET-001 runtime CLI redacts a copy without modifying its source", async (t) => {
  const root = await ownedTemporaryDirectory(t);
  const input = join(root, "service.log");
  const canaries = join(root, "canaries.json");
  const output = join(root, "service.redacted.log");
  const secret = "synthetic-secret-canary";
  await writeFile(input, `before ${secret} after`, { encoding: "utf8", mode: 0o600 });
  await writeFile(canaries, JSON.stringify([secret]), { encoding: "utf8", mode: 0o600 });

  const result = spawnSync(process.execPath, [runtimePath, "redact", input, canaries, output], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(input, "utf8"), `before ${secret} after`);
  assert.equal(await readFile(output, "utf8"), "before [REDACTED] after");
});

async function ownedTemporaryDirectory(t) {
  const root = await mkdtemp(join(tmpdir(), "talos-hj-runtime-"));
  assert.equal(dirname(root), tmpdir());
  await chmod(root, 0o700).catch(() => undefined);
  t.after(async () => {
    await access(root).then(() => rm(root, { recursive: true, force: true }), () => undefined);
  });
  return root;
}
