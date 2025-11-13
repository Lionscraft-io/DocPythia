import { Header } from "@/components/Header";
import { DocContent } from "@/components/DocContent";
import { TableOfContents } from "@/components/TableOfContents";
import { Badge } from "@/components/ui/badge";
import { Bot } from "lucide-react";

export default function RPCNode() {
  const sections = [
    {
      id: "introduction",
      title: "RPC Node",
      content: "RPC (Remote Procedure Call) nodes are service providers that provide public RPC endpoints for developers to use. These nodes handle API requests and serve blockchain data to applications.",
      level: 1,
    },
    {
      id: "requirements",
      title: "Hardware Requirements",
      content: "RPC nodes require robust hardware to handle high request volumes:\n\n• 8-Core (16-Thread) CPU (12-Core recommended for high traffic)\n• 16GB RAM (32GB recommended)\n• 500GB SSD (1TB recommended)\n• 1 Gbps network connection\n• DDoS protection recommended",
      level: 2,
    },
    {
      id: "use-cases",
      title: "Use Cases",
      content: "RPC nodes are essential for:\n\n• Wallet applications querying account data\n• DApps interacting with smart contracts\n• Block explorers displaying network information\n• Analytics platforms gathering blockchain metrics",
      level: 2,
    },
    {
      id: "installation",
      title: "Installation",
      content: "The installation process for RPC nodes is similar to validator nodes, but with different configuration parameters.",
      level: 2,
    },
    {
      id: "info-rpc",
      title: "Public vs Private RPC",
      content: "Consider whether you want to run a public RPC node (open to all) or a private one (restricted access). Public nodes require more resources and security measures.",
      type: "info" as const,
    },
    {
      id: "configuration",
      title: "Configuration",
      content: "Configure your RPC node in the config.json file:\n\n• Set rpc_addr to bind to appropriate interface\n• Configure rate limiting for public endpoints\n• Enable archive mode if historical data is needed\n• Set up monitoring and alerting",
      level: 2,
    },
    {
      id: "endpoints",
      title: "RPC Endpoints",
      content: "Your RPC node will expose various endpoints for blockchain interaction:\n\n• /status - Node status and chain info\n• /block - Query block data\n• /chunk - Query chunk information\n• /tx - Transaction details\n• /query - Contract state queries",
      level: 2,
    },
    {
      id: "security",
      title: "Security Considerations",
      content: "For public RPC nodes:\n\n• Implement rate limiting per IP\n• Use a reverse proxy (nginx/caddy)\n• Enable DDoS protection\n• Monitor for abuse patterns\n• Keep software updated",
      level: 2,
    },
    {
      id: "warning-security",
      title: "Security Warning",
      content: "Never expose RPC endpoints directly to the internet without proper security measures. Always use a reverse proxy with rate limiting.",
      type: "warning" as const,
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
          <span className="text-sm text-muted-foreground">Last updated 5 hours ago</span>
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
