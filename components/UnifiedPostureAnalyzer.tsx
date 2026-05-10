import { BodyPartIndex, Pose, PostureType, UnifiedPostureResult } from "@/types/types";
import { analyzePosture } from "@/utils/pose-analyzer";
import Constants from "expo-constants";
import * as Speech from "expo-speech";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { KegelExerciseConfig } from "./KegelExerciseSelector";

interface UnifiedPostureAnalyzerProps {
  pose: Pose | null;
  analysisResult?: UnifiedPostureResult | null;
  onAnalysisComplete?: (result: UnifiedPostureResult) => void;
  exerciseConfig?: KegelExerciseConfig | null;
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
  exerciseConfig = null,
}) => {
  const [result, setResult] = useState<UnifiedPostureResult | null>(null);
  const [showKegelRepPrompt, setShowKegelRepPrompt] = useState<boolean>(false);
  const [selectedKegelPosture, setSelectedKegelPosture] = useState<PostureType | null>(null);
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
  
  // 站姿凱格爾相關
  const standingDetectedSince = useRef<number | null>(null);
  const hasStartedStandingKegel = useRef<boolean>(false);
  
  // 坐姿凱格爾相關
  const sittingDetectedSince = useRef<number | null>(null);
  const hasStartedSittingKegel = useRef<boolean>(false);
  
  // 共用凱格爾狀態
  const targetKegelRounds = useRef<number>(0);
  const completedKegelRounds = useRef<number>(0);
  const kegelStage = useRef<
    "idle" | "instruction" | "awaiting_reps" | "tiptoe_detect" | "tiptoe_countdown" | "leg_stretch_detect" | "leg_countdown" | "done"
  >("idle");
  const nextKegelCueAt = useRef<number>(0);
  
  // 站姿凱格爾 - 腳尖相關
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
  
  // 坐姿凱格爾 - 腿部伸直相關
  const legStretchStableCount = useRef<number>(0);
  const lastLegStretchReminderAt = useRef<number>(0);
  const LEG_STRETCH_STABLE_THRESHOLD = 4;
  const legCountdownRemaining = useRef<number>(0);
  const legCountdownNextTickAt = useRef<number>(0);
  const ankleLiftBaseline = useRef<number | null>(null); // 記錄腳踝進入檢測時的基準高度
  
  // 坐姿凱格爾 - 夾臀基線與檢測
  const squeezeHipBaseline = useRef<number | null>(null);
  const HIP_SQUEEZE_THRESHOLD = 0.03; // 基線減少超過此值視為夾緊臀部
  const lastGluteReminderAt = useRef<number>(0);
  const configuredKegelSets = exerciseConfig?.sets ?? 1;
  const configuredKegelReps = exerciseConfig?.reps ?? 5;
  const configuredKegelRounds = configuredKegelSets * configuredKegelReps;
  const configuredKegelPosture = exerciseConfig?.type ?? null;
  const configuredKegelRest = exerciseConfig?.restBetweenSets ?? 0;

  // 組內與組間狀態
  const currentKegelSet = useRef<number>(1);
  const roundsInCurrentSet = useRef<number>(0);
  const isInSetRest = useRef<boolean>(false);
  const setRestTimer = useRef<NodeJS.Timeout | null>(null);
  const restInterval = useRef<NodeJS.Timeout | null>(null);
  const [restSecondsLeftState, setRestSecondsLeftState] = useState<number>(0);

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

  const commitStandingKegelRoundCount = useCallback(
    (rounds: number) => {
      const safeRounds = Math.min(Math.max(rounds, 1), 30);

      hasStartedStandingKegel.current = true;
      hasStartedSittingKegel.current = false;
      targetKegelRounds.current = safeRounds;
      completedKegelRounds.current = 0;
      // 初始化組別追蹤
      currentKegelSet.current = 1;
      roundsInCurrentSet.current = 0;
      isInSetRest.current = false;
      if (setRestTimer.current) {
        clearTimeout(setRestTimer.current);
        setRestTimer.current = null;
      }
      tiptoeStableCount.current = 0;
      lastTiptoeReminderAt.current = 0;
      tiptoeBaselineCaptured.current = false;
      tiptoeBaselineLeftLift.current = 0;
      tiptoeBaselineRightLift.current = 0;
      awaitingTiptoeBaselineCapture.current = true;
      setSelectedKegelPosture(PostureType.STANDING);

      setShowKegelRepPrompt(false);
      setIsListeningForKegel(false);
      setSpeechError("");
      setSpeechTranscript("");
      kegelStage.current = "tiptoe_detect";

      const now = Date.now();
      nextKegelCueAt.current = now + 300;

      const startMessage = `收到，開始進行${configuredKegelSets}組，每組${configuredKegelReps}次，共${safeRounds}次，請夾緊臀部並墊起腳尖5秒`;
      speakText(startMessage);
      lastSpeechTime.current = now;
      lastSpokenFeedback.current = startMessage;
    },
    [speakText],
  );

  const commitSittingKegelRoundCount = useCallback(
    (rounds: number) => {
      const safeRounds = Math.min(Math.max(rounds, 1), 30);

      hasStartedStandingKegel.current = false;
      hasStartedSittingKegel.current = true;
      targetKegelRounds.current = safeRounds;
      completedKegelRounds.current = 0;
      // 初始化組別追蹤
      currentKegelSet.current = 1;
      roundsInCurrentSet.current = 0;
      isInSetRest.current = false;
      if (setRestTimer.current) {
        clearTimeout(setRestTimer.current);
        setRestTimer.current = null;
      }
      legStretchStableCount.current = 0;
      lastLegStretchReminderAt.current = 0;

      setShowKegelRepPrompt(false);
      setSelectedKegelPosture(PostureType.SITTING);
      setIsListeningForKegel(false);
      setSpeechError("");
      setSpeechTranscript("");
      kegelStage.current = "leg_stretch_detect";

      const now = Date.now();
      nextKegelCueAt.current = now + 300;

      if (pose) {
        const leftAnkle = pose[BodyPartIndex.LEFT_ANKLE];
        const rightAnkle = pose[BodyPartIndex.RIGHT_ANKLE];
        if (
          leftAnkle &&
          rightAnkle &&
          leftAnkle.visibility >= 0.5 &&
          rightAnkle.visibility >= 0.5
        ) {
          ankleLiftBaseline.current = (leftAnkle.y + rightAnkle.y) / 2;
          console.log("[Kegel] captured ankleLiftBaseline=", ankleLiftBaseline.current);
        } else {
          ankleLiftBaseline.current = null;
        }
      } else {
        ankleLiftBaseline.current = null;
      }

      const startMessage = `收到，開始進行${configuredKegelSets}組，每組${configuredKegelReps}次，共${safeRounds}次坐姿凱格爾，現在升直雙腳`;
      speakText(startMessage);
      lastSpeechTime.current = now;
      lastSpokenFeedback.current = startMessage;
    },
    [pose, speakText],
  );

  const commitKegelRoundCount = useCallback(
    (rounds: number, posture: PostureType) => {
      if (posture === PostureType.STANDING) {
        commitStandingKegelRoundCount(rounds);
      } else if (posture === PostureType.SITTING) {
        commitSittingKegelRoundCount(rounds);
      }
    },
    [commitStandingKegelRoundCount, commitSittingKegelRoundCount],
  );

  const submitKegelRepInput = useCallback(() => {
    commitKegelRoundCount(configuredKegelRounds, selectedKegelPosture ?? configuredKegelPosture ?? PostureType.STANDING);
  }, [commitKegelRoundCount, configuredKegelPosture, configuredKegelRounds, selectedKegelPosture]);

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

        const currentPosture = hasStartedStandingKegel.current
          ? PostureType.STANDING
          : hasStartedSittingKegel.current
          ? PostureType.SITTING
          : PostureType.UNKNOWN;

        commitKegelRoundCount(extractedRounds, currentPosture);
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

  const detectLegStretchFromPose = useCallback(
    (inputPose: Pose | null): boolean => {
      if (!inputPose || ankleLiftBaseline.current === null) return false;

      const leftAnkle = inputPose[BodyPartIndex.LEFT_ANKLE];
      const rightAnkle = inputPose[BodyPartIndex.RIGHT_ANKLE];
      if (!leftAnkle || !rightAnkle || leftAnkle.visibility < 0.5 || rightAnkle.visibility < 0.5) {
        return false;
      }

      // 計算當前腳踝高度（Y值）
      const avgCurrentAnkleY = (leftAnkle.y + rightAnkle.y) / 2;
      // 計算腳踝相對於基準的上升量（Y軸變小表示向上）
      const ankleRiseFromBaseline = ankleLiftBaseline.current - avgCurrentAnkleY;
      const ANKLE_RISE_THRESHOLD = 0.02; // 腳踝需上升 2% 的屏幕高度

      console.log(
        "[SittingLegStretch] baseline=",
        ankleLiftBaseline.current.toFixed(4),
        "current=",
        avgCurrentAnkleY.toFixed(4),
        "rise=",
        ankleRiseFromBaseline.toFixed(4),
      );

      return ankleRiseFromBaseline > ANKLE_RISE_THRESHOLD;
    },
    [],
  );

  const detectGluteSqueezeFromPose = useCallback((inputPose: Pose | null): boolean => {
    if (!inputPose) return false;
    if (squeezeHipBaseline.current === null) return false;

    const leftHip = inputPose[BodyPartIndex.LEFT_HIP];
    const rightHip = inputPose[BodyPartIndex.RIGHT_HIP];
    if (!leftHip || !rightHip || leftHip.visibility < 0.5 || rightHip.visibility < 0.5) {
      return false;
    }

    const currentHipDistance = Math.abs(leftHip.x - rightHip.x);
    const delta = squeezeHipBaseline.current - currentHipDistance;

    // debug log
    console.log("[GluteDetect] baseline=", squeezeHipBaseline.current, "current=", currentHipDistance, "delta=", delta);

    return delta > HIP_SQUEEZE_THRESHOLD;
  }, []);

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
            return "請分配雙腳中心，站穩腳步";
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
    hasStartedSittingKegel.current = false;
    kegelStage.current = "idle";
    standingDetectedSince.current = null;
    sittingDetectedSince.current = null;
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
    legStretchStableCount.current = 0;
    lastLegStretchReminderAt.current = 0;
    legCountdownRemaining.current = 0;
    legCountdownNextTickAt.current = 0;
    setShowKegelRepPrompt(false);
    setSelectedKegelPosture(null);
    setIsListeningForKegel(false);
    setSpeechTranscript("");
    setSpeechError("");
    // reset set/round tracking
    currentKegelSet.current = 1;
    roundsInCurrentSet.current = 0;
    isInSetRest.current = false;
    if (setRestTimer.current) {
      clearTimeout(setRestTimer.current);
      setRestTimer.current = null;
    }
    if (restInterval.current) {
      clearInterval(restInterval.current);
      restInterval.current = null;
    }
    setRestSecondsLeftState(0);
  }, []);

  const prepareNextStandingTiptoeRound = useCallback((now: number) => {
    kegelStage.current = "tiptoe_detect";
    nextKegelCueAt.current = now + 1200;
    tiptoeStableCount.current = 0;
    // 不重置 lastTiptoeReminderAt，保持已設定的值以防止重複播放
    tiptoeBaselineCaptured.current = false;
    tiptoeBaselineLeftLift.current = 0;
    tiptoeBaselineRightLift.current = 0;
    awaitingTiptoeBaselineCapture.current = true;
  }, []);

  const prepareNextSittingLegRound = useCallback((now: number) => {
    kegelStage.current = "leg_stretch_detect";
    nextKegelCueAt.current = now + 300;
    legStretchStableCount.current = 0;
    // 不重置 lastLegStretchReminderAt，保持已設定的值以防止重複播放
  }, [pose]);

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

    // 如果目前正在組間休息，跳過後續的檢測與語音流程，避免重複進入休息邏輯或重置計時器
    if (isInSetRest.current) {
      return;
    }

    const isStandingNow =
      resolvedAnalysisResult.primaryPosture === PostureType.STANDING &&
      !!resolvedAnalysisResult.detectedPostures.standing?.isStanding;

    const isSittingNow =
      resolvedAnalysisResult.primaryPosture === PostureType.SITTING &&
      !!resolvedAnalysisResult.detectedPostures.sitting?.isSitting;

    if (!hasStartedStandingKegel.current && !hasStartedSittingKegel.current) {
      if (isStandingNow) {
        if (standingDetectedSince.current === null) {
          standingDetectedSince.current = now;
        }

        if (now - standingDetectedSince.current >= 2000 && !isSpeaking.current) {
          commitStandingKegelRoundCount(configuredKegelRounds);
          return;
        }
      } else if (isSittingNow) {
        if (sittingDetectedSince.current === null) {
          sittingDetectedSince.current = now;
        }

        if (now - sittingDetectedSince.current >= 2000 && !isSpeaking.current) {
          commitSittingKegelRoundCount(configuredKegelRounds);
          return;
        }
      } else {
        standingDetectedSince.current = null;
        sittingDetectedSince.current = null;
      }
    }

    if (hasStartedStandingKegel.current) {
      if (kegelStage.current === "done") {
        if (!isSpeaking.current) {
          resetKegelSession();
        }
        return;
      }

      if (kegelStage.current === "tiptoe_detect") {
        if (
          !isSpeaking.current &&
          now >= nextKegelCueAt.current &&
          (now - (lastTiptoeReminderAt.current || 0) > 1000)
        ) {
          const repInSet = roundsInCurrentSet.current + 1;
          const prompt = `第${currentKegelSet.current}組第${repInSet}次，夾緊臀部並墊起腳尖5秒`;
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
          speakText(String(seconds));
          lastSpeechTime.current = now;
          lastSpokenFeedback.current = seconds.toString();
          tiptoeCountdownRemaining.current -= 1;
          tiptoeCountdownNextTickAt.current = now + 1000;
          return;
        }

        if (tiptoeCountdownRemaining.current === 0 && !isSpeaking.current) {
          completedKegelRounds.current += 1;
          roundsInCurrentSet.current += 1;
          const remainingTotal = targetKegelRounds.current - completedKegelRounds.current;

          // 如果完成了本組的次數
          if (roundsInCurrentSet.current >= configuredKegelReps) {
            const finishedSet = currentKegelSet.current;
            // 如果還有下一組
            if (finishedSet < configuredKegelSets) {
              const nextSetNum = finishedSet + 1;
              // 進入組間休息
              if (configuredKegelRest > 0) {
                isInSetRest.current = true;
                const restMsg = `第${finishedSet}組完成，開始休息${configuredKegelRest}秒，請放鬆肌肉，稍後進入第${nextSetNum}組`;
                speakText(restMsg);
                lastSpeechTime.current = now;
                lastSpokenFeedback.current = restMsg;
                // 設定休息計時器，休息結束後開始下一組
                if (setRestTimer.current) {
                  clearTimeout(setRestTimer.current);
                  setRestTimer.current = null;
                }
                setRestTimer.current = setTimeout(() => {
                  // 結束休息
                  isInSetRest.current = false;
                  // 清除 interval
                  if (restInterval.current) {
                    clearInterval(restInterval.current);
                    restInterval.current = null;
                  }
                  setRestSecondsLeftState(0);
                  currentKegelSet.current = nextSetNum;
                  roundsInCurrentSet.current = 0;
                  const resumeMsg = `休息結束，第${nextSetNum}組開始，請夾緊臀部並墊起腳尖5秒`;
                  speakText(resumeMsg);
                  // lastTiptoeReminderAt.current 已在 setTimeout 中設定，prepareNextStandingTiptoeRound 不會重置
                  prepareNextStandingTiptoeRound(Date.now());
                }, configuredKegelRest * 1000) as unknown as NodeJS.Timeout;
                // 同步畫面倒數與最後 10 秒語音倒數
                setRestSecondsLeftState(configuredKegelRest);
                if (restInterval.current) {
                  clearInterval(restInterval.current);
                  restInterval.current = null;
                }
                let readyAlertSent = false;
                restInterval.current = setInterval(() => {
                  setRestSecondsLeftState((prev) => {
                    const next = prev - 1;
                    if (next <= 0) {
                      if (restInterval.current) {
                        clearInterval(restInterval.current);
                        restInterval.current = null;
                      }
                      return 0;
                    }
                    // 在剩餘 3 秒時播放一次「準備好了嗎」提醒
                    if (next === 3 && !readyAlertSent && !isSpeaking.current) {
                      speakText("準備好了嗎，即將開始");
                      readyAlertSent = true;
                    }
                    return next;
                  });
                }, 1000) as unknown as NodeJS.Timeout;
                return;
              } else {
                // 無休息，直接進入下一組
                currentKegelSet.current = nextSetNum;
                roundsInCurrentSet.current = 0;
                const nextMsg = `第${finishedSet}組完成，直接進入第${nextSetNum}組，請夾緊臀部並墊起腳尖5秒`;
                speakText(nextMsg);
                lastSpeechTime.current = now;
                lastSpokenFeedback.current = nextMsg;
                prepareNextStandingTiptoeRound(now);
                return;
              }
            }

            // 最後一組完成
            const finishCue = "全部完成，今天的站姿凱格爾結束";
            speakText(finishCue);
            lastSpeechTime.current = now;
            lastSpokenFeedback.current = finishCue;
            kegelStage.current = "done";
            return;
          }

          // 組內未滿，繼續下一次（以組與組內剩餘次數計算總剩餘）
          const totalRemaining =
            (configuredKegelSets - currentKegelSet.current) * configuredKegelReps +
            (configuredKegelReps - roundsInCurrentSet.current);
          const nextRoundCue = `本次完成，還有${totalRemaining}次`;
          speakText(nextRoundCue);
          lastSpeechTime.current = now;
          lastSpokenFeedback.current = nextRoundCue;
          prepareNextStandingTiptoeRound(now);
          return;
        }
      }

      return;
    }

    if (hasStartedSittingKegel.current) {
      if (kegelStage.current === "done") {
        if (!isSpeaking.current) {
          resetKegelSession();
        }
        return;
      }

      if (kegelStage.current === "leg_stretch_detect") {
        if (
          !isSpeaking.current &&
          now >= nextKegelCueAt.current &&
          (now - (lastLegStretchReminderAt.current || 0) > 1000)
        ) {
          const stretchPrompt = "現在升直雙腳";
          speakText(stretchPrompt);
          lastSpeechTime.current = now;
          lastSpokenFeedback.current = stretchPrompt;
          lastLegStretchReminderAt.current = now;
          kegelStage.current = "leg_stretch_detect";
          return;
        }

        const isLegStretched = detectLegStretchFromPose(pose);

        // 一旦偵測到雙腳升直（膝蓋以下往上抬），立即開始 5 秒倒數
        if (isLegStretched && !isSpeaking.current) {
          kegelStage.current = "leg_countdown";
          legCountdownRemaining.current = 5;
          legCountdownNextTickAt.current = now;
          return;
        }
      }

      if (kegelStage.current === "leg_countdown") {
        if (
          legCountdownRemaining.current > 0 &&
          !isSpeaking.current &&
          now >= legCountdownNextTickAt.current
        ) {
          const seconds = legCountdownRemaining.current;
          speakText(String(seconds));
          lastSpeechTime.current = now;
          lastSpokenFeedback.current = seconds.toString();
          legCountdownRemaining.current -= 1;
          legCountdownNextTickAt.current = now + 1000;
          return;
        }

        if (legCountdownRemaining.current === 0 && !isSpeaking.current) {
          completedKegelRounds.current += 1;
          roundsInCurrentSet.current += 1;
          const remainingTotal = targetKegelRounds.current - completedKegelRounds.current;

          if (roundsInCurrentSet.current >= configuredKegelReps) {
            const finishedSet = currentKegelSet.current;
            if (finishedSet < configuredKegelSets) {
              const nextSetNum = finishedSet + 1;
              if (configuredKegelRest > 0) {
                isInSetRest.current = true;
                const restMsg = `第${finishedSet}組完成，開始休息${configuredKegelRest}秒，請放鬆肌肉，稍後進入第${nextSetNum}組`;
                speakText(restMsg);
                lastSpeechTime.current = now;
                lastSpokenFeedback.current = restMsg;
                if (setRestTimer.current) {
                  clearTimeout(setRestTimer.current);
                  setRestTimer.current = null;
                }
                setRestTimer.current = setTimeout(() => {
                  // 結束休息
                  isInSetRest.current = false;
                  if (restInterval.current) {
                    clearInterval(restInterval.current);
                    restInterval.current = null;
                  }
                  setRestSecondsLeftState(0);
                  currentKegelSet.current = nextSetNum;
                  roundsInCurrentSet.current = 0;
                  const resumeMsg = `休息結束，第${nextSetNum}組開始，現在升直雙腳`;
                  speakText(resumeMsg);
                  // lastLegStretchReminderAt.current 已在 setTimeout 中設定，prepareNextSittingLegRound 不會重置
                  prepareNextSittingLegRound(Date.now());
                }, configuredKegelRest * 1000) as unknown as NodeJS.Timeout;
                // 同步畫面倒數與最後 10 秒語音倒數
                setRestSecondsLeftState(configuredKegelRest);
                if (restInterval.current) {
                  clearInterval(restInterval.current);
                  restInterval.current = null;
                }
                let readyAlertSent = false;
                restInterval.current = setInterval(() => {
                  setRestSecondsLeftState((prev) => {
                    const next = prev - 1;
                    if (next <= 0) {
                      if (restInterval.current) {
                        clearInterval(restInterval.current);
                        restInterval.current = null;
                      }
                      return 0;
                    }
                    // 在剩餘 3 秒時播放一次「準備好了嗎」提醒
                    if (next === 3 && !readyAlertSent && !isSpeaking.current) {
                      speakText("10秒後開始下一組凱格爾運動");
                      readyAlertSent = true;
                    }
                    return next;
                  });
                }, 1000) as unknown as NodeJS.Timeout;
                return;
              } else {
                currentKegelSet.current = nextSetNum;
                roundsInCurrentSet.current = 0;
                const nextMsg = `第${finishedSet}組完成，直接進入第${nextSetNum}組`;
                speakText(nextMsg);
                lastSpeechTime.current = now;
                lastSpokenFeedback.current = nextMsg;
                prepareNextSittingLegRound(now);
                return;
              }
            }

            const finishCue = "全部完成，今天的坐姿凱格爾結束";
            speakText(finishCue);
            lastSpeechTime.current = now;
            lastSpokenFeedback.current = finishCue;
            kegelStage.current = "done";
            return;
          }

          const totalRemaining =
            (configuredKegelSets - currentKegelSet.current) * configuredKegelReps +
            (configuredKegelReps - roundsInCurrentSet.current);
          const nextRoundCue = `本次完成，還有${totalRemaining}次`;
          speakText(nextRoundCue);
          lastSpeechTime.current = now;
          lastSpokenFeedback.current = nextRoundCue;
          prepareNextSittingLegRound(now);
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
    detectLegStretchFromPose,
    getHeelLiftFromPose,
    resetKegelSession,
    prepareNextStandingTiptoeRound,
    prepareNextSittingLegRound,
    showKegelRepPrompt,
  ]);

  // 畫面覆蓋：若正在組間休息則在中央顯示剩餘秒數（不阻擋觸控）
  if (restSecondsLeftState > 0) {
    return (
      <View style={styles.restContainer} pointerEvents="none">
        <View style={styles.restOverlay}>
          <Text style={styles.restOverlayText}>{restSecondsLeftState}</Text>
          <Text style={styles.restOverlayHint}>休息中</Text>
        </View>
      </View>
    );
  }

  return <View />;
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
  typeRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  typeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D6DCE5",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: "#F8FAFC",
    gap: 6,
  },
  typeButtonActive: {
    borderColor: "#0F766E",
    backgroundColor: "#E6FFFB",
  },
  typeButtonTitle: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "700",
  },
  typeButtonSubtitle: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "500",
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
  restContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  restOverlay: {
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingVertical: 80,
    paddingHorizontal: 100,
    borderRadius: 24,
    alignItems: "center",
    minWidth: 320,
    minHeight: 320,
  },
  restOverlayText: {
    fontSize: 160,
    color: "#FFFFFF",
    fontWeight: "700",
    marginBottom: 24,
    width: 220,
    textAlign: "center",
  },
  restOverlayHint: {
    fontSize: 36,
    color: "#E5E7EB",
    fontWeight: "600",
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
  modalButtonDisabled: {
    backgroundColor: "#94A3B8",
  },
  modalButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  modalActionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#C9D1D9",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  secondaryButtonText: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "700",
  },
});

export default UnifiedPostureAnalyzer;