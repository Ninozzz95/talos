<?php

declare(strict_types=1);

namespace App\Services\FaultExplaining;

final class FaultExplainerService
{
    /**
     * @param array{field: string, expected: string, received: string, message: string} $fault
     * @return array<string, mixed>
     */
    public function explain(array $fault): array
    {
        $field = $fault['field'];

        if (str_contains($field, 'node_id')) {
            $plain = 'The model tried to edit a node that does not exist in the workflow.';
            $recovery = 'Create the node first, choose an existing node_id, or remove the mutation from the batch.';
        } elseif (str_contains($field, 'payload')) {
            $plain = 'The model supplied a payload value that does not match the required contract.';
            $recovery = 'Correct the payload field and re-run validation before execution.';
        } else {
            $plain = 'The model produced a mutation that does not match the validated execution contract.';
            $recovery = 'Correct the invalid field and validate the batch again before execution.';
        }

        return [
            'fault' => $fault,
            'plain_language' => $plain,
            'execution_consequence' => 'Kadmos rejected the mutation before execution, so no worker or external system was touched.',
            'recovery_path' => $recovery,
        ];
    }
}
