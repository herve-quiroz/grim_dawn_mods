#!/usr/bin/env python3
"""Convert GD .tex files to PNG.

GD .tex format: 12-byte header ('TEX\\x02' + 8 bytes) followed by a DDS
payload whose magic has been altered to 'DDSR' instead of the standard
'DDS '. This script locates the payload, restores the standard DDS
signature, and decodes it via Pillow.
"""
import io
import struct
import sys
from pathlib import Path
from PIL import Image


# GD's altered DDS magic
GD_DDS_SIG = b"DDSR"
# Standard DDS magic
STD_DDS_SIG = b"DDS "


def extract_dds(data: bytes) -> bytes:
    """Return a standard DDS byte stream extracted from a GD .tex file."""
    idx = data.find(GD_DDS_SIG)
    if idx < 0:
        # Some .tex files may already contain a standard DDS payload.
        idx = data.find(STD_DDS_SIG)
        if idx < 0:
            raise ValueError("DDS signature not found in .tex file")
        return data[idx:]
    return STD_DDS_SIG + data[idx + 4:]


def _decode_raw_bgra(dds_data: bytes) -> Image.Image:
    """Decode an uncompressed 32bpp DDS with zero/unknown masks as BGRA.

    Some GD .tex payloads declare pf_flags=0x40 (RGB), bpp=32, with all
    channel masks zeroed. Pillow's DDS plugin crashes on this. We
    fall back to interpreting the pixel bytes as BGRA, which matches
    the standard DDS layout for uncompressed 32bpp DX9 textures.
    """
    height = struct.unpack("<I", dds_data[12:16])[0]
    width = struct.unpack("<I", dds_data[16:20])[0]
    pixels = dds_data[128 : 128 + width * height * 4]
    img = Image.frombytes("RGBA", (width, height), pixels, "raw", "BGRA")
    return img


def _decode_raw_bgr(dds_data: bytes) -> Image.Image:
    """Decode an uncompressed 24bpp DDS with zero masks as BGR."""
    height = struct.unpack("<I", dds_data[12:16])[0]
    width = struct.unpack("<I", dds_data[16:20])[0]
    pixels = dds_data[128 : 128 + width * height * 3]
    img = Image.frombytes("RGB", (width, height), pixels, "raw", "BGR")
    return img


def tex_to_png(tex_path: Path, png_path: Path) -> None:
    data = tex_path.read_bytes()
    dds_data = extract_dds(data)
    try:
        img = Image.open(io.BytesIO(dds_data))
        img.load()
    except (ZeroDivisionError, NotImplementedError, OSError):
        # Pillow can't handle this DDS variant. Inspect the pixel
        # format and fall back to manual decoding for known cases.
        # DDS_PIXELFORMAT starts at offset 76 (4 magic + 72 header offset).
        pf_flags = struct.unpack("<I", dds_data[80:84])[0]
        bpp = struct.unpack("<I", dds_data[88:92])[0]
        if bpp == 32 and (pf_flags & 0x40):
            img = _decode_raw_bgra(dds_data)
        elif bpp == 24 and (pf_flags & 0x40):
            img = _decode_raw_bgr(dds_data)
        else:
            raise
    img.save(png_path, "PNG")


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("Usage: tex_to_png.py <input.tex> <output.png>", file=sys.stderr)
        return 2
    tex_to_png(Path(argv[1]), Path(argv[2]))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
