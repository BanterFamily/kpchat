import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth-context";
import { useTheme } from "@/src/theme";
import { wsClient } from "@/src/ws";

export default function Index() {
  const { ready, user } = useAuth();
  const router = useRouter();
  const { colors } = useTheme();

  useEffect(() => {
    if (!ready) return;
    if (user) {
      wsClient.connect();
      router.replace("/(tabs)/chats");
    } else {
      router.replace("/(auth)/login");
    }
  }, [ready, user, router]);

  return (
    <View testID="splash-screen" style={[styles.container, { backgroundColor: colors.brandSecondary }]}>
      <ActivityIndicator color={colors.brandPrimary} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
});
