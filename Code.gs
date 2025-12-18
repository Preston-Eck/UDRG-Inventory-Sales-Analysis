
function doGet() {
  return HtmlService.createTemplateFromFile('index')
      .evaluate()
      .setTitle('UDRG Inventory & Sales Reports')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
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
