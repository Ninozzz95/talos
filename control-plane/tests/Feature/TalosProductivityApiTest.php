<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosCalendarDraft;
use App\Models\TalosNote;
use App\Models\TalosRun;
use App\Models\TalosTask;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TalosProductivityApiTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = $this->authenticateTalosUser();
    }

    public function test_task_created_from_run_stores_source_run_id(): void
    {
        $run = TalosRun::query()->create([
            'user_id' => $this->user->id,
            'mode' => 'verified_execution',
            'status' => 'succeeded',
            'prompt_hash' => hash('sha256', 'task source'),
        ]);

        $this->postJson('/api/talos/tasks', [
            'run_id' => $run->id,
            'title' => 'Follow up on failed node recovery',
            'description' => 'Review blocked branch and confirm HMI retry.',
            'status' => 'open',
            'priority' => 'high',
        ])
            ->assertCreated()
            ->assertJsonPath('data.run_id', $run->id)
            ->assertJsonPath('data.title', 'Follow up on failed node recovery')
            ->assertJsonPath('data.priority', 'high');

        $this->assertDatabaseHas('talos_tasks', [
            'run_id' => $run->id,
            'title' => 'Follow up on failed node recovery',
        ]);
    }

    public function test_calendar_write_requires_confirmation_and_stays_draft(): void
    {
        $this->postJson('/api/talos/calendar-drafts', [
            'title' => 'AVM pilot review',
            'starts_at' => '2026-07-09T10:00:00+02:00',
            'ends_at' => '2026-07-09T10:30:00+02:00',
            'timezone' => 'Europe/Rome',
            'attendees' => ['ops@example.com'],
            'status' => 'approved',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['status']);

        $created = $this->postJson('/api/talos/calendar-drafts', [
            'title' => 'AVM pilot review',
            'starts_at' => '2026-07-09T10:00:00+02:00',
            'ends_at' => '2026-07-09T10:30:00+02:00',
            'timezone' => 'Europe/Rome',
            'attendees' => ['ops@example.com'],
        ]);

        $created
            ->assertCreated()
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.confirmation_required', true)
            ->assertJsonPath('data.confirmed_at', null)
            ->assertJsonPath('data.source_run_id', null)
            ->assertJsonPath('data.external_provider', null)
            ->assertJsonPath('data.external_event_id', null);
    }

    public function test_note_retrieval_context_marks_notes_as_untrusted(): void
    {
        $this->postJson('/api/talos/notes', [
            'title' => 'Operator preference',
            'content' => 'Prefer HMI-first recovery for production workflows.',
            'scope_type' => 'project',
            'scope_id' => 'avm',
        ])->assertCreated();

        $this->getJson('/api/talos/notes/retrieval-context?scope_type=project&scope_id=avm')
            ->assertOk()
            ->assertJsonPath('source', 'talos_notes')
            ->assertJsonPath('trust_level', 'untrusted')
            ->assertJsonPath('notes.0.trust_level', 'untrusted')
            ->assertJsonPath('notes.0.content', 'Prefer HMI-first recovery for production workflows.');
    }

    public function test_productivity_records_and_run_provenance_are_scoped_to_the_authenticated_user(): void
    {
        $foreignUser = User::factory()->create();
        $foreignRun = TalosRun::query()->create([
            'user_id' => $foreignUser->id,
            'mode' => 'verified_execution',
            'status' => 'succeeded',
            'prompt_hash' => hash('sha256', 'foreign productivity run'),
        ]);
        $foreignTask = TalosTask::query()->create([
            'run_id' => $foreignRun->id,
            'title' => 'Foreign task',
            'status' => 'open',
            'priority' => 'high',
        ]);
        $foreignNote = TalosNote::query()->create([
            'run_id' => $foreignRun->id,
            'scope_type' => 'project',
            'scope_id' => 'avm',
            'title' => 'Foreign note',
            'content' => 'Hidden note content.',
            'status' => 'active',
        ]);
        $foreignDraft = TalosCalendarDraft::query()->create([
            'run_id' => $foreignRun->id,
            'title' => 'Foreign calendar draft',
            'starts_at' => '2026-07-09T10:00:00+02:00',
            'ends_at' => '2026-07-09T10:30:00+02:00',
            'timezone' => 'Europe/Rome',
            'attendees' => ['foreign@example.com'],
            'status' => 'draft',
            'confirmation_required' => true,
        ]);

        $this->getJson('/api/talos/tasks')
            ->assertOk()
            ->assertJsonMissing(['id' => $foreignTask->id]);
        $this->getJson('/api/talos/notes')
            ->assertOk()
            ->assertJsonMissing(['id' => $foreignNote->id]);
        $this->getJson('/api/talos/calendar-drafts')
            ->assertOk()
            ->assertJsonMissing(['id' => $foreignDraft->id]);
        $this->getJson('/api/talos/notes/retrieval-context?scope_type=project&scope_id=avm')
            ->assertOk()
            ->assertJsonMissing(['title' => 'Foreign note']);

        $this->getJson("/api/talos/notes/{$foreignNote->id}")->assertNotFound();
        $this->postJson("/api/talos/calendar-drafts/{$foreignDraft->id}/confirm")->assertNotFound();

        $this->postJson('/api/talos/tasks', [
            'run_id' => $foreignRun->id,
            'title' => 'Cross-owner task',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['run_id']);
        $this->postJson('/api/talos/notes', [
            'run_id' => $foreignRun->id,
            'title' => 'Cross-owner note',
            'content' => 'Should fail.',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['run_id']);
        $this->postJson('/api/talos/calendar-drafts', [
            'run_id' => $foreignRun->id,
            'title' => 'Cross-owner calendar',
            'starts_at' => '2026-07-09T11:00:00+02:00',
            'ends_at' => '2026-07-09T11:30:00+02:00',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['run_id']);
    }
}
