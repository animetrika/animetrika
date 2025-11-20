
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  MessageCircle, Phone, Video, Search, Settings, LogOut, 
  Plus, Send, Mic, Smile, MoreVertical, 
  Trash2, Check, CheckCheck, X, Lock, Camera,
  ArrowUpRight, ArrowDownLeft, PhoneMissed, Moon, Sun, ShieldOff, ShieldCheck,
  Bell, Volume2, Eye, Wallpaper, Type, Play, Pause, StopCircle,
  Reply, Pin, PinOff, Image as ImageIcon
} from 'lucide-react';
import { User, Chat, Message, CallSession, CallLog, UserSettings, ReplyInfo } from './types';
import * as Storage from './services/storage';
import * as CryptoService from './services/cryptoService';
import { GEMINI_USER, isGeminiUser, getGeminiResponse } from './services/gemini';
import { CallModal } from './components/CallModal';
import { getSocket, connectSocket } from './services/api';

// --- Helper: Blob to Base64 ---
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// --- Helper: Date Utilities ---
const isSameDay = (ts1: number, ts2: number) => {
    const d1 = new Date(ts1);
    const d2 = new Date(ts2);
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
};

const formatDateSeparator = (ts: number) => {
    const date = new Date(ts);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (isSameDay(ts, today.getTime())) return "Today";
    if (isSameDay(ts, yesterday.getTime())) return "Yesterday";
    
    return date.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' });
};

// --- Components ---

// Lightbox Component
const Lightbox = ({ src, onClose }: { src: string, onClose: () => void }) => {
    return (
        <div 
            className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center animate-fade-in p-4"
            onClick={onClose}
        >
            <button onClick={onClose} className="absolute top-4 right-4 p-3 bg-white/10 rounded-full hover:bg-white/20 text-white transition-colors">
                <X size={24} />
            </button>
            <img 
                src={src} 
                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl animate-slide-up" 
                onClick={(e) => e.stopPropagation()}
            />
        </div>
    )
}

// M3 Switch Component
const Switch = ({ checked, onChange }: { checked: boolean, onChange: () => void }) => (
    <div 
        onClick={onChange} 
        className={`relative w-[52px] h-[32px] rounded-full cursor-pointer border-2 transition-colors duration-200 ${checked ? 'bg-primary-DEFAULT border-primary-DEFAULT dark:bg-primary-dark dark:border-primary-dark' : 'bg-surface-variant dark:bg-surface-darkContainer border-outline-light dark:border-outline-dark'}`}
    >
        <div className={`absolute top-[4px] left-[4px] w-[20px] h-[20px] bg-white dark:bg-surface-darkContainerHigh rounded-full transition-all duration-200 shadow-sm flex items-center justify-center ${checked ? 'translate-x-[20px] w-[20px] h-[20px] dark:bg-primary-onDark' : 'translate-x-0'}`}>
            {checked && <Check size={14} className="text-primary-DEFAULT dark:text-primary-dark" />}
        </div>
    </div>
);

// Audio Player Component
const AudioPlayer = ({ src }: { src: string }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const setAudioData = () => {
            if(!isNaN(audio.duration)) setDuration(audio.duration);
        };

        const updateProgress = () => {
            setProgress(audio.currentTime);
        };

        const onEnd = () => {
            setIsPlaying(false);
            setProgress(0);
        };

        audio.addEventListener('loadedmetadata', setAudioData);
        audio.addEventListener('timeupdate', updateProgress);
        audio.addEventListener('ended', onEnd);

        return () => {
            audio.removeEventListener('loadedmetadata', setAudioData);
            audio.removeEventListener('timeupdate', updateProgress);
            audio.removeEventListener('ended', onEnd);
        };
    }, []);

    const togglePlay = () => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
        } else {
            audioRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    const formatTime = (time: number) => {
        if (isNaN(time) || !isFinite(time)) return "0:00";
        const min = Math.floor(time / 60);
        const sec = Math.floor(time % 60);
        return `${min}:${sec.toString().padStart(2, '0')}`;
    };

    return (
        <div className="flex items-center gap-3 w-full min-w-[200px] max-w-[280px] p-1">
            <audio ref={audioRef} src={src} preload="metadata" />
            <button 
                onClick={togglePlay}
                className="w-10 h-10 rounded-full bg-primary-onContainer/10 dark:bg-white/10 flex items-center justify-center hover:bg-primary-onContainer/20 dark:hover:bg-white/20 transition-colors shrink-0"
            >
                {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
            </button>
            <div className="flex-1 flex flex-col justify-center gap-1">
                <input 
                    type="range" 
                    min={0} 
                    max={duration || 100} 
                    value={progress} 
                    onChange={(e) => {
                        const val = Number(e.target.value);
                        if (audioRef.current) audioRef.current.currentTime = val;
                        setProgress(val);
                    }}
                    className="w-full h-1 bg-primary-onContainer/20 dark:bg-white/30 rounded-full appearance-none cursor-pointer accent-primary-onContainer dark:accent-white"
                />
                <div className="flex justify-between text-[10px] opacity-70 font-medium px-0.5">
                    <span>{formatTime(progress)}</span>
                    <span>{formatTime(duration)}</span>
                </div>
            </div>
        </div>
    );
};

// --- Profile Modal ---
const ProfileModal = ({ user, onClose, onUpdate }: { user: User, onClose: () => void, onUpdate: (u: Partial<User>) => Promise<void> }) => {
    const [username, setUsername] = useState(user.username);
    const [status, setStatus] = useState(user.status || '');
    const [avatar, setAvatar] = useState(user.avatar || '');
    const [loading, setLoading] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                if(ev.target?.result) setAvatar(ev.target.result as string);
            }
            reader.readAsDataURL(e.target.files[0]);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            await onUpdate({ username, status, avatar });
            onClose();
        } catch (e) {
            alert("Failed to update profile");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
            <div className="bg-surface-lightContainerHigh dark:bg-surface-darkContainerHigh text-slate-900 dark:text-slate-100 p-6 rounded-3xl shadow-xl w-full max-w-sm relative animate-slide-up">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-normal">Edit Profile</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-surface-variant dark:hover:bg-surface-darkContainer transition-colors">
                        <X size={24} />
                    </button>
                </div>
                
                <div className="flex flex-col items-center mb-8">
                    <div className="relative group cursor-pointer">
                        <div className="w-28 h-28 rounded-full overflow-hidden shadow-md ring-4 ring-surface-light dark:ring-surface-dark">
                            <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
                        </div>
                        <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full cursor-pointer">
                            <Camera className="text-white" />
                            <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                        </label>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="relative">
                        <input 
                            type="text" 
                            value={username} 
                            onChange={e => setUsername(e.target.value)}
                            className="peer w-full bg-transparent border border-outline-light dark:border-outline-dark rounded-md px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-primary-DEFAULT dark:focus:border-primary-dark focus:ring-1 focus:ring-primary-DEFAULT dark:focus:ring-primary-dark transition-all placeholder-transparent"
                            placeholder="Username"
                            id="usernameInput"
                        />
                        <label htmlFor="usernameInput" className="absolute left-4 -top-2.5 bg-surface-lightContainerHigh dark:bg-surface-darkContainerHigh px-1 text-xs text-slate-500 transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-base peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-primary-DEFAULT dark:peer-focus:text-primary-dark">
                            Username
                        </label>
                    </div>
                    <div className="relative">
                        <input 
                            type="text" 
                            value={status} 
                            onChange={e => setStatus(e.target.value)}
                            className="peer w-full bg-transparent border border-outline-light dark:border-outline-dark rounded-md px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-primary-DEFAULT dark:focus:border-primary-dark focus:ring-1 focus:ring-primary-DEFAULT dark:focus:ring-primary-dark transition-all placeholder-transparent"
                            placeholder="Status"
                            id="statusInput"
                        />
                        <label htmlFor="statusInput" className="absolute left-4 -top-2.5 bg-surface-lightContainerHigh dark:bg-surface-darkContainerHigh px-1 text-xs text-slate-500 transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-base peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-primary-DEFAULT dark:peer-focus:text-primary-dark">
                            Status
                        </label>
                    </div>
                    
                    <button 
                        onClick={handleSave} 
                        disabled={loading}
                        className="w-full bg-primary-DEFAULT dark:bg-primary-dark text-white dark:text-primary-onContainer font-medium py-3 rounded-full shadow-none hover:shadow-md transition-shadow flex justify-center"
                    >
                        {loading ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// --- Settings Modal ---
const SettingsModal = ({ user, onClose, onUpdate }: { user: User, onClose: () => void, onUpdate: (u: Partial<User>) => Promise<void> }) => {
    const [activeTab, setActiveTab] = useState<'notifications' | 'privacy' | 'appearance'>('notifications');
    const [settings, setSettings] = useState<UserSettings>(user.settings || {
        notifications: true, soundEnabled: true, privacyMode: false, theme: 'dark', chatWallpaper: 'default', fontSize: 'medium'
    });

    const handleSettingChange = (key: keyof UserSettings, value: any) => {
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);
        onUpdate({ settings: newSettings });
    };

    const requestPushPermission = async () => {
        if (!("Notification" in window)) {
            alert("This browser does not support desktop notifications");
            return;
        }
        const permission = await Notification.requestPermission();
        if(permission === 'granted') {
            handleSettingChange('notifications', true);
        } else {
            alert("Permission denied");
            handleSettingChange('notifications', false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
            <div className="bg-surface-lightContainerHigh dark:bg-surface-darkContainerHigh text-slate-900 dark:text-slate-100 rounded-3xl shadow-2xl w-full max-w-2xl h-[600px] flex overflow-hidden animate-slide-up">
                {/* Sidebar */}
                <div className="w-1/3 bg-surface-lightContainer dark:bg-surface-darkContainer border-r border-outline-light/10 dark:border-outline-dark/20 p-4 flex flex-col">
                    <h2 className="text-2xl font-normal mb-6 px-2">Settings</h2>
                    <div className="space-y-2 flex-1">
                        <button onClick={() => setActiveTab('notifications')} className={`w-full flex items-center gap-3 px-4 py-4 rounded-full transition-all ${activeTab === 'notifications' ? 'bg-secondary-container dark:bg-secondary-darkContainer text-secondary-onContainer dark:text-secondary-onDarkContainer font-medium' : 'hover:bg-surface-variant/50 dark:hover:bg-white/5'}`}>
                            <Bell size={20} /> Notifications
                        </button>
                        <button onClick={() => setActiveTab('privacy')} className={`w-full flex items-center gap-3 px-4 py-4 rounded-full transition-all ${activeTab === 'privacy' ? 'bg-secondary-container dark:bg-secondary-darkContainer text-secondary-onContainer dark:text-secondary-onDarkContainer font-medium' : 'hover:bg-surface-variant/50 dark:hover:bg-white/5'}`}>
                            <Lock size={20} /> Privacy
                        </button>
                        <button onClick={() => setActiveTab('appearance')} className={`w-full flex items-center gap-3 px-4 py-4 rounded-full transition-all ${activeTab === 'appearance' ? 'bg-secondary-container dark:bg-secondary-darkContainer text-secondary-onContainer dark:text-secondary-onDarkContainer font-medium' : 'hover:bg-surface-variant/50 dark:hover:bg-white/5'}`}>
                            <Eye size={20} /> Appearance
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 p-8 relative overflow-y-auto">
                    <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full hover:bg-surface-variant dark:hover:bg-white/10">
                        <X size={20} />
                    </button>

                    {activeTab === 'notifications' && (
                        <div className="space-y-8 animate-fade-in">
                            <h3 className="text-2xl font-normal text-primary-DEFAULT dark:text-primary-dark mb-6">Notifications</h3>
                            
                            <div className="flex items-center justify-between p-4 bg-surface-light dark:bg-surface-dark rounded-2xl border border-outline-light/10 dark:border-outline-dark/10">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-secondary-container dark:bg-secondary-darkContainer rounded-full text-secondary-onContainer dark:text-secondary-onDarkContainer">
                                        <Bell size={20} />
                                    </div>
                                    <div>
                                        <p className="font-medium text-lg">Push Notifications</p>
                                        <p className="text-sm opacity-70">Receive alerts when you are away</p>
                                    </div>
                                </div>
                                <Switch 
                                    checked={settings.notifications} 
                                    onChange={() => {
                                        if(!settings.notifications) requestPushPermission();
                                        else handleSettingChange('notifications', false);
                                    }} 
                                />
                            </div>

                            <div className="flex items-center justify-between p-4 bg-surface-light dark:bg-surface-dark rounded-2xl border border-outline-light/10 dark:border-outline-dark/10">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-secondary-container dark:bg-secondary-darkContainer rounded-full text-secondary-onContainer dark:text-secondary-onDarkContainer">
                                        <Volume2 size={20} />
                                    </div>
                                    <div>
                                        <p className="font-medium text-lg">Sound Effects</p>
                                        <p className="text-sm opacity-70">Play audible alerts for messages</p>
                                    </div>
                                </div>
                                <Switch checked={settings.soundEnabled} onChange={() => handleSettingChange('soundEnabled', !settings.soundEnabled)} />
                            </div>
                        </div>
                    )}

                    {activeTab === 'privacy' && (
                        <div className="space-y-8 animate-fade-in">
                            <h3 className="text-2xl font-normal text-primary-DEFAULT dark:text-primary-dark mb-6">Privacy</h3>
                            <div className="flex items-center justify-between p-4 bg-surface-light dark:bg-surface-dark rounded-2xl border border-outline-light/10 dark:border-outline-dark/10">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-secondary-container dark:bg-secondary-darkContainer rounded-full text-secondary-onContainer dark:text-secondary-onDarkContainer">
                                        <Eye size={20} />
                                    </div>
                                    <div>
                                        <p className="font-medium text-lg">Ghost Mode</p>
                                        <p className="text-sm opacity-70">Hide online status and last seen</p>
                                    </div>
                                </div>
                                <Switch checked={settings.privacyMode} onChange={() => handleSettingChange('privacyMode', !settings.privacyMode)} />
                            </div>
                            <div className="mt-8">
                                <h4 className="font-medium mb-4 text-lg">Blocked Users</h4>
                                <div className="bg-surface-light dark:bg-surface-dark rounded-2xl p-4 border border-outline-light/10 dark:border-outline-dark/10 min-h-[100px]">
                                    {user.blockedUsers.length === 0 && <p className="text-center text-slate-400 italic mt-6">No blocked users.</p>}
                                    <div className="space-y-2">
                                        {user.blockedUsers.map(id => (
                                            <div key={id} className="flex items-center justify-between bg-surface-variant/30 dark:bg-white/5 p-3 rounded-xl">
                                                <span className="font-mono text-sm opacity-80">{id.substring(0,8)}...</span>
                                                <span className="text-xs text-error-light dark:text-error-dark bg-error-container/30 px-2 py-1 rounded-full">Blocked</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'appearance' && (
                        <div className="space-y-8 animate-fade-in">
                            <h3 className="text-2xl font-normal text-primary-DEFAULT dark:text-primary-dark mb-6">Appearance</h3>
                            
                            <div className="bg-surface-light dark:bg-surface-dark rounded-2xl p-6 border border-outline-light/10 dark:border-outline-dark/10">
                                <div className="flex items-center gap-3 mb-4">
                                    <Wallpaper className="text-primary-DEFAULT dark:text-primary-dark" />
                                    <p className="font-medium text-lg">Chat Wallpaper</p>
                                </div>
                                <div className="flex gap-4 overflow-x-auto pb-2">
                                    {['default', 'bg-gradient-to-br from-pink-200 to-purple-300', 'bg-gradient-to-tr from-slate-800 to-slate-900', 'bg-[url(https://www.transparenttextures.com/patterns/cubes.png)]'].map((bg, i) => (
                                        <div 
                                            key={i} 
                                            onClick={() => handleSettingChange('chatWallpaper', bg)}
                                            className={`w-20 h-20 rounded-2xl cursor-pointer border-4 transition-all shadow-sm hover:shadow-md shrink-0 ${settings.chatWallpaper === bg ? 'border-primary-DEFAULT dark:border-primary-dark scale-105' : 'border-transparent'} ${bg === 'default' ? 'bg-surface-variant' : bg} ${bg.startsWith('bg-[') ? 'bg-repeat opacity-80 bg-slate-100 dark:bg-slate-800' : ''}`}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div className="bg-surface-light dark:bg-surface-dark rounded-2xl p-6 border border-outline-light/10 dark:border-outline-dark/10">
                                <div className="flex items-center gap-3 mb-4">
                                    <Type className="text-primary-DEFAULT dark:text-primary-dark" />
                                    <p className="font-medium text-lg">Font Size</p>
                                </div>
                                <div className="flex bg-surface-variant/50 dark:bg-surface-darkContainerHigh rounded-full p-1 w-full">
                                    {['small', 'medium', 'large'].map((size) => (
                                        <button
                                            key={size}
                                            onClick={() => handleSettingChange('fontSize', size)}
                                            className={`flex-1 py-2 rounded-full text-sm capitalize transition-all font-medium ${settings.fontSize === size ? 'bg-white dark:bg-secondary-darkContainer shadow-sm text-primary-DEFAULT dark:text-secondary-onDarkContainer' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                        >
                                            {size}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default function App() {
  // --- Global State ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [view, setView] = useState<'auth' | 'app'>('auth');
  const [currentTab, setCurrentTab] = useState<'chats' | 'calls'>('chats');
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // --- Chat State ---
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]); // Decrypted messages
  const [inputText, setInputText] = useState('');
  const [replyTo, setReplyTo] = useState<ReplyInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [userCache, setUserCache] = useState<Record<string, User>>({});
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  
  // --- Call State ---
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [callHistory, setCallHistory] = useState<CallLog[]>([]);
  
  // --- UI State ---
  const [showEmoji, setShowEmoji] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<User[]>([]);

  // --- Refs ---
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);
  const typingTimeoutRef = useRef<any>(null);

  // --- Socket Integration ---
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !currentUser) return;

    // Define listeners
    const onNewMessage = async (msg: Message) => {
        if (msg.chatId === activeChatId) {
            const plainText = await CryptoService.decryptMessage(msg.content, msg.chatId);
            setMessages(prev => [...prev, { ...msg, content: plainText }]);
            Storage.markMessagesAsRead(msg.chatId, currentUser.id);
        }
        // Update chats list
        loadChats(currentUser.id);
    };

    const onTyping = ({ chatId, userId, isTyping }: any) => {
        if (chatId === activeChatId && userId !== currentUser.id) {
            setTypingUsers(prev => isTyping ? [...prev, userId] : prev.filter(id => id !== userId));
        }
    };

    const onChatUpdated = (data: any) => {
        loadChats(currentUser.id);
    };

    const onCallOffer = (data: any) => {
        // Incoming Call!
        const { offer, callerId } = data;
        // Don't auto-answer in this UI, show Incoming Call UI (omitted for brevity in this fix, showing auto-accept for demo)
        // In real app: pop up a modal "Accept/Decline"
        // For now, we just set state to trigger the modal which handles signaling
        setActiveCall({
            id: 'incoming',
            callerId: callerId,
            receiverId: currentUser.id,
            status: 'ringing',
            isVideo: true, // Assume video for now
            isMuted: false
        });
    };

    // Attach listeners
    socket.on('new_message', onNewMessage);
    socket.on('typing', onTyping);
    socket.on('chat_updated', onChatUpdated);
    socket.on('call_offer', onCallOffer);

    return () => {
        socket.off('new_message', onNewMessage);
        socket.off('typing', onTyping);
        socket.off('chat_updated', onChatUpdated);
        socket.off('call_offer', onCallOffer);
    }
  }, [currentUser, activeChatId]);

  // --- Theme Effect ---
  useEffect(() => {
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
      if(currentUser && currentUser.settings) {
          setTheme(currentUser.settings.theme);
          if(currentUser.settings.notifications && "Notification" in window) {
              if (Notification.permission !== "granted") {
                 Notification.requestPermission();
              }
          }
      }
  }, [currentUser]);

  const toggleTheme = () => {
      const newTheme = theme === 'dark' ? 'light' : 'dark';
      setTheme(newTheme);
      if(currentUser) handleUpdateProfile({ settings: { ...currentUser.settings!, theme: newTheme } });
  };

  // --- User Cache Logic ---
  const resolveUsers = useCallback(async (chatList: Chat[]) => {
      const missingIds = new Set<string>();
      
      if (!userCache[GEMINI_USER.id]) {
          setUserCache(prev => ({ ...prev, [GEMINI_USER.id]: GEMINI_USER as any }));
      }

      chatList.forEach(c => {
          c.participants.forEach(p => {
              if(!userCache[p] && p !== currentUser?.id && p !== GEMINI_USER.id) {
                  missingIds.add(p);
              }
          });
      });
      
      if(missingIds.size > 0) {
          const fetchedUsers = await Storage.getUsersByIds(Array.from(missingIds));
          setUserCache(prev => {
              const next = { ...prev };
              fetchedUsers.forEach(u => next[u.id] = u);
              return next;
          });
      }
  }, [userCache, currentUser]);

  // --- Decryption & Load Logic ---
  const loadMessages = useCallback(async (chatId: string) => {
      const encryptedMsgs = await Storage.getMessages(chatId);
      
      // Decrypt all messages
      const decryptedMsgs = await Promise.all(encryptedMsgs.map(async (m) => {
          if (m.type === 'text') {
             const plain = await CryptoService.decryptMessage(m.content, chatId);
             return { ...m, content: plain };
          }
          return m;
      }));
      
      setMessages(decryptedMsgs);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      if(currentUser) await Storage.markMessagesAsRead(chatId, currentUser.id);
  }, [currentUser]);


  // --- Polling ---
  useEffect(() => {
      if (!currentUser) return;
      // We still poll chats as a backup and for friend list updates
      const poll = async () => {
          const fetchedChats = await Storage.getChats(currentUser.id);
          resolveUsers(fetchedChats);
          
          const currentChatIds = chats.map(c => c.lastMessage?.id).join(',');
          const newChatIds = fetchedChats.map(c => c.lastMessage?.id).join(',');

          if(currentChatIds !== newChatIds) {
               setChats(fetchedChats);
          }

          // Polling active chat for safety if socket misses
          if (activeChatId) {
              const encryptedMsgs = await Storage.getMessages(activeChatId);
               if (encryptedMsgs.length > messages.length) {
                   loadMessages(activeChatId);
               }
          }
      };
      const interval = setInterval(poll, 3000); 
      poll();
      return () => clearInterval(interval);
  }, [currentUser, activeChatId, resolveUsers, chats, messages]);

  // --- Auth Handlers ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const form = e.target as HTMLFormElement;
    try {
      const u = await Storage.loginUser(form.username.value, form.password.value);
      setCurrentUser(u);
      setView('app');
      loadChats(u.id);
      setCallHistory(Storage.getCallHistory(u.id));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const form = e.target as HTMLFormElement;
    try {
      const u = await Storage.registerUser(form.username.value, form.password.value);
      setCurrentUser(u);
      setView('app');
      loadChats(u.id);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (updates: Partial<User>) => {
      if(!currentUser) return;
      const updated = await Storage.updateUser(currentUser.id, updates);
      setCurrentUser(updated);
  };

  // --- Chat Logic ---
  const loadChats = async (userId: string) => {
      const c = await Storage.getChats(userId);
      const hasGemini = c.find(chat => chat.participants.includes(GEMINI_USER.id));
      if (!hasGemini) {
          await Storage.createChat(userId, GEMINI_USER.id);
          const updated = await Storage.getChats(userId);
          setChats(updated);
          resolveUsers(updated);
      } else {
          setChats(c);
          resolveUsers(c);
      }
  };

  useEffect(() => {
    if (activeChatId) {
        loadMessages(activeChatId);
        setShowMenu(false);
        setReplyTo(null);
        setInputText('');
        // Join Socket Room
        const socket = getSocket();
        if(socket) socket.emit('join_chat', activeChatId);
    }
    return () => {
        const socket = getSocket();
        if(socket && activeChatId) socket.emit('leave_chat', activeChatId);
    }
  }, [activeChatId, loadMessages]);

  // --- Voice Recorder ---
  const toggleRecording = async () => {
      if (isRecording) {
          if (mediaRecorderRef.current) {
              mediaRecorderRef.current.stop();
              setIsRecording(false);
              clearInterval(recordingTimerRef.current);
          }
      } else {
          try {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              const mediaRecorder = new MediaRecorder(stream);
              mediaRecorderRef.current = mediaRecorder;
              audioChunksRef.current = [];

              mediaRecorder.ondataavailable = (event) => {
                  if (event.data.size > 0) {
                      audioChunksRef.current.push(event.data);
                  }
              };

              mediaRecorder.onstop = async () => {
                  const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                  const base64Audio = await blobToBase64(audioBlob);
                  handleSendMessage('audio', 'Voice Message', base64Audio);
                  stream.getTracks().forEach(track => track.stop());
              };

              mediaRecorder.start();
              setIsRecording(true);
              setRecordingTime(0);
              recordingTimerRef.current = setInterval(() => {
                  setRecordingTime(prev => prev + 1);
              }, 1000);

          } catch (err) {
              console.error("Error accessing microphone:", err);
              alert("Could not access microphone.");
          }
      }
  };

  const handleSendMessage = async (type: 'text' | 'image' | 'video' | 'audio' = 'text', contentVal?: string, mediaUrl?: string) => {
    if (!currentUser || !activeChatId) return;
    const content = contentVal || inputText;
    
    if (!content && !mediaUrl) return;

    const activeChat = chats.find(c => c.id === activeChatId);
    if(!activeChat) return;

    try {
        // Encrypt content if text
        let contentToSave = content;
        if (type === 'text') {
            contentToSave = await CryptoService.encryptMessage(content, activeChat.id);
        }

        const newMessage: Message = {
            id: crypto.randomUUID(), // Temporary ID for optimisic UI
            chatId: activeChatId,
            senderId: currentUser.id,
            content: contentToSave,
            type,
            timestamp: Date.now(),
            status: 'sent',
            mediaUrl,
            replyTo: replyTo || undefined
        };

        // Optimistic UI update
        const msgForUI = { ...newMessage, content: type === 'text' ? content : contentToSave };
        setMessages(prev => [...prev, msgForUI]);
        setInputText('');
        setReplyTo(null);
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

        await Storage.sendMessage(newMessage);
        Storage.setTyping(activeChatId, currentUser.id, false);

        const peerId = activeChat.participants.find(p => p !== currentUser.id);
        if (peerId === GEMINI_USER.id) {
            try {
                const responseText = await getGeminiResponse(content);
                const encryptedResponse = await CryptoService.encryptMessage(responseText, activeChatId);
                const aiMsg: Message = {
                    id: crypto.randomUUID(),
                    chatId: activeChatId,
                    senderId: GEMINI_USER.id,
                    content: encryptedResponse,
                    type: 'text',
                    timestamp: Date.now(),
                    status: 'sent'
                };
                await Storage.sendMessage(aiMsg);
                setMessages(prev => [...prev, { ...aiMsg, content: responseText }]);
            } catch (e) {}
        }
    } catch (err: any) {
        alert(err.message);
    }
  };

  const handleReply = (msg: Message) => {
      // Since state messages are already decrypted, we just use content
      let senderName = "Unknown";
      if(msg.senderId === currentUser?.id) senderName = "You";
      else if(msg.senderId === GEMINI_USER.id) senderName = GEMINI_USER.username;
      else if(userCache[msg.senderId]) senderName = userCache[msg.senderId].username;
      
      setReplyTo({
          id: msg.id,
          senderId: msg.senderId,
          senderName,
          content: msg.content, // Already decrypted in state
          type: msg.type
      });
      // Focus input
      const textarea = document.querySelector('textarea');
      if(textarea) textarea.focus();
  }

  const handleDeleteMessage = async (msgId: string) => {
      if(!activeChatId) return;
      if(window.confirm("Delete for everyone?")) {
          await Storage.deleteMessage(activeChatId, msgId);
          setMessages(prev => prev.filter(m => m.id !== msgId));
      }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if(file) {
          // Backend now handles limits better, but keep basic check
          if(file.size > 50 * 1024 * 1024) { 
              alert("File too large (Max 50MB)");
              return;
          }
          const reader = new FileReader();
          reader.onload = (evt) => {
              const base64 = evt.target?.result as string;
              const type = file.type.startsWith('image') ? 'image' : file.type.startsWith('video') ? 'video' : 'text'; 
              handleSendMessage(type as any, file.name, base64);
          };
          reader.readAsDataURL(file);
      }
  }

  const toggleBlock = async () => {
      if(!currentUser || !activeChatId) return;
      const chat = chats.find(c => c.id === activeChatId);
      const peerId = chat?.participants.find(p => p !== currentUser.id);
      if(!peerId || peerId === GEMINI_USER.id) return;

      const updatedUser = await Storage.toggleBlockUser(currentUser.id, peerId);
      setCurrentUser(updatedUser);
      setShowMenu(false);
  }

  const togglePin = async () => {
      if(!currentUser || !activeChatId) return;
      const newChats = await Storage.togglePinChat(activeChatId, currentUser.id);
      setChats(newChats);
      setShowMenu(false);
  }

  const startCall = (video: boolean) => {
      if(!currentUser || !activeChatId) return;
      const chat = chats.find(c => c.id === activeChatId);
      if(!chat) return;
      
      const peerId = chat.participants.find(p => p !== currentUser.id) || 'unknown';
      if(currentUser.blockedUsers.includes(peerId)) {
          alert("You have blocked this user. Unblock to call.");
          return;
      }

      setActiveCall({
          id: crypto.randomUUID(),
          callerId: currentUser.id,
          receiverId: peerId,
          status: 'connected', 
          isVideo: video,
          isMuted: false
      });
  };

  const endCall = () => {
      if(activeCall && currentUser) {
          const activeChat = chats.find(c => c.id === activeChatId);
          const peerInfo = activeChat ? getPeerInfo(activeChat) : {name: 'Unknown', avatar: ''};
          
          const log: CallLog = {
              id: crypto.randomUUID(),
              peerId: activeCall.receiverId,
              peerName: peerInfo.name,
              peerAvatar: peerInfo.avatar,
              direction: 'outgoing',
              type: activeCall.isVideo ? 'video' : 'audio',
              status: 'completed',
              timestamp: Date.now(),
              duration: 0 
          };
          Storage.addCallLog(currentUser.id, log);
          setCallHistory(prev => [log, ...prev]);
      }
      setActiveCall(null);
  };

  const executeSearch = async (q: string) => {
      setSearchQuery(q);
      if(q.length > 1) {
          const res = await Storage.searchUsers(q);
          if ("gemini".includes(q.toLowerCase())) res.push(GEMINI_USER as any);
          setSearchResults(res);
      } else {
          setSearchResults([]);
      }
  }

  const startChatWith = async (user: User) => {
      if(!currentUser) return;
      const chat = await Storage.createChat(currentUser.id, user.id);
      if(!chats.find(c => c.id === chat.id)) {
          setChats([...chats, chat]);
      }
      setUserCache(prev => ({...prev, [user.id]: user}));
      setActiveChatId(chat.id);
      setCurrentTab('chats');
      setSearchQuery('');
      setSearchResults([]);
  };

  const getPeerInfo = (chat: Chat) => {
      if(!currentUser) return { name: 'Unknown', avatar: '', online: false, status: '' };
      const peerId = chat.participants.find(p => p !== currentUser.id);
      
      if (peerId === GEMINI_USER.id) return { 
          name: GEMINI_USER.username, 
          avatar: GEMINI_USER.avatar, 
          online: true,
          status: "Always here to help!"
      };

      if (peerId && userCache[peerId]) {
          const u = userCache[peerId];
          const isOnline = u.settings?.privacyMode ? false : u.isOnline;
          return {
              name: u.username,
              avatar: u.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.username}`,
              online: isOnline,
              status: u.status || ""
          };
      }

      return { 
          name: `User ${peerId?.substring(0,4)}...`, 
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${peerId}`,
          online: false,
          status: "Loading..." 
      };
  };

  if (view === 'auth') {
      return (
          <div className="min-h-screen bg-surface-light dark:bg-surface-dark flex items-center justify-center p-4 relative overflow-hidden">
              <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-primary-container/40 rounded-full blur-3xl animate-pulse"></div>
              <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-primary-darkContainer/30 rounded-full blur-3xl animate-pulse"></div>
              
              <div className="bg-surface-lightContainerHigh/60 dark:bg-surface-darkContainerHigh/60 backdrop-blur-xl border border-outline-light/20 dark:border-outline-dark/20 p-10 rounded-[32px] shadow-2xl w-full max-w-md z-10">
                  <div className="text-center mb-10">
                      <h1 className="text-4xl font-bold text-primary-DEFAULT dark:text-primary-dark">Animetrika</h1>
                      <p className="text-slate-500 dark:text-slate-400 mt-2 font-medium">Secure. Material. Private.</p>
                  </div>

                  <LoginForm onLogin={handleLogin} onRegister={handleRegister} loading={loading} />
                  
                  <button onClick={toggleTheme} className="mt-6 mx-auto block p-2 rounded-full hover:bg-surface-variant dark:hover:bg-white/10 transition-colors text-slate-600 dark:text-slate-300">
                      {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                  </button>
              </div>
          </div>
      )
  }

  const activeChatObj = chats.find(c => c.id === activeChatId);
  const activePeerId = activeChatObj?.participants.find(p => p !== currentUser?.id);
  const activePeer = activeChatObj ? getPeerInfo(activeChatObj) : null;
  const isBlockedPeer = activePeerId ? currentUser?.blockedUsers.includes(activePeerId) : false;
  const isPinned = activeChatObj?.pinnedBy?.includes(currentUser?.id || '');
  
  const fontSizeClass = currentUser?.settings?.fontSize === 'small' ? 'text-sm' : currentUser?.settings?.fontSize === 'large' ? 'text-lg' : 'text-base';
  const wallpaperClass = currentUser?.settings?.chatWallpaper === 'default' ? '' : currentUser?.settings?.chatWallpaper;

  return (
    <div className={`flex h-screen w-full bg-surface-light dark:bg-surface-dark transition-colors duration-300 ${fontSizeClass}`}>
      {activeCall && currentUser && (
          <CallModal 
            session={activeCall} 
            onEnd={endCall} 
            peerName={activePeer?.name || 'Unknown'}
            currentUserId={currentUser.id}
          />
      )}

      {showProfileModal && currentUser && (
          <ProfileModal 
            user={currentUser} 
            onClose={() => setShowProfileModal(false)} 
            onUpdate={handleUpdateProfile} 
          />
      )}

      {showSettingsModal && currentUser && (
          <SettingsModal 
            user={currentUser} 
            onClose={() => setShowSettingsModal(false)} 
            onUpdate={handleUpdateProfile} 
          />
      )}

      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      {/* Navigation Rail */}
      <nav className="w-20 flex flex-col items-center py-8 bg-surface-lightContainer dark:bg-surface-darkContainer border-r border-outline-light/10 dark:border-outline-dark/10 shrink-0 z-20">
         <div className="mb-8">
            <button className="w-12 h-12 rounded-2xl bg-primary-container dark:bg-primary-darkContainer text-primary-onContainer dark:text-primary-onDarkContainer flex items-center justify-center shadow-md hover:shadow-lg transition-all">
                <span className="font-bold text-lg">A</span>
            </button>
         </div>
         
         <div className="flex-1 flex flex-col gap-8 w-full items-center">
             <NavButton 
                active={currentTab === 'chats'} 
                onClick={() => { setCurrentTab('chats'); setActiveChatId(null); }} 
                icon={<MessageCircle size={24} />} 
                label="Chats"
             />
             <NavButton 
                active={currentTab === 'calls'} 
                onClick={() => { setCurrentTab('calls'); setActiveChatId(null); }} 
                icon={<Phone size={24} />} 
                label="Calls"
             />
         </div>

         <div className="flex flex-col gap-6 items-center">
            <button onClick={() => setShowSettingsModal(true)} className="p-3 rounded-full hover:bg-surface-variant dark:hover:bg-white/10 transition-all text-slate-600 dark:text-slate-400">
                <Settings size={24} />
            </button>
            <button onClick={() => setShowProfileModal(true)} className="p-1 rounded-full border-2 border-transparent hover:border-primary-DEFAULT transition-all">
                <img src={currentUser?.avatar} className="w-8 h-8 rounded-full object-cover" />
            </button>
            <button onClick={() => setView('auth')} className="p-3 text-error-light dark:text-error-dark hover:bg-error-light/10 rounded-full transition-colors">
                <LogOut size={24} />
            </button>
         </div>
      </nav>

      {/* List View */}
      <div className={`${activeChatId ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-96 flex-col border-r border-outline-light/10 dark:border-outline-dark/10 bg-surface-light dark:bg-surface-dark transition-all`}>
          <div className="p-4 pb-2">
              <h2 className="text-[22px] font-normal mb-4 text-slate-900 dark:text-slate-100 animate-fade-in capitalize pl-2">{currentTab}</h2>
              
              <div className="relative mb-2 group">
                  <Search className="absolute left-4 top-3.5 text-slate-500 group-focus-within:text-primary-DEFAULT transition-colors" size={20} />
                  <input 
                    type="text" 
                    placeholder="Search" 
                    className="w-full bg-surface-variant/50 dark:bg-surface-darkContainerHigh text-slate-900 dark:text-slate-100 pl-12 pr-4 py-3 rounded-full focus:outline-none focus:bg-surface-variant dark:focus:bg-surface-darkContainer transition-all placeholder-slate-500"
                    value={searchQuery}
                    onChange={(e) => executeSearch(e.target.value)}
                  />
              </div>
          </div>

          {searchResults.length > 0 ? (
              <div className="flex-1 overflow-y-auto px-2 pb-4">
                 <h4 className="text-xs font-bold text-slate-500 uppercase mb-2 ml-4 mt-2">Search Results</h4>
                 {searchResults.map(u => (
                     <div key={u.id} onClick={() => startChatWith(u)} className="flex items-center gap-4 p-3 rounded-full hover:bg-surface-variant/50 dark:hover:bg-white/5 cursor-pointer animate-fade-in mx-2">
                         <img src={u.avatar} className="w-10 h-10 rounded-full object-cover" />
                         <span className="font-medium text-slate-900 dark:text-white">{u.username}</span>
                     </div>
                 ))}
              </div>
          ) : currentTab === 'chats' ? (
             <div className="flex-1 overflow-y-auto px-2">
                 {chats.map(chat => {
                     const peer = getPeerInfo(chat);
                     const isActive = chat.id === activeChatId;
                     const typing = Storage.getTypingUsers(chat.id).some(id => id !== currentUser?.id);
                     const isPinned = chat.pinnedBy?.includes(currentUser?.id || '');

                     return (
                        <div 
                            key={chat.id}
                            onClick={() => setActiveChatId(chat.id)}
                            className={`flex items-center gap-4 p-3 mb-1 rounded-full cursor-pointer transition-all duration-200 mx-2 group relative ${isActive ? 'bg-secondary-container dark:bg-secondary-darkContainer' : 'hover:bg-surface-variant/30 dark:hover:bg-white/5'} ${isPinned ? 'bg-surface-variant/20 dark:bg-white/5' : ''}`}
                        >
                            <div className="relative shrink-0">
                                <img src={peer.avatar} className="w-12 h-12 rounded-full object-cover bg-surface-variant" />
                                {peer.online && <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-surface-light dark:border-surface-dark rounded-full"></div>}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-baseline mb-0.5">
                                    <h4 className={`font-medium truncate text-base flex items-center gap-1.5 ${isActive ? 'text-secondary-onContainer dark:text-secondary-onDarkContainer' : 'text-slate-900 dark:text-slate-100'}`}>
                                        {isPinned && <Pin size={12} className="rotate-45 text-primary-DEFAULT" fill="currentColor"/>}
                                        {peer.name}
                                    </h4>
                                    {chat.lastMessage && <span className="text-[11px] opacity-70 font-medium">{new Date(chat.lastMessage.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>}
                                </div>
                                <p className="text-sm opacity-70 truncate h-5">
                                    {typing ? (
                                        <span className="text-primary-DEFAULT dark:text-primary-dark font-medium animate-pulse">typing...</span>
                                    ) : chat.lastMessage ? (
                                        <span className="flex items-center gap-1">
                                            {chat.lastMessage.senderId === currentUser?.id && (
                                                chat.lastMessage.status === 'read' ? <CheckCheck size={14} className="text-primary-DEFAULT" /> : <CheckCheck size={14} />
                                            )}
                                            {chat.lastMessage.type === 'text' ? (chat.lastMessage.content.includes(':') ? '🔒 Encrypted Message' : chat.lastMessage.content) : `[${chat.lastMessage.type}]`}
                                        </span>
                                    ) : 'Start a conversation'}
                                </p>
                            </div>
                            {chat.unreadCount > 0 && (
                                <div className="bg-primary-DEFAULT dark:bg-primary-dark text-white text-xs font-bold h-5 min-w-[1.25rem] px-1.5 flex items-center justify-center rounded-full shadow-sm">
                                    {chat.unreadCount}
                                </div>
                            )}
                        </div>
                     );
                 })}
             </div>
          ) : (
             <div className="flex-1 overflow-y-auto px-2">
                 {callHistory.length === 0 && <div className="text-center text-slate-500 mt-10">No calls yet</div>}
                 {callHistory.map(call => (
                     <div key={call.id} className="flex items-center gap-4 p-3 mb-1 rounded-full hover:bg-surface-variant/30 dark:hover:bg-white/5 transition-colors mx-2">
                         <div className="relative shrink-0">
                             <img src={call.peerAvatar} className="w-10 h-10 rounded-full object-cover" />
                             <div className={`absolute -bottom-1 -right-1 p-0.5 rounded-full border-2 border-surface-light dark:border-surface-dark ${call.status === 'missed' ? 'bg-error-light text-white' : 'bg-emerald-100 text-emerald-600'}`}>
                                 {call.status === 'missed' ? <PhoneMissed size={10} /> : call.direction === 'incoming' ? <ArrowDownLeft size={10} /> : <ArrowUpRight size={10} />}
                             </div>
                         </div>
                         <div className="flex-1">
                             <h4 className="font-medium text-slate-900 dark:text-slate-100">{call.peerName}</h4>
                             <span className="text-xs opacity-60 flex items-center gap-2">
                                 {call.type === 'video' ? <Video size={12}/> : <Phone size={12}/>}
                                 {new Date(call.timestamp).toLocaleDateString()} {new Date(call.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                             </span>
                         </div>
                     </div>
                 ))}
             </div>
          )}
      </div>

      {/* Chat Area */}
      <main className={`${!activeChatId ? 'hidden md:flex' : 'flex'} flex-1 flex-col relative bg-surface-variant/30 dark:bg-black/40`}>
          {!activeChatId ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8 text-center">
                  <div className="w-28 h-28 bg-primary-container dark:bg-surface-darkContainer rounded-[28px] flex items-center justify-center mb-6 animate-bounce shadow-lg">
                      <MessageCircle size={48} className="text-primary-DEFAULT dark:text-primary-dark" />
                  </div>
                  <h2 className="text-3xl font-normal text-slate-900 dark:text-slate-100 mb-2">Animetrika</h2>
                  <p className="max-w-md opacity-70">Send and receive messages with end-to-end encryption. Call your friends and share moments securely.</p>
                  <div className="mt-8 flex gap-3">
                     <span className="px-4 py-1.5 rounded-full bg-surface-variant dark:bg-surface-darkContainer text-xs font-medium flex items-center gap-1"><Lock size={12}/> E2EE</span>
                     <span className="px-4 py-1.5 rounded-full bg-surface-variant dark:bg-surface-darkContainer text-xs font-medium">M3 Design</span>
                  </div>
              </div>
          ) : (
              <>
                {/* Chat Header */}
                <div className="h-20 flex justify-between items-center px-6 bg-surface-light/95 dark:bg-surface-dark/95 backdrop-blur-md sticky top-0 z-10 border-b border-outline-light/10 dark:border-outline-dark/10">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setActiveChatId(null)} className="md:hidden p-2 -ml-2 rounded-full hover:bg-surface-variant dark:hover:bg-white/10">
                            <ArrowDownLeft className="rotate-45" size={24} />
                        </button>
                        
                        <img src={activePeer?.avatar} className="w-10 h-10 rounded-full object-cover ring-2 ring-surface-variant dark:ring-surface-darkContainer" />
                        <div>
                            <h3 className="font-medium text-lg text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                {activePeer?.name}
                                {isPinned && <Pin size={14} className="rotate-45 text-primary-DEFAULT" fill="currentColor" />}
                                {typingUsers.length > 0 && <span className="text-xs font-normal text-primary-DEFAULT animate-pulse">typing...</span>}
                            </h3>
                            <span className="text-xs opacity-60 block">
                                {activePeer?.online ? 'Online' : 'Last seen recently'}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {!isBlockedPeer && (
                            <>
                                <button onClick={() => startCall(false)} className="p-3 hover:bg-surface-variant dark:hover:bg-white/10 rounded-full text-slate-600 dark:text-slate-300 transition-colors"><Phone size={22} /></button>
                                <button onClick={() => startCall(true)} className="p-3 hover:bg-surface-variant dark:hover:bg-white/10 rounded-full text-slate-600 dark:text-slate-300 transition-colors"><Video size={22} /></button>
                            </>
                        )}
                        <div className="relative">
                            <button onClick={() => setShowMenu(!showMenu)} className="p-3 hover:bg-surface-variant dark:hover:bg-white/10 rounded-full text-slate-600 dark:text-slate-300 transition-colors">
                                <MoreVertical size={22} />
                            </button>
                            
                            {showMenu && (
                                <div className="absolute right-0 top-full mt-2 w-48 bg-surface-lightContainerHigh dark:bg-surface-darkContainerHigh rounded-[16px] shadow-xl py-2 animate-fade-in z-20 overflow-hidden">
                                    <button
                                        onClick={togglePin}
                                        className="w-full text-left px-4 py-3 hover:bg-surface-variant dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 flex items-center gap-3 text-sm"
                                    >
                                        {isPinned ? <><PinOff size={18}/> Unpin Chat</> : <><Pin size={18}/> Pin Chat</>}
                                    </button>
                                    <button 
                                        onClick={toggleBlock}
                                        className="w-full text-left px-4 py-3 hover:bg-error-light/10 text-error-light dark:text-error-dark flex items-center gap-3 text-sm font-medium"
                                    >
                                        {isBlockedPeer ? <><ShieldCheck size={18}/> Unblock User</> : <><ShieldOff size={18}/> Block User</>}
                                    </button>
                                    <button 
                                        onClick={() => {setMessages([]); setShowMenu(false);}}
                                        className="w-full text-left px-4 py-3 hover:bg-surface-variant dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 flex items-center gap-3 text-sm"
                                    >
                                        <Trash2 size={18}/> Clear Chat
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Messages List */}
                <div className={`flex-1 overflow-y-auto p-4 md:p-6 space-y-4 scroll-smooth ${wallpaperClass}`}>
                    {messages.map((msg, index) => {
                        const isMe = msg.senderId === currentUser?.id;
                        // Content is already decrypted in State
                        const content = msg.content;
                        
                        // Date Separator Logic
                        const showDateSeparator = index === 0 || !isSameDay(msg.timestamp, messages[index-1].timestamp);

                        return (
                            <React.Fragment key={msg.id}>
                                {showDateSeparator && (
                                    <div className="flex justify-center my-6">
                                        <span className="bg-surface-variant/50 dark:bg-surface-darkContainerHigh text-slate-600 dark:text-slate-300 text-xs font-medium px-3 py-1 rounded-full shadow-sm">
                                            {formatDateSeparator(msg.timestamp)}
                                        </span>
                                    </div>
                                )}

                                <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-slide-up group`}>
                                    <div className={`max-w-[85%] md:max-w-[65%] relative flex gap-2 items-end`}>
                                        
                                        {/* Reply Action (Slide out or button on desktop) */}
                                        {!isMe && (
                                            <button onClick={() => handleReply(msg)} className="opacity-0 group-hover:opacity-100 p-2 mb-2 rounded-full hover:bg-surface-variant/50 text-slate-400 hover:text-primary-DEFAULT transition-all">
                                                <Reply size={16} />
                                            </button>
                                        )}

                                        <div className="relative">
                                            {isMe && (
                                                <div className="absolute top-2 -left-14 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => handleReply(msg)} className="p-2 text-slate-400 hover:text-primary-DEFAULT">
                                                        <Reply size={16} />
                                                    </button>
                                                    <button onClick={() => handleDeleteMessage(msg.id)} className="p-2 text-slate-400 hover:text-error-light">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            )}
                                            
                                            <div className={`px-4 py-2 shadow-sm ${
                                                isMe 
                                                ? 'bg-primary-DEFAULT dark:bg-primary-dark text-white dark:text-primary-onContainer rounded-[20px] rounded-br-sm' 
                                                : 'bg-surface-lightContainerHigh dark:bg-surface-darkContainerHigh text-slate-900 dark:text-slate-200 rounded-[20px] rounded-bl-sm'
                                            }`}>
                                                
                                                {/* Reply Context */}
                                                {msg.replyTo && (
                                                    <div className={`mb-2 pl-2 border-l-2 text-xs cursor-pointer ${isMe ? 'border-white/50 text-white/80' : 'border-primary-DEFAULT text-slate-500'}`}>
                                                        <span className="font-bold block">{msg.replyTo.senderName}</span>
                                                        <span className="opacity-80 truncate block max-w-[150px]">{msg.replyTo.content || `[${msg.replyTo.type}]`}</span>
                                                    </div>
                                                )}

                                                {msg.type === 'text' && <p className="whitespace-pre-wrap text-inherit leading-relaxed text-[15px]">{content}</p>}
                                                {msg.type === 'image' && (
                                                    <div className="rounded-xl overflow-hidden mb-1 cursor-pointer" onClick={() => setLightboxSrc(msg.mediaUrl!)}>
                                                        <img src={msg.mediaUrl} className="max-w-full max-h-80 object-cover hover:scale-[1.02] transition-transform" />
                                                    </div>
                                                )}
                                                {msg.type === 'audio' && (
                                                   <AudioPlayer src={msg.mediaUrl!} />
                                                )}
                                                {msg.type === 'video' && (
                                                    <div className="rounded-xl overflow-hidden mb-1">
                                                        <video src={msg.mediaUrl} controls className="max-w-full max-h-80" />
                                                    </div>
                                                )}

                                                <div className={`flex items-center justify-end gap-1 mt-0.5 ${isMe ? 'opacity-80' : 'opacity-50'}`}>
                                                    <span className="text-[10px] font-medium">
                                                        {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                    </span>
                                                    {isMe && (
                                                        <>
                                                            {msg.status === 'sent' && <Check size={12} />}
                                                            {msg.status === 'delivered' && <CheckCheck size={12} />}
                                                            {msg.status === 'read' && <CheckCheck size={12} className="text-white dark:text-primary-onContainer" />}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </React.Fragment>
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 bg-surface-light dark:bg-surface-dark">
                    {isBlockedPeer ? (
                        <div className="bg-surface-variant dark:bg-surface-darkContainer p-4 rounded-2xl text-center text-slate-500 text-sm font-medium">
                            You have blocked this user. <button onClick={toggleBlock} className="text-primary-DEFAULT hover:underline">Unblock</button> to send messages.
                        </div>
                    ) : (
                        <div className="max-w-5xl mx-auto">
                            {/* Reply Preview */}
                            {replyTo && (
                                <div className="flex items-center justify-between bg-surface-variant/50 dark:bg-surface-darkContainerHigh rounded-t-2xl p-3 mb-1 animate-slide-up mx-2 border-l-4 border-primary-DEFAULT">
                                    <div className="text-sm overflow-hidden">
                                        <p className="text-primary-DEFAULT font-bold text-xs mb-0.5">Reply to {replyTo.senderName}</p>
                                        <p className="text-slate-600 dark:text-slate-300 truncate">{replyTo.content || `[${replyTo.type}]`}</p>
                                    </div>
                                    <button onClick={() => setReplyTo(null)} className="p-1 hover:bg-surface-variant rounded-full">
                                        <X size={16} />
                                    </button>
                                </div>
                            )}

                            <div className="flex items-end gap-2">
                                <button onClick={() => fileInputRef.current?.click()} className="p-3 rounded-full bg-surface-variant/50 dark:bg-surface-darkContainer text-slate-500 hover:text-primary-DEFAULT hover:bg-primary-container/50 transition-all">
                                    <Plus size={24} />
                                </button>
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*" onChange={handleFileSelect} />
                                
                                <div className={`flex-1 bg-surface-variant/50 dark:bg-surface-darkContainer rounded-[28px] flex items-center px-2 py-1 border border-transparent focus-within:border-primary-DEFAULT transition-all ${replyTo ? 'rounded-tl-sm' : ''}`}>
                                    <button onClick={() => setShowEmoji(!showEmoji)} className="p-2 text-slate-400 hover:text-yellow-600 transition-colors">
                                        <Smile size={24} />
                                    </button>
                                    <textarea 
                                        value={inputText}
                                        onChange={(e) => {
                                            setInputText(e.target.value);
                                            if(activeChatId && currentUser) {
                                                Storage.setTyping(activeChatId, currentUser.id, true);
                                                if(typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                                                typingTimeoutRef.current = setTimeout(() => Storage.setTyping(activeChatId, currentUser.id, false), 2000);
                                            }
                                        }}
                                        onKeyDown={(e) => {
                                            if(e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSendMessage();
                                            }
                                        }}
                                        placeholder={isRecording ? `Recording... ${recordingTime}s` : "Message"}
                                        className="flex-1 bg-transparent border-none focus:ring-0 text-slate-900 dark:text-slate-100 placeholder-slate-500 resize-none py-3 max-h-32 custom-scrollbar"
                                        rows={1}
                                        disabled={isRecording}
                                    />
                                </div>

                                {inputText.trim() || replyTo ? (
                                    <button onClick={() => handleSendMessage()} className="p-3 rounded-full bg-primary-DEFAULT dark:bg-primary-dark text-white dark:text-primary-onContainer hover:shadow-lg hover:scale-105 transition-all">
                                        <Send size={24} className="ml-1" />
                                    </button>
                                ) : (
                                    <button 
                                        onClick={toggleRecording}
                                        className={`p-3 rounded-full transition-all ${isRecording ? 'bg-error-light text-white scale-110 animate-pulse shadow-red-500/50 shadow-lg' : 'bg-surface-variant/50 dark:bg-surface-darkContainer text-slate-500 hover:text-primary-DEFAULT hover:bg-primary-container/50'}`}
                                    >
                                        {isRecording ? <div className="w-6 h-6 flex items-center justify-center"><div className="w-2 h-2 bg-white rounded-sm"></div></div> : <Mic size={24} />}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                    {showEmoji && (
                        <div className="absolute bottom-24 left-6 bg-surface-lightContainerHigh dark:bg-surface-darkContainerHigh border border-outline-light/10 dark:border-outline-dark/10 p-4 rounded-[24px] shadow-xl grid grid-cols-8 gap-2 animate-slide-up z-20">
                            {['😀','😂','😍','🤔','👍','👋','🔥','❤️','🎉','👀','😭','🙌','💩','👻','🦄','🍔'].map(e => (
                                <button key={e} onClick={() => { setInputText(p => p + e); setShowEmoji(false); }} className="text-2xl hover:bg-surface-variant dark:hover:bg-white/10 p-2 rounded-full transition-colors">{e}</button>
                            ))}
                        </div>
                    )}
                </div>
              </>
          )}
      </main>
    </div>
  );
}

// --- UI Components ---
const NavButton = ({ active, onClick, icon, label }: any) => (
    <button 
        onClick={onClick}
        className={`flex flex-col items-center gap-1 w-14 py-1 rounded-2xl transition-all duration-300 group ${active ? '' : 'hover:bg-surface-variant/50 dark:hover:bg-white/5'}`}
    >
        <div className={`w-14 h-8 rounded-full flex items-center justify-center transition-colors duration-300 ${active ? 'bg-secondary-container dark:bg-secondary-darkContainer text-secondary-onContainer dark:text-secondary-onDarkContainer' : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200'}`}>
            {icon}
        </div>
        <span className={`text-[11px] font-medium transition-colors duration-300 ${active ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>{label}</span>
    </button>
);

// --- Auth Form ---
function LoginForm({ onLogin, onRegister, loading }: { onLogin: any, onRegister: any, loading: boolean }) {
    const [mode, setMode] = useState<'login' | 'register'>('login');

    return (
        <form onSubmit={mode === 'login' ? onLogin : onRegister} className="flex flex-col gap-6">
            <div className="space-y-4">
                <div className="relative">
                    <input 
                        name="username" 
                        type="text" 
                        required 
                        className="peer w-full bg-transparent border border-outline-light dark:border-outline-dark rounded-md px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-primary-DEFAULT dark:focus:border-primary-dark focus:ring-1 focus:ring-primary-DEFAULT dark:focus:ring-primary-dark transition-all placeholder-transparent"
                        placeholder="Username"
                        id="authUsername"
                    />
                    <label htmlFor="authUsername" className="absolute left-4 -top-2.5 bg-surface-lightContainerHigh dark:bg-surface-darkContainerHigh px-1 text-xs text-slate-500 transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-base peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-primary-DEFAULT dark:peer-focus:text-primary-dark">
                        Username
                    </label>
                </div>
                <div className="relative">
                    <input 
                        name="password" 
                        type="password" 
                        required 
                        className="peer w-full bg-transparent border border-outline-light dark:border-outline-dark rounded-md px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:border-primary-DEFAULT dark:focus:border-primary-dark focus:ring-1 focus:ring-primary-DEFAULT dark:focus:ring-primary-dark transition-all placeholder-transparent"
                        placeholder="Password"
                        id="authPassword"
                    />
                    <label htmlFor="authPassword" className="absolute left-4 -top-2.5 bg-surface-lightContainerHigh dark:bg-surface-darkContainerHigh px-1 text-xs text-slate-500 transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-base peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-primary-DEFAULT dark:peer-focus:text-primary-dark">
                        Password
                    </label>
                </div>
            </div>
            
            <button disabled={loading} type="submit" className="w-full bg-primary-DEFAULT dark:bg-primary-dark hover:opacity-90 text-white dark:text-primary-onContainer font-medium py-3 rounded-full shadow-md transition-all flex justify-center items-center">
                {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : (mode === 'login' ? 'Sign In' : 'Create Account')}
            </button>

            <div className="text-center">
                <p className="text-sm text-slate-500">
                    {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
                    <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')} className="text-primary-DEFAULT dark:text-primary-dark hover:underline font-medium ml-1">
                         {mode === 'login' ? "Sign up" : "Log in"}
                    </button>
                </p>
            </div>
        </form>
    );
}
