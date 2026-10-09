'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const state = { snapshot: null, selectedId: null, search: '', kind: 'all', expanded: false, loading: false, lastRunKey: '', lastListKey: '', stream: null, streamConnected: false, lastStreamAt: 0, epoch: null, revision: 0, feedVersion: 0, collectorHealthy: true };
  const names = { jev: 'Jev', claude: 'Claude', controller: '실행기' };
  const kinds = { live: '실제 모델 실행', synthetic: '합성 테스트', control: '대조 검증', unknown: '종류 미확인' };
  const conditions = { jev: 'Jev 판단', baseline: 'Claude 직접 판단', control: '대조 조건', monitor: '별도 모니터', unknown: '조건 미확인' };
  const statuses = { running: '실행 중', finalizing: '종료 정리 중', ready: '다음 판단 대기', completed: '실행 종료', failed: '실패', uncertain: '결과 불확실', prepared: '준비됨', unknown: '상태 미확인', passed: '통과', not_run: '평가 전', pending: '대기 중', started: '시작', stopped: '중지', finished: '종료' };
  const workloads = { 'e2e-swe': 'E2E-SWE', 'personal-os': 'Personal OS', smoke: '연결 검증', monitoring: '개발 모니터링', unknown: '과제 미확인' };
  const roles = { implementation: '구현 담당', monitor: '모니터 담당', unknown: '역할 미확인' };
  const phases = { preflight: '실행 전 확인', auth: '인증 확인', sandbox: '격리 환경 확인', models: '모델 확인', provider: '모델 작업', executing: '모델 작업', running: '작업 진행', finalizing: '종료 정리', cleanup: '컨테이너 정지', frozen: '산출물 고정', terminal: '실행 종료', started: '실행 시작', initialization: '초기화', monitoring: '독립 관측', completed: '종료 기록 완료' };
  const incidentNames = { TOOL_NONZERO_EXIT: '명령이 실패했습니다', TOOL_FAILED: '명령이 실패했습니다', BUDGET_EXHAUSTED: '설정된 판단 한도에 도달했습니다', RECORD_FAILED: '내구 기록을 확인하지 못했습니다', DECISION_FAILED: '판단 응답을 확인하지 못했습니다', INVALID_DECISION: '판단 응답이 계약과 다릅니다', EXECUTION_UNCERTAIN: '명령 실행 결과가 불확실합니다', INVALID_INPUT: '판단 입력이 거절되었습니다', AUTH_REQUIRED: '인증 확인이 필요합니다', PREFLIGHT_FAILED: '실행 전 확인이 실패했습니다', MODEL_UNAVAILABLE: '요청한 모델을 확인하지 못했습니다', RUNNER_FAILED: '실행기가 실패로 종료했습니다', CLEANUP_FAILED: '종료 정리가 확인되지 않았습니다', HEARTBEAT_STALE: '실행기 관측이 지연되었습니다' };
  incidentNames.GATE_COMPLETION_UNCONFIRMED = 'Jev 완료 승인을 받기 전에 구현 세션이 종료됐습니다';
  const eventNames = {
    inference_started: '추론 전송 시도', inference_finished: '추론 응답 처리',
    input: '판단 입력 준비', decision: '판단 결과', action_started: '명령 실행 시작',
    action_finished: '명령 실행 종료', action: '명령 실행', finish: '완료 판단',
    completed: '완료 보고', result: '실행 결과', assistant: '모델 응답',
    run_started: '실행 시작', run_finished: '실행 종료', initialization: '초기화',
    system: '시스템 이벤트', tool_result: '도구 결과', user: '도구 결과 수신',
    process_started: '프로세스 시작', process_finished: '프로세스 종료', runner_started: '실행기 시작', preflight_started: '사전 확인 시작', preflight_failed: '사전 확인 실패', provider_started: '모델 작업 시작', provider_finished: '모델 작업 종료', runner_finalizing: '종료 정리 시작', artifact_frozen: '산출물 고정', runner_terminal: '실행기 종료', stopped: '판단 gate 중단', outcome: '명령 결과', rejected: '입력 거절'
  };
  const num = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  const text = (value, fallback = '') => typeof value === 'string' ? value : fallback;
  const list = (value) => Array.isArray(value) ? value : [];
  const format = (value) => {
    if (num(value) === null) return '미확인';
    if (value > 0 && value < 0.0000000001) return value.toPrecision(3);
    return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 10 }).format(value);
  };
  function money(value) {
    if (num(value) === null) return '미확인';
    if (value > 0 && value < 0.0000000001) return `$${value.toPrecision(3)}`;
    return `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 10 }).format(value)}`;
  }
  function duration(value) {
    if (num(value) === null) return '미확인';
    if (value < 1000) return `${Math.round(value)} ms`;
    if (value < 60000) return `${(value / 1000).toFixed(1)}초`;
    const seconds = Math.floor(value / 1000);
    if (seconds < 3600) return `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
    return `${Math.floor(seconds / 3600)}시간 ${Math.floor(seconds % 3600 / 60)}분`;
  }
  function date(value, timeOnly = false) {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return '시각 미확인';
    const options = timeOnly ? { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false } : { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false };
    return new Intl.DateTimeFormat('ko-KR', { ...options, timeZone: 'Asia/Seoul' }).format(new Date(value));
  }
  function el(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = String(content);
    return node;
  }
  function badge(label, variant = '') {
    return el('span', `badge ${variant ? `badge-${variant}` : ''}`, label);
  }
  function metric(container, source, formatter = format, { partial = true, coverage = true } = {}) {
    const value = num(source?.value);
    const primary = el('span', value === null ? 'metric-unknown' : '', formatter(value));
    if (value === null) primary.textContent = '미확인';
    container.append(primary);
    const known = num(source?.known);
    const expected = num(source?.expected);
    const observed = num(source?.observed);
    if (partial && value === null && known !== null && known > 0 && observed !== null) {
      container.append(el('span', 'partial-value', `관측 부분합 ${formatter(observed)}`));
    }
    if (coverage && known !== null && value === null) {
      container.append(el('span', 'metric-coverage', `관측 ${format(known)} / ${expected === null ? '?' : format(expected)}건`));
    }
    if (known !== null) container.title = `집계 관측: ${format(known)} / ${expected === null ? '전체 건수 미확인' : format(expected)}건`;
  }
  function providerHeading(provider) {
    const head = el('div');
    const label = el('div', 'provider-name');
    label.append(el('span', `provider-dot ${provider.provider === 'claude' ? 'claude' : ''}`), document.createTextNode(names[provider.provider] || '공급자 미확인'));
    head.append(label);
    const models = list(provider.model_ids).filter((model) => typeof model === 'string');
    head.append(el('span', 'model-name', models.length ? models.join(' · ') : '모델 미확인'));
    return head;
  }
  function warnings(target, values) {
    const items = list(values).filter((value) => typeof value === 'string');
    target.replaceChildren();
    target.hidden = items.length === 0;
    if (!items.length) return;
    const notice = el('div', 'notice');
    if (items.length === 1) notice.textContent = items[0];
    else {
      const ul = el('ul', 'notice-list');
      items.forEach((item) => ul.append(el('li', '', item)));
      notice.append(ul);
    }
    target.append(notice);
  }
  function runs() { return list(state.snapshot?.runs).filter((run) => run && typeof run.id === 'string'); }
  function visibleRuns() {
    return runs().filter((run) => (state.kind === 'all' || (run.kind || 'unknown') === state.kind) && `${text(run.title)} ${run.id} ${text(run.group_id)} ${roles[run.agent_role] || ''}`.toLocaleLowerCase().includes(state.search.toLocaleLowerCase()));
  }
  function renderList(available) {
    const key = JSON.stringify([state.selectedId, available.map((run) => [run.id, run.title, run.kind, run.status, run.condition, run.agent_role, run.group_id])]);
    if (key === state.lastListKey) return;
    state.lastListKey = key;
    const focused = document.activeElement?.dataset?.runId;
    const fragment = document.createDocumentFragment();
    if (!available.length) fragment.append(el('p', 'sidebar-empty', runs().length ? '조건에 맞는 실행이 없습니다.' : '아직 저장된 실행이 없습니다.'));
    available.forEach((run) => {
      const button = el('button', 'run-option');
      button.type = 'button';
      button.dataset.runId = run.id;
      button.setAttribute('aria-current', String(run.id === state.selectedId));
      button.setAttribute('aria-label', `${text(run.title, run.id)}, ${kinds[run.kind] || kinds.unknown}, ${statuses[run.status] || statuses.unknown}`);
      button.append(el('span', 'run-option-name', text(run.title, run.id)));
      if (roles[run.agent_role] && run.agent_role !== 'unknown') button.append(el('span', 'run-option-role', roles[run.agent_role]));
      const meta = el('span', 'run-option-meta');
      meta.append(badge(kinds[run.kind] || kinds.unknown, ['live', 'synthetic', 'control'].includes(run.kind) ? run.kind : ''), el('span', '', statuses[run.status] || statuses.unknown));
      button.append(meta);
      button.addEventListener('click', () => {
        if (state.selectedId !== run.id) state.expanded = false;
        state.selectedId = run.id;
        render();
      });
      fragment.append(button);
    });
    $('run-list').replaceChildren(fragment);
    if (focused) [...$('run-list').querySelectorAll('button')].find((button) => button.dataset.runId === focused)?.focus({ preventScroll: true });
  }
  function headline(label, value, unit, description, primary = false) {
    const card = el('article', `metric-card${primary ? ' primary' : ''}`);
    card.append(el('p', 'metric-card-label', label));
    const amount = el('p', `metric-card-value${value === '미확인' ? ' unknown' : ''}`, value);
    if (value !== '미확인' && unit) amount.append(el('span', 'metric-unit', unit));
    card.append(amount, el('p', 'metric-card-note', description));
    return card;
  }
  function renderCalls(providers) {
    const body = document.createDocumentFragment();
    const notes = document.createDocumentFragment();
    providers.forEach((provider) => {
      const row = el('tr');
      const name = el('th');
      name.scope = 'row';
      name.append(providerHeading(provider));
      row.append(name);
      ['attempted', 'completed', 'failed', 'uncertain', 'observed_model_turns'].forEach((key) => {
        row.append(el('td', num(provider.calls?.[key]) === null ? 'metric-unknown' : '', format(provider.calls?.[key])));
      });
      body.append(row);
      const prefix = names[provider.provider] || '공급자';
      const fallback = provider.provider === 'claude' ? '관측 응답 단계는 모델 HTTP 요청·재시도 횟수와 다릅니다.' : '전송 시도는 공급자 서버가 요청을 수신했다는 보장이 아닙니다.';
      notes.append(el('p', '', `${prefix} · ${text(provider.calls?.semantics, fallback)}`));
    });
    $('calls-body').replaceChildren(body);
    $('call-notes').replaceChildren(notes);
  }
  function renderTokens(providers) {
    const fragment = document.createDocumentFragment();
    const fields = [['input', '입력'], ['output', '출력'], ['cache_read', '캐시 읽기'], ['cache_creation', '캐시 생성']];
    const max = Math.max(1, ...providers.flatMap((provider) => fields.map(([key]) => num(provider.tokens?.[key]?.value) ?? 0)));
    providers.forEach((provider) => {
      const section = el('div', `token-provider ${provider.provider === 'claude' ? 'claude' : ''}`);
      const heading = el('div', 'provider-heading');
      const total = el('div', 'provider-total');
      metric(total, provider.tokens?.total);
      total.append(el('small', '', '총 토큰'));
      const totalPrice = el('div', 'token-price');
      metric(totalPrice, provider.pricing?.estimated_usd?.total, money);
      totalPrice.append(el('small', '', '환산 추정'));
      total.append(totalPrice);
      heading.append(providerHeading(provider), total);
      section.append(heading);
      fields.forEach(([key, label]) => {
        const row = el('div', 'token-row');
        row.dataset.key = key;
        const track = el('div', 'token-track');
        track.setAttribute('aria-hidden', 'true');
        const fill = el('div', 'token-fill');
        const value = num(provider.tokens?.[key]?.value);
        fill.style.width = `${value === null ? 0 : Math.min(100, value / max * 100)}%`;
        track.append(fill);
        const amount = el('div', 'token-value');
        metric(amount, provider.tokens?.[key]);
        const price = el('div', 'token-price');
        metric(price, provider.pricing?.estimated_usd?.[key], money);
        price.append(el('small', '', '환산 추정'));
        row.append(el('span', 'token-label', label), track, amount, price);
        section.append(row);
      });
      const pricing = provider.pricing;
      if (pricing) {
        const note = el('p', 'cost-note pricing-note', provider.provider === 'jev'
          ? 'Creator 월 $29 ÷ 제공 60,000,000토큰 × 잔액 차감 토큰. 월 구독료 배분 추정이며, 호출별 추가 청구액이 아닙니다. 출력 무료.'
          : 'Opus 5.5 공식 API 단가: 100만 토큰당 입력 $4 · 출력 $20 · 캐시 읽기 $0.20 · 생성 5분 $5 / 1시간 $8. 구독의 실제 청구액과 다릅니다.');
        const details = el('details', 'pricing-details');
        details.append(el('summary', '', '환산 기준과 관측 한계'));
        for (const message of list(pricing.notes)) details.append(el('p', '', text(message)));
        const source = el('a', '', '공식 요금 근거');
        const allowed = ['https://jev-ai.pro/pricing', 'https://platform.claude.com/docs/en/about-claude/pricing'];
        if (allowed.includes(pricing.source?.url)) {
          source.href = pricing.source.url;
          source.target = '_blank'; source.rel = 'noopener noreferrer';
          note.append(source, document.createTextNode(` · 확인 ${text(pricing.source.verified_at)}`));
        }
        section.append(note, details);
      }
      fragment.append(section);
    });
    $('token-providers').replaceChildren(fragment);
  }
  function renderCosts(providers, budget) {
    const fragment = document.createDocumentFragment();
    providers.forEach((provider) => {
      const section = el('div', 'cost-provider');
      const heading = el('div', 'provider-heading');
      heading.append(providerHeading(provider));
      section.append(heading);
      const rows = provider.provider === 'claude' ? [
        ['reported_usd', 'API 환산 추정 비용', money], ['billed_usd', '실제 청구 USD', money]
      ] : [
        ['credits', '크레딧 차감', format], ['paid_input_tokens', '잔액 토큰 차감', format],
        ['reported_usd', '공급자 보고 USD', money], ['billed_usd', '실제 청구 USD', money]
      ];
      rows.forEach(([key, label, formatter], index) => {
        const row = el('div', `cost-row${index ? ' secondary' : ''}`);
        const amount = el('div', 'cost-value');
        metric(amount, provider.costs?.[key], formatter);
        row.append(el('span', 'cost-label', label), amount);
        section.append(row);
      });
      if (provider.provider === 'jev' && budget) {
        for (const [label, value] of [['공유 환산 예산', budget.limit_usd], ['환산 사용액', budget.estimated_spent_usd],
          ['미확정 호출 예약액', budget.estimated_reserved_usd], ['다음 호출에 쓸 수 있는 환산 잔액', budget.estimated_remaining_usd]]) {
          const row = el('div', 'cost-row secondary');
          row.append(el('span', 'cost-label', label), el('div', 'cost-value', num(value) === null ? '미확인' : money(value)));
          section.append(row);
        }
        section.append(el('p', 'cost-note', `공유 실험 장부의 마지막 관측값 · 입력 100만 토큰당 $0.60으로 환산 · 실제 청구액과 다릅니다.${budget.status === 'blocked' ? ' 예산 검사로 호출 중지.' : ''}`));
      }
      section.append(el('p', 'cost-note', text(provider.cost_note, '청구 근거가 제공되지 않은 값은 미확인입니다.')));
      fragment.append(section);
    });
    $('cost-providers').replaceChildren(fragment);
  }
  function renderEvaluation(evaluation) {
    const status = text(evaluation?.status, 'unknown');
    const parts = [badge(statuses[status] || '평가 미확인', ['passed', 'failed'].includes(status) ? status : '')];
    if (num(evaluation?.passed) !== null && num(evaluation?.total) !== null) {
      parts.push(el('span', 'evaluation-count', `${format(evaluation.passed)} / ${format(evaluation.total)}`));
    }
    parts.push(el('p', '', text(evaluation?.note, '실행 종료나 에이전트의 완료 보고는 구현 평가 통과와 다릅니다.')));
    $('evaluation-detail').replaceChildren(...parts);
  }
  function renderActivity(run) {
    const activity = list(run.activity).filter((item) => item && typeof item === 'object');
    const shown = state.expanded ? activity.slice().reverse() : activity.slice(-8).reverse();
    const fragment = document.createDocumentFragment();
    if (!shown.length) fragment.append(el('p', 'activity-empty', '관측된 이벤트가 아직 없습니다.'));
    shown.forEach((item) => {
      const row = el('div', 'activity-item');
      const time = el('time', 'activity-time', date(item.at, true));
      if (typeof item.at === 'string' && Number.isFinite(Date.parse(item.at))) { time.dateTime = item.at; time.title = `${date(item.at)} · 한국 시간`; }
      const description = el('div', 'activity-description', eventNames[item.type] || text(item.type, '이벤트'));
      description.append(el('small', '', statuses[item.status] || text(item.status, '상태 미확인')));
      row.append(time, el('span', 'activity-provider', names[item.provider] || '실행기'), description, el('span', 'activity-duration', num(item.duration_ms) === null ? '—' : duration(item.duration_ms)));
      fragment.append(row);
    });
    $('activity-list').replaceChildren(fragment);
    $('activity-count').textContent = `${format(activity.length)}건 · 최신순`;
    $('activity-toggle').hidden = activity.length <= 8;
    $('activity-toggle').textContent = state.expanded ? '최근 8건만 보기' : `이벤트 ${format(activity.length)}건 모두 보기`;
    $('activity-toggle').setAttribute('aria-expanded', String(state.expanded));
  }
  function renderExecution(run) {
    const execution = run.execution;
    $('execution-panel').hidden = !execution && !list(run.incidents).length;
    const content = document.createDocumentFragment();
    function item(label, value, note, className = '') {
      const block = el('dl', 'execution-item');
      const detail = el('dd', className, value);
      if (note) detail.append(el('small', '', note));
      block.append(el('dt', '', label), detail);content.append(block);
    }
    if (execution) {
      item('실행기 상태 / 현재 단계', `${statuses[execution.runner_status] || '미확인'} · ${phases[execution.phase] || text(execution.phase, '단계 미확인')}`, '모델 응답 종료와 실행기·산출물 정리 완료는 다릅니다.');
      item('판단 gate', statuses[execution.gate_status] || '미확인', text(execution.gate_stop_code) || 'Jev 선택과 실행 허용 상태를 별도로 관측합니다.');
      const heartbeat = execution.heartbeat;
      item('실행기 heartbeat', heartbeat?.state === 'fresh' ? '최근 기록 확인' : heartbeat?.state === 'stale' ? '기록 지연 · 실행 확인 필요' : '미확인',
        `${date(heartbeat?.at)} · ${num(heartbeat?.age_ms) === null ? '경과 미확인' : `${duration(heartbeat.age_ms)} 전 관측`}. ${text(heartbeat?.note, '기록기 활동 근거이며 모델 내부 진행을 증명하지 않습니다.')}`,
        ['fresh', 'stale'].includes(heartbeat?.state) ? heartbeat.state : '');
      item('최근 원천 이벤트', date(execution.last_event_at), '대시보드 수신 시각과 다른 기록 시각입니다.');
    }
    $('execution-status').replaceChildren(content);
    const fragment = document.createDocumentFragment();
    const incidents = list(run.incidents).filter((incident) => incident && typeof incident === 'object');
    for (const incident of incidents.slice(-8).reverse()) {
      const row = el('div', 'incident-item');
      row.append(el('span', `incident-symbol${incident.recovery_allowed === false ? ' stopped' : ''}`, '!'));
      const body = el('div', 'incident-body');
      body.append(el('p', 'incident-title', incidentNames[incident.code] || '확인할 실행 문제가 기록되었습니다'));
      body.append(el('span', 'incident-code', text(incident.code, '이유 코드 미확인')));
      const detail = [date(incident.at), ({ runner: '실행기', gate: '판단 gate', tool: '명령', provider: '공급자', observer: '관측기' })[incident.source] || '출처 미확인'];
      if (num(incident.decision_id) !== null) detail.push(`판단 ${format(incident.decision_id)}`);
      if (typeof incident.exit_code === 'number' && Number.isInteger(incident.exit_code)) detail.push(`종료 코드 ${incident.exit_code}`);
      detail.push(incident.recovery_allowed === true ? '복구 진행 허용 · 다음 기록 확인' : incident.recovery_allowed === false ? '진행 중단 · 결과 확인 후 다음 실행 판단' : '복구 가능 여부 미확인');
      body.append(el('p', 'incident-detail', detail.join(' · ')));row.append(body);fragment.append(row);
    }
    if (incidents.length > 8) fragment.append(el('p', 'incident-summary', `기록된 문제 ${format(incidents.length)}건 중 최근 8건 표시`));
    $('incident-list').replaceChildren(fragment);
  }
  function renderPair(run) {
    const group = text(run.group_id);
    $('paired-panel').hidden = !group;
    if (!group) return;
    $('paired-group').textContent = group;
    const fragment = document.createDocumentFragment();
    const peers = runs().filter((peer) => peer.group_id === group);
    for (const peer of peers) {
      const button = el('button', 'paired-run');button.type = 'button';
      button.setAttribute('aria-current', String(peer.id === run.id));
      button.append(el('span', 'paired-run-title', roles[peer.agent_role] || roles.unknown));
      const models = list(peer.providers).flatMap((provider) => list(provider.model_ids)).filter((model) => typeof model === 'string');
      button.append(el('span', 'paired-run-detail', models.length ? models.join(' · ') : '모델 미확인'));
      button.append(el('span', 'paired-run-detail', `${text(peer.run_id, peer.id)} · 시도 ${text(peer.attempt_id, '미확인')}`));
      button.append(badge(statuses[peer.status] || statuses.unknown, ['failed', 'uncertain', 'completed', 'running'].includes(peer.status) ? peer.status : ''));
      button.addEventListener('click', () => {
        state.selectedId = peer.id;state.expanded = false;
        state.kind = 'all';state.search = '';$('kind-filter').value = 'all';$('run-search').value = '';render();
      });
      fragment.append(button);
    }
    $('paired-runs').replaceChildren(fragment);
  }
  function renderMonitor(run) {
    $('monitor-panel').hidden = run.agent_role !== 'monitor';
    if (run.agent_role !== 'monitor') return;
    const report = run.monitor_report;
    const assessment = ({ ok: '모니터: 문제 보고 없음', attention: '모니터: 확인 필요', failed: '모니터: 실패 보고', uncertain: '모니터: 판단 불확실' })[report?.assessment];
    $('monitor-assessment').textContent = assessment || '보고서 미제공';
    $('monitor-assessment').className = `badge${report?.assessment === 'failed' ? ' badge-failed' : ['attention', 'uncertain'].includes(report?.assessment) ? ' badge-uncertain' : ''}`;
    const fragment = document.createDocumentFragment();
    if (!report) fragment.append(el('p', 'report-empty', '유효한 모니터 보고서가 아직 없습니다. 모델 실행 종료와 보고서 제공 여부는 별도로 확인합니다.'));
    else {
      const evidence = list(report.evidence).filter(value => typeof value === 'string');
      fragment.append(el('h4', '', '보고서에 제시된 근거'));
      if (!evidence.length) fragment.append(el('p', 'report-empty', '근거 미제공'));
      else {const ul = el('ul');evidence.forEach(value => ul.append(el('li', '', value)));fragment.append(ul);}
      fragment.append(el('h4', '', '모니터가 제안한 다음 확인'), el('p', '', text(report.next_action, '제안 미제공')));
      const limitations = list(report.limitations).filter(value => typeof value === 'string');
      fragment.append(el('h4', '', '해석의 한계'));
      if (!limitations.length) fragment.append(el('p', 'report-empty', '보고서에 한계 미기재'));
      else {const ul = el('ul');limitations.forEach(value => ul.append(el('li', '', value)));fragment.append(ul);}
    }
    $('monitor-report').replaceChildren(fragment);
  }
  function renderRun(run) {
    const key = JSON.stringify([run, state.expanded, runs().filter(peer => run.group_id && peer.group_id === run.group_id).map(peer => [peer.id, peer.status, peer.providers, peer.agent_role])]);
    if (key === state.lastRunKey) return;
    state.lastRunKey = key;
    $('run-title').textContent = text(run.title, run.id);
    $('run-subtitle').textContent = `${workloads[run.workload] || workloads.unknown} · ${run.id}${run.run_id ? ` · 실행 ${run.run_id}` : ''}${run.attempt_id ? ` · 시도 ${run.attempt_id}` : ''}`;
    $('run-badges').replaceChildren(badge(kinds[run.kind] || kinds.unknown, ['live', 'synthetic', 'control'].includes(run.kind) ? run.kind : ''), badge(conditions[run.condition] || conditions.unknown), badge(roles[run.agent_role] || roles.unknown));
    $('run-status').textContent = statuses[run.status] || statuses.unknown;
    $('run-status').className = `badge ${['running', 'completed', 'failed', 'uncertain'].includes(run.status) ? `badge-${run.status}` : ''}`;
    $('run-started').textContent = `${date(run.started_at)} · KST`;
    const evidence = $('evidence-banner');
    evidence.hidden = run.kind === 'live';
    evidence.className = `notice${run.kind === 'control' ? ' notice-control' : ''}`;
    evidence.textContent = run.kind === 'synthetic' ? '합성 테스트 기록입니다. 아래 수치는 표시·집계 검증용이며 실제 모델 사용량이나 청구액을 뜻하지 않습니다.' : run.kind === 'control' ? '대조 검증 기록입니다. 환경·평가기 검증 결과를 실제 모델의 성능으로 해석하지 않습니다.' : '기록의 근거 종류를 확인할 수 없습니다. 실제 모델 실행·비용 근거로 해석하지 않습니다.';
    warnings($('run-warnings'), run.warnings);
    renderExecution(run);
    renderPair(run);
    renderMonitor(run);
    const providers = list(run.providers).filter((provider) => provider && ['jev', 'claude'].includes(provider.provider));
    const jev = providers.find((provider) => provider.provider === 'jev');
    const claude = providers.find((provider) => provider.provider === 'claude');
    $('headline-metrics').replaceChildren(
      headline('Jev 전송 시도', format(jev?.calls?.attempted), '회', '추론 POST 시도 · 모델 목록 조회 제외', true),
      headline('Claude 관측 응답', format(claude?.calls?.observed_model_turns), '단계', '중복 응답 ID 제외 · HTTP 호출 수 아님'),
      headline('실행 경과', duration(run.duration_ms), '', '기록된 실행 시간 · 성능 비교 전')
    );
    renderCalls(providers);
    renderTokens(providers);
    renderCosts(providers, run.jev_budget);
    renderEvaluation(run.evaluation);
    renderActivity(run);
    const limits = [];
    if (run.jev_budget) limits.push('Jev 공유 환산 예산 $1');
    if (run.limits?.jev_call_limit === 'unlimited') limits.push('Jev 호출 횟수 제한 없음');
    if (run.limits?.claude_budget_limit === 'unlimited') limits.push('Claude CLI 환산액 제한 없음');
    if (num(run.limits?.jev_max_calls) !== null) limits.push(`Jev 호출 한도 ${format(run.limits.jev_max_calls)}회`);
    if (num(run.limits?.wall_timeout_seconds) !== null) limits.push(`실행 시간 한도 ${duration(run.limits.wall_timeout_seconds * 1000)}`);
    if (num(run.limits?.claude_max_budget_usd) !== null) limits.push(`Claude CLI 환산액 한도 ${money(run.limits.claude_max_budget_usd)}`);
    $('limits-note').textContent = limits.length ? `설정된 한도 · ${limits.join(' · ')}. 실제 사용량과 다릅니다.` : '실행 한도 기록이 없습니다.';
  }
  function render() {
    const available = visibleRuns();
    if (!available.some((run) => run.id === state.selectedId)) {
      state.selectedId = available[0]?.id || null;
      state.expanded = false;
    }
    $('run-count').textContent = format(runs().length);
    renderList(available);
    warnings($('snapshot-warnings'), state.snapshot?.warnings);
    const run = available.find((item) => item.id === state.selectedId);
    $('empty-state').hidden = Boolean(run);
    $('selected-run').hidden = !run;
    if (run) renderRun(run);
    else {
      $('empty-title').textContent = runs().length ? '조건에 맞는 실행이 없습니다' : '아직 표시할 실행 기록이 없습니다';
      $('empty-description').textContent = runs().length ? '검색어나 기록 종류를 바꾸면 다른 실행을 확인할 수 있습니다.' : '실행기가 기록을 남기면 호출 횟수, 토큰과 비용을 이곳에서 확인할 수 있습니다. 확인되지 않은 값은 0으로 채우지 않습니다.';
    }
  }
  function connectionLabel() {
    const recent = state.streamConnected && Date.now() - state.lastStreamAt < 45000;
    $('connection-status').textContent = recent
      ? (state.collectorHealthy ? '실시간 연결됨 · 실행기 상태는 아래에서 확인' : '실시간 연결됨 · 원천 기록 읽기 지연')
      : (state.snapshot ? 'GET 보조 조회 · 실시간 재연결 중' : '기록 연결 대기');
    $('connection-status').className = `connection-status${state.collectorHealthy ? '' : ' is-error'}`;
  }
  function applySnapshot(snapshot, { source = 'get', requestVersion = state.feedVersion } = {}) {
    if (snapshot?.schema_version !== 'jev-dashboard/v1' || !Array.isArray(snapshot.runs)) throw new Error('invalid snapshot');
    const cursor = snapshot.transport;
    if (cursor) {
      if (typeof cursor.epoch !== 'string' || !/^[a-f0-9-]{36}$/.test(cursor.epoch) || !Number.isSafeInteger(cursor.revision) || cursor.revision < 1) throw new Error('invalid revision');
      if (source === 'get' && requestVersion !== state.feedVersion && state.epoch && state.epoch !== cursor.epoch) return;
      if (state.epoch === cursor.epoch && (cursor.revision < state.revision || (source === 'get' && requestVersion !== state.feedVersion && cursor.revision === state.revision))) return;
      state.epoch = cursor.epoch;state.revision = cursor.revision;
    }
    state.feedVersion++;
    state.snapshot = snapshot;state.collectorHealthy = true;
    $('api-error').hidden = true;
    $('last-updated').textContent = `최근 집계 ${date(snapshot.generated_at, true)} · KST · 원천 진전 시각 아님`;
    connectionLabel();render();
  }
  function readFailure() {
    state.collectorHealthy = false;
    $('api-error').hidden = false;
    $('api-error').textContent = state.snapshot
      ? '새 기록을 읽지 못했습니다. 마지막 관측값을 유지합니다. 이 연결·집계 문제만으로 실제 작업 실패를 판단하지 않습니다.'
      : '실행 기록을 가져오지 못했습니다. 로컬 대시보드 서버를 확인해 주세요. 관측 오류를 사용량 0으로 처리하지 않습니다.';
    connectionLabel();
    if (!state.snapshot) {
      $('empty-title').textContent = '기록에 연결할 수 없습니다';
      $('empty-description').textContent = '로컬 서버가 실행 중인지 확인해 주세요. 연결 오류를 사용량 0으로 처리하지 않습니다.';
    }
  }
  async function refresh(manual = false) {
    if (state.loading) return;
    state.loading = true;$('refresh-button').disabled = true;
    const requestVersion = state.feedVersion;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('/api/snapshot', { cache: 'no-store', signal: controller.signal, credentials: 'same-origin' });
      if (!response.ok) throw new Error('snapshot unavailable');
      applySnapshot(await response.json(), { source: 'get', requestVersion });
      if (manual) $('refresh-announcement').textContent = '실행 기록을 새로고침했습니다.';
    } catch {
      // A slower failed GET must not override a newer successful streamed state.
      if (requestVersion === state.feedVersion) readFailure();
      if (manual) $('refresh-announcement').textContent = '새로고침에 실패했습니다. 마지막 기록은 유지됩니다.';
    } finally {clearTimeout(timer);state.loading = false;$('refresh-button').disabled = false;}
  }
  let lastConnectAttempt = 0;
  function connectStream() {
    if (typeof EventSource !== 'function') return;
    state.stream?.close();state.streamConnected = false;lastConnectAttempt = Date.now();
    const stream = new EventSource('/api/events');state.stream = stream;
    const current = () => state.stream === stream;
    const observed = () => {state.streamConnected = true;state.lastStreamAt = Date.now();};
    stream.onopen = () => {if (current()) {observed();connectionLabel();}};
    stream.addEventListener('snapshot', (event) => {
      if (!current()) return;
      observed();
      try {applySnapshot(JSON.parse(event.data), { source: 'stream' });} catch {readFailure();}
    });
    stream.addEventListener('reset', () => {
      if (!current()) return;
      observed();
      $('transport-notice').hidden = false;
      $('transport-notice').textContent = '실시간 연결을 최신 전체 상태로 복구했습니다. 끊긴 동안의 모든 중간 사건이 재생된 것은 아닙니다.';
    });
    stream.addEventListener('heartbeat', (event) => {
      if (!current()) return;
      try {
        const heartbeat = JSON.parse(event.data);
        if (!['ok', 'degraded'].includes(heartbeat.collector_status)) throw new Error('invalid heartbeat');
        observed();
        if (heartbeat.collector_status === 'degraded') readFailure();
        else connectionLabel();
      } catch {readFailure();}
    });
    stream.addEventListener('stream_error', () => {if (current()) {observed();readFailure();}});
    stream.onerror = () => {
      if (!current()) return;
      state.streamConnected = false;connectionLabel();refresh();
    };
  }
  $('refresh-button').addEventListener('click', () => refresh(true));
  $('run-search').addEventListener('input', (event) => { state.search = event.target.value.trim(); render(); });
  $('kind-filter').addEventListener('change', (event) => { state.kind = event.target.value; render(); });
  $('activity-toggle').addEventListener('click', () => {
    state.expanded = !state.expanded;
    const run = runs().find((item) => item.id === state.selectedId);
    if (run) renderRun(run);
  });
  refresh();connectStream();
  setInterval(() => {
    const stale = !state.streamConnected || Date.now() - state.lastStreamAt >= 45000;
    if (stale) {
      state.streamConnected = false;connectionLabel();
      if (!document.hidden) refresh();
      if ((!state.stream || state.stream.readyState === 2 || Date.now() - state.lastStreamAt >= 45000) && Date.now() - lastConnectAttempt >= 15000) connectStream();
    }
  }, 3000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refresh();
      if (!state.stream || state.stream.readyState === 2) connectStream();
    }
  });
  window.addEventListener('pagehide', () => {state.stream?.close();state.streamConnected = false;});
  window.addEventListener('pageshow', () => {if (!state.stream || state.stream.readyState === 2) {connectStream();refresh();}});
})();
