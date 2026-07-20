import { randomBytes, randomUUID } from "node:crypto";
import { open, readFile, rename, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LOOPBACK_HOST = "127.0.0.1";
const MIN_TOKEN_BYTES = 32;
const MAX_TOKEN_BYTES = 128;
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_BYTES = 16 * 1024 * 1024;
const MAX_CANARY_BYTES = 4 * 1024;
const MAX_CANARY_TOTAL_BYTES = 64 * 1024;

export async function allocateLoopbackPort(host = LOOPBACK_HOST) {
  if (host !== LOOPBACK_HOST) {
    throw new TypeError("Human Journey ports may bind only to 127.0.0.1.");
  }

  const server = createServer();
  server.unref();
  await new Promise((resolveListening, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolveListening();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(0, host);
  });

  const address = server.address();
  if (address === null || typeof address === "string" || address.address !== host) {
    await closeServer(server);
    throw new Error("The OS did not return a numeric loopback port.");
  }
  const port = address.port;
  await closeServer(server);
  return port;
}

export function generateRunToken(byteLength = 32) {
  if (!Number.isInteger(byteLength)) {
    throw new TypeError("Human Journey token byte length must be an integer.");
  }
  if (byteLength < MIN_TOKEN_BYTES || byteLength > MAX_TOKEN_BYTES) {
    throw new RangeError(`Human Journey token byte length must be between ${MIN_TOKEN_BYTES} and ${MAX_TOKEN_BYTES}.`);
  }
  return randomBytes(byteLength).toString("base64url");
}

export function generateRunId(now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError("Human Journey run identity requires a valid Date.");
  }
  const timestamp = now.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
  return `hj_${timestamp}_${randomBytes(4).toString("hex")}`;
}

export async function writeAtomicJson(outputPath, value) {
  assertAbsolutePath(outputPath, "JSON output");
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new TypeError("Human Journey JSON value must be serializable.");
  }
  if (typeof serialized !== "string") {
    throw new TypeError("Human Journey JSON value must be serializable.");
  }

  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new TypeError("Human Journey JSON value must be serializable.");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("Human Journey output must be a top-level JSON object.");
  }

  await writeAtomicText(outputPath, `${serialized}\n`, MAX_JSON_BYTES);
}

export function redactCanaries(text, canaries) {
  if (typeof text !== "string") {
    throw new TypeError("Human Journey redaction input must be text.");
  }
  if (!Array.isArray(canaries)) {
    throw new TypeError("Human Journey canaries must be a list.");
  }

  const unique = new Set();
  let totalBytes = 0;
  for (const canary of canaries) {
    if (typeof canary !== "string" || canary.length === 0) {
      throw new TypeError("Human Journey canaries must be non-empty strings.");
    }
    const bytes = Buffer.byteLength(canary, "utf8");
    if (bytes > MAX_CANARY_BYTES) {
      throw new RangeError("A Human Journey canary exceeds the byte limit.");
    }
    totalBytes += bytes;
    if (totalBytes > MAX_CANARY_TOTAL_BYTES) {
      throw new RangeError("Human Journey canaries exceed the aggregate byte limit.");
    }
    if (unique.has(canary)) {
      throw new TypeError("Human Journey canaries must be unique.");
    }
    unique.add(canary);
  }

  let redacted = text;
  for (const canary of [...unique].sort((left, right) => right.length - left.length)) {
    redacted = redacted.split(canary).join("[REDACTED]");
  }
  return redacted;
}

export async function writeAtomicCanaries(outputPath, canaries) {
  assertAbsolutePath(outputPath, "canary JSON output");
  if (!Array.isArray(canaries) || canaries.length === 0) {
    throw new TypeError("Human Journey canaries must be a non-empty list.");
  }
  redactCanaries("", canaries);
  await writeAtomicText(outputPath, `${JSON.stringify(canaries)}\n`, MAX_CANARY_TOTAL_BYTES + MAX_CANARY_BYTES);
}

async function main(argv) {
  const [command, ...args] = argv;
  switch (command) {
    case "allocate-port": {
      assertArity(command, args, 0);
      const port = await allocateLoopbackPort();
      process.stdout.write(`${JSON.stringify({
        protocol: "talos.human_journey.port.v1",
        host: LOOPBACK_HOST,
        port,
      })}\n`);
      return;
    }
    case "generate-token": {
      assertArity(command, args, 1);
      if (!/^[0-9]+$/u.test(args[0])) throw new CliUsageError("Token byte length must be an integer.");
      const byteLength = Number(args[0]);
      if (byteLength < MIN_TOKEN_BYTES || byteLength > MAX_TOKEN_BYTES) {
        throw new CliUsageError(`Token byte length must be between ${MIN_TOKEN_BYTES} and ${MAX_TOKEN_BYTES}.`);
      }
      process.stdout.write(`${generateRunToken(byteLength)}\n`);
      return;
    }
    case "generate-run-id": {
      assertArity(command, args, 0);
      process.stdout.write(`${generateRunId()}\n`);
      return;
    }
    case "write-json": {
      assertArity(command, args, 1);
      assertCliAbsolutePath(args[0], "JSON output");
      const input = await readStandardInput(MAX_JSON_BYTES);
      let value;
      try {
        value = JSON.parse(input);
      } catch {
        throw new CliUsageError("write-json requires one valid JSON object on stdin.");
      }
      await writeAtomicJson(args[0], value);
      return;
    }
    case "write-canaries": {
      assertArity(command, args, 1);
      assertCliAbsolutePath(args[0], "canary JSON output");
      const input = await readStandardInput(MAX_CANARY_TOTAL_BYTES + MAX_CANARY_BYTES);
      let canaries;
      try {
        canaries = JSON.parse(input);
        await writeAtomicCanaries(args[0], canaries);
      } catch (error) {
        if (error instanceof CliUsageError) throw error;
        throw new CliUsageError("write-canaries requires one strict non-empty JSON string list on stdin.");
      }
      return;
    }
    case "redact": {
      assertArity(command, args, 3);
      for (const [index, label] of ["input", "canary JSON", "output"].entries()) {
        assertCliAbsolutePath(args[index], label);
      }
      const [input, canaryJson] = await Promise.all([
        readBoundedFile(args[0], MAX_TEXT_BYTES),
        readBoundedFile(args[1], MAX_CANARY_TOTAL_BYTES + MAX_CANARY_BYTES),
      ]);
      let canaries;
      try {
        canaries = JSON.parse(canaryJson);
      } catch {
        throw new CliUsageError("redact requires a valid canary JSON list.");
      }
      await writeAtomicText(args[2], redactCanaries(input, canaries), MAX_TEXT_BYTES);
      return;
    }
    default:
      throw new CliUsageError("Unknown Human Journey runtime subcommand.");
  }
}

async function writeAtomicText(outputPath, text, maxBytes) {
  assertAbsolutePath(outputPath, "output");
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new RangeError("Human Journey output exceeds the byte limit.");
  }

  const temporaryPath = `${dirname(outputPath)}/.${basename(outputPath)}.tmp-${process.pid}-${randomUUID()}`;
  let handle;
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(text, { encoding: "utf8" });
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function readStandardInput(maxBytes) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > maxBytes) throw new CliUsageError("stdin exceeds the Human Journey byte limit.");
    chunks.push(buffer);
  }
  if (totalBytes === 0) throw new CliUsageError("stdin is required.");
  return Buffer.concat(chunks).toString("utf8");
}

async function readBoundedFile(path, maxBytes) {
  const contents = await readFile(path);
  if (contents.byteLength > maxBytes) throw new RangeError("Human Journey input file exceeds the byte limit.");
  return contents.toString("utf8");
}

function assertAbsolutePath(path, label) {
  if (typeof path !== "string" || !isAbsolute(path)) {
    throw new TypeError(`Human Journey ${label} path must be absolute.`);
  }
}

function assertCliAbsolutePath(path, label) {
  if (typeof path !== "string" || !isAbsolute(path)) {
    throw new CliUsageError(`Human Journey ${label} path must be absolute.`);
  }
}

function assertArity(command, args, expected) {
  if (args.length !== expected) {
    throw new CliUsageError(`${command} received an invalid number of arguments.`);
  }
}

async function closeServer(server) {
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
}

class CliUsageError extends Error {}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    const usageError = error instanceof CliUsageError;
    const message = error instanceof Error ? error.message : "Unknown runtime failure.";
    process.stderr.write(`TALOS Human Journey runtime: ${message}\n`);
    process.exitCode = usageError ? 2 : 1;
  });
}
