const API_URL = "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec";

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

// --- VIEW B: BUDGET & REMAINING WANTS GAUGE ---
function buildBudgetView(b) {
 const w = new ListWidget();
 w.backgroundColor = new Color("#1c1c1e");
 w.setPadding(14, 16, 14, 16);

 const title = w.addText("WANTS ALLOWANCE");
 title.font = Font.boldSystemFont(10);
 title.textColor = new Color("#8e8e93");
 w.addSpacer(8);

 // Available to Spend
 const availLabel = w.addText("Available to Spend");
 availLabel.font = Font.systemFont(12);
 availLabel.textColor = new Color("#a1a1aa");

 const availVal = w.addText(`R$ ${b.wantsRemaining.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
 availVal.font = Font.boldSystemFont(22);
 availVal.textColor = b.wantsRemaining > 0 ? new Color("#30d158") : new Color("#ff453a");
 w.addSpacer(8);

 // Progress Bar / Gauge
 const barStack = w.addStack();
 barStack.size = new Size(0, 10);
 barStack.cornerRadius = 5;

 const width = 280;
 const usedWidth = Math.max(8, Math.min(width, (b.percentageUsed / 100) * width));
 const freeWidth = width - usedWidth;

 const barFilled = barStack.addStack();
 barFilled.size = new Size(usedWidth, 8);
 barFilled.backgroundColor = b.percentageUsed >= 90 ? new Color("#ff453a") : new Color("#0a84ff");

 const barEmpty = barStack.addStack();
 barEmpty.size = new Size(freeWidth, 8);
 barEmpty.backgroundColor = new Color("#3a3a3c");

 w.addSpacer(6);
 const status = w.addText(`Used: ${b.percentageUsed}% of R$ ${b.wantsBudget.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`);
 status.font = Font.systemFont(11);
 status.textColor = new Color("#8e8e93");

 return w;
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
