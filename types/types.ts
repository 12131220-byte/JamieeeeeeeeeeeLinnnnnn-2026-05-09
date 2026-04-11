/**
 * KeyPoint 介面定義人體關鍵點的位置和可見度
 * x, y, z: 三維空間中的座標
 * visibility: 可見度值，範圍 0-1
 */
export interface KeyPoint {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

/**
 * Pose 介面定義人體姿勢，包含多個關鍵點
 * 每個關鍵點以字串索引表示身體部位
 */
export interface Pose {
  [key: string]: KeyPoint;
}

/**
 * 身體關鍵點的標準索引
 * 基於 MediaPipe Pose 模型
 */
export enum BodyPartIndex {
  NOSE = 0,
  LEFT_SHOULDER = 11,
  RIGHT_SHOULDER = 12,
  LEFT_HIP = 23,
  RIGHT_HIP = 24,
  LEFT_KNEE = 25,
  RIGHT_KNEE = 26,
  LEFT_ANKLE = 27,
  RIGHT_ANKLE = 28,
}

/**
 * 姿勢類型枚舉
 */
export enum PostureType {
  SITTING = "sitting", // 坐姿
  STANDING = "standing", // 站姿
  LYING = "lying", // 躺姿
  UNKNOWN = "unknown", // 未知
}

/**
 * 坐姿分析結果
 */
export interface SittingPostureResult {
  isSitting: boolean; // 是否是坐姿
  confidence: number; // 信心度（0-1）
  backAngle: number | null; // 背部角度（度）
  kneeAngle: number | null; // 膝蓋角度（度）
  hipAngle: number | null; // 臀部角度（度）
  isProperPosture: boolean; // 是否是正確坐姿
  postureFeedback: string[]; // 坐姿反饋信息
  scores: {
    backAngleScore: number; // 0-1，1 表示完美
    kneeAngleScore: number;
    hipPositionScore: number; // 檢查臀部是否接觸座位
    feetPositionScore: number; // 檢查腳是否著地
  };
}

/**
 * 站姿分析結果
 */
export interface StandingPostureResult {
  isStanding: boolean; // 是否是站姿
  confidence: number; // 信心度（0-1）
  bodyAlignment: number | null; // 身體對齊度（度）
  shoulderAlignment: number | null; // 肩膀是否水平（度）
  kneeFlexion: number | null; // 膝蓋彎曲度（度）
  isProperPosture: boolean; // 是否是正確站姿
  postureFeedback: string[];
  scores: {
    alignmentScore: number; // 0-1
    shoulderScore: number; // 0-1
    kneeScore: number; // 0-1
    bodyHeightScore: number; // 0-1
  };
}

/**
 * 躺姿分析結果
 */
export interface LyingPostureResult {
  isLying: boolean; // 是否是躺姿
  confidence: number; // 信心度（0-1）
  bodyAngle: number | null; // 身體角度（度）
  spineAlignment: number | null; // 脊椎對齊（度）
  neckAngle: number | null; // 頸部角度（度）
  isProperPosture: boolean; // 是否是正確躺姿
  postureFeedback: string[];
  scores: {
    alignmentScore: number; // 0-1
    spineScore: number; // 0-1
    neckScore: number; // 0-1
    supportScore: number; // 0-1
  };
}

/**
 * 統一的姿勢分析結果
 */
export interface UnifiedPostureResult {
  postureType: PostureType; // 檢測到的姿勢類型
  detectedPostures: {
    sitting: SittingPostureResult | null;
    standing: StandingPostureResult | null;
    lying: LyingPostureResult | null;
  };
  primaryPosture: PostureType; // 最有可能的姿勢
  overallScore: number; // 綜合評分（0-1）
}
