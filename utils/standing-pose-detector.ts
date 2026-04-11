import {
    BodyPartIndex,
    KeyPoint,
    Pose,
    StandingPostureResult,
} from "@/types/types";
import { arePointsVisible, calculateAngle } from "./geometry";

/**
 * 站姿檢測和分析模塊
 * 根據身體關鍵點檢測是否為站姿，並評估站姿質量
 */

/**
 * 檢測是否為站姿的標準：
 * 1. 膝蓋在臀部下方（Y軸位置）
 * 2. 膝蓋和腳踝在視野下方（垂直狀態）
 * 3. 肩膀和髖部相對接近（身體拉直）
 */
export function detectStandingPosture(pose: Pose): StandingPostureResult {
  const MIN_VERTICAL_BODY_RATIO = 0.35;
  const MIN_SHOULDER_TO_HIP_DISTANCE = 0.04;
  const MAX_ALIGNMENT_DEVIATION = 0.085;
  const MAX_SHOULDER_OR_HIP_TILT = 0.045;
  const MAX_KNEE_FLEXION_DEVIATION = 22;
  const MIN_PROPER_POSTURE_SCORE = 0.6;
  const FRONT_FACING_BONUS_WEIGHT = 0.1;

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

  const result: StandingPostureResult = {
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
  };

  // 檢查關鍵點可見度 (降低阈值到 0.3 以提高检测灵敏度)
  const essentialPoints = [
    leftShoulder,
    rightShoulder,
    leftHip,
    rightHip,
    leftKnee,
    rightKnee,
    leftAnkle,
    rightAnkle,
  ];

  if (!arePointsVisible(essentialPoints, 0.3)) {
    result.postureFeedback.push(
      "無法檢測到足夠的身體部位，請確保整個身體在鏡頭範圍內",
    );
    return result;
  }

  // 計算平均位置
  const avgShoulderY = ((leftShoulder?.y || 0) + (rightShoulder?.y || 0)) / 2;
  const avgShoulderX = ((leftShoulder?.x || 0) + (rightShoulder?.x || 0)) / 2;
  const avgHipY = ((leftHip?.y || 0) + (rightHip?.y || 0)) / 2;
  const avgHipX = ((leftHip?.x || 0) + (rightHip?.x || 0)) / 2;
  const avgKneeY = ((leftKnee?.y || 0) + (rightKnee?.y || 0)) / 2;
  const avgAnkleY = ((leftAnkle?.y || 0) + (rightAnkle?.y || 0)) / 2;
  const shoulderWidth = Math.abs((leftShoulder?.x || 0) - (rightShoulder?.x || 0));
  const hipWidth = Math.abs((leftHip?.x || 0) - (rightHip?.x || 0));

  // 檢查站姿特徵：膝蓋在臀部下方
  const kneesBelowHips = avgKneeY > avgHipY;
  const anklesBelowKnees = avgAnkleY > avgKneeY;
  const bodyVertical = kneesBelowHips && anklesBelowKnees;

  // 檢查身體的垂直距離
  const shoulderToAnkleDistance = Math.abs(avgShoulderY - avgAnkleY);
  const shoulderToHipDistance = Math.abs(avgShoulderY - avgHipY);
  const hipToAnkleDistance = Math.abs(avgHipY - avgAnkleY);

  // 🔍 調試日志：輸出站姿檢測的關鍵數據
  console.log("🔍 [站姿檢測診斷]", {
    膝蓋在臀部下: kneesBelowHips,
    腳踝在膝蓋下: anklesBelowKnees,
    身體垂直: bodyVertical,
    肩到踝距離: shoulderToAnkleDistance.toFixed(3),
    肩到髖距離: shoulderToHipDistance.toFixed(3),
    髖到踝距離: hipToAnkleDistance.toFixed(3),
    肩寬: shoulderWidth.toFixed(3),
    髖寬: hipWidth.toFixed(3),
    腿身比例: (hipToAnkleDistance / shoulderToHipDistance).toFixed(3),
    需要比例: `> ${MIN_VERTICAL_BODY_RATIO} (已放寬)`,
  });

  // 站姿判定 (改為更寬鬆的條件以提高檢測率)
  const isStandingRelationship =
    bodyVertical &&
    shoulderToHipDistance > MIN_SHOULDER_TO_HIP_DISTANCE &&
    hipToAnkleDistance > shoulderToHipDistance * MIN_VERTICAL_BODY_RATIO;

  if (!isStandingRelationship) {
    result.postureFeedback.push("未檢測到站姿，請站起來或調整相機角度");
    result.isStanding = false;
    return result;
  }

  result.isStanding = true;
  result.confidence = 0.85;

  // ===== 計算站姿詳細指標 =====

  // 1. 身體對齐度（肩-髖-踝垂直線判定）
  const shoulderHipAlignment = Math.abs(avgShoulderX - avgHipX);
  const hipAnkleAlignment = Math.abs(
    avgHipX - ((leftAnkle?.x || 0) + (rightAnkle?.x || 0)) / 2,
  );
  const totalAlignment = (shoulderHipAlignment + hipAnkleAlignment) / 2;
  result.bodyAlignment = totalAlignment * 57.3;

  // 理想狀態：對齐度接近 0（完全垂直）
  // 評分：完全垂直得 1 分，偏離越大扣分更快
  result.scores.alignmentScore = Math.max(0, 1 - totalAlignment * 5.2);

  if (totalAlignment > MAX_ALIGNMENT_DEVIATION) {
    result.postureFeedback.push("身體有些傾斜，請稍微調整以垂直站立");
  }

  // 2. 肩膀水平度（驗證肩膀是否水平）
  if (leftShoulder && rightShoulder) {
    const shoulderDifference = Math.abs(leftShoulder.y - rightShoulder.y);
    result.shoulderAlignment = shoulderDifference * 57.3; // 轉換為度數的近似值

    result.scores.shoulderScore = Math.max(0, 1 - shoulderDifference * 10);

    if (shoulderDifference > MAX_SHOULDER_OR_HIP_TILT) {
      result.postureFeedback.push("肩膀有些傾斜，請放鬆雙肩並調整成水平");
    }
  }

  // 3. 髖部水平度（骨盆是否左右傾斜）
  if (leftHip && rightHip) {
    const hipDifference = Math.abs(leftHip.y - rightHip.y);
    if (hipDifference > MAX_SHOULDER_OR_HIP_TILT) {
      result.postureFeedback.push("骨盆有些傾斜，請雙腳平均受力並維持髖部水平");
    }
  }

  // 5. 正面朝向鏡頭加分（肩寬與髖寬足夠時，代表更像正面站姿）
  const torsoReference = Math.max(shoulderToAnkleDistance, 0.001);
  const frontFacingRatio = (shoulderWidth + hipWidth) / 2 / torsoReference;
  const frontFacingScore = Math.max(0, Math.min(1, frontFacingRatio / 0.22));

  if (frontFacingScore < 0.35) {
    result.postureFeedback.push("請保持身體正面面向鏡頭，讓肩膀與髖部更容易被辨識");
  }

  // 6. 膝蓋彎曲度
  if (leftKnee && leftHip && leftAnkle) {
    const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
    const rightKneeAngle = calculateAngle(
      rightHip || leftHip,
      rightKnee || leftKnee,
      rightAnkle || leftAnkle,
    );
    result.kneeFlexion = (leftKneeAngle + rightKneeAngle) / 2;

    // 理想站姿：膝蓋應接近 180°（完全伸直） 或 175-185°
    const targetKneeAngle = 180;
    const kneeAngleDiff = Math.abs(result.kneeFlexion - targetKneeAngle);
    result.scores.kneeScore = Math.max(0, 1 - kneeAngleDiff / 45);

    if (Math.abs(result.kneeFlexion - 180) > MAX_KNEE_FLEXION_DEVIATION) {
      result.postureFeedback.push(
        `膝蓋彎曲度不佳（${result.kneeFlexion.toFixed(1)}°），應該接近 180° （膝蓋伸直）`,
      );
    }
  }

  // 7. 身體高度評估
  result.scores.bodyHeightScore = shoulderToAnkleDistance > 0.5 ? 0.9 : 0.6;

  // ===== 綜合評估站姿質量 =====
  const overallScore =
    (result.scores.alignmentScore +
      result.scores.shoulderScore +
      result.scores.kneeScore +
      result.scores.bodyHeightScore +
      frontFacingScore * FRONT_FACING_BONUS_WEIGHT) /
    (4 + FRONT_FACING_BONUS_WEIGHT);

  result.isProperPosture = overallScore >= MIN_PROPER_POSTURE_SCORE;

  if (result.isProperPosture) {
    result.postureFeedback.push("✓ 站姿良好，請保持這個姿勢");
  } else if (overallScore > 0.5) {
    result.postureFeedback.push("⚠ 站姿尚可，但需要改進");
  } else {
    result.postureFeedback.push("✗ 站姿不佳，請按照建議改正");
  }

  return result;
}

/**
 * 獲取站姿評估的簡化文本描述
 */
export function getStandingSummary(result: StandingPostureResult): string {
  if (!result.isStanding) {
    return "未檢測到站姿";
  }

  if (result.isProperPosture) {
    return "站姿正確 ✓";
  } else {
    return "站姿需要改進 ⚠";
  }
}
