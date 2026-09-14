import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

export const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL as string;
const TOKEN_KEY = "kpchat_token";

export async function saveToken(t: string) {
  if (Platform.OS === "web") localStorage.setItem(TOKEN_KEY, t);
  else await SecureStore.setItemAsync(TOKEN_KEY, t);
}
export async function readToken(): Promise<string | null> {
  if (Platform.OS === "web") return localStorage.getItem(TOKEN_KEY);
  return SecureStore.getItemAsync(TOKEN_KEY);
}
export async function clearToken() {
  if (Platform.OS === "web") localStorage.removeItem(TOKEN_KEY);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = await readToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/api${path}`, { ...options, headers });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const detail = (body && (body.detail || body.message)) || `HTTP ${res.status}`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return body;
}

export async function uploadFile(uri: string, name: string, type: string) {
  const token = await readToken();
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    form.append("file", blob, name);
  } else {
    form.append("file", { uri, name, type } as any);
  }
  const res = await fetch(`${API_BASE}/api/upload`, {
    method: "POST",
    body: form,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json() as Promise<{ path: string; size: number }>;
}

export async function fileUrl(path: string): Promise<string> {
  const token = await readToken();
  return `${API_BASE}/api/files/${path}?token=${encodeURIComponent(token || "")}`;
}

export type User = {
  id: string;
  phone: string;
  name: string;
  about: string;
  avatar_path: string | null;
  online: boolean;
  last_seen: string | null;
};

export type Message = {
  id: string;
  chat_id: string;
  sender_id: string;
  text: string | null;
  media_path: string | null;
  media_type: string | null;
  audio_duration_ms?: number | null;
  created_at: string;
  read_by: string[];
  reply_to?: {
    id: string;
    sender_id: string;
    text: string | null;
    media_type: string | null;
  } | null;
  reactions?: Record<string, string[]>;
};

export type Chat = {
  id: string;
  kind: "direct" | "group";
  name: string | null;
  avatar_path: string | null;
  member_ids: string[];
  members: User[];
  last_message: {
    id: string;
    text: string | null;
    media_type: string | null;
    sender_id: string;
    created_at: string;
  } | null;
  unread_count: number;
  updated_at: string;
};
