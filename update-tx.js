const yargs = require('yargs/yargs')
const debug = require('debug')
const { hideBin } = require('yargs/helpers')
const argv = yargs(hideBin(process.argv)).argv
const { default: fetch, Request } = require('node-fetch')

const config = require('./config')
const logger = debug('script')
debug.enable('script')

if (!argv.h) {
  console.log('missing block hash: -h')
  process.exit()
}

logger(`Updating block ${argv.h}`)

const request = async (options) => {
  const request = new Request(options.url, options)
  const response = await fetch(request)
  if (response.status >= 200 && response.status < 300) {
    return response.json()
  } else {
    const res = await response.json()
    const error = new Error(res.error || response.statusText)
    error.response = response
    throw error
  }
}

const POST = (data) => ({
  method: 'POST',
  body: JSON.stringify(data),
  headers: {
    'Content-Type': 'application/json'
  }
})

const rpcRequest = (data) => {
  return { url: config.nodeAddress, ...POST(data) }
}

const workRequest = (data) => {
  return { url: config.workAddress, ...POST(data) }
}

const getWorkGenerate = async ({ hash, difficulty }) => {
  const data = {
    action: 'work_generate',
    hash,
    multiplier: parseFloat(difficulty).toFixed(1)
  }
  const options = workRequest(data)
  return request(options)
}

const generateWork = async ({ hash, difficulty }) => {
  let result
  do {
    result = await getWorkGenerate({ hash, difficulty })
  } while (
    parseFloat(result.multiplier) / difficulty > 1.15 &&
    parseFloat(result.multiplier) - difficulty > 5
  )

  return result
}

const getBlock = async (hash) => {
  const data = {
    action: 'block_info',
    json_block: true,
    hash
  }
  const options = rpcRequest(data)
  return request(options)
}

const broadcastBlock = async (block) => {
  const data = {
    action: 'process',
    json_block: true,
    block
  }
  const options = rpcRequest(data)
  return request(options)
}

const getValidateWork = async ({ hash, work }) => {
  const data = {
    action: 'work_validate',
    work,
    hash
  }

  const options = rpcRequest(data)
  return request(options)
}

const main = async () => {
  const block = await getBlock(argv.h)
  logger(block)

  if (block.confirmed === 'true') {
    logger(`block ${argv.h} is already confirmed`)
    process.exit()
  }

  const { previous } = block.contents
  const validateWorkRes = await getValidateWork({
    hash: previous,
    work: block.contents.work
  })
  logger(validateWorkRes)

  const { multiplier } = validateWorkRes
  const updatedMultiplier = parseFloat(multiplier) + 1
  if (updatedMultiplier > config.maxMultiplier) {
    logger(`block ${argv.h} multiplier ${multiplier}x is too high`)
    return
  }

  logger(`Updating block ${argv.h} with ${updatedMultiplier}x work`)

  const workRes = await generateWork({
    hash: previous,
    difficulty: updatedMultiplier
  })
  logger(workRes)
  const { work } = workRes

  logger(`Broadcasting with higher work: ${work}`)

  const broadcastRes = await broadcastBlock({ ...block.contents, work })
  logger(broadcastRes)
}

try {
  main()
} catch (e) {
  console.log(e)
}
