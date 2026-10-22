"""Verify every clean quiz image and its use in practice and mock exams."""
import json
import os
import re
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'qa/clean9'
OUT.mkdir(parents=True, exist_ok=True)
URL = os.environ.get('SITE_URL', 'http://127.0.0.1:8765/')
data = json.loads((ROOT / 'docs/data.json').read_text(encoding='utf-8'))
quizzes = [q for q in data['questions'] if q['kind'] == 'quiz']
keys = {1: 'acbdcbddab', 3: 'bcdbadbd', 4: 'cbabadacdbacd', 5: 'addcbcccacb',
        6: 'ddacadcb', 7: 'bbdcbcacbc', 9: 'dbcabcac'}
assert len(data['questions']) == 302 and len(quizzes) == 68
assert len({q['id'] for q in data['questions']}) == 302
images = []
for q in quizzes:
    assert q['answer'] == keys[q['chapter']][q['number'] - 1], q['id']
    assert re.match(rf"^\s*{q['number']}\s*\.", q['text']), q['id']
    assert q['sourcePdf'] == '맨큐의 경제학 제 9판.pdf'
    assert q['printedPages'] == list(dict.fromkeys(p - 32 for p in q['pages']))
    assert q['explanation'] and '제9판' in q['source']
    for name in q['images']:
        assert name.startswith('questions/clean9/')
        with Image.open(ROOT / 'docs' / name) as im:
            assert im.width > 700 and im.height > 30, name
            im.verify()
        images.append(name)
assert len(images) == len(set(images)) == 77

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge')
    page = browser.new_page(viewport={'width': 1440, 'height': 1080})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    page.wait_for_function("document.querySelector('#total').textContent === '302'")

    def loaded(selector):
        page.wait_for_function("selector => { const imgs=[...document.querySelectorAll(selector)]; return imgs.length>0 && imgs.every(img=>img.complete && img.naturalWidth>0); }", arg=selector)
        return page.locator(selector).evaluate_all('(imgs) => imgs.map(img => img.getAttribute("src"))')

    seen = []
    for q in quizzes:
        page.evaluate("id => { selected=id; card(data.questions.filter(q=>q.kind==='quiz')); }", q['id'])
        assert loaded('#card .source-images img') == q['images'], q['id']
        assert '제9판' in page.locator('#card .meta').inner_text()
        assert page.locator('#card .explanation').count() == 0
        seen.extend(q['images'])
    assert set(seen) == set(images)
    page.evaluate("() => {selected='1-quiz-6';card(data.questions.filter(q=>q.kind==='quiz')); window.scrollTo(0,0);}")
    loaded('#card .source-images img')
    page.screenshot(path=str(OUT / 'practice-clean-desktop.png'), full_page=True)

    page.locator('#exam-mode').click()
    page.locator('#exam-kind').select_option('quiz')
    page.locator('#exam-count').select_option('all')
    page.locator('#exam-minutes').select_option('0')
    page.locator('#exam-start').click()
    attempt = page.evaluate("JSON.parse(localStorage.getItem('mankiw-mock-exam-v1'))")
    assert set(attempt['questionIds']) == {q['id'] for q in quizzes}
    for qid in [attempt['questionIds'][0], '5-quiz-11', '7-quiz-2']:
        index = attempt['questionIds'].index(qid)
        page.locator(f'[data-exam-index="{index}"]').click()
        assert all('/clean9/' in src for src in loaded('#exam .source-images img'))
        assert page.locator('#exam .explanation').count() == 0
    page.set_viewport_size({'width': 390, 'height': 844})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(OUT / 'exam-clean-mobile.png'), full_page=True)
    assert not errors, errors
    browser.close()
print('PASS: all 68 quiz identities and answer keys; 77 complete new image files decoded in browser; clean source/printed page metadata; mock exam uses same images; mobile fits; no browser errors')
