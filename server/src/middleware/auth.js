// src/middleware/auth.js
const { prisma } = require('../config/db');

const authenticateSession = async (req, res, next) => {
  try {
    // Read the secure cookie automatically passed by the browser
    const sessionId = req.cookies.sessionId;
    if (!sessionId) return res.status(401).json({ error: "Authentication session missing" });

    // Look up the active session mapping row in PostgreSQL
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: { select: { id: true, username: true } } }
    });

    // Check if the session doesn't exist or has expired
    if (!session || session.expiresAt < new Date()) {
      return res.status(401).json({ error: "Session expired or invalid" });
    }

    // Inject user identity data into the request object for our controllers
    req.user = { userId: session.user.id, username: session.user.username };
    next();
  } catch (err) {
    return res.status(500).json({ error: "Internal session authentication validation failure" });
  }
};

module.exports = authenticateSession;