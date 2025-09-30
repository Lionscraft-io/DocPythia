import { Header } from "@/components/Header";
import { DocContent } from "@/components/DocContent";
import { TableOfContents } from "@/components/TableOfContents";
import { Badge } from "@/components/ui/badge";
import { Bot } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import type { DocumentationSection } from "@shared/schema";

export default function Documentation() {
  const [activeId, setActiveId] = useState<string>("");
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

  useEffect(() => {
    const mainContent = document.querySelector('[data-testid="main-content"]');
    if (!mainContent) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const intersecting = entries.filter(entry => entry.isIntersecting);
        if (intersecting.length > 0) {
          const topmost = intersecting.reduce((closest, entry) => {
            const currentTop = entry.boundingClientRect.top;
            const closestTop = closest.boundingClientRect.top;
            return currentTop < closestTop ? entry : closest;
          });
          setActiveId(topmost.target.id);
        }
      },
      {
        root: mainContent,
        rootMargin: "0px 0px -80% 0px",
        threshold: 0.01,
      }
    );

    const headings = mainContent.querySelectorAll('[id]');
    headings.forEach((heading) => observer.observe(heading));

    return () => {
      headings.forEach((heading) => observer.unobserve(heading));
    };
  }, [sections]);

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
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="gap-1" data-testid="badge-ai-updated">
                  <Bot className="h-3 w-3" />
                  KNOW Agent
                </Badge>
              </div>
              {lastUpdated && (
                <p className="text-xs text-muted-foreground ml-1" data-testid="text-last-updated">
                  Last update {formatTimeSince(lastUpdated)}
                </p>
              )}
            </div>
            <TableOfContents items={tocItems} activeId={activeId} />
          </div>
        </aside>

        {/* Right Content Area */}
        <main className="flex-1 overflow-y-auto" data-testid="main-content">
          <div className="max-w-5xl mx-auto px-8 py-8">
            <DocContent sections={formattedSections} />
          </div>
        </main>
      </div>
    </div>
  );
}

