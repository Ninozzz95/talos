<?php

declare(strict_types=1);

namespace Kadmos\Tool;

use InvalidArgumentException;

final readonly class ToolExecutionContext
{
    public const SCHEMA_VERSION = 'talos_tool_execution_context_v1';

    public function __construct(
        public string $userId,
        public string $chatSessionId,
        public string $runId,
        public string $turnId,
        public ?string $browserSessionId,
        public string $nodeId,
        public string $capability,
        public string $risk,
        public int $stateVersion,
        public string $deadlineAt,
        public string $idempotencyKey,
    ) {
        ToolContractGuard::nonEmptyString($userId, 'Tool execution user ID', 256);
        ToolContractGuard::nonEmptyString($chatSessionId, 'Tool execution chat session ID', 256);
        ToolContractGuard::nonEmptyString($runId, 'Tool execution run ID', 256);
        ToolContractGuard::nonEmptyString($turnId, 'Tool execution turn ID', 256);
        ToolContractGuard::nullableString($browserSessionId, 'Tool execution browser session ID', 256);
        ToolContractGuard::nonEmptyString($nodeId, 'Tool execution node ID', 256);
        ToolContractGuard::nonEmptyString($capability, 'Tool execution capability', 128);
        ToolContractGuard::nonEmptyString($risk, 'Tool execution risk', 64);
        ToolContractGuard::jsonSafeNonNegativeInteger($stateVersion, 'Tool execution state version');
        ToolContractGuard::iso8601($deadlineAt, 'Tool execution deadline');
        ToolContractGuard::sha256($idempotencyKey, 'Tool execution idempotency key');
    }

    /** @param array<string, mixed> $value */
    public static function fromArray(array $value): self
    {
        ToolContractGuard::exactKeys(
            $value,
            [
                'schema_version',
                'user_id',
                'chat_session_id',
                'run_id',
                'turn_id',
                'browser_session_id',
                'node_id',
                'capability',
                'risk',
                'state_version',
                'deadline_at',
                'idempotency_key',
            ],
            [],
            'Tool execution context',
        );
        if (($value['schema_version'] ?? null) !== self::SCHEMA_VERSION) {
            throw new InvalidArgumentException('Tool execution context schema_version is unsupported.');
        }

        return new self(
            userId: ToolContractGuard::nonEmptyString($value['user_id'], 'Tool execution user ID', 256),
            chatSessionId: ToolContractGuard::nonEmptyString($value['chat_session_id'], 'Tool execution chat session ID', 256),
            runId: ToolContractGuard::nonEmptyString($value['run_id'], 'Tool execution run ID', 256),
            turnId: ToolContractGuard::nonEmptyString($value['turn_id'], 'Tool execution turn ID', 256),
            browserSessionId: ToolContractGuard::nullableString($value['browser_session_id'], 'Tool execution browser session ID', 256),
            nodeId: ToolContractGuard::nonEmptyString($value['node_id'], 'Tool execution node ID', 256),
            capability: ToolContractGuard::nonEmptyString($value['capability'], 'Tool execution capability', 128),
            risk: ToolContractGuard::nonEmptyString($value['risk'], 'Tool execution risk', 64),
            stateVersion: ToolContractGuard::jsonSafeNonNegativeInteger($value['state_version'], 'Tool execution state version'),
            deadlineAt: ToolContractGuard::iso8601($value['deadline_at'], 'Tool execution deadline'),
            idempotencyKey: ToolContractGuard::sha256($value['idempotency_key'], 'Tool execution idempotency key'),
        );
    }

    public static function fromJson(string $json): self
    {
        return self::fromArray(ToolWireDecoder::context($json));
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'schema_version' => self::SCHEMA_VERSION,
            'user_id' => $this->userId,
            'chat_session_id' => $this->chatSessionId,
            'run_id' => $this->runId,
            'turn_id' => $this->turnId,
            'browser_session_id' => $this->browserSessionId,
            'node_id' => $this->nodeId,
            'capability' => $this->capability,
            'risk' => $this->risk,
            'state_version' => $this->stateVersion,
            'deadline_at' => $this->deadlineAt,
            'idempotency_key' => $this->idempotencyKey,
        ];
    }

    /** @return array<string, mixed> */
    public function toRedactedArray(): array
    {
        return ToolContractGuard::redact($this->toArray());
    }
}
