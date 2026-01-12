
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Files
const SALES_CSV = "Inventory Management - Kampstore Sales (1).csv";

// Helper to get directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple regex-based CSV parser
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

function verifyTotals() {
    console.log(`Reading Sales CSV: ${SALES_CSV}...`);
    const filePath = path.join(__dirname, SALES_CSV);

    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return;
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split(/\r?\n/).filter(line => line.trim() !== '');

    if (lines.length === 0) return;

    const headers = parseCSVLine(lines[0]);
    const idxQty = headers.indexOf('Qty Sold');
    const idxNet = headers.indexOf('Net Revenue');
    const idxPrice = headers.indexOf('Current Price'); // Fallback check

    console.log(`Indices: Qty=${idxQty}, Net=${idxNet}, Price=${idxPrice}`);

    let totalQty = 0;
    let totalRevenue = 0;
    let validRows = 0;

    let count = 0;
    let maxQty = 0;
    let maxQtyRow = 0;
    let maxQtySKU = '';

    for (let i = 1; i < lines.length; i++) {
        const row = parseCSVLine(lines[i]);
        if (row.length !== headers.length) continue;

        const qty = parseFloat(row[idxQty]) || 0;
        const net = parseFloat(row[idxNet]) || 0;

        if (qty !== 0) {
            if (count < 5) {
                console.log(`Row ${i}: Qty=${qty}, Net=$${net}, SKU=${row[6]}`);
                count++;
            }
            if (qty > maxQty) {
                maxQty = qty;
                maxQtyRow = i;
                maxQtySKU = row[6];
                console.log(`NEW MAX Qty: ${qty} at Row ${i}. Net=$${net}. SKU=${row[6]}`);
            }
            totalQty += qty;
            totalRevenue += net;
            validRows++;
        }
    }
    console.log(`Max Qty: ${maxQty} at Row ${maxQtyRow}, SKU=${maxQtySKU}`);

    console.log(`--- Verification Results ---`);
    console.log(`Valid Rows with Sales: ${validRows}`);
    console.log(`Total Qty Sold: ${totalQty}`);
    console.log(`Total Net Revenue (from CSV column): $${totalRevenue.toFixed(2)}`);
}

verifyTotals();
