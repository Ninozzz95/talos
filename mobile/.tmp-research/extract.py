import sys, re, html, json, os

def extract(path):
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        s = f.read()
    # strip script/style
    s = re.sub(r'<script[^>]*>.*?</script>', ' ', s, flags=re.S|re.I)
    s = re.sub(r'<style[^>]*>.*?</style>', ' ', s, flags=re.S|re.I)
    s = re.sub(r'<svg[^>]*>.*?</svg>', ' ', s, flags=re.S|re.I)
    s = re.sub(r'<!--.*?-->', ' ', s, flags=re.S)
    # block elements -> newline
    s = re.sub(r'</(p|div|li|h1|h2|h3|h4|h5|h6|tr|section|article|header|footer|blockquote|pre)>', '\n', s, flags=re.I)
    s = re.sub(r'<br\s*/?>', '\n', s, flags=re.I)
    s = re.sub(r'</td>|</th>', ' | ', s, flags=re.I)
    s = re.sub(r'<[^>]+>', ' ', s)
    s = html.unescape(s)
    s = re.sub(r'[ \t ]+', ' ', s)
    s = re.sub(r'\n\s*\n+', '\n', s)
    lines = [l.strip() for l in s.split('\n')]
    lines = [l for l in lines if l]
    return '\n'.join(lines)

if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
    out = extract(sys.argv[1])
    if len(sys.argv) > 2:
        with open(sys.argv[2], 'w', encoding='utf-8') as f:
            f.write(out)
        print("wrote", sys.argv[2], len(out), "chars")
    else:
        print(out)
