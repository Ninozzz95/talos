<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class TalosAdminUiTest extends TestCase
{
    public function test_dashboard_mounts_admin_doctor_audit_policy_and_backup_panels(): void
    {
        $shell = file_get_contents(base_path('resources/js/components/talos/workspace/TalosWorkspace.vue'));
        $chat = file_get_contents(base_path('resources/js/components/TalosChatPage.vue'));
        $composablePath = base_path('resources/js/composables/useTalosAdmin.ts');
        $doctorPath = base_path('resources/js/components/talos/admin/TalosDoctorPanel.vue');
        $auditPath = base_path('resources/js/components/talos/admin/TalosAuditLog.vue');
        $policyPath = base_path('resources/js/components/talos/admin/TalosPolicyPanel.vue');
        $backupPath = base_path('resources/js/components/talos/admin/TalosBackupPanel.vue');

        $this->assertIsString($shell);
        $this->assertIsString($chat);
        $this->assertFileExists($composablePath);
        $this->assertFileExists($doctorPath);
        $this->assertFileExists($auditPath);
        $this->assertFileExists($policyPath);
        $this->assertFileExists($backupPath);

        $composable = file_get_contents($composablePath);
        $doctor = file_get_contents($doctorPath);
        $audit = file_get_contents($auditPath);
        $policy = file_get_contents($policyPath);
        $backup = file_get_contents($backupPath);

        $this->assertIsString($composable);
        $this->assertIsString($doctor);
        $this->assertIsString($audit);
        $this->assertIsString($policy);
        $this->assertIsString($backup);
        $this->assertStringContainsString('/api/talos/admin/doctor', $composable);
        $this->assertStringContainsString('/api/talos/admin/audit-events', $composable);
        $this->assertStringContainsString('/api/talos/admin/policy', $composable);
        $this->assertStringContainsString('/api/talos/admin/backup/manifest', $composable);
        $this->assertStringContainsString('/api/talos/admin/backup/validate-restore', $composable);
        $this->assertStringContainsString('TalosDoctorPanel', $shell);
        $this->assertStringContainsString('TalosAuditLog', $shell);
        $this->assertStringContainsString('TalosPolicyPanel', $shell);
        $this->assertStringContainsString('TalosBackupPanel', $shell);
        $this->assertStringContainsString('validator_health', $doctor);
        $this->assertStringContainsString('event_type', $audit);
        $this->assertStringContainsString('default_decision', $policy);
        $this->assertStringContainsString('dry_run_required', $backup);
        $this->assertStringNotContainsString('TalosDoctorPanel', $chat);
        $this->assertStringNotContainsString('mock', strtolower($doctor.$audit.$policy.$backup));
        $this->assertStringNotContainsString('fake', strtolower($doctor.$audit.$policy.$backup));
        $this->assertStringNotContainsString('placeholder action', strtolower($doctor.$audit.$policy.$backup));
    }

    public function test_command_registry_exposes_admin_panels_without_fake_actions(): void
    {
        $registry = file_get_contents(base_path('resources/js/lib/commandRegistry.ts'));
        $types = file_get_contents(base_path('resources/js/lib/talosTypes.ts'));

        $this->assertIsString($registry);
        $this->assertIsString($types);

        foreach ([
            'open_doctor',
            'open_audit_log',
            'open_policy_panel',
            'open_backup_panel',
            'validate_backup_restore',
        ] as $commandId) {
            $this->assertStringContainsString("'".$commandId."'", $registry);
            $this->assertStringContainsString("'".$commandId."'", $types);
        }

        $this->assertStringNotContainsString('web doctor endpoint and panel are not implemented yet', strtolower($registry));
        $this->assertStringContainsString('talos.backup.restore', $registry);
        $this->assertStringContainsString('dry-run', strtolower($registry));
    }
}
