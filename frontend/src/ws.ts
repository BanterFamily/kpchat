import { API_BASE, readToken } from "./api";

export type WSEvent =
  | { type: "message"; data: any }
  | { type: "typing"; chat_id: string; user_id: string }
  | { type: "read"; chat_id: string; user_id: string }
  | { type: "pong" };

type Handler = (e: WSEvent) => void;

class WSClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private reconnectTimer: any = null;
  private stopped = false;
  private pingTimer: any = null;

  async connect() {
    this.stopped = false;
    const token = await readToken();
    if (!token) return;
    const url = API_BASE.replace(/^http/, "ws") + `/api/ws?token=${encodeURIComponent(token)}`;
    try {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          this.handlers.forEach((h) => h(data));
        } catch {}
      };
      ws.onclose = () => {
        this.ws = null;
        if (!this.stopped) this.reconnectTimer = setTimeout(() => this.connect(), 2000);
      };
      ws.onerror = () => { try { ws.close(); } catch {} };
      ws.onopen = () => {
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => this.send({ type: "ping" }), 25000);
      };
    } catch {
      this.reconnectTimer = setTimeout(() => this.connect(), 2000);
    }
  }

  disconnect() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    try { this.ws?.close(); } catch {}
    this.ws = null;
  }

  send(payload: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  on(h: Handler) { this.handlers.add(h); return () => this.handlers.delete(h); }
}

export const wsClient = new WSClient();
