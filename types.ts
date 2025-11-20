
export interface UserSettings {
  notifications: boolean;
  soundEnabled: boolean;
  privacyMode: boolean; // e.g., Hide Last Seen
  theme: 'light' | 'dark';
  chatWallpaper: string; // hex color or predefined pattern id
  fontSize: 'small' | 'medium' | 'large';
  language: 'en' | 'ru'; // New field
}

export interface User {
  id: string;
  username: string;
  passwordHash: string; // In a real app, never store this client side. This is for the mock DB.
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
  content: string; // Decrypted preview or media type text
  type: 'text' | 'image' | 'video' | 'audio';
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  content: string; // Encrypted content
  type: 'text' | 'image' | 'video' | 'audio';
  timestamp: number;
  status: 'sent' | 'delivered' | 'read';
  mediaUrl?: string; // Blob URL
  mediaSize?: number;
  replyTo?: ReplyInfo; // New field for replies
}

export interface Chat {
  id: string;
  type: 'private' | 'group';
  participants: string[];
  name?: string; // For groups
  avatar?: string; // For groups
  adminIds?: string[]; // For groups
  lastMessage?: Message;
  unreadCount: number;
  draft?: string;
  pinnedBy?: string[]; // Array of user IDs who pinned this chat
}

export interface CallSession {
  id: string;
  callerId: string;
  receiverId: string; // or groupId
  startTime?: number;
  status: 'ringing' | 'connected' | 'ended';
  isVideo: boolean;
  isMuted: boolean;
  offerSignal?: any;
}

export interface CallLog {
    id: string;
    peerId: string; // Who you spoke with
    peerName: string;
    peerAvatar?: string;
    direction: 'incoming' | 'outgoing';
    type: 'audio' | 'video';
    status: 'missed' | 'completed';
    timestamp: number;
    duration: number; // in seconds
}

export interface Contact {
  id: string;
  username: string;
  isOnline: boolean;
}
