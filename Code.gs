
// --- CONFIGURATION ---
// Mapped to "Kampstore Sales" and "Inventory Count Log" based on user logs.
const CONFIG = {
  spreadsheetId: "1fXTv1ia1090uWl15b3PlBOxtwfKqyHodh4xj89Dcfyg",
  sheets: {
    products: {
      tabName: "Kampstore Sales", // Using the sales log to extract unique product details
      columns: {
        sku: "SKU",
        name: "Item", // Mapped to 'Item'. Could also be 'Original Title' if preferred.
        department: "Department",
        category: "Category",
        vendor: "Brand/Vendor",
        cost: "Current Cost",
        price: "Current Price",
        // 'Lead Time' is not in the sheet, will default to 0
        leadTimeWeeks: "Lead Time (Weeks)" 
      }
    },
    transactions: {
      tabName: "Kampstore Sales",
      columns: {
        id: "Report_UID",
        date: "Sales Date",
        sku: "SKU",
        qtySold: "Qty Sold",
        discount: "Discount",
        property: "Property"
      }
    },
    inventory: {
      tabName: "Inventory Count Log",
      columns: {
        sku: "SKU",
        qtyOnHand: "Counted_Qty"
      }
    }
  }
};

function doGet() {
  return HtmlService.createTemplateFromFile('index')
      .evaluate()
      .setTitle('UDRG Inventory & Sales Reports')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// --- MAIN DATA FETCHING ---
function getData() {
  let ss;
  try {
    ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  } catch (e) {
    throw new Error(`Could not open Spreadsheet with ID: ${CONFIG.spreadsheetId}. Check permissions or ID.`);
  }
  
  // Helper to fetch and map data based on CONFIG
  const getMappedData = (configKey) => {
    const sheetConfig = CONFIG.sheets[configKey];
    const sheet = ss.getSheetByName(sheetConfig.tabName);
    
    if (!sheet) {
      console.warn(`Sheet named '${sheetConfig.tabName}' not found.`);
      return [];
    }
    
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    if (values.length < 2) return []; // No data
    
    const headers = values.shift(); // Remove first row
    
    // Create a map of { "lowercase_header": columnIndex } for robust matching
    const headerMap = {};
    headers.forEach((h, i) => {
      if (h) headerMap[h.toString().trim().toLowerCase()] = i;
    });
    
    return values.map(row => {
      const obj = {};
      // Iterate through the columns defined in CONFIG
      Object.keys(sheetConfig.columns).forEach(appKey => {
        const sheetHeader = sheetConfig.columns[appKey];
        const lookupKey = sheetHeader.toLowerCase();
        const colIndex = headerMap[lookupKey];
        
        if (colIndex !== undefined) {
          obj[appKey] = row[colIndex];
        } else {
          // Default values if column is missing
          if (appKey === 'qtySold' || appKey === 'cost' || appKey === 'price' || appKey === 'qtyOnHand') {
             obj[appKey] = 0;
          } else {
             obj[appKey] = "";
          }
        }
      });
      return obj;
    });
  };

  try {
    // 1. Get raw data
    const productsRaw = getMappedData('products');
    const transactions = getMappedData('transactions');
    const inventoryRaw = getMappedData('inventory');

    // 2. Deduplicate Products
    // Since 'Kampstore Sales' has multiple rows per SKU, we need to extract unique products.
    // We use a Map, which keeps the last occurrence found (usually most current price/cost).
    const productMap = new Map();
    productsRaw.forEach(p => {
      // Only add if SKU exists
      if (p.sku && p.sku.toString().trim() !== "") {
         productMap.set(p.sku, p);
      }
    });
    const uniqueProducts = Array.from(productMap.values());

    // 3. Deduplicate Inventory (Optional safety)
    // If 'Inventory Count Log' has history, we take the latest entry for each SKU.
    const inventoryMap = new Map();
    inventoryRaw.forEach(i => {
      if (i.sku && i.sku.toString().trim() !== "") {
        inventoryMap.set(i.sku, i);
      }
    });
    const uniqueInventory = Array.from(inventoryMap.values());

    if (!uniqueProducts.length && !transactions.length) {
       return { products: [], transactions: [], inventory: [] };
    }

    return {
      products: uniqueProducts,
      transactions: transactions.map(t => ({
        ...t,
        // Ensure date is string format YYYY-MM-DD for the frontend
        date: t.date ? new Date(t.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
      })),
      inventory: uniqueInventory
    };
  } catch (e) {
    Logger.log(e);
    throw new Error("Error fetching data: " + e.message);
  }
}

// --- AI API CALL ---
function callGeminiAPI(prompt, modelName) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error("GEMINI_API_KEY not found in Script Properties");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  
  const payload = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(response.getContentText());
    
    if (json.error) throw new Error(json.error.message);
    
    if (json.candidates?.[0]?.content?.parts?.[0]?.text) {
       return json.candidates[0].content.parts[0].text;
    }
    return "No response text generated from Gemini.";
    
  } catch (e) {
    Logger.log("Gemini Error: " + e.toString());
    throw new Error("Failed to generate content: " + e.message);
  }
}

// --- DEBUG HELPER ---
function debugSpreadsheetStructure() {
  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const sheets = ss.getSheets();
  
  Logger.log("=== SPREADSHEET STRUCTURE ===");
  sheets.forEach(sheet => {
    Logger.log(`[TAB] ${sheet.getName()}`);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    Logger.log(`   HEADERS: ${headers.join(", ")}`);
  });
  Logger.log("=============================");
}
