import { Header } from "@/components/Header";
import { DocContent } from "@/components/DocContent";
import { TableOfContents } from "@/components/TableOfContents";
import { Badge } from "@/components/ui/badge";
import { Bot } from "lucide-react";

export default function Documentation() {
  const sections = [
    {
      id: "overview",
      title: "NEAR Nodes Documentation",
      content: "NEAR Protocol runs on a collection of publicly maintained computers (or \"nodes\"). All nodes are running the same nearcore codebase with the latest releases available on GitHub. It is important to keep in mind all nodes run the same codebase, with different configurations.",
      level: 1,
    },
    
    // Validator Node Section
    {
      id: "validator",
      title: "Validator Node",
      content: "Validator nodes participate in the consensus mechanism and produce blocks and/or chunks on the NEAR network. Running a validator node helps secure the network and earns rewards.",
      level: 2,
    },
    {
      id: "validator-requirements",
      title: "Hardware Requirements",
      content: "Before setting up a validator node, ensure your system meets these minimum specifications:\n\n• 8-Core (16-Thread) CPU\n• 16GB RAM (24GB recommended)\n• 500GB SSD (1TB recommended for future growth)\n• 100 Mbps network connection",
      level: 3,
    },
    {
      id: "validator-prerequisites",
      title: "Prerequisites",
      content: "• Basic knowledge of Linux command line\n• Ubuntu 20.04 LTS or later\n• Root or sudo access\n• Stable internet connection",
      level: 3,
    },
    {
      id: "validator-installation",
      title: "Installation",
      content: "Follow these steps to install and configure your validator node:",
      level: 3,
    },
    {
      id: "validator-step1",
      title: "Step 1: Install Dependencies",
      content: "Update your system and install required dependencies:\n\nsudo apt update && sudo apt upgrade -y\nsudo apt install -y git binutils-dev libcurl4-openssl-dev zlib1g-dev libdw-dev libiberty-dev cmake gcc g++ python3 docker.io protobuf-compiler libssl-dev pkg-config clang llvm cargo",
      level: 3,
    },
    {
      id: "validator-step2",
      title: "Step 2: Install Rust",
      content: "Install Rust using rustup:\n\ncurl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh\nsource $HOME/.cargo/env",
      level: 3,
    },
    {
      id: "validator-warning-keys",
      title: "Important: Key Security",
      content: "Always backup your validator keys in a secure location. Loss of keys means loss of access to your validator and staked funds.",
      type: "warning" as const,
    },
    {
      id: "validator-step3",
      title: "Step 3: Clone nearcore",
      content: "Clone the NEAR Protocol repository:\n\ngit clone https://github.com/near/nearcore\ncd nearcore\ngit fetch origin --tags\ngit checkout tags/1.39.0 -b mynode",
      level: 3,
    },
    {
      id: "validator-configuration",
      title: "Configuration",
      content: "Configure your validator node for the network:",
      level: 3,
    },
    {
      id: "validator-config-mainnet",
      title: "Mainnet Configuration",
      content: "To configure for mainnet:\n\n./target/release/neard --home ~/.near init --chain-id mainnet --download-genesis\n\nEdit the config.json file to set your validator settings.",
      level: 3,
    },
    {
      id: "validator-info-staking",
      title: "Staking Requirements",
      content: "To become a validator on mainnet, you need to stake a minimum amount of NEAR tokens. The exact amount varies based on current network conditions and seat prices.",
      type: "info" as const,
    },
    {
      id: "validator-running",
      title: "Running the Node",
      content: "Start your validator node:\n\n./target/release/neard --home ~/.near run",
      level: 3,
    },
    {
      id: "validator-monitoring",
      title: "Monitoring",
      content: "Monitor your validator's performance using logs and metrics. Check sync status regularly and ensure your node stays up to date with the latest blocks.",
      level: 3,
    },
    {
      id: "validator-success-next",
      title: "Next Steps",
      content: "Once your node is running and synced, you can proceed to stake your tokens and join the validator set. Monitor your node's performance regularly and stay updated with network upgrades.",
      type: "success" as const,
    },

    // RPC Node Section
    {
      id: "rpc",
      title: "RPC Node",
      content: "RPC (Remote Procedure Call) nodes are service providers that provide public RPC endpoints for developers to use. These nodes handle API requests and serve blockchain data to applications.",
      level: 2,
    },
    {
      id: "rpc-requirements",
      title: "Hardware Requirements",
      content: "RPC nodes require robust hardware to handle high request volumes:\n\n• 8-Core (16-Thread) CPU (12-Core recommended for high traffic)\n• 16GB RAM (32GB recommended)\n• 500GB SSD (1TB recommended)\n• 1 Gbps network connection\n• DDoS protection recommended",
      level: 3,
    },
    {
      id: "rpc-use-cases",
      title: "Use Cases",
      content: "RPC nodes are essential for:\n\n• Wallet applications querying account data\n• DApps interacting with smart contracts\n• Block explorers displaying network information\n• Analytics platforms gathering blockchain metrics",
      level: 3,
    },
    {
      id: "rpc-installation",
      title: "Installation",
      content: "The installation process for RPC nodes is similar to validator nodes, but with different configuration parameters.",
      level: 3,
    },
    {
      id: "rpc-info-rpc",
      title: "Public vs Private RPC",
      content: "Consider whether you want to run a public RPC node (open to all) or a private one (restricted access). Public nodes require more resources and security measures.",
      type: "info" as const,
    },
    {
      id: "rpc-configuration",
      title: "Configuration",
      content: "Configure your RPC node in the config.json file:\n\n• Set rpc_addr to bind to appropriate interface\n• Configure rate limiting for public endpoints\n• Enable archive mode if historical data is needed\n• Set up monitoring and alerting",
      level: 3,
    },
    {
      id: "rpc-endpoints",
      title: "RPC Endpoints",
      content: "Your RPC node will expose various endpoints for blockchain interaction:\n\n• /status - Node status and chain info\n• /block - Query block data\n• /chunk - Query chunk information\n• /tx - Transaction details\n• /query - Contract state queries",
      level: 3,
    },
    {
      id: "rpc-security",
      title: "Security Considerations",
      content: "For public RPC nodes:\n\n• Implement rate limiting per IP\n• Use a reverse proxy (nginx/caddy)\n• Enable DDoS protection\n• Monitor for abuse patterns\n• Keep software updated",
      level: 3,
    },
    {
      id: "rpc-warning-security",
      title: "Security Warning",
      content: "Never expose RPC endpoints directly to the internet without proper security measures. Always use a reverse proxy with rate limiting.",
      type: "warning" as const,
    },

    // Archival Node Section
    {
      id: "archival",
      title: "Archival Node",
      content: "Archival nodes store the complete blockchain history, including all historical states. These nodes are essential for block explorers, analytics platforms, and applications that need access to historical data.",
      level: 2,
    },
    {
      id: "archival-requirements",
      title: "Hardware Requirements",
      content: "Archival nodes require substantial storage due to historical data:\n\n• 8-Core (16-Thread) CPU\n• 16GB RAM (32GB recommended)\n• 5TB+ SSD storage (growing continuously)\n• 1 Gbps network connection\n• RAID configuration recommended for data redundancy",
      level: 3,
    },
    {
      id: "archival-warning-storage",
      title: "Storage Warning",
      content: "Archival nodes require significantly more storage than regular nodes. Plan for at least 5TB initially and expect storage needs to grow over time. Budget for storage expansion.",
      type: "warning" as const,
    },
    {
      id: "archival-use-cases",
      title: "Use Cases",
      content: "Archival nodes are essential for:\n\n• Block explorers displaying full transaction history\n• Analytics platforms analyzing historical trends\n• Auditing and compliance tools\n• Research and data analysis\n• Backup and recovery services",
      level: 3,
    },
    {
      id: "archival-installation",
      title: "Installation",
      content: "Installing an archival node follows the same process as other node types, with archive mode enabled in configuration.",
      level: 3,
    },
    {
      id: "archival-configuration",
      title: "Configuration",
      content: "Enable archive mode in your config.json:\n\n{\n  \"archive\": true,\n  \"tracked_shards\": [0],\n  \"store.state_snapshot_enabled\": true\n}\n\nThis configuration tells the node to keep all historical states.",
      level: 3,
    },
    {
      id: "archival-info-sync",
      title: "Initial Sync Time",
      content: "Syncing an archival node from genesis takes significantly longer than a regular node. Initial sync can take several days to weeks depending on hardware and network conditions.",
      type: "info" as const,
    },
    {
      id: "archival-sync",
      title: "Syncing the Node",
      content: "Start your archival node and allow it to sync:\n\n./target/release/neard --home ~/.near run\n\nMonitor sync progress through logs. The node will download all historical blocks and states.",
      level: 3,
    },
    {
      id: "archival-maintenance",
      title: "Maintenance",
      content: "Regular maintenance tasks:\n\n• Monitor disk space usage\n• Plan storage expansion before capacity is reached\n• Keep database optimized\n• Regular backups of critical data\n• Update to latest nearcore versions",
      level: 3,
    },
    {
      id: "archival-performance",
      title: "Performance Optimization",
      content: "Optimize your archival node performance:\n\n• Use high-performance SSDs (NVMe preferred)\n• Ensure adequate RAM for caching\n• Optimize database settings\n• Consider read replicas for high query loads",
      level: 3,
    },
    {
      id: "archival-success-tips",
      title: "Pro Tips",
      content: "• Start with a database snapshot to reduce initial sync time\n• Use monitoring tools to track disk usage trends\n• Implement automated alerts for low disk space\n• Consider tiered storage for older data",
      type: "success" as const,
    },
  ];

  const tocItems = sections
    .filter((s) => s.level && s.level <= 3 && !s.type)
    .map((s) => ({
      id: s.id,
      title: s.title,
      level: s.level!,
    }));

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <div className="container flex-1 py-8">
        <div className="flex items-center gap-2 mb-6">
          <Badge variant="outline" className="gap-1" data-testid="badge-ai-updated">
            <Bot className="h-3 w-3" />
            AI-Updated
          </Badge>
          <span className="text-sm text-muted-foreground">Last updated 2 hours ago</span>
        </div>

        <div className="flex gap-8">
          <main className="flex-1 max-w-3xl">
            <DocContent sections={sections} />
          </main>

          <aside className="hidden xl:block w-64 shrink-0">
            <div className="sticky top-24">
              <TableOfContents items={tocItems} activeId="overview" />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
