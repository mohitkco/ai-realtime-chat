// server/src/controllers/aiController.js
const { GoogleGenAI } = require('@google/genai');
const { prisma } = require('../config/db');

// Initialize the Google Gen AI client wrapper mapping environment tokens
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

exports.getSmartReplies = async (req, res) => {
  try {
    const { roomName, mood } = req.body;
    if (!roomName || !mood) return res.status(400).json({ error: "Missing room context or mood parameter" });

    // 1. Grab the last 5 messages in this room to form the context wrapper
    const historicalMessages = await prisma.message.findMany({
      where: { room: roomName },
      include: { user: { select: { username: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    // Invert arrays to display chronologically ascending logs for the AI reader
    const cleanContext = historicalMessages.reverse().map(m => `${m.user.username}: ${m.text}`).join('\n');

    // 2. Direct prompt instruction mapping strict syntax return limits
    const systemPrompt = `
      You are a smart context-aware chat assistant embedded inside an app called ChatApp.
      Analyze the ongoing conversation context provided below.
      
      Generate exactly 3 short text reply options that the active user could send next.
      The suggestions MUST match this requested emotional tone/mood: "${mood}".
      
      Conversation Context:
      ${cleanContext || "No previous messages. Start a fresh conversation."}
      
      CRITICAL CRITERIA:
      - Return ONLY a valid JSON string array containing exactly 3 strings.
      - Example format: ["Reply choice one", "Reply choice two", "Reply choice three"]
      - Do not include markdown code block styling markers like \`\`\`json.
      - Keep responses naturally conversational, brief, and safe.
    `;

    // 3. Request inference call from the fast, light, and cheap gemini-2.5-flash model
    const aiResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: systemPrompt,
    });

    const outputText = aiResponse.text ? aiResponse.text.trim() : "[]";
    
    // Parse response cleanly back to a client-side iterable array block
    let replySuggestionsArray = [];
    try {
      replySuggestionsArray = JSON.parse(outputText);
    } catch (parseErr) {
      // RegEx fallback cleaner if the model returns lingering string anomalies
      const cleanJsonStr = outputText.replace(/```json|```/g, "").trim();
      replySuggestionsArray = JSON.parse(cleanJsonStr);
    }

    return res.json(replySuggestionsArray);
  } catch (err) {
    console.error("❌ Gemini API Processing Failure:", err.message);
    return res.status(500).json(["Could not load suggestions.", "Let's catch up later!", "Sounds good."]);
  }
};