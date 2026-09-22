import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, TextInput, Alert } from "react-native";
import BottomSheet, {
  BottomSheetBackdrop, BottomSheetFlatList, BottomSheetView,
} from "@gorhom/bottom-sheet";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { useTheme, spacing, radius } from "@/src/theme";
import { apiFetch, Chat, fileUrl, Message } from "@/src/api";

export type ForwardPickerRef = { open: (m: Message) => void; close: () => void };

type Row = { id: string; title: string; subtitle: string; avatarPath: string | null; kind: "chat" };

function RowAvatar({ path, name }: { path: string | null; name: string }) {
  const { colors } = useTheme();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { if (path) fileUrl(path).then(setUrl); else setUrl(null); }, [path]);
  const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {url ? <Image source={{ uri: url }} style={{ width: 44, height: 44 }} contentFit="cover" /> :
        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.brandSecondary }}>{initials}</Text>}
    </View>
  );
}

export const ForwardPickerSheet = forwardRef<ForwardPickerRef, { myUserId: string | undefined }>(
  function ForwardPickerSheet({ myUserId }, ref) {
    const { colors } = useTheme();
    const sheetRef = useRef<BottomSheet>(null);
    const [message, setMessage] = useState<Message | null>(null);
    const [chats, setChats] = useState<Chat[] | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [q, setQ] = useState("");
    const [sending, setSending] = useState(false);

    useImperativeHandle(ref, () => ({
      open: async (m) => {
        setMessage(m); setSelected(new Set()); setQ("");
        sheetRef.current?.snapToIndex(0);
        try { const list: Chat[] = await apiFetch("/chats"); setChats(list); }
        catch { setChats([]); }
      },
      close: () => sheetRef.current?.close(),
    }));

    const snapPoints = useMemo(() => ["85%"], []);
    const renderBackdrop = useCallback((props: any) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />
    ), []);

    const rows: Row[] = useMemo(() => {
      const list = chats ?? [];
      const mapped: Row[] = list.map((c) => {
        if (c.kind === "group") {
          return { id: c.id, title: c.name ?? "Grup", subtitle: `${c.member_ids.length} anggota`, avatarPath: c.avatar_path, kind: "chat" };
        }
        const other = c.members.find((m) => m.id !== myUserId);
        return { id: c.id, title: other?.name ?? "Kontak", subtitle: other?.phone ?? "", avatarPath: other?.avatar_path ?? null, kind: "chat" };
      });
      const query = q.trim().toLowerCase();
      if (!query) return mapped;
      return mapped.filter((r) => r.title.toLowerCase().includes(query) || r.subtitle.toLowerCase().includes(query));
    }, [chats, q, myUserId]);

    function toggle(id: string) {
      setSelected((s) => {
        const next = new Set(s);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    }

    async function submit() {
      if (!message || selected.size === 0) return;
      setSending(true);
      try {
        await apiFetch(`/messages/${message.id}/forward`, {
          method: "POST",
          body: JSON.stringify({ chat_ids: Array.from(selected) }),
        });
        sheetRef.current?.close();
      } catch (e: any) { Alert.alert("Gagal", e.message ?? ""); }
      finally { setSending(false); }
    }

    return (
      <BottomSheet
        ref={sheetRef}
        index={-1}
        enablePanDownToClose
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.muted }}
      >
        <BottomSheetView style={styles.header}>
          <Text style={[styles.title, { color: colors.onSurface }]}>Teruskan ke…</Text>
          <View style={[styles.searchWrap, { backgroundColor: colors.surfaceSecondary }]}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              testID="forward-search-input"
              value={q}
              onChangeText={setQ}
              placeholder="Cari chat / kontak"
              placeholderTextColor={colors.muted}
              style={[styles.searchInput, { color: colors.onSurface }]}
            />
          </View>
        </BottomSheetView>

        {chats === null ? (
          <View style={{ padding: spacing.xl, alignItems: "center" }}>
            <ActivityIndicator color={colors.brandPrimary} />
          </View>
        ) : (
          <BottomSheetFlatList
            data={rows}
            keyExtractor={(r) => r.id}
            renderItem={({ item }) => {
              const on = selected.has(item.id);
              return (
                <Pressable
                  testID={`forward-target-${item.id}`}
                  onPress={() => toggle(item.id)}
                  style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface }]}
                >
                  <RowAvatar path={item.avatarPath} name={item.title} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.onSurface }]}>{item.title}</Text>
                    <Text numberOfLines={1} style={[styles.rowSub, { color: colors.muted }]}>{item.subtitle}</Text>
                  </View>
                  <View style={[styles.check, { borderColor: on ? colors.brandPrimary : colors.border, backgroundColor: on ? colors.brandPrimary : "transparent" }]}>
                    {on ? <Ionicons name="checkmark" size={16} color={colors.onBrandPrimary} /> : null}
                  </View>
                </Pressable>
              );
            }}
            ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: colors.divider }]} />}
            contentContainerStyle={{ paddingBottom: 120 }}
          />
        )}

        {selected.size > 0 ? (
          <Pressable
            testID="forward-send-button"
            onPress={submit}
            disabled={sending}
            style={[styles.fab, { backgroundColor: colors.brandPrimary, opacity: sending ? 0.7 : 1 }]}
          >
            {sending ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
              <>
                <Text style={{ color: colors.onBrandPrimary, fontWeight: "700", marginRight: 8 }}>Kirim ({selected.size})</Text>
                <Ionicons name="send" size={18} color={colors.onBrandPrimary} />
              </>
            )}
          </Pressable>
        ) : null}
      </BottomSheet>
    );
  },
);

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md, gap: spacing.md },
  title: { fontSize: 20, fontWeight: "700", textAlign: "center" },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, height: 42, borderRadius: radius.md },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  rowTitle: { fontSize: 16, fontWeight: "600" },
  rowSub: { fontSize: 13, marginTop: 2 },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 72 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  fab: {
    position: "absolute", bottom: 24, right: 20,
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, height: 52, borderRadius: 26,
    elevation: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
  },
});
