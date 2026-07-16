import { generateKeyPairSync, randomUUID, type KeyObject } from "node:crypto";
import { SignJWT } from "jose";
import {
  TALOS_BROWSER_ACTION_CAPABILITY_AUDIENCE,
  TALOS_BROWSER_ACTION_CAPABILITY_CLAIM,
  TALOS_BROWSER_ACTION_CAPABILITY_ISSUER,
  TALOS_BROWSER_ACTION_CAPABILITY_SCHEMA,
  TALOS_BROWSER_ACTION_CAPABILITY_TYPE,
  type BrowserActionCapabilityAttestation,
  type BrowserActionCapabilityExpectation,
} from "../../src/BrowserActionCapability.js";

export interface TestActionCapabilityKeypair {
  keyId: string;
  privateKey: KeyObject;
  privateKeyPem: string;
  publicKeyPem: string;
}

export interface TestActionCapabilityOverrides {
  algorithm?: "ES256" | "HS256";
  type?: string;
  keyId?: string;
  issuer?: string;
  audience?: string;
  subject?: string;
  jti?: string;
  issuedAt?: number;
  notBefore?: number;
  expiresAt?: number;
  expectation?: Partial<BrowserActionCapabilityExpectation>;
  attestation?: BrowserActionCapabilityAttestation;
}

export function createTestActionCapabilityKeypair(keyId = "browser-action-test-key"): TestActionCapabilityKeypair {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });

  return {
    keyId,
    privateKey,
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
  };
}

export async function signTestActionCapability(
  keypair: TestActionCapabilityKeypair,
  expectation: BrowserActionCapabilityExpectation,
  overrides: TestActionCapabilityOverrides = {},
): Promise<string> {
  const issuedAt = overrides.issuedAt ?? 1_750_000_000;
  const effective = { ...expectation, ...overrides.expectation };
  const attestation = overrides.attestation ?? { kind: "policy", policy: "talos_browser_semantic_click" };
  const algorithm = overrides.algorithm ?? "ES256";
  const signingKey = algorithm === "HS256"
    ? new TextEncoder().encode("test-only-hs256-secret-with-at-least-32-bytes")
    : keypair.privateKey;

  return new SignJWT({
    [TALOS_BROWSER_ACTION_CAPABILITY_CLAIM]: {
      schema_version: TALOS_BROWSER_ACTION_CAPABILITY_SCHEMA,
      owner_ref: effective.ownerRef,
      worker_session_id: effective.workerSessionId,
      action_id: effective.actionId,
      operation: effective.operation,
      precondition_state_version: effective.preconditionStateVersion,
      request: effective.request,
      authorization: attestation,
    },
  })
    .setProtectedHeader({
      alg: algorithm,
      typ: overrides.type ?? TALOS_BROWSER_ACTION_CAPABILITY_TYPE,
      kid: overrides.keyId ?? keypair.keyId,
    })
    .setIssuer(overrides.issuer ?? TALOS_BROWSER_ACTION_CAPABILITY_ISSUER)
    .setAudience(overrides.audience ?? TALOS_BROWSER_ACTION_CAPABILITY_AUDIENCE)
    .setSubject(overrides.subject ?? effective.ownerRef)
    .setJti(overrides.jti ?? randomUUID())
    .setIssuedAt(issuedAt)
    .setNotBefore(overrides.notBefore ?? issuedAt)
    .setExpirationTime(overrides.expiresAt ?? issuedAt + 30)
    .sign(signingKey);
}
