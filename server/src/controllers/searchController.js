// server/src/controllers/searchController.js
const { GoogleGenAI } = require('@google/genai');
const prisma = require('../../db'); 

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

exports.executeHybridSearch = async (req, res) => {
  try {
    const { roomName, query } = req.body;
    console.log(`📡 Processing search for Room: "${roomName}" | Query: "${query}"`);

    if (!roomName || !query || !query.trim()) {
      return res.status(400).json({ error: "Context inputs required" });
    }

    const cleanQuery = query.trim();
    let vectorString = '[]';

    try {
      const embeddingResponse = await ai.models.embedContent({
        model: 'gemini-embedding-001', 
        contents: cleanQuery
      });

      let queryVector = null;
      if (embeddingResponse.embedding?.values) {
        queryVector = embeddingResponse.embedding.values;
      } else if (embeddingResponse.embeddings?.[0]?.values) {
        queryVector = embeddingResponse.embeddings[0].values;
      } else if (Array.isArray(embeddingResponse.embeddings)) {
        queryVector = embeddingResponse.embeddings;
      }

      if (queryVector) {
        vectorString = `[${queryVector.join(',')}]`;
      }
    } catch (aiErr) {
      console.warn("⚠️ Embedding generator skipped during processing:", aiErr.message);
    }

    // 🎯 RECONSTRUCTED HYBRID SQL: Explicitly falls back to textual keyword matching
    // if vectors haven't fully processed on historical database rows yet.
    const searchResults = await prisma.$queryRawUnsafe(`
      SELECT 
        m.id, 
        m.text, 
        u.username as "senderName",
        CASE 
          WHEN m.embedding IS NOT NULL AND '${vectorString}' != '[]' 
          THEN (1 - (m.embedding <=> '${vectorString}'::vector))
          ELSE 0.50
        END as "semanticSimilarity"
      FROM "Message" m
      JOIN "User" u ON m."userId" = u.id
      WHERE m.room = '${roomName}'
        AND (
          m.text ILIKE $1
          OR (m.embedding IS NOT NULL AND '${vectorString}' != '[]')
        )
      ORDER BY "semanticSimilarity" DESC
      LIMIT 10;
    `, `%${cleanQuery}%`);

    const formattedResults = searchResults.map(row => ({
      id: row.id,
      text: row.text,
      sender: row.senderName,
      confidence: Math.round((row.semanticSimilarity || 0) * 100)
    }));

    console.log(`📦 Outbound result count: ${formattedResults.length} records`);
    return res.json(formattedResults);
  } catch (err) {
    console.error("❌ Search Controller Execution Exception:", err);
    return res.status(500).json({ error: "Internal vector query execution failure" });
  }
};