import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, TextInput, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useTheme, spacing, radius } from "@/src/theme";
import { apiFetch, User } from "@/src/api";

export default function NewGroupScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const router = useRouter();
  const [users, setUsers] = useState<User[] | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => { apiFetch("/users").then(setUsers).catch(() => setUsers([])); }, []);

  function toggle(uid: string) {
    setSelected((s) => ({ ...s, [uid]: !s[uid] }));
  }

  async function create() {
    const memberIds = Object.keys(selected).filter((k) => selected[k]);
    if (!name.trim()) { Alert.alert("Isi nama grup"); return; }
    if (memberIds.length < 1) { Alert.alert("Pilih minimal 1 anggota"); return; }
    setCreating(true);
    try {
      const chat = await apiFetch("/chats", { method: "POST", body: JSON.stringify({ kind: "group", member_ids: memberIds, name: name.trim() }) });
      router.replace({ pathname: "/chat/[id]", params: { id: chat.id } });
    } catch (e: any) { Alert.alert("Gagal", e.message ?? ""); }
    finally { setCreating(false); }
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <View testID="new-group-screen" style={[styles.flex, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}><Ionicons name="chevron-back" size={26} color={colors.brandSecondary} /></Pressable>
        <Text style={[styles.title, { color: colors.onSurface }]}>Grup Baru</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={[styles.inputWrap, { backgroundColor: colors.surfaceSecondary }]}>
        <TextInput
          testID="group-name-input"
          value={name}
          onChangeText={setName}
          placeholder="Nama Grup"
          placeholderTextColor={colors.muted}
          style={[styles.input, { color: colors.onSurface }]}
        />
      </View>
      <Text style={[styles.subLabel, { color: colors.muted }]}>{selectedCount} anggota dipilih</Text>

      {users === null ? (
        <View style={styles.centered}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          renderItem={({ item }) => {
            const on = !!selected[item.id];
            return (
              <Pressable
                testID={`select-user-${item.id}`}
                onPress={() => toggle(item.id)}
                style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface }]}
              >
                <View style={[styles.avatar, { backgroundColor: colors.surfaceTertiary }]}>
                  <Text style={{ fontSize: 16, fontWeight: "600", color: colors.brandSecondary }}>{item.name.slice(0, 2).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowName, { color: colors.onSurface }]}>{item.name}</Text>
                  <Text numberOfLines={1} style={[styles.rowSub, { color: colors.muted }]}>{item.about}</Text>
                </View>
                <View style={[styles.check, { borderColor: on ? colors.brandPrimary : colors.border, backgroundColor: on ? colors.brandPrimary : "transparent" }]}>
                  {on ? <Ionicons name="checkmark" size={16} color={colors.onBrandPrimary} /> : null}
                </View>
              </Pressable>
            );
          }}
          ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: colors.divider }]} />}
        />
      )}

      <Pressable
        testID="create-group-btn"
        onPress={create}
        disabled={creating || selectedCount < 1 || !name.trim()}
        style={[
          styles.fab,
          { backgroundColor: creating || selectedCount < 1 || !name.trim() ? colors.surfaceTertiary : colors.brandPrimary, bottom: insets.bottom + spacing.lg },
        ]}
      >
        {creating ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Ionicons name="arrow-forward" size={26} color={colors.onBrandPrimary} />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  title: { fontSize: 18, fontWeight: "600" },
  iconBtn: { padding: spacing.sm, width: 40 },
  inputWrap: { marginHorizontal: spacing.lg, paddingHorizontal: spacing.md, height: 48, borderRadius: radius.md, justifyContent: "center" },
  input: { fontSize: 15, paddingVertical: 0 },
  subLabel: { fontSize: 12, marginTop: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.xs, fontWeight: "600" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  rowName: { fontSize: 16, fontWeight: "600" },
  rowSub: { fontSize: 13, marginTop: 2 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 76 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  fab: { position: "absolute", right: 20, width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
});
