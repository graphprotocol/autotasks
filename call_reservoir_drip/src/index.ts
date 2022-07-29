// Import dependencies available in the autotask environment
import { RelayerParams } from 'defender-relay-client/lib/relayer'
import { DefenderRelayProvider, DefenderRelaySigner } from 'defender-relay-client/lib/ethers'
import { ethers } from 'ethers'

// Import an ABI which will be embedded into the generated js
import L1ReservoirAbi from '@graphprotocol/contracts/dist/abis/L1Reservoir.json'
import { L1Reservoir } from '@graphprotocol/contracts/dist/types/L1Reservoir'
import GraphTokenAbi from '@graphprotocol/contracts/dist/abis/GraphToken.json'
import { GraphToken } from '@graphprotocol/contracts/dist/types/GraphToken'
import addressBook from '@graphprotocol/contracts/addresses.json'

type EventWithParameters= {
  secrets: any
  signer?: ethers.providers.JsonRpcSigner | null
}

type AutotaskEvent = RelayerParams | EventWithParameters

// Entrypoint for the Autotask
export async function handler(event: AutotaskEvent) {
  const credentials: RelayerParams = event as unknown as RelayerParams
  let signer: DefenderRelaySigner | ethers.providers.JsonRpcSigner
  let params = event as EventWithParameters

  if (params.signer) {
    signer = params.signer as ethers.providers.JsonRpcSigner
  } else {
    const provider = new DefenderRelayProvider(credentials)
    signer = new DefenderRelaySigner(credentials, provider, { speed: 'fast' })
  }
  
  const providerAddress = await signer.getAddress()
  const chainId = params.secrets['call_reservoir_drip_chainid']

  const grtAddress: string = (addressBook as any)[chainId]['GraphToken'].address
  const grt = new ethers.Contract(grtAddress, GraphTokenAbi, signer) as unknown as GraphToken
  const totalSupply = await grt.totalSupply()

  console.log(`GRT total supply before drip is ${totalSupply}`)

  // Address of the reservoir contract
  const l1ReservoirAddress: string = (addressBook as any)[chainId]['L1Reservoir'].address
  const l1Reservoir = new ethers.Contract(l1ReservoirAddress, L1ReservoirAbi, signer) as unknown as L1Reservoir
  const issuanceRate = await l1Reservoir.issuanceRate()
  console.log(`L1Reservoir issuanceRate is ${issuanceRate}. Dripping...`)

  const tx = await l1Reservoir['drip(uint256,uint256,uint256,address)'](0, 0, 0, providerAddress)
  const receipt = await tx.wait()
  console.log(`dripped, tx: ${receipt.transactionHash}`)

}

// Sample typescript type definitions
type EnvInfo = {
  API_KEY: string
  API_SECRET: string
  CHAINID?: string
  SIGNER_NUM?: string
}

// To run locally (this code will not be executed in Autotasks)
if (require.main === module) {
  require('dotenv').config()
  const { API_KEY: apiKey, API_SECRET: apiSecret, CHAINID: chainId, SIGNER_NUM: signerNumStr } = process.env as EnvInfo
  let signer: ethers.providers.JsonRpcSigner | null
  if(chainId == '1337') {
    let signerNum: number = 0
    if (signerNumStr) {
      signerNum = Number(signerNumStr)
    }
    signer = new ethers.providers.JsonRpcProvider('http://localhost:8545').getSigner(signerNum)
  }
  handler({ apiKey, apiSecret, secrets: { 'call_reservoir_drip_chainid': chainId }, signer })
    .then(() => process.exit(0))
    .catch((error: Error) => {
      console.error(error)
      process.exit(1)
    })
}
