
// --- CONFIGURATION ---
// Mapped to "Kampstore Sales" and "Inventory Count Log" based on user logs.
const CONFIG = {
  spreadsheetId: "1fXTv1ia1090uWl15b3PlBOxtwfKqyHodh4xj89Dcfyg",
  sheets: {
    products: {
      tabName: "Kampstore Sales", 
      columns: {
        sku: "SKU",
        name: "Item", 
        department: "Department",
        category: "Category",
        vendor: "Brand/Vendor",
        cost: "Current Cost",
        price: "Current Price"
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

// --- HELPER: Number Parser ---
// Handles "$10.00", "1,000", or empty strings
function parseNum(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  if (typeof val === 'string') {
    // Remove currency symbols, commas, and whitespace
    const clean = val.replace(/[^0-9.-]/g, '');
    if (clean === '') return 0;
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  }
  return 0;
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
    
    // Define which internal keys are numeric
    const numericKeys = ['cost', 'price', 'qtySold', 'discount', 'qtyOnHand'];

    return values.map(row => {
      const obj = {};
      Object.keys(sheetConfig.columns).forEach(appKey => {
        const sheetHeader = sheetConfig.columns[appKey];
        const lookupKey = sheetHeader.toLowerCase();
        const colIndex = headerMap[lookupKey];
        
        if (colIndex !== undefined) {
          const rawVal = row[colIndex];
          if (numericKeys.includes(appKey)) {
            obj[appKey] = parseNum(rawVal);
          } else {
            obj[appKey] = rawVal ? rawVal.toString() : "";
          }
        } else {
          // Default values if column is missing
          if (numericKeys.includes(appKey)) {
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
    const productsRaw = getMappedData('products');
    const transactionsRaw = getMappedData('transactions');
    const inventoryRaw = getMappedData('inventory');

    // Deduplicate Products
    const productMap = new Map();
    productsRaw.forEach(p => {
      if (p.sku && p.sku.toString().trim() !== "") {
         productMap.set(p.sku, p);
      }
    });
    const uniqueProducts = Array.from(productMap.values());

    // Deduplicate Inventory
    const inventoryMap = new Map();
    inventoryRaw.forEach(i => {
      if (i.sku && i.sku.toString().trim() !== "") {
        inventoryMap.set(i.sku, i);
      }
    });
    const uniqueInventory = Array.from(inventoryMap.values());

    // Clean Transactions Dates
    const cleanTransactions = transactionsRaw.map(t => {
      let dateStr = new Date().toISOString().split('T')[0];
      try {
        if (t.date) {
           const d = new Date(t.date);
           if (!isNaN(d.getTime())) {
             dateStr = d.toISOString().split('T')[0];
           }
        }
      } catch (e) {}
      return { ...t, date: dateStr };
    });

    if (uniqueProducts.length === 0) {
       // Return debug info if no products found
       return { 
         products: [], 
         transactions: [], 
         inventory: [],
         debug: {
           error: "No products found.",
           details: `Checked tab '${CONFIG.sheets.products.tabName}'. Raw rows: ${productsRaw.length}. Unique SKUs: 0.`,
           tabsAvailable: ss.getSheets().map(s => s.getName())
         }
       };
    }

    return {
      products: uniqueProducts,
      transactions: cleanTransactions,
      inventory: uniqueInventory
    };
  } catch (e) {
    Logger.log(e);
    return {
       products: [], transactions: [], inventory: [],
       debug: { error: "Script Exception", details: e.toString() }
    };
  }
}

// --- AI API CALL ---
function callGeminiAPI(prompt, modelName) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error("API Key Missing. Set 'GEMINI_API_KEY' in Script Properties.");

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
    
    if (json.error) {
       // Pass the actual error message back to client
       throw new Error(`Gemini API Error: ${json.error.message} (Status: ${json.error.code})`);
    }
    
    if (json.candidates?.[0]?.content?.parts?.[0]?.text) {
       return json.candidates[0].content.parts[0].text;
    }
    return "No response text generated from Gemini.";
    
  } catch (e) {
    throw new Error(e.message);
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
