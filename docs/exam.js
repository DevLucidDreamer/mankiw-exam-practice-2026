/* Mock exams keep their own answers and never overwrite practice records. */
'use strict';
window.Exam = (() => {
  const key = 'mankiw-mock-exam-v1';
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const names = {quiz: '교재 퀴즈', ox: '개념 OX', application: '응용 문제'};
  let source, byId, attempt = null, view = 'setup', reviewFilter = 'all', storageWarning = false;
  const graded = q => q.kind !== 'application';
  const options = q => q.kind === 'ox' ? ['o', 'x'] : q.answerChoices || ['a', 'b', 'c', 'd'];
  const response = id => attempt.answers[id] || '';
  const answered = id => Boolean(response(id).trim());
  const currentQuestions = () => attempt.questionIds.map(id => byId.get(id));
  function shuffled(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function save() {
    try { localStorage.setItem(key, JSON.stringify(attempt)); }
    catch { storageWarning = true; }
  }
  function restore() {
    try {
      const a = JSON.parse(localStorage.getItem(key) || 'null');
      if (!a || a.version !== 1 || !['running', 'submitted'].includes(a.status) ||
          !Array.isArray(a.questionIds) || !a.questionIds.length || a.questionIds.length > source.questions.length ||
          new Set(a.questionIds).size !== a.questionIds.length || !a.questionIds.every(id => byId.has(id)) ||
          !Number.isFinite(a.startedAt) || a.startedAt <= 0 ||
          !(a.deadline === null || Number.isFinite(a.deadline) && a.deadline > a.startedAt) ||
          a.status === 'submitted' && (!Number.isFinite(a.submittedAt) || a.submittedAt < a.startedAt)) return;
      const answers = {};
      for (const id of a.questionIds) {
        const q = byId.get(id), value = a.answers?.[id];
        if (typeof value === 'string' && (!graded(q) || options(q).includes(value))) answers[id] = value;
      }
      attempt = {...a, answers, index: Number.isInteger(a.index) ? Math.max(0, Math.min(a.index, a.questionIds.length - 1)) : 0,
        flags: Array.isArray(a.flags) ? [...new Set(a.flags.filter(id => a.questionIds.includes(id)))] : [],
        selfGrades: Object.fromEntries(Object.entries(a.selfGrades || {}).filter(([id, mark]) => a.questionIds.includes(id) && byId.get(id).kind === 'application' && ['right', 'wrong'].includes(mark)))};
    } catch {}
  }
  function formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }
  function persistMessage() {
    return storageWarning ? '<p class="exam-warning">브라우저 저장 공간이 부족해 이번 답안은 새로고침하면 사라질 수 있습니다. 이 화면에서 시험을 마쳐 주세요.</p>' : '';
  }
  function setMode(examMode) {
    document.body.classList.toggle('exam-mode', examMode);
    $('#practice-intro').hidden = examMode;
    $('#practice-workspace').hidden = examMode;
    $('#exam').hidden = !examMode;
    $('#practice-mode').classList.toggle('active', !examMode);
    $('#exam-mode').classList.toggle('active', examMode);
    $('#practice-mode').setAttribute('aria-pressed', String(!examMode));
    $('#exam-mode').setAttribute('aria-pressed', String(examMode));
    if (examMode) { tick(); render(); }
  }
  function setup() {
    const last = attempt ? `<div class="exam-resume"><div><b>${attempt.status === 'running' ? '진행 중인 모의고사가 있어요.' : '최근 모의고사 결과가 있어요.'}</b><p>${attempt.questionIds.length}문항 · ${attempt.status === 'running' ? `${attempt.questionIds.filter(answered).length}문항 답안 작성` : '제출 완료'}</p></div><button id="exam-resume" class="primary">${attempt.status === 'running' ? '이어서 풀기' : '결과 보기'}</button></div>` : '';
    $('#exam').innerHTML = `<div class="exam-heading"><div class="eyebrow">PRACTICE EXAM</div><h1>준비한 만큼,<br><em>시험처럼 풀어보기.</em></h1><p>매번 문제를 새로 섞어 출제합니다. 정답과 해설은 제출 후에 공개됩니다.</p></div>${last}
      <form id="exam-settings" class="exam-settings"><fieldset><legend>시험 범위</legend><div class="exam-chapters">${Object.entries(source.chapters).map(([ch, title]) => `<label><input name="chapter" type="checkbox" value="${ch}" checked><span><b>${ch}장${ch === '2' ? ' 일부' : ''}</b> ${esc(title)}</span></label>`).join('')}</div><p class="note">2장은 MQ1 ch02의 18번 슬라이드(실증적·규범적 주장)만 포함합니다.</p></fieldset>
      <div class="exam-setting-grid"><label>문제 유형<select id="exam-kind"><option value="mixed">퀴즈 + OX · 자동 채점</option><option value="ox">개념 OX만</option><option value="quiz">교재 퀴즈만</option><option value="all">전체 유형 · 응용 문제 포함</option><option value="application">응용 문제만 · 자기 채점</option></select></label><label>문항 수<select id="exam-count"><option value="10">10문항</option><option value="20">20문항</option><option value="30" selected>30문항</option><option value="50">50문항</option><option value="100">100문항</option><option value="all">범위 내 전체 문항</option></select></label><label>제한시간<select id="exam-minutes"><option value="0">시간제한 없음</option><option value="20">20분</option><option value="30" selected>30분</option><option value="45">45분</option><option value="60">60분</option><option value="90">90분</option></select></label></div>
      <div class="exam-start-row"><div><b id="exam-pool"></b><p class="note" id="exam-type-note"></p></div><button type="submit" id="exam-start" class="primary">문제 섞고 시험 시작 →</button></div><p class="exam-form-error" id="exam-form-error" role="status"></p></form>
      <div class="exam-rules"><p><b>시험 중</b> 정답 확인 없이 풀고, 문항 번호를 눌러 자유롭게 이동하세요. 표시한 문항과 미응답 문항을 제출 전에 확인할 수 있습니다.</p><p><b>시험 종료</b> 제한시간이 지나면 자동 제출됩니다. 새로고침해도 답안과 남은 시간을 이어갑니다.</p><p><b>제출 후</b> 퀴즈·OX 점수와 문항별 해설을 확인하고, 오답만 모아 새 시험을 볼 수 있습니다. 응용 문제는 해설과 비교해 자기 채점합니다.</p></div><dialog id="exam-dialog"></dialog>`;
    const form = $('#exam-settings');
    const updatePool = () => {
      const pool = poolFromForm(), requested = $('#exam-count').value, count = requested === 'all' ? pool.length : Math.min(+requested, pool.length);
      $('#exam-pool').textContent = `출제 가능 ${pool.length}문항 · 이번 시험 ${count}문항`;
      $('#exam-start').disabled = pool.length === 0;
      $('#exam-type-note').textContent = ['all', 'application'].includes($('#exam-kind').value)
        ? '응용 문제는 자동 점수에서 제외하고 제출 후 자기 채점합니다.'
        : '퀴즈·OX는 같은 배점으로 제출 후 한 번에 채점합니다.';
      $('#exam-form-error').textContent = pool.length === 0 ? '선택한 범위와 유형에 해당하는 문제가 없습니다. 범위 또는 유형을 바꿔 주세요.' : requested !== 'all' && +requested > pool.length ? `선택한 범위에 맞춰 ${pool.length}문항을 모두 출제합니다.` : '';
    };
    form.onchange = updatePool;
    updatePool();
    form.onsubmit = e => {
      e.preventDefault();
      const pool = poolFromForm();
      if (!pool.length) return;
      const rawCount = $('#exam-count').value;
      const settings = {minutes: +$('#exam-minutes').value, kind: $('#exam-kind').value,
        chapters: [...$$('#exam-settings input:checked')].map(i => +i.value)};
      const begin = () => start(shuffled(pool).slice(0, rawCount === 'all' ? pool.length : Math.min(+rawCount, pool.length)), settings);
      if (attempt?.status === 'running') confirmAction('새 시험을 시작할까요?', '진행 중인 시험의 답안과 순서를 새 시험으로 바꿉니다.', '새 시험 시작', begin);
      else begin();
    };
    if ($('#exam-resume')) $('#exam-resume').onclick = () => { view = attempt.status === 'running' ? 'running' : 'results'; reviewFilter = 'all'; tick(); render(); };
  }
  function poolFromForm() {
    const chapters = [...$$('#exam-settings input:checked')].map(i => +i.value), kind = $('#exam-kind').value;
    return source.questions.filter(q => chapters.includes(q.chapter) && (kind === 'all' || kind === 'mixed' && graded(q) || q.kind === kind));
  }
  function start(qs, settings) {
    const now = Date.now();
    attempt = {version: 1, status: 'running', questionIds: qs.map(q => q.id), answers: {}, flags: [], selfGrades: {},
      index: 0, startedAt: now, deadline: settings.minutes ? now + settings.minutes * 60000 : null, settings};
    reviewFilter = 'all'; view = 'running'; save(); render();
    $('#exam').scrollIntoView({behavior: 'smooth', block: 'start'});
  }
  function confirmAction(title, message, label, action) {
    const dialog = $('#exam-dialog');
    dialog.innerHTML = `<h2>${esc(title)}</h2><p>${esc(message)}</p><div class="actions"><button id="exam-confirm-cancel">계속 풀기</button><button id="exam-confirm" class="primary">${esc(label)}</button></div>`;
    $('#exam-confirm-cancel').onclick = () => dialog.close();
    $('#exam-confirm').onclick = () => { dialog.close(); action(); };
    dialog.showModal();
    $('#exam-confirm-cancel').focus();
  }
  function submit(automatic = false) {
    if (!attempt || attempt.status !== 'running') return;
    automatic = automatic || Boolean(attempt.deadline && Date.now() >= attempt.deadline);
    attempt.status = 'submitted';
    attempt.submittedAt = automatic && attempt.deadline ? attempt.deadline : Date.now();
    attempt.automatic = automatic;
    attempt.index = 0;
    view = 'results'; reviewFilter = 'all'; save(); render();
    if (!$('#exam').hidden) $('#exam').scrollIntoView({behavior: 'smooth', block: 'start'});
  }
  function requestSubmit() {
    tick();
    if (attempt.status !== 'running') return;
    const empty = attempt.questionIds.filter(id => !answered(id)).length;
    confirmAction('답안을 제출할까요?', empty ? `아직 ${empty}문항에 답하지 않았습니다. 퀴즈·OX의 미응답은 오답으로 처리됩니다. 제출 후 답안은 수정할 수 없습니다.` : '모든 문항에 답했습니다. 제출 후 점수와 해설을 확인할 수 있고, 답안은 수정할 수 없습니다.', '제출하고 결과 보기', () => submit());
  }
  function tick() {
    if (!attempt || attempt.status !== 'running') return;
    const now = Date.now();
    if (attempt.deadline && now >= attempt.deadline) { submit(true); return; }
    const timer = $('#exam-timer');
    if (timer) {
      timer.textContent = attempt.deadline ? formatTime(Math.ceil((attempt.deadline - now) / 1000)) : `${formatTime((now - attempt.startedAt) / 1000)} 경과`;
      timer.classList.toggle('time-low', Boolean(attempt.deadline && attempt.deadline - now <= 300000));
    }
  }
  function status(q) {
    if (!graded(q)) return !answered(q.id) ? '미작성' : attempt.selfGrades[q.id] === 'right' ? '자기 채점 정답' : attempt.selfGrades[q.id] === 'wrong' ? '자기 채점 오답' : '자기 채점';
    return !answered(q.id) ? '미응답' : response(q.id) === q.answer ? '정답' : '오답';
  }
  function incorrect(q) { return graded(q) ? response(q.id) !== q.answer : !answered(q.id) || attempt.selfGrades[q.id] === 'wrong'; }
  function palette(qs, submitted) {
    return `<div class="exam-palette"><h2>${submitted ? '문항별 결과' : '답안지'}</h2><div class="exam-number-grid">${qs.map(q => {
      const i = attempt.questionIds.indexOf(q.id), hasAnswer = answered(q.id), marked = attempt.flags.includes(q.id);
      const result = submitted ? graded(q) ? response(q.id) === q.answer ? 'right' : 'wrong' : 'self' : hasAnswer ? 'answered' : '';
      return `<button type="button" data-exam-index="${i}" class="${result} ${i === attempt.index ? 'current' : ''} ${marked ? 'flagged' : ''}" aria-label="${i + 1}번 ${submitted ? status(q) : hasAnswer ? '답안 작성' : '미응답'}${marked ? ', 표시한 문항' : ''}" aria-current="${i === attempt.index ? 'true' : 'false'}">${i + 1}${marked ? '<sup>★</sup>' : ''}</button>`;
    }).join('')}</div><p class="note">${submitted ? '초록: 정답 · 주황: 오답·미응답<br>서술형은 자기 채점' : '채운 칸: 답안 작성 · ★: 다시 볼 문항<br>번호를 눌러 바로 이동할 수 있습니다.'}</p></div>`;
  }
  function prompt(q, index) {
    return `<span class="badge">${index + 1} / ${attempt.questionIds.length} · ${names[q.kind]}</span><h2 id="exam-question-title" tabindex="-1">${index + 1}번 문제</h2><p class="meta">${q.chapter}장 · ${esc(source.chapters[q.chapter])} · 원문 ${q.number}번${q.chapter === 2 ? ' · MQ1 ch02 18번 슬라이드' : ''}</p>${q.kind === 'ox'
      ? `<div class="ox-prompt"><span class="topic-pill">${esc(q.topic)}</span><p>${esc(q.statement)}</p><span class="note">옳으면 O, 틀리면 X를 선택하세요.</span></div>`
      : `<div class="source-images">${q.images.map((src, i) => `<img src="${esc(src)}" alt="${q.chapter}장 ${names[q.kind]} ${q.number}번 원문 ${i + 1}">`).join('')}</div>`}`;
  }
  function questionCard(q, submitted, visible) {
    const index = attempt.questionIds.indexOf(q.id), value = response(q.id), marked = attempt.flags.includes(q.id);
    const previous = visible.indexOf(q) - 1, next = visible.indexOf(q) + 1;
    return `<article class="card exam-card" aria-labelledby="exam-question-title">${prompt(q, index)}${graded(q)
      ? `<div class="choices ${q.kind === 'ox' ? 'ox-choices' : ''}" role="group" aria-label="모의고사 답 선택">${options(q).map(c => `<button type="button" data-exam-choice="${c}" aria-pressed="${value === c}" ${submitted ? 'disabled' : ''} class="${value === c ? 'chosen' : ''} ${submitted && c === q.answer ? 'correct' : ''} ${submitted && c === value && c !== q.answer ? 'incorrect' : ''}">${c.toUpperCase()}${q.kind === 'ox' ? `<small>${c === 'o' ? '옳다' : '틀리다'}</small>` : ''}</button>`).join('')}</div>`
      : submitted ? `<div class="exam-written-answer"><b>내가 작성한 답안</b><p>${esc(value || '작성한 답안이 없습니다.')}</p></div>`
        : `<label class="notes-label" for="exam-written">서술형 답안</label><textarea id="exam-written" placeholder="계산 과정과 결론의 근거를 적어 주세요.">${esc(value)}</textarea><p class="note">답안은 자동 저장됩니다. 응용 문제는 제출 후 해설과 비교해 자기 채점합니다.</p>`}
      ${submitted ? `<div class="result ${graded(q) && response(q.id) !== q.answer ? 'wrong' : ''}"><b>${status(q)}</b>${graded(q) ? `<br>나의 답: ${esc(value.toUpperCase() || '미응답')} · 정답: ${q.answer.toUpperCase()}` : ''}</div>${q.reviewNote ? `<p class="review-note">${esc(q.reviewNote)}</p>` : ''}<details class="explanation" open><summary>해설 · 풀이 과정과 판단 근거</summary><div class="explanation-body">${q.explanation.split('\n').map(p => `<p>${esc(p)}</p>`).join('')}<span class="note">${esc(q.explanationSource)}</span></div></details>${!graded(q) ? `<div class="actions"><span class="note">해설과 내 답안을 비교해 표시하세요.</span><button data-self-grade="right" aria-pressed="${attempt.selfGrades[q.id] === 'right'}">맞게 풀었어요</button><button data-self-grade="wrong" aria-pressed="${attempt.selfGrades[q.id] === 'wrong'}">다시 풀어야 해요</button></div>` : ''}`
      : `<div class="exam-answer-status" id="exam-answer-status" role="status">${value ? '답안 저장됨' : '아직 답하지 않았습니다.'}</div><div class="actions"><button id="exam-flag" aria-pressed="${marked}">${marked ? '★ 표시 해제' : '☆ 나중에 다시 보기'}</button><button id="exam-clear" ${!value ? 'disabled' : ''}>답안 지우기</button></div>`}
      <div class="pagination"><button data-exam-move="${previous}" ${previous < 0 ? 'disabled' : ''}>← 이전</button><span>${visible.indexOf(q) + 1} / ${visible.length}</span><button data-exam-move="${next}" ${next >= visible.length ? 'disabled' : ''}>다음 →</button></div></article>`;
  }
  function running() {
    const qs = currentQuestions(), q = qs[attempt.index];
    $('#exam').innerHTML = `<div class="exam-session-top"><div><span class="eyebrow">MOCK EXAM IN PROGRESS</span><h1>연습 모의고사</h1></div><button id="exam-back-setup">설정으로 돌아가기</button></div><div class="exam-status-bar"><div><span class="note">${attempt.deadline ? '남은 시간' : '시험 시간'}</span><strong id="exam-timer" role="timer"></strong></div><div class="exam-answered"><b id="exam-answered">${attempt.questionIds.filter(answered).length}</b> / ${qs.length}문항 작성</div><button id="exam-submit" class="primary">답안 제출</button></div>${persistMessage()}<div class="exam-layout"><div id="exam-question">${questionCard(q, false, qs)}</div><div id="exam-map">${palette(qs, false)}</div></div><dialog id="exam-dialog"></dialog>`;
    $('#exam-submit').onclick = requestSubmit;
    $('#exam-back-setup').onclick = () => { view = 'setup'; render(); };
    bindQuestion(q, qs, false);
    tick();
  }
  function bindPalette() {
    $$('[data-exam-index]').forEach(b => { b.onclick = () => go(+b.dataset.examIndex); });
  }
  function go(index) {
    tick();
    attempt.index = index; save(); render();
    $('#exam-question').scrollIntoView({behavior: 'smooth', block: 'start'});
    $('#exam-question-title')?.focus({preventScroll: true});
  }
  function bindQuestion(q, visible, submitted) {
    bindPalette();
    $$('[data-exam-move]').forEach(b => { b.onclick = () => go(attempt.questionIds.indexOf(visible[+b.dataset.examMove].id)); });
    if (submitted) {
      $$('[data-self-grade]').forEach(b => { b.onclick = () => { attempt.selfGrades[q.id] = b.dataset.selfGrade; save(); render(); }; });
      return;
    }
    const setAnswer = value => {
      tick();
      if (attempt.status !== 'running') return;
      attempt.answers[q.id] = value; save();
      $('#exam-answered').textContent = attempt.questionIds.filter(answered).length;
      $('#exam-answer-status').textContent = value.trim() ? '답안 저장됨' : '아직 답하지 않았습니다.';
      $('#exam-clear').disabled = !value;
      $('#exam-map').innerHTML = palette(currentQuestions(), false); bindPalette();
      if (storageWarning && !$('#exam .exam-warning')) $('#exam .exam-status-bar')?.insertAdjacentHTML('afterend', persistMessage());
    };
    $$('[data-exam-choice]').forEach(b => { b.onclick = () => {
      setAnswer(b.dataset.examChoice);
      if (attempt.status !== 'running') return;
      $$('[data-exam-choice]').forEach(c => { c.classList.toggle('chosen', c === b); c.setAttribute('aria-pressed', String(c === b)); });
    }; });
    if ($('#exam-written')) $('#exam-written').oninput = e => setAnswer(e.target.value);
    $('#exam-flag').onclick = () => {
      tick(); if (attempt.status !== 'running') return;
      attempt.flags = attempt.flags.includes(q.id) ? attempt.flags.filter(id => id !== q.id) : [...attempt.flags, q.id];
      save(); render();
    };
    $('#exam-clear').onclick = () => { setAnswer(''); if (attempt.status === 'running') render(); };
  }
  function results() {
    const qs = currentQuestions(), objective = qs.filter(graded), correct = objective.filter(q => response(q.id) === q.answer).length;
    const unanswered = qs.filter(q => !answered(q.id)).length, apps = qs.length - objective.length;
    const missed = qs.filter(incorrect), marked = qs.filter(q => attempt.flags.includes(q.id));
    const visible = reviewFilter === 'wrong' ? missed : reviewFilter === 'flagged' ? marked : qs;
    if (!visible.some(q => q.id === attempt.questionIds[attempt.index])) attempt.index = visible.length ? attempt.questionIds.indexOf(visible[0].id) : 0;
    const q = visible.find(q => q.id === attempt.questionIds[attempt.index]);
    const kindSummary = ['quiz', 'ox'].map(kind => {
      const typed = objective.filter(q => q.kind === kind);
      return typed.length ? `${names[kind]} ${typed.filter(q => response(q.id) === q.answer).length}/${typed.length}` : '';
    }).filter(Boolean).join(' · ');
    $('#exam').innerHTML = `<div class="exam-session-top"><div><span class="eyebrow">MOCK EXAM RESULTS</span><h1>모의고사 결과</h1></div><button id="exam-new">새 모의고사</button></div>${attempt.automatic ? '<p class="scope-note">제한시간이 끝나 답안이 자동 제출되었습니다.</p>' : ''}${persistMessage()}<div class="exam-result-summary"><div class="exam-score"><span>${objective.length ? '자동 채점 점수' : '서술형 연습'}</span><strong>${objective.length ? `${Math.round(correct / objective.length * 100)}<small> / 100점</small>` : `${apps}<small>문항</small>`}</strong><p>${objective.length ? `정답 ${correct} / 자동 채점 ${objective.length}문항` : '해설과 비교해 자기 채점하세요.'}</p></div><div><h2>${kindSummary || '응용 문제 모의고사'}</h2><p>전체 ${qs.length}문항 · 미응답 ${unanswered}문항<br>소요시간 ${formatTime((attempt.submittedAt - attempt.startedAt) / 1000)}</p>${apps ? `<p class="note">응용 ${apps}문항은 자동 점수에서 제외됩니다. 해설과 비교해 문항별로 자기 채점하세요.</p>` : '<p class="note">퀴즈·OX는 동일 배점입니다. 미응답은 오답으로 계산합니다.</p>'}</div></div><div class="exam-result-actions"><div class="exam-review-tabs" role="group" aria-label="결과 필터"><button data-review-filter="all" aria-pressed="${reviewFilter === 'all'}">전체 ${qs.length}</button><button data-review-filter="wrong" aria-pressed="${reviewFilter === 'wrong'}">오답·미응답 ${missed.length}</button><button data-review-filter="flagged" aria-pressed="${reviewFilter === 'flagged'}">표시한 문제 ${marked.length}</button></div><button id="exam-retry" class="primary" ${missed.length ? '' : 'disabled'}>오답만 섞어 다시 시험</button></div>${q ? `<div class="exam-layout"><div id="exam-question">${questionCard(q, true, visible)}</div><div id="exam-map">${palette(visible, true)}</div></div>` : '<div class="card empty">이 조건에 해당하는 문제가 없습니다.<br>전체 문항에서 해설을 확인하거나 새 모의고사를 시작하세요.</div>'}<dialog id="exam-dialog"></dialog>`;
    $('#exam-new').onclick = () => { view = 'setup'; render(); };
    $$('[data-review-filter]').forEach(b => { b.onclick = () => { reviewFilter = b.dataset.reviewFilter; render(); }; });
    $('#exam-retry').onclick = () => {
      if (!missed.length) return;
      confirmAction('오답으로 다시 시험을 볼까요?', `${missed.length}문항을 새로 섞어 출제합니다. 지금 결과는 새 시험으로 바뀝니다.`, '오답 시험 시작', () => start(shuffled(missed), attempt.settings || {minutes: 30, kind: 'all'}));
    };
    if (q) bindQuestion(q, visible, true);
  }
  function render() {
    if (!source || $('#exam').hidden) return;
    if (view === 'running' && attempt?.status === 'submitted') view = 'results';
    if (view === 'setup' || !attempt) setup();
    else if (view === 'running') running();
    else results();
  }
  function init(d) {
    source = d; byId = new Map(d.questions.map(q => [q.id, q]));
    restore();
    $('#exam-mode').onclick = () => setMode(true);
    $('#practice-mode').onclick = () => setMode(false);
    setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    tick();
  }
  return {init};
})();
