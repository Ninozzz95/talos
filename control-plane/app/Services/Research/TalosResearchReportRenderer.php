<?php

declare(strict_types=1);

namespace App\Services\Research;

use App\Models\TalosResearchClaim;
use App\Models\TalosResearchReport;
use App\Models\TalosResearchSource;

final class TalosResearchReportRenderer
{
    /**
     * @return array<string, mixed>
     */
    public function payload(TalosResearchReport $report): array
    {
        $report->loadMissing(['sources', 'claims.sources', 'run.artifacts']);

        return [
            'id' => $report->id,
            'title' => $report->title,
            'query' => $report->query,
            'status' => $report->status,
            'summary' => $report->summary,
            'run_id' => $report->run_id,
            'benchmark_group_id' => $report->benchmark_group_id,
            'sections' => [
                'executive_summary' => $report->summary ?: 'No executive summary has been generated yet.',
                'findings' => $report->claims
                    ->map(fn (TalosResearchClaim $claim): array => [
                        'id' => $claim->id,
                        'sequence' => $claim->sequence,
                        'text' => $claim->text,
                        'status' => $claim->status,
                        'confidence' => $claim->confidence,
                        'sources' => $claim->sources
                            ->map(fn (TalosResearchSource $source): array => [
                                'id' => $source->id,
                                'client_id' => $source->client_id,
                                'title' => $source->title,
                                'url' => $source->url,
                                'status' => $source->status,
                            ])
                            ->values()
                            ->all(),
                    ])
                    ->values()
                    ->all(),
                'sources' => $report->sources
                    ->map(fn (TalosResearchSource $source): array => $source->toApiArray())
                    ->values()
                    ->all(),
                'unresolved_questions' => $this->unresolvedQuestions($report),
                'avm_evidence' => [
                    'run_id' => $report->run_id,
                    'artifact_count' => $report->run?->artifacts->count() ?? 0,
                    'replayable' => $report->run_id !== null,
                ],
            ],
        ];
    }

    public function markdown(TalosResearchReport $report): string
    {
        $payload = $this->payload($report);
        $lines = [
            '# '.((string) $payload['title']),
            '',
            '## Executive Summary',
            (string) $payload['sections']['executive_summary'],
            '',
            '## Findings',
        ];

        foreach ($payload['sections']['findings'] as $finding) {
            $lines[] = '- '.((string) $finding['text']).' ['.((string) $finding['status']).']';
        }

        $lines[] = '';
        $lines[] = '## Source Map';
        foreach ($payload['sections']['sources'] as $source) {
            $lines[] = '- '.((string) ($source['title'] ?? $source['url'])).' — '.((string) $source['url']);
        }

        $lines[] = '';
        $lines[] = '## AVM Evidence';
        $lines[] = '- Run: '.((string) ($payload['run_id'] ?? 'none'));
        $lines[] = '- Replayable: '.($payload['sections']['avm_evidence']['replayable'] ? 'yes' : 'no');

        return implode("\n", $lines);
    }

    public function html(TalosResearchReport $report): string
    {
        $payload = $this->payload($report);
        $html = '<article class="talos-report-article">';
        $html .= '<h1>'.e((string) $payload['title']).'</h1>';
        $html .= '<p class="talos-report-query">'.e((string) $payload['query']).'</p>';
        $html .= '<section id="executive-summary"><h2>Executive Summary</h2><p>'.e((string) $payload['sections']['executive_summary']).'</p></section>';
        $html .= '<section id="findings"><h2>Findings</h2><ol>';

        foreach ($payload['sections']['findings'] as $finding) {
            $html .= '<li id="claim-'.e((string) $finding['id']).'">';
            $html .= '<strong>'.e((string) $finding['status']).'</strong> ';
            $html .= e((string) $finding['text']);
            $html .= '</li>';
        }

        $html .= '</ol></section>';
        $html .= '<section id="source-map"><h2>Source Map</h2><ol>';
        foreach ($payload['sections']['sources'] as $source) {
            $html .= '<li id="source-'.e((string) $source['client_id']).'">';
            $html .= '<a href="'.e((string) $source['url']).'" rel="noreferrer">'.e((string) ($source['title'] ?? $source['url'])).'</a>';
            $html .= '</li>';
        }
        $html .= '</ol></section>';
        $html .= '<section id="avm-evidence"><h2>AVM Evidence</h2><p>Run '.e((string) ($payload['run_id'] ?? 'none')).'</p></section>';
        $html .= '</article>';

        return $html;
    }

    /**
     * @return list<string>
     */
    private function unresolvedQuestions(TalosResearchReport $report): array
    {
        $questions = [];

        foreach ($report->claims as $claim) {
            if ($claim->status !== 'verified') {
                $questions[] = 'Resolve claim '.$claim->sequence.': '.$claim->text;
            }
        }

        return $questions;
    }
}
