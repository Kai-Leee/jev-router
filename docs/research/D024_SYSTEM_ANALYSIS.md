# D-024 구조적 지연 감사: 판단을 추가한 경로에서 판단을 이전하는 경로로

확인일: 2026-10-09. 범위: 저장된 실제 실행 두 개와 현재 실행기 소스의 읽기 전용 감사. 새 추론·컨테이너 실행 없음. 개발 역할은 [D024_EFFICIENCY](../agents/D024_EFFICIENCY.md)이며 이 문서는 새로운 설계의 성능 검증이 아니다.

## 실측과 해석의 경계

원본 [비교 JSON](../../benchmark-runs/diagnostics/d023-comparison.json), [판단 시간](../../benchmark-runs/diagnostics/d023-jev-timing.json)을 사용했다. 재계산 명령은 저장소 루트에서 `node benchmark-runs/diagnostics/d023-compare.mjs`이다. 각 조건 1회, 비동시 실행이며 양쪽 모두 원본 산출물 독립 채점 30/30을 통과했다.

| 관측 | Claude 직접선택 baseline | Claude + Jev |
|---|---:|---:|
| runner 시간 |197.515초|250.725초|
| gate 입력 이후 결정 기록까지 합계 |0.165초|13.710초|
| 명령 실행 합계 |16.676초|12.264초|
| 완료 주장 요청 |1회|4회|
| Claude 출력 토큰 |20,883|26,017|

Jev 조건이 53.210초 길다. 증가율 26.94%의 분모는 Claude baseline 197.515초이다. Jev HTTP 왕복 자체는 11회 합계 7.096초다. gate 구간 중 HTTP 이외 차이는 6.614초(13.710−7.096)이나, 이를 전부 잔액 조회나 디스크 I/O 시간이라고 특정할 수 없다. 소스상 모델 목록 조회, 매 호출 잔액 조회, 예약·정산 및 기록이 이 구간에 포함된다.

두 실행의 gate 구간 차이 13.545초와 명령 구간 차이 −4.412초를 전체 차이에서 빼면 잔여 차이 44.077초다. 이는 산술적 잔여이지 Claude 추론 시간의 직접 계측값이 아니다. 생성, 제공자 대기, 도구 왕복 사이의 처리, 실행기 기타 시간이 섞여 있다. CLI 내부 판단만의 시간·TTFT는 분리되지 않았다. **현재 기록으로 53.210초 중 각 구조 원인의 인과 기여율을 산출할 수 없다.**

## 확인된 구조적 문제

### 1. Jev가 선택하기 전에 Claude가 중요한 작업을 이미 수행한다

[launch.mjs](../../src/benchmark/launch.mjs)의 SYSTEM_PROMPT는 Claude를 sole implementation agent로 두고 스스로 계획을 만들며 의미 있는 대안 명령을 제출하도록 요구한다. [decision-gate.mjs](../../src/benchmark/decision-gate.mjs)의 `validateInput`은 action마다 2–8개의 완성된 command를 요구하며 `makeRequest`는 해당 명령 전체를 Jev 질문에 포함한다.

따라서 현재 순서는 `Claude 계획·구현 코드 작성 → Jev 선택 → 코드 실행 → Claude 결과 해석`이다. 모델/역할/전략을 고르기 전에 코드 생성을 줄이는 구조가 아니다. 최신 성공 실행의 action 7개 모두 Jev가 a를 골랐다. 이것은 7번 모두 선택 결과가 같았다는 관측이며 a가 객관적 정답이었다거나 위치 편향이 있었다는 증명은 아니다.

후보 낭비량도 구분해야 한다. 원본 action 7개에 명령 후보 14개가 있고 미선택은 7개(건수 분모 14개: 50%)다. 그러나 미선택 명령 문자열은 475 UTF-8 bytes / 전체 명령 문자열 25,746 bytes = **1.845%**다. 선택된 a가 25,271 bytes를 차지한다. 미선택 후보를 없애면 출력 비용의 절반이 줄 것이라는 해석은 잘못이다. 토큰 수가 아닌 명령 문자열 바이트이며 설명·사고 토큰은 이 계산에 포함하지 않는다.

구체적으로 decision 3의 b는 설명이 “Only write check_functions.py first”인데 실제 명령은 `echo skip`이다. decision 7의 b도 “Check remaining budget first”이지만 `echo status`다. decision 2의 b는 setup.sh 작성까지 설명하지만 실제 명령은 pyproject.toml만 쓴다. **대안의 설명과 실행 효과가 일치하지 않아 선택의 유용성 자체가 약해졌다.** Jev에 완성된 긴 코드를 다시 읽히는 것으로 이 계약 결함을 해결할 수 없다.

### 2. 완료 판정이 근거 수집 지시 없이 추가 생성 루프를 만든다

완료 선택지는 finish/continue/abstain이다. `continue`는 추가 작업이 필요하다는 라벨만 제공하며 부족한 요구사항 ID나 다음에 확보해야 할 근거 유형은 반환하지 않는다. 요구사항별 충족 계약과 증거 버전도 gate에서 강제하지 않는다. 질문 state는 Claude가 작성한 요약이며 원 목표 전체를 gate가 자동 포함하지 않는다.

최신 성공 실행은 decision 6, 8, 10에서 continue, 11에서 finish다. decision 10과 11 사이에 실행된 명령이 없고 마지막 입력은 “No changes since the last claim”이라고 명시한다. 두 요청의 purpose/state 문구는 달라졌다. resolved model 표기도 10에서는 jev-1.13.0, 11에서는 typesafe-ai/jev였다. 따라서 동일 입력 반복 안정성 실험도 아니고 모델 가중치 변경의 증거도 아니다. 다만 **산출물을 바꾸지 않고 완료 표현을 다시 써 승인받는 경로가 허용된 사실**은 확인된다.

baseline은 Claude의 finish 요청 자체를 수락한다. Jev 조건만 별도 완료 검토가 있으므로 두 실행의 완료 정책이 다르다. Jev가 시간을 줄였는지 평가하기 전에, 어떤 Claude 검토를 Jev로 이전할지 지정하고 양쪽의 필수 검증/완료 기준을 일치시켜야 한다.

### 3. 작은 판단에도 직렬 전송과 보존 비용이 붙는다

[telemetry.mjs](../../src/benchmark/telemetry.mjs)의 `createMeasuredDecider`는 최초 모델 목록 확인, 매 호출 잔액 확인, 장부 예약, 실제 POST, 결과 보존, 장부 정산을 수행한다. 이는 USD1 공유 예산과 불확실한 호출 중복 방지를 위한 현재 계약이다. 이를 제거해 속도를 개선했다고 보고하면 제약이 달라진다.

우선 개선 대상은 안전 장치 삭제가 아니라 불필요한 판단 호출 제거, 한 증거 버전에 대한 독립 질문 배치, 변경 없는 요청 재생성 방지다. 캐시는 규칙·증거·모델 정책의 동일성 확인 뒤에만 적용하고, 결과 불확실한 POST의 재시도로 사용하지 않는다. 모델 별칭 정책이 바뀌면 과거 의미적 결론을 무조건 재사용하지 않는다.

### 4. 별도 Opus 모니터도 전체 시스템의 비용과 자원을 사용한다

[monitor.mjs](../../src/benchmark/monitor.mjs)의 `monitorFingerprint`는 status/gate/incidents/warnings/evaluation 변화에 반응한다. heartbeat나 token 변화만으로 호출하지는 않는다. 실행 보고상 Jev 조건은 7회, baseline은 5회 별도 Opus monitor가 실행됐다.

모니터는 runner가 판단 반환을 기다리는 직렬 gate가 아니다. 따라서 모니터 시간을 runner 시간에 단순 합산하면 안 된다. 다만 동시 Opus 작업의 제공자 제한·호스트 자원 경합 가능성은 대조 실험의 교란 요인이다. 실제 경합이나 그 지연량은 측정되지 않았다. 모니터의 필수 독립성은 유지하되 정상적인 상태 전환은 결정론적으로 기록하고 실패/불확실/정체/최종 상태처럼 해석이 필요한 사건에 대한 호출량을 별도 평가하는 것이 적절하다. 이는 정책 제안이며 이번 감사에서 호출 정책을 바꾸지는 않았다.

## 목표에 맞는 대체 구조

현재의 `대안 코드 작성 후 선택`을 다음 구조로 교체하는 것이 설계 제안이다.

1. Claude가 목표에서 버전 있는 역할·규칙·검증 계약을 한 번 생성한다. 각 규칙에는 담당 범위, 입력 증거, 산출물, 허용 도구, 완료 기준, 갱신 조건을 둔다.
2. 결정론적 코드가 경로/권한/출력 스키마/증거 ID 및 버전/도구 허용 범위를 검사한다. 권한 확대와 재귀 생성은 Jev 승인만으로 허용하지 않는다.
3. Jev가 규칙 수락/수정 필요/판단 불가 및 역할별 요구사항 충족을 구조화해 판정한다. 수정이 필요하면 대상 ID를 남기고 Claude가 해당 규칙만 다시 작성한다. Jev는 규칙 본문 생성기나 실제 테스트 대체물이 아니다.
4. 실행 중에는 증거를 수집한 뒤 **역할·다음 작업 유형을 먼저** Jev가 선택한다. 선택된 역할만 필요한 구현을 작성한다. 허용된 정형 검사·기록은 호스트가 수행해 Claude에게 다음 명령을 매번 추론하도록 하지 않는다.
5. 성공한 기계 검사와 증거 버전을 유지하고, 새 실패/목표 변화/권한 밖 작업/증거 부족 같은 갱신 사건에만 Jev 판단을 호출한다. 미충족 요구사항을 특정할 수 없는 abstain은 성공으로 변환하지 않는다.
6. 완료는 필수 검사와 제출물 계약을 결정론적으로 확인한 후 남은 의미적 판단만 Jev에 맡긴다. 변경 없는 증거로 같은 완료 질문의 표현만 바꾸는 루프를 막는다. 독립 evaluator의 성공 판정은 별도로 보존한다.

새 Claude 세션 생성·규칙 생성·요약도 비용이다. 역할을 매 판단마다 새로 만들면 절약하려던 비용을 다시 낸다. 최초 생성 비용과 역할 재사용 횟수를 함께 기록하고, 결과를 받은 메인이 같은 판단을 다시 추론하도록 요구하지 않아야 한다. 네이티브 Claude subagent의 실제 생성과 생성용 정의 파일 작성은 서로 다른 검증 항목이다.

## 분리 실험과 완료 기준

- **고정 입력 판단 실험:** 같은 state/criteria를 양쪽에 주고 반환 유효성, choice, abstain, 요청 왕복/전체 전달 시간, 토큰을 측정한다. Claude CLI 시작과 JSON 출력 처리 비용은 별도 표기한다. HTTP와 CLI 비교로 서버 내부 추론 속도를 주장하지 않는다. 질문 생성 비용을 제외한 실험이라는 점도 명시한다.
- **역할·규칙 생명주기 실험:** Claude 규칙 생성 → 형식 검사 → Jev 검증 → 지정 규칙 갱신 → 변경 증거 재검증을 기록한다. 규칙 불변 시 재생성 횟수 0, 오래된 증거 거절, abstain 보존, 권한 확대 거절이 검증 대상이다.
- **전체 구현 실험:** 동일 완료 기준의 Claude 직접 판단과 Jev 대체 흐름을 여러 과제에서 비교한다. 독립 성공률, 총 시간, Claude 판단/갱신 호출 수, 출력 토큰, Jev overhead, monitor 비용을 분리한다. 역할 생성·인계·질문 준비 비용을 총량에서 빼지 않는다.

성공 기준은 Jev API가 빠르다는 사실만이 아니라 **동일한 과제 품질에서 실제로 Claude의 판단/재검토가 제거되고 총 시간이 줄었는지**이다. 현재 두 실행만으로 그 기준을 충족했다고 말할 수 없다.

감사 중 메인이 별도로 완료한 [고정 입력 3문항 결과](../../benchmark-runs/d024-fixed-01/result.json)도 확인했다. Claude fresh CLI의 전체 전달 시간은 문항 순서대로 4.189/3.597/3.892초, Jev 재사용 client와 예산 확인을 포함한 시간은 1.129/0.726/0.883초다. Jev HTTP만의 시간은 444/453/432ms다. Claude가 보고한 API duration은 1658/1639/1866ms로 계측 경계가 다르다. 입력 state/criteria가 같아도 요청 형식·출력 요구·실행 경로는 다르므로 서버 추론 속도 비교로 해석하지 않는다. 문항별 1회이며 질문 생성 비용도 제외한다. 두 번째 문항에서 Claude는 finish, Jev는 continue를 반환했다. 정답 라벨이 없어 어느 판단이 우수한지는 이 실험으로 결정할 수 없다. 개별 전달 단축과 앞서 측정된 전체 구현 지연은 함께 성립하며, 이것이 판단 이전 구조의 별도 검증이 필요한 이유다.

## 후보 수치 재현

다음은 경로 탐색이 아닌 저장된 JSONL 데이터의 집계다. 저장소 루트에서 실행하며 원본 수정과 추론 호출은 없다.

```sh
node --input-type=module <<'JS'
import fs from 'node:fs';
const rows = fs.readFileSync('benchmark-runs/e2eswe-d022-05/decisions.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
let count=0, unused=0, bytes=0, unusedBytes=0;
for (const r of rows.filter(r=>r.event==='input' && r.kind==='action')) {
  const selected=rows.find(d=>d.event==='decision' && d.decision_id===r.decision_id).choice;
  for (const c of r.input.candidates) {
    const n=Buffer.byteLength(c.command,'utf8'); count++; bytes+=n;
    if(c.id!==selected){unused++;unusedBytes+=n;}
  }
}
console.log({count,unused,bytes,unusedBytes,unusedByteFraction:unusedBytes/bytes});
JS
```

검증 출력: count14, unused7, bytes25746, unusedBytes475, unusedByteFraction0.018449467878505398. 이 감사 담당자가 수정한 것은 이 문서뿐이다. 구현·신규 유료 실험·생성된 서브에이전트 실행은 담당 외로 수행하지 않았다. 기존 컨테이너, 공유 예산, Personal OS, 실행 중 대시보드를 변경하지 않았고 커밋·공개하지 않았다.
