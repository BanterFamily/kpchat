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

export default function RegisterScreen() {
  const { requestOtp } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();
  const logoSize = useResponsiveLogoSize(92);
  const [name, setName] = useState("");
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [localPhone, setLocalPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pickerRef = useRef<CountryPickerRef>(null);

  const fullPhone = `${country.dial}${localPhone.replace(/^0+/, "").replace(/\D/g, "")}`;

  async function onSubmit() {
    if (!name.trim() || !localPhone.trim()) { setError("Nama dan nomor telepon wajib"); return; }
    setLoading(true); setError(null);
    try {
      const r = await requestOtp(fullPhone, "register", name.trim());
      router.push({
        pathname: "/(auth)/verify",
        params: {
          phone: r.phone,
          dev_code: r.dev_code ?? "",
          purpose: "register",
          name: name.trim(),
        },
      });
    } catch (e: any) { setError(e.message || "Gagal mengirim kode"); }
    finally { setLoading(false); }
  }

  return (
    <>
      <AuthContainer backgroundColor={colors.surface}>
        <Pressable testID="back-to-login" onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color={colors.brandPrimary} />
        </Pressable>

        <AppLogo size={logoSize} />
        <Text style={[styles.title, { color: colors.onSurface }]}>Buat Akun</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>Daftar dengan nomor telepon</Text>

        <View style={styles.form}>
          <View style={[styles.inputWrap, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <Ionicons name="person-outline" size={20} color={colors.muted} />
            <TextInput
              testID="register-name-input"
              value={name}
              onChangeText={setName}
              placeholder="Nama"
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.onSurface }]}
            />
          </View>

          <View style={styles.phoneRow}>
            <Pressable
              testID="register-country-picker"
              onPress={() => pickerRef.current?.open()}
              style={[styles.countryBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            >
              <Text style={styles.flag}>{country.flag}</Text>
              <Text style={[styles.dial, { color: colors.onSurface }]}>{country.dial}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.muted} />
            </Pressable>
            <View style={[styles.phoneWrap, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <TextInput
                testID="register-phone-input"
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
          <Text style={[styles.hint, { color: colors.muted }]}>Pilih negara & masukkan nomor tanpa 0 di depan.</Text>

          {error ? <Text testID="register-error" style={[styles.error, { color: colors.error }]}>{error}</Text> : null}

          <Pressable
            testID="register-submit-button"
            onPress={onSubmit}
            disabled={loading}
            style={({ pressed }) => [styles.cta, { backgroundColor: colors.brandPrimary, opacity: pressed || loading ? 0.85 : 1 }]}
          >
            {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> :
              <Text style={[styles.ctaText, { color: colors.onBrandPrimary }]}>Kirim Kode OTP</Text>}
          </Pressable>
        </View>
      </AuthContainer>
      <CountryPicker ref={pickerRef} onSelect={setCountry} selected={country} />
    </>
  );
}

const styles = StyleSheet.create({
  backBtn: { alignSelf: "flex-start", padding: spacing.xs, marginBottom: spacing.sm },
  title: { fontSize: 22, fontWeight: "700", textAlign: "center", marginTop: spacing.md },
  subtitle: { fontSize: 15, textAlign: "center", marginTop: spacing.xs, marginBottom: spacing.xl },
  form: { gap: spacing.md },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, height: 52, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, fontSize: 16, paddingVertical: 0 },
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
  hint: { fontSize: 12, marginLeft: spacing.sm },
  cta: { height: 52, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", marginTop: spacing.md },
  ctaText: { fontSize: 16, fontWeight: "600" },
  error: { fontSize: 13 },
});
