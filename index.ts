// index.ts — Baton 진입점(CLI).
// 실행: npx tsx index.ts <대상폴더> <steps파일>
// 예:   npx tsx index.ts ../url-shortener ./url-shortener-steps.js
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runSupervisor } from "./supervisor.js";
import type { Step } from "./state.js";

async function main() {
  const target = process.argv[2];
  const stepsArg = process.argv[3];

  if (!target || !stepsArg) {
    console.error("사용법: npx tsx index.ts <대상-프로젝트-폴더> <steps-파일>");
    console.error("예:     npx tsx index.ts ../url-shortener ./url-shortener-steps.js");
    process.exit(1);
  }

  // steps 파일을 동적으로 import — Baton 은 "무엇을 만들지" 모름 (도구/대상 분리)
  const stepsModule = await import(pathToFileURL(resolve(stepsArg)).href);
  // 모듈에서 Step[] 를 찾는다: default export 우선, 없으면 첫 배열 export
  const steps: Step[] =
    stepsModule.default ??
    (Object.values(stepsModule).find(Array.isArray) as Step[] | undefined);

  if (!steps || steps.length === 0) {
    console.error(`[baton] ${stepsArg} 에서 steps 배열을 찾지 못했습니다.`);
    console.error("        default export 또는 Step[] 배열 export 가 필요합니다.");
    process.exit(1);
  }

  const cwd = resolve(target);
  console.log(`[baton] 대상 폴더: ${cwd}`);
  console.log(`[baton] steps 파일: ${stepsArg} (단계 ${steps.length}개)\n`);

  const finalState = await runSupervisor({ cwd, steps, maxFailures: 3 });
  process.exit(finalState.status === "complete" ? 0 : 1);
}

main().catch((err) => {
  console.error("[baton] 치명적 오류:", err.message);
  process.exit(2);
});