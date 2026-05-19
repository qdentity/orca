import { describe, expect, it } from 'vitest'
import { buildTerminalMacroInput, normalizeTerminalMacros } from './terminal-macros'

describe('normalizeTerminalMacros', () => {
  it('keeps incomplete drafts while trimming persisted values', () => {
    expect(
      normalizeTerminalMacros([
        {
          id: 'macro-1',
          name: '  Codex review  ',
          layout: 'split-right',
          command: 'codex\n',
          appendEnter: false,
          splitCommand: 'npm run dev\n'
        },
        {
          id: 'draft-row',
          name: '',
          command: 'claude'
        }
      ])
    ).toEqual([
      {
        id: 'macro-1',
        name: 'Codex review',
        layout: 'split-right',
        command: 'codex',
        appendEnter: false
      },
      {
        id: 'draft-row',
        name: '',
        layout: 'tab',
        command: 'claude',
        appendEnter: true
      }
    ])
  })

  it('drops non-object rows and falls back invalid layouts to tab', () => {
    expect(
      normalizeTerminalMacros([null, 'bad', { id: 'macro-2', name: 'Dev', layout: 'weird' }])
    ).toEqual([
      {
        id: 'macro-2',
        name: 'Dev',
        layout: 'tab',
        command: '',
        appendEnter: true
      }
    ])
  })
})

describe('buildTerminalMacroInput', () => {
  it('optionally appends Enter', () => {
    expect(buildTerminalMacroInput('codex', true)).toBe('codex\r')
    expect(buildTerminalMacroInput('codex', false)).toBe('codex')
  })
})
