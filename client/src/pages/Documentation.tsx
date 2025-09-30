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
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="container px-6 md:px-8 flex-1 py-8">
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Loading documentation...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <div className="container px-6 md:px-8 flex-1 py-8">
        <div className="flex items-center gap-2 mb-6">
          <Badge variant="outline" className="gap-1" data-testid="badge-ai-updated">
            <Bot className="h-3 w-3" />
            AI-Updated
          </Badge>
          <span className="text-sm text-muted-foreground">Last updated 2 hours ago</span>
        </div>

        <div className="flex gap-8">
          <main className="flex-1 max-w-3xl">
            <DocContent sections={formattedSections} />
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

