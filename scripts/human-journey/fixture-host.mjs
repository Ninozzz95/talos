import { access } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startBrowserSiteServer } from "../../control-plane/tests/human-journey/fixtures/browserSiteServer.mjs";
import { startDeterministicProviderServer } from "../../control-plane/tests/human-journey/fixtures/deterministicProviderServer.mjs";
import { startTau2SimulatorProviderServer } from "../../control-plane/tests/human-journey/fixtures/tau2SimulatorProviderServer.mjs";
import { writeAtomicJson } from "./runtime.mjs";

const FIXTURE_HOST_PROTOCOL = "talos.human_journey.fixture_host.v1";
const FIXTURE_SECRET_PROTOCOL = "talos.human_journey.fixture_secret.v1";

const ADAPTIVE_FIXTURE_HOST_PROTOCOL = "talos.human_journey.fixture_host.adaptive.v1";
const ADAPTIVE_FIXTURE_SECRET_PROTOCOL = "talos.human_journey.fixture_secret.adaptive.v1";

export async function startFixtureHost({ readyFile, secretFile, lane = "deterministic" }) {
  assertOutputPath(readyFile, "ready");
  assertOutputPath(secretFile, "secret");
  if (lane !== "deterministic" && lane !== "adaptive") throw new TypeError("Fixture lane is invalid.");
  if (readyFile === secretFile) throw new TypeError("Fixture descriptor paths must be distinct.");
  await assertAbsent(readyFile);
  await assertAbsent(secretFile);

  let provider;
  let site;
  let simulator;
  try {
    provider = await startDeterministicProviderServer();
    site = await startBrowserSiteServer();
    if (lane === "adaptive") simulator = await startTau2SimulatorProviderServer();
    await writeAtomicJson(secretFile, lane === "adaptive" ? {
      protocol: ADAPTIVE_FIXTURE_SECRET_PROTOCOL,
      provider_control_token: provider.controlToken,
      simulator_api_key: simulator.apiKey,
    } : {
      protocol: FIXTURE_SECRET_PROTOCOL,
      provider_control_token: provider.controlToken,
    });
    await writeAtomicJson(readyFile, lane === "adaptive" ? {
      protocol: ADAPTIVE_FIXTURE_HOST_PROTOCOL,
      pid: process.pid,
      browser_site_origin: site.baseUrl,
      provider_base_url: provider.baseUrl,
      provider_health_url: provider.healthUrl,
      simulator_base_url: simulator.baseUrl,
      simulator_health_url: simulator.healthUrl,
      started_at: new Date().toISOString(),
    } : {
      protocol: FIXTURE_HOST_PROTOCOL,
      pid: process.pid,
      browser_site_origin: site.baseUrl,
      provider_base_url: provider.baseUrl,
      provider_health_url: provider.healthUrl,
      started_at: new Date().toISOString(),
    });
  } catch (error) {
    await Promise.allSettled([simulator?.close(), site?.close(), provider?.close()]);
    throw error;
  }

  let closing;
  return Object.freeze({
    async close() {
      closing ??= Promise.allSettled([simulator?.close(), site.close(), provider.close()]).then((outcomes) => {
        const rejected = outcomes.find((outcome) => outcome.status === "rejected");
        if (rejected?.status === "rejected") throw rejected.reason;
      });
      return await closing;
    },
  });
}

function parseArguments(argv) {
  const values = new Map();
  for (const argument of argv) {
    const match = /^--(ready-file|secret-file|lane)=(.+)$/u.exec(argument);
    if (match === null || values.has(match[1])) throw new CliUsageError();
    values.set(match[1], match[2]);
  }
  if (!values.has("ready-file") || !values.has("secret-file") || values.size > 3) throw new CliUsageError();
  const lane = values.get("lane") ?? "deterministic";
  if (lane !== "deterministic" && lane !== "adaptive") throw new CliUsageError();
  return {
    readyFile: values.get("ready-file"),
    secretFile: values.get("secret-file"),
    lane,
  };
}

function assertOutputPath(path, label) {
  if (typeof path !== "string" || !isAbsolute(path)) {
    throw new TypeError(`Fixture ${label} path must be absolute.`);
  }
}

async function assertAbsent(path) {
  try {
    await access(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Fixture output already exists: ${path}`);
}

class CliUsageError extends Error {}

async function main(argv) {
  const options = parseArguments(argv);
  const host = await startFixtureHost(options);
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await host.close();
      process.exitCode = 0;
    } catch {
      process.exitCode = 1;
    }
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    const usage = error instanceof CliUsageError;
    process.stderr.write(usage
      ? "Usage: node fixture-host.mjs --ready-file=<absolute-path> --secret-file=<absolute-path> [--lane=deterministic|adaptive]\n"
      : "TALOS Human Journey fixture host failed to start.\n");
    process.exitCode = usage ? 2 : 1;
  });
}
