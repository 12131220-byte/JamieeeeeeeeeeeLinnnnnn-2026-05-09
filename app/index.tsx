import KegelExerciseSelector, {
    type KegelExerciseConfig,
} from "@/components/KegelExerciseSelector";
import PoseUI from "@/components/PoseUI";
import { PostureType } from "@/types/types";
import { Stack } from "expo-router";
import { useMemo, useState } from "react";
import {
    Pressable,
    SafeAreaView,
    StyleSheet,
    Text,
    View,
} from "react-native";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#07111F",
  },
  setupScreen: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
    justifyContent: "space-between",
  },
  heroCard: {
    borderRadius: 28,
    padding: 24,
    backgroundColor: "#0C1B2D",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  heroBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(16, 185, 129, 0.18)",
    marginBottom: 16,
  },
  heroBadgeText: {
    color: "#8EF0C8",
    fontSize: 12,
    fontWeight: "700",
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 30,
    lineHeight: 38,
    fontWeight: "800",
    marginBottom: 10,
  },
  heroDescription: {
    color: "#B8C2CF",
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 20,
  },
  actionGrid: {
    gap: 12,
    marginBottom: 18,
  },
  actionCard: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: "#102236",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  actionCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  actionIcon: {
    fontSize: 28,
  },
  actionTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  actionSubtitle: {
    color: "#A9B4C1",
    fontSize: 12,
    marginTop: 2,
  },
  actionMeta: {
    color: "#7EE0B8",
    fontSize: 12,
    fontWeight: "600",
  },
  primaryButton: {
    height: 52,
    borderRadius: 16,
    backgroundColor: "#10B981",
    justifyContent: "center",
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  tipsCard: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: "#0B1A2C",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tipsTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 10,
  },
  tipsText: {
    color: "#B8C2CF",
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 8,
  },
    cameraScreen: {
        flex: 1,
        backgroundColor: "#000000",
    },
    cameraHeader: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        paddingHorizontal: 16,
        paddingTop: 44,
    },
    cameraHeaderCard: {
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 12,
        backgroundColor: "rgba(7, 17, 31, 0.72)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    cameraHeaderLeft: {
        flex: 1,
        paddingRight: 10,
    },
    cameraHeaderTitle: {
        color: "#FFFFFF",
        fontSize: 15,
        fontWeight: "800",
        marginBottom: 2,
    },
    cameraHeaderSubtitle: {
        color: "#B8C2CF",
        fontSize: 12,
    },
    cameraHeaderButton: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: "rgba(16, 185, 129, 0.18)",
    },
    cameraHeaderButtonText: {
        color: "#8EF0C8",
        fontSize: 12,
        fontWeight: "700",
    },
});

export default function Index() {
  const [showSelector, setShowSelector] = useState(false);
  const [selectedConfig, setSelectedConfig] =
      useState<KegelExerciseConfig | null>(null);

  const handleStartExercise = (config: KegelExerciseConfig) => {
    setSelectedConfig(config);
    setShowSelector(false);
  };

  const openSelector = () => setShowSelector(true);

  const goBackToSetup = () => {
    setSelectedConfig(null);
    setShowSelector(true);
  };

  const selectedActionText = useMemo(() => {
    if (!selectedConfig) {
      return "尚未選擇動作";
    }

    switch (selectedConfig.type) {
      case PostureType.STANDING:
        return "站姿凱格爾";
      case PostureType.SITTING:
        return "坐姿凱格爾";
      case PostureType.LYING:
        return "躺姿凱格爾";
      default:
        return "凱格爾運動";
    }
  }, [selectedConfig]);

  if (selectedConfig) {
    return (
      <SafeAreaView style={styles.cameraScreen}>
        <Stack.Screen options={{ headerShown: false }} />

        <View style={styles.cameraHeader}>
          <View style={styles.cameraHeaderCard}>
            <View style={styles.cameraHeaderLeft}>
              <Text style={styles.cameraHeaderTitle}>{selectedActionText}</Text>
              <Text style={styles.cameraHeaderSubtitle}>
                {selectedConfig.sets} 組 × {selectedConfig.reps} 次，每組休息 {selectedConfig.restBetweenSets} 秒
              </Text>
            </View>
            <Pressable style={styles.cameraHeaderButton} onPress={goBackToSetup}>
              <Text style={styles.cameraHeaderButtonText}>重新選擇</Text>
            </Pressable>
          </View>
        </View>

        <PoseUI mode="unified" exerciseConfig={selectedConfig} />

        <KegelExerciseSelector
          visible={showSelector}
          onClose={() => setShowSelector(false)}
          onStartExercise={handleStartExercise}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.setupScreen}>
        <View style={styles.heroCard}>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>動作設定</Text>
          </View>
          <Text style={styles.heroTitle}>選擇你的凱格爾動作與次數</Text>
          <Text style={styles.heroDescription}>
            先完成手機介面設定，選擇動作、組數與每組次數。
            選好後會進入相機畫面進行 MediaPipe 偵測。
          </Text>

          <View style={styles.actionGrid}>
            <Pressable
              style={styles.actionCard}
              onPress={() =>
                handleStartExercise({
                  type: PostureType.STANDING,
                  sets: 3,
                  reps: 12,
                  restBetweenSets: 30,
                })
              }
            >
              <View style={styles.actionCardTop}>
                <Text style={styles.actionIcon}>🧍</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionTitle}>站姿凱格爾</Text>
                  <Text style={styles.actionSubtitle}>墊腳尖、夾臀</Text>
                </View>
              </View>
              <Text style={styles.actionMeta}>建議：3 組 × 12 次</Text>
            </Pressable>

            <Pressable
              style={styles.actionCard}
              onPress={() =>
                handleStartExercise({
                  type: PostureType.SITTING,
                  sets: 3,
                  reps: 10,
                  restBetweenSets: 30,
                })
              }
            >
              <View style={styles.actionCardTop}>
                <Text style={styles.actionIcon}>🪑</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionTitle}>坐姿凱格爾</Text>
                  <Text style={styles.actionSubtitle}>伸直雙腳、夾臀</Text>
                </View>
              </View>
              <Text style={styles.actionMeta}>建議：3 組 × 10 次</Text>
            </Pressable>

            <Pressable
              style={styles.actionCard}
              onPress={() =>
                handleStartExercise({
                  type: PostureType.LYING,
                  sets: 4,
                  reps: 15,
                  restBetweenSets: 45,
                })
              }
            >
              <View style={styles.actionCardTop}>
                <Text style={styles.actionIcon}>🛏️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionTitle}>躺姿凱格爾</Text>
                  <Text style={styles.actionSubtitle}>放鬆身體、夾臀</Text>
                </View>
              </View>
              <Text style={styles.actionMeta}>建議：4 組 × 15 次</Text>
            </Pressable>
          </View>

          <Pressable style={styles.primaryButton} onPress={openSelector}>
            <Text style={styles.primaryButtonText}>自訂動作與次數</Text>
          </Pressable>
        </View>

        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>使用方式</Text>
          <Text style={styles.tipsText}>1. 先選擇動作類型與次數。</Text>
          <Text style={styles.tipsText}>2. 進入後只會顯示設定，不會再開啟相機。</Text>
          <Text style={styles.tipsText}>2. 按下開始後會進入相機畫面。</Text>
          <Text style={styles.tipsText}>3. 你可以隨時重新選擇或自訂次數。</Text>
        </View>

        <KegelExerciseSelector
          visible={showSelector}
          onClose={() => setShowSelector(false)}
          onStartExercise={handleStartExercise}
        />
      </View>
    </SafeAreaView>
  );
}
