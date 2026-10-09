# CLI 담당 상태

갱신일: 2026-10-08 (Asia/Seoul). 상태: 소유 파일 구현·CLI 검증 완료, main 전체 통합 확인 대기.

목적: D-012의 오프라인 평가 구현을 CLI·합성 예제·사용 문서로 연결한다.
역할/정본: [CLI](CLI.md), [운영 규칙](README.md), [평가 계약](../EVALUATION_CONTRACT.md).

## 수정 파일

- `bin/evaluate.mjs`: 인자 검사, UTF-8/JSON/JSONL 읽기, `evaluate` 연결, stdout/새 파일 출력, 고정 오류.
- `test/evaluation-cli.test.mjs`: CLI 성공/실패, no-clobber, 입력 비노출, 누락/빈 입력, 오프라인 경로 검사.
- `examples/evaluation/manifest.json`, `records.jsonl`: synthetic 7 cases/4 trials와 15 records.
- `docs/EVALUATION_USAGE.md`: 실행·해석·파일 형식·종료코드·한계.
- 이 상태 문서.

## 결정과 조율

- main 승인: 빈 JSONL은 `records=[]`, 종료코드 0/1/2/3/4 구분.
- main 소유 entrypoint/package scripts와 연결. metrics report를 그대로 JSON 직렬화한다.
- contract의 `INVALID_EVALUATION`은 CLI `INPUT_CONTRACT_INVALID`로 바꾸고 원시 오류는 출력하지 않는다.
- 생성 출력은 exclusive `wx` 및 `0600`. 쓰기 도중 오류 시 부분 파일이 남을 수 있음을 문서화했다.

## 실제 검증

- `node --check bin/evaluate.mjs`, `node --check test/evaluation-cli.test.mjs`: exit 0.
- `node --test test/evaluation-cli.test.mjs`: 13 tests, 13 pass, 0 fail, 0 skipped, exit 0.
  stdout 결정성, 새 파일 권한/출력 충돌, 기존 symlink/입력 보존, 잘못된 인자·읽기·파싱·UTF-8·
  계약 오류, blank/zero-byte JSONL, CRLF/BOM, output 쓰기 실패를 실제 자식 프로세스로 검사했다.
- 위 테스트 중 1개는 임시 preload에서 일반 fetch/http/https/net/tls 호출 및 fs의 dotenv 읽기
  경로를 종료 97로 막고도 합성 예제 CLI가 exit 0인지 확인했다. 광범위한 OS 네트워크 감시는 아니다.
- `node --input-type=module`에서 CLI를 env={} 자식 프로세스로 실행해 보고서 요약을 확인했다:
  `jev-eval-report/v1`, synthetic, manifest 7/recorded 6/missing 1, decided 4/correct 3,
  coverage 4/7, accuracy 3/4, USD total=null/observed_subtotal=0.006.
  숫자는 합성 데이터 재계산 확인이며 모델 성능이나 비용 절감의 측정이 아니다.
- 소유 파일 6개에 `git diff --no-index --check /dev/null <file>` 실행: 공백 오류 출력 없음.
  아직 untracked이므로 no-index diff의 exit 1은 파일 차이를 뜻한다.

## 발견·수정한 문제

- 개발 중 CLI가 임시로 `INVALID_EVALUATION_INPUT`을 비교했으나 contract 담당은
  `INVALID_EVALUATION`을 사용했다. 통합 오류 코드로 맞췄고 회귀 테스트에서 계약 위반이
  exit 3/`INPUT_CONTRACT_INVALID`이며 출력 파일이 생성되지 않음을 확인했다.
  main/review도 초기 불일치를 독립 발견했다. 수정 후 위 13개 테스트는 모두 통과했다.

## 남은 일과 한계

- main의 전체 테스트와 독립 review 최종 결과는 main 검증 기록에서 확정한다.
- 실제 모델 요청·API 인증·실청구·대규모 스트리밍·제품 성능/절감 검증은 이 역할 범위 밖이다.
- 문맥 인계 없음. 정확한 context 잔량을 계측하지 않는다.
