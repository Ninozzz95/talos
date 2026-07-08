<?php

declare(strict_types=1);

namespace App\Services\Tools;

use App\Models\TalosTool;

final class TalosToolPlanningContextService
{
    /**
     * @return array<string, mixed>
     */
    public function context(): array
    {
        $tools = TalosTool::query()
            ->with('connector')
            ->availableForPlanning()
            ->orderBy('name')
            ->get()
            ->map(fn (TalosTool $tool): array => [
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
            ])
            ->values()
            ->all();

        return [
            'source' => 'talos_tool_registry',
            'policy' => [
                'disabled_tools_excluded' => true,
                'disabled_connectors_excluded' => true,
                'tool_outputs_are_untrusted' => true,
            ],
            'tools' => $tools,
        ];
    }
}
