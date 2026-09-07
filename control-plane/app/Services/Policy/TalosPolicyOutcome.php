<?php

declare(strict_types=1);

namespace App\Services\Policy;

final readonly class TalosPolicyOutcome
{
    public function __construct(
        public TalosCapability $capability,
        public TalosCapabilityRisk $risk,
        public TalosCapabilityDecision $decision,
        public bool $allowed,
        public bool $requiresApproval,
        public string $reason,
        public int $revision,
        public ?string $sessionId = null,
        public ?string $expiresAt = null,
    ) {}

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'capability' => $this->capability->value,
            'risk' => $this->risk->value,
            'decision' => $this->decision->value,
            'allowed' => $this->allowed,
            'requires_approval' => $this->requiresApproval,
            'reason' => $this->reason,
            'revision' => $this->revision,
            'session_id' => $this->sessionId,
            'expires_at' => $this->expiresAt,
        ];
    }
}
