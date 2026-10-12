# D061 독립 검토

검토 범위: v3 배정기·질문 계약·실행 envelope·검증 workflow·preflight·테스트. 유료 호출 없음. 코드 수정 없음.

## 확인한 결과

- `node --test test/sequential-allocation-v3.test.mjs`: 12/12 통과, 실패·생략 0. 80개 synthetic 의무를 30명에게 배정하고 실제 mock callback 실행의 최대 동시 수 2를 관측했다. 31명 정책은 decide 호출 0회로 거절되고, 31개 task envelope도 거절된다.
- count 선택지는 2..30이며 의무 수 이하로 필터링된다. 단일 선택지만 남으면 deterministic count 이벤트를 남겨 invalid singleton choice API를 피한다. 첫 작업자뿐 아니라 마지막 잔여 배정에도 cap과 최소 잔여 용량을 적용한다.
- `node scripts/bounded-verified-preflight-v3.mjs > /tmp/d061-review-preflight.json`: 실제 80개 의무·85개 테스트 설명 fixture에서 mock 30명 배정. 3개씩 20명, 2개씩 10명; 상한 4개. 전체 80개 exclusive, 테스트 설명 85개 연결. 실제 테스트 실행은 0개.
- 위 preflight의 mock request 85개, 최대 wire payload 127187 bytes. codec roundtrip 모두 일치. 실제 Jev context 수용 여부·토큰·비용·개발 속도는 측정하지 않았다.
- 실행 검사 registry가 비어 있으면 `PUBLIC_CHECK_MAPPING_MISSING`, 누락 85개, 모든 계획·실행 callback 호출 0회. 제품 실행은 아직 차단된다.
- `shasum -a 256`으로 D060 decision-record와 대조: v2 질문 계약, v2 배정기, 기존 verification gate, public registry, 기존 workflow 5/5 일치. 과거 v2 증거가 변경되지 않았다.

## 경계 및 남은 일

새 v3 범위에서 차단 결함을 발견하지 않았다. 최대 작업자 수 30은 동시에 30명을 실행한다는 의미가 아니다. workflow의 기본 concurrency는 2이고 이번 테스트도 명시적으로 2를 사용했다. 단, `maxConcurrency` 인자는 구성 가능하며 2보다 큰 값도 허용하므로 이를 전역 hard ceiling이라고 표현하면 안 된다.

실제 제품의 85개 executable mapping과 shared test 준비 조건은 계속 미구현이다. 새 workflow에는 유료 measured adapter가 연결되지 않았으며 historical D059 CLI는 여전히 과거 경로다. 따라서 이번 검토는 새 배정 상한과 오프라인 실행 장치의 검증이며 실제 Jev 재배정·제품 재실행 성공은 아니다. 실제 fixture의 파일 충돌이 직렬화를 만들 수 있어 30명 증가만으로 병렬성이나 절감을 주장할 수 없다.

검토 부수 효과: 이 문서와 `/tmp/d061-review-preflight.json`을 남겼다. 코드·장부·Personal OS·Git 이력 변경 없음.
