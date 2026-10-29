#!/usr/bin/env python3
"""Independent legacy BLAST 2.2.26 native/WASM and expected gene-call benchmark.

Does not import or run the application parser. The browser's JSON exports are
compared against the independent expected calls emitted by this script.
"""
import argparse, collections, gzip, hashlib, json, pathlib, random, shutil, subprocess, tarfile, xml.etree.ElementTree as ET


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def records(path):
    result = []
    for line in path.read_text().splitlines():
        if line.startswith('>'): result.append([line[1:].split()[0], ''])
        elif line.strip(): result[-1][1] += line.strip()
    return result


def extract(xml):
    result = []
    for iteration in ET.parse(xml).getroot().iter('Iteration'):
        if not list(iteration.iter('Hit')): continue
        query = iteration.findtext('Iteration_query-def').split()[0]
        for hit in iteration.iter('Hit'):
            subject = hit.findtext('Hit_accession')
            if hit.findtext('Hit_id').startswith('gnl|BL_ORD_ID|'):
                subject = hit.findtext('Hit_def').split()[0]
            for hsp in hit.iter('Hsp'):
                fields = {'query': query, 'subject': subject, 'subjectLength': int(hit.findtext('Hit_len'))}
                for field in ['query-from', 'query-to', 'hit-from', 'hit-to', 'identity', 'gaps', 'align-len', 'qseq', 'hseq', 'evalue', 'bit-score', 'score']:
                    value = hsp.findtext('Hsp_' + field)
                    if field == 'gaps' and value is None: value = '0'
                    fields[field] = value if field in ['qseq', 'hseq'] else float(value) if field in ['evalue', 'bit-score'] else int(value)
                # Independent alignment-string validation, not production math.
                assert len(fields['qseq']) == len(fields['hseq']) == fields['align-len']
                assert sum(a == b for a, b in zip(fields['qseq'], fields['hseq'])) == fields['identity']
                assert sum(a == '-' or b == '-' for a, b in zip(fields['qseq'], fields['hseq'])) == fields['gaps']
                result.append(fields)
    return result


def expected(rows, metadata, filename, database, minid=80, mincov=80):
    result = []
    for row in rows:
        meta = metadata[row['subject']]
        identity = 100 * sum(a == b for a, b in zip(row['qseq'], row['hseq'])) / len(row['qseq'])
        aligned = sum(a != '-' and b != '-' for a, b in zip(row['qseq'], row['hseq']))
        coverage = 100 * aligned / meta['length']
        assert row['subjectLength'] == meta['length']
        if identity < minid or coverage < mincov: continue
        low, high = sorted([row['hit-from'], row['hit-to']])
        coverage_map = ''.join('=' if low - 1 <= i * meta['length'] // 15 < high else '.' for i in range(15))
        result.append({'file': filename, 'sequence': row['query'], 'start': min(row['query-from'], row['query-to']),
                       'end': max(row['query-from'], row['query-to']),
                       'strand': '+' if (row['query-to'] - row['query-from']) * (row['hit-to'] - row['hit-from']) >= 0 else '-',
                       'gene': meta['gene'], 'coverage': coverage_map, 'gaps': row['gaps'],
                       'pctCoverage': int(coverage * 10 + 0.5) / 10, 'pctIdentity': int(identity * 10 + 0.5) / 10,
                       'database': database, 'accession': meta['accession'], 'product': meta['product'], 'resistance': meta['resistance']})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshots', type=pathlib.Path, required=True)
    parser.add_argument('--engine', type=pathlib.Path, required=True)
    parser.add_argument('--genome', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    args.output = args.output.resolve()
    commands = []
    def run(command):
        commands.append(command)
        return subprocess.run(command, check=True, capture_output=True, text=True).stdout
    blast = shutil.which('blastall'); formatter = shutil.which('formatdb')
    commands.append([blast, '-'])
    version_process = subprocess.run([blast, '-'], capture_output=True, text=True)
    version = version_process.stdout + version_process.stderr
    assert 'blastall 2.2.26 ' in version
    (args.output/'native-version.txt').write_text(version)
    genome = args.output/'ecoli-k12-MG1655.fna'
    genome.write_bytes(gzip.decompress(args.genome.read_bytes()))
    qa = args.output/'qa'; qa.mkdir(exist_ok=True)
    rng = random.Random(1729)
    subject = ''.join(rng.choice('ACGT') for _ in range(1200))
    subject2 = ''.join(rng.choice('ACGT') for _ in range(1000))
    dna = [('qa_subject', subject), ('qa_duplicate', subject), ('qa_secondary', subject2)]
    (qa/'subjects.fasta').write_text(''.join(f'>{name}\n{seq}\n' for name, seq in dna))
    query = [('forward', subject), ('reverse', subject.translate(str.maketrans('ACGT', 'TGCA'))[::-1]),
             ('coverage_boundary', subject[:960]), ('below_coverage', subject[:959]),
             ('insertion', subject[:400]+'GATTACA'+subject[400:]), ('deletion', subject[:400]+subject[409:]),
             ('secondary', subject2), ('negative', 'A'*1200)]
    (qa/'queries.fa').write_text(''.join(f'>{name}\n{seq}\n' for name, seq in query))
    (qa/'queries.fa.gz').write_bytes(gzip.compress((qa/'queries.fa').read_bytes(), mtime=0))
    metadata = {name: {'gene': name, 'accession': f'QA{i:03}', 'product': 'Generic "noncoding", software test sequence',
                       'resistance': '', 'length': len(seq)} for i, (name, seq) in enumerate(dna)}
    (qa/'metadata.json').write_text(json.dumps(metadata))
    run([formatter, '-i', str(qa/'subjects.fasta'), '-n', str(qa/'qa'), '-p', 'F', '-o', 'T', '-l', str(qa/'formatdb.log')])
    run([formatter, '-i', str(qa/'subjects.fasta'), '-n', str(qa/'unindexed'), '-p', 'F', '-o', 'F', '-l', str(qa/'formatdb-unindexed.log')])
    for basename, suffixes in [('qa', ['nhr','nin','nsq','nsi','nsd']), ('missing', ['nhr','nin','nsq']), ('unindexed', ['nhr','nin','nsq'])]:
        with tarfile.open(qa/(basename+'.tar.gz'), 'w:gz') as archive:
            for suffix in suffixes:
                original = qa/((('qa' if basename=='missing' else basename))+'.'+suffix)
                archive.add(original, arcname=('qa' if basename=='missing' else basename)+'.'+suffix)
    summary = {'engine': 'legacy BLAST 2.2.26', 'nativeExecutable': blast, 'nativeSha256': sha(pathlib.Path(blast)),
               'wasmSha256': sha(args.engine/'blastall.wasm'), 'loaderSha256': sha(args.engine/'blastall.js'),
               'genome': {'accession': 'GCF_000005845.2 / NC_000913.3', 'compressedSha256': sha(args.genome), 'fastaSha256': sha(genome)}, 'cases': []}
    runner = pathlib.Path(__file__).with_name('run-blast-wasm.mjs').resolve()
    def compare(label, prefix, query_path, meta, dbname):
        output = args.output/label; output.mkdir(exist_ok=True)
        native, wasm = output/'native.xml', output/'wasm.xml'
        run([blast, '-p', 'blastn', '-d', str(prefix), '-i', str(query_path), '-e', '1e-20', '-m', '7', '-F', 'F', '-W', '32', '-X', '150', '-o', str(native)])
        run(['node', str(runner), str(args.engine.resolve()), str(prefix), str(query_path), str(wasm)])
        native_tree, wasm_tree = ET.parse(native), ET.parse(wasm)
        native_parameters = {e.tag:e.text for e in native_tree.getroot().iter('Parameters') for e in e}
        wasm_parameters = {e.tag:e.text for e in wasm_tree.getroot().iter('Parameters') for e in e}
        assert native_parameters == wasm_parameters
        assert '2.2.26' in native_tree.findtext('BlastOutput_version')
        assert '2.2.26' in wasm_tree.findtext('BlastOutput_version')
        nr, wr = extract(native), extract(wasm)
        canonical = lambda rows: collections.Counter(json.dumps(row, sort_keys=True) for row in rows)
        parity = canonical(nr) == canonical(wr)
        calls = expected(nr, meta, query_path.name, dbname)
        (output/'expected.json').write_text(json.dumps(calls, indent=2))
        (output/'native-hsps.json').write_text(json.dumps(nr, indent=2)); (output/'wasm-hsps.json').write_text(json.dumps(wr, indent=2))
        case = {'case': label, 'rawHspCount': len(nr), 'wasmHspCount': len(wr), 'rawParity': parity, 'rankingParity': nr == wr,
                'expectedCallCount': len(calls), 'parameters': native_parameters, 'querySha256': sha(query_path), 'metadataCount': len(meta), 'databaseFiles': {suffix: sha(prefix.with_suffix('.'+suffix)) for suffix in ['nhr','nin','nsq','nsi','nsd'] if prefix.with_suffix('.'+suffix).exists()}}
        summary['cases'].append(case)
        assert parity, f'Raw HSP mismatch: {label}'
        return nr, calls
    compare('qa-indexed', qa/'qa', qa/'queries.fa', metadata, 'qa')
    compare('qa-unindexed', qa/'unindexed', qa/'queries.fa', metadata, 'unindexed')
    missing = qa/'missing'; missing.mkdir(exist_ok=True)
    for suffix in ['nhr', 'nin', 'nsq']: shutil.copyfile(qa/('qa.'+suffix), missing/('qa.'+suffix))
    for name, prefix in [('broken', missing/'qa'), ('complete', qa/'qa')]:
        native = qa/(name+'-native.m8'); wasm = qa/(name+'-wasm.m8')
        run([blast, '-p','blastn','-d',str(prefix),'-i',str(qa/'queries.fa'),'-e','1e-20','-m','8','-F','F','-W','32','-X','150','-o',str(native)])
        run(['node',str(runner),str(args.engine.resolve()),str(prefix),str(qa/'queries.fa'),str(wasm),'8'])
        assert native.read_text() == wasm.read_text()
        assert bool(native.read_text()) == (name == 'complete')
    for manifest_path in sorted(args.snapshots.glob('*-*/manifest.json')):
        manifest = json.loads(manifest_path.read_text()); name = manifest['id']; source = manifest_path.parent
        db = args.output/('database-'+name); db.mkdir(exist_ok=True)
        assert sha(source/'database.tar.gz') == manifest['archiveSha256']
        assert sha(source/'metadata.json') == manifest['metadataSha256']
        with tarfile.open(source/'database.tar.gz') as archive:
            for member in archive.getmembers():
                assert pathlib.PurePosixPath(member.name).name == member.name
                (db/member.name).write_bytes(archive.extractfile(member).read())
        fasta_path = db/'subjects.fasta'; fasta_path.write_bytes(gzip.decompress((source/'subjects.fasta.gz').read_bytes()))
        meta = json.loads((source/'metadata.json').read_text()); seqs = records(fasta_path)
        assert len(seqs) == len(meta) == manifest['sequenceCount']
        assert sha(fasta_path) == manifest['fastaSha256']
        assert all(identifier in meta and meta[identifier]['length'] == len(seq) for identifier,seq in seqs)
        for filename, expected_hash in manifest['files'].items(): assert sha(db/filename) == expected_hash
        prefix = next(db.glob('*.nin')).with_suffix('')
        dbname = {'ncbi':'NCBI AMR','card':'CARD','resfinder':'ResFinder','megares':'MEGARes','vfdb':'VFDB','plasmidfinder':'PlasmidFinder'}[name]+' sha:'+manifest['fastaSha256'][:8]
        rows, calls = compare(name+'-k12', prefix, genome, meta, dbname)
        # Prefer an ordinary K-12 matching record as the natural roundtrip control.
        identifier = rows[0]['subject'] if rows else seqs[0][0]
        seq = dict(seqs)[identifier]
        positive = db/'roundtrip.fa'
        positive.write_text('>natural_roundtrip\n'+seq+'\n>negative\n'+'A'*1200+'\n')
        _, positive_calls = compare(name+'-roundtrip', prefix, positive, meta, dbname)
        assert any(call['sequence']=='natural_roundtrip' and call['pctIdentity']==100 and call['pctCoverage']==100 for call in positive_calls)
        assert not any(call['sequence']=='negative' for call in positive_calls)
    (args.output/'commands.json').write_text(json.dumps(commands, indent=2)); (args.output/'summary.json').write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))

if __name__ == '__main__': main()
