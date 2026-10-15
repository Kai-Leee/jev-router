# D067 이후 결과 연혁

[English](POST_D067_RESULTS.en.md) · [완료된 D067 비교](MEASURED_ROUTING.md) · [기능 구분](CAPABILITIES.md)

확인일: 2026-10-16. D067이 마지막 실험은 아니다. 이전 메인 요약은 D067의 완료된 비교 세 행을 강조했지만 후속 실행의 결과 연혁을 제공하지 않았다. 이 문서는 그 누락을 보완한다.

이번 표는 공개 research `5f9b668`의 결과 문서와 보존된 로컬 Codex 보고서를 확인해 작성했다. D067처럼 후속 실험 전체의 원시 영수증을 새로 재집계한 것은 아니다. 각 행에 근거를 연결하고, 공개 검사 버전·실행 범위가 다른 결과를 하나의 절감률로 합치지 않는다.

## D068–D071: 입력·분해·수리·모델 선택

| 단계 | 무엇을 실행했나 | 확인된 결과 | 시간·토큰과 해석 |
|---|---|---|---|
| [D068](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D068_RESULTS.md) | 수리 입력 축소·실패 원인 전달·비선택 작업자 재호출 방지 | 공개84/85·독립63/63. 수리 요청 입력 한도 초과로 미완료 | 중단까지30분43.397초. 관측4,350,647토큰, 실패 요청 사용량 미보고로 전체 미상 |
| [D069](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D069_RESULTS.md) | 실패 assertion 담당·산출물 단위 수리 입력 개선 후 Jev 전체 판단 | **공개85/85·독립63/63 완료**. 최초 후보가 통과해 실제 수리0회 | **39분24.671초·5,809,782토큰**. D067 Claude보다 비용은 낮았지만 시간은 더 길었음 |
| [D070 새 개발](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D070_RESULTS.md) | 큰 묶음 쏠림 완화·강제 재분할·균형 배정 | 당시85/85·63/63 통과. 추가 설명 출처 진단0/8로 품질 회귀 발견 | 34분24.735초·4,267,230토큰. 이후93검사 기준의 동등 품질 성과로 해석하지 않음 |
| [D070 보존 수리](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D070_PRESERVED_REPAIR_RESULTS.md) | 실패 후보에서 A03만 쓰기 가능한 수리 | **공개85/85·독립63/63 완료**. Jev1POST·Claude1CLI, 다른9작업자 모델 재호출0 | **8분53.347초·125,964토큰**. 기존 후보 수리 시간이며 처음부터 개발한 시간과 비교하지 않음 |
| [D071](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D071_RESULTS.md) | 설명 출처 검사8개 추가, Claude/Jev/모델·노력도 선택3조건 | Claude93/93·63/63 완료. Jev고정93/93·60/63, Jev프로필67/93·49/63으로 미완료 | 시작→독립채점39분05.048초/30분52.044초/22분54.804초; 토큰4,589,913/3,648,801/2,874,640. 같은 품질의 완료 절감률 없음 |

D069·D070 개발 시간은 공개 검사까지이며 별도 독립 채점은 제외한다. D070 보존 수리도 독립 채점18.744초가 별도다. D071 행은 독립 채점까지 포함하므로 앞 행과 같은 시간 경계가 아니다. 토큰은 기록된 입력·출력·캐시 생성·읽기와 Jev 사용량 합이며 부분합을 전체로 바꾸지 않았다.

## D072–D085: 복구 안정성과 반복 실행

| 단계 | 진행 내용 | 실제 결과·측정 범위 |
|---|---|---|
| [D072](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D072_INPUT_VALIDATION.md) | 입력 검증 스크립트·이전 요청 감사 | 새 전체 개발 실험은 아님. 입력 검사 통과와 모델의 실제 수락을 구분 |
| [D073](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D073_RESULTS.md) | 기존 담당 추론→선택 산출물 수리 실행 | 공개79→91/93·독립60→61/63. 실제 수리했지만 후속 owner 요청 거절로 미완료 |
| [D074](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D074_PROMPTING_AND_FAILURE_LOOP.md) | prompting 스킬·고정 질문 검사·복구 루프 설계 | 로컬 검증 단계. 이 단계에서 새 전체 개발 완료 비교 없음 |
| [D075](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D075_RESULTS.md) | 강제 전송 검사·복구 루프 연결, 보존 후보 수리 | 공개88/93·독립60/63. 후속 요청 거절로 미완료 |
| [D076 / D081 문서 §2](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D081_REPAIR_PATH_AND_RESULTS.md) | 수리 작업자의 읽기 범위 확대 | 같은79/93 출발 후보: 확대 전88/93·60/63·527.7초, 확대 후 **93/93·63/63·270.4초**. 수리2회→1회, 각1회 관측 |
| [D077](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D077_QUESTION_FORMS.md) | 질문 유형·단위 관계·모델/effort·담당·수리 범위 재설계 | 공개84/93·독립63/63, 미완료 |
| [D078](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D078_LAYERED_INTEGRATION.md) | 인터페이스 사용과 완성 파일 의존 분리, 깊이 제한 묶음 | 공개93/93·독립60/63, 미완료 |
| [D079](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D079_EVALUATION.md) | 임계 경로 우선·보류 제거·공개 명세 검토 | 보류 없는 전체 개발1회 **93/93·63/63, 25분16초**. 별도 후보3개 명세 검토 수리도 독립63/63 달성. 스케줄 시뮬레이션 수치와 실제 실행은 별도 |
| [D080](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D080_DEFAULTS.md) | 기본 설정 통합·공개 통과 뒤 명세 검토 | 시작된2회 중1회 완료,1회 수리 입력 차단. 별도1회 시작 점검 차단 |
| [D081](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D081_REPAIR_PATH_AND_RESULTS.md) | 입력 packing·읽기 범위·장부 잠금·GET 처리 보강 | 01완료,02독립62/63,03GET502중단,04실행 전 차단,05사용자 중단. 검토가 늘 품질을 개선한다는 이전 표현도 정정 |
| [D082](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D082_CLOUD_RUNS.md) | 클라우드 순차 실행 | **종료 결과가 있는7회 중5회 완료**,2회 실패. 별도08은 사용자 중단. 완료5회93/93·63/63, 시간21분44초–31분42초 |
| [D083](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D083_REPAIR_DIRECTION.md) | 수리 입력v3·작업자 보고 기반 범위 확장 | **3회 중2회 완료**. 새로 추가한 두 규칙은 실제 미발동이어서 해당 수정의 효과는 미측정 |
| [D084](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D084_STRUCTURE_AND_FAILURE_ORIGINS.md) | 이후 실행의 구조·실패 발생 위치 분석 | 새 유료 개발 실험이 아닌 기존 결과 분석. 산출물 간 통합·수리 범위·검사 차이를 분리 |
| [D085 §9](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D085_MULTI_OWNER_AND_DIRECT_REPAIR.md) | 복수 담당·재질문·생성 오류 직접 수리 | **3회 중2회 완료**. 03에서 직접 수리와 작업자 보고 기반 범위 확장이 실제 발동. 회당26.6–27.7분. 복수 담당이 수리 회차를 줄였다는 근거는 없음 |

D082·D083·D085 완료는 각 실행의 공개93/93와 독립63/63을 모두 만족한 경우다. 성공률의 분모는 각 표본에만 적용하며 조건이 달라 합산하지 않는다. D082 독립 채점은 CPU4였다. 이 세대의 연구 문서에 적힌 Jev 토큰은 주로 **Jev 입력만**이므로, 그것을 Claude 캐시·출력까지 포함한 전체 토큰 합계처럼 게시하지 않는다.

## 이후 로컬 Codex 비교

공통 Codex 작업자로 판단 주체를 바꾼 비교도 실행했다. 새 Codex 조건은 공개92/93·독립59/63으로 미완료였다. Jev 조건은 마지막 검사 중 Docker 종료로 미확정이며, 사용자가 최종 재채점을 보류했다. 추가 모델 호출이나 Docker 재시작은 하지 않았다.

초기 동일210질문·4호출만의37.85배 시간비와 토큰7.95% 감소는 [별도 판단 구간](MEASURED_ROUTING.md#별도-관측-codex와-jev-초기-분해-판단)에 공개돼 있다. 전체 개발 완료 성과가 아니다. 원본 runtime과 전체 실행 기록은 로컬 개발본에 있다.

## D067이 메인 비교 표에 남은 이유

D067은 같은 비교군에서 작업자·검사 기준을 맞춘 Claude와 Jev의 **완료된 대조 행**을 함께 제시할 수 있다. 이후에는 공개85→93 변경, 모델/effort 선택, 검토·수리 정책, 호스트·동시성·채점 자원 변화가 있었다. 일부는 새 Claude 기준선 없이 Jev 경로만 반복했다.

따라서 이후에 성공이 없어서 D067만 게시한 것이 아니다. 이후 성공·실패·수리 결과도 위와 같이 존재하지만 **기능 발동 근거, 완료 안정성, 동일 조건 효율 비교**를 서로 다른 결과로 읽어야 한다. 이전 메인 요약은 이 연혁을 누락했으며 이 페이지에서 보완했다. 최신 버전이 D067보다 언제나 빠르고 토큰이 적다는 결론은 아직 없다.
