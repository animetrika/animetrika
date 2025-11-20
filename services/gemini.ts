
import { GoogleGenAI } from "@google/genai";

const AI_ID = 'gemini-ai-bot';

// Safe check for env
const apiKey = process.env.API_KEY || 'DUMMY_KEY_FOR_BUILD'; 
let ai: GoogleGenAI | null = null;

try {
    if (apiKey && apiKey !== 'DUMMY_KEY_FOR_BUILD') {
        ai = new GoogleGenAI({ apiKey });
    }
} catch (e) {
    console.warn("Gemini client failed to initialize", e);
}

export const isGeminiUser = (userId: string) => userId === AI_ID;

export const getGeminiResponse = async (prompt: string): Promise<string> => {
  if (!ai) return "I am not configured (Missing API Key).";
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || "Thinking...";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "I'm having trouble connecting to my brain right now.";
  }
};

export const GEMINI_USER = {
    id: AI_ID,
    username: "Gemini AI",
    isOnline: true,
    avatar: "https://upload.wikimedia.org/wikipedia/commons/8/8a/Google_Gemini_logo.svg",
    passwordHash: "",
    publicKey: "",
    lastSeen: Date.now()
}
