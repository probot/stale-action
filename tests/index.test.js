const path = require('path')
const runAction = require('..')
const { Toolkit } = require('actions-toolkit')
process.exit = jest.fn()

function mockToolkit (event, fixture, workspace = 'workspace') {
  // Load the JSON event
  process.env.GITHUB_EVENT_PATH = path.join(
    __dirname,
    'fixtures',
    `${fixture}.json`
  )

  // Load the workspace file
  process.env.GITHUB_WORKSPACE = path.join(
    __dirname,
    'fixtures',
    workspace
  )

  process.env.GITHUB_EVENT_NAME = event

  Toolkit.prototype.warnForMissingEnvVars = jest.fn()

  const tools = new Toolkit()
  tools.github = {
    issues: {
      createComment: jest.fn().mockResolvedValue(),
      removeLabel: jest.fn().mockResolvedValue()
    }
  }
  tools.log.success = jest.fn()
  tools.log.complete = jest.fn()
  return tools
}

describe('handle-stale-action', () => {
  beforeEach(() => {
    Object.assign(process.env, {
      GITHUB_WORKSPACE: path.join(__dirname, 'fixtures', 'workspace')
    })
  })

  it('exits success on a successful run', async () => {
    const mockMarkAndSweep = require('../lib/stale').prototype.markAndSweep = jest.fn().mockResolvedValue(true)
    const tools = mockToolkit('repository_dispatch', 'repository-dispatch')

    runAction(tools)

    await mockMarkAndSweep()

    expect(tools.log.success).toBeCalledWith('Done with mark and sweep!')
    expect(tools.log.success.mock.calls).toMatchSnapshot()
  })

  it('unmarks on new issue comments', async () => {
    const tools = mockToolkit('issue_comment', 'issue-comment')

    await runAction(tools)

    expect(tools.log.complete).toBeCalled()
    expect(tools.log.complete.mock.calls).toMatchSnapshot()
  })

  it('works with pull requests as well', async () => {
    const tools = mockToolkit('pull_request', 'pull-request')

    await runAction(tools)

    expect(tools.log.complete).toBeCalled()
    expect(tools.log.complete.mock.calls).toMatchSnapshot()
  })

  it('Handles issue payloads without labels', async done => {
    const tools = mockToolkit('issue_comment', 'no-issue-labels')
    tools.github = {
      issues: {
        get: jest.fn().mockResolvedValue({
          data: {
            labels: [{ name: 'label name' }]
          }
        })
      }
    }
    await runAction(tools)
    expect(tools.github.issues.get).toBeTruthy()
    await done()
  })

  it('Exits if unable to find issues with labels', async done => {
    const tools = mockToolkit('issue_comment', 'no-issue-labels')
    tools.github = {
      issues: {
        get: jest.fn().mockRejectedValue({
          message: 'Not found'
        })
      }
    }
    tools.exit.failure = jest.fn()
    await runAction(tools)
    expect(tools.exit.failure).toBeCalledWith('Issue not found')
    await done()
  })

  it('Exits early if sender is a bot', async done => {
    const tools = mockToolkit('issue_comment', 'bot-sender')
    tools.exit.neutral = jest.fn()

    await runAction(tools)

    expect(tools.exit.neutral).toBeCalled()
    await done()
  })
})

module.exports = mockToolkit
