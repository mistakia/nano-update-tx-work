const yargs = require('yargs/yargs')
const debug = require('debug')
const { hideBin } = require('yargs/helpers')
const argv = yargs(hideBin(process.argv)).argv
const { default: fetch, Request } = require('node-fetch')

const config = require('./config')
const logger = debug('script')
debug.enable('script')

if (!argv.a) {
  console.log('missing account: -a')
  process.exit()
}

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

const generateWork = async ({ hash, difficulty }) => {
  const data = {
    action: 'work_generate',
    hash,
    multiplier: parseFloat(difficulty).toFixed(1)
  }
  const options = workRequest(data)
  return request(options)
}

const getBlock = async (hash) => {
  const data = {
    action: 'blocks_info',
    json_block: true,
    source: true,
    hashes: [hash]
  }
  const options = rpcRequest(data)
  const res = await request(options)
  return res.blocks[hash]
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

const getAccountInfo = async (account) => {
  const data = {
    action: 'account_info',
    account
  }
  const options = rpcRequest(data)
  return request(options)
}

const getChain = async (block) => {
  const data = {
    action: 'chain',
    count: 2,
    reverse: true,
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

const getUnconfirmedRootForAccount = async (account) => {
  const accountInfo = await getAccountInfo(account)
  // logger(accountInfo)

  const chain = await getChain(accountInfo.confirmation_height_frontier)
  // logger(chain)

  const unconfirmedRoot = chain.blocks[1]
  logger(`Unconfirmed root ${unconfirmedRoot} for account ${account}`)

  return unconfirmedRoot
}

const isConfirmed = async (hash) => {
  const block = await getBlock(hash)
  return block.confirmed === 'true'
}

const getUnconfirmedRoot = async (account) => {
  logger(`getting unconfirmed root for ${account}`)
  const unconfirmedRootForAccount = await getUnconfirmedRootForAccount(account)

  const block = await getBlock(unconfirmedRootForAccount)
  logger(block)
  if (block.subtype === 'receive') {
    const confirmed = await isConfirmed(block.contents.link)
    if (!confirmed) {
      logger(`unconfirmed root ${unconfirmedRootForAccount} depends on an unconfirmed receive from ${block.source_account}`)
      return getUnconfirmedRoot(block.source_account)
    }
  }

  return unconfirmedRootForAccount
}

const updateTxWork = async (hash) => {
  const block = await getBlock(hash)
  const { previous } = block.contents

  const validateWorkRes = await getValidateWork({ hash: previous, work: block.contents.work })
  logger(validateWorkRes)
  const { multiplier } = validateWorkRes
  const updatedMultiplier = parseFloat(multiplier) + 10
  logger(`Updating block ${hash} with ${updatedMultiplier}x work`)

  const workRes = await generateWork({ hash: previous, difficulty: updatedMultiplier })
  logger(workRes)
  const { work } = workRes

  logger(`Broadcasting with higher work: ${work}`)

  const broadcastRes = await broadcastBlock({ ...block.contents, work })
  logger(broadcastRes)
}

const main = async () => {
  const accountInfo = await getAccountInfo(argv.a)

  if (accountInfo.frontier === accountInfo.confirmation_height_frontier) {
    logger(`Account frontier ${accountInfo.frontier} is confirmed`)
    return
  }

  const unconfirmedRoot = await getUnconfirmedRoot(argv.a)
  await updateTxWork(unconfirmedRoot)
}

try {
  main()
} catch (e) {
  console.log(e)
}
