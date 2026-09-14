import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { fileUrl } from "@/src/api";
import { useTheme, spacing } from "@/src/theme";

// Deterministic pseudo-random bar heights derived from the message id so the
// waveform stays stable per message.
function seededBars(seed: string, count: number, min = 0.25, max = 1): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    h = (h * 1664525 + 1013904223) >>> 0;
    const r = (h & 0xffff) / 0xffff;
    out.push(min + r * (max - min));
  }
  return out;
}

function formatMs(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioMessage({
  messageId,
  path,
  durationMs,
  mine,
}: {
  messageId: string;
  path: string;
  durationMs?: number | null;
  mine: boolean;
}) {
  const { colors } = useTheme();
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => { fileUrl(path).then(setUri); }, [path]);

  const player = useAudioPlayer(uri ? { uri } : null);
  const status = useAudioPlayerStatus(player);

  const bars = useMemo(() => seededBars(messageId, 28, 0.25, 1), [messageId]);

  const total = status?.duration ? status.duration * 1000 : durationMs ?? 0;
  const pos = status?.currentTime ? status.currentTime * 1000 : 0;
  const progress = total > 0 ? Math.min(1, pos / total) : 0;

  function toggle() {
    if (!uri) return;
    if (status?.playing) {
      player.pause();
    } else {
      if (status?.didJustFinish || progress >= 0.999) {
        player.seekTo(0);
      }
      player.play();
    }
  }

  const fg = mine ? colors.onBrandTertiary : colors.onSurface;
  const dim = mine ? colors.onBrandTertiary : colors.muted;
  const activeBar = mine ? colors.brandSecondary : colors.brandPrimary;

  return (
    <View style={styles.wrap} testID={`audio-message-${messageId}`}>
      <Pressable testID={`audio-toggle-${messageId}`} onPress={toggle} style={[styles.playBtn, { backgroundColor: mine ? colors.brandSecondary : colors.brandPrimary }]}>
        {uri ? (
          <Ionicons name={status?.playing ? "pause" : "play"} size={18} color={mine ? colors.onBrandSecondary : colors.onBrandPrimary} />
        ) : (
          <ActivityIndicator color={mine ? colors.onBrandSecondary : colors.onBrandPrimary} size="small" />
        )}
      </Pressable>
      <View style={styles.waveWrap}>
        {bars.map((b, i) => {
          const filled = (i / bars.length) <= progress;
          return (
            <View
              key={i}
              style={{
                width: 3,
                marginHorizontal: 1,
                height: 22 * b,
                borderRadius: 2,
                backgroundColor: filled ? activeBar : dim,
                opacity: filled ? 1 : 0.5,
              }}
            />
          );
        })}
      </View>
      <Text style={[styles.time, { color: fg, opacity: 0.85 }]}>
        {formatMs(status?.playing || pos > 0 ? pos : total)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minWidth: 190 },
  playBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  waveWrap: { flex: 1, flexDirection: "row", alignItems: "center", height: 24 },
  time: { fontSize: 11, minWidth: 32, textAlign: "right" },
});
