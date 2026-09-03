#!/usr/bin/env python3
"""
Photo maintenance for existing images.

    python3 compress_existing_images.py --thumbs [--force]
        Backfill thumbnails: for every location photo in the project root and
        every file directly inside uploads/, write DIR/thumbs/NAME.jpg
        (longest side 480px, JPEG q78). Existing thumbnails are skipped unless
        --force is given or the source is newer. Full-size photos are never
        touched.

    python3 compress_existing_images.py --recompress
        Legacy one-off: recompress location*.jpg in the project root in place
        (longest side 1600px, JPEG q80). Destructive; only run this on purpose.
"""

import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)

import server  # noqa: E402  (shares the thumbnail/compression code with the app)

IMAGE_EXTS = ('.jpg', '.jpeg', '.png', '.webp', '.gif')


def photo_sources():
    """Yield absolute paths of every photo that should have a thumbnail."""
    for f in sorted(os.listdir(ROOT)):
        if f.lower().startswith('location') and f.lower().endswith(IMAGE_EXTS):
            yield os.path.join(ROOT, f)
    uploads = os.path.join(ROOT, 'uploads')
    if os.path.isdir(uploads):
        for f in sorted(os.listdir(uploads)):
            p = os.path.join(uploads, f)
            if os.path.isfile(p) and f.lower().endswith(IMAGE_EXTS) and not f.startswith('.'):
                yield p


def backfill_thumbs(force=False):
    made = skipped = failed = 0
    total_bytes = 0
    for src in photo_sources():
        dst = server.thumb_path_for(src)
        if (not force and os.path.isfile(dst)
                and os.path.getmtime(dst) >= os.path.getmtime(src)):
            skipped += 1
            total_bytes += os.path.getsize(dst)
            continue
        rel = server.make_thumbnail(src)
        if rel:
            made += 1
            size = os.path.getsize(dst)
            total_bytes += size
            print(f"  {rel:55s} {size // 1024:>4} KB")
        else:
            failed += 1
            print(f"  FAILED {os.path.relpath(src, ROOT)}")
    print(f"\nThumbnails: {made} written, {skipped} up to date, {failed} failed, "
          f"{total_bytes / 1024:.0f} KB total")
    return failed == 0


def recompress_root_photos():
    targets = sorted(
        f for f in os.listdir(ROOT)
        if f.lower().startswith('location') and f.lower().endswith(('.jpg', '.jpeg', '.png'))
    )
    if not targets:
        print("No location*.jpg files found.")
        return True

    print(f"Found {len(targets)} location images to compress.\n")
    ok = 0
    for f in targets:
        path = os.path.join(ROOT, f)
        before = os.path.getsize(path)
        out = server.compress_image(path, max_dimension=server.FULL_MAX_DIM, quality=server.FULL_QUALITY)
        after = os.path.getsize(out)
        print(f"  {os.path.basename(out):40s}  {before // 1024:>5} KB -> {after // 1024:>5} KB")
        ok += 1
    print(f"\nDone - {ok}/{len(targets)} compressed.")
    return True


def main(argv):
    if '--thumbs' in argv:
        ok = backfill_thumbs(force='--force' in argv)
    elif '--recompress' in argv:
        ok = recompress_root_photos()
    else:
        print(__doc__.strip())
        return 2
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
