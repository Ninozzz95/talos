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
