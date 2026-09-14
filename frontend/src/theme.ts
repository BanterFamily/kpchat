// Design tokens for KPChat — Messenger-blue theme, light + dark.

import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#FFFFFF",
  onSurface: "#050505",
  surfaceSecondary: "#F0F2F5",
  onSurfaceSecondary: "#1C1E21",
  surfaceTertiary: "#E4E6EB",
  onSurfaceTertiary: "#050505",
  surfaceInverse: "#050505",
  onSurfaceInverse: "#FFFFFF",
  muted: "#65676B",

  brand: "#0084FF",
  onBrand: "#FFFFFF",
  brandPrimary: "#0084FF",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#0066CC",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#DCEEFC",
  onBrandTertiary: "#050505",

  success: "#31A24C",
  onSuccess: "#FFFFFF",
  warning: "#F7B928",
  onWarning: "#050505",
  error: "#E41E3F",
  onError: "#FFFFFF",
  info: "#0084FF",
  onInfo: "#FFFFFF",

  border: "#CED0D4",
  borderStrong: "#8A8D91",
  divider: "#E4E6EB",
};

const dark: typeof light = {
  surface: "#000000",
  onSurface: "#FFFFFF",
  surfaceSecondary: "#18191A",
  onSurfaceSecondary: "#E4E6EB",
  surfaceTertiary: "#242526",
  onSurfaceTertiary: "#FFFFFF",
  surfaceInverse: "#FFFFFF",
  onSurfaceInverse: "#000000",
  muted: "#B0B3B8",

  brand: "#0A84FF",
  onBrand: "#FFFFFF",
  brandPrimary: "#0A84FF",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#1877F2",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#1B3A5C",
  onBrandTertiary: "#FFFFFF",

  success: "#42B72A",
  onSuccess: "#FFFFFF",
  warning: "#F7B928",
  onWarning: "#000000",
  error: "#FF5A5F",
  onError: "#FFFFFF",
  info: "#0A84FF",
  onInfo: "#FFFFFF",

  border: "#3A3B3C",
  borderStrong: "#6A6C6E",
  divider: "#3A3B3C",
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

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };
