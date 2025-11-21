
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
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// IMPORTANT: Trust Nginx Proxy
app.set('trust proxy', 1);

// SECURITY: Strict CORS Policy
const allowedOrigins = [
  'https://chat.nwlnd.ru', 
  'http://chat.nwlnd.ru',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost:3000'
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  credentials: true
};

app.use(cors(corsOptions));

const io = new Server(server, {
  cors: corsOptions,
  path: '/socket.io/'
});

// Config
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'animetrika-secret-key-change-this';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/animetrika';
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// Ensure upload dir exists
if (!fs.existsSync(UPLOAD_DIR)){
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// --- Security Middleware ---
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false, 
}));
app.use(mongoSanitize());
app.use(xss());
app.use(express.json({ limit: '1mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 2000, 
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, 
    max: 20,
    message: "Too many login attempts, please try again later"
});
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

app.use('/uploads', express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, UPLOAD_DIR) },
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname) || '.bin';
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + ext);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 }, 
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'video/mp4', 'video/webm', 'video/ogg', 'video/x-matroska',
            'audio/mpeg', 'audio/webm', 'audio/wav', 'audio/ogg'
        ];
        if(allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type'));
        }
    }
});

// --- MongoDB Models ---

// System Config Model
const configSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed }
});
const SystemConfig = mongoose.model('SystemConfig', configSchema);

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  avatar: { type: String, default: '' },
  status: { type: String, default: 'Hey there! I am using Animetrika.' },
  blockedUsers: [{ type: String }],
  isAdmin: { type: Boolean, default: false },
  lastSeen: { type: Number, default: Date.now },
  isOnline: { type: Boolean, default: false },
  settings: {
    notifications: { type: Boolean, default: true },
    soundEnabled: { type: Boolean, default: true },
    privacyMode: { type: Boolean, default: false },
    theme: { type: String, default: 'dark' },
    chatWallpaper: { type: String, default: 'default' },
    chatWallpapers: { type: Map, of: String, default: {} },
    fontSize: { type: String, default: 'medium' },
    language: { type: String, default: 'en' },
    enterToSend: { type: Boolean, default: true }
  }
});
const User = mongoose.model('User', userSchema);

const messageSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // Client UUID
  chatId: { type: String, required: true },
  senderId: { type: String, required: true },
  content: { type: String, default: '' }, 
  type: { type: String, enum: ['text', 'image', 'video', 'audio'], default: 'text' },
  mediaUrl: { type: String },
  replyTo: { type: Object },
  timestamp: { type: Number, default: Date.now },
  status: { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' }
});
const Message = mongoose.model('Message', messageSchema);

const chatSchema = new mongoose.Schema({
  participants: [{ type: String }], 
  type: { type: String, default: 'private', enum: ['private', 'group', 'channel'] },
  name: { type: String }, 
  avatar: { type: String }, 
  description: { type: String }, 
  adminIds: [{ type: String }], 
  lastMessage: { type: mongoose.Schema.Types.Mixed },
  unreadCounts: { type: Map, of: Number, default: {} }, 
  pinnedBy: [{ type: String }],
  subscriberCount: { type: Number, default: 0 }
});
const Chat = mongoose.model('Chat', chatSchema);

const subscriptionSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    channelId: { type: String, required: true, index: true },
    joinedAt: { type: Number, default: Date.now }
});
subscriptionSchema.index({ userId: 1, channelId: 1 }, { unique: true });
const Subscription = mongoose.model('Subscription', subscriptionSchema);

const onlineUsers = new Map(); 

const joinParticipantsToChat = (chat, userIds) => {
    userIds.forEach(p => {
        const socketId = onlineUsers.get(p);
        if (socketId) {
            const socket = io.sockets.sockets.get(socketId);
            if (socket) socket.join(chat._id.toString());
        }
    });
};

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

// Routes
app.post('/api/upload', authenticate, upload.single('file'), (req, res) => {
    if(!req.file) return res.status(400).json({error: 'No file uploaded'});
    const protocol = req.protocol;
    const host = req.get('host');
    const forwardedProto = req.get('x-forwarded-proto');
    const proto = forwardedProto ? forwardedProto : protocol;
    const cleanHost = host.endsWith('/') ? host.slice(0, -1) : host;
    
    const fileUrl = `${proto}://${cleanHost}/uploads/${req.file.filename}`;
    res.json({ url: fileUrl });
});

// Auth & User Routes
app.get('/api/me', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(mapUser(user));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/register', async (req, res) => {
  try {
    // Check Registration Toggle
    const regConfig = await SystemConfig.findOne({ key: 'registrationEnabled' });
    if (regConfig && regConfig.value === false) {
        return res.status(403).json({ error: 'Registration is currently disabled by administrator.' });
    }

    const { username, password } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Invalid input' });
    if (username.length < 3 || password.length < 6) return res.status(400).json({ error: 'Credentials too short' });

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
    const updates = req.body;
    delete updates.passwordHash;
    delete updates.isAdmin; 
    delete updates._id;

    const user = await User.findByIdAndUpdate(req.userId, updates, { new: true });
    res.json(mapUser(user));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/users/wallpaper/:chatId', authenticate, async (req, res) => {
    try {
        const { wallpaper } = req.body;
        const user = await User.findById(req.userId);
        if(!user.settings.chatWallpapers) user.settings.chatWallpapers = new Map();
        
        user.settings.chatWallpapers.set(req.params.chatId, req.body.wallpaper);
        await user.save();
        res.json(mapUser(user));
    } catch(e) {
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
    if(!query || typeof query !== 'string') return res.json([]);
    const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const users = await User.find({ username: { $regex: safeQuery, $options: 'i' } }).limit(10);
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

// --- System Config Routes (Admin Only) ---
app.get('/api/system/config', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user?.isAdmin) return res.status(403).json({ error: "Admin only" });
        
        const reg = await SystemConfig.findOne({ key: 'registrationEnabled' });
        res.json({ registrationEnabled: reg ? reg.value : true });
    } catch(e) { res.status(500).json({error: e.message}); }
});

app.post('/api/system/config/registration', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user?.isAdmin) return res.status(403).json({ error: "Admin only" });
        
        const { enabled } = req.body;
        await SystemConfig.findOneAndUpdate(
            { key: 'registrationEnabled' }, 
            { key: 'registrationEnabled', value: enabled }, 
            { upsert: true, new: true }
        );
        res.json({ success: true, registrationEnabled: enabled });
    } catch(e) { res.status(500).json({error: e.message}); }
});

// Chats & Channels
app.get('/api/chats', authenticate, async (req, res) => {
    try {
        const chats = await Chat.find({ participants: req.userId, type: { $ne: 'channel' } });
        const subs = await Subscription.find({ userId: req.userId });
        const channelIds = subs.map(s => s.channelId);
        const channels = await Chat.find({ _id: { $in: channelIds } });

        const allChats = [...chats, ...channels].map(c => {
            const obj = c.toObject();
            obj.id = c._id;
            obj.unreadCount = c.unreadCounts.get(req.userId) || 0;
            if (c.type === 'channel') {
                obj.participants = [req.userId]; 
            }
            return obj;
        });
        res.json(allChats);
    } catch(e) { res.status(500).json({error: e.message}); }
});

app.post('/api/chats', authenticate, async (req, res) => {
    const { peerId } = req.body;
    let chat = await Chat.findOne({ participants: { $all: [req.userId, peerId] }, type: 'private' });
    if (!chat) {
        chat = new Chat({ participants: [req.userId, peerId], unreadCounts: { [req.userId]: 0, [peerId]: 0 } });
        await chat.save();
        joinParticipantsToChat(chat, [req.userId, peerId]);
    }
    res.json({ id: chat._id, ...chat.toObject() });
});

app.post('/api/chats/:id/clear', authenticate, async (req, res) => {
    try {
        const chat = await Chat.findById(req.params.id);
        if(!chat) return res.status(404).json({error: 'Chat not found'});
        
        // Security: Ensure user is participant
        if(chat.type !== 'channel' && !chat.participants.includes(req.userId)) return res.status(403).json({error: 'Access denied'});
        if(chat.type === 'channel' && !chat.adminIds.includes(req.userId)) return res.status(403).json({error: 'Admin only'});

        // Delete all messages in this chat
        await Message.deleteMany({ chatId: req.params.id });
        
        // Emit clear event
        io.to(req.params.id).emit('chat_cleared', { chatId: req.params.id });
        
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({error: e.message});
    }
});

app.post('/api/groups', authenticate, async (req, res) => {
    const { name, participants, avatar } = req.body;
    const all = [...new Set([...participants, req.userId])];
    const chat = new Chat({ type: 'group', name, participants: all, adminIds: [req.userId], avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${name}`, unreadCounts: Object.fromEntries(all.map(p => [p, 0])) });
    await chat.save();
    joinParticipantsToChat(chat, all);
    res.json({ id: chat._id, ...chat.toObject() });
});

// CHANNELS
app.post('/api/channels', authenticate, async (req, res) => {
    const { name, description, avatar } = req.body;
    const chat = new Chat({
        type: 'channel', name, description,
        avatar: avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${name}`,
        adminIds: [req.userId],
        participants: [],
        unreadCounts: { [req.userId]: 0 },
        subscriberCount: 1
    });
    await chat.save();
    
    await new Subscription({ userId: req.userId, channelId: chat._id.toString() }).save();
    
    const socketId = onlineUsers.get(req.userId);
    if(socketId) io.sockets.sockets.get(socketId)?.join(chat._id.toString());

    const chatObj = chat.toObject();
    chatObj.participants = [req.userId]; 
    res.json({ id: chat._id, ...chatObj });
});

app.get('/api/channels/search', authenticate, async (req, res) => {
    const safeQuery = req.query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const channels = await Chat.find({ type: 'channel', name: { $regex: safeQuery, $options: 'i' } }).limit(20);
    res.json(channels.map(c => ({ id: c._id, ...c.toObject(), participants: [] })));
});

app.post('/api/channels/:id/subscribe', authenticate, async (req, res) => {
    try {
        const channelId = req.params.id;
        const chat = await Chat.findById(channelId);
        if(!chat || chat.type !== 'channel') return res.status(404).json({error: 'Channel not found'});
        
        const exists = await Subscription.findOne({ userId: req.userId, channelId });
        if(!exists) {
            await new Subscription({ userId: req.userId, channelId }).save();
            await Chat.findByIdAndUpdate(channelId, { $inc: { subscriberCount: 1 } });
            
            const socketId = onlineUsers.get(req.userId);
            if(socketId) io.sockets.sockets.get(socketId)?.join(channelId);
        }
        
        const chatObj = chat.toObject();
        chatObj.id = chat._id;
        chatObj.participants = [req.userId]; 
        res.json(chatObj);
    } catch(e) {
        res.status(500).json({error: e.message});
    }
});

app.post('/api/channels/:id/unsubscribe', authenticate, async (req, res) => {
    try {
        const sub = await Subscription.findOneAndDelete({ userId: req.userId, channelId: req.params.id });
        if (sub) {
            await Chat.findByIdAndUpdate(req.params.id, { $inc: { subscriberCount: -1 } });
            const socketId = onlineUsers.get(req.userId);
            if(socketId) io.sockets.sockets.get(socketId)?.leave(req.params.id);
        }
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({error: e.message});
    }
});

app.get('/api/chats/:id/messages', authenticate, async (req, res) => {
    const messages = await Message.find({ chatId: req.params.id }).sort({ timestamp: 1 }).limit(500);
    res.json(messages.map(m => ({ id: m._id, ...m.toObject() })));
});

app.post('/api/chats/:id/read', authenticate, async (req, res) => {
    const chat = await Chat.findById(req.params.id);
    if(chat) {
        chat.unreadCounts.set(req.userId, 0);
        await chat.save();
        if (chat.type !== 'channel') {
             io.to(req.params.id).emit('messages_read', { chatId: req.params.id, userId: req.userId });
        }
    }
    res.json({ success: true });
});

app.delete('/api/messages/:id', authenticate, async (req, res) => {
    try {
        const msg = await Message.findById(req.params.id);
        if(msg && msg.senderId === req.userId) {
             await Message.findByIdAndDelete(req.params.id);
             io.to(msg.chatId).emit('message_deleted', { chatId: msg.chatId, messageId: req.params.id });
             res.json({ success: true });
        } else {
            res.status(403).json({ error: 'Not allowed' });
        }
    } catch(e) {
        res.status(500).json({error: e.message});
    }
});

// Socket Logic
io.use((socket, next) => {
  try {
    const decoded = jwt.verify(socket.handshake.auth.token, JWT_SECRET);
    socket.userId = decoded.userId;
    next();
  } catch (err) { next(new Error("Auth error")); }
});

io.on('connection', async (socket) => {
  const userId = socket.userId;
  onlineUsers.set(userId, socket.id);
  socket.join(userId);
  
  User.findByIdAndUpdate(userId, { isOnline: true }).exec();
  io.emit('user_status', { userId, isOnline: true });

  const chats = await Chat.find({ participants: userId, type: { $ne: 'channel' } });
  chats.forEach(c => socket.join(c._id.toString()));
  
  const subs = await Subscription.find({ userId });
  subs.forEach(s => socket.join(s.channelId));

  socket.on('disconnect', () => {
      onlineUsers.delete(userId);
      User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: Date.now() }).exec();
      io.emit('user_status', { userId, isOnline: false, lastSeen: Date.now() });
  });

  socket.on('join_chat', (chatId) => {
    if(typeof chatId === 'string') socket.join(chatId);
  });

  socket.on('typing', ({ chatId, isTyping }) => {
    socket.to(chatId).emit('typing', { userId, chatId, isTyping });
  });

  socket.on('send_message', async (msgData) => {
      try {
          const chat = await Chat.findById(msgData.chatId);
          if(!chat) return;
          if (chat.type === 'channel' && !chat.adminIds.includes(userId)) return;

          const msg = new Message({
              _id: msgData.id, 
              chatId: msgData.chatId, senderId: userId, 
              content: msgData.content, type: msgData.type, 
              mediaUrl: msgData.mediaUrl, replyTo: msgData.replyTo, status: 'sent'
          });
          await msg.save();
          
          chat.lastMessage = msg;
          if (chat.type !== 'channel') {
              chat.participants.forEach(p => { if(p!==userId) chat.unreadCounts.set(p, (chat.unreadCounts.get(p)||0)+1); });
          }
          await chat.save();

          const payload = { id: msg._id, ...msg.toObject() };
          io.to(msgData.chatId).emit('new_message', payload);
          
          if (chat) {
              chat.participants.forEach(p => {
                  io.to(p).emit('chat_updated', { chatId: chat._id, lastMessage: payload, unreadCount: chat.unreadCounts.get(p) });
              });
          }
      } catch(e) { console.error(e); }
  });
  
  socket.on('signal', (data) => {
      io.to(data.targetId).emit('signal', {
          senderId: userId,
          signal: data.signal
      });
  });

  // Handle Call Termination correctly
  socket.on('end_call', (data) => {
      // data.targetId is the peer ID or chat ID depending on call type
      // For 1-1 calls, just emit to the peer
      io.to(data.targetId).emit('call_ended', { userId });
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
    settings: u.settings,
    isAdmin: u.isAdmin
  };
}

mongoose.connect(MONGO_URI).then(() => {
    // Ensure config exists
    SystemConfig.findOne({ key: 'registrationEnabled' }).then(conf => {
        if (!conf) new SystemConfig({ key: 'registrationEnabled', value: true }).save();
    });
    server.listen(PORT, () => console.log(`Server running on ${PORT}`));
});
