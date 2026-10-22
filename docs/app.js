'use strict';
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const key = 'mankiw-study-v1';
const labels = {quiz: '간단한 퀴즈', application: '응용 문제', ox: '개념 OX'};
let data, chapter = 'all', kind = 'all', filter = 'all', selected = null, order = null, records = {}, reviewId = null;
try {
  const stored = JSON.parse(localStorage.getItem(key) || '{}');
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) records = stored;
} catch {}
const safe = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const paragraphs = s => String(s || '').split('\n').map(p => `<p>${safe(p)}</p>`).join('');
const record = q => records[q.id] || {};
const autoGraded = q => q.kind === 'quiz' || q.kind === 'ox';
const choices = q => q.kind === 'ox' ? ['o', 'x'] : q.answerChoices || ['a', 'b', 'c', 'd'];
function save() {
  try { localStorage.setItem(key, JSON.stringify(records)); }
  catch { toast('저장 공간이 부족합니다. 학습 기록을 내보내 주세요.'); }
}
function update(id, patch) {
  records[id] = {...records[id], ...patch};
  save(); stats();
}
let toastTimer;
function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').style.display = 'block';
  toastTimer = setTimeout(() => { $('#toast').style.display = 'none'; }, 3000);
}
function questions() {
  let qs = data.questions.filter(q => (chapter === 'all' || q.chapter === chapter) && (kind === 'all' || q.kind === kind));
  qs = qs.filter(q => {
    const r = record(q);
    return q.id === reviewId || filter === 'all' || filter === 'new' && !r.done ||
      filter === 'wrong' && autoGraded(q) && r.checked && r.choice !== q.answer ||
      filter === 'bookmarked' && r.bookmark;
  });
  if (order) {
    const positions = new Map(order.map((id, i) => [id, i]));
    qs.sort((a, b) => positions.get(a.id) - positions.get(b.id));
  }
  return qs;
}
function stats() {
  const all = data.questions;
  const done = all.filter(q => record(q).done).length;
  const checked = all.filter(q => autoGraded(q) && record(q).checked);
  const correct = checked.filter(q => record(q).choice === q.answer).length;
  const p = all.length ? Math.round(done / all.length * 100) : 0;
  $('#done').textContent = done;
  $('#total').textContent = all.length;
  $('#percent').textContent = `${p}%`;
  $('#ring').style.background = `conic-gradient(var(--green) ${p}%,#d3dbc8 ${p}%)`;
  $('#score').textContent = checked.length ? `퀴즈·OX ${checked.length}문제 채점 · ${correct}문제 정답` : '차근차근 시작해 보세요';
}
function navigation() {
  const counts = ch => data.questions.filter(q => ch === 'all' || q.chapter === ch).length;
  $('#chapters').innerHTML = [['all', '전체 범위'], ...Object.entries(data.chapters).map(([n, t]) => [+n, t])]
    .map(([n, t]) => `<button data-chapter="${n}" data-label="${n}장${n === 2 ? ' 일부' : ''}" class="${chapter === n ? 'active' : ''}" aria-pressed="${chapter === n}"><span>${n === 'all' ? 'ALL' : String(n).padStart(2, '0')}</span>${safe(t)} <span>${counts(n)}</span></button>`).join('');
  $$('#chapters button').forEach(b => { b.onclick = () => {
    chapter = b.dataset.chapter === 'all' ? 'all' : +b.dataset.chapter;
    selected = null; order = null; reviewId = null; render();
  }; });
}
function render() {
  navigation(); stats();
  const qs = questions();
  if (!qs.some(q => q.id === selected)) selected = qs[0]?.id;
  $('#section-title').textContent = chapter === 'all' ? '전체 문제' : `${chapter}장 · ${data.chapters[chapter]}`;
  $('#count').textContent = `${qs.length}문제`;
  const note = data.chapterNotes?.[chapter];
  $('#scope-note').hidden = !note;
  $('#scope-note').textContent = note || '';
  const concept = data.concepts?.[chapter];
  $('#concept').hidden = !concept;
  $('#concept').innerHTML = concept ? `<summary>범위 개념 정리 · ${safe(concept.title)}</summary><div><span class="note">${safe(concept.source)} · 학습용 보충 설명</span>${concept.paragraphs.map(p => `<p>${safe(p)}</p>`).join('')}</div>` : '';
  $('#question-list').innerHTML = qs.map(q => {
    const r = record(q);
    const icon = r.bookmark ? '★' : r.done ? autoGraded(q) && r.choice !== q.answer ? '↻' : '✓' : '○';
    return `<button data-id="${q.id}" class="${selected === q.id ? 'selected' : ''}" aria-pressed="${selected === q.id}"><span><small>${q.chapter}장 · ${labels[q.kind]}</small>문제 ${q.number}${q.topic ? `<small class="topic">${safe(q.topic)}</small>` : ''}</span><span class="status">${icon}</span></button>`;
  }).join('');
  $$('#question-list button').forEach(b => { b.onclick = () => { selected = b.dataset.id; reviewId = null; render(); }; });
  card(qs);
}
function explanation(q, checked) {
  if (!q.explanation || autoGraded(q) && !checked) return '';
  return `<details class="explanation" ${autoGraded(q) ? 'open' : ''}><summary>${q.kind === 'application' ? '해설 보기 · 풀이 과정과 판단 근거' : '해설 · 왜 이 답일까요?'}</summary><div class="explanation-body">${paragraphs(q.explanation)}<span class="note">${safe(q.explanationSource)}</span></div></details>`;
}
function card(qs) {
  const q = qs.find(q => q.id === selected);
  if (!q) {
    $('#card').innerHTML = '<div class="empty">이 조건에 해당하는 문제가 없습니다.<br>다른 장이나 학습 상태를 선택해 보세요.</div>';
    return;
  }
  const r = record(q), index = qs.indexOf(q), graded = autoGraded(q);
  const meta = q.source || `${q.chapter}장 ${data.chapters[q.chapter]} · 교재 ${[...new Set(q.pages.map(p => p - 26))].join(', ')}쪽 (PDF ${[...new Set(q.pages)].join(', ')}쪽)`;
  const prompt = q.kind === 'ox'
    ? `<div class="ox-prompt"><span class="topic-pill">${safe(q.topic)}</span><p>${safe(q.statement)}</p><span class="note">문장이 옳으면 O, 틀리면 X를 선택하세요.</span></div>`
    : `<div class="source-images">${q.images.map((src, i) => `<img src="${safe(src)}" alt="${q.chapter}장 ${labels[q.kind]} ${q.number} 원문 ${i + 1}" loading="eager">`).join('')}</div>`;
  $('#card').innerHTML = `
    <div class="card-top"><span class="badge">CHAPTER ${String(q.chapter).padStart(2, '0')} · ${q.kind === 'ox' ? 'CONCEPT OX' : q.kind === 'quiz' ? 'QUICK QUIZ' : 'APPLICATION'}</span><button class="bookmark" id="bookmark" aria-label="북마크 ${r.bookmark ? '해제' : '추가'}" aria-pressed="${!!r.bookmark}">${r.bookmark ? '★' : '☆'}</button></div>
    <h2>${labels[q.kind]} ${q.number}</h2><div class="meta">${safe(meta)}</div>${prompt}
    ${graded ? `<div class="choices ${q.kind === 'ox' ? 'ox-choices' : ''}" role="group" aria-label="답 선택">${choices(q).map(c => `<button data-choice="${c}" aria-pressed="${r.choice === c}" class="${r.choice === c ? 'chosen' : ''} ${r.checked && c === q.answer ? 'correct' : ''} ${r.checked && c === r.choice && c !== q.answer ? 'incorrect' : ''}">${c.toUpperCase()}${q.kind === 'ox' ? `<small>${c === 'o' ? '옳다' : '틀리다'}</small>` : ''}</button>`).join('')}</div>
    <div class="actions"><button id="check" class="primary">${r.checked ? '다시 채점' : '정답·해설 확인'}</button><button id="retry">이 문제 다시 풀기</button></div>
    ${r.checked ? `<div class="result ${r.choice === q.answer ? '' : 'wrong'}"><b>${r.choice === q.answer ? '정답입니다.' : '오답입니다. 해설을 확인하세요.'}</b><br>${q.kind === 'quiz' ? '교재 정답' : '정답'}: ${q.answer.toUpperCase()} · 선택한 답: ${safe((r.choice || '').toUpperCase())}</div>${q.reviewNote ? `<div class="review-note">${safe(q.reviewNote)}</div>` : ''}` : ''}`
    : '<p class="note">먼저 직접 풀고 해설과 비교해 보세요. 응용 문제의 학습 완료는 직접 표시합니다.</p>'}
    ${explanation(q, r.checked)}
    ${q.id === reviewId && (filter === 'new' && r.done || filter === 'wrong' && r.checked && r.choice === q.answer) ? '<p class="note">해설을 확인할 수 있도록 현재 문항을 잠시 유지합니다. 다른 문항이나 필터로 이동하면 목록에 반영됩니다.</p>' : ''}
    <label class="notes-label" for="notes">나의 풀이 · 헷갈린 개념</label><textarea id="notes" placeholder="여기에 풀이를 작성하세요. 입력한 내용은 자동 저장됩니다.">${safe(r.notes || '')}</textarea><div class="note" id="saved">현재 브라우저에 자동 저장</div>
    ${!graded ? `<div class="actions"><button id="complete" class="primary">${r.done ? '✓ 학습 완료 · 다시 미완료로' : '풀이 완료로 표시'}</button></div>` : ''}
    <div class="pagination"><button id="prev" ${index === 0 ? 'disabled' : ''}>← 이전</button><span>${index + 1} / ${qs.length}</span><button id="next" ${index === qs.length - 1 ? 'disabled' : ''}>다음 →</button></div>`;
  $('#bookmark').onclick = () => { update(q.id, {bookmark: !record(q).bookmark}); render(); };
  $('#notes').oninput = e => { update(q.id, {notes: e.target.value}); $('#saved').textContent = '저장됨'; };
  function move(n) { selected = qs[index + n].id; reviewId = null; render(); $('#card').scrollIntoView({behavior: 'smooth', block: 'start'}); }
  $('#prev').onclick = () => move(-1);
  $('#next').onclick = () => move(1);
  if (graded) {
    $$('.choices button').forEach(b => { b.onclick = () => {
      update(q.id, {choice: b.dataset.choice, checked: false, done: false}); reviewId = q.id; render();
    }; });
    $('#check').onclick = () => {
      if (!choices(q).includes(record(q).choice)) { toast('답을 먼저 선택해 주세요.'); return; }
      update(q.id, {checked: true, done: true}); reviewId = q.id; render();
    };
    $('#retry').onclick = () => { update(q.id, {choice: null, checked: false, done: false}); reviewId = q.id; render(); };
  } else {
    $('#complete').onclick = () => { update(q.id, {done: !record(q).done}); reviewId = q.id; render(); };
  }
}
$('#types').onclick = e => {
  const button = e.target.closest('button[data-kind]');
  if (!button) return;
  kind = button.dataset.kind;
  $$('#types button').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); });
  selected = null; reviewId = null; render();
};
$('#filter').onchange = e => { filter = e.target.value; selected = null; reviewId = null; render(); };
$('#shuffle').onclick = () => {
  order = data.questions.map(q => q.id);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  selected = null; reviewId = null; render(); toast('현재 조건의 문제 순서를 섞었습니다.');
};
$('#export').onclick = () => {
  const u = URL.createObjectURL(new Blob([JSON.stringify({version: 1, records}, null, 2)], {type: 'application/json'}));
  const a = document.createElement('a'); a.href = u; a.download = 'mankiw-study-records.json'; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000);
};
$('#import').onchange = async e => {
  if (!e.target.files[0]) return;
  try {
    const x = JSON.parse(await e.target.files[0].text());
    if (x.version !== 1 || !x.records || typeof x.records !== 'object' || Array.isArray(x.records)) throw Error();
    const valid = {};
    for (const q of data.questions) {
      const r = x.records[q.id];
      if (r && typeof r === 'object' && !Array.isArray(r)) {
        const choice = autoGraded(q) && choices(q).includes(r.choice) ? r.choice : null;
        const checked = autoGraded(q) && r.checked === true && choice !== null;
        valid[q.id] = {notes: typeof r.notes === 'string' ? r.notes : '', bookmark: r.bookmark === true,
          done: autoGraded(q) ? checked : r.done === true, checked, choice};
      }
    }
    records = {...records, ...valid}; save(); render(); toast('학습 기록을 가져왔습니다.');
  } catch { toast('올바른 학습 기록 JSON 파일을 선택해 주세요.'); }
  e.target.value = '';
};
fetch('data.json?v=20261022').then(r => { if (!r.ok) throw Error(); return r.json(); }).then(d => {
  data = d; $('#scope').textContent = d.scope;
  const counts = k => d.questions.filter(q => q.kind === k).length;
  $('#inventory').textContent = `교재 ${counts('quiz') + counts('application')}문항 해설 · 개념 OX ${counts('ox')}문항`;
  render();
  window.Exam.init(d);
}).catch(() => { $('#card').innerHTML = '<div class="empty">문제 데이터를 불러오지 못했습니다. 페이지를 새로고침해 주세요.</div>'; });
