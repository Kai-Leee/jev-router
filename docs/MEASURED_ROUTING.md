# Jev + DAG 라우팅 실측

[English](MEASURED_ROUTING.en.md) · [README](../README.ko.md)

## 완료된 D067 비교

2026-10-11 OpenAPI Python client generator 실험에서 코딩 작업자는 Claude로 유지하고,
분해·의존 관계 판단을 구조화 Claude 판단 경로에서 Jev로 이전했습니다. 선택한 Jev 조건은
기준선보다 **개발 단계 시간 21.84%, 당시 API 단가 환산 비용 58.52% 감소**를 기록했습니다.
두 조건 모두 **공개 85/85, 독립 63/63 검사**를 통과했고, 독립 검사 미실행은 0개였습니다.

| 기록 항목 | Claude 판단 + Claude 작업자 | Jev 분해·의존 관계 판단 + Claude 작업자 |
|---|---:|---:|
| 조건 ID | `claude_all` | `jev_split_relations` |
| 성공한 개발 단계 경과시간, ms | 2,180,703.603375 | 1,704,539.968833 |
| 당시 API 단가 환산 비용, USD | 21.1351716 | 8.7665802 |
| 공개 검사 통과 | 85/85 | 85/85 |
| 독립 검사 통과 | 63/63 | 63/63 |

D067 동시 실행 비교군에서 선택한 두 조건이며, **조건별 관측은 1회**입니다. 공통 과제·공개
준비 목록·Opus 5.5 medium 작업자 프로필·조건당 동시 작업자 2개를 고정했습니다. 기준선은
구조화된 판단 질문을 사용한 경로이며, 가능한 모든 Claude Code 사용법을 측정한 것은 아닙니다.
이 기록은 관측한 작업 흐름 비교를 보여주며 Jev 추론만의 인과 효과와 구분합니다.

## 측정 범위와 산식

개발 단계 시간은 공통 사전 검사 이후 시작하며 판단·구현·수리·공개 검사·정리를 포함합니다.
과거 공통 준비, 독립 채점, 별도 모니터는 이 시간 범위 밖입니다. 독립 채점은 네트워크를 차단한
새 검증기에서 수행했고, 채점 전후 후보 파일 불변과 검증기 컨테이너 제거를 확인했습니다.

감소율의 분모는 Claude 기준선입니다.

```text
시간 = (2,180,703.603375 − 1,704,539.968833) / 2,180,703.603375 × 100
     = 21.835321% → 21.84%
비용 = (21.1351716 − 8.7665802) / 21.1351716 × 100
     = 58.521367% → 58.52%
```

비용은 2026-10-11 기록한 단가를 적용했습니다. Jev는 입력 백만 토큰당 $0.60·출력 무료,
Opus 5.5는 일반 입력 $4/M·출력 $20/M·1시간 캐시 생성 $8/M·캐시 읽기 $0.20/M입니다.
호출별 사용량 영수증에 당시 비교 단가를 적용한 값이며, 현재 가격·실제 구독 청구액·월정액
배분액이 아닙니다. 캐시 생성·읽기는 별도 항목으로 계산하고 일반 입력으로 중복 과금하지 않습니다.

## 근거와 재현

- [D067 전체 실험·분석 기록](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D067_RESULTS.md)
- [실행 전 비교 프로토콜](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D067_EXPERIMENT.md)
- [실제 작업자 배정](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D067_TASK_ASSIGNMENTS.md)
- [결정 기록과 근거 참조](https://github.com/Kai-Leee/pointsman/blob/research/docs/decisions/D067.md)

보존한 로컬 분석은 `benchmark-runs/d067-analysis-02.json`의 `claude_all`,
`jev_split_relations` 행입니다. 원본 호출별 영수증과 후보 채점 근거에 연결됩니다.
실행 원본은 실험 작업공간에 보존하며 이번 배포에는 포함하지 않습니다. 해당 근거 작업공간에서
다음 명령으로 새 추론 없이 분석을 재계산할 수 있습니다.

```sh
node benchmark-runs/d067-preflight/analyze.mjs <NEW_OUTPUT_JSON>
```

원래 유료 실행 명령은 전체 연구 기록에 남아 있습니다. 기존 출력 디렉터리는 보존할 근거이므로,
별도로 승인된 재현 실행에는 새 디렉터리를 사용합니다.

## 판단과 실행의 연결

Jev의 분해·관계 판단은 실제 DAG 노드와 의존 관계, 각 작업자의 허용 파일 범위에 연결됐습니다.
후속 작업은 필요한 산출물이 준비된 뒤 시작했습니다. 공개 검사는 후보·검사기·환경·산출물 버전에
연결했습니다. 따라서 실행과 분리된 분류 요청 시간 대신 실제 작업 수행을 측정한 결과입니다.

고급 DAG 실행기는 연구 구현에 속합니다. main 배포는 Jev 클라이언트·실행 계약·평가 도구·
대시보드를 제공하며, 현재 실험 구현은
[연구 체크포인트](https://github.com/Kai-Leee/pointsman/blob/research/docs/agents/STATE.md)에서 확인할 수 있습니다.
