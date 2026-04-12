import { Pose, PostureType, UnifiedPostureResult } from "@/types/types";
import { analyzePosture } from "@/utils/pose-analyzer";
import * as Speech from "expo-speech";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";

interface UnifiedPostureAnalyzerProps {
  pose: Pose | null;
  analysisResult?: UnifiedPostureResult | null;
  onAnalysisComplete?: (result: UnifiedPostureResult) => void;
}

/**
 * 統一的姿勢分析組件 - 僅負責語音反饋
 * 實時分析並通過語音播放坐、站、躺三種姿勢的改進建議
 */
const UnifiedPostureAnalyzer: React.FC<UnifiedPostureAnalyzerProps> = ({
  pose,
  analysisResult,
  onAnalysisComplete,
}) => {
  const [result, setResult] = useState<UnifiedPostureResult | null>(null);
  const lastSpeechTime = useRef<number>(0);
  const lastSpokenFeedback = useRef<string>("");
  const lastPostureType = useRef<PostureType | null>(null);
  const isSpeaking = useRef<boolean>(false);
  const isInBufferPeriod = useRef<boolean>(false);
  const newPostureDetectionCount = useRef<number>(0);
  const STABLE_POSTURE_THRESHOLD = 3; // 連續檢測N次相同新姿勢才視為穩定
  const standingDetectedSince = useRef<number | null>(null);
  const hasStartedStandingKegel = useRef<boolean>(false);
  const kegelStage = useRef<
    "idle" | "instruction" | "inhale" | "tiptoe_detect" | "tiptoe_countdown" | "done"
  >("idle");
  const nextKegelCueAt = useRef<number>(0);
  const tiptoeStableCount = useRef<number>(0);
  const lastTiptoeReminderAt = useRef<number>(0);
  const TIPTOE_STABLE_THRESHOLD = 4;
  const tiptoeCountdownRemaining = useRef<number>(0);
  const tiptoeCountdownNextTickAt = useRef<number>(0);
  const tiptoeBaselineCaptured = useRef<boolean>(false);
  const tiptoeBaselineLeftLift = useRef<number>(0);
  const tiptoeBaselineRightLift = useRef<number>(0);

  const speakText = useCallback((text: string) => {
    isSpeaking.current = true;
    Speech.speak(text, {
      language: "zh-TW",
      pitch: 1.0,
      rate: 0.8,
      onDone: () => {
        isSpeaking.current = false;
      },
      onStopped: () => {
        isSpeaking.current = false;
      },
      onError: () => {
        isSpeaking.current = false;
      },
    });
  }, []);

  const getHeelLiftFromPose = useCallback(
    (
      inputPose: Pose | null,
    ): { leftHeelLift: number; rightHeelLift: number } | null => {
    if (!inputPose) return null;

    const leftHeel = inputPose[29] as { y: number; visibility: number } | undefined;
    const rightHeel = inputPose[30] as { y: number; visibility: number } | undefined;
    const leftFootIndex = inputPose[31] as { y: number; visibility: number } | undefined;
    const rightFootIndex = inputPose[32] as { y: number; visibility: number } | undefined;

    if (!leftHeel || !rightHeel || !leftFootIndex || !rightFootIndex) {
      return null;
    }

    if (
      leftHeel.visibility < 0.3 ||
      rightHeel.visibility < 0.3 ||
      leftFootIndex.visibility < 0.3 ||
      rightFootIndex.visibility < 0.3
    ) {
      return null;
    }

    const leftHeelLift = leftFootIndex.y - leftHeel.y;
    const rightHeelLift = rightFootIndex.y - rightHeel.y;

    return { leftHeelLift, rightHeelLift };
  }, []);

  const detectTiptoeFromPose = useCallback(
    (inputPose: Pose | null): boolean => {
      const heelLift = getHeelLiftFromPose(inputPose);
      if (!heelLift || !tiptoeBaselineCaptured.current) {
        return false;
      }

      const deltaThreshold = 0.012;
      const absoluteThreshold = 0.026;

      const leftLifted =
        heelLift.leftHeelLift > tiptoeBaselineLeftLift.current + deltaThreshold &&
        heelLift.leftHeelLift > absoluteThreshold;
      const rightLifted =
        heelLift.rightHeelLift > tiptoeBaselineRightLift.current + deltaThreshold &&
        heelLift.rightHeelLift > absoluteThreshold;

      // 任一腳達到抬升門檻就判定成功
      return leftLifted || rightLifted;
    },
    [getHeelLiftFromPose],
  );

  const getFallbackSpeech = useCallback((feedback: string): string => {
    let cleaned = feedback
      .replace(/（[^）]*°[^）]*）/g, "")
      .replace(/，?\s*應該[^，。]*[，。]?/g, "")
      .replace(/[⚠✓✗]/g, "")
      .trim();

    if (cleaned.includes("角度不佳")) {
      cleaned = cleaned.replace("角度不佳", "姿勢需要調整");
    }

    return cleaned;
  }, []);

  const getFeedbackForSpeech = useCallback(
    (analysisResult: UnifiedPostureResult): string | null => {
      if (analysisResult.primaryPosture === PostureType.UNKNOWN) {
        const allFeedback = [
          ...(analysisResult.detectedPostures.sitting?.postureFeedback || []),
          ...(analysisResult.detectedPostures.standing?.postureFeedback || []),
          ...(analysisResult.detectedPostures.lying?.postureFeedback || []),
        ].join(" ");

        if (allFeedback.includes("無法檢測到足夠的身體部位")) {
          return "目前偵測不到你，請把整個人移到鏡頭範圍內";
        }

        if (allFeedback.includes("調整相機角度")) {
          return "鏡頭角度不對，請調整手機或相機角度";
        }

        return "請調整你與鏡頭的位置，讓系統可以清楚偵測姿勢";
      }

      switch (analysisResult.primaryPosture) {
        case PostureType.SITTING: {
          const sitting = analysisResult.detectedPostures.sitting;
          if (!sitting || sitting.isProperPosture) return null;

          if (sitting.backAngle !== null && (sitting.backAngle < 75 || sitting.backAngle > 105)) {
            return "請把背打直，肩膀放鬆";
          }

          if (sitting.kneeAngle !== null && Math.abs(sitting.kneeAngle - 90) > 20) {
            return "請調整膝蓋與腳踝位置，雙腳平放地面";
          }

          if (sitting.scores.feetPositionScore < 0.8) {
            return "請把雙腳完整踩地，避免翹腳或懸空";
          }

          if (sitting.scores.hipPositionScore < 0.7) {
            return "請把臀部坐滿椅面，身體不要前滑";
          }

          return sitting.postureFeedback.length > 0
            ? getFallbackSpeech(sitting.postureFeedback[0])
            : "請保持背直、肩鬆、腳掌踩地";
        }

        case PostureType.STANDING: {
          const standing = analysisResult.detectedPostures.standing;
          if (!standing || standing.isProperPosture) return null;

          if (standing.shoulderAlignment !== null && standing.shoulderAlignment > 2) {
            return "肩膀有些傾斜，請放鬆雙肩並調整成水平";
          }

          if (standing.scores.alignmentScore < 0.7) {
            return "請收下巴、挺胸，讓肩膀、髖部、腳踝對齊";
          }

          if (standing.scores.shoulderScore < 0.65) {
            return "請放鬆肩膀並保持左右平衡，不要聳肩";
          }

          if (standing.kneeFlexion !== null && Math.abs(standing.kneeFlexion - 180) > 20) {
            return "請將膝蓋自然伸直，避免彎膝駝背";
          }

          return standing.postureFeedback.length > 0
            ? getFallbackSpeech(standing.postureFeedback[0])
            : "請抬頭挺胸並平均受力在雙腳";
        }

        case PostureType.LYING: {
          const lying = analysisResult.detectedPostures.lying;
          if (!lying || lying.isProperPosture) return null;

          if (lying.scores.spineScore < 0.75) {
            return "請放鬆下背並拉長脊椎，避免身體扭曲";
          }

          if (lying.scores.neckScore < 0.75) {
            return "請調整頭頸，讓頸部與軀幹保持同一直線";
          }

          if (lying.scores.supportScore < 0.7) {
            return "請讓背部平均受力，避免單側壓力過大";
          }

          return lying.postureFeedback.length > 0
            ? getFallbackSpeech(lying.postureFeedback[0])
            : "請讓頭、肩、髖維持放鬆且對齊";
        }

        default:
          return null;
      }
    },
    [getFallbackSpeech],
  );

  useEffect(() => {
    if (!pose && !analysisResult) return;

    const now = Date.now();
    const resolvedAnalysisResult = analysisResult || analyzePosture(pose as Pose);
    setResult(resolvedAnalysisResult);

    if (onAnalysisComplete) {
      onAnalysisComplete(resolvedAnalysisResult);
    }

    const isStandingNow =
      resolvedAnalysisResult.primaryPosture === PostureType.STANDING &&
      !!resolvedAnalysisResult.detectedPostures.standing?.isStanding;

    if (!hasStartedStandingKegel.current) {
      if (isStandingNow) {
        if (standingDetectedSince.current === null) {
          standingDetectedSince.current = now;
        }

        if (now - standingDetectedSince.current >= 2000 && !isSpeaking.current) {
          hasStartedStandingKegel.current = true;
          kegelStage.current = "instruction";
          nextKegelCueAt.current = now;
          tiptoeStableCount.current = 0;
          lastTiptoeReminderAt.current = 0;
          tiptoeCountdownRemaining.current = 0;
          tiptoeCountdownNextTickAt.current = 0;
          tiptoeBaselineCaptured.current = false;
          tiptoeBaselineLeftLift.current = 0;
          tiptoeBaselineRightLift.current = 0;
        }
      } else {
        standingDetectedSince.current = null;
      }
    }

    if (hasStartedStandingKegel.current) {
      if (kegelStage.current === "done") {
        if (!isSpeaking.current) {
          hasStartedStandingKegel.current = false;
          kegelStage.current = "idle";
          standingDetectedSince.current = null;
          tiptoeStableCount.current = 0;
          lastTiptoeReminderAt.current = 0;
          tiptoeCountdownRemaining.current = 0;
          tiptoeCountdownNextTickAt.current = 0;
          tiptoeBaselineCaptured.current = false;
          tiptoeBaselineLeftLift.current = 0;
          tiptoeBaselineRightLift.current = 0;
        }
        return;
      }

      if (
        kegelStage.current === "instruction" &&
        !isSpeaking.current &&
        now >= nextKegelCueAt.current
      ) {
        speakText("已偵測到站姿，現在開始站姿凱格爾運動，請先站穩，雙腳與肩同寬，手可扶牆保持平衡");
        lastSpeechTime.current = now;
        lastSpokenFeedback.current = "已偵測到站姿，現在開始站姿凱格爾運動，請先站穩，雙腳與肩同寬，手可扶牆保持平衡";
        kegelStage.current = "inhale";
        nextKegelCueAt.current = now + 1000;
        return;
      }

      if (
        kegelStage.current === "inhale" &&
        !isSpeaking.current &&
        now >= nextKegelCueAt.current
      ) {
        speakText("吸氣");
        lastSpeechTime.current = now;
        lastSpokenFeedback.current = "吸氣";
        kegelStage.current = "tiptoe_detect";
        nextKegelCueAt.current = now + 300;
        return;
      }

      if (kegelStage.current === "tiptoe_detect") {
        if (
          !isSpeaking.current &&
          !lastTiptoeReminderAt.current &&
          now >= nextKegelCueAt.current
        ) {
          speakText("吐氣，夾緊臀部並墊起腳尖5秒");
          lastSpeechTime.current = now;
          lastSpokenFeedback.current = "吐氣，夾緊臀部並墊起腳尖5秒";
          lastTiptoeReminderAt.current = now;
          return;
        }

        if (!tiptoeBaselineCaptured.current) {
          const heelLift = getHeelLiftFromPose(pose);
          if (heelLift) {
            tiptoeBaselineLeftLift.current = heelLift.leftHeelLift;
            tiptoeBaselineRightLift.current = heelLift.rightHeelLift;
            tiptoeBaselineCaptured.current = true;
          }
        }

        const isTiptoeDetected = detectTiptoeFromPose(pose);
        if (isTiptoeDetected) {
          tiptoeStableCount.current += 1;
        } else {
          tiptoeStableCount.current = 0;
        }

        if (tiptoeStableCount.current >= TIPTOE_STABLE_THRESHOLD && !isSpeaking.current) {
          kegelStage.current = "tiptoe_countdown";
          tiptoeCountdownRemaining.current = 5;
          tiptoeCountdownNextTickAt.current = now;
          return;
        }
      }

      if (kegelStage.current === "tiptoe_countdown") {
        if (
          tiptoeCountdownRemaining.current > 0 &&
          !isSpeaking.current &&
          now >= tiptoeCountdownNextTickAt.current
        ) {
          const seconds = tiptoeCountdownRemaining.current;
          speakText(seconds.toString());
          lastSpeechTime.current = now;
          lastSpokenFeedback.current = seconds.toString();
          tiptoeCountdownRemaining.current -= 1;
          tiptoeCountdownNextTickAt.current = now + 1000;
          return;
        }

        if (tiptoeCountdownRemaining.current === 0 && !isSpeaking.current) {
          speakText("結束動作，請放下腳跟");
          lastSpeechTime.current = now;
          lastSpokenFeedback.current = "結束動作，請放下腳跟";
          kegelStage.current = "done";
          return;
        }
      }

      return;
    }

    // 檢測姿勢是否改變
    if (lastPostureType.current !== resolvedAnalysisResult.primaryPosture) {
      lastPostureType.current = resolvedAnalysisResult.primaryPosture;
      isInBufferPeriod.current = true; // 進入緩衝期
      newPostureDetectionCount.current = 1; // 新姿勢計數器重置為1
      lastSpokenFeedback.current = ""; // 重置上一次的反饋，以便在新姿勢中播報
      return; // 姿勢改變時直接返回，進入緩衝期
    }

    // 如果在緩衝期內，累加新姿勢的檢測次數
    if (isInBufferPeriod.current) {
      newPostureDetectionCount.current++;
      
      // 當連續檢測到相同新姿勢達到閾值時，結束緩衝期
      if (newPostureDetectionCount.current >= STABLE_POSTURE_THRESHOLD) {
        isInBufferPeriod.current = false; // 緩衝期結束
        newPostureDetectionCount.current = 0;
      } else {
        return; // 仍在緩衝期，不播報
      }
    }

    // 語音指導邏輯（緩衝期結束後才執行）
    // 目前語音播放中時，不插播新內容，避免強制中斷。
    if (isSpeaking.current) {
      return;
    }
    
    // 每5秒最多播放一次，且反饋信息必須不同
    if (now - lastSpeechTime.current > 5000) {
      const feedback = getFeedbackForSpeech(resolvedAnalysisResult);
      if (feedback && feedback !== lastSpokenFeedback.current) {
        isSpeaking.current = true;
        console.log("語音播報:", {
          primaryPosture: resolvedAnalysisResult.primaryPosture,
          feedback,
        });
        Speech.speak(feedback, {
          language: 'zh-CN',
          pitch: 1.0,
          rate: 0.8,
          onDone: () => {
            isSpeaking.current = false;
          },
          onStopped: () => {
            isSpeaking.current = false;
          },
          onError: () => {
            isSpeaking.current = false;
          },
        });
        lastSpeechTime.current = now;
        lastSpokenFeedback.current = feedback;
      }
    }
  }, [
    pose,
    analysisResult,
    onAnalysisComplete,
    getFeedbackForSpeech,
    speakText,
    detectTiptoeFromPose,
    getHeelLiftFromPose,
  ]);

  // 此組件僅負責語音播放，不渲染UI
  return <View />;
};

export default UnifiedPostureAnalyzer;
