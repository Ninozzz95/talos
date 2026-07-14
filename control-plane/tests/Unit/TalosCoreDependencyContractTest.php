<?php

declare(strict_types=1);

namespace Tests\Unit;

use Kadmos\Provider\ProviderTurnAdapter;
use Kadmos\Provider\ProviderTurnAdapterFactory;
use Kadmos\Tool\ProceduralToolCompiler;
use PHPUnit\Framework\Attributes\Test;
use ReflectionClass;
use Tests\TestCase;

final class TalosCoreDependencyContractTest extends TestCase
{
    #[Test]
    public function control_plane_resolves_the_framework_free_core_through_a_path_repository(): void
    {
        $composer = json_decode(
            (string) file_get_contents(base_path('composer.json')),
            true,
            flags: JSON_THROW_ON_ERROR,
        );

        $this->assertSame('@dev', $composer['require']['kadmos/core'] ?? null);
        $this->assertContains(
            ['type' => 'path', 'url' => '../core', 'options' => ['symlink' => false]],
            $composer['repositories'] ?? [],
        );
        $this->assertTrue(class_exists(ProceduralToolCompiler::class));
        $this->assertTrue(interface_exists(ProviderTurnAdapter::class));
        $this->assertTrue(class_exists(ProviderTurnAdapterFactory::class));
        $this->assertFileExists(base_path('artisan'));
        $this->assertSame(realpath(dirname(__DIR__, 2)), realpath(base_path()));
    }

    #[Test]
    public function monorepo_runtime_prefers_live_core_source_over_the_mirrored_vendor_copy(): void
    {
        $expected = realpath(base_path('../core/src/Tool/ProceduralToolCompiler.php'));
        $loaded = realpath((string) (new ReflectionClass(ProceduralToolCompiler::class))->getFileName());

        $this->assertNotFalse($expected);
        $this->assertSame($expected, $loaded);
    }
}
