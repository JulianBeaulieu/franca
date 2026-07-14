const TRAILING_PUNCT = /[.,!?;:"']+$/;

export function normalizeAnswer(s: string): string {
  let out = s.normalize('NFC').toLowerCase().trim();
  out = out.replace(/\s+/g, ' ');
  out = out.replace(TRAILING_PUNCT, '');
  out = out.replace(/[-']/g, '');
  return out.trim();
}

export function parseGloss(translation: string): { primary: string; accepted: string[] } {
  const trimmed = translation.trim();
  // Primary display gloss: text before the first " (" note, keep the whole thing otherwise.
  const noteIdx = trimmed.indexOf(' (');
  const withoutNote = noteIdx >= 0 ? trimmed.slice(0, noteIdx).trim() : trimmed;
  const primary = withoutNote.split('/')[0]?.trim() ?? withoutNote;
  const accepted = withoutNote
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return { primary, accepted: accepted.length > 0 ? accepted : [withoutNote] };
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const del = (prev[j] ?? 0) + 1;
      const ins = (curr[j - 1] ?? 0) + 1;
      const sub = (prev[j - 1] ?? 0) + cost;
      curr[j] = Math.min(del, ins, sub);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j] ?? 0;
  }
  return prev[n] ?? 0;
}

export function answersMatch(input: string, accepted: string[]): boolean {
  const norm = normalizeAnswer(input);
  return accepted.some((a) => normalizeAnswer(a) === norm);
}

export function isTypo(input: string, accepted: string[]): boolean {
  if (answersMatch(input, accepted)) return false;
  const norm = normalizeAnswer(input);
  return accepted.some((a) => {
    const target = normalizeAnswer(a);
    const threshold = Math.max(1, Math.floor(target.length / 6));
    return levenshtein(norm, target) <= threshold;
  });
}
