"""Exercise real exam flows in Edge against a local or deployed site."""
import json
import os
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'qa' / 'exam'
OUT.mkdir(parents=True, exist_ok=True)
URL = os.environ.get('SITE_URL', 'http://127.0.0.1:8765/')
DATA = json.loads((ROOT / 'docs/data.json').read_text(encoding='utf-8'))
QUESTIONS = {q['id']: q for q in DATA['questions']}
KEY = 'mankiw-mock-exam-v1'

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge')
    context = browser.new_context(viewport={'width': 1440, 'height': 1080})
    errors = []
    context.on('page', lambda page: page.on('pageerror', lambda err: errors.append(str(err))))
    page = context.new_page()

    def ready(target=page):
        target.goto(URL)
        target.wait_for_function("document.querySelector('#total').textContent === '302'")

    def state(target=page):
        return target.evaluate('(key) => JSON.parse(localStorage.getItem(key))', KEY)

    def reopen(target=page):
        target.reload()
        target.wait_for_function("document.querySelector('#total').textContent === '302'")
        target.locator('#exam-mode').click()
        if target.locator('#exam-resume').count():
            target.locator('#exam-resume').click()

    def chapter_two(target=page):
        for ch in DATA['chapters']:
            target.locator(f'#exam-settings input[value="{ch}"]').set_checked(ch == '2')

    ready()
    original = {'1-quiz-1': {'notes': '연습 기록을 유지합니다', 'choice': 'a', 'done': True, 'checked': True}}
    page.evaluate('(records) => localStorage.setItem("mankiw-study-v1", JSON.stringify(records))', original)
    page.locator('#exam-mode').click()
    assert page.locator('#exam-count').input_value() == '30'
    assert page.locator('#exam-minutes').input_value() == '30'
    assert '228문항' in page.locator('#exam-pool').inner_text()
    page.screenshot(path=str(OUT / 'setup-desktop.png'), full_page=True)

    chapter_two()
    page.locator('#exam-kind').select_option('quiz')
    assert page.locator('#exam-start').is_disabled()
    assert '0문항' in page.locator('#exam-pool').inner_text()
    page.locator('#exam-kind').select_option('ox')
    assert '이번 시험 20문항' in page.locator('#exam-pool').inner_text()
    page.locator('#exam-start').click()
    s = state()
    assert len(s['questionIds']) == len(set(s['questionIds'])) == 20
    assert all(QUESTIONS[qid]['chapter'] == 2 for qid in s['questionIds'])
    assert page.locator('#exam .explanation, #exam .correct, #exam .incorrect').count() == 0
    assert page.locator('#exam-timer').inner_text().startswith('29:') or page.locator('#exam-timer').inner_text() == '30:00'
    page.locator('#exam-flag').click()
    first = QUESTIONS[s['questionIds'][0]]
    wrong = 'x' if first['answer'] == 'o' else 'o'
    page.locator(f'[data-exam-choice="{wrong}"]').click()
    page.locator('#exam-clear').click()
    assert not state()['answers'][first['id']]
    page.locator(f'[data-exam-choice="{wrong}"]').click()
    page.locator('#exam-submit').click()
    assert '19문항' in page.locator('#exam-dialog').inner_text()
    page.locator('#exam-confirm-cancel').click()
    assert state()['status'] == 'running'
    page.screenshot(path=str(OUT / 'running-desktop.png'), full_page=True)

    reopen()
    assert state()['questionIds'] == s['questionIds']
    assert state()['deadline'] == s['deadline']
    assert state()['answers'][first['id']] == wrong
    assert first['id'] in state()['flags']
    for i, qid in enumerate(s['questionIds'][3:], 3):
        page.locator(f'[data-exam-index="{i}"]').click()
        page.locator(f'[data-exam-choice="{QUESTIONS[qid]["answer"]}"]').click()
    page.locator('#exam-submit').click()
    assert '2문항' in page.locator('#exam-dialog').inner_text()
    page.locator('#exam-confirm').click()
    assert state()['status'] == 'submitted'
    assert '85' in page.locator('.exam-score strong').inner_text()
    assert '정답 17 / 자동 채점 20문항' in page.locator('.exam-score').inner_text()
    assert page.locator('#exam .explanation-body').is_visible()
    assert all(b.is_disabled() for b in page.locator('[data-exam-choice]').all())
    assert page.evaluate('JSON.parse(localStorage.getItem("mankiw-study-v1"))') == original
    page.locator('[data-review-filter="wrong"]').click()
    assert page.locator('[data-exam-index]').count() == 3
    page.screenshot(path=str(OUT / 'results-desktop.png'), full_page=True)
    page.locator('[data-review-filter="flagged"]').click()
    assert page.locator('[data-exam-index]').count() == 1
    page.locator('#exam-retry').click()
    page.locator('#exam-confirm').click()
    assert set(state()['questionIds']) == set(s['questionIds'][:3])
    assert state()['answers'] == {}
    assert page.locator('#exam .explanation').count() == 0

    # A deadline is absolute: reload cannot reset or pause the time limit.
    expired = state()
    expired['startedAt'] = int(time.time() * 1000) - 61000
    expired['deadline'] = int(time.time() * 1000) - 1000
    page.evaluate('({key, value}) => localStorage.setItem(key, JSON.stringify(value))', {'key': KEY, 'value': expired})
    reopen()
    assert state()['status'] == 'submitted'
    assert state()['automatic'] is True
    assert state()['submittedAt'] == expired['deadline']
    assert '자동 제출' in page.locator('#exam .scope-note').inner_text()

    # Expiry also submits an already open exam, without reload or a button click.
    ticking = dict(expired)
    ticking.update(startedAt=int(time.time() * 1000) - 57000, deadline=int(time.time() * 1000) + 3000)
    page.evaluate('({key, value}) => localStorage.setItem(key, JSON.stringify(value))', {'key': KEY, 'value': ticking})
    reopen()
    assert state()['status'] == 'running'
    page.wait_for_function('(key) => JSON.parse(localStorage.getItem(key)).status === "submitted"', arg=KEY, timeout=8000)
    assert state()['automatic'] is True

    page.locator('#exam-new').click()
    page.locator('#exam-kind').select_option('application')
    page.locator('#exam-count').select_option('10')
    page.locator('#exam-minutes').select_option('0')
    page.locator('#exam-start').click()
    assert all(QUESTIONS[qid]['kind'] == 'application' for qid in state()['questionIds'])
    assert state()['deadline'] is None
    written = '수요곡선이 오른쪽으로 이동합니다.\n<script>시험 답안</script>'
    page.locator('#exam-written').fill(written)
    assert '1' == page.locator('#exam-answered').inner_text()
    reopen()
    assert page.locator('#exam-written').input_value() == written
    page.locator('#exam-submit').click()
    page.locator('#exam-confirm').click()
    assert '서술형 연습' in page.locator('.exam-score').inner_text()
    assert '100점' not in page.locator('.exam-score').inner_text()
    assert page.locator('.exam-written-answer script').count() == 0
    assert written in page.locator('.exam-written-answer').inner_text()
    page.locator('[data-self-grade="wrong"]').click()
    assert list(state()['selfGrades'].values()) == ['wrong']

    # Actual default mixed exam contains unique IDs and uses a newly shuffled order.
    page.locator('#exam-new').click()
    page.locator('#exam-start').click()
    mixed = state()
    assert len(set(mixed['questionIds'])) == 30
    assert all(QUESTIONS[qid]['kind'] in ['quiz', 'ox'] for qid in mixed['questionIds'])
    page.locator('#exam-back-setup').click()
    page.locator('#exam-start').click()
    assert page.locator('#exam-dialog').is_visible()
    page.locator('#exam-confirm-cancel').click()
    assert state()['questionIds'] == mixed['questionIds']
    page.locator('#exam-start').click()
    page.locator('#exam-confirm').click()
    assert state()['questionIds'] != mixed['questionIds']

    # All four visible choices from the textbook image must be selectable.
    limited = state()
    limited.update(questionIds=['5-quiz-11'], index=0, answers={}, flags=[], deadline=None)
    page.evaluate('({key, value}) => localStorage.setItem(key, JSON.stringify(value))', {'key': KEY, 'value': limited})
    reopen()
    assert page.locator('[data-exam-choice]').count() == 4

    mobile = context.new_page()
    mobile.set_viewport_size({'width': 390, 'height': 844})
    ready(mobile)
    mobile.locator('#exam-mode').click()
    assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
    mobile.screenshot(path=str(OUT / 'setup-mobile.png'), full_page=True)
    mobile.locator('#exam-resume').click()
    assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
    mobile.locator('[data-exam-choice="b"]').click()
    mobile.locator('#exam-submit').click()
    mobile.locator('#exam-confirm').click()
    assert mobile.locator('.review-note').is_visible()
    assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
    mobile.screenshot(path=str(OUT / 'results-mobile.png'), full_page=True)
    assert errors == [], errors
    browser.close()
print('PASS: shuffled exam, chapter/type/count scope, hidden answers, navigation/flags, save/resume, submission/cancel, 85-point grading, wrong-only retry, active/reloaded expiry, written/self grading, practice records unchanged, four-option quiz, mobile layout, no browser errors')
