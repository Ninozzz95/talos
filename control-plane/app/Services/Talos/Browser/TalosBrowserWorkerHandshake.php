<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use InvalidArgumentException;
use JsonException;
use Kadmos\Browser\Contract\BrowserCapability;
use Kadmos\Browser\Contract\BrowserCapabilityManifest;
use stdClass;

final readonly class TalosBrowserWorkerHandshake
{
    private const INVALID_CODE = 'TALOS_BROWSER_WORKER_HANDSHAKE_INVALID';

    private const INVALID_MESSAGE = 'Browser worker returned an invalid handshake.';

    /**
     * @param  array{schema_version: string, algorithm: string, type: string, issuer: string, audience: string, key_id: string, max_ttl_seconds: int}  $actionCapability
     */
    private function __construct(
        public string $status,
        public string $protocolVersion,
        public string $workerName,
        public string $workerVersion,
        public string $workerInstanceId,
        public string $adapterName,
        public string $adapterVersion,
        public string $browserEngine,
        public ?string $browserVersion,
        public string $authenticationMode,
        public bool $ownerBinding,
        public array $actionCapability,
        public BrowserCapabilityManifest $capabilityManifest,
        public ?string $degradedReason,
    ) {}

    public static function fromJson(string $json): self
    {
        try {
            $root = json_decode($json, false, 64, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            self::invalid();
        }
        if (! $root instanceof stdClass) {
            self::invalid();
        }
        self::exactKeys($root, ['data']);
        if (! $root->data instanceof stdClass) {
            self::invalid();
        }
        $data = $root->data;
        self::exactKeys($data, [
            'schema_version', 'protocol_version', 'worker', 'adapter', 'browser',
            'capability_manifest', 'authentication', 'status', 'degraded_reason',
        ]);

        if (($data->schema_version ?? null) !== TalosBrowserWorkerProtocol::HANDSHAKE_SCHEMA) {
            self::invalid();
        }
        if (! is_string($data->protocol_version ?? null)) {
            self::invalid();
        }
        if ($data->protocol_version !== TalosBrowserWorkerProtocol::WORKER) {
            throw new BrowserWorkerException(
                'TALOS_BROWSER_WORKER_PROTOCOL_MISMATCH',
                'Browser worker protocol is incompatible with this TALOS control plane.',
            );
        }

        foreach (['worker', 'adapter', 'browser', 'capability_manifest', 'authentication'] as $object) {
            if (! $data->{$object} instanceof stdClass) {
                self::invalid();
            }
        }
        self::exactKeys($data->worker, ['name', 'version', 'instance_id']);
        self::exactKeys($data->adapter, ['name', 'version']);
        self::exactKeys($data->browser, ['engine', 'version']);
        self::exactKeys($data->authentication, ['mode', 'owner_binding', 'action_capability']);
        if (! $data->authentication->action_capability instanceof stdClass) {
            self::invalid();
        }
        self::exactKeys($data->authentication->action_capability, [
            'schema_version', 'algorithm', 'type', 'issuer', 'audience',
            'key_id', 'max_ttl_seconds',
        ]);

        $workerName = self::boundedString($data->worker, 'name', 128);
        $workerVersion = self::boundedString($data->worker, 'version', 128);
        $workerInstanceId = self::boundedString($data->worker, 'instance_id', 36);
        $adapterName = self::boundedString($data->adapter, 'name', 128);
        $adapterVersion = self::boundedString($data->adapter, 'version', 128);
        $browserEngine = self::boundedString($data->browser, 'engine', 64);
        $authenticationMode = self::boundedString($data->authentication, 'mode', 64);
        $actionCapability = $data->authentication->action_capability;
        $actionKeyId = self::boundedString($actionCapability, 'key_id', 128);
        $browserVersion = self::nullableBoundedString($data->browser->version ?? null, 128);
        $degradedReason = self::nullableBoundedString($data->degraded_reason ?? null, 128);

        if ($workerName !== 'talos-browser-worker'
            || preg_match('/\A\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\z/D', $workerVersion) !== 1
            || preg_match('/\A[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/Di', $workerInstanceId) !== 1
            || preg_match('/\A\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\z/D', $adapterVersion) !== 1
            || $browserEngine !== 'chromium'
            || ! is_bool($data->authentication->owner_binding ?? null)
            || ($actionCapability->schema_version ?? null) !== TalosBrowserActionCapabilityIssuer::SCHEMA_VERSION
            || ($actionCapability->algorithm ?? null) !== 'ES256'
            || ($actionCapability->type ?? null) !== TalosBrowserActionCapabilityIssuer::TYPE
            || ($actionCapability->issuer ?? null) !== TalosBrowserActionCapabilityIssuer::ISSUER
            || ($actionCapability->audience ?? null) !== TalosBrowserActionCapabilityIssuer::AUDIENCE
            || preg_match('/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/D', $actionKeyId) !== 1
            || ($actionCapability->max_ttl_seconds ?? null) !== TalosBrowserActionCapabilityIssuer::MAX_TTL_SECONDS
            || ! in_array($data->status ?? null, ['ready', 'degraded'], true)
            || ($degradedReason !== null && preg_match('/\A[a-z][a-z0-9_]*\z/D', $degradedReason) !== 1)) {
            self::invalid();
        }

        try {
            $manifest = BrowserCapabilityManifest::fromJson(json_encode(
                $data->capability_manifest,
                JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR,
            ));
        } catch (InvalidArgumentException|JsonException) {
            self::invalid();
        }
        if ($manifest->protocolVersion !== $data->protocol_version
            || $manifest->adapterName !== $adapterName
            || $manifest->adapterVersion !== $adapterVersion) {
            self::invalid();
        }

        $status = $data->status;
        $ready = $status === 'ready';
        $validReady = $browserVersion !== null
            && $degradedReason === null
            && $manifest->degradedReason === null;
        $validDegraded = $browserVersion === null
            && $degradedReason !== null
            && $manifest->degradedReason === $degradedReason;
        if (($ready && ! $validReady) || (! $ready && ! $validDegraded)) {
            self::invalid();
        }

        return new self(
            status: $status,
            protocolVersion: $data->protocol_version,
            workerName: $workerName,
            workerVersion: $workerVersion,
            workerInstanceId: strtolower($workerInstanceId),
            adapterName: $adapterName,
            adapterVersion: $adapterVersion,
            browserEngine: $browserEngine,
            browserVersion: $browserVersion,
            authenticationMode: $authenticationMode,
            ownerBinding: $data->authentication->owner_binding,
            actionCapability: [
                'schema_version' => $actionCapability->schema_version,
                'algorithm' => $actionCapability->algorithm,
                'type' => $actionCapability->type,
                'issuer' => $actionCapability->issuer,
                'audience' => $actionCapability->audience,
                'key_id' => $actionKeyId,
                'max_ttl_seconds' => $actionCapability->max_ttl_seconds,
            ],
            capabilityManifest: $manifest,
            degradedReason: $degradedReason,
        );
    }

    public function assertUsable(): void
    {
        if ($this->status !== 'ready') {
            throw new BrowserWorkerException(
                'TALOS_BROWSER_WORKER_DEGRADED',
                'Browser worker runtime is not ready.',
                ['reason_code' => $this->degradedReason ?? 'browser_runtime_unavailable'],
            );
        }
        if ($this->authenticationMode !== 'service_token_and_signed_action_capability' || ! $this->ownerBinding) {
            throw new BrowserWorkerException(
                'TALOS_BROWSER_WORKER_AUTHENTICATION_MISMATCH',
                'Browser worker authentication contract is incompatible with this TALOS control plane.',
            );
        }
        if ($this->adapterName !== TalosBrowserWorkerProtocol::ADAPTER_NAME
            || $this->adapterVersion !== TalosBrowserWorkerProtocol::ADAPTER_VERSION) {
            throw new BrowserWorkerException(
                'TALOS_BROWSER_WORKER_ADAPTER_MISMATCH',
                'Browser worker adapter is incompatible with this TALOS control plane.',
            );
        }
        foreach (TalosBrowserWorkerProtocol::REQUIRED_CAPABILITIES as $capability) {
            if (! $this->supports($capability)) {
                throw new BrowserWorkerException(
                    'TALOS_BROWSER_WORKER_CAPABILITY_MISMATCH',
                    'Browser worker does not provide the required TALOS capabilities.',
                );
            }
        }
    }

    public function supports(string|BrowserCapability $capability): bool
    {
        $resolved = is_string($capability) ? BrowserCapability::tryFrom($capability) : $capability;

        return $resolved !== null && $this->capabilityManifest->supports($resolved);
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'schema_version' => TalosBrowserWorkerProtocol::HANDSHAKE_SCHEMA,
            'protocol_version' => $this->protocolVersion,
            'worker' => [
                'name' => $this->workerName,
                'version' => $this->workerVersion,
                'instance_id' => $this->workerInstanceId,
            ],
            'adapter' => ['name' => $this->adapterName, 'version' => $this->adapterVersion],
            'browser' => ['engine' => $this->browserEngine, 'version' => $this->browserVersion],
            'capability_manifest' => $this->capabilityManifest->toCanonicalArray(),
            'authentication' => [
                'mode' => $this->authenticationMode,
                'owner_binding' => $this->ownerBinding,
                'action_capability' => $this->actionCapability,
            ],
            'status' => $this->status,
            'degraded_reason' => $this->degradedReason,
        ];
    }

    /** @param list<string> $expected */
    private static function exactKeys(stdClass $value, array $expected): void
    {
        $actual = array_keys(get_object_vars($value));
        sort($actual);
        sort($expected);
        if ($actual !== $expected) {
            self::invalid();
        }
    }

    private static function boundedString(stdClass $value, string $field, int $maximum): string
    {
        $candidate = $value->{$field} ?? null;
        if (! is_string($candidate)
            || $candidate === ''
            || trim($candidate) !== $candidate
            || strlen($candidate) > $maximum
            || preg_match('/[\x00-\x1F\x7F]/', $candidate) === 1) {
            self::invalid();
        }

        return $candidate;
    }

    private static function nullableBoundedString(mixed $value, int $maximum): ?string
    {
        if ($value === null) {
            return null;
        }
        if (! is_string($value)
            || $value === ''
            || trim($value) !== $value
            || strlen($value) > $maximum
            || preg_match('/[\x00-\x1F\x7F]/', $value) === 1) {
            self::invalid();
        }

        return $value;
    }

    private static function invalid(): never
    {
        throw new BrowserWorkerException(self::INVALID_CODE, self::INVALID_MESSAGE);
    }
}
