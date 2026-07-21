<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use Illuminate\Support\Str;

final class FakeBrowserSessionClient implements BrowserSessionClient
{
    /** @var list<array<string, mixed>> */
    public array $requests = [];

    public ?BrowserWorkerException $failure = null;

    /** @var (callable(string): void)|null */
    public $afterRequest = null;

    /** @var array<string, mixed>|null */
    public ?array $createResponse = null;

    /** @var array<string, mixed>|null */
    public ?array $handshakeResponse = null;

    /** @var array<string, mixed>|null */
    public ?array $navigateResponse = null;

    /** @var array<string, mixed>|null */
    public ?array $screenshotResponse = null;

    /** @var array<string, mixed>|null */
    public ?array $snapshotResponse = null;

    /** @var array<string, mixed>|null */
    public ?array $preflightPointerResponse = null;

    /** @var array<string, mixed>|null */
    public ?array $executePointerResponse = null;

    /** @var array<string, mixed>|null */
    public ?array $inspectResponse = null;

    /** @var list<array<string, mixed>>|null */
    public ?array $toolDefinitionsResponse = null;

    public ?BrowserToolResult $callToolResponse = null;

    /** @var array<string, mixed>|null */
    public ?array $stageFileResponse = null;

    public ?int $failStageFileCall = null;

    public bool $failDiscardStagedFile = false;

    private int $stageFileCalls = 0;

    /** @var array<string, mixed>|null */
    private ?array $latestToolSnapshot = null;

    public int $delayMilliseconds = 0;

    public int $screenshotStateVersion = 0;

    /** @var array<string, array<string, mixed>> */
    private array $sessionState = [];

    /** @var array<string, array{fingerprint: string, session_id: string, response: array<string, mixed>}> */
    private array $createClaims = [];

    /** @var array<string, array<string, mixed>> */
    private array $latestHmiTargets = [];

    /** @return list<array<string, mixed>> */
    public function toolDefinitions(string $ownerRef): array
    {
        return $this->respond('toolDefinitions', compact('ownerRef'), $this->toolDefinitionsResponse ?? []);
    }

    public function handshake(string $ownerRef, int $timeoutMilliseconds = 5000): TalosBrowserWorkerHandshake
    {
        $payload = $this->respond('handshake', compact('ownerRef', 'timeoutMilliseconds'), $this->handshakeResponse ?? [
            'data' => [
                'schema_version' => TalosBrowserWorkerProtocol::HANDSHAKE_SCHEMA,
                'protocol_version' => TalosBrowserWorkerProtocol::WORKER,
                'worker' => ['name' => 'talos-browser-worker', 'version' => '0.1.0', 'instance_id' => '00000000-0000-4000-8000-000000000001'],
                'adapter' => ['name' => TalosBrowserWorkerProtocol::ADAPTER_NAME, 'version' => TalosBrowserWorkerProtocol::ADAPTER_VERSION],
                'browser' => ['engine' => 'chromium', 'version' => 'fake-chromium'],
                'capability_manifest' => [
                    'schema_version' => 'talos.browser.capabilities.v1',
                    'protocol_version' => TalosBrowserWorkerProtocol::WORKER,
                    'adapter_name' => TalosBrowserWorkerProtocol::ADAPTER_NAME,
                    'adapter_version' => TalosBrowserWorkerProtocol::ADAPTER_VERSION,
                    'capabilities' => TalosBrowserWorkerProtocol::REQUIRED_CAPABILITIES,
                    'limits' => ['max_tabs' => 1, 'max_viewport_width' => 3840, 'max_viewport_height' => 2160, 'max_artifact_bytes' => 5_000_000],
                    'degraded_reason' => null,
                ],
                'authentication' => [
                    'mode' => 'service_token_and_signed_action_capability',
                    'owner_binding' => true,
                    'action_capability' => [
                        'schema_version' => TalosBrowserActionCapabilityIssuer::SCHEMA_VERSION,
                        'algorithm' => 'ES256',
                        'type' => TalosBrowserActionCapabilityIssuer::TYPE,
                        'issuer' => TalosBrowserActionCapabilityIssuer::ISSUER,
                        'audience' => TalosBrowserActionCapabilityIssuer::AUDIENCE,
                        'key_id' => 'test-ephemeral-browser-action-key',
                        'max_ttl_seconds' => TalosBrowserActionCapabilityIssuer::MAX_TTL_SECONDS,
                    ],
                ],
                'status' => 'ready',
                'degraded_reason' => null,
            ],
        ]);

        return TalosBrowserWorkerHandshake::fromJson(json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
    }

    public function callTool(
        string $ownerRef,
        string $workerSessionId,
        string $toolUseId,
        string $name,
        array $arguments,
        int $timeoutMs = 15000,
        ?BrowserActionAuthorization $authorization = null,
    ): BrowserToolResult {
        $method = match ($name) {
            'browser_navigate' => 'navigate',
            'browser_snapshot' => 'snapshot',
            'browser_read' => 'read',
            'browser_take_screenshot' => 'screenshot',
            'browser_wait_for' => 'wait',
            'browser_click' => 'click',
            'browser_file_upload' => 'upload',
            default => 'tool',
        };
        $request = compact('ownerRef', 'workerSessionId', 'toolUseId', 'name', 'arguments', 'timeoutMs', 'authorization');
        $request['transport_method'] = 'callTool';
        if ($name === 'browser_navigate' && is_string($arguments['url'] ?? null)) {
            $request['url'] = $arguments['url'];
        }

        return $this->respond($method, $request, $this->callToolResponse ?? $this->defaultToolResult($toolUseId, $name, $arguments));
    }

    public function stageFile(
        string $ownerRef,
        string $workerSessionId,
        string $stageId,
        array $file,
        int $timeoutMilliseconds = 15000,
    ): array {
        $this->stageFileCalls++;
        if ($this->failStageFileCall === $this->stageFileCalls) {
            $this->requests[] = ['method' => 'stageFile'] + compact('ownerRef', 'workerSessionId', 'stageId', 'file', 'timeoutMilliseconds');
            throw new BrowserWorkerException('TALOS_BROWSER_WORKER_FAILURE', 'Browser staged file request failed.');
        }
        $response = $this->stageFileResponse ?? [
            'stage_id' => $stageId,
            'file_id' => $file['file_id'] ?? null,
            'name' => $file['name'] ?? null,
            'mime_type' => $file['mime_type'] ?? null,
            'size_bytes' => $file['size_bytes'] ?? null,
            'sha256' => $file['sha256'] ?? null,
            'expires_at' => now()->addMinutes(2)->toJSON(),
        ];

        return $this->respond('stageFile', compact('ownerRef', 'workerSessionId', 'stageId', 'file', 'timeoutMilliseconds'), $response);
    }

    public function discardStagedFile(
        string $ownerRef,
        string $workerSessionId,
        string $stageId,
        int $timeoutMilliseconds = 15000,
    ): void {
        if (preg_match('/^stg_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/D', $stageId) !== 1) {
            throw new \InvalidArgumentException('Browser staged file identity is invalid.');
        }
        if ($this->failDiscardStagedFile) {
            $this->requests[] = ['method' => 'discardStagedFile'] + compact('ownerRef', 'workerSessionId', 'stageId', 'timeoutMilliseconds');
            throw new BrowserWorkerException('TALOS_BROWSER_WORKER_FAILURE', 'Browser staged file cleanup failed.');
        }
        $this->respond('discardStagedFile', compact('ownerRef', 'workerSessionId', 'stageId', 'timeoutMilliseconds'), null);
    }

    public function create(string $ownerRef, int $width, int $height, int $timeoutMilliseconds = 15000, int $ttlSeconds = 3600): array
    {
        return $this->materializeCreate($ownerRef, $width, $height, $timeoutMilliseconds, $ttlSeconds);
    }

    public function createIdempotent(
        string $ownerRef,
        int $width,
        int $height,
        string $idempotencyKey,
        int $timeoutMilliseconds = 15000,
        int $ttlSeconds = 3600,
    ): array {
        if (! Str::isUuid($idempotencyKey)
            || preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/Di', $idempotencyKey) !== 1) {
            throw new \InvalidArgumentException('Browser session idempotency key must be a UUID.');
        }
        $claimKey = $ownerRef.':'.strtolower($idempotencyKey);
        $fingerprint = hash('sha256', json_encode([
            'owner_ref' => $ownerRef,
            'width' => $width,
            'height' => $height,
            'ttl_seconds' => $ttlSeconds,
        ], JSON_THROW_ON_ERROR));
        $claim = $this->createClaims[$claimKey] ?? null;
        if (is_array($claim)) {
            if (! hash_equals($claim['fingerprint'], $fingerprint)) {
                throw new BrowserWorkerException(
                    'TALOS_BROWSER_SESSION_IDEMPOTENCY_CONFLICT',
                    'Browser session idempotency key was already used for another create intent.',
                );
            }
            if (isset($this->sessionState[$claim['session_id']])) {
                return $this->respond('create', compact('ownerRef', 'width', 'height', 'timeoutMilliseconds', 'ttlSeconds', 'idempotencyKey'), $claim['response']);
            }
            unset($this->createClaims[$claimKey]);
        }

        $response = $this->materializeCreate($ownerRef, $width, $height, $timeoutMilliseconds, $ttlSeconds, strtolower($idempotencyKey));
        $this->createClaims[$claimKey] = [
            'fingerprint' => $fingerprint,
            'session_id' => (string) $response['sessionId'],
            'response' => $response,
        ];

        return $response;
    }

    /** @return array<string, mixed> */
    private function materializeCreate(
        string $ownerRef,
        int $width,
        int $height,
        int $timeoutMilliseconds,
        int $ttlSeconds,
        ?string $idempotencyKey = null,
    ): array {
        $request = compact('ownerRef', 'width', 'height', 'timeoutMilliseconds', 'ttlSeconds');
        if (is_string($idempotencyKey)) {
            $request['idempotencyKey'] = $idempotencyKey;
        }
        $response = $this->respond('create', $request + ['capabilities' => ['actions' => false, 'hmiActions' => true]], $this->createResponse ?? ['sessionId' => 'brw_'.Str::uuid(), 'status' => 'ready', 'mode' => 'read_only', 'viewport' => ['width' => $width, 'height' => $height], 'deviceScaleFactor' => 1, 'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true, 'actions' => false, 'hmiActions' => true, 'downloads' => false, 'uploads' => false], 'stateVersion' => 0, 'expiresAt' => now()->addSeconds($ttlSeconds)->toJSON()]);
        if (is_string($response['sessionId'] ?? null) && $response['sessionId'] !== '') {
            $this->sessionState[$response['sessionId']] = $response;
        }

        return $response;
    }

    public function inspect(string $ownerRef, string $workerSessionId, int $timeoutMilliseconds = 15000): array
    {
        return $this->respond('inspect', compact('ownerRef', 'workerSessionId', 'timeoutMilliseconds'), $this->inspectResponse ?? $this->sessionState[$workerSessionId] ?? [
            'sessionId' => $workerSessionId,
            'status' => 'ready',
            'mode' => 'read_only',
            'viewport' => ['width' => 1280, 'height' => 800],
            'deviceScaleFactor' => 1,
            'capabilities' => [
                'navigation' => true,
                'screenshots' => true,
                'accessibilitySnapshot' => true,
                'actions' => false,
                'hmiActions' => true,
                'downloads' => false,
                'uploads' => false,
            ],
            'stateVersion' => 0,
            'expiresAt' => now()->addHour()->toJSON(),
        ]);
    }

    public function navigate(string $ownerRef, string $workerSessionId, string $url, int $timeoutMilliseconds = 15000): array
    {
        return $this->respond('navigate', compact('ownerRef', 'workerSessionId', 'url', 'timeoutMilliseconds'), $this->navigateResponse ?? ['url' => $url, 'title' => 'Example page', 'status' => 'active']);
    }

    public function screenshot(string $ownerRef, string $workerSessionId, int $timeoutMilliseconds = 15000): array
    {
        $session = $this->sessionState[$workerSessionId] ?? [];
        $viewport = is_array($session['viewport'] ?? null) ? $session['viewport'] : [];
        $width = is_int($viewport['width'] ?? null) ? $viewport['width'] : 1280;
        $height = is_int($viewport['height'] ?? null) ? $viewport['height'] : 800;
        $bytes = self::pngBytes($width, $height);

        return $this->respond('screenshot', compact('ownerRef', 'workerSessionId', 'timeoutMilliseconds'), $this->screenshotResponse ?? ['sessionId' => $workerSessionId, 'stateVersion' => is_int($session['stateVersion'] ?? null) ? $session['stateVersion'] : $this->screenshotStateVersion, 'mime' => 'image/png', 'width' => $width, 'height' => $height, 'base64' => base64_encode($bytes), 'sha256' => hash('sha256', $bytes)]);
    }

    public function snapshot(string $ownerRef, string $workerSessionId, int $timeoutMilliseconds = 15000): array
    {
        return $this->respond('snapshot', compact('ownerRef', 'workerSessionId', 'timeoutMilliseconds'), $this->snapshotResponse ?? ['snapshotId' => 'snap_fake_legacy_1', 'format' => 'accessibility_refs_v1', 'textDigest' => hash('sha256', 'snapshot'), 'nodes' => [['ref' => 'r1', 'role' => 'heading', 'name' => 'Example', 'visible' => true]], 'url' => 'https://example.com', 'title' => 'Example page']);
    }

    public function scroll(string $ownerRef, string $workerSessionId, array $payload, int $timeoutMilliseconds = 15000): array
    {
        $screenshotBytes = self::pngBytes(1280, 800);
        $snapshotCanonical = ['format' => 'accessibility_refs_v1', 'nodes' => [], 'snapshot_id' => 'snap_fake-scroll-1', 'text_digest' => ''];
        $response = [
            'schema_version' => 'talos_browser_hmi_scroll_v2',
            'interaction_id' => $payload['interaction_id'] ?? null,
            'session_id' => $workerSessionId,
            'source_state_version' => $payload['state_version'] ?? 0,
            'state_version' => ((int) ($payload['state_version'] ?? 0)) + 1,
            'frame_sha256' => 'sha256:'.hash('sha256', $screenshotBytes),
            'url' => 'https://example.com/',
            'title' => 'Example page',
            'screenshot' => ['mime_type' => 'image/png', 'width' => 1280, 'height' => 800, 'sha256' => 'sha256:'.hash('sha256', $screenshotBytes), 'base64' => base64_encode($screenshotBytes)],
            'snapshot' => ['snapshot_id' => 'snap_fake-scroll-1', 'format' => 'accessibility_refs_v1', 'text_digest' => '', 'nodes' => [], 'sha256' => 'sha256:'.hash('sha256', json_encode($snapshotCanonical, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR))],
            'captured_at' => now()->toJSON(),
        ];

        return $this->respond('scroll', compact('ownerRef', 'workerSessionId', 'payload', 'timeoutMilliseconds'), $response);
    }

    public function preflightPointer(string $ownerRef, string $workerSessionId, array $payload, int $timeoutMilliseconds = 15000): array
    {
        $response = $this->preflightPointerResponse ?? [
            'schema_version' => 'talos_browser_hmi_preflight_v2',
            'session_id' => $workerSessionId,
            'state_version' => $payload['state_version'] ?? 0,
            'frame_sha256' => $payload['expected_frame_sha256'] ?? 'sha256:'.str_repeat('0', 64),
            'origin' => 'https://example.com',
            'point' => ['normalized_x' => $payload['normalized_x'] ?? 0, 'normalized_y' => $payload['normalized_y'] ?? 0, 'x' => 0, 'y' => 0],
            'target' => $this->defaultHmiTarget(null, $payload),
        ];
        $response['interaction_id'] = $payload['interaction_id'] ?? ($response['interaction_id'] ?? null);
        if (is_array($response['target'] ?? null)) {
            $this->latestHmiTargets[$this->hmiTargetKey($ownerRef, $workerSessionId)] = $response['target'];
        }

        return $this->respond('preflightPointer', compact('ownerRef', 'workerSessionId', 'payload', 'timeoutMilliseconds'), $response);
    }

    public function executePointer(
        string $ownerRef,
        string $workerSessionId,
        array $payload,
        int $timeoutMilliseconds = 15000,
        ?BrowserActionAuthorization $authorization = null,
    ): array {
        $screenshotBytes = self::pngBytes(1280, 800);
        $snapshot = ['snapshot_id' => 'snap_fake-hmi-1', 'format' => 'accessibility_refs_v1', 'text_digest' => '', 'nodes' => []];
        $snapshotCanonical = ['format' => 'accessibility_refs_v1', 'nodes' => [], 'snapshot_id' => 'snap_fake-hmi-1', 'text_digest' => ''];
        $response = $this->executePointerResponse ?? [
            'schema_version' => 'talos_browser_hmi_result_v2',
            'capture_id' => 'cap_00000000-0000-4000-8000-000000000001',
            'session_id' => $workerSessionId,
            'source_state_version' => $payload['state_version'] ?? 0,
            'state_version' => ((int) ($payload['state_version'] ?? 0)) + 1,
            'frame_sha256' => $payload['expected_frame_sha256'] ?? 'sha256:'.str_repeat('0', 64),
            'url' => 'https://example.com/',
            'title' => 'Example page',
            'target' => $this->defaultHmiTarget($payload['expected_fingerprint'] ?? null, $payload),
            'screenshot' => ['mime_type' => 'image/png', 'width' => 1280, 'height' => 800, 'sha256' => 'sha256:'.hash('sha256', $screenshotBytes), 'base64' => base64_encode($screenshotBytes)],
            'snapshot' => [...$snapshot, 'sha256' => 'sha256:'.hash('sha256', json_encode($snapshotCanonical, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR))],
            'captured_at' => now()->toJSON(),
        ];
        $preflightTarget = $this->latestHmiTargets[$this->hmiTargetKey($ownerRef, $workerSessionId)] ?? null;
        if (is_array($preflightTarget)) {
            $response['target'] = $preflightTarget;
        }
        $response['command_id'] = $payload['command_id'] ?? ($response['command_id'] ?? null);
        $response['interaction_id'] = $payload['interaction_id'] ?? ($response['interaction_id'] ?? null);
        $response['effect_classification'] = $payload['effect_classification'] ?? ($response['effect_classification'] ?? null);
        $response['sensitive_effect_authorized'] = $payload['sensitive_effect_authorized'] ?? ($response['sensitive_effect_authorized'] ?? null);

        $result = $this->respond('executePointer', compact('ownerRef', 'workerSessionId', 'payload', 'timeoutMilliseconds', 'authorization'), $response);
        if (isset($this->sessionState[$workerSessionId]) && is_int($result['state_version'] ?? null)) {
            $this->sessionState[$workerSessionId]['stateVersion'] = $result['state_version'];
            $this->sessionState[$workerSessionId]['status'] = 'active';
        }

        return $result;
    }

    private function hmiTargetKey(string $ownerRef, string $workerSessionId): string
    {
        return $ownerRef."\0".$workerSessionId;
    }

    /** @return array<string, mixed> */
    private function defaultHmiTarget(?string $fingerprint = null, ?array $payload = null): array
    {
        // Keep the fake's ordinary and sensitive targets deterministic without changing policy.
        $sensitive = is_array($payload)
            && is_numeric($payload['normalized_x'] ?? null)
            && (float) $payload['normalized_x'] < 0.4;

        return [
            'tag' => 'button',
            'role' => 'button',
            'name' => $sensitive ? 'Buy now' : 'Close',
            'input_type' => null,
            'href' => null,
            'form_method' => $sensitive ? 'post' : null,
            'is_editable' => false,
            'is_submit' => $sensitive,
            'is_download' => false,
            'opens_new_context' => false,
            'effect_attestation' => $sensitive ? 'unattestable' : 'browser_default',
            'required_effect_classification' => $sensitive ? 'sensitive' : 'ordinary',
            'visible' => true,
            'disabled' => false,
            'fingerprint' => $fingerprint ?? 'sha256:'.str_repeat($sensitive ? 'b' : 'a', 64),
        ];
    }

    public function close(string $ownerRef, string $workerSessionId, int $timeoutMilliseconds = 15000): void
    {
        $this->respond('close', compact('ownerRef', 'workerSessionId', 'timeoutMilliseconds'), []);
        unset($this->sessionState[$workerSessionId]);
        $this->forgetCreateClaims($workerSessionId);
    }

    public function cancel(
        string $ownerRef,
        string $workerSessionId,
        string $reason,
        int $timeoutMilliseconds = 15000,
    ): void {
        $this->respond('cancel', compact('ownerRef', 'workerSessionId', 'reason', 'timeoutMilliseconds'), []);
        unset($this->sessionState[$workerSessionId]);
        $this->forgetCreateClaims($workerSessionId);
    }

    private function forgetCreateClaims(string $workerSessionId): void
    {
        foreach ($this->createClaims as $key => $claim) {
            if (hash_equals($claim['session_id'], $workerSessionId)) {
                unset($this->createClaims[$key]);
            }
        }
    }

    /** @param array<string,mixed> $request @param array<string,mixed> $response @return array<string,mixed> */
    private function respond(string $method, array $request, mixed $response): mixed
    {
        $this->requests[] = ['method' => $method] + $request;
        if ($this->delayMilliseconds > 0) {
            usleep($this->delayMilliseconds * 1000);
        }
        if ($this->failure) {
            throw $this->failure;
        }
        if (is_callable($this->afterRequest)) {
            ($this->afterRequest)($method);
        }

        return $response;
    }

    /** @param array<string, mixed> $arguments */
    private function defaultToolResult(string $toolUseId, string $name, array $arguments): BrowserToolResult
    {
        $stateVersion = is_int($arguments['state_version'] ?? null) ? $arguments['state_version'] : 0;
        $content = [['type' => 'text', 'text' => 'Fake browser tool completed.']];
        $structured = match ($name) {
            'browser_navigate' => [
                'url' => (string) ($this->navigateResponse['url'] ?? $arguments['url'] ?? 'https://example.com'),
                'title' => (string) ($this->navigateResponse['title'] ?? 'Example page'),
                'state_version' => $stateVersion + 1,
            ],
            'browser_snapshot' => $this->fakeSnapshotStructured($stateVersion),
            'browser_read' => $this->fakeReadStructured($stateVersion, $arguments),
            'browser_take_screenshot' => $this->fakeScreenshotStructured($stateVersion),
            'browser_wait_for' => ['url' => 'https://example.com', 'title' => 'Example page', 'state_version' => $stateVersion + 1],
            'browser_click' => $this->fakeClickStructured($stateVersion, $arguments),
            default => ['code' => 'TALOS_BROWSER_UNSUPPORTED_TOOL', 'message' => 'Unsupported fake browser tool.'],
        };
        if (in_array($name, ['browser_take_screenshot', 'browser_click'], true)) {
            $bytes = $name === 'browser_click'
                ? self::pngBytes(1280, 800)
                : base64_decode((string) ($this->screenshotResponse['base64'] ?? base64_encode(self::pngBytes(1280, 800))), true);
            $content[] = ['type' => 'image', 'data' => base64_encode(is_string($bytes) ? $bytes : self::pngBytes(1280, 800)), 'mimeType' => 'image/png'];
        }
        if ($name === 'browser_click') {
            $screenshotBytes = base64_decode((string) ($content[1]['data'] ?? ''), true) ?: self::pngBytes(1280, 800);
            $snapshot = is_array($structured['snapshot'] ?? null) ? $structured['snapshot'] : [];
            $snapshotSource = [
                'snapshot_id' => $snapshot['snapshot_id'] ?? null,
                'format' => $snapshot['format'] ?? null,
                'text_digest' => $snapshot['text_digest'] ?? null,
                'nodes' => $snapshot['nodes'] ?? null,
            ];
            $sources = [
                ['kind' => 'screenshot', 'source' => $screenshotBytes],
                ['kind' => 'snapshot', 'source' => json_encode($snapshotSource, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)],
            ];
            $evidence = [];
            foreach ($sources as $source) {
                $hash = 'sha256:'.hash('sha256', $source['source']);
                $evidence[] = [
                    'artifact_id' => $source['kind'].'-'.substr($hash, 7),
                    'kind' => $source['kind'],
                    'sha256' => $hash,
                    'trusted_boundary' => 'untrusted_web_content',
                ];
            }
            $structured['evidence_ids'] = array_column($evidence, 'artifact_id');

            return BrowserToolResult::fromArray([
                'schema_version' => BrowserToolResult::SCHEMA_VERSION,
                'tool_use_id' => $toolUseId,
                'isError' => false,
                'content' => $content,
                'structuredContent' => $structured,
                'evidence' => $evidence,
            ], $toolUseId);
        }
        [$evidenceKind, $evidenceSource] = match ($name) {
            'browser_navigate' => ['navigation', $structured],
            'browser_snapshot', 'browser_read' => ['snapshot', $this->fakeSnapshotEvidenceSource()],
            'browser_take_screenshot' => ['screenshot', base64_decode((string) ($content[1]['data'] ?? ''), true) ?: self::pngBytes(1280, 800)],
            'browser_wait_for' => ['wait', $structured],
            default => [null, null],
        };
        $evidence = [];
        if (is_string($evidenceKind)) {
            $encodedSource = is_string($evidenceSource)
                ? $evidenceSource
                : json_encode($evidenceSource, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            $evidenceHash = 'sha256:'.hash('sha256', $encodedSource);
            $evidenceId = $evidenceKind.'-'.substr($evidenceHash, 7);
            $structured['evidence_ids'] = [$evidenceId];
            $evidence[] = ['artifact_id' => $evidenceId, 'kind' => $evidenceKind, 'sha256' => $evidenceHash, 'trusted_boundary' => 'untrusted_web_content'];
        }

        return BrowserToolResult::fromArray([
            'schema_version' => BrowserToolResult::SCHEMA_VERSION,
            'tool_use_id' => $toolUseId,
            'isError' => $name === 'unsupported',
            'content' => $content,
            'structuredContent' => $structured,
            'evidence' => $evidence,
        ], $toolUseId);
    }

    /** @return array<string, mixed> */
    private function fakeSnapshotStructured(int $stateVersion): array
    {
        $snapshot = $this->snapshotResponse ?? [
            'format' => 'accessibility_refs_v1',
            'textDigest' => hash('sha256', 'snapshot'),
            'nodes' => [['ref' => 'r1', 'role' => 'heading', 'name' => 'Example', 'visible' => true]],
            'url' => 'https://example.com',
            'title' => 'Example page',
        ];
        $this->latestToolSnapshot = [
            'snapshot_id' => (string) ($snapshot['snapshot_id'] ?? 'snap_fake'),
            'nodes' => is_array($snapshot['nodes'] ?? null) ? $snapshot['nodes'] : [],
            'url' => (string) ($snapshot['url'] ?? 'https://example.com'),
            'title' => (string) ($snapshot['title'] ?? 'Example page'),
            'text_digest' => (string) ($snapshot['text_digest'] ?? $snapshot['textDigest'] ?? ''),
        ];

        return [
            'url' => $this->latestToolSnapshot['url'],
            'title' => $this->latestToolSnapshot['title'],
            'state_version' => $stateVersion,
            'snapshot_id' => $this->latestToolSnapshot['snapshot_id'],
            'format' => 'accessibility_refs_v1',
            'text_digest' => $this->latestToolSnapshot['text_digest'],
            'nodes' => $this->latestToolSnapshot['nodes'],
        ];
    }

    /** @param array<string, mixed> $arguments @return array<string, mixed> */
    private function fakeReadStructured(int $stateVersion, array $arguments): array
    {
        $snapshot = $this->latestToolSnapshot ?? $this->fakeSnapshotStructured($stateVersion);
        $ref = is_string($arguments['ref'] ?? null) ? $arguments['ref'] : null;
        $query = is_string($arguments['query'] ?? null) ? mb_strtolower($arguments['query']) : null;
        $matches = array_values(array_filter($snapshot['nodes'], static function (mixed $node) use ($ref, $query): bool {
            if (! is_array($node)) {
                return false;
            }
            if ($ref !== null && ($node['ref'] ?? null) !== $ref) {
                return false;
            }

            return $query === null || str_contains(mb_strtolower((string) ($node['name'] ?? '')), $query);
        }));

        return [
            'url' => $snapshot['url'],
            'title' => $snapshot['title'],
            'state_version' => $stateVersion,
            'snapshot_id' => $snapshot['snapshot_id'],
            'matches' => array_slice($matches, 0, 20),
        ];
    }

    /** @return array<string, mixed> */
    private function fakeScreenshotStructured(int $stateVersion): array
    {
        $bytes = base64_decode((string) ($this->screenshotResponse['base64'] ?? base64_encode(self::pngBytes(1280, 800))), true);
        $bytes = is_string($bytes) ? $bytes : self::pngBytes(1280, 800);

        return [
            'url' => (string) ($this->screenshotResponse['url'] ?? 'https://example.com'),
            'title' => (string) ($this->screenshotResponse['title'] ?? 'Example page'),
            'state_version' => $stateVersion,
            'mime_type' => 'image/png',
            'width' => (int) ($this->screenshotResponse['width'] ?? 1280),
            'height' => (int) ($this->screenshotResponse['height'] ?? 800),
            'sha256' => 'sha256:'.hash('sha256', $bytes),
        ];
    }

    /** @param array<string, mixed> $arguments @return array<string, mixed> */
    private function fakeClickStructured(int $stateVersion, array $arguments): array
    {
        $source = $this->latestToolSnapshot ?? [
            'snapshot_id' => 'snap_fake',
            'nodes' => [['ref' => 'r1', 'role' => 'button', 'name' => 'Example action', 'visible' => true]],
            'url' => 'https://example.com',
            'title' => 'Example page',
            'text_digest' => 'Example action',
        ];
        $targetRef = is_string($arguments['target'] ?? null) ? $arguments['target'] : '';
        $target = collect($source['nodes'])->first(static fn (mixed $node): bool => is_array($node) && ($node['ref'] ?? null) === $targetRef);
        $target = is_array($target) ? $target : ['ref' => $targetRef, 'role' => 'button', 'name' => 'Example action'];
        $snapshot = [
            'snapshot_id' => 'snap_'.substr(hash('sha256', $targetRef.'|'.$stateVersion), 0, 24),
            'format' => 'accessibility_refs_v1',
            'text_digest' => 'Browser action completed',
            'nodes' => [['ref' => 'r1', 'role' => 'heading', 'name' => 'Browser action completed', 'visible' => true]],
        ];
        $snapshot['sha256'] = 'sha256:'.hash('sha256', json_encode($snapshot, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR));
        $bytes = self::pngBytes(1280, 800);
        $this->latestToolSnapshot = [
            'snapshot_id' => $snapshot['snapshot_id'],
            'nodes' => $snapshot['nodes'],
            'url' => (string) $source['url'],
            'title' => (string) $source['title'],
            'text_digest' => $snapshot['text_digest'],
        ];

        return [
            'url' => (string) $source['url'],
            'title' => (string) $source['title'],
            'state_version' => $stateVersion + 1,
            'target' => [
                'ref' => (string) ($target['ref'] ?? ''),
                'role' => (string) ($target['role'] ?? ''),
                'name' => (string) ($target['name'] ?? ''),
            ],
            'screenshot' => [
                'mime_type' => 'image/png',
                'width' => 1280,
                'height' => 800,
                'sha256' => 'sha256:'.hash('sha256', $bytes),
            ],
            'snapshot' => $snapshot,
        ];
    }

    /** @return array{snapshotId: string, format: string, nodes: array<mixed>, textDigest: string} */
    private function fakeSnapshotEvidenceSource(): array
    {
        $snapshot = $this->latestToolSnapshot ?? [
            'snapshot_id' => 'snap_fake',
            'nodes' => [],
            'text_digest' => '',
        ];

        return [
            'snapshotId' => (string) $snapshot['snapshot_id'],
            'format' => 'accessibility_refs_v1',
            'nodes' => is_array($snapshot['nodes']) ? $snapshot['nodes'] : [],
            'textDigest' => (string) $snapshot['text_digest'],
        ];
    }

    private static function pngBytes(int $width, int $height): string
    {
        static $cache = [];

        $key = $width.'x'.$height;
        if (isset($cache[$key])) {
            return $cache[$key];
        }
        if ($width < 1 || $height < 1) {
            throw new \InvalidArgumentException('Fake PNG dimensions must be positive.');
        }

        $chunk = static function (string $type, string $data): string {
            return pack('N', strlen($data)).$type.$data.hash('crc32b', $type.$data, true);
        };
        $scanline = "\x00".str_repeat("\x00", intdiv($width + 7, 8));
        $compressed = gzcompress(str_repeat($scanline, $height), 9);
        if (! is_string($compressed)) {
            throw new \RuntimeException('Fake PNG compression failed.');
        }

        return $cache[$key] = "\x89PNG\r\n\x1a\n"
            .$chunk('IHDR', pack('NNCCCCC', $width, $height, 1, 0, 0, 0, 0))
            .$chunk('IDAT', $compressed)
            .$chunk('IEND', '');
    }
}
