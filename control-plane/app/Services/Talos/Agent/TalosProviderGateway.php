<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use App\Models\TalosModelProfile;
use App\Models\TalosToolTurn;
use Closure;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Crypt;
use InvalidArgumentException;
use Kadmos\Provider\ProviderFailure;
use Kadmos\Provider\ProviderStream;
use Kadmos\Provider\ProviderStreamEvent;
use Kadmos\Provider\ProviderTurnAdapter;
use Kadmos\Provider\StreamingProviderTurnAdapter;
use Kadmos\Tool\ProviderTurnRequest;
use Kadmos\Tool\ProviderTurnResponse;
use Kadmos\Tool\ProviderTurnState;
use Kadmos\Tool\TokenUsage;
use Kadmos\Tool\ToolCall;
use Kadmos\Tool\ToolResult;
use Throwable;

final class TalosProviderGateway
{
    public function __construct(private readonly ?TalosProviderAdapterResolver $resolver = null) {}

    public function start(
        int $ownerId,
        TalosToolTurn $turn,
        TalosModelProfile $profile,
        ProviderTurnRequest $request,
        ?string $leaseToken = null,
    ): ProviderTurnResponse {
        $ownedTurn = $this->ownedTurn($ownerId, $turn->id);
        $ownedProfile = $this->ownedProfile($ownerId, $profile->id);
        $this->assertTurnProfile($ownedTurn, $ownedProfile, $request);
        $adapter = $this->adapter($ownedProfile);
        $this->assertAdapterVersion($ownedTurn, $adapter);
        $operation = $this->beginOperation(
            $ownedTurn,
            'start',
            $this->hashPayload($request->toRedactedArray()),
            $leaseToken,
            $adapter,
        );
        if ($operation['response'] instanceof ProviderTurnResponse) {
            return $operation['response'];
        }
        $operationKey = $operation['key'];

        try {
            $response = $adapter->start($request);
        } catch (Throwable) {
            $this->markOperationRecoveryRequired($ownedTurn, $operationKey, $leaseToken);

            throw new TalosProviderRecoveryRequiredException;
        }

        $this->persistResponse($ownedTurn, $response, $operationKey, $leaseToken);

        return $response;
    }

    public function adapterVersion(int $ownerId, TalosModelProfile $profile): string
    {
        $ownedProfile = $this->ownedProfile($ownerId, (string) $profile->id);

        return $this->adapter($ownedProfile)->capabilities()->adapterVersion;
    }

    public function startStreaming(
        int $ownerId,
        TalosToolTurn $turn,
        TalosModelProfile $profile,
        ProviderTurnRequest $request,
        Closure $onEvent,
        Closure $isCancelled,
        ?string $leaseToken = null,
    ): ProviderTurnResponse {
        $ownedTurn = $this->ownedTurn($ownerId, $turn->id);
        $ownedProfile = $this->ownedProfile($ownerId, $profile->id);
        $this->assertTurnProfile($ownedTurn, $ownedProfile, $request);
        $adapter = $this->adapter($ownedProfile);
        $this->assertAdapterVersion($ownedTurn, $adapter);
        $operation = $this->beginOperation(
            $ownedTurn,
            'start',
            $this->hashPayload($request->toRedactedArray()),
            $leaseToken,
            $adapter,
        );
        if ($operation['response'] instanceof ProviderTurnResponse) {
            return $operation['response'];
        }
        $operationKey = $operation['key'];

        try {
            $response = $adapter instanceof StreamingProviderTurnAdapter
                ? $this->consumeStream($adapter->streamStart($request, $isCancelled), $onEvent)
                : $adapter->start($request);
        } catch (TalosProviderStreamCancelledException $exception) {
            $this->markOperationCancelled($ownedTurn, $operationKey, $leaseToken);

            throw $exception;
        } catch (Throwable) {
            $this->markOperationRecoveryRequired($ownedTurn, $operationKey, $leaseToken);

            throw new TalosProviderRecoveryRequiredException;
        }

        $this->persistResponse($ownedTurn, $response, $operationKey, $leaseToken);

        return $response;
    }

    /** @param list<ToolResult> $toolResults */
    public function continue(int $ownerId, string $turnId, array $toolResults, ?string $leaseToken = null): ProviderTurnResponse
    {
        $turn = $this->ownedTurn($ownerId, $turnId);
        if ($turn->status === 'recovery_required'
            || in_array($turn->provider_operation_status, ['in_flight', 'recovery_required'], true)) {
            throw new TalosProviderRecoveryRequiredException;
        }
        if ($turn->status !== 'awaiting_tool_results') {
            throw new InvalidArgumentException('Provider turn is not awaiting tool results.');
        }
        $this->assertToolResultCorrelation($turn, $toolResults);
        $profileId = is_string($turn->model_profile_id) ? $turn->model_profile_id : '';
        if ($profileId === '') {
            throw new InvalidArgumentException('Provider turn has no model profile.');
        }
        $profile = $this->ownedProfile($ownerId, $profileId);
        $adapter = $this->adapter($profile);
        $this->assertAdapterVersion($turn, $adapter);
        $state = $this->stateFromDatabase($turn, $adapter);
        $operation = $this->beginOperation(
            $turn,
            'continue',
            $this->hashPayload([
                'provider_state_sha256' => $turn->provider_state_sha256,
                'results' => array_map(static fn (ToolResult $result): array => $result->toWireArray(), $toolResults),
            ]),
            $leaseToken,
            $adapter,
        );
        if ($operation['response'] instanceof ProviderTurnResponse) {
            return $operation['response'];
        }
        $operationKey = $operation['key'];

        try {
            $response = $adapter->continue($state, $toolResults);
        } catch (Throwable) {
            $this->markOperationRecoveryRequired($turn, $operationKey, $leaseToken);

            throw new TalosProviderRecoveryRequiredException;
        }

        $this->persistResponse($turn, $response, $operationKey, $leaseToken);

        return $response;
    }

    /** @param list<ToolResult> $toolResults */
    public function continueStreaming(
        int $ownerId,
        string $turnId,
        array $toolResults,
        Closure $onEvent,
        Closure $isCancelled,
        ?string $leaseToken = null,
    ): ProviderTurnResponse {
        $turn = $this->ownedTurn($ownerId, $turnId);
        if ($turn->status === 'recovery_required'
            || in_array($turn->provider_operation_status, ['in_flight', 'recovery_required'], true)) {
            throw new TalosProviderRecoveryRequiredException;
        }
        if ($turn->status !== 'awaiting_tool_results') {
            throw new InvalidArgumentException('Provider turn is not awaiting tool results.');
        }
        $this->assertToolResultCorrelation($turn, $toolResults);
        $profileId = is_string($turn->model_profile_id) ? $turn->model_profile_id : '';
        if ($profileId === '') {
            throw new InvalidArgumentException('Provider turn has no model profile.');
        }
        $profile = $this->ownedProfile($ownerId, $profileId);
        $adapter = $this->adapter($profile);
        $this->assertAdapterVersion($turn, $adapter);
        $state = $this->stateFromDatabase($turn, $adapter);
        $operation = $this->beginOperation(
            $turn,
            'continue',
            $this->hashPayload([
                'provider_state_sha256' => $turn->provider_state_sha256,
                'results' => array_map(static fn (ToolResult $result): array => $result->toWireArray(), $toolResults),
            ]),
            $leaseToken,
            $adapter,
        );
        if ($operation['response'] instanceof ProviderTurnResponse) {
            return $operation['response'];
        }
        $operationKey = $operation['key'];

        try {
            $response = $adapter instanceof StreamingProviderTurnAdapter
                ? $this->consumeStream($adapter->streamContinue($state, $toolResults, $isCancelled), $onEvent)
                : $adapter->continue($state, $toolResults);
        } catch (TalosProviderStreamCancelledException $exception) {
            $this->markOperationCancelled($turn, $operationKey, $leaseToken);

            throw $exception;
        } catch (Throwable) {
            $this->markOperationRecoveryRequired($turn, $operationKey, $leaseToken);

            throw new TalosProviderRecoveryRequiredException;
        }

        $this->persistResponse($turn, $response, $operationKey, $leaseToken);

        return $response;
    }

    /** @param list<ToolResult> $toolResults */
    private function assertToolResultCorrelation(TalosToolTurn $turn, array $toolResults): void
    {
        $pendingCallIds = is_array($turn->pending_tool_call_ids)
            ? array_values($turn->pending_tool_call_ids)
            : [];
        $receivedCallIds = [];

        foreach ($toolResults as $result) {
            if (! $result instanceof ToolResult) {
                throw new InvalidArgumentException('Provider tool results do not match the pending provider calls.');
            }

            $receivedCallIds[] = $result->toolUseId;
        }

        if ($pendingCallIds === []
            || $receivedCallIds !== $pendingCallIds
            || count(array_unique($receivedCallIds)) !== count($receivedCallIds)) {
            throw new InvalidArgumentException('Provider tool results do not match the pending provider calls.');
        }
    }

    private function ownedTurn(int $ownerId, string $turnId): TalosToolTurn
    {
        $turn = TalosToolTurn::query()->ownedBy($ownerId)->whereKey($turnId)->first();
        if (! $turn instanceof TalosToolTurn) {
            throw new InvalidArgumentException('Provider turn is not owned by the current user.');
        }

        return $turn;
    }

    private function ownedProfile(int $ownerId, string $profileId): TalosModelProfile
    {
        $profile = TalosModelProfile::query()->whereKey($profileId)->where('user_id', $ownerId)->first();
        if (! $profile instanceof TalosModelProfile) {
            throw new InvalidArgumentException('Provider profile is not owned by the current user.');
        }

        return $profile;
    }

    private function assertTurnProfile(
        TalosToolTurn $turn,
        TalosModelProfile $profile,
        ProviderTurnRequest $request,
    ): void {
        if ((string) $turn->model_profile_id !== (string) $profile->id
            || strtolower((string) $turn->provider) !== strtolower((string) $profile->provider)
            || (string) $turn->model !== (string) $profile->model
            || strtolower($request->provider) !== strtolower((string) $profile->provider)
            || $request->model !== (string) $profile->model) {
            throw new InvalidArgumentException('Provider turn, profile, and request do not match.');
        }
    }

    private function adapter(TalosModelProfile $profile): ProviderTurnAdapter
    {
        $secret = '';
        $provider = strtolower((string) $profile->provider);
        if ($provider !== 'ollama') {
            if (! filled($profile->encrypted_secret)) {
                throw new InvalidArgumentException('Provider profile has no secret.');
            }
            try {
                $secret = Crypt::decryptString((string) $profile->encrypted_secret);
            } catch (Throwable) {
                throw new InvalidArgumentException('Provider profile secret could not be decrypted.');
            }
        }

        try {
            return ($this->resolver ?? new TalosCoreProviderAdapterResolver)->resolve($profile, $secret);
        } catch (Throwable) {
            throw new InvalidArgumentException('Provider adapter could not be resolved.');
        }
    }

    private function assertAdapterVersion(TalosToolTurn $turn, ProviderTurnAdapter $adapter): void
    {
        $version = $adapter->capabilities()->adapterVersion;
        if (! is_string($turn->adapter_version) || ! hash_equals($turn->adapter_version, $version)) {
            throw new InvalidArgumentException('Provider turn adapter version does not match the resolved adapter.');
        }
    }

    private function stateFromDatabase(TalosToolTurn $turn, ProviderTurnAdapter $adapter): ProviderTurnState
    {
        $encodedState = $turn->provider_state;
        if (! is_string($encodedState) || $encodedState === '') {
            throw new InvalidArgumentException('Provider turn has no continuation checkpoint.');
        }
        $checkpointHash = is_string($turn->provider_state_sha256) ? $turn->provider_state_sha256 : '';
        $expectedHash = 'sha256:'.hash('sha256', $encodedState);
        if ($checkpointHash === '' || ! hash_equals($checkpointHash, $expectedHash)) {
            throw new InvalidArgumentException('Provider turn checkpoint integrity could not be verified.');
        }
        $nativeState = TalosProviderStateCodec::decode($encodedState);
        if (! is_array($turn->pending_tool_call_ids) || $turn->pending_tool_call_ids === []) {
            throw new InvalidArgumentException('Provider turn has no pending provider calls.');
        }
        $version = $adapter->capabilities()->adapterVersion;
        if (! is_string($turn->adapter_version) || ! hash_equals($turn->adapter_version, $version)) {
            throw new InvalidArgumentException('Provider continuation checkpoint belongs to another adapter version.');
        }

        $state = new ProviderTurnState(
            provider: (string) $turn->provider,
            adapterVersion: (string) $turn->adapter_version,
            responseId: is_string($turn->provider_response_id) ? $turn->provider_response_id : null,
            continuationKind: (string) $turn->continuation_kind,
            nativeState: $nativeState,
            pendingToolCallIds: array_values($turn->pending_tool_call_ids),
        );
        $state->nativeStateFor($version);

        return $state;
    }

    /** @return array{key: string, response: ProviderTurnResponse|null} */
    private function beginOperation(
        TalosToolTurn $turn,
        string $phase,
        string $payloadHash,
        ?string $leaseToken,
        ProviderTurnAdapter $adapter,
    ): array {
        $operationKey = 'sha256:'.hash('sha256', implode('|', [
            (string) $turn->id,
            $phase,
            $payloadHash,
        ]));

        $response = DB::transaction(function () use ($turn, $operationKey, $payloadHash, $leaseToken, $adapter): ?ProviderTurnResponse {
            $locked = $this->mutableTurn($turn, $leaseToken);
            if ($locked->status === 'recovery_required'
                || in_array($locked->provider_operation_status, ['in_flight', 'recovery_required'], true)) {
                throw new TalosProviderRecoveryRequiredException;
            }
            if ($locked->provider_operation_status === 'completed'
                && is_string($locked->provider_operation_key)
                && hash_equals($locked->provider_operation_key, $operationKey)) {
                if (! is_string($locked->provider_operation_hash)
                    || ! hash_equals($locked->provider_operation_hash, $payloadHash)) {
                    throw new TalosProviderRecoveryRequiredException(
                        message: 'Completed provider operation checkpoint does not match its payload.',
                    );
                }

                return $this->storedResponse($locked, $adapter);
            }

            $locked->forceFill([
                'provider_operation_key' => $operationKey,
                'provider_operation_hash' => $payloadHash,
                'provider_operation_status' => 'in_flight',
            ])->save();

            return null;
        }, 3);

        return ['key' => $operationKey, 'response' => $response];
    }

    private function storedResponse(TalosToolTurn $turn, ProviderTurnAdapter $adapter): ProviderTurnResponse
    {
        $encoded = $turn->provider_outcome;
        if (! is_string($encoded) || ! is_string($turn->provider_outcome_sha256)
            || ! hash_equals($turn->provider_outcome_sha256, 'sha256:'.hash('sha256', $encoded))) {
            throw new TalosProviderRecoveryRequiredException(
                message: 'Completed provider outcome checkpoint failed its integrity check.',
            );
        }
        try {
            $outcome = TalosProviderOutcomeCodec::decode($encoded);
            $usage = $this->tokenUsage($outcome['usage'] ?? null);
            $responseId = is_string($outcome['response_id'] ?? null) ? $outcome['response_id'] : null;
            $stopReason = is_string($outcome['stop_reason'] ?? null) ? $outcome['stop_reason'] : null;

            return match ($outcome['kind']) {
                ProviderTurnResponse::FINAL => ProviderTurnResponse::final(
                    $this->outcomeText($outcome),
                    $responseId,
                    $stopReason,
                    $usage,
                ),
                ProviderTurnResponse::TOOL_CALLS => ProviderTurnResponse::toolCalls(
                    is_string($outcome['text'] ?? null) ? $outcome['text'] : null,
                    $this->toolCallsFromOutcome($outcome['tool_calls'] ?? null),
                    $this->stateFromDatabase($turn, $adapter),
                    $responseId,
                    $stopReason,
                    $usage,
                ),
                ProviderTurnResponse::REFUSAL => ProviderTurnResponse::refusal(
                    $this->outcomeText($outcome),
                    $responseId,
                    $stopReason,
                    $usage,
                ),
                ProviderTurnResponse::INCOMPLETE => ProviderTurnResponse::incomplete(
                    $this->outcomeText($outcome),
                    $responseId,
                    $stopReason,
                    $usage,
                ),
                ProviderTurnResponse::FAILURE => ProviderTurnResponse::failure(
                    $this->providerFailure($outcome['failure'] ?? null),
                    $responseId,
                    $stopReason,
                    $usage,
                ),
            };
        } catch (TalosProviderRecoveryRequiredException $exception) {
            throw $exception;
        } catch (Throwable) {
            throw new TalosProviderRecoveryRequiredException(
                message: 'Completed provider outcome checkpoint is malformed.',
            );
        }
    }

    /** @return list<ToolCall> */
    private function toolCallsFromOutcome(mixed $calls): array
    {
        if (! is_array($calls) || ! array_is_list($calls)) {
            throw new TalosProviderRecoveryRequiredException(
                message: 'Completed provider tool-call checkpoint is not a list.',
            );
        }

        return array_map(static function (mixed $call): ToolCall {
            if (! is_array($call)) {
                throw new TalosProviderRecoveryRequiredException(
                    message: 'Completed provider tool-call checkpoint contains a malformed call.',
                );
            }

            return ToolCall::fromJson(json_encode(
                $call,
                JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR,
            ));
        }, $calls);
    }

    /** @param array<string, mixed> $outcome */
    private function outcomeText(array $outcome): string
    {
        $text = $outcome['text'] ?? null;
        if (! is_string($text) || trim($text) === '') {
            throw new TalosProviderRecoveryRequiredException(
                message: 'Completed provider outcome text is invalid.',
            );
        }

        return $text;
    }

    private function tokenUsage(mixed $usage): TokenUsage
    {
        return TokenUsage::fromArray(is_array($usage) ? $usage : []);
    }

    private function providerFailure(mixed $failure): ProviderFailure
    {
        if (! is_array($failure)
            || ! is_string($failure['code'] ?? null)
            || ! is_string($failure['message'] ?? null)
            || ! is_bool($failure['retryable'] ?? null)
            || (! is_null($failure['http_status'] ?? null) && ! is_int($failure['http_status']))
            || ! is_array($failure['details'] ?? null)) {
            throw new TalosProviderRecoveryRequiredException(
                message: 'Completed provider failure checkpoint is invalid.',
            );
        }

        return new ProviderFailure(
            $failure['code'],
            $failure['message'],
            $failure['retryable'],
            $failure['http_status'] ?? null,
            $failure['details'],
        );
    }

    private function markOperationRecoveryRequired(
        TalosToolTurn $turn,
        string $operationKey,
        ?string $leaseToken,
    ): void {
        try {
            DB::transaction(function () use ($turn, $operationKey, $leaseToken): void {
                $locked = $this->mutableTurn($turn, $leaseToken);
                if ($locked->provider_operation_status !== 'in_flight'
                    || ! is_string($locked->provider_operation_key)
                    || ! hash_equals($locked->provider_operation_key, $operationKey)) {
                    throw new TalosProviderRecoveryRequiredException;
                }

                $locked->forceFill([
                    'status' => 'recovery_required',
                    'provider_operation_status' => 'recovery_required',
                    'completed_at' => null,
                ])->save();
            }, 3);
        } catch (TalosProviderRecoveryRequiredException) {
            // An expired fence leaves the existing in-flight marker as the recovery signal.
        }
    }

    private function markOperationCancelled(
        TalosToolTurn $turn,
        string $operationKey,
        ?string $leaseToken,
    ): void {
        try {
            DB::transaction(function () use ($turn, $operationKey, $leaseToken): void {
                $locked = $this->mutableTurn($turn, $leaseToken);
                if ($locked->provider_operation_status !== 'in_flight'
                    || ! is_string($locked->provider_operation_key)
                    || ! hash_equals($locked->provider_operation_key, $operationKey)) {
                    throw new TalosProviderRecoveryRequiredException;
                }

                $locked->forceFill([
                    'status' => 'cancelled',
                    'provider_operation_status' => 'cancelled',
                    'pending_tool_call_ids' => [],
                    'cancel_requested_at' => $locked->cancel_requested_at ?? now(),
                    'completed_at' => now(),
                ])->save();
            }, 3);
        } catch (TalosProviderRecoveryRequiredException) {
            // A concurrent owner-authorized cancellation already owns the terminal state.
        }
    }

    private function persistResponse(
        TalosToolTurn $turn,
        ProviderTurnResponse $response,
        string $operationKey,
        ?string $leaseToken,
    ): void
    {
        $encodedOutcome = TalosProviderOutcomeCodec::encode($response);
        $attributes = [
            'provider_response_id' => $response->responseId,
            'provider_outcome' => $encodedOutcome,
            'provider_outcome_sha256' => 'sha256:'.hash('sha256', $encodedOutcome),
            'updated_at' => now(),
        ];
        if ($response->kind === ProviderTurnResponse::TOOL_CALLS && $response->state instanceof ProviderTurnState) {
            $nativeState = $response->state->nativeStateFor($response->state->adapterVersion);
            $encodedState = TalosProviderStateCodec::encode($nativeState);
            $attributes += [
                'status' => 'awaiting_tool_results',
                'continuation_kind' => $response->state->continuationKind,
                'pending_tool_call_ids' => $response->state->pendingToolCallIds,
                'provider_state' => $encodedState,
                'provider_state_sha256' => 'sha256:'.hash('sha256', $encodedState),
                'dag_state' => null,
                'dag_state_sha256' => null,
            ];
        } else {
            $attributes += [
                'status' => match ($response->kind) {
                    ProviderTurnResponse::FINAL => 'completed',
                    ProviderTurnResponse::REFUSAL => 'refused',
                    ProviderTurnResponse::INCOMPLETE => 'incomplete',
                    default => 'failed',
                },
                'continuation_kind' => null,
                'pending_tool_call_ids' => [],
                'provider_state' => null,
                'provider_state_sha256' => null,
                'completed_at' => now(),
            ];
        }

        $attributes['provider_operation_status'] = 'completed';

        DB::transaction(function () use ($turn, $attributes, $operationKey, $leaseToken): void {
            $locked = $this->mutableTurn($turn, $leaseToken);
            if ($locked->provider_operation_status !== 'in_flight'
                || ! is_string($locked->provider_operation_key)
                || ! hash_equals($locked->provider_operation_key, $operationKey)) {
                throw new TalosProviderRecoveryRequiredException(
                    message: 'Provider response cannot be persisted because its operation fence is no longer current.',
                );
            }

            $locked->forceFill($attributes)->save();
        }, 3);
    }

    private function consumeStream(ProviderStream $stream, Closure $onEvent): ProviderTurnResponse
    {
        foreach ($stream as $event) {
            if (! $event instanceof ProviderStreamEvent) {
                throw new InvalidArgumentException('Provider stream yielded an invalid canonical event.');
            }
            $onEvent($event);
            if ($event->kind === ProviderStreamEvent::CANCELLED) {
                throw new TalosProviderStreamCancelledException((string) $event->payload['reason']);
            }
        }

        return $stream->finalOutcome();
    }

    private function mutableTurn(TalosToolTurn $turn, ?string $leaseToken): TalosToolTurn
    {
        $query = TalosToolTurn::query()->whereKey($turn->id)->lockForUpdate();
        if (is_string($turn->execution_lease_token)) {
            if (! is_string($leaseToken) || ! hash_equals($turn->execution_lease_token, $leaseToken)) {
                throw new TalosProviderRecoveryRequiredException(
                    message: 'Provider operation lost its execution lease.',
                );
            }
            $query->where('execution_lease_token', $leaseToken)
                ->where('execution_lease_expires_at', '>', now());
        } elseif ($leaseToken !== null) {
            throw new TalosProviderRecoveryRequiredException(
                message: 'Provider operation lease does not match the persisted turn.',
            );
        }

        $locked = $query->first();
        if (! $locked instanceof TalosToolTurn) {
            throw new TalosProviderRecoveryRequiredException(
                message: 'Provider operation execution lease expired or was fenced out.',
            );
        }

        return $locked;
    }

    /** @param array<string, mixed> $payload */
    private function hashPayload(array $payload): string
    {
        $encoded = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);

        return 'sha256:'.hash('sha256', $encoded);
    }
}
