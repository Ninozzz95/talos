<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class TalosMemorySkillUiTest extends TestCase
{
    public function test_dashboard_mounts_real_memory_and_skill_surfaces(): void
    {
        $shell = file_get_contents(base_path('resources/js/components/talos/workspace/TalosWorkspace.vue'));
        $modulePath = base_path('resources/js/components/talos/window/modules/TalosBrainWindow.vue');
        $registry = file_get_contents(base_path('resources/js/lib/talosWindowRegistry.ts'));
        $types = file_get_contents(base_path('resources/js/lib/talosTypes.ts'));
        $composablePath = base_path('resources/js/composables/useTalosMemorySkills.ts');
        $memoryPath = base_path('resources/js/components/talos/memory/TalosMemoryManager.vue');
        $skillPath = base_path('resources/js/components/talos/memory/TalosSkillRegistry.vue');
        $auditPath = base_path('resources/js/components/talos/memory/TalosSkillAudit.vue');

        $this->assertIsString($shell);
        $this->assertIsString($registry);
        $this->assertFileExists($modulePath);
        $this->assertIsString($types);
        $this->assertFileExists($composablePath);
        $this->assertFileExists($memoryPath);
        $this->assertFileExists($skillPath);
        $this->assertFileExists($auditPath);

        $composable = file_get_contents($composablePath);
        $memory = file_get_contents($memoryPath);
        $skill = file_get_contents($skillPath);
        $audit = file_get_contents($auditPath);
        $module = file_get_contents($modulePath);

        $this->assertIsString($composable);
        $this->assertIsString($memory);
        $this->assertIsString($skill);
        $this->assertIsString($audit);
        $this->assertIsString($module);
        $this->assertStringContainsString('TalosWindowLayer', $shell);
        $this->assertStringContainsString('TalosMemoryManager', $module);
        $this->assertStringContainsString('<TalosMemoryManager', $module);
        $this->assertStringContainsString("loader: () => import('../components/talos/window/modules/TalosBrainWindow.vue')", $registry);
        $this->assertStringContainsString('/api/talos/memories', $composable);
        $this->assertStringContainsString('/api/talos/memories/retrieval-context', $composable);
        $this->assertStringContainsString('/api/talos/skills', $composable);
        $this->assertStringContainsString('/api/talos/skills/planning-context', $composable);
        $this->assertStringContainsString('used memory', strtolower($memory));
        $this->assertStringContainsString('TalosSkillRegistry', $memory);
        $this->assertStringContainsString('TalosSkillAudit', $skill);
        $this->assertStringContainsString('excluded_skills', $types);
        $this->assertStringContainsString('excludedReasonByName', $skill);
        $this->assertStringContainsString('exclusionReason', $audit);
        $this->assertStringContainsString('allowed_tools', $audit);
        $this->assertStringContainsString('TalosMemory', $types);
        $this->assertStringContainsString('TalosSkill', $types);
        $this->assertStringNotContainsString('TalosMemoryManager', (string) file_get_contents(base_path('resources/js/components/TalosChatPage.vue')));
        $this->assertStringNotContainsString('TalosSkillRegistry', (string) file_get_contents(base_path('resources/js/components/TalosChatPage.vue')));
        $this->assertStringNotContainsString('mock', strtolower($memory . $skill . $audit));
        $this->assertStringNotContainsString('fake', strtolower($memory . $skill . $audit));
        $this->assertStringNotContainsString('placeholder action', strtolower($memory . $skill . $audit));
    }
}
