#!/usr/bin/env python3
"""Repackage pinned legacy snapshots with complete BLAST 2.2.26 ID indices.

Requires blast-legacy=2.2.26 (formatdb, fastacmd), curl and Python 3.
No uploads occur here. Generated manifest and hashes accompany every snapshot.
"""
import argparse, gzip, hashlib, io, json, pathlib, subprocess, tarfile


def digest(data):
    return hashlib.sha256(data).hexdigest()


def run(args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def fasta(text):
    records = []
    for line in text.splitlines():
        if line.startswith('>'):
            records.append([line[1:], ''])
        elif line.strip():
            records[-1][1] += line.strip()
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', type=pathlib.Path, default=pathlib.Path('scripts/database-sources.json'))
    parser.add_argument('--output', type=pathlib.Path, default=pathlib.Path('.db-dist/snapshots'))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    sources = json.loads(args.sources.read_text())
    generated = {}
    for name, source in sources.items():
        work = args.output / name
        work.mkdir(exist_ok=True)
        downloaded = {}
        for kind, asset in source['assets'].items():
            dest = work / kind
            if not dest.exists():
                subprocess.run(['curl', '--fail', '-sSL', asset['url'], '-o', str(dest)], check=True)
            data = dest.read_bytes()
            if digest(data) != asset['sha256']:
                raise ValueError(f'{name}: {kind} source digest mismatch')
            downloaded[kind] = data
        if 'archive' in downloaded:
            with tarfile.open(fileobj=io.BytesIO(downloaded['archive'])) as archive:
                # Never extract untrusted archive paths.
                for member in archive.getmembers():
                    if member.isfile() and pathlib.PurePosixPath(member.name).suffix in ['.nhr', '.nin', '.nsq']:
                        (work / pathlib.PurePosixPath(member.name).name).write_bytes(archive.extractfile(member).read())
            old_prefix = next(work.glob('*.nin')).with_suffix('')
            original = work / 'original.fasta'
            run(['fastacmd', '-d', str(old_prefix), '-D', '1', '-o', str(original)])
            records = fasta(original.read_text())
            old_meta = json.loads(downloaded['metadata'])
        else:
            records = fasta(downloaded['fasta'].decode())
            old_meta = None
        metadata_keys = {}
        for key in old_meta or {}:
            metadata_keys.setdefault(key.split(' ')[0], []).append(key)
        metadata = {}
        sequences = []
        for index, (header, sequence) in enumerate(records):
            original_id = header.removeprefix('lcl|')
            if old_meta is not None:
                # Some historical IDs contain whitespace; match the complete
                # original header, not just its first whitespace-delimited token.
                keys = [key for key in metadata_keys.get(original_id.split(' ')[0], [])
                        if original_id == key or original_id.startswith(key + ' ')]
                if len(keys) != 1:
                    raise ValueError(f'{name}: ambiguous/missing metadata for record {index}: {len(keys)} matches')
                meta = dict(old_meta[keys[0]])
            else:
                identifier, _, description = original_id.partition(' ')
                parts = identifier.split('~~~')
                if len(parts) < 3:
                    raise ValueError(f'{name}: unexpected upstream FASTA identifier')
                meta = {'gene': parts[1], 'accession': parts[2], 'resistance': parts[3] if len(parts) > 3 else '',
                        'product': description, 'length': len(sequence)}
            if len(sequence) != meta['length']:
                raise ValueError(f'{name}: metadata length differs from sequence')
            identifier = f'gx_{name}_{index:06d}'
            meta['sourceIdentifier'] = original_id.split(' ')[0]
            metadata[identifier] = meta
            sequences.append(f'>{identifier}\n{sequence}\n')
        text = ''.join(sequences).encode()
        subject = work / 'subjects.fasta'
        subject.write_bytes(text)
        prefix = work / f'{name}-complete'
        run(['formatdb', '-i', str(subject), '-n', str(prefix), '-p', 'F', '-o', 'T', '-t', name, '-l', str(work / 'formatdb.log')])
        required = ['nhr', 'nin', 'nsq', 'nsi', 'nsd']
        file_hashes = {}
        tar_buffer = io.BytesIO()
        with tarfile.open(fileobj=tar_buffer, mode='w', format=tarfile.USTAR_FORMAT) as archive:
            for suffix in required:
                path = prefix.with_suffix('.' + suffix)
                data = path.read_bytes()
                file_hashes[path.name] = digest(data)
                info = tarfile.TarInfo(path.name)
                info.size = len(data)
                info.mode = 0o644
                archive.addfile(info, io.BytesIO(data))
        archive_data = gzip.compress(tar_buffer.getvalue(), mtime=0)
        meta_data = (json.dumps(metadata, sort_keys=True, separators=(',', ':')) + '\n').encode()
        snapshot_id = f'{name}-{digest(archive_data)[:16]}'
        published = args.output / snapshot_id
        published.mkdir(exist_ok=True)
        (published / 'database.tar.gz').write_bytes(archive_data)
        (published / 'metadata.json').write_bytes(meta_data)
        (published / 'subjects.fasta.gz').write_bytes(gzip.compress(text, mtime=0))
        manifest = {'schemaVersion': 1, 'id': name, 'snapshot': snapshot_id,
                    'upstreamVersion': source['upstreamVersion'], 'sources': source,
                    'engine': 'NCBI legacy BLAST/formatdb 2.2.26', 'formatdbArguments': '-p F -o T',
                    'sequenceCount': len(records), 'fastaSha256': digest(text),
                    'archiveSha256': digest(archive_data), 'metadataSha256': digest(meta_data), 'files': file_hashes}
        (published / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        base = 'https://static.genomicx.org/db/genetrax/v1/' + snapshot_id
        generated[name] = {'version': 'sha:' + digest(text)[:8], 'dbUrl': base + '/database.tar.gz',
                           'metaUrl': base + '/metadata.json', 'dbSha256': digest(archive_data),
                           'metaSha256': digest(meta_data), 'sizeMb': round(len(archive_data) / 1_000_000, 2),
                           'manifestUrl': base + '/manifest.json'}
        print(f'{name}: {len(records)} records; {len(archive_data)} bytes; {snapshot_id}')
    (args.output / 'databaseSnapshots.ts').write_text('// Generated by scripts/build-database-snapshots.py; see accompanying manifests.\nexport const DATABASE_SNAPSHOTS = ' + json.dumps(generated, indent=2) + ' as const\n')


if __name__ == '__main__':
    main()
