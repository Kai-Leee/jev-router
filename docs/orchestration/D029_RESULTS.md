# D029 — 모델 문서·커밋·실제 E2E 분할 비교

2026-10-09 KST. 실행 소스 커밋 `887d360ac85eda75ccd52ae5e450ad7afe94026c`. 원래 비어 있던 저장소에 테스트된 소스/문서 239개를 최초 커밋한 뒤 유료 실행했다. 비밀 파일, benchmark-runs, upstream checkout, CLI binary는 커밋하지 않았다. 원격 push 없음.

## 추가한 것

공식 카탈로그: [models.v2.json](contracts/models.v2.json)의 Opus5.5/Fable5.1/Sonnet5.5/Haiku5.5와 low/medium/high/xhigh/max. 4×5=20개 문서상 조합; 실제 모든 조합의 계정 가용성을 검증한 것이 아니다. CLI/API 기본값 차이와 출처는 [공식 조사](D029_MODEL_HOST_RESEARCH.md).

[worker-task.v2.json](contracts/worker-task.v2.json)에 역할 범위/의존 입력/검사 근거/실패·불확실성/다른 작업자 변경 보호/인계 지시를 보강했다. live worker의 파일 출력과 artifacts 일치, 실제 도구가 없으므로 observed_checks 빈 배열을 검증한다. 요청에는 모델/effort/목표/범위/의존/근거를 전달했다. 관측한 실제 모델은 모든 실행에서 claude-opus-5-5이고 effective effort는 직접 관측값 없이 requested medium으로만 기록한다.

Claude는 CLAUDE.md의 @AGENTS.md import, Codex는 AGENTS.md를 진입점으로 사용한다. 격리 worker는 두 호스트의 자동 발견에 의존하지 않고 controller가 문서 본문을 prompt에 넣었다. actual inputs.json에 commit/질문/worker문서/모델카탈로그 해시가 있고 events.jsonl에 실제 system/request가 있다. 호스트 UI 자동 선택까지 검증한 것은 아니다.

## 실험 설계

원문 E2E-SWE pytest-check 명세+기존 설치 계약만 주어 Opus가 계획을 생성했다. 작업은 core-log-traceback / check-api / plugin-and-exports / packaging 4개, 파일은 11개. 핵심 3개는 순차 의존, packaging만 독립. 계획은 고정한 뒤 양쪽에 동일하게 전달했다.

Jev에 questions.v1.json의 사전 split 질문을 실제 호출: `noul=0.66`, 충분근거 choice=sufficient. HTTP812ms, 장부/모델 확인 포함2.225초, 입력6024/출력59. 요청·응답은 [split-decision](../../benchmark-runs/d029-tree-01/split-decision.json).

실제 single→split 각1회 강제 대조했다. .5/.65/.8 임계값은 같은 답의 정책 라벨이며 3회의 독립 실행이 아니다. 새 no-tools Claude 프로세스 worker가 JSON으로 파일을 생성했고 실행기는 소유 경로만 저장했다. native Agent tool 실험이나 D025 셸/검사/수정 반복과 같은 조건이 아니다. 숨은 테스트는 후보 고정 후 별도 Docker verifier에서만 사용했고 구현에 피드백하지 않았다.

## 관측 결과

[재계산 JSON](../../benchmark-runs/d029-analysis-v2.json)의 arms 및 원본 grade에서 산출했다.

| 항목 | 단일 | 분할 |
| --- | ---: | ---: |
| worker 호출 | 1 | 4 |
| 파일 생성 arm wall | 231.135초 | 146.546초 |
| 독립 원본 채점 | 30/30, reward1 | 30/30, reward1 |
| 독립 grader elapsed | 20.143초 | 33.111초 |
| 계획+생성+Jev(분할)+채점 시간 합계 | 303.980초 | 234.584초 |
| worker Claude API환산 비용 | USD0.745212 | USD1.3228552 |
| 계획 포함 + Jev 월배분(분할) 비용 추정 | USD0.905536 | USD1.4860908 |

계획 생성52.701초/USD0.160324는 각 대안에 동일하게 배분했다. 분할의 단계시간 합계가 단일 분모 기준22.829% 작고 생성 arm wall은36.597% 작다. 단일/분할 전체를 한 번씩 실측한 뒤 단계시간을 합산한 값이며, 수동 채점 시작 대기나 두 실험 사이 시간은 제외한다. 한 번의 연속 사용자 wall-clock 실측으로 부르지 않는다. grader 부하/캐시/순서와 단일 표본 한계가 있다.

비용 추정은 단일 분모 기준64.112% 증가. Claude는 CLI보고 API환산이며 구독 실제 추가청구액이 아니다. Jev는 월29USD/60M 입력 배분: 6024×29/60,000,000 = USD0.0029116. 장부보수적 환산은6024×0.6/1,000,000 = USD0.0036144로, 두 항목을 추가 요금처럼 합산하지 않는다.

실제 실험에서 계획을 한 번만 센 Claude환산 총액(계획+단일+분할+별도 Opus모니터)은 USD2.3311192. 독립 모니터1회 USD0.102728는 각 arm 비용 표와 별도다. Jev 누적 장부는47회/72739입력/보수적USD0.0436434, pending/blocked 없음. 기존USD1 한도 안이며 초기화하지 않았다.

## 왜 빨라졌지만 비싸졌나

관측: 분할의 출력 토큰19113은 단일28285보다 작지만, cache creation input은117450 대22438이다. split 캐시읽기는4816, 단일0; 일반input은8 대2. worker receipt usage를 arm별 합산했으며 thinking은 output에 이미 포함되어 중복 합산하지 않는다.

구조상 원인: 새 프로세스마다 전체 목표·계획·worker 계약과 선행 파일을 전달했고, 현재 payload에는 같은 원문이 brief/goal/requirements/acceptance 필드에 반복된다. 따라서 작업 범위 단순화·일부 병렬화의 시간 이익과 문맥 중복의 비용 증가가 함께 나타났다. 개별 원인의 인과 기여율을 분리 측정하지 않았다. 동일한 4개 작업을 순차 실행하는 대조군이 없으므로 병렬화만의 효과나 Jev 자동 라우팅의 효과로 귀속하지 않는다. 문맥 중복 제거/관련 근거만 전달/작업별 더 저렴한 모델 선택은 다음 비교 조건이며 이번 결과를 고치려고 실행 중 적용하지 않았다.

## 분할 확률 판정

이번 단일 사례에서는 분할도30/30을 유지하고 단계시간 합계가 짧아 0.66 예측 방향과 관측이 일치했다. .5/.65는 split을, .8은 single을 선택하므로 이 사례에서는 전자가 시간 이익을 취한다. 이는 .65의 최적성이나 p=.66의 calibration을 검증한 것이 아니다. 가격 절감은 질문의 사건 정의에 없었고 실제로 비용은 증가했다. 다른 과제/반복/계획/모델 및 다단계 재귀분할은 미검증이다. 운영 threshold는 null 유지.

## 재현 명령 및 검증

```sh
node bin/show-routing-contracts.mjs
npm test
node scripts/tree-e2e-pilot.mjs benchmark-runs/d025-jev-01.json benchmark-runs/d029-tree-01 --spend
/opt/homebrew/bin/python3.14 benchmarks/e2e-swe/adapter.py grade --workspace benchmark-runs/d029-tree-01/candidate-single --image-lock benchmark-runs/image-lock-pytest-check.json --output benchmark-runs/grade-d029-single-01
/opt/homebrew/bin/python3.14 benchmarks/e2e-swe/adapter.py grade --workspace benchmark-runs/d029-tree-01/candidate-split --image-lock benchmark-runs/image-lock-pytest-check.json --output benchmark-runs/grade-d029-split-01
node scripts/analyze-tree-e2e.mjs benchmark-runs/d029-tree-01 benchmark-runs/grade-d029-single-01 benchmark-runs/grade-d029-split-01 benchmark-runs/d029-analysis-v2.json
```

이 명령은 수행기록이며 --spend를 임의 재실행하지 않는다. 재현 시 출력 경로는 새로 지정한다. 코드 전체375/375 테스트 통과 후 commit. 초기 sandbox auth는 loggedIn=false였으나 키체인 접근 가능한 읽기전용 확인에서 기존 Claude Max 인증을 확인했다. 새 로그인/설치 없이 Desktop symlink CLI2.1.293 사용. 개발 검토에서 실패arm exit0 문제와 필수 worker 출력 누락을 찾고 커밋 전에 보완했다. 아직 큐/파일쓰기 시간은 별도 계측하지 않으며 stage barrier는 슬롯이 비는 즉시 다음 작업을 넣는 scheduler가 아니다.

원본 [single grade](../../benchmark-runs/grade-d029-single-01/result.json), [split grade](../../benchmark-runs/grade-d029-split-01/result.json), [모니터](../../benchmark-runs/d029-tree-01/independent-opus-monitor-result.json), [회귀로그](../../benchmark-runs/d029-full-tests.log). 모니터는 phase와 .8정책의 일관성을 언급했지만 이 실험은 정책이 실행을 정한 것이 아니라 강제 counterfactual 대조였음을 주의한다. 모니터 판단이 실행을 변경하지 않았다.

부수 효과: 최초 source commit과 결과 기록, private raw receipts/candidates/temp CLI cwd가 남았다. verifier2개는 제거 확인. 새 서비스·원격 push·기존 PersonalOS/Vault 변경·전역 스킬 설치 없음. 실제 하위모델 선택/추가 live 확률 calibration은 남아 있다.
