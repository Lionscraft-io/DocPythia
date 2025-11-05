import { db } from "../db";

const content: Array<{
  sectionId: string;
  title: string;
  content: string;
  level: number;
  type?: "warning" | "info" | "success" | "text" | null;
  orderIndex: number;
}> = [
  {
    sectionId: "intro",
    title: "NEAR Nodes Overview",
    content: `NEAR Protocol runs on a collection of publicly maintained computers (or "nodes"). All nodes are running the same \`nearcore\` codebase with the latest releases available on [GitHub](https://github.com/near/nearcore/releases/).

It is important to keep in mind all nodes run the same codebase, with different configurations. As such, we have split up the documentation for running different types of node into sections specific to the node's type.

**Node Types:**

- **Validator Node**: Validator nodes participate in the consensus and produce blocks and/or chunks.
- **RPC Node**: RPC nodes are service providers that provide public RPC endpoints for developers to use.
- **Archival Node**: Archival nodes store full blockchain data, and build an archive of historical states.`,
    level: 1,
    orderIndex: 1
  },
  {
    sectionId: "validator-node",
    title: "Validator Node",
    content: "Validator nodes participate in the consensus and produce blocks and/or chunks. Running a validator node requires staking NEAR tokens and meeting specific hardware requirements.",
    level: 1,
    orderIndex: 2
  },
  {
    sectionId: "validator-bootcamp",
    title: "Validator Bootcamp",
    content: `The Validator Bootcamp is a comprehensive onboarding program that prepares you to run a node on the NEAR network. After completing this bootcamp, you'll be able to:

1. Understand NEAR's consensus mechanism and validator economics
2. Set up and maintain validator infrastructure
3. Monitor node performance and troubleshoot issues
4. Participate in network governance

## Prerequisites

Before starting, you should have:
- Basic understanding of blockchain technology
- Command line proficiency (Linux/Unix)
- Access to the required hardware
- At least 31 NEAR tokens for staking (30 for pool creation + 1 for fees)

## Key Concepts

### Validator Roles

There are two types of validators on NEAR:
- **Chunk-only Producers**: Validate transactions and produce chunks
- **Block Producers**: Validate transactions, produce chunks, and produce blocks

### Staking & Economics

- Validators must stake NEAR tokens to participate
- Rewards are distributed based on uptime and performance
- Slashing is minimal but validators can be kicked out for poor performance
- Seat price is dynamic based on total stake

### Network Participation

Validators operate in **epochs** (approximately 12 hours each). At the start of each epoch:
- Validator assignments are determined
- Stake is locked
- Rewards from previous epoch are distributed

## Getting Started

1. **Set up infrastructure**: Follow the hardware requirements and setup guides
2. **Create a wallet**: Get your NEAR tokens ready
3. **Deploy your node**: Compile and run nearcore
4. **Create a staking pool**: Initialize your validator pool
5. **Monitor & maintain**: Keep your node healthy and updated`,
    level: 2,
    orderIndex: 3
  },
  {
    sectionId: "validator-hardware",
    title: "Hardware Requirements",
    content: `This page covers the minimum and recommended hardware requirements for engaging with the NEAR platform as a validator node.

## Mainnet

### Recommended Hardware Specifications

#### Chunk/Block Producers

| Hardware | Recommended Specifications |
|----------|---------------------------|
| CPU | x86_64 (Intel, AMD) processor with at least 8 physical cores |
| CPU Features | CMPXCHG16B, POPCNT, SSE4.1, SSE4.2, AVX, SHA-NI |
| RAM | 48GB DDR4 |
| Storage | 3TB NVMe SSD |

#### Chunk validators

| Hardware | Recommended Specifications |
|----------|---------------------------|
| CPU | x86_64 (Intel, AMD) processor with at least 8 physical cores |
| CPU Features | CMPXCHG16B, POPCNT, SSE4.1, SSE4.2, AVX, SHA-NI |
| RAM | 16GB DDR4 |
| Storage | 2TB NVMe SSD |

### Minimal Hardware Specifications

#### Chunk/Block Producers

| Hardware | Minimal Specifications |
|----------|----------------------|
| CPU | x86_64 (Intel, AMD) processor with at least 8 physical cores |
| CPU Features | CMPXCHG16B, POPCNT, SSE4.1, SSE4.2, AVX, SHA-NI |
| RAM | 48GB DDR4 |
| Storage | 2TB SATA3-class SSD supporting 15k IOPS and 800 MiBps or more |

#### Chunk validators

| Hardware | Minimal Specifications |
|----------|----------------------|
| CPU | x86_64 (Intel, AMD) processor with at least 8 physical cores |
| CPU Features | CMPXCHG16B, POPCNT, SSE4.1, SSE4.2, AVX, SHA-NI |
| RAM | 8GB DDR4 |
| Storage | 1TB SATA3-class SSD supporting 15k IOPS and 800 MiBps or more |

### Cost Estimation

Estimated monthly costs depending on cloud provider:

| Cloud Provider | Machine Size | Linux |
|---------------|--------------|-------|
| AWS | m5a.2xlarge | $160 CPU + $160 storage |
| GCP | n2-standard-8 | $280 CPU + $240 storage |
| Azure | Standard_D8s_v5 | $180 CPU + $200 storage |

## Testnet

### Recommended Hardware Specifications

#### Chunk/Block Producers

| Hardware | Recommended Specifications |
|----------|---------------------------|
| CPU | x86_64 (Intel, AMD) processor with at least 8 physical cores |
| CPU Features | CMPXCHG16B, POPCNT, SSE4.1, SSE4.2, AVX, SHA-NI |
| RAM | 32GB DDR4 |
| Storage | 1TB SATA3-class SSD supporting 15k IOPS and 800 MiBps or more |

#### Chunk validators

| Hardware | Recommended Specifications |
|----------|---------------------------|
| CPU | x86_64 (Intel, AMD) processor with at least 8 physical cores |
| CPU Features | CMPXCHG16B, POPCNT, SSE4.1, SSE4.2, AVX, SHA-NI |
| RAM | 16GB DDR4 |
| Storage | 512GB SATA3-class SSD supporting 15k IOPS and 800 MiBps or more |`,
    level: 2,
    orderIndex: 4
  },
  {
    sectionId: "validator-compile-source",
    title: "Compile from Source",
    content: `The following instructions show how to compile and run a NEAR validator node from source code on Linux. This is the recommended approach for production mainnet validators.

## Prerequisites

- [Rust](https://www.rust-lang.org/) - Install with: \`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh\`
- [Git](https://git-scm.com/)
- Installed developer tools:
  - **MacOS**: \`brew install cmake protobuf llvm awscli\`
  - **Linux**: \`apt install -y git binutils-dev libcurl4-openssl-dev zlib1g-dev libdw-dev libiberty-dev cmake gcc g++ python docker.io protobuf-compiler libssl-dev pkg-config clang llvm cargo awscli\`

## Choosing your nearcore version

When building your NEAR node you have several branch options:

- \`master\`: **(Experimental)** - Latest code, not stable
- [Latest stable release](https://github.com/near/nearcore/tags): **(Stable)** - Use for mainnet
- [Latest release candidates](https://github.com/near/nearcore/tags): **(RC)** - Use for testnet

## Compilation Steps

### 1. Clone nearcore repository

\`\`\`bash
git clone https://github.com/near/nearcore
cd nearcore
git fetch origin --tags
\`\`\`

### 2. Checkout desired version

For mainnet (latest stable):
\`\`\`bash
Nearcore_Version=\$(curl -s https://api.github.com/repos/near/nearcore/releases/latest | jq -r .tag_name)
git checkout \$Nearcore_Version
\`\`\`

For testnet (latest RC):
\`\`\`bash
Nearcore_Version=\$(curl -s https://api.github.com/repos/near/nearcore/releases | jq -r '[.[] | select(.prerelease == true)][0].tag_name')
git checkout \$Nearcore_Version
\`\`\`

### 3. Compile the binary

\`\`\`bash
make release
\`\`\`

This will take approximately 25 minutes on an i9 8-core CPU. The binary will be located at \`target/release/neard\`.

**Note**: Compilation needs over 1GB of memory per virtual core. If the build fails, try: \`CARGO_BUILD_JOBS=8 make release\`

## Network Optimizations

After compilation, optimize network settings for better validator performance:

\`\`\`bash
MaxExpectedPathBDP=8388608 && \\
sudo sysctl -w net.core.rmem_max=$MaxExpectedPathBDP && \\
sudo sysctl -w net.core.wmem_max=$MaxExpectedPathBDP && \\
sudo sysctl -w net.ipv4.tcp_rmem="4096 87380 $MaxExpectedPathBDP" && \\
sudo sysctl -w net.ipv4.tcp_wmem="4096 16384 $MaxExpectedPathBDP" && \\
sudo sysctl -w net.ipv4.tcp_slow_start_after_idle=0
\`\`\`

## Next Steps

After compilation, proceed to the [Validator Guide](https://near-nodes.io/validator/validator-guide) for initialization and setup instructions.`,
    level: 2,
    orderIndex: 5
  },
  {
    sectionId: "validator-windows-setup",
    title: "Windows Setup Guide",
    content: `This guide walks you through setting up a NEAR validator node on Windows using Windows Subsystem for Linux (WSL).

## Prerequisites

- Windows 10 version 2004 or higher (Build 19041 or higher) or Windows 11
- WSL 2 enabled
- At least 4GB RAM available for WSL
- Administrative access to your Windows machine

## Step 1: Install WSL 2

Open PowerShell as Administrator and run:

\`\`\`powershell
wsl --install
\`\`\`

This installs Ubuntu by default. Restart your computer when prompted.

## Step 2: Set up Ubuntu

After restart, open Ubuntu from the Start menu and create a user account.

Update the system:
\`\`\`bash
sudo apt update && sudo apt upgrade -y
\`\`\`

## Step 3: Install Dependencies

Install required packages:
\`\`\`bash
sudo apt install -y git binutils-dev libcurl4-openssl-dev zlib1g-dev libdw-dev libiberty-dev cmake gcc g++ python3 protobuf-compiler libssl-dev pkg-config clang llvm awscli jq ccze
\`\`\`

Install Rust:
\`\`\`bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source \$HOME/.cargo/env
\`\`\`

## Step 4: Configure WSL Resources

Create or edit \`.wslconfig\` in your Windows user directory (C:\\Users\\YourUsername\\.wslconfig):

\`\`\`ini
[wsl2]
memory=32GB
processors=8
swap=16GB
\`\`\`

Restart WSL:
\`\`\`powershell
wsl --shutdown
\`\`\`

## Step 5: Compile nearcore

Follow the standard [compilation instructions](https://near-nodes.io/validator/compile-and-run-a-node) within your WSL Ubuntu environment.

## Important Considerations

### Storage Location
Store your NEAR data on the Linux filesystem (/home/...) rather than Windows filesystem (/mnt/c/...) for better performance.

### Windows Firewall
Configure Windows Firewall to allow WSL to accept connections on port 24567 (NEAR's P2P port).

### Automatic Startup
To start your node automatically when Windows starts, you can use Task Scheduler or create a Windows service.

### Backup
Regularly backup your \`validator_key.json\` and \`node_key.json\` files to a secure location outside of WSL.

## Performance Notes

WSL 2 provides near-native Linux performance. However, for production mainnet validators, a native Linux installation is recommended for:
- Better stability
- Lower overhead
- Easier monitoring and maintenance
- Better community support`,
    level: 2,
    orderIndex: 6
  },
  {
    sectionId: "validator-guide",
    title: "Validator Onboarding Guide",
    content: `Complete guide for setting up and running a NEAR validator node from scratch.

## Prerequisites

Ensure you have the [required hardware](https://near-nodes.io/validator/hardware-validator) and have [compiled nearcore](https://near-nodes.io/validator/compile-and-run-a-node).

## Step 1: Create a NEAR Wallet

Create a wallet on mainnet or testnet:
- [MyNearWallet](https://app.mynearwallet.com/) (Mainnet/Testnet)
- [MeteorWallet](https://meteorwallet.app/) (Mainnet/Testnet)

Add at least **31 NEAR** to your wallet:
- **30 NEAR** for staking pool creation
- **1 NEAR** for transaction fees

⚠️ The 30 NEAR pool creation deposit cannot be recovered if you stop validating.

## Step 2: Authorize NEAR CLI

Install and authorize NEAR CLI:

\`\`\`bash
# Install NEAR CLI
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/near/near-cli-rs/releases/latest/download/near-cli-rs-installer.sh | sh
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/near-cli-rs/near-validator-cli-rs/releases/latest/download/near-validator-installer.sh | sh
source \$HOME/.cargo/env

# Authorize (Mainnet)
near login --network-id mainnet

# Authorize (Testnet)
near login --network-id testnet
\`\`\`

This opens a browser to authorize full access. Grant access and store the key in your keychain.

## Step 3: Initialize the Node

Choose your pool name. Your validator will be named: \`<your-name>.pool.near\` (mainnet) or \`<your-name>.pool.f863973.m0\` (testnet).

Get boot nodes and initialize:

\`\`\`bash
# MainNet
BOOT_NODES=\$(curl -s -X POST https://rpc.mainnet.near.org -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "method": "network_info",
  "params": [],
  "id": "dontcare"
}' | jq -r '.result.active_peers as \$list1 | .result.known_producers as \$list2 |
  \$list1[] as \$active_peer | \$list2[] |
  select(.peer_id == \$active_peer.id) |
  "\\(.peer_id)@\\(\$active_peer.addr)"' | paste -sd "," -)

cd ~/nearcore && target/release/neard init --chain-id="mainnet" --account-id=<your-pool>.pool.near --download-genesis --download-config validator --boot-nodes \$BOOT_NODES
\`\`\`

This generates:
- \`config.json\` - Node configuration
- \`validator_key.json\` - Validator keys (keep secure!)
- \`node_key.json\` - Node identity
- \`genesis.json\` - Network genesis state

## Step 4: Configure Node Settings

Reduce disk usage by keeping fewer epochs:

\`\`\`bash
jq '.gc_num_epochs_to_keep = 3' ~/.near/config.json > ~/.near/config.json.tmp && mv ~/.near/config.json.tmp ~/.near/config.json
\`\`\`

## Step 5: Set up systemd Service

Create a systemd service for automatic restarts:

\`\`\`bash
sudo bash -c 'cat > /etc/systemd/system/neard.service << EOF
[Unit]
Description=NEARd Daemon Service

[Service]
Type=simple
User=<YOUR_USER>
WorkingDirectory=/home/<YOUR_USER>/.near
ExecStart=/home/<YOUR_USER>/nearcore/target/release/neard run
Restart=on-failure
RestartSec=30
KillSignal=SIGINT
TimeoutStopSec=45
KillMode=mixed

[Install]
WantedBy=multi-user.target
EOF'

sudo systemctl enable neard
\`\`\`

## Step 6: Sync the Node

### Option A: Epoch Sync (Recommended)

Update boot nodes in config and start:

\`\`\`bash
jq --arg newBootNodes "$BOOT_NODES" '.network.boot_nodes = $newBootNodes' ~/.near/config.json > ~/.near/config.tmp && mv ~/.near/config.json ~/.near/config.json.backup && mv ~/.near/config.tmp ~/.near/config.json

sudo systemctl start neard
\`\`\`

Sync typically takes ~3 hours.

### Option B: Snapshot (Deprecated after June 2025)

Download latest snapshot from FastNEAR (see [documentation](https://docs.fastnear.com/docs/snapshots)).

## Step 7: Create Staking Pool

After your node is synced, create your staking pool:

\`\`\`bash
near validator create-staking-pool <pool-name> <owner-account-id> <validator-key-public-key> <commission-percentage>
\`\`\`

Example:
\`\`\`bash
near validator create-staking-pool panda yourwallet.near ed25519:ABC...XYZ 10
\`\`\`

This creates \`panda.pool.near\` with 10% commission.

## Step 8: Stake NEAR Tokens

Stake your tokens to become a validator:

\`\`\`bash
near validator stake <pool-id> <amount>
\`\`\`

Example: Stake 50000 NEAR
\`\`\`bash
near validator stake panda.pool.near 50000
\`\`\`

## Step 9: Monitor Your Validator

Check validator status:
\`\`\`bash
near validator status
\`\`\`

Monitor logs:
\`\`\`bash
journalctl -u neard -f
\`\`\`

You'll become an active validator in the next epoch if your stake is sufficient and your node is synced.`,
    level: 2,
    orderIndex: 7
  },
  {
    sectionId: "validator-deploy-mainnet",
    title: "Deploy on Mainnet",
    content: `This guide covers deploying a validator node specifically for NEAR mainnet with production best practices.

## Pre-Deployment Checklist

Before deploying to mainnet:

✅ Test your setup on testnet first
✅ Verify hardware meets or exceeds recommended specifications
✅ Secure your validator and node keys with encrypted backups
✅ Set up monitoring and alerting
✅ Plan for redundancy (consider a failover node)
✅ Have sufficient NEAR tokens (minimum 31, but competitive seat price is much higher)

## Security Best Practices

### 1. Secure Key Management

Store \`validator_key.json\` and \`node_key.json\` securely:

\`\`\`bash
# Encrypt your keys
gpg --symmetric --cipher-algo AES256 ~/.near/validator_key.json
gpg --symmetric --cipher-algo AES256 ~/.near/node_key.json

# Store encrypted copies in multiple secure locations
\`\`\`

### 2. Firewall Configuration

Only open required ports:

\`\`\`bash
# Allow NEAR P2P
sudo ufw allow 24567/tcp

# Allow SSH (change from default if possible)
sudo ufw allow 22/tcp

# Enable firewall
sudo ufw enable
\`\`\`

### 3. SSH Hardening

\`\`\`bash
# Disable password authentication
sudo sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config

# Disable root login
sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config

# Restart SSH
sudo systemctl restart sshd
\`\`\`

## Monitoring Setup

### 1. Node Metrics

Expose node metrics for monitoring:

\`\`\`bash
# Add to config.json
{
  "telemetry": {
    "endpoints": [
      "https://explorer.mainnet.near.org/api/nodes"
    ]
  },
  "prometheus": {
    "enabled": true,
    "addr": "0.0.0.0:3030"
  }
}
\`\`\`

### 2. Alert on Critical Issues

Set up alerts for:
- Node offline/not producing blocks
- Low disk space (< 20% free)
- High memory usage (> 90%)
- Node not keeping up with network

## High Availability

### Set up Failover Node

For production validators, maintain a hot standby node. See [Failover Node Instructions](https://near-nodes.io/validator/failover-node-instruction).

## Deployment Steps

### 1. Compile Latest Stable Release

\`\`\`bash
cd ~/nearcore
git fetch origin --tags
Nearcore_Version=\$(curl -s https://api.github.com/repos/near/nearcore/releases/latest | jq -r .tag_name)
git checkout \$Nearcore_Version
make release
\`\`\`

### 2. Initialize for Mainnet

\`\`\`bash
target/release/neard init --chain-id mainnet --account-id=<your-pool>.pool.near --download-genesis --download-config validator
\`\`\`

### 3. Start Node and Sync

Use Epoch Sync for decentralized syncing (recommended):

\`\`\`bash
# Update boot nodes
BOOT_NODES=\$(curl -s -X POST https://rpc.mainnet.near.org -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0",
  "method": "network_info",
  "params": [],
  "id": "dontcare"
}' | jq -r '.result.active_peers as \$list1 | .result.known_producers as \$list2 |
  \$list1[] as \$active_peer | \$list2[] |
  select(.peer_id == \$active_peer.id) |
  "\\(.peer_id)@\\(\$active_peer.addr)"' | paste -sd "," -)

jq --arg newBootNodes "\$BOOT_NODES" '.network.boot_nodes = \$newBootNodes' ~/.near/config.json > ~/.near/config.tmp && mv ~/.near/config.json ~/.near/config.json.backup && mv ~/.near/config.tmp ~/.near/config.json

# Start the node
sudo systemctl start neard
\`\`\`

### 4. Create Staking Pool

After syncing completes:

\`\`\`bash
near validator create-staking-pool <pool-name> <owner-account> <public-key> <commission>
\`\`\`

### 5. Stake Tokens

Check current seat price:
\`\`\`bash
near validators current | grep "seat price"
\`\`\`

Stake competitive amount:
\`\`\`bash
near validator stake <pool-name>.pool.near <amount>
\`\`\`

## Post-Deployment

### Monitor for First Epoch

Watch your node closely during the first epoch:
\`\`\`bash
# Check logs
journalctl -u neard -f

# Check validator status
near validator status

# Watch block production
curl -s http://localhost:3030/metrics | grep near_block_produced
\`\`\`

### Regular Maintenance

- Keep nearcore updated with latest stable releases
- Monitor disk space and plan for growth
- Regularly test failover procedures
- Review and rotate logs
- Back up keys regularly

## Troubleshooting

If your validator misses blocks:
1. Check node sync status
2. Verify network connectivity
3. Check system resources (CPU, RAM, disk I/O)
4. Review logs for errors
5. Consider failover if issues persist`,
    level: 2,
    orderIndex: 8
  },
  {
    sectionId: "validator-staking-delegation",
    title: "Staking and Delegation",
    content: `Learn how staking works on NEAR and how to manage your validator's stake.

## Understanding NEAR Staking

### Staking Mechanics

NEAR uses Proof-of-Stake (PoS) consensus where validators:
- Stake NEAR tokens to participate
- Are selected based on stake amount
- Earn rewards for producing valid blocks/chunks
- Can be ejected for poor performance (no slashing on mainnet currently)

### Validator Selection

Validators are selected each epoch based on:
1. **Total Stake**: Your pool's total stake amount
2. **Seat Price**: Dynamic threshold determined by network
3. **Performance**: Historical uptime and block production

## Staking Pools

### What is a Staking Pool?

A staking pool is a smart contract that:
- Holds staked NEAR tokens
- Manages delegation from token holders
- Distributes rewards to delegators
- Charges a commission for validator services

### Pool Commission

As a validator, you set a commission percentage (0-100%) that's charged on rewards. Common commission rates:
- **5-10%**: Competitive rate for established validators
- **10-15%**: Standard rate
- **100%**: Private pool (no delegation accepted)

## Managing Your Stake

### View Current Stake

\`\`\`bash
near validator status <pool-name>.pool.near
\`\`\`

### Stake Additional Tokens

\`\`\`bash
near validator stake <pool-name>.pool.near <amount>
\`\`\`

Example: Stake 10000 NEAR
\`\`\`bash
near validator stake mypanda.pool.near 10000
\`\`\`

### Unstake Tokens

\`\`\`bash
near validator unstake <pool-name>.pool.near <amount>
\`\`\`

⚠️ **Unstaking has a 4-epoch waiting period** (~48 hours) before tokens can be withdrawn.

### Withdraw Unstaked Tokens

After the unstaking period:
\`\`\`bash
near validator withdraw <pool-name>.pool.near
\`\`\`

## Accepting Delegations

### How Delegation Works

Other NEAR holders can delegate their tokens to your pool:
1. They stake tokens to your pool contract
2. Your pool's total stake increases
3. They earn rewards (minus your commission)
4. You earn commission on their rewards

### Attracting Delegators

To attract delegations:
- Maintain high uptime (>95%)
- Keep commission competitive
- Provide transparency (regular updates)
- Build reputation in the community
- List your pool on NEAR staking websites

### Manage Delegator Rewards

Rewards are automatically distributed. To check pool status:

\`\`\`bash
near view <pool-name>.pool.near get_accounts '{"from_index": 0, "limit": 10}'
\`\`\`

## Validator Economics

### Rewards Calculation

Validator rewards depend on:
- Network inflation rate (~4.5% annually)
- Your percentage of total network stake
- Block/chunk production assigned to you
- Your uptime and performance

### Example Calculation

If you stake 100,000 NEAR with 10% commission:
- Annual rewards: ~4,500 NEAR (at 4.5% rate)
- Your commission (if no delegations): 0 NEAR
- If you have 900,000 NEAR delegated (total pool: 1M):
  - Total pool rewards: ~45,000 NEAR
  - Your commission: 4,500 NEAR (10% of 45,000)
  - Delegator rewards: 40,500 NEAR distributed proportionally

### Seat Price Dynamics

The seat price changes based on:
- Total tokens staked in network
- Number of validator seats (currently 100 on mainnet)
- Seat price = (total staked / seat count) * 1.0625

Check current seat price:
\`\`\`bash
near validators current | grep "seat price"
\`\`\`

## Best Practices

### Stake Management

1. **Start Small**: Begin with minimum required stake to test setup
2. **Monitor Seat Price**: Ensure your stake stays competitive
3. **Maintain Buffer**: Keep extra stake above seat price for cushion
4. **Regular Checkups**: Weekly review of stake and rewards

### Validator Operations

1. **High Uptime**: Target >99% uptime for competitiveness
2. **Timely Updates**: Upgrade to new nearcore releases quickly
3. **Responsive Support**: Help delegators with questions
4. **Transparency**: Share your node's performance metrics

### Commission Strategy

- Start with competitive rate (8-12%)
- Lower commission if you need more delegations
- Consider promotional periods with reduced commission
- Never change commission without announcing to delegators

## Troubleshooting

### My validator isn't earning rewards

Check:
1. Are you in the active validator set? \`near validators current\`
2. Is your node synced and producing blocks?
3. Is your stake above the current seat price?
4. Have you waited for the next epoch to start?

### My validator was kicked out

Common reasons:
- Stake fell below seat price
- Low uptime/performance
- Node went offline
- Missed too many blocks

To rejoin:
1. Fix the underlying issue
2. Ping your validator: \`near validator ping <pool>.pool.near\`
3. Wait for next epoch`,
    level: 2,
    orderIndex: 9
  },
  {
    sectionId: "validator-upgradeable-pool",
    title: "Upgradeable Staking Pool",
    content: `Learn about upgradeable staking pools and how they provide enhanced flexibility for validators.

## Overview

Upgradeable staking pools are smart contracts that can be updated to add new features or fix bugs without losing staked funds or delegations.

### Benefits of Upgradeable Pools

- **Future-Proof**: Add new features without creating a new pool
- **Bug Fixes**: Patch security issues without migration
- **Enhanced Functionality**: Integrate new NEAR protocol features
- **Delegator Protection**: Stakers don't need to move tokens

## Pool Types

### Standard Pool (poolv1.near)

The legacy pool factory:
- Fixed functionality
- Cannot be upgraded
- Still widely used
- Factory: \`poolv1.near\` (Deprecated for new pools)

### Core Contracts Pool (pool.near)

The modern pool factory:
- Upgradeable architecture
- Better features
- Active development
- Factory: \`pool.near\` (Recommended)

## Creating an Upgradeable Pool

### Prerequisites

- NEAR account with sufficient balance
- NEAR CLI installed
- Decision on pool name

### Step 1: Create Pool

Use the \`pool.near\` factory:

\`\`\`bash
near call pool.near create_staking_pool '{
  "staking_pool_id": "<your-pool-name>",
  "owner_id": "<your-account>.near",
  "stake_public_key": "<your-validator-public-key>",
  "reward_fee_fraction": {"numerator": 10, "denominator": 100}
}' --accountId <your-account>.near --amount 30 --gas 300000000000000
\`\`\`

This creates: \`<your-pool-name>.pool.near\`

### Step 2: Configure Pool

Set up additional pool parameters:

\`\`\`bash
# Set pool metadata
near call <pool-name>.pool.near update_metadata '{
  "name": "Your Pool Name",
  "description": "Your pool description",
  "url": "https://your-website.com"
}' --accountId <your-account>.near
\`\`\`

## Managing Upgradeable Pools

### Check Pool Version

\`\`\`bash
near view <pool-name>.pool.near get_version
\`\`\`

### Update Commission

Commission can be changed (with notice period):

\`\`\`bash
near call <pool-name>.pool.near update_reward_fee_fraction '{
  "reward_fee_fraction": {"numerator": 5, "denominator": 100}
}' --accountId <owner-account>.near
\`\`\`

⚠️ **Commission changes take effect after 3 epochs** to give delegators time to react.

### Transfer Ownership

Transfer pool ownership to a new account:

\`\`\`bash
near call <pool-name>.pool.near set_owner_id '{
  "owner_id": "<new-owner>.near"
}' --accountId <current-owner>.near
\`\`\`

## Advanced Features

### Whitelisting

Control who can delegate to your pool:

\`\`\`bash
# Enable whitelist mode
near call <pool-name>.pool.near enable_whitelist --accountId <owner>.near

# Add accounts to whitelist
near call <pool-name>.pool.near add_to_whitelist '{
  "account_id": "<delegator>.near"
}' --accountId <owner>.near

# Remove from whitelist
near call <pool-name>.pool.near remove_from_whitelist '{
  "account_id": "<delegator>.near"
}' --accountId <owner>.near

# Disable whitelist
near call <pool-name>.pool.near disable_whitelist --accountId <owner>.near
\`\`\`

### Pausing Deposits

Temporarily stop accepting new delegations:

\`\`\`bash
# Pause deposits
near call <pool-name>.pool.near pause_deposits --accountId <owner>.near

# Resume deposits
near call <pool-name>.pool.near resume_deposits --accountId <owner>.near
\`\`\`

### Emergency Unstaking

In emergencies, quickly unstake all:

\`\`\`bash
near call <pool-name>.pool.near unstake_all --accountId <owner>.near
\`\`\`

## Pool Upgrading

### When to Upgrade

Upgrade your pool when:
- Security patches are released
- New features are available
- Protocol changes require updates
- Bug fixes are published

### Upgrade Process

The NEAR Foundation typically handles pool upgrades. Stay informed through:
- NEAR Validators Telegram
- NEAR Forum announcements
- GitHub releases

### Testing Upgrades

Always test on testnet first:
1. Deploy test pool on testnet
2. Verify upgrade works correctly
3. Test all functionality
4. Then proceed with mainnet

## Migration Guide

### Migrating from poolv1 to pool

If you have an old \`poolv1.near\` pool:

**Option 1: Keep Old Pool**
- Continue using legacy pool
- No action needed
- Cannot access new features

**Option 2: Create New Pool**
- Create new pool with \`pool.near\`
- Announce migration to delegators
- Delegators must unstake and re-stake
- Takes 4+ epochs to complete

**⚠️ Warning**: There's no automatic migration. Delegators must manually move their stake.

## Best Practices

### Pool Configuration

- Use descriptive pool name
- Set competitive commission
- Add complete metadata
- Test on testnet first

### Communication

- Announce commission changes early
- Notify delegators of maintenance
- Keep metadata updated
- Provide support channels

### Security

- Secure owner account with 2FA
- Use separate hot wallet for operations
- Keep validator keys separate from owner keys
- Regularly audit pool settings

## Troubleshooting

### Pool Not Accepting Deposits

Check if:
- Deposits are paused: \`near view <pool>.pool.near is_deposits_paused\`
- Whitelist is enabled: \`near view <pool>.pool.near is_whitelist_enabled\`
- You're on the whitelist: \`near view <pool>.pool.near is_whitelisted\`

### Commission Change Not Applying

- Commission changes take 3 epochs
- Check pending changes: \`near view <pool>.pool.near get_reward_fee_fraction\`

### Unable to Upgrade

- Only owner can upgrade
- Verify ownership: \`near view <pool>.pool.near get_owner_id\`
- Check if upgrade is available from the factory`,
    level: 2,
    orderIndex: 10
  },
  {
    sectionId: "validator-metrics",
    title: "Expose Node Metrics",
    content: `Learn how to expose and monitor your NEAR validator node metrics for better observability and performance tracking.

## Why Metrics Matter

Exposing metrics allows you to:
- Monitor node health in real-time
- Detect issues before they cause problems
- Track performance trends
- Optimize resource usage
- Debug production issues

## Enable Prometheus Metrics

### Configure config.json

Add Prometheus configuration to your \`~/.near/config.json\`:

\`\`\`json
{
  "prometheus": {
    "enabled": true,
    "addr": "0.0.0.0:3030"
  }
}
\`\`\`

⚠️ **Security Warning**: Exposing metrics on 0.0.0.0 makes them publicly accessible. For production, bind to localhost or use firewall rules.

### Restart Your Node

\`\`\`bash
sudo systemctl restart neard
\`\`\`

### Test Metrics Endpoint

\`\`\`bash
curl http://localhost:3030/metrics
\`\`\`

You should see a long list of metrics in Prometheus format.

## Key Metrics to Monitor

### Block Production

\`\`\`bash
# Blocks produced by this validator
curl -s http://localhost:3030/metrics | grep near_block_produced

# Blocks expected vs produced
curl -s http://localhost:3030/metrics | grep near_block_expected

# Chunk production statistics
curl -s http://localhost:3030/metrics | grep near_chunk
\`\`\`

### Sync Status

\`\`\`bash
# Current block height
curl -s http://localhost:3030/metrics | grep near_block_height

# Sync status
curl -s http://localhost:3030/metrics | grep near_syncing

# Is validator active
curl -s http://localhost:3030/metrics | grep near_validators
\`\`\`

### Network Health

\`\`\`bash
# Peer connections
curl -s http://localhost:3030/metrics | grep near_peer_connections

# Network bandwidth
curl -s http://localhost:3030/metrics | grep near_network

# Message statistics
curl -s http://localhost:3030/metrics | grep near_received_messages
\`\`\`

### Performance

\`\`\`bash
# CPU usage
curl -s http://localhost:3030/metrics | grep near_cpu

# Memory usage
curl -s http://localhost:3030/metrics | grep near_memory

# Disk I/O
curl -s http://localhost:3030/metrics | grep near_disk
\`\`\`

## Prometheus Setup

### Install Prometheus

\`\`\`bash
# Download Prometheus
wget https://github.com/prometheus/prometheus/releases/download/v2.45.0/prometheus-2.45.0.linux-amd64.tar.gz

# Extract
tar xvfz prometheus-2.45.0.linux-amd64.tar.gz
cd prometheus-2.45.0.linux-amd64

# Create config
cat > prometheus.yml << EOF
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'near-node'
    static_configs:
      - targets: ['localhost:3030']
EOF

# Run Prometheus
./prometheus --config.file=prometheus.yml
\`\`\`

Prometheus web UI: http://localhost:9090

### Configure as Systemd Service

\`\`\`bash
sudo bash -c 'cat > /etc/systemd/system/prometheus.service << EOF
[Unit]
Description=Prometheus
After=network.target

[Service]
Type=simple
User=prometheus
ExecStart=/usr/local/bin/prometheus --config.file=/etc/prometheus/prometheus.yml --storage.tsdb.path=/var/lib/prometheus
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF'

sudo systemctl enable prometheus
sudo systemctl start prometheus
\`\`\`

## Grafana Dashboards

### Install Grafana

\`\`\`bash
# Add Grafana repo
sudo apt-get install -y software-properties-common
sudo add-apt-repository "deb https://packages.grafana.com/oss/deb stable main"
wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -

# Install
sudo apt-get update
sudo apt-get install grafana

# Start service
sudo systemctl enable grafana-server
sudo systemctl start grafana-server
\`\`\`

Grafana web UI: http://localhost:3000 (default login: admin/admin)

### Add Prometheus Data Source

1. Navigate to Configuration → Data Sources
2. Click "Add data source"
3. Select "Prometheus"
4. Set URL to http://localhost:9090
5. Click "Save & Test"

### Import NEAR Dashboard

Use community NEAR dashboards or create your own:

Key panels to include:
- Block height over time
- Validator status
- Peer connections
- Block production rate
- Memory/CPU usage
- Disk usage trends

## Alerting

### Configure Prometheus Alerts

Create \`/etc/prometheus/alerts.yml\`:

\`\`\`yaml
groups:
  - name: near_alerts
    rules:
      - alert: NodeDown
        expr: up{job="near-node"} == 0
        for: 5m
        annotations:
          summary: "NEAR node is down"
          
      - alert: LowPeerCount
        expr: near_peer_connections < 5
        for: 10m
        annotations:
          summary: "Low peer connections"
          
      - alert: NotProducingBlocks
        expr: rate(near_block_produced[30m]) == 0
        for: 30m
        annotations:
          summary: "Validator not producing blocks"
          
      - alert: HighMemoryUsage
        expr: near_memory_usage > 0.9
        for: 15m
        annotations:
          summary: "High memory usage"
\`\`\`

### Configure Alert Notifications

Set up Alertmanager for notifications via:
- Email
- Slack
- Telegram
- PagerDuty
- Discord

## Monitoring Best Practices

### Essential Alerts

Set up alerts for:
- Node offline (> 5 minutes)
- Low peer count (< 5 peers)
- High memory usage (> 90%)
- Low disk space (< 20%)
- Not producing expected blocks
- Fork detected
- Sync falling behind

### Dashboard Organization

Organize dashboards by:
- **Overview**: High-level health metrics
- **Performance**: Detailed performance data
- **Network**: Peer and network stats
- **Validator**: Block production and rewards

### Regular Reviews

- Daily: Quick check of key metrics
- Weekly: Detailed performance review
- Monthly: Trend analysis and capacity planning

## Telemetry Integration

### Enable NEAR Telemetry

Report anonymized metrics to NEAR Explorer:

\`\`\`json
{
  "telemetry": {
    "endpoints": [
      "https://explorer.mainnet.near.org/api/nodes"
    ]
  }
}
\`\`\`

This makes your node visible on NEAR Explorer.

## Troubleshooting

### Metrics Not Available

Check:
1. Is Prometheus enabled in config?
2. Is the node running?
3. Correct port opened?
4. Firewall rules blocking access?

\`\`\`bash
# Test locally
curl http://localhost:3030/metrics

# Check if port is listening
netstat -tlnp | grep 3030

# Check logs
journalctl -u neard -f
\`\`\`

### High Cardinality Metrics

If metrics endpoint is slow:
- Reduce scrape frequency
- Filter out high-cardinality metrics
- Increase Prometheus resources

### Missing Metrics

If specific metrics are missing:
- Update to latest nearcore version
- Check metric name hasn't changed
- Verify node is fully synced`,
    level: 2,
    orderIndex: 11
  },
  {
    sectionId: "validator-debug-rpc",
    title: "Debug RPC and Debug Pages",
    content: `Recently, a set of debug pages have been added to help you see more details about how your node works.

## Enabling Debug Pages

Debug support must be enabled in the \`config.json\`:

\`\`\`bash
cd ~/nearcore
vim ~/.near/config.json
\`\`\`

Update the config:

\`\`\`json
{
  "rpc": {
    "enable_debug_rpc": true
  }
}
\`\`\`

Restart your node after making this change.

After this, you can navigate to \`http://localhost:3030/debug\` to see links to all the sub-pages.

⚠️ **Important**: If you're a mainnet validator, firewall-protect access to debug pages & APIs. Some debug API calls are expensive and spamming them can overload your system and impact block production speed.

## Debug Pages Overview

### Last Blocks

Quick overview of the most recent blocks including:
- Gas usage per block
- Time spent processing
- Who produced the block/chunk

Useful for: Identifying performance bottlenecks in recent blocks.

### Network Info

Shows information about:
- Currently reachable validators
- State of your peers
- Routing of messages sent to validators

Useful for: Diagnosing connectivity and network propagation issues.

### Epoch Info

Displays information about:
- Current and past epochs (start time, validator count)
- Validator stakes
- Upcoming proposals and kickouts
- Validator history from previous epochs
- Shard sizes

Useful for: Understanding validator set changes and your position in the network.

### Chain & Chunk Info

Shows information about recent blocks and chunks:
- When chunks were requested
- What parts are we waiting for
- How long downloads took
- Chunk inclusion status

Useful for: Debugging why chunks might be missing from blocks.

### Sync Page

Displays the status of synchronization:
- Header sync progress
- Block sync progress
- Remaining blocks to sync
- Catchup status when tracking new shards

Useful for: Monitoring initial sync or catchup progress.

### Validator Page

The most complex page showing the consensus layer:
- When your node sent approvals
- When your node is about to produce a block
- Received approvals and chunk headers
- Why blocks didn't contain certain chunks

#### Example: Debugging Missing Chunks

For block 3253009 that didn't contain chunk for shard 3:

1. Node was block producer (row shows approval times)
2. First approval received at time "F"
3. More approvals and chunks started arriving
4. Node received 2/3 approvals needed at time "T" (F + 617ms)
5. At time T, still missing chunk from shard 3
6. Node waited 600ms
7. At T + 643ms, node produced block WITHOUT chunk3
8. verse2 eventually delivered chunk, but too late (T + 1.3s)

For block 3253014:
- Chunk 4 producer delivered before 600ms cutoff
- Block included all chunks successfully

### Approval History

At the bottom of the validator page, shows:
- All approvals your node has sent
- Regular approval patterns when healthy
- Skip requests when there are missing blocks

Useful for: Debugging why blocks weren't produced and whether approvals were sent correctly.

## Common Debug Scenarios

### Investigating Missed Blocks

1. Go to Validator page
2. Find the block number that was missed
3. Check if you received enough approvals
4. Check if all chunks arrived in time
5. Look for which validators didn't send approvals/chunks
6. Check network latency issues

### Diagnosing Slow Block Production

1. Check Last Blocks page for processing times
2. Review gas usage patterns
3. Compare with other blocks
4. Identify if specific chunks are slow

### Network Connectivity Issues

1. Check Network Info page
2. Verify peer counts
3. Check routing table
4. Ensure you're connected to validators

### Sync Problems

1. Go to Sync page
2. Check header sync vs block sync progress
3. Look for stalled sync
4. Verify catchup status if tracking new shards

## Security Considerations

### Protecting Debug Endpoints

For mainnet validators, protect debug endpoints:

\`\`\`bash
# Only allow localhost
sudo ufw deny 3030
sudo ufw allow from 127.0.0.1 to any port 3030

# Or use SSH tunnel
ssh -L 3030:localhost:3030 user@validator-host
\`\`\`

### Monitor Debug API Usage

Watch for:
- Unusual API call patterns
- High CPU usage from debug endpoints
- Slow response times

Disable debug RPC if you notice performance impact.

## Best Practices

1. **Enable on testnet first**: Test debug pages on testnet before mainnet
2. **Secure access**: Always firewall protect on mainnet
3. **Regular checks**: Review debug pages weekly during normal operation
4. **Troubleshooting**: Use extensively when investigating issues
5. **Performance**: Disable if you notice any impact on block production
6. **Document findings**: Keep notes on patterns you observe`,
    level: 2,
    orderIndex: 12
  },
  {
    sectionId: "validator-failover",
    title: "Failover and Backup Node",
    content: `Learn how to set up a failover/backup node to minimize downtime and ensure continuous validator operation.

## Overview

There are two main approaches to failover, each with different trade-offs:

**Option 1: RPC Node as Failover**
- Can serve as RPC node while on standby
- Can support multiple validators tracking different shards
- Requires node restart during failover

**Option 2: Validator Key Hot Swap**
- Near-instant failover (seconds)
- No restart needed
- Must be dedicated to one validator
- Cannot serve as RPC node while on standby

### Important Note

- Once a node becomes a validator and tracks a shard, it cannot revert to tracking all shards
- You may lose one RPC node when transitioning to validator mode (Option 1)

## Option 1: RPC Node as Failover

This is the traditional recovery approach.

### Pros

- Failover node can also serve as RPC node
- One failover can support multiple validators (different shards)

### Cons

- Requires neard restart during failover transition
- Brief downtime during the switch

### Standby Configuration

In the failover node's \`config.json\`:

\`\`\`json
{
  "tracked_shards_config": "AllShards",
  "store": {
    "load_mem_tries_for_tracked_shards": false
  }
}
\`\`\`

### Failover Procedure

When your primary validator fails:

1. Copy \`validator_key.json\` to the failover node

2. Update failover node \`config.json\`:
\`\`\`json
{
  "tracked_shards_config": "NoShards",
  "store": {
    "load_mem_tries_for_tracked_shards": true
  }
}
\`\`\`

3. Stop the primary validator node:
\`\`\`bash
sudo systemctl stop neard
\`\`\`

4. Restart the failover node:
\`\`\`bash
sudo systemctl restart neard
\`\`\`

⚠️ **Note**: You don't need to swap \`node_key.json\`. The network identifies nodes by key and IP address.

## Option 2: Validator Key Hot Swap

This method enables nearly instant failover.

### Pros

- No restart needed
- Failover happens in seconds
- Minimal downtime

### Cons

- Failover node cannot be used as RPC node
- Must be dedicated to one validator

### Standby Configuration

In the failover node's \`config.json\`:

\`\`\`json
{
  "tracked_shards_config": {
    "ShadowValidator": "<validator_pool_id>"
  },
  "store": {
    "load_mem_tries_for_tracked_shards": true
  }
}
\`\`\`

Replace \`<validator_pool_id>\` with your pool ID (e.g., "mypanda.pool.near").

⚠️ **Note**: The failover node must be dedicated to a single validator. Since mem_trie doesn't work well with RPC nodes, it cannot serve RPC functions.

### Failover Procedure

When your primary validator fails:

1. Copy \`validator_key.json\` to the failover node

2. \[Optional\] Update failover node \`config.json\`:
\`\`\`json
{
  "tracked_shards_config": "NoShards"
}
\`\`\`

3. Stop the primary validator node:
\`\`\`bash
sudo systemctl stop neard
\`\`\`

4. Send SIGHUP signal to failover node (no restart):
\`\`\`bash
sudo kill -HUP $(pgrep neard)
\`\`\`

The failover node will pick up the validator key and start validating immediately.

## Best Practices

### Infrastructure

1. **Separate Networks**: Place primary and failover on different networks/data centers
2. **Monitor Both**: Actively monitor both primary and failover nodes
3. **Test Regularly**: Practice failover procedures monthly
4. **Automate**: Consider automation for faster response

### Monitoring

Set up alerts for:
- Primary node offline
- Failover node not synced
- Failover node having issues
- Network connectivity problems

### Failover Testing

Test on testnet first:
1. Set up primary and failover on testnet
2. Practice both failover methods
3. Measure downtime for each approach
4. Document your procedures

### Recovery

After fixing the primary node:
1. Ensure primary is fully synced
2. Copy validator key back to primary
3. Stop failover node (or restart as RPC)
4. Start primary node
5. Verify primary is producing blocks

## Automated Failover

### Health Check Script

Create a script to monitor primary and trigger failover:

\`\`\`bash
#!/bin/bash

PRIMARY_HOST="primary-ip"
FAILOVER_HOST="localhost"
CHECK_INTERVAL=30

while true; do
  # Check if primary is producing blocks
  PRIMARY_HEIGHT=\$(curl -s http://\$PRIMARY_HOST:3030/status | jq -r .sync_info.latest_block_height)
  
  if [ -z "\$PRIMARY_HEIGHT" ]; then
    echo "Primary node not responding - triggering failover"
    # Copy validator key
    scp \$PRIMARY_HOST:~/.near/validator_key.json ~/.near/
    # Send SIGHUP to failover
    kill -HUP \$(pgrep neard)
    exit 0
  fi
  
  sleep \$CHECK_INTERVAL
done
\`\`\`

⚠️ **Warning**: Automated failover is complex. Test thoroughly on testnet.

### Considerations for Automation

- False positives can cause unnecessary failovers
- Network issues might prevent proper automation
- Manual intervention is often safer for mainnet

## Cost Considerations

### Option 1 Costs

- Failover can serve other purposes (RPC, monitoring)
- Lower total infrastructure cost
- Can support multiple validators

### Option 2 Costs

- Dedicated failover node per validator
- Higher infrastructure cost
- Necessary for minimal downtime requirements

## Troubleshooting

### Failover Not Producing Blocks

Check:
1. Is \`validator_key.json\` copied correctly?
2. Is the node fully synced?
3. Did you wait for SIGHUP to take effect?
4. Are there network connectivity issues?

### Both Nodes Producing Blocks

⚠️ **Critical**: Never run both nodes with the same validator key simultaneously!

This can cause:
- Double signing
- Network confusion
- Potential slashing (if implemented)

### Failover Node Out of Sync

If failover falls too far behind:
1. Use latest snapshot to quickly sync
2. Consider using faster storage
3. Ensure sufficient bandwidth

## Security

### Key Management

- Store \`validator_key.json\` securely with encryption
- Automate secure key copying between nodes
- Use SSH keys for authentication
- Limit network access to key storage

### Access Control

- Restrict SSH access to failover node
- Use separate accounts for automation
- Log all failover events
- Monitor for unauthorized access`,
    level: 2,
    orderIndex: 13
  },
  {
    sectionId: "rpc-node",
    title: "RPC Node",
    content: "RPC nodes are service providers that provide public RPC endpoints for developers to use. They store recent blockchain data and can serve RPC queries.",
    level: 1,
    orderIndex: 14
  },
  {
    sectionId: "rpc-hardware",
    title: "Hardware Requirements",
    content: `This page covers the minimum and recommended hardware requirements for engaging with the NEAR platform as an RPC node.

The \`gc_num_epochs_to_keep\` config parameter controls how many epochs are stored on your RPC node. The default is 5, with a minimum of 3.

## Mainnet

### Recommended Hardware Specifications

| Hardware | Recommended Specifications |
|----------|---------------------------|
| CPU | 8-Core (16-Thread) Intel i7/Xeon or equivalent |
| CPU Features | CMPXCHG16B, POPCNT, SSE4.1, SSE4.2, AVX, SHA-NI |
| RAM | 32GB DDR4 |
| Storage | 4TB NVMe SSD |

### Minimal Hardware Specifications

| Hardware | Minimal Specifications |
|----------|----------------------|
| CPU | 8-Core (16-Thread) Intel i7/Xeon or equivalent |
| CPU Features | CMPXCHG16B, POPCNT, SSE4.1, SSE4.2, AVX, SHA-NI |
| RAM | 16GB DDR4 |
| Storage | 2.5TB SATA3-class SSD supporting at least 15k IOPS and 800 MiBps |

### Cost Estimation

| Cloud Provider | Machine Size | Linux |
|---------------|--------------|-------|
| AWS | m5a.2xlarge | $160 CPU + $300 storage |
| GCP | n2-standard-8 | $280 CPU + $400 storage |
| Azure | Standard_D8s_v5 | $180 CPU + $300 storage |

## Testnet

### Recommended Hardware Specifications

| Hardware | Recommended Specifications |
|----------|---------------------------|
| CPU | 8-Core (16-Thread) Intel i7/Xeon or equivalent |
| CPU Features | CMPXCHG16B, POPCNT, SSE4.1, SSE4.2, AVX, SHA-NI |
| RAM | 16GB DDR4 |
| Storage | 1.5TB NVMe SSD |

### Minimal Hardware Specifications

| Hardware | Minimal Specifications |
|----------|----------------------|
| CPU | 8-Core (16-Thread) Intel i7/Xeon or equivalent |
| CPU Features | CMPXCHG16B, POPCNT, SSE4.1, SSE4.2, AVX, SHA-NI |
| RAM | 8GB DDR4 |
| Storage | 1TB SATA3-class SSD supporting at least 15k IOPS and 800 MiBps |`,
    level: 2,
    orderIndex: 15
  },
  {
    sectionId: "rpc-run-node",
    title: "Run an RPC Node",
    content: `The following instructions are applicable for testnet and mainnet. Running an RPC node is similar to running a validator node, with the main difference being that RPC nodes don't require \`validator_key.json\`.

## Prerequisites

- [Rust](https://www.rust-lang.org/)
- [Git](https://git-scm.com/)
- Installed developer tools (MacOS: \`brew install cmake protobuf clang llvm awscli\`)

## For testnet

### 1. Clone nearcore

\`\`\`bash
git clone https://github.com/near/nearcore
cd nearcore
git fetch origin --tags
git checkout tags/1.25.0 -b mynode
\`\`\`

### 2. Compile nearcore binary

\`\`\`bash
make release
\`\`\`

The binary path is \`target/release/neard\`.

### 3. Initialize working directory

\`\`\`bash
./target/release/neard --home ~/.near init --chain-id testnet --download-genesis --download-config rpc
\`\`\`

This creates:
- \`config.json\` with \`"tracked_shards": [0]\` to track all shards
- \`genesis.json\` - Network genesis data
- \`node_key.json\` - Node keys
- \`data/\` - State storage

### 4. Sync with network

Use [Epoch Sync](https://near-nodes.io/intro/node-epoch-sync) for faster synchronization.

### 5. Run the node

\`\`\`bash
./target/release/neard --home ~/.near run
\`\`\`

## Running in light mode

To run a node in \`light\` mode (chain-level data only, no state data), set \`tracked_shards\` to an empty array in \`config.json\`:

\`\`\`json
{
  "tracked_shards": []
}
\`\`\``,
    level: 2,
    orderIndex: 16
  },
  {
    sectionId: "rpc-run-nearup",
    title: "Run RPC Node with nearup",
    content: `We encourage you to set up your node with neard instead of nearup as nearup is not used on mainnet. Please head to [Run a Node](https://near-nodes.io/rpc/run-rpc-node-without-nearup) for instructions on how to setup an RPC node with neard.

## Prerequisites

- [Git](https://git-scm.com/)
- [Nearup](https://github.com/near-guildnet/nearup): Install nearup by following the instructions at [https://github.com/near-guildnet/nearup](https://github.com/near-guildnet/nearup)

⚠️ **Note**: nearup is exclusively used to launch NEAR testnet and localnet nodes. nearup is not used to launch mainnet nodes.

## Steps to Run an RPC Node using nearup

Running an RPC node is very similar to running a validator node as both use the same \`nearcore\` release. The main difference is that RPC nodes don't require \`validator_key.json\`.

### 1. Clone nearcore repository

\`\`\`bash
git clone https://github.com/near/nearcore.git
cd nearcore
git checkout <version>
\`\`\`

### 2. Compile the binary

\`\`\`bash
make neard
\`\`\`

The binary will be at \`target/release/neard\`.

**Note**: Compilation needs over 1GB of memory per virtual core. If the build fails, try: \`CARGO_BUILD_JOBS=8 make neard\`.

### 3. Run with nearup

\`\`\`bash
nearup run testnet --binary-path path/to/nearcore/target/release
\`\`\`

When prompted for an Account ID, leave it empty (RPC nodes don't need validator keys).

### 4. Follow logs

\`\`\`bash
nearup logs --follow
\`\`\`

### 5. Stop the node

\`\`\`bash
nearup stop
\`\`\`

## Retrieve Latest RPC Snapshot

⚠️ **FREE SNAPSHOT SERVICE BY FASTNEAR WILL BE DEPRECATED STARTING JUNE 1ST, 2025. We strongly recommend all node operators to use [Epoch Sync](https://near-nodes.io/intro/node-epoch-sync) when possible.**

The latest daily snapshots are made available to the public by FastNear, and can be used to set up a validator node or RPC. For detailed instructions, please refer to [FastNear Documentation](https://docs.fastnear.com/docs/snapshots).`,
    level: 2,
    orderIndex: 17
  },
  {
    sectionId: "rpc-state-sync",
    title: "State Sync Configuration",
    content: `⚠️ **FREE SNAPSHOT SERVICE BY FASTNEAR WILL BE DEPRECATED STARTING JUNE 1ST, 2025. We strongly recommend all node operators to use [Epoch Sync](https://near-nodes.io/intro/node-epoch-sync) when possible.**

## Overview

State Sync allows nodes to sync blockchain state from external storage. Pagoda provides state dumps for every shard of every epoch since the release of 1.36.0-rc.1 for testnet and 1.36.0 for mainnet.

## Enable State Sync

The main option needed is \`state_sync_enabled\`, then specify how to get state parts from Pagoda in the \`state_sync\` option.

### Configuration

Add to your \`config.json\`:

\`\`\`json
{
  "state_sync_enabled": true,
  "state_sync": {
    "sync": {
      "ExternalStorage": {
        "location": {
          "GCS": {
            "bucket": "state-parts"
          }
        },
        "num_concurrent_requests": 4,
        "num_concurrent_requests_during_catchup": 4
      }
    }
  }
}
\`\`\`

This provides access to the state of every shard for every epoch.

## Reference config.json

Download the reference config file:

\`\`\`bash
./neard --home /tmp/ init --download-genesis --download-config rpc --chain-id <testnet or mainnet>
\`\`\`

For validator or archival nodes, replace \`--download-config rpc\` with \`validator\` or \`archival\`.

The file will be available at \`/tmp/config.json\`.

## Troubleshooting

If state sync hasn't completed after 3 hours, check the following:

### 1. Verify Config Options

Check these options in your \`config.json\`:
- \`state_sync_enabled\`
- \`state_sync\`
- \`consensus.state_sync_timeout\`
- \`tracked_shards\`
- \`tracked_accounts\`
- \`tracked_shard_schedule\`
- \`archive\`
- \`block_fetch_horizon\`

View your actual config at: \`http://127.0.0.1:3030/debug/client_config\`

### 2. Check Disk Space

Ensure your node hasn't run out of available disk space.

### 3. Disable and Retry

If issues persist:
1. Disable state sync: \`"state_sync_enabled": false\` in \`config.json\`
2. Restart the node
3. If that doesn't help, restore from a backup snapshot

## Running a Validator Tracking Single Shard

Enable State Sync as explained above, then configure the node to track no shards:

\`\`\`json
{
  "tracked_shards": [],
  "tracked_accounts": [],
  "tracked_shard_schedule": []
}
\`\`\`

This is counter-intuitive but it works. When a node stakes and is accepted as a validator, it will automatically track the shard it needs for its validator role. The assignment of validators to shards is done by consensus.

**Note**: In different epochs, a validator may be assigned to different shards. A node switches tracked shards using the State Sync mechanism for a single shard (see catchup process).`,
    level: 2,
    orderIndex: 18
  },
  {
    sectionId: "archival-node",
    title: "Archival Node",
    content: "Archival nodes store full blockchain data and build an archive of historical states. They require significantly more storage than regular RPC or validator nodes. NEAR now offers split storage to make archival nodes more efficient.",
    level: 1,
    orderIndex: 19
  },
  {
    sectionId: "archival-hardware",
    title: "Hardware Requirements",
    content: `This page covers the minimum and recommended hardware requirements for running a NEAR Archival node.

## Mainnet

### Recommended Hardware Specifications

| Hardware | Recommended Specifications |
|----------|---------------------------|
| CPU | 8-Core (16-Thread) Intel i7/Xeon or equivalent with AVX support |
| CPU Features | CMPXCHG16B, POPCNT, SSE4.1, SSE4.2, AVX, SHA-NI |
| RAM | 32GB DDR4 |
| Hot Storage | 3 Terabyte SSD |
| Cold Storage | 90 Terabyte NON-SSD Persistent Disks |

### Minimal Hardware Specifications

| Hardware | Minimal Specifications |
|----------|----------------------|
| CPU | 8-Core (16-Thread) Intel i7/Xeon or equivalent with AVX support |
| RAM | 24GB DDR4 |
| Hot Storage | 1.5 Terabyte SSD |
| Cold Storage | 85 Terabyte NON-SSD Persistent Disks |

### Cost Estimation

| Cloud Provider | Machine Size | Linux |
|---------------|--------------|-------|
| AWS | m5a.4xlarge | $300 CPU + $1200 storage † |
| GCP | n2d-standard-16 | $400 CPU + $2100 storage † |
| Azure | Standard_d16-v3 | $334 CPU + $400 storage † |

_( † ) Storage cost will grow over time as the archival node stores more data._

## Testnet

### Recommended Hardware Specifications

| Hardware | Recommended Specifications |
|----------|---------------------------|
| CPU | 8-Core (16-Thread) Intel i7/Xeon or equivalent with AVX support |
| CPU Features | CMPXCHG16B, POPCNT, SSE4.1, SSE4.2, AVX, SHA-NI |
| RAM | 24GB DDR4 |
| Hot Storage | 1.5 Terabyte SSD |
| Cold Storage | 15 Terabyte NON-SSD Persistent Disks |

### Minimal Hardware Specifications

| Hardware | Minimal Specifications |
|----------|----------------------|
| CPU | 8-Core (16-Thread) Intel i7/Xeon or equivalent with AVX support |
| RAM | 16GB DDR4 |
| Hot Storage | 1 Terabyte SSD |
| Cold Storage | 15 Terabyte NON-SSD Persistent Disks |`,
    level: 2,
    orderIndex: 20
  },
  {
    sectionId: "archival-run-without-nearup",
    title: "Run Archival Node (without nearup)",
    content: `⚠️ **This page is DEPRECATED in favor of split storage archival. Please use [Run a Split Storage Archival](https://near-nodes.io/archival/split-storage-archival).**

Running an archival node is similar to running a validator node as both use the same \`nearcore\` release. The main difference is modifying \`config.json\` by setting \`"archive": true\`.

## Prerequisites

- [Rust](https://www.rust-lang.org/)
- [Git](https://git-scm.com/)
- Installed developer tools (see [compilation guide](https://near-nodes.io/validator/compile-and-run-a-node))

## Testnet Setup

### 1. Clone nearcore

\`\`\`bash
git clone https://github.com/near/nearcore
cd nearcore
git fetch origin --tags
git checkout tags/1.28.0 -b mynode
\`\`\`

### 2. Compile nearcore binary

\`\`\`bash
make release
\`\`\`

The binary will be at \`target/release/neard\`.

### 3. Initialize working directory

\`\`\`bash
./target/release/neard --home ~/.near init --chain-id testnet --download-genesis --download-config archival
\`\`\`

This creates:
- \`config.json\` with \`"archive": true\` and \`"tracked_shards": [0]\`
- \`genesis.json\`, \`node_key.json\`, \`data/\` directory

### 4. Get data backup

Download the latest archival snapshot:

\`\`\`bash
aws s3 --no-sign-request cp s3://near-protocol-public/backups/testnet/archive/latest .
LATEST=\$(cat latest)
aws s3 --no-sign-request cp --recursive s3://near-protocol-public/backups/testnet/archive/\$LATEST ~/.near/data
\`\`\`

### 5. Run the node

\`\`\`bash
./target/release/neard --home ~/.near run
\`\`\`

## Mainnet Setup

Follow the same steps but use:
- Chain ID: \`mainnet\`
- S3 path: \`s3://near-protocol-public/backups/mainnet/archive/\`
- Latest stable release from [GitHub releases](https://github.com/near/nearcore/releases)

## Configuration

The \`config.json\` should contain:

\`\`\`json
{
  "archive": true,
  "tracked_shards": [0]
}
\`\`\`

**Note**: NEAR currently has only 1 shard (indexed [0]). In the future, you may be able to track different or multiple shards.

## Full Archival History

If you want the complete archival history:
1. Delete the data directory
2. Start the node from scratch (very slow)
3. Or use one of the latest backup snapshots`,
    level: 2,
    orderIndex: 21
  },
  {
    sectionId: "archival-run-with-nearup",
    title: "Run Archival Node (with nearup)",
    content: `⚠️ **This page is DEPRECATED. Please use [Run a Split Storage Archival](https://near-nodes.io/archival/split-storage-archival).**

We encourage you to set up your node with neard instead of nearup as nearup is not used on mainnet.

Running an archival node is similar to running a validator node as both use the same \`nearcore\` release. The main difference is modifying \`config.json\` by setting \`"archive": true\`.

## Prerequisites

- [Git](https://git-scm.com/)
- [Nearup](https://github.com/near-guildnet/nearup)

## Steps to Run an Archival Node using nearup

### 1. Retrieve latest archival snapshot

\`\`\`bash
aws s3 --no-sign-request cp s3://near-protocol-public/backups/testnet/archive/latest .
LATEST=\$(cat latest)
aws s3 --no-sign-request cp --recursive s3://near-protocol-public/backups/testnet/archive/\$LATEST ~/.near/data
\`\`\`

### 2. Configuration Update

The \`config.json\` should contain:

\`\`\`json
{
  "archive": true,
  "tracked_shards": [0]
}
\`\`\`

**Important**: Stop the node before changing \`config.json\`.

Currently, NEAR testnet and mainnet have only 1 shard (indexed [0]).

### 3. Start the node

\`\`\`bash
nearup run testnet
\`\`\`

Wait for initialization, then follow logs:

\`\`\`bash
nearup logs --follow
\`\`\`

Stop if needed:

\`\`\`bash
nearup stop
\`\`\`

Finally, restart:

\`\`\`bash
nearup run testnet
\`\`\`

The node should start syncing headers at ~97%.

## Full Archival History

To get complete archival history:
1. Delete the data directory
2. Start from scratch (slow)
3. Or use a recent backup snapshot`,
    level: 2,
    orderIndex: 22
  },
  {
    sectionId: "archival-split-storage",
    title: "Split Storage Archival",
    content: `Split storage allows archival nodes to reduce costs and improve performance by separating data into hot (recent) and cold (historical) storage.

⚠️ **Important**: As NEAR continues to decentralize, Pagoda will cease operations within six months. FastNEAR will be the sole provider of snapshot downloads starting Jan 1, 2025. Visit [https://docs.fastnear.com/docs/snapshots](https://docs.fastnear.com/docs/snapshots) for details.

## Introduction

With the 1.35.0 release, split storage enables:
- **Hot database**: Recent epochs, small and fast (NVMe SSD)
- **Cold database**: Historical data, large and cheap (HDD)
- Independent hardware placement for each database
- Improved block production performance

The NEAR client only uses the hot database for block production, while cold database is accessed only when historical data is specifically requested.

## Configuration

Important fields in \`config.json\`:

\`\`\`json
{
  "archive": true,
  "save_trie_changes": true,
  "store": {
    "path": "hot-data"
  },
  "cold_store": {
    "path": "cold-data"
  },
  "split_storage": {
    "enable_split_storage_view_client": true
  }
}
\`\`\`

## Migration Options

| Option | Pros | Cons |
|--------|------|------|
| Pagoda S3 snapshots | Fastest, minimal downtime | Requires trust in Pagoda |
| Manual + S3 snapshots | Trustless cold storage | Takes days, trust in RPC snapshots |
| Manual + own node | Fully trustless | Requires extra RPC node, takes days |

## Using Pagoda S3 Snapshots (Recommended)

### Prerequisites

Install rclone (v1.66.0 or higher):

\`\`\`bash
sudo -v ; curl https://rclone.org/install.sh | sudo bash
\`\`\`

### Configure rclone

\`\`\`bash
mkdir -p ~/.config/rclone
cat > ~/.config/rclone/rclone.conf << EOF
[near_cf]
type = s3
provider = AWS
download_url = https://dcf58hz8pnro2.cloudfront.net/
acl = public-read
server_side_encryption = AES256
region = ca-central-1
EOF
\`\`\`

### Download Snapshot

\`\`\`bash
# Choose mainnet or testnet
chain=mainnet

# Get latest snapshot
rclone copy --no-check-certificate near_cf://near-protocol-public/backups/\${chain}/archive/latest_split_storage ./
latest=\$(cat latest_split_storage)

# Download hot and cold databases
NEAR_HOME=/home/ubuntu/.near
rclone copy --no-check-certificate --progress --transfers=6 --checkers=6 \\
  near_cf://near-protocol-public/backups/\${chain}/archive/\${latest} \$NEAR_HOME
\`\`\`

### Update Configuration

\`\`\`bash
cat <<< \$(jq '.save_trie_changes = true | .cold_store = .store | .cold_store.path = "cold-data" | .store.path = "hot-data" | .split_storage.enable_split_storage_view_client = true' \$NEAR_HOME/config.json) > \$NEAR_HOME/config.json
\`\`\`

### Restart Node

\`\`\`bash
sudo systemctl restart neard
\`\`\`

## Fast-Forward Out-of-Sync Node

If your node is behind after downloading snapshots:

### Option A: Download Fresh Hot Database

\`\`\`bash
# Check cold database head
curl --silent 0.0.0.0:3030/metrics | grep cold_head_height

# List available snapshots
aws s3 --no-sign-request ls s3://near-protocol-public/backups/\$chain/archive/

# Select snapshot ~48h after cold head

# Stop node and replace hot database
NEAR_HOME=/home/ubuntu/.near
HOT_DATA=\$NEAR_HOME/hot-data
rm -r \$HOT_DATA
aws s3 --no-sign-request cp --recursive s3://near-protocol-public/backups/\$chain/archive/\$timestamp/hot-data \$HOT_DATA

# Restart and verify
sudo systemctl restart neard
curl --silent 0.0.0.0:3030/metrics | grep cold_head_height
\`\`\`

### Option B: Download RPC Database as Hot

\`\`\`bash
# Download RPC snapshot
aws s3 --no-sign-request ls s3://near-protocol-public/backups/\$chain/rpc/
# Select snapshot ~48h after cold head

# Replace hot database
rm -r \$HOT_DATA
aws s3 --no-sign-request cp --recursive s3://near-protocol-public/backups/\$chain/rpc/\$timestamp/ \$HOT_DATA

# Change DB kind
NEAR_HOME=/home/ubuntu/.near
CONFIG=\$NEAR_HOME/config.json
CONFIG_BKP=\$NEAR_HOME/config.json.backup

cp \$CONFIG \$CONFIG_BKP
cat <<< \$(jq '.cold_store = null | .archive = false' \$CONFIG) > \$CONFIG
./neard --home \$NEAR_HOME database change-db-kind --new-kind Hot change-hot
cp \$CONFIG_BKP \$CONFIG

# Restart
sudo systemctl restart neard
\`\`\`

## Manual Migration

For manual migration from single to split storage, see the [detailed script](https://github.com/near/nearcore/blob/master/scripts/split_storage_migration.sh).

### Migration Steps

1. Enable \`save_trie_changes\` in config
2. Restart neard and wait 100+ blocks
3. Add \`cold_store\` configuration
4. Restart neard (triggers migration)
5. Wait several days for migration to complete
6. Do NOT restart during migration

### Monitor Migration Progress

\`\`\`bash
# Check migration progress
curl --silent 0.0.0.0:3030/metrics | grep near_cold_migration_initial_writes_time_count

# Per-column progress
curl --silent 0.0.0.0:3030/metrics | grep near_cold_migration_initial_writes
\`\`\`

Most time is spent migrating the State column. Each other column migrates in hours.

## Benefits

- **Cost Savings**: Use cheap HDD for cold storage (90TB+)
- **Performance**: Fast NVMe for hot data (3TB)
- **Reduced Storage**: Hot database is ~10x smaller
- **Better Block Production**: Only hot data accessed during normal operation

## Storage Sizing

### Hot Storage (SSD/NVMe)
- Mainnet: 3TB minimum
- Testnet: 1.5TB minimum

### Cold Storage (HDD acceptable)
- Mainnet: 90TB+ (growing)
- Testnet: 15TB+

## Best Practices

1. **Use Split Storage**: Mandatory for new archival nodes
2. **Separate Drives**: Put hot on NVMe, cold on HDD
3. **Monitor Cold Head**: Ensure it's progressing
4. **Regular Snapshots**: Use latest snapshots for faster recovery
5. **Test on Testnet**: Practice split storage setup on testnet first`,
    level: 2,
    orderIndex: 23
  },
  {
    sectionId: "best-practices",
    title: "Best Practices",
    content: `## Security Recommendations

- Keep your node software up to date with the latest stable releases
- Use firewall rules to restrict access to ports (only port 24567 needs to be open for peer connections)
- Regularly monitor your node's performance and logs
- Back up your \`node_key.json\` and \`validator_key.json\` files securely
- Use separate machines for validator nodes in production environments
- Enable SSH key-based authentication and disable password authentication
- Use encrypted backups for all critical keys
- Implement the principle of least privilege for system access

## Performance Tips

- Use NVMe SSDs for best performance, especially for validators
- Enable network optimizations (see validator setup guide)
- Monitor disk I/O and ensure you meet IOPS requirements
- Keep track of storage growth and plan for capacity upgrades
- For archival nodes, use split storage with hot (SSD) and cold (HDD) databases
- Regularly review and optimize your node's resource usage
- Consider using a failover node for high availability

## Monitoring

- Set up monitoring for block height, peer count, and sync status
- Use the debug RPC endpoints to inspect node internals (protect with firewall)
- Track validator metrics if running a validator node
- Set up alerts for critical issues:
  - Node offline (> 5 minutes)
  - Low disk space (< 20%)
  - High memory usage (> 90%)
  - Low peer count (< 5 peers)
  - Not producing expected blocks
- Use Prometheus and Grafana for comprehensive metrics visualization
- Monitor cold storage head height for archival nodes

## Operational Excellence

- **Documentation**: Keep detailed runbooks for common operations
- **Testing**: Always test upgrades and changes on testnet first
- **Automation**: Automate routine tasks and monitoring
- **Backup Strategy**: Regular backups of keys and configurations
- **Incident Response**: Have a clear plan for handling node issues
- **Communication**: For validators with delegators, maintain clear communication channels
- **Performance Baselines**: Establish and monitor performance baselines
- **Capacity Planning**: Regularly review and plan for resource growth

## Update Strategy

- Subscribe to NEAR validator announcements
- Test new nearcore releases on testnet
- Plan maintenance windows for updates
- Keep a rollback plan ready
- Monitor the node closely after updates
- Coordinate with delegators for planned maintenance

## Cost Optimization

- Use spot instances for testnet or development nodes
- Implement storage tiering (NVMe for hot data, HDD for cold)
- Right-size your instances based on actual usage
- Use reserved instances for production validators
- Monitor and optimize network egress costs
- Consider geographic placement for optimal latency and cost`,
    level: 1,
    type: "info",
    orderIndex: 24
  }
];

async function importContent() {
  try {
    console.log("Starting comprehensive content import from near-nodes.io...");
    console.log(`Total sections to import: ${content.length}`);
    
    // Clear existing documentation
    await db.documentationSection.deleteMany();
    console.log("✓ Cleared existing documentation sections");

    // Insert new content
    const sectionsToInsert = content.map(section => ({
      ...section,
      type: section.type || null
    }));

    await db.documentationSection.createMany({ data: sectionsToInsert });
    
    console.log(`\n✓ Successfully imported ${content.length} sections!`);
    console.log("\nImported sections breakdown:");
    console.log("- Overview: 1 section");
    console.log("- Validator Node: 11 sections");
    console.log("- RPC Node: 4 sections");
    console.log("- Archival Node: 4 sections");
    console.log("- Best Practices: 1 section");
    console.log("\nAll content from near-nodes.io has been imported.");
    
    process.exit(0);
  } catch (error) {
    console.error("Error importing content:", error);
    process.exit(1);
  }
}

importContent();
