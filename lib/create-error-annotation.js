const lineColumn = require('line-column')
const fs = require('fs')
const path = require('path')

/**
 * @param {import('actions-toolkit').Toolkit} tools
 */
module.exports = async (tools, error) => {
  // Config came from yaml, so we need to parse it again to figure out where the lines are
  const configFile = path.join(tools.workspace, '.github/stale.yml')
  const buffer = Buffer.from(fs.readFileSync(configFile, 'utf-8'))

  // Get a start and end line from the details array
  // This doesn't seem to be returning all errors at the moment
  // So we'll just index `details[0]` and report on the first error
  const index = buffer.indexOf(error.details[0].context.value)
  const line = lineColumn(buffer.toString(), index).line
  return tools.github.checks.create(
    tools.context.repo({
      name: 'Stale YAML validation',
      head_sha: tools.context.sha,
      conclusion: 'failure',
      completed_at: Date.now(),
      output: {
        title: 'Stale config validation',
        summary: error.message,
        annotations: [
          {
            path: '.github/stale.yml',
            start_line: line,
            end_line: line,
            annotation_level: 'failure',
            message: error.stack,
            raw_details: error
          }
        ]
      }
    })
  )
}
