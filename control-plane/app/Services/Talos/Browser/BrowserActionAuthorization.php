<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

final class BrowserActionAuthorization
{
    /** @param array<string, string> $attestation */
    private function __construct(
        private readonly string $actionId,
        private readonly array $attestation,
    ) {}

    public static function policy(string $actionId): self
    {
        self::assertActionId($actionId);

        return new self($actionId, [
            'kind' => 'policy',
            'policy' => 'talos_browser_semantic_click',
        ]);
    }

    public static function userApproval(
        string $actionId,
        string $approvalId,
        string $approvalRequestSha256,
        string $executionLeaseToken,
    ): self {
        self::assertActionId($actionId);
        if (preg_match('/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/D', $approvalId) !== 1
            || preg_match('/^sha256:[a-f0-9]{64}$/D', $approvalRequestSha256) !== 1
            || $executionLeaseToken === ''
            || strlen($executionLeaseToken) > 4096) {
            throw self::invalid();
        }

        return new self($actionId, [
            'kind' => 'user_approval',
            'approval_id' => $approvalId,
            'approval_request_sha256' => $approvalRequestSha256,
            'execution_lease_sha256' => 'sha256:'.hash('sha256', $executionLeaseToken),
        ]);
    }

    /** @return array<string, string> */
    public function toCapabilityAttestation(): array
    {
        return $this->attestation;
    }

    public function actionId(): string
    {
        return $this->actionId;
    }

    private static function assertActionId(string $actionId): void
    {
        if ($actionId === ''
            || strlen($actionId) > 256
            || preg_match('/[\x00-\x1F\x7F]/', $actionId) === 1) {
            throw self::invalid();
        }
    }

    private static function invalid(): BrowserWorkerException
    {
        return new BrowserWorkerException(
            'TALOS_BROWSER_ACTION_CAPABILITY_INVALID',
            'Browser action authorization is invalid.',
        );
    }
}
