import { test, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE = path.join(__dirname, '../fixtures/ecoli_novel.fa')

test.describe('GENETRAX e2e — AMR gene screening', () => {
  test('loads the app with upload controls and disabled screen button', async ({ page }) => {
    await page.goto('/')

    await expect(page.locator('input[type="file"]')).toBeAttached()

    const screenButton = page.getByRole('button', { name: /screen for amr/i })
    await expect(screenButton).toBeVisible()
    await expect(screenButton).toBeDisabled()
  })

  test('uploading a FASTA file shows filename in the UI', async ({ page }) => {
    await page.goto('/')

    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles(FIXTURE)

    await expect(page.getByText('ecoli_novel.fa')).toBeVisible({ timeout: 10_000 })

    // Screen button still disabled — no database selected yet
    const screenButton = page.getByRole('button', { name: /screen for amr/i })
    await expect(screenButton).toBeDisabled()
  })

  test('app title and subtitle are visible', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByRole('heading', { name: /GENETRAX/i }).first()).toBeVisible()
    await expect(page.locator('.gx-nav-logo-sub')).toContainText(/AMR.*Virulence/i)
  })
})
