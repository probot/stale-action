const path = require('path')
const runAction = require('..')
const { Toolkit } = require('actions-toolkit')

function mockToolkit (event, workspace = 'workspace') {
  // Load the JSON event
  process.env.GITHUB_EVENT_PATH = path.join(
    __dirname,
    'fixtures',
    `${event}.json`
  )

  // Load the workspace file
  process.env.GITHUB_WORKSPACE = path.join(
    __dirname,
    'fixtures',
    workspace
  )

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
    const tools = mockToolkit('repository-dispatch')
    tools.context.event = 'repository_dispatch'

    runAction(tools)

    await mockMarkAndSweep()

    expect(tools.log.success).toBeCalledWith('Done with mark and sweep!')
    expect(tools.log.success.mock.calls).toMatchSnapshot()
  })

  it('unmarks on new issue comments', async () => {
    const tools = mockToolkit('issue-comment')
    tools.context.event = 'issue_comment'

    await runAction(tools)

    expect(tools.log.success).toBeCalledWith('Unmarked a thing')
    expect(tools.log.success.mock.calls).toMatchSnapshot()
  })

  it('works with pull requests as well', async () => {
    const tools = mockToolkit('pull-request')
    tools.context.event = 'pull_request'

    await runAction(tools)

    expect(tools.log.success).toBeCalledWith('Unmarked a thing')
    expect(tools.log.success.mock.calls).toMatchSnapshot()
  })

  it('Handles issue payloads without labels', async done => {
    const tools = mockToolkit('no-issue-labels')
    tools.context.event = 'issue_comment'
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
    const tools = mockToolkit('no-issue-labels')
    tools.context.event = 'issue_comment'
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
    const tools = mockToolkit('bot-sender')
    tools.context.event = 'issue_comment'
    tools.exit.neutral = jest.fn()

    await runAction(tools)

    expect(tools.exit.neutral).toBeCalled()
    await done()
  })
})

module.exports = mockToolkit
