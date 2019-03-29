const { Toolkit } = require('actions-toolkit')
const Stale = require('./lib/stale')

/**
 * @param {import('actions-toolkit').Toolkit} tools
 */
module.exports = async tools => {
  if (!tools) {
    tools = new Toolkit({
      event: [
        'issue_comment',
        'issues',
        'pull_request',
        'pull_request_review',
        'pull_request_review_comment',
        'repository_dispatch'
      ]
    })
  }

  tools.log.star(`Received ${tools.context.event}!`)
  tools.log.start('Stale action is booting up!')
  tools.log.pending('Retrieving Stale config from `.github/stale.yml`...')
  const config = buildConfig(tools)

  if (tools.context.event === 'repository_dispatch') {
    const stale = new Stale(tools, config)
    const type = tools.arguments._[0] ||
    (tools.context.payload.issue ? 'issues' : 'pulls')
    stale.markAndSweep(type).then(() => {
      tools.log.success('Done with mark and sweep!')
    })
  } else {
    return unmark(tools).then(() => {
      tools.exit.success()
    }).catch(err => {
      tools.exit.failure(err)
    })
  }

  async function unmark (tools) {
    const stale = new Stale(tools, config)
    if (isBot(tools.context)) {
      tools.log.info('Sender is a Bot. Doing nothing')
      return tools.exit.neutral()
    }

    let issue =
      tools.context.payload.issue || tools.context.payload.pull_request
    const type = tools.context.payload.issue ? 'issues' : 'pulls'

    // Some payloads don't include labels
    if (!issue.labels) {
      try {
        issue = (await tools.github.issues.get(tools.context.issue())).data
      } catch (error) {
        return tools.exit.failure('Issue not found')
      }
    }
    const staleLabelAdded =
      tools.context.payload.action === 'labeled' &&
      tools.context.payload.label.name === stale.config.staleLabel
    if (
      stale.hasStaleLabel(type, issue) &&
      issue.state !== 'closed' &&
      !staleLabelAdded
    ) {
      return stale.unmark(type, issue)
    }
  }
}

function buildConfig (tools) {
  const config = tools.config('.github/stale.yml')

  if (tools.arguments.daysUntilClose) {
    config.daysUntilClose = tools.arguments.daysUntilClose
  }

  if (tools.arguments.daysUntilStale) {
    config.daysUntilStale = tools.arguments.daysUntilStale
  }

  return config
}

function isBot (context) {
  return context.payload.sender.type === 'Bot'
}

module.exports.buildConfig = buildConfig
