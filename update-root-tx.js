const yargs = require('yargs/yargs')
const debug = require('debug')
const { hideBin } = require('yargs/helpers')
const argv = yargs(hideBin(process.argv)).argv

const config = require('./config')
const {
  getAccountInfo,
  getChain,
  getBlock,
  getPublicKey,
  getValidateWork,
  generateWork,
  broadcastBlock
} = require('./common')

const logger = debug('script')
debug.enable('script')

if (!argv.a) {
  console.log('missing account: -a')
  process.exit()
}

const getSuccessorBlock = async (hash) => {
  const chain = await getChain(hash)
  return chain.blocks[1]
}

const isConfirmed = async (hash) => {
  const block = await getBlock(hash)
  return block.confirmed === 'true'
}

const getAccountInfoWithLowestConfirmationHeight = async (account) => {
  const requests = config.nodeAddresses.map((url) =>
    getAccountInfo(account, { url })
  )
  const responses = await Promise.allSettled(requests)
  const heights = responses.map((r) =>
    r.value && r.value.confirmation_height
      ? parseInt(r.value.confirmation_height, 10)
      : Infinity
  )
  const index = heights.indexOf(Math.min(...heights))
  return {
    node: config.nodeAddresses[index],
    accountInfo: responses[index].value
  }
}

const getUnconfirmedRootForAccount = async (account, { originalAccount }) => {
  const {
    accountInfo,
    node
  } = await getAccountInfoWithLowestConfirmationHeight(account)
  logger(`node ${node} has the lowest confirmation height`)
  logger(accountInfo)

  // check if original account frontier is confirmed on the node with the lowest confirmation height
  if (
    originalAccount &&
    accountInfo.frontier === accountInfo.confirmation_height_frontier
  ) {
    logger(`Account frontier ${accountInfo.frontier} is confirmed`)
    process.exit()
  }

  if (accountInfo.confirmation_height === '0') {
    return accountInfo.open_block
  }

  const hash = await getSuccessorBlock(accountInfo.confirmation_height_frontier)
  logger(`Unconfirmed root ${hash} for account ${account}`)

  return { hash, node }
}

const getUnconfirmedRoot = async (account, { originalAccount = true }) => {
  logger(`getting unconfirmed root for ${account}`)
  const { hash, node } = await getUnconfirmedRootForAccount(account, {
    originalAccount
  })

  const block = await getBlock(hash)
  logger(block)
  if (block.subtype === 'receive') {
    const confirmed = await isConfirmed(block.contents.link)
    if (!confirmed) {
      logger(
        `unconfirmed root ${hash} depends on an unconfirmed receive from ${block.source_account}`
      )
      return getUnconfirmedRoot(block.source_account, {
        originalAccount: false
      })
    }
  }

  return {
    hash,
    node
  }
}

const updateTxWork = async (hash, url) => {
  logger(`Updating block ${hash}`)

  const block = await getBlock(hash)
  logger(block)

  const workHash =
    block.height === '1'
      ? await getPublicKey(block.block_account)
      : block.contents.previous
  const validateWorkRes = await getValidateWork({
    hash: workHash,
    work: block.contents.work
  })
  logger(validateWorkRes)

  const { multiplier } = validateWorkRes
  const updatedMultiplier = parseFloat(multiplier) + 1
  if (updatedMultiplier > config.maxMultiplier) {
    logger(`block ${hash} multiplier ${multiplier}x is too high`)
    return
  }

  logger(`Updating block ${hash} with ${updatedMultiplier}x work`)

  const workRes = await generateWork({
    hash: workHash,
    difficulty: updatedMultiplier
  })
  logger(workRes)
  const { work } = workRes

  logger(`Broadcasting with higher work: ${work}`)

  const broadcastRes = await broadcastBlock(
    { ...block.contents, work },
    { url }
  )
  logger(broadcastRes)
}

const main = async () => {
  const { hash, node } = await getUnconfirmedRoot(argv.a, {
    originalAccount: true
  })
  await updateTxWork(hash, node)
}

try {
  main()
} catch (e) {
  console.log(e)
}
