export interface VocabRow {
  arabiziWord: string;
  englishTranslation: string;
}

export interface SentenceRow {
  arabiziSentence: string;
  englishTranslation: string;
}

export interface ConjugationRow {
  baseVerb: string;
  englishMeaning: string;
  ana: string;
  ni7na: string;
  inta: string;
  inte: string;
  into: string;
  huwe: string;
  hiyye: string;
  hinne: string;
}

/** RFC-4180 CSV parser. Returns all rows including the header. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const pushField = (): void => {
    row.push(field);
    field = '';
  };
  const pushRow = (): void => {
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const ch = text.charAt(i);
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      pushField();
      i++;
      continue;
    }
    if (ch === '\r') {
      i++;
      continue;
    }
    if (ch === '\n') {
      pushField();
      pushRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // flush the final field/row if the file did not end with a newline
  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }
  return rows;
}

function dataRows(text: string, expectedCols: number): string[][] {
  const all = parseCsv(text);
  const body = all.slice(1); // drop header
  return body
    .filter((r) => !(r.length === 1 && (r[0] ?? '') === ''))
    .map((r) => {
      if (r.length !== expectedCols) {
        throw new Error(
          `Expected ${String(expectedCols)} columns, got ${String(r.length)}: ${r.join('|')}`,
        );
      }
      return r.map((c) => c.trim());
    });
}

export function parseVocabCsv(text: string): VocabRow[] {
  return dataRows(text, 2).map((r) => ({
    arabiziWord: r[0] ?? '',
    englishTranslation: r[1] ?? '',
  }));
}

export function parseSentencesCsv(text: string): SentenceRow[] {
  return dataRows(text, 2).map((r) => ({
    arabiziSentence: r[0] ?? '',
    englishTranslation: r[1] ?? '',
  }));
}

export function parseConjugationsCsv(text: string): ConjugationRow[] {
  return dataRows(text, 10).map((r) => ({
    baseVerb: r[0] ?? '',
    englishMeaning: r[1] ?? '',
    ana: r[2] ?? '',
    ni7na: r[3] ?? '',
    inta: r[4] ?? '',
    inte: r[5] ?? '',
    into: r[6] ?? '',
    huwe: r[7] ?? '',
    hiyye: r[8] ?? '',
    hinne: r[9] ?? '',
  }));
}
