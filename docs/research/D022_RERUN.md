# D-022 재실행 결과 — 2026-10-09

실행: `e2eswe-d022-05`. 사용자 재실행 요청에 따라 새 offline 컨테이너에서 원 목표부터 다시 구현했다. 기존 Personal OS는 실행·변경하지 않았다.

## 이번에 확인한 완료 범위

Claude Opus5.5 구현 → Jev 판단 → 격리 명령 → Jev 완료 승인 → 컨테이너 정지/산출물 고정 → 원본 export → 새 offline verifier 독립 채점까지 완료했다.

- 실행 시간250725ms(약4분11초), CLI exit0, runner completed, artifact_frozen:true.
- Jev 추론11회: 명령 선택7회, 완료 판단4회. 응답·정산11/11, 명령 실행7회, 입력 거절0, 불확실 요청0.
- 완료 판단 순서는 continue / continue / continue / finish. 마지막 선택 확률 finish0.67, continue0.21, abstain0.12. 이는 검증된 정답률이 아니다.
- 원본 산출물의 독립 테스트30/30 통과, 실패/skip0, reward1, resolved:true, 기대30개 모두수집.
- 별도 Opus5.5 monitor7개 실행이 모두종료됐다. monitor결론은 독립채점을대체하지않는다.

## 이전과 달라진 조건

원래 instruction.md에 [설치 인계 계약](../../benchmarks/e2e-swe/artifact-contract.md)을 추가했다. /app 파일만 새 환경에 복사되며 setup.sh를 제출해야 한다는 실행 계약만 명시했다. 구현계획·숨은테스트·정답은 전달하지 않았다. 완료판정 코드와 모델 설정은 바꾸지 않았다.

이번 setup.sh는 구현 에이전트가 직접 생성했고 `pip install --no-build-isolation --no-deps --no-index -e .`를 실행한다. main은 산출물을 수정하지 않았다. 이전04의 사후 설치 진단과 다르게, 이번은 원본 제출 자체가 통과했다. 단, 동일 입력의 반복실험이나 무작위 대조실험은 아니므로 개선의 인과 효과·속도 우위를 주장하지 않는다.

## 비용 및 토큰

- 이번 Jev: 입력13314/출력440, 월Creator배분 추정USD0.0064351. 출력무료. 실제달러추가청구는미확인.
- 이번 구현Claude: 입력26/출력26017/cache read407633/cache creation47540(1h), API환산추정USD0.9822906.
- 이번별도monitor:7개완료기록의 CLI보고 API환산합계USD0.605524. 구현비용에숨겨합산하지않는다.
- 전체공유장부:37회/37874차감입력, 보수적예산사용USD0.0227244로 기존USD1안. 월요금배분추정USD0.0183057667. pending없고 blocked_code:null. 장부초기화/한도변경없음.

원자료·집계: [재실행 보고서](../../benchmark-runs/diagnostics/d022-rerun-report.json), [실행 결과](../../benchmark-runs/e2eswe-d022-05/result.json), [독립 채점](../../benchmark-runs/grade-d022-05/result.json), 해당run의 decisions.jsonl/claude.stream.jsonl.

## 아직 확인하지 못한 것

1. 완료 판단의 반복 안정성. 마지막 finish 입력에는 직전 이후 코드 변경이 없다고 명시됐지만, 요약 문구는 달라졌다. 무엇이 선택을 바꿨는지 응답에 이유가 없어 알 수 없다. 완료 근거의 자기완결성/미충족항목 계약은 여전히개선대상이다.
2. Claude단독 대비 정확도·전체시간·비용 절감. 단일과제1회성공은 비교평가가아니다.
3. 새디렉터리PersonalOS 구현실험과 UI/native검증. 이번재실행대상은E2E-SWE pytest-check이다.
4. 독립grader결과의 구현run패널자동연결. 현재 별도grade기록으로 보이며 구현패널의 평가전 표시는 실행종료와채점연결의 UI공백이다. 저장된독립채점성공은명확하다.

## 재현한 명령과 부수 효과

```sh
node bin/paired-run.mjs --config benchmark-runs/d022-e2eswe-run-05.json
node bin/paired-run.mjs --config benchmark-runs/d022-e2eswe-run-05.json --spend
/opt/homebrew/bin/python3.14 benchmarks/e2e-swe/adapter.py export --container jev-e2eswe-d022-05 --output benchmark-runs/candidate-d022-05
/opt/homebrew/bin/python3.14 benchmarks/e2e-swe/adapter.py grade --workspace benchmark-runs/candidate-d022-05 --image-lock benchmark-runs/image-lock-pytest-check.json --output benchmark-runs/grade-d022-05
```

위output은이미사용됐으므로 그대로재실행하지않는다. 이전상태/예산을읽고 새실험을만들어야한다. 자동재시도0. verifier컨테이너는제거됐고 구현컨테이너는정지보존했다. localhost8787은켜져있으며 관련문서/설정/영수증은로컬미커밋상태다. 이번은실행검증이며제품소스수정은없어 npm전체회귀검사는다시돌리지않았다.

## 원인 재감사 — 사용자 요청 후 저장 기록 대조

추가 유료 호출 없이04/05 decisions.jsonl의모든finish입력/응답과makeRequest를대조했다.
설치누락은지시/검증계약불일치및setup.sh단독개입으로원인을좁혔지만, Jevcontinue의내적이유는미확인이다.

- Jev는각호출에서 input.state와purpose/criteria만받는다. 전체원명세·과거state·실제검증출력은자동첨부되지않는다. 따라서 “Earlier evidence still applies”는문맥전달이아니다. Claude의자체요약을검증증거로판단하는구조다.
- continue는“추가구현또는검증필요”, abstain은“근거불충분”이다. 확인할근거가부족한상태는둘다해당할수있고, 미충족요구사항/후속증거항목은응답계약에없다. 이중첩과피드백부재는확인된설계공백이나특정응답의원인으로확정하지않는다.
- 이번decision10→11사이실행명령/코드변경은없다. 그러나purpose/state는달라졌다: 마지막은이전unzip미설치문구를생략하고pseudo-traceback/--check-max-tb선택을추가했다. 실제응답모델표시도jev-1.13.0→typesafe-ai/jev로달랐다. 별칭이다른가중치/서비스를뜻한다고단정할수없으나, 동일입력·고정응답식별자의반복실험이아니므로선택변화의원인을분리할수없다.
- 완료확률0.35→0.67변화는“코드를고쳐서정답률이올랐다”는증거가아니다. 확률은선택분포이고정답률이아니다.
- 대시보드미연결은reader가각폴더result.json을별도로읽고metrics가그result만evaluation에넣기때문이다. 실행폴더와grade폴더를연결하는명시적artifact/run평가기록참조가없다. 채점실패가아닌표시연결미구현이다.

다음수정우선순위제안: 원명세의검증항목+결과+artifact식별자를갖는자기완결적입력계약 → 완료/추가작업/근거부족의배타적분류와미충족항목ID → 결정적설치/테스트증거와모델판단분리 → 고정입력·모델식별자별반복실험 → 독립채점참조연결. 이번원인재감사에서는이수정들을실행하지않았다.
