// Design tokens for WhatsApp Clone - light + dark themes.
// Keys match /app/design_guidelines.json color block.

import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#FFFFFF",
  onSurface: "#000000",
  surfaceSecondary: "#F2F2F7",
  onSurfaceSecondary: "#3A3A3C",
  surfaceTertiary: "#E5E5EA",
  onSurfaceTertiary: "#1C1C1E",
  surfaceInverse: "#1C1C1E",
  onSurfaceInverse: "#FFFFFF",
  muted: "#8E8E93",

  brand: "#25D366",
  onBrand: "#FFFFFF",
  brandPrimary: "#25D366",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#075E54",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#E2F7CB",
  onBrandTertiary: "#000000",

  success: "#34C759",
  onSuccess: "#FFFFFF",
  warning: "#FF9500",
  onWarning: "#FFFFFF",
  error: "#FF3B30",
  onError: "#FFFFFF",
  info: "#007AFF",
  onInfo: "#FFFFFF",

  border: "#C6C6C8",
  borderStrong: "#8E8E93",
  divider: "#E5E5EA",
};

const dark: typeof light = {
  surface: "#000000",
  onSurface: "#FFFFFF",
  surfaceSecondary: "#1C1C1E",
  onSurfaceSecondary: "#EBEBF5",
  surfaceTertiary: "#2C2C2E",
  onSurfaceTertiary: "#FFFFFF",
  surfaceInverse: "#FFFFFF",
  onSurfaceInverse: "#000000",
  muted: "#8E8E93",

  brand: "#25D366",
  onBrand: "#000000",
  brandPrimary: "#25D366",
  onBrandPrimary: "#000000",
  brandSecondary: "#075E54",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#054640",
  onBrandTertiary: "#FFFFFF",

  success: "#32D74B",
  onSuccess: "#000000",
  warning: "#FF9F0A",
  onWarning: "#000000",
  error: "#FF453A",
  onError: "#FFFFFF",
  info: "#0A84FF",
  onInfo: "#FFFFFF",

  border: "#38383A",
  borderStrong: "#636366",
  divider: "#38383A",
};

export type ThemeColors = typeof light;
export const defaultScheme = "light" satisfies ColorScheme;
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light, dark };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme);
}
setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };
