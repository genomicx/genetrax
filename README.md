# Genetrax

> Browser-based AMR and virulence genotyping — abricate-compatible, no server required.

Genetrax screens bacterial genome assemblies against curated databases of antimicrobial resistance (AMR) genes and virulence factors, replicating the behaviour of [abricate](https://github.com/tseemann/abricate) entirely in your browser via WebAssembly. No data ever leaves your machine — all processing is done client-side using BLAST compiled to WebAssembly.

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
