# Claude Desktop 관리 CLI 확인

## 최신 상태 — 사용자 로그인 완료와 중복 설치 제거

사용자가 OAuth 로그인 완료와 기존 `/opt/homebrew` 설치 삭제를 요청했다.
앱 관리 CLI 및 제거 후 `claude` 명령의 `auth status --json`을 허용된 호스트에서 조회해
exit0/loggedIn=true/authMethod=claude.ai를 확인했다. 비밀·계정 상세는 출력하지 않았다.

실제 제거 명령:

```sh
npm uninstall --global --prefix /opt/homebrew --ignore-scripts --offline --no-audit --no-fund @anthropic-ai/claude-code
```

npm은 `removed 2 packages`/exit0을 반환했다. 대상은 npm 전역 CLI 2.1.280이었다.
제거 후 `npm ls -g --prefix /opt/homebrew --depth=0 @anthropic-ai/claude-code`는
`(empty)`/exit1이고, `/opt/homebrew/lib/node_modules/@anthropic-ai/claude-code`도 없다.
여기서 npm ls exit1은 대상 패키지가 없다는 조회 결과다.

기존 `claude` 명령을 유지하도록 `/opt/homebrew/bin/claude`를 아래 앱 관리 바이너리로 연결했다.
Node `symlinkSync`를 사용했고 기존 경로가 남아 있으면 덮어쓰지 않도록 검사했다.
바이너리 복사나 재설치는 하지 않았다.

```text
/Users/lee/Library/Application Support/Claude/claude-code/2.1.293/8433d0d9cd0d/claude.app/Contents/MacOS/claude
```

`realpathSync('/opt/homebrew/bin/claude')`가 위 대상과 일치하고, `claude --version`은
`2.1.293 (Claude Code)`/exit0이다. PATH의 `claude`를 쓰는 Jev runner의 인증 조회·버전 기록·실행도
같은 바이너리를 가리킨다. 실제 모델 실행은 하지 않았다. 앱 업데이트로 이 버전 경로가 제거되면
새 경로를 확인한 뒤 심볼릭 링크를 다시 연결해야 한다.

Claude 구독 OAuth 인증은 Anthropic API 키 과금과 구별한다. 이전 $10/$30 제안은
승인된 API 예산이 아니다. 실제 실험 한도와 Jev 호출 한도는 별도 미확정 상태로 유지한다.

부수 효과: npm 전역 설치 제거, `claude` 심볼릭 링크 대상 변경, 프로젝트 문서 갱신.
`~/.claude` 로그인 저장소와 Claude 앱·기존 Personal OS는 삭제하거나 수정하지 않았다.

## 이전 조사 — 로그인 전 상태 보존

확인일: 2026-10-08. 사용자 요청에 따라 설치된 앱과 CLI를 읽기 전용으로 확인했다.
기존 PATH의 CLI만 조사한 이전 안내를 보완한다. 앱 UI의 로그인 상태는 조사하지 않았다.

## 실제 파일과 실행 결과

- `fd -H -d 2 -t d '^Claude\.app$' /Applications /Users/lee/Applications`:
  `/Applications/Claude.app` 존재.
- `/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' /Applications/Claude.app/Contents/Info.plist`:
  Desktop `2.26454.2`.
- `ls -l /opt/homebrew/bin/claude`: 전역 npm 경로
  `../lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe`의 심볼릭 링크다.
  `/opt/homebrew/bin`이라는 위치만으로 Homebrew 설치라고 단정한 이전 표현을 정정한다.
- `fd -H -d 6 -t f . '/Users/lee/Library/Application Support/Claude/claude-code/2.1.293/8433d0d9cd0d/claude.app/Contents'`:
  아래 macOS용 CLI 확인. VM용 `claude-code-vm/2.1.293/claude`는 `file` 조회상 Linux ELF다.

```sh
jev_claude_cli="$HOME/Library/Application Support/Claude/claude-code/2.1.293/8433d0d9cd0d/claude.app/Contents/MacOS/claude"
"$jev_claude_cli" --version
"$jev_claude_cli" auth status --json
"$jev_claude_cli" auth login --help
```

`--version`은 `2.1.293 (Claude Code)`. auth 조회는 샌드박스 안과 허용된 호스트 재조회 모두
exit1, loggedIn=false, authMethod=none, configDirectory=/Users/lee/.claude였다.
상태 JSON에서 위 필드와 apiProvider만 선별해 출력했다. 토큰/계정 상세는 출력하지 않았다.
프로세스 이름 보조 조회 `ps -axo comm=`는 샌드박스에서 거절되어 근거로 사용하지 않았다.

CLI 직접 실행은 확인했지만, 앱 UI의 기존 로그인 세션이 이 직접 실행 경로에서 자동 재사용되는
것은 확인되지 않았다. 이것을 앱 자체가 로그아웃됐다는 뜻으로 해석하지 않는다.

## 사용자가 직접 할 OAuth 로그인

위 `jev_claude_cli` 변수를 지정한 일반 Mac 터미널에서 다음을 실행할 수 있다.
도움말에서 `--claudeai`가 구독 계정 로그인임을 확인했다. 이번 조사에서는 실행하지 않았다.

```sh
"$jev_claude_cli" auth login --claudeai
```

앱이 관리하는 버전/해시 디렉터리는 업데이트로 바뀔 수 있다. 최초 조사 당시 runner는 PATH의
기존 `claude`를 사용했고 이 바이너리로 전환하지 않은 상태였다. 실제 전환 시
실행/인증 조회/버전 기록 모두 같은 바이너리를 사용해야 한다.

[공식 Desktop 시작 안내](https://code.claude.com/docs/en/desktop-quickstart)는 Code 탭에는
별도 CLI 설치가 필요 없고, 터미널 CLI 사용에는 별도 설치 경로를 안내한다. 앱 관리 바이너리의
직접 실행 가능성은 이 Mac의 실측이며, 문서화된 안정적 외부 CLI 설치 경로라는 주장은 아니다.

이번 조회에서 앱 재시작·설치·PATH 변경·인증 변경·추론·기존 Personal OS 변경은 없었다.
Jev Router의 조사 문서와 작업 기록만 로컬 미커밋 변경으로 남겼다.
