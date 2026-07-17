<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use InvalidArgumentException;
use JsonException;
use stdClass;
use Throwable;

final class HttpBrowserSessionClient implements BrowserSessionClient
{
    public function __construct(
        private readonly string $baseUrl,
        private readonly string $token,
        private readonly int $timeoutSeconds = 15,
        private readonly ?TalosBrowserActionCapabilityIssuer $actionCapabilityIssuer = null,
    ) {}

    public function toolDefinitions(string $ownerRef): array
    {
        $data = $this->request('get', '/tools', $ownerRef, [], max(1, $this->timeoutSeconds * 1000));
        $definitions = $data['tools'] ?? null;
        if (! is_array($definitions) || ! array_is_list($definitions)) {
            throw new BrowserWorkerException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker returned an invalid tool definitions response.');
        }
        foreach ($definitions as $definition) {
            if (! is_array($definition)
                || array_is_list($definition)
                || ! is_string($definition['name'] ?? null)
                || trim($definition['name']) === ''
                || ! is_array($definition['inputSchema'] ?? null)
                || array_is_list($definition['inputSchema'])) {
                throw new BrowserWorkerException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker returned an invalid tool definitions response.');
            }
        }

        return $definitions;
    }

    public function handshake(string $ownerRef, int $timeoutMilliseconds = 5000): TalosBrowserWorkerHandshake
    {
        $response = $this->send('get', TalosBrowserWorkerProtocol::HANDSHAKE_PATH, $ownerRef, [], $timeoutMilliseconds);
        if ($response->status() === 204 || strlen($response->body()) > 64 * 1024) {
            throw new BrowserWorkerException('TALOS_BROWSER_WORKER_HANDSHAKE_INVALID', 'Browser worker returned an invalid handshake.');
        }
        if (! in_array($response->status(), [200, 503], true)) {
            $this->throwForFailure($response);
        }

        $handshake = TalosBrowserWorkerHandshake::fromJson($response->body());
        $transportReady = $response->status() === 200;
        if (($handshake->status === 'ready') !== $transportReady) {
            throw new BrowserWorkerException(
                'TALOS_BROWSER_WORKER_HANDSHAKE_INVALID',
                'Browser worker returned an invalid handshake.',
            );
        }

        return $handshake;
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
        $payload = [
            'tool_use_id' => $toolUseId,
            'name' => $name,
            'arguments' => $arguments === [] ? new stdClass : $arguments,
        ];
        $actionCapability = $this->actionCapabilityFor(
            $ownerRef,
            $workerSessionId,
            $name,
            is_int($arguments['state_version'] ?? null) ? $arguments['state_version'] : -1,
            $payload,
            $authorization,
        );
        try {
            return BrowserToolResult::fromJson(
                $this->requestRawData(
                    'post',
                    "/sessions/{$workerSessionId}/tools/call",
                    $ownerRef,
                    $payload,
                    $timeoutMs,
                    $actionCapability,
                ),
                $toolUseId,
            );
        } catch (InvalidArgumentException) {
            throw new BrowserWorkerException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker returned an invalid tool result.');
        }
    }

    public function stageFile(
        string $ownerRef,
        string $workerSessionId,
        string $stageId,
        array $file,
        int $timeoutMilliseconds = 15000,
    ): array {
        $expectedKeys = ['file_id', 'name', 'mime_type', 'size_bytes', 'sha256', 'base64'];
        $actualKeys = array_keys($file);
        sort($expectedKeys);
        sort($actualKeys);
        $bytes = is_string($file['base64'] ?? null) ? base64_decode($file['base64'], true) : false;
        $semanticName = is_string($file['name'] ?? null) ? trim($file['name']) : '';
        if (preg_match('/^stg_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/D', $stageId) !== 1
            || $actualKeys !== $expectedKeys
            || ! is_string($file['file_id'] ?? null)
            || ! Str::isUuid($file['file_id'])
            || ! is_string($file['name'] ?? null)
            || $semanticName === ''
            || strlen($file['name']) > 255
            || in_array($semanticName, ['.', '..'], true)
            || preg_match('/[\\\\\/\x00-\x1F\x7F]/', $file['name']) === 1
            || ! in_array($file['mime_type'] ?? null, ['text/plain', 'text/markdown', 'application/json', 'text/csv'], true)
            || ! is_int($file['size_bytes'] ?? null)
            || $file['size_bytes'] < 1
            || $file['size_bytes'] > 10 * 1024 * 1024
            || ! is_string($bytes)
            || strlen($bytes) !== $file['size_bytes']
            || ! is_string($file['sha256'] ?? null)
            || ! hash_equals($file['sha256'], 'sha256:'.hash('sha256', $bytes))) {
            throw new BrowserWorkerException('TALOS_BROWSER_STAGED_FILE_INVALID', 'Browser staged file input is invalid.');
        }

        $response = $this->request(
            'put',
            "/sessions/{$workerSessionId}/files/stage/{$stageId}",
            $ownerRef,
            $file,
            $timeoutMilliseconds,
        );
        $responseKeys = array_keys($response);
        $expectedResponseKeys = ['stage_id', 'file_id', 'name', 'mime_type', 'size_bytes', 'sha256', 'expires_at'];
        sort($responseKeys);
        sort($expectedResponseKeys);
        if ($responseKeys !== $expectedResponseKeys
            || ! is_string($response['stage_id'] ?? null)
            || ! hash_equals($stageId, $response['stage_id'])
            || ($response['file_id'] ?? null) !== $file['file_id']
            || ($response['name'] ?? null) !== $file['name']
            || ($response['mime_type'] ?? null) !== $file['mime_type']
            || ($response['size_bytes'] ?? null) !== $file['size_bytes']
            || ($response['sha256'] ?? null) !== $file['sha256']
            || ! is_string($response['expires_at'] ?? null)
            || strtotime($response['expires_at']) === false) {
            throw new BrowserWorkerException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker returned an invalid staged file response.');
        }

        return $response;
    }

    public function discardStagedFile(
        string $ownerRef,
        string $workerSessionId,
        string $stageId,
        int $timeoutMilliseconds = 15000,
    ): void {
        if (preg_match('/^stg_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/D', $stageId) !== 1) {
            throw new InvalidArgumentException('Browser staged file identity is invalid.');
        }
        $this->request(
            'delete',
            "/sessions/{$workerSessionId}/files/stage/{$stageId}",
            $ownerRef,
            [],
            $timeoutMilliseconds,
        );
    }

    public function create(string $ownerRef, int $width, int $height, int $timeoutMilliseconds = 15000, int $ttlSeconds = 3600): array
    {
        return $this->bootstrapSession(
            $ownerRef,
            $width,
            $height,
            TalosBrowserWorkerProtocol::SESSION_BOOTSTRAP_PATH,
            $timeoutMilliseconds,
            $ttlSeconds,
        );
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
            throw new InvalidArgumentException('Browser session idempotency key must be a UUID.');
        }

        return $this->bootstrapSession(
            $ownerRef,
            $width,
            $height,
            TalosBrowserWorkerProtocol::IDEMPOTENT_SESSION_BOOTSTRAP_PATH,
            $timeoutMilliseconds,
            $ttlSeconds,
            strtolower($idempotencyKey),
        );
    }

    private function bootstrapSession(
        string $ownerRef,
        int $width,
        int $height,
        string $path,
        int $timeoutMilliseconds,
        int $ttlSeconds,
        ?string $idempotencyKey = null,
    ): array {
        $handshake = $this->handshake($ownerRef, $timeoutMilliseconds);
        $handshake->assertUsable();
        $session = $this->request('post', $path, $ownerRef, ['ownerRef' => $ownerRef, 'mode' => 'read_only', 'viewport' => ['width' => $width, 'height' => $height], 'ttlSeconds' => $ttlSeconds, 'capabilities' => ['navigation' => $handshake->supports('navigate'), 'screenshots' => $handshake->supports('screenshot'), 'accessibilitySnapshot' => $handshake->supports('snapshot'), 'actions' => false, 'hmiActions' => $handshake->supports('interactive_frame') && $handshake->supports('click'), 'downloads' => false, 'uploads' => $handshake->supports('upload')]], $timeoutMilliseconds, $idempotencyKey);
        if (($session['protocols']['worker'] ?? null) !== TalosBrowserWorkerProtocol::WORKER
            || ($session['protocols']['hmi'] ?? null) !== TalosBrowserWorkerProtocol::HMI_RUNTIME) {
            throw new BrowserWorkerException(
                'TALOS_BROWSER_WORKER_PROTOCOL_MISMATCH',
                'Browser worker HMI protocol is incompatible with this TALOS control plane.',
            );
        }
        if (! is_string($session['workerInstanceId'] ?? null)
            || ! hash_equals($handshake->workerInstanceId, strtolower($session['workerInstanceId']))) {
            throw new BrowserWorkerException(
                'TALOS_BROWSER_WORKER_IDENTITY_MISMATCH',
                'Browser worker identity changed during session bootstrap.',
            );
        }

        return $session;
    }

    public function inspect(string $ownerRef, string $workerSessionId, int $timeoutMilliseconds = 15000): array
    {
        return $this->request('get', "/sessions/{$workerSessionId}", $ownerRef, [], $timeoutMilliseconds);
    }

    public function navigate(string $ownerRef, string $workerSessionId, string $url, int $timeoutMilliseconds = 15000): array
    {
        return $this->request('post', "/sessions/{$workerSessionId}/navigate", $ownerRef, ['url' => $url, 'timeoutMs' => $timeoutMilliseconds], $timeoutMilliseconds);
    }

    public function screenshot(string $ownerRef, string $workerSessionId, int $timeoutMilliseconds = 15000): array
    {
        return $this->request('post', "/sessions/{$workerSessionId}/screenshot", $ownerRef, [], $timeoutMilliseconds);
    }

    public function snapshot(string $ownerRef, string $workerSessionId, int $timeoutMilliseconds = 15000): array
    {
        return $this->request('post', "/sessions/{$workerSessionId}/snapshot", $ownerRef, [], $timeoutMilliseconds);
    }

    public function preflightPointer(string $ownerRef, string $workerSessionId, array $payload, int $timeoutMilliseconds = 15000): array
    {
        $this->validatePointerPayload($payload, false);

        return $this->requestHmi(
            'post',
            "/sessions/{$workerSessionId}/hmi/pointer/preflight",
            $ownerRef,
            $payload,
            $timeoutMilliseconds,
            'talos_browser_hmi_preflight_v2',
            (string) $payload['expected_frame_sha256'],
            (string) $payload['interaction_id'],
        );
    }

    public function executePointer(
        string $ownerRef,
        string $workerSessionId,
        array $payload,
        int $timeoutMilliseconds = 15000,
        ?BrowserActionAuthorization $authorization = null,
    ): array {
        $this->validatePointerPayload($payload, true);
        $actionCapability = $this->actionCapabilityFor(
            $ownerRef,
            $workerSessionId,
            'hmi_pointer_execute',
            (int) $payload['state_version'],
            $payload,
            $authorization,
        );

        return $this->requestHmi(
            'post',
            "/sessions/{$workerSessionId}/hmi/pointer/execute",
            $ownerRef,
            $payload,
            $timeoutMilliseconds,
            'talos_browser_hmi_result_v2',
            (string) $payload['expected_frame_sha256'],
            (string) $payload['interaction_id'],
            (string) $payload['expected_fingerprint'],
            (string) $payload['command_id'],
            (string) $payload['effect_classification'],
            (bool) $payload['sensitive_effect_authorized'],
            $actionCapability,
        );
    }

    public function close(string $ownerRef, string $workerSessionId, int $timeoutMilliseconds = 15000): void
    {
        $this->request('delete', "/sessions/{$workerSessionId}", $ownerRef, [], $timeoutMilliseconds);
    }

    public function cancel(
        string $ownerRef,
        string $workerSessionId,
        string $reason,
        int $timeoutMilliseconds = 15000,
    ): void {
        $reason = trim($reason);
        if ($reason === '' || mb_strlen($reason) > 512 || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', $reason) === 1) {
            throw new InvalidArgumentException('Browser cancellation reason is invalid.');
        }
        $this->request(
            'post',
            "/sessions/{$workerSessionId}".TalosBrowserWorkerProtocol::SESSION_CANCEL_SUFFIX,
            $ownerRef,
            ['reason' => $reason],
            $timeoutMilliseconds,
        );
    }

    /** @param array<string, mixed> $payload @return array<string, mixed> */
    private function request(
        string $method,
        string $path,
        string $ownerRef,
        array $payload = [],
        int $timeoutMilliseconds = 15000,
        ?string $idempotencyKey = null,
    ): array {
        $response = $this->send($method, $path, $ownerRef, $payload, $timeoutMilliseconds, idempotencyKey: $idempotencyKey);
        if ($response->status() === 204) {
            return [];
        }
        $this->throwForFailure($response);
        if (! is_array($response->json('data'))) {
            throw new BrowserWorkerException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker returned an invalid response.');
        }
        /** @var array<string, mixed> $data */ $data = $response->json('data');

        return $data;
    }

    /** @param array<string, mixed> $payload */
    private function requestRawData(
        string $method,
        string $path,
        string $ownerRef,
        array $payload,
        int $timeoutMilliseconds,
        ?string $actionCapability = null,
    ): string {
        $response = $this->send($method, $path, $ownerRef, $payload, $timeoutMilliseconds, $actionCapability);
        if ($response->status() === 204) {
            throw new BrowserWorkerException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker returned an invalid tool result.');
        }
        $this->throwForFailure($response);

        try {
            $root = json_decode($response->body(), false, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new BrowserWorkerException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker returned an invalid tool result.');
        }
        if (! $root instanceof stdClass) {
            throw new BrowserWorkerException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker returned an invalid tool result.');
        }

        return $response->body();
    }

    /** @param array<string, mixed> $payload @return array<string, mixed> */
    private function requestHmi(
        string $method,
        string $path,
        string $ownerRef,
        array $payload,
        int $timeoutMilliseconds,
        string $schemaVersion,
        string $expectedFrameSha256,
        string $expectedInteractionId,
        ?string $expectedFingerprint = null,
        ?string $expectedCommandId = null,
        ?string $expectedEffectClassification = null,
        ?bool $expectedSensitiveAuthorization = null,
        ?string $actionCapability = null,
    ): array {
        $response = $this->send($method, $path, $ownerRef, $payload, $timeoutMilliseconds, $actionCapability);
        if ($response->status() === 204 || strlen($response->body()) > 16 * 1024 * 1024) {
            throw new BrowserWorkerException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker returned an invalid HMI response.');
        }
        $this->throwForFailure($response);

        try {
            $root = json_decode($response->body(), false, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new BrowserWorkerException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker returned an invalid HMI response.');
        }
        if (! $root instanceof stdClass || ! $root->data instanceof stdClass) {
            throw new BrowserWorkerException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker returned an invalid HMI response.');
        }
        $data = $this->preserveWireValue($root->data);
        if (! is_array($data) || array_is_list($data) || ($data['schema_version'] ?? null) !== $schemaVersion) {
            throw new BrowserWorkerException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker returned an invalid HMI response.');
        }
        $this->validateHmiEnvelope(
            $data,
            $schemaVersion,
            $expectedFrameSha256,
            $expectedInteractionId,
            $expectedFingerprint,
            $expectedCommandId,
            $expectedEffectClassification,
            $expectedSensitiveAuthorization,
        );

        return $data;
    }

    /** @param array<string, mixed> $payload */
    private function validatePointerPayload(array $payload, bool $execute): void
    {
        $expectedKeys = [
            'schema_version', 'interaction_id', 'state_version', 'expected_frame_sha256',
            'normalized_x', 'normalized_y', 'button', 'click_count',
        ];
        if ($execute) {
            array_push(
                $expectedKeys,
                'command_id',
                'expected_fingerprint',
                'effect_classification',
                'sensitive_effect_authorized',
            );
        }
        $actualKeys = array_keys($payload);
        sort($actualKeys);
        sort($expectedKeys);

        if (array_is_list($payload)
            || $actualKeys !== $expectedKeys
            || ($payload['schema_version'] ?? null) !== 'talos_browser_hmi_pointer_v2'
            || ! is_string($payload['interaction_id'] ?? null)
            || ! Str::isUuid($payload['interaction_id'])
            || ! is_int($payload['state_version']) || $payload['state_version'] < 0
            || ! is_string($payload['expected_frame_sha256'] ?? null)
            || preg_match('/^sha256:[a-f0-9]{64}$/', $payload['expected_frame_sha256']) !== 1
            || (! is_int($payload['normalized_x']) && ! is_float($payload['normalized_x']))
            || (! is_int($payload['normalized_y']) && ! is_float($payload['normalized_y']))
            || ! is_finite((float) $payload['normalized_x']) || ! is_finite((float) $payload['normalized_y'])
            || $payload['normalized_x'] < 0 || $payload['normalized_x'] > 1
            || $payload['normalized_y'] < 0 || $payload['normalized_y'] > 1
            || ($payload['button'] ?? null) !== 'left'
            || ! in_array($payload['click_count'] ?? null, [1, 2], true)
            || ($execute && (
                ! is_string($payload['command_id'] ?? null)
                || preg_match('/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/', $payload['command_id']) !== 1
                || ! is_string($payload['expected_fingerprint'] ?? null)
                || preg_match('/^sha256:[a-f0-9]{64}$/', $payload['expected_fingerprint']) !== 1
                || ! in_array($payload['effect_classification'] ?? null, ['ordinary', 'sensitive'], true)
                || ! is_bool($payload['sensitive_effect_authorized'] ?? null)
                || (($payload['effect_classification'] ?? null) === 'sensitive' && $payload['sensitive_effect_authorized'] !== true)
                || (($payload['effect_classification'] ?? null) === 'ordinary' && $payload['sensitive_effect_authorized'] !== false)
            ))) {
            throw new BrowserWorkerException('TALOS_BROWSER_HMI_INVALID_POINTER', 'Browser worker rejected the HMI pointer contract.');
        }
    }

    /** @param array<string, mixed> $data */
    private function validateHmiEnvelope(
        array $data,
        string $schemaVersion,
        string $expectedFrameSha256,
        string $expectedInteractionId,
        ?string $expectedFingerprint,
        ?string $expectedCommandId,
        ?string $expectedEffectClassification,
        ?bool $expectedSensitiveAuthorization,
    ): void {
        foreach (['session_id', 'schema_version'] as $field) {
            if (! is_string($data[$field] ?? null) || trim($data[$field]) === '') {
                throw new BrowserWorkerException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker returned an invalid HMI response.');
            }
        }
        if (! is_string($data['interaction_id'] ?? null)
            || ! hash_equals($expectedInteractionId, $data['interaction_id'])
            || ! is_int($data['state_version'] ?? null)
            || $data['state_version'] < 0
            || ! is_string($data['frame_sha256'] ?? null)
            || ! hash_equals($expectedFrameSha256, $data['frame_sha256'])) {
            throw new BrowserWorkerException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker returned an invalid HMI response.');
        }
        if ($schemaVersion === 'talos_browser_hmi_preflight_v2') {
            $point = $data['point'] ?? null;
            $target = $data['target'] ?? null;
            if (! is_string($data['origin'] ?? null) || strlen($data['origin']) > 2048
                || ! is_array($point) || array_is_list($point)
                || (! is_int($point['normalized_x'] ?? null) && ! is_float($point['normalized_x'] ?? null))
                || (! is_int($point['normalized_y'] ?? null) && ! is_float($point['normalized_y'] ?? null))
                || ! is_finite((float) ($point['normalized_x'] ?? NAN)) || ! is_finite((float) ($point['normalized_y'] ?? NAN))
                || $point['normalized_x'] < 0 || $point['normalized_x'] > 1
                || $point['normalized_y'] < 0 || $point['normalized_y'] > 1
                || (! is_int($point['x'] ?? null) && ! is_float($point['x'] ?? null))
                || (! is_int($point['y'] ?? null) && ! is_float($point['y'] ?? null))
                || ! is_finite((float) ($point['x'] ?? NAN)) || (float) $point['x'] < 0
                || ! is_finite((float) ($point['y'] ?? NAN)) || (float) $point['y'] < 0
                || ! $this->validHmiTarget($target)) {
                throw new BrowserWorkerException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker returned an invalid HMI preflight response.');
            }

            return;
        }
        if (! is_int($data['source_state_version'] ?? null)
            || $data['source_state_version'] < 0
            || $data['state_version'] !== $data['source_state_version'] + 1
            || ! is_string($data['url'] ?? null) || strlen($data['url']) > 2048
            || ! is_string($data['title'] ?? null) || strlen($data['title']) > 512
            || ! is_string($data['captured_at'] ?? null) || strlen($data['captured_at']) > 64
            || ! is_string($data['command_id'] ?? null)
            || ! is_string($expectedCommandId)
            || ! hash_equals($expectedCommandId, $data['command_id'])
            || ($data['effect_classification'] ?? null) !== $expectedEffectClassification
            || ($data['sensitive_effect_authorized'] ?? null) !== $expectedSensitiveAuthorization
            || ! $this->validHmiTarget($data['target'] ?? null)
            || ! is_string($expectedFingerprint)
            || ! hash_equals($expectedFingerprint, (string) $data['target']['fingerprint'])
            || ! is_array($data['screenshot'] ?? null)
            || array_is_list($data['screenshot'])
            || ! is_array($data['snapshot'] ?? null)
            || array_is_list($data['snapshot'])
            || ! is_array($data['snapshot']['nodes'] ?? null)
            || ! array_is_list($data['snapshot']['nodes'])
            || ! is_string($data['capture_id'] ?? null)
            || strlen($data['capture_id']) > 128
            || ($data['screenshot']['mime_type'] ?? null) !== 'image/png'
            || ! is_int($data['screenshot']['width'] ?? null) || $data['screenshot']['width'] < 1 || $data['screenshot']['width'] > 3840
            || ! is_int($data['screenshot']['height'] ?? null) || $data['screenshot']['height'] < 1 || $data['screenshot']['height'] > 2160
            || ! is_string($data['screenshot']['sha256'] ?? null)
            || preg_match('/^sha256:[a-f0-9]{64}$/', $data['screenshot']['sha256']) !== 1
            || ($data['snapshot']['format'] ?? null) !== 'accessibility_refs_v1'
            || ! is_string($data['snapshot']['snapshot_id'] ?? null) || strlen($data['snapshot']['snapshot_id']) > 128
            || ! is_string($data['snapshot']['text_digest'] ?? null) || strlen($data['snapshot']['text_digest']) > 4000
            || ! is_string($data['snapshot']['sha256'] ?? null) || preg_match('/^sha256:[a-f0-9]{64}$/', $data['snapshot']['sha256']) !== 1
            || count($data['snapshot']['nodes']) > 500
            || ! is_string($data['screenshot']['base64'] ?? null)
            || strlen($data['screenshot']['base64']) > 12 * 1024 * 1024
            || ($screenshotBytes = base64_decode($data['screenshot']['base64'], true)) === false
            || ! hash_equals($data['screenshot']['sha256'], 'sha256:'.hash('sha256', $screenshotBytes))) {
            throw new BrowserWorkerException('TALOS_BROWSER_WORKER_FAILURE', 'Browser worker returned an invalid HMI result response.');
        }
    }

    private function validHmiTarget(mixed $target): bool
    {
        if (! is_array($target) || array_is_list($target)) {
            return false;
        }
        foreach (['tag', 'role', 'name', 'input_type', 'href', 'form_method', 'is_editable', 'is_submit', 'is_download', 'opens_new_context', 'effect_attestation', 'required_effect_classification', 'visible', 'disabled', 'fingerprint'] as $field) {
            if (! array_key_exists($field, $target)) {
                return false;
            }
        }
        foreach (['role', 'input_type', 'href', 'form_method'] as $nullableString) {
            if ($target[$nullableString] !== null && ! is_string($target[$nullableString])) {
                return false;
            }
        }
        foreach (['is_editable', 'is_submit', 'is_download', 'opens_new_context', 'visible', 'disabled'] as $boolean) {
            if (! is_bool($target[$boolean])) {
                return false;
            }
        }

        return is_string($target['tag']) && $target['tag'] !== '' && strlen($target['tag']) <= 64
            && is_string($target['name']) && strlen($target['name']) <= 256
            && ($target['role'] === null || strlen($target['role']) <= 64)
            && ($target['input_type'] === null || strlen($target['input_type']) <= 64)
            && ($target['href'] === null || strlen($target['href']) <= 2048)
            && ($target['form_method'] === null || strlen($target['form_method']) <= 16)
            && in_array($target['effect_attestation'], ['browser_default', 'unattestable'], true)
            && in_array($target['required_effect_classification'], ['ordinary', 'sensitive'], true)
            && $target['required_effect_classification'] === ($target['effect_attestation'] === 'browser_default' ? 'ordinary' : 'sensitive')
            && is_string($target['fingerprint'])
            && preg_match('/^sha256:[a-f0-9]{64}$/', $target['fingerprint']) === 1;
    }

    private function preserveWireValue(mixed $value): mixed
    {
        if ($value instanceof stdClass) {
            $properties = get_object_vars($value);
            if ($properties === []) {
                return new stdClass;
            }
            $result = [];
            foreach ($properties as $key => $item) {
                $result[$key] = $this->preserveWireValue($item);
            }

            return $result;
        }
        if (is_array($value)) {
            return array_map(fn (mixed $item): mixed => $this->preserveWireValue($item), $value);
        }

        return $value;
    }

    /** @param array<string, mixed> $payload */
    private function send(
        string $method,
        string $path,
        string $ownerRef,
        array $payload,
        int $timeoutMilliseconds,
        ?string $actionCapability = null,
        ?string $idempotencyKey = null,
    ): Response {
        if (trim($this->baseUrl) === '' || trim($this->token) === '') {
            throw new BrowserWorkerException('TALOS_BROWSER_WORKER_UNAVAILABLE', 'Browser worker is not configured.');
        }
        try {
            $timeoutSeconds = min(max(0.001, $this->timeoutSeconds), max(0.001, $timeoutMilliseconds / 1000));
            $headers = [
                'X-Talos-Worker-Token' => $this->token,
                'X-Talos-Owner-Ref' => $ownerRef,
            ];
            if (is_string($actionCapability)) {
                $headers['Authorization'] = 'Bearer '.$actionCapability;
            }
            if (is_string($idempotencyKey)) {
                $headers['Idempotency-Key'] = '"'.$idempotencyKey.'"';
            }

            $options = $payload === [] ? [] : ['json' => $payload];

            return Http::timeout($timeoutSeconds)
                ->connectTimeout($timeoutSeconds)
                ->acceptJson()
                ->withHeaders($headers)
                ->send($method, rtrim($this->baseUrl, '/').$path, $options);
        } catch (Throwable) {
            throw new BrowserWorkerException('TALOS_BROWSER_WORKER_UNAVAILABLE', 'Browser worker is unavailable.');
        }
    }

    /** @param array<string, mixed> $request */
    private function actionCapabilityFor(
        string $ownerRef,
        string $workerSessionId,
        string $operation,
        int $expectedStateVersion,
        array $request,
        ?BrowserActionAuthorization $authorization,
    ): ?string {
        $consequential = in_array($operation, ['browser_click', 'browser_file_upload', 'hmi_pointer_execute'], true);
        if (! $consequential) {
            if ($authorization instanceof BrowserActionAuthorization) {
                throw new BrowserWorkerException(
                    'TALOS_BROWSER_ACTION_CAPABILITY_INVALID',
                    'Browser action authorization was supplied for a read-only operation.',
                );
            }

            return null;
        }
        if (! $authorization instanceof BrowserActionAuthorization) {
            throw new BrowserWorkerException(
                'TALOS_BROWSER_ACTION_CAPABILITY_REQUIRED',
                'A signed browser action capability is required.',
            );
        }
        if (! $this->actionCapabilityIssuer instanceof TalosBrowserActionCapabilityIssuer) {
            throw new BrowserWorkerException(
                'TALOS_BROWSER_ACTION_CAPABILITY_CONFIGURATION_INVALID',
                'Browser action capability issuance is not configured.',
            );
        }

        return $this->actionCapabilityIssuer->issue(
            $ownerRef,
            $workerSessionId,
            $operation,
            $expectedStateVersion,
            $request,
            $authorization,
        );
    }

    private function throwForFailure(Response $response): void
    {
        if ($response->successful()) {
            return;
        }
        $body = $response->json();
        $code = is_array($body) && is_string($body['code'] ?? null)
            && preg_match('/^TALOS_BROWSER_[A-Z0-9_]{1,96}$/', $body['code']) === 1
                ? $body['code']
                : 'TALOS_BROWSER_WORKER_FAILURE';
        $message = is_array($body) && is_string($body['message'] ?? null)
            ? trim((string) preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $body['message']))
            : '';
        if ($code === 'TALOS_BROWSER_WORKER_FAILURE' || $message === '') {
            $message = 'Browser worker failed to complete the request.';
        }
        $details = [];
        $reasonCode = is_array($body)
            && $code === 'TALOS_BROWSER_HMI_RECOVERY_REQUIRED'
            && is_array($body['details'] ?? null)
            && is_string($body['details']['reason_code'] ?? null)
                ? $body['details']['reason_code']
                : null;
        if (is_string($reasonCode) && preg_match('/^[a-z][a-z0-9_]{0,95}$/D', $reasonCode) === 1) {
            $details['reason_code'] = $reasonCode;
        }

        throw new BrowserWorkerException($code, mb_substr($message, 0, 512), $details);
    }
}
