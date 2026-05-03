import { Pose, PostureType, UnifiedPostureResult } from "@/types/types";
import { analyzePosture } from "@/utils/pose-analyzer";
import Constants from "expo-constants";
import * as Speech from "expo-speech";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

interface UnifiedPostureAnalyzerProps {
  pose: Pose | null;
  analysisResult?: UnifiedPostureResult | null;
  onAnalysisComplete?: (result: UnifiedPostureResult) => void;
}

type SpeechRecognitionModule = {
  isRecognitionAvailable: () => boolean;
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  start: (options: Record<string, unknown>) => void;
  stop: () => void;
  abort: () => void;
  addListener: (
    eventName: string,
    listener: (event: any) => void,
  ) => { remove: () => void };
};

const getSpeechRecognitionModule = (): SpeechRecognitionModule | null => {
  const appOwnership = (Constants as { appOwnership?: string }).appOwnership;
  const executionEnvironment = (Constants as { executionEnvironment?: string }).executionEnvironment;

  // Expo Go 不包含自訂原生模組，避免觸發 require 時的紅屏錯誤。
  if (appOwnership === "expo" || executionEnvironment === "storeClient") {
    return null;
  }

  try {
    const moduleObject = require("expo-speech-recognition") as {
      ExpoSpeechRecognitionModule?: SpeechRecognitionModule;
    };
    return moduleObject.ExpoSpeechRecognitionModule || null;
  } catch {
    return null;
  }
};

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
  const [showKegelRepPrompt, setShowKegelRepPrompt] = useState<boolean>(false);
  const [kegelRepInput, setKegelRepInput] = useState<string>("5");
  const [speechTranscript, setSpeechTranscript] = useState<string>("");
  const [speechError, setSpeechError] = useState<string>("");
  const [isListeningForKegel, setIsListeningForKegel] = useState<boolean>(false);
  const lastSpeechTime = useRef<number>(0);
  const lastPostureFeedbackSpeechTime = useRef<number>(0);
  const lastSpokenFeedback = useRef<string>("");
  const lastPostureType = useRef<PostureType | null>(null);
  const isSpeaking = useRef<boolean>(false);
  const isInBufferPeriod = useRef<boolean>(false);
  const newPostureDetectionCount = useRef<number>(0);
  const STABLE_POSTURE_THRESHOLD = 3; // 連續檢測N次相同新姿勢才視為穩定
  const standingDetectedSince = useRef<number | null>(null);
  const hasStartedStandingKegel = useRef<boolean>(false);
  const targetKegelRounds = useRef<number>(0);
  const completedKegelRounds = useRef<number>(0);
  const kegelStage = useRef<
    "idle" | "instruction" | "awaiting_reps" | "tiptoe_detect" | "tiptoe_countdown" | "done"
  >("idle");
  const nextKegelCueAt = useRef<number>(0);
  const tiptoeStableCount = useRef<number>(0);
  const lastTiptoeReminderAt = useRef<number>(0);
  const TIPTOE_STABLE_THRESHOLD = 4;
  const TIPTOE_BASELINE_SETTLE_THRESHOLD = 2;
  const tiptoeCountdownRemaining = useRef<number>(0);
  const tiptoeCountdownNextTickAt = useRef<number>(0);
  const tiptoeBaselineCaptured = useRef<boolean>(false);
  const tiptoeBaselineLeftLift = useRef<number>(0);
  const tiptoeBaselineRightLift = useRef<number>(0);
  const awaitingTiptoeBaselineCapture = useRef<boolean>(false);
  const speechRecognitionListeners = useRef<{
    start?: { remove: () => void };
    end?: { remove: () => void };
    error?: { remove: () => void };
    result?: { remove: () => void };
  }>({});

  const getDigitValue = useCallback((value: string): number | null => {
    const digitMap: Record<string, number> = {
      "零": 0,
      "〇": 0,
      "一": 1,
      "二": 2,
      "兩": 2,
      "三": 3,
      "四": 4,
      "五": 5,
      "六": 6,
      "七": 7,
      "八": 8,
      "九": 9,
    };

    if (/^\d+$/.test(value)) {
      return Number.parseInt(value, 10);
    }

    return Object.prototype.hasOwnProperty.call(digitMap, value)
      ? digitMap[value]
      : null;
  }, []);

  const extractKegelRoundsFromTranscript = useCallback(
    (transcript: string): number | null => {
      const trimmedTranscript = transcript.trim();
      if (!trimmedTranscript) {
        return null;
      }

      const digitMatch = trimmedTranscript.match(/\d{1,2}/);
      if (digitMatch) {
        return Math.min(Math.max(Number.parseInt(digitMatch[0], 10), 1), 30);
      }

      const chineseMatch = trimmedTranscript.match(/[零〇一二三四五六七八九十兩]+/);
      if (!chineseMatch) {
        return null;
      }

      const token = chineseMatch[0];
      if (token === "十") {
        return 10;
      }

      if (token.includes("十")) {
        const [tensPart, unitsPart] = token.split("十");
        const tensValue = tensPart ? getDigitValue(tensPart) : 1;
        const unitsValue = unitsPart ? getDigitValue(unitsPart) : 0;

        if (tensValue === null || unitsValue === null) {
          return null;
        }

        return Math.min(Math.max(tensValue * 10 + unitsValue, 1), 30);
      }

      const singleValue = getDigitValue(token);
      if (singleValue === null) {
        return null;
      }

      return Math.min(Math.max(singleValue, 1), 30);
    },
    [getDigitValue],
  );

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

  const commitKegelRoundCount = useCallback(
    (rounds: number) => {
      const safeRounds = Math.min(Math.max(rounds, 1), 30);

      targetKegelRounds.current = safeRounds;
      completedKegelRounds.current = 0;
      tiptoeStableCount.current = 0;
      lastTiptoeReminderAt.current = 0;
      tiptoeBaselineCaptured.current = false;
      tiptoeBaselineLeftLift.current = 0;
      tiptoeBaselineRightLift.current = 0;
      awaitingTiptoeBaselineCapture.current = true;

      setKegelRepInput(String(safeRounds));
      setShowKegelRepPrompt(false);
      setIsListeningForKegel(false);
      setSpeechError("");
      setSpeechTranscript("");
      kegelStage.current = "tiptoe_detect";

      const now = Date.now();
      nextKegelCueAt.current = now + 300;

      const startMessage = `收到，開始進行${safeRounds}次，請夾緊臀部並墊起腳尖5秒`;
      speakText(startMessage);
      lastSpeechTime.current = now;
      lastSpokenFeedback.current = startMessage;
    },
    [speakText],
  );

  const submitKegelRepInput = useCallback(() => {
    const parsed = Number.parseInt(kegelRepInput.trim(), 10);
    const safeRounds = Number.isFinite(parsed) ? parsed : 1;
    commitKegelRoundCount(safeRounds);
  }, [commitKegelRoundCount, kegelRepInput]);

  const startListeningForKegelRounds = useCallback(async () => {
    try {
      setSpeechError("");
      setSpeechTranscript("");

      const speechModule = getSpeechRecognitionModule();
      if (!speechModule) {
        setSpeechError("目前這個環境沒有原生語音辨識模組，請改用開發版 App。");
        return;
      }

      if (!speechModule.isRecognitionAvailable()) {
        setSpeechError("目前這個環境沒有原生語音辨識模組，請改用開發版 App。");
        return;
      }

      const permissionResult =
        await speechModule.requestPermissionsAsync();

      if (!permissionResult.granted) {
        setSpeechError("麥克風或語音辨識權限未開啟");
        return;
      }

      speechModule.start({
        lang: "zh-TW",
        interimResults: true,
        continuous: false,
        iosTaskHint: "confirmation",
        requiresOnDeviceRecognition: false,
        androidIntentOptions: {
          EXTRA_LANGUAGE_MODEL: "web_search",
        },
      });
    } catch (error) {
      setSpeechError("無法啟動語音辨識");
      console.log("startListeningForKegelRounds error:", error);
    }
  }, []);

  const stopListeningForKegelRounds = useCallback(() => {
    const speechModule = getSpeechRecognitionModule();
    speechModule?.stop();
  }, []);

  useEffect(() => {
    try {
      const speechModule = getSpeechRecognitionModule();
      if (!speechModule) {
        return undefined;
      }

      const startListener = speechModule.addListener("start", () => {
        setIsListeningForKegel(true);
      });

      const endListener = speechModule.addListener("end", () => {
        setIsListeningForKegel(false);
      });

      const errorListener = speechModule.addListener("error", (event) => {
        setIsListeningForKegel(false);

        if (event.error === "aborted") {
          return;
        }

        setSpeechError(event.message || "語音辨識發生錯誤");
      });

      const resultListener = speechModule.addListener("result", (event) => {
        if (!showKegelRepPrompt) {
          return;
        }

        const transcript = event.results[0]?.transcript?.trim() || "";
        if (!transcript) {
          return;
        }

        setSpeechTranscript(transcript);

        const extractedRounds = extractKegelRoundsFromTranscript(transcript);
        if (extractedRounds === null) {
          return;
        }

        commitKegelRoundCount(extractedRounds);
        speechModule.stop();
      });

      speechRecognitionListeners.current = {
        start: startListener,
        end: endListener,
        error: errorListener,
        result: resultListener,
      };

      return () => {
        startListener.remove();
        endListener.remove();
        errorListener.remove();
        resultListener.remove();
        speechRecognitionListeners.current = {};
      };
    } catch (error) {
      console.log("expo-speech-recognition unavailable:", error);
      return undefined;
    }
  }, [commitKegelRoundCount, extractKegelRoundsFromTranscript, showKegelRepPrompt]);

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
        return null;
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

  const resetKegelSession = useCallback(() => {
    hasStartedStandingKegel.current = false;
    kegelStage.current = "idle";
    standingDetectedSince.current = null;
    targetKegelRounds.current = 0;
    completedKegelRounds.current = 0;
    tiptoeStableCount.current = 0;
    lastTiptoeReminderAt.current = 0;
    tiptoeCountdownRemaining.current = 0;
    tiptoeCountdownNextTickAt.current = 0;
    tiptoeBaselineCaptured.current = false;
    tiptoeBaselineLeftLift.current = 0;
    tiptoeBaselineRightLift.current = 0;
    awaitingTiptoeBaselineCapture.current = false;
    setShowKegelRepPrompt(false);
    setIsListeningForKegel(false);
    setSpeechTranscript("");
    setSpeechError("");
  }, []);

  const prepareNextTiptoeRound = useCallback((now: number) => {
    kegelStage.current = "tiptoe_detect";
    nextKegelCueAt.current = now + 1200;
    tiptoeStableCount.current = 0;
    lastTiptoeReminderAt.current = 0;
    tiptoeBaselineCaptured.current = false;
    tiptoeBaselineLeftLift.current = 0;
    tiptoeBaselineRightLift.current = 0;
    awaitingTiptoeBaselineCapture.current = true;
  }, []);

  useEffect(() => {
    return () => {
      const speechModule = getSpeechRecognitionModule();
      speechModule?.abort();
    };
  }, []);

  useEffect(() => {
    return () => {
      Speech.stop();
      isSpeaking.current = false;
    };
  }, []);

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
          awaitingTiptoeBaselineCapture.current = true;
        }
      } else {
        standingDetectedSince.current = null;
      }
    }

    if (hasStartedStandingKegel.current) {
      if (!isStandingNow && !isSpeaking.current) {
        resetKegelSession();
        return;
      }

      if (kegelStage.current === "done") {
        if (!isSpeaking.current) {
          resetKegelSession();
        }
        return;
      }

      if (
        kegelStage.current === "instruction" &&
        !isSpeaking.current &&
        now >= nextKegelCueAt.current
      ) {
        const instruction = "已偵測到站姿，現在開始站姿凱格爾運動，請先站穩，雙腳與肩同寬，手可扶牆保持平衡。請在畫面輸入要做幾次，再按開始。";
        speakText(instruction);
        lastSpeechTime.current = now;
        lastSpokenFeedback.current = instruction;
        kegelStage.current = "awaiting_reps";
        setShowKegelRepPrompt(true);
        return;
      }

      if (kegelStage.current === "awaiting_reps") {
        return;
      }

      if (kegelStage.current === "tiptoe_detect") {
        if (
          !isSpeaking.current &&
          !lastTiptoeReminderAt.current &&
          now >= nextKegelCueAt.current
        ) {
          const currentRound = completedKegelRounds.current + 1;
          const prompt = `第${currentRound}次，夾緊臀部並墊起腳尖5秒`;
          speakText(prompt);
          lastSpeechTime.current = now;
          lastSpokenFeedback.current = prompt;
          lastTiptoeReminderAt.current = now;
          return;
        }

        if (awaitingTiptoeBaselineCapture.current) {
          const heelLift = getHeelLiftFromPose(pose);
          if (heelLift) {
            const baselineReady =
              heelLift.leftHeelLift <= 0.03 && heelLift.rightHeelLift <= 0.03;

            if (baselineReady) {
              tiptoeBaselineLeftLift.current = heelLift.leftHeelLift;
              tiptoeBaselineRightLift.current = heelLift.rightHeelLift;
              tiptoeBaselineCaptured.current = true;
              awaitingTiptoeBaselineCapture.current = false;
            } else {
              return;
            }
          }

          return;
        }

        const isTiptoeDetected = detectTiptoeFromPose(pose);
        if (isTiptoeDetected) {
          tiptoeStableCount.current += 1;
        } else {
          tiptoeStableCount.current = 0;
        }

        if (tiptoeStableCount.current >= TIPTOE_BASELINE_SETTLE_THRESHOLD && !isSpeaking.current) {
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
          completedKegelRounds.current += 1;
          const remaining = targetKegelRounds.current - completedKegelRounds.current;

          if (remaining > 0) {
            const nextRoundCue = `本次完成，請放下腳跟，還有${remaining}次`;
            speakText(nextRoundCue);
            lastSpeechTime.current = now;
            lastSpokenFeedback.current = nextRoundCue;

            prepareNextTiptoeRound(now);
            return;
          }

          const finishCue = "全部完成，今天的站姿凱格爾結束";
          speakText(finishCue);
          lastSpeechTime.current = now;
          lastSpokenFeedback.current = finishCue;
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
      lastPostureFeedbackSpeechTime.current = 0;
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
    
    // 姿勢提醒獨立冷卻，避免一直重複叫
    const POSTURE_FEEDBACK_COOLDOWN_MS = 60000;

    if (now - lastPostureFeedbackSpeechTime.current > POSTURE_FEEDBACK_COOLDOWN_MS) {
      const feedback = getFeedbackForSpeech(resolvedAnalysisResult);
      if (feedback && feedback !== lastSpokenFeedback.current) {
        console.log("語音播報:", {
          primaryPosture: resolvedAnalysisResult.primaryPosture,
          feedback,
        });
        speakText(feedback);
        lastPostureFeedbackSpeechTime.current = now;
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
    resetKegelSession,
  ]);

  return (
    <View>
      <Modal transparent visible={showKegelRepPrompt} animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>站姿凱格爾設定</Text>
            <Text style={styles.modalHint}>請輸入這次要做的次數（1-30），或直接按聽取後說出「5次」、「我要做十二次」</Text>
            <View style={styles.quickRow}>
              {[5, 10, 15].map((count) => (
                <Pressable
                  key={count}
                  style={styles.quickButton}
                  onPress={() => commitKegelRoundCount(count)}
                >
                  <Text style={styles.quickButtonText}>{count}次</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={[
                styles.voiceButton,
                isListeningForKegel ? styles.voiceButtonActive : null,
              ]}
              onPress={isListeningForKegel ? stopListeningForKegelRounds : startListeningForKegelRounds}
            >
              <Text style={styles.voiceButtonText}>
                {isListeningForKegel ? "停止聽取" : "開始聽取"}
              </Text>
            </Pressable>
            {!!speechTranscript && <Text style={styles.transcriptText}>聽到：{speechTranscript}</Text>}
            {!!speechError && <Text style={styles.errorText}>{speechError}</Text>}
            <TextInput
              style={styles.modalInput}
              value={kegelRepInput}
              onChangeText={setKegelRepInput}
              keyboardType="number-pad"
              maxLength={2}
              placeholder="例如 5"
              placeholderTextColor="#7A7A7A"
            />
            <Pressable style={styles.modalButton} onPress={submitKegelRepInput}>
              <Text style={styles.modalButtonText}>開始</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#202020",
    marginBottom: 8,
  },
  modalHint: {
    fontSize: 14,
    color: "#525252",
    marginBottom: 12,
  },
  quickRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  quickButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#C9D1D9",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  quickButtonText: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "600",
  },
  voiceButton: {
    backgroundColor: "#155E75",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  voiceButtonActive: {
    backgroundColor: "#0F172A",
  },
  voiceButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  transcriptText: {
    fontSize: 13,
    color: "#0F766E",
    marginBottom: 8,
  },
  errorText: {
    fontSize: 13,
    color: "#B91C1C",
    marginBottom: 8,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#D0D0D0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
    color: "#1A1A1A",
    marginBottom: 14,
  },
  modalButton: {
    backgroundColor: "#0F766E",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});

export default UnifiedPostureAnalyzer;
