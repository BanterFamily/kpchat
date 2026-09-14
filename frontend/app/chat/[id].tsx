import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, FlatList, TextInput, KeyboardAvoidingView,
  Platform, ActivityIndicator, Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useTheme, spacing, radius } from "@/src/theme";
import { apiFetch, Chat, fileUrl, Message, uploadFile } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { wsClient, WSEvent } from "@/src/ws";
import { AudioMessage } from "@/src/components/AudioMessage";
import { MessageActionsSheet, MessageActionsRef } from "@/src/components/MessageActionsSheet";

function timeOnly(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function ChatMedia({ path }: { path: string }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => { fileUrl(path).then(setUri); }, [path]);
  if (!uri) return null;
  return <Image source={{ uri }} style={styles.media} contentFit="cover" />;
}

function AvatarSmall({ path, name }: { path?: string | null; name: string }) {
  const { colors } = useTheme();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { if (path) fileUrl(path).then(setUrl); else setUrl(null); }, [path]);
  const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {url ? <Image source={{ uri: url }} style={{ width: 36, height: 36 }} contentFit="cover" /> :
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.brandSecondary }}>{initials}</Text>}
    </View>
  );
}

function replyPreviewText(rp: NonNullable<Message["reply_to"]>): string {
  if (rp.text) return rp.text;
  if (rp.media_type === "image") return "📷 Foto";
  if (rp.media_type === "audio") return "🎤 Pesan suara";
  if (rp.media_type === "video") return "🎥 Video";
  return "Pesan";
}

export default function ChatDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useAuth();

  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const typingTimer = useRef<any>(null);
  const listRef = useRef<FlatList<Message>>(null);
  const actionsRef = useRef<MessageActionsRef>(null);
  const recordStartRef = useRef<number>(0);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const other = useMemo(
    () => (chat?.kind === "direct" ? chat.members.find((m) => m.id !== user?.id) : null),
    [chat, user],
  );
  const headerTitle = chat?.kind === "group" ? (chat.name ?? "Grup") : (other?.name ?? "");
  const headerSub = chat?.kind === "group"
    ? `${chat.member_ids.length} anggota`
    : (peerTyping ? "sedang mengetik…" : (other?.online ? "online" : "terakhir dilihat baru saja"));

  const load = useCallback(async () => {
    try {
      const c: Chat = await apiFetch(`/chats/${id}`);
      const m: Message[] = await apiFetch(`/chats/${id}/messages`);
      setChat(c); setMessages(m);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Gagal memuat");
      router.back();
    }
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const off = wsClient.on((e: WSEvent) => {
      if (e.type === "message" && e.data?.chat_id === id) {
        const incoming: Message = e.data;
        const isReaction = (e.data as any)._event === "reaction";
        setMessages((prev) => {
          const list = prev ?? [];
          const idx = list.findIndex((m) => m.id === incoming.id);
          if (idx >= 0) {
            const copy = list.slice();
            copy[idx] = { ...copy[idx], ...incoming };
            return copy;
          }
          if (isReaction) return list; // reaction for unknown msg, ignore
          return [...list, incoming];
        });
        if (!isReaction) wsClient.send({ type: "read", chat_id: id });
      } else if (e.type === "typing" && e.chat_id === id && e.user_id !== user?.id) {
        setPeerTyping(true);
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setPeerTyping(false), 2500);
      } else if (e.type === "read" && e.chat_id === id) {
        setMessages((prev) => (prev ?? []).map((m) =>
          m.sender_id === user?.id && !m.read_by.includes(e.user_id)
            ? { ...m, read_by: [...m.read_by, e.user_id] } : m));
      }
    });
    wsClient.send({ type: "read", chat_id: id });
    return () => { off(); };
  }, [id, user]);

  useEffect(() => {
    if (messages && messages.length > 0) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  }, [messages?.length]);

  async function send() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await apiFetch("/messages", {
        method: "POST",
        body: JSON.stringify({ chat_id: id, text: trimmed, reply_to_id: replyingTo?.id ?? null }),
      });
      setText(""); setReplyingTo(null);
    } catch (e: any) { Alert.alert("Gagal", e.message ?? ""); }
    finally { setSending(false); }
  }

  async function attachImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Izin ditolak", "Izinkan akses galeri."); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (res.canceled) return;
    const a = res.assets[0];
    setSending(true);
    try {
      const up = await uploadFile(a.uri, a.fileName ?? "img.jpg", a.mimeType ?? "image/jpeg");
      await apiFetch("/messages", {
        method: "POST",
        body: JSON.stringify({
          chat_id: id, media_path: up.path, media_type: "image",
          reply_to_id: replyingTo?.id ?? null,
        }),
      });
      setReplyingTo(null);
    } catch (e: any) { Alert.alert("Gagal upload", e.message ?? ""); }
    finally { setSending(false); }
  }

  async function startRecording() {
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) { Alert.alert("Izin ditolak", "Izinkan akses mikrofon."); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordStartRef.current = Date.now();
    } catch (e: any) {
      Alert.alert("Gagal merekam", e.message ?? "");
    }
  }

  async function stopAndSendRecording(cancelled = false) {
    try {
      const duration = Date.now() - recordStartRef.current;
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      const uri = recorder.uri;
      if (cancelled || !uri || duration < 500) return;
      setSending(true);
      const up = await uploadFile(uri, `voice-${Date.now()}.m4a`, "audio/m4a");
      await apiFetch("/messages", {
        method: "POST",
        body: JSON.stringify({
          chat_id: id, media_path: up.path, media_type: "audio",
          audio_duration_ms: duration, reply_to_id: replyingTo?.id ?? null,
        }),
      });
      setReplyingTo(null);
    } catch (e: any) {
      Alert.alert("Gagal", e.message ?? "");
    } finally { setSending(false); }
  }

  function onChangeText(v: string) {
    setText(v);
    wsClient.send({ type: "typing", chat_id: id });
  }

  async function reactTo(m: Message, emoji: string) {
    try {
      await apiFetch(`/messages/${m.id}/react`, { method: "POST", body: JSON.stringify({ emoji }) });
    } catch (e: any) { Alert.alert("Gagal", e.message ?? ""); }
  }

  const recordingDurationSec = Math.floor((recorderState?.durationMillis ?? 0) / 1000);
  const isRecording = !!recorderState?.isRecording;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.surfaceSecondary }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { backgroundColor: colors.brandSecondary, paddingTop: insets.top }]}>
        <Pressable testID="chat-back" onPress={() => router.back()} style={styles.hbtn}>
          <Ionicons name="chevron-back" size={26} color={colors.onBrandSecondary} />
        </Pressable>
        <AvatarSmall path={chat?.kind === "group" ? chat?.avatar_path : other?.avatar_path} name={headerTitle} />
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text numberOfLines={1} style={[styles.htitle, { color: colors.onBrandSecondary }]}>{headerTitle}</Text>
          <Text numberOfLines={1} style={[styles.hsub, { color: colors.onBrandSecondary, opacity: 0.85 }]}>{headerSub}</Text>
        </View>
        <Pressable style={styles.hbtn}><Ionicons name="videocam" size={22} color={colors.onBrandSecondary} /></Pressable>
        <Pressable style={styles.hbtn}><Ionicons name="call" size={20} color={colors.onBrandSecondary} /></Pressable>
      </View>

      {messages === null ? (
        <View style={styles.centered}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : messages.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="lock-closed" size={40} color={colors.muted} />
          <Text style={[styles.emptyText, { color: colors.muted }]}>Pesan terenkripsi end-to-end. Mulai chat!</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.xs, paddingBottom: spacing.lg }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const mine = item.sender_id === user?.id;
            const senderName = chat?.kind === "group" && !mine
              ? chat.members.find((m) => m.id === item.sender_id)?.name : null;
            const readByOthers = item.read_by.filter((u) => u !== user?.id).length > 0;
            const reactionEntries = Object.entries(item.reactions ?? {}).filter(([, u]) => u.length > 0);
            const rp = item.reply_to;
            return (
              <View style={[styles.bubbleRow, { justifyContent: mine ? "flex-end" : "flex-start" }]}>
                <Pressable
                  testID={`bubble-${item.id}`}
                  onLongPress={() => actionsRef.current?.open(item)}
                  delayLongPress={220}
                  style={[
                    styles.bubble,
                    {
                      backgroundColor: mine ? colors.brandTertiary : colors.surface,
                      borderTopRightRadius: mine ? 4 : radius.md,
                      borderTopLeftRadius: mine ? radius.md : 4,
                    },
                  ]}
                >
                  {senderName ? <Text style={[styles.sender, { color: colors.brandSecondary }]}>{senderName}</Text> : null}

                  {rp ? (
                    <View style={[styles.replyQuote, {
                      backgroundColor: mine ? "rgba(7,94,84,0.10)" : colors.surfaceSecondary,
                      borderLeftColor: colors.brandPrimary,
                    }]}>
                      <Text numberOfLines={1} style={[styles.replyName, { color: colors.brandSecondary }]}>
                        {rp.sender_id === user?.id ? "Kamu" : (chat?.members.find((m) => m.id === rp.sender_id)?.name ?? "")}
                      </Text>
                      <Text numberOfLines={1} style={[styles.replyText, { color: colors.muted }]}>{replyPreviewText(rp)}</Text>
                    </View>
                  ) : null}

                  {item.media_type === "image" && item.media_path ? <ChatMedia path={item.media_path} /> : null}
                  {item.media_type === "audio" && item.media_path ? (
                    <AudioMessage messageId={item.id} path={item.media_path} durationMs={item.audio_duration_ms ?? null} mine={mine} />
                  ) : null}
                  {item.text ? (
                    <Text style={[styles.msgText, { color: mine ? colors.onBrandTertiary : colors.onSurface }]}>{item.text}</Text>
                  ) : null}

                  <View style={styles.metaRow}>
                    <Text style={[styles.msgTime, { color: mine ? colors.onBrandTertiary : colors.muted, opacity: 0.7 }]}>
                      {timeOnly(item.created_at)}
                    </Text>
                    {mine ? (
                      <Ionicons
                        name={readByOthers ? "checkmark-done" : "checkmark"}
                        size={14}
                        color={readByOthers ? colors.info : (mine ? colors.onBrandTertiary : colors.muted)}
                        style={{ opacity: 0.9 }}
                      />
                    ) : null}
                  </View>

                  {reactionEntries.length > 0 ? (
                    <View style={[styles.reactionsBar, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
                      {reactionEntries.map(([emoji, users]) => (
                        <Pressable
                          key={emoji}
                          testID={`reaction-${item.id}-${emoji}`}
                          onPress={() => reactTo(item, emoji)}
                          style={styles.reactionChip}
                        >
                          <Text style={styles.reactionEmoji}>{emoji}</Text>
                          {users.length > 1 ? (
                            <Text style={[styles.reactionCount, { color: colors.muted }]}>{users.length}</Text>
                          ) : null}
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </Pressable>
              </View>
            );
          }}
        />
      )}

      {replyingTo ? (
        <View testID="reply-preview" style={[styles.replyBar, { backgroundColor: colors.surface, borderTopColor: colors.divider }]}>
          <View style={{ width: 3, height: 32, backgroundColor: colors.brandPrimary, borderRadius: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.replyName, { color: colors.brandSecondary }]}>
              {replyingTo.sender_id === user?.id ? "Kamu" : (chat?.members.find((m) => m.id === replyingTo.sender_id)?.name ?? "")}
            </Text>
            <Text numberOfLines={1} style={[styles.replyText, { color: colors.muted }]}>
              {replyingTo.text ?? (replyingTo.media_type === "image" ? "📷 Foto"
                : replyingTo.media_type === "audio" ? "🎤 Pesan suara" : "Pesan")}
            </Text>
          </View>
          <Pressable testID="cancel-reply" onPress={() => setReplyingTo(null)} style={{ padding: spacing.xs }}>
            <Ionicons name="close" size={22} color={colors.muted} />
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.inputBar, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        {isRecording ? (
          <View testID="recording-indicator" style={[styles.recordingIndicator, { backgroundColor: colors.surfaceSecondary }]}>
            <View style={[styles.recordingDot, { backgroundColor: colors.error }]} />
            <Text style={{ color: colors.onSurface, fontSize: 15, flex: 1 }}>Merekam… {recordingDurationSec}s</Text>
            <Pressable testID="cancel-recording" onPress={() => stopAndSendRecording(true)} style={{ padding: spacing.sm }}>
              <Ionicons name="trash" size={20} color={colors.error} />
            </Pressable>
          </View>
        ) : (
          <>
            <Pressable testID="attach-image" onPress={attachImage} style={styles.iconBtn}>
              <Ionicons name="add-circle-outline" size={26} color={colors.brandSecondary} />
            </Pressable>
            <View style={[styles.inputWrap, { backgroundColor: colors.surfaceSecondary }]}>
              <TextInput
                testID="message-input"
                value={text}
                onChangeText={onChangeText}
                placeholder="Ketik pesan"
                placeholderTextColor={colors.muted}
                multiline
                style={[styles.textInput, { color: colors.onSurface }]}
              />
            </View>
          </>
        )}
        <Pressable
          testID={text.trim() ? "send-message-button" : "voice-record-button"}
          onPress={text.trim() ? send : undefined}
          onPressIn={!text.trim() && !isRecording ? startRecording : undefined}
          onPressOut={isRecording ? () => stopAndSendRecording(false) : undefined}
          disabled={sending}
          style={[
            styles.sendBtn,
            {
              backgroundColor: text.trim() || isRecording ? colors.brandPrimary : colors.brandSecondary,
              opacity: sending ? 0.7 : 1,
              transform: [{ scale: isRecording ? 1.15 : 1 }],
            },
          ]}
        >
          <Ionicons
            name={text.trim() ? "send" : "mic"}
            size={20}
            color={text.trim() ? colors.onBrandPrimary : colors.onBrandSecondary}
          />
        </Pressable>
      </View>

      <MessageActionsSheet
        ref={actionsRef}
        myUserId={user?.id}
        onReact={reactTo}
        onReply={(m) => setReplyingTo(m)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.sm, paddingBottom: spacing.sm, gap: 2 },
  hbtn: { padding: spacing.sm },
  htitle: { fontSize: 16, fontWeight: "600" },
  hsub: { fontSize: 12, marginTop: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm },
  emptyText: { fontSize: 14, textAlign: "center" },
  bubbleRow: { flexDirection: "row", marginVertical: 2 },
  bubble: { maxWidth: "78%", padding: spacing.sm + 2, borderRadius: radius.md, gap: 4 },
  sender: { fontSize: 12, fontWeight: "700" },
  msgText: { fontSize: 15, lineHeight: 20 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-end", marginTop: 2 },
  msgTime: { fontSize: 10 },
  media: { width: 220, height: 220, borderRadius: radius.sm, marginBottom: 4 },
  replyQuote: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderLeftWidth: 3, borderRadius: 6, marginBottom: 4 },
  replyName: { fontSize: 12, fontWeight: "700" },
  replyText: { fontSize: 12, marginTop: 1 },
  reactionsBar: {
    position: "absolute", bottom: -14, right: 6, flexDirection: "row",
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth, gap: 4,
  },
  reactionChip: { flexDirection: "row", alignItems: "center", gap: 2 },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 11, fontWeight: "600" },
  replyBar: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputBar: {
    flexDirection: "row", alignItems: "flex-end", paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm, gap: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.08)",
  },
  iconBtn: { padding: spacing.sm },
  inputWrap: { flex: 1, borderRadius: 22, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 40, maxHeight: 120, justifyContent: "center" },
  textInput: { fontSize: 15, paddingVertical: 0, maxHeight: 100 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  recordingIndicator: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm,
    height: 40, borderRadius: 22, paddingHorizontal: spacing.md,
  },
  recordingDot: { width: 10, height: 10, borderRadius: 5 },
});
