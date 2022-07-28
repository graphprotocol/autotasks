# The Graph protocol-related autotasks

This repo contains some useful autotasks meant to be used in OpenZeppelin's Defender to monitor
and interact with The Graph protocol.

The initial purpose of this repo is to provide tasks to monitor the Reservoir and call the drip function introduced in [GIP-0034](https://forum.thegraph.com/t/gip-0034-the-graph-arbitrum-devnet-with-a-new-rewards-issuance-and-distribution-mechanism/3418), as well redeem as the L2 retryable tickets associated with it. It can be expanded in the future to include other useful monitoring or housekeeping tasks.

The tasks are based on [OpenZeppelin's rollup example](https://github.com/OpenZeppelin/defender-autotask-examples/tree/master/rollup) that is also kept [in this repo](./rollup/) as a template.
