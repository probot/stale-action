/* eslint-disable camelcase */
const Stale = require('../../lib/stale')
const notFoundError = {
  code: 404,
  status: 'Not Found',
  headers: {}
}
const mockToolkit = require('../index.test')

describe('stale', () => {
  let tools

  beforeEach(() => {
    const issueAction = jest
      .fn()
      .mockImplementation(() => Promise.resolve(notFoundError))
    tools = mockToolkit('repository_dispatch', 'repository-dispatch')

    // Mock out the GitHub API
    tools.github = {
      issues: {
        removeLabel: issueAction,
        getLabel: jest
          .fn()
          .mockImplementation(() => Promise.reject(notFoundError)),
        createLabel: issueAction,
        addLabels: issueAction,
        createComment: issueAction,
        update: issueAction
      },
      search: {
        issuesAndPullRequests: issueAction
      },
      checks: {
        create: jest.fn().mockImplementation(() => Promise.resolve(notFoundError))
      }
    }

    process.env.GITHUB_REPOSITORY = 'octo-org/octo-repo'
  })

  it('should limit the number of actions it takes each run', async () => {
    const staleLabel = 'stale'
    const limitPerRun = 30

    const issueCount = 40
    const staleCount = 3

    const issues = []
    for (let i = 1; i <= issueCount; i++) {
      const labels = i <= staleCount ? [{ name: staleLabel }] : []
      return issues.push({ number: i, labels: labels })
    }

    const prs = []
    for (let i = 101; i <= 100 + issueCount; i++) {
      const labels = i <= 100 + staleCount ? [{ name: staleLabel }] : []
      return prs.push({ number: i, labels: labels })
    }

    tools.github.search.issuesAndPullRequests = ({ q, sort, order, per_page }) => {
      let items = []
      if (q.includes('is:pr')) {
        items = items.concat(prs.slice(0, per_page))
      } else if (q.includes('is:issue')) {
        items = items.concat(issues.slice(0, per_page))
      } else {
        throw new Error('query should specify PullRequests or Issues')
      }

      if (q.includes(`-label:"${staleLabel}"`)) {
        items = items.filter(
          item => !item.labels.map(label => label.name).includes(staleLabel)
        )
      } else if (q.includes(`label:"${staleLabel}"`)) {
        items = items.filter(item =>
          item.labels.map(label => label.name).includes(staleLabel)
        )
      }

      expect(items.length).toBeLessThanOrEqual(per_page)

      return Promise.resolve({
        data: { items }
      })
    }

    for (const type of ['pulls', 'issues']) {
      let comments = 0
      let closed = 0
      let labeledStale = 0
      tools.github.issues.createComment = jest.fn().mockImplementation(() => {
        comments++
        return Promise.resolve(notFoundError)
      })
      tools.github.issues.update = ({ owner, repo, number, state }) => {
        if (state === 'closed') {
          closed++
        }
      }
      tools.github.issues.addLabels = ({ owner, repo, number, labels }) => {
        if (labels.includes(staleLabel)) {
          labeledStale++
        }
      }

      const stale = new Stale(tools, {
        perform: true
      })

      stale.config.limitPerRun = limitPerRun
      stale.config.staleLabel = staleLabel
      stale.config.closeComment = 'closed'

      await stale.markAndSweep(type)

      expect(comments).toEqual(limitPerRun)
      expect(closed).toEqual(staleCount)
      expect(labeledStale).toEqual(limitPerRun - staleCount)
    }
  })

  it('should not close issues if daysUntilClose is configured as false', async () => {
    let stale = new Stale(tools, {
      perform: true
    })
    stale.config.daysUntilClose = false
    stale.getStale = jest
      .fn()
      .mockImplementation(() => Promise.resolve({ data: { items: [] } }))
    stale.getClosable = jest.fn()

    await stale.markAndSweep('issues')
    expect(stale.getClosable).not.toHaveBeenCalled()

    await stale.markAndSweep('pulls')
    expect(stale.getClosable).not.toHaveBeenCalled()
  })

  it('should not close issues if the keyword pulls or keyword issues is used, and daysUntilClose is configured as false', async () => {
    let stale = new Stale(tools, { perform: true })
    stale.config.pulls = { daysUntilClose: false }
    stale.config.issues = { daysUntilClose: false }
    stale.getStale = jest
      .fn()
      .mockImplementation(() => Promise.resolve({ data: { items: [] } }))
    stale.getClosable = jest.fn()

    await stale.markAndSweep('issues')
    expect(stale.getClosable).not.toHaveBeenCalled()

    await stale.markAndSweep('pulls')
    expect(stale.getClosable).not.toHaveBeenCalled()
  })

  it('should not close issues if only keyword is configured with the pulls value', async () => {
    let stale = new Stale(tools, {
      perform: true
    })
    stale.config.only = 'pulls'
    stale.config.daysUntilClose = 1
    stale.getStale = jest
      .fn()
      .mockImplementation(() => Promise.resolve({ data: { items: [] } }))
    stale.getClosable = jest.fn()

    await stale.markAndSweep('issues')
    expect(stale.getClosable).not.toHaveBeenCalled()
  })

  it('should not close pull requests if only keyword is configured with the issues value', async () => {
    let stale = new Stale(tools, {
      perform: true
    })
    stale.config.only = 'issues'
    stale.config.daysUntilClose = 1
    stale.getStale = jest
      .fn()
      .mockImplementation(() => Promise.resolve({ data: { items: [] } }))
    stale.getClosable = jest.fn()

    await stale.markAndSweep('pulls')
    expect(stale.getClosable).not.toHaveBeenCalled()
  })

  it('reports lines that are invalid', async () => {
    const createErrorAnnotation = jest
      .fn()
      .mockImplementation(() => Promise.resolve())
    tools = mockToolkit(
      'repository_dispatch',
      'repository-dispatch',
      'workspace-bad-yaml'
    )
    tools.github = {
      checks: {
        create: jest
          .fn()
          .mockImplementation(() => Promise.resolve(notFoundError))
      }
    }

    tools.log.fatal = jest.fn()
    tools.exit.failure = jest.fn()
    const config = tools.config('.github/stale.yml')
    const stale = new Stale(tools, config)
    expect(stale).toBeDefined()
    await createErrorAnnotation()
    expect(tools.log.fatal).toBeCalledWith('Sent annotation for invalid config!')
  })
})
