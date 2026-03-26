
import json
try:
    from mstarpy import Stock
    s = Stock(term="XYZ")
    income = s.incomeStatement(period="annual", reportType="restated")
    balance = s.balanceSheet(period="annual", reportType="restated")
    cf = s.cashFlow(period="annual", reportType="restated")
    print(json.dumps({"success": True, "income": income, "balance": balance, "cashFlow": cf}, default=str))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
