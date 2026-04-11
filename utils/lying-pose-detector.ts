import {
    BodyPartIndex,
    KeyPoint,
    LyingPostureResult,
    Pose,
} from "@/types/types";
import {
    arePointsVisible,
    calculateAngle,
    calculateDistance
} from "./geometry";

/**
 * 躺姿檢測和分析模塊
 * 根據身體關鍵點檢測是否為躺姿，並評估躺姿質量
 */

/**
 * 檢測是否為躺姿的標準：
 * 1. 身體整體水平（X 軸變化小）
 * 2. 肩膀和髖部在相同的 Y 軸高度
 * 3. 頭、軀幹、腿部對齐形成一條直線
 */
export function detectLyingPosture(pose: Pose): LyingPostureResult {
  const nose = pose[BodyPartIndex.NOSE] as KeyPoint | undefined;
  const leftShoulder = pose[BodyPartIndex.LEFT_SHOULDER] as
    | KeyPoint
    | undefined;
  const rightShoulder = pose[BodyPartIndex.RIGHT_SHOULDER] as
    | KeyPoint
    | undefined;
  const leftHip = pose[BodyPartIndex.LEFT_HIP] as KeyPoint | undefined;
  const rightHip = pose[BodyPartIndex.RIGHT_HIP] as KeyPoint | undefined;
  const leftKnee = pose[BodyPartIndex.LEFT_KNEE] as KeyPoint | undefined;
  const rightKnee = pose[BodyPartIndex.RIGHT_KNEE] as KeyPoint | undefined;
  const leftAnkle = pose[BodyPartIndex.LEFT_ANKLE] as KeyPoint | undefined;
  const rightAnkle = pose[BodyPartIndex.RIGHT_ANKLE] as KeyPoint | undefined;

  const result: LyingPostureResult = {
    isLying: false,
    confidence: 0,
    bodyAngle: null,
    spineAlignment: null,
    neckAngle: null,
    isProperPosture: false,
    postureFeedback: [],
    scores: {
      alignmentScore: 0,
      spineScore: 0,
      neckScore: 0,
      supportScore: 0,
    },
  };

  // 檢查關鍵點可見度
  const essentialPoints = [
    nose,
    leftShoulder,
    rightShoulder,
    leftHip,
    rightHip,
    leftKnee,
    rightKnee,
    leftAnkle,
    rightAnkle,
  ];

  if (!arePointsVisible(essentialPoints, 0.4)) {
    result.postureFeedback.push("無法檢測到足夠的身體部位，請調整角度");
    return result;
  }

  // 計算平均位置
  const noseY = nose?.y || 0;
  const avgShoulderY = ((leftShoulder?.y || 0) + (rightShoulder?.y || 0)) / 2;
  const avgShoulderZ = ((leftShoulder?.z || 0) + (rightShoulder?.z || 0)) / 2;
  const avgHipY = ((leftHip?.y || 0) + (rightHip?.y || 0)) / 2;
  const avgHipX = ((leftHip?.x || 0) + (rightHip?.x || 0)) / 2;
  const avgShoulderX = ((leftShoulder?.x || 0) + (rightShoulder?.x || 0)) / 2;
  const avgKneeY = ((leftKnee?.y || 0) + (rightKnee?.y || 0)) / 2;
  const avgAnkleY = ((leftAnkle?.y || 0) + (rightAnkle?.y || 0)) / 2;

  // 檢測躺姿特徵
  // 躺姿：肩膀和髖部應該在相似的 Y 座標（水平），且身體長度應該沿著 Z 軸或 X 軸延伸
  const shoulderHipYDifference = Math.abs(avgShoulderY - avgHipY);
  const bodyHorizontal = shoulderHipYDifference < 0.1; // Y 軸差異小於 10%

  // 身體應該是水平的或略微傾斜
  const bodyLength = calculateDistance(
    { x: avgShoulderX, y: avgShoulderY, z: avgShoulderZ, visibility: 1 },
    { x: avgHipX, y: avgHipY, z: 0, visibility: 1 },
  );
  const kneeDistance = calculateDistance(
    { x: avgHipX, y: avgHipY, z: 0, visibility: 1 },
    { x: leftKnee?.x || 0, y: avgKneeY, z: 0, visibility: 1 },
  );
  const ankleDistance = calculateDistance(
    { x: leftAnkle?.x || 0, y: avgAnkleY, z: 0, visibility: 1 },
    { x: rightAnkle?.x || 0, y: avgAnkleY, z: 0, visibility: 1 },
  );

  // 躺姿判定
  const isLyingRelationship = bodyHorizontal && bodyLength > 0.15;

  if (!isLyingRelationship) {
    result.postureFeedback.push("未檢測到躺姿，請躺下");
    result.isLying = false;
    return result;
  }

  result.isLying = true;
  result.confidence = 0.8;

  // ===== 計算躺姿詳細指標 =====

  // 1. 身體對齐度
  const topToBottomAlignment = shoulderHipYDifference;
  result.scores.alignmentScore = Math.max(0, 1 - topToBottomAlignment * 10);

  if (topToBottomAlignment > 0.08) {
    result.postureFeedback.push("身體不夠水平，請調整身體位置");
  }

  // 2. 脊椎對齋（頭-肩-髖-膝-踝的垂直順序）
  if (nose && leftShoulder && leftHip && leftKnee && leftAnkle) {
    const neckAngleValue = calculateAngle(nose, leftShoulder, leftHip);
    result.neckAngle = neckAngleValue;

    // 躺姿時頸部應該接近 180°（直線）
    const neckAlignmentScore = Math.max(
      0,
      1 - Math.abs(neckAngleValue - 180) / 180,
    );
    result.scores.neckScore = neckAlignmentScore;

    if (Math.abs(neckAngleValue - 180) > 20) {
      result.postureFeedback.push("頸部角度不佳，請調整頸部位置以保持直線");
    }
  }

  // 3. 脊椎曲線評估
  if (leftShoulder && leftHip && leftKnee) {
    const spineAngle = calculateAngle(leftShoulder, leftHip, leftKnee);
    result.spineAlignment = spineAngle;

    // 躺姿時脊椎應該接近 180°
    const spineAlignmentScore = Math.max(
      0,
      1 - Math.abs(spineAngle - 180) / 180,
    );
    result.scores.spineScore = spineAlignmentScore;

    if (Math.abs(spineAngle - 180) > 25) {
      result.postureFeedback.push("脊椎曲線過大，請拉直身體");
    }
  }

  // 4. 支撐度評估（檢查身體各部分是否在同一平線）
  const yVariance =
    Math.max(noseY, avgShoulderY, avgHipY, avgKneeY, avgAnkleY) -
    Math.min(noseY, avgShoulderY, avgHipY, avgKneeY, avgAnkleY);

  result.scores.supportScore = Math.max(0, 1 - yVariance * 5);

  if (yVariance > 0.1) {
    result.postureFeedback.push("身體支撐不均勻，請確保背部整個接觸支撐面");
  }

  // ===== 綜合評估躺姿質量 =====
  const overallScore =
    (result.scores.alignmentScore +
      result.scores.spineScore +
      result.scores.neckScore +
      result.scores.supportScore) /
    4;

  result.isProperPosture = overallScore > 0.75;

  if (result.isProperPosture) {
    result.postureFeedback.push("✓ 躺姿良好，請保持這個姿勢");
  } else if (overallScore > 0.5) {
    result.postureFeedback.push("⚠ 躺姿尚可，但需要改進");
  } else {
    result.postureFeedback.push("✗ 躺姿不佳，請按照建議改正");
  }

  return result;
}

/**
 * 獲取躺姿評估的簡化文本描述
 */
export function getLyingSummary(result: LyingPostureResult): string {
  if (!result.isLying) {
    return "未檢測到躺姿";
  }

  if (result.isProperPosture) {
    return "躺姿正確 ✓";
  } else {
    return "躺姿需要改進 ⚠";
  }
}
