<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use InvalidArgumentException;
use Kadmos\Browser\Recovery\BrowserRecoveryStrategy;

final readonly class TalosBrowserRecoveryDecision
{
    public function __construct(
        public BrowserRecoveryStrategy $strategy,
        public string $reasonCode,
        public string $remediation,
        public string $taskId,
        public ?string $resultingTaskId = null,
    ) {
        foreach ([
            'reason code' => [$reasonCode, 128],
            'remediation' => [$remediation, 512],
            'task ID' => [$taskId, 255],
        ] as $label => [$value, $maximum]) {
            if (trim($value) === '' || mb_strlen($value) > $maximum) {
                throw new InvalidArgumentException("Browser recovery {$label} is invalid.");
            }
        }
        if ($resultingTaskId !== null && (trim($resultingTaskId) === '' || mb_strlen($resultingTaskId) > 255)) {
            throw new InvalidArgumentException('Browser recovery resulting task ID is invalid.');
        }
    }

    /** @return array<string, mixed> */
    public function toApiArray(): array
    {
        return [
            'strategy' => $this->strategy->value,
            'reason_code' => $this->reasonCode,
            'remediation' => $this->remediation,
            'task_id' => $this->taskId,
            'resulting_task_id' => $this->resultingTaskId,
        ];
    }
}
