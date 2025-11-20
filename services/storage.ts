
import { User, Chat, Message, CallLog } from '../types';
import { api, connectSocket, getSocket, disconnectSocket } from './api';

// ENABLE REAL BACKEND
const USE_BACKEND = true; 

// --- Media Optimization Helpers ---

// Client-side compression to save bandwidth and speed up uploads
const compressImage = async (file: File): Promise<File> => {
    if (!file.type.startsWith('image/')) return file;
    // Skip small files
    if (file.size < 1024 * 1024) return file; 

    return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();
        reader.onload = (e) => { img.src = e.target?.result as string; };
        reader.onerror = reject;
        
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const MAX_SIZE = 1920; // Max dimension

            if (width > height) {
                if (width > MAX_SIZE) {
                    height *= MAX_SIZE / width;
                    width = MAX_SIZE;
                }
            } else {
                if (height > MAX_SIZE) {
                    width *= MAX_SIZE / height;
                    height = MAX_SIZE;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);

            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(new File([blob], file.name, { type: 'image/jpeg' }));
                } else {
                    reject(new Error("Compression failed"));
                }
            }, 'image/jpeg', 0.8); // 80% quality
        };
        
        reader.readAsDataURL(file);
    });
};

// --- User Auth ---

export const registerUser = async (username: string, password: string): Promise<User> => {
    if (USE_BACKEND) {
        const res = await api.post('/register', { username, password });
        localStorage.setItem('auth_token', res.data.token);
        localStorage.setItem('user_id', res.data.user.id);
        connectSocket(res.data.token);
        return res.data.user;
    } else {
        throw new Error("Local mock disabled");
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
        throw new Error("Local mock disabled");
    }
};

export const updateUser = async (userId: string, updates: Partial<User>): Promise<User> => {
    const res = await api.post('/users/update', updates);
    return res.data;
};

export const setChatWallpaper = async (chatId: string, wallpaper: string): Promise<User> => {
    const res = await api.post(`/users/wallpaper/${chatId}`, { wallpaper });
    return res.data;
};

export const searchUsers = async (query: string): Promise<User[]> => {
    const res = await api.get(`/users/search?q=${encodeURIComponent(query)}`);
    return res.data;
};

export const getUsersByIds = async (ids: string[]): Promise<User[]> => {
    const res = await api.post('/users/bulk', { ids });
    return res.data;
};

// --- Chats ---

export const getChats = async (userId: string): Promise<Chat[]> => {
    const res = await api.get('/chats');
    return res.data;
};

export const createChat = async (userId: string, peerId: string): Promise<Chat> => {
    const res = await api.post('/chats', { peerId });
    return res.data;
};

// Group Chat Functions
export const createGroup = async (name: string, participants: string[], avatar?: string): Promise<Chat> => {
    const res = await api.post('/groups', { name, participants, avatar });
    return res.data;
};

export const updateGroupInfo = async (chatId: string, name?: string, avatar?: string): Promise<Chat> => {
    const res = await api.put(`/groups/${chatId}`, { name, avatar });
    return res.data;
};

export const addGroupMembers = async (chatId: string, userIds: string[]): Promise<Chat> => {
    const res = await api.post(`/groups/${chatId}/add`, { userIds });
    return res.data;
};

export const removeGroupMember = async (chatId: string, userIdToRemove: string): Promise<Chat> => {
    const res = await api.post(`/groups/${chatId}/remove`, { userIdToRemove });
    return res.data;
};

export const leaveGroup = async (chatId: string): Promise<void> => {
    await api.post(`/groups/${chatId}/leave`);
};

// Channel Functions
export const createChannel = async (name: string, description: string, avatar?: string): Promise<Chat> => {
    const res = await api.post('/channels', { name, description, avatar });
    return res.data;
};

export const searchChannels = async (query: string): Promise<Chat[]> => {
    const res = await api.get(`/channels/search?q=${encodeURIComponent(query)}`);
    return res.data;
};

export const subscribeChannel = async (channelId: string): Promise<Chat> => {
    const res = await api.post(`/channels/${channelId}/subscribe`);
    return res.data;
};

export const unsubscribeChannel = async (channelId: string): Promise<void> => {
    await api.post(`/channels/${channelId}/unsubscribe`);
};


export const getMessages = async (chatId: string): Promise<Message[]> => {
    const res = await api.get(`/chats/${chatId}/messages`);
    return res.data;
};

export const uploadMedia = async (file: File, onProgress?: (percent: number) => void): Promise<string> => {
    const compressedFile = await compressImage(file);
    const formData = new FormData();
    formData.append('file', compressedFile);
    
    const res = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
            if (onProgress && progressEvent.total) {
                const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                onProgress(percent);
            }
        }
    });
    return res.data.url;
}

export const sendMessage = async (message: Message): Promise<Message> => {
    const socket = getSocket();
    if (socket && socket.connected) {
        socket.emit('send_message', message);
        return message; 
    } else {
         throw new Error("Connection lost");
    }
};

export const markMessagesAsRead = async (chatId: string, userId: string) => {
    await api.post(`/chats/${chatId}/read`);
};

export const deleteMessage = async (chatId: string, msgId: string) => {
    await api.delete(`/messages/${msgId}`);
};

export const togglePinChat = async (chatId: string, userId: string): Promise<Chat[]> => {
    await api.post(`/chats/${chatId}/pin`);
    return getChats(userId);
};

export const toggleBlockUser = async (userId: string, targetId: string): Promise<User> => {
    const res = await api.post(`/users/block`, { targetId });
    return res.data;
}

// --- Socket Helpers ---
export const setTyping = (chatId: string, userId: string, isTyping: boolean) => {
    const socket = getSocket();
    if (socket) socket.emit('typing', { chatId, isTyping });
};

export const getTypingUsers = (chatId: string): string[] => {
    return []; // Handled by event listener in App.tsx
};

// --- Admin ---
export const getAdminStats = async () => {
    const res = await api.get('/admin/stats');
    return res.data;
};

export const getAdminUsers = async () => {
    const res = await api.get('/admin/users');
    return res.data;
};

export const deleteUserAdmin = async (id: string) => {
    await api.delete(`/admin/users/${id}`);
};

export const toggleAdminStatus = async (id: string) => {
    const res = await api.post(`/admin/users/${id}/toggle-admin`);
    return res.data;
};

// --- Call History ---
export const getCallHistory = (userId: string): CallLog[] => {
    return JSON.parse(localStorage.getItem(`calls_${userId}`) || '[]');
};

export const addCallLog = (userId: string, log: CallLog) => {
    const logs = getCallHistory(userId);
    logs.unshift(log);
    localStorage.setItem(`calls_${userId}`, JSON.stringify(logs));
};
