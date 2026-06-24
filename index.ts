// index.ts — Baton 진입점(CLI). 실행: npx tsx index.ts <대상폴더>
import { resolve } from "node:path";
import { runSupervisor } from "./supervisor.js";
import { urlShortenerSteps } from "./url-shortener-steps.js";

async function main() {
  // 대상 프로젝트 폴더를 인자로 받음 (없으면 안내하고 종료)
  const target = process.argv[2];
  if (!target) {
    console.error("사용법: npx tsx index.ts <대상-프로젝트-폴더>");
    console.error("예:     npx tsx index.ts ../url-shortener");
    process.exit(1);
  }

  const cwd = resolve(target);
  console.log(`[baton] 대상 폴더: ${cwd}`);
  console.log(`[baton] 단계 수: ${urlShortenerSteps.length}\n`);

  const finalState = await runSupervisor({
    cwd,
    steps: urlShortenerSteps,
    maxFailures: 3,
  });

  // 종료코드: 정상 완료 0, 그 외(HALT) 1
  process.exit(finalState.status === "complete" ? 0 : 1);
}

main().catch((err) => {
  // supervisor 가 throw 하는 건 "환경 고장"(claude 못 찾음 등)
  console.error("[baton] 치명적 오류:", err.message);
  process.exit(2);
});