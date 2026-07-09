<?php

declare(strict_types=1);

namespace App\Services\Skills;

use App\Models\TalosSkill;

final class TalosSkillPlanningContextService
{
    private const MAX_SELECTED_SKILLS = 3;

    /**
     * @return array<string, mixed>
     */
    public function context(): array
    {
        [$eligible, $excluded] = $this->partitionSkills();

        return [
            'source' => 'talos_skill_registry',
            'policy' => [
                'approved_only' => true,
                'eval_pass_required' => true,
                'allowed_tools_are_capability_boundary' => true,
                'untrusted_imports_excluded' => true,
                'internal_dev_excluded' => true,
                'exclusion_reasons_are_reported' => true,
            ],
            'skills' => $eligible
                ->sortBy('name')
                ->map(fn (TalosSkill $skill): array => $this->skillPayload($skill, includeContent: true))
                ->values()
                ->all(),
            'excluded_skills' => $this->sortExcluded($excluded),
        ];
    }

    /**
     * @return array{plan: array<string, mixed>, validator_context: array<string, mixed>}
     */
    public function selectionForPrompt(string $prompt): array
    {
        [$eligible, $excluded] = $this->partitionSkills();
        $promptNeedle = mb_strtolower($prompt);
        $selected = $eligible
            ->filter(fn (TalosSkill $skill): bool => $this->matchesPrompt($skill, $promptNeedle))
            ->sortBy([
                ['risk_level', 'asc'],
                ['name', 'asc'],
            ])
            ->take(self::MAX_SELECTED_SKILLS)
            ->values();

        $selectedIds = $selected->pluck('id')->all();
        $triggerMismatches = $eligible
            ->reject(fn (TalosSkill $skill): bool => in_array($skill->id, $selectedIds, true))
            ->map(fn (TalosSkill $skill): array => $this->excludedPayload($skill, 'trigger_mismatch'))
            ->values()
            ->all();

        $plan = [
            'source' => 'talos_skill_registry',
            'selection_policy' => [
                'max_selected_skills' => self::MAX_SELECTED_SKILLS,
                'match_strategy' => 'case_insensitive_trigger_contains',
                'approved_only' => true,
                'eval_pass_required' => true,
                'untrusted_imports_excluded' => true,
            ],
            'selected_skills' => $selected
                ->map(fn (TalosSkill $skill): array => $this->skillPayload($skill, includeContent: false))
                ->values()
                ->all(),
            'excluded_skills' => array_values(array_merge(
                $triggerMismatches,
                $this->sortExcluded($excluded),
            )),
        ];

        return [
            'plan' => $plan,
            'validator_context' => [
                'source' => 'talos_skill_registry',
                'selection_policy' => $plan['selection_policy'],
                'selected_skills' => $selected
                    ->map(fn (TalosSkill $skill): array => $this->skillPayload($skill, includeContent: true))
                    ->values()
                    ->all(),
            ],
        ];
    }

    /**
     * @return array{0: \Illuminate\Support\Collection<int, TalosSkill>, 1: list<array<string, mixed>>}
     */
    private function partitionSkills(): array
    {
        $eligible = collect();
        $excluded = [];

        TalosSkill::query()
            ->orderBy('created_at')
            ->orderBy('id')
            ->get()
            ->each(function (TalosSkill $skill) use ($eligible, &$excluded): void {
                $reason = $this->exclusionReason($skill);
                if ($reason === null) {
                    $eligible->push($skill);
                    return;
                }

                $excluded[] = $this->excludedPayload($skill, $reason);
            });

        return [$eligible, $excluded];
    }

    private function exclusionReason(TalosSkill $skill): ?string
    {
        if (! $skill->is_enabled) {
            return 'disabled';
        }

        if ($skill->review_status === 'rejected') {
            return 'review_rejected';
        }

        if ($skill->review_status === 'quarantined') {
            return 'review_quarantined';
        }

        if ($skill->review_status !== 'approved') {
            return 'review_not_approved';
        }

        if ($skill->eval_status !== 'passed') {
            return 'eval_not_passed';
        }

        $metadata = is_array($skill->metadata) ? $skill->metadata : [];
        if (($metadata['internal_dev'] ?? false) === true) {
            return 'internal_dev';
        }

        if ($skill->source_type === 'imported' && ($metadata['trusted_import'] ?? false) !== true) {
            return 'untrusted_import';
        }

        return null;
    }

    /**
     * @return array<string, mixed>
     */
    private function skillPayload(TalosSkill $skill, bool $includeContent): array
    {
        $payload = [
            'id' => $skill->id,
            'name' => $skill->name,
            'display_name' => $skill->display_name,
            'trigger' => $skill->trigger,
            'input_schema' => $skill->input_schema,
            'output_schema' => $skill->output_schema,
            'allowed_tools' => $skill->allowed_tools ?? [],
            'risk_level' => $skill->risk_level,
            'review_status' => $skill->review_status,
            'eval_status' => $skill->eval_status,
            'source_type' => $skill->source_type,
        ];

        if ($includeContent) {
            $payload['content'] = $skill->content;
        }

        return $payload;
    }

    /**
     * @return array<string, mixed>
     */
    private function excludedPayload(TalosSkill $skill, string $reason): array
    {
        return [
            'id' => $skill->id,
            'name' => $skill->name,
            'display_name' => $skill->display_name,
            'reason' => $reason,
            'review_status' => $skill->review_status,
            'eval_status' => $skill->eval_status,
            'risk_level' => $skill->risk_level,
            'source_type' => $skill->source_type,
        ];
    }

    private function matchesPrompt(TalosSkill $skill, string $promptNeedle): bool
    {
        $trigger = mb_strtolower(trim((string) $skill->trigger));
        if ($trigger === '') {
            return false;
        }

        return str_contains($promptNeedle, $trigger);
    }

    /**
     * @param list<array<string, mixed>> $excluded
     * @return list<array<string, mixed>>
     */
    private function sortExcluded(array $excluded): array
    {
        $priority = [
            'disabled' => 10,
            'review_rejected' => 20,
            'review_quarantined' => 30,
            'review_not_approved' => 40,
            'eval_not_passed' => 50,
            'untrusted_import' => 60,
            'internal_dev' => 70,
            'trigger_mismatch' => 80,
        ];

        usort($excluded, static function (array $left, array $right) use ($priority): int {
            $leftReason = (string) ($left['reason'] ?? '');
            $rightReason = (string) ($right['reason'] ?? '');
            $leftRank = $priority[$leftReason] ?? 999;
            $rightRank = $priority[$rightReason] ?? 999;

            return $leftRank <=> $rightRank ?: strcmp((string) ($left['name'] ?? ''), (string) ($right['name'] ?? ''));
        });

        return array_values($excluded);
    }
}
