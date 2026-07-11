<?php

declare(strict_types=1);

namespace Tests\Feature;

use Tests\TestCase;

final class TalosDocumentsArtifactUiTest extends TestCase
{
    public function test_dashboard_mounts_document_and_artifact_surfaces_with_real_endpoints(): void
    {
        $shell = file_get_contents(base_path('resources/js/components/talos/workspace/TalosWorkspace.vue'));
        $knowledgeModulePath = base_path('resources/js/components/talos/window/modules/TalosKnowledgeWindow.vue');
        $galleryModulePath = base_path('resources/js/components/talos/window/modules/TalosGalleryWindow.vue');
        $registry = file_get_contents(base_path('resources/js/lib/talosWindowRegistry.ts'));
        $chat = file_get_contents(base_path('resources/js/components/TalosChatPage.vue'));
        $composablePath = base_path('resources/js/composables/useTalosDocuments.ts');
        $documentsPath = base_path('resources/js/components/talos/documents/TalosDocuments.vue');
        $galleryPath = base_path('resources/js/components/talos/documents/TalosArtifactGallery.vue');
        $previewPath = base_path('resources/js/components/talos/documents/TalosArtifactPreview.vue');

        $this->assertIsString($shell);
        $this->assertIsString($registry);
        $this->assertIsString($chat);
        $this->assertFileExists($composablePath);
        $this->assertFileExists($documentsPath);
        $this->assertFileExists($galleryPath);
        $this->assertFileExists($previewPath);
        $this->assertFileExists($knowledgeModulePath);
        $this->assertFileExists($galleryModulePath);

        $composable = file_get_contents($composablePath);
        $documents = file_get_contents($documentsPath);
        $gallery = file_get_contents($galleryPath);
        $preview = file_get_contents($previewPath);
        $knowledgeModule = file_get_contents($knowledgeModulePath);
        $galleryModule = file_get_contents($galleryModulePath);

        $this->assertIsString($composable);
        $this->assertIsString($documents);
        $this->assertIsString($gallery);
        $this->assertIsString($preview);
        $this->assertIsString($knowledgeModule);
        $this->assertIsString($galleryModule);
        $this->assertStringContainsString('/api/talos/documents', $composable);
        $this->assertStringContainsString('/api/talos/artifacts', $composable);
        $this->assertStringContainsString('/export', $composable);
        $this->assertStringContainsString('/preview', $composable);
        $this->assertStringContainsString('TalosWindowLayer', $shell);
        $this->assertStringContainsString('TalosDocuments', $knowledgeModule);
        $this->assertStringContainsString('<TalosDocuments', $knowledgeModule);
        $this->assertStringContainsString('TalosArtifactGallery', $galleryModule);
        $this->assertStringContainsString('<TalosArtifactGallery', $galleryModule);
        $this->assertStringContainsString("loader: () => import('../components/talos/window/modules/TalosKnowledgeWindow.vue')", $registry);
        $this->assertStringContainsString("loader: () => import('../components/talos/window/modules/TalosGalleryWindow.vue')", $registry);
        $this->assertStringContainsString('content_preview', $documents);
        $this->assertStringContainsString('provenance', $documents);
        $this->assertStringContainsString('fallback', $preview);
        $this->assertStringContainsString('download', $preview);
        $this->assertStringContainsString('preview_available', $preview);
        $this->assertStringContainsString('previewArtifact(artifact.id)', $gallery);
        $this->assertStringContainsString('artifact.run?.id', $gallery);
        $this->assertStringNotContainsString('{{ artifact.uri }}', $gallery);
        $this->assertStringNotContainsString('TalosDocuments', $chat);
        $this->assertStringNotContainsString('TalosArtifactGallery', $chat);
        $this->assertStringNotContainsString('mock', strtolower($documents.$gallery.$preview));
        $this->assertStringNotContainsString('fake', strtolower($documents.$gallery.$preview));
        $this->assertStringNotContainsString('placeholder action', strtolower($documents.$gallery.$preview));
    }
}
