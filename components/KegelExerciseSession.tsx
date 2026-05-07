import { Pose, PostureType } from "@/types/types";
import * as Speech from "expo-speech";
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import HumanPose from "./HumanPose";
import KegelExerciseProgress from "./KegelExerciseProgress";
import { AspectRatio } from "./ui/aspect-ratio";

export interface KegelExerciseSessionProps {
  type: PostureType;
  sets: number;
  reps: number;
  restBetweenSets: number;
  onSessionComplete: () => void;
  onSessionCancel: () => void;
}

type SessionState = "setup" | "exercising" | "resting" | "completed" | "cancelled";

const KegelExerciseSession: React.FC<KegelExerciseSessionProps> = ({
  type,
  sets,
  reps,
  restBetweenSets,
  onSessionComplete,
  onSessionCancel,
}) => {
  const [state, setState] = useState<SessionState>("setup");
  const [currentSet, setCurrentSet] = useState(1);
  const [currentRep, setCurrentRep] = useState(1);
  const [timeRemaining, setTimeRemaining] = useState(restBetweenSets);
  const [isPaused, setIsPaused] = useState(false);

  const sessionState = useRef({
    currentSet: 1,
    currentRep: 1,
    isResting: false,
    timeRemaining: restBetweenSets,
    isPaused: false,
  });

  const timerInterval = useRef<NodeJS.Timeout | null>(null);

  // 初始化運動
  useEffect(() => {
    setState("exercising");
    setCurrentSet(1);
    setCurrentRep(0);

    // 播放開始語音提示
    Speech.speak(`開始${getExerciseTitle()}運動，共${sets}組，每組${reps}次`);
  }, []);

  // 計時器邏輯
  useEffect(() => {
    if (state === "cancelled" || state === "completed") {
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
      }
      return;
    }

    if (isPaused) {
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
        timerInterval.current = null;
      }
      return;
    }

    if (!timerInterval.current && state === "resting") {
      timerInterval.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            // 休息時間結束
            if (timerInterval.current) {
              clearInterval(timerInterval.current);
              timerInterval.current = null;
            }

            const nextSet = currentSet + 1;
            if (nextSet <= sets) {
              // 開始下一組
              setCurrentSet(nextSet);
              setCurrentRep(1);
              setState("exercising");
              Speech.speak(`第${nextSet}組，開始`);
              return restBetweenSets;
            } else {
              // 所有組完成
              setState("completed");
              Speech.speak("運動完成，做得很好！");
              return 0;
            }
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
      }
    };
  }, [state, isPaused, currentSet, restBetweenSets, sets]);

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

  const handleRepComplete = () => {
    if (currentRep < reps) {
      const nextRep = currentRep + 1;
      setCurrentRep(nextRep);
      Speech.speak(`${nextRep}`);
    } else {
      // 一組完成
      Speech.speak("一組完成");
      if (currentSet < sets) {
        setState("resting");
        setTimeRemaining(restBetweenSets);
        Speech.speak(`組間休息${restBetweenSets}秒`);
      } else {
        // 所有組完成
        setState("completed");
        Speech.speak("運動完成，做得很好！");
      }
    }
  };

  const handlePause = () => {
    setIsPaused(!isPaused);
    if (!isPaused) {
      Speech.speak("已暫停");
    } else {
      Speech.speak("已恢復");
    }
  };

  const handleComplete = () => {
    setState("completed");
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
      timerInterval.current = null;
    }
    Speech.speak("運動已結束");
    onSessionComplete();
  };

  const handleCancel = () => {
    setState("cancelled");
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
      timerInterval.current = null;
    }
    Speech.speak("運動已取消");
    onSessionCancel();
  };

  const handlePoseDetected = (pose: Pose) => {
    // 在實際應用中，這裡可以基於姿勢檢測來自動計數次數
    // 例如檢測到特定的身體動作（如腳尖提起）來自動增加計數
    console.log("[Kegel Session] Pose detected:", pose);
  };

  if (state === "setup") {
    return (
      <View style={styles.container}>
        <View style={styles.setupMessage}>
          <View style={styles.loadingSpinner} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 頂部相機視圖 */}
      <View style={styles.cameraSection}>
        <AspectRatio ratio={4 / 3}>
          <HumanPose
            enableKeyPoints={true}
            flipHorizontal={false}
            isBackCamera={false}
            color={"255, 255, 255"}
            onPoseDetected={handlePoseDetected}
            enableSkeleton={true}
            scoreThreshold={0.5}
            mode="multiple"
          />
        </AspectRatio>
      </View>

      {/* 底部運動進度 */}
      <View style={styles.progressSection}>
        <KegelExerciseProgress
          type={type}
          sets={sets}
          reps={reps}
          restBetweenSets={restBetweenSets}
          currentSet={currentSet}
          currentRep={currentRep}
          timeRemaining={timeRemaining}
          isResting={state === "resting"}
          onComplete={handleComplete}
          onPause={handlePause}
          onResume={handlePause}
          isPaused={isPaused}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
    flexDirection: "column",
  },
  cameraSection: {
    flex: 1,
    backgroundColor: "#000000",
  },
  progressSection: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  setupMessage: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingSpinner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 4,
    borderColor: "#0F766E",
    borderTopColor: "transparent",
  },
});

export default KegelExerciseSession;
