<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class TalosProductivityUiTest extends TestCase
{
    public function test_dashboard_mounts_productivity_and_email_panels_without_active_send_controls(): void
    {
        $shell = file_get_contents(base_path('resources/js/components/talos/workspace/TalosWorkspace.vue'));
        $notesModulePath = base_path('resources/js/components/talos/window/modules/TalosNotesWindow.vue');
        $tasksModulePath = base_path('resources/js/components/talos/window/modules/TalosTasksWindow.vue');
        $calendarModulePath = base_path('resources/js/components/talos/window/modules/TalosCalendarWindow.vue');
        $registry = file_get_contents(base_path('resources/js/lib/talosWindowRegistry.ts'));
        $chat = file_get_contents(base_path('resources/js/components/TalosChatPage.vue'));
        $productivityComposablePath = base_path('resources/js/composables/useTalosProductivity.ts');
        $emailComposablePath = base_path('resources/js/composables/useTalosEmail.ts');
        $notesPath = base_path('resources/js/components/talos/productivity/TalosNotes.vue');
        $tasksPath = base_path('resources/js/components/talos/productivity/TalosTasks.vue');
        $calendarPath = base_path('resources/js/components/talos/productivity/TalosCalendar.vue');
        $calendarLibPath = base_path('resources/js/lib/talosCalendar.ts');
        $calendarGridPath = base_path('resources/js/components/talos/productivity/TalosCalendarGrid.vue');
        $calendarToolbarPath = base_path('resources/js/components/talos/productivity/TalosCalendarToolbar.vue');
        $calendarQuickAddPath = base_path('resources/js/components/talos/productivity/TalosCalendarQuickAdd.vue');
        $calendarEventListPath = base_path('resources/js/components/talos/productivity/TalosCalendarEventList.vue');
        $calendarEventEditorPath = base_path('resources/js/components/talos/productivity/TalosCalendarEventEditor.vue');
        $emailTriagePath = base_path('resources/js/components/talos/email/TalosEmailTriage.vue');
        $draftReviewPath = base_path('resources/js/components/talos/email/TalosEmailDraftReview.vue');
        $commandRegistryPath = base_path('resources/js/lib/commandRegistry.ts');

        $this->assertIsString($shell);
        $this->assertIsString($registry);
        $this->assertIsString($chat);
        $this->assertFileExists($productivityComposablePath);
        $this->assertFileExists($emailComposablePath);
        $this->assertFileExists($notesPath);
        $this->assertFileExists($tasksPath);
        $this->assertFileExists($calendarPath);
        $this->assertFileExists($calendarLibPath);
        $this->assertFileExists($calendarGridPath);
        $this->assertFileExists($calendarToolbarPath);
        $this->assertFileExists($calendarQuickAddPath);
        $this->assertFileExists($calendarEventListPath);
        $this->assertFileExists($calendarEventEditorPath);
        $this->assertFileExists($notesModulePath);
        $this->assertFileExists($tasksModulePath);
        $this->assertFileExists($calendarModulePath);
        $this->assertFileExists($emailTriagePath);
        $this->assertFileExists($draftReviewPath);

        $productivityComposable = file_get_contents($productivityComposablePath);
        $emailComposable = file_get_contents($emailComposablePath);
        $notes = file_get_contents($notesPath);
        $tasks = file_get_contents($tasksPath);
        $calendar = file_get_contents($calendarPath);
        $calendarLib = file_get_contents($calendarLibPath);
        $calendarGrid = file_get_contents($calendarGridPath);
        $calendarToolbar = file_get_contents($calendarToolbarPath);
        $calendarQuickAdd = file_get_contents($calendarQuickAddPath);
        $calendarEventList = file_get_contents($calendarEventListPath);
        $calendarEventEditor = file_get_contents($calendarEventEditorPath);
        $emailTriage = file_get_contents($emailTriagePath);
        $draftReview = file_get_contents($draftReviewPath);
        $commandRegistry = file_get_contents($commandRegistryPath);
        $notesModule = file_get_contents($notesModulePath);
        $tasksModule = file_get_contents($tasksModulePath);
        $calendarModule = file_get_contents($calendarModulePath);

        $this->assertIsString($productivityComposable);
        $this->assertIsString($emailComposable);
        $this->assertIsString($notes);
        $this->assertIsString($tasks);
        $this->assertIsString($calendar);
        $this->assertIsString($calendarLib);
        $this->assertIsString($calendarGrid);
        $this->assertIsString($calendarToolbar);
        $this->assertIsString($calendarQuickAdd);
        $this->assertIsString($calendarEventList);
        $this->assertIsString($calendarEventEditor);
        $this->assertIsString($emailTriage);
        $this->assertIsString($draftReview);
        $this->assertIsString($commandRegistry);
        $this->assertIsString($notesModule);
        $this->assertIsString($tasksModule);
        $this->assertIsString($calendarModule);
        $this->assertStringContainsString('/api/talos/notes', $productivityComposable);
        $this->assertStringContainsString('/api/talos/tasks', $productivityComposable);
        $this->assertStringContainsString('/api/talos/calendar-drafts', $productivityComposable);
        $this->assertStringContainsString('/api/talos/email/messages', $emailComposable);
        $this->assertStringContainsString('/api/talos/email/drafts', $emailComposable);
        $this->assertStringContainsString('/api/talos/email/connector-status', $emailComposable);
        $this->assertStringContainsString('TalosWindowLayer', $shell);
        $this->assertStringContainsString('TalosNotes', $notesModule);
        $this->assertStringContainsString('TalosTasks', $tasksModule);
        $this->assertStringContainsString('TalosCalendar', $calendarModule);
        $this->assertStringContainsString('TalosEmailTriage', $tasksModule);
        $this->assertStringContainsString("loader: () => import('../components/talos/window/modules/TalosNotesWindow.vue')", $registry);
        $this->assertStringContainsString("loader: () => import('../components/talos/window/modules/TalosTasksWindow.vue')", $registry);
        $this->assertStringContainsString("loader: () => import('../components/talos/window/modules/TalosCalendarWindow.vue')", $registry);
        $this->assertStringContainsString('TalosEmailDraftReview', $emailTriage);
        $this->assertStringContainsString('trust_level', $notes);
        $this->assertStringContainsString('run_id', $tasks);
        $this->assertStringContainsString('confirmation_required', $calendar);
        $this->assertStringContainsString('TalosCalendarGrid', $calendar);
        $this->assertStringContainsString('TalosCalendarToolbar', $calendar);
        $this->assertStringContainsString('TalosCalendarQuickAdd', $calendar);
        $this->assertStringContainsString('TalosCalendarEventList', $calendar);
        $this->assertStringContainsString('TalosCalendarEventEditor', $calendar);
        $this->assertStringContainsString('crew muster 10am daily', $calendarLib);
        $this->assertStringContainsString('meeting tomorrow 15:00', $calendarLib);
        $this->assertStringContainsString('review Friday 9-10', $calendarLib);
        $this->assertStringContainsString('Current month', $calendarToolbar);
        $this->assertStringContainsString('Search all events', $calendarEventList);
        $this->assertStringContainsString('Month grid', $calendarGrid);
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
        $calendarSurface = $calendar.$calendarLib.$calendarGrid.$calendarToolbar.$calendarQuickAdd.$calendarEventList.$calendarEventEditor;
        $this->assertStringNotContainsString('mock', strtolower($notes.$tasks.$calendarSurface.$emailTriage.$draftReview));
        $this->assertStringNotContainsString('fake', strtolower($notes.$tasks.$calendarSurface.$emailTriage.$draftReview));
        $this->assertStringNotContainsString('placeholder action', strtolower($notes.$tasks.$calendarSurface.$emailTriage.$draftReview));
    }
}
