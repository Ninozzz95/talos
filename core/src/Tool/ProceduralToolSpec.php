<?php

declare(strict_types=1);

namespace Kadmos\Tool;

use InvalidArgumentException;

final readonly class ProceduralToolSpec
{
    public function __construct(
        public string $toolName,
        public string $nodeType,
        public string $capability,
        public string $risk,
        public bool $mutatesState,
        public bool $parallelSafe,
        public bool $requiresApproval,
        public bool $producesEvidence,
        public array $actions = ['read'],
        public string $confirmation = 'policy',
    ) {
        ToolContractGuard::nonEmptyString($toolName, 'Procedural tool name', 128);
        ToolContractGuard::nonEmptyString($nodeType, 'Procedural node type', 128);
        ToolContractGuard::nonEmptyString($capability, 'Procedural capability', 128);
        if (preg_match('/\A[A-Z][A-Z0-9_]*\z/', $nodeType) !== 1) {
            throw new InvalidArgumentException('Procedural node type must be an uppercase identifier.');
        }
        if (! in_array($risk, ['low', 'medium', 'high', 'critical'], true)) {
            throw new InvalidArgumentException('Procedural tool risk is unsupported.');
        }
        if ($mutatesState && $parallelSafe) {
            throw new InvalidArgumentException('A state-mutating procedural tool cannot be parallel-safe.');
        }
        if (in_array($risk, ['high', 'critical'], true) && ! $requiresApproval) {
            throw new InvalidArgumentException('High-risk procedural tools require HMI approval.');
        }
        if (! array_is_list($actions) || $actions === [] || count($actions) !== count(array_unique($actions))) {
            throw new InvalidArgumentException('Procedural tool actions must be a non-empty unique list.');
        }
        foreach ($actions as $action) {
            if (! is_string($action) || ! in_array($action, ['read', 'write', 'outbound'], true)) {
                throw new InvalidArgumentException('Procedural tool action is unsupported.');
            }
        }
        if (! in_array($confirmation, ['policy', 'always'], true)) {
            throw new InvalidArgumentException('Procedural tool confirmation mode is unsupported.');
        }
    }

    /** @return array{mutates_state: bool, parallel_safe: bool, requires_approval: bool, produces_evidence: bool} */
    public function effects(): array
    {
        return [
            'mutates_state' => $this->mutatesState,
            'parallel_safe' => $this->parallelSafe,
            'requires_approval' => $this->requiresApproval,
            'produces_evidence' => $this->producesEvidence,
        ];
    }
}
