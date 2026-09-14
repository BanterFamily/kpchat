import { useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useAuth } from "@/src/auth-context";
import { useTheme, spacing, radius } from "@/src/theme";
import { AppLogo } from "@/src/components/AppLogo";
import { AuthContainer, useResponsiveLogoSize } from "@/src/components/AuthContainer";
import { CountryPicker, CountryPickerRef } from "@/src/components/CountryPicker";
import { Country, DEFAULT_COUNTRY } from "@/src/data/countries";

export default function LoginScreen() {
  const { requestOtp } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const logoSize = useResponsiveLogoSize(104);
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [localPhone, setLocalPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pickerRef = useRef<CountryPickerRef>(null);

  const fullPhone = `${country.dial}${localPhone.replace(/^0+/, "").replace(/\D/g, "")}`;

  async function onSubmit() {
    if (!localPhone.trim()) { setError("Isi nomor telepon"); return; }
    setLoading(true); setError(null);
    try {
      const r = await requestOtp(fullPhone, "login");
      router.push({
        pathname: "/(auth)/verify",
        params: { phone: r.phone, dev_code: r.dev_code ?? "", purpose: "login" },
      });
    } catch (e: any) { setError(e.message || "Gagal mengirim kode"); }
    finally { setLoading(false); }
  }

  return (
    <>
      <AuthContainer backgroundColor={colors.surface}>
        <AppLogo size={logoSize} />
        <Text style={[styles.title, { color: colors.onSurface }]}>Selamat Datang</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>Masuk dengan nomor telepon</Text>

        <View style={styles.form}>
          <View style={styles.phoneRow}>
            <Pressable
              testID="login-country-picker"
              onPress={() => pickerRef.current?.open()}
              style={[styles.countryBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            >
              <Text style={styles.flag}>{country.flag}</Text>
              <Text style={[styles.dial, { color: colors.onSurface }]}>{country.dial}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.muted} />
            </Pressable>
            <View style={[styles.phoneWrap, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <TextInput
                testID="login-phone-input"
                value={localPhone}
                onChangeText={(v) => setLocalPhone(v.replace(/\D/g, ""))}
                placeholder="812-3456-7890"
                placeholderTextColor={colors.muted}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                style={[styles.input, { color: colors.onSurface }]}
              />
            </View>
          </View>
          <Text style={[styles.hint, { color: colors.muted }]}>
            Pilih negara & masukkan nomor tanpa 0 di depan.
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
      </AuthContainer>
      <CountryPicker ref={pickerRef} onSelect={setCountry} selected={country} />
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: "700", textAlign: "center", marginTop: spacing.lg },
  subtitle: { fontSize: 15, textAlign: "center", marginTop: spacing.xs, marginBottom: spacing.xl },
  form: { gap: spacing.md },
  phoneRow: { flexDirection: "row", gap: spacing.sm },
  countryBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs,
    paddingHorizontal: spacing.md, height: 52, borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  flag: { fontSize: 22 },
  dial: { fontSize: 15, fontWeight: "600" },
  phoneWrap: {
    flex: 1, flexDirection: "row", alignItems: "center",
    paddingHorizontal: spacing.lg, height: 52, borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: 0 },
  hint: { fontSize: 12, marginLeft: spacing.sm },
  cta: { height: 52, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", marginTop: spacing.md },
  ctaText: { fontSize: 16, fontWeight: "600" },
  linkWrap: { alignItems: "center", marginTop: spacing.md },
  linkText: { fontSize: 14 },
  error: { fontSize: 13 },
});
