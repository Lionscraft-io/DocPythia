import { Header } from "@/components/Header";
import { DocContent } from "@/components/DocContent";
import { TableOfContents } from "@/components/TableOfContents";
import { Badge } from "@/components/ui/badge";
import { Bot } from "lucide-react";

export default function ArchivalNode() {
  const sections = [
    {
      id: "introduction",
      title: "Archival Node",
      content: "Archival nodes store the complete blockchain history, including all historical states. These nodes are essential for block explorers, analytics platforms, and applications that need access to historical data.",
      level: 1,
    },
    {
      id: "requirements",
      title: "Hardware Requirements",
      content: "Archival nodes require substantial storage due to historical data:\n\n• 8-Core (16-Thread) CPU\n• 16GB RAM (32GB recommended)\n• 5TB+ SSD storage (growing continuously)\n• 1 Gbps network connection\n• RAID configuration recommended for data redundancy",
      level: 2,
    },
    {
      id: "warning-storage",
      title: "Storage Warning",
      content: "Archival nodes require significantly more storage than regular nodes. Plan for at least 5TB initially and expect storage needs to grow over time. Budget for storage expansion.",
      type: "warning" as const,
    },
    {
      id: "use-cases",
      title: "Use Cases",
      content: "Archival nodes are essential for:\n\n• Block explorers displaying full transaction history\n• Analytics platforms analyzing historical trends\n• Auditing and compliance tools\n• Research and data analysis\n• Backup and recovery services",
      level: 2,
    },
    {
      id: "installation",
      title: "Installation",
      content: "Installing an archival node follows the same process as other node types, with archive mode enabled in configuration.",
      level: 2,
    },
    {
      id: "configuration",
      title: "Configuration",
      content: "Enable archive mode in your config.json:\n\n{\n  \"archive\": true,\n  \"tracked_shards\": [0],\n  \"store.state_snapshot_enabled\": true\n}\n\nThis configuration tells the node to keep all historical states.",
      level: 2,
    },
    {
      id: "info-sync",
      title: "Initial Sync Time",
      content: "Syncing an archival node from genesis takes significantly longer than a regular node. Initial sync can take several days to weeks depending on hardware and network conditions.",
      type: "info" as const,
    },
    {
      id: "sync",
      title: "Syncing the Node",
      content: "Start your archival node and allow it to sync:\n\n./target/release/neard --home ~/.near run\n\nMonitor sync progress through logs. The node will download all historical blocks and states.",
      level: 2,
    },
    {
      id: "maintenance",
      title: "Maintenance",
      content: "Regular maintenance tasks:\n\n• Monitor disk space usage\n• Plan storage expansion before capacity is reached\n• Keep database optimized\n• Regular backups of critical data\n• Update to latest nearcore versions",
      level: 2,
    },
    {
      id: "performance",
      title: "Performance Optimization",
      content: "Optimize your archival node performance:\n\n• Use high-performance SSDs (NVMe preferred)\n• Ensure adequate RAM for caching\n• Optimize database settings\n• Consider read replicas for high query loads",
      level: 2,
    },
    {
      id: "success-tips",
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
          <span className="text-sm text-muted-foreground">Last updated 1 day ago</span>
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
