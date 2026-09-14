import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useTheme, spacing } from "@/src/theme";

export default function StatusScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <View testID="status-screen" style={[styles.flex, { backgroundColor: colors.surface, paddingTop: insets.top }]}>
      <View style={styles.header}><Text style={[styles.title, { color: colors.onSurface }]}>Status</Text></View>
      <View style={styles.center}>
        <Ionicons name="disc-outline" size={72} color={colors.muted} />
        <Text style={[styles.t, { color: colors.onSurface }]}>Segera Hadir</Text>
        <Text style={[styles.s, { color: colors.muted }]}>Bagikan momen kamu dengan Status.</Text>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  title: { fontSize: 32, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl },
  t: { fontSize: 18, fontWeight: "600" },
  s: { fontSize: 14, textAlign: "center" },
});
