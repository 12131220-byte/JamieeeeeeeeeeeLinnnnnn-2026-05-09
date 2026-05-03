import { Pose, PostureType, UnifiedPostureResult } from "@/types/types";
import { analyzePosture } from "@/utils/pose-analyzer";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import HumanPose from "./HumanPose";
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
  },
  statusBar: {
    height: 48,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#000",
  },
  statusLight: {
    flex: 1,
    borderRadius: 8,
  },
});

interface PoseUIProps {
  onPoseDetected?: (poses: Pose) => void;
  mode?: "sitting-only" | "unified";
}

const PoseUI: React.FC<PoseUIProps> = ({
  onPoseDetected,
  mode = "unified",
}) => {
  const [currentPose, setCurrentPose] = useState<Pose | null>(null);
  const [currentAnalysis, setCurrentAnalysis] =
    useState<UnifiedPostureResult | null>(null);
  const [statusColor, setStatusColor] = useState<string>("#808080"); // 灰色-未知

  const updateStatus = useCallback((result: UnifiedPostureResult | null) => {
    if (!result) {
      setStatusColor("#808080");
      return;
    }

    let color = "#FF6B6B"; // 紅色-不良

    switch (result.primaryPosture) {
      case PostureType.SITTING:
        color = result.detectedPostures.sitting?.isProperPosture
          ? "#51CF66"
          : result.detectedPostures.sitting?.postureFeedback.length
            ? "#FFD93D"
            : "#FF6B6B";
        break;
      case PostureType.STANDING:
        color = result.detectedPostures.standing?.isProperPosture
          ? "#51CF66"
          : result.detectedPostures.standing?.postureFeedback.length
            ? "#FFD93D"
            : "#FF6B6B";
        break;
      case PostureType.LYING:
        color = result.detectedPostures.lying?.isProperPosture
          ? "#51CF66"
          : result.detectedPostures.lying?.postureFeedback.length
            ? "#FFD93D"
            : "#FF6B6B";
        break;
      default:
        color = "#FF6B6B";
    }

    setStatusColor(color);
  }, []);

  const handlePoseDetected = (pose: Pose) => {
    const analysisResult = analyzePosture(pose);
    setCurrentPose(pose);
    setCurrentAnalysis(analysisResult);
    updateStatus(analysisResult);
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
      </View>

      {/* 底部狀態指示燈條 */}
      <View style={styles.statusBar}>
        <View
          style={[
            styles.statusLight,
            {
              backgroundColor:
                statusColor === "#51CF66" ? "#51CF66" : "#333",
            },
          ]}
        />
        <View
          style={[
            styles.statusLight,
            {
              backgroundColor:
                statusColor === "#FFD93D" ? "#FFD93D" : "#333",
            },
          ]}
        />
        <View
          style={[
            styles.statusLight,
            {
              backgroundColor:
                statusColor === "#FF6B6B" ? "#FF6B6B" : "#333",
            },
          ]}
        />
      </View>

      {/* 分析組件：不佔畫面，但需保持掛載以觸發語音與彈窗流程 */}
      {mode === "sitting-only" && <SittingPostureAnalyzer pose={currentPose} />}
      {mode === "unified" && (
        <UnifiedPostureAnalyzer
          pose={currentPose}
          analysisResult={currentAnalysis}
        />
      )}
    </View>
  );
};

export default PoseUI;
