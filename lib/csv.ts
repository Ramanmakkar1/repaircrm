/**
 * A small RFC 4180 CSV reader/writer.
 *
 * Spreadsheets are how a shop's existing customer list and parts catalogue
 * arrive, and every one of them breaks a naive `split(",")`: quoted commas,
 * doubled quotes inside a quoted field, CRLF line endings, and the UTF-8 BOM
 * Excel writes on Windows. All four are handled here, in ~60 lines, so the
 * import wizard needs no dependency.
 *
 * Pure — no Node APIs, no Prisma — so both the route handler and any client
 * preview can import it.
 */

/** Anything below this and the file is almost certainly not a CSV. */
export const CSV_MAX_ROWS = 5_000;

export type CsvTable = {
  /** The first row, trimmed. Duplicate/blank headers are made unique. */
  headers: string[];
  /** Every following row, padded/truncated to `headers.length`. */
  rows: string[][];
};

/**
 * Splits CSV text into raw rows of raw cells.
 *
 * A single pass over the characters with one boolean of state ("am I inside
 * quotes?"). Inside quotes a `""` is a literal quote and a newline is data;
 * outside them a comma ends the cell and CR/LF ends the row.
 */
export function parseCsvRows(input: string): string[][] {
  // Excel prefixes UTF-8 files with a BOM, which would otherwise become part of
  // the first header and break every header match.
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let dirty = false; // this row has content (so a trailing newline adds nothing)

  const endCell = () => {
    row.push(cell);
    cell = "";
    dirty = true;
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
    dirty = false;
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"' && cell === "") {
      quoted = true;
    } else if (char === ",") {
      endCell();
    } else if (char === "\r") {
      // Swallow the LF of a CRLF pair; a lone CR is still a row break.
      if (text[i + 1] === "\n") i++;
      endRow();
    } else if (char === "\n") {
      endRow();
    } else {
      cell += char;
    }
  }

  // A file that does not end in a newline still has one last row in the buffer.
  if (dirty || cell !== "" || row.length > 0) endRow();

  return rows;
}

/**
 * Reads a CSV into a header row plus normalised data rows.
 *
 * Rows that are entirely empty are dropped — trailing blank lines are the most
 * common thing in an exported spreadsheet and they are not import errors.
 */
export function parseCsv(input: string, maxRows = CSV_MAX_ROWS): CsvTable {
  const raw = parseCsvRows(input).filter((row) =>
    row.some((cell) => cell.trim() !== ""),
  );
  if (raw.length === 0) return { headers: [], rows: [] };

  const headers = uniqueHeaders(raw[0].map((cell) => cell.trim()));
  const width = headers.length;

  const rows = raw.slice(1, maxRows + 1).map((row) => {
    const out = new Array<string>(width);
    for (let i = 0; i < width; i++) out[i] = (row[i] ?? "").trim();
    return out;
  });

  return { headers, rows };
}

/** "" -> "Column 3"; a repeated name gets a " (2)" suffix. */
function uniqueHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((header, index) => {
    const base = header || `Column ${index + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

/** Quotes a value only when it has to be quoted. */
export function csvCell(value: string | number | null | undefined): string {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows -> a CRLF-delimited CSV document, the line ending RFC 4180 specifies. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
