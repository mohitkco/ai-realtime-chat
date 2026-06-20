// server/src/middleware/rateLimiter.js
const { redisClient } = require('../config/db');

const aiRateLimiter = async (req, res, next) => {
  try {
    if (!redisClient.isOpen) return next(); // Fallback if Redis is down

    const userId = req.user.userId;
    const redisKey = `ai-cooldown:${userId}`;

    // Check if the user has requested a suggestion within our cooldown gap window
    const isOnCooldown = await redisClient.get(redisKey);
    if (isOnCooldown) {
      return res.status(429).json({ 
        error: "Rate limit safety active. Please wait a few seconds before requesting AI replies again." 
      });
    }

    // Set a strict 10-second expiration lock in Redis RAM
    await redisClient.setEx(redisKey, 10, "locked");
    next();
  } catch (err) {
    next(); // Fallback to let request proceed if caching layer hits an edge issue
  }
};

module.exports = aiRateLimiter;