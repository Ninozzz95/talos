<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use Closure;
use DateTimeImmutable;
use Illuminate\Support\Str;
use JsonException;
use Lcobucci\JWT\Configuration;
use Lcobucci\JWT\Signer\Ecdsa\Sha256;
use Lcobucci\JWT\Signer\Key\InMemory;
use OpenSSLAsymmetricKey;
use Throwable;

final class TalosBrowserActionCapabilityIssuer
{
    public const SCHEMA_VERSION = 'talos.browser.action-capability.v1';

    public const TYPE = 'talos-browser-action+jwt';

    public const ISSUER = 'urn:talos:control-plane';

    public const AUDIENCE = 'urn:talos:browser-worker';

    public const PRIVATE_CLAIM = 'https://talo.sh/claims/browser-action';

    public const MAX_TTL_SECONDS = 30;

    private readonly Configuration $configuration;

    /** @var Closure(): DateTimeImmutable */
    private readonly Closure $clock;

    public function __construct(
        string $privateKeyBase64,
        private readonly string $keyId,
        private readonly int $ttlSeconds = self::MAX_TTL_SECONDS,
        ?Closure $clock = null,
    ) {
        if (preg_match('/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/D', $this->keyId) !== 1
            || $this->ttlSeconds < 1
            || $this->ttlSeconds > self::MAX_TTL_SECONDS) {
            throw self::configurationInvalid();
        }

        $privateKey = base64_decode($privateKeyBase64, true);
        if (! is_string($privateKey)
            || ! str_starts_with($privateKey, "-----BEGIN PRIVATE KEY-----\n")
            || ! str_ends_with(trim($privateKey), '-----END PRIVATE KEY-----')) {
            throw self::configurationInvalid();
        }

        $key = @openssl_pkey_get_private($privateKey);
        if (! $key instanceof OpenSSLAsymmetricKey) {
            throw self::configurationInvalid();
        }
        $details = openssl_pkey_get_details($key);
        $curve = is_array($details) && is_array($details['ec'] ?? null)
            ? $details['ec']['curve_name'] ?? null
            : null;
        $publicKey = is_array($details) ? $details['key'] ?? null : null;
        if (($details['type'] ?? null) !== OPENSSL_KEYTYPE_EC
            || ($details['bits'] ?? null) !== 256
            || ! in_array($curve, ['prime256v1', 'secp256r1'], true)
            || ! is_string($publicKey)
            || trim($publicKey) === '') {
            throw self::configurationInvalid();
        }

        try {
            $this->configuration = Configuration::forAsymmetricSigner(
                new Sha256,
                InMemory::plainText($privateKey),
                InMemory::plainText($publicKey),
            );
        } catch (Throwable) {
            throw self::configurationInvalid();
        }
        $this->clock = $clock ?? static fn (): DateTimeImmutable => new DateTimeImmutable;
    }

    /**
     * @param  array<string, mixed>  $request
     */
    public function issue(
        string $ownerRef,
        string $workerSessionId,
        string $operation,
        int $expectedStateVersion,
        array $request,
        BrowserActionAuthorization $authorization,
    ): string {
        $actionId = $authorization->actionId();
        if (! self::boundedText($ownerRef, 256)
            || ! self::boundedText($workerSessionId, 256)
            || preg_match('/^[a-z][a-z0-9_]{0,127}$/D', $operation) !== 1
            || $expectedStateVersion < 0
            || $request === []
            || array_is_list($request)
            || ! $this->requestMatchesAction($request, $actionId)) {
            throw self::invalid();
        }

        $attestation = $authorization->toCapabilityAttestation();
        if (($operation === 'browser_click' && ($attestation['kind'] ?? null) !== 'policy')
            || ($operation === 'hmi_pointer_execute' && ($attestation['kind'] ?? null) !== 'user_approval')) {
            throw self::invalid();
        }
        try {
            $encodedRequest = json_encode($request, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw self::invalid();
        }
        if (strlen($encodedRequest) > 8 * 1024) {
            throw self::invalid();
        }

        $clockNow = ($this->clock)();
        $now = new DateTimeImmutable('@'.$clockNow->getTimestamp());
        $expiresAt = $now->modify('+'.$this->ttlSeconds.' seconds');
        try {
            $token = $this->configuration->builder()
                ->withHeader('typ', self::TYPE)
                ->withHeader('kid', $this->keyId)
                ->issuedBy(self::ISSUER)
                ->relatedTo($ownerRef)
                ->permittedFor(self::AUDIENCE)
                ->identifiedBy((string) Str::uuid())
                ->issuedAt($now)
                ->canOnlyBeUsedAfter($now)
                ->expiresAt($expiresAt)
                ->withClaim(self::PRIVATE_CLAIM, [
                    'schema_version' => self::SCHEMA_VERSION,
                    'owner_ref' => $ownerRef,
                    'worker_session_id' => $workerSessionId,
                    'action_id' => $actionId,
                    'operation' => $operation,
                    'precondition_state_version' => $expectedStateVersion,
                    'request' => $request,
                    'authorization' => $attestation,
                ])
                ->getToken($this->configuration->signer(), $this->configuration->signingKey())
                ->toString();
        } catch (Throwable) {
            throw self::invalid();
        }
        if (strlen($token) > 16 * 1024) {
            throw self::invalid();
        }

        return $token;
    }

    /** @return array<string, int|string> */
    public function descriptor(): array
    {
        return [
            'schema_version' => self::SCHEMA_VERSION,
            'algorithm' => 'ES256',
            'type' => self::TYPE,
            'issuer' => self::ISSUER,
            'audience' => self::AUDIENCE,
            'key_id' => $this->keyId,
            'max_ttl_seconds' => self::MAX_TTL_SECONDS,
        ];
    }

    /** @param array<string, mixed> $request */
    private function requestMatchesAction(array $request, string $actionId): bool
    {
        foreach (['tool_use_id', 'command_id', 'idempotency_key'] as $field) {
            if (array_key_exists($field, $request)) {
                return is_string($request[$field]) && hash_equals($actionId, $request[$field]);
            }
        }

        return false;
    }

    private static function boundedText(string $value, int $maxBytes): bool
    {
        return $value !== ''
            && strlen($value) <= $maxBytes
            && preg_match('/[\x00-\x1F\x7F]/', $value) !== 1;
    }

    private static function configurationInvalid(): BrowserWorkerException
    {
        return new BrowserWorkerException(
            'TALOS_BROWSER_ACTION_CAPABILITY_CONFIGURATION_INVALID',
            'Browser action capability issuance is not configured.',
        );
    }

    private static function invalid(): BrowserWorkerException
    {
        return new BrowserWorkerException(
            'TALOS_BROWSER_ACTION_CAPABILITY_INVALID',
            'Browser action capability input is invalid.',
        );
    }
}
