#!/usr/bin/env python3
"""Extract .dbr records from a Grim Dawn .arz database.

Usage: python3 extract_arz.py <input.arz> <output_dir>
"""

import struct
import sys
import os
from pathlib import Path

try:
    import lz4.block
    def lz4_decompress(data, uncompressed_size):
        return lz4.block.decompress(data, uncompressed_size=uncompressed_size)
except ImportError:
    import ctypes
    import ctypes.util

    _lz4_lib = None
    for name in ['lz4', 'liblz4']:
        path = ctypes.util.find_library(name)
        if path:
            _lz4_lib = ctypes.CDLL(path)
            break
    if _lz4_lib is None:
        for path in ['/usr/lib/x86_64-linux-gnu/liblz4.so.1', '/usr/lib/liblz4.so']:
            try:
                _lz4_lib = ctypes.CDLL(path)
                break
            except OSError:
                continue
    if _lz4_lib is None:
        print("ERROR: lz4 library not found. Install with: sudo apt install liblz4-dev python3-lz4", file=sys.stderr)
        sys.exit(1)

    def lz4_decompress(data, uncompressed_size):
        dst = ctypes.create_string_buffer(uncompressed_size)
        result = _lz4_lib.LZ4_decompress_safe(data, dst, len(data), uncompressed_size)
        if result < 0:
            raise RuntimeError(f"LZ4 decompression failed: {result}")
        return dst.raw[:result]


# Entry types
TYPE_NAMES = {0: 'int', 1: 'float', 2: 'string', 3: 'bool'}


def read_string_table(f, offset, size):
    f.seek(offset)
    strings = []
    end = offset + size
    while f.tell() < end:
        count = struct.unpack('<i', f.read(4))[0]
        for _ in range(count):
            length = struct.unpack('<i', f.read(4))[0]
            s = f.read(length).decode('ascii', errors='replace')
            strings.append(s)
    return strings


def read_record_table(f, offset, count):
    f.seek(offset)
    records = []
    for _ in range(count):
        name_id = struct.unpack('<i', f.read(4))[0]
        type_len = struct.unpack('<i', f.read(4))[0]
        rtype = f.read(type_len).decode('ascii', errors='replace')
        data_offset, compressed_size, decompressed_size = struct.unpack('<iii', f.read(12))
        filetime = struct.unpack('<q', f.read(8))[0]
        records.append({
            'name_id': name_id,
            'type': rtype,
            'data_offset': data_offset,
            'compressed_size': compressed_size,
            'decompressed_size': decompressed_size,
            'filetime': filetime,
        })
    return records


def decode_entries(data, strings):
    """Decode binary entry data into (name, value_string) pairs."""
    entries = []
    pos = 0
    while pos < len(data):
        dtype, dcount, strid = struct.unpack_from('<HHi', data, pos)
        pos += 8
        values = []
        for i in range(dcount):
            raw = struct.unpack_from('<i', data, pos)[0]
            pos += 4
            if dtype == 0 or dtype == 3:  # int or bool
                values.append(str(raw))
            elif dtype == 1:  # float
                fval = struct.unpack('<f', struct.pack('<i', raw))[0]
                values.append(f"{fval:g}")
            elif dtype == 2:  # string
                values.append(strings[raw])
        name = strings[strid]
        value = ';'.join(values)
        entries.append((name, value))
    return entries


def decode_entries_typed(data, strings):
    """Decode binary entry data into (name, type_name, value_string) triples."""
    entries = []
    pos = 0
    while pos < len(data):
        dtype, dcount, strid = struct.unpack_from('<HHi', data, pos)
        pos += 8
        values = []
        for i in range(dcount):
            raw = struct.unpack_from('<i', data, pos)[0]
            pos += 4
            if dtype == 0 or dtype == 3:  # int or bool
                values.append(str(raw))
            elif dtype == 1:  # float
                fval = struct.unpack('<f', struct.pack('<i', raw))[0]
                values.append(f"{fval:g}")
            elif dtype == 2:  # string
                values.append(strings[raw])
        name = strings[strid]
        value = ';'.join(values)
        entries.append((name, TYPE_NAMES.get(dtype, 'int'), value))
    return entries


def extract_arz(arz_path, output_dir):
    output_dir = Path(output_dir)

    with open(arz_path, 'rb') as f:
        # Header
        magic, version = struct.unpack('<hh', f.read(4))
        rec_table_start, rec_table_size, rec_table_entries = struct.unpack('<iii', f.read(12))
        str_table_start, str_table_size = struct.unpack('<ii', f.read(8))

        print(f"Magic: {magic}, Version: {version}")
        print(f"Records: {rec_table_entries}, Strings table size: {str_table_size}")

        # Read string table
        strings = read_string_table(f, str_table_start, str_table_size)
        print(f"Loaded {len(strings)} strings")

        # Read record table
        records = read_record_table(f, rec_table_start, rec_table_entries)

        header_size = 24
        for rec in records:
            name = strings[rec['name_id']]
            # Read compressed data
            f.seek(header_size + rec['data_offset'])
            compressed = f.read(rec['compressed_size'])
            decompressed = lz4_decompress(compressed, rec['decompressed_size'])

            # Decode entries
            entries = decode_entries(decompressed, strings)

            # Decode entries with type info
            typed_entries = decode_entries_typed(decompressed, strings)

            # Write .dbr file
            out_path = output_dir / name
            out_path.parent.mkdir(parents=True, exist_ok=True)
            with open(out_path, 'w') as out:
                for ename, etype, evalue in typed_entries:
                    out.write(f"{ename},{evalue},{etype},\n")

        print(f"\nExtracted {len(records)} records to {output_dir}")


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <input.arz> <output_dir>")
        sys.exit(1)
    extract_arz(sys.argv[1], sys.argv[2])
