import { KeyPoint } from "@/types/types";

/**
 * 計算兩點之間的歐氏距離
 * @param point1 第一個點
 * @param point2 第二個點
 * @returns 距離值
 */
export function calculateDistance(point1: KeyPoint, point2: KeyPoint): number {
  const dx = point2.x - point1.x;
  const dy = point2.y - point1.y;
  const dz = point2.z - point1.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * 計算三個點形成的角度（頂點在point2）
 * @param point1 第一個點（線條開始）
 * @param point2 角度頂點（中心點）
 * @param point3 第二個點（線條結束）
 * @returns 角度（度）
 */
export function calculateAngle(
  point1: KeyPoint,
  point2: KeyPoint,
  point3: KeyPoint,
): number {
  // 計算向量
  const v1 = {
    x: point1.x - point2.x,
    y: point1.y - point2.y,
    z: point1.z - point2.z,
  };

  const v2 = {
    x: point3.x - point2.x,
    y: point3.y - point2.y,
    z: point3.z - point2.z,
  };

  // 計算向量的標量積
  const dotProduct = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;

  // 計算向量的大小
  const magnitude1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
  const magnitude2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);

  // 防止除以零
  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }

  // 計算角度
  const cosAngle = dotProduct / (magnitude1 * magnitude2);
  // 確保值在 [-1, 1] 範圍內
  const clampedCosAngle = Math.max(-1, Math.min(1, cosAngle));
  const angleRad = Math.acos(clampedCosAngle);
  const angleDeg = (angleRad * 180) / Math.PI;

  return angleDeg;
}

/**
 * 計算點在二維平面上的位置關係
 * @param point 要測試的點
 * @param y 參考 Y 座標
 * @returns 如果點在參考線上方返回負數，下方返回正數
 */
export function getPointYOffset(point: KeyPoint, y: number): number {
  return point.y - y;
}

/**
 * 檢查點的可見度是否足夠
 * @param point 要檢查的點
 * @param threshold 可見度閾值（0-1）
 * @returns 是否可見
 */
export function isPointVisible(
  point: KeyPoint | undefined,
  threshold: number = 0.5,
): boolean {
  if (!point) return false;
  return point.visibility >= threshold;
}

/**
 * 驗證多個點是否都可見
 * @param points 點的陣列
 * @param threshold 可見度閾值
 * @returns 所有點是否都可見
 */
export function arePointsVisible(
  points: (KeyPoint | undefined)[],
  threshold: number = 0.5,
): boolean {
  return points.every((point) => isPointVisible(point, threshold));
}
