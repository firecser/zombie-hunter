#!/usr/bin/env python3
# 图标生成脚本（工程自带，零外部依赖）
#
# 来源：images/source-icons/<官方原始文件>  —— 这些文件是从
#       「微信小游戏源码80套/index.html」解析出的官方图标，已拷入本工程。
# 产出：images/<gameid>icon.png  —— 游戏运行时实际加载的正方形图标（居中裁方、最长边≤96px、统一 PNG）。
#
# 用法：
#   python tools/makeicons.py            # 输出到 images/
#   python tools/makeicons.py <outdir>   # 输出到指定目录（用于验证/调试）
#
# 这样工程完全自包含：图标来源与生成逻辑都在仓库内，不再引用外部源码包路径。
import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "images", "source-icons")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "images")
MAX = 96

# gameid -> source-icons 中的官方文件名
MAP = {
    "qmxzfzm": "qmxzfzm.png",
    "sqsdscj": "sqsdscj.png",
    "qiexigua": "qiexigua.png",
    "bdsjm": "bdsjm.jpg",
    "shenjingmao": "shenjingmao.png",   # 官方源文件名为 jssjm.png（围住神经猫1）
    "yibihua": "yibihua.png",           # 官方源文件名为 ybh.png
    "sheqiu": "sheqiu.png",
    "feidegenggao": "feidegenggao.png",
    "bunengsi": "bunengsi.jpg",
    "qingwa": "qingwa.jpg",
    "xiaoniaofeifei": "xiaoniaofeifei.png",
    "zuiqiangyanli": "zuiqiangyanli.png",  # 官方源文件名为 zqyl.png
}


def make(src_name):
    path = os.path.join(SRC, src_name)
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    im = im.crop((left, top, left + side, top + side))  # 居中裁成正方形
    if side > MAX:
        im = im.resize((MAX, MAX), Image.LANCZOS)  # 仅降采样，避免糊
    # side <= MAX：保持原尺寸不放大
    return im


def main():
    os.makedirs(OUT, exist_ok=True)
    for gid, fname in MAP.items():
        out_path = os.path.join(OUT, gid + "icon.png")
        make(fname).save(out_path, "PNG")
        print("wrote", os.path.relpath(out_path, ROOT))


if __name__ == "__main__":
    main()
