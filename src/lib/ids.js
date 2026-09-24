export function makePageLoadId() {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return `pl_${hex}`;
}
