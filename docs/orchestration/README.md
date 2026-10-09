# Jev Router 문서 찾아보기

1. [현재 질문·모델·작업자 지시 위치](contracts/README.md): 실행기가 실제 읽는 파일과 열람 명령.
2. [모델/노력도·Claude/Codex 공식 조사](D029_MODEL_HOST_RESEARCH.md): 지원과 실제 계정 가용성의 차이.
3. [현재 실제 E2E 결과](D029_RESULTS.md): 단일/분할 품질, 단계시간, 비용, 확률 한계와 원본 연결.
4. [작업 카드·질문·답·실행 계약](D027_CONTRACT.md): 전체 설계와 문서 필드.
5. [스킬 생성에 필요한 자료](D027_SKILL_INPUTS.md): 무엇을 왜 어떻게, 검증·예외·인계.

`node bin/show-routing-contracts.mjs`는 실제 정본 JSON 내용과 절대 경로를 출력하며 API를 호출하지 않는다. v1 과거 실험과 v2 현재 worker/model 문서를 혼동하지 않는다. 결정 기록은 ../decisions/D029.md.

6. [입력 중복 감사와 Jev 역할 이전 제안](D030_INPUT_AUDIT.md): 실제 필드/바이트 측정과 미구현 경계.
7. [D031 구현·입력 모드·판단기 비교](D031_IMPLEMENTATION.md): 현재 v3, 무과금 재생 결과, 실제 미측정 경계.
8. [서브에이전트 역할 조사](D031_ROLE_RESEARCH.md): script/Jev/Claude 책임과 template·replay·oracle 비교.
9. [현재 실제 감소·미검증 절감 요약](D031_SAVINGS_STATUS.md): 작업자별 바이트, 과거 유료실험, 비용절감 미확인 경계.
