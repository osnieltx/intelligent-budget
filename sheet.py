def set_dropdown_from_range(
        spreadsheet,
        target_sheet_id,
        start_row,
        end_row,
        col_idx,
        clear_col_count=10,
):
    """Applies a dropdown list to a target column based on a range from a source sheet.

    All indices are 0-indexed (Row 1 -> 0, Col A -> 0, Col E -> 4).

    Clears any stale data validation across the row span first: as the ledger
    layout changes, a column that used to hold the category (and its
    validation rule) can end up holding something else, which then shows
    "Invalid" errors on values that no longer match the old rule.
    """
    body = {
        "requests": [
            {
                "setDataValidation": {
                    "range": {
                        "sheetId": target_sheet_id,
                        "startRowIndex": start_row,
                        "endRowIndex": end_row,
                        "startColumnIndex": 0,
                        "endColumnIndex": clear_col_count,
                    },
                }
            },
            {
                "setDataValidation": {
                    "range": {
                        "sheetId": target_sheet_id,
                        "startRowIndex": start_row,  # e.g., 1 (skips header)
                        "endRowIndex": end_row,  # e.g., 100
                        "startColumnIndex": col_idx,  # e.g., 4 for Column E
                        "endColumnIndex": col_idx + 1,
                    },
                    "rule": {
                        "condition": {
                            "type": "ONE_OF_RANGE",
                            "values": [{
                                "userEnteredValue": (
                                    f"='categories'!$A$1:$A$50"
                                )
                            }],
                        },
                        "inputMessage": "Select a category from the list",
                        "strict": True,
                        "showCustomUi": True,  # Enables the dropdown arrow UI
                    },
                }
            },
        ]
    }
    spreadsheet.batch_update(body)