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
  const [repJustCompleted, setRepJustCompleted] = useState(false);
  const [nextSetReady, setNextSetReady] = useState(false);

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
    console.log("[Init] Initializing with props - type:", type, "sets:", sets, "reps:", reps, "restBetweenSets:", restBetweenSets);
    
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
    setRepJustCompleted(false);
    setNextSetReady(false);
    standingStableFrames.current = 0;

    if (type === PostureType.STANDING) {
      // 站姿先等待使用者站好
      setState("setup");
      standingState.current = "awaitingStanding";
      Speech.speak(
        `請先站好在鏡頭前，偵測到站姿後會自動開始凱格爾運動，共${sets}組，每組${reps}次，組間休息${restBetweenSets}秒`,
      );
    } else {
      setState("exercising");
      standingState.current = "idle";
      // 播放開始語音提示
      Speech.speak(`開始${getExerciseTitle()}運動，共${sets}組，每組${reps}次`);
    }
  }, [type, sets, reps, restBetweenSets]);

  // 監聽 repJustCompleted 來推進組數邏輯（避免陳舊閉包問題）
  useEffect(() => {
    if (!repJustCompleted) return;

    console.log("[RepJustCompleted] Triggered. currentRep:", currentRep, "reps:", reps, "currentSet:", currentSet, "sets:", sets);
    setRepJustCompleted(false);

    if (currentRep < reps) {
      // 該組還有下一次重複
      const nextRep = currentRep + 1;
      console.log("[RepJustCompleted] Moving to next rep:", nextRep);
      setCurrentRep(nextRep);
      Speech.speak(`${nextRep}`);
    } else {
      // 一組完成
      console.log("[RepJustCompleted] Set completed. currentSet:", currentSet, "sets:", sets, "will rest:", currentSet < sets);
      if (currentSet < sets) {
        const nextSet = currentSet + 1;

        if (restBetweenSets <= 0) {
          console.log("[RepJustCompleted] No rest configured, advancing directly to next set", nextSet);
          setCurrentSet(nextSet);
          setCurrentRep(1);
          setState("exercising");
          Speech.speak(`第${currentSet}組完成，直接進入第${nextSet}組，請準備墊腳尖並夾緊臀部`);
        } else {
          // 進入休息
          console.log("[RepJustCompleted] Entering rest state for", restBetweenSets, "seconds");
          setState("resting");
          setTimeRemaining(restBetweenSets);
          Speech.speak(`第${currentSet}組完成，開始組間休息${restBetweenSets}秒，請放鬆，稍後進行第${nextSet}組`);
        }
      } else {
        // 所有組完成
        console.log("[RepJustCompleted] All sets completed");
        setState("completed");
        Speech.speak("全部組數完成，運動已結束，做得很好！");
      }
    }
  }, [repJustCompleted, currentRep, reps, currentSet, sets]);

  // 監聽下一組準備信號
  useEffect(() => {
    if (!nextSetReady) return;

    console.log("[NextSetReady] Triggered! currentSet:", currentSet, "sets:", sets);
    setNextSetReady(false);

    const nextSet = currentSet + 1;
    console.log("[NextSetReady] nextSet calculated:", nextSet, "nextSet <= sets:", nextSet <= sets);
    
    if (nextSet <= sets) {
      // 開始下一組
      console.log("[NextSetReady] Starting set", nextSet);
      setCurrentSet(nextSet);
      setCurrentRep(1);
      setState("exercising");
      const msg = `休息完成，第${nextSet}組開始，請準備墊腳尖並夾緊臀部`;
      console.log("[NextSetReady] Speaking:", msg);
      Speech.speak(msg);
    } else {
      // 所有組完成
      console.log("[NextSetReady] All sets completed");
      setState("completed");
      const msg = "全部組數完成，運動已結束，做得很好！";
      console.log("[NextSetReady] Speaking:", msg);
      Speech.speak(msg);
    }
  }, [nextSetReady, currentSet, sets]);

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
      console.log("[Timer] Starting rest timer, initial timeRemaining:", timeRemaining, "restBetweenSets:", restBetweenSets);
      timerInterval.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            // 休息時間結束，觸發下一組邏輯
            if (timerInterval.current) {
              clearInterval(timerInterval.current);
              timerInterval.current = null;
            }
            console.log("[Timer] ⏰ Rest time ended! Setting nextSetReady = true");
            setNextSetReady(true);
            return 0; // 設置為 0，不要返回 restBetweenSets（否則會重新倒數）
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
  }, [state, isPaused, restBetweenSets]);

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

  const isLikelyStandingPose = (pose: Pose): boolean => {
    const leftHip = pose[BodyPartIndex.LEFT_HIP as unknown as any];
    const rightHip = pose[BodyPartIndex.RIGHT_HIP as unknown as any];
    const leftKnee = pose[BodyPartIndex.LEFT_KNEE as unknown as any];
    const rightKnee = pose[BodyPartIndex.RIGHT_KNEE as unknown as any];
    const leftAnkle = pose[BodyPartIndex.LEFT_ANKLE as unknown as any];
    const rightAnkle = pose[BodyPartIndex.RIGHT_ANKLE as unknown as any];

    if (!leftHip || !rightHip || !leftKnee || !rightKnee || !leftAnkle || !rightAnkle) {
      const visiblePoints = [leftHip, rightHip, leftKnee, rightKnee, leftAnkle, rightAnkle].filter(
        (point) => point && (typeof point.visibility !== "number" || point.visibility >= 0.2),
      ).length;

      if (visiblePoints < 3) {
        return false;
      }
    }

    const minVisibility = 0.2;
    const leftChainVisible =
      leftHip && leftKnee && leftAnkle &&
      (typeof leftHip.visibility !== "number" || leftHip.visibility >= minVisibility) &&
      (typeof leftKnee.visibility !== "number" || leftKnee.visibility >= minVisibility) &&
      (typeof leftAnkle.visibility !== "number" || leftAnkle.visibility >= minVisibility);
    const rightChainVisible =
      rightHip && rightKnee && rightAnkle &&
      (typeof rightHip.visibility !== "number" || rightHip.visibility >= minVisibility) &&
      (typeof rightKnee.visibility !== "number" || rightKnee.visibility >= minVisibility) &&
      (typeof rightAnkle.visibility !== "number" || rightAnkle.visibility >= minVisibility);

    if (!leftChainVisible && !rightChainVisible) {
      return false;
    }

    const hips: number[] = [];
    const knees: number[] = [];
    const ankles: number[] = [];

    if (leftChainVisible && leftHip && leftKnee && leftAnkle) {
      hips.push(leftHip.y);
      knees.push(leftKnee.y);
      ankles.push(leftAnkle.y);
    }

    if (rightChainVisible && rightHip && rightKnee && rightAnkle) {
      hips.push(rightHip.y);
      knees.push(rightKnee.y);
      ankles.push(rightAnkle.y);
    }

    const avgHipY = hips.reduce((sum, value) => sum + value, 0) / hips.length;
    const avgKneeY = knees.reduce((sum, value) => sum + value, 0) / knees.length;
    const avgAnkleY = ankles.reduce((sum, value) => sum + value, 0) / ankles.length;

    const kneesBelowHips = avgKneeY > avgHipY;
    const anklesBelowKnees = avgAnkleY > avgKneeY;
    const hipToAnkle = Math.abs(avgAnkleY - avgHipY);

    // 基本站姿條件：下肢垂直順序 + 足夠身高跨度
    return kneesBelowHips && anklesBelowKnees && hipToAnkle > 0.12;
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
    if (type === PostureType.STANDING && (state === "resting" || state === "completed" || state === "cancelled")) {
      return;
    }
    // 非站姿模式僅在 exercising 時處理偵測
    if (type !== PostureType.STANDING && state !== "exercising") return;

    // 僅處理站姿模式時的自動計數流程
    if (type === PostureType.STANDING) {
      try {
        const result = analyzePosture(pose);

        // 如果還沒進入站姿等待，檢查是否為站姿
        if (standingState.current === "idle" || standingState.current === "awaitingStanding") {
          standingState.current = "awaitingStanding";
          const isStandingDetected =
            isLikelyStandingPose(pose) || !!result.detectedPostures.standing?.isStanding;
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

          if (standingStableFrames.current >= 2) {
            // 偵測到站姿後，進入 exercising 並準備偵測墊腳尖
            setState("exercising");
            setCurrentRep(1);
            standingState.current = "readyForTiptoe";
            standingStableFrames.current = 0;
            Speech.speak(`偵測到站姿，第 1 組開始，請準備墊腳尖並夾緊臀部`);
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
                // 觸發一次重複完成邏輯（避免閉包陳舊值）
                setRepJustCompleted(true);
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
