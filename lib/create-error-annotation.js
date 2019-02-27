module.exports = (tools, error) => {
  return tools.github.checks.create(
    tools.context.repo({
      name: 'Stale YAML validation',
      head_sha: tools.context.sha,
      output: {
        title: 'Stale config validation',
        summary: 'Stale config is invalid',
        status: 'completed',
        conclusion: 'failure',
        completed_at: Date.now(),
        annotations: [
          {
            // TODO: How do I get these values dynamically from the Joi validation?
            path: '.github/stale.yml',
            start_line: 1,
            end_line: 1,
            annotation_level: 'failure',
            message: '"daysUntilStale" must be a number'
          }
        ]
      }
    })
  )
}
