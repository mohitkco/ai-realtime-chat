// src/routes/api.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authController = require('../controllers/authController');
const roomController = require('../controllers/roomController');
const messageController = require('../controllers/messageController');
const authenticateSession = require('../middleware/auth');
const aiController = require('../controllers/aiController');
const aiRateLimiter = require('../middleware/rateLimiter');
// Append this import at the top of your server/src/routes/api.js file
const searchController = require('../controllers/searchController');

// Remove the duplicate lines and replace with this debug wrapper block:
router.post('/search/hybrid', (req, res, next) => {
  console.log("📡 [Route Hit]: /api/search/hybrid was successfully accessed by frontend client");
  next();
}, searchController.executeHybridSearch);
// Public Authentication Route Links
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);

// Session Verification Check Route
router.get('/me', authenticateSession, authController.getMe);

// Authorized Workspace Operations Paths
router.get('/users', roomController.getAllUsersList);
router.get('/rooms', authenticateSession, roomController.getAuthorizedRooms);
router.post('/rooms', authenticateSession, roomController.createPrivateGroup);
router.post('/rooms/:roomName/exit', authenticateSession, roomController.exitGroupChannel);

// 🎯 SECURED: Authenticate the clear endpoint view bounds mapping
router.post('/rooms/:roomName/clear-personal', authenticateSession, messageController.clearPersonalChatHistory);

router.post('/ai/suggest', authenticateSession, aiRateLimiter, aiController.getSmartReplies);

// 🎯 SECURED: Protect the history retriever layer so req.user.username evaluates cleanly
router.get('/messages/:roomName', authenticateSession, messageController.getChatHistory);
router.get('/admin/metrics', authenticateSession, adminController.getSystemMetrics);
module.exports = router;