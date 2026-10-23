// API_URL comes from config.js (untracked); deploy-widget.sh prepends it.

// 1. Determine mode dynamically based on the current 15-minute window
const now = new Date();
const minutes = now.getMinutes();

// Slot 0 (0-14m) & Slot 2 (30-44m) -> "top5"
// Slot 1 (15-29m) & Slot 3 (45-59m) -> "budget"
const slot = Math.floor(minutes / 15);
const currentMode = (slot % 2 === 0) ? "top5" : "budget";

// 2. Fetch data from Google Apps Script
const req = new Request(API_URL);
const raw = await req.loadString();
let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  data = { error: "Not JSON: " + raw.slice(0, 200) };
}

// 3. Build the appropriate view
const widget = data.error
 ? buildErrorView(data.error)
 : (currentMode === "top5")
   ? buildTop5View(data.top5)
   : buildBudgetView(data.budget);

// 4. Tell iOS to refresh around the next 15-minute boundary
const nextRefresh = new Date(now.getTime() + 15 * 60 * 1000);
widget.refreshAfterDate = nextRefresh;

if (config.runsInWidget) {
 Script.setWidget(widget);
} else {
 widget.presentMedium();
}
Script.complete();

// --- VIEW A: TOP 5 EXPENSES ---
function buildTop5View(top5) {
 const w = new ListWidget();
 w.backgroundColor = new Color("#1c1c1e");
 w.setPadding(12, 14, 12, 14);

 const header = w.addText("TOP 5 EXPENSES");
 header.font = Font.boldSystemFont(10);
 header.textColor = new Color("#8e8e93");
 w.addSpacer(6);

 for (let i = 0; i < (top5 || []).length; i++) {
   const item = top5[i];
   const row = w.addStack();
   row.layoutHorizontally();

   const desc = row.addText(`${i + 1}. ${item.description}`);
   desc.font = Font.systemFont(12);
   desc.textColor = Color.white();
   desc.lineLimit = 1;

   row.addSpacer();

   const amt = row.addText(`R$ ${item.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
   amt.font = Font.semiboldSystemFont(12);
   amt.textColor = new Color("#ff453a");

   if (i < top5.length - 1) w.addSpacer(3);
 }
 return w;
}

// --- VIEW B: BUDGET BY META-CATEGORY ---
function buildBudgetView(b) {
 const w = new ListWidget();
 w.backgroundColor = new Color("#1c1c1e");
 w.setPadding(14, 16, 14, 16);

 // Header: title on the left, net left (total budget - total spent) on the right
 const header = w.addStack();
 header.layoutHorizontally();
 header.bottomAlignContent();

 const month = new Date().toLocaleString("en-US", { month: "short" }).toUpperCase();
 const title = header.addText(`BUDGET · ${month}`);
 title.font = Font.boldSystemFont(10);
 title.textColor = new Color("#8e8e93");
 header.addSpacer();

 const netLeft = b.total.budget - b.total.spent;
 const net = header.addText(`R$ ${formatBRL(netLeft, 2)}`);
 net.font = Font.boldSystemFont(22);
 net.textColor = netLeft >= 0 ? new Color("#30d158") : new Color("#ff453a");
 w.addSpacer(10);

 // One row per category: name, gauge, % used, amount left
 for (let i = 0; i < b.categories.length; i++) {
   addCategoryRow(w, b.categories[i]);
   if (i < b.categories.length - 1) w.addSpacer(8);
 }
 return w;
}

function addCategoryRow(w, c) {
 const left = c.budget - c.spent;
 const pct = c.budget > 0 ? Math.round((c.spent / c.budget) * 100) : 0;

 const row = w.addStack();
 row.layoutHorizontally();
 row.centerAlignContent();

 const name = row.addStack();
 name.size = new Size(58, 0);
 const nameText = name.addText(c.name);
 nameText.font = Font.systemFont(12);
 nameText.textColor = Color.white();
 nameText.lineLimit = 1;

 const width = 130;
 const usedWidth = Math.max(4, Math.min(width, (pct / 100) * width));
 const bar = row.addStack();
 bar.cornerRadius = 3;
 const barFilled = bar.addStack();
 barFilled.size = new Size(usedWidth, 6);
 barFilled.backgroundColor = pct > 100 ? new Color("#ff453a") : pct >= 90 ? new Color("#ff9f0a") : new Color("#0a84ff");
 const barEmpty = bar.addStack();
 barEmpty.size = new Size(width - usedWidth, 6);
 barEmpty.backgroundColor = new Color("#3a3a3c");

 row.addSpacer(6);
 const pctText = row.addText(`${pct}%`);
 pctText.font = Font.systemFont(11);
 pctText.textColor = new Color("#8e8e93");
 row.addSpacer();

 const leftText = row.addText(formatBRL(left, 0));
 leftText.font = Font.semiboldSystemFont(12);
 leftText.textColor = left >= 0 ? new Color("#30d158") : new Color("#ff453a");
}

function formatBRL(v, digits) {
 return v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// --- ERROR VIEW ---
function buildErrorView(message) {
 const w = new ListWidget();
 w.backgroundColor = new Color("#1c1c1e");
 w.setPadding(12, 14, 12, 14);

 const header = w.addText("WIDGET ERROR");
 header.font = Font.boldSystemFont(10);
 header.textColor = new Color("#ff453a");
 w.addSpacer(6);

 const msg = w.addText(String(message));
 msg.font = Font.systemFont(11);
 msg.textColor = Color.white();
 return w;
}
