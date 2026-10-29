import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/qa')
const expected = JSON.parse(fs.readFileSync(path.join(fixtures, 'expected-indexed.json'), 'utf8'))
async function downloadJson(page: Page, label?: string) {
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'JSON', exact: true }).click()
  const download = await pending
  const directory = process.env.GENETRAX_EXPORT_DIR
  if (directory && label) { fs.mkdirSync(directory, { recursive: true }); await download.saveAs(path.join(directory, label + '.json')) }
  const file = await download.path()
  return JSON.parse(fs.readFileSync(file!, 'utf8'))
}
async function custom(page: Page, archive = 'qa.tar.gz', query = 'queries.fa') {
  await page.goto('/')
  await page.locator('input[type=file]').first().setInputFiles(path.join(fixtures, query))
  await page.getByRole('button', { name: 'Custom', exact: true }).click()
  await page.locator('input[type=file]').nth(1).setInputFiles({ name: 'renamed-database.tar.gz', mimeType: 'application/gzip', buffer: fs.readFileSync(path.join(fixtures, archive)) })
  await page.locator('input[type=file]').nth(2).setInputFiles(path.join(fixtures, 'metadata.json'))
  await page.getByRole('button', { name: 'Use Custom Database' }).click()
  await page.getByRole('button', { name: /screen for amr/i }).click()
}
for (const [archive, query] of [['qa.tar.gz', 'queries.fa'], ['qa.tar.gz', 'queries.fa.gz'], ['unindexed.tar.gz', 'queries.fa']]) {
  test(`real BLAST calls match independent native reference: ${archive}, ${query}`, async ({ page }) => {
    await custom(page, archive, query)
    await page.waitForFunction(() => document.querySelector('.results,.error'))
    expect(await page.locator('.error').allTextContents()).toEqual([])
    await expect(page.locator('.results')).toBeVisible()
    const result = await downloadJson(page)
    expect(result.hits).toEqual(expected.map((hit: Record<string, unknown>) => ({ ...hit, file: query, database: 'renamed-database' })))
    expect(result.hits.some((hit: { sequence: string }) => hit.sequence === 'negative')).toBe(false)
    await expect(page.locator('.error')).toHaveCount(0)
    const csv = page.waitForEvent('download')
    await page.getByRole('button', { name: 'CSV', exact: true }).click()
    const text = fs.readFileSync((await (await csv).path())!, 'utf8')
    expect(text).toContain('"Generic ""noncoding"", software test sequence"')
  })
}
test('incomplete indexed archives produce an explicit error rather than zero results', async ({ page }) => {
  await custom(page, 'missing.tar.gz')
  await expect(page.getByRole('alert')).toContainText('include both .nsi and .nsd')
  await expect(page.locator('.results')).toHaveCount(0)
})
test('changing category clears an incompatible hidden database selection', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type=file]').first().setInputFiles(path.join(fixtures, 'queries.fa'))
  await page.getByRole('button', { name: 'Virulence', exact: true }).click()
  await page.locator('.db-card').first().click()
  await expect(page.getByRole('button', { name: /screen for amr/i })).toBeEnabled()
  await page.getByRole('button', { name: 'Plasmid', exact: true }).click()
  await expect(page.getByRole('button', { name: /screen for amr/i })).toBeDisabled()
  await expect(page.locator('.db-card[aria-checked=true]')).toHaveCount(0)
})

const benchmark = process.env.GENETRAX_BENCHMARK_DIR
const categories = { ncbi: 'Amr', card: 'Amr', resfinder: 'Amr', megares: 'Amr', vfdb: 'Virulence', plasmidfinder: 'Plasmid' }
const names = { ncbi: 'NCBI AMR', card: 'CARD', resfinder: 'ResFinder', megares: 'MEGARes', vfdb: 'VFDB', plasmidfinder: 'PlasmidFinder' }
for (const id of Object.keys(categories) as (keyof typeof categories)[]) {
  for (const mode of ['k12', 'roundtrip']) {
    test(`preset ${id}: ${mode} matches independent native BLAST calls`, async ({ page }) => {
      test.skip(!benchmark, 'Set GENETRAX_BENCHMARK_DIR to the independently generated benchmark directory')
      const query = mode === 'k12' ? path.join(benchmark!, 'ecoli-k12-MG1655.fna') : path.join(benchmark!, 'database-' + id, 'roundtrip.fa')
      const expectedCalls = JSON.parse(fs.readFileSync(path.join(benchmark!, id + '-' + mode, 'expected.json'), 'utf8'))
      await page.goto('/')
      await page.locator('input[type=file]').first().setInputFiles(query)
      await page.getByRole('button', { name: categories[id], exact: true }).click()
      await page.getByRole('radio').filter({ has: page.getByText(names[id], { exact: true }) }).click()
      await page.getByRole('button', { name: /screen for amr/i }).click()
      await page.waitForFunction(() => document.querySelector('.results,.error'))
    expect(await page.locator('.error').allTextContents()).toEqual([])
    await expect(page.locator('.results')).toBeVisible()
      expect((await downloadJson(page, id + '-' + mode)).hits).toEqual(expectedCalls)
      if (process.env.GENETRAX_EXPORT_DIR) {
        const csv = page.waitForEvent('download')
        await page.getByRole('button', { name: 'CSV', exact: true }).click()
        await (await csv).saveAs(path.join(process.env.GENETRAX_EXPORT_DIR, id + '-' + mode + '.csv'))
      }
      await expect(page.locator('.error')).toHaveCount(0)
    })
  }
}
