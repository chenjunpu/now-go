const path = require('path')
const micro = require('micro')
const fetch = require('node-fetch')
const deepAssign = require('deep-assign')

module.exports = startWithConfig

// for tests
// exports.startWithConfig = startWithConfig
// exports.fetchLocalConfig = fetchLocalConfig
// exports.fetchRemoteConfig = fetchRemoteConfig
// exports.createRouter = createRouter

const DEFAULT_CONFIG = {
  'routes': { '?': 'What are you looking for' },
  'port': process.env.PORT || 3000
}
const PROXY_MODE_PREFIX = 'PROXY >> '
const ERROR_MSG_PREFIX = 'ERROR >> '

function startWithConfig (configLocation) {
  const gotConfig = isURL(configLocation)
    ? fetchRemoteConfig(configLocation)
    : fetchLocalConfig(configLocation)

  gotConfig.then(cfg => {
    const { routes, port } = cfg
    let go = createRouter(routes)

    // Start server
    micro((req, res) => {
      // Async Update (remote) routes config when access "/"
      if (req.url === '/' && isURL(configLocation)) {
        fetchRemoteConfig(configLocation).then(cfg => {
          go = createRouter(cfg.routes)
        })
      }

      return go(req, res)
    }).listen(port)
  }, err => console.error(err))
}

function fetchRemoteConfig (configURL) {
  return fetch(configURL).then(res => res.json())
  .then(cfg => {
    return deepAssign(DEFAULT_CONFIG, cfg)
  }, err => {
    console.error(err)
    return deepAssign(DEFAULT_CONFIG, {
      'routes': { '?': ERROR_MSG_PREFIX + err }
    })
  })
}

function fetchLocalConfig (configPath) {
  return new Promise((resolve, reject) => {
    try {
      const userConfig = require(path.resolve(configPath))
      resolve(deepAssign(DEFAULT_CONFIG, userConfig))
    } catch (e) {
      console.error(e)
      resolve(deepAssign(DEFAULT_CONFIG, {
        'routes': { '?': ERROR_MSG_PREFIX + e.message }
      }))
    }
    reject()
  })
}

function createRouter (routes) {
  return function (req, res) {
    const key = req.url.replace('/', '') || '/'
    const signpost = routes[key] || routes['?'] || 'Oops'

    if (isURL(signpost)) {
      // redirection
      res.writeHead(301, { 'Location': signpost })
    } else if (isPROXY(signpost)) {
      // proxy
      const url = signpost.replace(PROXY_MODE_PREFIX, '')
      return fetch(url).then(r => {
        res.setHeader('Content-Type', r.headers.get('Content-Type'))
        return r.body
      })
    } else {
      // echo
      const statusCode = routes[key] ? 200 : 404
      micro.send(res, statusCode, signpost)
    }
  }
}

function isURL (text) {
  return /^\w{2,6}:\/\/\w/.test(text)
}

function isPROXY (text) {
  const hasPrefix = text.indexOf(PROXY_MODE_PREFIX) === 0
  return hasPrefix && isURL(text.replace(PROXY_MODE_PREFIX, ''))
}
