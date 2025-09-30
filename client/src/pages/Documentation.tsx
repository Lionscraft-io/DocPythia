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
            <div className="flex items-center gap-2 mb-6">
              <Badge variant="outline" className="gap-1" data-testid="badge-ai-updated">
                <Bot className="h-3 w-3" />
                AI-Updated
              </Badge>
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

