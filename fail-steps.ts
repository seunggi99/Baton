// fail-steps.ts — HALT 가드/검증 실패 경로를 증명하기 위한 의도적 실패 실험.
// step 2 가 절대 통과 못 하는 테스트라, verify 가 매번 실패 → 연속 3회 → HALT 발동.
import type { Step } from "./state.js";

const failSteps: Step[] = [
  {
    id: 1, title: "스캐폴드", status: "pending", verify: "npm test",
    instruction:
      "Node.js + TypeScript 프로젝트를 초기화하라. package.json(\"type\":\"module\", " +
      "scripts.test=\"vitest run\"), tsconfig.json 을 만들고, vitest 를 설치하라. " +
      "src/sum.ts 에 두 수를 더하는 sum(a,b) 함수를 만들고, test/sum.test.ts 로 검증하라.",
  },
  {
    id: 2, title: "의도적 실패 단계", status: "pending", verify: "npm test",
    instruction:
      "test/impossible.test.ts 라는 테스트 파일을 작성하라. 이 테스트는 " +
      "expect(sum(1, 1)).toBe(3) 처럼 수학적으로 절대 통과할 수 없는 단언을 포함해야 한다. " +
      "sum 함수는 올바르게 1+1=2 를 반환하므로 이 테스트는 반드시 실패한다. " +
      "이것은 HALT 가드를 검증하기 위한 의도된 실패 단계다. sum 함수를 고치지 마라.",
  },
  {
    id: 3, title: "도달하면 안 되는 단계", status: "pending", verify: "npm test",
    instruction: "이 단계는 step 2 의 HALT 로 도달해선 안 된다.",
  },
];

export default failSteps;