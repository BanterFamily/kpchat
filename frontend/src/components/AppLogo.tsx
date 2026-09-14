import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

export function AppLogo({ size = 88 }: { size?: number }) {
  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: size * 0.22 }]}>
      <Image
        source={require("../../assets/images/kpchat-logo.png")}
        style={{ width: size, height: size }}
        contentFit="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "center", overflow: "hidden" },
});
