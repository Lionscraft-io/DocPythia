import { Header } from "@/components/Header";
import { DocContent } from "@/components/DocContent";
import { TableOfContents } from "@/components/TableOfContents";
import { Badge } from "@/components/ui/badge";
import { Bot } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { DocumentationSection } from "@shared/schema";

export default function Documentation() {
  const { data: sections = [], isLoading } = useQuery<DocumentationSection[]>({
    queryKey: ["/api/docs"],
  });

  const formattedSections = sections.map((section) => ({
    id: section.sectionId,
    title: section.title,
    content: section.content,
    level: section.level ?? undefined,
    type: section.type ?? undefined,
  }));

  const tocItems = formattedSections
    .filter((s) => s.level && s.level <= 3 && !s.type)
    .map((s) => ({
      id: s.id,
      title: s.title,
      level: s.level!,
    }));

  // Calculate time since last update
  const lastUpdated = sections.length > 0 
    ? sections.reduce((latest, section) => {
        const sectionDate = new Date(section.updatedAt);
        return sectionDate > latest ? sectionDate : latest;
      }, new Date(0))
    : null;

  const formatTimeSince = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
    if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  };

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Loading documentation...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <Header />
      
      <div className="flex-1 flex overflow-hidden">
        {/* Left Navigation Sidebar */}
        <aside className="w-64 border-r bg-background overflow-y-auto" data-testid="sidebar-navigation">
          <div className="p-6">
            <div className="mb-6 space-y-2">
              <Badge variant="outline" className="gap-1" data-testid="badge-ai-updated">
                <Bot className="h-3 w-3" />
                AI-Updated
              </Badge>
              {lastUpdated && (
                <p className="text-xs text-muted-foreground" data-testid="text-last-updated">
                  Last AI-Agent update {formatTimeSince(lastUpdated)}
                </p>
              )}
            </div>
            <TableOfContents items={tocItems} activeId="overview" />
          </div>
        </aside>

        {/* Right Content Area */}
        <main className="flex-1 overflow-y-auto" data-testid="main-content">
          <div className="container max-w-4xl px-8 py-8">
            <DocContent sections={formattedSections} />
          </div>
        </main>
      </div>
    </div>
  );
}

