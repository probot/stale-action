const schema = require('./schema')
const maxActionsPerRun = 30

module.exports = class Stale {
  constructor (tools, config) {
    this.remainingActions = 0
    this.tools = tools
    // Aliases
    this.github = tools.github 
    this.log = tools.log
    const { error, value } = schema.validate(config)
    
    this.config = value
    
    if (error) {
      // Config is invalid. Report this to the user
      this.log.fatal(new Error(error), 'Invalid config')
      tools.github.checks.create(tools.context.repo({
        name: 'Stale YAML validation',
        head_sha: tools.context.sha,
        output: {
          title: 'Stale config validation',
          summary: 'Stale config is invalid',
          annotations: [{
            path: '.github/stale.yml',
            start_line: 1,
            end_line: 1,
            annotation_level: 'failure',
            message: '"daysUntilStale" must be a number'
          }]
        }
      })).then(() => {
        tools.exit.failure('Sent annotation for invalid config!')
      }).catch(err => {
        tools.log.fatal(new Error(err))
        tools.exit.failure('Invalid config. Failed to add annotation', {err})
      })
    }
  }

  async markAndSweep (type) {
    const { only } = this.config
    if (only && only !== type) {
      return
    }
    if (!this.getConfigValue(type, 'perform')) {
      return
    }

    this.log.pending(this.config, `starting mark and sweep of ${type}`)

    const limitPerRun = this.getConfigValue(type, 'limitPerRun') || maxActionsPerRun
    this.remainingActions = Math.min(limitPerRun, maxActionsPerRun)

    await this.ensureStaleLabelExists(type)

    const staleItems = (await this.getStale(type)).data.items

    await Promise.all(staleItems.filter(issue => !issue.locked).map(issue => {
      return this.mark(type, issue)
    }))

    const daysUntilClose = this.getConfigValue(type, 'daysUntilClose')

    if (daysUntilClose) {
      this.log.info('Configured to close stale issues')
      const closableItems = (await this.getClosable(type)).data.items

      await Promise.all(closableItems.filter(issue => !issue.locked).map(issue => {
        this.close(type, issue)
      }))
    } else {
      this.log.info('Configured to leave stale issues open')
    }
  }

  getStale (type) {
    const staleLabel = this.getConfigValue(type, 'staleLabel')
    const exemptLabels = this.getConfigValue(type, 'exemptLabels')
    const exemptProjects = this.getConfigValue(type, 'exemptProjects')
    const exemptMilestones = this.getConfigValue(type, 'exemptMilestones')
    const exemptAssignees = this.getConfigValue(type, 'exemptAssignees')
    const labels = [staleLabel].concat(exemptLabels)
    const queryParts = labels.map(label => `-label:"${label}"`)
    queryParts.push(Stale.getQueryTypeRestriction(type))

    queryParts.push(exemptProjects ? 'no:project' : '')
    queryParts.push(exemptMilestones ? 'no:milestone' : '')
    queryParts.push(exemptAssignees ? 'no:assignee' : '')

    const query = queryParts.join(' ')
    const days = this.getConfigValue(type, 'days') || this.getConfigValue(type, 'daysUntilStale')
    return this.search(days, query)
  }

  getClosable (type) {
    const staleLabel = this.getConfigValue(type, 'staleLabel')
    const queryTypeRestriction = Stale.getQueryTypeRestriction(type)
    const query = `label:"${staleLabel}" ${queryTypeRestriction}`
    const days = this.getConfigValue(type, 'days') || this.getConfigValue(type, 'daysUntilClose')
    return this.search(days, query)
  }

  static getQueryTypeRestriction (type) {
    if (type === 'pulls') {
      return 'is:pr'
    } else if (type === 'issues') {
      return 'is:issue'
    }
    this.log.fatal(`Unknown type: ${type}. Valid types are 'pulls' and 'issues'`)
  }

  search (days, query) {
    this.log.info('Days:' + days)
    const { owner, repo } = this.tools.context.repo()
    const timestamp = this.since(days).toISOString().replace(/\.\d{3}\w$/, '')

    query = `repo:${owner}/${repo} is:open updated:<${timestamp} ${query}`

    const params = { q: query, sort: 'updated', order: 'desc', per_page: maxActionsPerRun }

    this.log.info(params, 'searching %s/%s for stale issues', owner, repo)
    return this.github.search.issuesAndPullRequests(params)
  }

  async mark (type, issue) {
    if (this.remainingActions === 0) {
      return
    }
    this.remainingActions--

    const { owner, repo } = this.tools.context.repo()
    const perform = this.getConfigValue(type, 'perform')
    const staleLabel = this.getConfigValue(type, 'staleLabel')
    const markComment = this.getConfigValue(type, 'markComment')
    const number = issue.number

    if (perform) {
      this.log.info('%s/%s#%d is being marked', owner, repo, number)
      if (markComment) {
        await this.github.issues.createComment({ owner, repo, number, body: markComment })
      }
      return this.github.issues.addLabels({ owner, repo, number, labels: [staleLabel] })
    } else {
      this.log.info('%s/%s#%d would have been marked (dry-run)', owner, repo, number)
    }
  }

  async close (type, issue) {
    if (this.remainingActions === 0) {
      return
    }
    this.remainingActions--

    const { owner, repo } = this.tools.context.repo()
    const perform = this.getConfigValue(type, 'perform')
    const closeComment = this.getConfigValue(type, 'closeComment')
    const number = issue.number

    if (perform) {
      this.log.info('%s/%s#%d is being closed', owner, repo, number)
      if (closeComment) {
        await this.github.issues.createComment({ owner, repo, number, body: closeComment })
      }
      return this.github.issues.update({ owner, repo, number, state: 'closed' })
    } else {
      this.log.info('%s/%s#%d would have been closed (dry-run)', owner, repo, number)
    }
  }

  async unmark (type, issue) {
    const { owner, repo } = this.tools.context.repo()
    const perform = this.getConfigValue(type, 'perform')
    const staleLabel = this.getConfigValue(type, 'staleLabel')
    const unmarkComment = this.getConfigValue(type, 'unmarkComment')
    const number = issue.number

    if (perform) {
      this.log.info({ prefix: '[Stale]', message: `${owner}/${repo}#${number} is being unmarked`, suffix: '(unmark)' })

      if (unmarkComment) {
        await this.github.issues.createComment({ owner, repo, number, body: unmarkComment })
      }

      return this.github.issues.removeLabel({ owner, repo, number, name: staleLabel }).catch((err) => {
        // ignore if it's a 404 because then the label was already removed
        if (err.code !== 404) {
          this.log.fatal(err)
        }
      })
    } else {
      this.log.complete({ prefix: '[Stale]', message: `${owner}/${repo}#${number} would have been unmarked.`, suffix: '(dry-run)' })
    }
  }

  // Returns true if at least one exempt label is present.
  hasExemptLabel (type, issue) {
    const exemptLabels = this.getConfigValue(type, 'exemptLabels')
    return issue.labels.some(label => exemptLabels.includes(label.name))
  }

  hasStaleLabel (type, issue) {
    const staleLabel = this.getConfigValue(type, 'staleLabel')
    return issue.labels.map(label => label.name).includes(staleLabel)
  }

  // returns a type-specific config value if it exists, otherwise returns the top-level value.
  getConfigValue (type, key) {
    if (this.config[type] && typeof this.config[type][key] !== 'undefined') {
      return this.config[type][key]
    }
    return this.config[key]
  }

  async ensureStaleLabelExists (type) {
    const { owner, repo } = this.tools.context.repo()
    const staleLabel = this.getConfigValue(type, 'staleLabel')

    return this.tools.github.issues.getLabel({ owner, repo, name: staleLabel }).catch(() => {
      return this.tools.github.issues.createLabel({ owner, repo, name: staleLabel, color: 'ffffff' })
    })
  }

  since (days) {
    const ttl = days * 24 * 60 * 60 * 1000
    let date = new Date(new Date() - ttl)

    // GitHub won't allow it
    if (date < new Date(0)) {
      date = new Date(0)
    }
    return date
  }
}