# D067 — 실제 선택된 작업 묶음

분해·관계 판단이 완료된 네 planning.json에서 직접 작성했다. 공개 원문80요구사항·21구현단위·38파일은 같고, 묶음과 의존 관계는 실제 반환값에 따라 다르다. 구현 완료/품질 결과는 이 목록만으로 판단하지 않는다.

공통 단위의 전체 인터페이스와 인용은 [원본 catalog](../../benchmark-runs/d066-catalog-01/catalog.json)에 있다. 아래 파일 수는 단위 수와 다른 분모다. 모든 작업자는 Opus5.5 medium이며 실행 슬롯은 조건당2개다.

| 단위 | 공개 명세에서 준비한 역할 | 요구사항 수 |
|---|---|---:|
| U01 | Packaging, offline install and entry point | 5 |
| U02 | Command-line interface | 5 |
| U03 | Document loading and validation | 5 |
| U04 | Configuration file | 2 |
| U05 | Naming utilities | 6 |
| U06 | Intermediate representation | 0 |
| U07 | Reference resolution, allOf merging and cycles | 3 |
| U08 | Property type mapping | 6 |
| U09 | Enums, consts and literal enums | 6 |
| U10 | Unions | 3 |
| U11 | Default value conversion | 4 |
| U12 | Model construction from schemas | 5 |
| U13 | Operation parsing | 1 |
| U14 | Diagnostics | 1 |
| U15 | Runtime types template | 4 |
| U16 | Client and errors templates | 3 |
| U17 | Model and enum templates | 2 |
| U18 | Endpoint module template | 12 |
| U19 | Project metadata templates | 3 |
| U20 | Generation orchestration and output layout | 3 |
| U21 | Post-generation hooks | 1 |

## claude_all

[실제 계획 원본](../../benchmark-runs/d067-comparison-01/claude_all/planning.json). 7개 잎. provider 호출42회, 질문62개, 로컬 해소8개.

| 작업자 묶음 | 깊이 | 소유 단위 | 파일 수 | 요구사항 수 | 선행 묶음 |
|---|---:|---|---:|---:|---|
| n1 | 1 | U01, U02, U03, U04, U14, U21 | 9 | 19 | 없음 |
| n2 | 1 | U05, U06 | 2 | 6 | 없음 |
| n5 | 2 | U07, U08, U09, U10, U11, U12 | 7 | 27 | n1, n2 |
| n6 | 2 | U13 | 1 | 1 | n1, n2, n5 |
| n8 | 2 | U19, U20 | 8 | 6 | n1, n2, n5, n6, n9, n10 |
| n9 | 3 | U15, U16 | 4 | 7 | 없음 |
| n10 | 3 | U17, U18 | 7 | 14 | n2, n5 |

## jev_split

[실제 계획 원본](../../benchmark-runs/d067-comparison-01/jev_split/planning.json). 10개 잎. provider 호출47회, 질문90개, 로컬 해소22개.

| 작업자 묶음 | 깊이 | 소유 단위 | 파일 수 | 요구사항 수 | 선행 묶음 |
|---|---:|---|---:|---:|---|
| n2 | 1 | U19 | 7 | 3 | 없음 |
| n3 | 1 | U20 | 1 | 3 | n2, n4, n6, n7, n8, n9, n10, n11, n12 |
| n4 | 1 | U21 | 1 | 1 | 없음 |
| n6 | 2 | U16 | 2 | 3 | 없음 |
| n7 | 2 | U17 | 4 | 2 | n9 |
| n8 | 2 | U18 | 3 | 12 | n9 |
| n9 | 3 | U01, U02, U03, U04, U05, U06, U07, U08, U09, U10, U11, U12 | 16 | 50 | n11 |
| n10 | 3 | U13 | 1 | 1 | n9, n11 |
| n11 | 3 | U14 | 1 | 1 | 없음 |
| n12 | 3 | U15 | 2 | 4 | 없음 |

## jev_split_relations

[실제 계획 원본](../../benchmark-runs/d067-comparison-01/jev_split_relations/planning.json). 10개 잎. provider 호출47회, 질문90개, 로컬 해소22개.

| 작업자 묶음 | 깊이 | 소유 단위 | 파일 수 | 요구사항 수 | 선행 묶음 |
|---|---:|---|---:|---:|---|
| n2 | 1 | U19 | 7 | 3 | 없음 |
| n3 | 1 | U20 | 1 | 3 | n2, n4 |
| n4 | 1 | U21 | 1 | 1 | 없음 |
| n6 | 2 | U16 | 2 | 3 | 없음 |
| n7 | 2 | U17 | 4 | 2 | 없음 |
| n8 | 2 | U18 | 3 | 12 | n6 |
| n9 | 3 | U01, U02, U03, U04, U05, U06, U07, U08, U09, U10, U11, U12 | 16 | 50 | 없음 |
| n10 | 3 | U13 | 1 | 1 | n9 |
| n11 | 3 | U14 | 1 | 1 | 없음 |
| n12 | 3 | U15 | 2 | 4 | 없음 |

## jev_all

[실제 계획 원본](../../benchmark-runs/d067-comparison-01/jev_all/planning.json). 13개 잎. provider 호출42회, 질문117개, 로컬 해소28개.

| 작업자 묶음 | 깊이 | 소유 단위 | 파일 수 | 요구사항 수 | 선행 묶음 |
|---|---:|---|---:|---:|---|
| n2 | 1 | U18 | 3 | 12 | 없음 |
| n3 | 1 | U19 | 7 | 3 | 없음 |
| n4 | 1 | U20 | 1 | 3 | n2, n3, n5 |
| n5 | 1 | U21 | 1 | 1 | 없음 |
| n7 | 2 | U14 | 1 | 1 | 없음 |
| n8 | 2 | U15 | 2 | 4 | 없음 |
| n9 | 2 | U16 | 2 | 3 | 없음 |
| n10 | 2 | U17 | 4 | 2 | 없음 |
| n11 | 3 | U01, U02, U03, U04, U05, U06, U07, U08, U09 | 13 | 38 | n7 |
| n12 | 3 | U10 | 1 | 3 | 없음 |
| n13 | 3 | U11 | 1 | 4 | 없음 |
| n14 | 3 | U12 | 1 | 5 | n7 |
| n15 | 3 | U13 | 1 | 1 | 없음 |

각 조건의 산출물은 서로 공유하지 않는다. 한 묶음에 다수 단위가 남은 것은 기록된 선택과 깊이3 경계의 결과이며, 균형 잡힌 작업량이라는 뜻은 아니다. 실제 파일·산출물 revision과 공개 검사는 실행 journal에서 확인한다. source pins는 [근거](../../benchmark-runs/d067-preflight/task-assignment-source-pins.json)에 고정했다.
