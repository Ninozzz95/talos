<?php

declare(strict_types=1);

namespace Kadmos\Tool;

use InvalidArgumentException;

final readonly class ProviderTurnState
{
    /**
     * @param array<string, mixed> $nativeState
     * @param list<string> $pendingToolCallIds
     */
    public function __construct(
        public string $provider,
        public string $adapterVersion,
        public ?string $responseId,
        public string $continuationKind,
        private array $nativeState,
        public array $pendingToolCallIds,
    ) {
        ToolContractGuard::nonEmptyString($provider, 'Provider turn state provider', 64);
        ToolContractGuard::nonEmptyString($adapterVersion, 'Provider turn adapter version', 128);
        ToolContractGuard::nullableString($responseId, 'Provider turn response ID', 256);
        ToolContractGuard::nonEmptyString($continuationKind, 'Provider turn continuation kind', 64);
        ToolContractGuard::objectArray($nativeState, 'Provider native continuation state');
        ToolContractGuard::jsonValue($nativeState, 'Provider native continuation state');
        ToolContractGuard::listArray($pendingToolCallIds, 'Pending provider tool call IDs');
        $seen = [];
        foreach ($pendingToolCallIds as $callId) {
            $callId = ToolContractGuard::nonEmptyString($callId, 'Pending provider tool call ID', 256);
            if (isset($seen[$callId])) {
                throw new InvalidArgumentException('Pending provider tool call IDs must be unique.');
            }
            $seen[$callId] = true;
        }
    }

    /** @return array<string, mixed> */
    public function nativeStateFor(string $adapterVersion): array
    {
        if (! hash_equals($this->adapterVersion, $adapterVersion)) {
            throw new InvalidArgumentException('Provider turn state belongs to another adapter version.');
        }

        return $this->nativeState;
    }

    /** @return array<string, mixed> */
    public function toAuditArray(): array
    {
        return [
            'provider' => $this->provider,
            'adapter_version' => $this->adapterVersion,
            'response_id' => $this->responseId,
            'continuation_kind' => $this->continuationKind,
            'pending_tool_call_ids' => $this->pendingToolCallIds,
            'native_state_sha256' => 'sha256:'.hash('sha256', json_encode($this->nativeState, JSON_THROW_ON_ERROR)),
        ];
    }
}
