# D071 — 수리 원인 파일 읽기 전용 연결

2026-10-11. 역할: `d071_transport`. 소유: `src/orchestration/artifact-transport.mjs`, 관련 집중 테스트, 이 문서. 실제 catalog/산출물 manifest에서 snapshot을 정하는 일과 작업자 입력에 연결하는 일은 root·수리 담당이 수행한다.

## 목적과 완료 범위

수리 작업자가 수정할 파일만 받으면 원인이 생성된 producer/IR 파일을 읽을 수 없다. 기존 stage 쓰기 범위를 유지한 채 controller가 지정한 이전 산출물의 정확한 파일과 SHA-256을 읽기 전용으로 제공한다. 이 변경은 수리 담당을 선택하지 않으며, 공개 검사 성공이나 제품 개선의 증거가 아니다.

`createArtifactSession`의 기존 config에 선택적 배열을 추가했다.

```js
{
  root: "/canonical/worker-stage",
  allowedPaths: ["pkg/renderer.py"],
  readablePaths: ["pkg/current.py"],
  readSources: [{
    path: "pkg/upstream.py",
    root: "/canonical/failed-round-snapshot",
    sha256: "<64 hex content SHA-256>"
  }],
  journalPath: "/canonical/private-journal.jsonl"
}
```

Worker는 기존 `read_file({path})`만 호출한다. 새 도구·쉘·네트워크·경로 탐색은 없다. `bin/artifact-worker-mcp.mjs`는 controller JSON을 이미 factory로 전달하므로 수정하지 않았다.

## 실행 규칙과 실패 처리

- `readSources`의 각 항목은 `path`, `root`, `sha256` 세 필드만 갖는다. path는 기존 안전한 저장소 상대경로 규칙을 따른다. hash는 64 hex이며 내부에 소문자로 복사·고정한다.
- Source root는 존재하는 실제 디렉터리의 정규화된 절대경로다. `/`, stage root와 같거나 서로의 상위/하위인 경로, symlink 또는 symlink를 거치는 root는 거부한다. root의 장치·inode도 고정한다.
- Source path와 기존 `allowedPaths`/`readablePaths`, 다른 source path 사이에는 동일 경로 및 상위/하위 충돌이 없어야 한다. Controller는 overlay로 제공할 경로를 기존 `readablePaths`에서 빼야 한다. 모호할 때 어느 위치를 우선할지 추정하지 않는다.
- 매 read 때 root·모든 부모 디렉터리·파일을 재검사하고, 최종 파일의 symlink/hardlink를 거부한다. 열린 파일과 경로의 식별자 및 반환할 실제 byte SHA가 pin과 일치해야 한다. 파일 크기 제한은 기존 `maxFileBytes`를 적용한다.
- `ARTIFACT_READ_SOURCE_HASH_MISMATCH`, `UNSAFE_ARTIFACT_READ_SOURCE_ROOT/PATH`, `ARTIFACT_READ_SOURCE_CONFLICT`는 명시 오류다. drift 파일을 새 pin으로 자동 승인하거나 다른 위치로 대체하지 않는다.
- `write_file`은 기존 `allowedPaths`만 허용한다. Source read는 쓰기 용량 계산에 섞지 않는다.
- `status`는 source가 있을 때만 `read_only_sources: [{path, sha256}]`를 추가한다. 절대 snapshot root는 worker 응답에 넣지 않는다. 여기에 보이는 SHA는 예상 pin이며 실제 read가 이를 검증한다.
- 성공한 source read는 private journal에 `read_source_finished`와 상대 path/bytes/SHA를 기록한다. config 배열을 이후 수정해도 세션에 고정된 source와 hash는 바뀌지 않는다.

## 보존과 검증

기존 source를 수정하기 전에 Node `copyFileSync(..., COPYFILE_EXCL)`로 다음 원본을 만들었다. 덮어쓰기 하지 않았다.

`benchmark-runs/d071-preflight/source-before/src/orchestration/artifact-transport.mjs`

검증 명령:

```sh
node --test test/artifact-transport.test.mjs test/artifact-read-sources.test.mjs
```

2026-10-11 로컬 결과 **16/16 통과, 실패·skip 0**, 테스트 러너의 `duration_ms`는 **329.312625ms**다. 기존 테스트 7개와 새 테스트 9개다. 정상 read, 매회 hash drift 검출, 설정 변조 방어, read/write·source 충돌, traversal/secret path·root 오용, symlink/hardlink, root 교체, 크기 한도, 실제 stdio MCP 경계를 임시 디렉터리로 검사했다. 임시 디렉터리는 각 테스트 종료 시 정리했다. 이 시간은 제품 개발 시간이나 수리 성능이 아니다.

실패한 테스트는 없다. 실제 provider·Docker·장부 호출과 기존 후보 수정은 하지 않았다. 실행기에서 검증된 catalog artifact manifest로 source를 구성하고 요청·출력·snapshot 근거를 결합하는 작업, 실제 유료 수리 및 전체 완료 비교는 root의 통합·실험 검증 범위다.

부수 효과: source 변경과 새 테스트·문서, D071 source-before 사본이 미커밋으로 남는다. 기존 실험 결과와 후보는 수정하지 않았다.
