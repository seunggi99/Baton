// telemetry.test.ts — telemetry.ts 단위 테스트.
// 핵심: 여러 턴에 걸친 같은 모델 비용이 제대로 합산되는지.
import { describe, it, expect, afterEach } from "vitest";
import { existsSync, rmSync, readFileSync } from "node:fs";
import { toTurnRecord, writeReport } from "./telemetry.js";
import { initialState, appendTurn, type Step } from "./state.js";
import type { ClaudeRunResult } from "./claude.js";

function makeSteps(): Step[] {
  return [
    { id: 1, title: "단계1", instruction: "...", verify: "npm test", status: "pending" },
    { id: 2, title: "단계2", instruction: "...", verify: "npm test", status: "pending" },
  ];
}

// claude.ts 의 runOnce 가 돌려줄 법한 가짜 결과 (스파이크 구조 기반)
function fakeResult(over: Partial<ClaudeRunResult> = {}): ClaudeRunResult {
  return {
    ok: true,
    text: "pong",
    stopReason: "end_turn",
    terminalReason: "completed",
    numTurns: 1,
    sessionId: "x",
    permissionDenials: [],
    totalCostUsd: 0.02,
    durationMs: 2000,
    perModel: [
      { model: "opus", inputTokens: 100, outputTokens: 10, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUsd: 0.018 },
      { model: "haiku", inputTokens: 50, outputTokens: 5, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUsd: 0.002 },
    ],
    ...over,
  };
}

describe("toTurnRecord", () => {
  it("runOnce 결과를 turns 한 줄로 변환한다 (perModel 날것 보관)", () => {
    const rec = toTurnRecord(1, fakeResult());
    expect(rec.step).toBe(1);
    expect(rec.passed).toBe(true);
    expect(rec.totalCostUsd).toBe(0.02);
    expect(rec.perModel).toHaveLength(2); // 가공 없이 그대로
  });

  it("실패 결과면 passed=false 로 기록한다", () => {
    const rec = toTurnRecord(2, fakeResult({ ok: false }));
    expect(rec.passed).toBe(false);
  });
});

describe("writeReport — 모델별 누적 합산 (핵심)", () => {
  const REPORT = "report.test.md";
  afterEach(() => {
    if (existsSync(REPORT)) rmSync(REPORT); // 테스트가 만든 파일 정리
  });

  it("여러 턴에 걸친 같은 모델 비용을 합산한다", () => {
    const s = initialState(makeSteps());
    // 2턴 모두 opus+haiku 사용 → opus 0.018*2, haiku 0.002*2 로 합쳐져야 함
    appendTurn(s, toTurnRecord(1, fakeResult()));
    appendTurn(s, toTurnRecord(2, fakeResult()));

    writeReport(s, REPORT);
    const md = readFileSync(REPORT, "utf-8");

    // opus 누적 비용 0.036, haiku 0.004 가 리포트에 찍혀야 함
    expect(md).toContain("0.036000"); // opus 합산
    expect(md).toContain("0.004000"); // haiku 합산
  });

  it("총 비용과 턴 수를 집계한다", () => {
    const s = initialState(makeSteps());
    appendTurn(s, toTurnRecord(1, fakeResult()));
    appendTurn(s, toTurnRecord(2, fakeResult({ ok: false })));

    writeReport(s, REPORT);
    const md = readFileSync(REPORT, "utf-8");

    expect(md).toContain("0.040000");      // 총 비용 0.02*2
    expect(md).toContain("성공 1 / 실패 1"); // 성공/실패 집계
  });
});