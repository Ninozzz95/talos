<?php

declare(strict_types=1);

namespace Kadmos\Tool;

use InvalidArgumentException;

final readonly class ProceduralCompileContext
{
    /** @param list<string> $retryProviderCallIds */
    public function __construct(
        public string $userId,
        public string $chatSessionId,
        public string $runId,
        public string $turnId,
        public ?string $browserSessionId,
        public int $stateVersion,
        public string $deadlineAt,
        public string $observedAt,
        public bool $cancellationRequested = false,
        public ProceduralUsage $usage = new ProceduralUsage,
        public ?string $evidenceHash = null,
        public array $retryProviderCallIds = [],
    ) {
        ToolContractGuard::nonEmptyString($userId, 'Procedural user ID', 256);
        ToolContractGuard::nonEmptyString($chatSessionId, 'Procedural chat session ID', 256);
        ToolContractGuard::nonEmptyString($runId, 'Procedural run ID', 256);
        ToolContractGuard::nonEmptyString($turnId, 'Procedural turn ID', 256);
        ToolContractGuard::nullableString($browserSessionId, 'Procedural browser session ID', 256);
        ToolContractGuard::jsonSafeNonNegativeInteger($stateVersion, 'Procedural state version');
        ToolContractGuard::iso8601($deadlineAt, 'Procedural deadline');
        ToolContractGuard::iso8601($observedAt, 'Procedural observation timestamp');
        if ($evidenceHash !== null) {
            ToolContractGuard::sha256($evidenceHash, 'Procedural evidence hash');
        }
        if (! array_is_list($retryProviderCallIds)) {
            throw new InvalidArgumentException('Procedural retry call IDs must be a list.');
        }
        $seen = [];
        foreach ($retryProviderCallIds as $callId) {
            $callId = ToolContractGuard::nonEmptyString($callId, 'Procedural retry call ID', 256);
            if (isset($seen[$callId])) {
                throw new InvalidArgumentException('Procedural retry call IDs must be unique.');
            }
            $seen[$callId] = true;
        }
    }

    public function isRetry(string $providerCallId): bool
    {
        return in_array($providerCallId, $this->retryProviderCallIds, true);
    }

    public function deadlineExceeded(): bool
    {
        return new \DateTimeImmutable($this->observedAt) >= new \DateTimeImmutable($this->deadlineAt);
    }

    public function forNode(string $nodeId, ProceduralToolSpec $spec, ToolCall $call, int $stateVersion): ToolExecutionContext
    {
        ToolContractGuard::jsonSafeNonNegativeInteger($stateVersion, 'Procedural node state version');
        $idempotencyMaterial = ProceduralLoopGuard::canonicalJson([
            'user_id' => $this->userId,
            'chat_session_id' => $this->chatSessionId,
            'run_id' => $this->runId,
            'turn_id' => $this->turnId,
            'node_id' => $nodeId,
            'provider_call_id' => $call->providerCallId,
            'tool' => $call->name,
        ]);

        return new ToolExecutionContext(
            userId: $this->userId,
            chatSessionId: $this->chatSessionId,
            runId: $this->runId,
            turnId: $this->turnId,
            browserSessionId: $this->browserSessionId,
            nodeId: $nodeId,
            capability: $spec->capability,
            risk: $spec->risk,
            stateVersion: $stateVersion,
            deadlineAt: $this->deadlineAt,
            idempotencyKey: 'sha256:'.hash('sha256', $idempotencyMaterial),
        );
    }
}
