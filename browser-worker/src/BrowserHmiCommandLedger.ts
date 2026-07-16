import { BrowserError } from "./BrowserErrors.js";
import type { BrowserHmiResultResponse } from "./BrowserHmiContracts.js";
import { canonicalSha256 } from "./BrowserCanonicalJson.js";

export const MAX_HMI_COMMAND_RECORDS = 128;
export const MAX_HMI_COMMAND_RETAINED_BYTES = 32 * 1024 * 1024;
const MAX_HMI_COMMAND_RESULT_BYTES = 7 * 1024 * 1024;

type CommandStatus = "pending" | "dispatched" | "committed" | "rejected" | "ambiguous";

interface StoredError {
  message: string;
  code: string;
  statusCode: number;
  details: Record<string, unknown>;
}

interface CommandRecord {
  commandId: string;
  requestSha256: string;
  status: CommandStatus;
  result?: BrowserHmiResultResponse;
  resultBytes?: number;
  outcomeSha256?: string;
  error?: StoredError;
}

export interface BrowserHmiCommandRecordView {
  command_id: string;
  request_sha256: string;
  status: CommandStatus;
  outcome_sha256?: string;
  error_code?: string;
}

export type BrowserHmiCommandClaim =
  | { kind: "new" }
  | { kind: "result"; result: BrowserHmiResultResponse }
  | { kind: "error"; error: BrowserError };

export class BrowserHmiCommandLedger {
  private readonly records = new Map<string, CommandRecord>();
  private retainedResultBytes = 0;

  constructor(
    private readonly maxRecords = MAX_HMI_COMMAND_RECORDS,
    private readonly maxRetainedBytes = MAX_HMI_COMMAND_RETAINED_BYTES,
  ) {}

  claim(commandId: string, requestSha256: string): BrowserHmiCommandClaim {
    const existing = this.records.get(commandId);
    if (existing) {
      if (existing.requestSha256 !== requestSha256) {
        throw new BrowserError("The HMI command id is already bound to a different request.", "TALOS_BROWSER_HMI_COMMAND_CONFLICT", 409, {
          command_id: commandId,
        });
      }
      if (existing.status === "rejected") {
        existing.status = "pending";
        existing.error = undefined;
        return { kind: "new" };
      }
      if (existing.status === "committed" && existing.result) return { kind: "result", result: existing.result };
      if (existing.status === "ambiguous" && existing.error) {
        return { kind: "error", error: restoreError(existing.error) };
      }

      const error = new BrowserError("The HMI command outcome is ambiguous and cannot be dispatched again.", "TALOS_BROWSER_HMI_RECOVERY_REQUIRED", 409, {
        command_id: commandId,
        idempotency_status: "ambiguous",
        reason_code: "command_outcome_unknown",
      });
      existing.status = "ambiguous";
      existing.error = storeError(error);
      return { kind: "error", error };
    }

    if (this.records.size >= this.maxRecords
      || this.retainedResultBytes > this.maxRetainedBytes - MAX_HMI_COMMAND_RESULT_BYTES) {
      throw new BrowserError("The HMI command retention limit is exhausted for this session.", "TALOS_BROWSER_HMI_COMMAND_RETENTION_EXHAUSTED", 429, {
        max_records: this.maxRecords,
        max_retained_bytes: this.maxRetainedBytes,
      });
    }
    this.records.set(commandId, { commandId, requestSha256, status: "pending" });
    return { kind: "new" };
  }

  markDispatched(commandId: string): void {
    const record = this.required(commandId);
    if (record.status !== "pending") throw invalidTransition(commandId, record.status);
    record.status = "dispatched";
  }

  commit(commandId: string, result: BrowserHmiResultResponse): void {
    const record = this.required(commandId);
    if (record.status !== "dispatched") throw invalidTransition(commandId, record.status);
    const resultBytes = Buffer.byteLength(JSON.stringify(result), "utf8");
    if (resultBytes > MAX_HMI_COMMAND_RESULT_BYTES
      || this.retainedResultBytes + resultBytes > this.maxRetainedBytes) {
      throw new BrowserError("The HMI command result exceeds bounded session retention.", "TALOS_BROWSER_HMI_COMMAND_RETENTION_EXHAUSTED", 429, {
        command_id: commandId,
        max_result_bytes: MAX_HMI_COMMAND_RESULT_BYTES,
        max_retained_bytes: this.maxRetainedBytes,
      });
    }
    record.status = "committed";
    record.result = result;
    record.resultBytes = resultBytes;
    record.outcomeSha256 = canonicalSha256(result);
    this.retainedResultBytes += resultBytes;
  }

  markAmbiguous(commandId: string, error: BrowserError): BrowserError {
    const record = this.required(commandId);
    if (record.status !== "dispatched" && record.status !== "ambiguous") throw invalidTransition(commandId, record.status);
    record.status = "ambiguous";
    record.error = storeError(error);
    return restoreError(record.error);
  }

  rejectIfPending(commandId: string, error: unknown): BrowserError | undefined {
    const record = this.records.get(commandId);
    if (!record || record.status !== "pending") return undefined;
    const controlled = error instanceof BrowserError
      ? error
      : new BrowserError("Browser worker request failed.", "TALOS_BROWSER_WORKER_ERROR", 500);
    record.status = "rejected";
    record.error = storeError(controlled);
    return restoreError(record.error);
  }

  record(commandId: string): BrowserHmiCommandRecordView | undefined {
    const record = this.records.get(commandId);
    if (!record) return undefined;
    return {
      command_id: record.commandId,
      request_sha256: record.requestSha256,
      status: record.status,
      ...(record.outcomeSha256 === undefined ? {} : { outcome_sha256: record.outcomeSha256 }),
      ...(record.error === undefined ? {} : { error_code: record.error.code }),
    };
  }

  clear(): void {
    this.records.clear();
    this.retainedResultBytes = 0;
  }

  get size(): number {
    return this.records.size;
  }

  private required(commandId: string): CommandRecord {
    const record = this.records.get(commandId);
    if (!record) throw new BrowserError("The HMI command record is missing.", "TALOS_BROWSER_HMI_COMMAND_RECORD_MISSING", 500, { command_id: commandId });
    return record;
  }
}

function storeError(error: BrowserError): StoredError {
  return {
    message: error.message,
    code: error.code,
    statusCode: error.statusCode,
    details: structuredClone(error.details),
  };
}

function restoreError(error: StoredError): BrowserError {
  return new BrowserError(error.message, error.code, error.statusCode, structuredClone(error.details));
}

function invalidTransition(commandId: string, status: CommandStatus): BrowserError {
  return new BrowserError("The HMI command record has an invalid state transition.", "TALOS_BROWSER_HMI_COMMAND_STATE_INVALID", 500, {
    command_id: commandId,
    status,
  });
}
