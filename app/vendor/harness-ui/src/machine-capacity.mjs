import os from 'node:os';
import { statfs } from 'node:fs/promises';

export const MACHINE_CAPACITY_SCHEMA = 'talos.model-lab.capacity/1';
export const MODEL_RESERVE_BYTES = 1024 * 1024 * 1024;

export class MachineCapacityError extends Error {
  constructor(message, code = 'MACHINE_CAPACITY_UNAVAILABLE') {
    super(message);
    this.name = 'MachineCapacityError';
    this.code = code;
  }
}

function numero(value) {
  return typeof value === 'bigint' ? Number(value) : value;
}

function interoPositivo(value) {
  const result = numero(value);
  return Number.isFinite(result) && result >= 0 ? Math.floor(result) : null;
}

/**
 * Measures only the host resources that are safe to expose to the desktop UI.
 * No process, GPU probe, path listing or model execution is performed.
 */
export async function misuraCapacitaMacchina({
  totalmemFn = os.totalmem,
  freememFn = os.freemem,
  statfsFn = statfs,
  platformFn = os.platform,
  archFn = os.arch,
  storagePath = process.cwd(),
  reserveBytes = MODEL_RESERVE_BYTES,
} = {}) {
  let totalMemoryBytes;
  let freeMemoryBytes;
  let filesystem;
  try {
    totalMemoryBytes = interoPositivo(totalmemFn());
    freeMemoryBytes = interoPositivo(freememFn());
    filesystem = await statfsFn(storagePath, { bigint: true });
  } catch (error) {
    throw new MachineCapacityError(`Misura capacità macchina non disponibile: ${error?.message || 'errore sconosciuto'}`);
  }
  const blockSize = interoPositivo(filesystem?.bsize);
  const availableBlocks = interoPositivo(filesystem?.bavail);
  const totalBlocks = interoPositivo(filesystem?.blocks);
  const availableStorageBytes = blockSize !== null && availableBlocks !== null ? blockSize * availableBlocks : null;
  const totalStorageBytes = blockSize !== null && totalBlocks !== null ? blockSize * totalBlocks : null;
  const reserve = interoPositivo(reserveBytes) ?? MODEL_RESERVE_BYTES;
  const allocatableStorageBytes = availableStorageBytes === null ? null : Math.max(0, availableStorageBytes - reserve);
  if (totalMemoryBytes === null || freeMemoryBytes === null || availableStorageBytes === null || totalStorageBytes === null) {
    throw new MachineCapacityError('Il sistema ha restituito una misura incompleta', 'MACHINE_CAPACITY_INVALID');
  }
  return {
    schema: MACHINE_CAPACITY_SCHEMA,
    platform: String(platformFn()),
    arch: String(archFn()),
    measuredAt: new Date().toISOString(),
    memory: { totalBytes: totalMemoryBytes, freeBytes: freeMemoryBytes },
    storage: { totalBytes: totalStorageBytes, availableBytes: availableStorageBytes, reserveBytes: reserve, allocatableBytes: allocatableStorageBytes },
    runtime: { status: 'unconfigured', reason: 'Runtime locale desktop non scelto' },
  };
}
