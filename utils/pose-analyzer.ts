import {
    Pose,
    PostureType,
    UnifiedPostureResult
} from "@/types/types";
import { detectLyingPosture } from "./lying-pose-detector";
import { detectSittingPosture } from "./sitting-pose-detector";
import { detectStandingPosture } from "./standing-pose-detector";

/**
 * 統一的姿勢分析器
 * 同時檢測坐、站、躺三種姿勢，並判定最可能的姿勢類型
 */
export function analyzePosture(pose: Pose): UnifiedPostureResult {
  // 並行執行三種姿勢檢測
  const sittingResult = detectSittingPosture(pose);
  const standingResult = detectStandingPosture(pose);
  const lyingResult = detectLyingPosture(pose);

  // 計算每種姿勢的信心度分數
  const sittingScore = sittingResult.isSitting ? sittingResult.confidence : 0;
  const standingScore = standingResult.isStanding
    ? standingResult.confidence
    : 0;
  const lyingScore = lyingResult.isLying ? lyingResult.confidence : 0;

  const hasSittingAndStanding =
    sittingResult.isSitting && standingResult.isStanding;

  // 坐姿與站姿同時命中且分數相同時，使用膝蓋角度做判斷：
  // 站姿膝蓋通常接近伸直（~180），坐姿膝蓋通常明顯彎曲（~90）。
  if (hasSittingAndStanding && Math.abs(sittingScore - standingScore) < 0.001) {
    if (standingResult.kneeFlexion !== null && standingResult.kneeFlexion >= 150) {
      return {
        postureType: PostureType.STANDING,
        detectedPostures: {
          sitting: sittingResult,
          standing: standingResult,
          lying: lyingResult,
        },
        primaryPosture: PostureType.STANDING,
        overallScore: standingScore,
      };
    }

    if (sittingResult.kneeAngle !== null && sittingResult.kneeAngle <= 130) {
      return {
        postureType: PostureType.SITTING,
        detectedPostures: {
          sitting: sittingResult,
          standing: standingResult,
          lying: lyingResult,
        },
        primaryPosture: PostureType.SITTING,
        overallScore: sittingScore,
      };
    }

    // 無法明確分辨時，優先站姿，避免站著時誤播坐姿語音。
    return {
      postureType: PostureType.STANDING,
      detectedPostures: {
        sitting: sittingResult,
        standing: standingResult,
        lying: lyingResult,
      },
      primaryPosture: PostureType.STANDING,
      overallScore: standingScore,
    };
  }

  // 決定最可能的姿勢類型
  let primaryPosture = PostureType.UNKNOWN;
  let maxScore = 0;

  if (sittingScore > maxScore) {
    primaryPosture = PostureType.SITTING;
    maxScore = sittingScore;
  }
  if (standingScore > maxScore) {
    primaryPosture = PostureType.STANDING;
    maxScore = standingScore;
  }
  if (lyingScore > maxScore) {
    primaryPosture = PostureType.LYING;
    maxScore = lyingScore;
  }

  // 計算綜合評分（基於最可能的姿勢）
  const overallScore =
    primaryPosture === PostureType.SITTING
      ? sittingScore
      : primaryPosture === PostureType.STANDING
        ? standingScore
        : primaryPosture === PostureType.LYING
          ? lyingScore
          : 0;

  return {
    postureType: primaryPosture,
    detectedPostures: {
      sitting: sittingResult,
      standing: standingResult,
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
    case PostureType.SITTING:
      return result.detectedPostures.sitting?.isProperPosture
        ? "坐姿正確 ✓"
        : "坐姿需要改進 ⚠";
    case PostureType.STANDING:
      return result.detectedPostures.standing?.isProperPosture
        ? "站姿正確 ✓"
        : "站姿需要改進 ⚠";
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

  const detectedCount = [
    result.detectedPostures.sitting?.isSitting,
    result.detectedPostures.standing?.isStanding,
    result.detectedPostures.lying?.isLying,
  ].filter(Boolean).length;

  if (detectedCount === 0) {
    return ["無法檢測到清晰的姿勢，請調整位置或光線"];
  }

  // 添加主要姿勢的反饋
  switch (result.primaryPosture) {
    case PostureType.SITTING:
      feedback.push(
        ...(result.detectedPostures.sitting?.postureFeedback || []),
      );
      break;
    case PostureType.STANDING:
      feedback.push(
        ...(result.detectedPostures.standing?.postureFeedback || []),
      );
      break;
    case PostureType.LYING:
      feedback.push(...(result.detectedPostures.lying?.postureFeedback || []));
      break;
  }

  // 如果還檢測到其他姿勢類型，添加警告
  if (detectedCount > 1) {
    const detectedPostures: string[] = [];
    if (result.detectedPostures.sitting?.isSitting)
      detectedPostures.push("坐姿");
    if (result.detectedPostures.standing?.isStanding)
      detectedPostures.push("站姿");
    if (result.detectedPostures.lying?.isLying) detectedPostures.push("躺姿");

    if (detectedPostures.length > 1) {
      feedback.push(
        `同時檢測到多種姿勢 (${detectedPostures.join("、")})，確定目前的主要姿勢為「${result.primaryPosture}」`,
      );
    }
  }

  return feedback;
}
