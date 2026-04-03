import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { About } from './About'

function renderAbout() {
  return render(<MemoryRouter><About /></MemoryRouter>)
}

describe('About', () => {
  it('renders the about heading', () => {
    renderAbout()
    expect(screen.getByRole('heading', { name: 'About Genetrax' })).toBeInTheDocument()
  })

  it('renders privacy note', () => {
    renderAbout()
    expect(screen.getByText(/no data ever leaves your machine/i)).toBeInTheDocument()
  })

  it('renders databases section', () => {
    renderAbout()
    expect(screen.getByRole('heading', { name: 'Databases' })).toBeInTheDocument()
  })

  it('renders methods section', () => {
    renderAbout()
    expect(screen.getByRole('heading', { name: 'Methods' })).toBeInTheDocument()
  })

  it('renders developer info', () => {
    renderAbout()
    expect(screen.getByRole('heading', { name: 'Nabil-Fareed Alikhan' })).toBeInTheDocument()
  })
})
