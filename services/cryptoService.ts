
// Real AES-GCM Encryption Implementation using Web Crypto API

// Utility to convert string to buffer
const str2ab = (str: string) => new TextEncoder().encode(str);
const ab2str = (buf: ArrayBuffer) => new TextDecoder().decode(buf);

// Utility for ArrayBuffer to Base64 (for storage)
const ab2base64 = (buf: ArrayBuffer) => {
  let binary = '';
  const bytes = new Uint8Array(buf);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

// Utility for Base64 to ArrayBuffer
const base642ab = (base64: string) => {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
};

// Derive a symmetric key from the Chat ID (Simulation of Shared Key)
const getKey = async (chatId: string): Promise<CryptoKey> => {
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    str2ab(chatId),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: str2ab("animetrika-static-salt"), 
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

export const hashPassword = async (password: string): Promise<string> => {
  const msgBuffer = str2ab(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return ab2base64(hashBuffer);
};

export const encryptMessage = async (text: string, chatId: string): Promise<string> => {
  try {
    const key = await getKey(chatId);
    const iv = window.crypto.getRandomValues(new Uint8Array(12)); // Initialization Vector
    const encoded = str2ab(text);

    const encrypted = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      encoded
    );

    // Fix: Pass iv.buffer (ArrayBuffer) instead of iv (Uint8Array)
    return `${ab2base64(iv.buffer)}:${ab2base64(encrypted)}`;
  } catch (e) {
    console.error("Encryption failed", e);
    return text; // Fallback
  }
};

export const decryptMessage = async (cipherText: string, chatId: string): Promise<string> => {
  try {
    if (!cipherText.includes(':')) return cipherText; 

    const [ivStr, dataStr] = cipherText.split(':');
    const iv = base642ab(ivStr);
    const data = base642ab(dataStr);
    const key = await getKey(chatId);

    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(iv) },
      key,
      data
    );

    return ab2str(decrypted);
  } catch (e) {
    return "🔒 Encrypted Message";
  }
};