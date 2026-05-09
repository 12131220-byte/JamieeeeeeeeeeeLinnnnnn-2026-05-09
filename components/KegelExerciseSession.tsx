import { BodyPartIndex, Pose, PostureType } from "@/types/types";
import { analyzePosture } from "@/utils/pose-analyzer";
import * as Speech from "expo-speech";
import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
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

  // 站姿子狀態（只在站姿模式下使用）
  const standingState = useRef<
    "idle" | "awaitingStanding" | "readyForTiptoe" | "holding" | "paused"
  >("idle");

  // 5 秒保持計時器
  const holdTimer = useRef<NodeJS.Timeout | null>(null);
  const [holdSecondsLeft, setHoldSecondsLeft] = useState(0);
  const standingStableFrames = useRef(0);

  // 初始化運動
  useEffect(() => {
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
      timerInterval.current = null;
    }
    if (holdTimer.current) {
      clearInterval(holdTimer.current);
      holdTimer.current = null;
    }

    setCurrentSet(1);
    setCurrentRep(1);
    setTimeRemaining(restBetweenSets);
    setIsPaused(false);
    setHoldSecondsLeft(0);
    standingStableFrames.current = 0;

    if (type === PostureType.STANDING) {
      // 站姿先等待使用者站好
      setState("setup");
      standingState.current = "awaitingStanding";
      Speech.speak("請先站好在鏡頭前，偵測到站姿後會自動開始凱格爾運動");
    } else {
      setState("exercising");
      standingState.current = "idle";
      // 播放開始語音提示
      Speech.speak(`開始${getExerciseTitle()}運動，共${sets}組，每組${reps}次`);
    }
  }, [type, sets, reps, restBetweenSets]);

  // 監聽組間休息秒數的變化，同步更新
  useEffect(() => {
    setTimeRemaining(restBetweenSets);
  }, [restBetweenSets]);

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
    if (holdTimer.current) {
      clearInterval(holdTimer.current);
      holdTimer.current = null;
    }
    Speech.speak("運動已取消");
    onSessionCancel();
  };

  const handlePoseDetected = (pose: Pose) => {
    if (isPaused) return;
    // 非站姿模式僅在 exercising 時處理偵測
    if (type !== PostureType.STANDING && state !== "exercising") return;

    // 僅處理站姿模式時的自動計數流程
    if (type === PostureType.STANDING) {
      try {
        const result = analyzePosture(pose);

        // 如果還沒進入站姿等待，檢查是否為站姿
        if (standingState.current === "idle" || standingState.current === "awaitingStanding") {
          standingState.current = "awaitingStanding";
          const isStandingDetected = !!result.detectedPostures.standing?.isStanding;
          standingStableFrames.current = isStandingDetected
            ? standingStableFrames.current + 1
            : 0;

          console.log(
            "[StandingDetection] primaryPosture:",
            result.primaryPosture,
            "isStanding:",
            result.detectedPostures.standing?.isStanding,
            "isProperPosture:",
            result.detectedPostures.standing?.isProperPosture,
            "confidence:",
            result.detectedPostures.standing?.confidence,
            "stableFrames:",
            standingStableFrames.current,
          );

          if (standingStableFrames.current >= 3) {
            // 偵測到站姿後，進入 exercising 並準備偵測墊腳尖
            setState("exercising");
            setCurrentRep(1);
            standingState.current = "readyForTiptoe";
            standingStableFrames.current = 0;
            Speech.speak("偵測到站姿，開始凱格爾運動，請準備墊腳尖並夾緊臀部");
          } else if (
            result.detectedPostures.standing?.isStanding &&
            !result.detectedPostures.standing?.isProperPosture
          ) {
            console.log("[StandingDetection] Standing detected but confidence or posture not enough. Feedback:", result.detectedPostures.standing?.postureFeedback);
          }
          return;
        }

        // 當準備好時，偵測腳踝高度以確認是否墊腳尖
        if (standingState.current === "readyForTiptoe") {
          const leftHip = pose[BodyPartIndex.LEFT_HIP as unknown as any];
          const rightHip = pose[BodyPartIndex.RIGHT_HIP as unknown as any];
          const leftAnkle = pose[BodyPartIndex.LEFT_ANKLE as unknown as any];
          const rightAnkle = pose[BodyPartIndex.RIGHT_ANKLE as unknown as any];
          if (!leftHip || !rightHip || !leftAnkle || !rightAnkle) return;

          const avgHipY = ((leftHip.y || 0) + (rightHip.y || 0)) / 2;
          const avgAnkleY = ((leftAnkle.y || 0) + (rightAnkle.y || 0)) / 2;

          const TIPTOE_THRESHOLD = 0.03; // 依座標比例調整
          const ankleLift = avgHipY - avgAnkleY; // 正值表示腳踝較高

          if (ankleLift > TIPTOE_THRESHOLD) {
            // 偵測到墊腳尖，開始 5 秒保持
            standingState.current = "holding";
            setHoldSecondsLeft(5);
            Speech.speak("墊腳尖，現在夾緊臀部並保持五秒");
            let seconds = 5;
            if (holdTimer.current) {
              clearInterval(holdTimer.current);
              holdTimer.current = null;
            }
            holdTimer.current = setInterval(() => {
              seconds -= 1;
              setHoldSecondsLeft(seconds);
              if (seconds <= 0) {
                if (holdTimer.current) {
                  clearInterval(holdTimer.current);
                  holdTimer.current = null;
                }
                standingState.current = "readyForTiptoe";
                // 完成一個重複
                handleRepComplete();
                setHoldSecondsLeft(0);
              }
            }, 1000) as unknown as NodeJS.Timeout;
          }
        }
      } catch (e) {
        console.warn("analyzePosture failed", e);
      }
    } else {
      // 其他姿勢模式的偵測可在此擴充
      console.log("[Kegel Session] Pose detected (non-standing)", pose);
    }
  };

  if (state === "setup") {
    // 等待使用者站好：顯示相機與提示訊息以便偵測站姿
    return (
      <View style={styles.container}>
        <View style={styles.cameraSection}>
          <AspectRatio ratio={4 / 3}>
            <HumanPose
              key={`${sets}-${reps}-${restBetweenSets}`}
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
        <View style={styles.progressSection}>
          <View style={styles.setupMessage}>
            <Text style={{ color: "#000", fontSize: 18, textAlign: "center" }}>
              請站好於鏡頭前，系統偵測到站姿後將自動開始站姿凱格爾運動。
            </Text>
          </View>
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
            key={`${sets}-${reps}-${restBetweenSets}`}
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
