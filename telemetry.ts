// telemetry.ts — 비용/토큰 적립 + 요약 리포트.
// claude.ts 의 runOnce 결과를 받아 (1) turns 한 줄로 만들고 (2) 끝나면 report.md 로 요약.
import { writeFileSync } from "node:fs";
import type { ClaudeRunResult } from "./claude.js";
import type { LoopState, TurnRecord } from "./state.js";

// --- 1. 한 턴 결과 → turns 에 넣을 기록으로 변환 ---
// 결정7-A: perModel 을 가공 없이 날것으로 보관. 합산은 리포트 만들 때 한 번에.
export function toTurnRecord(
  step: number,
  result: ClaudeRunResult,
  passed: boolean  
): TurnRecord {
  return {
    step,
    passed,        
    totalCostUsd: result.totalCostUsd,
    durationMs: result.durationMs,
    perModel: result.perModel,
  };
}

// --- 모델별 누적 합산 (리포트 시점에 turns 를 훑어 reduce) ---
interface ModelTotal {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

function aggregateByModel(state: LoopState): ModelTotal[] {
  const map = new Map<string, ModelTotal>();
  for (const turn of state.turns) {
    for (const m of turn.perModel as any[]) {
      const prev =
        map.get(m.model) ??
        { model: m.model, inputTokens: 0, outputTokens: 0, costUsd: 0 };
      prev.inputTokens += m.inputTokens ?? 0;
      prev.outputTokens += m.outputTokens ?? 0;
      prev.costUsd += m.costUsd ?? 0;
      map.set(m.model, prev);
    }
  }
  return [...map.values()];
}

// --- 2. 요약 리포트: 콘솔 출력 + report.md 저장 ---
export function writeReport(state: LoopState, path = "report.md"): void {
  const totalCost = state.turns.reduce((sum, t) => sum + t.totalCostUsd, 0);
  const totalMs = state.turns.reduce((sum, t) => sum + t.durationMs, 0);
  const passed = state.turns.filter((t) => t.passed).length;
  const failed = state.turns.length - passed;
  const byModel = aggregateByModel(state);

  // 콘솔 요약
  console.log("\n========== Baton 실행 리포트 ==========");
  console.log(`최종 상태   : ${state.status}`);
  console.log(`총 턴       : ${state.turns.length} (성공 ${passed} / 실패 ${failed})`);
  console.log(`총 비용     : $${totalCost.toFixed(6)}`);
  console.log(`총 소요시간 : ${(totalMs / 1000).toFixed(1)}s`);
  console.log("모델별 비용 :");
  for (const m of byModel) {
    console.log(`  - ${m.model}: $${m.costUsd.toFixed(6)} (in ${m.inputTokens} / out ${m.outputTokens})`);
  }
  console.log("=======================================\n");

  // report.md 저장 (깃허브 증거물)
  const md = buildMarkdown(state, { totalCost, totalMs, passed, failed, byModel });
  writeFileSync(path, md, "utf-8");
  console.log(`[telemetry] 리포트 저장: ${path}`);
}

// --- report.md 본문 생성 ---
function buildMarkdown(
  state: LoopState,
  agg: { totalCost: number; totalMs: number; passed: number; failed: number; byModel: ModelTotal[] }
): string {
  const lines: string[] = [];
  lines.push(`# Baton 실행 리포트\n`);
  lines.push(`- 최종 상태: **${state.status}**`);
  lines.push(`- 총 턴: ${state.turns.length} (성공 ${agg.passed} / 실패 ${agg.failed})`);
  lines.push(`- 총 비용: **$${agg.totalCost.toFixed(6)}**`);
  lines.push(`- 총 소요시간: ${(agg.totalMs / 1000).toFixed(1)}s\n`);

  lines.push(`## 모델별 비용`);
  lines.push(`| 모델 | 입력 토큰 | 출력 토큰 | 비용(USD) |`);
  lines.push(`| --- | ---: | ---: | ---: |`);
  for (const m of agg.byModel) {
    lines.push(`| ${m.model} | ${m.inputTokens} | ${m.outputTokens} | $${m.costUsd.toFixed(6)} |`);
  }

  lines.push(`\n## 턴별 상세`);
  lines.push(`| # | 단계 | 결과 | 비용(USD) | 시간(s) |`);
  lines.push(`| ---: | ---: | --- | ---: | ---: |`);
  state.turns.forEach((t, i) => {
    lines.push(
      `| ${i + 1} | step ${t.step} | ${t.passed ? "✅" : "❌"} | $${t.totalCostUsd.toFixed(6)} | ${(t.durationMs / 1000).toFixed(1)} |`
    );
  });

  return lines.join("\n") + "\n";
}