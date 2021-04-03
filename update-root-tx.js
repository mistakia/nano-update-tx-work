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

const getUnconfirmedRootForAccount = async (account) => {
  const accountInfo = await getAccountInfo(account)
  // logger(accountInfo)

  if (accountInfo.confirmation_height === '0') {
    return accountInfo.open_block
  }

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
      logger(
        `unconfirmed root ${unconfirmedRootForAccount} depends on an unconfirmed receive from ${block.source_account}`
      )
      return getUnconfirmedRoot(block.source_account)
    }
  }

  return unconfirmedRootForAccount
}

const updateTxWork = async (hash) => {
  logger(`Updating block ${hash}`)

  const block = await getBlock(hash)
  logger(block)

  const { previous } = block.contents
  const workHash =
    block.height === '1' ? await getPublicKey(block.block_account) : previous
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
