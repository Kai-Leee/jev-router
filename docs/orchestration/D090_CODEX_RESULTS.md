# D090 — 앱 내장 CLI · GPT-6.1-Sol/high 전체 개발 비교

**두 조건 모두 공개93/93·독립63/63으로 제품을 완료했다.** Codex 판단을 분모로 Jev 판단의 전체 시간은 **8.4272% 감소**, 캐시 포함 전체 토큰은 **5.2262% 증가**, 짧은 문맥·표준 단가·미보고 캐시 쓰기0 가정의 참고 합계는 **14.0526% 감소**했다. 토큰 절감은 달성하지 못했다. 실제 구독 청구액이나 일반 성능 우위로 확대하지 않는다.

[기계 집계](../../benchmark-runs/d090-codex-20261016-01/result-audit.json) · [비교·보존](../../benchmark-runs/d090-codex-20261016-01/comparison-summary.json) · [독립 재계산](../../benchmark-runs/d090-codex-20261016-01/independent-metrics-audit.json) · [간결한 수치 정본](../../benchmark-runs/d090-codex-20261016-01/report-metrics.json) · [역할](../agents/D090_APP_CLI_COMPARISON.md) · [결정 기록](../decisions/D090.md).

## 전환과 고정 조건

새 로컬 branch는 feat/d090-app-cli-61-20261016이다. 앱 shell wrapper 대신 실제 Mach-O `/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`를 직접 지정한다. CLI버전0.162.0-alpha.17.2, SHA256 `0d5ac7aae20c4eda6242428d5e218c55ba96d8763fda2a271088ff37104b9d28`를 최초 모델 discovery 전과 호출 전후에 확인한다. 앱 업데이트·경로/버전/해시 불일치는 자동 fallback하지 않고 차단한다. [바이너리 계약](contracts/codex-app-binary.v1.json).

실행기 기본은 [D090 manifest](../../benchmarks/e2e-swe/manifests/pointsman-codex-d090.json)·[gateway v6](contracts/pointsman-routing.v6.json), 요청 모델/노력도는 gpt-6.1-sol/high다. 이 경로는 다른 프로필을 전송 전에 거절한다. 일반 legacy 어댑터의 역사 동작은 보존하고 새 실행기만 opt-in 참고 정산을 연결했다. 전역 PATH·설치된 구형 CLI는 변경하지 않았다. 실제 서버가 사용한 모델 identity·effort·tier는 CLI가 독립 확인값을 주지 않아 미확인이다.

D089의 과제·catalog·질문/선택값-only 처리·분해/관계/수리 정책·공개93/독립63·동시2·최대 작업자30·수리 최대2회는 양쪽 동일하게 유지했다. 모델/effort 자동 최적화와 Claude 명세 검토는 끈 상태다. Mac에서 Codex→Jev 각1회 순차 실행했으며, 추가 catalog·Claude 호출은0이다. 새로운 모델 설정에서 처음부터 생성했고 이전 종료 후보를 재개하지 않았다.

최종 관련 회귀133/133·실패/건너뛰기0, 무추론 실제 환경점검 ready=true·blockers=[]·provider_calls=0을 확인한 뒤427개 기능 소스를 동결했다. 초기 가격 fixture 검사는16/17, 핀 갱신 전 넓은 검사는26/29였으며 각각 fixture 인증 누락과 변경 소스의 낡은 핀을 드러냈다. 첫 출력을 보존하고 최종 핀/검증을 마친 뒤에만 유료 실행했다. [최종 회귀](../../benchmark-runs/d090-codex-20261016-01/root-focused-final-tests.tap) · [환경 사전점검](../../benchmark-runs/d090-codex-20261016-01/environment-preflight-final.json) · [가격 개발 이력](../agents/D090_PRICING_STATUS.md).

## 최종 결과

| 지표 | Codex 판단 | Jev 판단 |
|---|---:|---:|
| 공개 통과/전체 | 93/93 | 93/93 |
| 독립 통과/전체 | 63/63 | 63/63 |
| 실패·미실행·건너뛰기 | 0 | 0 |
| 제품 완료 | 예 | 예 |
| 전체 arm 시간, 독립 채점·최종 제어기 포함 | 24분 42.255초 | 22분 37.343초 |
| 완료 시간, 개발+독립 채점 경계 | 24분 41.155초 | 22분 36.069초 |
| 입력 토큰 | 378,829 | 387,445 |
| 입력에 포함된 보고 Codex 캐시 읽기 | 0 | 0 |
| 출력 토큰, 추론 부분량 포함 | 99,201 | 115,568 |
| 캐시 포함 전체 input+output | **478,030** | **503,013** |
| 판단 호출 | Codex4CLI | Jev5POST |
| 작업자 호출 | 최초6+수리0 | 최초5+수리1 |
| 새 모델 짧은 문맥·표준·쓰기0 참고액 | $1.749668 | $1.398508 |
| 과거 Jev 토큰팩 참고액 | $0 | $0.1052856 |
| 합계 참고 환산액, 추정 | **$1.749668** | **$1.5037936** |
| 실제 구독 청구/월정액 배분/엄격 API 실액 | 미확인 | 미확인 |

전체 시간 차이는 Jev−Codex=-124.912초, Codex1482255.18325ms를 분모로8.42715649% 감소다. 별도 완료 경계에서는8.44517408% 감소·1.092241714배이며 경계 차이를 숨기지 않는다. 두 조건을 합친 pair 전체는47분 22.404초·981,043토큰이다. 임시 CLI환경 준비1.982196초는 pair에만 포함한다. 병렬 작업자 호출 시간 합은 전체 경과시간에 다시 더하지 않는다.

## 판단 절약과 수리 증가

초기4요청의 원문 바이트와 SHA는 양쪽 동일하며53+53+53+51=210질문이다. 호출 영수증 시간 합은 Codex282.691643초/Jev8.102826초로34.8880배 차이다. 이는 Codex CLI 대 Jev wrapper 호출 구간이며 순수 HTTP나 전체 개발 가속률이 아니다. 초기 판단 토큰은191770→167723으로24047 감소했다.

Jev는 첫 공개 검사에서92/93이었다. T.R07.01의 `optional note defaults to UNSET` 실패를 Jev의 기존 담당 추론이 A13/`pyclientgen/schema/models.py`로 연결했다. 선택한 작업자1명이 실제 파일을 변경하고93/93을 만든 뒤, 그 후보로 독립63/63을 확인했다. 나머지4작업자는 carry-forward했고 재호출하지 않았다. 무변경 수리0이다. 수리 작업자는103.283581초·74308토큰·짧은 문맥 참고$0.201312를 사용했다.

| 전체 토큰 구성 | Codex | Jev |
|---|---:|---:|
| 초기 판단 | 191770 | 167723 |
| 수리 담당 판단 | 0 | 25864 |
| 최초 구현 작업자 | 286260 | 235118 |
| 수리 작업자 | 0 | 74308 |
| 합계 | 478030 | 503013 |

Jev 초기 판단+구현은402841토큰으로 Codex478030보다75189 적었지만, 담당 판단25864+수리74308=100172가 추가돼 최종24983토큰 증가했다. 판단 전체 참고액은$0.477332→$0.1052856로77.9429% 감소했고, 작업자 참고액은$1.272336→$1.398508로9.9166% 증가했다. 전체 참고액 감소는 입력 축소를 달성해서가 아니라 판단을 다른 단가의 제공자로 옮긴 효과가 포함된 결과다.

실제 입력 투영 감축은0B다. Jev 수리 packet211268B가 동적 template/import 근거로 전체 문맥을 유지했다. 전체 작업자 packet은 Codex447113→447113B, Jev500536→500536B다. 검증 문맥 commit1개는 남았지만 attachment 이벤트의 attached=false·model_projection_bytes=0이며 모델에 추가 첨부된 근거는0B다. 이벤트 존재를 실제 첨부나 절감으로 세지 않는다. 자동 담당 추가·자동 작업자 생략·중복 차단0회다. [실제 발동과 변경 감사](../../benchmark-runs/d090-codex-20261016-01/independent-metrics-audit.json).

## 새 모델 정산과 미확인 값

[OpenAI 공식 가격](https://developers.openai.com/api/docs/pricing)·[모델 문서](https://developers.openai.com/api/docs/models/gpt-6.1-sol.md)·[캐시 문서](https://developers.openai.com/api/docs/guides/prompt-caching.md)를2026-10-16 확인하고 [공식 원문·해시](../../benchmark-runs/d090-codex-20261016-01/pricing/sources.json)와 [가격 정본](contracts/codex-pricing.v1.json)에 고정했다. Batch/Flex 표를 Standard로 사용하지 않았다.

| USD/백만 토큰 | 일반 입력 | 캐시 읽기 | 캐시 쓰기 | 출력 |
|---|---:|---:|---:|---:|
| 짧은 문맥 Standard | 2 | 0.10 | 2.50 | 10 |
| 긴 문맥 Standard | 4 | 0.20 | 5 | 15 |

기본식은 `((input-read-write)*input_rate + read*read_rate + write*write_rate + output*output_rate)/1e6`다. 캐시 읽기·쓰기는 입력 부분량이며 reasoning은 출력 부분량이므로 중복 가산하지 않는다. 총16 Codex 호출 모두 캐시 쓰기량은 미보고다. 본문 표는 미보고 쓰기0 가정의 참고 시나리오이며 실제0임을 확인한 값이 아니다. Jev의 캐시 부분량도 미보고다.

긴 문맥·Standard·쓰기0 시나리오 합계는 Codex$3.003331, Jev$2.4150166다. 모든 비캐시 입력을 쓰기로 가정한 별도 endpoint도 원시 감사에 보존했다. 문맥/tier/지역·기타 요금/실제 served identity가 미확인이므로 이를 확정 실액·통계 오차 범위로 읽지 않는다. Jev input175476×$0.6/M=$0.1052856은 **과거 토큰팩 참고액**이고 현재 월정액 청구의 추가 비용이나 실제 배분액이 아니다. 이 개발 대화·계측 에이전트의 사용량은 실험 runner 영수증 범위 밖이며 별도 미측정이다.

## 기존 D089와 보존

| 과거5.6→이번6.1 관측 | D089 Codex | D090 Codex | D089 Jev | D090 Jev |
|---|---:|---:|---:|---:|
| 공개/독립 | 60/93·55/63 | 93/93·63/63 | 90/93·59/63 | 93/93·63/63 |
| 제품 완료 | 아니오 | 예 | 아니오 | 예 |
| 전체 토큰 | 393905 | 478030 | 1094757 | 503013 |
| 참고 합계, 당시 모델 단가 | $2.600148 | $1.749668 | $4.272113 | $1.5037936 |

CLI·모델·단가와 생성 산출물이 함께 달라진 관측이다. 이전 실패 시도와 이번 성공의 시간을 완료 가속률로 비교하지 않는다. 새 두 조건 사이의 비교와 세대 간 관측을 구분한다.

새 원시 영수증21건(Codex CLI16+JevPOST5), 양쪽 각8개 공개 suite·고정93ID·독립63요약·최종38파일·후보 채점 전후 SHA·앱 실제 바이너리·프로필·정산을 별도 재계산했다. root427개 소스 변경0, 과거55178파일 변경/누락0이다. 원래 공유 장부 ID를 유지했고 입력175476·정산5 증가가 이번 Jev영수증과 일치한다. 종료 pending0·blocked=null이다. [보존 감사](../../benchmark-runs/d090-codex-20261016-01/preservation-after-final.json) · [동결 감사](../../benchmark-runs/d090-codex-20261016-01/source-after.json).

검사 도구의 한계/정정도 남겼다. 독립 감사의 기존 완료 비율이 full wall을 쓰던 가정은 실제 감사 전에 native completion wall과 일치하게 고치고 full wall 비율을 별도 보존했다. 실제 독립 감사 첫 실행은 통과했다. 선택적인 프로세스 목록 조회는 sandbox가 차단했고 native stream/영수증으로 모니터링했다. [보조 조회 실패](../../benchmark-runs/d090-codex-20261016-01/auxiliary-checks.json). 결과 문서 생성기 초안은 template backtick 이스케이프 누락으로 구문 검사에서 실패했다. 실행 전이므로 문서/측정 출력은 쓰이지 않았고 초안·실패를 보존한 뒤 수정했다. [문서 생성 구문 실패](../../benchmark-runs/d090-codex-20261016-01/finalize-docs.syntax-failure-01.json). 이는 유료 실행·생산 소스나 통과한 독립 감사의 실패가 아니다.

## 재현·남은 일·부수 효과

실행한 명령은 다음과 같다. 종료 출력 폴더를 재개하거나 이 경로로 다시 실행하지 않는다.

```sh
node bin/codex-e2e.mjs pair --spend --execution-host mac \
  --out benchmark-runs/d090-codex-20261016-01/pair --model gpt-6.1-sol --effort high

# 무추론 재집계. 새 출력 이름을 사용한다.
node benchmark-runs/d090-codex-20261016-01/audit-results.mjs --out result-audit-recomputed.json
```

조건당1회·고정 순서·한 과제이며 일반 우위/평균 성능/순수 모델 인과 효과는 미검증이다. 토큰 증가는 남아 있고 입력 투영/추가 문맥 첨부 효과도 이번에 달성하지 못했다. 숨김 검사 상세는 개발·수리 입력으로 열람/재사용하지 않았다. 추가 유료 재실행·수리 정책 변경·모델 자동 최적화 실험은 수행하지 않았다.

임시 인증 HOME과 자체 검사 컨테이너는 정리됐다. 기존 실행 컨테이너5개의 ID·이름·이미지는 그대로이며 Docker는 켜 둔다. 새 worktree의 소스·문서·비공개 증거는 미커밋 상태다. 기존 결과/전역 설치/Personal OS 변경, commit/push/merge는 없다. 다음 실험은 별도 요청과 새 조건·출력 폴더로 진행한다.
