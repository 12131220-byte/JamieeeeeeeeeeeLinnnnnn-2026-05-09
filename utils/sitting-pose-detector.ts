import {
    BodyPartIndex,
    KeyPoint,
    Pose,
    SittingPostureResult,
} from "@/types/types";
import {
    arePointsVisible,
    calculateAngle
} from "./geometry";

/**
 * 坐姿檢測和分析模塊
 * 根據身體關鍵點檢測是否為坐姿，並評估坐姿質量
 */

/**
 * 檢測是否為坐姿的標準：
 * 1. 臀部在膝蓋上方（Y軸位置）
 * 2. 臀部到膝蓋的距離小於臀部到肩膀的距離
 * 3. 膝蓋彎曲角度在 70-110 度之間
 */
export function detectSittingPosture(pose: Pose): SittingPostureResult {
  // 定義關鍵點
  const leftHip = pose[BodyPartIndex.LEFT_HIP] as KeyPoint | undefined;
  const rightHip = pose[BodyPartIndex.RIGHT_HIP] as KeyPoint | undefined;
  const leftKnee = pose[BodyPartIndex.LEFT_KNEE] as KeyPoint | undefined;
  const rightKnee = pose[BodyPartIndex.RIGHT_KNEE] as KeyPoint | undefined;
  const leftAnkle = pose[BodyPartIndex.LEFT_ANKLE] as KeyPoint | undefined;
  const rightAnkle = pose[BodyPartIndex.RIGHT_ANKLE] as KeyPoint | undefined;
  const leftShoulder = pose[BodyPartIndex.LEFT_SHOULDER] as
    | KeyPoint
    | undefined;
  const rightShoulder = pose[BodyPartIndex.RIGHT_SHOULDER] as
    | KeyPoint
    | undefined;

  // 初始化結果對象
  const result: SittingPostureResult = {
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
  };

  // 檢查關鍵點的可見度
  const essentialPoints = [
    leftHip,
    rightHip,
    leftKnee,
    rightKnee,
    leftAnkle,
    rightAnkle,
  ];

  if (!arePointsVisible(essentialPoints, 0.5)) {
    result.postureFeedback.push(
      "無法檢測到足夠的身體部位，請確保整個身體在鏡頭範圍內",
    );
    return result;
  }

  // 計算平均臀部和膝蓋位置
  const avgHipY = ((leftHip?.y || 0) + (rightHip?.y || 0)) / 2;
  const avgHipX = ((leftHip?.x || 0) + (rightHip?.x || 0)) / 2;
  const avgKneeY = ((leftKnee?.y || 0) + (rightKnee?.y || 0)) / 2;
  const avgKneeX = ((leftKnee?.x || 0) + (rightKnee?.x || 0)) / 2;
  const avgAnkleY = ((leftAnkle?.y || 0) + (rightAnkle?.y || 0)) / 2;

  // 先用膝蓋角度粗判斷，避免站姿（膝蓋接近伸直）被誤判為坐姿。
  const leftKneeAngleForDetection = calculateAngle(leftHip!, leftKnee!, leftAnkle!);
  const rightKneeAngleForDetection = calculateAngle(rightHip!, rightKnee!, rightAnkle!);
  const avgKneeAngleForDetection =
    (leftKneeAngleForDetection + rightKneeAngleForDetection) / 2;

  // 檢查臀部是否在膝蓋上方（坐姿特性）
  const hipAboveKnee = avgHipY < avgKneeY;

  // 計算臀部到膝蓋的距離和臀部到肩膀的距離
  const hipToKneeDistance = Math.abs(avgHipY - avgKneeY);
  const shoulderY = ((leftShoulder?.y || 0) + (rightShoulder?.y || 0)) / 2;
  const hipToShoulderDistance = Math.abs(shoulderY - avgHipY);

  // 坐姿判定：臀部在膝蓋上方，且臀部到膝蓋的距離合理
  // 即使膝蓋角度較大，只要臀部在膝蓋上方就視為坐姿
  const isSittingRelationship =
    hipAboveKnee &&
    hipToKneeDistance > 0 &&
    hipToKneeDistance < hipToShoulderDistance * 1.5;
  // 移除嚴格的膝蓋角度限制，改以身體部位空間關係判定

  // 詳細的坐姿檢測診斷日誌
  console.log("🔍 [坐姿檢測診斷]", {
    臀部在膝蓋上: hipAboveKnee,
    臀到膝距離: hipToKneeDistance.toFixed(4),
    臀到肩距離: hipToShoulderDistance.toFixed(4),
    距離比例: (hipToKneeDistance / hipToShoulderDistance).toFixed(3),
    膝蓋角度: avgKneeAngleForDetection.toFixed(1),
    坐姿判定: isSittingRelationship ? "✓ 是坐姿" : "✗ 非坐姿",
  });

  if (!isSittingRelationship) {
    result.postureFeedback.push("未檢測到坐姿，請坐在椅子上");
    result.isSitting = false;
    return result;
  }

  // 坐姿檢測成功
  result.isSitting = true;
  result.confidence = 0.85;

  // ===== 計算坐姿詳細指標 =====

  // 1. 計算膝蓋角度 (髖-膝-踝)
  if (leftKnee && leftHip && leftAnkle) {
    const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
    const rightKneeAngle = calculateAngle(
      rightHip || leftHip,
      rightKnee || leftKnee,
      rightAnkle || leftAnkle,
    );
    result.kneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

    // 評分：理想範圍 85-95 度
    const targetKneeAngle = 90;
    const kneeAngleDiff = Math.abs(result.kneeAngle - targetKneeAngle);
    result.scores.kneeAngleScore = Math.max(0, 1 - kneeAngleDiff / 45);

    if (Math.abs(result.kneeAngle - 90) > 20) {
      result.postureFeedback.push(
        `膝蓋角度不佳（${result.kneeAngle.toFixed(1)}°），應該在 85-95° 之間`,
      );
    }
  }

  // 2. 計算背部角度 (肩-髖-膝)
  // 這表示軀幹的傾斜度
  if (leftShoulder && leftHip && leftKnee) {
    const backAngle = calculateAngle(leftShoulder, leftHip, leftKnee);
    result.backAngle = 180 - backAngle; // 轉換為人體工程學角度

    // 評分：理想範圍 75-105 度（軀幹略向後傾）
    const targetBackAngle = 95;
    const backAngleDiff = Math.abs(result.backAngle - targetBackAngle);
    result.scores.backAngleScore = Math.max(0, 1 - backAngleDiff / 30);

    if (result.backAngle < 75 || result.backAngle > 105) {
      result.postureFeedback.push(
        `背部角度不佳（${result.backAngle.toFixed(1)}°），應該在 75-105° 之間`,
      );
    }
  }

  // 3. 評估臀部位置（是否接觸座位）
  // 通過檢查臀部是否是最低點
  result.scores.hipPositionScore =
    hipAboveKnee && hipToKneeDistance > 20 ? 0.9 : 0.5;

  if (result.scores.hipPositionScore < 0.7) {
    result.postureFeedback.push("臀部位置不佳，請確保臀部充分接觸座位");
  }

  // 4. 評估腳位置（是否著地）
  const feetBelowHip = avgAnkleY > avgHipY;
  const feetNearGround = avgAnkleY > avgKneeY * 0.95; // 腳踝在膝蓋附近或下方

  result.scores.feetPositionScore = feetBelowHip && feetNearGround ? 0.95 : 0.6;

  if (result.scores.feetPositionScore < 0.8) {
    result.postureFeedback.push("雙腳位置不佳，請確保雙腳著地");
  }

  // 5. 計算髖部角度（用於檢查軀幹與大腿的關係）
  if (leftShoulder && leftHip && leftKnee) {
    const hipAngleRaw = calculateAngle(leftShoulder, leftHip, leftKnee);
    result.hipAngle = hipAngleRaw;

    // 理想範圍：110-130 度（軀幹與大腿的角度應大於 90 度）
    if (result.hipAngle < 100) {
      result.postureFeedback.push("軀幹傾斜過度，請坐直");
    }
  }

  // ===== 綜合評估坐姿質量 =====
  const overallScore =
    (result.scores.backAngleScore +
      result.scores.kneeAngleScore +
      result.scores.hipPositionScore +
      result.scores.feetPositionScore) /
    4;

  result.isProperPosture = overallScore > 0.75;

  if (result.isProperPosture) {
    result.postureFeedback.push("✓ 坐姿良好，請保持這個姿勢");
  } else if (overallScore > 0.5) {
    result.postureFeedback.push("⚠ 坐姿尚可，但需要改進");
  } else {
    result.postureFeedback.push("✗ 坐姿不佳，請按照建議改正");
  }

  return result;
}

/**
 * 獲取坐姿評估的簡化文本描述
 */
export function getPostureSummary(result: SittingPostureResult): string {
  if (!result.isSitting) {
    return "未檢測到坐姿";
  }

  if (result.isProperPosture) {
    return "坐姿正確 ✓";
  } else {
    return "坐姿需要改進 ⚠";
  }
}

/**
 * 檢測坐姿時雙腳是否升直（抬起並伸直雙腿）
 * 條件：1) 腳踝位置高於臀部（Y坐標更小）
 *       2) 膝蓋角度 > 150 度（腿伸直）
 */
export function detectLegStretchInSittingPose(pose: Pose): boolean {
  const leftHip = pose[BodyPartIndex.LEFT_HIP] as KeyPoint | undefined;
  const rightHip = pose[BodyPartIndex.RIGHT_HIP] as KeyPoint | undefined;
  const leftKnee = pose[BodyPartIndex.LEFT_KNEE] as KeyPoint | undefined;
  const rightKnee = pose[BodyPartIndex.RIGHT_KNEE] as KeyPoint | undefined;
  const leftAnkle = pose[BodyPartIndex.LEFT_ANKLE] as KeyPoint | undefined;
  const rightAnkle = pose[BodyPartIndex.RIGHT_ANKLE] as KeyPoint | undefined;

  if (!leftHip || !rightHip || !leftKnee || !rightKnee || !leftAnkle || !rightAnkle) {
    return false;
  }

  if (
    leftHip.visibility < 0.5 ||
    rightHip.visibility < 0.5 ||
    leftKnee.visibility < 0.5 ||
    rightKnee.visibility < 0.5 ||
    leftAnkle.visibility < 0.5 ||
    rightAnkle.visibility < 0.5
  ) {
    return false;
  }

  // 計算平均臀部和腳踝高度
  const avgHipY = (leftHip.y + rightHip.y) / 2;
  const avgAnkleY = (leftAnkle.y + rightAnkle.y) / 2;

  // 計算膝蓋角度以確認雙腿是否伸直
  const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
  const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);

  const ANKLE_LIFT_THRESHOLD = 0.03;
  const KNEE_ANGLE_THRESHOLD = 150; // 角度大於此值視為伸直
  const ankleLift = avgHipY - avgAnkleY; // 正值表示腳踝高於臀部

  // debug log
  console.log("[SittingLegStretch] ankleLift=", ankleLift.toFixed(4), "leftKnee=", leftKneeAngle.toFixed(1), "rightKnee=", rightKneeAngle.toFixed(1));

  return ankleLift > ANKLE_LIFT_THRESHOLD && leftKneeAngle > KNEE_ANGLE_THRESHOLD && rightKneeAngle > KNEE_ANGLE_THRESHOLD;
}
