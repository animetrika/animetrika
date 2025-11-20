
import { User, Chat, Message, CallLog } from '../types';
import { api, connectSocket, getSocket, disconnectSocket } from './api';

// ENABLE REAL BACKEND
const USE_BACKEND = true; 

// --- User Auth ---

export const registerUser = async (username: string, password: string): Promise<User> => {
    if (USE_BACKEND) {
        const res = await api.post('/register', { username, password });
        localStorage.setItem('auth_token', res.data.token);
        // Save user ID to help api.ts re-connect
        localStorage.setItem('user_id', res.data.user.id);
        connectSocket(res.data.token);
        return res.data.user;
    } else {
        // Legacy LocalStorage Mock
        const users: User[] = JSON.parse(localStorage.getItem('users') || '[]');
        if (users.find(u => u.username === username)) throw new Error("Username already exists");
        // Simple hash for mock
        const newUser: User = {
            id: crypto.randomUUID(),
            username,
            passwordHash: password, // Insecure mock
            isOnline: true,
            lastSeen: Date.now(),
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
            status: "Hey there! I am using Animetrika.",
            blockedUsers: [],
            settings: { notifications: true, soundEnabled: true, privacyMode: false, theme: 'dark', chatWallpaper: 'default', fontSize: 'medium' },
            publicKey: 'mock-key-' + crypto.randomUUID()
        };
        users.push(newUser);
        localStorage.setItem('users', JSON.stringify(users));
        return newUser;
    }
};

export const loginUser = async (username: string, password: string): Promise<User> => {
    if (USE_BACKEND) {
        const res = await api.post('/login', { username, password });
        localStorage.setItem('auth_token', res.data.token);
        localStorage.setItem('user_id', res.data.user.id);
        connectSocket(res.data.token);
        return res.data.user;
    } else {
        const users: User[] = JSON.parse(localStorage.getItem('users') || '[]');
        const user = users.find(u => u.username === username && u.passwordHash === password); // Mock compare
        if (!user) throw new Error("Invalid credentials");
        return user;
    }
};

export const updateUser = async (userId: string, updates: Partial<User>): Promise<User> => {
    if (USE_BACKEND) {
        const res = await api.post('/users/update', updates);
        return res.data;
    } else {
        const users: User[] = JSON.parse(localStorage.getItem('users') || '[]');
        const idx = users.findIndex(u => u.id === userId);
        if (idx === -1) throw new Error("User not found");
        users[idx] = { ...users[idx], ...updates };
        localStorage.setItem('users', JSON.stringify(users));
        return users[idx];
    }
};

export const searchUsers = async (query: string): Promise<User[]> => {
    if (USE_BACKEND) {
        const res = await api.get(`/users/search?q=${query}`);
        return res.data;
    } else {
        const users: User[] = JSON.parse(localStorage.getItem('users') || '[]');
        return users.filter(u => u.username.toLowerCase().includes(query.toLowerCase()));
    }
};

export const getUsersByIds = async (ids: string[]): Promise<User[]> => {
    if (USE_BACKEND) {
        const res = await api.post('/users/bulk', { ids });
        return res.data;
    } else {
        const users: User[] = JSON.parse(localStorage.getItem('users') || '[]');
        return users.filter(u => ids.includes(u.id));
    }
};

// --- Chats ---

export const getChats = async (userId: string): Promise<Chat[]> => {
    if (USE_BACKEND) {
        const res = await api.get('/chats');
        return res.data;
    } else {
        const allChats: Chat[] = JSON.parse(localStorage.getItem('chats') || '[]');
        return allChats.filter(c => c.participants.includes(userId));
    }
};

export const createChat = async (userId: string, peerId: string): Promise<Chat> => {
    if (USE_BACKEND) {
        const res = await api.post('/chats', { peerId });
        return res.data;
    } else {
        const allChats: Chat[] = JSON.parse(localStorage.getItem('chats') || '[]');
        const existing = allChats.find(c => c.participants.includes(userId) && c.participants.includes(peerId));
        if (existing) return existing;
        const newChat = {
            id: crypto.randomUUID(),
            type: 'private',
            participants: [userId, peerId],
            unreadCount: 0,
            pinnedBy: []
        } as Chat;
        allChats.push(newChat);
        localStorage.setItem('chats', JSON.stringify(allChats));
        return newChat;
    }
};

export const getMessages = async (chatId: string): Promise<Message[]> => {
    if (USE_BACKEND) {
        const res = await api.get(`/chats/${chatId}/messages`);
        return res.data;
    } else {
        return JSON.parse(localStorage.getItem(`messages_${chatId}`) || '[]');
    }
};

export const sendMessage = async (message: Message): Promise<Message> => {
    if (USE_BACKEND) {
        const socket = getSocket();
        if (socket && socket.connected) {
            socket.emit('send_message', message);
            return message; // Optimistic return
        } else {
             throw new Error("Connection lost");
        }
    } else {
        const key = `messages_${message.chatId}`;
        const msgs = JSON.parse(localStorage.getItem(key) || '[]');
        msgs.push(message);
        localStorage.setItem(key, JSON.stringify(msgs));
        
        // update chat
        const chats: Chat[] = JSON.parse(localStorage.getItem('chats') || '[]');
        const c = chats.find(ch => ch.id === message.chatId);
        if(c) {
            c.lastMessage = message;
            c.unreadCount = (c.unreadCount || 0) + 1;
            localStorage.setItem('chats', JSON.stringify(chats));
        }
        return message;
    }
};

export const markMessagesAsRead = async (chatId: string, userId: string) => {
    if (USE_BACKEND) {
        await api.post(`/chats/${chatId}/read`);
    } else {
        // Mock implementation
        const chats: Chat[] = JSON.parse(localStorage.getItem('chats') || '[]');
        const c = chats.find(ch => ch.id === chatId);
        if(c) {
            c.unreadCount = 0;
            localStorage.setItem('chats', JSON.stringify(chats));
        }
    }
};

export const deleteMessage = async (chatId: string, msgId: string) => {
    if (USE_BACKEND) {
        await api.delete(`/messages/${msgId}`);
    } else {
        const key = `messages_${chatId}`;
        let msgs = JSON.parse(localStorage.getItem(key) || '[]');
        msgs = msgs.filter((m: any) => m.id !== msgId);
        localStorage.setItem(key, JSON.stringify(msgs));
    }
};

export const togglePinChat = async (chatId: string, userId: string): Promise<Chat[]> => {
    if (USE_BACKEND) {
        await api.post(`/chats/${chatId}/pin`);
        return getChats(userId);
    } else {
        const chats: Chat[] = JSON.parse(localStorage.getItem('chats') || '[]');
        const c = chats.find(ch => ch.id === chatId);
        if(c) {
            c.pinnedBy = c.pinnedBy || [];
            if(c.pinnedBy.includes(userId)) c.pinnedBy = c.pinnedBy.filter((id: string) => id !== userId);
            else c.pinnedBy.push(userId);
            localStorage.setItem('chats', JSON.stringify(chats));
        }
        return getChats(userId);
    }
};

export const toggleBlockUser = async (userId: string, targetId: string): Promise<User> => {
    if (USE_BACKEND) {
        // The API endpoint handles logic based on authenticated user (userId in token)
        const res = await api.post(`/users/block`, { targetId });
        return res.data;
    } else {
        const users: User[] = JSON.parse(localStorage.getItem('users') || '[]');
        const u = users.find(user => user.id === userId);
        if(u) {
            u.blockedUsers = u.blockedUsers || [];
            if(u.blockedUsers.includes(targetId)) u.blockedUsers = u.blockedUsers.filter(id => id !== targetId);
            else u.blockedUsers.push(targetId);
            localStorage.setItem('users', JSON.stringify(users));
            return u;
        }
        throw new Error("User not found");
    }
}

// --- Socket Helpers ---
export const setTyping = (chatId: string, userId: string, isTyping: boolean) => {
    if (USE_BACKEND) {
        const socket = getSocket();
        if (socket) socket.emit('typing', { chatId, isTyping });
    } else {
        const key = `typing_${chatId}`;
        let data = JSON.parse(localStorage.getItem(key) || '{}');
        if (isTyping) data[userId] = Date.now();
        else delete data[userId];
        localStorage.setItem(key, JSON.stringify(data));
    }
};

export const getTypingUsers = (chatId: string): string[] => {
    if (USE_BACKEND) return []; // Handled by event listener in App.tsx
    const key = `typing_${chatId}`;
    const data = JSON.parse(localStorage.getItem(key) || '{}');
    const now = Date.now();
    return Object.keys(data).filter(id => now - data[id] < 3000);
};

// --- Call History (Local Only for simplicity or API) ---
export const getCallHistory = (userId: string): CallLog[] => {
    // We'll stick to local storage for call logs in this demo as per original spec
    // to avoid overcomplicating the backend schema further in this step
    return JSON.parse(localStorage.getItem(`calls_${userId}`) || '[]');
};

export const addCallLog = (userId: string, log: CallLog) => {
    const logs = getCallHistory(userId);
    logs.unshift(log);
    localStorage.setItem(`calls_${userId}`, JSON.stringify(logs));
};
