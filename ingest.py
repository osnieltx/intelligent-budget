import json
import os

import calendar
from zoneinfo import ZoneInfo

import requests
import pandas as pd
from datetime import date, datetime
import gspread
from google.oauth2.service_account import Credentials

from sheet import set_dropdown_from_range

# ==========================================
# CONFIGURATIONS
# ==========================================
dry_run = os.environ.get('DRY_RUN')
CLIENT_ID = os.environ.get("CLIENT_ID")
CLIENT_SECRET = os.environ.get("CLIENT_SECRET")
ACCOUNT_ID = os.environ.get("ACCOUNT_ID")
CREDIT_CARD_ID = os.environ.get("CREDIT_CARD_ID")

# Google Sheets Config
SPREADSHEET_NAME = 'personal-budget-ledger'
CREDENTIALS_FILE = './credentials.json'

SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
]

LEDGER_COLUMNS = ['id', 'date', 'time', 'description', 'amount', 'category']

# ==========================================
# CUSTOM CATEGORIZATION RULES
# ==========================================
def auto_categorize_transaction(description, pluggy_category):
    desc = description.lower()

    if 'garritano' in desc or 'nagumo' in desc:
        return 'food'
    if 'reserva cultural' in desc:
        return 'leisure'
    if 'drogaria' in desc:
        return 'self-care'
    if 'enel' in desc:
        return 'electricity'
    if 'leste flu' in desc:
        return 'internet'
    if 'osniel lopes teixeira' in desc or 'marcela rodrigues dos santos' in desc:
        return 'ignore'

    if pluggy_category:
        return pluggy_category

    return 'uncategorized'

# ==========================================
# API CLIENT FUNCTIONS
# ==========================================
def get_auth_token(client_id, client_secret):
    url = "https://api.pluggy.ai/auth"
    payload = {"clientId": client_id, "clientSecret": client_secret}
    response = requests.post(url, json=payload)
    response.raise_for_status()
    return response.json().get('apiKey')

def fetch_transactions_from_api(api_key, account_id, start_date, end_date):
    url = "https://api.pluggy.ai/transactions"
    headers = {"X-API-KEY": api_key}
    params = {"accountId": account_id, "from": start_date, "to": end_date}

    results = []
    page = 1
    total_pages = 1
    while page <= total_pages:
        params['page'] = page
        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()
        data = response.json()
        results += data.get('results', [])
        total_pages = data.get('totalPages', 1)
        page += 1
    return results

# ==========================================
# GOOGLE SHEETS STORAGE MANAGEMENT
# ==========================================
def get_or_create_monthly_worksheet(spreadsheet, sheet_title):
    try:
        worksheet = spreadsheet.worksheet(sheet_title)
    except gspread.exceptions.WorksheetNotFound:
        worksheet = spreadsheet.add_worksheet(title=sheet_title, rows=100, cols=10)
        # Initialize headers
        worksheet.append_row(LEDGER_COLUMNS)
    return worksheet

def load_google_sheet_data(worksheet):
    # Read raw values instead of get_all_records(): the sheet also carries
    # derived columns (e.g. meta-category) we recompute every run, and their
    # header can collide/duplicate as the ledger layout evolves. Keep only
    # the columns we actually round-trip.
    all_values = worksheet.get_all_values()
    if len(all_values) > 1:
        df = pd.DataFrame(all_values[1:], columns=all_values[0])
        df = df.reindex(columns=LEDGER_COLUMNS, fill_value="")
        df['id'] = df['id'].astype(str)
        df['amount'] = pd.to_numeric(df['amount'], errors='coerce').fillna(0.0)
        return df
    return pd.DataFrame(columns=LEDGER_COLUMNS)

def save_to_google_sheet(worksheet, df):
  # Clean NaN/None values so they become empty strings instead of invalid JSON floats
  df_clean = df.fillna("")

  # Convert numerical amounts to standard floats, handling blanks safely
  df_clean["amount"] = pd.to_numeric(df_clean["amount"], errors="coerce").fillna(0.0)

  # Prepare matrix with headers
  values = [df_clean.columns.tolist()] + df_clean.values.tolist()

  # Clear and overwrite the current month's tab
  worksheet.clear()
  worksheet.update(values=values, range_name="A1")

  # Re-enter just date/time as USER_ENTERED so Sheets parses them into real
  # Date/Time values (lets Sheets show its calendar picker on click). Kept
  # separate from the RAW write above so free-text fields like description
  # (sourced from the bank) can't be misread as formulas.
  last_row = len(values)
  worksheet.update(values=df_clean[['date', 'time']].values.tolist(), range_name=f"B2:C{last_row}", value_input_option="USER_ENTERED")
  worksheet.format(f"B2:B{last_row}", {"numberFormat": {"type": "DATE", "pattern": "yyyy-mm-dd"}})
  worksheet.format(f"C2:C{last_row}", {"numberFormat": {"type": "TIME", "pattern": "hh:mm"}})

# ==========================================
# MAIN EXECUTION
# ==========================================
def main():
    print("Initializing Google Sheets connection...")
    # Check if running in GitHub Actions (or any cloud env with the secret set)
    gcp_sa_key = os.getenv("GCP_SA_KEY")
    if gcp_sa_key:
        # Load credentials from the GitHub Actions environment secret
        service_account_info = json.loads(gcp_sa_key)
        credentials = Credentials.from_service_account_info(
            service_account_info, scopes=SCOPES
        )
        gc = gspread.authorize(credentials)
    else:
        # Fallback for local development on your machine
        gc = gspread.service_account(filename="credentials.json")
    spreadsheet = gc.open(SPREADSHEET_NAME)

    now = date.today()
    current_month_str = now.strftime('%Y-%m')
    first_of_month = date(now.year, now.month, day=1).strftime('%Y-%m-%d')
    _, last_day = calendar.monthrange(now.year, now.month)
    last_of_month = date(now.year, now.month, day=last_day).strftime('%Y-%m-%d')
    if dry_run:
        current_month_str += '_test'
        print("Dry run, saving to a test Google Sheet...")

    worksheet = get_or_create_monthly_worksheet(spreadsheet, current_month_str)

    print("Authenticating with Pluggy...")
    api_key = get_auth_token(CLIENT_ID, CLIENT_SECRET)
    print(f"Fetching transactions starting from {first_of_month}...")

    checking_txs = fetch_transactions_from_api(api_key, ACCOUNT_ID, first_of_month, last_of_month)
    cc_txs = fetch_transactions_from_api(api_key, CREDIT_CARD_ID, first_of_month, last_of_month)

    for tx in cc_txs:
        tx['amount'] = -tx.get('amount', 0)

    all_api_txs = checking_txs + cc_txs

    # Build DataFrame from fresh API pull
    api_data_list = []
    for tx in all_api_txs:
        utc_time = datetime.fromisoformat(tx['date'])
        br_time = utc_time.astimezone(ZoneInfo("America/Sao_Paulo"))
        api_data_list.append({
            'id': str(tx.get('id')),
            'date': tx.get('date')[:10],
            'time': br_time.strftime('%H:%M'),
            'description': tx.get('description', ''),
            'amount': float(tx.get('amount', 0.0)),
            'category': auto_categorize_transaction(tx.get('description', ''), tx.get('category'))
        })
    df_api = pd.DataFrame(api_data_list)

    # Load cloud state to preserve user edits
    df_cloud = load_google_sheet_data(worksheet)

    if not df_api.empty:
        if not df_cloud.empty:
            df_cloud_historical = df_cloud[~df_cloud['id'].isin(df_api['id'])]
            df_cloud_overlapping = df_cloud[df_cloud['id'].isin(df_api['id'])]
            df_api_new_only = df_api[~df_api['id'].isin(df_cloud_overlapping['id'])]

            df_final = pd.concat([df_cloud_historical, df_cloud_overlapping, df_api_new_only], ignore_index=True)
        else:
            df_final = df_api
    else:
        df_final = df_cloud

    if df_final.empty:
        print("No records to process.")
        return

    df_final = df_final.reindex(columns=LEDGER_COLUMNS, fill_value="")
    df_final = df_final.sort_values(by='date', ascending=False).reset_index(drop=True)

    save_to_google_sheet(worksheet, df_final)
    print(f"✔️ Google Sheet tab '{current_month_str}' synchronized successfully.")

    # category dropdown
    set_dropdown_from_range(spreadsheet, worksheet.id, start_row=1, end_row=len(df_final)+1, col_idx=5)
    # meta-category
    metacat_col = [['meta-category']] + [[f'=VLOOKUP(F{i+2}, categories!A:B, 2, FALSE)']
                                         for i in range(len(df_final))]
    worksheet.update(values=metacat_col, range_name=f'G1:G{len(df_final)+1}', value_input_option="USER_ENTERED",)

    # Active Outflow Summary
    df_report = df_final[~df_final['category'].str.contains('Ignore', case=False, na=False)]

    print("\n" + "="*50)
    print(f"📊 EXPENSE SUMMARY - {now.strftime('%B %Y').upper()}")
    print("="*50)

    category_summary = df_report.groupby('category')['amount'].sum().sort_values(ascending=True)
    for cat, val in category_summary.items():
        print(f"{cat.ljust(30)} | R$ {val:,.2f}")
    print("-" * 50)
    print(f"TOTAL ACTIVE OUTFLOW:          | R$ {category_summary.sum():,.2f}")
    print("=" * 50)

if __name__ == "__main__":
    main()
