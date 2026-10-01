// Streaming adapter for the four existing provaSenzaTest declarations. This is
// not a general runner parser: it must agree with that independent public oracle.
const NODE_ZERO = /(?:^|\n)\s*(?:[ℹ#]\s*)?tests\s+0\s*(?:\n|$)/i;
const LITERAL_ZERO = /no test files found|no tests found|(?:^|\s)0 passing/i;
const WINDOW = 64;
const EDGE = 2_048;
// Detach retained slices from the incoming allocation, including large strings.
const copy = text => Buffer.from(text, 'utf16le').toString('utf16le');
function wholeCharacters(text) {
  const first = text.charCodeAt(0), last = text.charCodeAt(text.length - 1);
  return text.slice(first >= 0xdc00 && first <= 0xdfff ? 1 : 0,
    last >= 0xd800 && last <= 0xdbff ? -1 : undefined);
}

function nodeWindow() {
  let tail = '', clipped = false, matched = false;
  return {
    append(text) {
      if (matched) return;
      // Only Node's expression is whitespace-normalized. It distinguishes LF
      // from other whitespace; literal runner messages are never normalized.
      const normalized = (tail + text).replace(/\s+/gu, run => run.includes('\n') ? '\n' : ' ');
      // A chunk boundary is NOT EOF, and a clipped window is NOT stream start.
      matched = NODE_ZERO.test((clipped ? '\0' : '') + normalized + '\0');
      clipped ||= normalized.length > WINDOW;
      tail = copy(normalized.slice(-WINDOW));
    },
    finish() {return matched || NODE_ZERO.test((clipped ? '\0' : '') + tail);},
  };
}

/** Bounded recognition and a truthful excerpt of the first matching output line. */
export function createZeroTestScanner() {
  const node = nodeWindow();
  let lineNode = nodeWindow(), lineHead = '', lineTail = '', lineLength = 0;
  let literalTail = '', literalClipped = false, literalExcerpt = null;
  let declaration = null, literalFound = false, finished = false;

  function appendLine(text) {
    if (declaration !== null) return;
    lineLength += text.length;
    if (lineHead.length < EDGE) lineHead = copy((lineHead + text).slice(0, EDGE));
    lineTail = copy((lineTail + text).slice(-EDGE));
    lineNode.append(text);
    if (literalExcerpt === null) {
      const window = literalTail + text;
      const prefix = literalClipped ? '\0' : '';
      const match = LITERAL_ZERO.exec(prefix + window);
      if (match) {
        literalFound = true;
        const from = Math.max(0, match.index - prefix.length);
        literalExcerpt = copy(wholeCharacters(window.slice(Math.max(0, from - 64), from + match[0].length + 64)));
      }
      literalClipped ||= window.length > WINDOW;
      literalTail = copy(window.slice(-WINDOW));
    }
  }
  function endLine() {
    if (declaration === null && (literalExcerpt !== null || lineNode.finish())) {
      if (lineLength <= EDGE) declaration = lineHead.trim();
      else if (lineLength <= 2 * EDGE) declaration = (lineHead + lineTail.slice(2 * EDGE - lineLength)).trim();
      else {
        const head = wholeCharacters(lineHead), tail = wholeCharacters(lineTail);
        declaration = `${head}\n[${lineLength - head.length - tail.length} UTF-16 code units omitted from this declaration]\n${tail}`.trim();
        if (literalExcerpt !== null) declaration += `\n[matching original excerpt]\n${literalExcerpt.trim()}`;
      }
    }
    lineNode = nodeWindow(); lineHead = ''; lineTail = ''; lineLength = 0;
    literalTail = ''; literalClipped = false; literalExcerpt = null;
  }
  return {
    append(text) {
      if (finished) throw new Error('zero-test scanner already finished');
      if (typeof text !== 'string') throw new TypeError('decoded text required');
      for (let start = 0; start < text.length; start += 4_096) {
        if (declaration !== null) return;
        const chunk = text.slice(start, start + 4_096);
        node.append(chunk);
        let from = 0, newline;
        while ((newline = chunk.indexOf('\n', from)) !== -1) {
          appendLine(chunk.slice(from, newline)); endLine(); from = newline + 1;
        }
        appendLine(chunk.slice(from));
      }
    },
    finish(exitCode) {
      if (!finished) {endLine(); finished = true;}
      return {zeroTests: exitCode === 0 && (literalFound || node.finish()), declaration: declaration ?? ''};
    },
  };
}
