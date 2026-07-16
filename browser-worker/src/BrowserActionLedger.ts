import { canonicalSha256 } from "./BrowserCanonicalJson.js";
import { BrowserError } from "./BrowserErrors.js";

export const MAX_BROWSER_ACTION_RECORDS = 128;
export const MAX_BROWSER_ACTION_RETAINED_BYTES = 32 * 1024 * 1024;
const MAX_BROWSER_ACTION_RESULT_BYTES = 8 * 1024 * 1024;

type BrowserActionStatus = "pending" | "dispatched" | "committed" | "rejected" | "ambiguous";

export interface BrowserActionLedgerInput {
  actionId: string;
  idempotencyKey: string;
  operation: string;
  preconditionStateVersion: number;
  request: unknown;
  consequential: boolean;
}

interface StoredError {
  message: string;
  code: string;
  statusCode: number;
  details: Record<string, unknown>;
}

interface BrowserActionRecord {
  input: BrowserActionLedgerInput;
  requestSha256: string;
  status: BrowserActionStatus;
  result?: unknown;
  resultBytes?: number;
  outcomeSha256?: string;
  error?: StoredError;
}

export interface BrowserActionLedgerRecordView {
  action_id: string;
  idempotency_key: string;
  operation: string;
  precondition_state_version: number;
  request_sha256: string;
  status: BrowserActionStatus;
  consequential: boolean;
  outcome_sha256?: string;
  error_code?: string;
}

export type BrowserActionLedgerClaim<T = unknown> =
  | { kind: "new" }
  | { kind: "result"; result: T; outcomeSha256: string }
  | { kind: "error"; error: BrowserError };

export class BrowserActionLedger {
  private readonly records = new Map<string, BrowserActionRecord>();
  private retainedResultBytes = 0;

  constructor(
    private readonly maxRecords = MAX_BROWSER_ACTION_RECORDS,
    private readonly maxRetainedBytes = MAX_BROWSER_ACTION_RETAINED_BYTES,
  ) {}

  claim<T = unknown>(input: BrowserActionLedgerInput): BrowserActionLedgerClaim<T> {
    const requestSha256 = canonicalSha256(input.request);
    const existing = this.records.get(input.idempotencyKey);
    if (existing) {
      if (!sameBinding(existing, input, requestSha256)) throw conflict(input.idempotencyKey);
      if (existing.status === "rejected") {
        existing.status = "pending";
        existing.error = undefined;
        return { kind: "new" };
      }
      if (existing.status === "committed" && existing.outcomeSha256 !== undefined) {
        return {
          kind: "result",
          result: structuredClone(existing.result) as T,
          outcomeSha256: existing.outcomeSha256,
        };
      }
      if (existing.status === "ambiguous" && existing.error) {
        return { kind: "error", error: restoreError(existing.error) };
      }
      const error = recoveryRequired(input.idempotencyKey);
      existing.status = "ambiguous";
      existing.error = storeError(error);
      return { kind: "error", error };
    }

    if (this.records.size >= this.maxRecords
      || this.retainedResultBytes > this.maxRetainedBytes - MAX_BROWSER_ACTION_RESULT_BYTES) {
      throw new BrowserError(
        "Browser action retention is exhausted for this session.",
        "TALOS_BROWSER_ACTION_RETENTION_EXHAUSTED",
        429,
        { max_records: this.maxRecords, max_retained_bytes: this.maxRetainedBytes },
      );
    }
    this.records.set(input.idempotencyKey, {
      input: structuredClone(input),
      requestSha256,
      status: "pending",
    });
    return { kind: "new" };
  }

  markDispatched(idempotencyKey: string): void {
    const record = this.required(idempotencyKey);
    if (record.status !== "pending") throw invalidTransition(idempotencyKey, record.status);
    record.status = "dispatched";
  }

  commit<T>(idempotencyKey: string, result: T): BrowserActionLedgerRecordView {
    const record = this.required(idempotencyKey);
    if (record.status !== "dispatched") throw invalidTransition(idempotencyKey, record.status);
    const outcomeSha256 = canonicalSha256(result);
    const resultBytes = Buffer.byteLength(JSON.stringify(result), "utf8");
    if (resultBytes > MAX_BROWSER_ACTION_RESULT_BYTES
      || this.retainedResultBytes + resultBytes > this.maxRetainedBytes) {
      throw new BrowserError(
        "The browser action result exceeds bounded session retention.",
        "TALOS_BROWSER_ACTION_RETENTION_EXHAUSTED",
        429,
        { idempotency_key: idempotencyKey, max_retained_bytes: this.maxRetainedBytes },
      );
    }
    record.status = "committed";
    record.result = structuredClone(result);
    record.resultBytes = resultBytes;
    record.outcomeSha256 = outcomeSha256;
    this.retainedResultBytes += resultBytes;
    return this.view(record);
  }

  markAmbiguous(idempotencyKey: string, error: BrowserError): BrowserError {
    const record = this.required(idempotencyKey);
    if (record.status !== "dispatched" && record.status !== "ambiguous") {
      throw invalidTransition(idempotencyKey, record.status);
    }
    const controlled = error;
    record.status = "ambiguous";
    record.error = storeError(controlled);
    return restoreError(record.error);
  }

  rejectIfPending(idempotencyKey: string, error: unknown): BrowserError | undefined {
    const record = this.records.get(idempotencyKey);
    if (!record || record.status !== "pending") return undefined;
    const controlled = error instanceof BrowserError
      ? error
      : new BrowserError("Browser worker request failed.", "TALOS_BROWSER_WORKER_ERROR", 500);
    record.status = "rejected";
    record.error = storeError(controlled);
    return restoreError(record.error);
  }

  record(idempotencyKey: string): BrowserActionLedgerRecordView | undefined {
    const record = this.records.get(idempotencyKey);
    return record ? this.view(record) : undefined;
  }

  clear(): void {
    this.records.clear();
    this.retainedResultBytes = 0;
  }

  get size(): number {
    return this.records.size;
  }

  private required(idempotencyKey: string): BrowserActionRecord {
    const record = this.records.get(idempotencyKey);
    if (!record) {
      throw new BrowserError(
        "The browser action record is missing.",
        "TALOS_BROWSER_ACTION_RECORD_MISSING",
        500,
        { idempotency_key: idempotencyKey },
      );
    }
    return record;
  }

  private view(record: BrowserActionRecord): BrowserActionLedgerRecordView {
    return {
      action_id: record.input.actionId,
      idempotency_key: record.input.idempotencyKey,
      operation: record.input.operation,
      precondition_state_version: record.input.preconditionStateVersion,
      request_sha256: record.requestSha256,
      status: record.status,
      consequential: record.input.consequential,
      ...(record.outcomeSha256 === undefined ? {} : { outcome_sha256: record.outcomeSha256 }),
      ...(record.error === undefined ? {} : { error_code: record.error.code }),
    };
  }
}

function sameBinding(record: BrowserActionRecord, input: BrowserActionLedgerInput, requestSha256: string): boolean {
  return record.input.actionId === input.actionId
    && record.input.operation === input.operation
    && record.input.preconditionStateVersion === input.preconditionStateVersion
    && record.input.consequential === input.consequential
    && record.requestSha256 === requestSha256;
}

function conflict(idempotencyKey: string): BrowserError {
  return new BrowserError(
    "The browser action identity is already bound to a different request.",
    "TALOS_BROWSER_ACTION_CONFLICT",
    409,
    { idempotency_key: idempotencyKey },
  );
}

function recoveryRequired(idempotencyKey: string, reasonCode = "action_outcome_unknown"): BrowserError {
  return new BrowserError(
    "The browser action outcome is ambiguous and cannot be dispatched again.",
    "TALOS_BROWSER_ACTION_RECOVERY_REQUIRED",
    409,
    { idempotency_key: idempotencyKey, idempotency_status: "ambiguous", reason_code: reasonCode },
  );
}

function invalidTransition(idempotencyKey: string, status: BrowserActionStatus): BrowserError {
  return new BrowserError(
    "The browser action record has an invalid state transition.",
    "TALOS_BROWSER_ACTION_STATE_INVALID",
    500,
    { idempotency_key: idempotencyKey, status },
  );
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
