<?php

declare(strict_types=1);

namespace App\Services\Artifacts;

use JsonException;

final readonly class TalosSemanticDocumentV1
{
    private const MAX_TEXT = 20_000;

    private const MAX_TITLE = 240;

    private const MAX_LIST_ITEMS = 500;

    private const MAX_COLUMNS = 64;

    private const MAX_ROWS = 5_000;

    private const MAX_SECTIONS = 200;

    private const MAX_SLIDES = 100;

    private const MAX_SHEETS = 32;

    /** @param array<string, mixed> $value */
    private function __construct(private array $value) {}

    public static function fromRequestValue(mixed $value): self
    {
        try {
            return new self(self::normalizeRoot($value));
        } catch (TalosArtifactGenerationException $exception) {
            throw $exception;
        } catch (\Throwable) {
            throw self::invalid('Semantic document does not match talos.semantic_document.v1.');
        }
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return $this->value;
    }

    public function toCanonicalJson(): string
    {
        try {
            return json_encode(
                $this->value,
                JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION,
            );
        } catch (JsonException) {
            throw self::invalid('Semantic document cannot be encoded safely.');
        }
    }

    /** @return array<string, mixed> */
    private static function normalizeRoot(mixed $value): array
    {
        $root = self::object($value, 'document');
        self::exactKeys(
            $root,
            ['author', 'contract', 'locale', 'sections', 'sheets', 'slides', 'title'],
            ['contract', 'title', 'locale', 'author', 'sections'],
            'document',
        );
        if (($root['contract'] ?? null) !== 'talos.semantic_document.v1') {
            throw self::invalid('Semantic document contract is invalid.', 'document.contract');
        }

        $sections = self::list($root['sections'], 'document.sections', 1, self::MAX_SECTIONS);
        $normalizedSections = [];
        $totalRows = 0;
        foreach ($sections as $index => $section) {
            $normalized = self::normalizeSection($section, "document.sections.{$index}");
            if (($normalized['type'] ?? null) === 'table') {
                $totalRows += count($normalized['rows']);
            }
            $normalizedSections[] = $normalized;
        }

        $result = [
            'contract' => 'talos.semantic_document.v1',
            'title' => self::text($root['title'], 'document.title', self::MAX_TITLE),
            'locale' => self::locale($root['locale']),
            'author' => self::text($root['author'], 'document.author', self::MAX_TITLE),
            'sections' => $normalizedSections,
        ];

        if (array_key_exists('slides', $root)) {
            $slides = self::list($root['slides'], 'document.slides', 0, self::MAX_SLIDES);
            $result['slides'] = array_map(
                static fn (mixed $slide, int $index): array => self::normalizeSlide(
                    $slide,
                    "document.slides.{$index}",
                ),
                $slides,
                array_keys($slides),
            );
        }

        if (array_key_exists('sheets', $root)) {
            $sheets = self::list($root['sheets'], 'document.sheets', 0, self::MAX_SHEETS);
            $normalizedSheets = [];
            foreach ($sheets as $index => $sheet) {
                $normalized = self::normalizeSheet($sheet, "document.sheets.{$index}");
                $totalRows += count($normalized['rows']);
                $normalizedSheets[] = $normalized;
            }
            $result['sheets'] = $normalizedSheets;
        }

        if ($totalRows > self::MAX_ROWS) {
            throw self::invalid('Semantic document exceeds the aggregate row limit.', 'document');
        }

        return $result;
    }

    /** @return array<string, mixed> */
    private static function normalizeSection(mixed $value, string $path): array
    {
        $section = self::object($value, $path);
        $type = $section['type'] ?? null;
        if (! is_string($type)) {
            throw self::invalid('Semantic document section type is required.', "{$path}.type");
        }

        return match ($type) {
            'heading' => self::heading($section, $path),
            'paragraph' => self::paragraph($section, $path),
            'bullets' => self::bullets($section, $path),
            'table' => self::table($section, $path),
            default => throw self::invalid('Semantic document section type is unsupported.', "{$path}.type"),
        };
    }

    /** @param array<string, mixed> $section @return array<string, mixed> */
    private static function heading(array $section, string $path): array
    {
        self::exactKeys($section, ['level', 'text', 'type'], ['type', 'level', 'text'], $path);
        $level = $section['level'];
        if (! is_int($level) || $level < 1 || $level > 6) {
            throw self::invalid('Heading level must be between 1 and 6.', "{$path}.level");
        }

        return ['type' => 'heading', 'level' => $level, 'text' => self::text($section['text'], "{$path}.text", self::MAX_TITLE)];
    }

    /** @param array<string, mixed> $section @return array<string, mixed> */
    private static function paragraph(array $section, string $path): array
    {
        self::exactKeys($section, ['text', 'type'], ['type', 'text'], $path);

        return ['type' => 'paragraph', 'text' => self::text($section['text'], "{$path}.text", self::MAX_TEXT)];
    }

    /** @param array<string, mixed> $section @return array<string, mixed> */
    private static function bullets(array $section, string $path): array
    {
        self::exactKeys($section, ['items', 'ordered', 'type'], ['type', 'ordered', 'items'], $path);
        if (! is_bool($section['ordered'])) {
            throw self::invalid('Bullet ordered flag must be boolean.', "{$path}.ordered");
        }
        $items = self::list($section['items'], "{$path}.items", 1, self::MAX_LIST_ITEMS);

        return [
            'type' => 'bullets',
            'ordered' => $section['ordered'],
            'items' => array_map(
                static fn (mixed $item, int $index): string => self::text(
                    $item,
                    "{$path}.items.{$index}",
                    self::MAX_TEXT,
                ),
                $items,
                array_keys($items),
            ),
        ];
    }

    /** @param array<string, mixed> $section @return array<string, mixed> */
    private static function table(array $section, string $path): array
    {
        self::exactKeys($section, ['columns', 'rows', 'type'], ['type', 'columns', 'rows'], $path);
        $columns = self::list($section['columns'], "{$path}.columns", 1, self::MAX_COLUMNS);
        $normalizedColumns = [];
        $allowed = [];
        foreach ($columns as $index => $columnValue) {
            $column = self::object($columnValue, "{$path}.columns.{$index}");
            self::exactKeys($column, ['key', 'label'], ['key', 'label'], "{$path}.columns.{$index}");
            $key = $column['key'];
            if (! is_string($key) || preg_match('/^[A-Za-z][A-Za-z0-9_]{0,63}$/', $key) !== 1 || isset($allowed[$key])) {
                throw self::invalid('Table column keys must be valid and unique.', "{$path}.columns.{$index}.key");
            }
            $allowed[$key] = true;
            $normalizedColumns[] = [
                'key' => $key,
                'label' => self::text($column['label'], "{$path}.columns.{$index}.label", self::MAX_TITLE),
            ];
        }

        $rows = self::list($section['rows'], "{$path}.rows", 0, self::MAX_ROWS);
        $normalizedRows = [];
        foreach ($rows as $rowIndex => $rowValue) {
            $row = self::object($rowValue, "{$path}.rows.{$rowIndex}", allowList: false);
            if ($row === []) {
                throw self::invalid('Empty table rows are not supported by the JSON request boundary.', "{$path}.rows.{$rowIndex}");
            }
            foreach ($row as $key => $cell) {
                if (! isset($allowed[$key])) {
                    throw self::invalid('Table rows may only contain declared columns.', "{$path}.rows.{$rowIndex}.{$key}");
                }
                $row[$key] = self::cell($cell, "{$path}.rows.{$rowIndex}.{$key}");
            }
            $normalizedRows[] = $row;
        }

        return ['type' => 'table', 'columns' => $normalizedColumns, 'rows' => $normalizedRows];
    }

    /** @return array<string, mixed> */
    private static function normalizeSlide(mixed $value, string $path): array
    {
        $slide = self::object($value, $path);
        self::exactKeys($slide, ['body', 'bullets', 'title'], ['title'], $path);
        $result = ['title' => self::text($slide['title'], "{$path}.title", self::MAX_TITLE)];
        if (array_key_exists('body', $slide)) {
            $result['body'] = self::text($slide['body'], "{$path}.body", self::MAX_TEXT);
        }
        if (array_key_exists('bullets', $slide)) {
            $bullets = self::list($slide['bullets'], "{$path}.bullets", 0, self::MAX_LIST_ITEMS);
            $result['bullets'] = array_map(
                static fn (mixed $item, int $index): string => self::text(
                    $item,
                    "{$path}.bullets.{$index}",
                    self::MAX_TEXT,
                ),
                $bullets,
                array_keys($bullets),
            );
        }
        if (! array_key_exists('body', $result) && ($result['bullets'] ?? []) === []) {
            throw self::invalid('A slide requires body text or bullets.', $path);
        }

        return $result;
    }

    /** @return array<string, mixed> */
    private static function normalizeSheet(mixed $value, string $path): array
    {
        $sheet = self::object($value, $path);
        self::exactKeys($sheet, ['columns', 'name', 'rows'], ['name', 'columns', 'rows'], $path);
        $name = self::text($sheet['name'], "{$path}.name", 31);
        if (preg_match('/[:\\\\\/?*\[\]]/', $name) === 1) {
            throw self::invalid('Worksheet name contains a reserved character.', "{$path}.name");
        }
        $columns = self::list($sheet['columns'], "{$path}.columns", 1, self::MAX_COLUMNS);
        $normalizedColumns = array_map(
            static fn (mixed $column, int $index): string => self::text(
                $column,
                "{$path}.columns.{$index}",
                self::MAX_TITLE,
            ),
            $columns,
            array_keys($columns),
        );
        $rows = self::list($sheet['rows'], "{$path}.rows", 0, self::MAX_ROWS);
        $normalizedRows = [];
        foreach ($rows as $rowIndex => $rowValue) {
            $row = self::list($rowValue, "{$path}.rows.{$rowIndex}", 0, self::MAX_COLUMNS);
            if (count($row) !== count($normalizedColumns)) {
                throw self::invalid('Worksheet rows must match the declared column count.', "{$path}.rows.{$rowIndex}");
            }
            $normalizedRows[] = array_map(
                static fn (mixed $cell, int $columnIndex): mixed => self::cell(
                    $cell,
                    "{$path}.rows.{$rowIndex}.{$columnIndex}",
                ),
                $row,
                array_keys($row),
            );
        }

        return ['name' => $name, 'columns' => $normalizedColumns, 'rows' => $normalizedRows];
    }

    /** @return array<string, mixed> */
    private static function object(mixed $value, string $path, bool $allowList = false): array
    {
        if (! is_array($value) || (! $allowList && $value !== [] && array_is_list($value))) {
            throw self::invalid('Semantic document object is invalid.', $path);
        }

        return $value;
    }

    /** @return list<mixed> */
    private static function list(mixed $value, string $path, int $minimum, int $maximum): array
    {
        if (! is_array($value) || ! array_is_list($value) || count($value) < $minimum || count($value) > $maximum) {
            throw self::invalid('Semantic document list is outside its allowed bounds.', $path);
        }

        return $value;
    }

    /**
     * @param  array<string, mixed>  $value
     * @param  list<string>  $allowed
     * @param  list<string>  $required
     */
    private static function exactKeys(array $value, array $allowed, array $required, string $path): void
    {
        $keys = array_keys($value);
        if (array_diff($keys, $allowed) !== [] || array_diff($required, $keys) !== []) {
            throw self::invalid('Semantic document contains missing or unknown fields.', $path);
        }
    }

    private static function text(mixed $value, string $path, int $maximum): string
    {
        if (! is_string($value) || $value === '' || mb_strlen($value) > $maximum) {
            throw self::invalid('Semantic document text is outside its allowed bounds.', $path);
        }

        return $value;
    }

    private static function locale(mixed $value): string
    {
        if (! is_string($value) || preg_match('/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/', $value) !== 1) {
            throw self::invalid('Semantic document locale is invalid.', 'document.locale');
        }

        return $value;
    }

    private static function cell(mixed $value, string $path): mixed
    {
        if (is_string($value)) {
            if (mb_strlen($value) > self::MAX_TEXT) {
                throw self::invalid('Semantic document cell text is too long.', $path);
            }

            return $value;
        }
        if (is_int($value) || is_bool($value) || $value === null) {
            return $value;
        }
        if (is_float($value) && is_finite($value)) {
            return $value;
        }

        throw self::invalid('Semantic document cell type is invalid.', $path);
    }

    private static function invalid(string $message, ?string $field = null): TalosArtifactGenerationException
    {
        return new TalosArtifactGenerationException(
            'TALOS_ARTIFACT_DOCUMENT_INVALID',
            $message,
            422,
            $field,
        );
    }
}
