// --- HOSTING FUNCTION (REQUIRED) ---
function doGet() {
  return HtmlService.createTemplateFromFile('index')
      .evaluate()
      .setTitle('UDRG Inventory & Sales Reports')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// --- DATA FETCHING FUNCTIONS ---

function getData() {
  const debug = { logs: [] };
  
  try {
    const products = getProducts(debug);
    const transactions = getTransactions(debug);
    const inventory = getInventory(debug);
    
    // Check if we have data
    if (!products.length && !transactions.length && !inventory.length) {
      // If all empty, return debug info
      // CRITICAL FIX: Use openById here too, getActiveSpreadsheet() returns null in standalone scripts!
      const ss = SpreadsheetApp.openById('1fXTv1ia1090uWl15b3PlBOxtwfKqyHodh4xj89Dcfyg');
      const allSheets = ss.getSheets().map(s => s.getName());
      debug.logs.push(`Available Sheets in ID 1fXT...: ${allSheets.join(', ')}`);
      debug.error = "No data found. Check sheet names against Available Sheets list.";
      return { products: [], transactions: [], inventory: [], debug: debug };
    }

    return { products, transactions, inventory };
  } catch (e) {
    debug.error = e.message;
    return { products: [], transactions: [], inventory: [], debug: debug };
  }
}

function getProducts(debug) { return getSheetData_('Products', debug); }
function getTransactions(debug) { return getSheetData_('Transactions', debug); }
function getInventory(debug) { return getSheetData_('Inventory', debug); }

function getSheetData_(sheetName, debug) {
  try {
    // Explicitly open the user's specific spreadsheet to avoid "ActiveSpreadsheet" ambiguity
    const ss = SpreadsheetApp.openById('1fXTv1ia1090uWl15b3PlBOxtwfKqyHodh4xj89Dcfyg');
    const sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      if (debug) debug.logs.push(`Sheet "${sheetName}" NOT found.`);
      return []; 
    }

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      if (debug) debug.logs.push(`Sheet "${sheetName}" has ${data.length} rows (empty or headers only).`);
      return [];
    }

    if (debug) debug.logs.push(`Sheet "${sheetName}" loaded with ${data.length - 1} rows.`);
    const headers = data[0].map(h => h.toString().toLowerCase().trim());
    const rows = data.slice(1);
    
    // ... rest of processing ...

    return rows.map(row => {
      let obj = {};
      headers.forEach((header, index) => {
        // Map common variations of headers to our internal keys
        let key = header;
        
        // Product mappings
        if (header === 'product name' || header === 'item') key = 'name';
        if (header === 'cost price') key = 'cost';
        if (header === 'retail price' || header === 'selling price') key = 'price';
        
        // Transaction mappings
        if (header === 'transaction id') key = 'id';
        if (header === 'qty' || header === 'quantity') key = 'qtySold';
        
        // Inventory mappings
        if (header === 'on hand' || header === 'stock' || header === 'qty') key = 'qtyOnHand';

        // Normalize specific keys to camelCase if needed, but simple mapping is safer for now
        // We'll rely on the frontend to map 'sku' -> 'sku', 'name' -> 'name' etc.
        // If the sheet headers are "SKU", "Name", "Department" (capitalized), 
        // the lowercasing above handles it.
        
        // CamelCase conversion for keys like "qty sold" -> "qtySold"
        key = key.replace(/ ([a-z])/g, (g) => g[1].toUpperCase());
        
        obj[key] = row[index];
      });
      
      // Ensure numeric values are actually numbers
      if (obj.cost) obj.cost = Number(obj.cost) || 0;
      if (obj.price) obj.price = Number(obj.price) || 0;
      if (obj.qtySold) obj.qtySold = Number(obj.qtySold) || 0;
      if (obj.qtyOnHand) obj.qtyOnHand = Number(obj.qtyOnHand) || 0;
      if (obj.discount) obj.discount = Number(obj.discount) || 0;
      
      // Ensure dates are strings for JSON transport
      if (obj.date && obj.date instanceof Date) {
        obj.date = obj.date.toISOString();
      }

      return obj;
    });
  } catch (e) {
    console.error(`Error reading ${sheetName}: ${e.message}`);
    throw e;
  }
}


// --- AI PROXY FUNCTION (REQUIRED) ---
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