from __future__ import annotations

import math
import re
import subprocess
import sys
import wave
from pathlib import Path

sys.path.insert(0, "/tmp/tetris-video-libs")
import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


ROOT = Path(__file__).parent
PUBLIC = ROOT.parent / "public" / "tutorial"
WORK = ROOT / "mobile-premium"
SOURCE = ROOT / "08-mobile-game.png"
SKILL_BLOCK = ROOT.parent / "public" / "skill-up-block-simple.png"
CHARACTERS = {
    "ミストン": ROOT.parent / "miston.png",
    "ミントン": ROOT.parent / "minton.png",
    "アストン": ROOT.parent / "asuton.png",
}
PUBLIC.mkdir(parents=True, exist_ok=True)
WORK.mkdir(exist_ok=True)

W, H, FPS = 720, 1280, 30
FONT_BOLD = "/System/Library/Fonts/ヒラギノ角ゴシック W8.ttc"
FONT_REG = "/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc"


def fnt(size: int, bold: bool = True):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)


SCENES = [
    (5.8, "スマホ操作ガイド", "下手なAIを支える「管理人」のゲーム", "これは、テトリスミノを直接操作するゲームではありません。プレイヤーは管理人です。自動で積み続ける、エーアイのプレイを支えます。", "overview"),
    (9.0, "まずルールを知ろう", "AIの悪手を直し、1列そろえて消す", "エーアイは上手なプレイヤーではなく、テトリスミノを無造作に積み上げます。穴や邪魔な段差を見つけ、三人のスキルで盤面を整え、一列そろえて消す。それがこのゲームの目的です。", "mission"),
    (8.0, "最重要：ミストンの撤去", "邪魔な表面ブロックを取り除く", "まず覚えるのは撤去です。邪魔なブロックを見つけたら、画面左下の撤去を押し、光った一番上のブロックをタップします。", "remove"),
    (7.6, "ミストン：再施工", "回収した補修材で穴を埋める", "撤去で回収した補修材は、再施工に使います。下に床かブロックがある空きマスを選び、穴を埋めましょう。", "rebuild"),
    (9.0, "撤去と再施工の関係", "撤去した数 = 再施工できる数", "ここで、撤去と再施工の数を確認します。撤去は最大三個。撤去した数だけ補修材が増え、その数だけ再施工できます。三個撤去したら、再施工で補修材を使うまで、次の撤去はできません。", "cycle"),
    (7.4, "ミントン：資材搬入", "補修材が少ない時に「資材搬入」", "補修材が足りない時は、中央の資材搬入を押します。補修材が二個増え、再施工の準備ができます。", "delivery"),
    (7.2, "現場を監視", "穴・段差・一番上のブロックを見る", "盤面で見るのは、下が空いた穴、高い段差、そして一番上に露出したブロックです。", "inspect"),
    (8.2, "アストン：撤去分析", "迷ったら分析。光る3個が優先候補", "どこを撤去するか迷ったら、右下の撤去分析。優先候補が三個、盤面上で強く光り、エーアイも一秒止まります。", "analysis"),
    (11.0, "緊急復旧工事", "単独5個 / 分析連動3個 + 再施工3個", "ゲージが百パーセントなら、緊急復旧工事を発動できます。単独なら、露出した五個を広く撤去。分析の直後なら、光った三個を狙い撃ちし、さらに三個を確実に再施工します。", "finisher"),
    (14.0, "管理バランスとSKU", "現場クリア報酬でチームを強化", "現場クリア時、撤去と再施工の差が小さいほど、スキルアップブロックを獲得します。失敗時は獲得できません。SKUは、エスケーユーと読みます。スキルアップの略で、仲間の強化段階を表します。画面右上の画像と、かける数字が現在の所持数です。十個集めたら、キャラクターを長押しします。", "sku"),
    (14.0, "SKUで3人を強化", "同じ仲間は連続で強化できない", "ミストンは撤去と補修材の上限。ミントンは資材搬入量。アストンは分析後の緊急復旧工事が強化されます。同じ仲間は連続で強化できません。三人全員をエスケーユー1にすると、通常の緊急復旧工事も、撤去五個から六個に強化されます。", "sku-detail"),
    (6.0, "現場へ戻ろう", "監視 → 撤去 → 搬入 → 再施工", "盤面を監視し、必要な仕事だけを選ぶ。それがテトリスの管理人です。現場を復旧しましょう。", "end"),
]


def fit_crop(raw: Image.Image, crop, box):
    part = raw.crop(crop)
    x1, y1, x2, y2 = box
    return part.resize((x2-x1, y2-y1), Image.Resampling.LANCZOS)


BOARD_BOX = (160, 126, 560, 926)
CONTROL_BOX = (35, 944, 685, 1244)
BOARD_CROP = (165, 205, 660, 1195)
CONTROL_CROP = (15, 1190, 805, 1555)


def board_point(x, y):
    return (160 + (x-165)*400/495, 126 + (y-205)*800/990)


def control_point(x, y):
    return (35 + (x-15)*650/790, 944 + (y-1190)*300/365)


BUTTONS = {
    "remove": control_point(95, 1405),
    "rebuild": control_point(225, 1405),
    "delivery": control_point(415, 1405),
    "analysis": control_point(675, 1405),
    "finisher": control_point(410, 1520),
}


def glow_rect(im, box, color=(69, 235, 255), width=5, pulse=1.0):
    x1, y1, x2, y2 = box
    layer = Image.new("RGBA", im.size)
    ld = ImageDraw.Draw(layer, "RGBA")
    for spread, alpha in ((24, 45), (14, 80), (7, 150)):
        ld.rounded_rectangle((x1-spread, y1-spread, x2+spread, y2+spread), 18,
                             outline=(*color, int(alpha*pulse)), width=width)
    layer = layer.filter(ImageFilter.GaussianBlur(5))
    im.alpha_composite(layer)
    ImageDraw.Draw(im, "RGBA").rounded_rectangle(box, 14, outline=(*color,255), width=width)


def marker(im, point, t, label="TAP"):
    x, y = point
    d = ImageDraw.Draw(im, "RGBA")
    phase = (t*1.5) % 1
    for off in (0, .33, .66):
        p = (phase+off) % 1
        r = 18 + p*34
        d.ellipse((x-r,y-r,x+r,y+r), outline=(255,220,70,int(235*(1-p))), width=5)
    d.ellipse((x-27,y-27,x+27,y+27), fill=(255,224,70,245), outline=(255,255,255,255), width=4)
    d.text((x,y), label, font=fnt(13), anchor="mm", fill="#07111f")


def arrow(im, a, b):
    d = ImageDraw.Draw(im, "RGBA")
    d.line((*a,*b), fill=(255,224,70,220), width=7)
    ang = math.atan2(b[1]-a[1], b[0]-a[0])
    p1 = (b[0]-25*math.cos(ang-.55), b[1]-25*math.sin(ang-.55))
    p2 = (b[0]-25*math.cos(ang+.55), b[1]-25*math.sin(ang+.55))
    d.polygon((b,p1,p2), fill=(255,224,70,245))


def base_frame(raw):
    bg = raw.resize((W,H), Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(8))
    bg = ImageEnhance.Brightness(bg).enhance(.28).convert("RGBA")
    bg.alpha_composite(fit_crop(raw, BOARD_CROP, BOARD_BOX).convert("RGBA"), BOARD_BOX[:2])
    bg.alpha_composite(fit_crop(raw, CONTROL_CROP, CONTROL_BOX).convert("RGBA"), CONTROL_BOX[:2])
    d = ImageDraw.Draw(bg, "RGBA")
    d.rounded_rectangle(BOARD_BOX, 18, outline=(144,238,255,235), width=4)
    d.rounded_rectangle(CONTROL_BOX, 18, outline=(58,195,221,210), width=4)
    return bg


def header(im, title, subtitle, index, progress):
    d = ImageDraw.Draw(im, "RGBA")
    d.rectangle((0,0,W,118), fill=(1,8,20,245))
    d.rectangle((0,114,W,119), fill=(71,232,255,240))
    d.text((26,24), title, font=fnt(25), fill="#66ecff")
    font = fnt(31 if len(subtitle) < 25 else 27)
    d.text((26,79), subtitle, font=font, anchor="lm", fill="white")
    d.rounded_rectangle((642,20,700,92), 14, fill=(8,74,98,240), outline=(112,243,255,255), width=2)
    d.text((671,56), str(index+1), font=fnt(27), anchor="mm", fill="white")
    d.rounded_rectangle((22,1260,698,1268), 4, fill=(255,255,255,45))
    d.rounded_rectangle((22,1260,22+676*progress,1268), 4, fill=(83,235,255,240))


def pill(im, xy, text, color=(255,224,70), fill=(2,18,35,235), size=22):
    d = ImageDraw.Draw(im, "RGBA")
    x,y = xy
    box = d.textbbox((x,y), text, font=fnt(size), anchor="mm")
    rect = (box[0]-18,box[1]-12,box[2]+18,box[3]+12)
    d.rounded_rectangle(rect, 14, fill=fill, outline=(*color,255), width=3)
    d.text((x,y), text, font=fnt(size), anchor="mm", fill="white")


def render(scene, index, t, progress):
    seconds,title,subtitle,voice,mode = scene
    raw = Image.open(SOURCE).convert("RGB")
    im = base_frame(raw)
    pulse = .7 + .3*math.sin(t*5)**2

    if mode == "overview":
        veil = Image.new("RGBA", im.size, (0,6,18,105)); im.alpha_composite(veil)
        pill(im,(360,430),"上：現場の盤面",(70,235,255),size=30)
        pill(im,(360,1065),"下：3人の管理スキル",(255,224,70),size=27)
    elif mode == "mission":
        veil = Image.new("RGBA", im.size, (0,6,18,125)); im.alpha_composite(veil)
        d = ImageDraw.Draw(im, "RGBA")
        d.rounded_rectangle((50,320,670,870),28,fill=(2,17,34,242),outline=(84,236,255,245),width=4)
        d.text((360,382),"このゲームの目的",font=fnt(32),anchor="mm",fill="#66edff")
        items = ((450,"① AIが無造作に積む",(255,126,148)),(560,"② 穴・段差・邪魔を見つける",(255,224,70)),(670,"③ 3人のスキルで整える",(91,255,185)),(780,"④ 1列そろえて消す",(102,236,255)))
        for y,text,color in items:
            d.rounded_rectangle((82,y-40,638,y+40),16,fill=(7,28,47,250),outline=(*color,220),width=3)
            d.text((110,y),text,font=fnt(23),anchor="lm",fill="white")
    elif mode == "inspect":
        for p,text,color in ((board_point(500,1085),"穴",(255,103,130)),
                             (board_point(390,815),"段差",(255,224,70)),
                             (board_point(580,620),"表面",(89,245,174))):
            x,y=p; glow_rect(im,(x-38,y-38,x+38,y+38),color,pulse=pulse)
            pill(im,(x,y-58),text,color,size=18)
    elif mode == "cycle":
        veil = Image.new("RGBA", im.size, (0,6,18,135)); im.alpha_composite(veil)
        d = ImageDraw.Draw(im, "RGBA")
        d.rounded_rectangle((48,360,672,870),26,fill=(2,17,34,242),outline=(84,236,255,245),width=4)
        d.text((360,420),"撤去と再施工は一組",font=fnt(31),anchor="mm",fill="#66edff")
        stages = ((150,540,"撤去","×3",(255,126,148)),(360,540,"補修材","×3",(255,224,70)),(570,540,"再施工","×3",(91,255,185)))
        for x,y,label,count,color in stages:
            d.rounded_rectangle((x-78,y-58,x+78,y+82),18,fill=(7,28,47,255),outline=(*color,255),width=4)
            d.text((x,y-20),label,font=fnt(23),anchor="mm",fill="white")
            d.text((x,y+39),count,font=fnt(34),anchor="mm",fill=color)
        d.text((255,555),"→",font=fnt(42),anchor="mm",fill="#ffffff")
        d.text((465,555),"→",font=fnt(42),anchor="mm",fill="#ffffff")
        d.rounded_rectangle((95,700,625,815),18,fill=(68,13,31,235),outline=(255,105,135,255),width=3)
        d.text((360,742),"補修材が3個なら撤去はストップ",font=fnt(25),anchor="mm",fill="white")
        d.text((360,785),"再施工すると、また撤去できる",font=fnt(22),anchor="mm",fill="#9affc5")
    elif mode == "sku":
        veil = Image.new("RGBA", im.size, (0,6,18,145)); im.alpha_composite(veil)
        d = ImageDraw.Draw(im, "RGBA")
        d.rounded_rectangle((48,310,672,930),26,fill=(2,17,34,244),outline=(255,118,132,245),width=4)
        icon = Image.open(SKILL_BLOCK).convert("RGBA").resize((150,150), Image.Resampling.LANCZOS)
        im.alpha_composite(icon, (285,350))
        d.text((360,535),"スキルアップブロック",font=fnt(29),anchor="mm",fill="white")
        d.rounded_rectangle((245,558,475,608),14,fill=(59,13,28,235),outline=(255,118,132,255),width=3)
        mini = icon.resize((34,34), Image.Resampling.LANCZOS)
        im.alpha_composite(mini, (286,566))
        d.text((380,583),"×5",font=fnt(25),anchor="mm",fill="#ffd0d5")
        rewards=((120,"差 0","+2"),(280,"差 1","+1"),(440,"差 2","+0.5"),(600,"差 3+","0"))
        for x,label,reward in rewards:
            d.rounded_rectangle((x-67,630,x+67,735),16,fill=(18,31,50,255),outline=(255,118,132,220),width=3)
            d.text((x,660),label,font=fnt(19),anchor="mm",fill="#cde9f5")
            d.text((x,707),reward,font=fnt(28),anchor="mm",fill="#ffd0d5")
        d.rounded_rectangle((95,750,625,855),18,fill=(59,13,28,235),outline=(255,118,132,255),width=3)
        d.text((360,787),"10個でキャラを長押し",font=fnt(26),anchor="mm",fill="white")
        d.text((360,828),"SKU1 → SKU2 の順に強化",font=fnt(22),anchor="mm",fill="#a7ffd3")
    elif mode == "sku-detail":
        veil = Image.new("RGBA", im.size, (0,6,18,150)); im.alpha_composite(veil)
        d = ImageDraw.Draw(im, "RGBA")
        d.rounded_rectangle((42,285,678,950),26,fill=(2,17,34,246),outline=(255,118,132,245),width=4)
        cards = (
            (138, "ミストン", "撤去上限", "3 → 4 → 5", (176,110,255)),
            (360, "ミントン", "搬入量", "+2 → +3 → +4", (99,230,255)),
            (582, "アストン", "分析後復旧", "3/3 → 4/3 → 5/4", (255,216,74)),
        )
        for x,name,label,value,color in cards:
            d.rounded_rectangle((x-94,350,x+94,690),20,fill=(11,28,48,255),outline=(*color,235),width=4)
            character = Image.open(CHARACTERS[name]).convert("RGBA")
            character.thumbnail((92, 112), Image.Resampling.LANCZOS)
            glow = Image.new("RGBA", im.size)
            gd = ImageDraw.Draw(glow, "RGBA")
            gd.ellipse((x-58,370,x+58,486),fill=(*color,38),outline=(*color,210),width=4)
            glow = glow.filter(ImageFilter.GaussianBlur(8))
            im.alpha_composite(glow)
            im.alpha_composite(character, (x-character.width//2, 376+(108-character.height)//2))
            d.text((x,500),name,font=fnt(20),anchor="mm",fill="white")
            d.text((x,548),label,font=fnt(18),anchor="mm",fill="#cde9f5")
            d.text((x,612),value,font=fnt(17 if name == "アストン" else 21),anchor="mm",fill=color)
            d.text((x,660),"SKU 0 → 1 → 2",font=fnt(15),anchor="mm",fill="#ffffff")
        d.rounded_rectangle((78,735,642,845),18,fill=(59,13,28,235),outline=(255,118,132,255),width=3)
        d.text((360,772),"同じ仲間の連続強化はできない",font=fnt(22),anchor="mm",fill="white")
        d.text((360,818),"3人がSKU1 → 通常復旧 5個から6個へ",font=fnt(20),anchor="mm",fill="#a7ffd3")
    elif mode in ("remove","delivery","rebuild","analysis","finisher"):
        button = BUTTONS[mode]
        target = None
        if mode == "remove":
            target = board_point(390,812)
            glow_rect(im,(target[0]-36,target[1]-36,target[0]+36,target[1]+36),(255,224,70),pulse=pulse)
            pill(im,(360,965),"① 撤去ボタン  →  ② 表面ブロック",(255,224,70),size=20)
        elif mode == "delivery":
            pill(im,(360,875),"補修材 0 → 2",(91,255,185),size=30)
            glow_rect(im,(60,1080,260,1150),(91,255,185),pulse=pulse)
        elif mode == "rebuild":
            target = board_point(500,1085)
            glow_rect(im,(target[0]-35,target[1]-35,target[0]+35,target[1]+35),(91,255,185),pulse=pulse)
            pill(im,(360,965),"① 再施工ボタン  →  ② 支えのある空きマス",(91,255,185),size=18)
        elif mode == "analysis":
            points=(board_point(390,812),board_point(580,620),board_point(500,1085))
            for n,(x,y) in enumerate(points,1):
                glow_rect(im,(x-38,y-38,x+38,y+38),(255,224,70),pulse=pulse)
                pill(im,(x,y),str(n),(255,224,70),fill=(255,224,70,235),size=19)
            pill(im,(360,945),"光る3個 = 優先撤去候補",(255,224,70),size=23)
        elif mode == "finisher":
            glow_rect(im,(45,1188,675,1247),(255,224,70),pulse=pulse)
            d=ImageDraw.Draw(im,"RGBA")
            d.rounded_rectangle((66,760,654,1035),22,fill=(2,15,31,238),outline=(255,224,70,255),width=4)
            d.text((190,820),"分析後",font=fnt(26),anchor="mm",fill="#ffe35e")
            d.text((190,875),"光った3個",font=fnt(31),anchor="mm",fill="white")
            d.text((530,820),"単独",font=fnt(26),anchor="mm",fill="#67ecff")
            d.text((530,875),"露出5個",font=fnt(31),anchor="mm",fill="white")
            d.text((360,950),"分析後のみ：再施工 +3",font=fnt(23),anchor="mm",fill="#9affc5")
            d.text((360,995),"単独は撤去のみ / 分析後は撤去 + 再施工",font=fnt(18),anchor="mm",fill="white")
        bx,by=button
        glow_rect(im,(bx-58,by-38,bx+58,by+38),(255,224,70),pulse=pulse)
        # Draw the guide first, then the tap marker so the line never crosses it.
        if target:
            arrow(im,(bx,by-42),(target[0],target[1]+45))
            marker(im,target,t,"2")
        marker(im,(bx,by),t,"TAP")
    elif mode == "end":
        veil=Image.new("RGBA",im.size,(0,6,18,145)); im.alpha_composite(veil)
        d=ImageDraw.Draw(im,"RGBA")
        d.rounded_rectangle((55,350,665,820),28,fill=(2,17,34,230),outline=(84,236,255,240),width=4)
        d.text((360,430),"現場復旧の流れ",font=fnt(35),anchor="mm",fill="#66edff")
        for y,text in ((520,"1  盤面を監視"),(600,"2  撤去・資材搬入"),(680,"3  再施工でラインを作る"),(760,"4  必要なら分析・必殺技")):
            d.text((115,y),text,font=fnt(28),anchor="lm",fill="white")

    header(im,title,subtitle,index,progress)
    return im.convert("RGB")


def make_ambient(duration):
    path=WORK/"ambient.wav"; rate=44100
    with wave.open(str(path),"w") as out:
        out.setnchannels(2); out.setsampwidth(2); out.setframerate(rate)
        for i in range(int(duration*rate)):
            t=i/rate; v=int(700*(math.sin(2*math.pi*55*t)+.3*math.sin(2*math.pi*82*t)))
            out.writeframesraw(v.to_bytes(2,"little",signed=True)*2)
    return path


def main():
    voices=[]
    runtime_scenes=[]
    for i,scene in enumerate(SCENES):
        p=WORK/f"voice-{i:02d}.aiff"
        # The opening explains the core rules, so give each phrase more room than
        # the later operation callouts. This also prevents successive narration
        # from sounding layered when heard through a phone speaker.
        speech_rate = "185" if i == 0 else ("195" if i < 4 else "210")
        subprocess.run(["say","-v","Kyoko","-r",speech_rate,"-o",str(p),scene[3]],check=True)
        info=subprocess.check_output(["afinfo",str(p)],text=True)
        match=re.search(r"estimated duration:\s*([0-9.]+) sec",info)
        voice_duration=float(match.group(1)) if match else 0
        if voice_duration <= 0:
            raise RuntimeError(f"Narration generation failed: {p}")
        tail_padding = 2.0 if i < 4 else 1.5
        runtime_scenes.append((max(scene[0],voice_duration+tail_padding),*scene[1:]))
        voices.append(p)
    total=sum(s[0] for s in runtime_scenes)
    silent=WORK/"mobile-silent.mp4"
    writer=imageio_ffmpeg.write_frames(str(silent),(W,H),fps=FPS,codec="libx264",quality=8,
        pix_fmt_in="rgb24",pix_fmt_out="yuv420p",output_params=["-movflags","+faststart"])
    writer.send(None); elapsed=0
    try:
        for index,scene in enumerate(runtime_scenes):
            for frame in range(round(scene[0]*FPS)):
                t=frame/FPS
                writer.send(render(scene,index,t,(elapsed+t)/total).tobytes())
            elapsed+=scene[0]
    finally: writer.close()

    ambient=make_ambient(total); ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
    output=PUBLIC/"tetris-manager-mobile-tutorial.mp4"
    cmd=[ffmpeg,"-y","-i",str(silent),"-i",str(ambient)]
    for v in voices: cmd += ["-i",str(v)]
    # Keep the low ambient tone well behind speech. On small phone speakers the
    # previous level masked syllables around the opening's "AIを支える" line.
    filters=["[1:a]volume=0.018[bed]"]; labels=[]; offset=0
    for i,scene in enumerate(runtime_scenes):
        lead_in = .55 if i < 4 else .4
        delay=round((offset+lead_in)*1000); label=f"v{i}"
        filters.append(
            f"[{i+2}:a]highpass=f=80,lowpass=f=10000,"
            f"loudnorm=I=-16:TP=-2:LRA=7,adelay={delay}|{delay}[{label}]"
        )
        labels.append(f"[{label}]"); offset+=scene[0]
    filters.append(
        f"[bed]{''.join(labels)}amix=inputs={len(labels)+1}:duration=first:normalize=0,"
        "alimiter=limit=0.95[a]"
    )
    cmd += ["-filter_complex",";".join(filters),"-map","0:v","-map","[a]","-c:v","copy","-c:a","aac","-b:a","192k","-t",f"{total:.2f}","-movflags","+faststart",str(output)]
    subprocess.run(cmd,check=True)
    print(output)


if __name__ == "__main__": main()
