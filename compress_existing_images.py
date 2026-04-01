#!/usr/bin/env python3
"""
Compress existing location photos in place.
Run once on the Pi: python3 compress_existing_images.py

Targets: location*.jpg / location*.JPG (phone photos, typically 3-6 MB each)
Result:  ≤1920px on longest side, JPEG quality 82 — usually 200-450 KB each
"""

import os
import sys
from PIL import Image, ExifTags

MAX_DIM = 1920
QUALITY = 82
ROOT = os.path.dirname(os.path.abspath(__file__))


def fix_orientation(img):
    try:
        exif = img._getexif()
        if not exif:
            return img
        for tag, value in exif.items():
            if ExifTags.TAGS.get(tag) == 'Orientation':
                if value == 3:
                    return img.rotate(180, expand=True)
                elif value == 6:
                    return img.rotate(270, expand=True)
                elif value == 8:
                    return img.rotate(90, expand=True)
    except Exception:
        pass
    return img


def compress(path):
    orig_size = os.path.getsize(path)
    try:
        img = Image.open(path)
        img = fix_orientation(img)

        if img.mode in ('RGBA', 'P', 'LA'):
            bg = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'RGBA':
                bg.paste(img, mask=img.split()[3])
            else:
                bg.paste(img)
            img = bg
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        w, h = img.size
        if max(w, h) > MAX_DIM:
            scale = MAX_DIM / max(w, h)
            img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
            print(f"  resized {w}×{h} → {img.size[0]}×{img.size[1]}")

        # Normalise extension to .jpg
        base, ext = os.path.splitext(path)
        out = base + '.jpg'
        img.save(out, 'JPEG', quality=QUALITY, optimize=True)

        if out.lower() != path.lower() and os.path.exists(path):
            os.remove(path)
            path = out

        new_size = os.path.getsize(out)
        saved_pct = (1 - new_size / orig_size) * 100
        print(f"  {os.path.basename(out):40s}  {orig_size//1024:>5} KB → {new_size//1024:>5} KB  ({saved_pct:.0f}% smaller)")
        return True
    except Exception as e:
        print(f"  SKIP {os.path.basename(path)}: {e}")
        return False


def main():
    targets = sorted(
        f for f in os.listdir(ROOT)
        if f.lower().startswith('location') and f.lower().endswith(('.jpg', '.jpeg', '.png'))
    )

    if not targets:
        print("No location*.jpg files found.")
        sys.exit(0)

    print(f"Found {len(targets)} location images to compress.\n")
    ok = sum(compress(os.path.join(ROOT, f)) for f in targets)
    print(f"\nDone — {ok}/{len(targets)} compressed.")


if __name__ == '__main__':
    main()
