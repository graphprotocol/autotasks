// Import dependencies available in the autotask environment
import { RelayerParams } from 'defender-relay-client/lib/relayer'
import { DefenderRelayProvider, DefenderRelaySigner } from 'defender-relay-client/lib/ethers'
import { ethers } from 'ethers'

import { L1TransactionReceipt, L1ToL2MessageStatus } from '@arbitrum/sdk'

// Hacks to get around some ethers version mismatches between @arbitrum/sdk and defender-relay-client
import { TransactionReceipt } from '@arbitrum/sdk/node_modules/@ethersproject/abstract-provider'
import { Signer } from '@arbitrum/sdk/node_modules/@ethersproject/abstract-signer'

type EventWithParameters = {
  secrets: {
    redeemReservoirDripL1ProviderUrl: string
  }
  signer?: ethers.providers.JsonRpcSigner | null
  request: {
    body: {
      transaction: {
        transactionHash: string
      }
    }
  }
}

type RelayerOrSigner = ethers.providers.JsonRpcSigner | DefenderRelaySigner
type AutotaskEvent = RelayerParams | EventWithParameters

const logAutoRedeemReason = (autoRedeemRec: TransactionReceipt) => {
  if (autoRedeemRec == null) {
    console.log(`Auto redeem was not attempted.`)
    return
  }
  console.log(`Auto redeem reverted.`)
}

// Entrypoint for the Autotask
export async function handler(event: AutotaskEvent) {
  const credentials: RelayerParams = event as unknown as RelayerParams
  let signer: RelayerOrSigner
  const params = event as EventWithParameters

  if (params.signer) {
    signer = params.signer as ethers.providers.JsonRpcSigner
  } else {
    const provider = new DefenderRelayProvider(credentials)
    signer = new DefenderRelaySigner(credentials, provider, { speed: 'fast' })
  }

  const payload = params.request.body

  const l1Provider: ethers.providers.JsonRpcProvider = new ethers.providers.JsonRpcProvider(
    params.secrets.redeemReservoirDripL1ProviderUrl,
  )

  const receipt = await l1Provider.waitForTransaction(payload.transaction.transactionHash)
  const l1Receipt = new L1TransactionReceipt(receipt as unknown as TransactionReceipt)
  const l1ToL2Message = (await l1Receipt.getL1ToL2Messages(signer as unknown as Signer))[0]

  console.log(
    `Waiting for status of ${l1ToL2Message.retryableCreationId} created in ${payload.transaction.transactionHash}`,
  )
  const res = await l1ToL2Message.waitForStatus()
  console.log('Getting auto redeem attempt')
  const autoRedeemRec = await l1ToL2Message.getAutoRedeemAttempt()
  const l2TxReceipt = res.status === L1ToL2MessageStatus.REDEEMED ? res.l2TxReceipt : autoRedeemRec
  let l2TxHash = l2TxReceipt ? l2TxReceipt.transactionHash : 'null'
  if (res.status === L1ToL2MessageStatus.FUNDS_DEPOSITED_ON_L2) {
    /** Message wasn't auto-redeemed! */
    console.log('Funds were deposited on L2 but the retryable ticket was not redeemed')
    logAutoRedeemReason(autoRedeemRec)
    console.log('Attempting to redeem...')
    await l1ToL2Message.redeem()
    const redeemAttempt = await l1ToL2Message.getSuccessfulRedeem()
    if (redeemAttempt.status == L1ToL2MessageStatus.REDEEMED) {
      l2TxHash = redeemAttempt.l2TxReceipt ? redeemAttempt.l2TxReceipt.transactionHash : 'null'
    } else {
      throw new Error(`Unexpected L1ToL2MessageStatus after redeem attempt: ${res.status}`)
    }
  } else if (res.status != L1ToL2MessageStatus.REDEEMED) {
    throw new Error(`Unexpected L1ToL2MessageStatus ${res.status}`)
  }
  console.log(`Redeem successful: ${l2TxHash}`)
}

// Sample typescript type definitions
type EnvInfo = {
  API_KEY: string
  API_SECRET: string
  L1_PROVIDER_URL: string
  TX_HASH: string
  CHAINID?: string
  SIGNER_NUM?: string
}

// To run locally (this code will not be executed in Autotasks)
if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('dotenv').config()
  const {
    API_KEY: apiKey,
    API_SECRET: apiSecret,
    L1_PROVIDER_URL: redeemReservoirDripL1ProviderUrl,
    TX_HASH: txHash,
    CHAINID: envChainId,
    SIGNER_NUM: signerNumStr,
  } = process.env as EnvInfo
  let signer: ethers.providers.JsonRpcSigner | null
  const chainId = envChainId || '1337'
  if (chainId == '1337') {
    let signerNum = 0
    if (signerNumStr) {
      signerNum = Number(signerNumStr)
    }
    signer = new ethers.providers.JsonRpcProvider('http://localhost:8545').getSigner(signerNum)
  }
  handler({
    apiKey,
    apiSecret,
    secrets: { redeemReservoirDripL1ProviderUrl },
    signer,
    request: { body: { transaction: { transactionHash: txHash } } },
  })
    .then(() => process.exit(0))
    .catch((error: Error) => {
      console.error(error)
      process.exit(1)
    })
}
