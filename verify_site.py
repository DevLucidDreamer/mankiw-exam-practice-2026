"""Browser regression checks for grading, explanations, scope, and saved records."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
OUT = ROOT.parent / 'tmp' / 'site-qa'
OUT.mkdir(parents=True, exist_ok=True)
DATA = json.loads((ROOT / 'docs/data.json').read_text(encoding='utf-8'))
URL = 'http://127.0.0.1:8765/'
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge')
    context = browser.new_context(viewport={'width': 1440, 'height': 1080}, accept_downloads=True)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    page.wait_for_function("document.querySelector('#total').textContent === '302'")
    page.locator('#check').click()
    assert page.locator('#toast').inner_text() == '답을 먼저 선택해 주세요.'
    assert page.locator('.explanation').count() == 0
    page.locator('[data-choice="a"]').click()
    page.locator('#check').click()
    assert '정답입니다' in page.locator('.result').inner_text()
    assert page.locator('.explanation-body').is_visible()
    page.locator('#notes').fill('기존 퀴즈 메모 보존 확인')
    page.locator('#bookmark').click()

    page.locator('#types [data-kind="ox"]').click()
    assert page.locator('#count').inner_text() == '160문제'
    page.locator('[data-chapter="2"]').click()
    assert page.locator('#count').inner_text() == '20문제'
    assert '18번 슬라이드만' in page.locator('#scope-note').inner_text()
    page.locator('#concept summary').click()
    assert '실증적 주장' in page.locator('#concept').inner_text()
    page.locator('[data-choice="x"]').click()
    page.locator('#check').click()
    assert '오답입니다' in page.locator('.result').inner_text()
    assert page.locator('.explanation-body').is_visible()
    page.locator('#notes').fill('OX 기록 보존 확인')
    page.locator('#bookmark').click()
    page.locator('#filter').select_option('wrong')
    assert page.locator('#count').inner_text() == '1문제'
    assert page.locator('[data-choice="o"]').get_attribute('class').find('correct') >= 0
    page.locator('#filter').select_option('all')
    page.screenshot(path=str(OUT / 'desktop-ox.png'), full_page=True)
    page.reload()
    page.wait_for_function("document.querySelector('#total').textContent === '302'")
    page.locator('#types [data-kind="ox"]').click()
    page.locator('[data-chapter="2"]').click()
    assert page.locator('#notes').input_value() == 'OX 기록 보존 확인'
    assert page.locator('.result.wrong').count() == 1
    with page.expect_download() as download:
        page.locator('#export').click()
    backup = OUT / 'records.json'
    download.value.save_as(str(backup))
    records = json.loads(backup.read_text(encoding='utf-8'))
    assert records['records']['2-ox-1']['choice'] == 'x'
    assert records['records']['1-quiz-1']['notes'] == '기존 퀴즈 메모 보존 확인'
    page.locator('#retry').click()
    assert page.locator('.result').count() == 0
    assert page.locator('#notes').input_value() == 'OX 기록 보존 확인'
    page.locator('#import').set_input_files(str(backup))
    assert page.locator('.result.wrong').count() == 1

    # Older v1 backups have no OX entries, and must still import correctly.
    legacy = OUT / 'legacy-records.json'
    legacy.write_text(json.dumps({'version': 1, 'records': {'1-quiz-1': {
        'choice': 'a', 'checked': True, 'done': True, 'notes': '이전 버전 메모', 'bookmark': True}}}), encoding='utf-8')
    page.locator('#import').set_input_files(str(legacy))
    page.locator('[data-chapter="1"]').click()
    page.locator('#types [data-kind="quiz"]').click()
    assert page.locator('#notes').input_value() == '이전 버전 메모'
    assert '정답입니다' in page.locator('.result').inner_text()

    page.locator('#types [data-kind="application"]').click()
    assert not page.locator('.explanation-body').is_visible()
    page.locator('.explanation summary').click()
    assert page.locator('.explanation-body').is_visible()
    page.locator('#complete').click()
    assert '다시 미완료로' in page.locator('#complete').inner_text()
    page.screenshot(path=str(OUT / 'desktop-application.png'), full_page=True)

    # Render every question, including all chapters and both grading types.
    report = page.evaluate("""() => {
      chapter='all'; kind='all'; filter='all'; order=null;
      const failures=[];
      for (const q of data.questions) {
        selected=q.id; card(data.questions);
        if (!document.querySelector('#notes')) failures.push(q.id+': missing card');
        if (q.kind==='ox' && document.querySelectorAll('[data-choice]').length!==2) failures.push(q.id+': OX choices');
        if (q.kind==='application' && !document.querySelector('.explanation')) failures.push(q.id+': explanation');
      }
      selected='5-quiz-11'; records[selected]={choice:'b',checked:true,done:true}; card(data.questions);
      if (!document.querySelector('.review-note')) failures.push('missing textbook caveat');
      return failures;
    }""")
    assert report == [], report

    mobile = context.new_page()
    mobile.set_viewport_size({'width': 390, 'height': 844})
    mobile.goto(URL)
    mobile.wait_for_function("document.querySelector('#total').textContent === '302'")
    mobile.locator('#types [data-kind="ox"]').click()
    mobile.locator('[data-chapter="2"]').click()
    mobile.locator('[data-choice="o"]').click()
    mobile.locator('#check').click()
    assert mobile.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert mobile.locator('#export').is_visible()
    mobile.screenshot(path=str(OUT / 'mobile-ox.png'), full_page=True)

    isolated = browser.new_context(viewport={'width': 1280, 'height': 900})
    filtered = isolated.new_page()
    filtered.goto(URL)
    filtered.wait_for_function("document.querySelector('#total').textContent === '302'")
    filtered.locator('#types [data-kind="ox"]').click()
    filtered.locator('[data-chapter="2"]').click()
    filtered.locator('#filter').select_option('new')
    filtered.locator('[data-choice="o"]').click()
    filtered.locator('#check').click()
    assert filtered.locator('.explanation-body').is_visible()
    assert '개념 OX 1' in filtered.locator('#card h2').inner_text()
    filtered.locator('#next').click()
    assert filtered.locator('#count').inner_text() == '19문제'
    filtered.locator('[data-choice="o"]').click()
    filtered.locator('#check').click()
    filtered.locator('#filter').select_option('wrong')
    assert filtered.locator('#count').inner_text() == '1문제'
    filtered.locator('[data-choice="x"]').click()
    filtered.locator('#check').click()
    assert '정답입니다' in filtered.locator('.result').inner_text()
    assert filtered.locator('.explanation-body').is_visible()
    filtered.locator('#filter').select_option('all')
    filtered.locator('#filter').select_option('wrong')
    assert filtered.locator('#count').inner_text() == '0문제'
    isolated.close()
    assert errors == [], errors
    browser.close()
print('PASS: 302 cards; quiz/OX grading; ch2 scope; explanations; retry; bookmarks; save/reload; export/import; v1 compatibility; mobile width; zero browser errors')
