def set_dropdown_from_range(
        spreadsheet,
        target_sheet_id,
        start_row,
        end_row,
        col_idx,
):
    """Applies a dropdown list to a target column based on a range from a source sheet.

    All indices are 0-indexed (Row 1 -> 0, Col A -> 0, Col E -> 4).
    """
    body = {
        "requests": [{
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
        }]
    }
    spreadsheet.batch_update(body)