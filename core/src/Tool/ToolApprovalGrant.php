<?php

declare(strict_types=1);

namespace Kadmos\Tool;

final readonly class ToolApprovalGrant
{
    public function __construct(
        public string $approvalId,
        public string $nodeId,
        public string $actorId,
        public string $capability,
        public string $planHash,
        public string $approvedAt,
    ) {
        ToolContractGuard::nonEmptyString($approvalId, 'Tool approval ID', 256);
        ToolContractGuard::nonEmptyString($nodeId, 'Tool approval node ID', 256);
        ToolContractGuard::nonEmptyString($actorId, 'Tool approval actor ID', 256);
        ToolContractGuard::nonEmptyString($capability, 'Tool approval capability', 128);
        ToolContractGuard::sha256($planHash, 'Tool approval plan hash');
        ToolContractGuard::iso8601($approvedAt, 'Tool approval timestamp');
    }

    /** @param array<string, mixed> $value */
    public static function fromArray(array $value): self
    {
        ToolContractGuard::exactKeys(
            $value,
            ['approval_id', 'node_id', 'actor_id', 'capability', 'plan_hash', 'approved_at'],
            [],
            'Tool approval grant',
        );

        return new self(
            approvalId: ToolContractGuard::nonEmptyString($value['approval_id'], 'Tool approval ID', 256),
            nodeId: ToolContractGuard::nonEmptyString($value['node_id'], 'Tool approval node ID', 256),
            actorId: ToolContractGuard::nonEmptyString($value['actor_id'], 'Tool approval actor ID', 256),
            capability: ToolContractGuard::nonEmptyString($value['capability'], 'Tool approval capability', 128),
            planHash: ToolContractGuard::sha256($value['plan_hash'], 'Tool approval plan hash'),
            approvedAt: ToolContractGuard::iso8601($value['approved_at'], 'Tool approval timestamp'),
        );
    }

    /** @return array<string, string> */
    public function toArray(): array
    {
        return [
            'approval_id' => $this->approvalId,
            'node_id' => $this->nodeId,
            'actor_id' => $this->actorId,
            'capability' => $this->capability,
            'plan_hash' => $this->planHash,
            'approved_at' => $this->approvedAt,
        ];
    }
}
