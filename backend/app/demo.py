"""Synthetic illustrations, not clinical images or model evaluation ground truth."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path
import io

def sample(variant='clear'):
    image=Image.new('RGB',(1100,800),'#e4e9df'); draw=ImageDraw.Draw(image)
    fonts=Path('C:/Windows/Fonts')
    def font(size):
        for path in [fonts/'arial.ttf',Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')]:
            if path.exists(): return ImageFont.truetype(str(path),size)
        return ImageFont.load_default(size=size)
    draw.rectangle((180,110,920,690),fill='white',outline='#79867b',width=3)
    draw.rectangle((180,110,920,220),fill='#276850')
    draw.text((220,140),'SYNTHETIC RESEARCH SAMPLE',font=font(30),fill='white')
    strength='250 mg' if variant=='mismatch' else '500 mg'
    lines=[('Product: Paracetamol',42),('Strength: '+strength,36),('Tablets',28),('Batch: DEMO2026',28),('MFG: 2026-01-15',28),('EXP: 2028-01-15',28),('Not for sale. Illustrative packaging.',20)]
    y=255
    for line,size in lines:
        draw.text((220,y),line,font=font(size),fill='#253d30'); y+=53
    if variant=='blurred': image=image.filter(ImageFilter.GaussianBlur(12))
    buffer=io.BytesIO(); image.save(buffer,format='PNG'); return buffer.getvalue()

if __name__=='__main__':
    destination=Path('samples'); destination.mkdir(exist_ok=True)
    for variant in ['clear','mismatch','blurred']: (destination/f'synthetic-{variant}.png').write_bytes(sample(variant))
