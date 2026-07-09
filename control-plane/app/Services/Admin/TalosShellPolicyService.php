<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\TalosApiToken;
use App\Models\TalosAuditEvent;

final class TalosShellPolicyService
{
    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    public function preview(array $payload, TalosApiToken $token): array
    {
        $decision = $this->denyDecision($payload, 'talos.shell.exec');
        $this->audit('shell.preview.denied', $decision, $payload, $token);

        return $decision;
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    public function execute(array $payload, TalosApiToken $token): array
    {
        $decision = $this->denyDecision($payload, 'talos.shell.exec');
        $this->audit('shell.execute.denied', $decision, $payload, $token);

        return $decision;
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private function denyDecision(array $payload, string $requiredScope): array
    {
        $command = trim((string) ($payload['command'] ?? ''));

        return [
            'allowed' => false,
            'decision' => 'deny',
            'reason' => 'host_shell_execution_disabled',
            'required_scope' => $requiredScope,
            'executed' => false,
            'command_hash' => hash('sha256', $command),
            'command_length' => strlen($command),
            'timeout_seconds' => (int) ($payload['timeout_seconds'] ?? 30),
            'use_pty' => (bool) ($payload['use_pty'] ?? false),
            'use_tmux' => (bool) ($payload['use_tmux'] ?? false),
            'policy' => [
                'default_decision' => 'deny',
                'host_execution_enabled' => false,
                'plain_command_not_persisted' => true,
            ],
        ];
    }

    /**
     * @param array<string, mixed> $decision
     * @param array<string, mixed> $payload
     */
    private function audit(string $eventType, array $decision, array $payload, TalosApiToken $token): void
    {
        TalosAuditEvent::record($eventType, 'shell', null, [
            'decision' => $decision['decision'],
            'reason' => $decision['reason'],
            'required_scope' => $decision['required_scope'],
            'executed' => false,
            'command_hash' => $decision['command_hash'],
            'command_length' => $decision['command_length'],
            'timeout_seconds' => $decision['timeout_seconds'],
            'use_pty' => $decision['use_pty'],
            'use_tmux' => $decision['use_tmux'],
            'workspace' => isset($payload['workspace']) ? hash('sha256', (string) $payload['workspace']) : null,
        ], 'talos_api_token', (string) $token->id);
    }
}
