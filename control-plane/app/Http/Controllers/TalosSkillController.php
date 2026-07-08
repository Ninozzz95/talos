<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosSkill;
use App\Services\Skills\TalosSkillPlanningContextService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

final class TalosSkillController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $skills = TalosSkill::query()
            ->when(! $request->boolean('include_disabled'), fn ($query) => $query->where('is_enabled', true))
            ->orderBy('name')
            ->get()
            ->map(fn (TalosSkill $skill): array => $skill->toApiArray())
            ->values();

        return response()->json(['data' => $skills]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->assertRegistryWriteAllowed($request);

        $validated = $this->validated($request, true);
        $this->assertImportedSkillDoesNotMutatePolicy($validated);
        $this->assertPromotionAllowed(null, $validated);

        $skill = TalosSkill::query()->create($validated);

        return response()->json(['data' => $skill->toApiArray()], 201);
    }

    public function planningContext(TalosSkillPlanningContextService $planningContext): JsonResponse
    {
        return response()->json(['data' => $planningContext->context()]);
    }

    public function show(TalosSkill $skill): JsonResponse
    {
        return response()->json(['data' => $skill->toApiArray(includeContent: true)]);
    }

    public function update(Request $request, TalosSkill $skill): JsonResponse
    {
        $this->assertRegistryWriteAllowed($request);

        $validated = $this->validated($request, false, $skill);
        $this->assertImportedSkillDoesNotMutatePolicy($validated, $skill);
        $this->assertPromotionAllowed($skill, $validated);

        $skill->update($validated);

        return response()->json(['data' => $skill->refresh()->toApiArray()]);
    }

    public function destroy(Request $request, TalosSkill $skill): JsonResponse
    {
        $this->assertRegistryWriteAllowed($request);

        $skill->delete();

        return response()->json(null, 204);
    }

    public function evaluation(Request $request, TalosSkill $skill): JsonResponse
    {
        $this->assertRegistryWriteAllowed($request);

        $validated = $request->validate([
            'passed' => ['required', 'boolean'],
            'result' => ['sometimes', 'nullable', 'array'],
        ]);

        $skill->update([
            'eval_status' => $validated['passed'] ? 'passed' : 'failed',
            'eval_result' => $validated['result'] ?? null,
        ]);

        return response()->json(['data' => $skill->refresh()->toApiArray()]);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, bool $create, ?TalosSkill $skill = null): array
    {
        return $request->validate([
            'name' => [
                $create ? 'required' : 'sometimes',
                'string',
                'max:120',
                'regex:/^[a-z][a-z0-9_\\-]*$/',
                Rule::unique('talos_skills', 'name')->ignore($skill?->id),
            ],
            'display_name' => [$create ? 'required' : 'sometimes', 'string', 'min:1', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string', 'max:4000'],
            'trigger' => ['sometimes', 'nullable', 'string', 'max:255'],
            'content' => [$create ? 'required' : 'sometimes', 'string', 'min:1', 'max:20000'],
            'input_schema' => ['sometimes', 'nullable', 'array'],
            'output_schema' => ['sometimes', 'nullable', 'array'],
            'allowed_tools' => ['sometimes', 'array'],
            'allowed_tools.*' => ['required', 'string', 'distinct', 'max:120'],
            'risk_level' => ['sometimes', 'string', Rule::in(['low', 'medium', 'high', 'critical'])],
            'review_status' => ['sometimes', 'string', Rule::in(['draft', 'pending_review', 'approved', 'rejected', 'quarantined'])],
            'eval_status' => ['sometimes', 'string', Rule::in(['not_run', 'passed', 'failed'])],
            'eval_result' => ['sometimes', 'nullable', 'array'],
            'source_type' => ['sometimes', 'string', Rule::in(['manual', 'imported'])],
            'is_enabled' => ['sometimes', 'boolean'],
            'metadata' => ['sometimes', 'nullable', 'array'],
        ]);
    }

    /**
     * @param array<string, mixed> $validated
     */
    private function assertImportedSkillDoesNotMutatePolicy(array $validated, ?TalosSkill $skill = null): void
    {
        $sourceType = (string) ($validated['source_type'] ?? $skill?->source_type ?? 'manual');
        $metadata = $validated['metadata'] ?? null;

        if ($sourceType !== 'imported' || ! is_array($metadata)) {
            return;
        }

        if (array_key_exists('policy', $metadata) || array_key_exists('capabilities', $metadata)) {
            throw ValidationException::withMessages([
                'metadata' => 'Imported skills cannot modify policy or capabilities.',
            ]);
        }
    }

    /**
     * @param array<string, mixed> $validated
     */
    private function assertPromotionAllowed(?TalosSkill $skill, array $validated): void
    {
        $reviewStatus = (string) ($validated['review_status'] ?? $skill?->review_status ?? 'draft');
        $evalStatus = (string) ($validated['eval_status'] ?? $skill?->eval_status ?? 'not_run');

        if ($reviewStatus === 'approved' && $evalStatus !== 'passed') {
            throw ValidationException::withMessages([
                'review_status' => 'Skill promotion requires a passing evaluation.',
            ]);
        }
    }

    private function assertRegistryWriteAllowed(Request $request): void
    {
        $expected = (string) config('services.talos.registry_write_token', '');
        $actual = (string) $request->header('X-Talos-Registry-Token', '');

        if ($expected === '' || ! hash_equals($expected, $actual)) {
            abort(403, 'TALOS registry write token is required.');
        }
    }
}
