<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

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
    private ?array $latestToolSnapshot = null;

    public int $delayMilliseconds = 0;

    public int $screenshotStateVersion = 0;

    private int $nextSession = 1;

    /** @var array<string, array<string, mixed>> */
    private array $sessionState = [];

    /** @return list<array<string, mixed>> */
    public function toolDefinitions(string $ownerRef): array
    {
        return $this->respond('toolDefinitions', compact('ownerRef'), $this->toolDefinitionsResponse ?? []);
    }

    public function callTool(string $ownerRef, string $workerSessionId, string $toolUseId, string $name, array $arguments, int $timeoutMs = 15000): BrowserToolResult
    {
        $method = match ($name) {
            'browser_navigate' => 'navigate',
            'browser_snapshot' => 'snapshot',
            'browser_read' => 'read',
            'browser_take_screenshot' => 'screenshot',
            'browser_wait_for' => 'wait',
            'browser_click' => 'click',
            default => 'tool',
        };
        $request = compact('ownerRef', 'workerSessionId', 'toolUseId', 'name', 'arguments', 'timeoutMs');
        $request['transport_method'] = 'callTool';
        if ($name === 'browser_navigate' && is_string($arguments['url'] ?? null)) {
            $request['url'] = $arguments['url'];
        }

        return $this->respond($method, $request, $this->callToolResponse ?? $this->defaultToolResult($toolUseId, $name, $arguments));
    }

    public function create(string $ownerRef, int $width, int $height, int $timeoutMilliseconds = 15000, int $ttlSeconds = 3600): array
    {
        $response = $this->respond('create', compact('ownerRef', 'width', 'height', 'timeoutMilliseconds', 'ttlSeconds') + ['capabilities' => ['actions' => false, 'hmiActions' => true]], $this->createResponse ?? ['sessionId' => 'worker-'.$this->nextSession++, 'status' => 'ready', 'mode' => 'read_only', 'viewport' => ['width' => $width, 'height' => $height], 'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true, 'actions' => false, 'hmiActions' => true, 'downloads' => false, 'uploads' => false], 'stateVersion' => 0, 'expiresAt' => now()->addSeconds($ttlSeconds)->toJSON()]);
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
        $bytes = 'fake png bytes';
        $session = $this->sessionState[$workerSessionId] ?? [];
        $viewport = is_array($session['viewport'] ?? null) ? $session['viewport'] : [];

        return $this->respond('screenshot', compact('ownerRef', 'workerSessionId', 'timeoutMilliseconds'), $this->screenshotResponse ?? ['sessionId' => $workerSessionId, 'stateVersion' => is_int($session['stateVersion'] ?? null) ? $session['stateVersion'] : $this->screenshotStateVersion, 'mime' => 'image/png', 'width' => is_int($viewport['width'] ?? null) ? $viewport['width'] : 1280, 'height' => is_int($viewport['height'] ?? null) ? $viewport['height'] : 800, 'base64' => base64_encode($bytes), 'sha256' => hash('sha256', $bytes)]);
    }

    public function snapshot(string $ownerRef, string $workerSessionId, int $timeoutMilliseconds = 15000): array
    {
        return $this->respond('snapshot', compact('ownerRef', 'workerSessionId', 'timeoutMilliseconds'), $this->snapshotResponse ?? ['snapshotId' => 'snap_fake_legacy_1', 'format' => 'accessibility_refs_v1', 'textDigest' => hash('sha256', 'snapshot'), 'nodes' => [['ref' => 'r1', 'role' => 'heading', 'name' => 'Example', 'visible' => true]], 'url' => 'https://example.com', 'title' => 'Example page']);
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

        return $this->respond('preflightPointer', compact('ownerRef', 'workerSessionId', 'payload', 'timeoutMilliseconds'), $response);
    }

    public function executePointer(string $ownerRef, string $workerSessionId, array $payload, int $timeoutMilliseconds = 15000): array
    {
        $screenshotBytes = 'fake png bytes';
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
        $response['command_id'] = $payload['command_id'] ?? ($response['command_id'] ?? null);
        $response['interaction_id'] = $payload['interaction_id'] ?? ($response['interaction_id'] ?? null);
        $response['effect_classification'] = $payload['effect_classification'] ?? ($response['effect_classification'] ?? null);
        $response['sensitive_effect_authorized'] = $payload['sensitive_effect_authorized'] ?? ($response['sensitive_effect_authorized'] ?? null);
        if (is_array($response['target'] ?? null)) {
            $response['target']['effect_attestation'] = $response['effect_classification'] === 'sensitive'
                ? 'unattestable'
                : 'browser_default';
            $response['target']['required_effect_classification'] = $response['effect_classification'];
        }

        $result = $this->respond('executePointer', compact('ownerRef', 'workerSessionId', 'payload', 'timeoutMilliseconds'), $response);
        if (isset($this->sessionState[$workerSessionId]) && is_int($result['state_version'] ?? null)) {
            $this->sessionState[$workerSessionId]['stateVersion'] = $result['state_version'];
            $this->sessionState[$workerSessionId]['status'] = 'active';
        }

        return $result;
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
                ? 'fake png bytes after click'
                : base64_decode((string) ($this->screenshotResponse['base64'] ?? base64_encode('fake png bytes')), true);
            $content[] = ['type' => 'image', 'data' => base64_encode(is_string($bytes) ? $bytes : 'fake png bytes'), 'mimeType' => 'image/png'];
        }
        if ($name === 'browser_click') {
            $screenshotBytes = base64_decode((string) ($content[1]['data'] ?? ''), true) ?: 'fake png bytes after click';
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
            'browser_take_screenshot' => ['screenshot', base64_decode((string) ($content[1]['data'] ?? ''), true) ?: 'fake png bytes'],
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
        $bytes = base64_decode((string) ($this->screenshotResponse['base64'] ?? base64_encode('fake png bytes')), true);
        $bytes = is_string($bytes) ? $bytes : 'fake png bytes';

        return [
            'url' => 'https://example.com',
            'title' => 'Example page',
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
        $bytes = 'fake png bytes after click';
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
}
