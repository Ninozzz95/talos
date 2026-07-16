<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserEvent;
use App\Models\TalosBrowserHmiApproval;
use App\Models\TalosBrowserSession;
use App\Models\TalosSession;
use App\Models\TalosWorkspaceSetting;
use App\Models\User;
use App\Services\Talos\Browser\BrowserActionAuthorization;
use App\Services\Talos\Browser\BrowserSessionClient;
use App\Services\Talos\Browser\BrowserWorkerException;
use App\Services\Talos\Browser\TalosBrowserArtifactIntegrityException;
use App\Services\Talos\Browser\TalosBrowserArtifactReader;
use App\Services\Talos\Browser\TalosBrowserArtifactStore;
use App\Services\Talos\Browser\TalosBrowserHmiApprovalService;
use App\Services\Talos\Browser\TalosBrowserHmiPolicy;
use App\Services\Talos\Browser\TalosBrowserLegacyWriteGate;
use App\Services\Talos\Browser\TalosBrowserPolicy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use InvalidArgumentException;
use Throwable;

final class TalosBrowserHmiController extends Controller
{
    public function __construct(
        private readonly BrowserSessionClient $client,
        private readonly TalosBrowserHmiPolicy $hmiPolicy,
        private readonly TalosBrowserHmiApprovalService $approvals,
        private readonly TalosBrowserArtifactStore $artifacts,
        private readonly TalosBrowserArtifactReader $artifactReader,
        private readonly TalosBrowserPolicy $navigationPolicy,
        private readonly TalosBrowserLegacyWriteGate $legacyWrites,
    ) {}

    public function pointer(Request $request, TalosBrowserSession $browserSession): JsonResponse
    {
        $this->legacyWrites->assertEnabled('browser.hmi.pointer');

        if (($error = $this->owned($request, $browserSession)) instanceof JsonResponse) {
            return $error;
        }
        $input = $this->pointerInput($request);
        if ($input instanceof JsonResponse) {
            return $input;
        }
        $commandId = $this->commandId($browserSession, $input);
        $interactionId = $this->interactionId($input, $commandId);
        $input['interaction_id'] = $interactionId;
        if (($replay = $this->replayCommand($browserSession, $commandId)) instanceof JsonResponse) {
            return $replay;
        }
        if (($error = $this->operable($browserSession)) instanceof JsonResponse) {
            return $error;
        }
        $frame = $this->currentFrame($browserSession, $input, $commandId);
        if ($frame instanceof JsonResponse) {
            return $frame;
        }

        if (($audit = $this->auditedEventOnce($browserSession, 'hmi.pointer.requested', 'user', $commandId, [
            'command_id' => $commandId,
            'interaction_id' => $interactionId,
            'artifact_id' => $frame->id,
            'state_version' => $input['state_version'],
            'normalized_x' => $input['normalized_x'],
            'normalized_y' => $input['normalized_y'],
            'button' => $input['button'],
            'click_count' => $input['click_count'],
        ])) instanceof JsonResponse) {
            return $audit;
        }

        $modes = $this->policyModes((int) $browserSession->user_id);
        if ($modes['effective'] === TalosBrowserHmiPolicy::READ_ONLY) {
            $decision = [
                'decision' => 'deny',
                'category' => 'policy_denied',
                'consequence' => 'HMI interaction is disabled by read-only policy.',
                'mode' => $modes['effective'],
            ];
            if (($audit = $this->auditedEvent($browserSession, 'hmi.pointer.denied', 'policy', [
                'command_id' => $commandId,
                'interaction_id' => $interactionId,
            ], $decision)) instanceof JsonResponse) {
                return $audit;
            }

            return $this->error('TALOS_BROWSER_HMI_POLICY_DENIED', 'Browser interaction is disabled by policy.', 403, [
                'mode' => $modes['effective'],
            ]);
        }

        $pointer = $this->workerPointer($input, $commandId);
        try {
            $rawPreflight = $this->client->preflightPointer(
                $this->ownerRef((int) $browserSession->user_id),
                (string) $browserSession->worker_session_id,
                $pointer,
            );
        } catch (BrowserWorkerException $exception) {
            return $this->preflightFailure($browserSession, $commandId, $exception);
        }
        $preflight = $this->preflightResult($browserSession, $pointer, $rawPreflight);
        if ($preflight instanceof JsonResponse) {
            if (($audit = $this->auditedEvent($browserSession, 'hmi.pointer.stale', 'worker', [
                'command_id' => $commandId,
                'interaction_id' => $interactionId,
            ])) instanceof JsonResponse) {
                return $audit;
            }

            return $preflight;
        }
        $frame = $this->currentFrame($browserSession, $input, $commandId);
        if ($frame instanceof JsonResponse) {
            if (($audit = $this->auditedEvent($browserSession, 'hmi.pointer.stale', 'system', [
                'command_id' => $commandId,
                'interaction_id' => $interactionId,
            ])) instanceof JsonResponse) {
                return $audit;
            }

            return $frame;
        }
        if (($error = $this->operable($browserSession)) instanceof JsonResponse) {
            return $error;
        }

        $decision = $this->classify($preflight['target'], $modes);
        if ($decision['decision'] === 'deny') {
            if (($audit = $this->auditedEvent($browserSession, 'hmi.pointer.denied', 'policy', [
                'command_id' => $commandId,
                'interaction_id' => $interactionId,
                'target_fingerprint' => $preflight['target']['fingerprint'],
            ], $decision)) instanceof JsonResponse) {
                return $audit;
            }

            return $this->error('TALOS_BROWSER_HMI_POLICY_DENIED', 'Browser interaction was blocked by policy.', 403, [
                'category' => $decision['category'],
                'consequence' => $decision['consequence'],
            ]);
        }

        $executePayload = [
            ...$pointer,
            'command_id' => $commandId,
            'expected_fingerprint' => $preflight['target']['fingerprint'],
            'effect_classification' => $this->effectClassification($preflight['target'], $decision),
            'sensitive_effect_authorized' => false,
        ];
        if ($decision['decision'] === 'confirm') {
            return $this->challenge($browserSession, $frame, $preflight, $executePayload, $decision, $commandId);
        }

        return $this->executeOrdinary(
            $browserSession,
            $frame,
            $preflight,
            $executePayload,
            $decision,
            $commandId,
        );
    }

    public function confirm(Request $request, string $browserHmiApproval): JsonResponse
    {
        $this->legacyWrites->assertEnabled('browser.hmi.confirm');

        $validator = Validator::make($request->all(), [
            'decision' => ['required', 'string', 'in:approve,reject'],
            'request_hash' => ['required', 'string', 'regex:/^sha256:[a-f0-9]{64}$/'],
        ]);
        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }
        $input = $validator->validated();
        $approval = TalosBrowserHmiApproval::query()
            ->whereKey($browserHmiApproval)
            ->where('user_id', $this->userId($request))
            ->first();
        if (! $approval instanceof TalosBrowserHmiApproval) {
            return $this->notFound();
        }
        $browserSession = TalosBrowserSession::query()->find($approval->browser_session_id);
        if (! $browserSession instanceof TalosBrowserSession || ($error = $this->owned($request, $browserSession)) instanceof JsonResponse) {
            return $this->notFound();
        }
        if (! hash_equals((string) $approval->request_hash, (string) $input['request_hash'])) {
            return $this->approvalConflict($approval);
        }
        if ($approval->expires_at?->isPast()) {
            $this->approvals->expire((string) $approval->id, $this->userId($request));

            return $this->error('TALOS_BROWSER_HMI_APPROVAL_EXPIRED', 'Browser interaction approval expired.', 409);
        }
        if ($approval->status !== 'pending') {
            return $this->approvalConflict($approval);
        }
        $commandId = $this->approvalCommandId($browserSession, $approval);

        $binding = ['request_hash' => (string) $approval->request_hash];
        if ($input['decision'] === 'reject') {
            try {
                DB::transaction(function () use ($approval, $request, $binding, $browserSession, $commandId): void {
                    $this->approvals->reject((string) $approval->id, $this->userId($request), $binding);
                    $this->event($browserSession, 'hmi.confirmation.rejected', 'user', [
                        'command_id' => $commandId,
                        'interaction_id' => $approval->interaction_id,
                        'approval_id' => $approval->id,
                    ]);
                }, 3);
            } catch (InvalidArgumentException) {
                return $this->approvalConflict($approval->fresh());
            } catch (Throwable) {
                return $this->auditUnavailable();
            }

            return response()->json(['data' => [
                'interaction' => ['status' => 'rejected', 'approval_id' => $approval->id],
            ]]);
        }
        if (($error = $this->operable($browserSession)) instanceof JsonResponse) {
            if (($invalidation = $this->invalidateApproval($approval, $binding, $browserSession)) instanceof JsonResponse) {
                return $invalidation;
            }

            return $error;
        }

        $approvalInput = $this->approvalPointerInput($approval);
        $frame = $this->currentFrame($browserSession, $approvalInput, $commandId);
        if ($frame instanceof JsonResponse) {
            if (($invalidation = $this->invalidateApproval($approval, $binding, $browserSession)) instanceof JsonResponse) {
                return $invalidation;
            }
            if (($audit = $this->auditedEvent($browserSession, 'hmi.pointer.stale', 'system', [
                'command_id' => $commandId,
                'interaction_id' => $approval->interaction_id,
                'approval_id' => $approval->id,
            ])) instanceof JsonResponse) {
                return $audit;
            }

            return $frame;
        }
        $pointer = $this->workerPointer($approvalInput, $commandId);
        try {
            $rawPreflight = $this->client->preflightPointer(
                $this->ownerRef((int) $browserSession->user_id),
                (string) $browserSession->worker_session_id,
                $pointer,
            );
        } catch (BrowserWorkerException $exception) {
            return $this->preflightFailure($browserSession, $commandId, $exception);
        }
        $preflight = $this->preflightResult($browserSession, $pointer, $rawPreflight);
        if ($preflight instanceof JsonResponse) {
            if (($invalidation = $this->invalidateApproval($approval, $binding, $browserSession)) instanceof JsonResponse) {
                return $invalidation;
            }
            if (($audit = $this->auditedEvent($browserSession, 'hmi.pointer.stale', 'worker', [
                'command_id' => $commandId,
                'interaction_id' => $approval->interaction_id,
                'approval_id' => $approval->id,
            ])) instanceof JsonResponse) {
                return $audit;
            }

            return $preflight;
        }
        if (! hash_equals((string) $approval->target_fingerprint, (string) ($preflight['target']['fingerprint'] ?? ''))) {
            if (($invalidation = $this->invalidateApproval($approval, $binding, $browserSession)) instanceof JsonResponse) {
                return $invalidation;
            }
            if (($audit = $this->auditedEvent($browserSession, 'hmi.pointer.stale', 'worker', [
                'command_id' => $commandId,
                'interaction_id' => $approval->interaction_id,
                'approval_id' => $approval->id,
            ])) instanceof JsonResponse) {
                return $audit;
            }

            return $this->error('TALOS_BROWSER_TARGET_STALE', 'Browser target changed before confirmation.', 409);
        }

        $modes = $this->policyModes((int) $browserSession->user_id);
        $decision = $this->classify($preflight['target'], $modes);
        if ($decision['decision'] === 'deny' || $decision['category'] !== $approval->category) {
            if (($invalidation = $this->invalidateApproval($approval, $binding, $browserSession)) instanceof JsonResponse) {
                return $invalidation;
            }
            if (($audit = $this->auditedEvent($browserSession, 'hmi.pointer.denied', 'policy', [
                'command_id' => $commandId,
                'interaction_id' => $approval->interaction_id,
                'approval_id' => $approval->id,
            ], $decision)) instanceof JsonResponse) {
                return $audit;
            }

            return $this->error('TALOS_BROWSER_HMI_POLICY_DENIED', 'Browser interaction is no longer permitted by policy.', 403);
        }

        $frame = $this->currentFrame($browserSession, $approvalInput, $commandId);
        if ($frame instanceof JsonResponse) {
            if (($invalidation = $this->invalidateApproval($approval, $binding, $browserSession)) instanceof JsonResponse) {
                return $invalidation;
            }

            return $frame;
        }
        if (($error = $this->operable($browserSession)) instanceof JsonResponse) {
            if (($invalidation = $this->invalidateApproval($approval, $binding, $browserSession)) instanceof JsonResponse) {
                return $invalidation;
            }

            return $error;
        }

        $executionLeaseToken = null;
        try {
            $executionPayload = [
                ...$pointer,
                'command_id' => $commandId,
                'expected_fingerprint' => (string) $approval->target_fingerprint,
                'effect_classification' => $this->effectClassification($preflight['target'], $decision),
                'sensitive_effect_authorized' => $this->effectClassification($preflight['target'], $decision) === 'sensitive',
            ];
            DB::transaction(function () use ($approval, $request, $binding, $browserSession, $decision, $commandId, $executionPayload, &$executionLeaseToken): void {
                $this->approvals->approve((string) $approval->id, $this->userId($request), $binding);
                $this->event($browserSession, 'hmi.confirmation.confirmed', 'user', [
                    'command_id' => $commandId,
                    'interaction_id' => $approval->interaction_id,
                    'approval_id' => $approval->id,
                    'target_fingerprint' => $approval->target_fingerprint,
                ], $decision);
                $executionLeaseToken = $this->approvals->claimForExecution(
                    (string) $approval->id,
                    $this->userId($request),
                    $binding,
                    $executionPayload,
                );
                if (! is_string($executionLeaseToken)) {
                    throw new InvalidArgumentException('HMI approval could not be claimed for execution.');
                }
            }, 3);
        } catch (InvalidArgumentException) {
            return $this->approvalConflict($approval->fresh());
        } catch (Throwable) {
            return $this->error(
                'TALOS_BROWSER_HMI_CONFIRMATION_COMMIT_FAILED',
                'Browser confirmation could not be committed; no interaction was dispatched.',
                503,
            );
        }

        return $this->execute(
            $browserSession,
            $executionPayload,
            $preflight['target'],
            $commandId,
            (string) $approval->id,
            null,
            (string) $approval->request_hash,
            $executionLeaseToken,
        );
    }

    /**
     * @param  array<string, mixed>  $preflight
     * @param  array<string, mixed>  $payload
     * @param  array<string, mixed>  $decision
     */
    private function executeOrdinary(
        TalosBrowserSession $session,
        TalosBrowserArtifact $frame,
        array $preflight,
        array $payload,
        array $decision,
        string $commandId,
    ): JsonResponse {
        try {
            $record = $this->approvals->issue($this->approvalAttributes(
                $session,
                $frame,
                $preflight,
                $payload,
                $decision,
            ));
        } catch (InvalidArgumentException) {
            return $this->error(
                'TALOS_BROWSER_HMI_COMMAND_CONFLICT',
                'This browser interaction id is already bound to a different command.',
                409,
            );
        } catch (Throwable) {
            return $this->error(
                'TALOS_BROWSER_HMI_LEDGER_UNAVAILABLE',
                'The browser interaction ledger is unavailable; no action was dispatched.',
                503,
            );
        }
        if ($record->status === 'consumed') {
            return $this->replayApproval($session, $record, $commandId);
        }
        if ($record->status === 'executing') {
            return $this->replayCommand($session, $commandId) ?? $this->commandInProgress($record);
        }
        if ($record->status !== 'pending') {
            return $this->approvalConflict($record);
        }

        $binding = ['request_hash' => (string) $record->request_hash];
        $executionLeaseToken = null;
        try {
            DB::transaction(function () use ($record, $session, $binding, $preflight, $decision, $commandId, $payload, &$executionLeaseToken): void {
                $this->approvals->approve((string) $record->id, (int) $session->user_id, $binding);
                $this->event($session, 'hmi.pointer.allowed', 'policy', [
                    'command_id' => $commandId,
                    'interaction_id' => $record->interaction_id,
                    'target_fingerprint' => $preflight['target']['fingerprint'],
                ], $decision);
                $executionLeaseToken = $this->approvals->claimForExecution(
                    (string) $record->id,
                    (int) $session->user_id,
                    $binding,
                    $payload,
                );
                if (! is_string($executionLeaseToken)) {
                    throw new InvalidArgumentException('HMI command could not be claimed for execution.');
                }
            }, 3);
        } catch (InvalidArgumentException) {
            return $this->replayCommand($session, $commandId) ?? $this->approvalConflict($record->fresh());
        } catch (Throwable) {
            return $this->error(
                'TALOS_BROWSER_HMI_COMMAND_COMMIT_FAILED',
                'The browser interaction could not be committed; no action was dispatched.',
                503,
            );
        }

        return $this->execute(
            $session,
            $payload,
            $preflight['target'],
            $commandId,
            (string) $record->id,
            null,
            (string) $record->request_hash,
            $executionLeaseToken,
        );
    }

    /**
     * @param  array<string, mixed>  $payload
     * @param  array<string, mixed>  $target
     */
    private function execute(
        TalosBrowserSession $session,
        array $payload,
        array $target,
        string $commandId,
        ?string $approvalId = null,
        ?array $frameInput = null,
        ?string $approvalRequestHash = null,
        ?string $executionLeaseToken = null,
    ): JsonResponse {
        if (is_array($frameInput)) {
            $frame = $this->currentFrame($session, $frameInput, $commandId);
            if ($frame instanceof JsonResponse) {
                return $frame;
            }
            if (($error = $this->operable($session)) instanceof JsonResponse) {
                return $error;
            }
        }
        try {
            if (! is_string($approvalId)
                || ! is_string($approvalRequestHash)
                || ! is_string($executionLeaseToken)) {
                throw new BrowserWorkerException(
                    'TALOS_BROWSER_ACTION_CAPABILITY_REQUIRED',
                    'A signed browser action capability is required.',
                );
            }
            $result = $this->client->executePointer(
                $this->ownerRef((int) $session->user_id),
                (string) $session->worker_session_id,
                $payload,
                authorization: BrowserActionAuthorization::userApproval(
                    $commandId,
                    $approvalId,
                    $approvalRequestHash,
                    $executionLeaseToken,
                ),
            );
        } catch (BrowserWorkerException $exception) {
            if ($approvalId !== null && $this->isProvenPreDispatchFailure($exception->errorCode)) {
                try {
                    $released = ($payload['effect_classification'] ?? null) === 'ordinary'
                        ? $this->approvals->releaseOrdinaryPreDispatchFailure(
                            $approvalId,
                            (int) $session->user_id,
                            $commandId,
                            (string) $executionLeaseToken,
                        )
                        : $this->approvals->abortExecution(
                            $approvalId,
                            (int) $session->user_id,
                            $commandId,
                            (string) $executionLeaseToken,
                        );
                    if (! $released) {
                        return $this->executionLeaseLost($approvalId);
                    }
                } catch (Throwable) {
                    return $this->executionLeaseLost($approvalId);
                }
            }
            if (in_array($exception->errorCode, [
                'TALOS_BROWSER_FRAME_STALE',
                'TALOS_BROWSER_STALE_STATE',
                'TALOS_BROWSER_TARGET_STALE',
                'TALOS_BROWSER_HMI_TARGET_MISSING',
            ], true)) {
                if (($audit = $this->auditedEvent($session, 'hmi.pointer.stale', 'worker', [
                    'command_id' => $commandId,
                    'interaction_id' => $payload['interaction_id'] ?? null,
                    'approval_id' => $approvalId,
                    'code' => $exception->errorCode,
                ])) instanceof JsonResponse) {
                    return $audit;
                }

                return $this->error($exception->errorCode, $exception->getMessage(), 409);
            }
            if ($exception->errorCode === 'TALOS_BROWSER_HMI_TARGET_BOUNDS') {
                return $this->error($exception->errorCode, $exception->getMessage(), 413);
            }
            if ($exception->errorCode === 'TALOS_BROWSER_HMI_CONTEXT_INVALID') {
                return $this->error($exception->errorCode, $exception->getMessage(), 409);
            }
            if (in_array($exception->errorCode, [
                'TALOS_BROWSER_HMI_CAPABILITY_DENIED',
                'TALOS_BROWSER_HMI_DOWNLOAD_DENIED',
                'TALOS_BROWSER_HMI_NEW_CONTEXT_DENIED',
                'TALOS_BROWSER_HMI_SINGLE_PAGE_INVARIANT',
                'TALOS_BROWSER_HMI_TARGET_DENIED',
                'TALOS_BROWSER_HMI_UPLOAD_DENIED',
            ], true)) {
                return $this->error($exception->errorCode, $exception->getMessage(), 403);
            }
            if ($exception->errorCode === 'TALOS_BROWSER_HMI_INVALID_POINTER') {
                return $this->error($exception->errorCode, $exception->getMessage(), 422);
            }

            $reason = $exception->errorCode;
            $workerReason = $exception->details['reason_code'] ?? null;
            if ($exception->errorCode === 'TALOS_BROWSER_HMI_RECOVERY_REQUIRED'
                && is_string($workerReason)
                && preg_match('/^[a-z][a-z0-9_]{0,95}$/D', $workerReason) === 1) {
                $reason = $workerReason;
            }

            return $this->recoveryRequired($session, $commandId, $approvalId, $reason, $executionLeaseToken);
        } catch (Throwable) {
            return $this->recoveryRequired($session, $commandId, $approvalId, 'TALOS_BROWSER_EXECUTION_OUTCOME_UNKNOWN', $executionLeaseToken);
        }

        if (! $this->validExecuteResult($result, $payload, $session)) {
            return $this->recoveryRequired($session, $commandId, $approvalId, 'TALOS_BROWSER_EVIDENCE_BINDING_INVALID', $executionLeaseToken);
        }

        $finalUrl = is_string($result['url'] ?? null) ? $result['url'] : '';
        $finalDecision = $this->navigationPolicy->inspect($finalUrl);
        if (! $finalDecision['allowed']) {
            return $this->recoveryRequired($session, $commandId, $approvalId, 'TALOS_BROWSER_FINAL_URL_DENIED', $executionLeaseToken);
        }

        if (! is_string($approvalId)
            || ! is_string($executionLeaseToken)
            || ! $this->approvals->renewExecutionLease(
                $approvalId,
                (int) $session->user_id,
                $commandId,
                $executionLeaseToken,
            )) {
            return $this->executionLeaseLost($approvalId);
        }

        try {
            $stored = $this->artifacts->storeHmiCapture(
                $session,
                $commandId,
                $result,
                $approvalId,
                $executionLeaseToken,
            );
        } catch (Throwable) {
            return $this->recoveryRequired($session, $commandId, $approvalId, 'TALOS_BROWSER_EVIDENCE_COMMIT_FAILED', $executionLeaseToken);
        }

        try {
            $interactionId = (string) $payload['interaction_id'];
            $this->eventOnce($stored['session'], 'hmi.pointer.executed', 'worker', $commandId, [
                'command_id' => $commandId,
                'interaction_id' => $interactionId,
                'approval_id' => $approvalId,
                'target_fingerprint' => $result['target']['fingerprint'] ?? null,
                'source_state_version' => $payload['state_version'],
                'source_frame_sha256' => $payload['expected_frame_sha256'],
                'state_version' => $stored['session']->worker_state_version,
            ]);
            $this->eventOnce($stored['session'], 'hmi.evidence.persisted', 'system', $commandId, [
                'command_id' => $commandId,
                'interaction_id' => $interactionId,
                'approval_id' => $approvalId,
                'operation' => 'screenshot',
                'screenshot_artifact_id' => $stored['screenshot']->id,
                'snapshot_artifact_id' => $stored['snapshot']->id,
                'artifact_ids' => [$stored['screenshot']->id, $stored['snapshot']->id],
            ]);
        } catch (Throwable) {
            return $this->recoveryRequired($stored['session'], $commandId, $approvalId, 'TALOS_BROWSER_AUDIT_COMMIT_FAILED', $executionLeaseToken);
        }

        $responsePayload = ['data' => [
            'interaction' => array_filter([
                'status' => 'executed',
                'command_id' => $commandId,
                'interaction_id' => $payload['interaction_id'],
                'approval_id' => $approvalId,
                'target' => $result['target'],
            ], static fn (mixed $value): bool => $value !== null),
            'session' => $stored['session']->toApiArray(),
            'screenshot' => $this->artifactPayload($stored['screenshot'], true),
            'snapshot' => $this->artifactPayload($stored['snapshot'], false),
        ]];
        if ($approvalId !== null) {
            try {
                if (! is_string($approvalRequestHash)
                    || ! $this->approvals->completeExecution(
                        $approvalId,
                        (int) $session->user_id,
                        ['request_hash' => $approvalRequestHash],
                        $responsePayload,
                        (string) $executionLeaseToken,
                    )) {
                    return $this->recoveryRequired($stored['session'], $commandId, $approvalId, 'TALOS_BROWSER_APPROVAL_RESULT_COMMIT_FAILED', $executionLeaseToken);
                }
            } catch (Throwable) {
                return $this->recoveryRequired($stored['session'], $commandId, $approvalId, 'TALOS_BROWSER_APPROVAL_RESULT_COMMIT_FAILED', $executionLeaseToken);
            }
        }

        return response()->json($responsePayload, 201);
    }

    /** @param array<string, mixed> $input @return array<string, mixed> */
    private function workerPointer(array $input, string $commandId): array
    {
        return [
            'schema_version' => 'talos_browser_hmi_pointer_v2',
            'interaction_id' => $this->interactionId($input, $commandId),
            'state_version' => $input['state_version'],
            'expected_frame_sha256' => $input['artifact_sha256'],
            'normalized_x' => round((float) $input['normalized_x'], 6),
            'normalized_y' => round((float) $input['normalized_y'], 6),
            'button' => 'left',
            'click_count' => $input['click_count'],
        ];
    }

    /** @param array<string, mixed> $input */
    private function commandId(TalosBrowserSession $session, array $input): string
    {
        $binding = [
            'user_id' => (int) $session->user_id,
            'browser_session_id' => (string) $session->id,
            'worker_session_id' => (string) $session->worker_session_id,
            'artifact_id' => (string) $input['artifact_id'],
            'artifact_sha256' => (string) $input['artifact_sha256'],
            'state_version' => (int) $input['state_version'],
            'normalized_x' => round((float) $input['normalized_x'], 6),
            'normalized_y' => round((float) $input['normalized_y'], 6),
            'button' => (string) $input['button'],
            'click_count' => (int) $input['click_count'],
        ];
        if (isset($input['interaction_id'])) {
            $binding['interaction_id'] = (string) $input['interaction_id'];
        }

        return 'hmi_'.hash('sha256', $this->approvals->canonicalJson($binding));
    }

    /** @param array<string, mixed> $input */
    private function interactionId(array $input, string $commandId): string
    {
        if (is_string($input['interaction_id'] ?? null) && Str::isUuid($input['interaction_id'])) {
            return (string) $input['interaction_id'];
        }

        $hex = substr(hash('sha256', $commandId), 0, 32);
        $hex[12] = '5';
        $hex[16] = '8';

        return sprintf(
            '%s-%s-%s-%s-%s',
            substr($hex, 0, 8),
            substr($hex, 8, 4),
            substr($hex, 12, 4),
            substr($hex, 16, 4),
            substr($hex, 20, 12),
        );
    }

    private function approvalCommandId(TalosBrowserSession $session, TalosBrowserHmiApproval $approval): string
    {
        $payload = is_array($approval->payload) ? $approval->payload : [];
        $commandId = $payload['command_id'] ?? null;
        if (is_string($commandId) && preg_match('/^hmi_[a-f0-9]{64}$/', $commandId) === 1) {
            return $commandId;
        }

        return $this->commandId($session, $this->approvalPointerInput($approval));
    }

    /** @param array<string, mixed> $target @param array<string, mixed> $decision */
    private function effectClassification(array $target, array $decision): string
    {
        return ($target['required_effect_classification'] ?? null) === 'ordinary'
            && ($decision['category'] ?? null) === 'ordinary'
                ? 'ordinary'
                : 'sensitive';
    }

    /** @return array<string, mixed>|JsonResponse */
    private function pointerInput(Request $request): array|JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'schema_version' => ['required', 'string', 'in:talos_browser_hmi_pointer_v1,talos_browser_hmi_pointer_v2'],
            'interaction_id' => ['required_if:schema_version,talos_browser_hmi_pointer_v2', 'nullable', 'uuid'],
            'artifact_id' => ['required', 'uuid'],
            'artifact_sha256' => ['required', 'string', 'regex:/^sha256:[a-f0-9]{64}$/'],
            'state_version' => ['required', 'integer', 'min:0'],
            'normalized_x' => ['required', 'numeric', 'between:0,1'],
            'normalized_y' => ['required', 'numeric', 'between:0,1'],
            'button' => ['required', 'string', 'in:left'],
            'click_count' => ['required', 'integer', 'in:1,2'],
        ]);
        if ($validator->fails()) {
            return $this->validationError($validator->errors()->toArray());
        }
        $input = $validator->validated();
        $raw = $request->all();
        if (! is_int($raw['state_version'] ?? null)
            || (! is_int($raw['normalized_x'] ?? null) && ! is_float($raw['normalized_x'] ?? null))
            || (! is_int($raw['normalized_y'] ?? null) && ! is_float($raw['normalized_y'] ?? null))
            || ! is_finite((float) $raw['normalized_x'])
            || ! is_finite((float) $raw['normalized_y'])
            || ! is_int($raw['click_count'] ?? null)) {
            return $this->validationError(['pointer' => ['Pointer values must use their canonical JSON types.']]);
        }

        return $input;
    }

    /** @param array<string, mixed> $input */
    private function currentFrame(TalosBrowserSession $session, array $input, string $commandId): TalosBrowserArtifact|JsonResponse
    {
        try {
            $session->refresh();
        } catch (Throwable) {
            return $this->frameStale();
        }
        if ((int) $session->worker_state_version !== (int) $input['state_version']
            || $session->last_screenshot_artifact_id !== $input['artifact_id']) {
            return $this->frameStale();
        }
        $artifact = TalosBrowserArtifact::query()
            ->whereKey($input['artifact_id'])
            ->where('browser_session_id', $session->id)
            ->where('user_id', $session->user_id)
            ->where('type', 'screenshot')
            ->first();
        if (! $artifact instanceof TalosBrowserArtifact
            || (int) $artifact->state_version !== (int) $input['state_version']
            || $this->prefixedHash((string) $artifact->sha256) !== $input['artifact_sha256']) {
            return $this->frameStale();
        }
        try {
            $this->artifactReader->read($artifact);
        } catch (TalosBrowserArtifactIntegrityException $exception) {
            return $this->recoveryRequired($session, $commandId, null, $exception->reason);
        } catch (Throwable) {
            return $this->frameStale();
        }

        return $artifact;
    }

    /**
     * @param  array<string, mixed>  $pointer
     * @param  array<string, mixed>  $result
     * @return array<string, mixed>|JsonResponse
     */
    private function preflightResult(TalosBrowserSession $session, array $pointer, array $result): array|JsonResponse
    {
        $target = $result['target'] ?? null;
        $point = $result['point'] ?? null;
        if (is_string($result['frame_sha256'] ?? null)
            && preg_match('/^sha256:[a-f0-9]{64}$/', $result['frame_sha256']) === 1
            && ! hash_equals((string) $pointer['expected_frame_sha256'], $result['frame_sha256'])) {
            return $this->frameStale();
        }
        if (($result['schema_version'] ?? null) !== 'talos_browser_hmi_preflight_v2'
            || ! is_string($result['interaction_id'] ?? null)
            || ! hash_equals((string) ($pointer['interaction_id'] ?? ''), (string) $result['interaction_id'])
            || ($result['session_id'] ?? null) !== $session->worker_session_id
            || ($result['state_version'] ?? null) !== $pointer['state_version']
            || ! is_string($result['frame_sha256'] ?? null)
            || ! hash_equals((string) $pointer['expected_frame_sha256'], (string) $result['frame_sha256'])
            || ! is_string($result['origin'] ?? null)
            || ! is_array($point)
            || array_is_list($point)
            || abs((float) ($point['normalized_x'] ?? -1) - (float) $pointer['normalized_x']) > 0.000001
            || abs((float) ($point['normalized_y'] ?? -1) - (float) $pointer['normalized_y']) > 0.000001
            || ! $this->validTarget($target)) {
            return $this->error('TALOS_BROWSER_TARGET_STALE', 'Browser target preflight did not match the current frame.', 409);
        }

        return $result;
    }

    private function validTarget(mixed $target): bool
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

        return is_string($target['tag']) && $target['tag'] !== '' && strlen($target['tag']) <= 64
            && is_string($target['name']) && strlen($target['name']) <= 256
            && ($target['role'] === null || strlen($target['role']) <= 64)
            && ($target['input_type'] === null || strlen($target['input_type']) <= 64)
            && ($target['href'] === null || strlen($target['href']) <= 2048)
            && ($target['form_method'] === null || strlen($target['form_method']) <= 16)
            && is_bool($target['is_editable'])
            && is_bool($target['is_submit'])
            && is_bool($target['is_download'])
            && is_bool($target['opens_new_context'])
            && in_array($target['effect_attestation'], ['browser_default', 'unattestable'], true)
            && in_array($target['required_effect_classification'], ['ordinary', 'sensitive'], true)
            && $target['required_effect_classification'] === ($target['effect_attestation'] === 'browser_default' ? 'ordinary' : 'sensitive')
            && is_bool($target['visible'])
            && is_bool($target['disabled'])
            && is_string($target['fingerprint'])
            && preg_match('/^sha256:[a-f0-9]{64}$/', $target['fingerprint']) === 1;
    }

    /** @param array<string, mixed> $result @param array<string, mixed> $payload */
    private function validExecuteResult(array $result, array $payload, TalosBrowserSession $session): bool
    {
        $screenshot = $result['screenshot'] ?? null;
        $snapshot = $result['snapshot'] ?? null;

        return ($result['schema_version'] ?? null) === 'talos_browser_hmi_result_v2'
            && is_string($result['interaction_id'] ?? null)
            && hash_equals((string) ($payload['interaction_id'] ?? ''), (string) $result['interaction_id'])
            && is_string($result['command_id'] ?? null)
            && hash_equals((string) ($payload['command_id'] ?? ''), (string) $result['command_id'])
            && ($result['session_id'] ?? null) === $session->worker_session_id
            && is_int($result['source_state_version'] ?? null)
            && $result['source_state_version'] === $payload['state_version']
            && is_int($result['state_version'] ?? null)
            && $result['state_version'] === $result['source_state_version'] + 1
            && is_string($result['frame_sha256'] ?? null)
            && hash_equals((string) $payload['expected_frame_sha256'], (string) $result['frame_sha256'])
            && is_string($result['capture_id'] ?? null)
            && strlen($result['capture_id']) <= 128
            && is_string($result['url'] ?? null)
            && strlen($result['url']) <= 2048
            && is_string($result['title'] ?? null)
            && strlen($result['title']) <= 512
            && is_string($result['captured_at'] ?? null)
            && strlen($result['captured_at']) <= 64
            && ($result['effect_classification'] ?? null) === ($payload['effect_classification'] ?? null)
            && ($result['sensitive_effect_authorized'] ?? null) === ($payload['sensitive_effect_authorized'] ?? null)
            && $this->validTarget($result['target'] ?? null)
            && hash_equals((string) ($payload['expected_fingerprint'] ?? ''), (string) $result['target']['fingerprint'])
            && is_array($screenshot)
            && ! array_is_list($screenshot)
            && ($screenshot['mime_type'] ?? null) === 'image/png'
            && is_string($screenshot['sha256'] ?? null)
            && preg_match('/^sha256:[a-f0-9]{64}$/', $screenshot['sha256']) === 1
            && is_string($screenshot['base64'] ?? null)
            && is_int($screenshot['width'] ?? null)
            && $screenshot['width'] >= 1
            && $screenshot['width'] <= 3840
            && is_int($screenshot['height'] ?? null)
            && $screenshot['height'] >= 1
            && $screenshot['height'] <= 2160
            && is_array($snapshot)
            && ! array_is_list($snapshot)
            && ($snapshot['format'] ?? null) === 'accessibility_refs_v1'
            && is_string($snapshot['snapshot_id'] ?? null)
            && is_string($snapshot['text_digest'] ?? null)
            && is_string($snapshot['sha256'] ?? null)
            && preg_match('/^sha256:[a-f0-9]{64}$/', $snapshot['sha256']) === 1
            && is_array($snapshot['nodes'] ?? null)
            && array_is_list($snapshot['nodes'])
            && count($snapshot['nodes']) <= 500;
    }

    /**
     * @param  array<string, mixed>  $target
     * @param  array{user: string, workspace: ?string, effective: string}  $modes
     * @return array<string, mixed>
     */
    private function classify(array $target, array $modes): array
    {
        $href = $target['href'] ?? null;
        if (is_string($href) && trim($href) !== '') {
            $destination = $this->navigationPolicy->inspect($href);
            if (! $destination['allowed']) {
                return [
                    'decision' => 'deny',
                    'category' => 'destination_denied',
                    'consequence' => 'The browser destination is not permitted by public URL policy.',
                    'mode' => $modes['effective'],
                ];
            }
        }

        return [
            ...$this->hmiPolicy->classify($target, $modes['user'], $modes['workspace']),
            'mode' => $modes['effective'],
        ];
    }

    /** @return array{user: string, workspace: ?string, effective: string} */
    private function policyModes(int $userId): array
    {
        $settings = TalosWorkspaceSetting::query()->where('user_id', $userId)->first();
        $preferences = TalosWorkspaceSetting::sanitizePreferences($settings?->preferences ?? []);
        $userMode = is_string($preferences['browser_hmi_mode'] ?? null)
            ? $preferences['browser_hmi_mode']
            : TalosBrowserHmiPolicy::CONFIRM_SENSITIVE;
        $workspaceMode = config('services.talos.browser.hmi_min_mode');
        $workspaceMode = is_string($workspaceMode) && trim($workspaceMode) !== '' ? trim($workspaceMode) : null;

        return [
            'user' => $userMode,
            'workspace' => $workspaceMode,
            'effective' => $this->hmiPolicy->effectiveMode($userMode, $workspaceMode),
        ];
    }

    /**
     * @param  array<string, mixed>  $preflight
     * @param  array<string, mixed>  $payload
     * @param  array<string, mixed>  $decision
     */
    private function challenge(
        TalosBrowserSession $session,
        TalosBrowserArtifact $frame,
        array $preflight,
        array $payload,
        array $decision,
        string $commandId,
    ): JsonResponse {
        $target = $preflight['target'];
        try {
            $approval = $this->approvals->issue($this->approvalAttributes(
                $session,
                $frame,
                $preflight,
                $payload,
                $decision,
            ));
        } catch (InvalidArgumentException) {
            return $this->error(
                'TALOS_BROWSER_HMI_COMMAND_CONFLICT',
                'This browser interaction id is already bound to a different command.',
                409,
            );
        } catch (Throwable) {
            return $this->error(
                'TALOS_BROWSER_HMI_LEDGER_UNAVAILABLE',
                'The browser interaction ledger is unavailable; no action was dispatched.',
                503,
            );
        }
        if ($approval->status === 'consumed') {
            return $this->replayApproval($session, $approval, $commandId);
        }
        if ($approval->status === 'executing') {
            return $this->resumeExecuting($session, $approval, $commandId);
        }
        if ($approval->status !== 'pending') {
            return $this->approvalConflict($approval);
        }
        try {
            $this->eventOnce($session, 'hmi.confirmation.required', 'policy', $commandId, [
                'command_id' => $commandId,
                'interaction_id' => $approval->interaction_id,
                'approval_id' => $approval->id,
                'category' => $decision['category'],
                'target_fingerprint' => $target['fingerprint'],
            ], $decision);
        } catch (Throwable) {
            return $this->auditUnavailable();
        }

        return $this->error(
            'TALOS_BROWSER_HMI_CONFIRMATION_REQUIRED',
            'Confirm this browser action before TALOS executes it.',
            428,
            [
                'approval_id' => $approval->id,
                'request_hash' => $approval->request_hash,
                'expires_at' => $approval->expires_at?->toJSON(),
                'action' => [
                    'category' => $decision['category'],
                    'label' => mb_substr((string) ($target['name'] ?? 'Browser interaction'), 0, 256),
                    'origin' => mb_substr((string) ($preflight['origin'] ?? ''), 0, 2048),
                    'consequence' => $decision['consequence'],
                ],
            ],
        );
    }

    /**
     * @param  array<string, mixed>  $preflight
     * @param  array<string, mixed>  $payload
     * @param  array<string, mixed>  $decision
     * @return array<string, mixed>
     */
    private function approvalAttributes(
        TalosBrowserSession $session,
        TalosBrowserArtifact $frame,
        array $preflight,
        array $payload,
        array $decision,
    ): array {
        return [
            'owner_id' => (int) $session->user_id,
            'browser_session_id' => (string) $session->id,
            'artifact_id' => (string) $frame->id,
            'artifact_sha256' => $this->prefixedHash((string) $frame->sha256),
            'state_version' => (int) $session->worker_state_version,
            'normalized_x' => $payload['normalized_x'],
            'normalized_y' => $payload['normalized_y'],
            'button' => $payload['button'],
            'click_count' => $payload['click_count'],
            'target_fingerprint' => $preflight['target']['fingerprint'],
            'category' => $decision['category'],
            'payload' => $payload,
        ];
    }

    /** @return array<string, mixed> */
    private function approvalPointerInput(TalosBrowserHmiApproval $approval): array
    {
        return [
            'schema_version' => 'talos_browser_hmi_pointer_v2',
            'interaction_id' => (string) $approval->interaction_id,
            'artifact_id' => (string) $approval->artifact_id,
            'artifact_sha256' => (string) $approval->artifact_sha256,
            'state_version' => (int) $approval->state_version,
            'normalized_x' => (float) $approval->normalized_x,
            'normalized_y' => (float) $approval->normalized_y,
            'button' => (string) $approval->button,
            'click_count' => (int) $approval->click_count,
        ];
    }

    private function operable(TalosBrowserSession $session): ?JsonResponse
    {
        $capabilities = is_array($session->capabilities) ? $session->capabilities : [];
        if (($capabilities['hmiActions'] ?? false) !== true) {
            return $this->error('TALOS_BROWSER_HMI_CAPABILITY_DENIED', 'Browser session does not permit HMI interaction.', 403);
        }
        if (! $session->isOperable()) {
            return $this->error('TALOS_BROWSER_INVALID_STATE', 'Browser session is not active.', 409, [
                'status' => $session->status,
            ]);
        }

        return null;
    }

    private function owned(Request $request, TalosBrowserSession $session): ?JsonResponse
    {
        $talosSessionId = $this->requestedTalosSessionId($request);
        $ownedChat = $talosSessionId !== null
            && TalosSession::query()
                ->whereKey($talosSessionId)
                ->where('user_id', $this->userId($request))
                ->exists();

        return (int) $session->user_id === $this->userId($request)
            && is_string($session->talos_session_id)
            && $session->talos_session_id === $talosSessionId
            && $ownedChat
                ? null
                : $this->notFound();
    }

    private function preflightFailure(TalosBrowserSession $session, string $commandId, BrowserWorkerException $exception): JsonResponse
    {
        $status = match ($exception->errorCode) {
            'TALOS_BROWSER_FRAME_STALE', 'TALOS_BROWSER_STALE_STATE', 'TALOS_BROWSER_TARGET_STALE' => 409,
            'TALOS_BROWSER_HMI_CAPABILITY_DENIED', 'TALOS_BROWSER_HMI_TARGET_DENIED', 'TALOS_BROWSER_HMI_TARGET_MISSING' => 403,
            'TALOS_BROWSER_HMI_TARGET_BOUNDS' => 413,
            'TALOS_BROWSER_HMI_INVALID_POINTER' => 422,
            'TALOS_BROWSER_WORKER_UNAVAILABLE' => 503,
            default => 502,
        };
        if (($audit = $this->auditedEvent($session, $status === 409 ? 'hmi.pointer.stale' : 'hmi.preflight.failed', 'worker', [
            'command_id' => $commandId,
            'code' => $exception->errorCode,
        ])) instanceof JsonResponse) {
            return $audit;
        }

        return $this->error($exception->errorCode, $exception->getMessage(), $status);
    }

    private function recoveryRequired(
        TalosBrowserSession $session,
        string $commandId,
        ?string $approvalId,
        string $reason,
        ?string $executionLeaseToken = null,
    ): JsonResponse {
        if (is_string($approvalId) && is_string($executionLeaseToken)) {
            try {
                if (! $this->approvals->renewExecutionLease(
                    $approvalId,
                    (int) $session->user_id,
                    $commandId,
                    $executionLeaseToken,
                )) {
                    return $this->executionLeaseLost($approvalId);
                }
            } catch (Throwable) {
                return $this->error(
                    'TALOS_BROWSER_HMI_LEDGER_UNAVAILABLE',
                    'The browser interaction ledger is unavailable; recovery state could not be fenced.',
                    503,
                );
            }
        }
        try {
            TalosBrowserSession::query()->whereKey($session->id)->where('user_id', $session->user_id)->update([
                'status' => 'recovery_required',
                'last_seen_at' => now(),
            ]);
            $session->refresh();
        } catch (Throwable) {
            $session->status = 'recovery_required';
        }
        try {
            $this->event($session, 'hmi.recovery_required', 'system', array_filter([
                'command_id' => $commandId,
                'approval_id' => $approvalId,
                'reason' => $reason,
            ], static fn (mixed $value): bool => $value !== null));
        } catch (Throwable) {
            // The recovery response must survive an unavailable audit store.
        }

        return $this->error(
            'TALOS_BROWSER_HMI_RECOVERY_REQUIRED',
            'The browser interaction may have occurred, but TALOS could not commit current evidence.',
            409,
            ['reason' => $reason],
        );
    }

    private function executionLeaseLost(?string $approvalId): JsonResponse
    {
        return $this->error(
            'TALOS_BROWSER_HMI_EXECUTION_LEASE_LOST',
            'This browser execution lease is no longer current; its late result was not committed.',
            409,
            array_filter(['approval_id' => $approvalId], static fn (mixed $value): bool => $value !== null),
        );
    }

    /** @param array<string, mixed> $binding */
    private function invalidateApproval(
        TalosBrowserHmiApproval $approval,
        array $binding,
        TalosBrowserSession $session,
    ): ?JsonResponse {
        try {
            if ($this->approvals->invalidate((string) $approval->id, (int) $approval->user_id, $binding)) {
                return null;
            }
            $approval->refresh();
            if (! in_array($approval->status, ['pending', 'approved'], true)) {
                return null;
            }
        } catch (Throwable) {
            // Falling through enters recovery so an uncertain approval is never reused.
        }

        return $this->recoveryRequired(
            $session,
            (string) Str::uuid(),
            (string) $approval->id,
            'TALOS_BROWSER_APPROVAL_INVALIDATION_FAILED',
        );
    }

    private function approvalConflict(TalosBrowserHmiApproval $approval): JsonResponse
    {
        $code = match ($approval->status) {
            'expired' => 'TALOS_BROWSER_HMI_APPROVAL_EXPIRED',
            'consumed' => 'TALOS_BROWSER_HMI_APPROVAL_CONSUMED',
            'executing' => 'TALOS_BROWSER_HMI_COMMAND_IN_PROGRESS',
            default => 'TALOS_BROWSER_HMI_APPROVAL_INVALID',
        };

        return $this->error($code, 'Browser interaction approval is no longer executable.', 409);
    }

    private function replayCommand(TalosBrowserSession $session, string $commandId): ?JsonResponse
    {
        $approval = $this->approvals->findByCommandId((int) $session->user_id, (string) $session->id, $commandId);
        if (! $approval instanceof TalosBrowserHmiApproval) {
            return null;
        }
        if ($approval->status === 'consumed') {
            return $this->replayApproval($session, $approval, $commandId);
        }
        if ($approval->status === 'executing') {
            return $this->resumeExecuting($session, $approval, $commandId);
        }

        return null;
    }

    private function resumeExecuting(
        TalosBrowserSession $session,
        TalosBrowserHmiApproval $approval,
        string $commandId,
    ): JsonResponse {
        if (! $this->approvals->executionLeaseExpired($approval)) {
            return $this->commandInProgress($approval);
        }
        $binding = ['request_hash' => (string) $approval->request_hash];
        try {
            $executionLeaseToken = $this->approvals->reclaimForExecution(
                (string) $approval->id,
                (int) $session->user_id,
                $binding,
            );
            if (! is_string($executionLeaseToken)) {
                $approval->refresh();

                return $approval->status === 'consumed'
                    ? $this->replayApproval($session, $approval, $commandId)
                    : $this->commandInProgress($approval);
            }
            $approval->refresh();
        } catch (Throwable) {
            return $this->recoveryRequired(
                $session,
                $commandId,
                (string) $approval->id,
                'TALOS_BROWSER_HMI_LEASE_RECLAIM_FAILED',
            );
        }
        $payload = is_array($approval->execution_payload) && ! array_is_list($approval->execution_payload)
            ? $approval->execution_payload
            : null;
        if (! is_array($payload)) {
            return $this->recoveryRequired(
                $session,
                $commandId,
                (string) $approval->id,
                'TALOS_BROWSER_HMI_EXECUTION_PAYLOAD_MISSING',
                $executionLeaseToken,
            );
        }

        return $this->execute(
            $session,
            $payload,
            ['fingerprint' => $approval->target_fingerprint],
            $commandId,
            (string) $approval->id,
            null,
            (string) $approval->request_hash,
            $executionLeaseToken,
        );
    }

    private function replayApproval(TalosBrowserSession $session, TalosBrowserHmiApproval $approval, string $commandId): JsonResponse
    {
        $payload = is_array($approval->result_payload) ? $approval->result_payload : null;
        if (! is_array($payload)
            || array_is_list($payload)
            || ! hash_equals($commandId, (string) data_get($payload, 'data.interaction.command_id', ''))) {
            return $this->recoveryRequired($session, $commandId, (string) $approval->id, 'TALOS_BROWSER_APPROVAL_RESULT_INVALID');
        }
        if (! $this->validReplayEvidence($session, $approval, $commandId, $payload)) {
            return $this->recoveryRequired($session, $commandId, (string) $approval->id, 'TALOS_BROWSER_REPLAY_EVIDENCE_INVALID');
        }

        return response()->json($payload, 201);
    }

    /** @param array<string, mixed> $payload */
    private function validReplayEvidence(
        TalosBrowserSession $session,
        TalosBrowserHmiApproval $approval,
        string $commandId,
        array $payload,
    ): bool {
        $expected = [
            'screenshot' => data_get($payload, 'data.screenshot'),
            'snapshot' => data_get($payload, 'data.snapshot'),
        ];
        if (! is_array($expected['screenshot']) || array_is_list($expected['screenshot'])
            || ! is_array($expected['snapshot']) || array_is_list($expected['snapshot'])) {
            return false;
        }
        $ids = [$expected['screenshot']['id'] ?? null, $expected['snapshot']['id'] ?? null];
        if (! is_string($ids[0]) || ! is_string($ids[1]) || $ids[0] === $ids[1]) {
            return false;
        }

        try {
            $artifacts = TalosBrowserArtifact::query()
                ->where('browser_session_id', $session->id)
                ->where('user_id', $session->user_id)
                ->where('source_command_id', $commandId)
                ->whereIn('id', $ids)
                ->get()
                ->keyBy('type');
            foreach (['screenshot', 'snapshot'] as $type) {
                $artifact = $artifacts->get($type);
                $wire = $expected[$type];
                if (! $artifact instanceof TalosBrowserArtifact
                    || ! hash_equals((string) $artifact->id, (string) ($wire['id'] ?? ''))
                    || ! hash_equals((string) $artifact->sha256, (string) ($wire['sha256'] ?? ''))
                    || (int) $artifact->source_state_version !== (int) $approval->state_version
                    || (int) $artifact->state_version !== (int) $approval->state_version + 1
                    || ($artifact->metadata['approval_id'] ?? null) !== $approval->id) {
                    return false;
                }
                $this->artifactReader->read($artifact);
            }
        } catch (Throwable) {
            return false;
        }

        return true;
    }

    private function commandInProgress(TalosBrowserHmiApproval $approval): JsonResponse
    {
        return $this->error(
            'TALOS_BROWSER_HMI_COMMAND_IN_PROGRESS',
            'This exact browser interaction is already being executed.',
            409,
            ['approval_id' => $approval->id],
        );
    }

    /** @param array<string, mixed> $payload @param array<string, mixed>|null $policy */
    private function auditedEvent(
        TalosBrowserSession $session,
        string $type,
        string $actor,
        array $payload = [],
        ?array $policy = null,
    ): ?JsonResponse {
        try {
            $this->event($session, $type, $actor, $payload, $policy);

            return null;
        } catch (Throwable) {
            return $this->auditUnavailable();
        }
    }

    /** @param array<string, mixed> $payload @param array<string, mixed>|null $policy */
    private function auditedEventOnce(
        TalosBrowserSession $session,
        string $type,
        string $actor,
        string $commandId,
        array $payload = [],
        ?array $policy = null,
    ): ?JsonResponse {
        try {
            $this->eventOnce($session, $type, $actor, $commandId, $payload, $policy);

            return null;
        } catch (Throwable) {
            return $this->auditUnavailable();
        }
    }

    private function auditUnavailable(): JsonResponse
    {
        return $this->error(
            'TALOS_BROWSER_HMI_AUDIT_UNAVAILABLE',
            'The browser audit ledger is unavailable; no action was dispatched.',
            503,
        );
    }

    /** @param array<string, mixed> $payload @param array<string, mixed>|null $policy */
    private function eventOnce(
        TalosBrowserSession $session,
        string $type,
        string $actor,
        string $commandId,
        array $payload = [],
        ?array $policy = null,
    ): void {
        TalosBrowserEvent::query()->firstOrCreate(
            [
                'browser_session_id' => $session->id,
                'type' => $type,
                'command_id' => $commandId,
            ],
            [
                'user_id' => $session->user_id,
                'actor' => $actor,
                'url_before' => $session->current_url,
                'url_after' => $session->current_url,
                'payload' => $payload,
                'policy_decision' => $policy,
            ],
        );
    }

    private function isProvenPreDispatchFailure(string $code): bool
    {
        return in_array($code, [
            'TALOS_BROWSER_FRAME_STALE',
            'TALOS_BROWSER_STALE_STATE',
            'TALOS_BROWSER_TARGET_STALE',
            'TALOS_BROWSER_HMI_TARGET_MISSING',
            'TALOS_BROWSER_HMI_TARGET_BOUNDS',
            'TALOS_BROWSER_HMI_CAPABILITY_DENIED',
            'TALOS_BROWSER_HMI_CONTEXT_INVALID',
            'TALOS_BROWSER_HMI_DOWNLOAD_DENIED',
            'TALOS_BROWSER_HMI_INVALID_POINTER',
            'TALOS_BROWSER_HMI_NEW_CONTEXT_DENIED',
            'TALOS_BROWSER_HMI_SINGLE_PAGE_INVARIANT',
            'TALOS_BROWSER_HMI_TARGET_DENIED',
            'TALOS_BROWSER_HMI_UPLOAD_DENIED',
        ], true);
    }

    /** @return array<string, mixed> */
    private function artifactPayload(TalosBrowserArtifact $artifact, bool $preview): array
    {
        return [
            ...$artifact->toApiArray(),
            ...($preview ? ['preview_url' => "/api/talos/browser/artifacts/{$artifact->id}/preview"] : []),
        ];
    }

    private function prefixedHash(string $hash): string
    {
        return str_starts_with($hash, 'sha256:') ? $hash : 'sha256:'.$hash;
    }

    private function frameStale(): JsonResponse
    {
        return $this->error('TALOS_BROWSER_FRAME_STALE', 'Browser frame is no longer current.', 409);
    }

    private function requestedTalosSessionId(Request $request): ?string
    {
        $value = $request->header('X-Talos-Session-Id', $request->query('talos_session_id'));

        return is_string($value) && trim($value) !== '' ? trim($value) : null;
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

    /** @param array<string, mixed> $payload @param array<string, mixed>|null $policy */
    private function event(TalosBrowserSession $session, string $type, string $actor, array $payload = [], ?array $policy = null): void
    {
        TalosBrowserEvent::query()->create([
            'browser_session_id' => $session->id,
            'user_id' => $session->user_id,
            'type' => $type,
            'actor' => $actor,
            'url_before' => $session->current_url,
            'url_after' => $session->current_url,
            'payload' => $payload,
            'policy_decision' => $policy,
        ]);
    }

    /** @param array<string, mixed> $details */
    private function error(string $code, string $message, int $status, array $details = []): JsonResponse
    {
        return response()->json(compact('code', 'message', 'details'), $status);
    }

    /** @param array<string, mixed> $details */
    private function validationError(array $details): JsonResponse
    {
        return $this->error('TALOS_BROWSER_VALIDATION_FAILED', 'Browser interaction validation failed.', 422, $details);
    }

    private function notFound(): JsonResponse
    {
        return $this->error('TALOS_BROWSER_NOT_FOUND', 'Browser resource was not found.', 404);
    }
}
