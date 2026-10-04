import * as XLSX from "xlsx";
import { CSV_MAX_ROWS, parseCsv, parseCsvRows, toCsv, type CsvTable } from "./csv";
import { autoMap, fieldsFor, type ImportKind } from "@/components/import/fields";

export type SpreadsheetTable = CsvTable & {
  sheets: string[];
  sheetName: string;
  headerRow: number;
};
const MAX_COLUMNS = 100;
const MAX_HEADER_ROW = 25;
/**
 * The most a zip-based workbook (.xlsx, .ods) may unpack to. A real 5,000-row,
 * 100-column sheet is a fraction of this; a file that squeezes gigabytes into
 * the 5 MB upload limit is not, and parsing it would exhaust the server's
 * memory long before any row limit below could apply.
 */
const MAX_UNZIPPED_BYTES = 50 * 1024 * 1024;

/**
 * What a zip says it will unpack to, summed from its own table of contents
 * (the central directory) without unpacking anything. 0 for anything that is
 * not a zip, such as a CSV or a binary .xls.
 */
export function declaredUnzippedBytes(bytes: Uint8Array): number {
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end-of-directory record is the last 22 bytes plus an optional comment of up to 64 KB.
  let end = bytes.length - 22;
  const earliest = Math.max(0, end - 0xffff);
  while (end >= earliest && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < earliest) return 0;
  const entries = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  let total = 0;
  for (let i = 0; i < entries && at + 46 <= bytes.length && view.getUint32(at, true) === 0x02014b50; i++) {
    total += view.getUint32(at + 24, true);
    at += 46 + view.getUint16(at + 28, true) + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return total;
}

/** Never execute formulas or macros. Formatted text preserves SKU/barcode zeros. */
export function readSpreadsheet(bytes: Uint8Array, fileName: string, kind: ImportKind, options: { sheetName?: string; headerRow?: number } = {}): SpreadsheetTable {
  const extension = fileName.toLowerCase().split(".").pop();
  if (!["csv", "tsv", "xlsx", "xls", "ods"].includes(extension ?? "")) {
    throw new Error("Choose an Excel (.xlsx or .xls), OpenDocument (.ods), CSV, or TSV file.");
  }
  let rows: string[][];
  let sheets: string[] = [];
  let sheetName = "";
  if (extension === "csv" || extension === "tsv") {
    const text = new TextDecoder().decode(bytes);
    const firstLine = text.split(/\r?\n/)[0] ?? "";
    const delimiter = extension === "tsv" ? "\t" : firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
    rows = parseCsvRows(text, delimiter);
  } else {
    if (declaredUnzippedBytes(bytes) > MAX_UNZIPPED_BYTES) throw new Error("That workbook holds far more data than a spreadsheet this size should. Copy just your inventory table into a new file and upload that.");
    const workbook = XLSX.read(bytes, { type: "array", cellFormula: false, cellHTML: false, cellStyles: false, sheetRows: CSV_MAX_ROWS + MAX_HEADER_ROW + 1 });
    sheets = workbook.SheetNames.filter((name) => workbook.Sheets[name]?.["!ref"]);
    sheetName = options.sheetName || sheets[0] || "";
    if (!sheets.includes(sheetName)) throw new Error("Choose a worksheet that contains your inventory.");
    const sheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet["!fullref"] || sheet["!ref"] || "A1");
    if (range.e.c >= MAX_COLUMNS) throw new Error("The sheet has more than 100 columns. Copy just your inventory table into a new sheet.");
    if (range.e.r >= CSV_MAX_ROWS + MAX_HEADER_ROW) throw new Error("The sheet has more than 5,000 data rows. Split it into smaller files.");
    rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "", blankrows: true, range: 0 });
  }
  if (rows.some((row) => row.length > MAX_COLUMNS)) throw new Error("The sheet has more than 100 columns. Copy just your inventory table into a new sheet.");
  if (rows.some((row) => row.some((cell) => cell.length > 5000))) throw new Error("A cell is longer than 5,000 characters. Shorten it before importing.");
  // Trim only trailing blank rows so reported row numbers still match the file.
  while (rows.length && rows.at(-1)?.every((cell) => !cell.trim())) rows.pop();
  let headerRow = options.headerRow;
  if (headerRow === undefined) {
    let bestScore = -1;
    headerRow = 1;
    rows.slice(0, MAX_HEADER_ROW).forEach((row, index) => {
      const score = Object.values(autoMap(row, fieldsFor(kind))).filter((column) => column >= 0).length;
      if (score > bestScore) { bestScore = score; headerRow = index + 1; }
    });
  }
  if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow > MAX_HEADER_ROW || headerRow > rows.length) throw new Error("Choose a header row from 1 to 25 that exists in this sheet.");
  if (rows.length - headerRow > CSV_MAX_ROWS) throw new Error("More than 5,000 data rows. Split the sheet into smaller files; nothing has been imported.");
  const header = rows[headerRow - 1];
  if (!header.some((cell) => cell.trim())) throw new Error("That header row is blank. Choose the row with your column names.");
  const width = Math.max(...rows.slice(headerRow - 1).map((row) => row.length));
  const normalized = parseCsv(toCsv([Array.from({ length: width }, (_, index) => header[index] ?? "")]), CSV_MAX_ROWS);
  return {
    headers: normalized.headers,
    rows: rows.slice(headerRow).map((row) => Array.from({ length: width }, (_, index) => (row[index] ?? "").trim())),
    sheets, sheetName, headerRow,
  };
}
