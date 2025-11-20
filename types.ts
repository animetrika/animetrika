
export interface UserSettings {
  notifications: boolean;
  soundEnabled: boolean;
  privacyMode: boolean;
  theme: 'light' | 'dark';
  chatWallpaper: string; // Global default
  chatWallpapers?: Record<string, string>; // Per-chat overrides
  fontSize: 'small' | 'medium' | 'large';
  language: 'en' | 'ru';
}

export interface User {
  id: string;
  username: string;
  passwordHash: string; 
  publicKey: string;
  avatar?: string;
  status?: string;
  isOnline: boolean;
  lastSeen: number;
  blockedUsers: string[];
  settings?: UserSettings;
  isAdmin?: boolean;
}

export interface ReplyInfo {
  id: string;
  senderId: string;
  senderName: string;
  content: string; 
  type: 'text' | 'image' | 'video' | 'audio';
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  content: string; 
  type: 'text' | 'image' | 'video' | 'audio';
  timestamp: number;
  status: 'sent' | 'delivered' | 'read';
  mediaUrl?: string; 
  mediaSize?: number;
  replyTo?: ReplyInfo; 
}

export interface Chat {
  id: string;
  type: 'private' | 'group' | 'channel';
  participants: string[];
  name?: string; 
  avatar?: string; 
  description?: string; 
  adminIds?: string[]; 
  lastMessage?: Message;
  unreadCount: number;
  draft?: string;
  pinnedBy?: string[]; 
}

export interface CallSession {
  id: string;
  chatId: string; // The room ID
  initiatorId: string;
  participants: string[]; // List of user IDs currently in call
  status: 'ringing' | 'connected' | 'ended';
  isVideo: boolean;
  isMuted: boolean;
  offerSignal?: any;
  callerId?: string; // Legacy support
  receiverId?: string; // Legacy support
}

export interface CallLog {
    id: string;
    peerId: string; 
    peerName: string;
    peerAvatar?: string;
    direction: 'incoming' | 'outgoing';
    type: 'audio' | 'video';
    status: 'missed' | 'completed';
    timestamp: number;
    duration: number; 
}

export interface Contact {
  id: string;
  username: string;
  isOnline: boolean;
}