import { forwardRef, useCallback, useMemo, useImperativeHandle, useRef } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useTheme, spacing, radius } from "@/src/theme";
import { Message } from "@/src/api";

export type MessageActionsRef = {
  open: (m: Message) => void;
  close: () => void;
};

const EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🙏"];

export const MessageActionsSheet = forwardRef<
  MessageActionsRef,
  {
    onReact: (message: Message, emoji: string) => void;
    onReply: (message: Message) => void;
    myUserId: string | undefined;
  }
>(function MessageActionsSheet({ onReact, onReply, myUserId }, ref) {
  const { colors } = useTheme();
  const sheetRef = useRef<BottomSheet>(null);
  const currentRef = useRef<Message | null>(null);

  useImperativeHandle(ref, () => ({
    open: (m) => { currentRef.current = m; sheetRef.current?.snapToIndex(0); },
    close: () => sheetRef.current?.close(),
  }));

  const snapPoints = useMemo(() => ["36%"], []);
  const renderBackdrop = useCallback(
    (props: any) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />,
    [],
  );

  const activeEmoji = useMemo(() => {
    const m = currentRef.current;
    if (!m || !myUserId) return null;
    for (const [e, users] of Object.entries(m.reactions ?? {})) {
      if (users.includes(myUserId)) return e;
    }
    return null;
  }, [myUserId]);

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
      <BottomSheetView style={styles.body}>
        <View style={styles.emojiRow} testID="reactions-row">
          {EMOJIS.map((e) => {
            const on = activeEmoji === e;
            return (
              <Pressable
                key={e}
                testID={`react-emoji-${e}`}
                onPress={() => {
                  const m = currentRef.current;
                  if (m) onReact(m, e);
                  sheetRef.current?.close();
                }}
                style={[styles.emojiBtn, { backgroundColor: on ? colors.brandTertiary : colors.surfaceSecondary, borderColor: on ? colors.brandPrimary : "transparent" }]}
              >
                <Text style={styles.emoji}>{e}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.actionsCard, { backgroundColor: colors.surfaceSecondary }]}>
          <Pressable
            testID="action-reply"
            onPress={() => {
              const m = currentRef.current;
              if (m) onReply(m);
              sheetRef.current?.close();
            }}
            style={styles.actionRow}
          >
            <Ionicons name="arrow-undo" size={22} color={colors.brandSecondary} />
            <Text style={[styles.actionLabel, { color: colors.onSurface }]}>Balas</Text>
          </Pressable>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.lg },
  emojiRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  emojiBtn: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  emoji: { fontSize: 24 },
  actionsCard: { borderRadius: radius.lg, overflow: "hidden" },
  actionRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  actionLabel: { fontSize: 16, fontWeight: "500" },
});
