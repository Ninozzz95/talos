<?php

declare(strict_types=1);

namespace App\Services\Policy;

final readonly class TalosPolicyOutcome
{
    public function __construct(
        public TalosCapability $capability,
        public TalosCapabilityRisk $risk,
        public TalosCapabilityDecision $decision,
        /** @var list<string> */
        public array $actions,
        public bool $allowed,
        public bool $requiresApproval,
        public string $reason,
        public int $revision,
        public ?string $grantId = null,
        public ?string $grantScope = null,
        public ?string $toolId = null,
        public ?string $expiresAt = null,
    ) {}

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'capability' => $this->capability->value,
            'risk' => $this->risk->value,
            'decision' => $this->decision->value,
            'actions' => $this->actions,
            'allowed' => $this->allowed,
            'requires_approval' => $this->requiresApproval,
            'reason' => $this->reason,
            'revision' => $this->revision,
            'grant_id' => $this->grantId,
            'grant_scope' => $this->grantScope,
            'tool_id' => $this->toolId,
            'expires_at' => $this->expiresAt,
        ];
    }
}
