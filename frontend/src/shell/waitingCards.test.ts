import { describe, expect, it } from 'vitest'
import { capCards, cardSentence } from './waitingCards'

const words = { singular: 'bill', plural: 'bills', actions: ['post'] }

describe('the words on a Waiting-for-you card', () => {
  it('says one in the singular and the rest in the plural', () => {
    expect(cardSentence({ ...words, count: 1 })).toBe('1 bill to post')
    expect(cardSentence({ ...words, count: 6, singular: 'disbursement', plural: 'disbursements', actions: ['approve'] })).toBe('6 disbursements to approve')
    expect(cardSentence({ ...words, count: 2, actions: ['post'] })).toBe('2 bills to post')
  })

  it('names every action the person can take', () => {
    expect(cardSentence({ count: 3, singular: 'job', plural: 'jobs', actions: ['gate out', 'close'] })).toBe('3 jobs to gate out or close')
  })

  it('groups thousands the way the organisation counts', () => {
    expect(cardSentence({ ...words, count: 1234 })).toBe('1,234 bills to post')
  })
})

describe('how many cards show', () => {
  const cards = Array.from({ length: 7 }, (_, i) => i)
  it('shows four and says how many more', () => {
    expect(capCards(cards)).toEqual({ shown: [0, 1, 2, 3], more: 3 })
  })
  it('lists three actions with commas and one "or"', () => {
    expect(cardSentence({ count: 23, singular: 'recovery case', plural: 'recovery cases', actions: ['send the second notice', 'agree an instalment plan', 'mark settled'] })).toBe(
      '23 recovery cases to send the second notice, agree an instalment plan or mark settled',
    )
  })

  it('shows all when there are four or fewer, and says nothing more', () => {
    expect(capCards([1, 2, 3, 4])).toEqual({ shown: [1, 2, 3, 4], more: 0 })
    expect(capCards([])).toEqual({ shown: [], more: 0 })
  })
})
