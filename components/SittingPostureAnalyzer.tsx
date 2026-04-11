import { Pose, SittingPostureResult } from "@/types/types";
import {
    detectSittingPosture,
    getPostureSummary,
} from "@/utils/sitting-pose-detector";
import React, { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

interface SittingPostureAnalyzerProps {
  pose: Pose | null;
  onAnalysisComplete?: (result: SittingPostureResult) => void;
}

/**
 * 坐姿分析顯示組件
 * 實時分析姿勢數據並顯示反饋信息
 */
const SittingPostureAnalyzer: React.FC<SittingPostureAnalyzerProps> = ({
  pose,
  onAnalysisComplete,
}) => {
  const [result, setResult] = useState<SittingPostureResult | null>(null);
  const analysisInterval = useRef<NodeJS.Timeout | null>(null);

  // 每當檢測到新的姿勢時進行分析
  useEffect(() => {
    if (!pose) return;

    const analysisResult = detectSittingPosture(pose);
    setResult(analysisResult);

    if (onAnalysisComplete) {
      onAnalysisComplete(analysisResult);
    }
  }, [pose, onAnalysisComplete]);

  if (!result) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>正在初始化姿勢檢測...</Text>
      </View>
    );
  }

  const getStatusColor = () => {
    if (!result.isSitting) return "#FF6B6B";
    if (result.isProperPosture) return "#51CF66";
    return "#FFD93D";
  };

  const getScoreColor = (score: number) => {
    if (score > 0.8) return "#51CF66";
    if (score > 0.6) return "#FFD93D";
    return "#FF6B6B";
  };

  return (
    <View style={styles.container}>
      {/* 狀態欄 */}
      <View style={[styles.statusBar, { backgroundColor: getStatusColor() }]}>
        <Text style={styles.statusTitle}>{getPostureSummary(result)}</Text>
        {result.isSitting && (
          <Text style={styles.confidence}>
            信心度: {(result.confidence * 100).toFixed(0)}%
          </Text>
        )}
      </View>

      {/* 主要信息區 */}
      <ScrollView style={styles.contentScroll}>
        {result.isSitting ? (
          <>
            {/* 角度信息 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>角度測量</Text>

              {result.backAngle !== null && (
                <View style={styles.metricBox}>
                  <Text style={styles.metricLabel}>背部角度</Text>
                  <View style={styles.metricRow}>
                    <Text
                      style={[
                        styles.metricValue,
                        {
                          color: getScoreColor(result.scores.backAngleScore),
                        },
                      ]}
                    >
                      {result.backAngle.toFixed(1)}°
                    </Text>
                    <Text style={styles.metricTarget}>目標: 75-105°</Text>
                  </View>
                  <View
                    style={[
                      styles.scoreBar,
                      {
                        width: `${result.scores.backAngleScore * 100}%`,
                        backgroundColor: getScoreColor(
                          result.scores.backAngleScore,
                        ),
                      },
                    ]}
                  />
                </View>
              )}

              {result.kneeAngle !== null && (
                <View style={styles.metricBox}>
                  <Text style={styles.metricLabel}>膝蓋角度</Text>
                  <View style={styles.metricRow}>
                    <Text
                      style={[
                        styles.metricValue,
                        {
                          color: getScoreColor(result.scores.kneeAngleScore),
                        },
                      ]}
                    >
                      {result.kneeAngle.toFixed(1)}°
                    </Text>
                    <Text style={styles.metricTarget}>目標: 85-95°</Text>
                  </View>
                  <View
                    style={[
                      styles.scoreBar,
                      {
                        width: `${result.scores.kneeAngleScore * 100}%`,
                        backgroundColor: getScoreColor(
                          result.scores.kneeAngleScore,
                        ),
                      },
                    ]}
                  />
                </View>
              )}
            </View>

            {/* 位置評估 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>位置評估</Text>

              <View style={styles.scoreRow}>
                <Text style={styles.scoreLabel}>臀部位置</Text>
                <View style={styles.scoreContainer}>
                  <Text
                    style={[
                      styles.scorePercentage,
                      {
                        color: getScoreColor(result.scores.hipPositionScore),
                      },
                    ]}
                  >
                    {(result.scores.hipPositionScore * 100).toFixed(0)}%
                  </Text>
                  <View
                    style={[
                      styles.scoreBarSmall,
                      {
                        width: `${result.scores.hipPositionScore * 100}%`,
                        backgroundColor: getScoreColor(
                          result.scores.hipPositionScore,
                        ),
                      },
                    ]}
                  />
                </View>
              </View>

              <View style={styles.scoreRow}>
                <Text style={styles.scoreLabel}>雙腳位置</Text>
                <View style={styles.scoreContainer}>
                  <Text
                    style={[
                      styles.scorePercentage,
                      {
                        color: getScoreColor(result.scores.feetPositionScore),
                      },
                    ]}
                  >
                    {(result.scores.feetPositionScore * 100).toFixed(0)}%
                  </Text>
                  <View
                    style={[
                      styles.scoreBarSmall,
                      {
                        width: `${result.scores.feetPositionScore * 100}%`,
                        backgroundColor: getScoreColor(
                          result.scores.feetPositionScore,
                        ),
                      },
                    ]}
                  />
                </View>
              </View>
            </View>

            {/* 反饋信息 */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>改進建議</Text>
              {result.postureFeedback.map((feedback, index) => (
                <React.Fragment key={`feedback-${index}`}>
                  <View style={styles.feedbackBox}>
                    <Text style={styles.feedbackText}>{feedback}</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
          </>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>偵測失敗</Text>
            {result.postureFeedback.map((feedback, index) => (
              <React.Fragment key={`feedback-fail-${index}`}>
                <View style={styles.feedbackBox}>
                  <Text style={styles.feedbackText}>{feedback}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
  statusBar: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  statusTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  confidence: {
    color: "#fff",
    fontSize: 12,
    opacity: 0.8,
    marginTop: 4,
  },
  contentScroll: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    padding: 12,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
  },
  metricBox: {
    marginBottom: 12,
  },
  metricLabel: {
    color: "#aaa",
    fontSize: 12,
    marginBottom: 4,
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "bold",
  },
  metricTarget: {
    color: "#888",
    fontSize: 11,
  },
  scoreBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#888",
  },
  scoreRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  scoreLabel: {
    color: "#aaa",
    fontSize: 12,
    flex: 1,
  },
  scoreContainer: {
    flex: 1,
    marginLeft: 12,
  },
  scorePercentage: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 4,
  },
  scoreBarSmall: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "#888",
  },
  feedbackBox: {
    backgroundColor: "#1a1a1a",
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#FFD93D",
  },
  feedbackText: {
    color: "#fff",
    fontSize: 12,
    lineHeight: 18,
  },
  loadingText: {
    color: "#aaa",
    textAlign: "center",
    marginTop: 16,
  },
});

export default SittingPostureAnalyzer;
