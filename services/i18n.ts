
type Language = 'en' | 'ru';

const translations = {
  en: {
    // Auth
    "app.name": "Animetrika",
    "app.slogan": "Manga Style. Secure. Encrypted.",
    "auth.signin": "Sign In",
    "auth.signup": "Create Account",
    "auth.username": "Username",
    "auth.password": "Password",
    "auth.noAccount": "Don't have an account?",
    "auth.hasAccount": "Already have an account?",
    "auth.loginAction": "Log in",
    "auth.registerAction": "Sign up",
    
    // Nav
    "nav.chats": "Chats",
    "nav.channels": "Channels",
    "nav.calls": "Calls",
    "nav.settings": "Settings",
    "nav.broadcast": "Broadcast",
    
    // Search
    "search.placeholder": "Search...",
    "search.channels": "Find Channels...",
    
    // Chat
    "chat.start": "Start a conversation",
    "chat.typing": "typing...",
    "chat.online": "Online",
    "chat.lastSeen": "Last seen recently",
    "chat.encrypted": "Locked & Encrypted",
    "chat.block": "Block User",
    "chat.unblock": "Unblock User",
    "chat.pin": "Pin",
    "chat.unpin": "Unpin",
    "chat.clear": "Clear Chat",
    "chat.blockedMessage": "You blocked this user. Unblock to send.",
    "chat.replyTo": "Reply to",
    "chat.today": "TODAY",
    "chat.yesterday": "YESTERDAY",
    "chat.channelReadOnly": "Only admins can post in this channel.",
    "chat.subscribe": "Subscribe",
    "chat.unsubscribe": "Unsubscribe",
    "chat.subscribers": "subscribers",
    
    // Settings
    "settings.title": "Settings",
    "settings.notifications": "Notifications",
    "settings.privacy": "Privacy",
    "settings.appearance": "Appearance",
    "settings.language": "Language",
    "settings.push": "Push Alerts",
    "settings.pushDesc": "Get alerts when away",
    "settings.sound": "Sound FX",
    "settings.soundDesc": "Play audible alerts",
    "settings.ghost": "Ghost Mode",
    "settings.ghostDesc": "Hide online status",
    "settings.blocked": "Blocked Users",
    "settings.noblocked": "No blocked users.",
    "settings.wallpaper": "Global Wallpaper",
    "settings.setCustomWallpaper": "Set Custom Wallpaper",
    "settings.fontsize": "Font Size",
    "settings.small": "Small",
    "settings.medium": "Medium",
    "settings.large": "Large",
    
    // Profile
    "profile.edit": "Edit Profile",
    "profile.save": "Save Changes",
    "profile.saving": "Saving...",
    
    // Admin
    "admin.panel": "Admin Panel",
    "admin.dashboard": "Dashboard",
    "admin.users": "Users",
    "admin.exit": "Exit Panel",
    "admin.delete": "Delete",
    "admin.revoke": "Revoke",
    "admin.makeAdmin": "Make Admin",
    
    // Channels
    "channel.create": "New Channel",
    "channel.name": "Channel Name",
    "channel.desc": "Description",
    "channel.createAction": "Create Channel",
    
    // Common
    "common.loading": "Loading...",
    "common.uploading": "Uploading...",
    "common.you": "You",
  },
  ru: {
    // Auth
    "app.name": "Аниметрика",
    "app.slogan": "Манга стиль. Безопасно. Зашифровано.",
    "auth.signin": "Вход",
    "auth.signup": "Регистрация",
    "auth.username": "Имя пользователя",
    "auth.password": "Пароль",
    "auth.noAccount": "Нет аккаунта?",
    "auth.hasAccount": "Уже есть аккаунт?",
    "auth.loginAction": "Войти",
    "auth.registerAction": "Создать",
    
    // Nav
    "nav.chats": "Чаты",
    "nav.channels": "Каналы",
    "nav.calls": "Звонки",
    "nav.settings": "Настройки",
    "nav.broadcast": "Рассылка",
    
    // Search
    "search.placeholder": "Поиск...",
    "search.channels": "Найти каналы...",
    
    // Chat
    "chat.start": "Начните беседу",
    "chat.typing": "печатает...",
    "chat.online": "В сети",
    "chat.lastSeen": "Был(а) недавно",
    "chat.encrypted": "Зашифровано",
    "chat.block": "Заблокировать",
    "chat.unblock": "Разблокировать",
    "chat.pin": "Закрепить",
    "chat.unpin": "Открепить",
    "chat.clear": "Очистить чат",
    "chat.blockedMessage": "Вы заблокировали пользователя. Разблокируйте для общения.",
    "chat.replyTo": "Ответ",
    "chat.today": "СЕГОДНЯ",
    "chat.yesterday": "ВЧЕРА",
    "chat.channelReadOnly": "Только админы могут писать сюда.",
    "chat.subscribe": "Подписаться",
    "chat.unsubscribe": "Отписаться",
    "chat.subscribers": "подписчиков",
    
    // Settings
    "settings.title": "Настройки",
    "settings.notifications": "Уведомления",
    "settings.privacy": "Приватность",
    "settings.appearance": "Внешний вид",
    "settings.language": "Язык",
    "settings.push": "Пуш-уведомления",
    "settings.pushDesc": "Уведомления когда вы не в сети",
    "settings.sound": "Звуки",
    "settings.soundDesc": "Звуковые оповещения",
    "settings.ghost": "Режим призрака",
    "settings.ghostDesc": "Скрыть статус онлайн",
    "settings.blocked": "Черный список",
    "settings.noblocked": "Нет заблокированных",
    "settings.wallpaper": "Общие обои",
    "settings.setCustomWallpaper": "Установить свои обои",
    "settings.fontsize": "Размер шрифта",
    "settings.small": "Мелкий",
    "settings.medium": "Средний",
    "settings.large": "Крупный",
    
    // Profile
    "profile.edit": "Редактировать профиль",
    "profile.save": "Сохранить",
    "profile.saving": "Сохранение...",
    
    // Admin
    "admin.panel": "Панель Админа",
    "admin.dashboard": "Дашборд",
    "admin.users": "Пользователи",
    "admin.exit": "Выйти",
    "admin.delete": "Удалить",
    "admin.revoke": "Снять права",
    "admin.makeAdmin": "Назначить админом",

    // Channels
    "channel.create": "Новый канал",
    "channel.name": "Название канала",
    "channel.desc": "Описание",
    "channel.createAction": "Создать канал",
    
    // Common
    "common.loading": "Загрузка...",
    "common.uploading": "Загрузка медиа...",
    "common.you": "Вы",
  }
};

export const t = (key: string, lang: Language = 'en'): string => {
  return (translations[lang] as any)[key] || key;
};
