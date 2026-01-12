const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Manual .env parser
if (fs.existsSync('.env')) {
    const envFile = fs.readFileSync('.env', 'utf8');
    envFile.split('\n').forEach(line => {
        const [key, ...value] = line.split('=');
        if (key && value) process.env[key.trim()] = value.join('=').trim();
    });
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://ymtbyohlbuyflokcdpkl.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY in .env");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function migrate() {
    console.log("Reading CSV...");
    const content = fs.readFileSync('Inventory Management - Inventory Count Log (1).csv', 'utf8');
    const lines = content.split('\n');
    const header = lines[0].split(',');

    const propIdx = header.indexOf('Property');
    const skuIdx = header.indexOf('SKU');
    const nameIdx = header.indexOf('Item Name');
    const deptIdx = header.indexOf('Department');
    const qtyIdx = header.indexOf('Counted_Qty');
    const dateIdx = header.indexOf('Count_Timestamp');

    const inventoryMap = new Map();
    const productMap = new Map();

    console.log(`Parsing ${lines.length} lines...`);
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = line.split(',');
        const property = cols[propIdx];
        const sku = cols[skuIdx];
        const name = cols[nameIdx];
        const dept = cols[deptIdx];
        const qty = parseInt(cols[qtyIdx]);
        const timestamp = cols[dateIdx];

        if (!sku || !property) continue;

        // Collect products just in case they are missing in Supabase
        if (!productMap.has(sku)) {
            productMap.set(sku, {
                sku: sku,
                name: name || 'Unknown Item',
                department: dept || 'Uncategorized',
                category: 'Uncategorized',
                vendor: 'Unknown'
            });
        }

        const key = `${sku}-${property}`;
        const existing = inventoryMap.get(key);

        if (!existing || new Date(timestamp) > new Date(existing.last_counted)) {
            inventoryMap.set(key, {
                sku,
                property,
                qty_on_hand: isNaN(qty) ? 0 : qty,
                last_counted: timestamp
            });
        }
    }

    // 1. Upload Products First
    console.log(`Upserting ${productMap.size} products to ensure FK compliance...`);
    const productData = Array.from(productMap.values());
    const pChunkSize = 500;
    for (let i = 0; i < productData.length; i += pChunkSize) {
        const chunk = productData.slice(i, i + pChunkSize);
        const { error } = await supabase.from('products').upsert(chunk, { onConflict: 'sku' });
        if (error) console.warn("Product upsert warning at batch", i, error.message);
    }

    // 2. Upload Inventory
    const finalData = Array.from(inventoryMap.values());
    console.log(`Uploading ${finalData.length} inventory records...`);

    const chunkSize = 500;
    for (let i = 0; i < finalData.length; i += chunkSize) {
        const chunk = finalData.slice(i, i + chunkSize);
        const { error } = await supabase.from('inventory').upsert(chunk, { onConflict: 'sku,property' });
        if (error) console.error("Error at chunk", i, error);
        else console.log(`Batch ${i / chunkSize + 1} inventory uploaded.`);
    }
    console.log("Migration complete.");
}

migrate();
