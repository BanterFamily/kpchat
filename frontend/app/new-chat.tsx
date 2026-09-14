import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { useTheme, spacing, radius } from "@/src/theme";
import { apiFetch, fileUrl, User } from "@/src/api";

function AvatarBig({ path, name }: { path?: string | null; name: string }) {
  const { colors } = useTheme();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { if (path) fileUrl(path).then(setUrl); else setUrl(null); }, [path]);
  const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {url ? <Image source={{ uri: url }} style={{ width: 48, height: 48 }} contentFit="cover" /> :
        <Text style={{ fontSize: 18, fontWeight: "600", color: colors.brandSecondary }}>{initials}</Text>}
    </View>
  );
}

export default function NewChatScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const router = useRouter();
  const [users, setUsers] = useState<User[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    apiFetch("/users").then(setUsers).catch(() => setUsers([]));
  }, []);

  async function startChat(uid: string) {
    try {
      const chat = await apiFetch("/chats", { method: "POST", body: JSON.stringify({ kind: "direct", member_ids: [uid] }) });
      router.replace({ pathname: "/chat/[id]", params: { id: chat.id } });
    } catch {}
  }

  const filtered = (users ?? []).filter((u) => u.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <View testID="new-chat-screen" style={[styles.flex, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}><Ionicons name="close" size={26} color={colors.brandSecondary} /></Pressable>
        <Text style={[styles.title, { color: colors.onSurface }]}>Kontak</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={[styles.searchWrap, { backgroundColor: colors.surfaceSecondary }]}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          testID="user-search-input"
          value={q}
          onChangeText={setQ}
          placeholder="Cari kontak"
          placeholderTextColor={colors.muted}
          style={[styles.searchInput, { color: colors.onSurface }]}
        />
      </View>

      <Pressable testID="new-group-btn" onPress={() => router.push("/new-group")} style={styles.actionRow}>
        <View style={[styles.actionIcon, { backgroundColor: colors.brandPrimary }]}>
          <Ionicons name="people" size={22} color={colors.onBrandPrimary} />
        </View>
        <Text style={[styles.actionText, { color: colors.onSurface }]}>Grup Baru</Text>
      </Pressable>

      <Text style={[styles.sectionLabel, { color: colors.muted }]}>KONTAK DI WA-CLONE</Text>

      {users === null ? (
        <View style={styles.centered}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}><Text style={{ color: colors.muted }}>Belum ada kontak</Text></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(u) => u.id}
          renderItem={({ item }) => (
            <Pressable
              testID={`user-row-${item.id}`}
              onPress={() => startChat(item.id)}
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface }]}
            >
              <AvatarBig path={item.avatar_path} name={item.name} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowName, { color: colors.onSurface }]}>{item.name}</Text>
                <Text numberOfLines={1} style={[styles.rowSub, { color: colors.muted }]}>{item.about}</Text>
              </View>
              {item.online ? <View style={[styles.dot, { backgroundColor: colors.success }]} /> : null}
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: colors.divider }]} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  title: { fontSize: 18, fontWeight: "600" },
  iconBtn: { padding: spacing.sm, width: 40 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginHorizontal: spacing.lg, paddingHorizontal: spacing.md, height: 38, borderRadius: radius.md, marginBottom: spacing.sm },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  actionIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  actionText: { fontSize: 16, fontWeight: "600" },
  sectionLabel: { fontSize: 12, fontWeight: "600", marginTop: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.xs },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  rowName: { fontSize: 16, fontWeight: "600" },
  rowSub: { fontSize: 13, marginTop: 2 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 76 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
