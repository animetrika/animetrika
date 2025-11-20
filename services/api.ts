
import axios from 'axios';
import { io, Socket } from 'socket.io-client';

// Determine API base URL
const getBaseUrl = () => {
    const { hostname, protocol } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:3001';
    }
    // In production (Nginx), API is served from the same origin /api
    // We return an empty string so axios uses the current domain automatically,
    // OR we return the explicit domain without port if needed for Socket.io
    return `${protocol}//${hostname}`;
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
        auth: { token: authToken }, // Send token for auth middleware
        transports: ['websocket', 'polling'], // Add polling for robust Nginx fallback
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
