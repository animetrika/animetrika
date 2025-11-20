
import axios from 'axios';
import { io, Socket } from 'socket.io-client';

// Determine API base URL dynamically
const getBaseUrl = () => {
    const { hostname, protocol, port } = window.location;
    
    // Development environment
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        // If running on default Vite port 5173, look for backend on 3001
        return 'http://localhost:3001';
    }
    
    // Production environment (chat.nwlnd.ru)
    // Nginx serves everything on port 80/443, so we use the same origin
    // The '/api' and '/socket.io' paths are handled by Nginx proxy
    return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
};

const BASE_URL = getBaseUrl();
const API_URL = `${BASE_URL}/api`;
const SOCKET_URL = BASE_URL;

let socket: Socket | null = null;

export const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Add token to requests
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export const connectSocket = (token?: string) => {
    const authToken = token || localStorage.getItem('auth_token');
    if (!authToken) return null;

    if (socket && socket.connected) return socket;
    
    socket = io(SOCKET_URL, {
        auth: { token: authToken },
        transports: ['websocket', 'polling'],
        path: '/socket.io/'
    });

    socket.on('connect', () => {
        console.log('Socket connected securely to', SOCKET_URL);
    });
    
    socket.on('connect_error', (err) => {
        console.error("Socket connection error:", err.message);
    });

    return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
};