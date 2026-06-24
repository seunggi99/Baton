// supervisor.ts — 부품(runOnce/state/telemetry/guard/verify)을 한 사이클로 엮는 메인 루프.
import { runOnce } from "./claude.js";
import {
  load, save, initialState, currentStep,
  markDone, markFailed, appendTurn, isComplete, isHalted,
  type LoopState, type Step,
} from "./state.js";
import { toTurnRecord, writeReport } from "./telemetry.js";
import { checkHalt } from "./guard.js";
import { runVerify, commitStep } from "./verify.js";

const ALLOWED_TOOLS = "Read,Write,Edit,Bash"; // 대상 프로젝트를 만들려면 이 정도 필요

export interface SupervisorConfig {
  cwd: string;       // 대상 프로젝트 폴더 (URL 단축 API 레포)
  steps: Step[];     // 시드/부트스트랩이 준 단계 정의
  maxFailures?: number;
}

export async function runSupervisor(cfg: SupervisorConfig): Promise<LoopState> {
  // state 가 있으면 이어받고, 없으면 새로 만들어 저장 (load 가 null 반환 시)
  let state = load() ?? initialState(cfg.steps, cfg.maxFailures);
  save(state);

  // 메인 루프: 완료도 HALT도 아니면 계속.
  while (!isComplete(state) && !isHalted(state)) {
    const step = currentStep(state);
    if (!step) break; // 방어: 단계 소진 (정상이면 isComplete 가 먼저 잡음)

    console.log(`\n── step ${step.id}: ${step.title} ──`);

    // (1) 프롬프트 조립 (결정11-B) — 직전 실패 맥락 포함
    const prompt = buildPrompt(step, state);

    // (2) claude 헤드리스 1턴
    const result = await runOnce(prompt, { cwd: cfg.cwd, allowedTools: ALLOWED_TOOLS });

    // (3) 검증: 감독자가 직접 verify 실행 (결정10-B)
    const verify = await runVerify(step.verify, cfg.cwd);

    // (4) 성공 판정 = claude ok AND verify 통과 (둘 다여야 성공)
    const succeeded = result.ok && verify.passed;
    console.log(
      `  claude.ok=${result.ok} / verify.passed=${verify.passed} → ${succeeded ? "성공" : "실패"}`
    );

    // (5) 비용 적립 (telemetry)
    appendTurn(state, toTurnRecord(step.id, result, succeeded));

    // (6) 상태 갱신
    if (succeeded) {
      markDone(state);
      // 감독자가 직접 단계별 커밋 (커밋 히스토리 = 자율 진행 증거)
      const committed = await commitStep(`step ${step.id}: ${step.title}`, cfg.cwd);
      console.log(`  commit: ${committed ? "✅" : "⚠️ 실패"}`);
    } else {
      markFailed(state);
      // 직전 실패 로그를 step 에 임시 보관 → 다음 턴 프롬프트가 참조
      (step as any)._lastFailure = verify.output || result.failureReason || "원인 불명";
    }

    // (7) 가드: 멈출지 판단 (차별점 b)
    checkHalt(state);

    // (8) 저장 — 매 턴 디스크에 (stateless 원칙: 진행은 state.json 에)
    save(state);
  }

  // 종료: 리포트 출력 + report.md
  writeReport(state);
  console.log(
    state.status === "complete" ? "\n✅ 모든 단계 완료" : `\n⛔ HALT: ${state.haltReason}`
  );
  return state;
}

// 결정11-B: 운영 규칙 + 현재 단계 + 직전 실패 맥락
function buildPrompt(step: Step, state: LoopState): string {
  const failure = (step as any)._lastFailure;
  const lines = [
    "너는 이 프로젝트를 단계별로 개발 중이다. 지금 할 일은 아래 '현재 단계' 하나뿐이다.",
    "규칙: 이 한 단계만 수행한다. TDD 로 테스트를 먼저 쓰고 구현한다. 끝나면 멈춘다.",
    "",
    `## 현재 단계 (step ${step.id}: ${step.title})`,
    step.instruction,
    `\n완료 검증 명령: ${step.verify}`,
  ];
  if (failure) {
    lines.push(
      "",
      "## 직전 시도가 실패했다. 아래 로그를 보고 원인을 고쳐 다시 시도하라:",
      "```",
      String(failure).slice(-1500),
      "```"
    );
  }
  return lines.join("\n");
}