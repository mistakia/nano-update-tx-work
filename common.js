const { default: fetch, Request } = require('node-fetch')

const config = require('./config')

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

const getAccountKey = async (account) => {
  const data = {
    action: 'account_key',
    account
  }
  const options = rpcRequest(data)
  return request(options)
}

const getPublicKey = async (account) => {
  const accountRes = await getAccountKey(account)
  return accountRes.key
}

module.exports = {
  getAccountInfo,
  getChain,
  getBlock,
  getPublicKey,
  getValidateWork,
  generateWork,
  broadcastBlock
}
