import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, TextInput, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useTheme, spacing, radius } from "@/src/theme";
import { useAuth } from "@/src/auth-context";
import { apiFetch, fileUrl, uploadFile } from "@/src/api";
import { wsClient } from "@/src/ws";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user, logout, refresh, setUser } = useAuth();
  const router = useRouter();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [about, setAbout] = useState(user?.about ?? "");
  const [editingAbout, setEditingAbout] = useState(false);

  useEffect(() => {
    if (user?.avatar_path) fileUrl(user.avatar_path).then(setAvatarUrl);
    else setAvatarUrl(null);
    setAbout(user?.about ?? "");
  }, [user]);

  async function pickAvatar() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Izin ditolak", "Izinkan akses galeri."); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (res.canceled) return;
    const asset = res.assets[0];
    try {
      const up = await uploadFile(asset.uri, asset.fileName ?? "avatar.jpg", asset.mimeType ?? "image/jpeg");
      const updated = await apiFetch("/auth/me", { method: "PATCH", body: JSON.stringify({ avatar_path: up.path }) });
      setUser(updated);
    } catch (e: any) {
      Alert.alert("Gagal upload", e.message ?? "");
    }
  }

  async function saveAbout() {
    try {
      const updated = await apiFetch("/auth/me", { method: "PATCH", body: JSON.stringify({ about }) });
      setUser(updated);
      setEditingAbout(false);
    } catch (e: any) { Alert.alert("Gagal", e.message ?? ""); }
  }

  async function onLogout() {
    wsClient.disconnect();
    await logout();
    router.replace("/(auth)/login");
  }

  return (
    <ScrollView testID="settings-screen" style={{ backgroundColor: colors.surface }} contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + spacing.xl }}>
      <View style={styles.headerRow}><Text style={[styles.title, { color: colors.onSurface }]}>Setelan</Text></View>

      <Pressable testID="avatar-picker" onPress={pickAvatar} style={[styles.card, { backgroundColor: colors.surfaceSecondary }]}>
        <View style={[styles.avatarWrap, { backgroundColor: colors.surfaceTertiary }]}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" />
          ) : (
            <Text style={{ fontSize: 30, color: colors.brandSecondary, fontWeight: "700" }}>
              {(user?.name ?? "?").slice(0, 2).toUpperCase()}
            </Text>
          )}
          <View style={[styles.cameraBadge, { backgroundColor: colors.brandPrimary }]}>
            <Ionicons name="camera" size={16} color={colors.onBrandPrimary} />
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: colors.onSurface }]}>{user?.name}</Text>
          <Text style={[styles.email, { color: colors.muted }]}>{user?.phone}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.muted} />
      </Pressable>

      <Text style={[styles.sectionLabel, { color: colors.muted }]}>TENTANG</Text>
      <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, alignItems: "flex-start" }]}>
        {editingAbout ? (
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <TextInput
              testID="about-input"
              value={about}
              onChangeText={setAbout}
              autoFocus
              style={[styles.aboutInput, { color: colors.onSurface, borderColor: colors.border }]}
              placeholder="Tulis tentang"
              placeholderTextColor={colors.muted}
              maxLength={160}
            />
            <Pressable testID="save-about" onPress={saveAbout}>
              <Text style={{ color: colors.brandSecondary, fontWeight: "600" }}>Simpan</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={{ flex: 1 }} testID="edit-about" onPress={() => setEditingAbout(true)}>
            <Text style={[styles.about, { color: colors.onSurface }]}>{user?.about}</Text>
            <Text style={[styles.tapEdit, { color: colors.muted }]}>Ketuk untuk mengedit</Text>
          </Pressable>
        )}
      </View>

      <Text style={[styles.sectionLabel, { color: colors.muted }]}>AKUN</Text>
      <View style={[styles.groupCard, { backgroundColor: colors.surfaceSecondary }]}>
        <SettingRow icon="notifications-outline" label="Notifikasi" />
        <View style={[styles.divider, { backgroundColor: colors.divider }]} />
        <SettingRow icon="lock-closed-outline" label="Privasi" />
        <View style={[styles.divider, { backgroundColor: colors.divider }]} />
        <SettingRow icon="help-circle-outline" label="Bantuan" />
      </View>

      <Pressable testID="logout-button" onPress={onLogout} style={[styles.logoutBtn, { backgroundColor: colors.surfaceSecondary }]}>
        <Ionicons name="log-out-outline" size={22} color={colors.error} />
        <Text style={[styles.logoutText, { color: colors.error }]}>Keluar</Text>
      </Pressable>
    </ScrollView>
  );
}

function SettingRow({ icon, label }: { icon: any; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.settingRow}>
      <Ionicons name={icon} size={22} color={colors.brandSecondary} />
      <Text style={[styles.settingLabel, { color: colors.onSurface }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  title: { fontSize: 32, fontWeight: "700" },
  card: { marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatarWrap: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center", overflow: "visible" },
  avatar: { width: 68, height: 68, borderRadius: 34 },
  cameraBadge: { position: "absolute", bottom: -2, right: -2, width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 18, fontWeight: "700" },
  email: { fontSize: 14, marginTop: 2 },
  sectionLabel: { fontSize: 12, fontWeight: "600", marginTop: spacing.xl, marginHorizontal: spacing.xl, marginBottom: spacing.xs },
  about: { fontSize: 15 },
  tapEdit: { fontSize: 12, marginTop: spacing.xs },
  aboutInput: { flex: 1, fontSize: 15, paddingVertical: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth },
  groupCard: { marginHorizontal: spacing.lg, borderRadius: radius.lg, overflow: "hidden" },
  settingRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  settingLabel: { flex: 1, fontSize: 16 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 54 },
  logoutBtn: { marginHorizontal: spacing.lg, marginTop: spacing.xl, borderRadius: radius.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingVertical: spacing.md },
  logoutText: { fontSize: 16, fontWeight: "600" },
});
