import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator,
  RefreshControl, TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";

import { useTheme, spacing, radius } from "@/src/theme";
import { apiFetch, Chat, fileUrl } from "@/src/api";
import { useAuth } from "@/src/auth-context";
import { wsClient, WSEvent } from "@/src/ws";

function formatTime(iso: string | undefined | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const same = d.toDateString() === now.toDateString();
  if (same) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return "Kemarin";
  return d.toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function Avatar({ path, name, size = 52 }: { path?: string | null; name: string; size?: number }) {
  const { colors } = useTheme();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (path) fileUrl(path).then(setUrl); else setUrl(null);
  }, [path]);
  const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {url ? (
        <Image source={{ uri: url }} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <Text style={{ fontSize: size * 0.36, fontWeight: "600", color: colors.brandSecondary }}>{initials}</Text>
      )}
    </View>
  );
}

export default function ChatsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      const list: Chat[] = await apiFetch("/chats");
      setChats(list);
    } catch { setChats([]); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const off = wsClient.on((e: WSEvent) => {
      if (e.type === "message" || e.type === "read") load();
    });
    return () => { off(); };
  }, [load]);

  const filtered = useMemo(() => {
    if (!chats) return [];
    const s = q.trim().toLowerCase();
    if (!s) return chats;
    return chats.filter((c) => {
      const title = c.kind === "group" ? (c.name ?? "") : (c.members.find((m) => m.id !== user?.id)?.name ?? "");
      return title.toLowerCase().includes(s);
    });
  }, [chats, q, user]);

  return (
    <View testID="chats-screen" style={[styles.flex, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.onSurface }]}>Chat</Text>
        <Pressable testID="new-chat-button" onPress={() => router.push("/new-chat")} style={styles.headerIcon}>
          <Ionicons name="create-outline" size={26} color={colors.brandSecondary} />
        </Pressable>
      </View>
      <View style={[styles.searchWrap, { backgroundColor: colors.surfaceSecondary }]}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          testID="chat-search-input"
          value={q}
          onChangeText={setQ}
          placeholder="Cari"
          placeholderTextColor={colors.muted}
          style={[styles.searchInput, { color: colors.onSurface }]}
        />
      </View>

      {chats === null ? (
        <View style={styles.centered}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="chatbubbles-outline" size={72} color={colors.muted} />
          <Text style={[styles.emptyTitle, { color: colors.onSurface }]}>Belum ada chat</Text>
          <Text style={[styles.emptySub, { color: colors.muted }]}>Ketuk ikon pensil untuk mulai chat baru.</Text>
          <Pressable testID="empty-new-chat" onPress={() => router.push("/new-chat")} style={[styles.emptyBtn, { backgroundColor: colors.brandPrimary }]}>
            <Text style={{ color: colors.onBrandPrimary, fontWeight: "600" }}>Mulai chat baru</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.brandPrimary} />}
          renderItem={({ item }) => {
            const other = item.kind === "direct" ? item.members.find((m) => m.id !== user?.id) : null;
            const title = item.kind === "group" ? (item.name ?? "Grup") : (other?.name ?? "Kontak");
            const avatarPath = item.kind === "group" ? item.avatar_path : other?.avatar_path ?? null;
            const preview = item.last_message?.text ?? (item.last_message?.media_type ? `📎 ${item.last_message.media_type}` : "Belum ada pesan");
            return (
              <Pressable
                testID={`chat-row-${item.id}`}
                onPress={() => router.push({ pathname: "/chat/[id]", params: { id: item.id } })}
                style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface }]}
              >
                <View>
                  <Avatar path={avatarPath} name={title} />
                  {item.kind === "direct" && other?.online ? (
                    <View style={[styles.onlineDot, { backgroundColor: colors.success, borderColor: colors.surface }]} />
                  ) : null}
                </View>
                <View style={styles.rowMid}>
                  <Text numberOfLines={1} style={[styles.rowName, { color: colors.onSurface }]}>{title}</Text>
                  <Text numberOfLines={1} style={[styles.rowPreview, { color: colors.muted }]}>{preview}</Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={[styles.rowTime, { color: item.unread_count > 0 ? colors.brandSecondary : colors.muted }]}>
                    {formatTime(item.last_message?.created_at ?? item.updated_at)}
                  </Text>
                  {item.unread_count > 0 ? (
                    <View style={[styles.unread, { backgroundColor: colors.brandPrimary }]}>
                      <Text style={{ color: colors.onBrandPrimary, fontSize: 11, fontWeight: "700" }}>{item.unread_count}</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          }}
          ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: colors.divider }]} />}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  title: { fontSize: 32, fontWeight: "700" },
  headerIcon: { padding: spacing.xs },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, paddingHorizontal: spacing.md, height: 38, borderRadius: radius.md, marginBottom: spacing.sm },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: "600" },
  emptySub: { fontSize: 14, textAlign: "center" },
  emptyBtn: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.pill, marginTop: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  rowMid: { flex: 1, gap: 2 },
  rowName: { fontSize: 16, fontWeight: "600" },
  rowPreview: { fontSize: 14 },
  rowRight: { alignItems: "flex-end", gap: 6 },
  rowTime: { fontSize: 12 },
  unread: { minWidth: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 84 },
  onlineDot: { position: "absolute", right: 0, bottom: 0, width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
});
