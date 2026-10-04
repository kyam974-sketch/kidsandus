"""Render original guide columns without OCR, translation or rewritten content.
Usage: python scripts/render-pam-guide.py /path/to/PamAndPaul_compressed.pdf
"""
import sys, re, json, hashlib, base64
from pathlib import Path
import fitz
from PIL import Image
from io import BytesIO
root=Path(__file__).resolve().parents[1]
source=Path(sys.argv[1]); pdf=fitz.open(source)
manifest={}; documents={}
for index,page in enumerate(pdf):
    text=page.get_text()
    story=re.search(r'Pam&Paul \| Story (\d+):',text)
    day=re.search(r'Day\s*#\s*(\d+)',text)
    if not story or not day: continue
    key=f'{int(story[1])}-{int(day[1])}'
    entry=documents.setdefault(key, {'columns': [], 'pages': []})
    entry['pages'].append(index+1)
    # Original two-column reading order: left column, then right column.
    # Header/footer are outside the lesson content. The gutter remains intact.
    for side,rect in [('left',fitz.Rect(40,80,297,780)),('right',fitz.Rect(299,80,556,780))]:
        # Skip genuinely blank columns (e.g. the last lyrics page).
        if not page.get_text(clip=rect).strip(): continue
        pix=page.get_pixmap(matrix=fitz.Matrix(2,2),clip=rect,alpha=False)
        img=Image.frombytes('RGB',(pix.width,pix.height),pix.samples)
        # Trim only empty space below the final original content.
        import PIL.ImageChops
        bounds=PIL.ImageChops.difference(img,Image.new('RGB',img.size,'white')).getbbox()
        if bounds: img=img.crop((0,0,img.width,min(img.height,bounds[3]+18)))
        buf=BytesIO();img.save(buf,format='WEBP',quality=85,method=4)
        entry['columns'].append({'page':index+1,'side':side,'width':img.width,'height':img.height,'src':'data:image/webp;base64,'+base64.b64encode(buf.getvalue()).decode(),'text':page.get_text(clip=rect)})
for key,entry in documents.items():
    path=root/'public/guide-originals/pam-paul'/f'{key}.json'
    path.write_text(json.dumps(entry,separators=(',',':'),ensure_ascii=False))
    manifest[key]={'url':f'/guide-originals/pam-paul/{key}.json','pages':entry['pages']}
(root/'data/pam-guide-originals.json').write_text(json.dumps(manifest,indent=2))
(root/'data/pam-guide-source.json').write_text(json.dumps({'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'source':'PamAndPaul_compressed.pdf','renderScale':2,'days':len(documents)},indent=2))
print(f'Rendered {len(documents)} days; {sum(p.stat().st_size for p in (root/"public/guide-originals/pam-paul").glob("*.json"))/1e6:.1f} MB')
