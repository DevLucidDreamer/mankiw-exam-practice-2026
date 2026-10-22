"""Extract only textbook quick quizzes from the unmarked ninth-edition PDF.

The original annotated PDF remains the source of application exercises.
Question IDs and answer keys are deliberately preserved.
"""
import argparse
import json
from pathlib import Path

import pymupdf as fitz
from PIL import Image

ROOT = Path(__file__).resolve().parent


def replace_quizzes(pdf_path=None, root=ROOT):
    layout = json.loads((root / 'quiz-clean9-layout.json').read_text(encoding='utf-8'))
    source = Path(pdf_path) if pdf_path else root.parent / layout['source']
    if not source.is_file():
        raise FileNotFoundError(f'필기 없는 제9판 PDF를 찾을 수 없습니다: {source}')
    base_file = root / 'textbook-data.json'
    base = json.loads(base_file.read_text(encoding='utf-8'))
    expected = {q['id']: q for q in base['questions'] if q['kind'] == 'quiz'}
    replacements = {}
    out = root / 'docs/questions/clean9'
    out.mkdir(parents=True, exist_ok=True)
    with fitz.open(source) as doc:
        assert len(doc) == 1004, 'Expected the supplied 1004-page clean ninth edition'
        for ch, pages in layout['pages'].items():
            for page_number, left_x, right_x, left, right, bottom in pages:
                page = doc[page_number - 1]
                current = None
                for column, anchors in enumerate((left, right)):
                    for j, (number, top) in enumerate(anchors):
                        if number:
                            qid = f'{ch}-quiz-{number}'
                            assert qid in expected and qid not in replacements, qid
                            current = {'images': [], 'pages': [], 'text': ''}
                            replacements[qid] = current
                        assert current is not None, (ch, page_number, column, number)
                        end = anchors[j + 1][1] - 4 if j + 1 < len(anchors) else bottom
                        x0 = (left_x if column == 0 else right_x) - 4
                        x1 = right_x - 15 if column == 0 else right_x + 245
                        clip = fitz.Rect(x0, top - 4, x1, end)
                        assert clip in page.rect and clip.height > 8
                        name = f'{qid}-{len(current["images"]) + 1}.webp'
                        pix = page.get_pixmap(matrix=fitz.Matrix(3, 3), clip=clip, annots=False, colorspace=fitz.csRGB)
                        Image.frombytes('RGB', (pix.width, pix.height), pix.samples).save(out / name, 'WEBP', quality=92)
                        current['images'].append('questions/clean9/' + name)
                        current['pages'].append(page_number)
                        current['text'] += page.get_text(clip=clip) + '\n'
    assert set(replacements) == set(expected) and len(replacements) == 68
    for qid, replacement in replacements.items():
        q = expected[qid]
        q.update(replacement)
        q['printedPages'] = list(dict.fromkeys(p - layout['printedPageOffset'] for p in q['pages']))
        q['sourcePdf'] = layout['source']
        q['source'] = ('『맨큐의 경제학 제9판』 · 교재 ' + ', '.join(map(str, q['printedPages']))
                       + '쪽 (PDF ' + ', '.join(map(str, dict.fromkeys(q['pages']))) + '쪽) · 필기 없는 원문')
    base_file.write_text(json.dumps(base, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Replaced {len(replacements)} quick quizzes with {sum(len(q["images"]) for q in replacements.values())} clean ninth-edition images')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pdf', type=Path, help='Path to the supplied clean ninth-edition PDF')
    args = parser.parse_args()
    replace_quizzes(args.pdf)
    import runpy
    runpy.run_path(str(ROOT / 'enrich.py'))
