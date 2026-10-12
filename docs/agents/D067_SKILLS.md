# D067 — 무상한·병렬 재실험의 스킬 기록 적용

2026-10-11 KST. 담당은 [D067 역할 계약](D067_PARALLEL.md)의 단일 `skills` 역할이다. 이전 담당의 D066 기록을 이어 사용하며 [스킬 목록과 대기 작업](../skills/MAINTENANCE.md)을 갱신한다. 이 문서는 모델 호출·장부 이관·원본 후보 수정·전역 설치를 실행하는 지시가 아니다.

현재 상태: 실제 4조건 종료 근거를 적용하고 기존 records 참고 문서를 최소 보완했다. 공개·독립 검사 결합 완료는 3/4이며 `jev_all`의 수리 호출 실패·후속 환불 정산은 별도로 보존한다. 아래 사전·진행 중 기록은 당시 상태다. 종료 적용 근거는 문서 끝의 **2026-10-11 15:50 KST** 절을 따른다.

## 현재 요청과 책임

사용자가 조건별 토큰 상한과 누적 장부 토큰 한도를 현재 해제하고 즉시 병렬 실행하도록 요청했다. 새 D067 조건에는 이 최신 승인이 적용된다. D066의 조건당 700,000·누적 10,000,000과 자동 재실행 금지는 당시 실행 기록으로 보존한다. 종료된 D066을 수정하거나 사용량을 초기화하는 승인이 아니다. 실제 유료 실행과 공유 장부 이관은 root가 맡는다.

기존 [유지보수 스킬](../../skills/jev-skill-maintenance/SKILL.md)과 [기록 스킬](../../skills/jev-decision-records/SKILL.md)을 읽고 적용했다. `skill-creator` 지침도 읽어 최소 수정 범위를 결정했다. 현 책임을 기존 기록 스킬이 맡을 수 있으므로 새 스킬·helper·테스트를 만들지 않는다.

## 확인한 공백과 최소 변경

기존 reference는 유료 호출 수와 예약 한도·단계 시간·리뷰 입력을 다룬다. 새 요청에는 상한 정책의 명시 이관, 공유 장부를 쓰는 동시 조건, 기존 준비물 재사용이라는 구체 상황이 추가됐다. [record-contract의 DAG 참고 절](../../skills/jev-decision-records/references/record-contract.md#artifact-dag-evidence)에 다음 두 항목을 추가했다.

- **한도 정책 변경:** 최신 승인·정책 버전·이전/이후 한도를 기록한다. 한도 필드의 적용 계약이 정한 `null`만 무상한이며 사용량/가격의 `null`은 여전히 미확인이다. 무상한을 0·Infinity·큰 가짜 숫자로 대체하지 않는다. 장부 ID·누적 사용량·정산 이력과 불확실 요청 경계를 유지한다.
- **준비 재사용·병렬성:** 동일 바이트의 준비물과 최초 영수증을 연결한다. 이번 준비 신규 지출과 과거 준비비를 비교에 귀속한 금액을 분리한다. 조건 동시 실행·실제 작업자/공급자 중첩·장부 직렬 작업을 구분하고 관측된 대기시간과 실행 일정을 기록한다. D066 순차 실행과 D067 동시 실행은 부하 조건이 다르다.

공통 JSON record 계약·검사기·helper·스킬 discovery metadata·설치 사본은 변경하지 않는다. D067 실행 한도 값과 작동 방식은 역할 계약 및 root의 실험 문서가 정본이며, 이 문서나 스킬에 별도 런타임 사양을 만들지 않는다.

## 사전 적용의 검증 범위

실제 실행 전 문서 사례를 수동 대조했다.

1. 과거 D066의 650,271 + 예약 65,536 > 700,000 실패를 보존한다. 새 승인 때문에 과거 stop을 API 성공이나 제품 완료로 바꾸지 않는다.
2. D067 계약에서 무상한으로 정의한 한도 `null`과 측정하지 못한 실제 청구액 `null`을 구분한다. 과거 v2의 제한 의미를 소급 변경하지 않는다.
3. 준비 catalog를 동일 바이트로 재사용할 경우 새 생성 호출 수는 0으로 기록할 수 있지만, 과거 준비비 귀속은 출처·산식이 있는 별도 비교 열이다. 실제 재사용 검증과 실행 영수증이 오기 전에는 이 조건의 실측값으로 확정하지 않는다.
4. 조건 4개를 함께 시작하도록 설정한 것과 실제 중첩 관측을 구분한다. 요청별 원자적 정산으로 인해 Jev 호출이 직렬화되더라도 작업자까지 모두 직렬이었다고 추론하지 않는다.

이것은 작성자의 지침 적용 검토다. 무상한 이관 구현·병렬 실행·호스트 자동 스킬 호출·효율 개선은 이 검사로 검증되지 않는다. 실제 결과가 도착하면 관측된 의미적 누락이 있는지만 검토하고 이 문서에 이어 기록한다.

## 실제 검사와 현재 설치 상태

변경 전 inventory는 실제 exit 0이었다. records 원본 tree `1aef61f32fc261393ae9097e516cf662776b3a2f13785be12a33a5deb4524e90`, reference `18b86caa49840728b20e243e053d9e1b61ea0eb32da9cce2050895b9f9d6c2df`는 D066 최종 관측과 같았다. maintenance 원본 tree는 `7445e650fff623c91b8a56bcaeb3756ef6de03293ce3303b43fcb06047dd73cd`다.

확인한 Codex records 사본 tree는 `93710658c36fcb02895e66e98e8724842c9e9dffcc2bdd152ccf4bffbf966979`이며 원본과 `SKILL.md`·`references/record-contract.md`가 다르다. maintenance는 확인한 Codex/agents 루트에 없고 records도 agents 루트에는 없다. 파일 비교는 설치·발견·호출·사용자 효과를 입증하지 않는다. discovery/invocation 관측은 false다.

재현 명령은 저장소 루트에서 실행한다.

```sh
python3 /Users/lee/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/jev-decision-records
python3 skills/jev-skill-maintenance/scripts/inventory_skills.py \
  --source-root skills \
  --installed-root /Users/lee/.codex/skills \
  --installed-root /Users/lee/.agents/skills
git diff --check -- skills/jev-decision-records/references/record-contract.md docs/skills/MAINTENANCE.md docs/agents/D067_SKILLS.md
```

변경 후 실제 구조 검사는 `Skill is valid!`, exit 0이었다. inventory도 exit 0이며 records 원본 tree는 `da1a397fbee8855ee9c7ef6c785f4c94fd14325a4747dc2dad172a5a246e0aeb`, reference SHA-256은 `9598810d4fb02281eb97cbc287073825d902bd7ac56c094f56cb711ed0d8be5e`다. 스킬 원본 2개와 기록 스킬 5개 파일(기존 캐시 포함)을 확인했고 maintenance·검사기·캐시·설치 사본의 해시와 설치 상태는 변경 전과 같다. `git diff --check`도 exit 0이었다. 이 확인은 구조·파일 비교이며 새 지침의 효과 측정이 아니다.

기존 helper와 생산 소스가 바뀌지 않았으므로 helper 테스트·프로젝트 전체 회귀를 이 역할에서 반복 실행하지 않았다. 새 문서와 기존 reference의 링크를 직접 대조했으며 별도 호스트 실행은 하지 않았다.

## 사전 미완료와 인계 기록

- 최초 사전 기록 시점에는 실행 전 정책·이관 근거가 도착하지 않았다. 아래 2026-10-11 14:52 KST 후속에서 실제 이관·probe·시작 근거를 확인했다. 제품 완료·종료 비용/속도와 최종 정산은 아직 미측정이다.
- 후속 trigger는 D067 실제 실행 자료 수신이다. 기존 role·source·receipt·단계별 결과와 비교 경계만 검토하고 새 유료 호출이나 자동 반복을 만들지 않는다.
- 현재 변경은 이 문서, MAINTENANCE, 기존 records reference 1개다. 설치 사본·원장·개인 OS·생산 코드·컨테이너에는 부수 효과가 없다.

## 2026-10-11 14:52 KST — 실제 이관·시작 근거 수신

root가 전달한 [migration-validation](../../benchmark-runs/d067-preflight/migration-validation.json), [이관 전 사본](../../benchmark-runs/d067-preflight/ledger-before-migration.json), [이관 후 사본](../../benchmark-runs/d067-preflight/ledger-after-migration.json), [live-probe](../../benchmark-runs/d067-preflight/live-probe.json), [launch-gate](../../benchmark-runs/d067-preflight/launch-gate.json)를 읽었다. 실제 장부를 추가 변경하지 않고 저장 사본의 필드와 SHA-256을 Node `readFileSync`/`createHash('sha256')`로 대조했다.

- 이관 검증 기록은 `2026-10-11T05:48:47.981Z`, status `passed`, provider calls 0이다. `budget_id`, 누적 입력 **9,584,555**, 정산 **483**, `last_settlement`, `pending`, `blocked_code`의 6개 필드를 사본 간 비교해 **6/6 동일**을 확인했다. schema는 v2→v3, 한도는 10,000,000→명시적 null이다. 이는 이관 순간의 스냅샷이며 현재 실행 중 잔액이나 최종 사용량으로 대체하지 않는다.
- 이관 전/후 사본 해시는 각각 `4dd24db0ffa3afea34374e84fa3e9f95f07786843293d2239d99d7544cf1f551`, `d4543fe64393001c6fcda6cf2a6fcfb2a0b80939d4cbd7c4749437ff46a900c4`로 검증 기록과 일치한다. probe의 조건 토큰 한도와 공유 장부 한도는 모두 null이고 `unlimited:true`다. 실제 청구액의 null은 여전히 미확인이다.
- probe는 `ready`, paid calls 0, model lookup inference calls 0이다. 환경 준비 확인과 생성 후보의 제품 성공은 별개다. launch gate는 14:50:27 KST에 `ready`이며 실행 전 문서 사본을 고정했다. 이 문서의 당시 사본은 [frozen D067_SKILLS](../../benchmark-runs/d067-preflight/frozen-docs/4-D067_SKILLS.md), SHA-256 `291e611f2355e80762a277eed5c5135e4c74e5db2e73d1adac98702cc4540a2b`로 보존한다. 현재 문서에 상태를 추가하는 것은 그 사본을 덮어쓰는 작업이 아니다.
- root 보고상 driver session **70195**가 새 [d067-comparison-01](../../benchmark-runs/d067-comparison-01/)의 4조건을 실행 중이다. 기록된 명령은 `node scripts/adaptive-dag-comparison.mjs --manifest benchmarks/e2e-swe/manifests/d067-adaptive.json --spend --catalog-preparation benchmark-runs/d066-catalog-01 benchmark-runs/d067-comparison-01`이다. 이 역할은 이 명령을 실행·재시작하지 않았다.

시작 사건도 각 `events.jsonl`의 개행으로 끝난 완결행만 읽어 확인했다. cohort의 첫 사건은 14:50:47.619 KST, `claude_all`의 `arm_start` 장부 획득은 14:51:19.325 KST다. `jev_split_relations`의 첫 장부 획득은 14:52:29.416 KST, 기록된 대기 70,098ms였다. 읽은 시점 `jev_all`에는 완결행이 없었다. 이는 시작 순간의 관측일 뿐 최종 동시성·작업 성공 판정이 아니다. 원자적 장부 획득 대기는 조건 동시 dispatch와 공급자/작업자의 실제 중첩을 구분해야 한다는 사전 규칙에 해당한다.

첫 일회성 읽기는 빈 JSONL을 `JSON.parse`해 `Unexpected end of JSON input`으로 exit 1이었다. 빈 행·아직 닫히지 않은 끝 행을 제외한 읽기 재조회는 exit 0이었다. 이 읽기 명령의 결함을 실행기나 Jev 실패로 분류하지 않는다. helper나 실행기 코드를 바꾸지는 않았다.

이번 후속 수정은 **D067_SKILLS와 MAINTENANCE만**이다. 스킬/reference/생산 소스는 동결 상태를 유지한다. 실제 호출·원장·컨테이너 조작·설치·테스트 재실행은 없고, 최종 결과가 오면 같은 기록에 추가한다.

## 2026-10-11 15:50 KST — 종료 근거 적용과 최소 보완

root의 종료 요청에 따라 [분석 02](../../benchmark-runs/d067-analysis-02.json), `jev_all`의 원본 [결과](../../benchmark-runs/d067-comparison-01/jev_all/result.json)·[실패 영수증](../../benchmark-runs/d067-comparison-01/jev_all/receipts/jev-0056.json), 저장된 [환불 근거](../../benchmark-runs/d067-refund-01/evidence.json)·[UI 관측](../../benchmark-runs/d067-refund-01/ui-observation.json)·[정산 결과](../../benchmark-runs/d067-refund-01/reconciliation.json)를 읽었다. 소스 조회는 현재 client의 전송 직렬화와 로컬 바이트 한도 확인에 한정했다. 숨김 검사 내용·후보 코드·인증 키를 읽거나 모델을 호출하지 않았다.

읽은 분석 02의 SHA-256은 `75cd0b53a34447fffbaac5584b2e6136e4425e9a7c83cfbb78ffc93a1914fd05`다. `jev_all` 결과·실패 영수증·환불 evidence/reconciliation/UI·정산 전후 장부 사본의 **7개 해시 중 7개**가 분석의 source pin과 일치했다. 이 확인은 선택된 증거의 파일 동일성 검사이며 전체 코호트 독립 재감사는 아니다.

### 실제 관측을 적용한 판단

1. **제품 완료 조건:** 분석 `rows[*].public_and_independent_completion`이 true인 수는 **3/4**다. `claude_all`, `jev_split`, `jev_split_relations`는 최종 공개 85/85와 독립 63/63을 충족했다. `jev_all`은 독립 63/63이지만 공개 83/85·실패 2개라서 결합 완료 false, 성공 완료시간 null이다. 분석의 `product_success`는 독립 채점 의미로 true일 수 있으므로 단독으로 전체 완료를 주장하지 않는다. 독립 검사 실패 세부내용을 수리로 넘기는 동작도 허용하지 않는다.
2. **실제 수리 범위:** Claude는 공개 실패 후 수리 1회를 실행했다. 두 Jev 혼합 조건은 공개 첫 검사부터 85/85라서 수리 0회다. `jev_all`은 수리 판단 1질문을 전송했지만 HTTP 400 `model_input_limit`으로 답을 받지 못했고 수리 작업자는 실행되지 않았다. 요청을 보냈다는 사실을 수리 실행·수리 성공으로 세지 않는다.
3. **바이트와 토큰:** 실패 요청 [jev-0056.request.json](../../benchmark-runs/d067-comparison-01/jev_all/calls/jev-0056.request.json)은 들여쓰기 포함 증거 파일 **251,877바이트**, 그 JSON을 client와 같은 `JSON.stringify(body)`로 직렬화한 값은 **188,240바이트**다. 후자는 로컬 **240,000바이트** 한도보다 작다. HTTP 오류는 모델 입력 한도를 가리키지만 실제 모델 입력 토큰 수·정확한 초과량은 제공되지 않았다. 무상한 지출 정책이나 HTTP 크기 검사 통과를 모델 문맥 한도 통과로 바꾸지 않는다.
4. **실패와 정산:** HTTP 사건은 실패가 확정됐고 `outcome_uncertain:false`다. 원본 어댑터 영수증/실행 결과는 사용량 미확인·예약 미해제로 `uncertain`을 보존했다. 이후 root가 저장된 실패/환불 UI 행, 응답의 무과금 안내, 새 credits GET으로 r618을 정산했다. 누적 입력 **12,096,997**은 유지됐고 정산 **617→618**, pending **1→0**이 됐다. 해당 실패 요청의 실제 청구액은 확인된 0이지만 추론 입력 토큰은 null이다. 이 역할은 실제 UI/계정을 재조회하거나 장부를 수정하지 않았으며 저장 근거만 읽었다. UI에는 공급자 run UUID가 없어서 시각·질문 수·인접 성공 내역을 이용했다는 연결 한계도 유지한다.
5. **준비 재사용:** 분석의 `shared_preparation`은 `reused:true`, 신규 호출 0·신규 준비 비용 0이다. 과거 D066 준비 영수증은 별도 귀속 근거로 남고 이번 물리적 지출에 다시 더하지 않는다. 동시 조건별 장부 시작/끝 사용량 차이에는 다른 조건 지출이 섞이므로 조건 비용은 연결된 요청별 정산으로 계산해야 한다.

바이트 재현 명령(추론·파일 변경 없음):

```sh
node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';
const path = 'benchmark-runs/d067-comparison-01/jev_all/calls/jev-0056.request.json';
const raw = readFileSync(path);
const body = JSON.parse(raw);
console.log({ evidence_file_bytes: raw.byteLength,
  serialized_body_bytes: Buffer.byteLength(JSON.stringify(body), 'utf8') });
NODE
```

client의 `prepareDecision`은 `JSON.stringify(body)`를 만들고 POST는 `prepared.serialized`를 전송한다. 위 비교는 그 직렬화 규칙과 저장 요청을 대조한 오프라인 재계산이다. 네트워크 packet capture나 공급자 내부 tokenizer 계측은 아니다.

### 종료 후 변경과 검증

실제 실패에 대응해 기존 [record-contract](../../skills/jev-decision-records/references/record-contract.md#artifact-dag-evidence)에 입력 크기와 실패/정산 항목 2개를 추가하고, 기존 검사 항목에 공개·독립 검사 결합 및 숨김 피드백 경계를 보완했다. 런타임 한도를 바꾸거나 이번 실패를 재실행하지 않는다. 동결된 protocol·production·worker source·런타임 원본·실행 전 문서 사본은 그대로이며 종료 후 reference 변경 시점을 별도 기록한다.

위와 같은 `quick_validate.py`, inventory, `git diff --check` 명령을 실제 실행했다. 구조 검사는 `Skill is valid!`, inventory와 diff 검사도 exit 0이었다. 최종 records tree는 `fb6258276891dc332afa74a79f0d2cdbbe4c687f6ec6d9abddd327f398525f2d`, reference SHA-256은 `6e951a759c0c868ba85a25428d7b03053abb0f37fdb4ed60790c1b52988fc3ed`다. 실행 전 `da1a397f…`/`9598810d…`는 위 관측과 동결 사본으로 보존한다. maintenance 원본·Codex 설치 사본·cache·검사기·설치 상태는 유지됐고 discovery/invocation은 false다. helper·검사기·schema·실행 코드를 바꾸지 않았으므로 테스트 행렬·새 스킬·전역 사본을 추가하지 않았다.

이 역할의 종료 범위는 **스킬 원본의 최소 안내 보완과 저장된 실제 사례 적용**이다. `jev_all`의 수리 성공·반복 실험 일반화·호스트 스킬 자동 발견/호출·월 구독 청구 총액은 여전히 미검증이다. 후속 trigger는 입력 투영/수리 payload 변경의 새 실험 또는 같은 기록 혼동의 재발이며, root가 작성하는 최종 결과·결정 기록을 정본으로 사용한다. 변경 파일은 이 문서, MAINTENANCE, 기존 record reference다. 새 유료 호출·원장 조작·컨테이너·전역 설치·Git 커밋/푸시는 이 역할에서 수행하지 않았다.
