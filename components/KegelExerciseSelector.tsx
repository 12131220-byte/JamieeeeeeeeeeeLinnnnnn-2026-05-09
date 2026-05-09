import { PostureType } from "@/types/types";
import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export interface KegelExerciseConfig {
  type: PostureType;
  sets: number; // 組數
  reps: number; // 次數
  restBetweenSets: number; // 組間休息秒數
}

interface KegelExerciseSelectorProps {
  visible: boolean;
  onClose: () => void;
  onStartExercise: (config: KegelExerciseConfig) => void;
}

const KEGEL_EXERCISES = [
  {
    type: PostureType.STANDING,
    title: "站姿凱格爾",
    description: "墊起腳尖、夾緊臀部",
    icon: "🧍",
    color: "#0F766E",
    lightColor: "#E6FFFB",
    details: [
      "✓ 鍛鍊臀肌和骨盆底肌肉",
      "✓ 改善身體平衡",
      "✓ 增強腿部力量",
    ],
  },
];

const KegelExerciseSelector: React.FC<KegelExerciseSelectorProps> = ({
  visible,
  onClose,
  onStartExercise,
}) => {
  const [selectedType, setSelectedType] = useState<PostureType | null>(null);
  const [sets, setSets] = useState("3");
  const [reps, setReps] = useState("10");
  const [restSeconds, setRestSeconds] = useState("30");
  const [step, setStep] = useState<"select" | "configure">("select");

  const handleSelectExercise = (type: PostureType) => {
    setSelectedType(type);
    setStep("configure");
  };

  const handleStartExercise = () => {
    if (!selectedType) return;

    const setsNum = Math.max(1, Math.min(10, parseInt(sets) || 3));
    const repsNum = Math.max(1, Math.min(50, parseInt(reps) || 10));
    const restNum = Math.max(0, Math.min(120, parseInt(restSeconds) || 30));

    onStartExercise({
      type: selectedType,
      sets: setsNum,
      reps: repsNum,
      restBetweenSets: restNum,
    });

    // 重設
    setSelectedType(null);
    setStep("select");
    setSets("3");
    setReps("10");
    setRestSeconds("30");
    onClose();
  };

  const handleBack = () => {
    setSelectedType(null);
    setStep("select");
  };

  const selectedExercise = KEGEL_EXERCISES.find(
    (ex) => ex.type === selectedType,
  );

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.container}>
          {/* 頭部 */}
          <View style={styles.header}>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </Pressable>
            <Text style={styles.headerTitle}>
              {step === "select" ? "選擇凱格爾運動" : "運動設定"}
            </Text>
            <View style={{ width: 44 }} />
          </View>

          {/* 內容 */}
          {step === "select" ? (
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              <Text style={styles.sectionHint}>
                點選站姿凱格爾，進入站姿偵測與訓練流程
              </Text>

              {KEGEL_EXERCISES.map((exercise) => (
                <Pressable
                  key={exercise.type}
                  style={styles.exerciseCard}
                  onPress={() => handleSelectExercise(exercise.type)}
                >
                  <View style={styles.exerciseHeader}>
                    <Text style={styles.exerciseIcon}>{exercise.icon}</Text>
                    <View style={styles.exerciseInfo}>
                      <Text style={styles.exerciseTitle}>
                        {exercise.title}
                      </Text>
                      <Text style={styles.exerciseDescription}>
                        {exercise.description}
                      </Text>
                    </View>
                    <Text style={styles.arrowIcon}>›</Text>
                  </View>

                  <View style={styles.exerciseDetails}>
                    {exercise.details.map((detail, idx) => (
                      <Text key={idx} style={styles.detailText}>
                        {detail}
                      </Text>
                    ))}
                  </View>
                </Pressable>
              ))}

              <View style={styles.tipCard}>
                <Text style={styles.tipTitle}>💡 貼士</Text>
                <Text style={styles.tipText}>
                  目前僅提供站姿凱格爾訓練，流程會先偵測站姿，再引導你墊腳尖與夾緊臀部。
                </Text>
              </View>
            </ScrollView>
          ) : (
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              {selectedExercise && (
                <>
                  {/* 選擇的運動卡片 */}
                  <View
                    style={[
                      styles.selectedCard,
                      { backgroundColor: selectedExercise.lightColor },
                    ]}
                  >
                    <Text style={styles.selectedIcon}>
                      {selectedExercise.icon}
                    </Text>
                    <Text
                      style={[
                        styles.selectedTitle,
                        { color: selectedExercise.color },
                      ]}
                    >
                      {selectedExercise.title}
                    </Text>
                    <Text style={styles.selectedDescription}>
                      {selectedExercise.description}
                    </Text>
                  </View>

                  {/* 運動參數設定 */}
                  <View style={styles.settingsSection}>
                    <Text style={styles.settingLabel}>組數</Text>
                    <View style={styles.settingInputRow}>
                      <Pressable
                        style={styles.minusButton}
                        onPress={() =>
                          setSets(
                            Math.max(1, parseInt(sets) - 1).toString(),
                          )
                        }
                      >
                        <Text style={styles.minusButtonText}>−</Text>
                      </Pressable>
                      <TextInput
                        style={styles.settingInput}
                        value={sets}
                        onChangeText={setSets}
                        keyboardType="number-pad"
                        maxLength={2}
                      />
                      <Pressable
                        style={styles.plusButton}
                        onPress={() =>
                          setSets(
                            Math.min(10, parseInt(sets) + 1).toString(),
                          )
                        }
                      >
                        <Text style={styles.plusButtonText}>+</Text>
                      </Pressable>
                    </View>
                    <Text style={styles.settingRange}>
                      (1-10 組)
                    </Text>
                  </View>

                  <View style={styles.settingsSection}>
                    <Text style={styles.settingLabel}>每組次數</Text>
                    <View style={styles.settingInputRow}>
                      <Pressable
                        style={styles.minusButton}
                        onPress={() =>
                          setReps(
                            Math.max(1, parseInt(reps) - 1).toString(),
                          )
                        }
                      >
                        <Text style={styles.minusButtonText}>−</Text>
                      </Pressable>
                      <TextInput
                        style={styles.settingInput}
                        value={reps}
                        onChangeText={setReps}
                        keyboardType="number-pad"
                        maxLength={2}
                      />
                      <Pressable
                        style={styles.plusButton}
                        onPress={() =>
                          setReps(
                            Math.min(50, parseInt(reps) + 1).toString(),
                          )
                        }
                      >
                        <Text style={styles.plusButtonText}>+</Text>
                      </Pressable>
                    </View>
                    <Text style={styles.settingRange}>
                      (1-50 次)
                    </Text>
                  </View>

                  <View style={styles.settingsSection}>
                    <Text style={styles.settingLabel}>組間休息</Text>
                    <View style={styles.settingInputRow}>
                      <Pressable
                        style={styles.minusButton}
                        onPress={() =>
                          setRestSeconds(
                            Math.max(0, parseInt(restSeconds) - 5).toString(),
                          )
                        }
                      >
                        <Text style={styles.minusButtonText}>−</Text>
                      </Pressable>
                      <TextInput
                        style={styles.settingInput}
                        value={restSeconds}
                        onChangeText={setRestSeconds}
                        keyboardType="number-pad"
                        maxLength={3}
                      />
                      <Pressable
                        style={styles.plusButton}
                        onPress={() =>
                          setRestSeconds(
                            Math.min(120, parseInt(restSeconds) + 5).toString(),
                          )
                        }
                      >
                        <Text style={styles.plusButtonText}>+</Text>
                      </Pressable>
                    </View>
                    <Text style={styles.settingRange}>
                      (0-120 秒)
                    </Text>
                  </View>

                  {/* 運動概覽 */}
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryTitle}>運動概覽</Text>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>總組數：</Text>
                      <Text style={styles.summaryValue}>{sets} 組</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>每組次數：</Text>
                      <Text style={styles.summaryValue}>{reps} 次</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>總次數：</Text>
                      <Text style={styles.summaryValue}>
                        {parseInt(sets) * parseInt(reps)} 次
                      </Text>
                    </View>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>
                        預計耗時：
                      </Text>
                      <Text style={styles.summaryValue}>
                        約 {Math.ceil((parseInt(sets) * parseInt(reps) + (parseInt(sets) - 1) * parseInt(restSeconds)) / 20)} 分鐘
                      </Text>
                    </View>
                  </View>
                </>
              )}
            </ScrollView>
          )}

          {/* 底部按鈕 */}
          <View style={styles.footer}>
            {step === "select" ? (
              <Pressable style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelButtonText}>關閉</Text>
              </Pressable>
            ) : (
              <>
                <Pressable style={styles.backButton} onPress={handleBack}>
                  <Text style={styles.backButtonText}>上一步</Text>
                </Pressable>
                <Pressable
                  style={styles.startButton}
                  onPress={handleStartExercise}
                >
                  <Text style={styles.startButtonText}>開始運動</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 24,
  },
  container: {
    width: "90%",
    maxWidth: 400,
    height: "80%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    overflow: "hidden",
    flexDirection: "column",
    marginTop: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  closeButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 24,
    color: "#6B7280",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  sectionHint: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 16,
    textAlign: "center",
  },
  exerciseCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  exerciseHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  exerciseIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 4,
  },
  exerciseDescription: {
    fontSize: 13,
    color: "#6B7280",
  },
  arrowIcon: {
    fontSize: 24,
    color: "#D1D5DB",
  },
  exerciseDetails: {
    paddingLeft: 44,
    gap: 6,
  },
  detailText: {
    fontSize: 12,
    color: "#4B5563",
    lineHeight: 18,
  },
  tipCard: {
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#F59E0B",
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#92400E",
    marginBottom: 6,
  },
  tipText: {
    fontSize: 12,
    color: "#78350F",
    lineHeight: 18,
  },
  selectedCard: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    alignItems: "center",
  },
  selectedIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  selectedTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 6,
  },
  selectedDescription: {
    fontSize: 13,
    color: "#6B7280",
  },
  settingsSection: {
    marginBottom: 20,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 8,
  },
  settingInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  minusButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  minusButtonText: {
    fontSize: 20,
    color: "#374151",
    fontWeight: "600",
  },
  settingInput: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
    backgroundColor: "#F9FAFB",
  },
  plusButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  plusButtonText: {
    fontSize: 20,
    color: "#374151",
    fontWeight: "600",
  },
  settingRange: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 6,
  },
  summaryCard: {
    backgroundColor: "#F0F9FF",
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: "#0EA5E9",
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0C4A6E",
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 13,
    color: "#475569",
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0C4A6E",
  },
  summaryDivider: {
    height: 1,
    backgroundColor: "#BAE6FD",
    marginVertical: 8,
  },
  footer: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  cancelButton: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
  },
  backButton: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
  },
  startButton: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#0F766E",
    justifyContent: "center",
    alignItems: "center",
  },
  startButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});

export default KegelExerciseSelector;
