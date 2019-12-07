import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import { createServer } from "http";
import { Server } from "socket.io";
import { randomUUID } from "crypto";
import jwtModule from "jsonwebtoken";
import { requireAuth, signToken } from "./auth.js";
import { readStore, writeStore } from "./store.js";

const app = express();
const httpServer = createServer(app);

const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
const io = new Server(httpServer, {
  cors: { origin: clientUrl, methods: ["GET", "POST", "PUT", "DELETE"] }
});

app.use(cors({ origin: clientUrl }));
app.use(express.json({ limit: "5mb" }));

const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  email: u.email,
  avatar: u.avatar || "",
  bio: u.bio || "",
  online: Boolean(u.online),
  lastSeen: u.lastSeen || null
});

app.get("/api/health", (_, res) => res.json({ ok: true, name: "ChatFlow" }));

app.post("/api/auth/register", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ message: "Username, email and password are required" });
  if (password.length < 6)
    return res.status(400).json({ message: "Password must be at least 6 characters" });

  const db = await readStore();
  const normalized = email.trim().toLowerCase();
  if (db.users.some(u => u.email === normalized))
    return res.status(409).json({ message: "Email is already registered" });

  const user = {
    id: randomUUID(),
    username: username.trim().slice(0, 30),
    email: normalized,
    password: await bcrypt.hash(password, 10),
    avatar: "",
    bio: "Hey there! I’m using ChatFlow.",
    online: false,
    lastSeen: new Date().toISOString()
  };
  db.users.push(user);
  await writeStore(db);
  const token = signToken(user);
  res.status(201).json({ token, user: publicUser(user) });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const db = await readStore();
  const user = db.users.find(u => u.email === String(email || "").trim().toLowerCase());
  if (!user || !(await bcrypt.compare(password || "", user.password)))
    return res.status(401).json({ message: "Invalid email or password" });

  user.online = true;
  await writeStore(db);
  io.emit("presence:update", { userId: user.id, online: true });
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  const db = await readStore();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ user: publicUser(user) });
});

app.get("/api/users", requireAuth, async (req, res) => {
  const db = await readStore();
  const q = String(req.query.q || "").toLowerCase();
  const users = db.users
    .filter(u => u.id !== req.user.id)
    .filter(u => !q || u.username.toLowerCase().includes(q) || u.email.includes(q))
    .slice(0, 30)
    .map(publicUser);
  res.json({ users });
});

app.put("/api/users/me", requireAuth, async (req, res) => {
  const db = await readStore();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ message: "User not found" });
  if (typeof req.body.username === "string") user.username = req.body.username.trim().slice(0, 30);
  if (typeof req.body.bio === "string") user.bio = req.body.bio.slice(0, 160);
  if (typeof req.body.avatar === "string") user.avatar = req.body.avatar.slice(0, 1000000);
  await writeStore(db);
  io.emit("user:updated", publicUser(user));
  res.json({ user: publicUser(user) });
});

app.get("/api/conversations", requireAuth, async (req, res) => {
  const db = await readStore();
  const mine = db.conversations.filter(c => c.members.includes(req.user.id));
  const result = mine.map(c => {
    const otherId = c.members.find(id => id !== req.user.id);
    const other = db.users.find(u => u.id === otherId);
    const messages = db.messages.filter(m => m.conversationId === c.id);
    const last = messages[messages.length - 1];
    return {
      id: c.id,
      type: "direct",
      user: other ? publicUser(other) : null,
      lastMessage: last || null,
      unread: messages.filter(m => m.senderId !== req.user.id && !m.readBy?.includes(req.user.id)).length
    };
  }).sort((a,b) => new Date(b.lastMessage?.createdAt || 0) - new Date(a.lastMessage?.createdAt || 0));
  res.json({ conversations: result });
});

app.post("/api/conversations", requireAuth, async (req, res) => {
  const { userId } = req.body;
  const db = await readStore();
  if (!db.users.some(u => u.id === userId))
    return res.status(404).json({ message: "User not found" });
  let c = db.conversations.find(c => c.members.length === 2 && c.members.includes(req.user.id) && c.members.includes(userId));
  if (!c) {
    c = { id: randomUUID(), members: [req.user.id, userId], createdAt: new Date().toISOString() };
    db.conversations.push(c);
    await writeStore(db);
  }
  const other = db.users.find(u => u.id === userId);
  res.status(201).json({ conversation: { id: c.id, type: "direct", user: publicUser(other), lastMessage: null, unread: 0 } });
});

app.get("/api/conversations/:id/messages", requireAuth, async (req, res) => {
  const db = await readStore();
  const c = db.conversations.find(x => x.id === req.params.id);
  if (!c || !c.members.includes(req.user.id))
    return res.status(403).json({ message: "Access denied" });
  const messages = db.messages.filter(m => m.conversationId === c.id);
  messages.forEach(m => {
    if (m.senderId !== req.user.id) {
      m.readBy = Array.from(new Set([...(m.readBy || []), req.user.id]));
    }
  });
  await writeStore(db);
  res.json({ messages });
});

app.post("/api/conversations/:id/messages", requireAuth, async (req, res) => {
  const { text = "", type = "text", attachment = null, replyTo = null } = req.body;
  const db = await readStore();
  const c = db.conversations.find(x => x.id === req.params.id);
  if (!c || !c.members.includes(req.user.id))
    return res.status(403).json({ message: "Access denied" });
  if (!text.trim() && !attachment) return res.status(400).json({ message: "Message is empty" });

  const message = {
    id: randomUUID(),
    conversationId: c.id,
    senderId: req.user.id,
    text: String(text).slice(0, 5000),
    type,
    attachment,
    replyTo,
    createdAt: new Date().toISOString(),
    deliveredTo: [],
    readBy: [req.user.id]
  };
  db.messages.push(message);
  await writeStore(db);
  io.to(`conversation:${c.id}`).emit("message:new", message);
  res.status(201).json({ message });
});

app.put("/api/messages/:id", requireAuth, async (req, res) => {
  const db = await readStore();
  const m = db.messages.find(x => x.id === req.params.id);
  if (!m || m.senderId !== req.user.id) return res.status(403).json({ message: "Not allowed" });
  m.text = String(req.body.text || "").slice(0, 5000);
  m.edited = true;
  await writeStore(db);
  io.to(`conversation:${m.conversationId}`).emit("message:updated", m);
  res.json({ message: m });
});

app.delete("/api/messages/:id", requireAuth, async (req, res) => {
  const db = await readStore();
  const index = db.messages.findIndex(x => x.id === req.params.id);
  if (index < 0 || db.messages[index].senderId !== req.user.id)
    return res.status(403).json({ message: "Not allowed" });
  const [m] = db.messages.splice(index, 1);
  await writeStore(db);
  io.to(`conversation:${m.conversationId}`).emit("message:deleted", { id: m.id, conversationId: m.conversationId });
  res.json({ ok: true });
});

app.post("/api/groups", requireAuth, async (req, res) => {
  const { name, memberIds = [], avatar = "" } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: "Group name is required" });
  const db = await readStore();
  const members = Array.from(new Set([req.user.id, ...memberIds])).filter(id => db.users.some(u => u.id === id));
  const group = {
    id: randomUUID(),
    name: name.trim().slice(0, 60),
    avatar,
    adminIds: [req.user.id],
    memberIds: members,
    createdAt: new Date().toISOString()
  };
  db.groups.push(group);
  await writeStore(db);
  res.status(201).json({ group });
});

app.get("/api/groups", requireAuth, async (req, res) => {
  const db = await readStore();
  res.json({ groups: db.groups.filter(g => g.memberIds.includes(req.user.id)) });
});

const onlineSockets = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Authentication required"));
  try {
    socket.user = jwtVerify(token);
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

function jwtVerify(token) {
  return jwtModule.verify(token, process.env.JWT_SECRET || "chatflow-development-secret");
}

io.on("connection", async socket => {
  const userId = socket.user.id;
  onlineSockets.set(userId, socket.id);
  const db = await readStore();
  const user = db.users.find(u => u.id === userId);
  if (user) {
    user.online = true;
    user.lastSeen = new Date().toISOString();
    await writeStore(db);
  }
  io.emit("presence:update", { userId, online: true });

  socket.on("conversation:join", id => socket.join(`conversation:${id}`));

  socket.on("typing", ({ conversationId, isTyping }) => {
    socket.to(`conversation:${conversationId}`).emit("typing", { userId, isTyping });
  });

  socket.on("message:read", async ({ conversationId, messageId }) => {
    const db2 = await readStore();
    const message = db2.messages.find(m => m.id === messageId);
    if (message && message.conversationId === conversationId) {
      message.readBy = Array.from(new Set([...(message.readBy || []), userId]));
      await writeStore(db2);
      io.to(`conversation:${conversationId}`).emit("message:read", { messageId, userId });
    }
  });

  socket.on("disconnect", async () => {
    onlineSockets.delete(userId);
    const db2 = await readStore();
    const u = db2.users.find(x => x.id === userId);
    if (u) {
      u.online = false;
      u.lastSeen = new Date().toISOString();
      await writeStore(db2);
    }
    io.emit("presence:update", { userId, online: false, lastSeen: u?.lastSeen });
  });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`ChatFlow server running on http://localhost:${PORT}`));
