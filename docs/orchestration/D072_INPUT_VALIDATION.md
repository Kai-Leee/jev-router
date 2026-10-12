# D072 — Jev 입력 사전 검증과 미완료 원인

확인일: 2026-10-12 (Asia/Seoul). 이번 작업은 스크립트 작성·오프라인 재검증·모델 목록 GET이다. 새 개발, 수리 또는 판단 POST는 실행하지 않았다. D071 원본은 보존했다.

## 실행 방법과 검사 범위

[검증 CLI](../../scripts/validate-jev-input.mjs)는 실제 `prepareDecision`과 현재 v3 admission을 재사용한다. 새로운 규칙을 따로 복제하지 않는다. `npm run --silent validate:jev -- ...`도 같은 CLI다. 작업 위치는 `jev-router/`다.

```sh
node scripts/validate-jev-input.mjs --request examples/decision.json --stage split
```

새 요청에서는 `--request`를 실제 전송할 JSON 경로로 바꾸고, 실행기가 정한 `split`, `relations`, `repair`, `profiles` 중 하나를 `--stage`로 지정한다. 요청 본문의 자기 주장으로 stage를 추론하지 않는다. `--out`은 새 파일만 허용하고, 입력 run 디렉터리 안이나 기존 결과에는 기록하지 않는다.

이번 실제 재현 명령:

```sh
node scripts/validate-jev-input.mjs \
  --run benchmark-runs/d071-comparison-01/jev_all \
  --run benchmark-runs/d071-comparison-01/jev_profile \
  --run benchmark-runs/d071-preserved-repair-01 \
  --out benchmark-runs/d072-input-validation-02/validation.json
```

같은 출력 경로로 재실행하면 보존 오류로 거절된다. 재현 시 `--out`을 생략하거나 새 경로를 지정한다. 종료 코드 **0=모든 입력 추정 통과, 2=형식/입력 정책 차단 존재, 1=사용법·자료 누락·감사 불일치**다. 이번 결과는 감사 완료 및 의도한 차단 1건 때문에 **exit 2**다.

- `model`, 비어 있지 않은 `state`, 질문 1–64개, 질문 ID 형식, 비어 있지 않은 지시문, 유형별 criteria 형식을 실제 adapter로 검사한다. 선택 2–255개, 점수 2–10단계, `noul`의 선택적 true/false 설명을 적용한다. 영어 적합성이나 질문의 의미·근거 충분성은 이 검사로 증명하지 않는다.
- [공식 API 문서](https://jev-ai.pro/docs)의 **256,000 UTF-8 바이트**는 요청 본문 한도다. 파일의 pretty-print 크기가 아니라 실제 compact JSON 직렬화 바이트를 잰다. adapter의 `model/state/questions` 부분집합 검사이며 공식 API의 모든 선택적 기능을 검사하는 것은 아니다.
- [Jev 1.13 모델 안내](https://jev-ai.pro/model/jev-1.13)의 문맥 표기는 요청 **64k**, state+가장 긴 질문 **32k**다. 로컬 정책은 이를 보수적으로 64,000/32,000으로 해석하고 `ceil(UTF8 bytes × 2/5) + 512` 추정식을 적용한다. **정확한 tokenizer·provider framing을 확인한 값이 아니며 `exact_model_tokens:null`이다.**
- 수리 단계의 **48,000B**는 별도의 내부 운영 상한이다. 공식 API 바이트 한도나 실제 모델 토큰 한도가 아니다. 분할·관계·프로필 단계에 이 repair 상한을 적용하지 않는다.
- run 감사에서는 실행 영수증의 stage, 요청 SHA-256, 정책 SHA-256, 저장된 admission 재생 결과, 응답 목적지·HTTP 상태를 대조한다. 호출 전 관측 모델과 현재 응답 모델은 따로 보존한다. 현재 응답과 해당 호출 영수증의 모델명은 일치해야 하며, 허용 목록에 없는 응답은 감사 실패다.

런타임도 [전송 직전 admission](../../src/benchmark/adaptive-dag-runner.mjs)을 이미 실행한다. 이번 CLI는 이를 호출 없이 먼저 확인할 수 있게 노출했다. 정책 상향, 자동 분할·재전송·장부 변경은 추가하지 않았다.

## 저장 요청의 실제 검사 결과

근거: [전체 검증](../../benchmark-runs/d072-input-validation-02/validation.json), [집계](../../benchmark-runs/d072-input-validation-02/summary.json). 분모에는 로컬에서 막힌 콜백 1개도 들어 있다.

| 저장 조건 | 요청 형식·공식 바이트 통과 | 현재 입력 정책 통과 | 로컬 차단 | 과거 실제 POST 200 |
| --- | ---: | ---: | ---: | ---: |
| Jev 고정 작업자 | 53/53 | 53/53 | 0 | 53 |
| Jev 모델·노력도 선택 | 54/54 | 53/54 | 1 | 53 |
| 별도 보존 후보 수리 | 1/1 | 1/1 | 0 | 1 |
| 전체 | 108/108 | 107/108 | 1 | 107 |

읽은 파일 **440개**(저장 요청·영수증·응답·admission 431개와 검증 소스/정책 9개)의 전후 SHA-256은 모두 같았다. 새 POST는 0회다. [모델 목록 GET 영수증](../../benchmark-runs/d072-input-validation-01/models-get-02.json)에서 목적지 `https://jev-ai.pro/api/v1/models`, HTTP 200, `jev-latest` 존재를 확인했다. 이는 모델 가용성 확인이며 입력 수락 실험이 아니다. 첫 제한 환경 GET은 transport error로 실패했고 [실패 기록](../../benchmark-runs/d072-input-validation-01/model-get-attempt-01.json)을 보존했다.

**검증기 결함도 보존했다.** [최초 결과](../../benchmark-runs/d072-input-validation-01/validation.json)는 48개를 `MODEL_BINDING_MISMATCH`로 잘못 표시했다. 호출 전 admission의 `observed_model`은 앞선 응답이므로 현재 응답 이름과 항상 같지 않다. `typesafe-ai/jev`, `jev-1.13.0` 등의 허용된 이름 변화를 현재 응답/영수증 불일치와 혼동했다. [초기 소스](../../benchmark-runs/d072-input-validation-01/validator-initial.mjs)를 남기고 이 검사를 수정했다. 두 모델 필드를 분리하고 현재 응답의 허용 여부를 확인한 02 결과는 감사 불일치 0개다. 일반 제공업체 이름만으로 실제 모델 버전을 확정하지 않는다.

[집중 테스트](../../test/jev-input-validation.test.mjs)와 v3 admission 회귀는 **9/9 통과**, 실패·생략 0이다. [명령/종료 코드](../../benchmark-runs/d072-validation-tests-01/result.json), [TAP 원문](../../benchmark-runs/d072-validation-tests-01/stdout.tap)을 보존했다. 잘못된 입력·stage·모델, 두 바이트 한도의 분리, 요청/목적지 변경, 빈 감사, 원본 덮어쓰기 금지, 별칭 변화, 모의 목적지 검사를 포함한다. 모의 전송은 실제 API 호출이 아니다.

## Jev가 최종 완료되지 않은 이유

아래는 새 실행 결과가 아니라 D071 종료 결과의 재확인이다. [D071 결과](D071_RESULTS.md), [이번 집계의 원본 해시](../../benchmark-runs/d072-input-validation-02/summary.json)를 따른다.

| 조건 | 공개 검사 | 독립 검사 | 최종 완료 | 중단/미완료 이유 |
| --- | ---: | ---: | --- | --- |
| Claude 단독 | 93/93 | 63/63 | 참 | 둘 다 통과 |
| Jev 판단 + 고정 작업자 | 93/93 | 60/63 | 거짓 | 독립 품질 검사 3개 실패 |
| Jev 판단 + 모델·노력도 선택 | 67/93 | 49/63 | 거짓 | 최초 수리 입력이 전송 전에 로컬 차단 |

**고정 작업자 조건:** Jev 53개 요청은 입력 검사를 통과했고 실제 53 POST가 HTTP 200이었다. 공개 수리 1회 후 공개 검사가 전부 통과해서 실행기는 `completed`로 종료했다. [실행 루프](../../src/orchestration/adaptive-dag-execution.mjs)는 독립 채점을 별도 경계로 두며 종료 시 `product_success:null`, `independent_grade:not_run`을 기록한다. 이후 독립 검사 3개가 실패하므로 결합 완료는 false다. 따라서 여기서는 입력 한도나 API 장애가 중단 원인이 아니다. 공개 종료 gate가 독립 품질 실패를 포착하지 못했고, 독립 채점 결과를 자동 수리에 되먹이지 않는 현재 구조다. **그 3개 실패의 구체적인 코드 원인은 이번 입력 감사에서 확정하지 않았다.** 숨김 검사 내용을 질문·작업자·수리에 넣지 않았다.

**모델 선택 조건:** [공개 실패 분석](../../benchmark-runs/d071-profile-failure-analysis-01/README.md)에 다음 연결이 기록돼 있다.

1. 최초 후보에서 공개 26개 실패: 16개 사례의 `_get_kwargs()` 필수 `client` 인자 오류, 1개 `NullableProbe` 생성물 부재, 9개 본문 설명 누락이다. 같은 오류 메시지 건수와 실제 결함 수는 같다고 단정하지 않는다.
2. 이 중 18개는 세부 assertion 담당 연결이 미지원/미연결이었다. 보수적 fallback이 전체 요구사항 75개를 보존했고, 선택 전 후보들의 합집합은 작업자 9명·산출물 20개·파일 35개로 커졌다. 이는 선택·재호출된 수가 아니다.
3. 최종 수리 요청은 **실측 86,809B**다. 공식 256,000B에는 들어가지만 내부 수리 48,000B를 넘는다. state+가장 긴 질문은 **추정 35,206토큰**으로 로컬 추정 기준 32,000을 넘는다. 정확 토큰은 미측정이다.
4. 두 조건이 `ADAPTIVE_TOKEN_PREFLIGHT_BLOCKED`를 발생시켰다. **수리 POST 0회·예산 예약 0회·수리 작업자 0회**다. API의 실패 응답, 잔액 소진, 10분 제한으로 끝난 것이 아니다.

이 수리 요청의 state/지시문을 크게 만든 원인은 기존 preview와 달라진 다중 실패 및 넓은 담당 fallback이다. 요구사항 값만 444B→27,192B로 늘어 +26,748B이며, 전체 +47,943B 증가의 55.8%다. 이전 58개 preview 통과는 이번 다중 실패 입력까지 검증한 것이 아니었다. 낮은 비용 모델이 원인이라는 인과 판정도 하지 않는다. 조건마다 DAG가 6/12/10개로 달랐다.

## 남긴 문제와 다음 연결

형식 검사 통과는 입력 의미의 충분성이나 제품 완료의 증거가 아니다. [D069 반례](../../benchmark-runs/d069-admission-probe-02/result.json)는 70,510B 요청이 당시 토큰 추정을 통과하고도 실제 HTTP 400 `model_input_limit`를 받은 기록이다. 현재 검증 역시 정밀 tokenizer 검증을 대체하지 않는다.

다음 구현에서는 공개 실패별 assertion→산출물 담당 연결과, **수리할 실패 범위를 먼저 고른 뒤 해당 근거만 자세히 싣는 두 단계**가 필요하다. 고정 작업자 조건의 독립 실패는 공개 명세에서 재현 가능한 검사를 통해 원인을 확인해야 한다. 이 수정·새 유료 재실행·완료 속도 재측정은 이번 범위에서 실행하지 않았다.

이번 변경은 검증 CLI·집중 테스트·npm 진입점·기록이다. 새 audit 파일을 남겼으며 미커밋이다. 새 컨테이너·대기 프로세스·전역 설치·장부 변경은 만들지 않았다. 기존 run/후보는 수정하지 않았고 commit/push도 실행하지 않았다.
