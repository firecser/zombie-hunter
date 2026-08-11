import sys
from PIL import Image
import numpy as np
from rapidocr_onnxruntime import RapidOCR

img_path = r"C:\Users\guoxiaoyu\Documents\微信小游戏提审\向僵尸开炮技能\温压弹.jpg"
img = Image.open(img_path).convert("RGB")
W, H = img.size
print("SIZE", W, H, flush=True)

engine = RapidOCR()

chunk = 1100
overlap = 150
y = 0
idx = 0
all_text = []
while y < H:
    htake = min(chunk, H - y)
    crop = img.crop((0, y, W, y + htake))
    arr = np.array(crop)
    result, _ = engine(arr)
    print(f"=== CHUNK {idx} (y={y} h={htake}) ===", flush=True)
    if result:
        for line in result:
            txt = line[1]
            print(txt, flush=True)
            all_text.append(txt)
    else:
        print("(no text)", flush=True)
    idx += 1
    if y + htake >= H:
        break
    y = y + chunk - overlap

print("=== ALL DONE, total lines:", len(all_text), flush=True)
