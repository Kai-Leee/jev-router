# cli 역할

목적: 저장된 manifest와 JSONL 기록으로 API 호출 없이 보고서를 생성하는 사용자 경로를 만든다.
먼저 [운영 규칙](README.md), [공통 계약](../EVALUATION_CONTRACT.md)를 읽는다.

소유 파일: `bin/evaluate.mjs`, `test/evaluation-cli.test.mjs`, `examples/evaluation/`,
`docs/EVALUATION_USAGE.md`, `docs/agents/cli-STATUS.md`.
다른 bin/source/package/README는 main 담당이므로 수정하지 않는다.

명령: `node bin/evaluate.mjs --manifest <json> --records <jsonl> [--output <json>]` 및 `--help`.
`src/evaluation/index.mjs`의 `evaluate({manifest, records})`를 import한다(main 구현).
stdout 기본, output은 이미 존재하면 덮어쓰지 않는다. 실패 stderr는 내용/키를 반영하지 않는 고정
오류 설명과 code만 출력한다. 환경변수·dotenv·Jev client를 읽거나 네트워크 호출하지 않는다.
파일 읽기/JSON 파싱 실패, 빈 JSONL, unknown flags, output 충돌의 종료코드를 검증한다.

예제는 synthetic provenance이며 분류·binary·보류·실패·누락 비용이 드러나야 한다.
신규 지표의 성능/절감 입증으로 표현하지 않는다. 보고서 필드와 테스트는 metrics 담당과 소통해 조정한다.
실제 검증과 남은 일을 상태 문서에 남기고 문맥 한계 때 운영 규칙의 인계를 따른다.
