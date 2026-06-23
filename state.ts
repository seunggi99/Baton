// state.ts — JSON 상태머신.
// supervisor 가 "지금 몇 번째 단계 / 끝났나 / 연속 실패 몇 번 / 멈춰야 하나"를
// 단일 JSON 파일(state.json)로 결정론적으로 관리. 
import { readFileSync, writeFileSync, existsSync } from "node:fs";

// --- 스키마 (합의된 형태) ---
export type StepStatus = "pending" | "done" | "failed"; // 결정3-A
export type RunStatus = "running" | "complete" | "halted";

export interface Step {
  id: number;          // 표기용(사람이 읽는 식별자)
  title: string;
  instruction: string; // claude 에게 줄 이 단계의 지시
  verify: string;      // 완료 검증 명령 (예: "npm test")
  status: StepStatus;
}

export interface TurnRecord {
  // telemetry.ts 가 채울 한 턴 기록. state.ts 는 보관만 (가공 안 함).
  step: number;
  passed: boolean;
  totalCostUsd: number;
  durationMs: number;
  perModel: unknown[]; // telemetry 가 모델별 분해를 넣음
}

export interface LoopState {
  status: RunStatus;
  currentStep: number;
  consecutiveFailures: number;
  maxFailures: number;
  steps: Step[];
  turns: TurnRecord[];
  haltReason?: string;  
}

const STATE_PATH = "state.json";

// 초기 상태: steps 를 받아 새 state 를 만든다. (부트스트랩/시드에서 주입)
export function initialState(steps: Step[], maxFailures = 3): LoopState {
  return {
    status: "running",
    currentStep: 0,
    consecutiveFailures: 0,
    maxFailures,
    steps,
    turns: [],
    haltReason: undefined,  
  };
}

// --- 1. load: 파일 있으면 읽고, 없으면 호출부가 initialState 로 만들도록 null 반환 ---
// 왜 null 반환: "파일 없음"과 "초기화"를 state.ts 가 멋대로 합치지 않음.
// steps 정의는 호출부가 갖고 있으므로, 없으면 호출부가 initialState()+save() 하게 둠.
export function load(path = STATE_PATH): LoopState | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as LoopState;
}

// --- 2. save: 사람이 읽기 좋게 들여쓰기해서 저장 (디버깅/검수용) ---
export function save(state: LoopState, path = STATE_PATH): void {
  writeFileSync(path, JSON.stringify(state, null, 2) + "\n", "utf-8");
}

// --- 3. currentStep: 지금 진행할 단계를 꺼낸다 ---
// 인덱스가 범위를 벗어나면(모든 단계 소진) undefined → isComplete 가 true 가 됨.
export function currentStep(state: LoopState): Step | undefined {
  return state.steps[state.currentStep];
}

// --- 4. markDone: 현재 단계 완료 → 다음으로 이동, 연속 실패 0 으로 리셋 ---
// 마지막 단계까지 done 이면 status 를 complete 로.
export function markDone(state: LoopState): void {
  const step = state.steps[state.currentStep];
  if (step) step.status = "done";
  state.consecutiveFailures = 0; // 성공 시 리셋 (가드 핵심)
  state.currentStep += 1;
  if (state.currentStep >= state.steps.length) {
    state.status = "complete";
  }
}

// --- 5. markFailed: 현재 단계 실패 기록 + 연속 실패 카운트 증가 ---
// 주의: 여기서 HALT 를 "결정"하지 않음. 카운트만 올리고, 임계값 판정은 guard.ts.
// (관심사 분리: 상태 변경 = state.ts / 정책 판단 = guard.ts)
export function markFailed(state: LoopState): void {
  const step = state.steps[state.currentStep];
  if (step) step.status = "failed";
  state.consecutiveFailures += 1;
}

// --- 6. isComplete ---
export function isComplete(state: LoopState): boolean {
  return state.status === "complete";
}

// --- 7. isHalted ---
export function isHalted(state: LoopState): boolean {
  return state.status === "halted";
}

// turns 보관용 append (telemetry.ts 가 만든 기록을 받아 넣기만 함).
export function appendTurn(state: LoopState, record: TurnRecord): void {
  state.turns.push(record);
}