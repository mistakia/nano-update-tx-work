const yargs = require('yargs/yargs')
const debug = require('debug')
const { hideBin } = require('yargs/helpers')
const argv = yargs(hideBin(process.argv)).argv

const config = require('./config')
const {
  getBlock,
  getPublicKey,
  getValidateWork,
  generateWork,
  broadcastBlock
} = require('./common')

const logger = debug('script')
debug.enable('script')

if (!argv.h) {
  console.log('missing block hash: -h')
  process.exit()
}

logger(`Updating block ${argv.h}`)

const main = async () => {
  const block = await getBlock(argv.h)
  logger(block)

  if (block.confirmed === 'true') {
    logger(`block ${argv.h} is already confirmed`)
    process.exit()
  }

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
    logger(`block ${argv.h} multiplier ${multiplier}x is too high`)
    return
  }

  logger(`Updating block ${argv.h} with ${updatedMultiplier}x work`)

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

try {
  main()
} catch (e) {
  console.log(e)
}
