# D070 B — 보존 실패 후보의 실제 수리 완료

D068 실패 후보의 새 사본에서 **공개85/85·독립63/63·생략0**을 확인했다. 이전 원본을 수정하거나 기존 성공 후보로 바꾸지 않았다. A의 새 개발은 별도 실행이며 이 수리 시간을 처음부터 개발하는 Claude 기준선과 비교하지 않는다.

실행 명령은 다음과 같으며 root의 paired driver가 A와 동시에 호출하고, B terminal 이후 독립 채점을 연결했다.

```sh
node scripts/preserved-artifact-repair.mjs \
  --manifest benchmarks/e2e-swe/manifests/d070-preserved-repair.json \
  --spend --source-run benchmark-runs/d068-comparison-01/jev_all \
  benchmark-runs/d070-preserved-repair-01
node benchmark-runs/d070-preflight/grade-condition.mjs --grade \
  benchmark-runs/d070-preserved-repair-01
```

[원시 결과](../../benchmark-runs/d070-preserved-repair-01/result.json) · [독립 채점 요약](../../benchmark-runs/d070-preserved-repair-01/independent-evaluation.json) · [보존 증명](../../benchmark-runs/d070-preserved-repair-01/preservation.json) · [실제 선택/쓰기 범위 감사](../../benchmark-runs/d070-review/preserved-live-scope-01.json).

[최종 원시 감사](../../benchmark-runs/d070-review/preserved-raw-01.json)는 62/62, [완료·변경 범위 감사](../../benchmark-runs/d070-review/preserved-completion-01.json)도 통과했다. 공개 소스 diff에서 확인한 수리는 `_target_directory`로 실제 출력 디렉터리를 계산하고, overwrite를 지정하지 않은 기존 디렉터리는 generator 호출 전에 메시지와 exit 1로 거절하도록 바꾼 것이다. 허용된 `__main__.py`도 바뀌지 않아 전체 38파일 중 37파일은 동일하다. 숨김 grader 내용은 수리 분석에 사용하지 않았다.

## 실제 동작

1. 기존 38파일·22산출물을 새 runtime에 복사했다. 10개 implementation operation은 정해진 파일 복사이며 모델 호출은 0이다.
2. 현재 공개 검사에서 기존 실패 `T.integration.diagnostics`의 `existing output refused`를 재현했다.
3. 새 Jev POST 1회가 `repair-failure-owners`/A03을 선택했다. 과거 진단 답변을 재사용하지 않았다.
4. 기존 n9 담당의 13산출물/16쓰기 경로/50개 주요 요구사항에서 A03 하나/2쓰기 경로/5요구사항으로 좁혀 새 Claude repair worker 1회에 전달했다. 전체 public_source/shared_catalog는 수리 prompt에 없다.
5. MCP 허용 경로는 `pyclientgen/cli.py`와 `pyclientgen/__main__.py`였고 실제 쓰기와 SHA 변경은 `cli.py` 하나였다. 다른 작업자 9명의 결과는 carry-forward로 처리하여 provider 재호출은 0이다.
6. 전체 공개 재검사와 독립 채점 후 원본 candidate가 바뀌지 않았으며 비선택 21산출물/36파일의 bytes·0444/0555 권한·revision이 동일함을 확인했다. 미완성 export 증명은 0이다.

## 시간과 사용량

Runner 실측은 **533,346.788666ms(8분 53.347초)**다. 기존 실패 확인·복사·준비·수리·공개 재검사를 포함한다. 독립 채점은 추가 18,743.91725ms이며 채점 전후 candidate가 같았다. 둘의 phase 합은 552,090.705916ms다. 이 합과 실제 UTC 구간/스케줄링 대기 간격은 별도 수치다.

Bootstrap 라운드는 240,447.824417ms, 그 안의 공개 재검사는 186,151.645375ms다. 파일 복사 10 task의 시간 합은 33.243585ms다. 수리 phase 214,439.543125ms 안에 Jev adapter 1,731.796875ms와 Claude adapter 42,373.401875ms가 들어 있다. 이 중첩 시간을 전체 시간에 중복 합산하지 않는다.

| 새 호출 범위 | 입력 | 출력 | 캐시 생성 | 캐시 읽기 | 총 토큰 | 공식 환산 USD |
|---|---:|---:|---:|---:|---:|---:|
| Jev 수리 POST1 | 10,897 | 69 | 0 | 0 | 10,966 | $0.0065382 |
| Claude 수리 CLI1 | 14 | 3,838 | 21,876(1h) | 89,270 | 114,998 | $0.2696780 |
| 이번 B 합계 | 10,911 | 3,907 | 21,876 | 89,270 | **125,964** | **$0.2762162** |

분모는 이번 B의 새 provider 호출 2개다. 과거 후보 생성 비용·A 새 개발·공통 준비의 과거 지출·별도 모니터는 포함하지 않는다. 실제 월 구독 청구 배분은 미상이다. 기존 실패 조건은 수리 worker에 진입하기 전에 멈췄으므로 과거 실제 수리 완료 시간/비용 대비 절감률은 계산할 수 없다.

이번 결과는 새 artifact 수리 경로가 실제로 한 실패를 고쳤다는 증거다. 모든 실패 유형, 반복성, 9회 호출 절감의 대조 실험 효과까지 검증한 것은 아니다. 실제로 관측한 것은 선택 worker 1회와 비선택 worker의 provider 재호출 0회다.
