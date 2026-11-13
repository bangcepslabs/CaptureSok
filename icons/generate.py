from PIL import Image, ImageDraw

for size in (16, 32, 48, 128):
    scale = 4
    s = size * scale
    image = Image.new('RGBA', (s, s))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((0, 0, s - 1, s - 1), radius=s // 5, fill='#123c39')
    color = '#65ead7'
    thick = max(3, s // 13)
    for x1, y1, x2, y2 in ((.2,.4,.2,.2),(.2,.2,.4,.2),(.6,.2,.8,.2),(.8,.2,.8,.4),(.8,.6,.8,.8),(.6,.8,.8,.8),(.2,.6,.2,.8),(.2,.8,.4,.8)):
        draw.line((int(x1*s),int(y1*s),int(x2*s),int(y2*s)),fill=color,width=thick)
    draw.ellipse((int(.36*s),int(.36*s),int(.64*s),int(.64*s)), fill=color)
    draw.ellipse((int(.45*s),int(.45*s),int(.55*s),int(.55*s)), fill='#123c39')
    image.resize((size,size), Image.Resampling.LANCZOS).save(f'icons/{size}.png')
