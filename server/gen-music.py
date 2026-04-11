"""
gen-music.py
------------
Generates a 14-second cinematic background track for TikTok promo videos.

Usage:  python3 gen-music.py <output.wav> [style]

Styles:
  cinematic  (default)  Am-F-C-G  — epic / movie-trailer
  action                Dm-Bb-F-C — intense / driven
  drama                 Em-C-G-Am — emotional arc
  mystery               Am-E-Dm-Am— dark / tense
"""
import struct, math, wave, sys

RATE = 44100
DUR  = float(sys.argv[3]) if len(sys.argv) > 3 else 29.0
N    = int(RATE * DUR)

CHORD_PRESETS = {
    # style: list of [root, third, fifth, octave]  Hz per chord
    "cinematic": [
        [110.00, 130.81, 164.81, 220.00],   # Am
        [ 87.31, 110.00, 130.81, 174.61],   # F
        [ 65.41,  82.41,  98.00, 130.81],   # C
        [ 98.00, 123.47, 146.83, 196.00],   # G
    ],
    "action": [
        [146.83, 174.61, 220.00, 293.66],   # Dm
        [116.54, 146.83, 174.61, 233.08],   # Bb
        [ 87.31, 110.00, 130.81, 174.61],   # F
        [ 65.41,  82.41,  98.00, 130.81],   # C
    ],
    "drama": [
        [164.81, 196.00, 246.94, 329.63],   # Em
        [ 65.41,  82.41,  98.00, 130.81],   # C
        [ 98.00, 123.47, 146.83, 196.00],   # G
        [110.00, 130.81, 164.81, 220.00],   # Am
    ],
    "mystery": [
        [110.00, 130.81, 164.81, 220.00],   # Am
        [164.81, 207.65, 246.94, 329.63],   # E  (maj)
        [146.83, 174.61, 220.00, 293.66],   # Dm
        [110.00, 130.81, 164.81, 220.00],   # Am
    ],
}

HARMONICS = ((1.0, 1), (0.38, 2), (0.18, 3), (0.09, 4), (0.04, 5))

def adsr(t_rel, seg_len, A=0.22, D=0.28, S=0.72, R=0.55):
    if t_rel < 0 or t_rel >= seg_len: return 0.0
    if t_rel < A:             return t_rel / A
    if t_rel < A + D:         return 1.0 - (1.0 - S) * (t_rel - A) / D
    if t_rel < seg_len - R:   return S
    return max(0.0, S * (seg_len - t_rel) / R)

def note_sample(freq, t):
    return sum(a * math.sin(2 * math.pi * freq * h * t) for a, h in HARMONICS)

out   = sys.argv[1] if len(sys.argv) > 1 else '/tmp/promo_raw.wav'
style = sys.argv[2] if len(sys.argv) > 2 else 'cinematic'
CHORDS = CHORD_PRESETS.get(style, CHORD_PRESETS["cinematic"])
SEG    = DUR / len(CHORDS)

# For "action" style, add a subtle rhythmic pulse at 120 BPM
is_action = (style == "action")

frames = []
for i in range(N):
    t    = i / RATE
    ci   = min(int(t / SEG), len(CHORDS) - 1)
    trel = t - ci * SEG
    env  = adsr(trel, SEG)
    genv = min(1.0, t / 1.2) * min(1.0, (DUR - t) / 2.0)

    L = R = 0.0
    chord = CHORDS[ci]
    for j, freq in enumerate(chord):
        pan = (j - (len(chord) - 1) / 2) * 0.30
        amp = 0.21 / len(chord)
        s   = note_sample(freq, t) * amp * env * genv
        L  += s * (1.0 - max(0,  pan))
        R  += s * (1.0 - max(0, -pan))

    # Rhythmic pulse for action (120 BPM = 2 Hz)
    if is_action:
        beat = max(0, math.sin(2 * math.pi * 2 * t)) ** 4  # sharp pulse on beat
        pulse_freq = chord[0] * 0.5   # sub-bass an octave down
        L += 0.06 * beat * math.sin(2 * math.pi * pulse_freq * t) * genv
        R += 0.06 * beat * math.sin(2 * math.pi * pulse_freq * t) * genv
    else:
        pulse = 0.035 * math.sin(2 * math.pi * 0.33 * t) * genv
        L += pulse
        R += pulse

    frames.append(struct.pack('<hh',
        max(-32767, min(32767, int(L * 32767))),
        max(-32767, min(32767, int(R * 32767))),
    ))

with wave.open(out, 'w') as wf:
    wf.setnchannels(2)
    wf.setsampwidth(2)
    wf.setframerate(RATE)
    wf.writeframes(b''.join(frames))
