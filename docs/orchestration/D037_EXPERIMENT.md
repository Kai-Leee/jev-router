# D037 — 실제 고정 계획 라우팅 비교

2026-10-10. 사용자가 실제 실행·비교 요청. 기존 jev-decision-records 적용. 역할은 ../agents/D037_LIVE_COMPARISON.md.

비교: Claude 별도 선택, force_jev, auto 각각 1회. 동일 D029 frozen plan, brief, projected/v3 worker contract, Opus5.5 medium, concurrency2, threshold0.65, 기존 locked Docker image. 새 planner 호출 없음. 같은 입력의 판단기/선택 경로 비교이며 통합 계획 생성 baseline 또는 일반적 효율 검증이 아니다.

순서 고정 Claude→force_jev→auto, 실행 중첩 없음. 순서/공급자 캐시 효과 통제 못함. 답을 보고 임계값 변경·재시도·수리하지 않음. 원본 독립 채점 후 성공/실패/보류 모두 보고.

Jev 기존 USD1 보수적 장부 유지. 시작47settlements,72739input,$0.0436434(72739×0.6/1e6). pending=null. private d037-protocol.json에 source SHA/조건/시작 장부 보존. routing-policy SHA는 첫 Claude 실행 시작 직후 보완했으며 당시 소스 수정은 없었음. HEAD만으로 미커밋 소스 재현 가능하다고 하지 않음.

GET models/정확한 API 목적지와 기존 Docker 이미지 확인 후 시작. 첫 Docker 확인은 sandbox permission denied, 권한 있는 확인 성공. 자동 POST 재시도 없음. 이 파일과 실제 명령/결과 파일로 추적.

가격: CLI가 반환한 API equivalent를 기록하고 구독 추가 청구로 부르지 않음. Jev는 실제 input과 보수적 예산 환산을 분리. 2026-10-10 https://jev-ai.pro/pricing 확인에서 token pack $0.6/M 확인. 공개 fetch에서는 과거 월$29/60M가 보이지 않으므로 현재 구독 단가로 재확정하지 않음. 월정액 사용자의 실제 추가 USD 청구는 unknown. 비용 합계는 비교용 환산값.

재현(새 output 필수; 유료 실행):

```sh
node scripts/tree-e2e-pilot.mjs benchmark-runs/d025-jev-01.json benchmark-runs/NEW_RUN --spend --routing-mode claude --split-threshold 0.65 --plan-source benchmark-runs/d029-tree-01/frozen-plan.json --concurrency 2
# 두 비교군은 routing-mode만 force_jev / auto로 바꾸고 각각 새 output 사용
/opt/homebrew/bin/python3.14 benchmarks/e2e-swe/adapter.py grade --workspace RUN/candidate-SELECTED --image-lock benchmark-runs/image-lock-pytest-check.json --output NEW_GRADE
python3 scripts/analyze-checkpoint-comparison.py d037
```

새 분석기는 신규 authority를 포함해 input/threshold/plan/request/source hash와 grade workspace/image를 대조한다. 기존 compare-routing-runs의 auto/force_jev 인식 한계 때문에 기존 스크립트 수치를 그대로 쓰지 않는다. 아직 outcome 없는 실행은 성공으로 기록하지 않는다.
