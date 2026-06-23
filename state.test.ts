// state.test.ts — state.ts 단위 테스트.
// claude 호출 없는 순수 로직이라 빠르고 결정론적.
import { describe, it, expect } from "vitest";
import {
  initialState,
  currentStep,
  markDone,
  markFailed,
  isComplete,
  isHalted,
  appendTurn,
  type Step,
} from "./state.js";

// 테스트용 더미 단계 2개 생성 헬퍼
function makeSteps(): Step[] {
  return [
    { id: 1, title: "단계1", instruction: "...", verify: "npm test", status: "pending" },
    { id: 2, title: "단계2", instruction: "...", verify: "npm test", status: "pending" },
  ];
}

describe("currentStep", () => {
  it("처음엔 인덱스 0 단계를 반환한다", () => {
    const s = initialState(makeSteps());
    expect(currentStep(s)?.id).toBe(1);
  });

  it("모든 단계 소진 시 undefined", () => {
    const s = initialState(makeSteps());
    markDone(s); // 0 → 1
    markDone(s); // 1 → 2 (범위 밖)
    expect(currentStep(s)).toBeUndefined();
  });
});

describe("markDone", () => {
  it("현재 단계를 done 으로 만들고 다음으로 이동한다", () => {
    const s = initialState(makeSteps());
    markDone(s);
    expect(s.steps[0].status).toBe("done");
    expect(s.currentStep).toBe(1);
  });

  it("성공 시 연속 실패 카운트를 0으로 리셋한다 (가드 핵심)", () => {
    const s = initialState(makeSteps());
    markFailed(s); // 실패 1
    markFailed(s); // 실패 2
    expect(s.consecutiveFailures).toBe(2);
    markDone(s);   // 성공 → 리셋
    expect(s.consecutiveFailures).toBe(0);
  });

  it("마지막 단계까지 끝나면 status 가 complete 가 된다", () => {
    const s = initialState(makeSteps());
    markDone(s); // 단계1 완료
    expect(isComplete(s)).toBe(false);
    markDone(s); // 단계2(마지막) 완료
    expect(isComplete(s)).toBe(true);
  });
});

describe("markFailed", () => {
  it("현재 단계를 failed 로 만들고 연속 실패를 +1 한다", () => {
    const s = initialState(makeSteps());
    markFailed(s);
    expect(s.steps[0].status).toBe("failed");
    expect(s.consecutiveFailures).toBe(1);
  });

  it("연속 호출 시 카운트가 누적된다", () => {
    const s = initialState(makeSteps());
    markFailed(s);
    markFailed(s);
    markFailed(s);
    expect(s.consecutiveFailures).toBe(3);
  });
});

describe("isHalted", () => {
  it("기본 상태는 halted 가 아니다", () => {
    const s = initialState(makeSteps());
    expect(isHalted(s)).toBe(false);
  });

  it("status 가 halted 면 true (guard.ts 가 설정할 값)", () => {
    const s = initialState(makeSteps());
    s.status = "halted";
    expect(isHalted(s)).toBe(true);
  });
});

describe("appendTurn", () => {
  it("turns 배열에 기록을 보관만 한다", () => {
    const s = initialState(makeSteps());
    appendTurn(s, { step: 1, passed: true, totalCostUsd: 0.02, durationMs: 2000, perModel: [] });
    expect(s.turns).toHaveLength(1);
    expect(s.turns[0].totalCostUsd).toBe(0.02);
  });
});