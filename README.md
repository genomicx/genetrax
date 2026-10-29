# Genetrax

[Open Genetrax](https://genetrax.genomicx.org)

> Browser-based AMR and virulence genotyping — BLAST-based, no server required.

Genetrax screens bacterial genome assemblies against curated databases of antimicrobial resistance (AMR) genes and virulence factors, using reference snapshots distributed by [abricate](https://github.com/tseemann/abricate) entirely in your browser via WebAssembly. No data ever leaves your machine — all processing is done client-side using BLAST compiled to WebAssembly.

## Features

- Screens against VFDB, NCBI AMRFinderPlus, CARD, ResFinder, PlasmidFinder, and MEGARes
- Configurable minimum percent identity and gene coverage thresholds
- Multi-sample batch processing
- Results table with per-hit identity, coverage, and database annotation
- CSV export of all results
- All processing in-browser — no upload, no server

## Tech Stack

- **BLAST (blastall)** — sequence alignment (WebAssembly via Emscripten)
- **React + Vite** — frontend framework
- **Cloudflare Pages** — global CDN hosting

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Running Tests

```bash
npm test           # unit tests
npm run test:e2e   # end-to-end tests (requires build first)
```

## Contributing

Contributions welcome. Please open an issue first to discuss changes.

## License

GPL-3.0-only — see [LICENSE](LICENSE)

## Reference snapshots and scientific behaviour

Each preset uses an immutable, versioned archive with complete sequence-ID indices,
matching metadata and a public provenance manifest linked from About. The `sha:`
label is the first eight characters of the reference FASTA SHA-256, not an upstream
release number. The pinned source is abricate commit
[`e2064df`](https://github.com/tseemann/abricate/tree/e2064df7d193ad783d4c188d4ce79706faf9eb75/db).
Credit the original database authors and abricate when using these references.
Their source URLs, exact hashes and record counts are retained in
`scripts/database-sources.json` and the published manifests. Historical unverified
2024/version labels have been removed. Shared WASM assets are unchanged.

The engine is **NCBI legacy BLAST 2.2.26**, using:

```text
blastall -p blastn -d DATABASE -i QUERY -e 1e-20 -m 7 -F F -W 32 -X 150
```

The selected E-value replaces `1e-20`. BLAST defaults are match +1, mismatch −3,
gap opening 5 and extension 2, verified from native and WASM XML parameters.
One output row represents one HSP; overlapping HSPs and different reference
alleles remain separate. Coordinates are 1-based and inclusive. Identity is
`100 * identical columns / alignment columns`; coverage is
`100 * aligned columns with neither sequence gapped / reference length`.
Gap counts are gap residues, not the gap-opening count in BLAST m8 output.
Identity/coverage thresholds are inclusive and applied before display rounding.
This is nucleotide marker screening, not AMRFinderPlus analysis, and does not
claim equivalence to BLAST+ or every abricate reporting/merging rule.

Custom archives must include `.nhr`, `.nin`, `.nsq` and, when generated using
`formatdb -o T`, both `.nsi` and `.nsd`. Valid `formatdb -o F` three-file archives
are also supported. The actual database basename is read from the archive.
Plain/gzip nucleotide FASTA, multi-contig queries and JSON/CSV/TSV exports are
supported. Incomplete databases, corrupt downloads, invalid FASTA and missing
metadata raise errors instead of silently reporting zero matches.

## Reproduce the scientific benchmark

Use Python 3, Node 24, `curl`, and the public-domain `blast-legacy=2.2.26`
package from Bioconda (e.g. a Pixi environment with conda-forge and bioconda).
On Apple Silicon this legacy package is available for `osx-64` and requires
Rosetta. Native `blastall`, `formatdb` and `fastacmd` must be on PATH.

```bash
python3 scripts/fetch-database-snapshots.py --output .db-dist/published
mkdir -p .db-build/engine
curl --fail -sS https://static.genomicx.org/wasm/blastall.js -o .db-build/engine/blastall.js
curl --fail -sS https://static.genomicx.org/wasm/blastall.wasm -o .db-build/engine/blastall.wasm
curl --fail -sS https://ftp.ncbi.nlm.nih.gov/genomes/all/GCF/000/005/845/GCF_000005845.2_ASM584v2/GCF_000005845.2_ASM584v2_genomic.fna.gz -o .db-build/ecoli-k12.fna.gz
python3 scripts/benchmark-blast.py --snapshots .db-dist/published --engine .db-build/engine --genome .db-build/ecoli-k12.fna.gz --output .db-build/benchmark
npm run build
GENETRAX_BENCHMARK_DIR="$PWD/.db-build/benchmark" npm run test:e2e
```

The benchmark uses nonpathogenic *E. coli* K-12 MG1655 (NC_000913.3), natural
reference roundtrips for all six presets, and deterministic noncoding QA
sequences. It compares native/WASM HSPs, alignment strings, coordinates, strand,
identity, gap residues, scores, E-values, order and duplicates using identical
database files and options. Python independently derives expected filtered calls
from alignment strings; browser JSON exports must match these field by field.
The production TypeScript parser is not used to calculate expected results.
Controls cover negative results, reverse strand, multiple contigs, insertion/
deletion gaps, coverage boundaries, gzip, valid unindexed archives and deliberately
incomplete indexed archives. Small regressions are in `tests/fixtures/qa`.

`summary.json`, `commands.json`, engine/query/database hashes, raw XML and expected
calls are emitted into the benchmark directory. To verify a deployed app:

```bash
GENETRAX_BASE_URL=https://genetrax.genomicx.org GENETRAX_BENCHMARK_DIR="$PWD/.db-build/benchmark" npm run test:e2e
```

Without `GENETRAX_BENCHMARK_DIR`, the 12 larger preset cases are explicitly skipped;
the lightweight custom-database regressions still run. For release verification,
set it and confirm that none of the preset cases were skipped. To build a new source-verified snapshot, use `python3 scripts/build-database-snapshots.py --output .db-dist/snapshots`. Snapshot builders
write locally and never publish automatically. Publish the complete generated
snapshot directories under their manifest IDs, then update `databaseSnapshots.ts`
with the generated URLs/hashes; never overwrite an existing snapshot URL.
