from import_parsers.categories import resolve_transaction_category


def test_costco_in_description():
    assert resolve_transaction_category("COSTCO GAS #1225", "Groceries") == "Costco"


def test_costco_in_bank_category():
    assert resolve_transaction_category("Some store", "Costco run") == "Costco"


def test_non_costco_uses_bank_category():
    assert resolve_transaction_category("MAYURI FOODS", "") == "Uncategorized"
    assert resolve_transaction_category("Starbucks", "Dining") == "Dining"