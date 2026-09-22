import { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Alert, TextInput,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useTheme, spacing, radius } from "@/src/theme";
import { apiFetch, Chat, fileUrl, uploadFile, User } from "@/src/api";
import { useAuth } from "@/src/auth-context";

function Avatar({ path, name, size = 56 }: { path?: string | null; name: string; size?: number }) {
  const { colors } = useTheme();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { if (path) fileUrl(path).then(setUrl); else setUrl(null); }, [path]);
  const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {url ? <Image source={{ uri: url }} style={{ width: size, height: size }} contentFit="cover" /> :
        <Text style={{ fontSize: size * 0.34, fontWeight: "600", color: colors.brandSecondary }}>{initials}</Text>}
    </View>
  );
}

export default function GroupInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user } = useAuth();

  const [chat, setChat] = useState<Chat | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [contacts, setContacts] = useState<User[] | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const isAdmin = !!chat && chat.created_by === user?.id;

  const load = useCallback(async () => {
    try {
      const c: Chat = await apiFetch(`/chats/${id}`);
      setChat(c); setName(c.name ?? "");
      setAvatarUrl(c.avatar_path ? await fileUrl(c.avatar_path) : null);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "");
      router.back();
    }
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  async function saveName() {
    if (!name.trim() || !isAdmin) return;
    setSaving(true);
    try {
      const updated: Chat = await apiFetch(`/chats/${id}`, { method: "PATCH", body: JSON.stringify({ name: name.trim() }) });
      setChat(updated); setEditingName(false);
    } catch (e: any) { Alert.alert("Gagal", e.message ?? ""); }
    finally { setSaving(false); }
  }

  async function pickGroupAvatar() {
    if (!isAdmin) { Alert.alert("Hanya admin", "Kamu bukan admin grup ini."); return; }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Izin ditolak"); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (res.canceled) return;
    const a = res.assets[0];
    try {
      const up = await uploadFile(a.uri, a.fileName ?? "grp.jpg", a.mimeType ?? "image/jpeg");
      const updated: Chat = await apiFetch(`/chats/${id}`, { method: "PATCH", body: JSON.stringify({ avatar_path: up.path }) });
      setChat(updated);
      setAvatarUrl(updated.avatar_path ? await fileUrl(updated.avatar_path) : null);
    } catch (e: any) { Alert.alert("Gagal", e.message ?? ""); }
  }

  async function openAddMembers() {
    if (!isAdmin) return;
    setPickerVisible(true);
    if (!contacts) {
      try { const users: User[] = await apiFetch("/users"); setContacts(users); } catch {}
    }
  }

  async function addMember(uid: string) {
    try {
      const updated: Chat = await apiFetch(`/chats/${id}/members`, { method: "POST", body: JSON.stringify({ member_ids: [uid] }) });
      setChat(updated);
    } catch (e: any) { Alert.alert("Gagal", e.message ?? ""); }
  }

  function confirmRemove(m: User) {
    if (!isAdmin) return;
    if (m.id === user?.id) return; // self-leave is a separate button
    Alert.alert("Hapus anggota", `Yakin hapus ${m.name} dari grup?`, [
      { text: "Batal", style: "cancel" },
      { text: "Hapus", style: "destructive", onPress: async () => {
        try {
          const updated: Chat = await apiFetch(`/chats/${id}/members/${m.id}`, { method: "DELETE" });
          setChat(updated);
        } catch (e: any) { Alert.alert("Gagal", e.message ?? ""); }
      }},
    ]);
  }

  function confirmLeave() {
    if (!user) return;
    Alert.alert("Keluar dari grup", "Kamu tidak akan menerima pesan dari grup ini lagi.", [
      { text: "Batal", style: "cancel" },
      { text: "Keluar", style: "destructive", onPress: async () => {
        try {
          await apiFetch(`/chats/${id}/members/${user.id}`, { method: "DELETE" });
          router.replace("/(tabs)/chats");
        } catch (e: any) { Alert.alert("Gagal", e.message ?? ""); }
      }},
    ]);
  }

  const nonMembers = (contacts ?? []).filter((c) => chat && !chat.member_ids.includes(c.id));

  if (!chat) {
    return (
      <View style={[styles.flex, styles.center, { backgroundColor: colors.surface }]}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  return (
    <View testID="group-info-screen" style={[styles.flex, { backgroundColor: colors.surface }]}>
      <View style={[styles.header, { backgroundColor: colors.brandSecondary, paddingTop: insets.top }]}>
        <Pressable testID="info-back" onPress={() => router.back()} style={styles.hbtn}>
          <Ionicons name="chevron-back" size={26} color={colors.onBrandSecondary} />
        </Pressable>
        <Text style={[styles.htitle, { color: colors.onBrandSecondary, flex: 1 }]}>Info Grup</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <View style={styles.heroWrap}>
          <Pressable testID="group-avatar-picker" onPress={pickGroupAvatar} disabled={!isAdmin}>
            <View style={[styles.avatarBig, { backgroundColor: colors.surfaceTertiary }]}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarBigImg} contentFit="cover" />
              ) : (
                <Text style={{ fontSize: 40, fontWeight: "700", color: colors.brandSecondary }}>
                  {(chat.name ?? "?").slice(0, 2).toUpperCase()}
                </Text>
              )}
              {isAdmin ? (
                <View style={[styles.cameraBadge, { backgroundColor: colors.brandPrimary }]}>
                  <Ionicons name="camera" size={18} color={colors.onBrandPrimary} />
                </View>
              ) : null}
            </View>
          </Pressable>

          {editingName ? (
            <View style={styles.nameEditRow}>
              <TextInput
                testID="group-name-input"
                value={name}
                onChangeText={setName}
                autoFocus
                style={[styles.nameInput, { color: colors.onSurface, borderColor: colors.border }]}
                maxLength={60}
              />
              <Pressable testID="save-group-name" onPress={saveName} disabled={saving}>
                <Text style={{ color: colors.brandPrimary, fontWeight: "700", padding: spacing.sm }}>Simpan</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              testID="edit-group-name"
              onPress={() => isAdmin && setEditingName(true)}
              style={styles.nameRow}
            >
              <Text style={[styles.groupName, { color: colors.onSurface }]}>{chat.name}</Text>
              {isAdmin ? <Ionicons name="pencil" size={16} color={colors.muted} style={{ marginLeft: 6 }} /> : null}
            </Pressable>
          )}
          <Text style={[styles.groupSub, { color: colors.muted }]}>
            Grup • {chat.member_ids.length} anggota{isAdmin ? " • kamu admin" : ""}
          </Text>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.muted }]}>ANGGOTA</Text>
        <View style={[styles.groupCard, { backgroundColor: colors.surfaceSecondary }]}>
          {isAdmin ? (
            <Pressable testID="add-member-btn" onPress={openAddMembers} style={styles.memberRow}>
              <View style={[styles.addIcon, { backgroundColor: colors.brandPrimary }]}>
                <Ionicons name="person-add" size={20} color={colors.onBrandPrimary} />
              </View>
              <Text style={[styles.memberName, { color: colors.brandPrimary, fontWeight: "600", flex: 1 }]}>Tambah Anggota</Text>
            </Pressable>
          ) : null}
          {chat.members.map((m, i) => {
            const admin = chat.created_by === m.id;
            const me = m.id === user?.id;
            return (
              <View key={m.id}>
                {(isAdmin || i > 0) && i > 0 ? <View style={[styles.divider, { backgroundColor: colors.divider }]} /> : null}
                <Pressable
                  testID={`member-${m.id}`}
                  onLongPress={() => !me && isAdmin && confirmRemove(m)}
                  style={styles.memberRow}
                >
                  <Avatar path={m.avatar_path} name={m.name} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.memberName, { color: colors.onSurface }]}>
                      {me ? "Kamu" : m.name}
                    </Text>
                    <Text numberOfLines={1} style={[styles.memberSub, { color: colors.muted }]}>{m.about}</Text>
                  </View>
                  {admin ? <Text style={[styles.adminBadge, { color: colors.brandSecondary, borderColor: colors.brandSecondary }]}>Admin</Text> : null}
                  {isAdmin && !me && !admin ? (
                    <Pressable testID={`remove-${m.id}`} onPress={() => confirmRemove(m)} style={{ padding: spacing.xs }}>
                      <Ionicons name="close-circle" size={22} color={colors.error} />
                    </Pressable>
                  ) : null}
                </Pressable>
              </View>
            );
          })}
        </View>

        <Pressable testID="leave-group-btn" onPress={confirmLeave} style={[styles.leaveBtn, { backgroundColor: colors.surfaceSecondary }]}>
          <Ionicons name="exit-outline" size={22} color={colors.error} />
          <Text style={[styles.leaveText, { color: colors.error }]}>Keluar dari Grup</Text>
        </Pressable>
      </ScrollView>

      {pickerVisible ? (
        <View style={styles.pickerBackdrop}>
          <Pressable style={styles.pickerBackdrop} onPress={() => setPickerVisible(false)} />
          <View style={[styles.pickerSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.md }]}>
            <View style={styles.pickerHandle} />
            <Text style={[styles.pickerTitle, { color: colors.onSurface }]}>Tambah Anggota</Text>
            {contacts === null ? (
              <ActivityIndicator color={colors.brandPrimary} style={{ marginVertical: spacing.xl }} />
            ) : nonMembers.length === 0 ? (
              <Text style={{ color: colors.muted, textAlign: "center", padding: spacing.lg }}>Semua kontak sudah menjadi anggota.</Text>
            ) : (
              nonMembers.map((c) => (
                <Pressable
                  key={c.id}
                  testID={`add-candidate-${c.id}`}
                  onPress={async () => { setPickerVisible(false); await addMember(c.id); }}
                  style={styles.memberRow}
                >
                  <Avatar path={c.avatar_path} name={c.name} size={40} />
                  <Text style={[styles.memberName, { color: colors.onSurface, flex: 1 }]}>{c.name}</Text>
                  <Ionicons name="add-circle" size={22} color={colors.brandPrimary} />
                </Pressable>
              ))
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  hbtn: { padding: spacing.sm },
  htitle: { fontSize: 18, fontWeight: "600", marginLeft: spacing.xs },
  heroWrap: { alignItems: "center", paddingVertical: spacing.xl, gap: spacing.sm },
  avatarBig: { width: 120, height: 120, borderRadius: 60, alignItems: "center", justifyContent: "center", overflow: "visible" },
  avatarBigImg: { width: 120, height: 120, borderRadius: 60 },
  cameraBadge: { position: "absolute", bottom: -2, right: -2, width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  nameRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.sm },
  groupName: { fontSize: 22, fontWeight: "700" },
  groupSub: { fontSize: 13, marginTop: 2 },
  nameEditRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm, paddingHorizontal: spacing.xl },
  nameInput: { flex: 1, fontSize: 18, fontWeight: "600", paddingVertical: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, textAlign: "center" },
  sectionLabel: { fontSize: 12, fontWeight: "600", marginTop: spacing.lg, marginHorizontal: spacing.xl, marginBottom: spacing.xs },
  groupCard: { marginHorizontal: spacing.lg, borderRadius: radius.lg, overflow: "hidden" },
  memberRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  addIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  memberName: { fontSize: 16, fontWeight: "600" },
  memberSub: { fontSize: 12, marginTop: 2 },
  adminBadge: { fontSize: 11, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 72 },
  leaveBtn: { marginHorizontal: spacing.lg, marginTop: spacing.xl, borderRadius: radius.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingVertical: spacing.md },
  leaveText: { fontSize: 16, fontWeight: "600" },
  pickerBackdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  pickerSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: spacing.sm, maxHeight: "70%" },
  pickerHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#999", alignSelf: "center", marginBottom: spacing.md },
  pickerTitle: { fontSize: 18, fontWeight: "700", textAlign: "center", marginBottom: spacing.md },
});
