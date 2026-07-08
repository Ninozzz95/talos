<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class TalosProductivityUiTest extends TestCase
{
    public function test_dashboard_mounts_productivity_and_email_panels_without_active_send_controls(): void
    {
        $shell = file_get_contents(base_path('resources/js/components/TalosShell.vue'));
        $chat = file_get_contents(base_path('resources/js/components/TalosChatPage.vue'));
        $productivityComposablePath = base_path('resources/js/composables/useTalosProductivity.ts');
        $emailComposablePath = base_path('resources/js/composables/useTalosEmail.ts');
        $notesPath = base_path('resources/js/components/talos/productivity/TalosNotes.vue');
        $tasksPath = base_path('resources/js/components/talos/productivity/TalosTasks.vue');
        $calendarPath = base_path('resources/js/components/talos/productivity/TalosCalendar.vue');
        $emailTriagePath = base_path('resources/js/components/talos/email/TalosEmailTriage.vue');
        $draftReviewPath = base_path('resources/js/components/talos/email/TalosEmailDraftReview.vue');
        $commandRegistryPath = base_path('resources/js/lib/commandRegistry.ts');

        $this->assertIsString($shell);
        $this->assertIsString($chat);
        $this->assertFileExists($productivityComposablePath);
        $this->assertFileExists($emailComposablePath);
        $this->assertFileExists($notesPath);
        $this->assertFileExists($tasksPath);
        $this->assertFileExists($calendarPath);
        $this->assertFileExists($emailTriagePath);
        $this->assertFileExists($draftReviewPath);

        $productivityComposable = file_get_contents($productivityComposablePath);
        $emailComposable = file_get_contents($emailComposablePath);
        $notes = file_get_contents($notesPath);
        $tasks = file_get_contents($tasksPath);
        $calendar = file_get_contents($calendarPath);
        $emailTriage = file_get_contents($emailTriagePath);
        $draftReview = file_get_contents($draftReviewPath);
        $commandRegistry = file_get_contents($commandRegistryPath);

        $this->assertIsString($productivityComposable);
        $this->assertIsString($emailComposable);
        $this->assertIsString($notes);
        $this->assertIsString($tasks);
        $this->assertIsString($calendar);
        $this->assertIsString($emailTriage);
        $this->assertIsString($draftReview);
        $this->assertIsString($commandRegistry);
        $this->assertStringContainsString('/api/talos/notes', $productivityComposable);
        $this->assertStringContainsString('/api/talos/tasks', $productivityComposable);
        $this->assertStringContainsString('/api/talos/calendar-drafts', $productivityComposable);
        $this->assertStringContainsString('/api/talos/email/messages', $emailComposable);
        $this->assertStringContainsString('/api/talos/email/drafts', $emailComposable);
        $this->assertStringContainsString('/api/talos/email/connector-status', $emailComposable);
        $this->assertStringContainsString('TalosNotes', $shell);
        $this->assertStringContainsString('TalosTasks', $shell);
        $this->assertStringContainsString('TalosCalendar', $shell);
        $this->assertStringContainsString('TalosEmailTriage', $shell);
        $this->assertStringContainsString('TalosEmailDraftReview', $emailTriage);
        $this->assertStringContainsString('trust_level', $notes);
        $this->assertStringContainsString('run_id', $tasks);
        $this->assertStringContainsString('confirmation_required', $calendar);
        $this->assertStringContainsString('send_enabled', $emailTriage.$draftReview);
        $this->assertStringContainsString('EMAIL_SEND_DISABLED', $draftReview);
        $this->assertStringContainsString('open_notes', $commandRegistry);
        $this->assertStringContainsString('open_tasks', $commandRegistry);
        $this->assertStringContainsString('open_calendar_drafts', $commandRegistry);
        $this->assertStringContainsString('open_email_triage', $commandRegistry);
        $this->assertStringContainsString('send_email_draft', $commandRegistry);
        $this->assertStringContainsString('Email send is disabled until HMI confirmation and audit exist.', $commandRegistry);
        $this->assertStringNotContainsString('TalosEmailTriage', $chat);
        $this->assertStringNotContainsString('TalosCalendar', $chat);
        $this->assertStringNotContainsString('mock', strtolower($notes.$tasks.$calendar.$emailTriage.$draftReview));
        $this->assertStringNotContainsString('fake', strtolower($notes.$tasks.$calendar.$emailTriage.$draftReview));
        $this->assertStringNotContainsString('placeholder action', strtolower($notes.$tasks.$calendar.$emailTriage.$draftReview));
    }
}
