// guard.test.ts — guard.ts 단위 테스트 (차별점 b 검증).
// 세 트리거(연속 실패 / 예산 / 턴)가 각각 HALT 를 걸고, 정상 땐 안 거는지.
import { describe, it, expect } from "vitest";
import { checkHalt, type GuardLimits } from "./guard.js";
import { initialState, appendTurn, type Step, type TurnRecord } from "./state.js";

function makeSteps(): Step[] {
  return [
    { id: 1, title: "단계1", instruction: "...", verify: "npm test", status: "pending" },
    { id: 2, title: "단계2", instruction: "...", verify: "npm test", status: "pending" },
  ];
}

// 비용 c 짜리 더미 턴
function turn(c: number): TurnRecord {
  return { step: 1, passed: true, totalCostUsd: c, durationMs: 1000, perModel: [] };
}

// 테스트용 넉넉한 상한 (연속 실패 트리거만 보고 싶을 때 리소스는 안 걸리게)
const LOOSE: GuardLimits = { maxBudgetUsd: 1000, maxTurns: 1000 };

describe("checkHalt — 정상 상태", () => {
  it("실패 없고 리소스 여유면 HALT 안 한다", () => {
    const s = initialState(makeSteps());
    expect(checkHalt(s, LOOSE)).toBe(false);
    expect(s.status).toBe("running");
    expect(s.haltReason).toBeUndefined();
  });
});

describe("checkHalt — 1차: 연속 실패 (의미 신호, 핵심)", () => {
  it("연속 실패가 임계값에 도달하면 HALT + haltReason 기록", () => {
    const s = initialState(makeSteps(), 3); // maxFailures=3
    s.consecutiveFailures = 3;
    expect(checkHalt(s, LOOSE)).toBe(true);
    expect(s.status).toBe("halted");
    expect(s.haltReason).toContain("연속 3회 실패");
  });

  it("임계값 미만이면 HALT 안 한다", () => {
    const s = initialState(makeSteps(), 3);
    s.consecutiveFailures = 2;
    expect(checkHalt(s, LOOSE)).toBe(false);
    expect(s.status).toBe("running");
  });
});

describe("checkHalt — 2차: 리소스 안전망", () => {
  it("누적 비용이 예산을 넘으면 HALT", () => {
    const s = initialState(makeSteps());
    appendTurn(s, turn(3));
    appendTurn(s, turn(3)); // 합 6 > 예산 5
    const limits: GuardLimits = { maxBudgetUsd: 5, maxTurns: 1000 };
    expect(checkHalt(s, limits)).toBe(true);
    expect(s.haltReason).toContain("예산 초과");
  });

  it("턴 수가 상한을 넘으면 HALT", () => {
    const s = initialState(makeSteps());
    for (let i = 0; i < 4; i++) appendTurn(s, turn(0.01));
    const limits: GuardLimits = { maxBudgetUsd: 1000, maxTurns: 3 }; // 4 > 3
    expect(checkHalt(s, limits)).toBe(true);
    expect(s.haltReason).toContain("턴 상한 초과");
  });
});

describe("checkHalt — 우선순위", () => {
  it("연속 실패와 예산 초과가 동시면 연속 실패가 먼저 잡힌다", () => {
    const s = initialState(makeSteps(), 3);
    s.consecutiveFailures = 3;
    appendTurn(s, turn(100)); // 예산도 초과 상태
    const limits: GuardLimits = { maxBudgetUsd: 5, maxTurns: 1000 };
    expect(checkHalt(s, limits)).toBe(true);
    expect(s.haltReason).toContain("연속"); // 예산보다 의미 신호가 우선
  });
});