import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useTheme, spacing, radius } from "@/src/theme";
import { Message } from "@/src/api";

const DELETE_WINDOW_MS = 5 * 60 * 1000;

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
    onForward: (message: Message) => void;
    onDelete: (message: Message) => void;
    myUserId: string | undefined;
  }
>(function MessageActionsSheet({ onReact, onReply, onForward, onDelete, myUserId }, ref) {
  const { colors } = useTheme();
  const sheetRef = useRef<BottomSheet>(null);
  const [current, setCurrent] = useState<Message | null>(null);

  useImperativeHandle(ref, () => ({
    open: (m) => { setCurrent(m); sheetRef.current?.snapToIndex(0); },
    close: () => sheetRef.current?.close(),
  }));
  const isMine = !!current && current.sender_id === myUserId;
  const isDeleted = !!current?.is_deleted;
  const withinDeleteWindow = !!current && Date.now() - new Date(current.created_at).getTime() < DELETE_WINDOW_MS;
  const canDelete = isMine && !isDeleted && withinDeleteWindow;
  const canReact = !isDeleted;
  const canReply = !isDeleted;
  const canForward = !isDeleted;

  const snapPoints = useMemo(() => {
    let n = 0;
    if (canReact) n += 1;
    n += (canReply ? 1 : 0) + (canForward ? 1 : 0) + (canDelete ? 1 : 0);
    if (n === 0) return ["20%"];
    return canReact ? ["40%"] : ["30%"];
  }, [canReact, canReply, canForward, canDelete]);

  const renderBackdrop = useCallback(
    (props: any) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />,
    [],
  );

  const activeEmoji = useMemo(() => {
    if (!current || !myUserId) return null;
    for (const [e, users] of Object.entries(current.reactions ?? {})) {
      if (users.includes(myUserId)) return e;
    }
    return null;
  }, [myUserId, current]);

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
        {canReact ? (
          <View style={styles.emojiRow} testID="reactions-row">
            {EMOJIS.map((e) => {
              const on = activeEmoji === e;
              return (
                <Pressable
                  key={e}
                  testID={`react-emoji-${e}`}
                  onPress={() => {
                    if (current) onReact(current, e);
                    sheetRef.current?.close();
                  }}
                  style={[styles.emojiBtn, { backgroundColor: on ? colors.brandTertiary : colors.surfaceSecondary, borderColor: on ? colors.brandPrimary : "transparent" }]}
                >
                  <Text style={styles.emoji}>{e}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={[styles.actionsCard, { backgroundColor: colors.surfaceSecondary }]}>
          {canReply ? (
            <ActionRow
              testID="action-reply"
              icon="arrow-undo"
              label="Balas"
              onPress={() => {
                if (current) onReply(current);
                sheetRef.current?.close();
              }}
            />
          ) : null}
          {canForward ? (
            <>
              {canReply ? <View style={[styles.divider, { backgroundColor: colors.divider }]} /> : null}
              <ActionRow
                testID="action-forward"
                icon="arrow-redo"
                label="Teruskan"
                onPress={() => {
                  if (current) onForward(current);
                  sheetRef.current?.close();
                }}
              />
            </>
          ) : null}
          {canDelete ? (
            <>
              {(canReply || canForward) ? <View style={[styles.divider, { backgroundColor: colors.divider }]} /> : null}
              <ActionRow
                testID="action-delete"
                icon="trash"
                label="Hapus untuk semua orang"
                danger
                onPress={() => {
                  if (current) onDelete(current);
                  sheetRef.current?.close();
                }}
              />
            </>
          ) : null}
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
});

function ActionRow({
  icon, label, testID, onPress, danger,
}: { icon: any; label: string; testID: string; onPress: () => void; danger?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={styles.actionRow}>
      <Ionicons name={icon} size={22} color={danger ? colors.error : colors.brandSecondary} />
      <Text style={[styles.actionLabel, { color: danger ? colors.error : colors.onSurface }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.lg },
  emojiRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  emojiBtn: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  emoji: { fontSize: 24 },
  actionsCard: { borderRadius: radius.lg, overflow: "hidden" },
  actionRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  actionLabel: { fontSize: 16, fontWeight: "500" },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 54 },
});
