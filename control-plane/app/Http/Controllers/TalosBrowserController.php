<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserEvent;
use App\Models\TalosBrowserSession;
use App\Models\TalosSession;
use App\Models\User;
use App\Services\Talos\Browser\BrowserSessionClient;
use App\Services\Talos\Browser\BrowserWorkerException;
use App\Services\Talos\Browser\LegacyBrowserSnapshot;
use App\Services\Talos\Browser\TalosBoundedBase64Decoder;
use App\Services\Talos\Browser\TalosBrowserArtifactIntegrityException;
use App\Services\Talos\Browser\TalosBrowserArtifactReader;
use App\Services\Talos\Browser\TalosBrowserArtifactStore;
use App\Services\Talos\Browser\TalosBrowserEvidenceEnvironment;
use App\Services\Talos\Browser\TalosBrowserLegacyWriteGate;
use App\Services\Talos\Browser\TalosBrowserPolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Symfony\Component\HttpFoundation\HeaderUtils;

final class TalosBrowserController extends Controller
{
    public function __construct(
        private readonly BrowserSessionClient $client,
        private readonly TalosBrowserPolicy $policy,
        private readonly TalosBrowserArtifactStore $artifacts,
        private readonly TalosBrowserArtifactReader $artifactReader,
        private readonly TalosBrowserEvidenceEnvironment $evidenceEnvironment,
        private readonly TalosBrowserLegacyWriteGate $legacyWrites,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $payload = $this->validated($request, ['talos_session_id' => ['required', 'string', 'max:64']]);
        if ($payload instanceof JsonResponse) {
            return $payload;
        }
        $chatSession = $this->ownedChatSession($request, (string) $payload['talos_session_id']);
        if ($chatSession instanceof JsonResponse) {
            return $chatSession;
        }
        if ($request->header('X-Talos-Session-Id') !== $chatSession->id) {
            return $this->chatUnavailable();
        }

        return response()->json([
            'data' => TalosBrowserSession::query()
                ->where('user_id', $this->userId($request))
                ->where('talos_session_id', $chatSession->id)
                ->latest()
                ->get()
                ->map->toApiArray()
                ->values(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->legacyWrites->assertEnabled('browser.session.create');

        $payload = $this->validated($request, [
            'talos_session_id' => ['required', 'string', 'max:64'],
            'viewport.width' => ['nullable', 'integer', 'min:320', 'max:3840'],
            'viewport.height' => ['nullable', 'integer', 'min:240', 'max:2160'],
        ]);
        if ($payload instanceof JsonResponse) {
            return $payload;
        }
        $chatSession = $this->ownedChatSession($request, (string) $payload['talos_session_id']);
        if ($chatSession instanceof JsonResponse) {
            return $chatSession;
        }
        if ($request->header('X-Talos-Session-Id') !== $chatSession->id) {
            return $this->chatUnavailable();
        }
        $width = (int) data_get($payload, 'viewport.width', 1280);
        $height = (int) data_get($payload, 'viewport.height', 800);
        $userId = $this->userId($request);
        try {
            $worker = $this->client->create($this->ownerRef($userId), $width, $height);
        } catch (BrowserWorkerException $exception) {
            return $this->workerError($exception);
        }
        if (! $this->validWorkerSessionSummary($worker)) {
            $this->closeWorkerQuietly($userId, $worker);

            return $this->failure('Browser worker returned an invalid session contract.');
        }
        if (! $this->supportsInteractiveHmi($worker['capabilities'])) {
            $this->closeWorkerQuietly($userId, $worker);

            return response()->json([
                'code' => 'TALOS_BROWSER_HMI_UNAVAILABLE',
                'message' => 'Browser worker does not support interactive screenshot controls.',
                'details' => [],
            ], 503);
        }
        $session = TalosBrowserSession::query()->create(['user_id' => $userId, 'talos_session_id' => $chatSession->id, 'worker_session_id' => (string) $worker['sessionId'], 'status' => (string) ($worker['status'] ?? 'ready'), 'mode' => 'read_only', 'viewport_width' => $width, 'viewport_height' => $height, 'capabilities' => $worker['capabilities'] ?? [], 'policy' => [], 'worker_state_version' => is_int($worker['stateVersion'] ?? null) && $worker['stateVersion'] >= 0 ? $worker['stateVersion'] : 0, 'expires_at' => $worker['expiresAt'] ?? null, 'last_seen_at' => now()]);
        $this->event($session, 'session.created', 'system', payload: ['mode' => 'read_only']);

        return response()->json(['data' => $session->toApiArray()], 201);
    }

    public function show(Request $request, TalosBrowserSession $browserSession): JsonResponse
    {
        if (($error = $this->owned($request, $browserSession)) instanceof JsonResponse) {
            return $error;
        }
        if ($this->legacyWrites->enabled()
            && ($error = $this->reconcileForReuse($browserSession)) instanceof JsonResponse) {
            return $error;
        }

        return response()->json(['data' => $browserSession->toApiArray()]);
    }

    public function destroy(Request $request, TalosBrowserSession $browserSession): JsonResponse
    {
        $this->legacyWrites->assertEnabled('browser.session.close');

        if (($error = $this->owned($request, $browserSession)) instanceof JsonResponse) {
            return $error;
        }

        /** @var array{session: TalosBrowserSession|null, acquired: bool} $lease */
        $lease = DB::transaction(function () use ($browserSession): array {
            $current = TalosBrowserSession::query()
                ->whereKey($browserSession->id)
                ->where('user_id', $browserSession->user_id)
                ->lockForUpdate()
                ->first();
            if (! $current instanceof TalosBrowserSession) {
                return ['session' => null, 'acquired' => false];
            }
            if (in_array($current->status, ['closing', 'closed'], true)
                || ! in_array($current->status, ['ready', 'active', 'failed', 'expired', 'recovery_required'], true)) {
                return ['session' => $current, 'acquired' => false];
            }

            $sourceStatus = (string) $current->status;
            $sourceVersion = (int) $current->worker_state_version;
            $acquired = TalosBrowserSession::query()
                ->whereKey($current->id)
                ->where('status', $sourceStatus)
                ->where('worker_state_version', $sourceVersion)
                ->update(['status' => 'closing', 'last_seen_at' => now()]);

            return ['session' => $current->fresh(), 'acquired' => $acquired === 1];
        }, 3);
        $leased = $lease['session'];
        if (! $leased instanceof TalosBrowserSession) {
            return $this->notFound();
        }
        if ($leased->status === 'closed') {
            return response()->json(['data' => $leased->toApiArray()]);
        }
        if (! $lease['acquired'] || $leased->status !== 'closing') {
            return response()->json(['code' => 'TALOS_BROWSER_INVALID_STATE', 'message' => 'Browser session cannot be closed from its current state.', 'details' => ['status' => $leased->status]], 409);
        }

        try {
            $this->client->close($this->ownerRef((int) $leased->user_id), $leased->worker_session_id);
        } catch (BrowserWorkerException) { /* The durable session must still close when the transient worker cannot be reached. */
        }
        $closed = TalosBrowserSession::query()
            ->whereKey($leased->id)
            ->where('user_id', $leased->user_id)
            ->where('status', 'closing')
            ->where('worker_state_version', $leased->worker_state_version)
            ->update(['status' => 'closed', 'last_seen_at' => now()]);
        $browserSession->refresh();
        if ($closed !== 1 && $browserSession->status !== 'closed') {
            return response()->json(['code' => 'TALOS_BROWSER_INVALID_STATE', 'message' => 'Browser close lease was superseded.', 'details' => ['status' => $browserSession->status]], 409);
        }
        if ($closed === 1) {
            $this->event($browserSession, 'session.closed', 'system');
        }

        return response()->json(['data' => $browserSession->toApiArray()]);
    }

    public function navigate(Request $request, TalosBrowserSession $browserSession): JsonResponse
    {
        $this->legacyWrites->assertEnabled('browser.navigate');

        if (($error = $this->owned($request, $browserSession)) instanceof JsonResponse) {
            return $error;
        }
        if (($error = $this->operable($browserSession)) instanceof JsonResponse) {
            return $error;
        }
        $payload = $this->validated($request, ['url' => ['required', 'string', 'max:2048']]);
        if ($payload instanceof JsonResponse) {
            return $payload;
        }
        $url = (string) $payload['url'];
        $decision = $this->policy->inspect($url);
        $this->event($browserSession, 'navigation.requested', 'user', $browserSession->current_url, $url, policy: $decision);
        if (! $decision['allowed']) {
            $this->event($browserSession, 'policy.denied', 'policy', $browserSession->current_url, $url, policy: $decision);

            return response()->json(['code' => 'TALOS_BROWSER_POLICY_DENIED', 'message' => 'Browser navigation was blocked by policy.', 'details' => ['reason' => $decision['reason']]], 422);
        }
        $sourceStateVersion = (int) $browserSession->worker_state_version;
        try {
            $worker = $this->client->navigate($this->ownerRef((int) $browserSession->user_id), $browserSession->worker_session_id, $url);
        } catch (BrowserWorkerException $exception) {
            return $this->workerError($exception);
        }
        $finalUrl = is_string($worker['url'] ?? null) ? $worker['url'] : $url;
        $finalDecision = $this->policy->inspect($finalUrl);
        if (! $finalDecision['allowed']) {
            $this->event($browserSession, 'policy.denied', 'policy', $url, $finalUrl, policy: $finalDecision);

            return $this->policyDenied($finalDecision);
        }
        $stateVersion = is_int($worker['stateVersion'] ?? null) && $worker['stateVersion'] >= 0 ? $worker['stateVersion'] : null;
        $updates = ['status' => $worker['status'] ?? 'active', 'current_url' => $finalUrl, 'current_title' => $worker['title'] ?? null, 'policy' => $finalDecision, 'last_seen_at' => now()];
        if ($stateVersion !== null) {
            $updates['worker_state_version'] = $stateVersion;
            $updated = TalosBrowserSession::query()->whereKey($browserSession->id)->where('worker_state_version', $sourceStateVersion)->update($updates);
            if ($updated === 0) {
                return response()->json(['code' => 'TALOS_BROWSER_STALE_STATE', 'message' => 'Browser navigation was superseded by a newer browser state.', 'details' => []], 409);
            }
            $browserSession->refresh();
        } else {
            $browserSession->update($updates);
        }
        $this->event($browserSession, 'navigation.completed', 'worker', $url, $browserSession->current_url, ['title' => $browserSession->current_title], $finalDecision);

        return response()->json(['data' => $browserSession->fresh()->toApiArray()]);
    }

    public function screenshot(Request $request, TalosBrowserSession $browserSession): JsonResponse
    {
        $this->legacyWrites->assertEnabled('browser.screenshot');

        if (($error = $this->owned($request, $browserSession)) instanceof JsonResponse) {
            return $error;
        }
        if (($error = $this->operable($browserSession)) instanceof JsonResponse) {
            return $error;
        }
        try {
            $worker = $this->client->screenshot($this->ownerRef((int) $browserSession->user_id), $browserSession->worker_session_id);
        } catch (BrowserWorkerException $exception) {
            return $this->workerError($exception);
        }
        $bytes = TalosBoundedBase64Decoder::decode(
            $worker['base64'] ?? null,
            TalosBrowserArtifactStore::MAX_SCREENSHOT_BYTES,
        );
        $stateVersion = $worker['stateVersion'] ?? null;
        $width = $worker['width'] ?? null;
        $height = $worker['height'] ?? null;
        if (($worker['sessionId'] ?? null) !== $browserSession->worker_session_id
            || ! is_int($stateVersion)
            || $stateVersion !== (int) $browserSession->worker_state_version
            || ($worker['mime'] ?? null) !== 'image/png'
            || ! is_int($width)
            || ! is_int($height)
            || $width !== (int) $browserSession->viewport_width
            || $height !== (int) $browserSession->viewport_height
            || ! is_string($bytes)
            || $bytes === ''
            || ! is_string($worker['sha256'] ?? null)
            || ! hash_equals(hash('sha256', $bytes), $worker['sha256'])) {
            return $this->failure('Browser worker returned an invalid screenshot.');
        }
        $commandId = (string) str()->uuid();
        $artifact = $this->artifacts->store(
            $browserSession,
            'screenshot',
            'image/png',
            $bytes,
            [
                'width' => $width,
                'height' => $height,
                'state_version' => $stateVersion,
                'captured_at' => is_string($worker['capturedAt'] ?? null) ? mb_substr($worker['capturedAt'], 0, 64) : null,
            ],
            [
                'source_command_id' => $commandId,
                'source_state_version' => $stateVersion,
                'state_version' => $stateVersion,
                'trust_boundary' => 'untrusted_browser_content',
            ],
        );
        $updated = TalosBrowserSession::query()
            ->whereKey($browserSession->id)
            ->where('user_id', $browserSession->user_id)
            ->where('worker_state_version', $stateVersion)
            ->update(['last_screenshot_artifact_id' => $artifact->id, 'last_seen_at' => now()]);
        if ($updated !== 1) {
            $this->artifacts->discard($artifact);

            return response()->json(['code' => 'TALOS_BROWSER_STALE_STATE', 'message' => 'Browser screenshot was superseded by newer state.', 'details' => []], 409);
        }
        $browserSession->refresh();
        $this->event($browserSession, 'screenshot.captured', 'worker', payload: ['operation' => 'screenshot', 'command_id' => $commandId, 'artifact_id' => $artifact->id, 'artifact_ids' => [$artifact->id], 'state_version' => $stateVersion]);

        return response()->json(['data' => $artifact->toApiArray()], 201);
    }

    public function snapshot(Request $request, TalosBrowserSession $browserSession): JsonResponse
    {
        $this->legacyWrites->assertEnabled('browser.snapshot');

        if (($error = $this->owned($request, $browserSession)) instanceof JsonResponse) {
            return $error;
        }
        if (($error = $this->operable($browserSession)) instanceof JsonResponse) {
            return $error;
        }
        $sourceStateVersion = (int) $browserSession->worker_state_version;
        try {
            $worker = $this->client->snapshot($this->ownerRef((int) $browserSession->user_id), $browserSession->worker_session_id);
        } catch (BrowserWorkerException $exception) {
            return $this->workerError($exception);
        }
        try {
            $snapshot = LegacyBrowserSnapshot::fromWorker($worker);
        } catch (\InvalidArgumentException) {
            return $this->snapshotInvalid();
        }
        $content = json_encode($snapshot->toArray(), JSON_THROW_ON_ERROR);
        $metadata = ['format' => 'accessibility_refs_v1', 'text_digest' => $snapshot->textDigest, 'node_count' => count($snapshot->nodes), 'state_version' => $sourceStateVersion];
        $artifact = $this->artifacts->store($browserSession, 'snapshot', 'application/json', $content, $metadata);
        $updated = TalosBrowserSession::query()
            ->whereKey($browserSession->id)
            ->where('user_id', $browserSession->user_id)
            ->where('worker_state_version', $sourceStateVersion)
            ->update(['last_snapshot_artifact_id' => $artifact->id, 'last_seen_at' => now()]);
        if ($updated !== 1) {
            try {
                $this->artifacts->discard($artifact);
            } catch (\Throwable) {
                // Preserve the state conflict even when compensating cleanup fails.
            }

            return response()->json(['code' => 'TALOS_BROWSER_STALE_STATE', 'message' => 'Browser snapshot was superseded by newer state.', 'details' => []], 409);
        }
        $browserSession->refresh();
        $this->event($browserSession, 'snapshot.captured', 'worker', payload: ['artifact_id' => $artifact->id, 'text_digest' => $metadata['text_digest']]);

        return response()->json(['data' => $artifact->toApiArray()], 201);
    }

    public function events(Request $request, TalosBrowserSession $browserSession): JsonResponse
    {
        if (($error = $this->owned($request, $browserSession)) instanceof JsonResponse) {
            return $error;
        }

        return response()->json(['data' => $browserSession->events()->oldest()->get()->map->toApiArray()->values()]);
    }

    public function artifact(Request $request, TalosBrowserArtifact $browserArtifact): JsonResponse
    {
        if (($error = $this->ownedArtifact($request, $browserArtifact)) instanceof JsonResponse) {
            return $error;
        }

        return response()->json(['data' => $browserArtifact->toApiArray()]);
    }

    public function preview(Request $request, TalosBrowserArtifact $browserArtifact)
    {
        if (($error = $this->ownedArtifact($request, $browserArtifact)) instanceof JsonResponse) {
            return $error;
        }
        if ($browserArtifact->type === 'snapshot') {
            return $this->snapshotPreview($browserArtifact);
        }
        if ($browserArtifact->type !== 'screenshot') {
            return response()->json(['data' => ['preview_available' => false, 'artifact' => $browserArtifact->toApiArray()]]);
        }
        try {
            $contents = $this->artifactReader->readScreenshot($browserArtifact);
        } catch (TalosBrowserArtifactIntegrityException $exception) {
            if ($exception->reason === 'missing') {
                return $this->notFound();
            }

            return $this->artifactRecoveryRequired($browserArtifact, $exception);
        }

        $response = response($contents, 200, [
            'Content-Type' => 'image/png',
            'Cache-Control' => 'private, no-cache, must-revalidate',
            'Content-Disposition' => HeaderUtils::makeDisposition(
                HeaderUtils::DISPOSITION_INLINE,
                'talos-browser-'.$browserArtifact->id.'.png',
            ),
            'X-Content-Type-Options' => 'nosniff',
        ]);
        $response->setEtag('sha256-'.$browserArtifact->sha256);
        $response->isNotModified($request);

        return $response;
    }

    private function userId(Request $request): int
    {
        $user = $request->user();

        return $user instanceof User ? (int) $user->id : 0;
    }

    private function ownerRef(int $userId): string
    {
        return "talos-user:{$userId}";
    }

    private function ownedChatSession(Request $request, string $sessionId): TalosSession|JsonResponse
    {
        $session = TalosSession::query()
            ->where('user_id', $this->userId($request))
            ->find($sessionId);

        return $session instanceof TalosSession
            ? $session
            : $this->chatUnavailable();
    }

    private function owned(Request $request, TalosBrowserSession $session): ?JsonResponse
    {
        $talosSessionId = $this->requestedTalosSessionId($request);
        $ownedChatExists = $talosSessionId !== null
            && TalosSession::query()->where('user_id', $this->userId($request))->whereKey($talosSessionId)->exists();

        return (int) $session->user_id === $this->userId($request)
            && is_string($session->talos_session_id)
            && $session->talos_session_id === $talosSessionId
            && $ownedChatExists
                ? null
                : $this->notFound();
    }

    private function ownedArtifact(Request $request, TalosBrowserArtifact $artifact): ?JsonResponse
    {
        $session = $artifact->session;

        return (int) $artifact->user_id === $this->userId($request)
            && $session instanceof TalosBrowserSession
            && $this->owned($request, $session) === null
                ? null
                : $this->notFound();
    }

    private function requestedTalosSessionId(Request $request): ?string
    {
        $value = $request->header('X-Talos-Session-Id', $request->query('talos_session_id'));

        return is_string($value) && trim($value) !== '' ? trim($value) : null;
    }

    /** @param array<string,mixed> $payload @param array<string,mixed>|null $policy */
    private function event(TalosBrowserSession $session, string $type, string $actor, ?string $before = null, ?string $after = null, array $payload = [], ?array $policy = null): void
    {
        TalosBrowserEvent::query()->create(['browser_session_id' => $session->id, 'user_id' => $session->user_id, 'type' => $type, 'actor' => $actor, 'url_before' => $before, 'url_after' => $after, 'payload' => $payload, 'policy_decision' => $policy]);
    }

    private function workerError(BrowserWorkerException $exception): JsonResponse
    {
        return response()->json(['code' => $exception->errorCode, 'message' => $exception->getMessage(), 'details' => []], $exception->errorCode === 'TALOS_BROWSER_WORKER_UNAVAILABLE' ? 503 : 502);
    }

    private function failure(string $message): JsonResponse
    {
        return response()->json(['code' => 'TALOS_BROWSER_WORKER_FAILURE', 'message' => $message, 'details' => []], 502);
    }

    private function reconcileForReuse(TalosBrowserSession $session): ?JsonResponse
    {
        if (! in_array($session->status, ['ready', 'active', 'recovery_required'], true)) {
            return null;
        }

        try {
            $worker = $this->client->inspect(
                $this->ownerRef((int) $session->user_id),
                $session->worker_session_id,
            );
        } catch (BrowserWorkerException $exception) {
            if ($exception->errorCode === 'TALOS_BROWSER_SESSION_NOT_FOUND') {
                $this->invalidateForReuse($session, 'session.worker_lost', [
                    'reason' => 'worker_session_not_found',
                    'worker_code' => $exception->errorCode,
                ]);

                return null;
            }

            return $this->workerError($exception);
        }

        if (! $this->validWorkerSessionSummary($worker, $session->worker_session_id)) {
            return $this->failure('Browser worker returned an invalid session contract.');
        }

        $capabilities = $worker['capabilities'];
        if (! $this->supportsInteractiveHmi($capabilities)) {
            $this->invalidateForReuse($session, 'session.capability_contract_stale', [
                'reason' => 'interactive_hmi_unavailable',
            ], $capabilities);

            return null;
        }

        $sourceVersion = (int) $session->worker_state_version;
        $workerVersion = (int) $worker['stateVersion'];
        if ($workerVersion < $sourceVersion) {
            $this->invalidateForReuse($session, 'session.worker_state_regressed', [
                'stored_state_version' => $sourceVersion,
                'worker_state_version' => $workerVersion,
            ], $capabilities);

            return null;
        }

        $sourceStatus = (string) $session->status;
        $workerStatus = (string) $worker['status'];
        $expiresAt = Carbon::parse((string) $worker['expiresAt']);
        $targetStatus = $expiresAt->isPast()
            ? 'expired'
            : ($sourceStatus === 'recovery_required' || $workerVersion > $sourceVersion
                ? 'recovery_required'
                : $workerStatus);
        $updated = TalosBrowserSession::query()
            ->whereKey($session->id)
            ->where('user_id', $session->user_id)
            ->where('status', $sourceStatus)
            ->where('worker_state_version', $sourceVersion)
            ->update([
                'status' => $targetStatus,
                'capabilities' => $capabilities,
                'worker_state_version' => $workerVersion,
                'expires_at' => $expiresAt,
                'last_seen_at' => now(),
            ]);
        $session->refresh();
        if ($updated !== 1) {
            return response()->json([
                'code' => 'TALOS_BROWSER_STALE_STATE',
                'message' => 'Browser session reconciliation was superseded by newer state.',
                'details' => [],
            ], 409);
        }
        if ($workerVersion > $sourceVersion) {
            $this->event($session, 'session.state_diverged', 'system', payload: [
                'stored_state_version' => $sourceVersion,
                'worker_state_version' => $workerVersion,
            ]);
        }

        return null;
    }

    /** @param array<string, mixed> $payload @param array<string, mixed>|null $capabilities */
    private function invalidateForReuse(TalosBrowserSession $session, string $eventType, array $payload, ?array $capabilities = null): void
    {
        $updates = ['status' => 'failed', 'last_seen_at' => now()];
        if ($capabilities !== null) {
            $updates['capabilities'] = $capabilities;
        }
        $updated = TalosBrowserSession::query()
            ->whereKey($session->id)
            ->where('user_id', $session->user_id)
            ->whereIn('status', ['ready', 'active', 'recovery_required'])
            ->where('worker_state_version', $session->worker_state_version)
            ->update($updates);
        $session->refresh();
        if ($updated === 1) {
            $this->event($session, $eventType, 'system', payload: $payload);
        }
    }

    /** @param array<string, mixed> $worker */
    private function validWorkerSessionSummary(array $worker, ?string $expectedSessionId = null): bool
    {
        $sessionId = $worker['sessionId'] ?? null;
        $viewport = $worker['viewport'] ?? null;
        $capabilities = $worker['capabilities'] ?? null;
        $expiresAt = $worker['expiresAt'] ?? null;
        if (! is_string($sessionId) || $sessionId === '' || strlen($sessionId) > 128
            || ($expectedSessionId !== null && ! hash_equals($expectedSessionId, $sessionId))
            || ! in_array($worker['status'] ?? null, ['ready', 'active', 'recovery_required'], true)
            || ($worker['mode'] ?? null) !== 'read_only'
            || ! is_array($viewport) || array_is_list($viewport)
            || ! is_int($viewport['width'] ?? null) || $viewport['width'] < 320 || $viewport['width'] > 3840
            || ! is_int($viewport['height'] ?? null) || $viewport['height'] < 240 || $viewport['height'] > 2160
            || ! is_array($capabilities) || array_is_list($capabilities)
            || ! is_int($worker['stateVersion'] ?? null) || $worker['stateVersion'] < 0
            || ! is_string($expiresAt) || $expiresAt === '') {
            return false;
        }
        try {
            Carbon::parse($expiresAt);
        } catch (\Throwable) {
            return false;
        }
        foreach (['navigation', 'screenshots', 'accessibilitySnapshot', 'actions', 'downloads', 'uploads'] as $name) {
            if (! is_bool($capabilities[$name] ?? null)) {
                return false;
            }
        }
        if (array_key_exists('hmiActions', $capabilities) && ! is_bool($capabilities['hmiActions'])) {
            return false;
        }

        return $capabilities['actions'] === false
            && $capabilities['downloads'] === false
            && $capabilities['uploads'] === false;
    }

    /** @param array<string, mixed> $capabilities */
    private function supportsInteractiveHmi(array $capabilities): bool
    {
        return ($capabilities['navigation'] ?? false) === true
            && ($capabilities['screenshots'] ?? false) === true
            && ($capabilities['accessibilitySnapshot'] ?? false) === true
            && ($capabilities['hmiActions'] ?? false) === true
            && ($capabilities['actions'] ?? null) === false
            && ($capabilities['downloads'] ?? null) === false
            && ($capabilities['uploads'] ?? null) === false;
    }

    /** @param array<string, mixed> $worker */
    private function closeWorkerQuietly(int $userId, array $worker): void
    {
        $workerSessionId = $worker['sessionId'] ?? null;
        if (! is_string($workerSessionId) || $workerSessionId === '') {
            return;
        }
        try {
            $this->client->close($this->ownerRef($userId), $workerSessionId);
        } catch (BrowserWorkerException) {
            // A rejected worker contract must never become durable state.
        }
    }

    /** @param array<string, mixed> $rules @return array<string, mixed>|JsonResponse */
    private function validated(Request $request, array $rules): array|JsonResponse
    {
        $validator = Validator::make($request->all(), $rules);

        return $validator->fails() ? response()->json(['code' => 'TALOS_BROWSER_VALIDATION_FAILED', 'message' => 'Browser request validation failed.', 'details' => $validator->errors()->toArray()], 422) : $validator->validated();
    }

    private function operable(TalosBrowserSession $session): ?JsonResponse
    {
        return in_array($session->status, ['closing', 'closed', 'expired', 'failed', 'recovery_required'], true) ? response()->json(['code' => 'TALOS_BROWSER_INVALID_STATE', 'message' => 'Browser session is not active.', 'details' => ['status' => $session->status]], 409) : null;
    }

    /** @param array{allowed: bool, reason: string, host: string, resolved_ips: list<string>} $decision */
    private function policyDenied(array $decision): JsonResponse
    {
        return response()->json(['code' => 'TALOS_BROWSER_POLICY_DENIED', 'message' => 'Browser navigation was blocked by policy.', 'details' => ['reason' => $decision['reason']]], 422);
    }

    private function notFound(): JsonResponse
    {
        return response()->json(['code' => 'TALOS_BROWSER_NOT_FOUND', 'message' => 'Browser resource was not found.', 'details' => []], 404);
    }

    private function chatUnavailable(): JsonResponse
    {
        return response()->json(['code' => 'TALOS_BROWSER_CHAT_UNAVAILABLE', 'message' => 'The chat session for this browser session was not found.', 'details' => []], 404);
    }

    private function snapshotInvalid(): JsonResponse
    {
        return response()->json(['code' => 'TALOS_BROWSER_SNAPSHOT_INVALID', 'message' => 'Browser worker returned an invalid snapshot.', 'details' => []], 502);
    }

    private function artifactInvalid(): JsonResponse
    {
        return response()->json(['code' => 'TALOS_BROWSER_ARTIFACT_INVALID', 'message' => 'Browser snapshot artifact is missing or invalid.', 'details' => []], 502);
    }

    private function snapshotPreview(TalosBrowserArtifact $artifact): JsonResponse
    {
        if (! $this->evidenceEnvironment->rawEvidenceEnabled()) {
            return response()->json(['data' => [
                'preview_available' => false,
                'reason' => 'development_evidence_disabled',
                'artifact' => $artifact->toApiArray(),
            ]]);
        }
        try {
            $contents = $this->artifactReader->read($artifact);
        } catch (TalosBrowserArtifactIntegrityException $exception) {
            if ($exception->reason === 'missing') {
                return $this->artifactInvalid();
            }

            return $this->artifactRecoveryRequired($artifact, $exception);
        }
        try {
            $raw = json_decode($contents, true, 32, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return $this->artifactInvalid();
        }
        if (! is_array($raw) || ($raw['format'] ?? null) !== 'accessibility_refs_v1' || ! is_string($raw['url'] ?? null) || ! is_string($raw['title'] ?? null) || ! is_string($raw['textDigest'] ?? null) || ! is_array($raw['nodes'] ?? null)) {
            return $this->artifactInvalid();
        }
        $nodes = [];
        foreach (array_slice($raw['nodes'], 0, 200) as $node) {
            if (! is_array($node) || ! is_string($node['ref'] ?? null) || ! is_string($node['role'] ?? null) || ! is_string($node['name'] ?? null) || ! is_bool($node['visible'] ?? null)) {
                continue;
            }
            $safe = ['ref' => mb_substr($node['ref'], 0, 128), 'role' => mb_substr($node['role'], 0, 128), 'name' => mb_substr($node['name'], 0, 512), 'visible' => $node['visible']];
            if (isset($node['level']) && is_int($node['level']) && $node['level'] >= 1 && $node['level'] <= 6) {
                $safe['level'] = $node['level'];
            }
            $nodes[] = $safe;
        }

        return response()->json(['data' => ['preview_available' => true, 'snapshot' => ['untrusted' => true, 'format' => 'accessibility_refs_v1', 'url' => mb_substr($raw['url'], 0, 2048), 'title' => mb_substr($raw['title'], 0, 512), 'nodes' => $nodes, 'text_digest' => mb_substr($raw['textDigest'], 0, 128), 'truncated' => count($raw['nodes']) > 200]]]);
    }

    private function artifactRecoveryRequired(TalosBrowserArtifact $artifact, TalosBrowserArtifactIntegrityException $exception): JsonResponse
    {
        $status = $artifact->session?->fresh()?->status ?? 'recovery_required';

        return response()->json([
            'code' => 'TALOS_BROWSER_RECOVERY_REQUIRED',
            'message' => 'Browser artifact integrity verification failed; recovery is required.',
            'details' => [
                'artifact_id' => $exception->artifactId,
                'reason' => $exception->reason,
                'status' => $status,
            ],
        ], 409);
    }
}
