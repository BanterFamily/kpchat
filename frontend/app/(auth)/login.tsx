import { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView,
  Platform, ActivityIndicator, ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useAuth } from "@/src/auth-context";
import { useTheme, spacing, radius } from "@/src/theme";

export default function LoginScreen() {
  const { requestOtp } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    if (!phone.trim()) { setError("Isi nomor telepon"); return; }
    setLoading(true); setError(null);
    try {
      const r = await requestOtp(phone.trim(), "login");
      router.push({
        pathname: "/(auth)/verify",
        params: { phone: r.phone, dev_code: r.dev_code ?? "", purpose: "login" },
      });
    } catch (e: any) { setError(e.message || "Gagal mengirim kode"); }
    finally { setLoading(false); }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.surface }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.logoWrap, { backgroundColor: colors.brandPrimary }]}>
          <Ionicons name="chatbubbles" size={44} color={colors.onBrandPrimary} />
        </View>
        <Text style={[styles.brand, { color: colors.brandPrimary }]}>KPChat</Text>
        <Text style={[styles.title, { color: colors.onSurface }]}>Selamat Datang</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>Masuk dengan nomor telepon</Text>

        <View style={styles.form}>
          <View style={[styles.inputWrap, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <Ionicons name="call-outline" size={20} color={colors.muted} />
            <TextInput
              testID="login-phone-input"
              value={phone}
              onChangeText={setPhone}
              placeholder="+62 812-3456-7890"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              keyboardType="phone-pad"
              style={[styles.input, { color: colors.onSurface }]}
            />
          </View>
          <Text style={[styles.hint, { color: colors.muted }]}>
            Contoh: +6281234567890 (gunakan kode negara)
          </Text>

          {error ? <Text testID="login-error" style={[styles.error, { color: colors.error }]}>{error}</Text> : null}

          <Pressable
            testID="login-submit-button"
            onPress={onSubmit}
            disabled={loading}
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: colors.brandPrimary, opacity: pressed || loading ? 0.85 : 1 },
            ]}
          >
            {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> :
              <Text style={[styles.ctaText, { color: colors.onBrandPrimary }]}>Kirim Kode OTP</Text>}
          </Pressable>

          <Pressable testID="go-to-register" onPress={() => router.push("/(auth)/register")} style={styles.linkWrap}>
            <Text style={[styles.linkText, { color: colors.muted }]}>
              Belum punya akun? <Text style={{ color: colors.brandPrimary, fontWeight: "600" }}>Daftar</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.xl, justifyContent: "center" },
  logoWrap: { width: 88, height: 88, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: spacing.md },
  brand: { fontSize: 32, fontWeight: "800", textAlign: "center", marginBottom: spacing.md, letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "center" },
  subtitle: { fontSize: 15, textAlign: "center", marginTop: spacing.xs, marginBottom: spacing.xl },
  form: { gap: spacing.md },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, height: 52, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, fontSize: 16, paddingVertical: 0 },
  hint: { fontSize: 12, marginLeft: spacing.sm },
  cta: { height: 52, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", marginTop: spacing.md },
  ctaText: { fontSize: 16, fontWeight: "600" },
  linkWrap: { alignItems: "center", marginTop: spacing.md },
  linkText: { fontSize: 14 },
  error: { fontSize: 13 },
});
