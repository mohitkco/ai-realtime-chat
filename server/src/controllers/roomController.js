// server/src/controllers/roomController.js
const { prisma, redisClient } = require('../config/db'); 

exports.getAllUsersList = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true }
    });
    return res.json(users);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.getAuthorizedRooms = async (req, res) => {
  try {
    // 1. Get your username from the session token
    const tokenUsername = req.user?.username;

    if (!tokenUsername) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // 2. Find the logged-in user's true database ID
    const dbUser = await prisma.user.findUnique({
      where: { username: tokenUsername }
    });

    if (!dbUser) {
      return res.json([]); // Return empty array if user doesn't exist yet
    }

    // 3. 🎯 THE REAL FILTER: Only fetch rooms where THIS user is an active member
    const rooms = await prisma.room.findMany({
      where: {
        members: {
          some: {
            userId: dbUser.id
          }
        }
      },
      include: {
        members: {
          include: {
            user: true 
          }
        }
      }
    });

    // Prevent the browser from caching this network request on page refresh
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.json(rooms);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.createPrivateGroup = async (req, res) => {
  try {
    const { name, invitedUserIds } = req.body;
    
    // 🎯 FIX CREATOR EXCLUSION: Extract your validated session ID
    const currentUserId = req.user?.userId || req.user?.id || req.userId;

    if (!currentUserId) {
      return res.status(401).json({ error: "Unauthorized: Group creator identity missing." });
    }

    // Deduplicate IDs and ensure the creator is explicitly included in the member list array
    const allMemberIds = Array.from(new Set([...invitedUserIds, currentUserId]));

    // Check if a ghost room with no members already exists under this name to clean it up safely
    const existingRoom = await prisma.room.findUnique({ where: { name } });
    if (existingRoom) {
      // Hard wipe historical message records matching this room name string to prevent chat leaks
      await prisma.message.deleteMany({ where: { room: name } });
      await prisma.room.delete({ where: { id: existingRoom.id } });
    }

    // Create the fresh room container housing all targeted members cleanly
    const newRoom = await prisma.room.create({
      data: {
        name,
        members: {
          create: allMemberIds.map(id => ({ userId: id }))
        }
      },
      include: {
        members: { include: { user: true } }
      }
    });

    // BROADCAST: Alert all online users that a new channel is active
    const io = req.app.get('io');
    if (io) {
      io.emit('room_created', newRoom);
    }

    return res.json(newRoom);
  } catch (err) {
    console.error("❌ Error inside createPrivateGroup:", err);
    return res.status(500).json({ error: err.message });
  }
};

exports.exitGroupChannel = async (req, res) => {
  try {
    const { roomName } = req.params;
    
    // 1. Get the username directly from your session token (verified by our logs)
    const tokenUsername = req.user?.username;

    if (!tokenUsername) {
      return res.status(401).json({ error: "Unauthorized: Session username not found." });
    }

    // 2. Look up the absolute truth ID from the User table using the verified username
    const dbUser = await prisma.user.findUnique({
      where: { username: tokenUsername }
    });

    if (!dbUser) {
      return res.status(404).json({ error: "Logged in user not found in database." });
    }

    // 3. Find the target room by its name string
    const targetRoom = await prisma.room.findUnique({
      where: { name: roomName }
    });

    if (!targetRoom) {
      return res.status(404).json({ error: "Group channel not found." });
    }

    // 4. THE PERSISTENT WIPE: Drop the matching row using verified database IDs
    const deleteAction = await prisma.roomMember.deleteMany({
      where: {
        userId: dbUser.id,   // Absolute primary key ID match
        roomId: targetRoom.id // Absolute room container ID match
      }
    });

    console.log(`🧹 Records successfully dropped from database disk: ${deleteAction.count}`);

    // 5. Count remaining active members to trigger empty room self-destruction
    const remainingCount = await prisma.roomMember.count({ 
      where: { roomId: targetRoom.id } 
    });

    const io = req.app.get('io');

    if (remainingCount === 0) {
      console.log(`🔥 Room #${roomName} is empty. Commencing automatic database purge...`);
      await prisma.message.deleteMany({ where: { room: roomName } });
      await prisma.room.delete({ where: { id: targetRoom.id } });
      
      if (redisClient && redisClient.isOpen) {
        await redisClient.del(`messages:${roomName}`);
      }

      if (io) io.emit('room_deleted', { roomName });
      return res.json({ message: "SUCCESS_DELETED" });
    }

    if (io) io.emit('room_membership_updated', { roomName });
    return res.json({ message: "SUCCESS_LEFT" });

  } catch (err) {
    console.error("❌ Operational Error inside exitGroupChannel:", err);
    return res.status(500).json({ error: err.message });
  }
};