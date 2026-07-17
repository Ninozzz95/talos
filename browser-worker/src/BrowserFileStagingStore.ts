import { createHash } from "node:crypto";
import { z } from "zod";
import { BrowserError } from "./BrowserErrors.js";

export const MAX_STAGED_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_STAGED_FILES_PER_ACTION = 4;
export const MAX_STAGED_BYTES_PER_SESSION = 40 * 1024 * 1024;
export const MAX_FILE_STAGE_REQUEST_BYTES = 15 * 1024 * 1024;
export const DEFAULT_FILE_STAGE_TTL_MS = 120_000;

const CanonicalBase64Schema = z.string().min(1).max(14 * 1024 * 1024).refine((value) => {
  try {
    return Buffer.from(value, "base64").toString("base64") === value;
  } catch {
    return false;
  }
}, "Expected canonical base64 file bytes.");

const STAGE_ID_PATTERN = /^stg_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export const BrowserFileStageRequestSchema = z.object({
  file_id: z.uuid(),
  name: z.string().min(1).max(255).refine(
    (value) => value.trim().length > 0
      && value.trim() !== "."
      && value.trim() !== ".."
      && !/[\\/\u0000-\u001F\u007F]/u.test(value),
    "File name must be a safe basename.",
  ),
  mime_type: z.enum(["text/plain", "text/markdown", "application/json", "text/csv"]),
  size_bytes: z.number().int().positive().max(MAX_STAGED_FILE_BYTES),
  sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  base64: CanonicalBase64Schema,
}).strict();

export const BrowserFileStageResponseSchema = z.object({
  stage_id: z.string().regex(STAGE_ID_PATTERN),
  file_id: z.uuid(),
  name: z.string().min(1).max(255),
  mime_type: z.string().min(1).max(128),
  size_bytes: z.number().int().positive().max(MAX_STAGED_FILE_BYTES),
  sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  expires_at: z.iso.datetime(),
}).strict();

export type BrowserFileStageRequest = z.infer<typeof BrowserFileStageRequestSchema>;
export type BrowserFileStageResponse = z.infer<typeof BrowserFileStageResponseSchema>;
export type BrowserFileStageResult = BrowserFileStageResponse & { replayed: boolean };

export interface StagedBrowserFile {
  stageId: string;
  fileId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  bytes: Buffer;
  expiresAtMs: number;
}

export interface BrowserFileStagingStoreOptions {
  now?: () => number;
  ttlMs?: number;
}

export class BrowserFileStagingStore {
  private readonly entries = new Map<string, Map<string, StagedBrowserFile>>();
  private readonly now: () => number;
  private readonly ttlMs: number;

  constructor(options: BrowserFileStagingStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? DEFAULT_FILE_STAGE_TTL_MS;
    if (!Number.isInteger(this.ttlMs) || this.ttlMs < 1_000 || this.ttlMs > 10 * 60_000) {
      throw new Error("Browser file staging TTL must be between 1 second and 10 minutes.");
    }
  }

  stage(ownerRef: string, sessionId: string, stageId: string, raw: unknown): BrowserFileStageResult {
    this.assertStageId(stageId);
    const parsed = BrowserFileStageRequestSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BrowserError("Browser staged file metadata is invalid.", "TALOS_BROWSER_STAGED_FILE_INVALID", 422, {
        validation: parsed.error.flatten(),
      });
    }
    this.assertScope(ownerRef, sessionId);
    this.sweepExpired();
    const request = parsed.data;
    const bytes = Buffer.from(request.base64, "base64");
    let retained = false;
    try {
      if (bytes.byteLength !== request.size_bytes) {
        throw new BrowserError("Browser staged file size does not match its bytes.", "TALOS_BROWSER_STAGED_FILE_SIZE_MISMATCH", 422);
      }
      const actualDigest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
      if (actualDigest !== request.sha256) {
        throw new BrowserError("Browser staged file digest does not match its bytes.", "TALOS_BROWSER_STAGED_FILE_DIGEST_MISMATCH", 422);
      }

      const key = scopeKey(ownerRef, sessionId);
      const scoped = this.entries.get(key) ?? new Map<string, StagedBrowserFile>();
      const existing = scoped.get(stageId);
      if (existing) {
        if (existing.fileId !== request.file_id
          || existing.name !== request.name
          || existing.mimeType !== request.mime_type
          || existing.sizeBytes !== request.size_bytes
          || existing.sha256 !== request.sha256) {
          throw new BrowserError(
            "Browser staged file identity is already bound to a different payload.",
            "TALOS_BROWSER_STAGED_FILE_CONFLICT",
            409,
          );
        }

        return { ...this.response(existing), replayed: true };
      }
      const retainedBytes = [...scoped.values()].reduce((total, entry) => total + entry.sizeBytes, 0);
      if (scoped.size >= MAX_STAGED_FILES_PER_ACTION || retainedBytes + bytes.byteLength > MAX_STAGED_BYTES_PER_SESSION) {
        throw new BrowserError("Browser staged file capacity is exhausted for this session.", "TALOS_BROWSER_STAGED_FILE_CAPACITY", 413);
      }

      const expiresAtMs = this.now() + this.ttlMs;
      const staged = {
        stageId,
        fileId: request.file_id,
        name: request.name,
        mimeType: request.mime_type,
        sizeBytes: request.size_bytes,
        sha256: request.sha256,
        bytes,
        expiresAtMs,
      };
      scoped.set(stageId, staged);
      this.entries.set(key, scoped);
      retained = true;

      return { ...this.response(staged), replayed: false };
    } finally {
      if (!retained) bytes.fill(0);
    }
  }

  takeMany(ownerRef: string, sessionId: string, stageIds: string[]): StagedBrowserFile[] {
    this.assertScope(ownerRef, sessionId);
    if (!Array.isArray(stageIds)
      || stageIds.length < 1
      || stageIds.length > MAX_STAGED_FILES_PER_ACTION
      || new Set(stageIds).size !== stageIds.length
      || stageIds.some((id) => !STAGE_ID_PATTERN.test(id))) {
      throw new BrowserError("Browser upload requires between 1 and 4 unique staged file IDs.", "TALOS_BROWSER_STAGED_FILE_IDS_INVALID", 422);
    }
    this.sweepExpired();
    const key = scopeKey(ownerRef, sessionId);
    const scoped = this.entries.get(key);
    const files = stageIds.map((stageId) => scoped?.get(stageId));
    if (files.some((file) => file === undefined)) {
      throw new BrowserError("One or more staged files are expired or not available in this session.", "TALOS_BROWSER_STAGED_FILE_NOT_FOUND", 410);
    }

    for (const stageId of stageIds) scoped?.delete(stageId);
    if (scoped?.size === 0) this.entries.delete(key);

    return files as StagedBrowserFile[];
  }

  release(files: readonly StagedBrowserFile[]): void {
    for (const file of files) file.bytes.fill(0);
  }

  discard(ownerRef: string, sessionId: string, stageId: string): void {
    this.assertScope(ownerRef, sessionId);
    this.assertStageId(stageId);
    this.sweepExpired();
    const key = scopeKey(ownerRef, sessionId);
    const scoped = this.entries.get(key);
    const file = scoped?.get(stageId);
    if (file) this.release([file]);
    scoped?.delete(stageId);
    if (scoped?.size === 0) this.entries.delete(key);
  }

  discardSession(ownerRef: string, sessionId: string): void {
    this.assertScope(ownerRef, sessionId);
    const key = scopeKey(ownerRef, sessionId);
    const scoped = this.entries.get(key);
    if (scoped) this.release([...scoped.values()]);
    this.entries.delete(key);
  }

  sweepExpired(): void {
    const now = this.now();
    for (const [key, scoped] of this.entries) {
      for (const [stageId, file] of scoped) {
        if (file.expiresAtMs <= now) {
          this.release([file]);
          scoped.delete(stageId);
        }
      }
      if (scoped.size === 0) this.entries.delete(key);
    }
  }

  clear(): void {
    for (const scoped of this.entries.values()) this.release([...scoped.values()]);
    this.entries.clear();
  }

  private assertScope(ownerRef: string, sessionId: string): void {
    if (ownerRef.trim() === "" || ownerRef.length > 256 || sessionId.trim() === "" || sessionId.length > 256) {
      throw new BrowserError("Browser file staging scope is invalid.", "TALOS_BROWSER_STAGED_FILE_SCOPE_INVALID", 422);
    }
  }

  private assertStageId(stageId: string): void {
    if (!STAGE_ID_PATTERN.test(stageId)) {
      throw new BrowserError("Browser staged file identity is invalid.", "TALOS_BROWSER_STAGED_FILE_IDS_INVALID", 422);
    }
  }

  private response(file: StagedBrowserFile): BrowserFileStageResponse {
    return BrowserFileStageResponseSchema.parse({
      stage_id: file.stageId,
      file_id: file.fileId,
      name: file.name,
      mime_type: file.mimeType,
      size_bytes: file.sizeBytes,
      sha256: file.sha256,
      expires_at: new Date(file.expiresAtMs).toISOString(),
    });
  }
}

function scopeKey(ownerRef: string, sessionId: string): string {
  return `${ownerRef}\u0000${sessionId}`;
}
