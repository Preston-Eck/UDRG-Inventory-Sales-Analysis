// --- HOSTING FUNCTION (REQUIRED) ---
function doGet() {
  return HtmlService.createTemplateFromFile('index')
      .evaluate()
      .setTitle('UDRG Inventory & Sales Reports')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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