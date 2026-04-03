import { NavBar, AppFooter } from '@genomicx/ui'
import { APP_VERSION } from '../lib/version'

export function About() {
  return (
    <>
      <NavBar appName="GENETRAX" appSubtitle="AMR & Virulence Genotyping" version={APP_VERSION} />
      <main className="app-main">
        <div className="about-page">
          <section>
            <h2>About Genetrax</h2>
            <p>
              Genetrax is a browser-based tool for screening bacterial genome assemblies against
              curated databases of antimicrobial resistance (AMR) genes and virulence factors.
              It is designed to replicate the behaviour of{' '}
              <a href="https://github.com/tseemann/abricate" target="_blank" rel="noopener">abricate</a>{' '}
              by Torsten Seemann, running entirely in your browser via WebAssembly.
            </p>
            <p>No data ever leaves your machine — all processing is done client-side.</p>
            <div className="privacy-note">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <path d="m9 12 2 2 4-4"/>
              </svg>
              <p>Your genome data never leaves your browser. BLAST runs entirely via WebAssembly in your local session.</p>
            </div>
          </section>

          <section>
            <h2>Databases</h2>
            <div className="about-db-entry">
              <h3>VFDB — Virulence Factor Database</h3>
              <p className="about-citation">
                Liu B et al. (2022). VFDB 2022: a general classification scheme for bacterial virulence factors.
                <em> Nucleic Acids Research</em>.
              </p>
            </div>
            <div className="about-db-entry">
              <h3>NCBI AMRFinderPlus</h3>
              <p className="about-citation">
                Feldgarden M et al. (2021). AMRFinderPlus and the Reference Gene Catalog facilitate examination of the
                resistome. <em>Scientific Reports</em>.
              </p>
            </div>
            <div className="about-db-entry">
              <h3>CARD — Comprehensive Antibiotic Resistance Database</h3>
              <p className="about-citation">
                Alcock BP et al. (2023). CARD 2023: expanded curation, support for machine learning, and resistome
                prediction at the Comprehensive Antibiotic Resistance Database. <em>Nucleic Acids Research</em>.
              </p>
            </div>
            <div className="about-db-entry">
              <h3>ResFinder</h3>
              <p className="about-citation">
                Zankari E et al. (2012). Identification of acquired antimicrobial resistance genes.
                <em> Journal of Antimicrobial Chemotherapy</em>.
              </p>
            </div>
            <div className="about-db-entry">
              <h3>PlasmidFinder</h3>
              <p className="about-citation">
                Carattoli A et al. (2014). In Silico Detection and Typing of Plasmids using PlasmidFinder and Plasmid
                Multilocus Sequence Typing. <em>Antimicrobial Agents and Chemotherapy</em>.
              </p>
            </div>
            <div className="about-db-entry">
              <h3>MEGARes 3.0</h3>
              <p className="about-citation">
                Doster E et al. (2020). MEGARes 2.0: a database for classification of antimicrobial drug, biocide and
                metal resistance determinants in metagenomic sequence data. <em>Nucleic Acids Research</em>.
              </p>
            </div>
          </section>

          <section>
            <h2>Methods</h2>
            <p>
              Genetrax replicates <code>abricate</code> using legacy BLAST (blastall) compiled to WebAssembly.
              For each uploaded assembly, it runs:
            </p>
            <p style={{ fontFamily: 'var(--gx-font-mono)', fontSize: '0.85rem', background: 'var(--gx-bg-elevated)', padding: '0.75rem 1rem', borderRadius: '8px' }}>
              blastall -p blastn -d [db] -i [query] -e 1E-20 -m 8 -F F -W 32
            </p>
            <p>
              Hits are filtered by minimum percent identity (<code>--minid</code>, default 80%) and minimum gene
              coverage (<code>--mincov</code>, default 80%). Coverage is calculated as:
              <code> (alignment_length - gaps) / gene_length × 100</code>.
            </p>
          </section>

          <section>
            <h2>Developer</h2>
            <h3>Nabil-Fareed Alikhan</h3>
            <p className="about-role">Senior Bioinformatician, Centre for Genomic Pathogen Surveillance, University of Oxford</p>
            <div className="about-links">
              <a href="https://genomicx.org" target="_blank" rel="noopener">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
                </svg>
                GenomicX
              </a>
              <a href="https://github.com/genomicx/genetrax" target="_blank" rel="noopener">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg>
                GitHub
              </a>
              <a href="https://github.com/tseemann/abricate" target="_blank" rel="noopener">
                abricate (original)
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: '2px' }}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              </a>
            </div>
          </section>
        </div>
      </main>
      <AppFooter appName="GENETRAX" bugReportUrl="https://github.com/genomicx/genetrax/issues" />
    </>
  )
}
