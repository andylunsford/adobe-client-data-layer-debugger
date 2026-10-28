const TOKEN = /("(?:\\u[0-9a-fA-F]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g;

function classify(match) {
  if (match.startsWith('"')) return match.endsWith(':') ? 'jk' : 'js';
  if (match === 'true' || match === 'false') return 'jb';
  if (match === 'null') return 'jl';
  return 'jn';
}

export function highlightJsonTokens(value) {
  const json = JSON.stringify(value, null, 2);
  const tokens = [];
  let last = 0;
  for (const m of json.matchAll(TOKEN)) {
    if (m.index > last) tokens.push({ text: json.slice(last, m.index), cls: null });
    tokens.push({ text: m[0], cls: classify(m[0]) });
    last = m.index + m[0].length;
  }
  if (last < json.length) tokens.push({ text: json.slice(last), cls: null });
  return tokens;
}
