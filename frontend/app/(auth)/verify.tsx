import { useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView,
  Platform, ActivityIndicator, ScrollView, Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useAuth } from "@/src/auth-context";
import { useTheme, spacing, radius } from "@/src/theme";
import { wsClient } from "@/src/ws";
import { AppLogo } from "@/src/components/AppLogo";

export default function VerifyScreen() {
  const { verifyOtp, requestOtp } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{
    phone: string; dev_code?: string; purpose?: "login" | "register"; name?: string;
  }>();
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string>(params.dev_code || "");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(30);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  async function submit() {
    if (code.length !== 6) { setError("Kode harus 6 digit"); return; }
    setLoading(true); setError(null);
    try {
      await verifyOtp(params.phone, code, params.name);
      wsClient.connect();
      router.replace("/(tabs)/chats");
    } catch (e: any) { setError(e.message || "Kode tidak valid"); }
    finally { setLoading(false); }
  }

  async function resend() {
    if (cooldown > 0) return;
    setResending(true); setError(null);
    try {
      const r = await requestOtp(params.phone, (params.purpose ?? "login") as any, params.name);
      setDevCode(r.dev_code ?? "");
      setCooldown(30);
      Alert.alert("Terkirim", r.dev_code ? `Kode demo: ${r.dev_code}` : "Kode baru telah dikirim");
    } catch (e: any) { setError(e.message || "Gagal mengirim ulang"); }
    finally { setResending(false); }
  }

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.surface }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable testID="verify-back" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color={colors.brandPrimary} />
        </Pressable>

        <AppLogo size={80} />
        <Text style={[styles.brand, { color: colors.brandPrimary }]}>KPChat</Text>
        <Text style={[styles.title, { color: colors.onSurface }]}>Verifikasi Nomor</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          Kode 6-digit dikirim ke{"\n"}
          <Text style={{ color: colors.onSurface, fontWeight: "600" }}>{params.phone}</Text>
        </Text>

        {devCode ? (
          <View testID="dev-code-hint" style={[styles.devHint, { backgroundColor: colors.brandTertiary, borderColor: colors.brandPrimary }]}>
            <Ionicons name="information-circle" size={20} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.devHintTitle, { color: colors.onBrandTertiary }]}>Mode Demo</Text>
              <Text style={[styles.devHintText, { color: colors.onBrandTertiary }]}>
                Kode kamu: <Text style={{ fontWeight: "700", letterSpacing: 2 }}>{devCode}</Text>
              </Text>
            </View>
            <Pressable testID="autofill-code" onPress={() => setCode(devCode)}>
              <Text style={{ color: colors.brandPrimary, fontWeight: "600" }}>Isi</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.form}>
          <View style={[styles.inputWrap, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <Ionicons name="keypad-outline" size={20} color={colors.muted} />
            <TextInput
              testID="verify-code-input"
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
              placeholder="6 digit kode"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              autoFocus
              maxLength={6}
              autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code" as any}
              textContentType="oneTimeCode"
              importantForAutofill="yes"
              style={[styles.input, { color: colors.onSurface, letterSpacing: 4, textAlign: "center", fontSize: 20 }]}
            />
          </View>

          {error ? <Text testID="verify-error" style={[styles.error, { color: colors.error }]}>{error}</Text> : null}

          <Pressable
            testID="verify-submit-button"
            onPress={submit}
            disabled={loading || code.length !== 6}
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: code.length === 6 ? colors.brandPrimary : colors.surfaceTertiary, opacity: pressed || loading ? 0.85 : 1 },
            ]}
          >
            {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> :
              <Text style={[styles.ctaText, { color: code.length === 6 ? colors.onBrandPrimary : colors.muted }]}>Verifikasi</Text>}
          </Pressable>

          <Pressable testID="resend-code" onPress={resend} disabled={cooldown > 0 || resending} style={styles.linkWrap}>
            <Text style={[styles.linkText, { color: cooldown > 0 ? colors.muted : colors.brandPrimary, fontWeight: "600" }]}>
              {resending ? "Mengirim…" : cooldown > 0 ? `Kirim ulang dalam ${cooldown}s` : "Kirim ulang kode"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.xl },
  backBtn: { alignSelf: "flex-start", padding: spacing.xs, marginBottom: spacing.md },
  logoWrap: { width: 76, height: 76, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: spacing.lg },
  brand: { fontSize: 28, fontWeight: "800", textAlign: "center", marginTop: spacing.sm, marginBottom: spacing.md, letterSpacing: -0.5 },
  title: { fontSize: 24, fontWeight: "700", textAlign: "center" },
  subtitle: { fontSize: 14, textAlign: "center", marginTop: spacing.xs, marginBottom: spacing.xl, lineHeight: 20 },
  devHint: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    padding: spacing.md, borderRadius: radius.md, borderWidth: 1, marginBottom: spacing.lg,
  },
  devHintTitle: { fontSize: 12, fontWeight: "700" },
  devHintText: { fontSize: 14 },
  form: { gap: spacing.md },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, height: 56, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, paddingVertical: 0 },
  cta: { height: 52, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", marginTop: spacing.md },
  ctaText: { fontSize: 16, fontWeight: "600" },
  linkWrap: { alignItems: "center", marginTop: spacing.md },
  linkText: { fontSize: 14 },
  error: { fontSize: 13 },
});
