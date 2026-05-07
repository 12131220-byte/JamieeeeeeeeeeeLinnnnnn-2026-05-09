import { PostureType } from "@/types/types";
import React, { useEffect, useState } from "react";
import {
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";

interface KegelExerciseProgressProps {
  type: PostureType;
  sets: number;
  reps: number;
  restBetweenSets: number;
  currentSet: number;
  currentRep: number;
  timeRemaining: number;
  isResting: boolean;
  onComplete: () => void;
  onPause: () => void;
  onResume: () => void;
  isPaused: boolean;
}

const KegelExerciseProgress: React.FC<KegelExerciseProgressProps> = ({
  type,
  sets,
  reps,
  restBetweenSets,
  currentSet,
  currentRep,
  timeRemaining,
  isResting,
  onComplete,
  onPause,
  onResume,
  isPaused,
}) => {
  const [displayTime, setDisplayTime] = useState(timeRemaining);

  useEffect(() => {
    setDisplayTime(timeRemaining);
  }, [timeRemaining]);

  const getExerciseTitle = () => {
    switch (type) {
      case PostureType.STANDING:
        return "站姿凱格爾";
      case PostureType.SITTING:
        return "坐姿凱格爾";
      case PostureType.LYING:
        return "躺姿凱格爾";
      default:
        return "凱格爾運動";
    }
  };

  const getExerciseIcon = () => {
    switch (type) {
      case PostureType.STANDING:
        return "🧍";
      case PostureType.SITTING:
        return "🪑";
      case PostureType.LYING:
        return "🛏️";
      default:
        return "💪";
    }
  };

  const getStatusColor = () => {
    switch (type) {
      case PostureType.STANDING:
        return "#0F766E";
      case PostureType.SITTING:
        return "#7C3AED";
      case PostureType.LYING:
        return "#DC2626";
      default:
        return "#1F2937";
    }
  };

  const progress = (currentSet - 1 + currentRep / reps) / sets;
  const progressPercentage = Math.round(progress * 100);

  return (
    <View style={styles.container}>
      {/* 頭部 - 運動信息 */}
      <View style={styles.header}>
        <Text style={styles.exerciseIcon}>{getExerciseIcon()}</Text>
        <View style={styles.headerInfo}>
          <Text style={styles.exerciseTitle}>{getExerciseTitle()}</Text>
          <Text style={styles.exerciseStatus}>
            {isResting
              ? `組間休息 - 第 ${currentSet - 1}/${sets} 組完成`
              : `進行中 - 第 ${currentSet}/${sets} 組`}
          </Text>
        </View>
      </View>

      {/* 進度條 */}
      <View style={styles.progressSection}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${progressPercentage}%`,
                backgroundColor: getStatusColor(),
              },
            ]}
          />
        </View>
        <Text style={styles.progressText}>{progressPercentage}%</Text>
      </View>

      {/* 主要時鐘/計數器 */}
      <View style={styles.mainDisplay}>
        {isResting ? (
          <>
            <Text style={styles.restLabel}>組間休息</Text>
            <Text style={[styles.mainTimer, { color: getStatusColor() }]}>
              {displayTime}
            </Text>
            <Text style={styles.restHint}>放鬆並準備下一組</Text>
          </>
        ) : (
          <>
            <Text style={styles.repCountLabel}>本組進度</Text>
            <View style={styles.repCountContainer}>
              <Text style={[styles.repCount, { color: getStatusColor() }]}>
                {currentRep}
              </Text>
              <Text style={styles.repCountTotal}>/ {reps}</Text>
            </View>
            <Text style={styles.repCountHint}>次</Text>
          </>
        )}
      </View>

      {/* 詳細信息 */}
      <View style={styles.infoGrid}>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>目前組數</Text>
          <Text style={styles.infoValue}>
            {currentSet}/{sets}
          </Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>每組次數</Text>
          <Text style={styles.infoValue}>{reps}</Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>總進度</Text>
          <Text style={styles.infoValue}>
            {Math.min(currentRep, reps) + (currentSet - 1) * reps}/{sets * reps}
          </Text>
        </View>
      </View>

      {/* 操作按鈕 */}
      <View style={styles.buttonGroup}>
        <Pressable
          style={styles.pauseButton}
          onPress={isPaused ? onResume : onPause}
        >
          <Text style={styles.pauseButtonText}>
            {isPaused ? "▶ 繼續" : "⏸ 暫停"}
          </Text>
        </Pressable>
        <Pressable
          style={styles.completeButton}
          onPress={onComplete}
        >
          <Text style={styles.completeButtonText}>✓ 完成</Text>
        </Pressable>
      </View>

      {/* 提示信息 */}
      {isResting && (
        <View style={styles.tipBox}>
          <Text style={styles.tipText}>
            深呼吸並放鬆肌肉，為下一組做準備
          </Text>
        </View>
      )}

      {!isResting && (
        <View style={styles.tipBox}>
          <Text style={styles.tipText}>
            保持正確姿勢，穩定且控制地完成每一次動作
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  exerciseIcon: {
    fontSize: 36,
    marginRight: 12,
  },
  headerInfo: {
    flex: 1,
  },
  exerciseTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 4,
  },
  exerciseStatus: {
    fontSize: 13,
    color: "#6B7280",
  },
  progressSection: {
    marginBottom: 24,
  },
  progressBar: {
    height: 8,
    backgroundColor: "#E5E7EB",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 8,
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  progressText: {
    textAlign: "right",
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
  },
  mainDisplay: {
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    paddingVertical: 32,
    paddingHorizontal: 20,
    marginBottom: 24,
    alignItems: "center",
  },
  restLabel: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 8,
  },
  mainTimer: {
    fontSize: 64,
    fontWeight: "700",
    marginBottom: 8,
  },
  restHint: {
    fontSize: 13,
    color: "#6B7280",
  },
  repCountLabel: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 8,
  },
  repCountContainer: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  repCount: {
    fontSize: 56,
    fontWeight: "700",
    marginRight: 8,
  },
  repCountTotal: {
    fontSize: 28,
    color: "#9CA3AF",
    fontWeight: "600",
  },
  repCountHint: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 8,
  },
  infoGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  infoCard: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
  },
  infoLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 6,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
  },
  buttonGroup: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  pauseButton: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  pauseButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
  },
  completeButton: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    backgroundColor: "#10B981",
    justifyContent: "center",
    alignItems: "center",
  },
  completeButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  tipBox: {
    backgroundColor: "#FEF3C7",
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#F59E0B",
  },
  tipText: {
    fontSize: 12,
    color: "#78350F",
    lineHeight: 18,
  },
});

export default KegelExerciseProgress;
