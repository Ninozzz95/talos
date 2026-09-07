<?php

declare(strict_types=1);

namespace App\Services\Tools;

use App\Models\TalosTool;
use App\Services\Talos\Agent\TalosProceduralToolRegistry;
use Kadmos\Alignment\Contract\AlignmentContractException;

final class TalosToolPlanningContextService
{
    /**
     * @return array<string, mixed>
     */
    public function context(): array
    {
        $records = TalosTool::query()
            ->with('connector')
            ->orderBy('name')
            ->get();
        $tools = [];
        $excluded = [];
        $bundled = [];
        $reservedNames = [];
        foreach (TalosProceduralToolRegistry::contracts() as $contract) {
            $value = $contract->toArray();
            $name = (string) $value['name'];
            $reservedNames[$name] = true;
            $availability = TalosToolContractMapper::desktopAvailability($contract);

            if (! $availability['available']) {
                $excluded[] = [
                    'name' => $name,
                    'reason' => $availability['reason'] ?? 'unavailable',
                ];
                continue;
            }

            $bundled[] = [
                'name' => $name,
                'display_name' => $value['title'],
                'description' => $value['description'],
                'input_schema' => $value['input_schema'],
                'risk_level' => $value['risk'],
                'capability' => $value['capabilities'][0],
                'connector' => null,
                'contract' => $value,
            ];
        }

        foreach ($records as $tool) {
            if (isset($reservedNames[$tool->name])) {
                $excluded[] = [
                    'name' => $tool->name,
                    'reason' => 'bundled_name_reserved',
                ];
                continue;
            }

            try {
                $contract = $tool->toContractV1();
                $api = $tool->toApiArray();
                $availability = $api['availability'];
            } catch (AlignmentContractException $exception) {
                $excluded[] = [
                    'name' => $tool->name,
                    'reason' => 'contract_invalid',
                    'error_code' => $exception->errorCode,
                ];
                continue;
            }

            if (($availability['available'] ?? false) !== true) {
                $excluded[] = [
                    'name' => $tool->name,
                    'reason' => $availability['reason'] ?? 'unavailable',
                ];
                continue;
            }

            $tools[] = [
                'name' => $tool->name,
                'display_name' => $tool->display_name,
                'description' => $tool->description,
                'input_schema' => $tool->input_schema,
                'risk_level' => $tool->risk_level,
                'capability' => $tool->capability,
                'connector' => [
                    'id' => $tool->connector?->id,
                    'key' => $tool->connector?->key,
                    'display_name' => $tool->connector?->display_name,
                    'health_status' => $tool->connector?->health_status,
                ],
                'contract' => $contract->toArray(),
            ];
        }
        array_push($tools, ...$bundled);

        return [
            'source' => 'talos_tool_registry',
            'policy' => [
                'disabled_tools_excluded' => true,
                'disabled_connectors_excluded' => true,
                'unsupported_execution_excluded' => true,
                'tool_outputs_are_untrusted' => true,
            ],
            'tools' => $tools,
            'excluded_tools' => $excluded,
        ];
    }
}
