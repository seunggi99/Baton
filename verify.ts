// verify.ts — 단계의 검증 명령(npm test 등)을 실제로 실행해 통과/실패 판정.
// 결정10-B 의 핵심: claude 말을 안 믿고 감독자가 직접 테스트를 돌린다.
import { spawn } from "node:child_process";

export interface VerifyResult {
  passed: boolean;
  output: string; // 실패 시 프롬프트에 넣어줄 로그 (직전 실패 맥락용)
}

// command 예: "npm test". cwd 는 대상 프로젝트 폴더.
export function runVerify(command: string, cwd: string): Promise<VerifyResult> {
  return new Promise((resolve) => {
    // shell:true 로 "npm test" 같은 문자열 명령을 그대로 실행.
    const child = spawn(command, { cwd, shell: true, stdio: ["ignore", "pipe", "pipe"] });

    let output = "";
    child.stdout.on("data", (c) => (output += c.toString()));
    child.stderr.on("data", (c) => (output += c.toString()));

    child.on("error", (err) => {
      resolve({ passed: false, output: `검증 명령 실행 실패: ${err.message}` });
    });

    // 종료코드 0 = 통과. 그 외 = 실패 (테스트 깨짐).
    child.on("close", (code) => {
      resolve({ passed: code === 0, output: output.slice(-2000) }); // 로그 끝 2000자만
    });
  });
}

// 핵심: 커밋을 claude 자율에 안 맡기고 감독자가 직접 한다 (verify 와 같은 원칙).
export function commitStep(message: string, cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    // git add -A && git commit -m "<message>" 를 대상 폴더에서 실행
    const child = spawn(
      "git add -A && git commit -m " + JSON.stringify(message),
      { cwd, shell: true, stdio: ["ignore", "pipe", "pipe"] }
    );
    let out = "";
    child.stdout.on("data", (c) => (out += c.toString()));
    child.stderr.on("data", (c) => (out += c.toString()));
    child.on("error", () => resolve(false));
    child.on("close", (code) => {
      if (code !== 0) console.log(`  [commit 경고] ${out.slice(-200)}`);
      resolve(code === 0);
    });
  });
}