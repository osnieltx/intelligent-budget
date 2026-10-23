function doGet() {
  try {
    return jsonOutput(buildPayload());
  } catch (e) {
    return jsonOutput({ error: String(e && e.message || e) });
  }
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function buildPayload() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashSheet = ss.getSheetByName("dashboard");
  
  if (!dashSheet) throw new Error("Sheet 'dashboard' not found");

  // 1. Top 5 Expenses (from the ExpenseByCategory table, wherever it sits)
  const top5 = readTop5(ss);

  // 2. Budget per meta-category (dashboard rows 2-4: needs, wants, finance;
  // A = name, B = budget, C = spent). The sheet owns the budget math.
  const categories = dashSheet.getRange("A2:C4").getValues()
    .filter(([name]) => name !== "")
    .map(([name, budget, spent]) => ({
      name: String(name).trim(),
      budget: Number(budget) || 0,
      spent: Number(spent) || 0
    }));

  return {
    top5: top5,
    budget: {
      categories: categories,
      total: {
        budget: categories.reduce((sum, c) => sum + c.budget, 0),
        spent: categories.reduce((sum, c) => sum + c.spent, 0)
      }
    }
  };
}

// Name of the Google Sheets table (Format → Convert to table) holding expenses by category.
const TOP5_TABLE = "ExpenseByCategory";

// Reads the table through the Sheets API, so its position in the sheet doesn't matter.
// Requires the "Google Sheets API" advanced service (Services → + → Google Sheets API).
function readTop5(ss) {
  const meta = Sheets.Spreadsheets.get(ss.getId(), { fields: "sheets(tables(name,range))" });
  const table = meta.sheets
    .flatMap(s => s.tables || [])
    .find(t => t.name === TOP5_TABLE);
  if (!table) throw new Error(`Table '${TOP5_TABLE}' not found`);

  const g = table.range;
  const sheet = ss.getSheets().find(s => s.getSheetId() === (g.sheetId || 0));
  const startRow = (g.startRowIndex || 0) + 2; // +1 for 1-based, +1 to skip the header row
  const numRows = g.endRowIndex - (g.startRowIndex || 0) - 1;
  if (numRows < 1) return [];
  const values = sheet.getRange(startRow, (g.startColumnIndex || 0) + 1, numRows, 2).getValues();

  // Column 1 = category, column 2 = amount; keeps the table's own order.
  const top5 = [];
  for (const [desc, rawAmt] of values) {
    const amt = parseAmount(rawAmt);
    if (desc === "" || isNaN(amt)) continue;
    top5.push({ description: String(desc).trim(), amount: Math.abs(amt) });
    if (top5.length === 5) break;
  }
  return top5;
}

function parseAmount(v) {
  if (typeof v === "number") return v;
  if (typeof v !== "string" || v.trim() === "") return NaN;
  return Number(v.replace(/[R$\s.]/g, "").replace(",", "."));
}
