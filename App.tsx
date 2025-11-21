
import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageCircle, Phone, Video, Search, Settings, LogOut, 
  Plus, Send, Mic, Smile, MoreVertical, 
  Trash2, Check, CheckCheck, X, Lock, Camera,
  ArrowUpRight, ArrowDownLeft, PhoneMissed, Moon, Sun, ShieldOff, ShieldCheck,
  Bell, Volume2, Eye, Wallpaper, Type, Play, Pause, StopCircle,
  Reply, Pin, PinOff, Image as ImageIcon, Shield, Megaphone, Users, ArrowLeft, ChevronLeft, Loader2, Globe,
  CheckSquare, Square, Edit, UserPlus, UserMinus, LogOut as LeaveIcon, LayoutGrid, Radio, Tv, Signal,
  UserPlus as AddFriendIcon, FileVideo, ToggleLeft, ToggleRight, Download, Upload, StopCircle as StopRecord
} from 'lucide-react';
import { User, Chat, Message, CallSession, UserSettings, ReplyInfo } from './types';
import * as Storage from './services/storage';
import * as CryptoService from './services/cryptoService';
import { CallModal } from './components/CallModal';
import { getSocket } from './services/api';
import { t } from './services/i18n';
import DOMPurify from 'dompurify';

// ... (Helpers: isSameDay, formatDateSeparator, SafeText, LazyImage, Lightbox, Switch)
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
    if (isSameDay(ts, today.getTime())) return t('chat.today', lang);
    return date.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
};

const SafeText = ({ text, className }: { text: string, className?: string }) => {
    const sanitized = DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    return <span className={className} dangerouslySetInnerHTML={{__html: sanitized}} />;
};

const LazyImage = ({ src, onClick }: { src: string, onClick: () => void }) => {
    const [loaded, setLoaded] = useState(false);
    return (
        <div className="relative border-2 border-black dark:border-white overflow-hidden bg-gray-100 dark:bg-gray-900 min-w-[200px] min-h-[200px] cursor-pointer group shadow-manga-sm dark:shadow-manga-sm-dark transition-transform hover:scale-[1.02]" onClick={onClick}>
            {!loaded && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="animate-spin" size={24} /></div>}
            {/* REMOVED GRAYSCALE HERE */}
            <img src={src} loading="lazy" onLoad={() => setLoaded(true)} className={`max-w-full max-h-80 object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`} />
        </div>
    )
}

const Lightbox = ({ src, onClose }: { src: string, onClose: () => void }) => (
    <div className="fixed inset-0 z-[100] bg-white/95 dark:bg-black/95 flex items-center justify-center p-4 halftone-light dark:halftone-dark animate-fade-in" onClick={onClose}>
        <button onClick={onClose} className="absolute top-4 right-4 p-3 border-2 border-black dark:border-white bg-white dark:bg-black hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors z-20 shadow-manga dark:shadow-manga-dark"><X size={24} /></button>
        {src.match(/\.(mp4|webm|ogg)$/i) ? (
             <video src={src} controls autoPlay className="max-w-full max-h-full border-4 border-black dark:border-white shadow-manga dark:shadow-manga-dark" onClick={(e) => e.stopPropagation()} />
        ) : (
             <img src={src} className="max-w-full max-h-full object-contain border-4 border-black dark:border-white shadow-manga dark:shadow-manga-dark" onClick={(e) => e.stopPropagation()} />
        )}
    </div>
)

const Switch = ({ checked, onChange }: { checked: boolean, onChange: () => void }) => (
    <div onClick={onChange} className={`relative w-12 h-6 border-2 border-black dark:border-white cursor-pointer transition-colors ${checked ? 'bg-black dark:bg-white' : 'bg-white dark:bg-black'}`}>
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 border-2 border-black dark:border-white bg-white dark:bg-black transition-transform ${checked ? 'translate-x-6' : 'translate-x-0'}`}></div>
    </div>
);

const AudioPlayer = ({ src }: { src: string }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const audioRef = useRef<HTMLAudioElement>(null);
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        const update = () => setProgress(audio.currentTime);
        audio.addEventListener('timeupdate', update);
        audio.addEventListener('ended', () => setIsPlaying(false));
        return () => {
            audio.removeEventListener('timeupdate', update);
            audio.removeEventListener('ended', () => setIsPlaying(false));
        };
    }, []);
    return (
        <div className="flex items-center gap-2 p-2 border-2 border-black dark:border-white bg-white dark:bg-black min-w-[200px]">
            <audio ref={audioRef} src={src} />
            <button onClick={() => { if(audioRef.current) { isPlaying ? audioRef.current.pause() : audioRef.current.play(); setIsPlaying(!isPlaying); } }}>{isPlaying?<Pause size={16}/>:<Play size={16}/>}</button>
            <input type="range" max={audioRef.current?.duration||100} value={progress} onChange={(e)=> {if(audioRef.current) audioRef.current.currentTime=Number(e.target.value)}} className="w-full h-1 bg-gray-300 dark:bg-gray-700"/>
        </div>
    )
}

// --- Modals ---
const CreateChannelModal = ({ onClose, onCreate, lang }: any) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 dark:bg-black/90 p-4 animate-fade-in"><div className="bg-white dark:bg-black border-4 border-black p-6 shadow-manga animate-slide-up"><h2 className="text-xl font-bold uppercase">{t('channel.create', lang)}</h2><input id="cname" placeholder={t('channel.name', lang)} className="w-full border-2 border-black p-2 mt-2"/><textarea id="cdesc" placeholder={t('channel.desc', lang)} className="w-full border-2 border-black p-2 mt-2"/><button onClick={()=>{onCreate((document.getElementById('cname') as HTMLInputElement).value, (document.getElementById('cdesc') as HTMLInputElement).value); onClose()}} className="w-full bg-black text-white mt-4 p-2">CREATE</button><button onClick={onClose} className="w-full mt-2">CANCEL</button></div></div>
);
const CreateGroupModal = ({ chats, userCache, onClose, onCreate }: any) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 dark:bg-black/90 p-4 animate-fade-in"><div className="bg-white dark:bg-black border-4 border-black p-6 shadow-manga animate-slide-up"><h2 className="text-xl font-bold uppercase">New Group</h2><input id="gname" placeholder="Name" className="w-full border-2 border-black p-2 mt-2"/><button onClick={()=>{onCreate((document.getElementById('gname') as HTMLInputElement).value, []); onClose()}} className="w-full bg-black text-white mt-4 p-2">CREATE</button><button onClick={onClose} className="w-full mt-2">CANCEL</button></div></div>
);
const GroupSettingsModal = ({ chat, onClose, onLeave }: any) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 dark:bg-black/90 p-4 animate-fade-in"><div className="bg-white dark:bg-black border-4 border-black p-6 shadow-manga animate-slide-up"><h2 className="text-xl font-bold uppercase">{chat.name}</h2><button onClick={onLeave} className="w-full bg-red-600 text-white mt-4 p-2">LEAVE</button><button onClick={onClose} className="w-full mt-2">CLOSE</button></div></div>
);

const AdminPanel = ({ onClose, lang }: { onClose: () => void, lang: 'en'|'ru' }) => {
    const [users, setUsers] = useState<User[]>([]);
    const [regEnabled, setRegEnabled] = useState(true);

    useEffect(() => { 
        Storage.getAdminUsers().then(setUsers).catch(() => onClose());
        Storage.getRegistrationStatus().then(setRegEnabled);
    }, []);

    const toggleReg = async () => {
        await Storage.toggleRegistration(!regEnabled);
        setRegEnabled(!regEnabled);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 dark:bg-black/90 p-4 font-mono animate-fade-in">
             <div className="bg-white dark:bg-black border-4 border-black dark:border-white w-full max-w-4xl h-[85vh] flex flex-col shadow-manga dark:shadow-manga-dark animate-slide-up">
                 <div className="p-4 border-b-4 border-black dark:border-white flex justify-between items-center bg-black text-white dark:bg-white dark:text-black"><h2 className="text-2xl font-bold uppercase tracking-widest">{t('admin.panel', lang)}</h2><button onClick={onClose}><X size={24}/></button></div>
                 <div className="p-4 border-b-4 border-black dark:border-white flex justify-between items-center">
                     <span className="font-bold uppercase">New User Registration</span>
                     <button onClick={toggleReg} className={`px-4 py-2 font-bold border-2 border-black dark:border-white ${regEnabled ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                         {regEnabled ? 'ENABLED' : 'DISABLED'}
                     </button>
                 </div>
                 <div className="flex-1 overflow-auto p-4"><table className="w-full border-collapse text-left"><thead><tr className="border-b-2 border-black dark:border-white text-sm uppercase"><th className="p-2">User</th><th className="p-2">Status</th><th className="p-2">Role</th><th className="p-2">Action</th></tr></thead><tbody>{users.map(u => (<tr key={u.id} className="border-b border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-900"><td className="p-2 flex items-center gap-2"><div className="w-8 h-8 border border-black dark:border-white overflow-hidden"><img src={u.avatar} className="w-full h-full grayscale"/></div><SafeText text={u.username} /></td><td className="p-2">{u.isOnline ? 'ONLINE' : 'OFFLINE'}</td><td className="p-2">{u.isAdmin ? 'ADMIN' : 'USER'}</td><td className="p-2 flex gap-2"><button onClick={() => {Storage.toggleAdminStatus(u.id); onClose()}} className="border border-black dark:border-white px-2 text-xs hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors">{t('admin.makeAdmin', lang)}</button></td></tr>))}</tbody></table></div>
             </div>
        </div>
    )
}
const BroadcastModal = ({ onClose }: any) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 dark:bg-black/90 p-4 animate-fade-in"><div className="bg-white dark:bg-black border-4 border-black p-6 shadow-manga animate-slide-up"><h2>Broadcast</h2><button onClick={onClose}>Close</button></div></div>
);
const ProfileModal = ({ user, onClose, onUpdate }: any) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 dark:bg-black/90 p-4 animate-fade-in"><div className="bg-white dark:bg-black border-4 border-black p-6 shadow-manga animate-slide-up"><h2>{user.username}</h2><button onClick={onClose}>Close</button></div></div>
);

const SettingsModal = ({ user, onClose, onUpdate, lang, deferredPrompt, installApp }: any) => {
    const [settings, setSettings] = useState<UserSettings>(user.settings || { notifications: true, soundEnabled: true, privacyMode: false, theme: 'dark', chatWallpaper: 'default', fontSize: 'medium', language: 'en', enterToSend: true });
    const wallpaperInputRef = useRef<HTMLInputElement>(null);

    const handleSettingChange = (key: keyof UserSettings, value: any) => { 
        const newSettings = { ...settings, [key]: value }; 
        setSettings(newSettings); 
        onUpdate({ settings: newSettings }); 
    };

    const handleGlobalWallpaper = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const url = await Storage.uploadMedia(e.target.files[0]);
            handleSettingChange('chatWallpaper', `url(${url})`);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/90 dark:bg-black/90 p-4 animate-fade-in">
            <div className="bg-white dark:bg-black border-4 border-black dark:border-white shadow-manga dark:shadow-manga-dark w-full max-w-lg h-[80vh] flex flex-col overflow-hidden animate-slide-up">
                <div className="p-6 border-b-4 border-black dark:border-white bg-black text-white dark:bg-white dark:text-black flex justify-between items-center"><h2 className="text-2xl font-comic uppercase tracking-widest">{t('settings.title', lang)}</h2><button onClick={onClose}><X size={24}/></button></div>
                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    {deferredPrompt && (
                        <section className="bg-accent text-white p-4 border-2 border-black dark:border-white">
                            <div className="flex justify-between items-center">
                                <span className="font-bold uppercase">Install App</span>
                                <button onClick={installApp} className="bg-white text-black px-4 py-2 font-bold border-2 border-black uppercase text-xs">Install</button>
                            </div>
                        </section>
                    )}
                    <section><h3 className="font-black text-lg uppercase mb-4 border-b-2 border-black dark:border-white inline-block">{t('settings.language', lang)}</h3><div className="flex gap-4"><button onClick={() => handleSettingChange('language', 'en')} className={`flex-1 py-2 border-2 border-black dark:border-white font-bold uppercase ${settings.language === 'en' ? 'bg-black text-white dark:bg-white dark:text-black' : 'hover:bg-gray-200 dark:hover:bg-gray-800'}`}>English</button><button onClick={() => handleSettingChange('language', 'ru')} className={`flex-1 py-2 border-2 border-black dark:border-white font-bold uppercase ${settings.language === 'ru' ? 'bg-black text-white dark:bg-white dark:text-black' : 'hover:bg-gray-200 dark:hover:bg-gray-800'}`}>Русский</button></div></section>
                    <section className="space-y-4"><h3 className="font-black text-lg uppercase mb-4 border-b-2 border-black dark:border-white inline-block">Theme</h3><div className="flex gap-4"><button onClick={() => handleSettingChange('theme', 'light')} className={`flex-1 py-2 border-2 border-black dark:border-white font-bold uppercase ${settings.theme === 'light' ? 'bg-black text-white dark:bg-white dark:text-black' : 'hover:bg-gray-200 dark:hover:bg-gray-800'}`}>Light</button><button onClick={() => handleSettingChange('theme', 'dark')} className={`flex-1 py-2 border-2 border-black dark:border-white font-bold uppercase ${settings.theme === 'dark' ? 'bg-black text-white dark:bg-white dark:text-black' : 'hover:bg-gray-200 dark:hover:bg-gray-800'}`}>Dark</button></div></section>
                    <section className="space-y-4"><h3 className="font-black text-lg uppercase mb-4 border-b-2 border-black dark:border-white inline-block">{t('settings.appearance', lang)}</h3>
                        <div className="flex justify-between items-center">
                            <div><p className="font-bold">{t('settings.wallpaper', lang)}</p></div>
                            <button onClick={() => wallpaperInputRef.current?.click()} className="border-2 border-black dark:border-white px-3 py-1 text-xs font-bold uppercase hover:bg-gray-200 dark:hover:bg-gray-800">Upload</button>
                            <input type="file" ref={wallpaperInputRef} className="hidden" accept="image/*" onChange={handleGlobalWallpaper} />
                        </div>
                        <div className="flex justify-between items-center"><div><p className="font-bold">{t('settings.fontsize', lang)}</p></div><div className="flex border-2 border-black dark:border-white">{['small', 'medium', 'large'].map(s => (<button key={s} onClick={() => handleSettingChange('fontSize', s)} className={`px-3 py-1 text-xs font-bold uppercase ${settings.fontSize === s ? 'bg-black text-white dark:bg-white dark:text-black' : 'hover:bg-gray-200 dark:hover:bg-gray-800'}`}>{s[0]}</button>))}</div></div>
                    </section>
                </div>
            </div>
        </div>
    )
}

const AuthForm = ({ onSubmit, lang = 'en', deferredPrompt, installApp }: any) => {
    const [isRegister, setIsRegister] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    return (
        <div className="space-y-6 animate-fade-in">
            <form onSubmit={(e) => onSubmit(e, isRegister)} className="space-y-6">
                <div><label className="block font-bold uppercase text-sm mb-2">{t('auth.username', lang)}</label><div className="relative"><input name="username" type="text" value={username} onChange={e => setUsername(e.target.value)} className="w-full bg-transparent border-4 border-black dark:border-white p-4 font-bold outline-none focus:shadow-manga-sm dark:focus:shadow-manga-sm-dark transition-shadow" placeholder={t('auth.username', lang).toUpperCase()}/></div></div>
                <div><label className="block font-bold uppercase text-sm mb-2">{t('auth.password', lang)}</label><div className="relative"><input name="password" type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-transparent border-4 border-black dark:border-white p-4 font-bold outline-none focus:shadow-manga-sm dark:focus:shadow-manga-sm-dark transition-shadow" placeholder="••••••••"/></div></div>
                <button type="submit" className="w-full bg-black text-white dark:bg-white dark:text-black font-black text-xl py-4 uppercase hover:scale-105 transition-transform active:translate-y-1 shadow-manga dark:shadow-manga-dark border-2 border-transparent">{isRegister ? t('auth.registerAction', lang) : t('auth.loginAction', lang)}</button>
                <div className="text-center"><button type="button" onClick={() => setIsRegister(!isRegister)} className="font-mono text-sm underline decoration-2 underline-offset-4 hover:text-accent transition-colors">{isRegister ? t('auth.hasAccount', lang) + ' ' + t('auth.signin', lang) : t('auth.noAccount', lang) + ' ' + t('auth.signup', lang)}</button></div>
            </form>
            {deferredPrompt && isRegister && (
                <div className="mt-4 pt-4 border-t-2 border-black dark:border-white text-center">
                    <p className="text-xs font-bold mb-2">INSTALL APP FOR BETTER EXPERIENCE</p>
                    <button onClick={installApp} className="bg-black text-white dark:bg-white dark:text-black px-4 py-2 font-bold uppercase text-sm border-2 border-transparent hover:opacity-80">Install to Home Screen</button>
                </div>
            )}
        </div>
    );
}

// --- Main App ---
export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [view, setView] = useState<'auth' | 'app'>('auth');
  const [currentTab, setCurrentTab] = useState<'chats' | 'channels' | 'calls'>('chats');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('theme') as 'light' | 'dark') || 'dark');
  const [lang, setLang] = useState<'en'|'ru'>('en');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [replyTo, setReplyTo] = useState<ReplyInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [foundChannels, setFoundChannels] = useState<Chat[]>([]);
  const [foundUsers, setFoundUsers] = useState<User[]>([]);
  const [showMenu, setShowMenu] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [showGroupCreateModal, setShowGroupCreateModal] = useState(false);
  const [showChannelCreateModal, setShowChannelCreateModal] = useState(false);
  const [showGroupSettingsModal, setShowGroupSettingsModal] = useState(false);
  const [userCache, setUserCache] = useState<Record<string, User>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<{url: string, type: 'image'|'video'|'audio'} | null>(null);
  
  // Recording State
  const [recordingType, setRecordingType] = useState<'audio'|'video'|null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingInterval = useRef<any>(null);
  
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wallpaperInputRef = useRef<HTMLInputElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);

  // PWA Prompt
  useEffect(() => {
      window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); setDeferredPrompt(e); });
  }, []);
  const installApp = () => { if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt.userChoice.then((res:any) => { if(res.outcome==='accepted') setDeferredPrompt(null); }); } };

  // Drag & Drop
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = async (e: React.DragEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && activeChatId) {
          const file = e.dataTransfer.files[0];
          handleFileUpload({ target: { files: [file] } } as any);
          e.dataTransfer.clearData();
      }
  };

  // Recording Logic
  const startRecording = async (type: 'audio' | 'video') => {
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
          const recorder = new MediaRecorder(stream);
          const chunks: Blob[] = [];
          
          recorder.ondataavailable = e => { if(e.data.size > 0) chunks.push(e.data); };
          recorder.onstop = async () => {
              const blob = new Blob(chunks, { type: type === 'video' ? 'video/webm' : 'audio/webm' });
              const file = new File([blob], `recording.${type==='video'?'webm':'webm'}`, { type: type==='video'?'video/webm':'audio/webm' });
              
              setIsUploading(true);
              try {
                  const url = await Storage.uploadMedia(file);
                  await handleSendMessage(type, "Voice Message", url);
              } catch(e) { alert("Upload failed"); }
              setIsUploading(false);
              stream.getTracks().forEach(t => t.stop());
          };
          
          recorder.start();
          mediaRecorder.current = recorder;
          setRecordingType(type);
          setRecordingTime(0);
          recordingInterval.current = setInterval(() => setRecordingTime(p => p + 1), 1000);
      } catch(e) {
          alert("Permission denied or error: " + e);
      }
  };

  const stopRecording = () => {
      if(mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
          mediaRecorder.current.stop();
          clearInterval(recordingInterval.current);
          setRecordingType(null);
      }
  };

  const handleSendMessage = async (type: 'text'|'image'|'video'|'audio'='text', contentVal?: string, mediaUrl?: string) => {
      if (!currentUser || !activeChatId) return;
      const content = contentVal || inputText;
      if (!content && !mediaUrl) return;

      if(typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      Storage.setTyping(activeChatId, currentUser.id, false);

      let contentToSave = content;
      if(type === 'text') contentToSave = await CryptoService.encryptMessage(content, activeChatId);
      
      const newMessage: Message = {
          id: crypto.randomUUID(), chatId: activeChatId, senderId: currentUser.id,
          content: contentToSave, type, timestamp: Date.now(), status: 'sent', mediaUrl, replyTo: replyTo || undefined
      };

      setMessages(prev => [...prev, { ...newMessage, content: type === 'text' ? content : contentToSave }]);
      setInputText(''); setReplyTo(null);
      setPreviewFile(null);
      await Storage.sendMessage(newMessage);
  };
  
  const handleTypingInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => { setInputText(e.target.value); Storage.setTyping(activeChatId!, currentUser!.id, true); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if(e.key==='Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } };
  const handleDeleteMessage = async () => { if (messageToDelete && activeChatId) { await Storage.deleteMessage(activeChatId, messageToDelete); setMessages(prev => prev.filter(m => m.id !== messageToDelete)); setMessageToDelete(null); } };
  const handleClearChat = async () => { if(activeChatId) { await Storage.clearChat(activeChatId); setMessages([]); setShowMenu(false); } };
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement> | {target: {files: FileList}}) => { const file = e.target.files?.[0]; if (!file || !activeChatId) return; const previewUrl = URL.createObjectURL(file); const type = file.type.startsWith('image') ? 'image' : file.type.startsWith('video') ? 'video' : 'audio'; setPreviewFile({ url: previewUrl, type }); setIsUploading(true); try { const serverUrl = await Storage.uploadMedia(file); await handleSendMessage(type, file.name, serverUrl); } catch (err: any) { alert("Upload failed: " + err.message); } finally { setIsUploading(false); setPreviewFile(null); if(fileInputRef.current) fileInputRef.current.value = ''; } };
  const handleAuth = async (e: React.FormEvent, isRegister: boolean) => { e.preventDefault(); const form = e.target as HTMLFormElement; try { const u = isRegister ? await Storage.registerUser(form.username.value, form.password.value) : await Storage.loginUser(form.username.value, form.password.value); setCurrentUser(u); setView('app'); loadChats(u.id); } catch (e: any) { const msg = e.response?.data?.error || e.message; alert(msg); } };
  
  const handleCreateGroup = async (name: string, participants: string[]) => { if(!currentUser) return; await Storage.createGroup(name, participants); loadChats(currentUser.id); };
  const handleCreateChannel = async (name: string, description: string) => { if(!currentUser) return; await Storage.createChannel(name, description); loadChats(currentUser.id); };
  const handleBroadcast = (msg: string, ids: string[]) => { console.log("Broadcast not implemented", msg, ids); };

  useEffect(() => {
      const token = localStorage.getItem('auth_token');
      if (token) {
          Storage.getCurrentUser().then(user => {
              setCurrentUser(user);
              setView('app');
              loadChats(user.id);
          }).catch(() => {
              localStorage.removeItem('auth_token');
              setView('auth');
          });
      }
  }, []);

  useEffect(() => {
      if (theme === 'dark') document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
      if(currentUser?.settings) {
          setLang(currentUser.settings.language || 'en');
          if(currentUser.settings.theme !== theme) setTheme(currentUser.settings.theme);
      }
  }, [currentUser]);

  useEffect(() => {
      if (currentUser && 'Notification' in window) Notification.requestPermission();
  }, [currentUser]);

  useEffect(() => {
      if (searchQuery.length > 2) {
          if (currentTab === 'channels') {
              Storage.searchChannels(searchQuery).then(setFoundChannels);
          } else if (currentTab === 'chats') {
              Storage.searchUsers(searchQuery).then(users => {
                  const existingPeerIds = new Set(chats.flatMap(c => c.participants));
                  setFoundUsers(users.filter(u => u.id !== currentUser?.id && !existingPeerIds.has(u.id)));
              });
          }
      } else {
          setFoundChannels([]);
          setFoundUsers([]);
      }
  }, [searchQuery, currentTab, chats, currentUser]);

  const sendNotification = (title: string, body: string) => {
      if (currentUser?.settings?.notifications && 'Notification' in window && Notification.permission === 'granted') {
          new Notification(title, { body, icon: '/icon.png' });
      }
  };

  useEffect(() => {
      const socket = getSocket();
      if(!socket || !currentUser) return;
      
      const onNewMessage = async (msg: Message) => {
        if (msg.chatId === activeChatId) {
            const plainText = await CryptoService.decryptMessage(msg.content, msg.chatId);
            setMessages(prev => {
                if (prev.some(m => m.id === msg.id)) return prev;
                return [...prev, { ...msg, content: plainText }];
            });
            Storage.markMessagesAsRead(msg.chatId, currentUser.id);
        } else {
             const sender = userCache[msg.senderId]?.username || 'New Message';
             sendNotification(sender, 'Sent you a message');
        }
        loadChats(currentUser.id);
      };

      const onCallOffer = (data: any) => {
         if(!activeCall) {
              setActiveCall({
                  id: 'incoming',
                  chatId: 'unknown',
                  initiatorId: data.callerId,
                  participants: [data.callerId, currentUser.id], 
                  status: 'ringing', 
                  isVideo: true, 
                  isMuted: false,
                  offerSignal: data.offer,
                  callerId: data.callerId, // Store legacy prop for CallModal compatibility if needed
                  receiverId: currentUser.id
              });
         }
      };

      const onChatUpdated = (data: any) => loadChats(currentUser.id);
      const onTyping = ({ userId, chatId, isTyping }: { userId: string, chatId: string, isTyping: boolean }) => { if (chatId === activeChatId && userId !== currentUser.id) { setTypingUsers(prev => { const next = new Set(prev); if (isTyping) next.add(userId); else next.delete(userId); return next; }); } };
      const onMessagesRead = ({ chatId }: { chatId: string }) => { if (chatId === activeChatId) setMessages(prev => prev.map(m => m.status !== 'read' ? { ...m, status: 'read' } : m)); };
      const onMessageDeleted = ({ chatId, messageId }: { chatId: string, messageId: string }) => { if (chatId === activeChatId) setMessages(prev => prev.filter(m => m.id !== messageId)); };
      const onChatCleared = ({ chatId }: { chatId: string }) => { if (chatId === activeChatId) setMessages([]); };
      const onCallEnded = () => { if (activeCall) setActiveCall(null); };

      socket.on('new_message', onNewMessage);
      socket.on('call_offer', onCallOffer);
      socket.on('chat_updated', onChatUpdated);
      socket.on('typing', onTyping);
      socket.on('messages_read', onMessagesRead);
      socket.on('message_deleted', onMessageDeleted);
      socket.on('chat_cleared', onChatCleared);
      socket.on('call_ended', onCallEnded);

      return () => { 
          socket.off('new_message', onNewMessage); 
          socket.off('call_offer', onCallOffer);
          socket.off('chat_updated', onChatUpdated);
          socket.off('typing', onTyping);
          socket.off('messages_read', onMessagesRead);
          socket.off('message_deleted', onMessageDeleted);
          socket.off('chat_cleared', onChatCleared);
          socket.off('call_ended', onCallEnded);
      };
  }, [currentUser, activeChatId, userCache, activeCall]);

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
          if(m.type === 'text') return { ...m, content: DOMPurify.sanitize(await CryptoService.decryptMessage(m.content, chatId), {ALLOWED_TAGS:[], ALLOWED_ATTR:[]}) };
          return m;
      }));
      setMessages(decrypted);
      setTypingUsers(new Set()); 
      setTimeout(() => messagesEndRef.current?.scrollIntoView(), 100);
  };

  useEffect(() => { 
      if(activeChatId && currentUser) {
          loadMessages(activeChatId); 
          Storage.markMessagesAsRead(activeChatId, currentUser.id);
          const socket = getSocket();
          if(socket) socket.emit('join_chat', activeChatId);
      }
  }, [activeChatId]);

  const handleStartChat = async (peerId: string) => {
      if(!currentUser) return;
      const chat = await Storage.createChat(currentUser.id, peerId);
      await loadChats(currentUser.id);
      setActiveChatId(chat.id);
      setSearchQuery(''); 
  };

  const getPeerInfo = (chat: Chat) => {
      if(chat.type === 'group') return { id: chat.id, username: chat.name || 'Group Chat', avatar: chat.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=Group', isOnline: true };
      if(chat.type === 'channel') return { id: chat.id, username: chat.name || 'Channel', avatar: chat.avatar || 'https://api.dicebear.com/7.x/initials/svg?seed=Channel', isOnline: true };
      const peerId = chat.participants.find(p => p !== currentUser?.id);
      return userCache[peerId!] || { id: peerId || 'unknown', username: 'Loading...', avatar: '', isOnline: false };
  }
  
  const initiateCall = (isVideo: boolean, chat: Chat) => {
      if(!currentUser) return;
      const receiverId = chat.type === 'private' ? chat.participants.find(p => p !== currentUser.id)! : 'group';
      setActiveCall({
          id: 'outgoing',
          chatId: chat.id,
          initiatorId: currentUser.id,
          participants: chat.participants,
          status: 'connected',
          isVideo,
          isMuted: false,
          callerId: currentUser.id, 
          receiverId: receiverId
      });
  }

  if (view === 'auth') return <div className="min-h-screen flex items-center justify-center dark:bg-black dark:text-white"><AuthForm onSubmit={handleAuth} lang={lang} deferredPrompt={deferredPrompt} installApp={installApp} /></div>;

  const activeChat = chats.find(c => c.id === activeChatId);
  const peer = activeChat ? getPeerInfo(activeChat) : null;
  const chatWallpapers = currentUser?.settings?.chatWallpapers || {};
  const activeWallpaper = activeChatId ? (chatWallpapers[activeChatId] || currentUser?.settings?.chatWallpaper) : currentUser?.settings?.chatWallpaper;
  const wallpaperStyle = activeWallpaper === 'default' ? {} : { backgroundImage: activeWallpaper, backgroundSize: 'cover', backgroundPosition: 'center' };

  return (
    <div className={`flex h-[100dvh] w-full bg-white dark:bg-black text-black dark:text-white overflow-hidden`}>
      {activeCall && currentUser && <CallModal session={activeCall} onEnd={() => setActiveCall(null)} peerName={activeChat?.name || 'Call'} currentUserId={currentUser.id} />}
      {showProfileModal && currentUser && <ProfileModal user={currentUser} onClose={() => setShowProfileModal(false)} onUpdate={async (u:any) => { const n = await Storage.updateUser(currentUser.id, u); setCurrentUser(n); }} lang={lang} />}
      {showSettingsModal && currentUser && <SettingsModal user={currentUser} onClose={() => setShowSettingsModal(false)} onUpdate={async (u:any) => { const n = await Storage.updateUser(currentUser.id, u); setCurrentUser(n); }} lang={lang} deferredPrompt={deferredPrompt} installApp={installApp} />}
      {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} lang={lang} />}
      {showBroadcastModal && <BroadcastModal chats={chats} userCache={userCache} onClose={() => setShowBroadcastModal(false)} onSend={handleBroadcast} lang={lang} />}
      {showGroupCreateModal && <CreateGroupModal chats={chats} userCache={userCache} onClose={() => setShowGroupCreateModal(false)} onCreate={handleCreateGroup} />}
      {showChannelCreateModal && <CreateChannelModal onClose={() => setShowChannelCreateModal(false)} onCreate={handleCreateChannel} lang={lang} />}
      
      {messageToDelete && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-white/90 dark:bg-black/90">
              <div className="bg-white dark:bg-black border-4 border-black dark:border-white p-6 shadow-manga dark:shadow-manga-dark max-w-sm w-full">
                  <h3 className="text-xl font-bold uppercase mb-4">Delete Message?</h3>
                  <p className="mb-6 font-mono text-sm">This action cannot be undone.</p>
                  <div className="flex gap-4"><button onClick={() => setMessageToDelete(null)} className="flex-1 py-2 border-2 border-black dark:border-white font-bold hover:bg-gray-100 dark:hover:bg-gray-900">CANCEL</button><button onClick={handleDeleteMessage} className="flex-1 py-2 bg-accent text-white font-bold border-2 border-black dark:border-white hover:opacity-90">DELETE</button></div>
              </div>
          </div>
      )}

      {showGroupSettingsModal && activeChat && currentUser && (
          <GroupSettingsModal 
            chat={activeChat} currentUser={currentUser} userCache={userCache}
            onClose={() => setShowGroupSettingsModal(false)} 
            onUpdate={async (name) => { await Storage.updateGroupInfo(activeChat.id, name); loadChats(currentUser.id); }}
            onAddMember={async (ids) => { await Storage.addGroupMembers(activeChat.id, ids); loadChats(currentUser.id); }}
            onRemoveMember={async (id) => { await Storage.removeGroupMember(activeChat.id, id); loadChats(currentUser.id); }}
            onLeave={async () => { if(activeChat.type === 'channel') await Storage.unsubscribeChannel(activeChat.id); else await Storage.leaveGroup(activeChat.id); setActiveChatId(null); setShowGroupSettingsModal(false); loadChats(currentUser.id); }}
          />
      )}
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      <div className={`w-full md:w-96 flex flex-col border-r-4 border-black dark:border-white ${activeChatId ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 border-b-4 border-black dark:border-white bg-white dark:bg-black z-10">
              <div className="flex justify-between items-center mb-4">
                  <h2 className="text-3xl font-comic uppercase tracking-tighter">{t('app.name', lang)}</h2>
                  <div className="flex gap-2">
                      {currentTab === 'chats' && <button onClick={() => setShowGroupCreateModal(true)} className="p-2 border-2 border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black" title="Create Group"><Users size={20}/></button>}
                      {currentTab === 'channels' && <button onClick={() => setShowChannelCreateModal(true)} className="p-2 border-2 border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black" title="Create Channel"><Tv size={20}/></button>}
                      <button onClick={() => setShowBroadcastModal(true)} className="p-2 border-2 border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black" title="Broadcast"><Megaphone size={20}/></button>
                      {currentUser?.isAdmin && <button onClick={() => setShowAdminPanel(true)} className="p-2 border-2 border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"><Shield size={20}/></button>}
                      <button onClick={() => setShowSettingsModal(true)} className="p-2 border-2 border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"><Settings size={20}/></button>
                      <div onClick={() => setShowProfileModal(true)} className="w-10 h-10 border-2 border-black dark:border-white overflow-hidden cursor-pointer hover:opacity-80"><img src={currentUser?.avatar} className="w-full h-full object-cover grayscale"/></div>
                  </div>
              </div>
              <div className="flex gap-2 mb-4">
                  <button onClick={() => setCurrentTab('chats')} className={`flex-1 py-2 font-black uppercase border-2 border-black dark:border-white text-xs ${currentTab === 'chats' ? 'bg-black text-white dark:bg-white dark:text-black' : 'hover:bg-gray-200 dark:hover:bg-gray-800'}`}>{t('nav.chats', lang)}</button>
                  <button onClick={() => setCurrentTab('channels')} className={`flex-1 py-2 font-black uppercase border-2 border-black dark:border-white text-xs ${currentTab === 'channels' ? 'bg-black text-white dark:bg-white dark:text-black' : 'hover:bg-gray-200 dark:hover:bg-gray-800'}`}>{t('nav.channels', lang)}</button>
                  <button onClick={() => setCurrentTab('calls')} className={`flex-1 py-2 font-black uppercase border-2 border-black dark:border-white text-xs ${currentTab === 'calls' ? 'bg-black text-white dark:bg-white dark:text-black' : 'hover:bg-gray-200 dark:hover:bg-gray-800'}`}>{t('nav.calls', lang)}</button>
              </div>
              <div className="relative"><Search className="absolute left-3 top-3" size={20}/><input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={currentTab === 'channels' ? t('search.channels', lang) : t('search.placeholder', lang)} className="w-full bg-transparent border-2 border-black dark:border-white pl-10 pr-4 py-2 font-bold outline-none focus:shadow-manga-sm dark:focus:shadow-manga-sm-dark transition-shadow placeholder-gray-500" /></div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-gray-50 dark:bg-gray-900">
              {currentTab === 'chats' && foundUsers.length > 0 && (
                  <div className="mb-4"><div className="px-2 py-1 text-xs font-bold uppercase opacity-50">Global Search</div>{foundUsers.map(user => (<div key={user.id} className="flex items-center justify-between gap-3 p-3 border-2 border-black dark:border-white bg-gray-100 dark:bg-gray-900 hover:scale-[1.01] transition-transform"><div className="flex items-center gap-3"><img src={user.avatar} className="w-10 h-10 border-2 border-black dark:border-white grayscale object-cover"/><h4 className="font-black uppercase">{user.username}</h4></div><button onClick={() => handleStartChat(user.id)} className="p-2 bg-black text-white dark:bg-white dark:text-black"><AddFriendIcon size={16}/></button></div>))}</div>
              )}
              {currentTab === 'chats' && chats.filter(c => c.type !== 'channel').map(chat => { const p = getPeerInfo(chat); if(searchQuery && !p.username.toLowerCase().includes(searchQuery.toLowerCase())) return null; const active = chat.id === activeChatId; return (<div key={chat.id} onClick={() => setActiveChatId(chat.id)} className={`flex items-center gap-3 p-3 border-2 border-black dark:border-white cursor-pointer transition-transform active:scale-[0.98] hover:bg-gray-100 dark:hover:bg-gray-900 ${active ? 'bg-black text-white dark:bg-white dark:text-black shadow-manga-sm dark:shadow-manga-sm-dark' : ''}`}><div className="relative"><img src={p.avatar} className="w-12 h-12 border-2 border-current object-cover grayscale"/>{p.isOnline && chat.type === 'private' && <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-current border-2 border-white dark:border-black"></div>}</div><div className="flex-1 min-w-0"><div className="flex justify-between"><h4 className="font-black uppercase truncate flex items-center gap-1"><SafeText text={p.username} />{chat.type === 'group' && <Users size={12}/>}</h4>{chat.unreadCount > 0 && <span className="bg-accent text-white px-1.5 font-bold text-xs border border-black dark:border-white">{chat.unreadCount}</span>}</div><p className="text-xs font-mono truncate opacity-70">{chat.lastMessage ? (chat.lastMessage.type === 'text' ? chat.lastMessage.content : `[${chat.lastMessage.type.toUpperCase()}]`) : t('chat.start', lang)}</p></div></div>) })}
              {currentTab === 'channels' && (
                  <>
                      {chats.filter(c => c.type === 'channel').map(chat => { const p = getPeerInfo(chat); const active = chat.id === activeChatId; return (<div key={chat.id} onClick={() => setActiveChatId(chat.id)} className={`flex items-center gap-3 p-3 border-2 border-black dark:border-white cursor-pointer transition-transform active:scale-[0.98] hover:bg-gray-100 dark:hover:bg-gray-900 ${active ? 'bg-black text-white dark:bg-white dark:text-black shadow-manga-sm dark:shadow-manga-sm-dark' : ''}`}><div className="relative"><img src={p.avatar} className="w-12 h-12 border-2 border-current object-cover grayscale"/></div><div className="flex-1 min-w-0"><h4 className="font-black uppercase truncate flex items-center gap-1"><SafeText text={p.username} /><Tv size={12}/></h4><p className="text-xs font-mono truncate opacity-70">{chat.lastMessage ? chat.lastMessage.content : chat.description || 'No messages'}</p></div></div>) })}
                      {foundChannels.length > 0 && (<><div className="p-2 font-bold text-xs uppercase opacity-50 mt-4">Search Results</div>{foundChannels.filter(fc => !chats.some(c => c.id === fc.id)).map(channel => (<div key={channel.id} className="flex items-center gap-3 p-3 border-2 border-black dark:border-white bg-gray-100 dark:bg-gray-900 hover:scale-[1.01] transition-transform"><img src={channel.avatar} className="w-12 h-12 border-2 border-black dark:border-white object-cover grayscale"/><div className="flex-1"><h4 className="font-black uppercase flex gap-1 items-center">{channel.name} <Tv size={12}/></h4><p className="text-xs truncate opacity-70">{channel.description}</p></div><button onClick={() => { Storage.subscribeChannel(channel.id).then(() => loadChats(currentUser!.id)); }} className="text-xs bg-black text-white dark:bg-white dark:text-black px-2 py-1 font-bold uppercase hover:opacity-80">{t('chat.subscribe', lang)}</button></div>))}</>)}
                  </>
              )}
              {currentTab === 'calls' && Object.values(userCache).filter((u:any) => u.id !== currentUser?.id).map((user:any) => (<div key={user.id} className="flex items-center justify-between gap-3 p-3 border-2 border-black dark:border-white bg-white dark:bg-black hover:scale-[1.01] transition-transform"><div className="flex items-center gap-3"><img src={user.avatar} className="w-12 h-12 border-2 border-black dark:border-white grayscale object-cover"/><div><h4 className="font-black uppercase"><SafeText text={user.username} /></h4><p className="text-xs font-mono">{user.isOnline ? 'ONLINE' : 'OFFLINE'}</p></div></div><div className="flex gap-2"><button onClick={() => { const chat = chats.find(c => c.type === 'private' && c.participants.includes(user.id)); if(chat) initiateCall(false, chat); }} className="p-2 border-2 border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"><Phone size={18}/></button><button onClick={() => { const chat = chats.find(c => c.type === 'private' && c.participants.includes(user.id)); if(chat) initiateCall(true, chat); }} className="p-2 border-2 border-black dark:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"><Video size={18}/></button></div></div>))}
          </div>
      </div>

      {activeChatId && activeChat ? (
          <div 
            className="flex-1 flex flex-col relative halftone-light dark:halftone-dark animate-fade-in" 
            style={wallpaperStyle}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
              {activeWallpaper !== 'default' && <div className="absolute inset-0 bg-white/80 dark:bg-black/80 backdrop-blur-[1px]"></div>}
              
              <div className="h-16 border-b-4 border-black dark:border-white bg-white dark:bg-black flex items-center px-4 z-10 justify-between">
                  <div className="flex items-center gap-4">
                      <button onClick={() => setActiveChatId(null)} className="md:hidden"><ArrowLeft/></button>
                      <img src={peer?.avatar} className="w-10 h-10 border-2 border-black dark:border-white rounded-full object-cover"/>
                      <div>
                          <h3 className="font-black text-xl">{activeChat.name || peer?.username}</h3>
                          <p className="text-xs opacity-70">{activeChat.type === 'channel' ? `${activeChat.participants.length} subscribers` : peer?.isOnline ? 'Online' : 'Offline'}</p>
                      </div>
                  </div>
                  <div className="flex gap-2">
                      {activeChat.type !== 'channel' && (
                          <>
                              <button onClick={() => initiateCall(false, activeChat)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"><Phone size={20}/></button>
                              <button onClick={() => initiateCall(true, activeChat)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"><Video size={20}/></button>
                          </>
                      )}
                      <button onClick={() => setShowMenu(!showMenu)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"><MoreVertical size={20}/></button>
                      {showMenu && (
                          <div className="absolute top-16 right-4 bg-white dark:bg-black border-2 border-black dark:border-white shadow-lg rounded-lg py-2 w-48 z-50">
                              <button onClick={handleClearChat} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2 text-red-600"><Trash2 size={16}/> Clear Chat</button>
                              <button onClick={() => setShowGroupSettingsModal(true)} className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"><Settings size={16}/> Info</button>
                          </div>
                      )}
                  </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 z-0" ref={chatAreaRef}>
                  {messages.map((msg) => (
                      <div key={msg.id} className={`flex ${msg.senderId===currentUser?.id?'justify-end':'justify-start'}`}>
                          <div className={`max-w-[80%] p-3 border-2 border-black dark:border-white ${msg.senderId===currentUser?.id ? 'bg-black text-white dark:bg-white dark:text-black' : 'bg-white text-black dark:bg-black dark:text-white'}`}>
                              {msg.type === 'image' && <LazyImage src={msg.mediaUrl!} onClick={() => setLightboxSrc(msg.mediaUrl!)} />}
                              {msg.type === 'video' && <video src={msg.mediaUrl} controls className="w-full max-h-64 border-2 border-white dark:border-black mb-2" />}
                              {msg.type === 'audio' && <AudioPlayer src={msg.mediaUrl!} />}
                              {msg.type === 'text' && <p className="whitespace-pre-wrap">{msg.content}</p>}
                              <div className="text-[10px] opacity-70 mt-1 text-right flex justify-end items-center gap-1">
                                  {new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                  {msg.senderId===currentUser?.id && (msg.status==='read' ? <CheckCheck size={12}/> : <Check size={12}/>)}
                              </div>
                          </div>
                      </div>
                  ))}
                  <div ref={messagesEndRef}/>
              </div>

              <div className="p-4 border-t-4 border-black dark:border-white bg-white dark:bg-black z-10">
                 {activeChat.type === 'channel' && !activeChat.adminIds?.includes(currentUser!.id) ? (
                      <div className="text-center py-2 opacity-50 font-mono border-2 border-dashed border-black dark:border-white">{t('chat.channelReadOnly', lang)}</div>
                 ) : (
                     <>
                         {recordingType ? (
                             <div className="flex items-center justify-between bg-red-100 dark:bg-red-900 p-3 border-2 border-red-500 animate-pulse">
                                 <span className="font-mono font-bold text-red-600 dark:text-red-300">Recording {recordingType}... {recordingTime}s</span>
                                 <button onClick={stopRecording} className="p-2 bg-red-500 text-white rounded-full"><StopRecord/></button>
                             </div>
                         ) : (
                             <div className="flex gap-2 items-end">
                                 <button onClick={() => fileInputRef.current?.click()} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"><Plus/></button>
                                 <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                                 
                                 <button onClick={() => startRecording('audio')} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"><Mic/></button>
                                 <button onClick={() => startRecording('video')} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"><Video/></button>
                                 
                                 <textarea 
                                    value={inputText} 
                                    onChange={handleTypingInput} 
                                    onKeyDown={handleKeyDown} 
                                    className="flex-1 bg-transparent border-2 border-black dark:border-white p-2 rounded-lg resize-none max-h-32 focus:outline-none" 
                                    placeholder="Type a message..." 
                                    rows={1}
                                 />
                                 <button onClick={() => handleSendMessage()} className="p-2 bg-black text-white dark:bg-white dark:text-black rounded-full"><Send/></button>
                             </div>
                         )}
                     </>
                 )}
              </div>
          </div>
      ) : (
          <div className="hidden md:flex flex-1 items-center justify-center font-comic text-2xl opacity-50">Select a chat</div>
      )}
    </div>
  );
}
