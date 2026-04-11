import PoseUI from "@/components/PoseUI";
import { Pose, PostureType } from "@/types/types";
import { analyzePosture } from "@/utils/pose-analyzer";
import { Stack } from "expo-router";
import { View, StyleSheet } from "react-native";

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default function Index() {
  // 處理檢測到的姿勢
  const onPoseDetected = (pose: Pose) => {
    // 進行完整的姿勢分析（坐、站、躺）
    const result = analyzePosture(pose);

    // 根據檢測到的主要姿勢進行相應的處理
    if (result.primaryPosture !== PostureType.UNKNOWN) {
      console.log("主要姿勢:", result.primaryPosture);

      // 檢查坐姿
      if (result.detectedPostures.sitting?.isSitting) {
        console.log("坐姿檢測:", {
          isProper: result.detectedPostures.sitting.isProperPosture,
          backAngle: result.detectedPostures.sitting.backAngle,
          kneeAngle: result.detectedPostures.sitting.kneeAngle,
        });
      }

      // 檢查站姿
      if (result.detectedPostures.standing?.isStanding) {
        console.log("站姿檢測:", {
          isProper: result.detectedPostures.standing.isProperPosture,
          bodyAlignment: result.detectedPostures.standing.bodyAlignment,
        });
      }

      // 檢查躺姿
      if (result.detectedPostures.lying?.isLying) {
        console.log("躺姿檢測:", {
          isProper: result.detectedPostures.lying.isProperPosture,
          spineAlignment: result.detectedPostures.lying.spineAlignment,
        });
      }
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: "三姿勢識別 - MediaPipe",
        }}
      />
      <PoseUI onPoseDetected={onPoseDetected} mode="unified" />
    </View>
  );
}
