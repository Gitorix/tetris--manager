"""Build Japanese captions and a speech-clarity audio master for the tutorial video.

The narration script lives in build_mobile_tutorial.py (SCENES). This script reads
it without importing (that module needs macOS-only tools), detects where each
phrase is spoken in the published MP4, and writes:

  public/tutorial/tetris-manager-mobile-tutorial.ja.vtt   (WebVTT captions)
  public/tutorial/tetris-manager-mobile-tutorial.mp4      (audio remastered in place, video copied)

Run: python3 tutorial/build_tutorial_captions.py [--skip-audio]
Requires ffmpeg and numpy.
"""
from __future__ import annotations

import ast
import re
import shutil
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).parent
VIDEO = ROOT.parent / "public" / "tutorial" / "tetris-manager-mobile-tutorial.mp4"
VTT = VIDEO.with_suffix(".ja.vtt")

# Narration is written phonetically for the speech engine; captions show the
# on-screen spelling instead.
DISPLAY_TERMS = [
    ("エスケーユーと読み", "「エスケーユー」と読み"), ("エーアイ", "AI"), ("エスケーユー", "SKU"), ("三人", "3人"), ("一列", "1列"), ("一秒", "1秒"),
    ("一番", "いちばん"), ("二個", "2個"), ("三個", "3個"), ("五個", "5個"), ("六個", "6個"),
    ("十個", "10個"), ("百パーセント", "100%"),
]
MAX_CUE_CHARS = 30
SCENE_GAP = 1.2      # silence that separates two scenes' narration
SENTENCE_GAP = 0.15  # pause long enough to be a phrase boundary


def load_scenes():
    tree = ast.parse((ROOT / "build_mobile_tutorial.py").read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(getattr(t, "id", "") == "SCENES" for t in node.targets):
            return ast.literal_eval(node.value)
    raise RuntimeError("SCENES not found")


def display(text: str) -> str:
    for spoken, shown in DISPLAY_TERMS:
        text = re.sub(f"(?<!「){spoken}(?!」)", shown, text)
    return text


def speech_segments(path: Path):
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "a.wav"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(path), "-vn", "-ac", "1", "-ar", "16000", str(wav)], check=True)
        with wave.open(str(wav)) as w:
            samples = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(float)
    win = 800  # 50 ms
    energy = np.sqrt(np.convolve(samples ** 2, np.ones(win) / win, "valid")[::win])
    db = 20 * np.log10(energy + 1)
    voiced = db > np.percentile(db, 30) + 12
    segments, start = [], None
    for i, on in enumerate(voiced):
        t = i * 0.05
        if on and start is None:
            start = t
        elif not on and start is not None:
            segments.append([start, t])
            start = None
    if start is not None:
        segments.append([start, len(voiced) * 0.05])
    merged = []
    for seg in segments:
        if merged and seg[0] - merged[-1][1] < 0.12:
            merged[-1][1] = seg[1]
        else:
            merged.append(seg)
    return merged


def group_by_scene(segments):
    groups = [[segments[0]]]
    for seg in segments[1:]:
        if seg[0] - groups[-1][-1][1] >= SCENE_GAP:
            groups.append([seg])
        else:
            groups[-1].append(seg)
    return groups


def split_phrases(text: str):
    sentences = [s for s in re.split(r"(?<=[。！？])", text) if s.strip()]
    phrases = []
    for sentence in sentences:
        if len(sentence) <= MAX_CUE_CHARS:
            phrases.append(sentence)
            continue
        parts = [p for p in re.split(r"(?<=、)", sentence) if p]
        current = ""
        for part in parts:
            if current and len(current) + len(part) > MAX_CUE_CHARS:
                phrases.append(current)
                current = part
            else:
                current += part
        if current:
            phrases.append(current)
    return phrases


def align(phrases, segs):
    """Give each phrase a time span whose boundaries fall on real pauses.

    Picks the pauses that best match each phrase's share of the spoken
    duration (by character count), using a small dynamic programme.
    """
    start, end = segs[0][0], segs[-1][1]
    pauses = [segs[i][1] for i in range(len(segs) - 1) if segs[i + 1][0] - segs[i][1] >= SENTENCE_GAP]
    points = [start, *pauses, end]
    per_char = (end - start) / sum(len(p) for p in phrases)
    expected = [per_char * len(p) for p in phrases]
    count = len(phrases)
    if len(points) - 1 < count:
        bounds, t = [start], start
        for duration in expected:
            t += duration
            bounds.append(t)
    else:
        inf = float("inf")
        # best[k][j]: cost of ending phrase k-1 at points[j]
        best = [[inf] * len(points) for _ in range(count + 1)]
        prev = [[0] * len(points) for _ in range(count + 1)]
        best[0][0] = 0
        for k in range(1, count + 1):
            for j in range(k, len(points)):
                for i in range(k - 1, j):
                    if best[k - 1][i] == inf:
                        continue
                    cost = best[k - 1][i] + (points[j] - points[i] - expected[k - 1]) ** 2 / expected[k - 1]
                    if cost < best[k][j]:
                        best[k][j], prev[k][j] = cost, i
        bounds, j = [end], len(points) - 1
        for k in range(count, 0, -1):
            j = prev[k][j]
            bounds.append(points[j])
        bounds.reverse()
    return [(bounds[i], bounds[i + 1], phrase) for i, phrase in enumerate(phrases)]


def stamp(t: float) -> str:
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d}.{ms % 1000:03d}"


def write_vtt(scenes, groups):
    if len(groups) != len(scenes):
        raise RuntimeError(f"Detected {len(groups)} narration blocks for {len(scenes)} scenes")
    cues = []
    for number, (scene, segs) in enumerate(zip(scenes, groups), 1):
        for cue_index, cue in enumerate(align(split_phrases(display(scene[3])), segs)):
            cues.append((f"s{number:02d}-{cue_index + 1}", *cue))
    lines = ["WEBVTT", ""]
    for index, (name, begin, finish, phrase) in enumerate(cues):
        # Show captions slightly early and hold them briefly, without overlapping the next cue.
        next_begin = cues[index + 1][1] - 0.15 if index + 1 < len(cues) else finish + 0.6
        lines += [name, f"{stamp(max(0, begin - 0.15))} --> {stamp(min(finish + 0.6, next_begin))}", phrase, ""]
    VTT.write_text("\n".join(lines), encoding="utf-8")
    print(VTT)


def remaster_audio():
    # Low-cut removes the ambient drone, a gentle presence lift makes consonants
    # clearer on phone speakers, and loudness is raised to a streaming level.
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / VIDEO.name
        subprocess.run([
            "ffmpeg", "-v", "error", "-y", "-i", str(VIDEO),
            "-af", "highpass=f=120,equalizer=f=320:t=q:w=1.2:g=-2,equalizer=f=3000:t=q:w=1.0:g=3.5,"
                   "acompressor=threshold=-22dB:ratio=2.5:attack=8:release=120,loudnorm=I=-14:TP=-1.5:LRA=6",
            "-map", "0:v", "-map", "0:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-ar", "44100",
            "-movflags", "+faststart", str(out),
        ], check=True)
        shutil.move(out, VIDEO)
    print(VIDEO)


def main():
    scenes = load_scenes()
    write_vtt(scenes, group_by_scene(speech_segments(VIDEO)))
    if "--skip-audio" not in sys.argv:
        remaster_audio()


if __name__ == "__main__":
    main()
