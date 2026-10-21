"""Rebuild the study data while preserving textbook question IDs and source images."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
base = json.loads((ROOT / 'textbook-data.json').read_text(encoding='utf-8'))
explanations = {}
for path in sorted((ROOT / 'content').glob('explanations-*.txt')):
    for block in path.read_text(encoding='utf-8').strip().split('\n\n'):
        key, body = block.split('\n', 1)
        explanations[key] = body
assert set(explanations) == {q['id'] for q in base['questions']}, 'Missing or extra textbook explanations'
for q in base['questions']:
    q['explanation'] = explanations[q['id']]
    q['explanationSource'] = '학습용 자체 작성 해설 · 교재 공식 해설 아님'
    if q['id'] == '5-quiz-11':
        q['answerChoices'] = ['a', 'b']
        q['reviewNote'] = '교재 정답표는 B입니다. 다만 소득 증가와 가격 하락이 동시에 일어났다는 관측만으로 두 탄력성의 크기를 각각 확정할 수는 없습니다. 해설에서 이 한계를 함께 확인하세요.'
ox = []
for path in sorted((ROOT / 'content').glob('ox-*.txt')):
    chapter = int(path.stem.split('-')[1])
    lines = path.read_text(encoding='utf-8').strip().splitlines()
    assert len(lines) == 20, (path, len(lines))
    for number, line in enumerate(lines, 1):
        answer, topic, statement, explanation = line.split('|', 3)
        assert answer in ('o', 'x')
        ox.append(dict(id=f'{chapter}-ox-{number}', chapter=chapter, kind='ox', number=number,
                       answer=answer, topic=topic, statement=statement, explanation=explanation,
                       images=[], pages=[], text=statement,
                       source='MQ1 ch02 · 18번 슬라이드: 실증적 주장과 규범적 주장' if chapter == 2
                       else f'제공된 교재 및 강의자료 {chapter}장 개념을 바탕으로 자체 출제',
                       explanationSource='학습용 자체 출제 · 자체 작성 해설'))
base['chapters']['2'] = '실증적 주장과 규범적 주장'
base['chapters'] = dict(sorted(base['chapters'].items(), key=lambda item: int(item[0])))
base['scope'] = '1·3·4·5·6·7·9장 + 2장(MQ1 ch02 18번 슬라이드만)'
base['chapterNotes'] = {'2': '시험 범위: MQ1 ch02의 18번 슬라이드만. 실증적 주장과 규범적 주장의 구분을 연습합니다.'}
base['concepts'] = {'2': {'title': '실증적 주장과 규범적 주장', 'source': 'MQ1 ch02 · 18번 슬라이드',
    'paragraphs': ['실증적 주장(positive statement)은 현실이 어떠한지, 또는 어떤 변화가 어떤 결과를 가져올지 설명합니다. 자료나 관찰로 검증할 수 있는 주장입니다. 예: “최저임금제는 실업을 유발할 것이다.”',
                   '규범적 주장(normative statement)은 현실이 어떻게 되어야 하는지 말합니다. 바람직함에 대한 가치판단이 들어갑니다. 예: “정부는 최저임금을 인상해야 한다.”',
                   '실증적이라는 말은 그 주장이 참이라는 뜻이 아닙니다. 검증 결과 거짓일 수도 있습니다. 미래에 대한 예측도 검증 가능한 내용이면 실증적 주장입니다.',
                   '정책의 효과에 관한 설명과 정책을 시행해야 한다는 권고를 구분하세요. “때문에 ~해야 한다”처럼 둘을 합친 문장에는 실증적 부분과 규범적 부분이 함께 들어갈 수 있습니다.']}}
base['questions'] += ox
assert len(ox) == 160 and len({q['id'] for q in base['questions']}) == len(base['questions'])
(ROOT / 'docs/data.json').write_text(json.dumps(base, ensure_ascii=False, indent=2), encoding='utf-8')
print(f"Built {len(base['questions'])} questions: {len(explanations)} textbook explanations + {len(ox)} OX")
