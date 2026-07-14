import { createHash, timingSafeEqual } from "node:crypto";

const MIN_PRODUCTION_TOKEN_BYTES = 32;
const MIN_PRODUCTION_TOKEN_ENTROPY_BITS = 128;

export function assertWorkerTokenConfiguration(token: string | undefined, runtimeEnvironment: string | undefined): asserts token is string {
  if (!token) throw new Error("TALOS_BROWSER_WORKER_TOKEN is required.");
  if (runtimeEnvironment !== "production") return;

  if (!isStrongProductionWorkerToken(token)) {
    throw new Error("The production worker token must contain at least 32 UTF-8 bytes and 128 bits of estimated entropy.");
  }
}

export function isStrongProductionWorkerToken(token: string): boolean {
  const tokenBytes = Buffer.byteLength(token, "utf8");
  const estimatedEntropyBits = estimateShannonEntropyBits(token);
  return tokenBytes >= MIN_PRODUCTION_TOKEN_BYTES && estimatedEntropyBits >= MIN_PRODUCTION_TOKEN_ENTROPY_BITS;
}

export function workerTokensEqual(candidate: string, expected: string): boolean {
  const candidateDigest = createHash("sha256").update(candidate, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

function estimateShannonEntropyBits(value: string): number {
  const symbols = [...value];
  const frequencies = new Map<string, number>();
  for (const symbol of symbols) frequencies.set(symbol, (frequencies.get(symbol) ?? 0) + 1);

  let bitsPerSymbol = 0;
  for (const count of frequencies.values()) {
    const probability = count / symbols.length;
    bitsPerSymbol -= probability * Math.log2(probability);
  }
  return bitsPerSymbol * symbols.length;
}
