// guard.ts — 자동 HALT 판정.
// state 는 실패를 "세기"만 함. guard 는 그 숫자/리소스를 보고 "멈출지 판단"함.
// (관심사 분리: 카운트=state.ts / 정책 판단=guard.ts)
import type { LoopState } from "./state.js";

// 리소스 2차 안전망 상한. 의미 신호(연속 실패)가 1차, 이게 2차.
export interface GuardLimits {
  maxBudgetUsd: number; // 총 비용이 이를 넘으면 HALT
  maxTurns: number;     // 총 턴이 이를 넘으면 HALT
}

export const DEFAULT_LIMITS: GuardLimits = {
  maxBudgetUsd: 5.0, // URL 단축 API 규모면 충분히 여유. 폭주 방어용 상한.
  maxTurns: 30,      // 8단계 예상인데 재시도 여유 둬도 30이면 폭주.
};

// 매 턴 후 호출. HALT 조건이면 state.status='halted' + haltReason 설정하고 true 반환.
// 우선순위: 연속 실패(의미) → 예산(리소스) → 턴 수(리소스).
export function checkHalt(state: LoopState, limits: GuardLimits = DEFAULT_LIMITS): boolean {
  // 1차: 의미 신호 — 연속 npm test 실패 (결정8 의 핵심 트리거)
  if (state.consecutiveFailures >= state.maxFailures) {
    return halt(state, `연속 ${state.consecutiveFailures}회 실패 (임계값 ${state.maxFailures})`);
  }

  // 2차 안전망: 누적 비용
  const totalCost = state.turns.reduce((sum, t) => sum + t.totalCostUsd, 0);
  if (totalCost > limits.maxBudgetUsd) {
    return halt(state, `예산 초과: $${totalCost.toFixed(4)} > $${limits.maxBudgetUsd}`);
  }

  // 2차 안전망: 총 턴 수
  if (state.turns.length > limits.maxTurns) {
    return halt(state, `턴 상한 초과: ${state.turns.length} > ${limits.maxTurns}`);
  }

  return false; // 멈출 이유 없음 — 계속 진행
}

// HALT 처리: 상태 전환 + 사유 기록 (결정9-B)
function halt(state: LoopState, reason: string): boolean {
  state.status = "halted";
  state.haltReason = reason;
  return true;
}