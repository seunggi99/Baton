// url-shortener-steps.ts — 루프가 만들 대상(URL 단축 API)의 단계 정의.
// 각 step.instruction 이 그 턴에 claude 에게 줄 지시, verify 가 완료 검증 명령.
import type { Step } from "./state.js";

export const urlShortenerSteps: Step[] = [
  {
    id: 1, title: "스캐폴드", status: "pending", verify: "npm test",
    instruction:
      "Node.js + TypeScript + Express 프로젝트를 초기화하라. package.json(\"type\":\"module\", " +
      "scripts.test=\"vitest run\"), tsconfig.json, src/app.ts(Express 앱, listen 은 분리), " +
      "src/server.ts 를 만들고, GET /health 가 200 {\"status\":\"ok\"} 를 반환하게 하라. " +
      "vitest 와 supertest 를 설치하고, /health 를 검증하는 test/health.test.ts 를 작성하라.",
  },
  {
    id: 2, title: "저장소", status: "pending", verify: "npm test",
    instruction:
      "src/store.ts 에 인메모리 저장소(Map 기반)를 만들어라. save(code, url), findByCode(code), " +
      "incrementClick(code) 를 제공하고, 단위 테스트 test/store.test.ts 를 작성하라. 외부 DB 는 쓰지 마라.",
  },
  {
    id: 3, title: "코드 생성", status: "pending", verify: "npm test",
    instruction:
      "src/shortcode.ts 에 base62 단축 코드 생성기를 만들어라. 충돌 없이 짧은 코드를 발급하고, " +
      "단위 테스트 test/shortcode.test.ts 로 길이·유일성을 검증하라.",
  },
  {
    id: 4, title: "생성 API", status: "pending", verify: "npm test",
    instruction:
      "POST /api/urls 를 구현하라. body {\"url\"} 을 받아 201 {\"shortCode\",\"shortUrl\"} 를 반환한다. " +
      "store 와 shortcode 를 사용하고, supertest 로 test/create.test.ts 를 작성하라.",
  },
  {
    id: 5, title: "리다이렉트", status: "pending", verify: "npm test",
    instruction:
      "GET /:shortCode 를 구현하라. 해당 코드의 원본 URL 로 302 리다이렉트하고, 없는 코드는 404 를 반환한다. " +
      "supertest 로 test/redirect.test.ts 를 작성하라.",
  },
  {
    id: 6, title: "통계+집계", status: "pending", verify: "npm test",
    instruction:
      "리다이렉트 시 clickCount 를 증가시키고, GET /api/urls/:code/stats 가 " +
      "{\"url\",\"shortCode\",\"clickCount\",\"createdAt\"} 를 반환하게 하라. test/stats.test.ts 를 작성하라.",
  },
  {
    id: 7, title: "검증/에러", status: "pending", verify: "npm test",
    instruction:
      "잘못된 URL 입력 시 400 과 일관된 에러 JSON 을 반환하도록 입력 검증을 추가하라. " +
      "test/validation.test.ts 로 잘못된 입력 케이스를 검증하라.",
  },
  {
    id: 8, title: "마무리", status: "pending", verify: "npm test",
    instruction:
      "README.md 를 작성하라(실행법, 엔드포인트 목록, 예시 요청). 전체 테스트가 통과하는지 확인하라. " +
      "명세에 없는 기능은 추가하지 마라.",
  },
];