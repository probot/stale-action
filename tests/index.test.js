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
  tools.exit.success = jest.fn()
  return tools
}

describe('handle-stale-action', () => {
  beforeEach(() => {
    Object.assign(process.env, {
      GITHUB_EVENT: 'repository_dispatch',
      GITHUB_WORKSPACE: path.join(__dirname, 'fixtures', 'workspace')
    })
  })

  it('exits success on a successful run', () => {
    const tools = mockToolkit('repository-dispatch')
    runAction(tools)
    expect(tools.exit.success).toHaveBeenCalled()
    expect(tools.exit.success.mock.calls).toMatchSnapshot()
  })
})