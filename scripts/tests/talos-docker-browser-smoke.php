<?php

declare(strict_types=1);

final class TalosSmokeFailure extends RuntimeException {}

final readonly class TalosSmokeResponse
{
    /** @param array<string, string> $headers */
    public function __construct(
        public int $status,
        public string $body,
        public string $contentType,
        public array $headers,
    ) {}

    /** @return array<string, mixed> */
    public function jsonObject(string $operation): array
    {
        try {
            $decoded = json_decode($this->body, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new TalosSmokeFailure("{$operation} returned invalid JSON.", previous: $exception);
        }
        if (! is_array($decoded) || array_is_list($decoded)) {
            throw new TalosSmokeFailure("{$operation} did not return a JSON object.");
        }

        return $decoded;
    }
}

final class TalosSmokeHttpClient
{
    private CurlHandle $curl;

    public function __construct(
        private readonly string $baseUrl,
        private readonly string $email,
        private readonly string $password,
    ) {
        $curl = curl_init();
        if (! $curl instanceof CurlHandle) {
            throw new TalosSmokeFailure('The PHP cURL client could not be initialized.');
        }
        $this->curl = $curl;
        curl_setopt_array($this->curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_COOKIEFILE => '',
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 45,
            CURLOPT_USERAGENT => 'talos-docker-browser-smoke/1',
        ]);
    }

    public function authenticate(): void
    {
        $login = $this->request('GET', '/login', null, ['Accept: text/html'], false);
        talosSmokeStatus($login, 200, 'GET /login');
        $csrfToken = $this->csrfToken();
        $response = $this->request(
            'POST',
            '/login',
            http_build_query([
                'email' => $this->email,
                'password' => $this->password,
                'redirect' => '/',
            ], '', '&', PHP_QUERY_RFC3986),
            [
                'Accept: text/html',
                'Content-Type: application/x-www-form-urlencoded',
                'X-XSRF-TOKEN: '.$csrfToken,
            ],
            false,
        );
        talosSmokeStatus($response, 302, 'POST /login');
        $location = $response->headers['location'] ?? '';
        if ($location === '' || str_contains($location, '/login')) {
            throw new TalosSmokeFailure('TALOS login did not create an authenticated session.');
        }

        $probe = $this->getJson('/api/talos/sessions');
        talosSmokeStatus($probe, 200, 'authenticated session probe');
        $probe->jsonObject('authenticated session probe');
        talosSmokeLog('Authenticated through the production TALOS login flow.');
    }

    public function getJson(string $path, ?string $talosSessionId = null): TalosSmokeResponse
    {
        return $this->request('GET', $path, null, $this->jsonHeaders($talosSessionId), false);
    }

    /** @param array<string, mixed> $payload */
    public function postJson(string $path, array $payload, ?string $talosSessionId = null): TalosSmokeResponse
    {
        return $this->request(
            'POST',
            $path,
            json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),
            [...$this->jsonHeaders($talosSessionId), 'X-XSRF-TOKEN: '.$this->csrfToken()],
            false,
        );
    }

    public function deleteJson(string $path, ?string $talosSessionId = null): TalosSmokeResponse
    {
        return $this->request(
            'DELETE',
            $path,
            '',
            [...$this->jsonHeaders($talosSessionId), 'X-XSRF-TOKEN: '.$this->csrfToken()],
            false,
        );
    }

    /** @return list<string> */
    private function jsonHeaders(?string $talosSessionId): array
    {
        $headers = ['Accept: application/json', 'Content-Type: application/json'];
        if ($talosSessionId !== null) {
            $headers[] = 'X-Talos-Session-Id: '.$talosSessionId;
        }

        return $headers;
    }

    private function csrfToken(): string
    {
        $cookies = curl_getinfo($this->curl, CURLINFO_COOKIELIST);
        if (is_array($cookies)) {
            foreach ($cookies as $cookie) {
                if (! is_string($cookie)) {
                    continue;
                }
                $fields = explode("\t", $cookie);
                if (count($fields) === 7 && $fields[5] === 'XSRF-TOKEN' && $fields[6] !== '') {
                    return rawurldecode($fields[6]);
                }
            }
        }

        throw new TalosSmokeFailure('TALOS did not issue the expected XSRF cookie.');
    }

    /** @param list<string> $headers */
    private function request(
        string $method,
        string $path,
        ?string $payload,
        array $headers,
        bool $followRedirects,
    ): TalosSmokeResponse {
        if (! str_starts_with($path, '/')) {
            throw new TalosSmokeFailure('Smoke request paths must be absolute.');
        }
        $responseHeaders = [];
        curl_setopt_array($this->curl, [
            CURLOPT_URL => rtrim($this->baseUrl, '/').$path,
            CURLOPT_FOLLOWLOCATION => $followRedirects,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_HEADERFUNCTION => static function (CurlHandle $_curl, string $line) use (&$responseHeaders): int {
                $separator = strpos($line, ':');
                if ($separator !== false) {
                    $name = strtolower(trim(substr($line, 0, $separator)));
                    $value = trim(substr($line, $separator + 1));
                    if ($name !== '') {
                        $responseHeaders[$name] = $value;
                    }
                }

                return strlen($line);
            },
            CURLOPT_NOBODY => false,
            CURLOPT_POST => false,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_CUSTOMREQUEST => $method,
        ]);
        $body = curl_exec($this->curl);
        if (! is_string($body)) {
            throw new TalosSmokeFailure('TALOS HTTP request failed: '.curl_error($this->curl));
        }
        $status = curl_getinfo($this->curl, CURLINFO_RESPONSE_CODE);
        $contentType = curl_getinfo($this->curl, CURLINFO_CONTENT_TYPE);
        if (! is_int($status)) {
            throw new TalosSmokeFailure('TALOS HTTP response did not include a status code.');
        }

        return new TalosSmokeResponse(
            $status,
            $body,
            is_string($contentType) ? $contentType : '',
            $responseHeaders,
        );
    }
}

/** @return array<string, mixed> */
function talosSmokeData(TalosSmokeResponse $response, int $status, string $operation): array
{
    talosSmokeStatus($response, $status, $operation);
    $root = $response->jsonObject($operation);
    $data = $root['data'] ?? null;
    if (! is_array($data) || array_is_list($data)) {
        throw new TalosSmokeFailure("{$operation} did not return a data object.");
    }

    return $data;
}

function talosSmokeStatus(TalosSmokeResponse $response, int $expected, string $operation): void
{
    if ($response->status !== $expected) {
        $code = '';
        try {
            $json = $response->jsonObject($operation);
            $code = is_string($json['code'] ?? null) ? ' code='.$json['code'] : '';
        } catch (Throwable) {
            // Status and operation are sufficient diagnostics for non-JSON responses.
        }
        throw new TalosSmokeFailure("{$operation} returned HTTP {$response->status}; expected {$expected}.{$code}");
    }
}

function talosSmokeString(mixed $value, string $field): string
{
    if (! is_string($value) || trim($value) === '') {
        throw new TalosSmokeFailure("{$field} must be a non-empty string.");
    }

    return $value;
}

function talosSmokeInt(mixed $value, string $field): int
{
    if (! is_int($value) || $value < 0) {
        throw new TalosSmokeFailure("{$field} must be a non-negative integer.");
    }

    return $value;
}

function talosSmokeSha256(mixed $value, string $field): string
{
    $hash = talosSmokeString($value, $field);
    if (preg_match('/^[a-f0-9]{64}$/', $hash) !== 1) {
        throw new TalosSmokeFailure("{$field} must be an unprefixed SHA-256 digest.");
    }

    return $hash;
}

function talosSmokePng(TalosSmokeResponse $response, string $expectedSha256, string $operation): void
{
    talosSmokeStatus($response, 200, $operation);
    if (! str_starts_with(strtolower($response->contentType), 'image/png')) {
        throw new TalosSmokeFailure("{$operation} did not return image/png.");
    }
    if (! str_starts_with($response->body, "\x89PNG\r\n\x1a\n")) {
        throw new TalosSmokeFailure("{$operation} did not return a usable PNG payload.");
    }
    if (! hash_equals($expectedSha256, hash('sha256', $response->body))) {
        throw new TalosSmokeFailure("{$operation} did not match the persisted artifact hash.");
    }
}

/** @param array<string, mixed> $state */
function talosSmokeStateString(array $state, string $field): string
{
    return talosSmokeString($state[$field] ?? null, "smoke state {$field}");
}

function talosSmokeLog(string $message): void
{
    fwrite(STDERR, "[talos-browser-smoke] {$message}\n");
}

/** @return array<string, mixed> */
function talosSmokeExercise(TalosSmokeHttpClient $client): array
{
    $chat = talosSmokeData($client->postJson('/api/talos/sessions', [
        'title' => 'Docker browser production smoke',
        'mode' => 'verified_execution',
        'persistence_mode' => 'persistent',
    ]), 201, 'create TALOS session');
    $chatSessionId = talosSmokeString($chat['id'] ?? null, 'chat session id');
    talosSmokeLog("Created authenticated TALOS session {$chatSessionId}.");

    $browserSessionId = null;
    $closed = false;
    try {
        $browser = talosSmokeData($client->postJson('/api/talos/browser/sessions', [
            'talos_session_id' => $chatSessionId,
            'viewport' => ['width' => 800, 'height' => 600],
        ], $chatSessionId), 201, 'create browser session');
        $browserSessionId = talosSmokeString($browser['id'] ?? null, 'browser session id');
        $capabilities = $browser['capabilities'] ?? null;
        if (! is_array($capabilities) || ! array_is_list($capabilities) || ! in_array('interact', $capabilities, true)) {
            throw new TalosSmokeFailure('The production browser session did not expose HMI capability.');
        }
        talosSmokeLog("Created browser session {$browserSessionId} with real worker HMI capability.");

        $browserPath = '/api/talos/browser/sessions/'.$browserSessionId;
        $navigated = talosSmokeData($client->postJson($browserPath.'/navigate', [
            'url' => 'https://example.com/',
        ], $chatSessionId), 200, 'navigate safe URL');
        if (! str_starts_with(talosSmokeString($navigated['current_url'] ?? null, 'navigated URL'), 'https://example.com')) {
            throw new TalosSmokeFailure('The worker did not remain on the allowlisted smoke origin after navigation.');
        }
        $stateVersion = talosSmokeInt($navigated['state_version'] ?? null, 'navigation state version');

        $frame = talosSmokeData($client->postJson($browserPath.'/screenshot', [], $chatSessionId), 201, 'capture initial screenshot');
        $frameId = talosSmokeString($frame['id'] ?? null, 'initial screenshot artifact id');
        $frameHash = talosSmokeSha256($frame['sha256'] ?? null, 'initial screenshot sha256');
        if (($frame['mime'] ?? null) !== 'image/png' || ($frame['type'] ?? null) !== 'screenshot') {
            throw new TalosSmokeFailure('The initial browser evidence is not a PNG screenshot artifact.');
        }
        if (talosSmokeInt($frame['state_version'] ?? null, 'initial screenshot state version') !== $stateVersion) {
            throw new TalosSmokeFailure('The initial screenshot is not bound to the navigated worker state.');
        }
        talosSmokePng(
            $client->getJson('/api/talos/browser/artifacts/'.$frameId.'/preview', $chatSessionId),
            $frameHash,
            'initial screenshot preview',
        );
        talosSmokeLog('Verified the initial screenshot bytes and persisted SHA-256.');

        $pointer = $client->postJson($browserPath.'/interactions/pointer', [
            'schema_version' => 'talos_browser_hmi_pointer_v1',
            'artifact_id' => $frameId,
            'artifact_sha256' => 'sha256:'.$frameHash,
            'state_version' => $stateVersion,
            'normalized_x' => 0.25,
            'normalized_y' => 0.345,
            'button' => 'left',
            'click_count' => 1,
        ], $chatSessionId);
        talosSmokeStatus($pointer, 428, 'HMI preflight and confirmation challenge');
        $challenge = $pointer->jsonObject('HMI confirmation challenge');
        if (($challenge['code'] ?? null) !== 'TALOS_BROWSER_HMI_CONFIRMATION_REQUIRED') {
            throw new TalosSmokeFailure('The HMI preflight did not return the production confirmation contract.');
        }
        $details = $challenge['details'] ?? null;
        if (! is_array($details) || array_is_list($details)) {
            throw new TalosSmokeFailure('The HMI confirmation challenge details are invalid.');
        }
        $approvalId = talosSmokeString($details['approval_id'] ?? null, 'HMI approval id');
        $requestHash = talosSmokeString($details['request_hash'] ?? null, 'HMI request hash');
        if (preg_match('/^sha256:[a-f0-9]{64}$/', $requestHash) !== 1) {
            throw new TalosSmokeFailure('The HMI request hash is invalid.');
        }
        talosSmokeLog("Received HMI confirmation challenge {$approvalId}.");

        $executed = talosSmokeData($client->postJson('/api/talos/browser/interactions/'.$approvalId.'/confirm', [
            'decision' => 'approve',
            'request_hash' => $requestHash,
        ], $chatSessionId), 201, 'confirm and execute HMI action');
        $interaction = $executed['interaction'] ?? null;
        if (! is_array($interaction) || ($interaction['status'] ?? null) !== 'executed') {
            throw new TalosSmokeFailure('The confirmed HMI interaction was not executed.');
        }
        $resultFrame = $executed['screenshot'] ?? null;
        $resultSnapshot = $executed['snapshot'] ?? null;
        if (! is_array($resultFrame) || array_is_list($resultFrame) || ! is_array($resultSnapshot) || array_is_list($resultSnapshot)) {
            throw new TalosSmokeFailure('The HMI result did not contain screenshot and snapshot evidence.');
        }
        $resultFrameId = talosSmokeString($resultFrame['id'] ?? null, 'HMI screenshot artifact id');
        $resultFrameHash = talosSmokeSha256($resultFrame['sha256'] ?? null, 'HMI screenshot sha256');
        $resultSnapshotId = talosSmokeString($resultSnapshot['id'] ?? null, 'HMI snapshot artifact id');
        if (($resultFrame['mime'] ?? null) !== 'image/png' || ($resultSnapshot['mime'] ?? null) !== 'application/json') {
            throw new TalosSmokeFailure('The HMI evidence MIME types are invalid.');
        }
        $resultStateVersion = talosSmokeInt($resultFrame['state_version'] ?? null, 'HMI screenshot state version');
        if ($resultStateVersion !== $stateVersion + 1) {
            throw new TalosSmokeFailure('The HMI result did not advance the durable worker state exactly once.');
        }
        talosSmokePng(
            $client->getJson('/api/talos/browser/artifacts/'.$resultFrameId.'/preview', $chatSessionId),
            $resultFrameHash,
            'HMI screenshot preview',
        );
        talosSmokeData(
            $client->getJson('/api/talos/browser/artifacts/'.$resultSnapshotId, $chatSessionId),
            200,
            'HMI snapshot artifact metadata',
        );

        $closedSession = talosSmokeData($client->deleteJson($browserPath, $chatSessionId), 200, 'close browser session');
        if (($closedSession['status'] ?? null) !== 'closed') {
            throw new TalosSmokeFailure('The browser session did not close deterministically.');
        }
        $closed = true;
        talosSmokeLog('Executed confirmed HMI action and closed the worker session.');

        return [
            'schema_version' => 'talos_docker_browser_smoke_v1',
            'chat_session_id' => $chatSessionId,
            'browser_session_id' => $browserSessionId,
            'initial_screenshot_id' => $frameId,
            'initial_screenshot_sha256' => $frameHash,
            'result_screenshot_id' => $resultFrameId,
            'result_screenshot_sha256' => $resultFrameHash,
            'result_snapshot_id' => $resultSnapshotId,
            'result_state_version' => $resultStateVersion,
        ];
    } finally {
        if (is_string($browserSessionId) && $browserSessionId !== '' && ! $closed) {
            try {
                $client->deleteJson('/api/talos/browser/sessions/'.$browserSessionId, $chatSessionId);
            } catch (Throwable $exception) {
                talosSmokeLog('Best-effort browser session cleanup failed: '.$exception->getMessage());
            }
        }
    }
}

/** @param array<string, mixed> $state */
function talosSmokeVerifyReload(TalosSmokeHttpClient $client, array $state): void
{
    if (($state['schema_version'] ?? null) !== 'talos_docker_browser_smoke_v1') {
        throw new TalosSmokeFailure('Reload verification received an invalid smoke state schema.');
    }
    $chatSessionId = talosSmokeStateString($state, 'chat_session_id');
    $browserSessionId = talosSmokeStateString($state, 'browser_session_id');
    $resultFrameId = talosSmokeStateString($state, 'result_screenshot_id');
    $resultFrameHash = talosSmokeSha256($state['result_screenshot_sha256'] ?? null, 'smoke state result screenshot sha256');
    $resultSnapshotId = talosSmokeStateString($state, 'result_snapshot_id');

    $chat = talosSmokeData($client->getJson('/api/talos/sessions/'.$chatSessionId), 200, 'reload TALOS session');
    if (($chat['id'] ?? null) !== $chatSessionId) {
        throw new TalosSmokeFailure('The persistent TALOS session did not survive Compose recreation.');
    }
    $browser = talosSmokeData(
        $client->getJson('/api/talos/browser/sessions/'.$browserSessionId, $chatSessionId),
        200,
        'reload browser session',
    );
    if (($browser['status'] ?? null) !== 'closed'
        || ($browser['last_screenshot_artifact_id'] ?? null) !== $resultFrameId
        || ($browser['last_snapshot_artifact_id'] ?? null) !== $resultSnapshotId) {
        throw new TalosSmokeFailure('The durable browser session did not reload its terminal state and evidence pointers.');
    }

    $frame = talosSmokeData(
        $client->getJson('/api/talos/browser/artifacts/'.$resultFrameId, $chatSessionId),
        200,
        'reload screenshot artifact metadata',
    );
    if (($frame['sha256'] ?? null) !== $resultFrameHash || ($frame['mime'] ?? null) !== 'image/png') {
        throw new TalosSmokeFailure('The reloaded screenshot metadata no longer matches its durable hash.');
    }
    talosSmokePng(
        $client->getJson('/api/talos/browser/artifacts/'.$resultFrameId.'/preview', $chatSessionId),
        $resultFrameHash,
        'reloaded screenshot preview',
    );
    $snapshot = talosSmokeData(
        $client->getJson('/api/talos/browser/artifacts/'.$resultSnapshotId, $chatSessionId),
        200,
        'reload snapshot artifact metadata',
    );
    if (($snapshot['mime'] ?? null) !== 'application/json' || ($snapshot['type'] ?? null) !== 'snapshot') {
        throw new TalosSmokeFailure('The reloaded snapshot artifact metadata is unusable.');
    }
    $snapshotPreview = talosSmokeData(
        $client->getJson('/api/talos/browser/artifacts/'.$resultSnapshotId.'/preview', $chatSessionId),
        200,
        'reload snapshot preview policy',
    );
    if (($snapshotPreview['preview_available'] ?? null) !== false
        || ($snapshotPreview['reason'] ?? null) !== 'development_evidence_disabled') {
        throw new TalosSmokeFailure('Production snapshot preview did not remain fail-closed after reload.');
    }

    $eventsResponse = $client->getJson('/api/talos/browser/sessions/'.$browserSessionId.'/events', $chatSessionId);
    talosSmokeStatus($eventsResponse, 200, 'reload browser event evidence');
    $eventsRoot = $eventsResponse->jsonObject('reload browser event evidence');
    $events = $eventsRoot['data'] ?? null;
    if (! is_array($events) || ! array_is_list($events)) {
        throw new TalosSmokeFailure('The reloaded browser event stream is invalid.');
    }
    $types = [];
    foreach ($events as $event) {
        if (is_array($event) && is_string($event['type'] ?? null)) {
            $types[] = $event['type'];
        }
    }
    foreach (['session.created', 'navigation.completed', 'screenshot.captured', 'hmi.confirmation.required', 'hmi.confirmation.confirmed', 'hmi.pointer.executed', 'hmi.evidence.persisted', 'session.closed'] as $requiredType) {
        if (! in_array($requiredType, $types, true)) {
            throw new TalosSmokeFailure("The durable event stream is missing {$requiredType}.");
        }
    }

    talosSmokeLog('Verified authenticated session, browser evidence, preview bytes, policy, and events after Compose recreation.');
}

try {
    $mode = getenv('TALOS_SMOKE_MODE');
    $baseUrl = getenv('TALOS_SMOKE_BASE_URL') ?: 'http://127.0.0.1:8088';
    $email = getenv('TALOS_ADMIN_EMAIL');
    $password = getenv('TALOS_ADMIN_PASSWORD');
    if (! is_string($email) || trim($email) === '' || ! is_string($password) || trim($password) === '') {
        throw new TalosSmokeFailure('TALOS_ADMIN_EMAIL and TALOS_ADMIN_PASSWORD are required for the authenticated smoke gate.');
    }

    $client = new TalosSmokeHttpClient($baseUrl, $email, $password);
    $client->authenticate();
    if ($mode === 'exercise') {
        echo json_encode(talosSmokeExercise($client), JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES).PHP_EOL;
    } elseif ($mode === 'verify-reload') {
        $encodedState = getenv('TALOS_SMOKE_STATE');
        if (! is_string($encodedState) || trim($encodedState) === '') {
            throw new TalosSmokeFailure('TALOS_SMOKE_STATE is required for verify-reload mode.');
        }
        $state = json_decode($encodedState, true, 32, JSON_THROW_ON_ERROR);
        if (! is_array($state) || array_is_list($state)) {
            throw new TalosSmokeFailure('TALOS_SMOKE_STATE must be a JSON object.');
        }
        talosSmokeVerifyReload($client, $state);
    } else {
        throw new TalosSmokeFailure('TALOS_SMOKE_MODE must be exercise or verify-reload.');
    }
} catch (Throwable $exception) {
    fwrite(STDERR, '[talos-browser-smoke] FAILED: '.$exception->getMessage().PHP_EOL);
    exit(1);
}
