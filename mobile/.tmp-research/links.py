import sys, re, html
with open(sys.argv[1], 'r', encoding='utf-8', errors='replace') as f:
    s = f.read()
hrefs = re.findall(r'href="([^"]+)"', s)
seen = []
for h in hrefs:
    h = html.unescape(h)
    if h.startswith('http') and 'openai.com/index' not in h:
        if h not in seen:
            seen.append(h)
for h in seen:
    print(h)
