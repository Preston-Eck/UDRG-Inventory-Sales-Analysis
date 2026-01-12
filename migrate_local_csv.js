
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Configuration ---
const SUPABASE_URL = "https://ymtbyohlbuyflokcdpkl.supabase.co";

// Manual .env parser
if (fs.existsSync('.env')) {
    const envFile = fs.readFileSync('.env', 'utf8');
    envFile.split('\n').forEach(line => {
        const [key, ...value] = line.split('=');
        if (key && value) process.env[key.trim()] = value.join('=').trim();
    });
}

const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY in .env");
    process.exit(1);
}

// Files
const SALES_CSV = "Inventory Management - Kampstore Sales (1).csv";
const INVENTORY_CSV = "Inventory Management - Inventory Count Log (1).csv";

// Helper to get directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function parseCSVLine(line) {
    const values = [];
    let currentValue = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            values.push(currentValue.trim());
            currentValue = '';
        } else {
            currentValue += char;
        }
    }
    values.push(currentValue.trim());
    return values.map(val => {
        if (val.startsWith('"') && val.endsWith('"')) return val.slice(1, -1).replace(/""/g, '"');
        return val;
    });
}

function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) return [];

    const headers = parseCSVLine(lines[0]);
    const results = [];

    for (let i = 1; i < lines.length; i++) {
        const currentLine = lines[i];
        if (!currentLine) continue;

        const values = parseCSVLine(currentLine);
        if (values.length === headers.length) {
            const entry = {};
            for (let j = 0; j < headers.length; j++) {
                entry[headers[j].trim()] = values[j];
            }
            results.push(entry);
        }
    }
    return results;
}

async function migrateSales() {
    console.log(`Reading Sales CSV: ${SALES_CSV}...`);
    const filePath = path.join(__dirname, SALES_CSV);

    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return;
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const records = parseCSV(fileContent);
    console.log(`Parsed ${records.length} sales records.`);

    // 1. Extract Products
    const productsMap = new Map();
    const transactions = [];

    for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const sku = row['SKU'];
        if (!sku) continue;

        let name = row['Original Title'] || 'Unknown Product';
        let brand = row['Brand/Vendor'] || 'Unknown';

        if (name.startsWith('_')) {
            const parts = name.split('_').filter(p => p);
            if (parts.length >= 1) name = parts[0];
            if (parts.length >= 2 && brand === 'Unknown') brand = parts[1];
        }

        const price = parseFloat(row['Current Price']) || 0;
        const cost = parseFloat(row['Current Cost']) || 0;

        // Store Product
        if (!productsMap.has(sku)) {
            productsMap.set(sku, {
                sku: sku,
                name: name,
                department: row['Department'] || 'Uncategorized',
                category: row['Category'] || row['Department'] || 'Uncategorized',
                price: price,
                cost: cost,
                vendor: brand,
                // description: row['Item'] || ''
            });
        }

        // Processing Transaction
        let qty = parseFloat(row['Qty Sold']) || 0;
        let netRevenue = parseFloat(row['Net Revenue']) || 0; // The Truth

        if (qty === 0 && netRevenue === 0) continue; // Skip truly empty rows

        // --- DATA CLEANING HEURISTIC ---
        // If Qty is massive (>1000) or missing, but NetRevenue exists, derive Qty
        if (qty > 1000 || (qty === 0 && netRevenue > 0)) {
            if (price > 0 && netRevenue > 0) {
                const derived = Math.round(netRevenue / price);
                if (derived > 0) {
                    if (qty > 1000) console.log(`[Fix] Row ${i}: Correcting Qty ${qty} -> ${derived} based on Net $${netRevenue} / Price $${price}`);
                    qty = derived;
                }
            } else if (qty > 1000) {
                // Garbage Qty, no price to verify? Skip or set to 1?
                // If Net is 0 and Qty is HUGE, it's garbage.
                if (netRevenue === 0) {
                    // console.log(`[Skip] Row ${i}: Garbage Qty ${qty} with Net $0`);
                    continue;
                }
            }
        }



        // Calculate Discount to force Revenue match
        // App Logic: Revenue = (Qty * Price) - Discount
        // Desired: Revenue = NetRevenue
        // Discount = (Qty * Price) - NetRevenue
        // NOTE: For historical accuracy, we should use the Price AT TIME OF SALE if available.
        // The CSV "Current Price" is actually the price at the time of sale for that row.
        const salePrice = price;
        const saleCost = cost;

        const expectedGross = qty * salePrice;
        let discount = expectedGross - netRevenue;

        // Sanity check discount
        if (discount < 0) discount = 0;

        transactions.push({
            id: row['Report_UID'] || `gen-${Math.random().toString(36).substr(2, 9)}`,
            sku: sku,
            date: row['Sales Date'],
            qty_sold: Math.round(qty),
            property: row['Property'] || 'Default',
            discount: parseFloat(discount.toFixed(2)),
            unit_price_sold: salePrice,
            unit_cost_sold: saleCost
        });
    }

    console.log(`Found ${productsMap.size} unique products.`);
    console.log(`Found ${transactions.length} transactions (after cleaning).`);

    // 2. Upload Products
    const products = Array.from(productsMap.values());
    await uploadBatched('products', products, 'sku');

    // 3. Upload Transactions
    await uploadBatched('transactions', transactions, 'id');
}

async function migrateInventory() {
    console.log(`Reading Inventory CSV: ${INVENTORY_CSV}...`);
    const filePath = path.join(__dirname, INVENTORY_CSV);

    if (!fs.existsSync(filePath)) { return; }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const records = parseCSV(fileContent);
    const inventoryItems = [];

    for (const row of records) {
        const sku = row['SKU'];
        if (!sku) continue;
        const qty = parseFloat(row['Counted_Qty']);
        if (isNaN(qty)) continue;
        const dateStr = row['Count_Timestamp'];
        const date = new Date(dateStr);
        const isoDate = !isNaN(date.getTime()) ? date.toISOString() : new Date().toISOString();

        inventoryItems.push({
            sku: sku,
            qty_on_hand: qty,
            last_counted: isoDate
        });
    }

    await uploadBatched('inventory', inventoryItems, 'sku');
}

async function uploadBatched(tableName, data, conflictKey = null) {
    if (data.length === 0) return;
    const BATCH_SIZE = 1000; // Increased batch size for speed

    for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        let query = supabase.from(tableName).upsert(batch, { onConflict: conflictKey });
        if (!conflictKey) query = supabase.from(tableName).insert(batch);

        const { error } = await query;
        if (error) {
            console.error(`Error uploading batch ${Math.floor(i / BATCH_SIZE) + 1} to ${tableName}:`, error.message);
        }
    }
    console.log(`Finished uploading to ${tableName}.`);
}

async function main() {
    console.log("Starting Robust Migration...");
    await migrateSales();
    await migrateInventory();
    console.log("Migration Complete.");
}

main().catch(console.error);
