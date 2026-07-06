<?php
/**
 * KADMOS AVM — Supreme Boot Animation
 * Terminal-playable ANSI/ASCII boot sequence in pure PHP.
 *
 * Usage:
 *   php kadmos_boot_animation_supreme.php
 *
 * Integration:
 *   require_once __DIR__ . '/kadmos_boot_animation_supreme.php';
 *   kadmos_boot_animation_supreme();
 */

function kadmos_write_at(int $x, int $y, string $text, string $color = ''): void
{
    echo "\033[{$y};{$x}H{$color}{$text}\033[0m\033[48;2;13;17;23m";
}

function kadmos_strlen(string $text): int
{
    if (function_exists('mb_strlen')) {
        return mb_strlen($text, 'UTF-8');
    }
    return strlen($text);
}

function kadmos_substr(string $text, int $start, ?int $length = null): string
{
    if (function_exists('mb_substr')) {
        return mb_substr($text, $start, $length, 'UTF-8');
    }
    return $length === null ? substr($text, $start) : substr($text, $start, $length);
}

function kadmos_center_x(string $text, int $cols): int
{
    return max(1, intdiv($cols - kadmos_strlen($text), 2));
}

function kadmos_term_size(): array
{
    $cols = 118;
    $rows = 36;

    if (function_exists('shell_exec')) {
        $stty = @shell_exec('stty size 2>/dev/null');
        if (is_string($stty) && preg_match('/(\d+)\s+(\d+)/', trim($stty), $m)) {
            $rows = (int)$m[1];
            $cols = (int)$m[2];
        }
    }

    $envCols = getenv('COLUMNS');
    $envRows = getenv('LINES');

    if ($envCols !== false && ctype_digit((string)$envCols)) {
        $cols = (int)$envCols;
    }

    if ($envRows !== false && ctype_digit((string)$envRows)) {
        $rows = (int)$envRows;
    }

    return [$cols, $rows];
}

function kadmos_clear(string $dark): void
{
    echo $dark . "\033[2J\033[H";
}

function kadmos_draw_box(int $x, int $y, int $w, int $h, string $color): void
{
    if ($w < 4 || $h < 3) {
        return;
    }

    kadmos_write_at($x, $y, '╭' . str_repeat('─', $w - 2) . '╮', $color);
    for ($i = 1; $i < $h - 1; $i++) {
        kadmos_write_at($x, $y + $i, '│' . str_repeat(' ', $w - 2) . '│', $color);
    }
    kadmos_write_at($x, $y + $h - 1, '╰' . str_repeat('─', $w - 2) . '╯', $color);
}

function kadmos_bar(float $progress, int $width = 36): string
{
    $progress = max(0.0, min(1.0, $progress));
    $filled = (int)floor($progress * $width);
    $empty = max(0, $width - $filled);
    return '▰' . str_repeat('▰', max(0, $filled - 1)) . str_repeat('▱', $empty);
}

function kadmos_brand_logo(): array
{
    return [
        '██╗  ██╗ █████╗ ██████╗ ███╗   ███╗ ██████╗ ███████╗',
        '██║ ██╔╝██╔══██╗██╔══██╗████╗ ████║██╔═══██╗██╔════╝',
        '█████╔╝ ███████║██║  ██║██╔████╔██║██║   ██║███████╗',
        '██╔═██╗ ██╔══██║██║  ██║██║╚██╔╝██║██║   ██║╚════██║',
        '██║  ██╗██║  ██║██████╔╝██║ ╚═╝ ██║╚██████╔╝███████║',
        '╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚═╝     ╚═╝ ╚═════╝ ╚══════╝',
    ];
}

function kadmos_mark(): array
{
    return [
        '             ◎             ',
        '             ↓             ',
        '             ○             ',
        '          ↙  │  ↘          ',
        '       ○  ←  ●  →  ○       ',
        '             ↓             ',
        '             ○             ',
    ];
}

function kadmos_microgrid(int $cols, int $rows, float $t, array $ansi): void
{
    // Quiet deterministic grid, no harsh flicker.
    $yBase = max(1, $rows - 8);
    for ($y = $yBase; $y <= $rows - 2; $y += 2) {
        $offset = ((int)floor($t * 2) + $y) % 6;
        $line = str_repeat(' ', $offset) . str_repeat('·     ', max(1, intdiv($cols, 6)));
        kadmos_write_at(1, $y, kadmos_substr($line, 0, $cols), $ansi['grid']);
    }
}

function kadmos_phase_wake(int $cols, int $rows, float $elapsed, array $ansi): void
{
    kadmos_clear($ansi['dark']);
    kadmos_microgrid($cols, $rows, $elapsed, $ansi);

    $title = 'KADMOS SYSTEM WAKE';
    $subtitle = 'deterministic agent orchestration runtime';
    $visibleLen = min(kadmos_strlen($title), max(1, (int)floor(kadmos_strlen($title) * min(1.0, $elapsed / 0.85))));
    $visible = kadmos_substr($title, 0, $visibleLen);

    $cy = intdiv($rows, 2);
    $pulse = ($elapsed > 0.55) ? '◆' : '◇';

    kadmos_write_at(kadmos_center_x($pulse, $cols), $cy - 4, $pulse, $ansi['gold']);
    kadmos_write_at(kadmos_center_x($visible, $cols), $cy - 1, $visible, $ansi['gold']);
    kadmos_write_at(kadmos_center_x($subtitle, $cols), $cy + 1, $subtitle, $ansi['muted']);

    $progress = min(1.0, $elapsed / 1.0);
    $bar = kadmos_bar($progress, 38);
    kadmos_write_at(kadmos_center_x($bar, $cols), $cy + 4, $bar, $ansi['bronze']);

    flush();
}

function kadmos_phase_core(int $cols, int $rows, float $elapsed, array $ansi): void
{
    kadmos_clear($ansi['dark']);
    kadmos_microgrid($cols, $rows, $elapsed + 1.0, $ansi);

    $logo = kadmos_brand_logo();
    $mark = kadmos_mark();

    $logoReveal = min(1.0, max(0.0, ($elapsed - 0.15) / 0.9));
    $shownLogo = (int)ceil(count($logo) * $logoReveal);

    $topY = max(2, intdiv($rows, 2) - 13);

    for ($i = 0; $i < $shownLogo; $i++) {
        kadmos_write_at(kadmos_center_x($logo[$i], $cols), $topY + $i, $logo[$i], $ansi['gold']);
    }

    $markReveal = min(1.0, max(0.0, ($elapsed - 0.8) / 0.7));
    $shownMark = (int)ceil(count($mark) * $markReveal);
    $markY = $topY + count($logo) + 3;

    for ($i = 0; $i < $shownMark; $i++) {
        kadmos_write_at(kadmos_center_x($mark[$i], $cols), $markY + $i, $mark[$i], $ansi['bronze']);
    }

    $caption = 'GRAPH CORE ASSEMBLY';
    kadmos_write_at(kadmos_center_x($caption, $cols), $markY + count($mark) + 2, $caption, $ansi['text']);

    flush();
}

function kadmos_phase_orchestration(int $cols, int $rows, float $elapsed, array $ansi): void
{
    kadmos_clear($ansi['dark']);
    kadmos_microgrid($cols, $rows, $elapsed + 2.0, $ansi);

    $panelW = min(96, max(72, $cols - 12));
    $panelH = 21;
    $panelX = kadmos_center_x(str_repeat(' ', $panelW), $cols);
    $panelY = max(2, intdiv($rows - $panelH, 2));

    kadmos_draw_box($panelX, $panelY, $panelW, $panelH, $ansi['dim']);

    $title = 'KADMOS AVM';
    $subtitle = 'sovereign deterministic orchestration layer';
    kadmos_write_at($panelX + 4, $panelY + 2, $title, $ansi['gold']);
    kadmos_write_at($panelX + 4, $panelY + 3, $subtitle, $ansi['muted']);
    kadmos_write_at($panelX + 4, $panelY + 5, str_repeat('─', $panelW - 8), $ansi['dim']);

    $modules = [
        ['GRAPH CORE',       'loading topology map'],
        ['JMP GATE',         'schema lock negotiated'],
        ['DAG ENGINE',       'acyclic path verified'],
        ['EXECUTION BUS',    'dispatch lanes armed'],
        ['STATE LEDGER',     'checksum continuity sealed'],
        ['GUARDIAN MODE',    'runtime protection active'],
        ['HMI CHANNEL',      'operator surface ready'],
    ];

    $activeCount = min(count($modules), max(0, (int)floor(($elapsed - 0.15) * 4.2)));

    foreach ($modules as $i => [$name, $desc]) {
        $y = $panelY + 7 + $i;
        $ready = $i < $activeCount;
        $status = $ready ? 'ONLINE' : 'WAIT';
        $statusColor = $ready ? $ansi['gold'] : $ansi['muted'];
        $dot = $ready ? '●' : '○';

        kadmos_write_at($panelX + 5, $y, $dot, $statusColor);
        kadmos_write_at($panelX + 8, $y, str_pad($name, 16), $ansi['text']);
        kadmos_write_at($panelX + 26, $y, ':: ' . str_pad($desc, 34), $ansi['muted']);
        kadmos_write_at($panelX + $panelW - 14, $y, $status, $statusColor);
    }

    $progress = min(1.0, max(0.0, ($elapsed - 0.2) / 1.7));
    $bar = kadmos_bar($progress, $panelW - 21);
    kadmos_write_at($panelX + 5, $panelY + $panelH - 4, $bar, $ansi['bronze']);
    kadmos_write_at($panelX + $panelW - 13, $panelY + $panelH - 4, sprintf('%3d%%', (int)floor($progress * 100)), $ansi['gold']);

    flush();
}

function kadmos_phase_ready(int $cols, int $rows, float $elapsed, array $ansi): void
{
    kadmos_clear($ansi['dark']);
    kadmos_microgrid($cols, $rows, $elapsed + 3.0, $ansi);

    $logo = kadmos_brand_logo();
    $mark = kadmos_mark();

    $compact = $cols < 92 || $rows < 30;
    $topY = $compact ? 2 : max(2, intdiv($rows, 2) - 15);

    if (!$compact) {
        foreach ($logo as $i => $line) {
            kadmos_write_at(kadmos_center_x($line, $cols), $topY + $i, $line, $ansi['gold']);
        }
        $markY = $topY + count($logo) + 2;
    } else {
        kadmos_write_at(kadmos_center_x('KADMOS', $cols), $topY, 'KADMOS', $ansi['gold']);
        $markY = $topY + 2;
    }

    foreach ($mark as $i => $line) {
        kadmos_write_at(kadmos_center_x($line, $cols), $markY + $i, $line, $ansi['bronze']);
    }

    $status = 'KADMOS AVM :: READY';
    $tagline = 'graph locked | runtime online | deterministic execution ready';
    $prompt = 'kadmos > _';

    kadmos_write_at(kadmos_center_x($status, $cols), $markY + count($mark) + 2, $status, $ansi['gold']);
    kadmos_write_at(kadmos_center_x($tagline, $cols), $markY + count($mark) + 4, $tagline, $ansi['muted']);
    kadmos_write_at(kadmos_center_x($prompt, $cols), $markY + count($mark) + 7, $prompt, $ansi['amber']);

    flush();
}

function kadmos_boot_animation_supreme(float $duration = 5.2, int $fps = 10): void
{
    if (function_exists('mb_internal_encoding')) {
        mb_internal_encoding('UTF-8');
    }

    $ansi = [
        'dark'   => "\033[48;2;13;17;23m",
        'reset'  => "\033[0m",
        'hide'   => "\033[?25l",
        'show'   => "\033[?25h",
        'bronze' => "\033[38;2;210;153;34m",
        'gold'   => "\033[38;2;255;215;106m",
        'amber'  => "\033[38;2;255;191;0m",
        'dim'    => "\033[38;2;88;67;29m",
        'grid'   => "\033[38;2;35;44;54m",
        'text'   => "\033[38;2;230;237;243m",
        'muted'  => "\033[38;2;139;148;158m",
    ];

    [$cols, $rows] = kadmos_term_size();
    $frameDelayUs = (int)(1000000 / max(1, $fps));
    $start = microtime(true);

    echo $ansi['hide'] . $ansi['dark'];

    try {
        while (true) {
            $elapsed = microtime(true) - $start;

            if ($elapsed >= $duration) {
                break;
            }

            if ($elapsed < 1.1) {
                kadmos_phase_wake($cols, $rows, $elapsed, $ansi);
            } elseif ($elapsed < 2.6) {
                kadmos_phase_core($cols, $rows, $elapsed - 1.1, $ansi);
            } elseif ($elapsed < 4.55) {
                kadmos_phase_orchestration($cols, $rows, $elapsed - 2.6, $ansi);
            } else {
                kadmos_phase_ready($cols, $rows, $elapsed - 4.55, $ansi);
            }

            usleep($frameDelayUs);
        }

        kadmos_phase_ready($cols, $rows, 2.0, $ansi);
    } finally {
        echo $ansi['reset'] . $ansi['show'] . PHP_EOL;
        flush();
    }
}

if (PHP_SAPI === 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    kadmos_boot_animation_supreme();
    kadmos_shell();
}

function kadmos_shell(): void {
    $bold = "\033[1m";
    $gold = "\033[38;5;220m";
    $cyan = "\033[38;5;51m";
    $green = "\033[32m";
    $dim = "\033[2m";
    $yellow = "\033[33m";
    $reset = "\033[0m";

    $baseDir = dirname(realpath($_SERVER['SCRIPT_FILENAME'] ?? __FILE__));
    $phpBin = $baseDir . '/../.tools/php/php.exe';
    if (!file_exists($phpBin)) $phpBin = 'php';
    $kadmosCli = $baseDir . '/kadmos';

    $hasKey = (bool)(getenv('KADMOS_API_KEY') ?: getenv('DEEPSEEK_API_KEY'));

    // Welcome
    echo "\n{$bold}{$gold}  ⚡ KADMOS ENGINE SHELL{$reset}\n";
    echo $hasKey
        ? "{$dim}  API key: {$green}configured{$dim} — ready for live execution{$reset}\n"
        : "{$dim}  API key: {$yellow}not set{$dim} — mock mode only{$reset}\n";
    echo "{$dim}  Type {$cyan}help{$dim} for commands, {$cyan}start{$dim} to run, {$cyan}exit{$dim} to quit{$reset}\n\n";

    while (true) {
        echo "{$gold}kadmos{$reset} {$dim}»{$reset} ";
        $line = trim(fgets(STDIN));
        if ($line === '' || $line === false) continue;
        if ($line === 'exit' || $line === 'quit') break;

        $args = explode(' ', $line);
        $cmd = $args[0];
        $rest = implode(' ', array_slice($args, 1));

        switch ($cmd) {
            case 'start':
                // Auto-add --mock if no API key
                if (!$hasKey && !str_contains($rest, '--mock') && !str_contains($rest, '--demo-throttle')) {
                    $rest = trim($rest . ' --mock');
                    echo "{$dim}  No API key — using mock mode{$reset}\n";
                }
                passthru(escapeshellarg($phpBin) . ' ' . escapeshellarg($kadmosCli) . ' start ' . ($rest ?: '5 --mock'));
                break;
            case 'test':
                passthru(escapeshellarg($phpBin) . ' ' . escapeshellarg($kadmosCli) . ' test');
                break;
            case 'validate':
                if ($rest) {
                    passthru(escapeshellarg($phpBin) . ' ' . escapeshellarg($kadmosCli) . ' validate ' . escapeshellarg($rest));
                } else {
                    echo "{$dim}  Usage: validate <file.json>{$reset}\n";
                }
                break;
            case 'benchmark':
                passthru(escapeshellarg($phpBin) . ' ' . escapeshellarg($kadmosCli) . ' benchmark 10');
                break;
            case 'status':
                passthru(escapeshellarg($phpBin) . ' ' . escapeshellarg($kadmosCli) . ' status');
                break;
            case 'dashboard':
                echo "{$dim}  Dashboard: {$cyan}http://127.0.0.1:3000/dashboard{$reset}\n";
                echo "{$dim}  Start with: cd validator && npx tsx src/server.ts{$reset}\n";
                break;
            case 'chat':
                $validatorDir = $baseDir . '/../validator';
                if (!is_dir($validatorDir)) {
                    echo "{$dim}  Validator directory not found{$reset}\n";
                    break;
                }
                echo "{$gold}  ⚡ Starting TALOS Chat...{$reset}\n";
                echo "{$dim}  Opening {$cyan}http://127.0.0.1:3000/dashboard{$reset}\n";
                echo "{$dim}  Press Ctrl+C to stop{$reset}\n\n";
                $nodeBin = $baseDir . '/../.tools/node/node.exe';
                if (!file_exists($nodeBin)) $nodeBin = 'node';
                $tsxBin = $baseDir . '/../.tools/node/node_modules/.bin/tsx';
                if (file_exists($tsxBin)) {
                    $cmd = 'cd ' . escapeshellarg($validatorDir) . ' && ' . escapeshellarg($nodeBin) . ' ' . escapeshellarg($tsxBin) . ' src/server.ts';
                } else {
                    $cmd = 'cd ' . escapeshellarg($validatorDir) . ' && npx tsx src/server.ts';
                }
                // Try to open browser
                if (PHP_OS_FAMILY === 'Windows') {
                    exec('start http://127.0.0.1:3000/dashboard 2>NUL');
                } elseif (PHP_OS_FAMILY === 'Darwin') {
                    exec('open http://127.0.0.1:3000/dashboard 2>/dev/null');
                } else {
                    exec('xdg-open http://127.0.0.1:3000/dashboard 2>/dev/null');
                }
                passthru($cmd);
                break;
            case 'key':
                echo "{$dim}  Set your API key:{$reset}\n";
                echo "{$dim}    cmd:  set KADMOS_API_KEY=sk-...{$reset}\n";
                echo "{$dim}    bash: export KADMOS_API_KEY=sk-...{$reset}\n";
                break;
            case 'help':
                echo "\n{$bold}{$gold}  KADMOS SHELL — Commands{$reset}\n\n";
                echo "  {$cyan}start [N] [--mock] [--demo-throttle]{$reset}\n";
                echo "  {$dim}    Launch the main event loop. Add --demo-throttle for live DAG visualization.{$reset}\n";
                echo "  {$cyan}test{$reset}          {$dim}Run all test suites (29 core + 46 validator){$reset}\n";
                echo "  {$cyan}benchmark{$reset}     {$dim}Run all 7 benchmark scenarios{$reset}\n";
                echo "  {$cyan}validate <file>{$reset} {$dim}Validate a JMP JSON batch{$reset}\n";
                echo "  {$cyan}status{$reset}        {$dim}System diagnostics (PHP, tests, endpoints){$reset}\n";
                echo "  {$cyan}dashboard{$reset}      {$dim}Talos UI info{$reset}\n";
                echo "  {$cyan}chat{$reset}           {$dim}Launch Talos Chat + open browser{$reset}\n";
                echo "  {$cyan}key{$reset}           {$dim}Show API key setup instructions{$reset}\n";
                echo "  {$cyan}exit{$reset}          {$dim}Shutdown engine{$reset}\n";
                echo "\n";
                if (!$hasKey) {
                    echo "{$yellow}  Quick start:{$reset} {$cyan}start{$reset} {$dim}(auto-uses --mock, no key needed){$reset}\n\n";
                }
                break;
            default:
                echo "{$dim}  Unknown: {$cmd} — type {$cyan}help{$dim} for commands{$reset}\n";
        }
    }

    echo "\n{$gold}  ⚡ KADMOS ENGINE SHUTDOWN{$reset}\n\n";
}
