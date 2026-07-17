import { createPublicKey, generateKeyPairSync, timingSafeEqual, type KeyObject } from "node:crypto";
import { errors, jwtVerify, type JWTVerifyResult } from "jose";
import { z } from "zod";
import { canonicalJson } from "./BrowserCanonicalJson.js";
import { BrowserError } from "./BrowserErrors.js";

export const TALOS_BROWSER_ACTION_CAPABILITY_SCHEMA = "talos.browser.action-capability.v1";
export const TALOS_BROWSER_ACTION_CAPABILITY_TYPE = "talos-browser-action+jwt";
export const TALOS_BROWSER_ACTION_CAPABILITY_ISSUER = "urn:talos:control-plane";
export const TALOS_BROWSER_ACTION_CAPABILITY_AUDIENCE = "urn:talos:browser-worker";
export const TALOS_BROWSER_ACTION_CAPABILITY_CLAIM = "https://talo.sh/claims/browser-action";
export const MAX_BROWSER_ACTION_CAPABILITY_TTL_SECONDS = 30;
export const MAX_BROWSER_ACTION_CAPABILITY_BYTES = 16 * 1024;
export const MAX_BROWSER_ACTION_CAPABILITY_JTIS = 4096;

const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const PolicyAttestationSchema = z.object({
  kind: z.literal("policy"),
  policy: z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u),
}).strict();
const UserApprovalAttestationSchema = z.object({
  kind: z.literal("user_approval"),
  approval_id: z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u),
  approval_request_sha256: Sha256Schema,
  execution_lease_sha256: Sha256Schema,
}).strict();
const BrowserActionCapabilityAttestationSchema = z.discriminatedUnion("kind", [
  PolicyAttestationSchema,
  UserApprovalAttestationSchema,
]);
const BrowserActionPrivateClaimSchema = z.object({
  schema_version: z.literal(TALOS_BROWSER_ACTION_CAPABILITY_SCHEMA),
  owner_ref: z.string().min(1).max(256),
  worker_session_id: z.string().min(1).max(256),
  action_id: z.string().min(1).max(256).regex(/^[^\u0000-\u001F\u007F]+$/u),
  operation: z.string().min(1).max(128).regex(/^[a-z][a-z0-9_]*$/u),
  precondition_state_version: z.number().int().min(0),
  request: z.record(z.string(), z.unknown()),
  authorization: BrowserActionCapabilityAttestationSchema,
}).strict();

export type BrowserActionCapabilityAttestation = z.infer<typeof BrowserActionCapabilityAttestationSchema>;

export interface BrowserActionCapabilityExpectation {
  ownerRef: string;
  workerSessionId: string;
  actionId: string;
  operation: string;
  preconditionStateVersion: number;
  request: Record<string, unknown>;
}

export interface VerifiedBrowserActionCapability extends BrowserActionCapabilityExpectation {
  jti: string;
  issuedAt: number;
  expiresAt: number;
  authorization: BrowserActionCapabilityAttestation;
}

export interface BrowserActionCapabilityDescriptor {
  schema_version: typeof TALOS_BROWSER_ACTION_CAPABILITY_SCHEMA;
  algorithm: "ES256";
  type: typeof TALOS_BROWSER_ACTION_CAPABILITY_TYPE;
  issuer: typeof TALOS_BROWSER_ACTION_CAPABILITY_ISSUER;
  audience: typeof TALOS_BROWSER_ACTION_CAPABILITY_AUDIENCE;
  key_id: string;
  max_ttl_seconds: typeof MAX_BROWSER_ACTION_CAPABILITY_TTL_SECONDS;
}

export class BrowserActionCapabilityVerifier {
  private readonly consumedJtis = new Map<string, number>();

  private constructor(
    private readonly publicKey: KeyObject,
    private readonly keyId: string,
    private readonly now: () => number,
  ) {}

  static fromEnvironment(
    environment: NodeJS.ProcessEnv = process.env,
    runtimeEnvironment = environment.NODE_ENV,
  ): BrowserActionCapabilityVerifier {
    const encodedKey = environment.TALOS_BROWSER_ACTION_PUBLIC_KEY_B64?.trim() ?? "";
    const keyId = environment.TALOS_BROWSER_ACTION_KEY_ID?.trim() ?? "";
    if (encodedKey === "" || keyId === "") {
      if (runtimeEnvironment === "test") {
        const { publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
        return BrowserActionCapabilityVerifier.fromKey(publicKey, "test-ephemeral-browser-action-key", () => Math.floor(Date.now() / 1000));
      }
      throw configurationError();
    }

    let pem: string;
    try {
      pem = Buffer.from(encodedKey, "base64").toString("utf8");
    } catch {
      throw configurationError();
    }
    return BrowserActionCapabilityVerifier.forTest(pem, keyId, () => Math.floor(Date.now() / 1000));
  }

  static forTest(publicKeyPem: string, keyId: string, now: () => number = () => Math.floor(Date.now() / 1000)): BrowserActionCapabilityVerifier {
    try {
      return BrowserActionCapabilityVerifier.fromKey(createPublicKey(publicKeyPem), keyId, now);
    } catch (error) {
      if (error instanceof BrowserError) throw error;
      throw configurationError();
    }
  }

  descriptor(): BrowserActionCapabilityDescriptor {
    return {
      schema_version: TALOS_BROWSER_ACTION_CAPABILITY_SCHEMA,
      algorithm: "ES256",
      type: TALOS_BROWSER_ACTION_CAPABILITY_TYPE,
      issuer: TALOS_BROWSER_ACTION_CAPABILITY_ISSUER,
      audience: TALOS_BROWSER_ACTION_CAPABILITY_AUDIENCE,
      key_id: this.keyId,
      max_ttl_seconds: MAX_BROWSER_ACTION_CAPABILITY_TTL_SECONDS,
    };
  }

  async verifyAndConsume(
    bearer: string | undefined,
    expected: BrowserActionCapabilityExpectation,
  ): Promise<VerifiedBrowserActionCapability> {
    const compact = extractBearer(bearer);
    if (Buffer.byteLength(compact, "utf8") > MAX_BROWSER_ACTION_CAPABILITY_BYTES) {
      throw invalidCapability();
    }

    const now = this.now();
    let verified: JWTVerifyResult;
    try {
      verified = await jwtVerify(compact, this.publicKey, {
        algorithms: ["ES256"],
        issuer: TALOS_BROWSER_ACTION_CAPABILITY_ISSUER,
        audience: TALOS_BROWSER_ACTION_CAPABILITY_AUDIENCE,
        typ: TALOS_BROWSER_ACTION_CAPABILITY_TYPE,
        currentDate: new Date(now * 1000),
        clockTolerance: 0,
      });
    } catch (error) {
      if (error instanceof errors.JWTExpired) {
        throw new BrowserError("The browser action capability has expired.", "TALOS_BROWSER_ACTION_CAPABILITY_EXPIRED", 401);
      }
      if (error instanceof errors.JWTClaimValidationFailed && error.claim === "nbf") {
        throw new BrowserError("The browser action capability is not active.", "TALOS_BROWSER_ACTION_CAPABILITY_NOT_ACTIVE", 401);
      }
      throw invalidCapability();
    }

    const { protectedHeader, payload } = verified;
    if (protectedHeader.alg !== "ES256"
      || protectedHeader.typ !== TALOS_BROWSER_ACTION_CAPABILITY_TYPE
      || protectedHeader.kid !== this.keyId) {
      throw invalidCapability();
    }
    if (!isUuid(payload.jti)
      || !Number.isInteger(payload.iat)
      || !Number.isInteger(payload.nbf)
      || !Number.isInteger(payload.exp)
      || typeof payload.iat !== "number"
      || typeof payload.nbf !== "number"
      || typeof payload.exp !== "number"
      || payload.iat > now
      || payload.nbf < payload.iat
      || payload.exp <= payload.iat
      || payload.exp - payload.iat > MAX_BROWSER_ACTION_CAPABILITY_TTL_SECONDS) {
      throw invalidCapability();
    }
    if (payload.nbf > now) {
      throw new BrowserError("The browser action capability is not active.", "TALOS_BROWSER_ACTION_CAPABILITY_NOT_ACTIVE", 401);
    }
    if (payload.exp <= now) {
      throw new BrowserError("The browser action capability has expired.", "TALOS_BROWSER_ACTION_CAPABILITY_EXPIRED", 401);
    }
    const claim = BrowserActionPrivateClaimSchema.safeParse(payload[TALOS_BROWSER_ACTION_CAPABILITY_CLAIM]);
    if (!claim.success || payload.sub !== claim.data.owner_ref) throw invalidCapability();

    assertBinding("owner", claim.data.owner_ref, expected.ownerRef);
    assertBinding("session", claim.data.worker_session_id, expected.workerSessionId);
    assertBinding("action", claim.data.action_id, expected.actionId);
    assertBinding("operation", claim.data.operation, expected.operation);
    if (claim.data.precondition_state_version !== expected.preconditionStateVersion) mismatch("state");
    if (!constantTimeTextEqual(canonicalJson(claim.data.request), canonicalJson(expected.request))) mismatch("request");
    if (expected.operation === "hmi_pointer_execute" && claim.data.authorization.kind !== "user_approval") mismatch("authorization");
    if (expected.operation === "browser_file_upload" && claim.data.authorization.kind !== "user_approval") mismatch("authorization");
    if (expected.operation === "browser_click" && claim.data.authorization.kind !== "policy") mismatch("authorization");

    this.pruneConsumed(now);
    if (this.consumedJtis.has(payload.jti)) {
      throw new BrowserError("The browser action capability has already been consumed.", "TALOS_BROWSER_ACTION_CAPABILITY_REPLAYED", 409);
    }
    if (this.consumedJtis.size >= MAX_BROWSER_ACTION_CAPABILITY_JTIS) {
      throw new BrowserError("Browser action capability replay retention is exhausted.", "TALOS_BROWSER_ACTION_CAPABILITY_RETENTION_EXHAUSTED", 429);
    }
    this.consumedJtis.set(payload.jti, payload.exp);

    return {
      ownerRef: claim.data.owner_ref,
      workerSessionId: claim.data.worker_session_id,
      actionId: claim.data.action_id,
      operation: claim.data.operation,
      preconditionStateVersion: claim.data.precondition_state_version,
      request: claim.data.request,
      authorization: claim.data.authorization,
      jti: payload.jti,
      issuedAt: payload.iat,
      expiresAt: payload.exp,
    };
  }

  private static fromKey(publicKey: KeyObject, keyId: string, now: () => number): BrowserActionCapabilityVerifier {
    const curve = publicKey.asymmetricKeyDetails?.namedCurve;
    if (publicKey.type !== "public"
      || publicKey.asymmetricKeyType !== "ec"
      || !["prime256v1", "P-256"].includes(curve ?? "")
      || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(keyId)) {
      throw configurationError();
    }
    return new BrowserActionCapabilityVerifier(publicKey, keyId, now);
  }

  private pruneConsumed(now: number): void {
    for (const [jti, expiresAt] of this.consumedJtis) {
      if (expiresAt <= now) this.consumedJtis.delete(jti);
    }
  }
}

function extractBearer(value: string | undefined): string {
  if (typeof value !== "string") throw requiredCapability();
  const match = /^Bearer ([^\s]+)$/u.exec(value);
  if (!match) throw requiredCapability();
  return match[1];
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function assertBinding(binding: string, actual: string, expected: string): void {
  if (!constantTimeTextEqual(actual, expected)) mismatch(binding);
}

function constantTimeTextEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return actualBytes.byteLength === expectedBytes.byteLength && timingSafeEqual(actualBytes, expectedBytes);
}

function mismatch(binding: string): never {
  throw new BrowserError(
    "The browser action capability does not match the requested action.",
    "TALOS_BROWSER_ACTION_CAPABILITY_MISMATCH",
    403,
    { binding },
  );
}

function requiredCapability(): BrowserError {
  return new BrowserError(
    "A signed browser action capability is required.",
    "TALOS_BROWSER_ACTION_CAPABILITY_REQUIRED",
    401,
  );
}

function invalidCapability(): BrowserError {
  return new BrowserError(
    "The browser action capability is invalid.",
    "TALOS_BROWSER_ACTION_CAPABILITY_INVALID",
    401,
  );
}

function configurationError(): BrowserError {
  return new BrowserError(
    "Browser action capability verification is not configured.",
    "TALOS_BROWSER_ACTION_CAPABILITY_CONFIGURATION_INVALID",
    503,
  );
}
