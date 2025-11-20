
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  MessageCircle, Phone, Video, Search, Settings, LogOut, 
  Plus, Send, Mic, Smile, MoreVertical, 
  Trash2, Check, CheckCheck, X, Lock, Camera,
  ArrowUpRight, ArrowDownLeft, PhoneMissed, Moon, Sun, ShieldOff, ShieldCheck,
  Bell, Volume2, Eye, Wallpaper, Type, Play, Pause, StopCircle,
  Reply, Pin, PinOff, Image as ImageIcon, Shield, Megaphone, Users, ArrowLeft, ChevronLeft, Loader2, Globe,
  CheckSquare, Square, Edit, UserPlus, UserMinus, LogOut as LeaveIcon
} from 'lucide-react';
import { User, Chat, Message, CallSession, CallLog, UserSettings, ReplyInfo } from './types';
import * as Storage from './services/storage';
import * as CryptoService from './services/cryptoService';
import { GEMINI_USER, isGeminiUser, getGeminiResponse } from './services/gemini';
import { CallModal } from './components/CallModal';
import { getSocket, connectSocket } from './services/api';
import { t } from './services/i18n';
import DOMPurify from 'dompurify';

// --- Helper: Date Utilities ---
const isSameDay = (ts1: number, ts2: number) => {
    const d1 = new Date(ts1);
    const d2 = new Date(ts2);
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
};

const formatDateSeparator = (ts: number, lang: 'en' | 'ru') => {
    const date = new Date(ts);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (isSameDay(ts, today.getTime())) return t('chat.today', lang);
    if (isSameDay(ts, yesterday.getTime())) return t('chat.yesterday', lang);
    
    return date.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
};

const SafeText = ({ text, className }: { text: string, className?: string }) => {
    const sanitized = DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    return <span className={className} dangerouslySetInnerHTML={{__html: sanitized}} />;
};

// --- Components ---

// Manga Image Component
const LazyImage = ({ src, onClick }: { src: string, onClick: () => void }) => {
    const [loaded, setLoaded] = useState(false);
    return (
        <div className="relative border-2 border-black dark:border-white overflow-hidden bg-gray-100 dark:bg-gray-900 min-w-[200px] min-h-[200px] cursor-pointer group shadow-manga-sm dark:shadow-manga-sm-dark" onClick={onClick}>
            {!loaded && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="animate-spin" size={24} />
                </div>
            )}
            <img 
                src={src} 
                loading="lazy" 
                onLoad={() => setLoaded(true)}
                className={`max-w-full max-h-80 object-cover transition-opacity duration-300 grayscale hover:grayscale-0 transition-all ${loaded ? 'opacity-100' : 'opacity-0'}`} 
            />
        </div>
    )
}

// Lightbox Component
const Lightbox = ({ src, onClose }: { src: string, onClose: () => void }) => {
    return (
        <div className="fixed inset-0 z-[100] bg-white/95 dark:bg-black/95 flex items-center justify-center p-4 halftone-light dark:halftone-dark" onClick={onClose}>
            <button onClick={onClose} className="absolute top-4 right-4 p-3 border-2 border-black dark:border-white bg-white dark:bg-black hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors z-20 shadow-manga dark:shadow-manga-dark">
                <X size={24} />
            </button>
            <img 
                src={src} 
                className="max-w-full max-h-full object-contain border-4 border-black dark:border-white shadow-manga dark:shadow-manga-dark" 
                onClick={(e) => e.stopPropagation()}
            />
        </div>
    )
}

// Manga Switch Component
const Switch = ({ checked, onChange }: { checked: boolean, onChange: () => void }) => (
    <div 
        onClick={onChange} 
        className={`relative w-12 h-6 border-2 border-black dark:border-white cursor-pointer transition-colors ${checked ? 'bg-black dark:bg-white' : 'bg-white dark:bg-black'}`}
    >
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 border-2 border-black dark:border-white bg-white dark:bg-black transition-transform ${checked ? 'translate-x-6' : 'translate-x-0'}`}></div>
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
        const setAudioData = () => { if(!isNaN(audio.duration)) setDuration(audio.duration); };
        const updateProgress = () => { setProgress(audio.currentTime); };
        const onEnd = () => { setIsPlaying(false); setProgress(0); };
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
        if (isPlaying) audioRef.current.pause(); else audioRef.current.play();
        setIsPlaying(!isPlaying);
    };

    return (
        <div className="flex items-center gap-3 w-full min-w-[200px] max-w-[280px] p-2 border-2 border-black dark:border-white bg-white dark:bg-black text-black dark:text-white shadow-manga-sm dark:shadow-manga-sm-dark">
            <audio ref={audioRef} src={src} preload="metadata" />
            <button onClick={togglePlay} className="border-2 border-black dark:border-white p-1 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors">
                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <input 
                type="range" min={0} max={duration || 100} value={progress} 
                onChange={(e) => { const val = Number(e.target.value); if (audioRef.current) audioRef.current.currentTime = val; setProgress(val); }}
                className="w-full h-2 bg-gray-200 dark:bg-gray-800 border border-black dark:border-white"
            />
        </div>
    );
};

// --- Group Creation Modal ---
const CreateGroupModal = ({ chats, userCache, onClose, onCreate }: { chats: Chat[], userCache: Record<string, User>, onClose: () => void, onCreate: (name: string, userIds: string[]) => void }) => {
    const [selected, setSelected] = useState<string[]>([]);
    const [groupName, setGroupName] = useState('');
    
    // Deduplicate peers available to add
    const peerUsers = chats.map(c => {
         const peerId = c.participants.find(pid => userCache[pid] && !userCache[pid].publicKey); 
         const peer = Object.values(userCache).find(u => c.participants.includes(u.id));
         return peer;
    }).filter((u): u is User => !!u && u.id !== GEMINI_USER.id);
    
    const uniquePeers = Array.from(new Map(peerUsers.map(u => [u.id, u])).values());

    const toggleSelect = (id: string) => {
        if (selected.includes(id)) setSelected(selected.filter(s => s !== id));
        else setSelected([...selected, id]);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 dark:bg-black/90 p-4">
             <div className="bg-white dark:bg-black border-4 border-black dark:border-white w-full max-w-lg flex flex-col shadow-manga dark:shadow-manga-dark h-[80vh]">
                 <div className="p-4 border-b-4 border-black dark:border-white bg-black text-white dark:bg-white dark:text-black flex justify-between items-center">
                     <h2 className="text-xl font-bold uppercase tracking-widest">New Group</h2>
                     <button onClick={onClose}><X size={24}/></button>
                 </div>
                 <div className="p-4 border-b-4 border-black dark:border-white">
                     <input 
                        value={groupName}
                        onChange={e => setGroupName(e.target.value)}
                        placeholder="Group Name"
                        className="w-full bg-transparent border-2 border-black dark:border-white p-3 font-bold outline-none text-xl"
                     />
                 </div>
                 <div className="flex-1 overflow-auto p-4 space-y-2">
                     {uniquePeers.map(u => (
                         <div key={u.id} onClick={() => toggleSelect(u.id)} className="flex items-center gap-3 p-2 border-2 border-transparent hover:bg-gray-100 dark:hover:bg-gray-900 cursor-pointer">
                             <div className="w-6 h-6 border-2 border-black dark:border-white flex items-center justify-center">
                                 {selected.includes(u.id) && <div className="w-4 h-4 bg-black dark:bg-white"></div>}
                             </div>
                             <img src={u.avatar} className="w-10 h-10 border border-black dark:border-white grayscale object-cover"/>
                             <SafeText text={u.username} className="font-bold uppercase" />
                         </div>
                     ))}
                 </div>
                 <div className="p-4 border-t-4 border-black dark:border-white">
                     <button 
                        onClick={() => { onCreate(groupName, selected); onClose(); }}
                        disabled={selected.length === 0 || !groupName.trim()}
                        className="w-full bg-black text-white dark:bg-white dark:text-black font-black py-3 uppercase disabled:opacity-50"
                     >
                         CREATE GROUP
                     </button>
                 </div>
             </div>
        </div>
    )
}

// --- Group Settings Modal ---
const GroupSettingsModal = ({ chat, currentUser, userCache, onClose, onUpdate, onAddMember, onRemoveMember, onLeave }: { chat: Chat, currentUser: User, userCache: Record<string, User>, onClose: () => void, onUpdate: (name: string) => void, onAddMember: (ids: string[]) => void, onRemoveMember: (id: string) => void, onLeave: () => void }) => {
    const [name, setName] = useState(chat.name || '');
    const isAdmin = chat.adminIds?.includes(currentUser.id);
    const [isAdding, setIsAdding] = useState(false);
    const [newUserIds, setNewUserIds] = useState<string[]>([]);

    // Possible users to add (simplified: all known users from cache not in group)
    const availableUsers = Object.values(userCache).filter(u => !chat.participants.includes(u.id));

    const handleAdd = () => {
        if(newUserIds.length > 0) {
            onAddMember(newUserIds);
            setIsAdding(false);
            setNewUserIds([]);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 dark:bg-black/90 p-4">
             <div className="bg-white dark:bg-black border-4 border-black dark:border-white w-full max-w-md flex flex-col shadow-manga dark:shadow-manga-dark max-h-[90vh]">
                 <div className="p-4 border-b-4 border-black dark:border-white bg-black text-white dark:bg-white dark:text-black flex justify-between items-center">
                     <h2 className="text-xl font-bold uppercase tracking-widest">Group Settings</h2>
                     <button onClick={onClose}><X size={24}/></button>
                 </div>
                 
                 <div className="p-6 space-y-4 overflow-y-auto">
                     <div className="flex justify-center">
                         <img src={chat.avatar} className="w-24 h-24 border-4 border-black dark:border-white object-cover"/>
                     </div>
                     
                     <div>
                         <label className="font-bold text-xs uppercase block mb-1">Group Name</label>
                         <div className="flex gap-2">
                             <input 
                                value={name} 
                                onChange={e => setName(e.target.value)}
                                disabled={!isAdmin}
                                className="flex-1 bg-transparent border-2 border-black dark:border-white p-2 font-bold outline-none disabled:opacity-50"
                             />
                             {isAdmin && <button onClick={() => onUpdate(name)} className="p-2 bg-black text-white dark:bg-white dark:text-black border-2 border-transparent"><Check size={20}/></button>}
                         </div>
                     </div>

                     <div>
                         <div className="flex justify-between items-center mb-2">
                            <label className="font-bold text-xs uppercase block">Members ({chat.participants.length})</label>
                            {isAdmin && <button onClick={() => setIsAdding(!isAdding)} className="text-xs border border-black dark:border-white px-1 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black uppercase">+ Add</button>}
                         </div>
                         
                         {isAdding && (
                             <div className="mb-2 p-2 border-2 border-black dark:border-white bg-gray-100 dark:bg-gray-900">
                                 <div className="max-h-32 overflow-y-auto mb-2">
                                     {availableUsers.map(u => (
                                         <div key={u.id} onClick={() => setNewUserIds(prev => prev.includes(u.id) ? prev.filter(id=>id!==u.id) : [...prev, u.id])} className="flex gap-2 items-center cursor-pointer hover:bg-white dark:hover:bg-black p-1">
                                             <div className={`w-4 h-4 border border-black dark:border-white ${newUserIds.includes(u.id) ? 'bg-black dark:bg-white' : ''}`}></div>
                                             <span>{u.username}</span>
                                         </div>
                                     ))}
                                     {availableUsers.length === 0 && <p className="text-xs italic">No contacts to add</p>}
                                 </div>
                                 <button onClick={handleAdd} className="w-full bg-black text-white dark:bg-white dark:text-black text-xs py-1">CONFIRM ADD</button>
                             </div>
                         )}

                         <div className="space-y-2 max-h-48 overflow-y-auto">
                             {chat.participants.map(pid => {
                                 const user = userCache[pid] || (pid === currentUser.id ? currentUser : {id:pid, username:'Unknown', avatar:''});
                                 return (
                                     <div key={pid} className="flex justify-between items-center p-2 border border-black dark:border-white">
                                         <div className="flex items-center gap-2">
                                             <img src={user.avatar} className="w-8 h-8 border border-black dark:border-white object-cover"/>
                                             <span className="font-bold">{user.username}</span>
                                             {chat.adminIds?.includes(pid) && <span className="text-[10px] bg-black text-white px-1">ADMIN</span>}
                                         </div>
                                         {isAdmin && pid !== currentUser.id && (
                                             <button onClick={() => onRemoveMember(pid)} className="text-accent hover:bg-accent hover:text-white p-1 rounded"><UserMinus size={16}/></button>
                                         )}
                                     </div>
                                 )
                             })}
                         </div>
                     </div>

                     <button onClick={onLeave} className="w-full border-2 border-accent text-accent font-bold py-3 uppercase hover:bg-accent hover:text-white transition-colors flex justify-center gap-2 items-center mt-4">
                         <LeaveIcon size={20}/> Leave Group
                     </button>
                 </div>
             </div>
        </div>
    )
}

// --- Admin Panel ---
const AdminPanel = ({ onClose, lang }: { onClose: () => void, lang: 'en'|'ru' }) => {
    const [users, setUsers] = useState<User[]>([]);
    
    useEffect(() => { Storage.getAdminUsers().then(setUsers).catch(() => onClose()); }, []);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 dark:bg-black/90 p-4 font-mono">
             <div className="bg-white dark:bg-black border-4 border-black dark:border-white w-full max-w-4xl h-[85vh] flex flex-col shadow-manga dark:shadow-manga-dark">
                 <div className="p-4 border-b-4 border-black dark:border-white flex justify-between items-center bg-black text-white dark:bg-white dark:text-black">
                     <h2 className="text-2xl font-bold uppercase tracking-widest">{t('admin.panel', lang)}</h2>
                     <button onClick={onClose}><X size={24}/></button>
                 </div>
                 <div className="flex-1 overflow-auto p-4">
                     <table className="w-full border-collapse text-left">
                         <thead>
                             <tr className="border-b-2 border-black dark:border-white text-sm uppercase">
                                 <th className="p-2">User</th>
                                 <th className="p-2">Status</th>
                                 <th className="p-2">Role</th>
                                 <th className="p-2">Action</th>
                             </tr>
                         </thead>
                         <tbody>
                             {users.map(u => (
                                 <tr key={u.id} className="border-b border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-900">
                                     <td className="p-2 flex items-center gap-2">
                                         <div className="w-8 h-8 border border-black dark:border-white overflow-hidden"><img src={u.avatar} className="w-full h-full grayscale"/></div>
                                         <SafeText text={u.username} />
                                     </td>
                                     <td className="p-2">{u.isOnline ? 'ONLINE' : 'OFFLINE'}</td>
                                     <td className="p-2">{u.isAdmin ? 'ADMIN' : 'USER'}</td>
                                     <td className="p-2 flex gap-2">
                                         <button onClick={() => {Storage.toggleAdminStatus(u.id); onClose()}} className="border border-black dark:border-white px-2 text-xs hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors">{t('admin.makeAdmin', lang)}</button>
                                     </td>
                                 </tr>
                             ))}
                         </tbody>
                     </table>
                 </div>
             </div>
        </div>
    )
}

// --- Broadcast Modal ---
const BroadcastModal = ({ chats, userCache, onClose, onSend, lang }: { chats: Chat[], userCache: Record<string, User>, onClose: () => void, onSend: (userIds: string[], text: string) => void, lang: 'en'|'ru' }) => {
    const [selected, setSelected] = useState<string[]>([]);
    const [text, setText] = useState('');
    
    // Get unique peers from chats
    const peers = chats.map(c => {
        const peerId = c.participants.find(p => p !== 'current-user-id-placeholder' && p !== GEMINI_USER.id); // Need actual user ID check in real usage, passing simple here
        return peerId; 
    }).filter(Boolean);

    const toggleSelect = (id: string) => {
        if (selected.includes(id)) setSelected(selected.filter(s => s !== id));
        else setSelected([...selected, id]);
    };

    // Re-derive peers properly in the render
    const peerUsers = chats.map(c => {
         // We need a way to know who is 'me' to filter correctly, but since we iterate chats we can just grab the peer from userCache
         // A hacky way is to find the user in userCache that matches a participant
         const pId = c.participants.find(pid => userCache[pid] && !userCache[pid].publicKey); // Hack: userCache usually populated for peers
         const peer = Object.values(userCache).find(u => c.participants.includes(u.id));
         return peer;
    }).filter((u): u is User => !!u && u.id !== GEMINI_USER.id);
    
    // Deduplicate
    const uniquePeers = Array.from(new Map(peerUsers.map(u => [u.id, u])).values());

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 dark:bg-black/90 p-4">
             <div className="bg-white dark:bg-black border-4 border-black dark:border-white w-full max-w-lg flex flex-col shadow-manga dark:shadow-manga-dark h-[80vh]">
                 <div className="p-4 border-b-4 border-black dark:border-white bg-black text-white dark:bg-white dark:text-black flex justify-between items-center">
                     <h2 className="text-xl font-bold uppercase tracking-widest">{t('nav.broadcast', lang)}</h2>
                     <button onClick={onClose}><X size={24}/></button>
                 </div>
                 <div className="flex-1 overflow-auto p-4 space-y-2">
                     {uniquePeers.map(u => (
                         <div key={u.id} onClick={() => toggleSelect(u.id)} className="flex items-center gap-3 p-2 border-2 border-transparent hover:bg-gray-100 dark:hover:bg-gray-900 cursor-pointer">
                             <div className="w-6 h-6 border-2 border-black dark:border-white flex items-center justify-center">
                                 {selected.includes(u.id) && <div className="w-4 h-4 bg-black dark:bg-white"></div>}
                             </div>
                             <img src={u.avatar} className="w-10 h-10 border border-black dark:border-white grayscale object-cover"/>
                             <SafeText text={u.username} className="font-bold uppercase" />
                         </div>
                     ))}
                 </div>
                 <div className="p-4 border-t-4 border-black dark:border-white">
                     <textarea 
                        value={text} 
                        onChange={e => setText(e.target.value)} 
                        className="w-full border-2 border-black dark:border-white bg-transparent p-2 mb-2 h-20 font-bold outline-none" 
                        placeholder={t('chat.start', lang)}
                     />
                     <button 
                        onClick={() => { onSend(selected, text); onClose(); }}
                        disabled={selected.length === 0 || !text.trim()}
                        className="w-full bg-black text-white dark:bg-white dark:text-black font-black py-3 uppercase disabled:opacity-50"
                     >
                         SEND TO {selected.length}
                     </button>
                 </div>
             </div>
        </div>
    )
}

// --- Profile Modal ---
const ProfileModal = ({ user, onClose, onUpdate, lang }: { user: User, onClose: () => void, onUpdate: (u: Partial<User>) => Promise<void>, lang: 'en'|'ru' }) => {
    const [username, setUsername] = useState(user.username);
    const [status, setStatus] = useState(user.status || '');
    const [avatar, setAvatar] = useState(user.avatar || '');

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const reader = new FileReader();
            reader.onload = (ev) => { if(ev.target?.result) setAvatar(ev.target.result as string); }
            reader.readAsDataURL(e.target.files[0]);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 dark:bg-black/90 p-4 halftone-light dark:halftone-dark">
            <div className="bg-white dark:bg-black text-black dark:text-white p-8 border-4 border-black dark:border-white shadow-manga dark:shadow-manga-dark w-full max-w-sm relative">
                <button onClick={onClose} className="absolute top-4 right-4"><X size={24} /></button>
                <h2 className="text-3xl font-comic mb-6 uppercase transform -rotate-2">{t('profile.edit', lang)}</h2>
                
                <div className="flex justify-center mb-6">
                    <div className="relative group cursor-pointer w-32 h-32 border-4 border-black dark:border-white overflow-hidden bg-gray-200">
                        <img src={avatar} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all" />
                        <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 cursor-pointer">
                            <Camera className="text-white" />
                            <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                        </label>
                    </div>
                </div>

                <div className="space-y-4">
                    <input 
                        type="text" value={username} onChange={e => setUsername(e.target.value)}
                        className="w-full bg-transparent border-2 border-black dark:border-white p-3 font-bold outline-none focus:bg-gray-100 dark:focus:bg-gray-900 placeholder-gray-500"
                        placeholder={t('auth.username', lang)}
                    />
                    <input 
                        type="text" value={status} onChange={e => setStatus(e.target.value)}
                        className="w-full bg-transparent border-2 border-black dark:border-white p-3 font-bold outline-none focus:bg-gray-100 dark:focus:bg-gray-900 placeholder-gray-500"
                        placeholder="Status"
                    />
                    <button 
                        onClick={() => { onUpdate({ username, status, avatar }); onClose(); }} 
                        className="w-full bg-black text-white dark:bg-white dark:text-black font-black py-3 border-2 border-transparent hover:bg-white hover:text-black hover:border-black dark:hover:bg-black dark:hover:text-white dark:hover:border-white transition-all uppercase tracking-widest shadow-manga-sm dark:shadow-manga-sm-dark"
                    >
                        {t('profile.save', lang)}
                    </button>
                </div>
            </div>
        </div>
    )
}

// --- Settings Modal ---
const SettingsModal = ({ user, onClose, onUpdate, lang }: { user: User, onClose: () => void, onUpdate: (u: Partial<User>) => Promise<void>, lang: 'en'|'ru' }) => {
    const [settings, setSettings] = useState<UserSettings>(user.settings || {
        notifications: true, soundEnabled: true, privacyMode: false, theme: 'dark', chatWallpaper: 'default', fontSize: 'medium', language: 'en'
    });

    const handleSettingChange = (key: keyof UserSettings, value: any) => {
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);
        onUpdate({ settings: newSettings });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 dark:bg-black/90 p-4">
            <div className="bg-white dark:bg-black border-4 border-black dark:border-white shadow-manga dark:shadow-manga-dark w-full max-w-lg h-[80vh] flex flex-col overflow-hidden">
                <div className="p-6 border-b-4 border-black dark:border-white bg-black text-white dark:bg-white dark:text-black flex justify-between items-center">
                    <h2 className="text-2xl font-comic uppercase tracking-widest">{t('settings.title', lang)}</h2>
                    <button onClick={onClose}><X size={24}/></button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    
                    {/* Language */}
                    <section>
                        <h3 className="font-black text-lg uppercase mb-4 border-b-2 border-black dark:border-white inline-block">{t('settings.language', lang)}</h3>
                        <div className="flex gap-4">
                             <button onClick={() => handleSettingChange('language', 'en')} className={`flex-1 py-2 border-2 border-black dark:border-white font-bold uppercase ${settings.language === 'en' ? 'bg-black text-white dark:bg-white dark:text-black' : 'hover:bg-gray-200 dark:hover:bg-gray-800'}`}>English</button>
                             <button onClick={() => handleSettingChange('language', 'ru')} className={`flex-1 py-2 border-2 border-black dark:border-white font-bold uppercase ${settings.language === 'ru' ? 'bg-black text-white dark:bg-white dark:text-black' : 'hover:bg-gray-200 dark:hover:bg-gray-800'}`}>Русский</button>
                        </div>
                    </section>

                    {/* Notifications */}
                    <section className="space-y-4">
                        <h3 className="font-black text-lg uppercase mb-4 border-b-2 border-black dark:border-white inline-block">{t('settings.notifications', lang)}</h3>
                        <div className="flex justify-between items-center">
                            <div><p className="font-bold">{t('settings.push', lang)}</p><p className="text-xs opacity-70">{t('settings.pushDesc', lang)}</p></div>
                            <Switch checked={settings.notifications} onChange={() => handleSettingChange('notifications', !settings.notifications)} />
                        </div>
                        <div className="flex justify-between items-center">
                            <div><p className="font-bold">{t('settings.sound', lang)}</p><p className="text-xs opacity-70">{t('settings.soundDesc', lang)}</p></div>
                            <Switch checked={settings.soundEnabled} onChange={() => handleSettingChange('soundEnabled', !settings.soundEnabled)} />
                        </div>
                    </section>

                    {/* Appearance */}
                    <section className="space-y-4">
                        <h3 className="font-black text-lg uppercase mb-4 border-b-2 border-black dark:border-white inline-block">{t('settings.appearance', lang)}</h3>
                         <div className="flex justify-between items-center">
                            <div><p className="font-bold">{t('settings.wallpaper', lang)}</p></div>
                            <div className="flex gap-2">
                                {['default', 'bg-[url(https://www.transparenttextures.com/patterns/cubes.png)]'].map((bg, i) => (
                                    <div key={i} onClick={() => handleSettingChange('chatWallpaper', bg)} className={`w-8 h-8 border-2 border-black dark:border-white cursor-pointer ${settings.chatWallpaper === bg ? 'bg-black dark:bg-white' : 'bg-gray-200'}`}></div>
                                ))}
                            </div>
                        </div>
                        <div className="flex justify-between items-center">
                             <div><p className="font-bold">{t('settings.fontsize', lang)}</p></div>
                             <div className="flex border-2 border-black dark:border-white">
                                 {['small', 'medium', 'large'].map(s => (
                                     <button key={s} onClick={() => handleSettingChange('fontSize', s)} className={`px-3 py-1 text-xs font-bold uppercase ${settings.fontSize === s ? 'bg-black text-white dark:bg-white dark:text-black' : 'hover:bg-gray-200 dark:hover:bg-gray-800'}`}>{s[0]}</button>
                                 ))}
                             </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    )
}

// --- Main App ---
export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [view, setView] = useState<'auth' | 'app'>('auth');
  const [currentTab, setCurrentTab] = useState<'chats' | 'calls'>('chats');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [lang, setLang] = useState<'en'|'ru'>('en');
  
  // Chat State
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [replyTo, setReplyTo] = useState<ReplyInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [showGroupCreateModal, setShowGroupCreateModal] = useState(false);
  const [showGroupSettingsModal, setShowGroupSettingsModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [userCache, setUserCache] = useState<Record<string, User>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
      if (theme === 'dark') document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
  }, [theme]);

  useEffect(() => {
      if(currentUser?.settings) {
          setTheme(currentUser.settings.theme);
          setLang(currentUser.settings.language || 'en');
      }
  }, [currentUser]);

  useEffect(() => {
      const socket = getSocket();
      if(!socket || !currentUser) return;
      
      const onNewMessage = async (msg: Message) => {
        if (msg.chatId === activeChatId) {
            const plainText = await CryptoService.decryptMessage(msg.content, msg.chatId);
            setMessages(prev => [...prev, { ...msg, content: plainText }]);
            Storage.markMessagesAsRead(msg.chatId, currentUser.id);
        }
        loadChats(currentUser.id);
      };

      const onCallOffer = (data: any) => {
          setActiveCall({
              id: 'incoming', callerId: data.callerId, receiverId: currentUser.id,
              status: 'ringing', isVideo: true, isMuted: false, offerSignal: data.offer
          });
      };

      const onChatUpdated = (data: any) => {
          loadChats(currentUser.id);
      };

      socket.on('new_message', onNewMessage);
      socket.on('call_offer', onCallOffer);
      socket.on('chat_updated', onChatUpdated);
      return () => { 
          socket.off('new_message', onNewMessage); 
          socket.off('call_offer', onCallOffer);
          socket.off('chat_updated', onChatUpdated);
      }
  }, [currentUser, activeChatId]);

  const loadChats = async (userId: string) => {
      const c = await Storage.getChats(userId);
      setChats(c);
      const missingIds = new Set<string>();
      c.forEach(chat => chat.participants.forEach(p => { if(p !== userId && !userCache[p]) missingIds.add(p); }));
      if(missingIds.size > 0) {
          const users = await Storage.getUsersByIds(Array.from(missingIds));
          setUserCache(prev => { const n = {...prev}; users.forEach(u => n[u.id] = u); return n; });
      }
  };

  const loadMessages = async (chatId: string) => {
      const encrypted = await Storage.getMessages(chatId);
      const decrypted = await Promise.all(encrypted.map(async m => {
          // SECURITY: Sanitize decrypted text
          if(m.type === 'text') return { ...m, content: DOMPurify.sanitize(await CryptoService.decryptMessage(m.content, chatId), {ALLOWED_TAGS:[], ALLOWED_ATTR:[]}) };
          return m;
      }));
      setMessages(decrypted);
      setTimeout(() => messagesEndRef.current?.scrollIntoView(), 100);
  };

  useEffect(() => { if(activeChatId) loadMessages(activeChatId); }, [activeChatId]);

  const handleSendMessage = async (type: 'text'|'image'|'video'|'audio'='text', contentVal?: string, mediaUrl?: string) => {
      if (!currentUser || !activeChatId) return;
      const content = contentVal || inputText;
      if (!content && !mediaUrl) return;

      let contentToSave = content;
      if(type === 'text') contentToSave = await CryptoService.encryptMessage(content, activeChatId);
      
      const newMessage: Message = {
          id: crypto.randomUUID(), chatId: activeChatId, senderId: currentUser.id,
          content: contentToSave, type, timestamp: Date.now(), status: 'sent', mediaUrl, replyTo: replyTo || undefined
      };

      setMessages(prev => [...prev, { ...newMessage, content: type === 'text' ? content : contentToSave }]);
      setInputText(''); setReplyTo(null);
      await Storage.sendMessage(newMessage);

      // Gemini Logic
      const chat = chats.find(c => c.id === activeChatId);
      if(chat?.type === 'private' && chat?.participants.includes(GEMINI_USER.id)) {
          try {
              const responseText = await getGeminiResponse(content);
              const enc = await CryptoService.encryptMessage(responseText, activeChatId);
              const aiMsg: Message = { id: crypto.randomUUID(), chatId: activeChatId, senderId: GEMINI_USER.id, content: enc, type: 'text', timestamp: Date.now(), status: 'sent' };
              await Storage.sendMessage(aiMsg);
              setMessages(prev => [...prev, { ...aiMsg, content: responseText }]);
          } catch(e){}
      }
  };

  const handleBroadcast = async (userIds: string[], text: string) => {
      if(!currentUser) return;
      for(const peerId of userIds) {
          let chat = chats.find(c => c.participants.includes(peerId) && c.type === 'private');
          if(!chat) {
              chat = await Storage.createChat(currentUser.id, peerId);
          }
          const encrypted = await CryptoService.encryptMessage(text, chat.id);
          const msg: Message = {
              id: crypto.randomUUID(), chatId: chat.id, senderId: currentUser.id,
              content: encrypted, type: 'text', timestamp: Date.now(), status: 'sent'
          };
          await Storage.sendMessage(msg);
      }
      loadChats(currentUser.id);
  };
  
  const handleCreateGroup = async (name: string, userIds: string[]) => {
      if(!currentUser) return;
      await Storage.createGroup(name, userIds);
      loadChats(currentUser.id);
  }

  const handleAuth = async (e: React.FormEvent, isRegister: boolean) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      try {
          const u = isRegister 
            ? await Storage.registerUser(form.username.value, form.password.value)
            : await Storage.loginUser(form.username.value, form.password.value);
          setCurrentUser(u); setView('app'); loadChats(u.id);
      } catch (e: any) { alert(e.message); }
  };

  const getPeerInfo = (chat: Chat) => {
      if(chat.type === 'group') {
          return {
              id: chat.id,
              username: chat.name || 'Group Chat',
              avatar: chat.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=Group',
              isOnline: true 
          };
      }
      const peerId = chat.participants.find(p => p !== currentUser?.id);
      if(peerId === GEMINI_USER.id) return GEMINI_USER;
      return userCache[peerId!] || { id: peerId || 'unknown', username: 'Loading...', avatar: '', isOnline: false };
  }

  if (view === 'auth') {
      return (
          <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center p-6 halftone-light dark:halftone-dark">
              <div className="bg-white dark:bg-black border-4 border-black dark:border-white shadow-manga dark:shadow-manga-dark p-10 w-full max-w-md relative overflow-hidden">
                  <div className="absolute -top-10 -right-10 w-32 h-32 bg-black dark:bg-white transform rotate-45"></div>
                  <div className="text-center mb-10 relative z-10">
                      <h1 className="text-6xl font-comic uppercase text-black dark:text-white transform -rotate-3 mb-2 drop-shadow-[4px_4px_0_rgba(128,128,128,1)]">{t('app.name', 'en')}</h1>
                      <p className="font-mono font-bold bg-black text-white dark:bg-white dark:text-black inline-block px-2 transform rotate-1">{t('app.slogan', 'en')}</p>
                  </div>
                  <AuthForm onSubmit={handleAuth} />
                  <div className="mt-8 flex justify-center">
                       <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2 border-2 border-black dark:border-white hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full">
                           {theme === 'dark' ? <Sun/> : <Moon/>}
                       </button>
                  </div>
              </div>
          </div>
      )
  }

  const activeChat = chats.find(c => c.id === activeChatId);
  const peer = activeChat ? getPeerInfo(activeChat) : null;
  const fontSizeClass = currentUser?.settings?.fontSize === 'small' ? 'text-sm' : currentUser?.settings?.fontSize === 'large' ? 'text-xl' : 'text-base';

  return (
    <div className={`flex h-[100dvh] w-full bg-white dark:bg-black text-black dark:text-white overflow-hidden ${fontSizeClass}`}>
      {activeCall && currentUser && (
          <CallModal session={activeCall} onEnd={() => setActiveCall(null)} peerName={getPeerInfo(chats.find(c => c.participants.includes(activeCall.callerId === currentUser.id ? activeCall.receiverId : activeCall.callerId))!).username} currentUserId={currentUser.id} />
      )}
      {showProfileModal && currentUser && <ProfileModal user={currentUser} onClose={() => setShowProfileModal(false)} onUpdate={async (u) => { const n = await Storage.updateUser(currentUser.id, u); setCurrentUser(n); }} lang={lang} />}
      {showSettingsModal && currentUser && <SettingsModal user={currentUser} onClose={() => setShowSettingsModal(false)} onUpdate={async (u) => { const n = await Storage.updateUser(currentUser.id, u); setCurrentUser(n); }} lang={lang} />}
      {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} lang={lang} />}
      {showBroadcastModal && <BroadcastModal chats={chats} userCache={userCache} onClose={() => setShowBroadcastModal(false)} onSend={handleBroadcast} lang={lang} />}
      {showGroupCreateModal && <CreateGroupModal chats={chats} userCache={userCache} onClose={() => setShowGroupCreateModal(false)} onCreate={handleCreateGroup} />}
      {showGroupSettingsModal && activeChat && currentUser && (
          <GroupSettingsModal 
            chat={activeChat} 
            currentUser={currentUser}
            userCache={userCache}
            onClose={() => setShowGroupSettingsModal(false)} 
            onUpdate={async (name) => { await Storage.updateGroupInfo(activeChat.id, name); loadChats(currentUser.id); }}
            onAddMember={async (ids) => { await Storage.addGroupMembers(activeChat.id, ids); loadChats(currentUser.id); }}
            onRemoveMember={async (id) => { await Storage.removeGroupMember(activeChat.id, id); loadChats(currentUser.id); }}
            onLeave={async () => { await Storage.leaveGroup(activeChat.id); setActiveChatId(null); setShowGroupSettingsModal(false); loadChats(currentUser.id); }}
          />
      )}
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      {/* Sidebar */}
      <div className={`w-full md:w-96 flex flex-col border-r-4 border-black dark:border-white ${activeChatId ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 border-b-4 border-black dark:border-white bg-white dark:bg-black z-10">
              <div className="flex justify-between items-center mb-4">
                  <h2 className="text-3xl font-comic uppercase tracking-tighter">{t('app.name', lang)}</h2>
                  <div className="flex gap-2">
                      <button onClick={() => setShowGroupCreateModal(true)} className="p-2 border-2 border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black" title="Create Group"><Users size={20}/></button>
                      <button onClick={() => setShowBroadcastModal(true)} className="p-2 border-2 border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black" title="Broadcast"><Megaphone size={20}/></button>
                      {currentUser?.isAdmin && <button onClick={() => setShowAdminPanel(true)} className="p-2 border-2 border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"><Shield size={20}/></button>}
                      <button onClick={() => setShowSettingsModal(true)} className="p-2 border-2 border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"><Settings size={20}/></button>
                      <div onClick={() => setShowProfileModal(true)} className="w-10 h-10 border-2 border-black dark:border-white overflow-hidden cursor-pointer hover:opacity-80"><img src={currentUser?.avatar} className="w-full h-full object-cover grayscale"/></div>
                  </div>
              </div>
              
              <div className="flex gap-2 mb-4">
                  <button onClick={() => setCurrentTab('chats')} className={`flex-1 py-2 font-black uppercase border-2 border-black dark:border-white ${currentTab === 'chats' ? 'bg-black text-white dark:bg-white dark:text-black' : 'hover:bg-gray-200 dark:hover:bg-gray-800'}`}>{t('nav.chats', lang)}</button>
                  <button onClick={() => setCurrentTab('calls')} className={`flex-1 py-2 font-black uppercase border-2 border-black dark:border-white ${currentTab === 'calls' ? 'bg-black text-white dark:bg-white dark:text-black' : 'hover:bg-gray-200 dark:hover:bg-gray-800'}`}>{t('nav.calls', lang)}</button>
              </div>

              <div className="relative">
                  <Search className="absolute left-3 top-3" size={20}/>
                  <input 
                    value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    placeholder={t('search.placeholder', lang)}
                    className="w-full bg-transparent border-2 border-black dark:border-white pl-10 pr-4 py-2 font-bold outline-none focus:shadow-manga-sm dark:focus:shadow-manga-sm-dark transition-shadow placeholder-gray-500"
                  />
              </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-gray-50 dark:bg-gray-900">
              {currentTab === 'chats' ? chats.map(chat => {
                  const p = getPeerInfo(chat);
                  // Filter search
                  if(searchQuery && !p.username.toLowerCase().includes(searchQuery.toLowerCase())) return null;
                  const active = chat.id === activeChatId;
                  return (
                      <div key={chat.id} onClick={() => setActiveChatId(chat.id)} className={`flex items-center gap-3 p-3 border-2 border-black dark:border-white cursor-pointer transition-transform active:scale-[0.98] ${active ? 'bg-black text-white dark:bg-white dark:text-black shadow-manga-sm dark:shadow-manga-sm-dark' : 'bg-white dark:bg-black hover:bg-gray-100 dark:hover:bg-gray-900'}`}>
                          <div className="relative">
                              <img src={p.avatar} className="w-12 h-12 border-2 border-current object-cover grayscale"/>
                              {p.isOnline && chat.type === 'private' && <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-current border-2 border-white dark:border-black"></div>}
                          </div>
                          <div className="flex-1 min-w-0">
                              <div className="flex justify-between">
                                  <h4 className="font-black uppercase truncate flex items-center gap-1">
                                      <SafeText text={p.username} />
                                      {chat.type === 'group' && <Users size={12}/>}
                                  </h4>
                                  {chat.unreadCount > 0 && <span className="bg-accent text-white px-1.5 font-bold text-xs border border-black dark:border-white">{chat.unreadCount}</span>}
                              </div>
                              <p className="text-xs font-mono truncate opacity-70">{chat.lastMessage ? (chat.lastMessage.type === 'text' ? chat.lastMessage.content : `[${chat.lastMessage.type.toUpperCase()}]`) : t('chat.start', lang)}</p>
                          </div>
                      </div>
                  )
              }) : (
                  // Calls View (Contacts List)
                  Object.values(userCache).filter(u => u.id !== currentUser?.id && u.id !== GEMINI_USER.id).map(user => (
                      <div key={user.id} className="flex items-center justify-between gap-3 p-3 border-2 border-black dark:border-white bg-white dark:bg-black">
                           <div className="flex items-center gap-3">
                               <img src={user.avatar} className="w-12 h-12 border-2 border-black dark:border-white grayscale object-cover"/>
                               <div>
                                   <h4 className="font-black uppercase"><SafeText text={user.username} /></h4>
                                   <p className="text-xs font-mono">{user.isOnline ? 'ONLINE' : 'OFFLINE'}</p>
                               </div>
                           </div>
                           <div className="flex gap-2">
                                <button onClick={() => setActiveCall({id: 'out', callerId: currentUser!.id, receiverId: user.id, status: 'connected', isVideo: false, isMuted: false})} className="p-2 border-2 border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"><Phone size={18}/></button>
                                <button onClick={() => setActiveCall({id: 'out', callerId: currentUser!.id, receiverId: user.id, status: 'connected', isVideo: true, isMuted: false})} className="p-2 border-2 border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"><Video size={18}/></button>
                           </div>
                      </div>
                  ))
              )}
          </div>
      </div>

      {/* Chat Area */}
      {activeChatId ? (
          <div className="flex-1 flex flex-col relative halftone-light dark:halftone-dark">
              {/* Header */}
              <div className="h-20 border-b-4 border-black dark:border-white bg-white dark:bg-black flex justify-between items-center px-4 z-10 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors" onClick={() => activeChat?.type === 'group' ? setShowGroupSettingsModal(true) : null}>
                  <div className="flex items-center gap-4">
                      <button onClick={(e) => { e.stopPropagation(); setActiveChatId(null); }} className="md:hidden"><ArrowLeft size={24}/></button>
                      <img src={peer?.avatar} className="w-12 h-12 border-2 border-black dark:border-white grayscale"/>
                      <div>
                          <h3 className="font-black text-2xl uppercase italic flex items-center gap-2">
                              <SafeText text={peer?.username || ''} />
                              {activeChat?.type === 'group' && <Edit size={16} className="opacity-50"/>}
                          </h3>
                          <p className="text-xs font-mono border border-black dark:border-white inline-block px-1">
                              {activeChat?.type === 'group' ? `${activeChat.participants.length} members` : (peer?.isOnline ? 'ONLINE' : 'OFFLINE')}
                          </p>
                      </div>
                  </div>
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      {activeChat?.type === 'private' && (
                          <>
                              <button onClick={() => setActiveCall({id: 'out', callerId: currentUser!.id, receiverId: peer!.id, status: 'connected', isVideo: false, isMuted: false})} className="p-2 border-2 border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"><Phone size={20}/></button>
                              <button onClick={() => setActiveCall({id: 'out', callerId: currentUser!.id, receiverId: peer!.id, status: 'connected', isVideo: true, isMuted: false})} className="p-2 border-2 border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"><Video size={20}/></button>
                          </>
                      )}
                      <button onClick={() => setShowMenu(!showMenu)} className="p-2 border-2 border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"><MoreVertical size={20}/></button>
                  </div>
              </div>
              {showMenu && (
                  <div className="absolute top-20 right-4 w-48 bg-white dark:bg-black border-4 border-black dark:border-white shadow-manga dark:shadow-manga-dark z-30">
                      <button onClick={() => Storage.deleteMessage(activeChatId, 'all')} className="w-full text-left p-3 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black font-bold uppercase flex items-center gap-2"><Trash2 size={16}/> {t('chat.clear', lang)}</button>
                  </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.map((msg, i) => {
                      const isMe = msg.senderId === currentUser?.id;
                      const showDate = i === 0 || !isSameDay(msg.timestamp, messages[i-1].timestamp);
                      const sender = userCache[msg.senderId];
                      
                      return (
                          <React.Fragment key={msg.id}>
                              {showDate && <div className="text-center my-4"><span className="bg-black text-white dark:bg-white dark:text-black px-3 py-1 font-black text-xs border-2 border-black dark:border-white">{formatDateSeparator(msg.timestamp, lang)}</span></div>}
                              <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                  <div className={`max-w-[80%] relative group ${isMe ? 'mr-2' : 'ml-2'}`}>
                                      
                                      {/* Group sender name */}
                                      {activeChat?.type === 'group' && !isMe && (
                                          <div className="text-[10px] font-bold mb-1 ml-1 opacity-70 uppercase">{sender?.username || 'Unknown'}</div>
                                      )}

                                      {/* Speech Bubble Tail */}
                                      <div className={`absolute top-4 w-4 h-4 bg-transparent border-t-2 border-black dark:border-white ${isMe ? '-right-2 border-r-2 rotate-45 bg-black dark:bg-white' : '-left-2 border-l-2 -rotate-45 bg-white dark:bg-black'}`}></div>
                                      
                                      <div className={`relative border-2 border-black dark:border-white p-3 shadow-manga-sm dark:shadow-manga-sm-dark ${isMe ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-white text-black dark:bg-black dark:text-white'}`}>
                                          {msg.replyTo && (
                                              <div className={`text-xs mb-2 p-1 border-l-4 ${isMe ? 'border-white/50' : 'border-black/50'}`}>
                                                  <span className="font-bold block">{t('chat.replyTo', lang)}</span>
                                                  <span className="italic opacity-70 line-clamp-1">{msg.replyTo.content || '...'}</span>
                                              </div>
                                          )}
                                          {msg.type === 'text' && <p className="whitespace-pre-wrap font-medium">{msg.content}</p>}
                                          {msg.type === 'image' && <LazyImage src={msg.mediaUrl!} onClick={() => setLightboxSrc(msg.mediaUrl!)} />}
                                          {msg.type === 'audio' && <AudioPlayer src={msg.mediaUrl!} />}
                                          <div className="text-[10px] font-mono mt-1 opacity-70 text-right flex justify-end gap-1 items-center">
                                              {new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                              {isMe && (msg.status === 'read' ? <CheckCheck size={12}/> : <Check size={12}/>)}
                                          </div>
                                      </div>
                                      {/* Reply Button */}
                                      <button onClick={() => setReplyTo({id: msg.id, senderId: msg.senderId, senderName: 'User', content: msg.content, type: msg.type})} className={`absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity ${isMe ? '-left-8' : '-right-8'}`}><Reply size={16}/></button>
                                  </div>
                              </div>
                          </React.Fragment>
                      )
                  })}
                  <div ref={messagesEndRef}/>
              </div>

              {/* Input */}
              <div className="p-4 border-t-4 border-black dark:border-white bg-white dark:bg-black relative">
                  {replyTo && (
                      <div className="absolute bottom-full left-0 w-full bg-gray-100 dark:bg-gray-900 border-t-2 border-black dark:border-white p-2 flex justify-between items-center">
                          <div className="text-sm"><span className="font-bold">{t('chat.replyTo', lang)}:</span> {replyTo.content}</div>
                          <button onClick={() => setReplyTo(null)}><X size={16}/></button>
                      </div>
                  )}
                  <div className="flex gap-2 items-end">
                      <button onClick={() => fileInputRef.current?.click()} className="p-3 border-2 border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors"><Plus size={20}/></button>
                      <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => handleSendMessage(e.target.files![0].type.startsWith('image') ? 'image' : 'video', e.target.files![0].name, URL.createObjectURL(e.target.files![0]))} />
                      
                      <textarea 
                        value={inputText} onChange={e => setInputText(e.target.value)}
                        className="flex-1 bg-transparent border-2 border-black dark:border-white p-3 font-medium outline-none focus:shadow-manga-sm dark:focus:shadow-manga-sm-dark resize-none h-12 max-h-32"
                        placeholder={t('chat.start', lang)}
                      />
                      <button onClick={() => handleSendMessage()} className="p-3 border-2 border-black dark:border-white bg-black text-white dark:bg-white dark:text-black hover:shadow-manga-sm dark:hover:shadow-manga-sm-dark transition-all active:translate-y-1"><Send size={20}/></button>
                  </div>
              </div>
          </div>
      ) : (
          <div className="hidden md:flex flex-1 items-center justify-center flex-col halftone-light dark:halftone-dark p-8 text-center">
              <h2 className="text-6xl font-comic uppercase transform -rotate-6 mb-4 drop-shadow-[4px_4px_0_rgba(0,0,0,1)] dark:drop-shadow-[4px_4px_0_rgba(255,255,255,1)]">{t('app.name', lang)}</h2>
              <p className="font-mono bg-black text-white dark:bg-white dark:text-black px-4 py-2 text-xl border-2 border-white dark:border-black">{t('app.slogan', lang)}</p>
          </div>
      )}
    </div>
  );
}

function AuthForm({ onSubmit }: { onSubmit: any }) {
    const [isRegister, setIsRegister] = useState(false);
    return (
        <form onSubmit={(e) => onSubmit(e, isRegister)} className="space-y-4">
            <input name="username" placeholder="USERNAME" className="w-full bg-gray-100 dark:bg-gray-900 border-2 border-black dark:border-white p-4 font-bold outline-none focus:shadow-manga-sm dark:focus:shadow-manga-sm-dark" required/>
            <input name="password" type="password" placeholder="PASSWORD" className="w-full bg-gray-100 dark:bg-gray-900 border-2 border-black dark:border-white p-4 font-bold outline-none focus:shadow-manga-sm dark:focus:shadow-manga-sm-dark" required/>
            <button className="w-full bg-black text-white dark:bg-white dark:text-black font-black py-4 border-2 border-transparent hover:bg-white hover:text-black hover:border-black dark:hover:bg-black dark:hover:text-white dark:hover:border-white transition-all uppercase tracking-widest shadow-manga dark:shadow-manga-dark active:translate-y-1 active:shadow-none">
                {isRegister ? t('auth.registerAction') : t('auth.loginAction')}
            </button>
            <div className="text-center">
                <button type="button" onClick={() => setIsRegister(!isRegister)} className="text-sm font-bold hover:underline decoration-2 underline-offset-4">
                    {isRegister ? t('auth.hasAccount') : t('auth.noAccount')}
                </button>
            </div>
        </form>
    )
}
