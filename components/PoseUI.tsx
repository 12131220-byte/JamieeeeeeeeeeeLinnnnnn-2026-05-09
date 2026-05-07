import { Pose, UnifiedPostureResult } from "@/types/types";
import { analyzePosture } from "@/utils/pose-analyzer";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import HumanPose from "./HumanPose";
import type { KegelExerciseConfig } from "./KegelExerciseSelector";
import SittingPostureAnalyzer from "./SittingPostureAnalyzer";
import UnifiedPostureAnalyzer from "./UnifiedPostureAnalyzer";
import { AspectRatio } from "./ui/aspect-ratio";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "column",
  },
  cameraView: {
    flex: 1,
    position: "relative",
  },
  bottomHint: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  bottomHintText: {
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
});

interface PoseUIProps {
  onPoseDetected?: (poses: Pose) => void;
  mode?: "sitting-only" | "unified";
  exerciseConfig?: KegelExerciseConfig | null;
}

const PoseUI: React.FC<PoseUIProps> = ({
  onPoseDetected,
  mode = "unified",
  exerciseConfig = null,
}) => {
  const [currentPose, setCurrentPose] = useState<Pose | null>(null);
  const [currentAnalysis, setCurrentAnalysis] =
    useState<UnifiedPostureResult | null>(null);

  const handlePoseDetected = (pose: Pose) => {
    const analysisResult = analyzePosture(pose);
    setCurrentPose(pose);
    setCurrentAnalysis(analysisResult);
    if (onPoseDetected) {
      onPoseDetected(pose);
    }
  };

  return (
    <View style={styles.container}>
      {/* 相機視圖 - 全屏 */}
      <View style={styles.cameraView}>
        <AspectRatio ratio={9 / 16}>
          <HumanPose
            enableKeyPoints={true}
            flipHorizontal={false}
            isBackCamera={false}
            color={"255, 255, 255"}
            onPoseDetected={handlePoseDetected}
            enableSkeleton={true}
            scoreThreshold={0.5}
            mode="multiple"
            isFullScreen={true}
          />
        </AspectRatio>

        <View style={styles.bottomHint}>
          <Text style={styles.bottomHintText}>
            先選擇動作與次數，再點開始進入 MediaPipe
          </Text>
        </View>
      </View>

      {/* 分析組件：不佔畫面，但需保持掛載以觸發語音與彈窗流程 */}
      {mode === "sitting-only" && <SittingPostureAnalyzer pose={currentPose} />}
      {mode === "unified" && (
        <UnifiedPostureAnalyzer
          pose={currentPose}
          analysisResult={currentAnalysis}
          exerciseConfig={exerciseConfig}
        />
      )}
    </View>
  );
};

export default PoseUI;
