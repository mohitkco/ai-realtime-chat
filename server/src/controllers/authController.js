// src/controllers/authController.js
const bcrypt = require('bcryptjs');
const { prisma } = require('../config/db');

exports.register = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "All fields are required" });

    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) return res.status(400).json({ error: "Username already taken" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({ data: { username, password: hashedPassword } });

    // Seed default #general group room assignment row
    const generalRoom = await prisma.room.upsert({
      where: { name: 'general' }, update: {}, create: { name: 'general' }
    });
    await prisma.roomMember.upsert({
      where: { userId_roomId: { userId: newUser.id, roomId: generalRoom.id } },
      update: {}, create: { userId: newUser.id, roomId: generalRoom.id }
    });

    return res.status(201).json({ message: "Registration successful!" });
  } catch (err) {
    return res.status(500).json({ error: "Server registration error" });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // Create an explicit stateful session tracker row in PostgreSQL
    const sessionExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 Hours duration
    const session = await prisma.session.create({
      data: { userId: user.id, expiresAt: sessionExpiry }
    });

    // Send the Session ID back to the browser inside an unstealable HttpOnly cookie
    res.cookie('sessionId', session.id, {
      httpOnly: true,
      secure: false, // Set to true later when deploying live on HTTPS production cloud
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    return res.json({ username: user.username });
  } catch (err) {
    return res.status(500).json({ error: "Server login error" });
  }
};

exports.logout = async (req, res) => {
  try {
    const sessionId = req.cookies.sessionId;
    if (sessionId) {
      await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
    }
    res.clearCookie('sessionId');
    return res.json({ message: "Successfully logged out" });
  } catch (err) {
    return res.status(500).json({ error: "Logout execution failure" });
  }
};

exports.getMe = async (req, res) => {
  return res.json({ username: req.user.username });
};