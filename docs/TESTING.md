# Testing

No automated test suite ships with this project; the checks below are the
manual + scripted acceptance tests for Milestone 4 §17–18.

## Automated: the §18 accounting scenario

```bash
node scripts/verify-accounting.mjs
```

It uses `SUPABASE_SERVICE_ROLE_KEY` from `.env` to create a throwaway user +
family, then asserts:

| Step | Expected |
|---|---|
| Bank account opened with ৳50,000 | balance = 50,000 |
| Credit card, limit ৳100,000 | outstanding = 0, available = 100,000 |
| ৳5,000 groceries on the card | expense total = 5,000 · card outstanding = 5,000 · **bank still 50,000** |
| Pay ৳5,000 card bill from bank | bank = 45,000 · card outstanding = 0 |
| Re-check expense total | **still 5,000, not 10,000** |

It cleans up the test user (which cascades away the family and all rows) on exit.

## Manual smoke test (≈10 min)

### Auth & permissions
- [ ] Sign up → land on `/family/new` → create family → `/dashboard`.
- [ ] Sign out (top-right menu, or the link on `/family/new`), sign back in.
- [ ] Second account: without an invite, it cannot see the first family's data
      (its `/dashboard` shows its own empty family).

### CRUD & accounting
- [ ] Add an account (Bank, opening ৳50,000). Balance shows ৳50,000.
- [ ] Quick Expense ৳250 Grocery Cash → account drops to ৳49,750, appears in Transactions & Recent.
- [ ] Add income ৳1,00,000 Salary → account rises, dashboard MTD income updates.
- [ ] Transfer ৳5,000 between two accounts → neither counted as income/expense; both balances move.
- [ ] Add a credit card (limit ৳1,00,000). Add a card transaction ৳5,000 Purchase →
      card outstanding ৳5,000, utilization 5%, **no cash account changed**.
- [ ] Create a statement, then "Pay" it from the bank → bank down ৳5,000, outstanding ৳0,
      statement status → Paid. Transactions list still shows exactly one ৳5,000 expense-equivalent.
- [ ] New EMI (৳60,000, 12 months) → posts an `emi_purchase`, outstanding rises, EMI tab tracks installments.
- [ ] Loan ৳2,00,000 + a payment ৳10,000 from bank → bank down, loan outstanding down, **not** an expense.
- [ ] Bill (rent, monthly) → "Pay" advances the due date and decrements the account, **not** an expense.
- [ ] Budget for this month with a category limit; spend past 80% → an alert notification appears.
- [ ] Savings goal + contribution → progress %, required ৳/month.
- [ ] Investment / asset → net-worth page totals update; "Capture snapshot" adds a point.
- [ ] Remittance (SAR 5,000 @ 31.50) → ৳1,57,500 added as income to the chosen account.

### Milestone 3
- [ ] Reports: Monthly / Yearly / Credit Card / Members tabs all populate; each exports CSV, Excel, PDF.
- [ ] Analytics: all charts render (or show a clear "not enough data" message).
- [ ] Calendar: income/expense/bill/card-due/loan markers land on the right days.
- [ ] Shared expense: split ৳3,000 three ways, mark one settled — balances update.
- [ ] Family event budget: tag an expense to it; event "spent" rises.
- [ ] Receipts: upload a PNG/PDF (≤10 MB); view it (opens a signed URL); delete it.
- [ ] Advanced search: filter by date + amount + category → results + export.

### Milestone 4
- [ ] Settings → Appearance: Light / Dark / System all apply immediately, survive reload.
- [ ] Settings → Language: বাংলা switches nav/dashboard/settings/empty-states; persists.
- [ ] Settings → Currency: switch to USD → amounts re-render with `$` and 1,000 grouping;
      switch to INR → lakh grouping.
- [ ] Delete an expense → it goes to **Trash**, account balance goes back up.
      Restore it → balance drops again, it's back in Transactions.
- [ ] Trash → "Purge expired" removes items older than 30 days.
- [ ] Activity Log lists "X added expense — Grocery (৳250)" etc. for your actions.
- [ ] Add an expense identical to a recent one → duplicate warning dialog; "Add anyway" works,
      "Cancel" doesn't insert.
- [ ] PWA: Chrome/Edge shows an install prompt (or the in-app bar). Installed app opens standalone.
- [ ] Offline: DevTools → Network → Offline. Add a Quick Expense — it saves locally and the
      offline banner shows. Go online — the "synced" banner flashes and the row is on the server
      exactly once (no duplicate).
- [ ] Error handling: stop the network mid-save → friendly "you appear to be offline…" message,
      never a raw Postgres string.

### Accessibility spot-check
- [ ] Tab through the Add Expense dialog — every control reachable, visible focus ring, Esc closes.
- [ ] Every form field has an associated `<label>`.
- [ ] Dark mode contrast is legible (text, muted text, borders).
- [ ] `lang` attribute on `<html>` flips with the language setting.

## Responsive

Check at 375 px (mobile), 768 px (tablet), 1280 px (laptop), 1920 px (desktop):
- [ ] Mobile uses the bottom nav; sidebar hidden. Dialogs fit the viewport and scroll internally.
- [ ] Tables (search, reports) scroll horizontally inside their card, page body never scrolls sideways.
- [ ] Stat-card grids reflow (2-up on mobile, 4–5-up on desktop).
