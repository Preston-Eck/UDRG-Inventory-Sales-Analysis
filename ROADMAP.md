# Project Roadmap: UDRG Inventory & Sales Intelligence

## 📌 Context
This document tracks the strategic direction of the UDRG Inventory & Sales Analysis application. The goal is to evolve from a basic dashboard into a predictive intelligence tool that drives purchasing decisions, budget creation, and historical analysis.

## 🚀 Roadmap

### ✅ Completed (Phase 0: Foundation)
- **Data Migration:**
    - Migration from Google Sheets/CSV to Supabase (PostgreSQL).
    - Robust handling of "dirty" data (Outlier cleaning).
    - Data parity achieved with original "source of truth" CSVs via Net Revenue mapping.
- **Core Dashboard:**
    - Performance Table with Sorting & Filtering.
    - Basic "Restock Forecast" view (Seasonality-based).
- **Features:**
    - Search (Multi-field + Include/Exclude logic).
    - Saved Views (LocalStorage).
    - Column Customization.

### 🚧 Phase 1: Data Integrity & Schema Refinement (Current)
*Objective: Ensure the database accurately reflects historical reality, not just current state.*
- [ ] **Transaction-Level Economics:**
    - Ensure `transactions` table stores `price_at_sale` and `cost_at_sale` for perfect historical margin analysis (vs using current product cost).
- [ ] **Inventory History:**
    - Store inventory snapshots to track "Shrinkage" and "Stock Velocity" over time.
- [ ] **Multi-Property Grouping:**
    - Verify `property` column logic to enable "All Campgrounds" vs "Specific Campground" views.
- [ ] **Outlier Review Module:**
    - **Detection:** Automated flagging of anomalies (e.g., Qty > 1000, Price < Cost, Margin > 90%).
    - **Review UI:** Interface to audit flagged transactions.
    - **Actions:** Edit values, multi-select "Confirm" (Mark as safe), or multi-select "Ignore" (Exclude from stats).

### 🔮 Phase 2: Advanced Reporting Engine
*Objective: "Select which categories and campgrounds to group for totals in addition to granular data."*
- [ ] **Dynamic Pivot Table:**
    - User can group by `Property > Department > Category > Vendor`.
    - Collapsible/Expandable rows for drill-down analysis.
- [ ] **Custom Aggregations:**
    - Toggle totals for Sales, Revenue, Profit, Margin %, and Sell-through Rate at any hierarchy level.
- [ ] **Date Comparison:**
    - Compare "This Year vs Last Year" (YoY) for selected periods.
- [ ] **Enhanced Saved Views:**
    - Metadata: Add Title, Description, and Timestamp to saved views.
    - Management: Sort saved views by Date Created, Last Viewed, or Alphabetical.

### 🔮 Phase 3: Predictive Intelligence & Budgeting
*Objective: "Generate reports that suggest annual budgets for each category."*
- [ ] **Budget Generator:**
    - Input: Target Growth % (e.g., +10%).
    - Output: Recommended monthly purchasing budget per Category based on historical seasonality.
- [ ] **Enhanced Restock Calendar:**
    - Integrate "Lead Time" into forecast (e.g., "Order by Mar 1st to have stock for July 4th").
    - Cash Flow View: "Anticipated Expenses" vs "Anticipated Profit".
- [ ] **Trend Analysis:**
    - Visual graphs for "Velocity" (Units sold per day) to spot trending/dying products.

### 🔮 Phase 4: AI Analyst
*Objective: "An AI Chatbot that can analyze the data and answer questions."*
- [ ] **Natural Language Query (NLQ):** "Show me the most profitable camping chairs in August."
- [ ] **Trend Spotting:** AI proactively flagging "High Margin item running low."

---

## 🧠 Lessons Learned & Technical Decisions
1.  **Price Volatility:** We cannot rely on a single `product.price`. Historical analysis requires `transaction.net_revenue` (from CSV) to be the source of truth.
2.  **Granularity:** Aggregation must be calculated on-the-fly from the atomic transaction level to allow flexible grouping.
3.  **Data Cleaning:** CSV data contains outliers (e.g., Qty > 20k). Verification scripts are essential before trusting migration.
