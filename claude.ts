// claude.ts — supervisor 루프가 매 턴 호출하는 claude 헤드리스 래퍼.
// 0번 스파이크에서 확인한 JSON 구조를 기반으로 함.
import { spawn } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 120_000; // 스파이크가 1m35s 걸렸으니 60초는 빠듯 → 120초로

// --- 반환 타입 (스파이크 JSON 구조 기반) ---
export interface ModelCost {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  costUsd: number;
}

export interface ClaudeRunResult {
  ok: boolean;             // 결정1-A: is_error 없고 terminal_reason==='completed' 일 때만 true
  text: string;            // JSON.result (에이전트 응답)
  failureReason?: string;  // ok=false 일 때 왜 실패인지 (가드/로그용)
  stopReason: string;      // JSON.stop_reason
  terminalReason: string;  // JSON.terminal_reason
  numTurns: number;
  sessionId: string;       // --resume 탈출구용
  permissionDenials: unknown[];
  totalCostUsd: number;
  durationMs: number;
  perModel: ModelCost[];   // 결정2-B: modelUsage 를 모델별로 펼침
}

export interface RunOptions {
  cwd: string;             // 대상 프로젝트 폴더 (URL 단축 API 레포)
  allowedTools: string;    // 항상 스코프해서 넘김 (예: "Read,Write,Edit,Bash")
  timeoutMs?: number;
  resumeSessionId?: string; // 옵션 탈출구: 이전 세션 이어가기
}

export async function runOnce(prompt: string, opts: RunOptions): Promise<ClaudeRunResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // 왜 인자 배열인가: 셸 따옴표/이스케이프 문제를 피하려고 spawn 에 배열로 직접 넘김.
  const args = [
    "-p", prompt,
    "--output-format", "json",
    "--allowedTools", opts.allowedTools, // 결정: 항상 스코프 (권한 멈춤 방지)
  ];
  // 옵션 탈출구: stateless 가 기본이지만, 필요 시 세션 이어가기.
  if (opts.resumeSessionId) args.push("--resume", opts.resumeSessionId);

  return new Promise<ClaudeRunResult>((resolve, reject) => {
    const child = spawn("claude", args, {
      cwd: opts.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let stalled = false;

    // 왜 타임아웃+SIGKILL: 헤드리스라도 권한/대화형에서 매달릴 수 있음.
    // "시간 내 미종료 = 멈춤"으로 간주하고 강제 종료해 루프가 영원히 안 걸리게 함.
    const timer = setTimeout(() => {
      stalled = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (c) => (stdout += c.toString()));
    child.stderr.on("data", (c) => (stderr += c.toString()));

    // 왜 reject: spawn 자체 실패(ENOENT 등)는 "턴 실패"가 아니라 "환경 고장"이라
    // 가드로 셀 게 아니라 루프를 즉시 멈춰야 함 → throw 로 구분.
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`claude spawn 실패 (PATH 확인): ${err.message}`));
    });

    child.on("close", () => {
      clearTimeout(timer);

      if (stalled) {
        // 멈춤은 "턴 실패"로 분류 → 가드가 셀 수 있게 ok=false 로 정상 반환.
        return resolve(
          stalledResult(`${timeoutMs}ms 내 미종료 (권한/대화형 멈춤 의심)`, stderr)
        );
      }

      let json: any;
      try {
        json = JSON.parse(stdout);
      } catch {
        // 파싱 실패도 턴 실패로 분류 (stream-json 등 포맷 이슈일 수 있음).
        return resolve(
          stalledResult(`JSON 파싱 실패: ${stdout.slice(0, 200)}`, stderr)
        );
      }

      resolve(mapResult(json));
    });
  });
}

// 결정1-A: 엄격 판정 — is_error 거짓 AND terminal_reason==='completed' 여야만 성공.
function mapResult(j: any): ClaudeRunResult {
  const completed = j.is_error === false && j.terminal_reason === "completed";
  const failureReason = completed
    ? undefined
    : `is_error=${j.is_error}, terminal_reason=${j.terminal_reason}, stop_reason=${j.stop_reason}`;

  return {
    ok: completed,
    text: j.result ?? "",
    failureReason,
    stopReason: j.stop_reason ?? "",
    terminalReason: j.terminal_reason ?? "",
    numTurns: j.num_turns ?? 0,
    sessionId: j.session_id ?? "",
    permissionDenials: j.permission_denials ?? [],
    totalCostUsd: j.total_cost_usd ?? 0,
    durationMs: j.duration_ms ?? 0,
    perModel: mapModelUsage(j.modelUsage), // 결정2-B
  };
}

// 결정2-B: modelUsage 객체를 모델별 배열로 펼침.
// 주의: modelUsage 안은 camelCase(inputTokens), 최상위 usage 는 snake_case 라 섞지 말 것.
function mapModelUsage(modelUsage: any): ModelCost[] {
  if (!modelUsage || typeof modelUsage !== "object") return [];
  return Object.entries(modelUsage).map(([model, u]: [string, any]) => ({
    model,
    inputTokens: u.inputTokens ?? 0,
    outputTokens: u.outputTokens ?? 0,
    cacheReadInputTokens: u.cacheReadInputTokens ?? 0,
    cacheCreationInputTokens: u.cacheCreationInputTokens ?? 0,
    costUsd: u.costUSD ?? 0, // 주의: 키가 costUSD (대문자 USD)
  }));
}

function stalledResult(reason: string, stderr: string): ClaudeRunResult {
  return {
    ok: false,
    text: "",
    failureReason: stderr ? `${reason} | stderr: ${stderr.slice(0, 200)}` : reason,
    stopReason: "",
    terminalReason: "",
    numTurns: 0,
    sessionId: "",
    permissionDenials: [],
    totalCostUsd: 0,
    durationMs: 0,
    perModel: [],
  };
}