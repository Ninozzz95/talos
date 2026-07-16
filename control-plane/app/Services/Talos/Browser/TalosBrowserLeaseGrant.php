<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

final readonly class TalosBrowserLeaseGrant
{
    public function __construct(
        public string $leaseId,
        public string $ownerType,
        public string $ownerId,
        public string $status,
        public string $expiresAt,
        public ?string $fencingToken,
    ) {}

    /** @return array<string, mixed> */
    public function toApiArray(): array
    {
        $data = [
            'id' => $this->leaseId,
            'owner_type' => $this->ownerType,
            'owner_id' => $this->ownerId,
            'status' => $this->status,
            'expires_at' => $this->expiresAt,
            'token_issued' => $this->fencingToken !== null,
        ];
        if ($this->fencingToken !== null) {
            $data['fencing_token'] = $this->fencingToken;
        }

        return $data;
    }
}
