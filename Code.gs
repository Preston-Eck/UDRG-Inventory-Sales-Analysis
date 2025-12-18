
function doGet() {
  return HtmlService.createTemplateFromFile('index')
      .evaluate()
      .setTitle('UDRG Inventory & Sales Reports')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getData() {
  const ss = SpreadsheetApp.openById("1fXTv1ia1090uWl15b3PlBOxtwfKqyHodh4xj89Dcfyg");
  
  // Helper to get data from a sheet
  const getSheetData = (sheetName) => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    const headers = data.shift();
    return data.map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        // Simple camelCase conversion for headers
        let key = h.toString().toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase());
        // Handle specific key mappings if necessary
        obj[key] = row[i];
      });
      return obj;
    });
  };

  try {
    const products = getSheetData('Products');
    const transactions = getSheetData('Transactions');
    const inventory = getSheetData('Inventory');

    // If sheets are missing, return the structure with empty arrays or fallback
    // This prevents the frontend from crashing if sheets don't exist yet
    if (!products.length && !transactions.length) {
       // Optional: Return mock data if sheets are empty for demo purposes
       // return generateMockServerData(); 
       return { products: [], transactions: [], inventory: [] };
    }

    return {
      products: products,
      transactions: transactions.map(t => ({
        ...t,
        // Ensure date is string format YYYY-MM-DD
        date: new Date(t.date).toISOString().split('T')[0]
      })),
      inventory: inventory
    };
  } catch (e) {
    Logger.log(e);
    throw new Error("Failed to fetch data from Spreadsheet. Ensure sheets 'Products', 'Transactions', and 'Inventory' exist.");
  }
}

function callGeminiAPI(prompt, modelName) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error("GEMINI_API_KEY not found in Script Properties");

  // Construct URL for Gemini API (v1beta)
  // modelName example: 'gemini-3-flash-preview'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  
  const payload = {
    contents: [{
      parts: [{ text: prompt }]
    }]
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
      throw new Error(json.error.message);
    }
    
    // Extract text specifically for the frontend's expected format
    if (json.candidates && json.candidates.length > 0 && json.candidates[0].content && json.candidates[0].content.parts.length > 0) {
       return json.candidates[0].content.parts[0].text;
    }
    
    return "No response text generated from Gemini.";
    
  } catch (e) {
    Logger.log("Gemini Error: " + e.toString());
    throw new Error("Failed to generate content: " + e.message);
  }
}
