
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
  'http://localhost:4173'
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

// 1. Helmet with customized CSP for WebRTC and Media
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false, // Disable CSP header here, let Nginx or Frontend handle specifics if needed, or configure strictly
}));

// 2. Data Sanitization against NoSQL Injection
app.use(mongoSanitize());

// 3. Data Sanitization against XSS
app.use(xss());

// 4. Body Parser Limit
app.use(express.json({ limit: '1mb' })); 

// 5. Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Higher limit for chat apps polling/media
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50,
    message: "Too many login attempts, please try again later"
});
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

// Static Files
app.use('/uploads', express.static(UPLOAD_DIR));

// Multer Setup - SECURE FILENAMES
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, UPLOAD_DIR)
    },
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname) || '.bin';
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, uniqueSuffix + ext);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB Max Server Side
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'video/mp4', 'video/webm', 'video/ogg',
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
    language: { type: String, default: 'en' }
  }
});
const User = mongoose.model('User', userSchema);

const messageSchema = new mongoose.Schema({
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
  participants: [{ type: String, required: true }], 
  type: { type: String, default: 'private', enum: ['private', 'group'] },
  name: { type: String }, 
  avatar: { type: String }, 
  adminIds: [{ type: String }], 
  lastMessage: { type: mongoose.Schema.Types.Mixed },
  unreadCounts: { type: Map, of: Number, default: {} }, 
  pinnedBy: [{ type: String }]
});
const Chat = mongoose.model('Chat', chatSchema);

// --- Socket Helpers ---
const onlineUsers = new Map(); 

const joinParticipantsToChat = (chat) => {
    chat.participants.forEach(p => {
        const socketId = onlineUsers.get(p);
        if (socketId) {
            const socket = io.sockets.sockets.get(socketId);
            if (socket) socket.join(chat._id.toString());
        }
    });
};

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

const adminOnly = async (req, res, next) => {
    try {
        const user = await User.findById(req.userId);
        if(!user || !user.isAdmin) return res.status(403).json({ error: 'Admin access required' });
        next();
    } catch(e) {
        res.status(500).json({ error: 'Server Error' });
    }
}

// --- Routes ---

app.post('/api/upload', authenticate, upload.single('file'), (req, res) => {
    if(!req.file) return res.status(400).json({error: 'No file uploaded'});
    
    const protocol = req.protocol;
    const host = req.get('host');
    const forwardedProto = req.get('x-forwarded-proto');
    const proto = forwardedProto ? forwardedProto : protocol;
    
    // Ensure we don't get double slash if host ends with /
    const cleanHost = host.endsWith('/') ? host.slice(0, -1) : host;
    
    const fileUrl = `${proto}://${cleanHost}/uploads/${req.file.filename}`;
    res.json({ url: fileUrl });
});

app.post('/api/register', async (req, res) => {
  try {
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
        
        user.settings.chatWallpapers.set(req.params.chatId, wallpaper);
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

// Admin Routes
app.get('/api/admin/stats', authenticate, adminOnly, async (req, res) => {
    try {
        const users = await User.countDocuments();
        const messages = await Message.countDocuments();
        const chats = await Chat.countDocuments();
        let uploadSize = 0;
        if(fs.existsSync(UPLOAD_DIR)) {
             const files = fs.readdirSync(UPLOAD_DIR);
             files.forEach(file => {
                 const stats = fs.statSync(path.join(UPLOAD_DIR, file));
                 uploadSize += stats.size;
             });
        }
        res.json({ users, messages, chats, uploadSize });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/admin/users', authenticate, adminOnly, async (req, res) => {
    try {
        const users = await User.find({}, '-passwordHash').sort({ lastSeen: -1 }).limit(50);
        res.json(users.map(mapUser));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/admin/users/:id', authenticate, adminOnly, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        await Message.deleteMany({ senderId: req.params.id });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/users/:id/toggle-admin', authenticate, adminOnly, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        user.isAdmin = !user.isAdmin;
        await user.save();
        res.json(mapUser(user));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Group Routes
app.post('/api/groups', authenticate, async (req, res) => {
    try {
        const { name, participants, avatar } = req.body;
        const allParticipants = [...new Set([...participants, req.userId])];
        const chat = new Chat({
            type: 'group',
            name,
            avatar: avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${name}`,
            participants: allParticipants,
            adminIds: [req.userId],
            unreadCounts: Object.fromEntries(allParticipants.map(p => [p, 0]))
        });
        await chat.save();
        joinParticipantsToChat(chat); 
        res.json(chat);
    } catch(e) {
        res.status(500).json({error: e.message});
    }
});

app.put('/api/groups/:id', authenticate, async (req, res) => {
    try {
        const chat = await Chat.findById(req.params.id);
        if(!chat || chat.type !== 'group' || !chat.adminIds.includes(req.userId)) return res.status(403).json({error: 'Access denied'});
        const { name, avatar } = req.body;
        if(name) chat.name = name;
        if(avatar) chat.avatar = avatar;
        await chat.save();
        res.json(chat);
    } catch(e) {
        res.status(500).json({error: e.message});
    }
});

app.post('/api/groups/:id/add', authenticate, async (req, res) => {
    try {
        const { userIds } = req.body;
        const chat = await Chat.findById(req.params.id);
        if(!chat || chat.type !== 'group' || !chat.adminIds.includes(req.userId)) return res.status(403).json({error: 'Access denied'});
        const newMembers = userIds.filter(id => !chat.participants.includes(id));
        if(newMembers.length > 0) {
            chat.participants.push(...newMembers);
            newMembers.forEach(id => chat.unreadCounts.set(id, 0));
            await chat.save();
            newMembers.forEach(id => {
                const socketId = onlineUsers.get(id);
                if (socketId) io.sockets.sockets.get(socketId)?.join(chat._id.toString());
            });
        }
        res.json(chat);
    } catch(e) {
         res.status(500).json({error: e.message});
    }
});

app.post('/api/groups/:id/remove', authenticate, async (req, res) => {
     try {
        const { userIdToRemove } = req.body;
        const chat = await Chat.findById(req.params.id);
        if(!chat || chat.type !== 'group' || !chat.adminIds.includes(req.userId)) return res.status(403).json({error: 'Access denied'});
        chat.participants = chat.participants.filter(p => p !== userIdToRemove);
        chat.adminIds = chat.adminIds.filter(p => p !== userIdToRemove);
        await chat.save();
        const socketId = onlineUsers.get(userIdToRemove);
        if (socketId) io.sockets.sockets.get(socketId)?.leave(chat._id.toString());
        res.json(chat);
     } catch(e) {
         res.status(500).json({error: e.message});
     }
});

app.post('/api/groups/:id/leave', authenticate, async (req, res) => {
    try {
        const chat = await Chat.findById(req.params.id);
        if(!chat || chat.type !== 'group') return res.status(404).json({error: 'Group not found'});
        chat.participants = chat.participants.filter(p => p !== req.userId);
        chat.adminIds = chat.adminIds.filter(p => p !== req.userId);
        await chat.save();
        res.json({success: true});
    } catch(e) {
        res.status(500).json({error: e.message});
    }
});

app.get('/api/chats', authenticate, async (req, res) => {
  try {
    const chats = await Chat.find({ participants: req.userId });
    const mappedChats = chats.map(c => ({
      id: c._id,
      participants: c.participants,
      type: c.type,
      name: c.name,
      avatar: c.avatar,
      adminIds: c.adminIds,
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
      joinParticipantsToChat(chat);
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
        const index = chat.pinnedBy.indexOf(req.userId);
        if(index === -1) chat.pinnedBy.push(req.userId);
        else chat.pinnedBy.splice(index, 1);
        await chat.save();
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({error: e.message});
    }
});

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
        io.to(req.params.id).emit('messages_read', { chatId: req.params.id, userId: req.userId });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
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

// Socket IO
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication error: Token required"));
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.userId; 
    next();
  } catch (err) {
    next(new Error("Authentication error: Invalid token"));
  }
});

io.on('connection', (socket) => {
  const userId = socket.userId; 
  onlineUsers.set(userId, socket.id);
  socket.join(userId);
  
  User.findByIdAndUpdate(userId, { isOnline: true }).exec();
  io.emit('user_status', { userId, isOnline: true });

  Chat.find({ participants: userId }).then(chats => {
      chats.forEach(c => socket.join(c._id.toString()));
  });

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
      const msg = new Message({
        chatId: msgData.chatId,
        senderId: userId, 
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

  // Group Video Call Logic
  socket.on('join_call_room', ({ chatId }) => {
      socket.join(`call_${chatId}`);
      socket.to(`call_${chatId}`).emit('user_joined_call', { userId: socket.userId });
  });

  socket.on('leave_call_room', ({ chatId }) => {
      socket.leave(`call_${chatId}`);
      socket.to(`call_${chatId}`).emit('user_left_call', { userId: socket.userId });
  });

  socket.on('signal', (data) => {
      io.to(data.targetId).emit('signal', {
          senderId: socket.userId,
          signal: data.signal
      });
  });

  // Legacy support
  socket.on('call_offer', (data) => {
      io.to(data.targetId).emit('call_offer', { offer: data.offer, callerId: userId });
  });
  socket.on('call_answer', (data) => {
      io.to(data.targetId).emit('call_answer', { answer: data.answer, responderId: userId });
  });
  socket.on('ice_candidate', (data) => {
      io.to(data.targetId).emit('ice_candidate', { candidate: data.candidate, senderId: userId });
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

mongoose.connect(MONGO_URI)
  .then(() => {
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => console.error(err));
