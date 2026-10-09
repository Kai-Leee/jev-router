# 오프라인 평가 CLI 사용법

대상: `jev-eval/v1` manifest와 JSONL 기록. 저장된 입력을 검증하고 JSON 보고서를 계산한다.
Node.js 22 이상과 기본 라이브러리만 사용한다. API 키·dotenv·Jev client를 읽거나 모델을 호출하지 않는다.
입력의 정확한 필드와 상태 조합은 [평가 입력 계약](EVALUATION_CONTRACT.md)에 있다.

## 실행

`jev-router/`에서:

```sh
node bin/evaluate.mjs --help
node bin/evaluate.mjs --manifest examples/evaluation/manifest.json --records examples/evaluation/records.jsonl
node bin/evaluate.mjs --manifest examples/evaluation/manifest.json --records examples/evaluation/records.jsonl --output /tmp/jev-evaluation-report.json
```

`--output`이 없으면 보고서만 stdout으로 출력한다. `--output`을 주면 새 파일을 권한 `0600`으로
생성하고 stdout은 비워 둔다. 이미 존재하는 파일·디렉터리·symlink는 덮어쓰지 않는다. 출력의 상위
디렉터리는 이미 있어야 한다. 파일 쓰기 도중 오류가 나면 불완전한 새 파일이 남을 수 있으므로 종료코드가
0인 출력만 성공 보고서로 사용한다. 다시 실행할 때는 새 경로를 지정한다.

인자는 `--manifest <경로>`, `--records <경로>`, 선택적인 `--output <경로>`만 허용하며 중복은 오류다.
`--help`는 단독으로 사용한다. 공백이 있는 경로는 셸에서 따옴표로 감싼다. `--`로 시작하는 파일명은
`./--name.json`처럼 상대 경로로 지정한다. stdin/URL 입력과 `--flag=value` 문법은 지원하지 않는다.

입력은 UTF-8이다. 잘못된 UTF-8은 거부하고 파일 첫 UTF-8 BOM은 허용한다. JSONL은 비어 있지 않은
각 행에 JSON 값 하나를 둔다. LF/CRLF와 공백 행을 허용하며 각 값의 객체 형태는 계약에서 검사한다.
0 byte 또는 공백뿐인 JSONL은 `records=[]`다. manifest의 사례와 trial은 분모에 남고 기록이 없는
상태로 집계된다. 빈 `cases`/`trials`도 유효하며 분모가 없는 지표는 `null`과 사유를 갖는다.

## 합성 예제의 의미

[manifest](../examples/evaluation/manifest.json)와 [records](../examples/evaluation/records.jsonl)는
`provenance: "synthetic"`인 계산·입력 형식 예제다. 실제 모델 응답이나 사용자 성능 측정값이 아니다.

| 예제 입력 | 확인할 해석 |
|---|---|
| categorical 정답 1개, 오답 1개, 복수 허용 답 1개, binary 정답 1개 | 채점된 답 4개 중 3개 정답. 단일 gold 분류/확률 지표에서는 복수 허용 답 사례 제외 |
| 보류 1개, 호출 실패 1개, 기록 누락 1개 | 전체 사례 7개를 유지. 답변 coverage는 4/7, 보류·실패·누락은 정답/오답과 별도 |
| 참조 답 없는 보류 사례 | 참조 답 부재와 판단 부재를 구분 |
| trial success/failure/unknown 각 1개와 기록 누락 1개 | 실행 성공 여부와 unknown elapsed를 구분 |
| 단일 request에 대응하는 여러 판단 | 판단 수만큼 청구를 중복 합산하지 않음 |
| `evaluation` phase request | 평가 비용과 운영 비용을 구분 |
| `null` 비용, 예상 요청 수 미상, 예상보다 적은 기록 | 완전한 총비용·절감률을 주장하지 않음. 관측 부분합 보존 |

`expected_request_count`는 평가용 요청까지 포함한 trial의 전체 HTTP 요청 예상 수다. 예상보다 많은
request 기록은 계약 오류이며 예상보다 적거나 예상 수가 `null`이면 완전 관측으로 간주하지 않는다.
예제의 숫자는 지표 구현이 상태와 누락을 보존하는지 확인하기 위한 값이다.

## 보고서 읽기

`schema_version`은 `jev-eval-report/v1`이며 `dataset`에 입력 ID·버전·provenance를 보존한다.
`cases`, `requests`, `trials`는 각기 다른 단위다. 비율에는 값과 분자·분모·단위·`null` 사유가 있다.
`latency`의 판단 시간, HTTP 요청 시간, 성공·실패한 trial 시간은 같은 측정치로 바꾸어 읽지 않는다.
`costs`는 운영·평가 비용과 USD/Jev tokens/Jev credits를 구분한다. 단위별 `total`이 `null`일 때
`observed_subtotal`을 완전 비용으로 해석하지 않는다.

`classification`과 `probability`는 단일 gold 사례만 사용하는 지표와 제외 수를 함께 제공한다.
실제 선택 답의 정확도와 확률 argmax 기반 reliability는 별개다. 자세한 산식·동률 정책·예외는
보고서 `conventions`와 [계약](EVALUATION_CONTRACT.md), [평가 조사](EVALUATION_RESEARCH.md)를 함께 본다.
CLI는 계산기가 반환한 보고서를 그대로 직렬화하며 임계값·품질 합격 여부·절감 효과를 추가 판정하지 않는다.

## 오류와 종료코드

오류는 stderr의 한 줄 JSON으로만 전달한다. `error`와 고정 `message`가 있으며 입력 내용·파일 경로·
원시 예외/stack을 출력하지 않는다. 예: `{"error":"OUTPUT_EXISTS","message":"The output path already exists; choose a new path."}`.

| 종료코드 | 의미 | error code |
|---|---|---|
| 0 | 보고서 생성 또는 도움말 성공 | 없음 |
| 1 | 예상하지 못한 내부 오류 | `INTERNAL_ERROR` |
| 2 | 인자 누락·중복·지원하지 않는 인자 | `USAGE` |
| 3 | 입력 읽기·인코딩·구문·계약 오류 | `INPUT_READ_FAILED`, `INPUT_ENCODING_INVALID`, `MANIFEST_JSON_INVALID`, `RECORD_JSON_INVALID`, `INPUT_CONTRACT_INVALID` |
| 4 | 출력 충돌·쓰기 실패 | `OUTPUT_EXISTS`, `OUTPUT_WRITE_FAILED` |

입력과 출력 전체를 메모리에서 처리하는 첫 오프라인 구현이다. 대규모 스트리밍 평가·실제 요청 수집·
모델 비교·네트워크 연결·자동 라우팅은 수행하지 않는다. 직접 검증 범위는 [CLI 상태 기록](agents/cli-STATUS.md)에 있다.
