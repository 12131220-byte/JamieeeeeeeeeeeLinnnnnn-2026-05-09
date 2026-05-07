import {
    Pose,
    PostureType,
    UnifiedPostureResult
} from "@/types/types";
import { detectLyingPosture } from "./lying-pose-detector";

/**
 * 統一的姿勢分析器
 * 同時檢測坐、站、躺三種姿勢，並判定最可能的姿勢類型
 */
export function analyzePosture(pose: Pose): UnifiedPostureResult {
  const lyingResult = detectLyingPosture(pose);

  const lyingScore = lyingResult.isLying ? lyingResult.confidence : 0;

  // 決定最可能的姿勢類型
  let primaryPosture = PostureType.UNKNOWN;
  let maxScore = 0;

  if (lyingScore > maxScore) {
    primaryPosture = PostureType.LYING;
    maxScore = lyingScore;
  }

  // 計算綜合評分（基於最可能的姿勢）
  const overallScore = primaryPosture === PostureType.LYING ? lyingScore : 0;

  return {
    postureType: primaryPosture,
    detectedPostures: {
      sitting: {
        isSitting: false,
        confidence: 0,
        backAngle: null,
        kneeAngle: null,
        hipAngle: null,
        isProperPosture: false,
        postureFeedback: [],
        scores: {
          backAngleScore: 0,
          kneeAngleScore: 0,
          hipPositionScore: 0,
          feetPositionScore: 0,
        },
      },
      standing: {
        isStanding: false,
        confidence: 0,
        bodyAlignment: null,
        shoulderAlignment: null,
        kneeFlexion: null,
        isProperPosture: false,
        postureFeedback: [],
        scores: {
          alignmentScore: 0,
          shoulderScore: 0,
          kneeScore: 0,
          bodyHeightScore: 0,
        },
      },
      lying: lyingResult,
    },
    primaryPosture,
    overallScore,
  };
}

/**
 * 獲取統一的姿勢描述
 */
export function getPostureDescription(result: UnifiedPostureResult): string {
  switch (result.primaryPosture) {
    case PostureType.LYING:
      return result.detectedPostures.lying?.isProperPosture
        ? "躺姿正確 ✓"
        : "躺姿需要改進 ⚠";
    default:
      return "未檢測到姿勢";
  }
}

/**
 * 獲取統一的反饋信息
 */
export function getUnifiedFeedback(result: UnifiedPostureResult): string[] {
  const feedback: string[] = [];

  const detectedCount = [result.detectedPostures.lying?.isLying].filter(Boolean).length;

  if (detectedCount === 0) {
    return ["無法檢測到清晰的姿勢，請調整位置或光線"];
  }

  // 添加主要姿勢的反饋
  switch (result.primaryPosture) {
    case PostureType.LYING:
      feedback.push(...(result.detectedPostures.lying?.postureFeedback || []));
      break;
  }

  return feedback;
}
