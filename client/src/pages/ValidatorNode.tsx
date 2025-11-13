import { Header } from "@/components/Header";
import { DocContent } from "@/components/DocContent";
import { TableOfContents } from "@/components/TableOfContents";
import { Badge } from "@/components/ui/badge";
import { Bot } from "lucide-react";

export default function ValidatorNode() {
  const sections = [
    {
      id: "introduction",
      title: "Validator Node",
      content: "Validator nodes participate in the consensus mechanism and produce blocks and/or chunks on the NEAR network. Running a validator node helps secure the network and earns rewards.",
      level: 1,
    },
    {
      id: "requirements",
      title: "Hardware Requirements",
      content: "Before setting up a validator node, ensure your system meets these minimum specifications:\n\n• 8-Core (16-Thread) CPU\n• 16GB RAM (24GB recommended)\n• 500GB SSD (1TB recommended for future growth)\n• 100 Mbps network connection",
      level: 2,
    },
    {
      id: "prerequisites",
      title: "Prerequisites",
      content: "• Basic knowledge of Linux command line\n• Ubuntu 20.04 LTS or later\n• Root or sudo access\n• Stable internet connection",
      level: 2,
    },
    {
      id: "installation",
      title: "Installation",
      content: "Follow these steps to install and configure your validator node:",
      level: 2,
    },
    {
      id: "step1",
      title: "Step 1: Install Dependencies",
      content: "Update your system and install required dependencies:\n\nsudo apt update && sudo apt upgrade -y\nsudo apt install -y git binutils-dev libcurl4-openssl-dev zlib1g-dev libdw-dev libiberty-dev cmake gcc g++ python3 docker.io protobuf-compiler libssl-dev pkg-config clang llvm cargo",
      level: 3,
    },
    {
      id: "step2",
      title: "Step 2: Install Rust",
      content: "Install Rust using rustup:\n\ncurl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh\nsource $HOME/.cargo/env",
      level: 3,
    },
    {
      id: "warning-keys",
      title: "Important: Key Security",
      content: "Always backup your validator keys in a secure location. Loss of keys means loss of access to your validator and staked funds.",
      type: "warning" as const,
    },
    {
      id: "step3",
      title: "Step 3: Clone nearcore",
      content: "Clone the NEAR Protocol repository:\n\ngit clone https://github.com/near/nearcore\ncd nearcore\ngit fetch origin --tags\ngit checkout tags/1.39.0 -b mynode",
      level: 3,
    },
    {
      id: "configuration",
      title: "Configuration",
      content: "Configure your validator node for the network:",
      level: 2,
    },
    {
      id: "config-mainnet",
      title: "Mainnet Configuration",
      content: "To configure for mainnet:\n\n./target/release/neard --home ~/.near init --chain-id mainnet --download-genesis\n\nEdit the config.json file to set your validator settings.",
      level: 3,
    },
    {
      id: "info-staking",
      title: "Staking Requirements",
      content: "To become a validator on mainnet, you need to stake a minimum amount of NEAR tokens. The exact amount varies based on current network conditions and seat prices.",
      type: "info" as const,
    },
    {
      id: "running",
      title: "Running the Node",
      content: "Start your validator node:\n\n./target/release/neard --home ~/.near run",
      level: 2,
    },
    {
      id: "monitoring",
      title: "Monitoring",
      content: "Monitor your validator's performance using logs and metrics. Check sync status regularly and ensure your node stays up to date with the latest blocks.",
      level: 2,
    },
    {
      id: "success-next",
      title: "Next Steps",
      content: "Once your node is running and synced, you can proceed to stake your tokens and join the validator set. Monitor your node's performance regularly and stay updated with network upgrades.",
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
              <TableOfContents items={tocItems} activeId="introduction" />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
