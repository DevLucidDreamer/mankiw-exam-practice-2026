import pymupdf as fitz
import json, pathlib
ROOT=pathlib.Path(__file__).parent
OUT=ROOT/'docs'; (OUT/'questions').mkdir(parents=True,exist_ok=True)
doc=fitz.open(ROOT.parent/'맨큐의 경제학.pdf')
titles={1:'경제학의 10대 기본원리',3:'상호 의존관계와 교역이득',4:'시장의 수요와 공급',5:'탄력성과 그 응용',6:'수요, 공급과 정부 정책',7:'소비자, 생산자, 시장의 효율성',9:'응용: 국제무역'}
keys={1:'acbdcbddab',3:'bcdbadbd',4:'cbabadacdbacd',5:'addcbcccacb',6:'ddacadcb',7:'bbdcbcacbc',9:'dbcab cac'.replace(' ','')}
# Page numbers refer to PDF physical pages; question numbers are chapter-local.
# Each column is read top-to-bottom, then left-to-right. A zero anchor continues the previous question.
quiz={
1:[(34,43,[(1,575)],[(2,575)],690),(35,57,[(3,80)],[(4,80)],158),(40,42,[(5,525),(6,603)],[(7,588)],682),(43,56,[(8,479),(9,586)],[(10,528)],633)],
3:[(89,56,[(1,111)],[(2,111)],188),(93,52,[(3,484),(4,605)],[(5,518)],668),(95,53,[(6,505),(7,582)],[(8,539)],689)],
4:[(104,43,[(1,114),(2,193)],[(3,175)],268),(110,36,[(4,448),(5,540)],[(6,449)],620),(115,54,[(7,220),(8,313)],[(9,254)],360),(124,41,[(10,107),(11,200)],[(12,109),(13,202)],294)],
5:[(140,43,[(1,223),(2,301)],[(3,223),(4,301)],406),(144,42,[(5,201),(6,309)],[(7,235)],354),(151,57,[(8,111),(9,189)],[(10,111),(11,219)],339)],
6:[(166,43,[(1,307),(2,384)],[(3,306),(4,414)],504),(176,41,[(5,252),(6,329)],[(7,252),(8,344)],435)],
7:[(188,41,[(1,107),(2,214)],[(3,142)],278),(193,54,[(4,107),(5,229)],[(6,141)],304),(200,44,[(7,167),(8,289)],[(9,168),(10,261)],366)],
9:[(226,44,[(1,365)],[(2,364)],527),(235,54,[(3,352),(4,444)],[(5,351),(6,444)],548),(241,55,[(7,363)],[(8,364)],496)]}
apps={
1:[(45,56,[(1,596)],[(2,644)],685),(46,43,[(0,80),(3,130),(4,212),(5,278),(6,389),(7,485)],[(0,80),(8,207),(9,288),(10,338),(11,419)],630)],
3:[(99,51,[(1,127),(2,238),(3,573)],[(0,126),(4,236),(5,484),(6,654)],685),(100,51,[(0,80),(7,292),(8,417)],[(0,80),(9,288)],635)],
4:[(127,54,[(1,286),(2,411),(3,463),(4,617)],[(0,286),(5,412),(6,477),(7,603)],685),(128,41,[(8,80),(9,296),(10,377)],[(11,82)],632)],
5:[(153,56,[(1,128),(2,239),(3,442),(4,567),(5,618)],[(0,128),(6,163),(7,289),(8,530)],685),(154,43,[(9,83),(10,163)],[(11,121),(12,171)],330)],
6:[(178,41,[(1,129),(2,195),(3,395)],[(0,129),(4,164),(5,349),(6,415),(7,481)],685),(179,56,[(8,82),(9,298)],[(10,83)],630)],
7:[(202,43,[(1,397),(2,507),(3,573),(4,625)],[(0,397),(5,531)],685),(203,53,[(0,79),(6,115),(7,285),(8,411),(9,589)],[(0,79),(10,280),(11,511)],685),(204,44,[(0,80)],[(0,80)],270)],
9:[(245,55,[(1,326),(2,525),(3,651)],[(0,326),(4,481)],685),(246,41,[(5,83),(6,268),(7,441),(8,567)],[(0,83),(9,178),(10,500)],640)]}
items=[]
for kind,chapters in [('quiz',quiz),('application',apps)]:
 for ch,pages in chapters.items():
  current=None
  for p,x,left,right,bottom in pages:
   if kind=='application' and bottom==685:
    bottom=695
   if kind=='quiz' and right[0][1]-left[0][1]>20:
    right=[(0,left[0][1])]+right
   for col,anchors in enumerate([left,right]):
    for j,(num,y) in enumerate(anchors):
     if num:
      current={'id':f'{ch}-{kind}-{num}','chapter':ch,'kind':kind,'number':num,'images':[],'pages':[],'text':'','answer':keys[ch][num-1] if kind=='quiz' else ''}
      items.append(current)
     end=anchors[j+1][1]-3 if j+1<len(anchors) else bottom
     rect=fitz.Rect(x+col*262-4,y-3,x+col*262+251,end)
     name=f"{current['id']}-{len(current['images'])+1}.webp"
     pix=doc[p-1].get_pixmap(matrix=fitz.Matrix(2.3,2.3),clip=rect,annots=False)
     from PIL import Image
     Image.frombytes('RGB',[pix.width,pix.height],pix.samples).save(OUT/'questions'/name,'WEBP',quality=88)
     current['images'].append('questions/'+name);current['pages'].append(p)
     current['text']+=doc[p-1].get_text(clip=rect)+'\n'
base_json=json.dumps({'chapters':titles,'questions':items},ensure_ascii=False)
(ROOT/'textbook-data.json').write_text(base_json,encoding='utf-8')
(OUT/'data.json').write_text(base_json,encoding='utf-8')
(ROOT/'extracted-review.txt').write_text('\n\n'.join(q['id']+'\n'+q['text'] for q in items),encoding='utf-8')
print('Extracted',len(items),'questions;',sum(q['kind']=='quiz' for q in items),'quiz;',sum(q['kind']=='application' for q in items),'application')
if (ROOT/'content').is_dir():
 import runpy
 runpy.run_path(str(ROOT/'enrich.py'))
