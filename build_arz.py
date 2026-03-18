#!/usr/bin/env python3
"""Build a Grim Dawn .arz database from loose .dbr files.

Usage: python3 build_arz.py <records_dir> <output.arz>

The .arz format (reverse-engineered from arzedit):
  - Header: 24 bytes (magic, version, record_table_start/size/entries, string_table_start/size)
  - Record data: LZ4-compressed entry data for each record
  - Record table: metadata for each record (name, type, offset, sizes, timestamp)
  - String table: all strings referenced by entries
  - Footer: 16 bytes (4 Adler32 checksums)

Each record's data is LZ4-compressed and contains entries (key-value pairs).
Entry format: type(u16) + count(u16) + string_id(i32) + values(i32[count])
Types: 0=int, 1=float, 2=string, 3=bool
"""

import struct
import os
import sys
from pathlib import Path

try:
    import lz4.block
    def lz4_compress(data):
        return lz4.block.compress(data, store_size=False)
except ImportError:
    # Fallback: raw LZ4 compression using ctypes
    import ctypes
    import ctypes.util

    _lz4_lib = None
    for name in ['lz4', 'liblz4']:
        path = ctypes.util.find_library(name)
        if path:
            _lz4_lib = ctypes.CDLL(path)
            break

    if _lz4_lib is None:
        # Try direct paths
        for path in ['/usr/lib/x86_64-linux-gnu/liblz4.so.1', '/usr/lib/liblz4.so']:
            try:
                _lz4_lib = ctypes.CDLL(path)
                break
            except OSError:
                continue

    if _lz4_lib is None:
        print("ERROR: lz4 library not found. Install with: sudo apt install liblz4-dev python3-lz4", file=sys.stderr)
        print("  or: pip install lz4", file=sys.stderr)
        sys.exit(1)

    def lz4_compress(data):
        max_dst = _lz4_lib.LZ4_compressBound(len(data))
        dst = ctypes.create_string_buffer(max_dst)
        result = _lz4_lib.LZ4_compress_default(data, dst, len(data), max_dst)
        if result <= 0:
            raise RuntimeError("LZ4 compression failed")
        return dst.raw[:result]


# Adler32 checksum (matching Grim Dawn's implementation)
def adler32(data):
    a, b = 1, 0
    for byte in data:
        a = (a + byte) % 65521
        b = (b + a) % 65521
    return ((b << 16) | a) & 0xFFFFFFFF


class StringTable:
    def __init__(self):
        self.strings = []
        self.lookup = {}

    def add(self, s):
        if s in self.lookup:
            return self.lookup[s]
        idx = len(self.strings)
        self.strings.append(s)
        self.lookup[s] = idx
        return idx

    def serialize(self):
        """Serialize string table: count(i32) + for each: length(i32) + chars"""
        parts = [struct.pack('<i', len(self.strings))]
        for s in self.strings:
            encoded = s.encode('ascii', errors='replace')
            parts.append(struct.pack('<i', len(encoded)))
            parts.append(encoded)
        return b''.join(parts)


# Entry types
TYPE_INT = 0
TYPE_FLOAT = 1
TYPE_STRING = 2
TYPE_BOOL = 3


def guess_entry_type(name, value):
    """Guess the type of a .dbr entry from its name and value."""
    # Known string fields
    string_fields = {
        'templateName', 'ActorName', 'Class', 'FileDescription',
        'experienceLevelEquation', 'experienceLevels',
        'fileNameHistoryEntry',
    }
    if name in string_fields:
        return TYPE_STRING

    # Known equation fields (contain formula characters)
    if any(c in value for c in ['(', ')', '^', 'playerLevel', 'numberOfPlayers']):
        return TYPE_STRING

    # File references
    if value.startswith('records/') or value.startswith('database/') or value.endswith('.dbr') or value.endswith('.tpl'):
        return TYPE_STRING

    # Empty value
    if value == '':
        return TYPE_STRING

    # Boolean (0 or 1 with bool-like name)
    bool_prefixes = ('is', 'has', 'can', 'enable', 'disable', 'use', 'show', 'hide')
    if value in ('0', '1') and any(name.lower().startswith(p) for p in bool_prefixes):
        return TYPE_BOOL

    # Try int
    parts = value.split(';')
    try:
        for p in parts:
            if p.strip():
                int(p.strip())
        return TYPE_INT
    except ValueError:
        pass

    # Try float
    try:
        for p in parts:
            if p.strip():
                float(p.strip())
        return TYPE_FLOAT
    except ValueError:
        pass

    # Default to string
    return TYPE_STRING


TYPE_NAME_TO_ID = {'int': TYPE_INT, 'float': TYPE_FLOAT, 'string': TYPE_STRING, 'bool': TYPE_BOOL}


def parse_dbr(filepath):
    """Parse a .dbr file into a list of (name, value, type_hint) tuples.

    Supports two formats:
      - name,value,type,   (4 fields, type is 'int'/'float'/'string'/'bool')
      - name,value,        (3 fields, type is guessed)
    """
    entries = []
    with open(filepath, 'r') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split(',')
            if len(parts) >= 3:
                name = parts[0]
                value = parts[1]
                type_hint = parts[2].strip() if len(parts) >= 4 and parts[2].strip() in TYPE_NAME_TO_ID else None
                if name:  # skip empty names
                    entries.append((name, value, type_hint))
    return entries


def build_record_data(entries, strtable):
    """Build the binary entry data for a record (before LZ4 compression)."""
    parts = []
    for entry in entries:
        name, value = entry[0], entry[1]
        type_hint = entry[2] if len(entry) > 2 else None
        name_id = strtable.add(name)
        if type_hint and type_hint in TYPE_NAME_TO_ID:
            entry_type = TYPE_NAME_TO_ID[type_hint]
        else:
            entry_type = guess_entry_type(name, value)

        if entry_type == TYPE_STRING:
            if value and ';' in value and not any(c in value for c in ['(', ')', '^']):
                # Array of strings
                str_parts = value.split(';')
                value_ints = [strtable.add(s) for s in str_parts]
            else:
                value_ints = [strtable.add(value)]
        elif entry_type == TYPE_INT:
            str_parts = value.split(';') if value else ['0']
            value_ints = []
            for s in str_parts:
                s = s.strip()
                if s:
                    try:
                        value_ints.append(int(s))
                    except ValueError:
                        try:
                            value_ints.append(int(float(s)))
                        except ValueError:
                            value_ints.append(0)
            if not value_ints:
                value_ints = [0]
        elif entry_type == TYPE_FLOAT:
            str_parts = value.split(';') if value else ['0']
            value_ints = []
            for s in str_parts:
                s = s.strip()
                if s:
                    try:
                        fval = float(s)
                    except ValueError:
                        fval = 0.0
                    value_ints.append(struct.unpack('<i', struct.pack('<f', fval))[0])
            if not value_ints:
                value_ints.append(0)
        elif entry_type == TYPE_BOOL:
            str_parts = value.split(';') if value else ['0']
            value_ints = []
            for s in str_parts:
                s = s.strip()
                try:
                    value_ints.append(int(s))
                except ValueError:
                    value_ints.append(0)
            if not value_ints:
                value_ints = [0]

        count = len(value_ints)
        # Entry header: type(u16) + count(u16) + string_id(i32)
        parts.append(struct.pack('<HHi', entry_type, count, name_id))
        # Entry values: i32[count]
        for v in value_ints:
            parts.append(struct.pack('<i', v))

    return b''.join(parts)


def build_arz(records_dir, output_path):
    """Build an .arz file from a directory of .dbr files."""
    records_dir = Path(records_dir)
    strtable = StringTable()

    # Find all .dbr files
    dbr_files = sorted(records_dir.rglob('*.dbr'))
    if not dbr_files:
        print(f"No .dbr files found in {records_dir}", file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(dbr_files)} .dbr files")

    # Process each record
    record_data_parts = []  # compressed data blobs
    record_table_parts = []  # record table entries

    data_offset = 0
    for dbr_file in dbr_files:
        rel_path = dbr_file.relative_to(records_dir)
        record_name = str(rel_path).replace(os.sep, '/')
        print(f"  Processing: {record_name}")

        entries = parse_dbr(dbr_file)

        # Find the record type (Class field)
        rtype = ''
        for entry in entries:
            if entry[0] == 'Class':
                rtype = entry[1]
                break

        # Sort entries: templateName first, then alphabetical
        template_entries = [e for e in entries if e[0] == 'templateName']
        other_entries = sorted([e for e in entries if e[0] != 'templateName'], key=lambda x: x[0])
        sorted_entries = template_entries + other_entries

        # Build and compress record data
        raw_data = build_record_data(sorted_entries, strtable)
        compressed_data = lz4_compress(raw_data)

        record_data_parts.append(compressed_data)

        # Record table entry:
        #   name_id(i32) + type_len(i32) + type(chars) + offset(i32) +
        #   compressed_size(i32) + decompressed_size(i32) + filetime(i64)
        name_id = strtable.add(record_name)
        filetime = 0  # Windows FILETIME, 0 is fine
        record_table_parts.append(struct.pack(
            '<ii', name_id, len(rtype)
        ) + rtype.encode('ascii') + struct.pack(
            '<iiiq', data_offset, len(compressed_data), len(raw_data), filetime
        ))

        data_offset += len(compressed_data)

    # Assemble the file
    record_data = b''.join(record_data_parts)
    record_table = b''.join(record_table_parts)
    string_table = strtable.serialize()

    header_size = 24
    rec_table_start = header_size + len(record_data)
    str_table_start = rec_table_start + len(record_table)

    header = struct.pack('<hhiiiii',
        2, 3,  # magic, version
        rec_table_start,
        len(record_table),
        len(dbr_files),
        str_table_start,
        len(string_table)
    )

    # Compute checksums
    h_rdata = adler32(record_data) if record_data else adler32(b'')
    h_rtable = adler32(record_table) if record_table else adler32(b'')
    h_stable = adler32(string_table)

    all_data = header + record_data + record_table + string_table
    h_all = adler32(all_data)

    footer = struct.pack('<IIII', h_all, h_stable, h_rdata, h_rtable)

    with open(output_path, 'wb') as f:
        f.write(header)
        f.write(record_data)
        f.write(record_table)
        f.write(string_table)
        f.write(footer)

    total_size = len(header) + len(record_data) + len(record_table) + len(string_table) + len(footer)
    print(f"\nBuilt {output_path}: {total_size} bytes, {len(dbr_files)} records, {len(strtable.strings)} strings")


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <records_dir> <output.arz>")
        sys.exit(1)
    build_arz(sys.argv[1], sys.argv[2])
