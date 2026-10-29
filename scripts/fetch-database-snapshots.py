#!/usr/bin/env python3
"""Fetch the exact published database bytes used by the current app for QA."""
import argparse, gzip, hashlib, json, pathlib, subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, default=pathlib.Path('.db-dist/published'))
    args = parser.parse_args()
    source = pathlib.Path(__file__).resolve().parents[1] / 'src/genetrax/databaseSnapshots.ts'
    snapshots = json.loads(source.read_text().split(' = ', 1)[1].rsplit(' as const', 1)[0])
    for name, snapshot in snapshots.items():
        base = snapshot['manifestUrl'].rsplit('/', 1)[0]
        destination = args.output / base.rsplit('/', 1)[1]
        destination.mkdir(parents=True, exist_ok=True)
        for asset in ['manifest.json', 'database.tar.gz', 'metadata.json', 'subjects.fasta.gz']:
            subprocess.run(['curl', '--fail', '-sSL', base + '/' + asset, '-o', str(destination / asset)], check=True)
        manifest = json.loads((destination / 'manifest.json').read_text())
        for filename, expected in [('database.tar.gz', snapshot['dbSha256']), ('metadata.json', snapshot['metaSha256'])]:
            if hashlib.sha256((destination / filename).read_bytes()).hexdigest() != expected:
                raise ValueError(f'{name}: {filename} checksum mismatch')
        if hashlib.sha256(gzip.decompress((destination / 'subjects.fasta.gz').read_bytes())).hexdigest() != manifest['fastaSha256']:
            raise ValueError(f'{name}: source FASTA checksum mismatch')
        print(name, manifest['snapshot'], manifest['sequenceCount'])


if __name__ == '__main__':
    main()
