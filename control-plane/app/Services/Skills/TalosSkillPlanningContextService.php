<?php

declare(strict_types=1);

namespace App\Services\Skills;

use App\Models\TalosSkill;

final class TalosSkillPlanningContextService
{
    /**
     * @return array<string, mixed>
     */
    public function context(): array
    {
        $skills = TalosSkill::query()
            ->where('is_enabled', true)
            ->where('review_status', 'approved')
            ->where('eval_status', 'passed')
            ->orderBy('name')
            ->get()
            ->map(fn (TalosSkill $skill): array => [
                'id' => $skill->id,
                'name' => $skill->name,
                'display_name' => $skill->display_name,
                'trigger' => $skill->trigger,
                'content' => $skill->content,
                'input_schema' => $skill->input_schema,
                'output_schema' => $skill->output_schema,
                'allowed_tools' => $skill->allowed_tools ?? [],
                'risk_level' => $skill->risk_level,
                'review_status' => $skill->review_status,
                'eval_status' => $skill->eval_status,
            ])
            ->values()
            ->all();

        return [
            'source' => 'talos_skill_registry',
            'policy' => [
                'approved_only' => true,
                'eval_pass_required' => true,
                'allowed_tools_are_capability_boundary' => true,
            ],
            'skills' => $skills,
        ];
    }
}
