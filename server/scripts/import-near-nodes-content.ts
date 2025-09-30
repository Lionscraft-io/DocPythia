import { db } from "../db";
import { documentationSections } from "../../shared/schema";
import { sql } from "drizzle-orm";

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
    orderIndex: 3
  },
  {
    sectionId: "validator-compile-run",
    title: "Compile and Run a Node",
    content: `The following instructions are applicable across localnet, testnet, and mainnet. If you are looking to learn how to compile and run a NEAR validator node natively (without containerization), this guide is for you.

## Prerequisites

- [Rust](https://www.rust-lang.org/)
- [Git](https://git-scm.com/)
- Installed developer tools:
  - **MacOS**: \`brew install cmake protobuf llvm awscli\`
  - **Linux**: \`apt install -y git binutils-dev libcurl4-openssl-dev zlib1g-dev libdw-dev libiberty-dev cmake gcc g++ python docker.io protobuf-compiler libssl-dev pkg-config clang llvm cargo awscli\`

### Network optimizations

To optimize the network settings for better performance, execute the following commands:

\`\`\`bash
MaxExpectedPathBDP=8388608
sudo sysctl -w net.core.rmem_max=$MaxExpectedPathBDP
sudo sysctl -w net.core.wmem_max=$MaxExpectedPathBDP
sudo sysctl -w net.ipv4.tcp_rmem="4096 87380 $MaxExpectedPathBDP"
sudo sysctl -w net.ipv4.tcp_wmem="4096 16384 $MaxExpectedPathBDP"
sudo sysctl -w net.ipv4.tcp_slow_start_after_idle=0
\`\`\`

## Choosing your nearcore version

When building your NEAR node you will have two branch options:

- \`master\`: **(Experimental)** - Use for playing around with latest code
- [Latest stable release](https://github.com/near/nearcore/tags): **(Stable)** - Use for mainnet
- [Latest release candidates](https://github.com/near/nearcore/tags): **(RC)** - Use for testnet

## Steps for testnet

### 1. Clone nearcore project

\`\`\`bash
git clone https://github.com/near/nearcore
cd nearcore
git fetch origin --tags
git checkout tags/1.35.0 -b mynode
\`\`\`

### 2. Compile nearcore binary

\`\`\`bash
make neard
\`\`\`

This will take approximately 25 minutes on an i9 8-core CPU. The binary path is \`target/release/neard\`.

### 3. Initialize working directory

\`\`\`bash
./target/release/neard --home ~/.near init --chain-id testnet --download-genesis --download-config validator
\`\`\`

This creates:
- \`config.json\` - Configuration parameters
- \`genesis.json\` - Network genesis data  
- \`node_key.json\` - Node public and private keys
- \`data/\` - Where the node writes its state

### 4. Sync to the chain tip

Use [Epoch Sync](https://near-nodes.io/intro/node-epoch-sync) for faster synchronization.

### 5. Run the node

\`\`\`bash
./target/release/neard --home ~/.near run
\`\`\``,
    level: 2,
    orderIndex: 4
  },
  {
    sectionId: "validator-nearup",
    title: "Run a Node with nearup",
    content: `This doc is written for developers who want to run a NEAR node using \`nearup\` on Linux and MacOS, with or without Docker.

## nearup Installation

Install \`nearup\` by following the instructions at [https://github.com/near-guildnet/nearup](https://github.com/near-guildnet/nearup).

**Note**: \`nearup\` is exclusively used to launch NEAR \`testnet\` and \`localnet\` nodes. For \`mainnet\` nodes, compile and run directly with \`neard\`.

## Running with Docker

### Install Docker

- [MacOS](https://docs.docker.com/docker-for-mac/install/)
- [Ubuntu](https://docs.docker.com/install/linux/docker-ce/ubuntu/)

### Run nearup with Docker

\`\`\`bash
docker run -v $HOME/.near:/root/.near -p 3030:3030 --name nearup nearup/nearprotocol run testnet
\`\`\`

#### Running in detached mode

\`\`\`bash
docker run -v $HOME/.near:/root/.near -p 3030:3030 -d --name nearup nearup/nearprotocol run testnet
\`\`\`

#### Execute nearup commands

\`\`\`bash
docker exec nearup nearup logs
docker exec nearup nearup stop
docker exec nearup nearup run testnet
\`\`\`

## Running without Docker

Alternatively, compile \`neard\` locally and point \`nearup\` to the compiled binaries.

### Prerequisites

Install Rust and dependencies:

**Mac OS**:
\`\`\`bash
brew install cmake protobuf clang llvm
\`\`\`

**Linux**:
\`\`\`bash
sudo apt update
sudo apt install -y git binutils-dev libcurl4-openssl-dev zlib1g-dev libdw-dev libiberty-dev cmake gcc g++ python docker.io protobuf-compiler libssl-dev pkg-config clang llvm
\`\`\`

### Clone and compile

\`\`\`bash
git clone https://github.com/near/nearcore.git
cd nearcore
git checkout <version>
make neard
\`\`\`

### Run with nearup

\`\`\`bash
nearup run testnet --binary-path path/to/nearcore/target/release
\`\`\`

## Starting from backup

Download the latest snapshots from [Node Data Snapshots](https://near-nodes.io/intro/node-data-snapshots).

\`\`\`bash
nearup run testnet && sleep 30 && nearup stop
dir=$HOME/.near/testnet/data
rm -r -- "$dir"
mkdir -- "$dir"
wget -c <snapshot-link> -O - | tar -xC "$dir"
nearup run testnet
\`\`\``,
    level: 2,
    orderIndex: 5
  },
  {
    sectionId: "rpc-node",
    title: "RPC Node",
    content: "RPC nodes are service providers that provide public RPC endpoints for developers to use. They store recent blockchain data and can serve RPC queries.",
    level: 1,
    orderIndex: 6
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
    orderIndex: 7
  },
  {
    sectionId: "rpc-run-node",
    title: "Run an RPC Node",
    content: `The following instructions are applicable for testnet and mainnet. Running a RPC node is similar to running a validator node, with the main difference being that RPC nodes don't require \`validator_key.json\`.

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
"tracked_shards": []
\`\`\``,
    level: 2,
    orderIndex: 8
  },
  {
    sectionId: "archival-node",
    title: "Archival Node",
    content: "Archival nodes store full blockchain data and build an archive of historical states. They require significantly more storage than regular RPC or validator nodes.",
    level: 1,
    orderIndex: 9
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
    orderIndex: 10
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

## Performance Tips

- Use NVMe SSDs for best performance
- Enable network optimizations (see validator setup guide)
- Monitor disk I/O and ensure you meet IOPS requirements
- Keep track of storage growth and plan for capacity upgrades

## Monitoring

- Set up monitoring for block height, peer count, and sync status
- Use the debug RPC endpoints to inspect node internals
- Track validator metrics if running a validator node
- Set up alerts for critical issues (node offline, low disk space, etc.)`,
    level: 1,
    type: "info",
    orderIndex: 11
  }
];

async function importContent() {
  try {
    console.log("Starting content import...");
    
    // Clear existing documentation
    await db.delete(documentationSections);
    console.log("Cleared existing documentation sections");
    
    // Insert new content - map null to undefined for proper typing
    const sectionsToInsert = content.map(section => ({
      ...section,
      type: section.type || undefined
    }));
    
    await db.insert(documentationSections).values(sectionsToInsert);
    
    console.log(`\nSuccessfully imported ${content.length} sections!`);
    process.exit(0);
  } catch (error) {
    console.error("Error importing content:", error);
    process.exit(1);
  }
}

importContent();
