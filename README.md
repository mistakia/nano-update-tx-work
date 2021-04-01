# Nano Update Tx PoW

> Will help restart elections on expired blocks that are unconfirmed

## Installation

```js
yarn install // or npm install
```

Copy the config file and add the address to a [Nano Work Server](https://github.com/nanocurrency/nano-work-server) and an RPC address (it can be an [NanoRPCProxy](https://github.com/joohansson/nanorpcproxy) or a node)

```
cp config.sample.js config.js
```

## Usage

To rebroadcast a specific block with a higher PoW

```
node update-tx.js -h [block hash]
```

To find the root unconfirmed tx and rebroadcast with a higher PoW.

> Note: it can be a tx on a different account if the root unconfirmed on the specified account is a receive that doesn't have the send confirmed.

```
node update-root-tx.js -a [nano account address]
```
