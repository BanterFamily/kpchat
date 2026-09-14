import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput } from "react-native";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useTheme, spacing, radius } from "@/src/theme";
import { Country, COUNTRIES } from "@/src/data/countries";

export type CountryPickerRef = {
  open: () => void;
  close: () => void;
};

export const CountryPicker = forwardRef<
  CountryPickerRef,
  { onSelect: (c: Country) => void; selected?: Country }
>(function CountryPicker({ onSelect, selected }, ref) {
  const { colors } = useTheme();
  const sheetRef = useRef<BottomSheet>(null);
  const [query, setQuery] = useState("");

  useImperativeHandle(ref, () => ({
    open: () => sheetRef.current?.snapToIndex(0),
    close: () => sheetRef.current?.close(),
  }));

  const snapPoints = useMemo(() => ["85%"], []);
  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />
    ),
    [],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dial.includes(q) ||
        c.code.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      enablePanDownToClose
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.surface }}
      handleIndicatorStyle={{ backgroundColor: colors.muted }}
    >
      <BottomSheetView style={styles.header}>
        <Text style={[styles.title, { color: colors.onSurface }]}>Pilih Negara</Text>
        <View style={[styles.searchWrap, { backgroundColor: colors.surfaceSecondary }]}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            testID="country-search-input"
            value={query}
            onChangeText={setQuery}
            placeholder="Cari negara atau kode"
            placeholderTextColor={colors.muted}
            style={[styles.searchInput, { color: colors.onSurface }]}
          />
        </View>
      </BottomSheetView>
      <BottomSheetFlatList
        data={filtered}
        keyExtractor={(c) => c.code + c.dial}
        renderItem={({ item }) => {
          const on = selected?.code === item.code && selected?.dial === item.dial;
          return (
            <Pressable
              testID={`country-row-${item.code}`}
              onPress={() => {
                onSelect(item);
                sheetRef.current?.close();
              }}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface },
              ]}
            >
              <Text style={styles.flag}>{item.flag}</Text>
              <Text numberOfLines={1} style={[styles.rowName, { color: colors.onSurface }]}>
                {item.name}
              </Text>
              <Text style={[styles.rowDial, { color: colors.muted }]}>{item.dial}</Text>
              {on ? <Ionicons name="checkmark" size={20} color={colors.brandPrimary} /> : null}
            </Pressable>
          );
        }}
        ItemSeparatorComponent={() => (
          <View style={[styles.sep, { backgroundColor: colors.divider }]} />
        )}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
      />
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md, gap: spacing.md },
  title: { fontSize: 20, fontWeight: "700", textAlign: "center" },
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.md, height: 42, borderRadius: radius.md,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  flag: { fontSize: 26 },
  rowName: { flex: 1, fontSize: 16, fontWeight: "500" },
  rowDial: { fontSize: 15, fontWeight: "600" },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 68 },
});
