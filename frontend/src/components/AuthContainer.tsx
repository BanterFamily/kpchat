import React from "react";
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing } from "@/src/theme";

/** Responsive auth-screen wrapper.
 *
 * - Fills the screen with the app surface background.
 * - Handles keyboard on iOS via KeyboardAvoidingView.
 * - Applies safe-area top/bottom padding.
 * - Constrains content to a comfortable column on wide screens (tablet/web).
 */
export function AuthContainer({
  children,
  backgroundColor,
  testID,
}: {
  children: React.ReactNode;
  backgroundColor: string;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 600;
  const maxWidth = isWide ? 480 : width;
  const horizontalPad = isWide ? spacing.xxl : spacing.xl;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      testID={testID}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + spacing.xl,
            paddingBottom: insets.bottom + spacing.xl,
            paddingHorizontal: horizontalPad,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ width: "100%", maxWidth, alignSelf: "center" }}>
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center" },
});

/** Utility to pick a logo size based on screen height. */
export function useResponsiveLogoSize(base: number): number {
  const { height, width } = useWindowDimensions();
  const shortest = Math.min(width, height);
  // Bigger devices get a slightly larger logo, but never smaller than base.
  if (shortest >= 700) return Math.round(base * 1.2);
  if (shortest >= 500) return Math.round(base * 1.05);
  return base;
}
