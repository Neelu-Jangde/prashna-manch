exports.handler = async function(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "API key not configured" })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Invalid request body" })
    };
  }

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "messages array is required" })
    };
  }

  const userMessage = body.messages[body.messages.length - 1].content;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const apiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userMessage }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
            responseMimeType: "application/json"
          },
          systemInstruction: {
            parts: [{ text: "You are a JSON-only API. Always respond with valid JSON only. Never add any text, explanation, or markdown before or after the JSON. Never use code fences. Output must be parseable by JSON.parse() directly." }]
          }
        }),
        signal: controller.signal
      }
    );

    clearTimeout(timeout);

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      console.error("Gemini API error:", apiResponse.status, errText);
      return {
        statusCode: apiResponse.status,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Gemini API error: " + apiResponse.status })
      };
    }

    const data = await apiResponse.json();

    // Extract text from Gemini response
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Empty response from Gemini" })
      };
    }

    // Convert to Anthropic-compatible format so frontend works without changes
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({
        content: [{ type: "text", text: text }]
      })
    };

  } catch (err) {
    if (err.name === "AbortError") {
      return {
        statusCode: 504,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Timeout. Please try with fewer questions." })
      };
    }
    console.error("Function error:", err.message);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message })
    };
  }
};
