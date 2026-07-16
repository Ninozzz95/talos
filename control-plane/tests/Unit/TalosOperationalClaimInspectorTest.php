<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\Talos\Agent\TalosOperationalClaimInspector;
use PHPUnit\Framework\TestCase;

final class TalosOperationalClaimInspectorTest extends TestCase
{
    public function test_it_detects_talos_evidence_in_markdown_images(): void
    {
        $inspector = new TalosOperationalClaimInspector;

        $artifactId = '019f6041-b3d6-7f8e-87f9-02110be8a48a';

        $this->assertTrue($inspector->referencesTalosEvidence(
            "![Captured page](https://talo.sh/artifact/{$artifactId})",
        ));
        $this->assertSame([$artifactId], $inspector->talosEvidenceIds(
            "![Captured page](https://talo.sh/artifact/{$artifactId})",
        ));
    }

    public function test_it_detects_talos_evidence_in_links_and_plain_autolinks(): void
    {
        $inspector = new TalosOperationalClaimInspector;

        $this->assertTrue($inspector->referencesTalosEvidence(
            '[Open evidence](https://talo.sh/artifact/019f6041-b3d6-7f8e-87f9-02110be8a48a)',
        ));
        $this->assertTrue($inspector->referencesTalosEvidence(
            'Evidence: https://talo.sh/artifact/019f6041-b3d6-7f8e-87f9-02110be8a48a',
        ));
    }

    public function test_it_ignores_ordinary_prose_and_non_talos_links(): void
    {
        $inspector = new TalosOperationalClaimInspector;

        $this->assertFalse($inspector->referencesTalosEvidence('Ordinary chat answer.'));
        $this->assertFalse($inspector->referencesTalosEvidence(
            'Read [the source](https://example.com/artifact/019f6041-b3d6-7f8e-87f9-02110be8a48a).',
        ));
    }

    public function test_it_deduplicates_talos_evidence_ids_in_document_order(): void
    {
        $inspector = new TalosOperationalClaimInspector;
        $first = '019f6041-b3d6-7f8e-87f9-02110be8a48a';
        $second = '019f6041-b3d6-7f8e-87f9-02110be8a48b';

        $this->assertSame([$first, $second], $inspector->talosEvidenceIds(
            "[first](https://talo.sh/artifact/{$first})\n"
            ."![first again](https://talo.sh/artifact/{$first})\n"
            ."[second](https://talo.sh/artifact/{$second})",
        ));
    }
}
