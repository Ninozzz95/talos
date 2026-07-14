<?php

declare(strict_types=1);

namespace Kadmos\Tool;

use InvalidArgumentException;
use Kadmos\NodeStatus;
use Throwable;

final readonly class ProceduralNode
{
    /** @param list<string> $dependencies */
    public function __construct(
        public string $id,
        public string $type,
        public ToolCall $call,
        public ToolExecutionContext $context,
        public array $dependencies,
        public string $fingerprint,
        public bool $requiresApproval,
        public bool $producesEvidence,
    ) {
        ToolContractGuard::nonEmptyString($id, 'Procedural node ID', 256);
        ToolContractGuard::nonEmptyString($type, 'Procedural node type', 128);
        ToolContractGuard::sha256($fingerprint, 'Procedural node fingerprint');
        if (! array_is_list($dependencies)) {
            throw new InvalidArgumentException('Procedural node dependencies must be a list.');
        }
        $seen = [];
        foreach ($dependencies as $dependency) {
            $dependency = ToolContractGuard::nonEmptyString($dependency, 'Procedural node dependency', 256);
            if ($dependency === $id || isset($seen[$dependency])) {
                throw new InvalidArgumentException('Procedural node dependencies must be unique and cannot reference the node itself.');
            }
            $seen[$dependency] = true;
        }
        if ($context->nodeId !== $id || $call->providerCallId === '') {
            throw new InvalidArgumentException('Procedural node context and call correlation are invalid.');
        }
    }

    /** @return array<string, mixed> */
    public function payload(): array
    {
        return [
            'call' => $this->call->toWireArray(),
            'context' => $this->context->toArray(),
            'fingerprint' => $this->fingerprint,
        ];
    }

    /** @param array{status?: mixed, output_summary?: mixed, raw_output?: mixed} $outcome */
    public function resultFromOutcome(array $outcome): ToolResult
    {
        $result = null;
        try {
            $raw = $outcome['raw_output'] ?? null;
            if ($raw instanceof ToolResult) {
                if ($raw->toolUseId !== $this->call->providerCallId) {
                    throw new InvalidArgumentException('Tool result correlation mismatch.');
                }
                $result = $raw;
            }
            if ($result === null && is_string($raw)) {
                $result = ToolResult::fromJson($raw, $this->call->providerCallId);
            }
            if ($result === null && is_array($raw)) {
                $result = ToolResult::fromArray($raw, $this->call->providerCallId);
            }
        } catch (Throwable) {
            // Invalid worker output is converted into a controlled model-visible result.
        }

        $succeeded = ($outcome['status'] ?? null) === NodeStatus::SUCCESS;
        if ($result instanceof ToolResult && $result->isError !== $succeeded) {
            return $result;
        }
        if (! $succeeded) {
            return ToolResult::error($this->call->providerCallId, 'TALOS_TOOL_EXECUTION_FAILED', 'Tool execution failed.');
        }

        return ToolResult::error($this->call->providerCallId, 'TALOS_TOOL_RESULT_INVALID', 'Tool execution returned an invalid result.');
    }
}
