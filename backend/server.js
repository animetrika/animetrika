
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Config
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'animetrika-secret-key-change-this';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/animetrika';
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const DOMAIN = 'chat.nwlnd.ru'; // Configured Domain

// Ensure upload dir exists
if (!fs.existsSync(UPLOAD_DIR)){
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '50mb' })); 
app.use('/uploads', express.static(UPLOAD_DIR));

// --- MongoDB Models ---

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  avatar: { type: String, default: '' },
  status: { type: String, default: 'Hey there! I am using Animetrika.' },
  blockedUsers: [{ type: String }],
  lastSeen: { type: Number, default: Date.now },
  isOnline: { type: Boolean, default: false },
  settings: {
    notifications: { type: Boolean, default: true },
    soundEnabled: { type: Boolean, default: true },
    privacyMode: { type: Boolean, default: false },
    theme: { type: String, default: 'dark' },
    chatWallpaper: { type: String, default: 'default' },
    fontSize: { type: String, default: 'medium' }
  }
});
const User = mongoose.model('User', userSchema);

const messageSchema = new mongoose.Schema({
  chatId: { type: String, required: true },
  senderId: { type: String, required: true },
  content: { type: String, default: '' }, // Encrypted text
  type: { type: String, enum: ['text', 'image', 'video', 'audio'], default: 'text' },
  mediaUrl: { type: String },
  replyTo: { type: Object },
  timestamp: { type: Number, default: Date.now },
  status: { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' }
});
const Message = mongoose.model('Message', messageSchema);

const chatSchema = new mongoose.Schema({
  participants: [{ type: String, required: true }], // User IDs
  type: { type: String, default: 'private' },
  lastMessage: { type: mongoose.Schema.Types.Mixed },
  unreadCounts: { type: Map, of: Number, default: {} }, // userId -> count
  pinnedBy: [{ type: String }]
});
const Chat = mongoose.model('Chat', chatSchema);

// --- Middleware ---
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    res.status(403).json({ error: 'Invalid token' });
  }
};

// --- Routes ---

// Auth
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: 'Username taken' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({
      username,
      passwordHash,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`
    });
    await user.save();

    const token = jwt.sign({ userId: user._id }, JWT_SECRET);
    res.json({ user: mapUser(user), token });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid password' });

    user.isOnline = true;
    await user.save();

    const token = jwt.sign({ userId: user._id }, JWT_SECRET);
    res.json({ user: mapUser(user), token });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/users/update', authenticate, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.userId, req.body, { new: true });
    res.json(mapUser(user));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/users/block', authenticate, async (req, res) => {
    try {
        const { targetId } = req.body;
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({error: 'User not found'});

        const idx = user.blockedUsers.indexOf(targetId);
        if (idx === -1) user.blockedUsers.push(targetId);
        else user.blockedUsers.splice(idx, 1);

        await user.save();
        res.json(mapUser(user));
    } catch(e) {
        res.status(500).json({error: e.message});
    }
});

app.get('/api/users/search', authenticate, async (req, res) => {
  try {
    const query = req.query.q;
    if(!query) return res.json([]);
    const users = await User.find({ username: { $regex: query, $options: 'i' } }).limit(10);
    res.json(users.map(mapUser));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/users/bulk', authenticate, async (req, res) => {
  try {
    const { ids } = req.body;
    const users = await User.find({ _id: { $in: ids } });
    res.json(users.map(mapUser));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Chats
app.get('/api/chats', authenticate, async (req, res) => {
  try {
    const chats = await Chat.find({ participants: req.userId });
    const mappedChats = chats.map(c => ({
      id: c._id,
      participants: c.participants,
      type: c.type,
      lastMessage: c.lastMessage,
      unreadCount: c.unreadCounts.get(req.userId) || 0,
      pinnedBy: c.pinnedBy
    }));
    res.json(mappedChats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/chats', authenticate, async (req, res) => {
  try {
    const { peerId } = req.body;
    let chat = await Chat.findOne({
      participants: { $all: [req.userId, peerId] },
      type: 'private'
    });

    if (!chat) {
      chat = new Chat({
        participants: [req.userId, peerId],
        unreadCounts: { [req.userId]: 0, [peerId]: 0 }
      });
      await chat.save();
    }
    res.json({
      id: chat._id,
      participants: chat.participants,
      unreadCount: 0,
      type: chat.type,
      pinnedBy: chat.pinnedBy
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/chats/:id/pin', authenticate, async (req, res) => {
    try {
        const chat = await Chat.findById(req.params.id);
        if(!chat) return res.status(404).json({error: 'Chat not found'});
        
        const index = chat.pinnedBy.indexOf(req.userId);
        if(index === -1) chat.pinnedBy.push(req.userId);
        else chat.pinnedBy.splice(index, 1);
        
        await chat.save();
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({error: e.message});
    }
});

// Messages
app.get('/api/chats/:id/messages', authenticate, async (req, res) => {
  try {
    const messages = await Message.find({ chatId: req.params.id }).sort({ timestamp: 1 });
    res.json(messages.map(m => ({ id: m._id, ...m.toObject() })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/chats/:id/read', authenticate, async (req, res) => {
    try {
        const chat = await Chat.findById(req.params.id);
        if(chat) {
            chat.unreadCounts.set(req.userId, 0);
            await chat.save();
        }
        await Message.updateMany(
            { chatId: req.params.id, senderId: { $ne: req.userId }, status: { $ne: 'read' } },
            { $set: { status: 'read' } }
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/messages/:id', authenticate, async (req, res) => {
    try {
        await Message.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({error: e.message});
    }
});

// --- Socket.io Security & Logic ---

const onlineUsers = new Map(); // userId -> socketId

// SECURITY: Middleware for Socket Authentication
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication error: Token required"));
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.userId; // Attach userId to socket instance
    next();
  } catch (err) {
    next(new Error("Authentication error: Invalid token"));
  }
});

io.on('connection', (socket) => {
  const userId = socket.userId; // Guaranteed by middleware
  
  onlineUsers.set(userId, socket.id);
  socket.join(userId);
  
  User.findByIdAndUpdate(userId, { isOnline: true }).exec();
  io.emit('user_status', { userId, isOnline: true });

  socket.on('disconnect', () => {
    onlineUsers.delete(userId);
    User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: Date.now() }).exec();
    io.emit('user_status', { userId, isOnline: false, lastSeen: Date.now() });
  });

  socket.on('join_chat', (chatId) => {
    socket.join(chatId);
  });

  socket.on('leave_chat', (chatId) => {
    socket.leave(chatId);
  });

  socket.on('typing', ({ chatId, isTyping }) => {
    socket.to(chatId).emit('typing', { userId, chatId, isTyping });
  });

  socket.on('send_message', async (msgData) => {
    try {
      // HANDLE MEDIA SAVING TO DISK TO PREVENT MONGO CRASH
      if (msgData.mediaUrl && msgData.mediaUrl.startsWith('data:')) {
          try {
              const matches = msgData.mediaUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
              if (matches && matches.length === 3) {
                  const type = matches[1];
                  const buffer = Buffer.from(matches[2], 'base64');
                  
                  let ext = 'bin';
                  if(type.includes('jpeg')) ext = 'jpg';
                  else if(type.includes('png')) ext = 'png';
                  else if(type.includes('webm')) ext = 'webm';
                  else if(type.includes('mp4')) ext = 'mp4';

                  const fileName = `${Date.now()}-${Math.round(Math.random()*1E9)}.${ext}`;
                  fs.writeFileSync(path.join(UPLOAD_DIR, fileName), buffer);
                  
                  // Replace Base64 with URL using DOMAIN
                  msgData.mediaUrl = `http://${DOMAIN}:3001/uploads/${fileName}`;
              }
          } catch (err) {
              console.error("File save error", err);
          }
      }

      const msg = new Message({
        chatId: msgData.chatId,
        senderId: userId, // Secure: Use authenticated ID
        content: msgData.content,
        type: msgData.type,
        mediaUrl: msgData.mediaUrl,
        replyTo: msgData.replyTo,
        status: 'sent'
      });
      await msg.save();

      const chat = await Chat.findById(msgData.chatId);
      if (chat) {
        chat.lastMessage = msg;
        chat.participants.forEach(p => {
            if(p !== userId) {
                const count = chat.unreadCounts.get(p) || 0;
                chat.unreadCounts.set(p, count + 1);
            }
        });
        await chat.save();
      }

      const payload = { id: msg._id, ...msg.toObject() };
      io.to(msgData.chatId).emit('new_message', payload);
      
      chat.participants.forEach(p => {
          io.to(p).emit('chat_updated', { chatId: chat._id, lastMessage: payload, unreadCount: chat.unreadCounts.get(p) });
      });
    } catch (e) {
      console.error("Socket message error", e);
    }
  });

  // --- WebRTC Signaling ---
  socket.on('call_offer', (data) => {
      // data: { targetId, offer }
      io.to(data.targetId).emit('call_offer', { 
          offer: data.offer, 
          callerId: userId 
      });
  });
  
  socket.on('call_answer', (data) => {
      // data: { targetId, answer }
      io.to(data.targetId).emit('call_answer', { 
          answer: data.answer,
          responderId: userId
      });
  });
  
  socket.on('ice_candidate', (data) => {
      // data: { targetId, candidate }
      io.to(data.targetId).emit('ice_candidate', { 
          candidate: data.candidate,
          senderId: userId
      });
  });
});

function mapUser(u) {
  if (!u) return null;
  return {
    id: u._id.toString(),
    username: u.username,
    avatar: u.avatar,
    status: u.status,
    isOnline: u.isOnline,
    lastSeen: u.lastSeen,
    blockedUsers: u.blockedUsers,
    settings: u.settings
  };
}

mongoose.connect(MONGO_URI)
  .then(() => {
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => console.error(err));
