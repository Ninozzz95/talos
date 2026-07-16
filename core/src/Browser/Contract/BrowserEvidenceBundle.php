<?php

declare(strict_types=1);

namespace Kadmos\Browser\Contract;

final readonly class BrowserEvidenceBundle
{
    /**
     * @param array{frame_id: string, viewport_width: int, viewport_height: int, device_pixel_ratio: int|float, scroll_x: int|float, scroll_y: int|float} $frame
     * @param list<array{claim_id: string, kind: string, value: string, source_artifact_id: string}> $claims
     */
    private function __construct(
        public string $evidenceId,
        public string $taskId,
        public string $actionId,
        public int $workerStateVersion,
        public string $url,
        public string $title,
        public string $capturedAt,
        public array $frame,
        public ?string $snapshotArtifactId,
        public ?string $screenshotArtifactId,
        public ?string $beforeEvidenceId,
        public string $integritySha256,
        public array $claims,
    ) {}

    public static function fromJson(string $json): self
    {
        return self::fromValidatedArray(BrowserContractDecoder::decode($json, 'browser-evidence-bundle', 'Browser evidence bundle'));
    }

    /** @param array<string, mixed> $value */
    public static function fromArray(array $value): self
    {
        return self::fromJson(BrowserContractDecoder::encodeServerArray($value, ['frame'], ['claims']));
    }

    public function verifyAgainst(BrowserAction $action): void
    {
        BrowserContractGuard::require($this->taskId === $action->taskId, 'Browser evidence task does not match its action.');
        BrowserContractGuard::require($this->actionId === $action->actionId, 'Browser evidence action identity does not match.');
        BrowserContractGuard::require(
            $this->workerStateVersion >= $action->expectedStateVersion,
            'Browser evidence worker state predates the action expectation.',
        );
        BrowserContractGuard::require(
            in_array($action->status, [
                BrowserActionStatus::Dispatched,
                BrowserActionStatus::Observed,
                BrowserActionStatus::EvidenceCommitted,
                BrowserActionStatus::Verified,
            ], true),
            'Browser evidence cannot verify an action that was not dispatched.',
        );
    }

    /** @return array<string, mixed> */
    public function toCanonicalArray(): array
    {
        return [
            'schema_version' => BrowserContractVersion::EVIDENCE,
            'evidence_id' => $this->evidenceId,
            'task_id' => $this->taskId,
            'action_id' => $this->actionId,
            'worker_state_version' => $this->workerStateVersion,
            'url' => $this->url,
            'title' => $this->title,
            'captured_at' => $this->capturedAt,
            'frame' => BrowserContractGuard::object($this->frame),
            'snapshot_artifact_id' => $this->snapshotArtifactId,
            'screenshot_artifact_id' => $this->screenshotArtifactId,
            'before_evidence_id' => $this->beforeEvidenceId,
            'integrity_sha256' => $this->integritySha256,
            'claims' => BrowserContractGuard::objectList($this->claims),
        ];
    }

    /** @param array<string, mixed> $value */
    private static function fromValidatedArray(array $value): self
    {
        return new self(
            $value['evidence_id'],
            $value['task_id'],
            $value['action_id'],
            $value['worker_state_version'],
            $value['url'],
            $value['title'],
            $value['captured_at'],
            $value['frame'],
            $value['snapshot_artifact_id'],
            $value['screenshot_artifact_id'],
            $value['before_evidence_id'],
            $value['integrity_sha256'],
            $value['claims'],
        );
    }
}
