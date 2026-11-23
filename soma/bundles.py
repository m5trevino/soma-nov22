#!/usr/bin/env python3
"""Pack the pipeline's two big inputs into one standard file each, and check or unpack them.

    sessions     the chat sessions (a directory per session: session.json + chunk files)
    invariants   the invariants corpus (one SQLite database, with its FTS tables)

    python3 bundles.py pack   [--sessions DIR] [--invariants DB] [--out DIR] [--only sessions|invariants]
    python3 bundles.py verify MANIFEST [--deep]
    python3 bundles.py unpack MANIFEST DEST

Each pack writes three files into ``--out``:

    sessions-<date>.tar.zst          only the session directories, layout unchanged
    sessions-<date>.manifest.json    counts, sizes, sha256 of the archive
    sessions-<date>.index.jsonl      one line per session: id, files, bytes, layout digest

    invariants-<date>.sqlite.zst     a consistent snapshot of the database (SQLite .backup)
    invariants-<date>.manifest.json  table row counts, schema digest, sha256 of the db and of the .zst

Unpacked, set ``SOMA_SESSIONS_DIR`` to the folder the sessions went into and
``SOMA_INVARIANTS_DB`` to the unpacked ``.sqlite``. Nothing here uploads anything.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
from pathlib import Path

SCHEMA = "soma-bundle/1"
DEFAULT_SESSIONS = "/media/storage/dendritic123/chat-logs/sessions"
DEFAULT_INVARIANTS = "/media/storage/invariants/invariants.db"
ZSTD_LEVEL = "-3"


class BundleError(Exception):
    pass


def sha256_file(path: str | Path, bufsize: int = 1 << 22) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        while True:
            block = fh.read(bufsize)
            if not block:
                return h.hexdigest()
            h.update(block)


def _need(tool: str) -> None:
    if shutil.which(tool) is None:
        raise BundleError(f"{tool} is not installed")


# ── sessions ────────────────────────────────────────────────────────────────

def session_dirs(base: str | Path) -> list[str]:
    """Names of the directories under ``base`` that are sessions (they hold a session.json)."""
    out = []
    with os.scandir(base) as it:
        for e in it:
            if e.is_dir(follow_symlinks=False) and os.path.exists(os.path.join(e.path, "session.json")):
                out.append(e.name)
    return sorted(out)


def _session_entry(base: str, name: str) -> dict:
    """One index line. The layout digest covers every file's relative name and size."""
    digest, files, total = hashlib.sha256(), 0, 0
    for root, _dirs, names in os.walk(os.path.join(base, name)):
        for fn in sorted(names):
            p = os.path.join(root, fn)
            size = os.path.getsize(p)
            digest.update(f"{os.path.relpath(p, base)}\t{size}\n".encode())
            files += 1
            total += size
    return {"session_id": name, "files": files, "bytes": total, "layout_sha256": digest.hexdigest()}


def pack_sessions(src: str | Path, out_dir: str | Path, stamp: str) -> dict:
    _need("tar")
    _need("zstd")
    src, out_dir = str(src), Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    names = session_dirs(src)
    if not names:
        raise BundleError(f"no session directories (with a session.json) under {src}")
    index = [_session_entry(src, n) for n in names]
    archive = out_dir / f"sessions-{stamp}.tar.zst"
    index_path = out_dir / f"sessions-{stamp}.index.jsonl"
    index_path.write_text("".join(json.dumps(e) + "\n" for e in index), encoding="utf-8")
    with tempfile.NamedTemporaryFile("wb", delete=False) as lst:
        lst.write(b"\0".join(n.encode() for n in names) + b"\0")
        list_path = lst.name
    try:
        tar = subprocess.Popen(
            ["tar", "-C", src, "--null", "--sort=name", "-cf", "-", "-T", list_path],
            stdout=subprocess.PIPE)
        zst = subprocess.run(["zstd", "-T0", ZSTD_LEVEL, "-q", "-f", "-o", str(archive)],
                             stdin=tar.stdout)
        tar.stdout.close()
        if tar.wait() != 0 or zst.returncode != 0:
            raise BundleError("tar or zstd failed while packing the sessions")
    finally:
        os.unlink(list_path)
    manifest = {
        "schema": SCHEMA, "kind": "sessions", "created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": src, "archive": archive.name, "index": index_path.name,
        "format": "tar+zstd", "sessions": len(index),
        "files": sum(e["files"] for e in index), "bytes": sum(e["bytes"] for e in index),
        "archive_bytes": archive.stat().st_size, "archive_sha256": sha256_file(archive),
        "index_sha256": sha256_file(index_path),
        "not_included": sorted(e.name for e in os.scandir(src) if not (
            e.is_dir(follow_symlinks=False) and e.name in set(names))),
    }
    mp = out_dir / f"sessions-{stamp}.manifest.json"
    mp.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


# ── invariants ──────────────────────────────────────────────────────────────

def _db_facts(path: str | Path) -> dict:
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        objs = con.execute("select type, name, sql from sqlite_master order by name").fetchall()
        tables = [n for t, n, _ in objs if t == "table" and not any(
            n.startswith(f"{b}_") for b in ("anchors_fts", "laws_fts", "truth_fts"))]
        counts = {t: con.execute(f'select count(*) from "{t}"').fetchone()[0] for t in tables}
        schema = hashlib.sha256("\n".join(f"{t}|{n}|{s}" for t, n, s in objs).encode()).hexdigest()
        return {"tables": counts, "fts_tables": sorted(n for t, n, s in objs if s and "fts5" in s.lower()),
                "schema_sha256": schema, "sqlite_version": sqlite3.sqlite_version,
                "quick_check": con.execute("pragma quick_check").fetchone()[0]}
    finally:
        con.close()


def pack_invariants(src: str | Path, out_dir: str | Path, stamp: str) -> dict:
    _need("zstd")
    src, out_dir = str(src), Path(out_dir)
    if not os.path.exists(src):
        raise BundleError(f"no database at {src}")
    out_dir.mkdir(parents=True, exist_ok=True)
    snap = out_dir / f".invariants-{stamp}.snapshot.sqlite"
    archive = out_dir / f"invariants-{stamp}.sqlite.zst"
    try:
        a = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
        b = sqlite3.connect(str(snap))
        a.backup(b)                      # a consistent copy, whatever else has the file open
        b.close()
        a.close()
        facts = _db_facts(snap)
        db_sha = sha256_file(snap)
        r = subprocess.run(["zstd", "-T0", ZSTD_LEVEL, "-q", "-f", str(snap), "-o", str(archive)])
        if r.returncode != 0:
            raise BundleError("zstd failed while packing the invariants")
        manifest = {
            "schema": SCHEMA, "kind": "invariants", "created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "source": src, "archive": archive.name, "format": "sqlite+zstd",
            "db_bytes": snap.stat().st_size, "db_sha256": db_sha,
            "archive_bytes": archive.stat().st_size, "archive_sha256": sha256_file(archive),
            **facts,
        }
    finally:
        if snap.exists():
            snap.unlink()
    (out_dir / f"invariants-{stamp}.manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


# ── verify and unpack ───────────────────────────────────────────────────────

def _load_manifest(path: str | Path) -> tuple[dict, Path]:
    mp = Path(path)
    m = json.loads(mp.read_text(encoding="utf-8"))
    if m.get("schema") != SCHEMA or m.get("kind") not in ("sessions", "invariants"):
        raise BundleError(f"{mp} is not a soma bundle manifest")
    return m, mp.parent


def verify(manifest_path: str | Path, deep: bool = False) -> list[str]:
    """Problems found, or an empty list. ``deep`` also unpacks to a temp dir and checks the contents."""
    m, base = _load_manifest(manifest_path)
    problems: list[str] = []
    archive = base / m["archive"]
    if not archive.exists():
        return [f"{m['archive']} is missing"]
    if archive.stat().st_size != m["archive_bytes"]:
        problems.append(f"{m['archive']} is {archive.stat().st_size} bytes, the manifest says {m['archive_bytes']}")
    if sha256_file(archive) != m["archive_sha256"]:
        problems.append(f"{m['archive']} does not match its sha256")
    if m["kind"] == "sessions":
        idx = base / m["index"]
        if not idx.exists():
            problems.append(f"{m['index']} is missing")
        elif sha256_file(idx) != m["index_sha256"]:
            problems.append(f"{m['index']} does not match its sha256")
    if deep and not problems:
        with tempfile.TemporaryDirectory(dir=str(base)) as tmp:
            try:
                unpack(manifest_path, tmp, _checked=True)
            except BundleError as e:
                problems.append(str(e))
    return problems


def unpack(manifest_path: str | Path, dest: str | Path, _checked: bool = False) -> dict:
    """Verify, then unpack. Sessions go into ``dest`` as ``dest/<session_id>/``; the database as ``dest/<name>.sqlite``."""
    m, base = _load_manifest(manifest_path)
    if not _checked:
        bad = verify(manifest_path)
        if bad:
            raise BundleError("; ".join(bad))
    _need("zstd")
    dest = Path(dest)
    dest.mkdir(parents=True, exist_ok=True)
    archive = base / m["archive"]
    if m["kind"] == "sessions":
        _need("tar")
        z = subprocess.Popen(["zstd", "-dc", str(archive)], stdout=subprocess.PIPE)
        t = subprocess.run(["tar", "-xf", "-", "-C", str(dest)], stdin=z.stdout)
        z.stdout.close()
        if z.wait() != 0 or t.returncode != 0:
            raise BundleError("tar or zstd failed while unpacking the sessions")
        found = session_dirs(dest)
        if len(found) != m["sessions"]:
            raise BundleError(f"unpacked {len(found)} sessions, the manifest says {m['sessions']}")
        return {"sessions": len(found), "dir": str(dest)}
    out = dest / m["archive"].replace(".sqlite.zst", ".sqlite")
    r = subprocess.run(["zstd", "-d", "-q", "-f", str(archive), "-o", str(out)])
    if r.returncode != 0:
        raise BundleError("zstd failed while unpacking the invariants")
    if sha256_file(out) != m["db_sha256"]:
        raise BundleError("the unpacked database does not match its sha256")
    counts = _db_facts(out)["tables"]
    if counts != m["tables"]:
        raise BundleError(f"row counts differ after unpacking: {counts} vs {m['tables']}")
    return {"db": str(out), "tables": counts}


# ── command line ────────────────────────────────────────────────────────────

def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    pk = sub.add_parser("pack")
    pk.add_argument("--sessions", default=DEFAULT_SESSIONS)
    pk.add_argument("--invariants", default=DEFAULT_INVARIANTS)
    pk.add_argument("--out", required=True)
    pk.add_argument("--only", choices=("sessions", "invariants"))
    pk.add_argument("--stamp", default=time.strftime("%Y%m%d", time.gmtime()))
    vf = sub.add_parser("verify")
    vf.add_argument("manifest")
    vf.add_argument("--deep", action="store_true")
    up = sub.add_parser("unpack")
    up.add_argument("manifest")
    up.add_argument("dest")
    args = p.parse_args(argv)
    try:
        if args.cmd == "pack":
            for kind, fn, src in (("invariants", pack_invariants, args.invariants),
                                  ("sessions", pack_sessions, args.sessions)):
                if args.only in (None, kind):
                    t0 = time.time()
                    m = fn(src, args.out, args.stamp)
                    print(f"{kind}: {m['archive']}  {m['archive_bytes']:,} bytes  "
                          f"sha256 {m['archive_sha256'][:16]}…  ({time.time() - t0:.0f}s)", flush=True)
                    for k in ("sessions", "files", "bytes", "tables", "quick_check"):
                        if k in m:
                            print(f"  {k}: {m[k]}", flush=True)
        elif args.cmd == "verify":
            bad = verify(args.manifest, deep=args.deep)
            for line in bad:
                print("PROBLEM:", line)
            print("OK" if not bad else f"{len(bad)} problem(s)")
            return 1 if bad else 0
        else:
            print(json.dumps(unpack(args.manifest, args.dest), indent=2))
    except BundleError as e:
        print("error:", e, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
